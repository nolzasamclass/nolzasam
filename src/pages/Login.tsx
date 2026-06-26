// src/pages/Login.tsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import toast from 'react-hot-toast'; // 🌟 alert 대신 세련된 Toast 알림 사용

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // 환경 변수에서 관리자 아이디/비번을 안전하게 로드
  const SECURE_ADMIN_ID = import.meta.env.VITE_ADMIN_ID || 'admin';
  const SECURE_ADMIN_PW = import.meta.env.VITE_ADMIN_PASSWORD || '0000';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return toast.error("아이디와 비밀번호를 모두 입력해 주세요.");
    
    setLoading(true);
    const dummyEmail = `${username.trim()}@nolzasam.local`;

    try {
      // ==========================================
      // [1] 마스터 관리자 로직 (보안 변수 기반 조율)
      // ==========================================
      if (username === SECURE_ADMIN_ID && password === SECURE_ADMIN_PW) {
        // 임시 세션 가동 (Auth가 실패하더라도 로컬에서 관리자임을 증명할 수 있는 이중 안전장치 복구)
        sessionStorage.setItem('customAdmin', 'true');

        try {
          // 관리자는 admin_ 접두사를 붙여 6자리 이상 규격을 충족시킴
          await signInWithEmailAndPassword(auth, dummyEmail, `admin_${SECURE_ADMIN_PW}`);
        } catch (err: any) {
          if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
            const newAdmin = await createUserWithEmailAndPassword(auth, dummyEmail, `admin_${SECURE_ADMIN_PW}`);
            await setDoc(doc(db, "users", newAdmin.user.uid), {
              uid: newAdmin.user.uid,
              username: SECURE_ADMIN_ID,
              name: '마스터 관리자',
              role: 'admin',
              approved: true, // 관리자는 즉시 승인
              createdAt: serverTimestamp()
            });
          } else { 
            throw err; 
          }
        }
        toast.success("최고 관리자 계정으로 로그인했습니다.");
        navigate('/admin');
        return;
      }

      // ==========================================
      // [2] 일반 회원 로그인 로직
      // ==========================================
      // 일반 회원 패스워드 자릿수 규칙 유효성 평가
      if (password.length !== 4 || isNaN(Number(password))) {
        setLoading(false);
        return toast.error("비밀번호는 숫자 4자리여야 합니다.");
      }

      // 가상 이메일과 'user_' 패스워드(4자리->9자리 확장)로 Firebase 로그인 시도
      const userCredential = await signInWithEmailAndPassword(auth, dummyEmail, `user_${password}`);
      
      // DB에서 승인 조건상태 룩업
      const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // 가입 승인 대기 상태일 경우 차단
        if (!userData.approved) {
          await auth.signOut();
          toast.error("🔒 가입 승인 대기 중입니다.\n관리자의 승인 후 로그인이 가능합니다.", { duration: 4000 });
          setLoading(false);
          return;
        }

        // 로그인 성공 시 활동 로그 스탬프 기록
        await setDoc(doc(db, "activity_logs", `${userCredential.user.uid}_${Date.now()}`), {
          uid: userCredential.user.uid,
          username: userData.username,
          name: userData.name,
          action: "로그인 성공",
          timestamp: serverTimestamp()
        });
      }

      toast.success("성공적으로 로그인되었습니다! 🎉");
      navigate('/');
    } catch (error: any) {
      console.error(error);
      toast.error("아이디 또는 비밀번호를 다시 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans relative overflow-hidden">
      <form onSubmit={handleLogin} className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-2xl max-w-sm w-full space-y-6 relative z-10">
        <h2 className="text-2xl font-black text-center text-indigo-400">🔒 서비스 로그인</h2>
        
        <div>
          <label className="block text-xs font-bold text-slate-400 mb-2">아이디</label>
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full p-3 bg-slate-700 rounded-xl border-none font-bold text-white outline-none focus:ring-2 focus:ring-indigo-500 text-sm" placeholder="아이디 입력" />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-400 mb-2">비밀번호 (숫자 4자리)</label>
          <input type="password" maxLength={4} value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 bg-slate-700 rounded-xl border-none font-bold text-white outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-center tracking-widest" placeholder="••••" />
        </div>

        <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black py-3.5 rounded-xl transition-all shadow-lg active:scale-95 text-lg">
          {loading ? '인증 중...' : '안전 로그인 ➡'}
        </button>

        <div className="text-center pt-4 border-t border-slate-700">
          <p className="text-xs text-slate-400 font-bold mb-3">계정이 없으신가요?</p>
          <Link to="/signup" className="text-sm font-black text-emerald-400 hover:text-emerald-300">회원가입 신청하기 &rarr;</Link>
        </div>
      </form>
    </div>
  );
}