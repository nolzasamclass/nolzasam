// src/pages/CommunicationRoom.tsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, addDoc, doc, deleteDoc, serverTimestamp, getDoc, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import toast from 'react-hot-toast';

export default function CommunicationRoom() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isTeacher, setIsTeacher] = useState(false);

  // 로비 및 학생 상태
  const [rooms, setRooms] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [activeRoom, setActiveRoom] = useState<any>(null);
  
  // 채팅 메시지 상태
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 모둠방 개설 모달 상태
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);

  // 1. 유저 인증 및 학생 목록 불러오기
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
        if (userSnap.exists()) {
          const userData = userSnap.data();
          setUser({ ...currentUser, ...userData });
          
          const teacherCheck = userData.role === 'admin' || userData.role === '교사';
          setIsTeacher(teacherCheck);

          if (teacherCheck) {
            const studentSnap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['학급 학생', '일반 학생'])));
            setStudents(studentSnap.docs.map(d => ({ uid: d.id, ...d.data() } as any)));
          }
        }
      } else {
        toast.error("로그인이 필요합니다.");
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  // 2. 채팅방(로비) 목록 실시간 수신
  useEffect(() => {
    if (!user) return;

    let qRooms;
    if (isTeacher) {
      qRooms = query(collection(db, 'chat_rooms')); 
    } else {
      qRooms = query(collection(db, 'chat_rooms'), where('participants', 'array-contains', user.uid));
    }

    const unsubRooms = onSnapshot(qRooms, (snap) => {
      const fetchedRooms = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      
      if (isTeacher && !fetchedRooms.some(r => r.type === 'all')) {
        addDoc(collection(db, 'chat_rooms'), {
          type: 'all',
          name: '📢 전체 단톡방',
          participants: ['all'],
          createdAt: serverTimestamp()
        });
      }
      setRooms(fetchedRooms);
    });

    if (!isTeacher) {
      const qAll = query(collection(db, 'chat_rooms'), where('type', '==', 'all'));
      const unsubAll = onSnapshot(qAll, (snap) => {
        const allRooms = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        setRooms(prev => {
          const combined = [...prev.filter(p => p.type !== 'all'), ...allRooms];
          return combined;
        });
      });
      return () => { unsubRooms(); unsubAll(); };
    }

    return () => unsubRooms();
  }, [user, isTeacher]);

  // 3. 채팅 메시지 실시간 수신 (프론트엔드 정렬)
  useEffect(() => {
    if (!activeRoom) return;

    const qMsgs = query(collection(db, 'chat_messages'), where('roomId', '==', activeRoom.id));
    const unsubMsgs = onSnapshot(qMsgs, (snap) => {
      const fetchedMsgs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      fetchedMsgs.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setMessages(fetchedMsgs);
    });

    return () => unsubMsgs();
  }, [activeRoom]);

  // 4. 스크롤 자동 내림
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // 메시지 전송 로직
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeRoom || !user) return;

    const text = newMessage;
    setNewMessage('');

    try {
      await addDoc(collection(db, 'chat_messages'), {
        roomId: activeRoom.id,
        uid: user.uid,
        name: user.name || '익명',
        role: isTeacher ? '선생님' : user.role || '학생',
        text: text,
        createdAt: serverTimestamp()
      });
    } catch (error) { toast.error("메시지 전송 실패"); }
  };

  // 🚨 [교사 전용] 메시지 강제 삭제 로직
  const handleDeleteMessage = async (msgId: string) => {
    if (!window.confirm("이 메시지를 완전히 삭제하시겠습니까? (복구 불가)")) return;
    try {
      await deleteDoc(doc(db, 'chat_messages', msgId));
      toast.success("메시지가 삭제되었습니다.");
    } catch (e) { toast.error("삭제에 실패했습니다."); }
  };

  // 모둠방 개설 (교사 전용)
  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedStudents.length === 0) return toast.error("모둠 이름과 학생을 선택해주세요.");
    try {
      await addDoc(collection(db, 'chat_rooms'), {
        type: 'group',
        name: `👥 ${groupName}`,
        participants: [user.uid, ...selectedStudents], 
        createdAt: serverTimestamp()
      });
      setShowGroupModal(false);
      setGroupName('');
      setSelectedStudents([]);
      toast.success("모둠 단톡방이 개설되었습니다!");
    } catch (e) { toast.error("개설 실패"); }
  };

  // 1:1 채팅방 개설 (교사 전용)
  const handleStart1on1 = async (student: any) => {
    const existingRoom = rooms.find(r => r.type === '1on1' && r.participants.includes(student.uid));
    if (existingRoom) {
      setActiveRoom(existingRoom);
    } else {
      try {
        const newRoomRef = await addDoc(collection(db, 'chat_rooms'), {
          type: '1on1',
          name: `👤 ${student.name} 학생 (1:1)`,
          participants: [user.uid, student.uid],
          studentName: student.name,
          createdAt: serverTimestamp()
        });
        setActiveRoom({ id: newRoomRef.id, type: '1on1', name: `👤 ${student.name} 학생 (1:1)` });
      } catch (e) { toast.error("1:1 방 개설 실패"); }
    }
  };

  const renderRoomList = () => {
    const sortedRooms = [...rooms].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    const allRooms = sortedRooms.filter(r => r.type === 'all');
    const groupRooms = sortedRooms.filter(r => r.type === 'group');
    const oneOnOneRooms = sortedRooms.filter(r => r.type === '1on1');

    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
        <div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 px-2">전체 소통방</h3>
          {allRooms.map(r => (
            <button key={r.id} onClick={() => setActiveRoom(r)} className={`w-full text-left px-4 py-3 rounded-2xl font-black transition-all ${activeRoom?.id === r.id ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-slate-100 text-slate-700'}`}>
              {r.name}
            </button>
          ))}
        </div>

        <div>
          <div className="flex justify-between items-center mb-2 px-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">모둠 단톡방</h3>
            {isTeacher && <button onClick={() => setShowGroupModal(true)} className="text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded text-xs font-black">+ 개설</button>}
          </div>
          {groupRooms.length === 0 ? <p className="text-xs text-slate-400 px-2">참여중인 모둠방이 없습니다.</p> : (
            groupRooms.map(r => (
              <button key={r.id} onClick={() => setActiveRoom(r)} className={`w-full text-left px-4 py-3 rounded-2xl font-black transition-all mb-1 ${activeRoom?.id === r.id ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-slate-100 text-slate-700'}`}>
                {r.name}
              </button>
            ))
          )}
        </div>

        <div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 px-2">1:1 채팅방</h3>
          {isTeacher ? (
            <div className="space-y-1">
              {students.map(s => (
                <button key={s.uid} onClick={() => handleStart1on1(s)} className={`w-full text-left px-4 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeRoom?.name.includes(s.name) ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-slate-100 text-slate-600'}`}>
                  <span className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px]">👤</span>
                  {s.name} 학생
                </button>
              ))}
            </div>
          ) : (
            <>
              {oneOnOneRooms.length === 0 ? <p className="text-xs text-slate-400 px-2">개설된 1:1 채팅이 없습니다.</p> : (
                oneOnOneRooms.map(r => (
                  <button key={r.id} onClick={() => setActiveRoom(r)} className={`w-full text-left px-4 py-3 rounded-2xl font-black transition-all mb-1 ${activeRoom?.id === r.id ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-slate-100 text-slate-700'}`}>
                    👨‍🏫 선생님과 1:1 대화
                  </button>
                ))
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans flex flex-col md:flex-row">
      <div className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col shadow-sm z-10 md:h-screen">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0">
          <div>
            <h1 className="text-xl font-black text-slate-800">💬 통합 소통방</h1>
            <p className="text-xs font-bold text-indigo-500 mt-1">{user?.name} {isTeacher ? '선생님' : '학생'}</p>
          </div>
          <button onClick={() => navigate('/')} className="text-slate-400 hover:text-slate-700 p-2 bg-slate-50 rounded-lg font-black text-sm">홈</button>
        </div>
        <div className="h-48 md:h-auto md:flex-1 overflow-hidden flex flex-col border-b md:border-b-0 border-slate-200">
          {renderRoomList()}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-[#abc1d1] relative h-[calc(100vh-16rem)] md:h-screen">
        {activeRoom ? (
          <>
            <header className="bg-white/90 backdrop-blur-md px-6 py-4 shadow-sm z-10 flex justify-between items-center absolute top-0 w-full">
              <h2 className="text-lg font-black text-slate-800">{activeRoom.name}</h2>
              {isTeacher && activeRoom.type === 'group' && <span className="bg-indigo-50 text-indigo-600 text-xs font-bold px-2 py-1 rounded">선생님 관리방</span>}
            </header>

            <main className="flex-1 overflow-y-auto p-4 pt-20 pb-24 flex flex-col gap-3 custom-scrollbar">
              {messages.length === 0 ? (
                <div className="text-center py-10 bg-black/5 rounded-3xl text-slate-600 font-bold text-sm mx-4">대화가 없습니다. 인사를 건네보세요! 👋</div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.uid === user?.uid;
                  const isMsgTeacher = msg.role === '선생님';
                  const timeString = msg.createdAt ? msg.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '전송 중...';

                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group`}>
                      {/* 이름표 */}
                      {!isMe && (
                        <span className={`text-xs font-bold mb-1 ml-1 ${isMsgTeacher ? 'text-indigo-800' : 'text-slate-700'}`}>
                          {isMsgTeacher ? '👨‍🏫 ' : ''}{msg.name}
                        </span>
                      )}
                      
                      <div className="flex items-end gap-2 relative">
                        {/* 🌟 [내가 보낸 메시지일 때] 시간과 (선생님인 경우) 삭제 버튼 */}
                        {isMe && (
                          <div className="flex flex-col items-end gap-1 pb-1">
                            {isTeacher && (
                              <button onClick={() => handleDeleteMessage(msg.id)} className="text-[10px] bg-rose-100 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-lg shadow-sm hover:bg-rose-500 hover:text-white transition-colors">
                                삭제
                              </button>
                            )}
                            <span className="text-[10px] text-slate-500 font-bold">{timeString}</span>
                          </div>
                        )}
                        
                        <div className={`px-4 py-2.5 rounded-2xl max-w-[240px] md:max-w-md shadow-sm break-words relative ${
                          isMe 
                            ? 'bg-[#fee500] text-slate-900 rounded-tr-none' 
                            : isMsgTeacher 
                              ? 'bg-indigo-500 text-white rounded-tl-none font-bold' 
                              : 'bg-white text-slate-800 rounded-tl-none'
                        }`}>
                          <p className="text-sm md:text-base leading-relaxed">{msg.text}</p>
                        </div>

                        {/* 🌟 [남이 보낸 메시지일 때] 시간과 (선생님인 경우) 삭제 버튼 */}
                        {!isMe && (
                          <div className="flex flex-col items-start gap-1 pb-1">
                            {isTeacher && (
                              <button onClick={() => handleDeleteMessage(msg.id)} className="text-[10px] bg-rose-100 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-lg shadow-sm hover:bg-rose-500 hover:text-white transition-colors">
                                강제 삭제
                              </button>
                            )}
                            <span className="text-[10px] text-slate-500 font-bold">{timeString}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </main>

            <footer className="bg-white border-t border-slate-200 p-4 pb-safe absolute bottom-0 w-full z-20">
              <form onSubmit={handleSendMessage} className="flex gap-2 max-w-4xl mx-auto">
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); } }}
                  placeholder="메시지를 입력하세요... (Enter로 전송)"
                  className="flex-1 bg-slate-100 rounded-2xl border-none outline-none focus:ring-2 focus:ring-indigo-300 p-3 max-h-32 resize-none custom-scrollbar text-sm font-medium"
                  rows={1}
                />
                <button type="submit" disabled={!newMessage.trim()} className="bg-[#fee500] hover:bg-yellow-400 text-slate-800 disabled:bg-slate-200 disabled:text-slate-400 w-14 h-12 rounded-2xl font-black transition-colors shadow-sm flex items-center justify-center shrink-0">
                  전송
                </button>
              </form>
            </footer>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 h-full bg-slate-50">
            <span className="text-6xl mb-4 opacity-50">💬</span>
            <h2 className="text-xl font-black text-slate-600">좌측 로비에서 채팅방을 선택해주세요.</h2>
            {isTeacher && <p className="mt-2 font-bold text-sm">학생 이름을 클릭하면 1:1 대화가 시작됩니다.</p>}
          </div>
        )}
      </div>

      {showGroupModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95">
            <h2 className="text-2xl font-black text-slate-800 mb-6">👥 새 모둠 단톡방 만들기</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-500 mb-1">방 이름</label>
                <input type="text" value={groupName} onChange={e=>setGroupName(e.target.value)} placeholder="예: 1모둠 프로젝트방" className="w-full p-3 bg-slate-50 rounded-xl border-2 border-slate-200 outline-none focus:border-indigo-500 font-bold" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-500 mb-2">초대할 학생 선택 ({selectedStudents.length}명)</label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-xl border-2 border-slate-100 custom-scrollbar">
                  {students.map(s => (
                    <label key={s.uid} className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1.5 rounded">
                      <input type="checkbox" checked={selectedStudents.includes(s.uid)} onChange={(e) => {
                        if (e.target.checked) setSelectedStudents([...selectedStudents, s.uid]);
                        else setSelectedStudents(selectedStudents.filter(id => id !== s.uid));
                      }} className="accent-indigo-600 w-4 h-4" />
                      <span className="text-sm font-bold text-slate-700">{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-4">
                <button onClick={handleCreateGroup} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-xl shadow-md">방 개설</button>
                <button onClick={() => setShowGroupModal(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-black py-3 rounded-xl">취소</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}