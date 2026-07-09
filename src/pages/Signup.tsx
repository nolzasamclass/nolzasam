// src/pages/Signup.tsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

type Role = '학급 학생' | '일반 학생' | '학부모';

const SEOUL_SCHOOLS = [
  "서울가인초등학교", "서울계상초등학교", "서울공릉초등학교", "서울공연초등학교", "서울광운초등학교",
  "서울노원초등학교", "서울노일초등학교", "서울누원초등학교", "서울당현초등학교", "서울도봉초등학교",
  "서울동북초등학교", "서울동일초등학교", "서울방학초등학교", "서울백운초등학교", "서울불암초등학교",
  "서울상계초등학교", "서울상곡초등학교", "서울상수초등학교", "서울상원초등학교", "서울상천초등학교",
  "서울선곡초등학교", "서울선덕초등학교", "서울수락초등학교", "서울수암초등학교", "서울신계초등학교",
  "서울신방학초등학교", "서울신상계초등학교", "서울신창초등학교", "서울신학초등학교", "서울신화초등학교",
  "서울쌍문초등학교", "서울연지초등학교", "서울연촌초등학교", "서울오봉초등학교", "서울온곡초등학교",
  "서울용동초등학교", "서울용원초등학교", "서울원광초등학교", "서울월계초등학교", "서울월천초등학교",
  "서울을지초등학교", "서울자운초등학교", "서울중계초등학교", "서울중원초등학교", "서울중평초등학교",
  "서울창경초등학교", "서울창동초등학교", "서울창림초등학교", "서울창원초등학교", "서울창일초등학교",
  "서울청계초등학교", "서울청원초등학교", "서울초당초등학교", "서울태강삼육초등학교", "서울태랑초등학교",
  "서울태릉초등학교", "서울하계초등학교", "서울한신초등학교", "서울한천초등학교", "서울화랑초등학교"
];

export default function Signup() {
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>('학급 학생');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  
  const [school, setSchool] = useState('');
  const [isSearchingSchool, setIsSearchingSchool] = useState(false);
  const [schoolSearchTerm, setSchoolSearchTerm] = useState('');
  
  const [grade, setGrade] = useState('');
  const [classNum, setClassNum] = useState('');
  const [childName, setChildName] = useState('');
  
  // 🌟 새롭게 추가된 상태 변수들
  const [birthDate, setBirthDate] = useState('');
  const [studentPhone, setStudentPhone] = useState(''); // 선택
  const [parentNameForm, setParentNameForm] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [privacyConsent, setPrivacyConsent] = useState(false);

  const [loading, setLoading] = useState(false);

  const filteredSchools = SEOUL_SCHOOLS.filter(s => s.includes(schoolSearchTerm));

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 기본 필수 항목 검사
    if (!username.trim() || !password.trim() || !name.trim() || !school.trim()) {
      return alert("필수 입력란을 모두 채워주세요.");
    }
    if (password.length !== 4 || isNaN(Number(password))) {
      return alert("비밀번호는 반드시 숫자 4자리여야 합니다.");
    }
    if (!privacyConsent) {
      return alert("개인정보 수집 및 이용에 동의해야 가입할 수 있습니다.");
    }

    // 학생 필수 항목 검사
    if (role.includes('학생')) {
      if (!grade || !classNum) return alert("학년과 반을 선택해 주세요.");
      if (!birthDate.trim()) return alert("학생의 생년월일을 입력해 주세요.");
      if (!parentNameForm.trim()) return alert("학부모 성명을 입력해 주세요.");
      if (!parentPhone.trim()) return alert("학부모 전화번호를 입력해 주세요.");
    }

    // 학부모 필수 항목 검사
    if (role === '학부모' && !childName.trim()) {
      return alert("자녀 이름을 입력해 주세요.");
    }

    setLoading(true);
    const dummyEmail = `${username.trim()}@nolzasam.local`;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, dummyEmail, `user_${password}`);
      
      const userProfile = {
        uid: userCredential.user.uid,
        username: username.trim(),
        name: name.trim(),
        role,
        school: school.trim(),
        grade: role.includes('학생') ? Number(grade) : null,
        classNum: role.includes('학생') ? Number(classNum) : null,
        childName: role === '학부모' ? childName.trim() : null,
        // 🌟 DB에 새로 저장되는 정보
        birthDate: role.includes('학생') ? birthDate.trim() : null,
        studentPhone: role.includes('학생') ? studentPhone.trim() : null,
        parentName: role.includes('학생') ? parentNameForm.trim() : null,
        parentPhone: role.includes('학생') ? parentPhone.trim() : null,
        
        plainPassword: password, 
        approved: false, 
        createdAt: serverTimestamp()
      };

      await setDoc(doc(db, "users", userCredential.user.uid), userProfile);

      await setDoc(doc(db, "activity_logs", `${userCredential.user.uid}_join`), {
        uid: userCredential.user.uid,
        username: username.trim(),
        name: name.trim(),
        action: `회원가입 신청 (${role})`,
        timestamp: serverTimestamp()
      });

      alert("회원가입 신청이 완료되었습니다! 선생님의 승인 후 이용 가능합니다.");
      await auth.signOut(); 
      navigate('/login');
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/email-already-in-use') {
        alert("이미 사용 중인 아이디입니다.");
      } else {
        alert("회원가입 중 오류가 발생했습니다: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 py-12">
      <form onSubmit={handleSignup} className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-2xl max-w-lg w-full space-y-6">
        <h2 className="text-2xl font-black text-center text-indigo-400">📝 통합 가입 신청서</h2>
        
        <div className="flex bg-slate-700 p-1 rounded-xl">
          {(['학급 학생', '일반 학생', '학부모'] as Role[]).map(r => (
            <button key={r} type="button" onClick={() => setRole(r)} className={`flex-1 py-2 rounded-lg text-sm font-black transition-all ${role === r ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
              {r}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">아이디</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full p-2.5 bg-slate-700 rounded-xl border-none font-bold text-white text-sm outline-none" placeholder="사용할 아이디" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">비밀번호 (숫자 4자리)</label>
            <input type="password" maxLength={4} value={password} onChange={e => setPassword(e.target.value)} className="w-full p-2.5 bg-slate-700 rounded-xl border-none font-bold text-white text-sm text-center tracking-widest outline-none" placeholder="••••" />
          </div>
        </div>

        <div className="space-y-4 border-t border-slate-700 pt-4">
          
          <div className="relative">
            <label className="block text-xs font-bold text-slate-400 mb-1">학교명</label>
            <input 
              type="text" 
              readOnly
              value={school} 
              onClick={() => setIsSearchingSchool(true)} 
              className="w-full p-2.5 bg-slate-700 rounded-xl border-none font-bold text-white text-sm outline-none cursor-pointer placeholder-slate-400 hover:bg-slate-600 transition-colors" 
              placeholder="학교 검색하기 (여기를 클릭하세요)" 
            />
            
            {isSearchingSchool && (
              <div className="absolute top-full left-0 w-full mt-2 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="p-3 border-b border-slate-600 flex gap-2 bg-slate-700/50">
                  <input 
                    type="text" 
                    autoFocus
                    value={schoolSearchTerm} 
                    onChange={e => setSchoolSearchTerm(e.target.value)} 
                    placeholder="초등학교 이름 키워드 입력..." 
                    className="w-full p-2 bg-slate-900 rounded-lg border border-slate-600 text-white text-sm outline-none focus:border-indigo-500"
                  />
                  <button type="button" onClick={() => setIsSearchingSchool(false)} className="px-3 bg-slate-600 rounded-lg text-xs font-bold text-white hover:bg-slate-500">닫기</button>
                </div>
                <ul className="max-h-48 overflow-y-auto custom-scrollbar">
                  {filteredSchools.length > 0 ? (
                    filteredSchools.map(s => (
                      <li 
                        key={s} 
                        onClick={() => { setSchool(s); setIsSearchingSchool(false); setSchoolSearchTerm(''); }} 
                        className="p-3 text-sm font-bold text-slate-300 hover:bg-indigo-600 hover:text-white cursor-pointer border-b border-slate-700/50 last:border-0 transition-colors"
                      >
                        {s}
                      </li>
                    ))
                  ) : (
                    <li className="p-4 text-sm text-slate-500 text-center font-bold">검색 결과가 없습니다.</li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* 🌟 학급/일반 학생 공통 정보 1: 학년, 반 */}
          {role.includes('학생') && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">학년</label>
                <select value={grade} onChange={e => setGrade(e.target.value)} className="w-full p-2.5 bg-slate-700 rounded-xl border-none font-bold text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="" disabled>학년 선택</option>
                  {[1, 2, 3, 4, 5, 6].map(g => <option key={g} value={g}>{g}학년</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">반</label>
                <select value={classNum} onChange={e => setClassNum(e.target.value)} className="w-full p-2.5 bg-slate-700 rounded-xl border-none font-bold text-white text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="" disabled>반 선택</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(c => <option key={c} value={c}>{c}반</option>)}
                </select>
              </div>
            </div>
          )}

          {/* 🌟 학급/일반 학생 공통 정보 2: 생년월일, 연락처 */}
          {role.includes('학생') && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">학생 생년월일 (필수)</label>
                  <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} className="w-full p-2.5 bg-slate-700 rounded-xl border-none font-bold text-white text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">학생 전화번호 (선택)</label>
                  <input type="tel" value={studentPhone} onChange={e => setStudentPhone(e.target.value)} placeholder="010-0000-0000" className="w-full p-2.5 bg-slate-700 rounded-xl border-none font-bold text-white text-sm outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">학부모 성명 (필수)</label>
                  <input type="text" value={parentNameForm} onChange={e => setParentNameForm(e.target.value)} placeholder="홍길동" className="w-full p-2.5 bg-slate-700 rounded-xl border-none font-bold text-white text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">학부모 전화번호 (필수)</label>
                  <input type="tel" value={parentPhone} onChange={e => setParentPhone(e.target.value)} placeholder="010-0000-0000" className="w-full p-2.5 bg-slate-700 rounded-xl border-none font-bold text-white text-sm outline-none" />
                </div>
              </div>
            </div>
          )}

          {role === '학부모' && (
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">자녀 이름</label>
              <input type="text" value={childName} onChange={e => setChildName(e.target.value)} className="w-full p-2.5 bg-slate-700 rounded-xl border-none font-bold text-white text-sm outline-none" placeholder="재학중인 자녀 성명" />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">가입자 실명</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-2.5 bg-slate-700 rounded-xl border-none font-bold text-white text-sm outline-none" placeholder="본인 실명 입력" />
          </div>
        </div>

        {/* 🌟 개인정보 제공 동의란 */}
        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 mt-4 flex items-start gap-3">
          <input 
            type="checkbox" 
            id="privacy" 
            checked={privacyConsent} 
            onChange={e => setPrivacyConsent(e.target.value === 'on' ? e.target.checked : false)} 
            className="mt-0.5 w-5 h-5 accent-emerald-500 rounded cursor-pointer shrink-0" 
          />
          <label htmlFor="privacy" className="text-xs text-slate-400 leading-relaxed cursor-pointer select-none">
            <span className="text-emerald-400 font-bold block mb-1">[필수] 개인정보 수집 및 이용 동의</span>
            학급 운영 및 온라인 교육 서비스 제공을 위해 위와 같은 개인정보를 수집합니다. 수집된 정보는 <strong>회원 탈퇴 시까지 보관 및 이용</strong>되며, 동의를 거부하실 경우 서비스 가입이 제한됩니다.
          </label>
        </div>

        <button 
          type="submit" 
          disabled={loading || !privacyConsent} 
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-black py-4 rounded-xl transition-all shadow-md text-sm mt-6"
        >
          {loading ? "가입원서 제출 중..." : "가입 승인 요청하기 🚀"}
        </button>

        <div className="text-center mt-4">
          <Link to="/login" className="text-xs font-bold text-slate-400 hover:text-indigo-400 transition-colors">← 로그인 화면으로 돌아가기</Link>
        </div>
      </form>
    </div>
  );
}