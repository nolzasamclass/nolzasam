// src/pages/SnailGame.tsx
import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  collection, doc, onSnapshot, setDoc, updateDoc, 
  query, where, getDoc, runTransaction, deleteField 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import toast from 'react-hot-toast';

// 🐌 사각 달팽이 트랙 맵 (1: 벽/잔디, 0: 통로, 2: 출발/도착 베이스캠프)
const SNAIL_TRACK = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 2, 1, 0, 1, 0, 1, 0, 1], // 중앙 [7][7] 홍팀(1팀) 베이스
  [1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 좌측 하단 [14][1] 청팀(0팀) 베이스
];

// 🌟 유령 통과 방지 & 역주행 금지를 위한 1차원 경로 매핑 배열 (총 92칸)
const PATH = [
  {x:1, y:14}, {x:1, y:13}, {x:1, y:12}, {x:1, y:11}, {x:1, y:10}, {x:1, y:9}, {x:1, y:8}, {x:1, y:7}, {x:1, y:6}, {x:1, y:5}, {x:1, y:4}, {x:1, y:3}, {x:1, y:2}, {x:1, y:1},
  {x:2, y:1}, {x:3, y:1}, {x:4, y:1}, {x:5, y:1}, {x:6, y:1}, {x:7, y:1}, {x:8, y:1}, {x:9, y:1}, {x:10, y:1}, {x:11, y:1}, {x:12, y:1}, {x:13, y:1},
  {x:13, y:2}, {x:13, y:3}, {x:13, y:4}, {x:13, y:5}, {x:13, y:6}, {x:13, y:7}, {x:13, y:8}, {x:13, y:9}, {x:13, y:10}, {x:13, y:11}, {x:13, y:12},
  {x:12, y:12}, {x:11, y:12}, {x:10, y:12}, {x:9, y:12}, {x:8, y:12}, {x:7, y:12}, {x:6, y:12}, {x:5, y:12}, {x:4, y:12}, {x:3, y:12},
  {x:3, y:11}, {x:3, y:10}, {x:3, y:9}, {x:3, y:8}, {x:3, y:7}, {x:3, y:6}, {x:3, y:5}, {x:3, y:4}, {x:3, y:3},
  {x:4, y:3}, {x:5, y:3}, {x:6, y:3}, {x:7, y:3}, {x:8, y:3}, {x:9, y:3}, {x:10, y:3}, {x:11, y:3},
  {x:11, y:4}, {x:11, y:5}, {x:11, y:6}, {x:11, y:7}, {x:11, y:8}, {x:11, y:9}, {x:11, y:10},
  {x:10, y:10}, {x:9, y:10}, {x:8, y:10}, {x:7, y:10}, {x:6, y:10}, {x:5, y:10},
  {x:5, y:9}, {x:5, y:8}, {x:5, y:7}, {x:5, y:6}, {x:5, y:5},
  {x:6, y:5}, {x:7, y:5}, {x:8, y:5}, {x:9, y:5},
  {x:9, y:6}, {x:9, y:7}, {x:9, y:8},
  {x:8, y:8}, {x:7, y:8},
  {x:7, y:7}
];

const TEAM_COLORS = ['bg-blue-500', 'bg-rose-500'];
const TEAM_NAMES = ['청팀 (바깥쪽)', '홍팀 (안쪽)'];

export default function SnailGame() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('room');

  const [user, setUser] = useState<any>(null);
  const [roomData, setRoomData] = useState<any>(null);
  const [activeRooms, setActiveRooms] = useState<any[]>([]);
  
  const [newRoomName, setNewRoomName] = useState('');
  const [membersPerTeam, setMembersPerTeam] = useState(5); 
  const [countdown, setCountdown] = useState<number | null>(null);
  
  const isMovingRef = useRef(false);
  const roomDataRef = useRef<any>(null);
  const userRef = useRef<any>(null);

  // 🌟 컴포넌트 최상단에서 단 한 번만 선언하여 중복 선언(Redeclaration) 에러 완벽 해결!
  const isHost = roomData?.hostId === user?.uid;
  const playersArray = roomData?.players ? Object.values(roomData.players) : [];
  const me = roomData?.players?.[user?.uid];

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
      const roomRef = doc(db, 'snail_rooms', roomId);
      const unsubRoom = onSnapshot(roomRef, (docSnap) => {
        if (!docSnap.exists() || docSnap.data().status === 'destroyed') {
          toast.error('방이 파괴되었거나 종료되었습니다.');
          navigate('/snail-game');
          return;
        }
        setRoomData({ id: docSnap.id, ...docSnap.data() });
      });
      return () => unsubRoom();
    } else {
      const q = query(collection(db, 'snail_rooms'), where('status', '==', 'waiting'));
      const unsubscribe = onSnapshot(q, (snap) => {
        const rooms = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        rooms.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
        setActiveRooms(rooms);
      });
      return () => unsubscribe();
    }
  }, [roomId, user, navigate]);

  // 3. 카운트다운 처리
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
            updateDoc(doc(db, 'snail_rooms', roomId!), { status: 'playing' });
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
    const finalRoomName = newRoomName.trim() || `${user?.name}의 달팽이 진놀이`;
    const newRoomId = `SNAIL_${Date.now()}`;
    
    await setDoc(doc(db, 'snail_rooms', newRoomId), {
      roomName: finalRoomName,
      hostId: user.uid,
      membersPerTeam,
      status: 'waiting',
      round: 1,
      teamScores: { 0: 0, 1: 0 },
      createdAt: Date.now(),
      players: {}, 
      activeTurns: { 0: 1, 1: 1 },
      startTime: null,
      rpsState: null 
    });
    navigate(`/snail-game?room=${newRoomId}`);
  };

  const handleJoinTeam = async (teamIndex: number) => {
    const roomRef = doc(db, 'snail_rooms', roomId!);
    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) throw new Error("방이 없습니다.");
        
        const data = snap.data();
        const playersObj = data.players || {};
        
        const teamMembers = Object.values(playersObj).filter((p: any) => p.teamIndex === teamIndex);
        if (teamMembers.length >= data.membersPerTeam) throw new Error("해당 팀은 인원이 꽉 찼습니다.");
        if (playersObj[user.uid]) throw new Error("이미 참가 중입니다.");

        const turnOrder = teamMembers.length + 1;
        const spawnIndex = teamIndex === 0 ? 0 : PATH.length - 1; 

        transaction.update(roomRef, {
          [`players.${user.uid}`]: {
            id: user.uid, name: user.name, teamIndex, turnOrder,
            posIndex: spawnIndex, 
            isAlive: true,
          }
        });
      });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleStartRound = async () => {
    const updates: any = {
      status: 'countdown',
      startTime: Date.now() + 3000,
      activeTurns: { 0: 1, 1: 1 },
      rpsState: null
    };

    Object.values(roomData.players).forEach((p: any) => {
      updates[`players.${p.id}.posIndex`] = p.teamIndex === 0 ? 0 : PATH.length - 1;
      updates[`players.${p.id}.isAlive`] = true;
    });

    await updateDoc(doc(db, 'snail_rooms', roomId!), updates);
  };

  const handleLeaveRoom = async () => {
    if (!roomId) return;
    const roomRef = doc(db, 'snail_rooms', roomId);
    if (isHost) {
      if (window.confirm("방장이 나가면 방이 파괴됩니다.")) {
        await updateDoc(roomRef, { status: 'destroyed' });
        navigate('/snail-game');
      }
    } else {
      if (window.confirm("방에서 나가시겠습니까?")) {
        await updateDoc(roomRef, { [`players.${user.uid}`]: deleteField() });
        navigate('/snail-game');
      }
    }
  };

  // ==========================================
  // [인게임 액션] 🌟 완벽한 충돌 감지 이동 로직
  // ==========================================
  const moveForward = useCallback(async () => {
    if (isMovingRef.current) return;
    isMovingRef.current = true;
    setTimeout(() => { isMovingRef.current = false; }, 150);

    const currentRoom = roomDataRef.current;
    const currentUser = userRef.current;
    if (!currentRoom || currentRoom.status !== 'playing' || !currentUser) return;
    
    const myPlayer = currentRoom.players[currentUser.uid];
    if (!myPlayer || !myPlayer.isAlive || myPlayer.turnOrder !== currentRoom.activeTurns[myPlayer.teamIndex]) return;

    const myTeam = myPlayer.teamIndex;
    const dir = myTeam === 0 ? 1 : -1; 
    const nextPosIndex = myPlayer.posIndex + dir;

    if (nextPosIndex < 0 || nextPosIndex >= PATH.length) return;

    try {
      await runTransaction(db, async (t) => {
        const roomRef = doc(db, 'snail_rooms', currentRoom.id);
        const snap = await t.get(roomRef);
        const data = snap.data();
        if (data?.status !== 'playing') return;

        const enemyTeam = myTeam === 0 ? 1 : 0;
        const enemyTurn = data.activeTurns[enemyTeam];
        const enemy = Object.values(data.players).find((p: any) => p.teamIndex === enemyTeam && p.turnOrder === enemyTurn && p.isAlive) as any;

        let isCollision = false;
        if (enemy) {
          if ((myTeam === 0 && nextPosIndex >= enemy.posIndex) || 
              (myTeam === 1 && nextPosIndex <= enemy.posIndex)) {
            isCollision = true;
          }
        }

        const updates: any = {};

        if (isCollision) {
          updates.status = 'rps';
          updates.rpsState = {
            invaderId: currentUser.uid,
            defenderId: enemy.id,
            invaderChoice: null,
            defenderChoice: null
          };
          updates[`players.${currentUser.uid}.posIndex`] = myTeam === 0 ? enemy.posIndex - 1 : enemy.posIndex + 1;
        } else {
          const isEnemyBase = myTeam === 0 ? (nextPosIndex >= PATH.length - 1) : (nextPosIndex <= 0);
          
          if (isEnemyBase) {
            updates.status = 'round_end';
            updates[`teamScores.${myTeam}`] = data.teamScores[myTeam] + 1;
            updates.round = data.round + 1;
            if (updates[`teamScores.${myTeam}`] >= 2) updates.status = 'finished';
          } else {
            updates[`players.${currentUser.uid}.posIndex`] = nextPosIndex;
          }
        }
        t.update(roomRef, updates);
      });
    } catch (err) { console.error("이동 트랜잭션 오류", err); }
  }, []);

  // 🌟 키보드 이벤트 리스너: 방향키 + 스페이스바 모두 완벽 허용!
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar'].includes(e.key)) {
        e.preventDefault();
        moveForward();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveForward]);

  // ==========================================
  // [가위바위보 트랜잭션 판정]
  // ==========================================
  useEffect(() => {
    const evaluateRPS = async () => {
      if (!isHost || roomData?.status !== 'rps' || !roomData.rpsState) return;
      
      const { invaderId, defenderId, invaderChoice, defenderChoice } = roomData.rpsState;
      if (!invaderChoice || !defenderChoice) return; 

      const p1 = roomData.players[invaderId];
      const p2 = roomData.players[defenderId];
      if (!p1 || !p2) return; // 방어 로직 추가
      
      const winMap: Record<string, string> = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
      const updates: any = {};

      if (invaderChoice === defenderChoice) {
        toast('무승부! 다시 내세요!', { icon: '🔄' });
        updates['rpsState.invaderChoice'] = null;
        updates['rpsState.defenderChoice'] = null;
      } else {
        const invaderWins = winMap[invaderChoice] === defenderChoice;
        const winner = invaderWins ? p1 : p2;
        const loser = invaderWins ? p2 : p1;

        toast(`${winner.name} 가위바위보 승리!`, { icon: '🎉' });

        updates[`players.${loser.id}.isAlive`] = false;
        
        const nextTurn = roomData.activeTurns[loser.teamIndex] + 1;
        if (nextTurn > roomData.membersPerTeam) {
          const newScore = roomData.teamScores[winner.teamIndex] + 1;
          updates[`teamScores.${winner.teamIndex}`] = newScore;
          updates.round = roomData.round + 1;
          updates.status = newScore >= 2 ? 'finished' : 'round_end';
        } else {
          updates[`activeTurns.${loser.teamIndex}`] = nextTurn;
          updates.status = 'playing';
          updates.rpsState = null;
        }
      }
      await updateDoc(doc(db, 'snail_rooms', roomId!), updates);
    };

    evaluateRPS();
  }, [roomData?.rpsState, isHost, roomId]);

  const submitRPS = async (choice: string) => {
    if (!roomData?.rpsState) return;
    const isInvader = roomData.rpsState.invaderId === user.uid;
    const isDefender = roomData.rpsState.defenderId === user.uid;
    
    if (isInvader) {
      await updateDoc(doc(db, 'snail_rooms', roomId!), { 'rpsState.invaderChoice': choice });
    } else if (isDefender) {
      await updateDoc(doc(db, 'snail_rooms', roomId!), { 'rpsState.defenderChoice': choice });
    }
  };

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
                <span className="text-4xl block mb-2">🐌🎌</span>
                <h1 className="text-3xl font-black">달팽이 진놀이 (3판 2승제)</h1>
                <p className="text-slate-400 font-bold mt-2">상대 진영에 먼저 도달하여 승리하세요!</p>
              </div>
              
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-600 flex flex-col gap-4 w-full md:w-auto shadow-inner">
                <input type="text" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder="방 이름 입력" className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold outline-none text-sm" />
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-bold mb-1 ml-1">팀당 인원 (청팀 vs 홍팀)</span>
                  <select value={membersPerTeam} onChange={(e) => setMembersPerTeam(Number(e.target.value))} className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold text-sm">
                    {[3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}명 vs {n}명</option>)}
                  </select>
                </div>
                <button onClick={handleCreateRoom} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black px-6 py-3 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2">
                  <span>🏁</span> 게임 개설하기
                </button>
              </div>
            </div>
          </header>

          <main className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl min-h-[400px]">
            <h2 className="text-xl font-black mb-6 text-slate-300">대기 중인 게임</h2>
            {activeRooms.length === 0 ? (
              <p className="text-center py-10 text-slate-500 font-bold">생성된 게임 방이 없습니다.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeRooms.map(room => (
                  <div key={room.id} onClick={() => navigate(`/snail-game?room=${room.id}`)} className="bg-slate-900 p-6 rounded-2xl border-2 border-slate-600 hover:border-emerald-500 cursor-pointer flex justify-between items-center">
                    <div>
                      <h3 className="font-black text-xl text-white mb-1 truncate">{room.roomName}</h3>
                      <p className="text-xs text-slate-400 font-bold">팀당 {room.membersPerTeam}명 대결</p>
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

  // 🌟 여기서부터는 roomId가 존재하는 방 내부 로직
  // 데이터 로딩 중 에러(White Screen) 방지용 최강 방어막!
  if (!roomData) return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center font-bold text-xl">진영 데이터 불러오는 중... ⏳</div>;

  // ==========================================
  // [화면 4] 최종 결과 화면
  // ==========================================
  if (roomData.status === 'finished') {
    const winnerIdx = roomData.teamScores[0] === 2 ? 0 : 1;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-950 text-white">
        <div className="w-full max-w-2xl bg-slate-800 rounded-3xl border-4 border-slate-600 shadow-2xl p-8 md:p-12 text-center animate-in zoom-in duration-500">
          <div className="text-6xl mb-6">🏆</div>
          <h1 className="text-4xl font-black text-yellow-400 mb-2">최종 승리!</h1>
          <h2 className={`text-5xl font-black mb-10 ${TEAM_COLORS[winnerIdx].replace('bg-', 'text-')}`}>{TEAM_NAMES[winnerIdx]}</h2>
          
          <div className="flex justify-center gap-12 mb-10">
            <div className="text-center">
              <span className="text-slate-400 font-bold block mb-2">{TEAM_NAMES[0]}</span>
              <span className="text-4xl font-black text-blue-500">{roomData.teamScores[0]}</span>
            </div>
            <div className="text-4xl font-black text-slate-600 pt-6">:</div>
            <div className="text-center">
              <span className="text-slate-400 font-bold block mb-2">{TEAM_NAMES[1]}</span>
              <span className="text-4xl font-black text-rose-500">{roomData.teamScores[1]}</span>
            </div>
          </div>

          <div className="flex justify-center gap-4">
            <button onClick={() => navigate('/snail-game')} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 font-bold rounded-xl transition-colors">로비로 나가기</button>
            {isHost && (
              <button onClick={() => updateDoc(doc(db, 'snail_rooms', roomId), { status: 'waiting', teamScores: {0:0, 1:0}, round: 1, activeTurns: {0:1, 1:1} })} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 font-black rounded-xl shadow-lg transition-colors">
                🔄 새 게임 시작
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // [화면 2] 인게임 (가위바위보 모달 포함)
  // ==========================================
  if (roomData.status === 'countdown' || roomData.status === 'playing' || roomData.status === 'rps' || roomData.status === 'round_end') {
    const isMyTurn = me && me.turnOrder === roomData.activeTurns?.[me.teamIndex] && me.isAlive;
    const isRPSActive = roomData.status === 'rps';
    const amIInRPS = isRPSActive && (roomData.rpsState?.invaderId === user.uid || roomData.rpsState?.defenderId === user.uid);

    return (
      <div className="min-h-screen flex flex-col items-center p-4 select-none bg-slate-950">
        
        {/* 🌟 3초 카운트다운 */}
        {roomData.status === 'countdown' && (
          <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-sm">
            <span className="text-[150px] font-black text-white animate-ping">{countdown === 0 ? 'GO!' : countdown}</span>
          </div>
        )}

        {/* 🌟 라운드 종료 연출 */}
        {roomData.status === 'round_end' && (
          <div className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
            <span className="text-6xl font-black text-yellow-400 mb-4">ROUND {roomData.round} 종료!</span>
            <div className="flex gap-8 text-3xl font-black text-white mb-8">
              <span className="text-blue-500">청팀 {roomData.teamScores?.[0] || 0}</span>
              <span>:</span>
              <span className="text-rose-500">홍팀 {roomData.teamScores?.[1] || 0}</span>
            </div>
            {isHost && <button onClick={handleStartRound} className="px-8 py-3 bg-emerald-600 rounded-xl font-bold text-lg">다음 라운드 준비 ➡</button>}
            {!isHost && <span className="text-slate-400 font-bold">방장의 진행을 기다립니다...</span>}
          </div>
        )}

        {/* 🌟 가위바위보 모달 창 */}
        {isRPSActive && (
          <div className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
            <h2 className={`text-6xl font-black mb-12 text-yellow-400 animate-pulse`}>
              ⚔️ 가위 바위 보! ⚔️
            </h2>
            
            {amIInRPS ? (
              <div className="flex gap-6">
                <button onClick={() => submitRPS('scissors')} className="text-8xl hover:scale-110 hover:-translate-y-4 transition-all">✌️</button>
                <button onClick={() => submitRPS('rock')} className="text-8xl hover:scale-110 hover:-translate-y-4 transition-all">✊</button>
                <button onClick={() => submitRPS('paper')} className="text-8xl hover:scale-110 hover:-translate-y-4 transition-all">🖐️</button>
              </div>
            ) : (
              <p className="text-2xl font-bold text-slate-300">동료가 전투 중입니다... 🙏</p>
            )}
            {amIInRPS && <p className="mt-8 text-slate-300 font-bold text-xl">상대방의 선택을 기다리는 중...</p>}
          </div>
        )}

        <div className="w-full max-w-[700px] flex justify-between items-end mb-4 px-2 pt-4">
          <div>
            <span className="text-xl font-black text-emerald-400 block">달팽이 진놀이 - ROUND {roomData.round}</span>
            <span className="text-sm font-bold text-slate-400 mt-1 block">
              {me ? `${TEAM_NAMES[me.teamIndex]} - 나의 순번: ${me.turnOrder}번 주자` : '관전 모드'}
            </span>
          </div>
          <div className="flex items-center gap-4 bg-slate-800 px-6 py-2 rounded-xl border border-slate-700">
            <span className="text-blue-500 font-black text-xl">{roomData.teamScores?.[0] || 0}</span>
            <span className="text-slate-500 font-black">VS</span>
            <span className="text-rose-500 font-black text-xl">{roomData.teamScores?.[1] || 0}</span>
          </div>
          <button onClick={handleLeaveRoom} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-bold transition-colors">기권</button>
        </div>

        <div className={`w-full max-w-[700px] bg-slate-800 p-3 md:p-6 rounded-2xl border-4 relative overflow-hidden transition-colors duration-300 ${isMyTurn ? TEAM_COLORS[me?.teamIndex].replace('bg-', 'border-') : 'border-slate-600'}`}>
          <div className="grid gap-[2px] md:gap-1 bg-yellow-950/30" style={{ gridTemplateColumns: `repeat(${SNAIL_TRACK[0].length}, minmax(0, 1fr))` }}>
            {SNAIL_TRACK.map((row: number[], y: number) => 
              row.map((cell: number, x: number) => {
                
                const occupants = playersArray.filter((p: any) => {
                  if (p.posIndex === undefined || !p.isAlive || p.turnOrder !== roomData.activeTurns?.[p.teamIndex]) return false;
                  const pos = PATH[p.posIndex];
                  return pos && pos.x === x && pos.y === y;
                });
                
                const isTeam0Base = cell === 2 && x === 1 && y === 14;
                const isTeam1Base = cell === 2 && x === 7 && y === 7;

                return (
                  <div key={`${x}-${y}`} className={`w-5 h-5 sm:w-8 sm:h-8 md:w-10 md:h-10 flex items-center justify-center rounded-sm relative
                      ${cell === 1 ? 'bg-amber-900/40 shadow-inner' : 
                        isTeam0Base ? 'bg-blue-500/30 border border-blue-500' : 
                        isTeam1Base ? 'bg-rose-500/30 border border-rose-500' : 
                        'bg-slate-800'}
                    `}>
                    
                    {isTeam0Base && <span className="absolute text-[8px] text-blue-300 font-black">청 Base</span>}
                    {isTeam1Base && <span className="absolute text-[8px] text-rose-300 font-black">홍 Base</span>}

                    {occupants.map((o: any, idx: number) => (
                      <div key={o.id} className={`w-3 h-3 md:w-5 md:h-5 rounded-full absolute ${TEAM_COLORS[o.teamIndex]} border-2 border-white shadow-md z-10 transition-transform animate-pulse`} style={{ transform: `translate(${idx * 4 - 4}px, ${idx * 4 - 4}px)` }}>
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 🌟 모바일 및 터치 대응 & 마우스 대체 전진 버튼 */}
        {isMyTurn && roomData.status === 'playing' && (
          <div className="mt-8 w-full max-w-[700px] flex justify-center pb-10">
            <button 
              onClick={moveForward} 
              className={`w-full max-w-sm py-6 text-white font-black text-2xl rounded-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 ${TEAM_COLORS[me.teamIndex]} hover:brightness-110`}
            >
              <span>🏃‍♂️</span> 앞으로 전진! (방향키 또는 스페이스바)
            </button>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // [화면 3] 팀 선택 대기실 (로비)
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 md:p-12 font-sans flex flex-col items-center">
      <div className="w-full max-w-4xl">
        <header className="mb-8 bg-slate-800 p-6 rounded-3xl border border-slate-700 shadow-xl flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black">{roomData.roomName}</h1>
            <p className="text-emerald-400 font-bold mt-2">목표: 3판 2승제! 먼저 상대 베이스를 점령하세요.</p>
          </div>
          <button onClick={handleLeaveRoom} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold text-sm">
            방 나가기
          </button>
        </header>

        <main className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl">
          <h2 className="text-xl font-black mb-6 text-slate-300">🚩 진영 선택 및 엔트리</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {Array.from({ length: 2 }).map((_, teamIdx) => {
              const teamMembers = playersArray.filter((p: any) => p.teamIndex === teamIdx);
              teamMembers.sort((a: any, b: any) => a.turnOrder - b.turnOrder);

              return (
                <div key={teamIdx} className={`p-5 rounded-2xl border-2 border-slate-600 bg-slate-900 flex flex-col`}>
                  <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-3">
                    <h3 className={`font-black text-lg ${TEAM_COLORS[teamIdx].replace('bg-', 'text-')}`}>{TEAM_NAMES[teamIdx]}</h3>
                    <span className="text-xs font-bold text-slate-400">{teamMembers.length} / {roomData.membersPerTeam}</span>
                  </div>
                  
                  <div className="flex-1 space-y-2 mb-4">
                    {Array.from({ length: roomData.membersPerTeam }).map((_, slotIdx) => {
                      const member: any = teamMembers[slotIdx]; 
                      return (
                        <div key={slotIdx} className={`px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-3 ${member ? 'bg-slate-800 text-white' : 'border border-dashed border-slate-700 text-slate-600'}`}>
                          <span className="bg-slate-950 text-slate-500 w-6 h-6 flex items-center justify-center rounded-full text-[10px]">{slotIdx + 1}</span>
                          {member ? member.name : '대기 중...'}
                          {member?.id === user.uid && <span className="ml-auto text-[10px] bg-emerald-600 px-2 rounded">나</span>}
                        </div>
                      )
                    })}
                  </div>

                  {!me && (
                    <button 
                      onClick={() => handleJoinTeam(teamIdx)}
                      disabled={teamMembers.length >= roomData.membersPerTeam}
                      className="mt-auto w-full py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white font-black rounded-xl transition-colors"
                    >
                      {teamMembers.length >= roomData.membersPerTeam ? '마감됨' : '이 팀으로 참가'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex justify-center gap-4 border-t border-slate-700 pt-8">
            {isHost ? (
              <button onClick={handleStartRound} className="px-12 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 text-lg flex items-center gap-2">
                <span>🏁</span> 달리기 시작!
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

