// src/pages/AdminAssessment.tsx
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, doc, setDoc, getDocs, deleteDoc, query, orderBy, serverTimestamp, updateDoc, getDoc, onSnapshot, where } from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';
import AdminExamEditor from './AdminExamEditor'; 

export default function AdminAssessment({ user }: { user: any }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const initialTab = searchParams.get('tab') as 'edit' | 'monitor' | 'evaluations' || 'edit';
  const [activeTab, setActiveTab] = useState<'edit' | 'monitor' | 'evaluations'>(initialTab);
  
  const [monitorRoomCode, setMonitorRoomCode] = useState(searchParams.get('code') || '');
  const [liveData, setLiveData] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<any>(null); 
  const [activeLiveRooms, setActiveLiveRooms] = useState<any[]>([]);

  const fetchExams = () => {
    getDocs(query(collection(db, 'exam_templates'), orderBy('createdAt', 'desc')))
      .then(snap => setExams(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  };
  
  useEffect(() => {
    if (activeTab === 'edit') fetchExams();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'monitor') {
      const q = query(collection(db, 'live_classes'), where('status', '==', 'active'));
      const unsub = onSnapshot(q, (snap) => {
        setActiveLiveRooms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      return () => unsub();
    }
  }, [activeTab]);

  const handleOpenLiveRoom = async (exam: any) => {
    const roomName = window.prompt("개설할 라이브 방의 코드를 영어/숫자로 입력하세요.\n예: math_1");
    if (!roomName) return;
    try {
      await setDoc(doc(db, 'live_classes', roomName), {
        title: exam.title, subject: exam.subject || '기타', teacher: user?.name,
        allowRetake: exam.allowRetake ?? true, questions: exam.questions,
        createdAt: serverTimestamp(), status: 'active'
      });
      toast.success(`[${roomName}] 방 개설 완료!`);
      setMonitorRoomCode(roomName);
      setActiveTab('monitor');
    } catch (e) { toast.error("방 개설 실패"); }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm("🚨 이 시험지 템플릿을 영구 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, 'exam_templates', id));
      toast.success("시험지가 삭제되었습니다.");
      fetchExams();
    } catch (e) { toast.error("삭제 실패"); }
  };

  useEffect(() => {
    if (activeTab === 'monitor' && monitorRoomCode) {
      const fetchRoom = async () => {
        const snap = await getDoc(doc(db, 'live_classes', monitorRoomCode));
        if (snap.exists()) setLiveData(snap.data());
        else { toast.error("방을 찾을 수 없습니다."); setLiveData(null); }
      };
      fetchRoom();

      const unsub = onSnapshot(collection(db, `live_classes/${monitorRoomCode}/participants`), (snap) => {
        setParticipants(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
      });
      return () => unsub();
    }
  }, [activeTab, monitorRoomCode]);

  const handleFinalizeExam = async () => {
    if (!window.confirm("🚨 평가를 종료하시겠습니까?")) return;
    try {
      await updateDoc(doc(db, 'live_classes', monitorRoomCode), { status: 'closed' });
      toast.success("평가 종료 완료!");
      setLiveData({ ...liveData, status: 'closed' });
    } catch (e) { toast.error("종료 실패"); }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col">
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-6">
          <button onClick={() => navigate('/online-assessment')} className="text-slate-500 hover:text-indigo-600 font-bold text-sm bg-slate-100 px-4 py-2 rounded-xl transition-colors">← 평가 허브로</button>
          <h1 className="text-xl font-black text-indigo-600 flex items-center gap-2">⚙️ 교사용 평가 관리 센터</h1>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button onClick={()=>{setActiveTab('edit'); setIsEditorOpen(false);}} className={`px-6 py-2 rounded-lg font-black text-sm transition-all ${activeTab === 'edit' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}>1. 시험 출제/개설</button>
          <button onClick={()=>setActiveTab('monitor')} className={`px-6 py-2 rounded-lg font-black text-sm transition-all ${activeTab === 'monitor' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}>2. 실시간 모니터링</button>
          <button onClick={()=>setActiveTab('evaluations')} className={`px-6 py-2 rounded-lg font-black text-sm transition-all ${activeTab === 'evaluations' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}>3. 서술형 채점실</button>
        </div>
      </div>

      <div className="flex-1 p-8 max-w-6xl mx-auto w-full">
        {activeTab === 'edit' && (
          <div className="animate-in fade-in">
            {isEditorOpen ? (
              <AdminExamEditor user={user} targetExam={selectedExam} onClose={() => setIsEditorOpen(false)} onSaved={() => { setIsEditorOpen(false); fetchExams(); }} />
            ) : (
              <>
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-black text-slate-800">보관된 시험지 목록</h2>
                  <button onClick={() => { setSelectedExam(null); setIsEditorOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black shadow-lg transition-transform active:scale-95">➕ 새 시험지 만들기</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {exams.map(exam => (
                    <div key={exam.id} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all flex flex-col justify-between group">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded text-xs font-bold border border-indigo-100">{exam.subject}</span>
                          <div className="flex gap-2">
                            <button onClick={() => { setSelectedExam(exam); setIsEditorOpen(true); }} className="text-xs text-indigo-600 hover:text-white font-bold bg-indigo-50 hover:bg-indigo-500 px-3 py-1.5 rounded-lg transition-colors shadow-sm">수정</button>
                            <button onClick={() => handleDeleteTemplate(exam.id)} className="text-xs text-rose-500 hover:text-white font-bold bg-rose-50 hover:bg-rose-500 px-3 py-1.5 rounded-lg transition-colors shadow-sm">삭제</button>
                          </div>
                        </div>
                        <h3 className="text-xl font-black text-slate-800 mb-2 line-clamp-2 leading-snug">{exam.title}</h3>
                        <div className="flex items-center gap-2 mb-4">
                          <p className="text-slate-400 text-sm font-bold">문제 {exam.questions?.filter((q:any) => q.type !== 'passage').length || 0}문항</p>
                          {exam.allowRetake && <span className="bg-sky-100 text-sky-600 text-[10px] px-2 py-0.5 rounded font-black">재응시 허용됨</span>}
                        </div>
                      </div>
                      <button onClick={() => handleOpenLiveRoom(exam)} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-black py-3 rounded-xl transition-all shadow-md mt-4">라이브 방 개설하기 🚀</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* 🌟 상세 모니터링 기능(입력값/채점 현황 실시간 표시)이 부활한 탭 2 */}
        {activeTab === 'monitor' && (
          <div className="animate-in fade-in">
            <div className="flex gap-4 mb-8">
              <select 
                value={monitorRoomCode} 
                onChange={e => setMonitorRoomCode(e.target.value)} 
                className="flex-1 bg-white border-2 border-slate-200 rounded-xl px-6 py-4 text-lg font-bold outline-none focus:border-indigo-500 text-slate-800 shadow-sm cursor-pointer"
              >
                <option value="" disabled>👉 모니터링할 라이브 평가 방을 선택하세요</option>
                {activeLiveRooms.length === 0 && <option value="" disabled>현재 진행 중인 평가가 없습니다.</option>}
                {activeLiveRooms.map(room => (
                  <option key={room.id} value={room.id}>{room.title} (코드: {room.id})</option>
                ))}
              </select>
            </div>
            
            {liveData ? (
              <div className="space-y-6">
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-black text-indigo-600 mb-2">{liveData.title}</h2>
                    <p className="text-slate-500 font-bold">접속 코드: <span className="text-slate-800">{monitorRoomCode}</span> | 접속자: {participants.length}명</p>
                  </div>
                  {liveData.status !== 'closed' ? (
                    <button onClick={handleFinalizeExam} className="bg-rose-500 hover:bg-rose-600 text-white px-8 py-4 rounded-xl font-black shadow-lg transition-transform active:scale-95">🚨 평가 강제 종료</button>
                  ) : (
                    <span className="bg-slate-100 px-6 py-3 rounded-xl font-bold text-slate-500 border border-slate-200">🔒 종료된 평가</span>
                  )}
                </div>
                
                {/* 학생별 상세 현황 카드 */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {participants.map(p => {
                    // 전체 문항 수 및 진행률 계산
                    const totalCount = liveData.questions?.filter((q:any) => q.type !== 'passage').length || 0;
                    const answeredCount = liveData.questions?.filter((q:any) => {
                      if (q.type === 'passage') return false;
                      if (q.type === 'short') {
                        return q.shortAnswers?.every((_:any, i:number) => p.answers?.[`${q.id}_${i}`]?.trim());
                      }
                      return !!p.answers?.[q.id];
                    }).length || 0;
                    const progressPercent = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;

                    let displayQNum = 0;

                    return (
                      <div key={p.uid} className={`bg-white rounded-2xl border-2 shadow-sm flex flex-col ${p.status === 'submitted' ? 'border-emerald-500 bg-emerald-50/10' : 'border-slate-200'}`}>
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                          <h4 className="font-black text-lg text-slate-800">{p.name}</h4>
                          <span className={`px-2 py-1.5 rounded-lg text-xs font-black ${p.status === 'submitted' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                            {p.status === 'submitted' ? '제출 완료 ✔' : '풀이 중...'}
                          </span>
                        </div>
                        
                        <div className="p-5 bg-slate-50 flex-1 rounded-b-2xl">
                          <div className="mb-4">
                            <div className="flex justify-between text-xs font-bold text-slate-500 mb-1">
                              <span>진행률</span>
                              <span>{progressPercent}%</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                              <div className="bg-indigo-500 h-2 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
                            </div>
                          </div>
                          
                          {/* 💡 문항별 실시간 입력 내역 */}
                          <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-2">
                            {liveData.questions?.map((q: any) => {
                              if (q.type === 'passage') return null;
                              displayQNum++;
                              
                              let sAnsText = '대기 중';
                              let isCorrect = null;
                              let statusColor = 'bg-white border-slate-200 text-slate-400';
                              let icon = '➖';

                              if (q.type === 'multiple') {
                                const ans = p.answers?.[q.id];
                                if (ans) {
                                  sAnsText = `${ans}번`;
                                  isCorrect = (ans === q.answer);
                                }
                              } else if (q.type === 'short') {
                                const blanks = q.shortAnswers || [q.answer || ''];
                                const sAnswers = blanks.map((_:any, i:number) => p.answers?.[`${q.id}_${i}`] || '');
                                if (sAnswers.some((a: string) => a)) {
                                  sAnsText = sAnswers.join(', ');
                                  isCorrect = blanks.every((b:string, i:number) => sAnswers[i]?.trim() === b.trim());
                                }
                              } else if (q.type === 'essay') {
                                const ans = p.answers?.[q.id];
                                if (ans) {
                                  sAnsText = ans;
                                  isCorrect = null;
                                  icon = '📝';
                                  statusColor = 'bg-amber-50 border-amber-200 text-amber-600';
                                }
                              }

                              if (isCorrect === true) {
                                statusColor = 'bg-emerald-50 border-emerald-200 text-emerald-600';
                                icon = '⭕';
                              } else if (isCorrect === false) {
                                statusColor = 'bg-rose-50 border-rose-200 text-rose-600';
                                icon = '❌';
                              }

                              return (
                                <div key={q.id} className={`flex justify-between items-center p-2 rounded-lg border ${statusColor} text-xs font-bold shadow-sm`}>
                                  <span className="w-12">{displayQNum}번</span>
                                  <span className="flex-1 truncate px-2" title={sAnsText}>{sAnsText}</span>
                                  <span>{icon}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-32 bg-white rounded-3xl border border-slate-200 shadow-sm text-slate-400 font-bold text-lg">상단 드롭다운에서 방을 선택하면 실시간 모니터링이 시작됩니다.</div>
            )}
          </div>
        )}

        {activeTab === 'evaluations' && (
          <div className="animate-in fade-in text-center py-32 bg-white border-2 border-slate-200 rounded-[3rem] shadow-sm">
            <span className="text-6xl mb-6 block opacity-80">📝</span>
            <h2 className="text-2xl font-black text-slate-800 mb-2">서술형 통합 채점실</h2>
            <p className="text-slate-500 font-bold">평가가 종료된 후 이곳에서 서술형 채점과 리포트 출력이 가능합니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}