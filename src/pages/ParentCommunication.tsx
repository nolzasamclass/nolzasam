// src/pages/ParentCommunication.tsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, getDocs, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import toast from 'react-hot-toast';

// 🚨 알림을 받을 선생님의 실제 이메일 주소를 입력하세요!
const TEACHER_EMAIL = "nolzasamclass@gmail.com"; 

export default function ParentCommunication() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [activeTab, setActiveTab] = useState<'notice' | 'attendance' | 'chat'>('notice');

  // 1. 공지사항 상태
  const [notices, setNotices] = useState<any[]>([]);
  const [newNoticeTitle, setNewNoticeTitle] = useState('');
  const [newNoticeContent, setNewNoticeContent] = useState('');

  // 2. 출결 신고 상태 (캘린더 방식을 위해 startDate, endDate로 변경)
  const [attendances, setAttendances] = useState<any[]>([]);
  const [attForm, setAttForm] = useState({ type: '결석', startDate: '', endDate: '', reason: '' });

  // 3. 1:1 상담 상태
  const [parents, setParents] = useState<any[]>([]);
  const [activeParentUid, setActiveParentUid] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ==========================================
  // 유저 권한 확인 및 기본 데이터 세팅
  // ==========================================
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
        if (userSnap.exists()) {
          const userData = userSnap.data();
          setUser({ ...currentUser, ...userData });
          
          const teacherCheck = userData.role === 'admin' || userData.role === '교사';
          setIsTeacher(teacherCheck);

          if (!teacherCheck) {
            // 학부모면 본인과의 채팅방 즉시 활성화
            setActiveParentUid(currentUser.uid);
          } else {
            // 교사면 학부모 목록 불러오기
            const pSnap = await getDocs(query(collection(db, 'users'), where('role', '==', '학부모')));
            setParents(pSnap.docs.map(d => ({ uid: d.id, ...d.data() } as any)));
          }
        }
      } else {
        toast.error("로그인이 필요합니다.");
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // ==========================================
  // 공지사항 및 출결 신고 실시간 수신 (프론트엔드 정렬 적용)
  // ==========================================
  useEffect(() => {
    if (!user) return;

    // 공지사항 (복합 인덱스 에러 방지를 위해 통째로 가져와서 브라우저 정렬)
    const unsubNotices = onSnapshot(collection(db, 'parent_notices'), snap => {
      const fetchedNotices = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      fetchedNotices.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setNotices(fetchedNotices);
    });

    // 출결 신고 (교사는 전부, 학부모는 본인 것만)
    const qAtt = isTeacher 
      ? collection(db, 'attendance_reports')
      : query(collection(db, 'attendance_reports'), where('uid', '==', user.uid));
      
    const unsubAtt = onSnapshot(qAtt, snap => {
      const attData = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      attData.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setAttendances(attData);
    });

    return () => { unsubNotices(); unsubAtt(); };
  }, [user, isTeacher]);

  // ==========================================
  // 1:1 상담 메시지 실시간 수신 (프론트엔드 정렬 적용)
  // ==========================================
  useEffect(() => {
    if (activeTab !== 'chat' || !activeParentUid) return;

    const roomId = `parent_chat_${activeParentUid}`;
    const qMsgs = query(collection(db, 'chat_messages'), where('roomId', '==', roomId));
    
    const unsubMsgs = onSnapshot(qMsgs, snap => {
      const fetchedMsgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      fetchedMsgs.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setMessages(fetchedMsgs);
    });

    return () => unsubMsgs();
  }, [activeTab, activeParentUid]);

  // 스크롤 자동 내림
  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);


  // ==========================================
  // 📧 이메일 발송 헬퍼 함수 (Trigger Email 연동)
  // ==========================================
  const sendEmailNotification = async (subject: string, text: string) => {
    try {
      await addDoc(collection(db, 'mail'), {
        to: TEACHER_EMAIL,
        message: {
          subject: subject,
          text: text,
          html: `<div style="font-family:sans-serif; padding:20px; background:#f8fafc; border-radius:10px; border: 1px solid #e2e8f0;">
                  <h2 style="color:#4f46e5; margin-top:0;">🏫 놀자샘 포털 알림</h2>
                  <p style="font-size:16px; line-height:1.6; color:#334155;">${text.replace(/\n/g, '<br/>')}</p>
                  <hr style="border:none; border-top:1px solid #e2e8f0; margin: 20px 0;" />
                  <p style="font-size:12px; color:#94a3b8;">본 메일은 놀자샘 포털 시스템에서 자동으로 발송되었습니다.</p>
                 </div>`
        }
      });
    } catch (e) { console.error("이메일 전송 요청 실패", e); }
  };

  // ==========================================
  // 1. 공지사항 기능
  // ==========================================
  const handleAddNotice = async () => {
    if (!newNoticeTitle || !newNoticeContent) return toast.error("제목과 내용을 입력하세요.");
    try {
      await addDoc(collection(db, 'parent_notices'), {
        title: newNoticeTitle, content: newNoticeContent,
        teacher: user.name, createdAt: serverTimestamp(), comments: []
      });
      setNewNoticeTitle(''); setNewNoticeContent('');
      toast.success("학급 공지가 등록되었습니다.");
    } catch (e) { toast.error("등록 실패"); }
  };

  const handleEditNotice = async (id: string, currentTitle: string, currentContent: string) => {
    if (!isTeacher) return;
    const newTitle = window.prompt("수정할 제목을 입력하세요:", currentTitle);
    if (newTitle === null) return;
    const newContent = window.prompt("수정할 내용을 입력하세요:", currentContent);
    if (newContent === null) return;
    
    try {
      await updateDoc(doc(db, 'parent_notices', id), {
        title: newTitle,
        content: newContent
      });
      toast.success("공지가 수정되었습니다.");
    } catch (e) { toast.error("공지 수정 실패"); }
  };

  const handleDeleteNotice = async (id: string) => {
    if (!isTeacher) return;
    if (window.confirm("이 공지사항을 정말 삭제하시겠습니까? (댓글도 함께 삭제됩니다)")) {
      try {
        await deleteDoc(doc(db, 'parent_notices', id));
        toast.success("공지가 삭제되었습니다.");
      } catch (e) { toast.error("공지 삭제 실패"); }
    }
  };

  const handleAddComment = async (noticeId: string, comments: any[]) => {
    const text = window.prompt("댓글을 입력하세요:");
    if (!text?.trim()) return;
    try {
      const newComment = { uid: user.uid, name: user.name, role: user.role, text, createdAt: new Date().toISOString() };
      await updateDoc(doc(db, 'parent_notices', noticeId), { comments: [...comments, newComment] });
      toast.success("댓글이 등록되었습니다.");
      
      // 📧 학부모가 댓글을 달면 교사에게 알림
      if (!isTeacher) {
        sendEmailNotification(
          `[학급 공지 댓글] ${user.name} 학부모님`, 
          `${user.name} 학부모님이 공지에 새 댓글을 남겼습니다:\n\n"${text}"`
        );
      }
    } catch (e) { toast.error("댓글 등록 실패"); }
  };

  // ==========================================
  // 2. 출결 신고 기능
  // ==========================================
  const handleAddAttendance = async () => {
    if (!attForm.startDate || !attForm.endDate || !attForm.reason) return toast.error("기간과 사유를 모두 입력해주세요.");
    
    const dateRangeStr = attForm.startDate === attForm.endDate 
      ? attForm.startDate 
      : `${attForm.startDate} ~ ${attForm.endDate}`;

    try {
      await addDoc(collection(db, 'attendance_reports'), {
        uid: user.uid, name: user.name, childName: user.childName,
        type: attForm.type, date: dateRangeStr, reason: attForm.reason,
        createdAt: serverTimestamp()
      });
      toast.success("출결 신고가 완료되어 선생님께 전달되었습니다.");
      
      // 📧 출결 신고 제출 시 즉시 이메일 발송
      sendEmailNotification(
        `[출결 신고] ${user.childName} 학생 - ${attForm.type}`,
        `[${attForm.type} 신고서 도착]\n\n학부모 성명: ${user.name}\n학생 성명: ${user.childName}\n구분: ${attForm.type}\n해당 기간: ${dateRangeStr}\n상세 사유: ${attForm.reason}`
      );
      setAttForm({ type: '결석', startDate: '', endDate: '', reason: '' });
    } catch (e) { toast.error("신고 실패"); }
  };

  // ==========================================
  // 3. 1:1 상담 채팅 기능
  // ==========================================
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeParentUid) return;
    const text = newMessage; setNewMessage('');

    try {
      await addDoc(collection(db, 'chat_messages'), {
        roomId: `parent_chat_${activeParentUid}`,
        uid: user.uid, name: user.name, role: user.role, text: text,
        createdAt: serverTimestamp()
      });

      // 📧 학부모가 상담 메시지를 보냈을 때 교사에게 이메일 알림
      if (!isTeacher) {
        sendEmailNotification(
          `[1:1 상담 메시지] ${user.childName} 학부모님(${user.name})`,
          `학부모님으로부터 새 상담 메시지가 도착했습니다:\n\n"${text}"\n\n- 놀자샘 포털에 접속하여 확인 및 답변해주세요.`
        );
      }
    } catch (e) { toast.error("전송 실패"); }
  };

  const handleDeleteMessage = async (id: string) => {
    if (!isTeacher) return;
    if (window.confirm("이 메시지를 삭제하시겠습니까?")) {
      try {
        await deleteDoc(doc(db, 'chat_messages', id));
        toast.success("메시지가 삭제되었습니다.");
      } catch (e) { toast.error("메시지 삭제 실패"); }
    }
  };


  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col">
      <header className="bg-indigo-600 text-white p-6 md:p-8 shadow-md flex justify-between items-center relative z-20">
        <div>
          <h1 className="text-xl md:text-2xl font-black">👨‍👩‍👧‍👦 학부모 소통 라운지</h1>
          <p className="text-indigo-200 font-bold text-xs md:text-sm mt-1">{user?.name} {isTeacher ? '선생님' : '학부모님'} 환영합니다.</p>
        </div>
        <button onClick={() => navigate('/')} className="bg-white/20 hover:bg-white/30 px-3 md:px-4 py-2 rounded-xl font-bold transition-all text-xs md:text-sm shadow-sm">
          홈으로 가기
        </button>
      </header>

      <div className="flex bg-white border-b border-slate-200 sticky top-0 z-10 text-sm md:text-base overflow-x-auto custom-scrollbar">
        <button onClick={() => setActiveTab('notice')} className={`flex-1 min-w-[100px] py-4 font-black transition-all ${activeTab === 'notice' ? 'border-b-4 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}>📢 학급 공지</button>
        <button onClick={() => setActiveTab('attendance')} className={`flex-1 min-w-[100px] py-4 font-black transition-all ${activeTab === 'attendance' ? 'border-b-4 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}>📝 출결 신고</button>
        <button onClick={() => setActiveTab('chat')} className={`flex-1 min-w-[100px] py-4 font-black transition-all ${activeTab === 'chat' ? 'border-b-4 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}>💬 1:1 상담</button>
      </div>

      <main className="flex-1 max-w-5xl mx-auto w-full p-4 md:p-8 overflow-hidden flex flex-col">
        
        {/* ==================== 1. 학급 공지 탭 ==================== */}
        {activeTab === 'notice' && (
          <div className="space-y-6 w-full animate-in fade-in flex-1 overflow-y-auto custom-scrollbar pb-10">
            {isTeacher && (
              <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-3xl shadow-sm mb-8">
                <h3 className="font-black text-indigo-800 mb-4">새 공지사항 작성</h3>
                <input type="text" value={newNoticeTitle} onChange={e=>setNewNoticeTitle(e.target.value)} placeholder="제목" className="w-full p-3 rounded-xl border border-indigo-200 mb-3 outline-none focus:ring-2 ring-indigo-400 font-bold" />
                <textarea value={newNoticeContent} onChange={e=>setNewNoticeContent(e.target.value)} placeholder="내용을 입력하세요." className="w-full p-4 rounded-xl border border-indigo-200 mb-3 h-24 outline-none focus:ring-2 ring-indigo-400 resize-none font-medium text-sm md:text-base" />
                <button onClick={handleAddNotice} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black shadow-md w-full transition-colors">공지 등록하기</button>
              </div>
            )}

            {notices.length === 0 ? <p className="text-center py-20 text-slate-400 font-bold">등록된 공지사항이 없습니다.</p> : (
              notices.map(n => (
                <div key={n.id} className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm">
                  <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
                    <h3 className="text-lg md:text-xl font-black text-slate-800">{n.title}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] md:text-xs text-slate-400 font-bold">{n.createdAt?.toDate().toLocaleDateString()}</span>
                      {isTeacher && (
                        <div className="flex gap-1 ml-2">
                          <button onClick={() => handleEditNotice(n.id, n.title, n.content)} className="text-[11px] font-bold text-sky-600 bg-sky-100 px-2 py-1 rounded hover:bg-sky-200">수정</button>
                          <button onClick={() => handleDeleteNotice(n.id)} className="text-[11px] font-bold text-rose-600 bg-rose-100 px-2 py-1 rounded hover:bg-rose-200">삭제</button>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm md:text-base text-slate-600 font-medium whitespace-pre-wrap leading-relaxed mb-6">{n.content}</p>
                  
                  <div className="bg-slate-50 p-4 rounded-2xl">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-sm font-black text-slate-700">댓글 ({n.comments?.length || 0})</h4>
                      <button onClick={() => handleAddComment(n.id, n.comments || [])} className="text-xs font-bold text-indigo-600 bg-indigo-100 px-3 py-1.5 rounded-lg hover:bg-indigo-200">댓글 쓰기</button>
                    </div>
                    <div className="space-y-3">
                      {n.comments?.map((c:any, i:number) => (
                        <div key={i} className="flex flex-col sm:flex-row sm:gap-2 text-sm bg-white p-3 rounded-xl border border-slate-100">
                          <span className={`font-black shrink-0 ${c.role.includes('교사') ? 'text-indigo-600' : 'text-slate-600'}`}>
                            {c.role.includes('교사') ? '👨‍🏫 선생님' : `${c.name} 학부모님`}:
                          </span>
                          <span className="text-slate-700 break-words mt-1 sm:mt-0 font-medium">{c.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ==================== 2. 출결 신고 탭 ==================== */}
        {activeTab === 'attendance' && (
          <div className="space-y-6 w-full animate-in fade-in flex-1 overflow-y-auto custom-scrollbar pb-10">
            {!isTeacher && (
              <div className="bg-white border border-emerald-100 p-6 rounded-3xl shadow-sm mb-8 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-2 h-full bg-emerald-400"></div>
                <h3 className="font-black text-emerald-800 mb-1 text-lg">새 출결 신고서 작성</h3>
                <p className="text-xs font-bold text-slate-400 mb-6">결석, 지각, 조퇴, 체험학습을 할 경우 신고서를 작성해주세요.</p>
                
                <div className="mb-4">
                  <label className="block text-xs font-bold text-slate-500 mb-1">신고 구분</label>
                  <select value={attForm.type} onChange={e=>setAttForm({...attForm, type: e.target.value})} className="w-full md:w-1/2 p-3 rounded-xl border border-slate-200 font-bold outline-none focus:border-emerald-400 text-sm">
                    <option value="결석">결석</option>
                    <option value="체험학습">체험학습</option>
                    <option value="조퇴">조퇴</option>
                    <option value="지각">지각</option>
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-bold text-slate-500 mb-1">해당 기간 (시작일 ~ 종료일)</label>
                  <div className="flex items-center gap-2">
                    <input type="date" value={attForm.startDate} onChange={e=>setAttForm({...attForm, startDate: e.target.value})} className="w-full p-3 rounded-xl border border-slate-200 font-bold outline-none focus:border-emerald-400 text-sm text-slate-600" />
                    <span className="font-bold text-slate-400">~</span>
                    <input type="date" value={attForm.endDate} onChange={e=>setAttForm({...attForm, endDate: e.target.value})} className="w-full p-3 rounded-xl border border-slate-200 font-bold outline-none focus:border-emerald-400 text-sm text-slate-600" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">상세 사유</label>
                  <input type="text" value={attForm.reason} onChange={e=>setAttForm({...attForm, reason: e.target.value})} placeholder="예 : 감기로 인한 지각(조퇴 또는 결석) / 체험학습 " className="w-full p-3 rounded-xl border border-slate-200 font-bold outline-none focus:border-emerald-400 text-sm" />
                </div>
                <button onClick={handleAddAttendance} className="mt-6 bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3.5 rounded-xl font-black shadow-md w-full transition-colors active:scale-95">선생님께 신고서 제출하기 🚀</button>
              </div>
            )}

            <div>
              <h3 className="text-lg font-black text-slate-700 mb-4">{isTeacher ? '접수된 전체 출결 신고서 목록' : '나의 신고 내역'}</h3>
              <div className="space-y-3">
                {attendances.length === 0 ? <p className="text-slate-400 font-bold py-10 text-center bg-slate-50 rounded-2xl">신고 내역이 없습니다.</p> : (
                  attendances.map(a => (
                    <div key={a.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-emerald-300 transition-colors">
                      <div className="flex items-start md:items-center gap-4">
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-black text-white shrink-0 ${a.type === '결석' ? 'bg-rose-500' : a.type === '체험학습' ? 'bg-sky-500' : 'bg-amber-500'}`}>{a.type}</span>
                        <div>
                          <div className="font-black text-slate-800 text-sm md:text-base">{a.childName} 학생 <span className="text-slate-400 text-xs font-medium ml-1">({a.name} 학부모)</span></div>
                          <div className="text-xs md:text-sm font-bold text-slate-600 mt-1"><span className="text-indigo-500">기간: {a.date}</span> | {a.reason}</div>
                        </div>
                      </div>
                      <span className="text-[10px] md:text-xs font-bold text-slate-400 shrink-0">{a.createdAt?.toDate().toLocaleDateString()} 제출됨</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==================== 3. 1:1 상담 탭 ==================== */}
        {activeTab === 'chat' && (
          <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-200px)] md:h-[calc(100vh-250px)] animate-in fade-in">
            {/* 교사 뷰: 학부모 리스트 사이드바 */}
            {isTeacher && (
              <div className="w-full md:w-64 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-y-auto custom-scrollbar p-4 shrink-0">
                <h3 className="text-xs font-black text-slate-400 mb-4 px-2 uppercase tracking-widest">학부모 명단</h3>
                <div className="space-y-1">
                  {parents.map(p => (
                    <button key={p.uid} onClick={() => setActiveParentUid(p.uid)} className={`w-full text-left px-4 py-3 rounded-2xl font-bold text-sm transition-all ${activeParentUid === p.uid ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-slate-50 text-slate-700'}`}>
                      <div className="flex justify-between items-center">
                        <span>{p.childName} 부모님</span>
                        <span className="text-[10px] opacity-60 font-medium truncate ml-2 max-w-[80px]">{p.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 채팅창 영역 */}
            <div className="flex-1 bg-[#abc1d1] rounded-3xl border border-slate-200 shadow-sm flex flex-col overflow-hidden relative">
              {!activeParentUid ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center">
                   <span className="text-6xl mb-4 opacity-50">💬</span>
                   <h2 className="text-lg font-black text-slate-600">상담할 학부모님을 목록에서 선택해주세요.</h2>
                </div>
              ) : (
                <>
                  <div className="bg-white/90 backdrop-blur px-6 py-4 border-b border-slate-200 shadow-sm sticky top-0 z-10 flex justify-between items-center">
                    <div>
                      <h2 className="font-black text-slate-800 text-base md:text-lg">
                        {isTeacher ? `${parents.find(p=>p.uid === activeParentUid)?.childName} 학생 학부모님` : '👨‍🏫 선생님과의 1:1 상담'}
                      </h2>
                      {!isTeacher && <p className="text-[10px] md:text-[11px] text-slate-500 font-bold mt-1">메시지 전송 시 선생님께 이메일 알림이 발송됩니다.</p>}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    {messages.length === 0 ? <div className="text-center py-10 bg-black/5 rounded-2xl text-slate-600 font-bold text-sm mx-4">편하게 메시지를 남겨주세요.</div> : (
                      messages.map(msg => {
                        const isMe = msg.uid === user.uid;
                        const timeStr = msg.createdAt ? msg.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '전송중...';
                        return (
                          <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            {!isMe && <span className={`text-[11px] font-bold mb-1 ml-1 ${msg.role.includes('교사') ? 'text-indigo-800' : 'text-slate-700'}`}>{msg.name}</span>}
                            <div className="flex items-end gap-2">
                              {isMe && <span className="text-[10px] text-slate-500 font-bold mb-1">{timeStr}</span>}
                              <div className={`px-4 py-2.5 rounded-2xl max-w-[240px] md:max-w-md shadow-sm break-words text-sm md:text-base ${isMe ? 'bg-[#fee500] text-slate-900 rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none font-medium'}`}>
                                {msg.text}
                              </div>
                              {!isMe && <span className="text-[10px] text-slate-500 font-bold mb-1">{timeStr}</span>}
                            </div>
                            {isTeacher && (
                              <button onClick={() => handleDeleteMessage(msg.id)} className="text-[10px] font-bold text-rose-500 hover:text-rose-700 mt-1 opacity-70 hover:opacity-100 transition-opacity">삭제</button>
                            )}
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <form onSubmit={handleSendMessage} className="bg-white border-t border-slate-200 p-3 flex gap-2 shrink-0 pb-safe">
                    <textarea value={newMessage} onChange={e=>setNewMessage(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); } }} placeholder="메시지를 입력하세요 (Enter로 전송)" className="flex-1 bg-slate-100 rounded-2xl p-3 outline-none focus:ring-2 ring-indigo-300 resize-none h-12 text-sm font-medium custom-scrollbar" />
                    <button type="submit" disabled={!newMessage.trim()} className="bg-[#fee500] hover:bg-yellow-400 text-slate-800 font-black px-4 md:px-6 rounded-2xl shadow-sm transition-colors disabled:opacity-50">전송</button>
                  </form>
                </>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}