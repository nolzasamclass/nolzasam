// src/pages/GoldenBellGame.tsx
import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  collection, doc, onSnapshot, setDoc, updateDoc, deleteField,
  query, where, getDoc, addDoc, orderBy, limit 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import toast from 'react-hot-toast';

interface Question {
  q: string;
  a: string;
}

let audioCtx: AudioContext | null = null;

const playBeep = (freq: number, duration: number) => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); 
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
  } catch (e) {
    console.error("오디오 재생 에러:", e);
  }
};

export default function GoldenBellGame() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('room');

  const [user, setUser] = useState<any>(null);
  const [roomData, setRoomData] = useState<any>(null);
  const [activeRooms, setActiveRooms] = useState<any[]>([]);
  const [hallOfFame, setHallOfFame] = useState<any[]>([]);
  
  const [isTeacherMode, setIsTeacherMode] = useState(false);
  const [roomTitle, setRoomTitle] = useState('');
  const [questionsText, setQuestionsText] = useState('');
  
  const [myAnswer, setMyAnswer] = useState('');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const roomDataRef = useRef<any>(null);
  const userRef = useRef<any>(null);

  const isHost = roomData?.hostId === user?.uid;
  const playersArray = roomData?.players ? Object.values(roomData.players) : [];
  const me = user ? roomData?.players?.[user.uid] : null;

  // 🌟 교사/관리자 권한 확인 로직 추가
  const canManage = user?.role === 'admin' || user?.userType === '교사' || sessionStorage.getItem('customAdmin') === 'true';

  useEffect(() => { roomDataRef.current = roomData; }, [roomData]);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        setUser(userDoc.exists() ? { ...currentUser, ...userDoc.data() } : currentUser);
      } else navigate('/login');
    });

    const q = query(collection(db, 'goldenbell_hof'), orderBy('createdAt', 'desc'), limit(10));
    const unsubHof = onSnapshot(q, (snap) => {
      setHallOfFame(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubAuth(); unsubHof(); };
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    if (roomId) {
      const roomRef = doc(db, 'goldenbell_rooms', roomId);
      const unsubRoom = onSnapshot(roomRef, (docSnap) => {
        if (!docSnap.exists() || docSnap.data().status === 'destroyed') {
          toast.error('방이 종료되었거나 파괴되었습니다.');
          navigate('/Golden-game'); // 🌟 라우팅 경로 수정
          return;
        }
        setRoomData({ id: docSnap.id, ...docSnap.data() });
      });
      return () => unsubRoom();
    } else {
      const q = query(collection(db, 'goldenbell_rooms'), where('status', '==', 'waiting'));
      const unsubActive = onSnapshot(q, (snap) => {
        setActiveRooms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
      return () => unsubActive();
    }
  }, [roomId, user, navigate]);

  useEffect(() => {
    if (roomData?.status === 'playing' && roomData?.endTime) {
      const interval = setInterval(() => {
        const remain = Math.max(0, Math.floor((roomData.endTime - Date.now()) / 1000));
        setTimeLeft(remain);
        if (remain === 0) clearInterval(interval);
      }, 100);
      return () => clearInterval(interval);
    } else {
      setTimeLeft(null);
    }
  }, [roomData?.status, roomData?.endTime]);

  useEffect(() => {
    if (roomData?.status === 'playing') {
      setMyAnswer('');
    }
  }, [roomData?.status, roomData?.currentQIdx]);

  useEffect(() => {
    if (roomData?.status === 'playing' && timeLeft !== null) {
      if (timeLeft <= 5 && timeLeft > 0) {
        playBeep(600, 0.1); 
      } else if (timeLeft === 0) {
        playBeep(400, 0.5); 
      }
    }
  }, [timeLeft, roomData?.status]);

  useEffect(() => {
    if (roomData?.status === 'answer_reveal' && !isHost && me?.isCorrect !== null) {
      if (me.isCorrect) {
        playBeep(880, 0.1); 
        setTimeout(() => playBeep(1046, 0.3), 150); 
      } else {
        playBeep(330, 0.5); 
      }
    }
  }, [roomData?.status, me?.isCorrect, isHost]);

  const handleCreateRoom = async () => {
    if (!roomTitle.trim()) return toast.error('방 제목을 입력하세요.');
    
    const lines = questionsText.trim().split('\n');
    const parsedQuestions: Question[] = lines.map(line => {
      const [q, a] = line.split('/');
      return { q: q?.trim() || '', a: a?.trim() || '' };
    }).filter(item => item.q && item.a);

    if (parsedQuestions.length === 0) return toast.error('형식에 맞게 문제를 입력해주세요 (문제/정답).');

    const newRoomId = `GB_${Date.now()}`;
    await setDoc(doc(db, 'goldenbell_rooms', newRoomId), {
      roomName: roomTitle,
      hostId: user.uid,
      status: 'waiting', 
      questions: parsedQuestions,
      currentQIdx: 0,
      isResurrection: false,
      createdAt: Date.now(),
      players: {},
      endTime: null,
      winners: []
    });
    navigate(`/Golden-game?room=${newRoomId}`); // 🌟 라우팅 경로 수정
  };

  const kickPlayer = async (playerId: string) => {
    if (!isHost) return;
    await updateDoc(doc(db, 'goldenbell_rooms', roomId!), {
      [`players.${playerId}`]: deleteField()
    });
    toast.success('학생을 내보냈습니다.');
  };

  const startQuestion = async (isResurrectionMode = false) => {
    const updates: any = {
      status: 'playing',
      endTime: Date.now() + 20000,
      isResurrection: isResurrectionMode
    };

    Object.values(roomData.players).forEach((p: any) => {
      updates[`players.${p.id}.currentAnswer`] = '';
      updates[`players.${p.id}.isCorrect`] = null;
    });

    await updateDoc(doc(db, 'goldenbell_rooms', roomId!), updates);
  };

  const revealAnswer = async () => {
    const currentQ = roomData.questions[roomData.currentQIdx];
    const updates: any = { status: 'answer_reveal' };

    const normalizeString = (str: string) => str.replace(/\s+/g, '').toLowerCase();
    const normalizedCorrectAnswer = normalizeString(currentQ.a);

    Object.values(roomData.players).forEach((p: any) => {
      const normalizedPlayerAnswer = normalizeString(p.currentAnswer || '');
      const isRight = normalizedPlayerAnswer === normalizedCorrectAnswer;
      
      updates[`players.${p.id}.isCorrect`] = isRight;

      if (roomData.isResurrection) {
        if (!p.isAlive && isRight) updates[`players.${p.id}.isAlive`] = true;
      } else {
        if (p.isAlive && (!p.currentAnswer || !isRight)) updates[`players.${p.id}.isAlive`] = false;
      }
    });

    await updateDoc(doc(db, 'goldenbell_rooms', roomId!), updates);
  };

  const nextQuestionOrFinish = async () => {
    const nextIdx = roomData.currentQIdx + 1;
    if (nextIdx >= roomData.questions.length) {
      const survivors = Object.values(roomData.players).filter((p: any) => p.isAlive).map((p: any) => p.name);
      await updateDoc(doc(db, 'goldenbell_rooms', roomId!), { 
        status: 'finished', 
        winners: survivors 
      });

      if (survivors.length > 0) {
        await addDoc(collection(db, 'goldenbell_hof'), {
          roomName: roomData.roomName,
          winners: survivors,
          createdAt: Date.now()
        });
      }
    } else {
      await updateDoc(doc(db, 'goldenbell_rooms', roomId!), {
        currentQIdx: nextIdx,
        status: 'waiting' 
      });
    }
  };

  const joinRoom = async (room: any) => {
    const roomRef = doc(db, 'goldenbell_rooms', room.id);
    await updateDoc(roomRef, {
      [`players.${user.uid}`]: {
        id: user.uid,
        name: user.name,
        isAlive: true,
        currentAnswer: '',
        isCorrect: null
      }
    });
    navigate(`/Golden-game?room=${room.id}`); // 🌟 라우팅 경로 수정
    
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass && !audioCtx) audioCtx = new AudioContextClass();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
  };

  const submitAnswer = async () => {
    if (!myAnswer.trim()) return toast.error('정답을 입력하세요!');
    await updateDoc(doc(db, 'goldenbell_rooms', roomId!), {
      [`players.${user.uid}.currentAnswer`]: myAnswer
    });
    toast.success('답안 제출 완료!');
  };

  const renderFanfare = () => {
    return (
      <div className="fixed inset-0 pointer-events-none z-[100] flex justify-center overflow-hidden">
        {Array.from({ length: 60 }).map((_, i) => {
          const left = Math.random() * 100;
          const animDelay = Math.random() * 2;
          const duration = 2 + Math.random() * 3;
          const emoji = ['🎉', '🎊', '✨', '🏆', '🔔'][Math.floor(Math.random() * 5)];
          return (
            <div
              key={i}
              className="absolute top-[-10vh] text-5xl opacity-0"
              style={{
                left: `${left}%`,
                animation: `fanfareDrop ${duration}s linear ${animDelay}s forwards`
              }}
            >
              {emoji}
            </div>
          );
        })}
      </div>
    );
  };

  if (!user) return null;

  // ==========================================
  // [화면 1] 로비 & 교사 대시보드
  // ==========================================
  if (!roomId) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 md:p-12 font-sans">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2 space-y-8">
            <header className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl flex justify-between items-center">
              <div>
                <h1 className="text-4xl font-black text-yellow-400 mb-2">🔔 도전 골든벨</h1>
                <p className="text-slate-400 font-bold">끝까지 살아남아 골든벨을 울려라!</p>
              </div>
              {/* 🌟 권한이 있는 교사/관리자만 대시보드 토글 버튼을 볼 수 있습니다 */}
              {canManage && (
                <button 
                  onClick={() => setIsTeacherMode(!isTeacherMode)} 
                  className={`px-4 py-2 rounded-xl font-bold transition-colors ${isTeacherMode ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'}`}
                >
                  {isTeacherMode ? '학생 모드로 보기' : '👩‍🏫 교사 대시보드 열기'}
                </button>
              )}
            </header>

            {/* 🌟 교사 대시보드 내용도 권한에 따라 렌더링 보호 */}
            {isTeacherMode && canManage ? (
              <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl animate-in fade-in slide-in-from-top-4">
                <h2 className="text-2xl font-black mb-6 text-indigo-400">골든벨 방 개설 및 문제 관리</h2>
                <input 
                  type="text" value={roomTitle} onChange={e=>setRoomTitle(e.target.value)} 
                  placeholder="방 제목 (예: 5학년 1학기 사회 총정리 골든벨!)" 
                  className="w-full p-4 mb-4 bg-slate-900 rounded-xl border border-slate-600 text-white font-bold outline-none focus:border-indigo-500"
                />
                <textarea 
                  value={questionsText} onChange={e=>setQuestionsText(e.target.value)}
                  placeholder="문제/정답 형식으로 한 줄에 하나씩 입력하세요.&#10;예) 모든 사람은 태어날 때부터 자유롭고 평등한 권리를 가진다. 이 권리는?/인권&#10;우리나라의 동쪽 끝에 있는 화산섬은?/독도"
                  className="w-full h-48 p-4 mb-4 bg-slate-900 rounded-xl border border-slate-600 text-white font-mono text-sm outline-none focus:border-indigo-500 whitespace-pre-wrap"
                />
                <button onClick={handleCreateRoom} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xl rounded-xl shadow-lg transition-all">
                  골든벨 방 개설하기 🚀
                </button>
              </div>
            ) : (
              <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl">
                <h2 className="text-2xl font-black mb-6 flex items-center gap-2"><span>🟢</span> 입장 가능한 골든벨 방</h2>
                {activeRooms.length === 0 ? (
                  <p className="py-10 text-center text-slate-500 font-bold">현재 열려있는 골든벨이 없습니다.</p>
                ) : (
                  <div className="grid gap-4">
                    {activeRooms.map(room => (
                      <div key={room.id} onClick={() => joinRoom(room)} className="bg-slate-900 p-6 rounded-2xl border-2 border-slate-600 hover:border-yellow-500 cursor-pointer flex justify-between items-center group transition-colors">
                        <div>
                          <h3 className="font-black text-xl text-white mb-1 group-hover:text-yellow-400 transition-colors">{room.roomName}</h3>
                          <p className="text-sm text-slate-400">총 {room.questions?.length}문제 대기 중</p>
                        </div>
                        <span className="bg-emerald-500/20 text-emerald-400 px-4 py-2 rounded-lg font-black text-sm">입장하기</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-yellow-900/20 p-8 rounded-3xl border border-yellow-700/50 shadow-xl">
            <h2 className="text-2xl font-black text-yellow-400 mb-6 text-center">🏆 골든벨 명예의 전당</h2>
            <div className="space-y-4">
              {hallOfFame.length === 0 ? (
                <p className="text-center text-yellow-700 font-bold mt-10">아직 골든벨을 울린 학생이 없습니다.</p>
              ) : (
                hallOfFame.map((hof, idx) => (
                  <div key={hof.id} className="bg-slate-900/50 p-4 rounded-xl border border-yellow-700/30 flex items-start gap-4">
                    <div className="text-3xl">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🏅'}</div>
                    <div>
                      <p className="text-xs text-yellow-600 font-bold mb-1">{hof.roomName}</p>
                      <p className="text-yellow-100 font-black">{hof.winners.join(', ')}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    );
  }

  if (!roomData) return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center font-bold text-xl">골든벨 입장 중... ⏳</div>;

  const currentQ = roomData.questions[roomData.currentQIdx];

  const wrongAnswers = playersArray
    .filter((p: any) => p.isCorrect === false && p.currentAnswer && p.currentAnswer.trim() !== '')
    .map((p: any) => p.currentAnswer);

  if (roomData.status === 'finished') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-900 text-white">
        <style>
          {`
            @keyframes fanfareDrop {
              0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
              10% { opacity: 1; }
              90% { opacity: 1; }
              100% { transform: translateY(110vh) rotate(360deg); opacity: 0; }
            }
          `}
        </style>
        
        {roomData.winners.length > 0 && renderFanfare()}

        <div className="w-full max-w-3xl bg-slate-800 rounded-3xl border-4 border-yellow-500 shadow-[0_0_50px_rgba(234,179,8,0.3)] p-12 text-center animate-in zoom-in duration-500 relative z-10">
          <div className="text-8xl mb-8 animate-bounce">🔔</div>
          <h1 className="text-5xl font-black text-yellow-400 mb-4">도전 골든벨 종료!</h1>
          
          {roomData.winners.length > 0 ? (
            <>
              <p className="text-2xl font-bold text-slate-300 mb-8">최후의 생존자, 골든벨을 울린 영광의 얼굴들입니다!</p>
              <div className="bg-slate-900 p-8 rounded-2xl border border-yellow-500/30 mb-10 inline-block px-16">
                <h2 className="text-4xl font-black text-white leading-relaxed">
                  {roomData.winners.map((w:string, i:number) => <span key={i} className="text-yellow-300 mx-2">{w}</span>)}
                  <br/><span className="text-2xl text-slate-400 mt-4 block">학생이 골든벨을 울렸습니다! 🎉</span>
                </h2>
              </div>
            </>
          ) : (
            <p className="text-2xl font-bold text-slate-400 my-16">아쉽게도 골든벨을 울린 학생이 없습니다. 다음 기회에 도전하세요!</p>
          )}

          <div className="flex justify-center gap-4">
            <button onClick={() => navigate('/Golden-game')} className="px-8 py-4 bg-slate-700 hover:bg-slate-600 font-bold rounded-xl transition-colors">로비로 나가기</button>
            {isHost && <button onClick={() => updateDoc(doc(db, 'goldenbell_rooms', roomId), { status: 'destroyed' })} className="px-8 py-4 bg-rose-600 hover:bg-rose-500 font-bold rounded-xl text-white">방 종료 및 폭파</button>}
          </div>
        </div>
      </div>
    );
  }

  const canIInput = me && ((me.isAlive && !roomData.isResurrection) || (!me.isAlive && roomData.isResurrection));

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col md:flex-row font-sans">
      <aside className="w-full md:w-64 bg-slate-950 border-r border-slate-800 flex flex-col h-auto md:h-screen z-30">
        <div className="p-6 border-b border-slate-800">
          <h2 className="font-black text-yellow-500 text-lg mb-1">{roomData.roomName}</h2>
          <p className="text-xs text-slate-500 font-bold">생존자 {playersArray.filter((p:any)=>p.isAlive).length} / {playersArray.length}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {playersArray.map((p: any) => (
            <div key={p.id} className={`flex flex-col p-3 rounded-xl transition-colors ${p.isAlive ? 'bg-slate-800 text-white border border-slate-700' : 'bg-slate-900/50 text-slate-600 border border-slate-800/50'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{p.isAlive ? '🟢' : '💀'}</span>
                  <span className={`font-bold text-sm ${p.isAlive ? '' : 'line-through'}`}>{p.name} {p.id === user.uid && '(나)'}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  {roomData.status === 'playing' && (
                    <span className="text-xs" title={p.currentAnswer ? '제출 완료' : '고민 중'}>
                      {p.currentAnswer ? '📝' : '⏳'}
                    </span>
                  )}
                  {isHost && <button onClick={() => kickPlayer(p.id)} className="text-rose-500 text-xs font-black hover:text-rose-400">X</button>}
                </div>
              </div>
              
              {roomData.status === 'answer_reveal' && isHost && (
                <div className="mt-2 text-right">
                  <span className={`text-xs px-2 py-1 rounded font-bold ${p.isCorrect ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    답: {p.currentAnswer || '미제출'}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-slate-800">
          <button onClick={() => navigate('/Golden-game')} className="w-full py-2 bg-slate-800 text-slate-400 rounded-lg text-sm font-bold hover:bg-slate-700">방 나가기</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative overflow-hidden">
        
        {!isHost && !me?.isAlive && !roomData.isResurrection && roomData.status !== 'waiting' && (
          <div className="absolute inset-0 bg-black/60 z-10 pointer-events-none flex items-center justify-center backdrop-blur-sm">
            <span className="text-4xl font-black text-white/30 rotate-12 select-none border-4 border-white/20 p-8 rounded-3xl">관전 모드 (탈락)</span>
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center p-8 z-20 overflow-y-auto">
          {roomData.status === 'waiting' ? (
            <div className="text-center animate-pulse">
              <span className="text-6xl mb-4 block">🔔</span>
              <h2 className="text-3xl font-black text-slate-300">선생님의 문제 출제를 기다리고 있습니다...</h2>
              <p className="text-slate-500 font-bold mt-4">현재 문제: {roomData.currentQIdx + 1} / {roomData.questions.length}</p>
            </div>
          ) : (
            <div className="w-full max-w-4xl flex flex-col items-center">
              
              {roomData.isResurrection && (
                <div className="bg-rose-500/20 border-2 border-rose-500 text-rose-400 px-8 py-3 rounded-full font-black text-2xl mb-8 animate-bounce shadow-[0_0_15px_rgba(244,63,94,0.5)]">
                  🔥 패 자 부 활 전 🔥
                </div>
              )}

              <div className="w-full bg-[#2a4d3e] border-[12px] border-[#8b5a2b] rounded-xl p-10 md:p-16 shadow-2xl relative">
                <span className="absolute top-4 left-6 text-white/30 font-black text-xl">Q {roomData.currentQIdx + 1}.</span>
                {roomData.status === 'playing' && timeLeft !== null && (
                  <span className={`absolute top-4 right-6 font-black text-4xl ${timeLeft <= 5 ? 'text-rose-500 animate-ping' : 'text-yellow-400'}`}>{timeLeft}</span>
                )}
                <h2 className="text-3xl md:text-5xl font-black text-white leading-snug text-center break-keep whitespace-pre-wrap">
                  {currentQ.q}
                </h2>
              </div>

              {!isHost && roomData.status === 'playing' && (
                <div className="mt-12 w-full max-w-md flex flex-col gap-4">
                  <input 
                    type="text" 
                    value={myAnswer} 
                    onChange={e => setMyAnswer(e.target.value)}
                    disabled={!canIInput || timeLeft === 0}
                    placeholder={canIInput ? "정답을 입력하세요" : "이번 문제는 참여할 수 없습니다"}
                    className="w-full text-center text-2xl font-black p-4 bg-slate-800 rounded-2xl border-4 border-slate-600 focus:border-yellow-400 outline-none disabled:opacity-50 transition-colors"
                  />
                  <button 
                    onClick={submitAnswer} 
                    disabled={!canIInput || timeLeft === 0}
                    className="w-full py-4 bg-yellow-500 text-slate-900 font-black text-2xl rounded-2xl shadow-[0_4px_0_#ca8a04] active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed hover:bg-yellow-400 transition-all"
                  >
                    정답 칠판에 적어 내기
                  </button>
                  {me?.currentAnswer && <p className="text-center text-emerald-400 font-bold mt-2">✅ 제출된 답: {me.currentAnswer}</p>}
                </div>
              )}

              {roomData.status === 'answer_reveal' && (
                <div className="mt-12 w-full flex flex-col items-center animate-in slide-in-from-bottom-8 pb-10">
                  <span className="text-slate-400 font-bold mb-2">정답은..</span>
                  <div className="text-6xl font-black text-yellow-400 bg-slate-800 px-12 py-6 rounded-3xl border-4 border-yellow-500/50 shadow-xl whitespace-pre-wrap text-center">
                    {currentQ.a}
                  </div>
                  
                  {!isHost && me?.isCorrect !== null && (
                    <div className={`mt-8 px-8 py-4 rounded-full font-black text-3xl shadow-lg ${me?.isCorrect ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500' : 'bg-rose-500/20 text-rose-500 border-2 border-rose-500'}`}>
                      {me?.isCorrect ? '⭕ 정답입니다! 생존!' : '❌ 오답입니다. 탈락!'}
                    </div>
                  )}

                  {wrongAnswers.length > 0 && (
                    <div className="mt-12 w-full max-w-3xl bg-slate-900/80 p-8 rounded-3xl border border-rose-500/30 shadow-2xl">
                      <h4 className="text-rose-400 font-black mb-6 text-center text-xl flex items-center justify-center gap-2">
                        <span>👀</span> 익명의 오답 퍼레이드 <span>👀</span>
                      </h4>
                      <div className="flex flex-wrap justify-center gap-4">
                        {wrongAnswers.map((ans, i) => (
                          <span key={i} className="bg-rose-500/20 text-rose-300 px-5 py-3 rounded-2xl text-xl font-black animate-bounce shadow-md">
                            {ans}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </div>

        {isHost && (
          <div className="bg-slate-800 p-6 border-t border-slate-700 flex flex-wrap gap-4 items-center justify-center z-30 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
            <span className="font-bold text-slate-400 mr-4">👩‍🏫 교사 진행 패널</span>
            
            {roomData.status === 'waiting' && (
              <>
                <button onClick={() => startQuestion(false)} className="px-6 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-500 transition-colors shadow-md">일반 문제 시작 (20초)</button>
                <button onClick={() => startQuestion(true)} className="px-6 py-3 bg-rose-600 text-white font-black rounded-xl hover:bg-rose-500 transition-colors shadow-md">🔥 패자부활전 시작</button>
              </>
            )}

            {roomData.status === 'playing' && (
              <button onClick={revealAnswer} className="px-8 py-3 bg-yellow-500 text-slate-900 font-black rounded-xl shadow-lg hover:bg-yellow-400 animate-pulse">
                모두 멈춰! 정답 확인 및 생존자 판정
              </button>
            )}

            {roomData.status === 'answer_reveal' && (
              <button onClick={nextQuestionOrFinish} className="px-8 py-3 bg-emerald-600 text-white font-black rounded-xl shadow-lg hover:bg-emerald-500 transition-colors">
                {roomData.currentQIdx + 1 >= roomData.questions.length ? '결과 보기 (게임 종료)' : '다음 문제로 넘어가기 ➡'}
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}