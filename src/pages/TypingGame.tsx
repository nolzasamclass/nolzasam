// src/pages/TypingGame.tsx
import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, doc, setDoc, getDoc, updateDoc, onSnapshot, deleteDoc, query, where, addDoc, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

const STAGES = [
  { id: '1', name: '1단계 (기본 자리)' }, { id: '2', name: '2단계 (낱글자)' }, { id: '3', name: '3단계 (기본 낱말)' }, { id: '4', name: '4단계 (심화 낱말)' },
  { id: '5', name: '5단계 (사자성어)' }, { id: '6', name: '6단계 (짧은 문장)' }, { id: '7', name: '7단계 (긴 문장)' }, { id: '8', name: '8단계 (달인되기)' },
];

export default function TypingGame({ user }: { user: any }) {
  const navigate = useNavigate(); 
  
  const isAdmin = user?.role === 'admin' || user?.userType === '교사' || sessionStorage.getItem('customAdmin') === 'true';

  const [lobbyName, setLobbyName] = useState(user?.displayName || user?.name || '학생');
  const [lobbyMaxPlayers, setLobbyMaxPlayers] = useState(5);
  const [rooms, setRooms] = useState<any[]>([]);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  
  const [roomData, setRoomData] = useState<any>(null);
  const [words, setWords] = useState<any[]>([]);
  const [typeInput, setTypeInput] = useState('');
  
  const wordDB = useRef<Record<string, string[]>>({});
  const gameLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminWords, setAdminWords] = useState<Record<string, string>>({ '1': '', '2': '', '3': '', '4': '', '5': '', '6': '', '7': '', '8': '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchDB = async () => {
      const snap = await getDoc(doc(db, 'typing_contents', 'extra_typing'));
      if (snap.exists() && snap.data().stages) {
        wordDB.current = snap.data().stages;
        const data = snap.data().stages;
        const formattedWords: Record<string, string> = {};
        STAGES.forEach(st => { formattedWords[st.id] = data[st.id] ? data[st.id].join('\n') : ''; });
        setAdminWords(formattedWords);
      }
    };
    fetchDB();
  }, [showAdminModal]);

  useEffect(() => {
    if (currentRoomId) return;
    const q = query(collection(db, 'typing_rooms'), where('status', '==', 'waiting'));
    const unsub = onSnapshot(q, (snap) => setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, [currentRoomId]);

  useEffect(() => {
    if (!currentRoomId) return;
    const roomUnsub = onSnapshot(doc(db, 'typing_rooms', currentRoomId), (snap) => {
      if (!snap.exists()) { alert("방이 파괴되었거나 게임이 종료되었습니다."); setCurrentRoomId(null); return; }
      setRoomData(snap.data());
    });
    const wordsUnsub = onSnapshot(collection(db, `typing_rooms/${currentRoomId}/active_words`), (snap) => setWords(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => { roomUnsub(); wordsUnsub(); };
  }, [currentRoomId]);

  useEffect(() => {
    if (!currentRoomId || !roomData) return;
    if (roomData.hostId === user.uid && roomData.status === 'playing') {
      if (roomData.spawnCompleted && words.length === 0 && roomData.lives > 0) {
        if (roomData.stage >= 8) updateDoc(doc(db, 'typing_rooms', currentRoomId), { status: 'all_clear' });
        else updateDoc(doc(db, 'typing_rooms', currentRoomId), { status: 'stage_clear' });
      }
    }
  }, [words, roomData, currentRoomId, user.uid]);

  useEffect(() => {
    if (roomData?.status !== 'playing' && gameLoopRef.current) { clearInterval(gameLoopRef.current); gameLoopRef.current = null; }
  }, [roomData?.status]);

  const createRoom = async () => {
    if (!lobbyName.trim()) return alert("이름을 입력해주세요.");
    const newRoomRef = doc(collection(db, 'typing_rooms'));
    await setDoc(newRoomRef, {
      roomName: `${lobbyName}의 타자방`, hostId: user.uid, maxPlayers: lobbyMaxPlayers,
      status: 'waiting', stage: 1, lives: 3, spawnCompleted: false,
      players: [{ id: user.uid, name: lobbyName, score: 0 }], createdAt: Date.now()
    });
    setCurrentRoomId(newRoomRef.id);
  };

  const joinRoom = async (room: any) => {
    const amIAlreadyIn = room.players.some((p: any) => p.id === user.uid);
    if (!amIAlreadyIn && room.players.length >= room.maxPlayers) return alert("방이 꽉 찼습니다.");
    if (!amIAlreadyIn) {
      const roomRef = doc(db, 'typing_rooms', room.id);
      await updateDoc(roomRef, { players: [...room.players, { id: user.uid, name: lobbyName, score: 0 }] });
    }
    setCurrentRoomId(room.id);
  };

  const leaveRoom = async () => {
    if (!currentRoomId || !roomData) return;
    if (roomData.hostId === user.uid) {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
      await deleteDoc(doc(db, 'typing_rooms', currentRoomId)); 
    } else {
      const newPlayers = roomData.players.filter((p: any) => p.id !== user.uid);
      await updateDoc(doc(db, 'typing_rooms', currentRoomId), { players: newPlayers });
    }
    setCurrentRoomId(null);
    setRoomData(null);
  };

  // 💡 복구된 함수: 로비에서 방 삭제
  const deleteRoomFromLobby = async (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation(); 
    if (window.confirm("이 방을 정말 강제 삭제하시겠습니까?")) {
      await deleteDoc(doc(db, 'typing_rooms', roomId));
    }
  };

  const startStage = async (stageToStart: number) => {
    if (!roomData || roomData.hostId !== user.uid) return;
    if (!wordDB.current['1'] || wordDB.current['1'].length === 0) return alert("단어장에 단어가 없습니다. 관리자 설정을 확인해주세요!");

    if (gameLoopRef.current) { clearInterval(gameLoopRef.current); gameLoopRef.current = null; }
    const wordsQuery = await getDocs(collection(db, `typing_rooms/${currentRoomId}/active_words`));
    const deletePromises = wordsQuery.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);

    await updateDoc(doc(db, 'typing_rooms', currentRoomId!), { status: 'playing', stage: stageToStart, lives: 3, spawnCompleted: false });
    
    let spawnCount = 0;
    const TARGET_WORDS = 50; 

    gameLoopRef.current = setInterval(async () => {
      const roomSnap = await getDoc(doc(db, 'typing_rooms', currentRoomId!));
      if (!roomSnap.exists() || roomSnap.data().status !== 'playing') { clearInterval(gameLoopRef.current!); return; }

      spawnCount++;
      if (spawnCount >= TARGET_WORDS) {
        clearInterval(gameLoopRef.current!);
        await updateDoc(doc(db, 'typing_rooms', currentRoomId!), { spawnCompleted: true });
      }

      const stageWords = wordDB.current[stageToStart.toString()] && wordDB.current[stageToStart.toString()].length > 0 
        ? wordDB.current[stageToStart.toString()] : wordDB.current['1']; 
        
      const randomWord = stageWords[Math.floor(Math.random() * stageWords.length)];
      const randomX = Math.floor(Math.random() * 70) + 10; 
      const duration = 10; 

      const wordRef = await addDoc(collection(db, `typing_rooms/${currentRoomId}/active_words`), {
        text: randomWord, x: randomX, duration: duration, createdAt: Date.now()
      });

      setTimeout(async () => {
        const snap = await getDoc(wordRef);
        if (snap.exists()) {
          await deleteDoc(wordRef); 
          const currentRoomSnap = await getDoc(doc(db, 'typing_rooms', currentRoomId!));
          if (currentRoomSnap.exists()) {
            const currentData = currentRoomSnap.data();
            if (currentData.status === 'playing') {
              const newLives = currentData.lives - 1;
              if (newLives <= 0) {
                await updateDoc(doc(db, 'typing_rooms', currentRoomId!), { lives: 0, status: 'game_over' });
                const remainQuery = await getDocs(collection(db, `typing_rooms/${currentRoomId}/active_words`));
                remainQuery.docs.forEach(w => deleteDoc(w.ref));
              } else {
                await updateDoc(doc(db, 'typing_rooms', currentRoomId!), { lives: newLives });
              }
            }
          }
        }
      }, duration * 1000);
    }, 1000);
  };

  const handleKeyPress = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const typedText = typeInput.trim();
      if (!typedText) return;

      const hitWord = words.find(w => w.text === typedText);
      if (hitWord) {
        await deleteDoc(doc(db, `typing_rooms/${currentRoomId}/active_words`, hitWord.id));
        setTypeInput('');
      } else { setTypeInput(''); }
    }
  };

  const handleAdminSave = async () => {
    setIsSaving(true);
    try {
      const dataToSave: Record<string, string[]> = {};
      STAGES.forEach(st => { dataToSave[st.id] = adminWords[st.id].split('\n').map(w => w.trim()).filter(w => w !== ''); });
      await setDoc(doc(db, 'typing_contents', 'extra_typing'), { stages: dataToSave, updatedAt: new Date() });
      alert('✅ 타자 게임 단어장이 게임에 즉시 적용되었습니다!');
      setShowAdminModal(false);
    } catch (e) { alert('저장 실패'); } 
    finally { setIsSaving(false); }
  };

  const renderAdminModal = () => {
    if (!showAdminModal) return null;
    return (
      <div className="fixed inset-0 bg-slate-950/95 z-50 overflow-y-auto p-4 md:p-8 flex justify-center items-start animate-in fade-in">
        <div className="bg-slate-900 w-full max-w-6xl rounded-3xl border border-slate-700 p-6 md:p-8 shadow-2xl mt-4 md:mt-10">
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-700 pb-4 md:pb-6 mb-6 gap-4">
            <h2 className="text-xl md:text-3xl font-black text-fuchsia-400">⚙️ 타자게임 단어 관리</h2>
            <div className="flex gap-2 w-full md:w-auto">
              <button onClick={() => setShowAdminModal(false)} className="flex-1 md:flex-none px-4 md:px-6 py-2 md:py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 text-sm md:text-base">닫기</button>
              <button onClick={handleAdminSave} disabled={isSaving} className="flex-2 md:flex-none px-4 md:px-8 py-2 md:py-3 bg-fuchsia-600 text-white rounded-xl font-black shadow-lg hover:bg-fuchsia-500 text-sm md:text-base whitespace-nowrap">
                {isSaving ? '적용 중...' : '서버 적용 💾'}
              </button>
            </div>
          </header>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {STAGES.map(stage => (
              <div key={stage.id} className="bg-slate-800 p-4 rounded-2xl border border-slate-700 focus-within:border-fuchsia-500 transition-colors">
                <h3 className="text-sm md:text-md font-black text-fuchsia-300 mb-2 md:mb-3">{stage.name}</h3>
                <textarea value={adminWords[stage.id]} onChange={(e) => setAdminWords(prev => ({ ...prev, [stage.id]: e.target.value }))} placeholder="엔터로 구분" className="w-full h-32 md:h-40 p-3 bg-slate-900 border border-slate-600 rounded-xl text-slate-200 outline-none focus:border-fuchsia-500 resize-none text-xs md:text-sm leading-relaxed" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // -------------------------
  // 렌더링: 로비 화면
  // -------------------------
  if (!currentRoomId) {
    return (
      <div className="min-h-screen bg-slate-900 p-4 md:p-8 flex flex-col items-center relative overflow-x-hidden">
        {renderAdminModal()}
        
        <div className="w-full max-w-5xl flex flex-col sm:flex-row justify-between items-center mb-6 md:mb-8 gap-4">
          <button onClick={() => navigate('/')} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-5 py-3 rounded-xl font-bold transition-all shadow-sm text-sm md:text-base">
            🏠 포털 홈으로 돌아가기
          </button>
          {isAdmin && (
            <button onClick={() => setShowAdminModal(true)} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white px-5 py-3 rounded-xl font-black transition-all shadow-lg text-sm md:text-base">
              ⚙️ 단어장 설정 (관리자)
            </button>
          )}
        </div>

        <h1 className="text-2xl md:text-4xl font-black text-fuchsia-400 mb-6 md:mb-8 mt-2 md:mt-4 drop-shadow-md text-center">⌨️ 창체 협동 타자 게임</h1>
        <div className="bg-slate-800 p-5 md:p-8 rounded-2xl md:rounded-3xl shadow-2xl w-full max-w-4xl border border-slate-700">
          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 mb-6 md:mb-8">
            <input type="text" value={lobbyName} onChange={(e)=>setLobbyName(e.target.value)} placeholder="내 이름" className="p-3 md:p-4 rounded-xl bg-slate-900 border border-slate-600 text-white font-bold flex-1 outline-none focus:border-fuchsia-500 text-sm md:text-base" />
            <select value={lobbyMaxPlayers} onChange={(e)=>setLobbyMaxPlayers(Number(e.target.value))} className="p-3 md:p-4 rounded-xl bg-slate-900 border border-slate-600 text-white font-bold outline-none focus:border-fuchsia-500 text-sm md:text-base">
              {[...Array(20)].map((_, i) => <option key={i+1} value={i+1}>{i+1}명</option>)}
            </select>
            <button onClick={createRoom} className="bg-fuchsia-500 hover:bg-fuchsia-400 text-slate-900 font-black px-6 md:px-8 py-3 md:py-4 rounded-xl shadow-md transition-transform active:scale-95 text-sm md:text-base">방 만들기</button>
          </div>
          
          <h3 className="text-lg md:text-xl font-bold mb-4 flex items-center gap-2 text-slate-300">🟢 현재 개설된 게임방</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {rooms.length === 0 ? (
              <p className="text-slate-500 font-bold col-span-full text-center py-6 md:py-8 text-sm md:text-base">대기 중인 방이 없습니다. 방을 만들어보세요!</p>
            ) : (
              rooms.map(room => {
                const canDelete = room.hostId === user.uid || isAdmin;
                return (
                  <div key={room.id} onClick={() => joinRoom(room)} className="p-4 md:p-6 bg-slate-700 border border-slate-600 rounded-2xl cursor-pointer hover:bg-slate-600 hover:border-fuchsia-400 flex justify-between items-center transition-all group">
                    <div>
                      <h4 className="font-black text-white text-base md:text-lg group-hover:text-fuchsia-300 truncate max-w-[150px] md:max-w-[200px]">{room.roomName}</h4>
                      <p className="text-xs md:text-sm text-slate-400 mt-1">방장: {room.players[0]?.name}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className={`px-2 py-1 rounded-full text-[10px] md:text-xs font-bold ${room.players.length >= room.maxPlayers ? 'bg-slate-500 text-slate-300' : 'bg-fuchsia-500 text-white'}`}>
                        {room.players.length} / {room.maxPlayers}
                      </div>
                      {canDelete && (
                        <button onClick={(e) => deleteRoomFromLobby(room.id, e)} className="text-[10px] md:text-xs bg-rose-500 hover:bg-rose-600 text-white px-2 py-1 rounded font-bold shadow-sm">방 삭제</button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  // -------------------------
  // 렌더링: 인게임 화면
  // -------------------------
  return (
    <div className="min-h-[100dvh] bg-slate-900 flex flex-col items-center p-2 md:p-8 text-white relative">
      <style>{`
        @keyframes fall {
          0% { top: -20px; }
          100% { top: calc(100% - 30px); }
        }
      `}</style>

      <div className="w-full max-w-5xl bg-slate-800 rounded-2xl md:rounded-3xl p-3 md:p-6 shadow-2xl border border-slate-700 flex flex-col h-[70vh] min-h-[450px] md:h-[800px] relative overflow-hidden">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-900 p-3 md:p-4 rounded-xl md:rounded-2xl mb-3 md:mb-4 border border-slate-700 relative z-10 gap-2 sm:gap-0">
          <div className="font-bold text-sm md:text-lg flex w-full sm:w-auto justify-between sm:justify-start">
            <span className="text-fuchsia-400 mr-2 md:mr-4 truncate max-w-[120px] md:max-w-[200px]">방: {roomData?.roomName}</span>
            <span className="text-slate-400">({roomData?.players.length}/{roomData?.maxPlayers}명)</span>
          </div>
          <div className="text-base md:text-2xl font-black mx-auto sm:mx-0">
            진행 단계: <span className="text-yellow-400">{roomData?.stage} / 8</span>
          </div>
          <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4 md:gap-6">
            <div className="text-rose-400 font-black text-lg md:text-2xl flex items-center gap-0.5 md:gap-1">
              {Array.from({length: 3}).map((_, i) => (
                <span key={i} className={i < (roomData?.lives || 0) ? 'opacity-100' : 'opacity-20 grayscale'}>❤️</span>
              ))}
            </div>
            {roomData?.hostId === user.uid ? (
              <button onClick={leaveRoom} className="bg-rose-600 hover:bg-rose-700 px-3 py-1.5 md:px-4 md:py-2 rounded-lg md:rounded-xl font-bold transition-colors shadow-md text-white text-xs md:text-base">방 파괴 💥</button>
            ) : (
              <button onClick={leaveRoom} className="bg-slate-700 hover:bg-slate-600 px-3 py-1.5 md:px-4 md:py-2 rounded-lg md:rounded-xl font-bold transition-colors text-white text-xs md:text-base">나가기</button>
            )}
          </div>
        </div>

        <div className="flex-1 relative bg-slate-950 rounded-xl md:rounded-2xl overflow-hidden border-2 md:border-4 border-slate-700 mb-3 md:mb-6">
          
          {roomData?.status === 'waiting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-20 backdrop-blur-sm p-4 text-center">
              <h2 className="text-2xl md:text-4xl font-black mb-2 md:mb-4">대기 중... ⏳</h2>
              <p className="text-slate-300 mb-4 md:mb-6 font-bold text-sm md:text-lg">친구들이 모두 들어올 때까지 기다려주세요.</p>
              {roomData.hostId === user.uid && (
                <button onClick={() => startStage(1)} className="bg-fuchsia-500 hover:bg-fuchsia-400 text-white px-6 md:px-10 py-3 md:py-5 rounded-xl md:rounded-2xl font-black text-lg md:text-2xl animate-pulse shadow-[0_0_20px_rgba(217,70,239,0.5)]">
                  🚀 게임 시작
                </button>
              )}
            </div>
          )}

          {roomData?.status === 'game_over' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 backdrop-blur-sm p-4 text-center">
              <h2 className="text-4xl md:text-6xl font-black mb-2 md:mb-4 text-rose-500">😭 탈락!</h2>
              <p className="text-white mb-6 md:mb-8 font-bold text-base md:text-xl">단어가 바닥에 3번 닿았습니다.</p>
              {roomData.hostId === user.uid ? (
                <button onClick={() => startStage(roomData.stage)} className="bg-rose-500 hover:bg-rose-400 text-white px-6 md:px-10 py-3 md:py-5 rounded-xl md:rounded-2xl font-black text-lg md:text-2xl shadow-[0_0_20px_rgba(244,63,94,0.5)] active:scale-95">
                  현재 단계 다시하기 🔄
                </button>
              ) : (
                <p className="text-slate-300 font-bold text-sm md:text-base">방장이 다시 시작할 때까지 대기해주세요.</p>
              )}
            </div>
          )}

          {roomData?.status === 'stage_clear' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 backdrop-blur-sm p-4 text-center">
              <h2 className="text-3xl md:text-6xl font-black mb-2 md:mb-4 text-emerald-400">🎉 {roomData.stage}단계 클리어!</h2>
              <p className="text-white mb-6 md:mb-8 font-bold text-base md:text-xl">남은 목숨: {roomData.lives}개</p>
              {roomData.hostId === user.uid ? (
                <button onClick={() => startStage(roomData.stage + 1)} className="bg-emerald-500 hover:bg-emerald-400 text-white px-6 md:px-10 py-3 md:py-5 rounded-xl md:rounded-2xl font-black text-lg md:text-2xl shadow-[0_0_20px_rgba(16,185,129,0.5)] active:scale-95">
                  다음 단계로 진행 🚀
                </button>
              ) : (
                <p className="text-slate-300 font-bold text-sm md:text-base">방장이 다음 단계를 시작할 때까지 대기해주세요.</p>
              )}
            </div>
          )}

          {roomData?.status === 'all_clear' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20 backdrop-blur-sm p-4 text-center">
              <div className="text-6xl md:text-8xl mb-2 md:mb-4 animate-bounce">🏆</div>
              <h2 className="text-3xl md:text-5xl font-black mb-2 md:mb-4 text-yellow-400">8단계 완벽 클리어!</h2>
              <p className="text-white mb-6 md:mb-8 font-bold text-base md:text-xl">최고의 타자 팀입니다!</p>
              {roomData.hostId === user.uid ? (
                <button onClick={() => startStage(1)} className="bg-fuchsia-500 hover:bg-fuchsia-400 text-white px-6 md:px-10 py-3 md:py-5 rounded-xl md:rounded-2xl font-black text-lg md:text-2xl shadow-[0_0_20px_rgba(217,70,239,0.5)] active:scale-95">
                  처음부터 다시하기 🔄
                </button>
              ) : (
                <p className="text-slate-300 font-bold text-sm md:text-base">방장이 게임을 다시 시작할 수 있습니다.</p>
              )}
            </div>
          )}

          {words.map(w => (
            <div 
              key={w.id} 
              className="absolute font-black text-lg md:text-2xl text-white drop-shadow-[0_2px_2px_rgba(0,0,0,1)] md:drop-shadow-[0_4px_4px_rgba(0,0,0,1)] whitespace-nowrap"
              style={{ left: `${w.x}%`, animation: `fall ${w.duration}s linear forwards` }}
            >
              {w.text}
            </div>
          ))}
          
          <div className="absolute bottom-0 w-full h-2 md:h-4 bg-rose-500/80 shadow-[0_0_10px_rgba(244,63,94,0.8)] md:shadow-[0_0_20px_rgba(244,63,94,0.8)] z-10"></div>
        </div>

        <div className="flex justify-center relative z-10 shrink-0">
          <input 
            type="text" 
            value={typeInput}
            onChange={(e) => setTypeInput(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={roomData?.status !== 'playing'}
            placeholder={roomData?.status !== 'playing' ? "대기 중..." : "단어 입력 후 엔터!"}
            className="w-full max-w-2xl p-3 md:p-5 text-center text-xl md:text-3xl font-black bg-slate-900 border-2 md:border-4 border-fuchsia-500 rounded-xl md:rounded-2xl outline-none focus:border-fuchsia-300 focus:shadow-[0_0_15px_rgba(217,70,239,0.6)] text-white transition-all disabled:opacity-50"
            autoFocus
            autoComplete="off"
            spellCheck="false"
          />
        </div>
      </div>
    </div>
  );
}