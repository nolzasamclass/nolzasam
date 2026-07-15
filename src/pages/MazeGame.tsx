// src/pages/MazeGame.tsx
import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  collection, doc, onSnapshot, setDoc, updateDoc, deleteField,
  query, where, getDoc, runTransaction, arrayRemove, increment
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import toast from 'react-hot-toast';

// 🗺️ 미로 맵 템플릿 (1: 벽, 0: 길/보석 공간) - 15x15 사이즈
const MAZE_TEMPLATE = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

const RUNNER_CHARS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯'];
const TAGGER_CHARS = ['😈', '👺', '👹', '👿', '👽'];

export default function MazeGame() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('room');

  const [user, setUser] = useState<any>(null);
  const [roomData, setRoomData] = useState<any>(null);
  const [activeRooms, setActiveRooms] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState(60);

  const [newRoomName, setNewRoomName] = useState('');
  const [newMaxPlayers, setNewMaxPlayers] = useState(18);
  const [newTaggerCount, setNewTaggerCount] = useState(2);

  const isMovingRef = useRef(false);
  const isEndingRef = useRef(false);
  const roomDataRef = useRef<any>(null);
  const userRef = useRef<any>(null);

  useEffect(() => { roomDataRef.current = roomData; }, [roomData]);
  useEffect(() => { userRef.current = user; }, [user]);

  // 1. 유저 인증
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

  // 2. 방 데이터 구독
  useEffect(() => {
    if (!user) return;
    if (roomId) {
      const roomRef = doc(db, 'maze_rooms', roomId);
      const unsubRoom = onSnapshot(roomRef, (docSnap) => {
        if (!docSnap.exists() || docSnap.data().status === 'destroyed') {
          toast.error('방이 파괴되었거나 종료되었습니다.');
          navigate('/maze-game');
          return;
        }
        setRoomData({ id: docSnap.id, ...docSnap.data() });
      });
      return () => unsubRoom();
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
    const finalRoomName = newRoomName.trim() || `${user?.name}의 다중 술래잡기`;
    const newRoomId = `MAZE_${Date.now()}`;
    
    await setDoc(doc(db, 'maze_rooms', newRoomId), {
      roomName: finalRoomName,
      hostId: user.uid,
      maxPlayers: newMaxPlayers,
      taggerCount: newTaggerCount,
      status: 'waiting',
      stage: 1,
      createdAt: Date.now(),
      players: {
        [user.uid]: {
          id: user.uid, name: user.name, isTagger: false, isAlive: true,
          tempScore: 0, totalScore: 0, x: 1, y: 1, character: RUNNER_CHARS[0]
        }
      },
      remainingGems: []
    });
    setNewRoomName('');
    navigate(`/maze-game?room=${newRoomId}`);
  };

  const handleJoinRoom = async (room: any) => {
    const roomRef = doc(db, 'maze_rooms', room.id);
    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) throw new Error("방이 없습니다.");
        
        const data = snap.data();
        const playersObj = data.players || {};
        const currentCount = Object.keys(playersObj).length;
        
        if (currentCount >= data.maxPlayers) throw new Error("방이 꽉 찼습니다!");
        if (playersObj[user.uid]) throw new Error("이미 참여 중입니다.");

        transaction.update(roomRef, {
          [`players.${user.uid}`]: {
            id: user.uid, name: user.name, isTagger: false, isAlive: true,
            tempScore: 0, totalScore: 0, x: 1, y: 1,
            character: RUNNER_CHARS[currentCount % RUNNER_CHARS.length]
          }
        });
      });
      navigate(`/maze-game?room=${room.id}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleLeaveRoom = async () => {
    if (!roomId) return;
    const roomRef = doc(db, 'maze_rooms', roomId);
    if (roomData?.hostId === user?.uid) {
      if (window.confirm("방장이 나가면 방이 파괴됩니다.")) {
        await updateDoc(roomRef, { status: 'destroyed' });
        navigate('/maze-game');
      }
    } else {
      if (window.confirm("방에서 나가시겠습니까?")) {
        await updateDoc(roomRef, { [`players.${user.uid}`]: deleteField() });
        navigate('/maze-game');
      }
    }
  };

  // ==========================================
  // [게임 로직] 시작 및 타이머 처리
  // ==========================================
  const isHost = roomData?.hostId === user?.uid;
  const playersArray = roomData?.players ? Object.values(roomData.players) : [];
  const me = roomData?.players?.[user?.uid];

  const handleStartGame = async () => {
    if (!isHost || !roomId) return;
    if (playersArray.length <= roomData.taggerCount) {
      return toast.error(`참가자가 술래 수(${roomData.taggerCount}명)보다 많아야 합니다!`);
    }

    const shuffledIds = playersArray.map((p: any) => p.id).sort(() => Math.random() - 0.5);
    const selectedTaggerIds = shuffledIds.slice(0, roomData.taggerCount);

    const emptyCells: {x:number, y:number}[] = [];
    for (let y = 1; y < MAZE_TEMPLATE.length - 1; y++) {
      for (let x = 1; x < MAZE_TEMPLATE[y].length - 1; x++) {
        if (MAZE_TEMPLATE[y][x] === 0) emptyCells.push({ x, y });
      }
    }
    emptyCells.sort(() => Math.random() - 0.5);

    const updates: any = {};
    const startGems: string[] = [];

    playersArray.forEach((p: any, index: number) => {
      const isTagger = selectedTaggerIds.includes(p.id);
      const pos = emptyCells[index];
      
      updates[`players.${p.id}.isTagger`] = isTagger;
      updates[`players.${p.id}.isAlive`] = true;
      updates[`players.${p.id}.tempScore`] = 0;
      updates[`players.${p.id}.x`] = pos.x;
      updates[`players.${p.id}.y`] = pos.y;
      updates[`players.${p.id}.character`] = isTagger ? TAGGER_CHARS[index % TAGGER_CHARS.length] : RUNNER_CHARS[index % RUNNER_CHARS.length];
    });

    for (let i = playersArray.length; i < emptyCells.length; i++) {
      startGems.push(`${emptyCells[i].x},${emptyCells[i].y}`);
    }

    updates.status = 'playing';
    updates.remainingGems = startGems;
    updates.gameEndTime = Date.now() + 60 * 1000;

    isEndingRef.current = false;
    await updateDoc(doc(db, 'maze_rooms', roomId), updates);
  };

  const handleTimeOut = async () => {
    if (!roomId || !roomData) return;
    const updates: any = { status: 'waiting', stage: roomData.stage + 1 };
    Object.values(roomData.players).forEach((p: any) => {
      if (!p.isTagger && p.isAlive) updates[`players.${p.id}.totalScore`] = p.totalScore + p.tempScore;
      updates[`players.${p.id}.tempScore`] = 0;
    });
    await updateDoc(doc(db, 'maze_rooms', roomId), updates);
    toast.error("⏰ 시간 초과! 생존자가 있습니다.", { duration: 5000, icon: '🏃‍♂️' });
  };

  // 🌟 중복된 타이머 1개 삭제 후 단일 타이머로 통합 완료
  useEffect(() => {
    if (roomData?.status === 'playing' && roomData?.gameEndTime) {
      const interval = setInterval(() => {
        const remaining = Math.max(0, Math.floor((roomData.gameEndTime - Date.now()) / 1000));
        setTimeLeft(remaining);

        if (remaining === 0 && isHost && !isEndingRef.current) {
          isEndingRef.current = true;
          handleTimeOut();
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [roomData?.status, roomData?.gameEndTime, isHost]);

  // ==========================================
  // [게임 조작] 🌟 하이브리드 아키텍처 (최종 최적화 적용)
  // ==========================================
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const currentRoom = roomDataRef.current;
      const currentUser = userRef.current;

      if (!currentRoom || currentRoom.status !== 'playing' || !currentUser) return;
      
      const myPlayer = currentRoom.players[currentUser.uid];
      if (!myPlayer || !myPlayer.isAlive) return;

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (isMovingRef.current) return;

      let dx = 0, dy = 0;
      if (e.key === 'ArrowUp' || e.key === 'w') dy = -1;
      else if (e.key === 'ArrowDown' || e.key === 's') dy = 1;
      else if (e.key === 'ArrowLeft' || e.key === 'a') dx = -1;
      else if (e.key === 'ArrowRight' || e.key === 'd') dx = 1;
      else return;

      const nx = myPlayer.x + dx;
      const ny = myPlayer.y + dy;

      if (MAZE_TEMPLATE[ny][nx] === 1) return;

      // [최적화 1] 250ms 쿨타임
      isMovingRef.current = true;
      setTimeout(() => { isMovingRef.current = false; }, 250);

      if (Date.now() > currentRoom.gameEndTime) return;

      const roomRef = doc(db, 'maze_rooms', currentRoom.id);
      const gemLocToken = `${nx},${ny}`;
      const isTagger = myPlayer.isTagger;

      const isHittingGem = !isTagger && currentRoom.remainingGems?.includes(gemLocToken);
      const isTaggerCollision = !isTagger && Object.values(currentRoom.players).some((p: any) => p.isTagger && p.x === nx && p.y === ny);
      const isCatchingRunner = isTagger && Object.values(currentRoom.players).some((p: any) => !p.isTagger && p.isAlive && p.x === nx && p.y === ny);

      const isLastGem = isHittingGem && currentRoom.remainingGems.length <= 1;
      const requiresTransaction = isTaggerCollision || isCatchingRunner || isLastGem;

      // 낙관적 업데이트를 위한 로컬 객체 복사
      const localPlayers = { ...currentRoom.players };
      localPlayers[currentUser.uid] = { ...myPlayer, x: nx, y: ny };

      // 🌟 [최적화 3 보강] 보석 획득 즉각 렌더링 반영
      if (isHittingGem && !requiresTransaction) {
        localPlayers[currentUser.uid].tempScore += 10;
        const newGems = currentRoom.remainingGems.filter((g: string) => g !== gemLocToken);
        
        setRoomData({ ...currentRoom, players: localPlayers, remainingGems: newGems });

        updateDoc(roomRef, {
          [`players.${currentUser.uid}.x`]: nx,
          [`players.${currentUser.uid}.y`]: ny,
          remainingGems: arrayRemove(gemLocToken),
          [`players.${currentUser.uid}.tempScore`]: increment(10)
        }).catch(console.error);
        return;
      }

      // 🌟 [최적화 4] 단순 이동 즉각 렌더링 반영
      if (!requiresTransaction && !isHittingGem) {
        setRoomData({ ...currentRoom, players: localPlayers });

        updateDoc(roomRef, {
          [`players.${currentUser.uid}.x`]: nx,
          [`players.${currentUser.uid}.y`]: ny
        }).catch(console.error);
        return;
      }

      // 화면 즉각 렌더링 (트랜잭션 진입 전)
      setRoomData({ ...currentRoom, players: localPlayers });

      // 🌟 [최적화 5] 중요 충돌 이벤트 시에만 트랜잭션 사용
      try {
        await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(roomRef);
          if (!snap.exists()) return;
          
          const serverData = snap.data();
          if (serverData.status !== 'playing') return;

          const updates: any = {
            [`players.${currentUser.uid}.x`]: nx,
            [`players.${currentUser.uid}.y`]: ny
          };

          if (!myPlayer.isTagger) {
            const steppedOnTagger = Object.values(serverData.players).some((p: any) => p.isTagger && p.x === nx && p.y === ny);
            if (steppedOnTagger) {
              updates[`players.${currentUser.uid}.isAlive`] = false;
              toast.error("앗! 술래에게 잡혔습니다!", { icon: '💥' });
            } 
            else if (serverData.remainingGems?.includes(gemLocToken)) {
              updates.remainingGems = arrayRemove(gemLocToken);
              updates[`players.${currentUser.uid}.tempScore`] = serverData.players[currentUser.uid].tempScore + 10;
              
              if (serverData.remainingGems.length <= 1) {
                updates.status = 'waiting';
                updates.stage = serverData.stage + 1;
                Object.values(serverData.players).forEach((p: any) => {
                  if (!p.isTagger && p.isAlive) {
                    const extra = (p.id === currentUser.uid) ? 10 : 0; 
                    updates[`players.${p.id}.totalScore`] = p.totalScore + p.tempScore + extra;
                  }
                  updates[`players.${p.id}.tempScore`] = 0;
                });
              }
            }
          } 
          else {
            let aliveRunnersLeft = 0;
            Object.values(serverData.players).forEach((p: any) => {
              if (!p.isTagger && p.isAlive) {
                if (p.x === nx && p.y === ny) {
                  updates[`players.${p.id}.isAlive`] = false; 
                  toast.error(`${p.name} 검거 완료!`, { icon: '🚨' });
                } else {
                  aliveRunnersLeft++; 
                }
              }
            });

            if (aliveRunnersLeft === 0) {
              updates.status = 'waiting';
              updates.stage = serverData.stage + 1;
              let totalStolen = 0;
              Object.values(serverData.players).forEach((p: any) => {
                if (!p.isTagger) totalStolen += p.tempScore;
              });
              const taggerCount = Object.values(serverData.players).filter((p: any) => p.isTagger).length || 1;
              const scorePerTagger = Math.floor(totalStolen / taggerCount);

              Object.values(serverData.players).forEach((p: any) => {
                if (p.isTagger) updates[`players.${p.id}.totalScore`] = p.totalScore + scorePerTagger;
                updates[`players.${p.id}.tempScore`] = 0;
              });
            }
          }
          
          transaction.update(roomRef, updates);
        });
      } catch (error) {
        console.error("이동 트랜잭션 오류:", error);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!user) return null;

  // ==========================================
  // [화면 1] 메인 로비 
  // ==========================================
  if (!roomId) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 md:p-12 font-sans flex flex-col items-center">
        <div className="w-full max-w-4xl">
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 bg-slate-800 p-6 rounded-3xl border border-slate-700 shadow-xl gap-6">
            <div>
              <span className="text-4xl block mb-2">🏃‍♂️💎</span>
              <h1 className="text-3xl font-black">다중 술래잡기 미로 탈출</h1>
              <p className="text-slate-400 font-bold mt-2">여러 명의 술래를 피하거나 쫓으며 보석을 모으세요!</p>
            </div>
            
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-600 flex flex-col gap-4 w-full md:w-auto shadow-inner">
              <input type="text" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder={`${user?.name}의 미로 탈출`} className="w-full p-2.5 rounded-xl bg-slate-800 border-2 border-slate-700 text-white font-bold outline-none focus:border-indigo-500 text-sm transition-colors" />
              
              <div className="flex gap-2">
                <div className="flex flex-col flex-1">
                  <span className="text-[10px] text-slate-400 font-bold mb-1 ml-1">전체 인원</span>
                  <select value={newMaxPlayers} onChange={(e) => setNewMaxPlayers(Number(e.target.value))} className="w-full p-2.5 rounded-xl bg-slate-800 border-2 border-slate-700 text-white font-bold outline-none text-sm cursor-pointer">
                    {Array.from({ length: 39 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n}명</option>)}
                  </select>
                </div>
                <div className="flex flex-col flex-1">
                  <span className="text-[10px] text-rose-400 font-bold mb-1 ml-1">술래 수 😈</span>
                  <select value={newTaggerCount} onChange={(e) => setNewTaggerCount(Number(e.target.value))} className="w-full p-2.5 rounded-xl bg-rose-950/50 border-2 border-rose-900 text-rose-200 font-bold outline-none text-sm cursor-pointer">
                    {Array.from({ length: Math.min(10, newMaxPlayers - 1) }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}명</option>)}
                  </select>
                </div>
              </div>

              <button onClick={handleCreateRoom} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black px-6 py-3 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2">
                <span>➕</span> 술래잡기 방 만들기
              </button>
            </div>
          </header>

          <main className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl min-h-[400px]">
            <h2 className="text-xl font-black mb-6 text-slate-300 flex items-center gap-2"><span>🟢</span> 대기 중인 게임방</h2>
            {activeRooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <span className="text-6xl mb-4 opacity-50">👻</span>
                <p className="font-bold text-lg">현재 대기 중인 방이 없습니다.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeRooms.map(room => (
                  <div key={room.id} onClick={() => handleJoinRoom(room)} className="bg-slate-900 hover:bg-slate-700 p-6 rounded-2xl border-2 border-slate-600 hover:border-indigo-500 cursor-pointer transition-all flex justify-between items-center group">
                    <div>
                      <h3 className="font-black text-xl text-white mb-1 truncate max-w-[150px]">{room.roomName}</h3>
                      <p className="text-sm text-rose-400 font-bold">술래 {room.taggerCount}명 지정됨</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-black ${Object.keys(room.players || {}).length >= room.maxPlayers ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {Object.keys(room.players || {}).length} / {room.maxPlayers} 명
                      </span>
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

  if (!roomData || !roomData.players) return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center font-bold text-xl">로딩 중... ⏳</div>;

  // ==========================================
  // [화면 2] 실제 게임 플레이 화면 (미로 렌더링)
  // ==========================================
  if (roomData.status === 'playing') {
    const isSpectator = !me?.isAlive && !me?.isTagger;

    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 select-none ${me?.isTagger ? 'bg-rose-950' : isSpectator ? 'bg-slate-900 grayscale' : 'bg-sky-950'}`}>
        
        <div className="w-full max-w-[600px] flex justify-between items-end mb-4 px-2">
          <div>
            <span className="text-xl font-black text-white block">STAGE {roomData.stage}</span>
            <span className="text-sm font-bold text-slate-400">
              {me?.isTagger ? '😈 도망자들을 사냥하세요!' : isSpectator ? '👻 아웃! 친구들을 응원해주세요.' : '🏃‍♂️ 술래를 피해 보석을 모으세요!'}
            </span>
          </div>

          <div className="text-center bg-slate-800 px-6 py-2 rounded-xl border border-slate-700">
            <span className="text-slate-400 font-bold text-[10px] block mb-0.5">남은 시간</span>
            <span className={`text-2xl font-black ${timeLeft <= 10 ? 'text-rose-500 animate-pulse' : 'text-emerald-400'}`}>{timeLeft}초</span>
          </div>

          <div className="text-right">
            <span className="text-slate-400 font-bold text-[10px] block mb-0.5">나의 보석</span>
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
            style={{ gridTemplateColumns: `repeat(${MAZE_TEMPLATE[0].length}, minmax(0, 1fr))` }}
          >
            {MAZE_TEMPLATE.map((row: number[], y: number) => 
              row.map((cell: number, x: number) => {
                const occupants = playersArray.filter((p: any) => p.isAlive && p.x === x && p.y === y);
                const tagger: any = occupants.find((p: any) => p.isTagger);
                const runner: any = occupants.find((p: any) => !p.isTagger);
                const isMeHere = occupants.some((p: any) => p.id === me?.id);

                const hasGem = roomData.remainingGems?.includes(`${x},${y}`);

                return (
                  <div 
                    key={`${x}-${y}`} 
                    className={`w-5 h-5 sm:w-8 sm:h-8 md:w-10 md:h-10 flex items-center justify-center rounded-sm relative
                      ${cell === 1 ? 'bg-slate-700 shadow-inner' : 'bg-slate-800'}
                      ${isMeHere ? 'ring-2 ring-white z-10' : ''}
                    `}
                  >
                    {occupants.length > 0 && (
                      <div className="absolute -top-3 md:-top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] md:text-[10px] font-black text-white bg-black/80 px-1 rounded z-20 pointer-events-none">
                        {occupants.map((o: any) => o.name).join(', ')}
                      </div>
                    )}

                    <div className="text-sm sm:text-xl md:text-2xl relative z-10 select-none pointer-events-none">
                      {tagger ? (tagger.character || '😈') : runner ? (runner.character || '🏃‍♂️') : hasGem ? '💎' : ''}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <p className="mt-6 text-slate-400 font-bold text-sm hidden md:block">방향키(⬆️⬇️⬅️➡️) 또는 WASD를 사용하여 이동하세요.</p>
        
        <div className="flex gap-4 mt-6">
          {isHost && (
            <button onClick={async () => {
              if(window.confirm("게임을 즉시 중단하고 방을 파괴하시겠습니까?")) {
                await updateDoc(doc(db, 'maze_rooms', roomId!), { status: 'destroyed' });
                navigate('/maze-game');
              }
            }} className="px-4 py-2 bg-rose-900/50 hover:bg-rose-600 border border-rose-500 text-rose-200 text-xs font-black rounded-lg transition-colors">
              💣 방 완전히 파괴하기
            </button>
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
            <p className="text-2xl font-black text-indigo-400">{playersArray.length} / {roomData.maxPlayers}</p>
          </div>
        </header>

        <main className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black text-slate-300">👥 참가자 대기실</h2>
            <span className="bg-rose-950/50 border border-rose-900 text-rose-300 px-3 py-1 rounded-lg text-sm font-bold">
              술래 {roomData.taggerCount}명 랜덤 지정
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {playersArray.map((p: any) => (
              <div key={p.id} className={`p-4 rounded-2xl flex flex-col items-center text-center border-2 transition-all ${p.id === user.uid ? 'bg-indigo-900/50 border-indigo-500' : 'bg-slate-900 border-slate-700'}`}>
                <div className="text-4xl mb-2 relative">
                  {p.character || '👤'}
                  {p.id === roomData.hostId && <span className="absolute -top-2 -right-2 text-xl drop-shadow-md">👑</span>}
                </div>
                <div className="font-bold text-slate-200 truncate w-full">{p.name}</div>
                <div className="text-xs text-yellow-500 font-bold mt-1">💎 {p.totalScore || 0}</div>
                {p.id === user.uid && <span className="text-[10px] bg-indigo-500 text-white px-2 py-0.5 rounded mt-2 font-black">나</span>}
              </div>
            ))}
            {Array.from({ length: roomData.maxPlayers - playersArray.length }).map((_, i) => (
              <div key={i} className="p-4 rounded-2xl border-2 border-dashed border-slate-700 flex items-center justify-center bg-slate-900/50 text-slate-600 font-bold">
                빈 자리
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-4 border-t border-slate-700 pt-8">
            <button onClick={handleLeaveRoom} className="px-8 py-4 bg-slate-700 hover:bg-slate-600 text-white font-black rounded-2xl shadow-md transition-all active:scale-95 text-lg">
              {isHost ? '방 파괴하고 나가기' : '방 나가기'}
            </button>
            
            {isHost ? (
              <button 
                onClick={handleStartGame} 
                className="px-12 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 text-lg flex items-center gap-2"
              >
                <span>🎲</span> 게임 시작 (술래 자동 배정)
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

