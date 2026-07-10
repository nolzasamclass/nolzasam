// src/pages/MazeGame.tsx
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, query, where, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import toast from 'react-hot-toast';

// 🗺️ 미로 맵 템플릿 (1: 벽, 0: 길/보석) - 15x15 사이즈
const MAZE_TEMPLATE = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

// 🌟 참가자들에게 순서대로 부여될 20가지 동물 캐릭터 풀
const RUNNER_CHARS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆'];

export default function MazeGame() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('room');

  const [user, setUser] = useState<any>(null);
  const [roomData, setRoomData] = useState<any>(null);
  const [activeRooms, setActiveRooms] = useState<any[]>([]);

  const [newRoomName, setNewRoomName] = useState('');
  const [newMaxPlayers, setNewMaxPlayers] = useState(10);
  
  const [lastMoveTime, setLastMoveTime] = useState(0);

  // 1. 유저 정보 세팅
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        setUser(userDoc.exists() ? { ...currentUser, ...userDoc.data() } : currentUser);
      } else {
        toast.error("로그인이 필요합니다.");
        navigate('/login');
      }
    });
    return () => unsub();
  }, [navigate]);

  // 2. 방 데이터 구독 로직
  useEffect(() => {
    if (!user) return;
    if (roomId) {
      const roomRef = doc(db, 'maze_rooms', roomId);
      const unsubscribe = onSnapshot(roomRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const parsedRoom: any = { id: docSnap.id, ...data }; 
          
          if (data.mapData) {
            parsedRoom.map = JSON.parse(data.mapData);
          }
          setRoomData(parsedRoom);
        } else {
          toast.error('방이 파괴되었거나 종료되었습니다.');
          navigate('/maze-game');
        }
      });
      return () => unsubscribe();
    } else {
      const q = query(collection(db, 'maze_rooms'), where('status', '==', 'waiting'));
      const unsubscribe = onSnapshot(q, (snap) => {
        const rooms = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        rooms.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
        setActiveRooms(rooms);
      });
      return () => unsubscribe();
    }
  }, [roomId, user, navigate]);

  // ==========================================
  // [방 관리 액션]
  // ==========================================
  const handleCreateRoom = async () => {
    const finalRoomName = newRoomName.trim() || `${user?.name}의 미로 탈출`;
    const newRoomId = `MAZE_${Date.now()}`;
    await setDoc(doc(db, 'maze_rooms', newRoomId), {
      roomName: finalRoomName,
      hostId: user.uid,
      maxPlayers: newMaxPlayers,
      status: 'waiting',
      stage: 1,
      createdAt: Date.now(),
      players: [{ 
        id: user.uid, name: user.name, isTagger: false, isAlive: true, 
        tempScore: 0, totalScore: 0, x: 1, y: 1, 
        character: RUNNER_CHARS[0] 
      }]
    });
    setNewRoomName(''); setNewMaxPlayers(10);
    navigate(`/maze-game?room=${newRoomId}`);
  };

  const handleJoinRoom = async (room: any) => {
    const roomRef = doc(db, 'maze_rooms', room.id);
    const roomSnap = await getDoc(roomRef);
    if (!roomSnap.exists()) return;
    const data = roomSnap.data();
    const amIIn = data.players.some((p: any) => p.id === user.uid);

    if (!amIIn) {
      if (data.players.length >= data.maxPlayers) return toast.error("방이 꽉 찼습니다!");
      await updateDoc(roomRef, {
        players: [...data.players, { 
          id: user.uid, name: user.name, isTagger: false, isAlive: true, 
          tempScore: 0, totalScore: 0, x: 1, y: 1, 
          character: RUNNER_CHARS[data.players.length % RUNNER_CHARS.length]
        }]
      });
    }
    navigate(`/maze-game?room=${room.id}`);
  };

  const forceDeleteRoom = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("이 방을 완전히 파괴하시겠습니까?")) await deleteDoc(doc(db, 'maze_rooms', id));
  };

  const handleLeaveRoom = async () => {
    if (isHost) {
      if (window.confirm("방장이 나가면 방이 완전히 파괴됩니다. 파괴하시겠습니까?")) {
        await deleteDoc(doc(db, 'maze_rooms', roomId!));
        navigate('/maze-game');
      }
    } else {
      if (window.confirm("방에서 나가시겠습니까?")) {
        const updatedPlayers = roomData.players.filter((p: any) => p.id !== user.uid);
        await updateDoc(doc(db, 'maze_rooms', roomId!), { players: updatedPlayers });
        navigate('/maze-game');
      }
    }
  };

  // ==========================================
  // [게임 로직] 시작 및 종료 판정
  // ==========================================
  const isHost = roomData?.hostId === user?.uid;
  const me = roomData?.players?.find((p: any) => p.id === user?.uid);

  const handleStartGame = async () => {
    if (!isHost || !roomId) return;
    if (roomData.players.length < 2) return toast.error("최소 2명 이상 모여야 시작할 수 있습니다!");

    const randomIndex = Math.floor(Math.random() * roomData.players.length);
    const selectedTaggerId = roomData.players[randomIndex].id;

    const newMap = JSON.parse(JSON.stringify(MAZE_TEMPLATE)); 
    const emptyCells: {x:number, y:number}[] = [];
    
    for (let y = 1; y < newMap.length - 1; y++) {
      for (let x = 1; x < newMap[y].length - 1; x++) {
        if (newMap[y][x] === 0) emptyCells.push({ x, y });
      }
    }
    emptyCells.sort(() => Math.random() - 0.5);

    const updatedPlayers = roomData.players.map((p: any, index: number) => {
      const spawnPos = emptyCells[index % emptyCells.length];
      return {
        ...p,
        isTagger: p.id === selectedTaggerId,
        isAlive: true,
        tempScore: 0,
        x: spawnPos.x,
        y: spawnPos.y
      };
    });

    emptyCells.forEach((cell, index) => {
      if (index >= updatedPlayers.length) {
        newMap[cell.y][cell.x] = 2; 
      }
    });

    await updateDoc(doc(db, 'maze_rooms', roomId), {
      status: 'playing',
      taggerId: selectedTaggerId,
      mapData: JSON.stringify(newMap), 
      players: updatedPlayers
    });
  };

  useEffect(() => {
    if (!isHost || roomData?.status !== 'playing' || !roomData.map) return;

    const aliveRunners = roomData.players.filter((p: any) => !p.isTagger && p.isAlive);
    let gemsLeft = 0;
    roomData.map.forEach((row: number[]) => {
      row.forEach((cell: number) => { if (cell === 2) gemsLeft++; });
    });

    if (aliveRunners.length === 0) {
      let stolenGems = 0;
      const finalPlayers = roomData.players.map((p: any) => {
        if (!p.isTagger) {
          stolenGems += p.tempScore; 
          return { ...p, tempScore: 0 };
        }
        return p;
      });
      const taggerIdx = finalPlayers.findIndex((p: any) => p.isTagger);
      if (taggerIdx !== -1) finalPlayers[taggerIdx].totalScore += stolenGems;

      updateDoc(doc(db, 'maze_rooms', roomId!), { status: 'waiting', players: finalPlayers, stage: roomData.stage + 1 });
      toast.success(`😈 술래 승리! 친구들의 보석 ${stolenGems}개를 빼앗았습니다!`, { duration: 5000, icon: '🏆' });
    }
    else if (gemsLeft === 0) {
      const finalPlayers = roomData.players.map((p: any) => {
        if (!p.isTagger && p.isAlive) {
          return { ...p, totalScore: p.totalScore + p.tempScore }; 
        }
        return p;
      });

      updateDoc(doc(db, 'maze_rooms', roomId!), { status: 'waiting', players: finalPlayers, stage: roomData.stage + 1 });
      toast.success(`🏃‍♂️ 도망자 승리! 모든 보석을 성공적으로 모았습니다!`, { duration: 5000, icon: '💎' });
    }
  }, [roomData, isHost, roomId]);

  // ==========================================
  // [게임 조작] 플레이어 이동 처리
  // ==========================================
  const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
    if (roomData?.status !== 'playing' || !me?.isAlive) return;

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
    }

    const now = Date.now();
    if (now - lastMoveTime < 150) return; 

    let dx = 0, dy = 0;
    if (e.key === 'ArrowUp' || e.key === 'w') dy = -1;
    else if (e.key === 'ArrowDown' || e.key === 's') dy = 1;
    else if (e.key === 'ArrowLeft' || e.key === 'a') dx = -1;
    else if (e.key === 'ArrowRight' || e.key === 'd') dx = 1;
    else return; 

    setLastMoveTime(now);

    const nx = me.x + dx;
    const ny = me.y + dy;

    if (roomData.map[ny][nx] === 1) return;

    let newMap = [...roomData.map];
    let newPlayers = [...roomData.players];
    let myIdx = newPlayers.findIndex(p => p.id === me.id);

    newPlayers[myIdx].x = nx;
    newPlayers[myIdx].y = ny;

    if (me.isTagger) {
      newPlayers.forEach(p => {
        if (!p.isTagger && p.isAlive && p.x === nx && p.y === ny) {
          p.isAlive = false;
          toast.error(`${p.name} 아웃!`); 
        }
      });
    } else {
      const tagger = newPlayers.find(p => p.isTagger);
      if (tagger && tagger.x === nx && tagger.y === ny) {
        newPlayers[myIdx].isAlive = false;
        toast.error("앗! 술래에게 잡혔습니다!"); 
      }
      if (newPlayers[myIdx].isAlive && newMap[ny][nx] === 2) {
        newMap[ny][nx] = 0; 
        newPlayers[myIdx].tempScore += 10;
      }
    }

    await updateDoc(doc(db, 'maze_rooms', roomId!), {
      mapData: JSON.stringify(newMap),
      players: newPlayers
    });

  }, [me, roomData, lastMoveTime, roomId]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!user) return null;

  // ==========================================
  // [화면 1] 메인 로비 (URL에 room 파라미터가 없을 때)
  // ==========================================
  if (!roomId) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 md:p-12 font-sans flex flex-col items-center">
        <div className="w-full max-w-4xl">
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 bg-slate-800 p-6 rounded-3xl border border-slate-700 shadow-xl gap-6">
            <div>
              <span className="text-4xl block mb-2">🏃‍♂️💎</span>
              <h1 className="text-3xl font-black">보석 줍기 미로 탈출</h1>
              <p className="text-slate-400 font-bold mt-2">친구들과 함께 미로를 탐험하며 보석을 모으세요!</p>
            </div>
            
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-600 flex flex-col gap-3 w-full md:w-auto shadow-inner">
              <div className="flex gap-2">
                <input type="text" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder={`${user?.name}의 미로 탈출`} className="flex-1 min-w-[150px] p-2.5 rounded-xl bg-slate-800 border-2 border-slate-700 text-white font-bold outline-none focus:border-indigo-500 text-sm transition-colors" />
                <select value={newMaxPlayers} onChange={(e) => setNewMaxPlayers(Number(e.target.value))} className="w-24 p-2.5 rounded-xl bg-slate-800 border-2 border-slate-700 text-white font-bold outline-none focus:border-indigo-500 text-sm cursor-pointer transition-colors">
                  {Array.from({ length: 19 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n}명</option>)}
                </select>
              </div>
              <button onClick={handleCreateRoom} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black px-6 py-3 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2">
                <span>➕</span> 새 게임방 만들기
              </button>
            </div>
          </header>

          <main className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl min-h-[400px]">
            <h2 className="text-xl font-black mb-6 text-slate-300 flex items-center gap-2"><span>🟢</span> 대기 중인 게임방</h2>
            {activeRooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <span className="text-6xl mb-4 opacity-50">👻</span>
                <p className="font-bold text-lg">현재 대기 중인 방이 없습니다.</p>
                <p className="text-sm mt-1">새로운 방을 직접 만들어 보세요!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeRooms.map(room => (
                  <div key={room.id} onClick={() => handleJoinRoom(room)} className="bg-slate-900 hover:bg-slate-700 p-6 rounded-2xl border-2 border-slate-600 hover:border-indigo-500 cursor-pointer transition-all flex justify-between items-center group">
                    <div>
                      <h3 className="font-black text-xl text-white mb-1 truncate max-w-[150px]">{room.roomName}</h3>
                      <p className="text-sm text-slate-400 font-bold">방장: {room.players.find((p:any) => p.id === room.hostId)?.name || '알 수 없음'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-black ${room.players.length >= room.maxPlayers ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {room.players.length} / {room.maxPlayers} 명
                      </span>
                      {room.hostId === user.uid && <button onClick={(e) => forceDeleteRoom(room.id, e)} className="text-[11px] bg-rose-600 hover:bg-rose-500 text-white px-2 py-1 rounded mt-2">방 삭제</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
          
          <button onClick={() => navigate('/')} className="mt-8 text-slate-400 hover:text-white font-bold transition-colors">← 메인 홈으로 돌아가기</button>
        </div>
      </div>
    );
  }

  if (!roomData) return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center font-bold text-xl">로딩 중... ⏳</div>;

  // ==========================================
  // [화면 2] 실제 게임 플레이 화면 (미로 렌더링)
  // ==========================================
  if (roomData.status === 'playing' && roomData.map) {
    const isSpectator = !me?.isAlive && !me?.isTagger;

    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 select-none ${me?.isTagger ? 'bg-rose-950' : isSpectator ? 'bg-slate-900 grayscale' : 'bg-sky-950'}`}>
        
        <div className="w-full max-w-[600px] flex justify-between items-end mb-4 px-2">
          <div>
            <span className="text-xl font-black text-white block">STAGE {roomData.stage}</span>
            <span className="text-sm font-bold text-slate-400">
              {me?.isTagger ? '😈 모든 친구들을 잡아보세요!' : isSpectator ? '👻 아웃! 친구들을 응원해주세요.' : '🏃‍♂️ 보석을 모으고 도망치세요!'}
            </span>
          </div>
          <div className="text-right">
            <span className="text-3xl font-black text-yellow-400">💎 {me?.totalScore + (me?.tempScore || 0)}</span>
          </div>
        </div>

        <div className="bg-slate-800 p-3 md:p-6 rounded-2xl border-4 shadow-2xl relative" style={{ borderColor: me?.isTagger ? '#e11d48' : '#0ea5e9' }}>
          
          {isSpectator && (
            <div className="absolute inset-0 bg-black/60 z-10 flex items-center justify-center rounded-xl backdrop-blur-[2px]">
              <span className="text-4xl font-black text-rose-500 rotate-12 drop-shadow-lg">YOU DIED</span>
            </div>
          )}

          <div 
            className="grid gap-[2px] md:gap-1 bg-slate-900" 
            style={{ gridTemplateColumns: `repeat(${roomData.map[0].length}, minmax(0, 1fr))` }}
          >
            {roomData.map.map((row: number[], y: number) => 
              row.map((cell: number, x: number) => {
                const occupants = roomData.players.filter((p: any) => p.isAlive && p.x === x && p.y === y);
                const tagger = occupants.find((p: any) => p.isTagger);
                const runner = occupants.find((p: any) => !p.isTagger);
                const isMeHere = occupants.some((p: any) => p.id === me?.id);

                return (
                  <div 
                    key={`${x}-${y}`} 
                    className={`w-5 h-5 sm:w-8 sm:h-8 md:w-10 md:h-10 flex items-center justify-center rounded-sm sm:rounded relative
                      ${cell === 1 ? 'bg-slate-700 shadow-inner' : 'bg-slate-800'}
                      ${isMeHere ? 'ring-2 ring-white z-10' : ''}
                    `}
                  >
                    {/* 🌟 이름표 표시 UI (o에 any 타입 지정) */}
                    {occupants.length > 0 && (
                      <div className="absolute -top-3 md:-top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] md:text-[10px] font-black text-white bg-black/70 px-1 rounded z-20 pointer-events-none">
                        {occupants.map((o: any) => o.name).join(', ')}
                      </div>
                    )}

                    <div className="text-sm sm:text-xl md:text-2xl relative z-10 select-none pointer-events-none">
                      {tagger ? '😈' : runner ? (runner.character || '🏃‍♂️') : cell === 2 ? '💎' : ''}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <p className="mt-6 text-slate-400 font-bold text-sm hidden md:block">방향키(⬆️⬇️⬅️➡️)를 사용하여 이동하세요.</p>
        
        {/* 🌟 관리자(방장)의 게임 중 방 파괴 기능 */}
        <div className="flex gap-4 mt-6">
          {isHost && (
            <>
              <button onClick={() => updateDoc(doc(db, 'maze_rooms', roomId!), { status: 'waiting' })} className="text-xs text-slate-400 hover:text-white underline">
                강제 종료 (대기실 복귀)
              </button>
              <button onClick={async () => {
                if(window.confirm("게임을 즉시 중단하고 방을 완전히 파괴하시겠습니까?")) {
                  await deleteDoc(doc(db, 'maze_rooms', roomId!));
                  navigate('/maze-game');
                }
              }} className="text-xs text-rose-500 hover:text-rose-400 underline font-bold">
                방 파괴 (완전 삭제)
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // [화면 3] 게임방 내부 대기실 (로비)
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 md:p-12 font-sans flex flex-col items-center">
      <div className="w-full max-w-4xl">
        <header className="flex justify-between items-center mb-8 bg-slate-800 p-6 rounded-3xl border border-slate-700 shadow-xl">
          <div>
            <span className="px-3 py-1 bg-indigo-500/20 text-indigo-400 rounded-lg text-sm font-black mb-2 inline-block">보석 줍기 미로 탈출 - Stage {roomData.stage}</span>
            <h1 className="text-3xl font-black">{roomData.roomName}</h1>
          </div>
          <div className="text-right">
            <p className="text-slate-400 font-bold">입장 인원</p>
            <p className="text-2xl font-black text-indigo-400">{roomData.players.length} / {roomData.maxPlayers}</p>
          </div>
        </header>

        <main className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl">
          <h2 className="text-xl font-black mb-6 text-slate-300 flex justify-between items-center">
            <span>👥 현재 대기 중인 플레이어</span>
            <span className="text-sm text-yellow-400 font-bold">나의 총 보석: {me?.totalScore || 0}개</span>
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {roomData.players.map((p: any) => (
              <div key={p.id} className={`p-4 rounded-2xl flex flex-col items-center text-center border-2 transition-all ${p.id === user.uid ? 'bg-indigo-900/50 border-indigo-500' : 'bg-slate-900 border-slate-700'}`}>
                {/* 🌟 로비에서도 배정받은 캐릭터 보여주기 */}
                <div className="text-4xl mb-2 relative">
                  {p.character || '👤'}
                  {p.id === roomData.hostId && <span className="absolute -top-2 -right-2 text-xl drop-shadow-md">👑</span>}
                </div>
                <div className="font-bold text-slate-200 truncate w-full">{p.name}</div>
                <div className="text-xs text-yellow-500 font-bold mt-1">💎 {p.totalScore || 0}</div>
                {p.id === user.uid && <span className="text-[10px] bg-indigo-500 text-white px-2 py-0.5 rounded mt-2 font-black">나</span>}
              </div>
            ))}
            {Array.from({ length: roomData.maxPlayers - roomData.players.length }).map((_, i) => (
              <div key={i} className="p-4 rounded-2xl border-2 border-dashed border-slate-700 flex items-center justify-center bg-slate-900/50 text-slate-600 font-bold">
                빈 자리
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-4 border-t border-slate-700 pt-8">
            <button onClick={handleLeaveRoom} className="px-8 py-4 bg-slate-700 hover:bg-slate-600 text-white font-black rounded-2xl shadow-md transition-all active:scale-95 text-lg">
              {isHost ? '방 폭파하고 나가기' : '방 나가기'}
            </button>
            
            {isHost ? (
              <button 
                onClick={handleStartGame} 
                className="px-12 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 text-lg flex items-center gap-2"
              >
                <span>🎲</span> 랜덤 술래 뽑고 시작!
              </button>
            ) : (
              <div className="px-12 py-4 bg-slate-900 text-slate-400 font-black rounded-2xl border border-slate-700 flex items-center gap-2">
                <span className="animate-spin">⏳</span> 방장의 시작을 기다리는 중...
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}