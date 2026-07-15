// src/pages/PongRelayGame.tsx
import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  collection, doc, onSnapshot, setDoc, updateDoc, 
  query, where, getDoc, runTransaction, deleteField 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import toast from 'react-hot-toast';

// 🏓 게임판 물리 엔진 상수
const BOARD_W = 800;
const BOARD_H = 500;
const PADDLE_W = 20;
const BASE_PADDLE_H = 100;
const BALL_SIZE = 20;
const BASE_SPEED = 400; 

const TEAM_COLORS = ['bg-blue-500', 'bg-rose-500'];
const TEAM_NAMES = ['청팀 (좌측)', '홍팀 (우측)'];

export default function PongRelayGame() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('room');

  const [user, setUser] = useState<any>(null);
  const [roomData, setRoomData] = useState<any>(null);
  const [activeRooms, setActiveRooms] = useState<any[]>([]);
  
  const [newRoomName, setNewRoomName] = useState('');
  const [membersPerTeam, setMembersPerTeam] = useState(3); 
  const [countdown, setCountdown] = useState<number | null>(null);

  // 🌟 부드러운 렌더링을 위한 독립적인 로컬 State 및 Ref
  const [visualBall, setVisualBall] = useState({ x: BOARD_W/2, y: BOARD_H/2 });
  const [visualPaddleY, setVisualPaddleY] = useState(BOARD_H / 2 - BASE_PADDLE_H / 2);
  const visualPaddleYRef = useRef(BOARD_H / 2 - BASE_PADDLE_H / 2); 
  
  // 키보드 동시 입력 처리 및 동기화 제어용 Ref
  const keysRef = useRef({ up: false, down: false });
  const myLastSyncedY = useRef(-1);

  // 🌟 [추가됨] 방장 전용: 공 물리 엔진 시뮬레이션 상태 보존용 Ref
  const physicsStateRef = useRef<any>(null);

  const roomDataRef = useRef<any>(null);
  const userRef = useRef<any>(null);
  const animRef = useRef<any>(null);

  const isHost = roomData?.hostId === user?.uid;

  useEffect(() => { roomDataRef.current = roomData; }, [roomData]);
  useEffect(() => { userRef.current = user; }, [user]);

  // 1. 유저 인증
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        setUser(userDoc.exists() ? { ...currentUser, ...userDoc.data() } : currentUser);
      } else navigate('/login');
    });
    return () => unsub();
  }, [navigate]);

  // 2. 방 구독
  useEffect(() => {
    if (!user) return;
    if (roomId) {
      const roomRef = doc(db, 'pong_rooms', roomId);
      const unsubRoom = onSnapshot(roomRef, (docSnap) => {
        if (!docSnap.exists() || docSnap.data().status === 'destroyed') {
          toast.error('방이 파괴되었거나 종료되었습니다.');
          navigate('/pong-game');
          return;
        }
        setRoomData({ id: docSnap.id, ...docSnap.data() });
      });
      return () => unsubRoom();
    } else {
      const q = query(collection(db, 'pong_rooms'), where('status', '==', 'waiting'));
      const unsubscribe = onSnapshot(q, (snap) => {
        const rooms = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        rooms.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
        setActiveRooms(rooms);
      });
      return () => unsubscribe();
    }
  }, [roomId, user, navigate]);

  // 3. 카운트다운 및 서브 처리
  useEffect(() => {
    if (roomData?.status === 'countdown' && roomData?.startTime) {
      const interval = setInterval(() => {
        const remain = Math.ceil((roomData.startTime - Date.now()) / 1000);
        if (remain > 0) {
          setCountdown(remain);
        } else {
          setCountdown(0);
          clearInterval(interval);
          if (isHost) {
            const dirX = Math.random() > 0.5 ? 1 : -1;
            const dirY = (Math.random() - 0.5) * 1.5; 
            updateDoc(doc(db, 'pong_rooms', roomId!), { 
              status: 'playing',
              ball: { x: BOARD_W/2, y: BOARD_H/2, dx: dirX, dy: dirY, speed: BASE_SPEED, timestamp: Date.now(), lastHit: -1 },
              item: null, buffs: { 0: null, 1: null }
            });
          }
        }
      }, 100);
      return () => clearInterval(interval);
    } else {
      setCountdown(null);
    }
  }, [roomData?.status, roomData?.startTime, isHost, roomId]);

  // ==========================================
  // [로비 액션]
  // ==========================================
  const handleCreateRoom = async () => {
    const finalRoomName = newRoomName.trim() || `${user?.name}의 핑퐁 릴레이`;
    const newRoomId = `PONG_${Date.now()}`;
    await setDoc(doc(db, 'pong_rooms', newRoomId), {
      roomName: finalRoomName, hostId: user.uid, membersPerTeam,
      status: 'waiting', createdAt: Date.now(), players: {}, 
      activeTurns: { 0: 1, 1: 1 }, ball: null, item: null, buffs: { 0: null, 1: null }, startTime: null
    });
    navigate(`/pong-game?room=${newRoomId}`);
  };

  const handleJoinTeam = async (teamIndex: number) => {
    const roomRef = doc(db, 'pong_rooms', roomId!);
    try {
      await runTransaction(db, async (t) => {
        const snap = await t.get(roomRef);
        if (!snap.exists()) throw new Error("방이 없습니다.");
        const data = snap.data();
        const playersObj = data.players || {};
        
        const teamMembers = Object.values(playersObj).filter((p: any) => p.teamIndex === teamIndex);
        if (teamMembers.length >= data.membersPerTeam) throw new Error("인원이 꽉 찼습니다.");
        if (playersObj[user.uid]) throw new Error("이미 참가 중입니다.");

        t.update(roomRef, {
          [`players.${user.uid}`]: {
            id: user.uid, name: user.name, teamIndex, turnOrder: teamMembers.length + 1,
            y: BOARD_H / 2 - BASE_PADDLE_H / 2, isAlive: true,
          }
        });
      });
      // 🌟 내 패들 초기 위치 강제 동기화
      const startY = BOARD_H / 2 - BASE_PADDLE_H / 2;
      setVisualPaddleY(startY);
      visualPaddleYRef.current = startY;
    } catch (err: any) { toast.error(err.message); }
  };

  const handleLeaveRoom = async () => {
    if (!roomId) return;
    const roomRef = doc(db, 'pong_rooms', roomId);
    if (isHost) {
      if (window.confirm("방장이 나가면 방이 파괴됩니다.")) {
        await updateDoc(roomRef, { status: 'destroyed' });
        navigate('/pong-game');
      }
    } else {
      if (window.confirm("방에서 나가시겠습니까?")) {
        await updateDoc(roomRef, { [`players.${user.uid}`]: deleteField() });
        navigate('/pong-game');
      }
    }
  };

  const handleStartRound = async () => {
    await updateDoc(doc(db, 'pong_rooms', roomId!), { status: 'countdown', startTime: Date.now() + 3000 });
  };

  // ==========================================
  // [인력 제로 엔진] 1. 키보드 입력 감지
  // ==========================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w') { keysRef.current.up = true; e.preventDefault(); }
      if (e.key === 'ArrowDown' || e.key === 's') { keysRef.current.down = true; e.preventDefault(); }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w') keysRef.current.up = false;
      if (e.key === 'ArrowDown' || e.key === 's') keysRef.current.down = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // ==========================================
  // [인력 제로 엔진] 2. 클라이언트 렌더링 & 이동 루프 (60FPS)
  // ==========================================
  useEffect(() => {
    let lastTime = Date.now();
    const PADDLE_SPEED = 500; 

    const renderLoop = () => {
      const now = Date.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const currentRoom = roomDataRef.current;
      const currentUser = userRef.current;

      if (currentRoom && currentRoom.status === 'playing') {
        // 1. 공 부드럽게 렌더링 (서버 시간 기준 외삽)
        const ball = currentRoom.ball;
        if (ball) {
          const timeDiff = (now - ball.timestamp) / 1000;
          let bx = ball.x + ball.dx * ball.speed * timeDiff;
          let by = ball.y + ball.dy * ball.speed * timeDiff;
          if (by <= 0) by = 0;
          if (by >= BOARD_H - BALL_SIZE) by = BOARD_H - BALL_SIZE;
          setVisualBall({ x: bx, y: by });
        }

        // 2. 내 패들 부드럽게 이동
        const me = currentUser ? currentRoom.players[currentUser.uid] : null;
        if (me && me.isAlive && me.turnOrder === currentRoom.activeTurns[me.teamIndex]) {
          let dy = 0;
          if (keysRef.current.up) dy = -1;
          if (keysRef.current.down) dy = 1;

          if (dy !== 0) {
            setVisualPaddleY((prevY) => {
              const myBuff = currentRoom.buffs[me.teamIndex];
              const paddleH = myBuff?.type === 'LONG_PADDLE' ? BASE_PADDLE_H * 1.5 : BASE_PADDLE_H;
              let nextY = prevY + dy * PADDLE_SPEED * dt;
              if (nextY < 0) nextY = 0;
              if (nextY > BOARD_H - paddleH) nextY = BOARD_H - paddleH;
              
              visualPaddleYRef.current = nextY;
              return nextY;
            });
          }
        }
      }
      animRef.current = requestAnimationFrame(renderLoop);
    };

    animRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // ==========================================
  // [인력 제로 엔진] 3. 비동기 DB 동기화 (100ms 주기)
  // ==========================================
  useEffect(() => {
    const syncInterval = setInterval(() => {
      const currentRoom = roomDataRef.current;
      const currentUser = userRef.current;
      if (!currentRoom || currentRoom.status !== 'playing' || !currentUser) return;

      const me = currentRoom.players[currentUser.uid];
      if (me && me.isAlive && me.turnOrder === currentRoom.activeTurns[me.teamIndex]) {
        
        const currentVisualY = visualPaddleYRef.current;
        if (Math.abs(currentVisualY - myLastSyncedY.current) > 2) {
          myLastSyncedY.current = currentVisualY;
          updateDoc(doc(db, 'pong_rooms', currentRoom.id), {
            [`players.${currentUser.uid}.y`]: currentVisualY
          }).catch(console.error); 
        }
      }
    }, 100); 

    return () => clearInterval(syncInterval);
  }, []); 

  // 모바일 터치 처리 (조이스틱 역할)
  const handleTouchStart = (dir: number) => {
    if (dir === -1) keysRef.current.up = true;
    if (dir === 1) keysRef.current.down = true;
  };
  const handleTouchEnd = () => {
    keysRef.current.up = false;
    keysRef.current.down = false;
  };

  // ==========================================
  // [호스트 전용 물리 엔진] 🌟 점진적 시뮬레이션 적용 완료
  // ==========================================
  useEffect(() => {
    if (roomData?.status !== 'playing' || !isHost) {
      physicsStateRef.current = null; // 게임 상태가 아니면 물리 엔진 정지
      return;
    }

    // 🌟 서브(Serve) 직후 호스트 로컬 물리 상태 초기화
    if (!physicsStateRef.current && roomData.ball) {
      physicsStateRef.current = {
        x: roomData.ball.x,
        y: roomData.ball.y,
        dx: roomData.ball.dx,
        dy: roomData.ball.dy,
        speed: roomData.ball.speed,
        lastTick: Date.now() // 로컬 루프 타임스탬프 기준 시작
      };
    }

    const interval = setInterval(async () => {
      const room = roomDataRef.current;
      const phys = physicsStateRef.current;
      
      if (!room || room.status !== 'playing' || !phys) return;

      const now = Date.now();
      let dt = (now - phys.lastTick) / 1000;
      phys.lastTick = now;
      
      // 🌟 [핵심 방어] 탭 전환 등으로 랙이 걸렸을 때 dt 폭주 방지
      if (dt > 0.1) dt = 0.05;
      
      // 🌟 현재 위치에서부터 조금씩 이동 (프레임 기반 점진적 계산)
      phys.x += phys.dx * phys.speed * dt;
      phys.y += phys.dy * phys.speed * dt;

      let bx = phys.x;
      let by = phys.y;
      let newDx = phys.dx;
      let newDy = phys.dy;
      let newSpeed = phys.speed;
      let lastHit = room.ball?.lastHit ?? -1;
      let requiresSync = false;
      const updates: any = {};

      // 1. 상/하 벽면 바운드
      if (by <= 0) { by = 0; newDy = Math.abs(newDy); requiresSync = true; }
      else if (by >= BOARD_H - BALL_SIZE) { by = BOARD_H - BALL_SIZE; newDy = -Math.abs(newDy); requiresSync = true; }

      // 2. 패들 충돌 판정
      const activePlayers = Object.values(room.players).filter((p: any) => p.isAlive && p.turnOrder === room.activeTurns[p.teamIndex]);
      const leftPlayer: any = activePlayers.find((p: any) => p.teamIndex === 0);
      const rightPlayer: any = activePlayers.find((p: any) => p.teamIndex === 1);

      const checkPaddleCollision = (player: any, isLeft: boolean) => {
        if (!player) return false;
        const buff = room.buffs[player.teamIndex];
        const pHeight = buff?.type === 'LONG_PADDLE' ? BASE_PADDLE_H * 1.5 : BASE_PADDLE_H;
        
        // 관대한 X/Y 판정 (네트워크 오차 보정)
        const inX = isLeft ? bx <= PADDLE_W + 5 : bx >= BOARD_W - PADDLE_W - BALL_SIZE - 5;
        const inY = by + BALL_SIZE >= player.y - 15 && by <= player.y + pHeight + 15;
        return inX && inY;
      };

      if (leftPlayer && phys.dx < 0 && checkPaddleCollision(leftPlayer, true)) {
        bx = PADDLE_W; 
        newDx = Math.abs(newDx); 
        newDy = ((by + BALL_SIZE/2) - (leftPlayer.y + BASE_PADDLE_H/2)) / (BASE_PADDLE_H/2);
        newSpeed = room.buffs[0]?.type === 'FAST_BALL' ? BASE_SPEED * 1.5 : BASE_SPEED;
        lastHit = 0;
        requiresSync = true;
      } 
      else if (rightPlayer && phys.dx > 0 && checkPaddleCollision(rightPlayer, false)) {
        bx = BOARD_W - PADDLE_W - BALL_SIZE; 
        newDx = -Math.abs(newDx); 
        newDy = ((by + BALL_SIZE/2) - (rightPlayer.y + BASE_PADDLE_H/2)) / (BASE_PADDLE_H/2);
        newSpeed = room.buffs[1]?.type === 'FAST_BALL' ? BASE_SPEED * 1.5 : BASE_SPEED;
        lastHit = 1;
        requiresSync = true;
      }

      // 3. 아이템 획득 및 만료
      if (room.item) {
        const item = room.item;
        const hitItem = bx < item.x + 30 && bx + BALL_SIZE > item.x && by < item.y + 30 && by + BALL_SIZE > item.y;
        if (hitItem && lastHit !== -1) {
          updates.item = null;
          updates[`buffs.${lastHit}`] = { type: item.type, expiresAt: now + 8000 }; 
          requiresSync = true;
        }
      } else if (Math.random() < 0.01) {
        updates.item = { 
          x: BOARD_W/4 + Math.random() * (BOARD_W/2), y: Math.random() * (BOARD_H - 40), 
          type: Math.random() > 0.5 ? 'LONG_PADDLE' : 'FAST_BALL' 
        };
        requiresSync = true;
      }

      [0, 1].forEach(team => {
        if (room.buffs[team] && now > room.buffs[team].expiresAt) {
          updates[`buffs.${team}`] = null;
          requiresSync = true;
        }
      });

      // 4. 골인 (아웃 판정)
      if (bx < -30 || bx > BOARD_W + 30) { 
        const loserTeam = bx < 0 ? 0 : 1;
        const loser: any = activePlayers.find((p: any) => p.teamIndex === loserTeam);
        
        updates.status = 'round_end';
        if (loser) {
          updates[`players.${loser.id}.isAlive`] = false;
          const nextTurn = room.activeTurns[loserTeam] + 1;
          if (nextTurn > room.membersPerTeam) {
            updates.status = 'finished';
            updates.winnerTeam = loserTeam === 0 ? 1 : 0;
          } else {
            updates[`activeTurns.${loserTeam}`] = nextTurn;
          }
        }
        physicsStateRef.current = null; // 아웃 시 물리 엔진 초기화
        await updateDoc(doc(db, 'pong_rooms', room.id), updates);
        return;
      }

      // 5. 동기화
      if (requiresSync) {
        // 로컬 상태 동기화 업데이트
        phys.x = bx; phys.y = by; phys.dx = newDx; phys.dy = newDy; phys.speed = newSpeed;

        updates.ball = { x: bx, y: by, dx: newDx, dy: newDy, speed: newSpeed, timestamp: now, lastHit };
        await updateDoc(doc(db, 'pong_rooms', room.id), updates);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [roomData?.status, isHost]);


  if (!user) return null;

  // ==========================================
  // [화면 1] 메인 로비
  // ==========================================
  if (!roomId) {
    return (
      <div className="min-h-screen bg-slate-900 text-white p-6 md:p-12 font-sans flex flex-col items-center">
        <div className="w-full max-w-4xl">
          <header className="mb-8 bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <span className="text-4xl block mb-2">🏓🔥</span>
                <h1 className="text-3xl font-black">탁구 릴레이 (핑퐁)</h1>
                <p className="text-slate-400 font-bold mt-2">서버 동기화 최적화 완료! 아이템으로 상대를 제압하세요.</p>
              </div>
              
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-600 flex flex-col gap-4 w-full md:w-auto shadow-inner">
                <input type="text" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder="방 이름 입력" className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold outline-none text-sm" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-bold mb-1 ml-1">팀당 인원 (청팀 vs 홍팀)</span>
                  <select value={membersPerTeam} onChange={(e) => setMembersPerTeam(Number(e.target.value))} className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold text-sm">
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}명 vs {n}명</option>)}
                  </select>
                </div>
                <button onClick={handleCreateRoom} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black px-6 py-3 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2">
                  <span>🏁</span> 경기장 개설
                </button>
              </div>
            </div>
          </header>

          <main className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl min-h-[400px]">
            <h2 className="text-xl font-black mb-6 text-slate-300">대기 중인 경기</h2>
            {activeRooms.length === 0 ? (
              <p className="text-center py-10 text-slate-500 font-bold">생성된 경기장이 없습니다.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeRooms.map(room => (
                  <div key={room.id} onClick={() => navigate(`/pong-game?room=${room.id}`)} className="bg-slate-900 p-6 rounded-2xl border-2 border-slate-600 hover:border-emerald-500 cursor-pointer flex justify-between items-center">
                    <div>
                      <h3 className="font-black text-xl text-white mb-1 truncate">{room.roomName}</h3>
                      <p className="text-xs text-slate-400 font-bold">팀당 {room.membersPerTeam}명 릴레이</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    );
  }

  if (!roomData) {
    return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center font-bold text-xl">경기장 입장 중... ⏳</div>;
  }

  const playersArray = roomData?.players ? Object.values(roomData.players) : [];
  const me = roomData?.players?.[user.uid];

  // ==========================================
  // [화면 2] 인게임 플레이 (탁구대)
  // ==========================================
  if (roomData.status === 'playing' || roomData.status === 'round_end' || roomData.status === 'finished' || roomData.status === 'countdown') {
    const isMyTurn = me && me.turnOrder === roomData.activeTurns[me.teamIndex] && me.isAlive;
    
    const leftPlayer: any = playersArray.find((p: any) => p.teamIndex === 0 && p.turnOrder === roomData.activeTurns[0]);
    const rightPlayer: any = playersArray.find((p: any) => p.teamIndex === 1 && p.turnOrder === roomData.activeTurns[1]);

    const getPaddleHeight = (team: number) => roomData.buffs[team]?.type === 'LONG_PADDLE' ? BASE_PADDLE_H * 1.5 : BASE_PADDLE_H;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-950 select-none relative overflow-hidden">
        
        {roomData.status === 'countdown' && (
          <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="text-center">
              <span className="text-[150px] font-black text-white animate-ping block">{countdown === 0 ? 'SERVE!' : countdown}</span>
              <span className="text-2xl text-emerald-400 font-bold mt-4">키보드 방향키(또는 W,S)를 잡고 준비하세요!</span>
            </div>
          </div>
        )}

        {roomData.status === 'finished' && (
          <div className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
            <span className="text-6xl mb-4">🏆</span>
            <span className="text-5xl font-black text-yellow-400 mb-8">{TEAM_NAMES[roomData.winnerTeam]} 최종 승리!</span>
            <div className="flex gap-4">
              <button onClick={() => navigate('/pong-game')} className="px-6 py-3 bg-slate-700 font-bold rounded-xl text-white">나가기</button>
              {isHost && <button onClick={() => updateDoc(doc(db, 'pong_rooms', roomId), { status: 'waiting', players: {}, activeTurns: {0:1, 1:1} })} className="px-8 py-3 bg-emerald-600 font-black rounded-xl text-white">새 게임 시작</button>}
            </div>
          </div>
        )}

        {roomData.status === 'round_end' && (
          <div className="absolute inset-0 bg-black/70 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
            <span className="text-4xl font-black text-rose-500 mb-4 animate-pulse">🚨 주자 아웃! 바통 터치!</span>
            <span className="text-xl text-white font-bold">다음 선수를 준비시켜 주세요.</span>
            {isHost && <button onClick={handleStartRound} className="px-8 py-3 bg-indigo-600 rounded-xl font-bold text-white shadow-lg animate-bounce mt-8">다음 매치 준비 ➡</button>}
          </div>
        )}

        <div className="w-full max-w-[800px] flex justify-between items-end mb-4 px-2 z-10">
          <div>
            <span className="text-xl font-black text-emerald-400 block">탁구 릴레이</span>
            <span className="text-sm font-bold text-slate-400 mt-1 block">
              {me ? `나의 순번: ${me.turnOrder}번 주자` : '관전 모드'}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm font-bold text-slate-400">
            <span>청팀 {roomData.activeTurns[0]}/{roomData.membersPerTeam}주자</span>
            <span>|</span>
            <span>홍팀 {roomData.activeTurns[1]}/{roomData.membersPerTeam}주자</span>
          </div>
        </div>

        <div 
          className="relative bg-slate-800 rounded-lg border-4 border-slate-600 shadow-2xl overflow-hidden z-10"
          style={{ width: BOARD_W, height: BOARD_H }}
        >
          <div className="absolute top-0 bottom-0 left-1/2 w-1 -ml-[0.5px] border-l-4 border-dashed border-slate-700"></div>

          {leftPlayer && (
            <div 
              className={`absolute left-0 bg-blue-500 rounded-r-md shadow-[0_0_15px_rgba(59,130,246,0.5)] ${roomData.buffs[0]?.type === 'FAST_BALL' ? 'animate-pulse' : ''}`}
              style={{ top: leftPlayer.id === user?.uid ? visualPaddleY : leftPlayer.y, width: PADDLE_W, height: getPaddleHeight(0) }}
            >
              <span className="absolute -right-20 top-1/2 -translate-y-1/2 text-slate-500 font-black opacity-50">{leftPlayer.name}</span>
            </div>
          )}

          {rightPlayer && (
            <div 
              className={`absolute right-0 bg-rose-500 rounded-l-md shadow-[0_0_15px_rgba(244,63,94,0.5)] ${roomData.buffs[1]?.type === 'FAST_BALL' ? 'animate-pulse' : ''}`}
              style={{ top: rightPlayer.id === user?.uid ? visualPaddleY : rightPlayer.y, width: PADDLE_W, height: getPaddleHeight(1) }}
            >
              <span className="absolute -left-20 top-1/2 -translate-y-1/2 text-slate-500 font-black opacity-50 text-right w-16">{rightPlayer.name}</span>
            </div>
          )}

          {roomData.item && (
            <div 
              className="absolute animate-bounce flex items-center justify-center rounded-lg shadow-lg text-2xl"
              style={{ left: roomData.item.x, top: roomData.item.y, width: 30, height: 30, backgroundColor: roomData.item.type === 'LONG_PADDLE' ? '#10b981' : '#f59e0b' }}
            >
              {roomData.item.type === 'LONG_PADDLE' ? '📏' : '⚡'}
            </div>
          )}

          {(roomData.status === 'playing' || roomData.status === 'countdown') && (
            <div 
              className="absolute bg-white rounded-full shadow-[0_0_10px_white]"
              style={{ left: visualBall.x, top: visualBall.y, width: BALL_SIZE, height: BALL_SIZE }}
            />
          )}
        </div>

        {/* 🌟 touch-none 추가로 모바일 스크롤 및 줌 방어 */}
        {isMyTurn && (
          <div className="mt-8 flex gap-8 w-full max-w-[800px] justify-center z-10 touch-none">
            <button 
              onPointerDown={() => handleTouchStart(-1)}
              onPointerUp={handleTouchEnd}
              onPointerLeave={handleTouchEnd}
              className="w-32 h-20 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white font-black text-3xl rounded-2xl shadow-lg flex items-center justify-center transition-colors"
            >
              ▲
            </button>
            <button 
              onPointerDown={() => handleTouchStart(1)}
              onPointerUp={handleTouchEnd}
              onPointerLeave={handleTouchEnd}
              className="w-32 h-20 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white font-black text-3xl rounded-2xl shadow-lg flex items-center justify-center transition-colors"
            >
              ▼
            </button>
          </div>
        )}
        <p className="mt-4 text-slate-500 font-bold text-sm z-10">방향키를 꾹 누르고 있으면 부드럽게 연속으로 움직입니다.</p>
      </div>
    );
  }

  // ==========================================
  // [화면 3] 팀 선택 대기실
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 md:p-12 font-sans flex flex-col items-center">
      <div className="w-full max-w-4xl">
        <header className="mb-8 bg-slate-800 p-6 rounded-3xl border border-slate-700 shadow-xl flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black">{roomData.roomName}</h1>
            <p className="text-emerald-400 font-bold mt-2">상대 팀 주자를 모두 탈락시키세요!</p>
          </div>
          <button onClick={handleLeaveRoom} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold text-sm">방 나가기</button>
        </header>

        <main className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl">
          <h2 className="text-xl font-black mb-6 text-slate-300">🚩 진영 선택 및 엔트리</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            {Array.from({ length: 2 }).map((_, teamIdx) => {
              const teamMembers = playersArray.filter((p: any) => p.teamIndex === teamIdx);
              teamMembers.sort((a: any, b: any) => a.turnOrder - b.turnOrder);

              return (
                <div key={teamIdx} className={`p-6 rounded-3xl border-4 ${teamIdx===0?'border-blue-900/50 bg-blue-950/20':'border-rose-900/50 bg-rose-950/20'} flex flex-col`}>
                  <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                    <h3 className={`font-black text-2xl ${TEAM_COLORS[teamIdx].replace('bg-', 'text-')}`}>{TEAM_NAMES[teamIdx]}</h3>
                    <span className="text-sm font-bold text-slate-400">{teamMembers.length} / {roomData.membersPerTeam} 명</span>
                  </div>
                  
                  <div className="flex-1 space-y-3 mb-6">
                    {Array.from({ length: roomData.membersPerTeam }).map((_, slotIdx) => {
                      const member: any = teamMembers[slotIdx]; 
                      return (
                        <div key={slotIdx} className={`px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-4 ${member ? 'bg-slate-800 text-white shadow-md' : 'border-2 border-dashed border-slate-700 text-slate-500'}`}>
                          <span className="bg-slate-950 text-slate-400 w-8 h-8 flex items-center justify-center rounded-full text-xs border border-slate-700">{slotIdx + 1}</span>
                          {member ? member.name : '대기 중...'}
                          {member?.id === user.uid && <span className="ml-auto text-[10px] bg-emerald-600 px-3 py-1 rounded-md text-white shadow-sm">내 캐릭터</span>}
                        </div>
                      )
                    })}
                  </div>

                  {!me && (
                    <button 
                      onClick={() => handleJoinTeam(teamIdx)}
                      disabled={teamMembers.length >= roomData.membersPerTeam}
                      className={`w-full py-4 disabled:opacity-50 text-white font-black rounded-xl transition-all shadow-md active:scale-95 text-lg ${TEAM_COLORS[teamIdx]} hover:opacity-80`}
                    >
                      {teamMembers.length >= roomData.membersPerTeam ? '인원 마감' : '이 진영으로 합류하기'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-center border-t border-slate-700 pt-8">
            {isHost ? (
              <button onClick={handleStartRound} className="px-16 py-5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black rounded-2xl shadow-xl transition-all active:scale-95 text-xl flex items-center gap-3">
                <span>🏁</span> 첫 번째 매치 준비 (서브)
              </button>
            ) : (
              <div className="px-12 py-4 bg-slate-900 text-slate-400 font-black rounded-2xl border border-slate-700 flex items-center gap-2">
                <span className="animate-spin">⏳</span> 방장의 게임 시작을 기다리는 중...
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}