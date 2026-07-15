// src/pages/RelayGame.tsx
import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  collection, doc, onSnapshot, setDoc, updateDoc, 
  query, where, getDoc, runTransaction, deleteField
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import toast from 'react-hot-toast';

// 🐌 사각 달팽이 트랙 맵 (1: 잔디/벽, 0: 달리는 트랙, 2: 시작/도착/바통터치 존)
const SNAIL_TRACK = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 2, 1, 0, 1, 0, 1, 0, 1], // 중앙 [7][7] 도착/바통존
  [1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // 좌측 하단 [14][1] 출발점
];

const TEAM_COLORS = ['bg-rose-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500'];
const TEAM_NAMES = ['레드팀', '블루팀', '그린팀', '옐로우팀', '퍼플팀'];

export default function RelayGame() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomId = searchParams.get('room');

  const [user, setUser] = useState<any>(null);
  const [roomData, setRoomData] = useState<any>(null);
  const [activeRooms, setActiveRooms] = useState<any[]>([]);
  
  const [newRoomName, setNewRoomName] = useState('');
  const [teamCount, setTeamCount] = useState(2); 
  const [membersPerTeam, setMembersPerTeam] = useState(5); 
  
  const [countdown, setCountdown] = useState<number | null>(null);
  
  // 🌟 조작 최적화를 위한 Ref
  const isMovingRef = useRef(false);
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
      } else navigate('/login');
    });
    return () => unsub();
  }, [navigate]);

  // 2. 방 구독 (단일 문서 구독으로 비용 최소화)
  useEffect(() => {
    if (!user) return;
    if (roomId) {
      const roomRef = doc(db, 'relay_rooms', roomId);
      const unsubRoom = onSnapshot(roomRef, (docSnap) => {
        if (!docSnap.exists() || docSnap.data().status === 'destroyed') {
          toast.error('방이 파괴되었거나 종료되었습니다.');
          navigate('/relay-game');
          return;
        }
        setRoomData({ id: docSnap.id, ...docSnap.data() });
      });
      return () => unsubRoom();
    } else {
      const q = query(collection(db, 'relay_rooms'), where('status', '==', 'waiting'));
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
          if (roomData.hostId === user?.uid) {
            updateDoc(doc(db, 'relay_rooms', roomId!), { status: 'playing' });
          }
        }
      }, 100);
      return () => clearInterval(interval);
    } else {
      setCountdown(null);
    }
  }, [roomData?.status, roomData?.startTime, roomData?.hostId, user?.uid, roomId]);

  // ==========================================
  // [로비/대기실 액션]
  // ==========================================
  const handleCreateRoom = async () => {
    const finalRoomName = newRoomName.trim() || `${user?.name}의 이어달리기`;
    const newRoomId = `RELAY_${Date.now()}`;
    
    const initialActiveTurns: Record<number, number> = {};
    for(let i=0; i<teamCount; i++) initialActiveTurns[i] = 1;

    // 🌟 players를 배열이 아닌 객체(Map)로 초기화
    await setDoc(doc(db, 'relay_rooms', newRoomId), {
      roomName: finalRoomName,
      hostId: user.uid,
      teamCount,
      membersPerTeam,
      status: 'waiting',
      createdAt: Date.now(),
      players: {}, 
      activeTurns: initialActiveTurns,
      startTime: null,
      finishedTeams: [],
      teamBatonTimes: {} // 🌟 팀별 바통 터치 시간 기록용
    });
    navigate(`/relay-game?room=${newRoomId}`);
  };

  const handleJoinTeam = async (teamIndex: number) => {
    const roomRef = doc(db, 'relay_rooms', roomId!);

    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(roomRef);
        if (!snap.exists()) throw new Error("방이 없습니다.");
        
        const data = snap.data();
        const playersObj = data.players || {};
        
        // 🌟 트랜잭션 내에서 서버의 최신 데이터를 기준으로 인원 검증
        const teamMembers = Object.values(playersObj).filter((p: any) => p.teamIndex === teamIndex);
        if (teamMembers.length >= data.membersPerTeam) throw new Error("해당 팀은 인원이 꽉 찼습니다.");

        if (playersObj[user.uid]) throw new Error("이미 참가 중입니다.");

        const turnOrder = teamMembers.length + 1;

        // 단일 문서 내에서 내 정보만 객체 형태로 업데이트
        transaction.update(roomRef, {
          [`players.${user.uid}`]: {
            id: user.uid,
            name: user.name,
            teamIndex,
            turnOrder,
            x: 1,  
            y: 14, 
            isFinished: false,
            lapTime: null // 🌟 개인 기록(초) 저장 공간
          }
        });
      });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleStartGame = async () => {
    const playersArr = Object.values(roomData.players || {});
    if (playersArr.length === 0) {
      toast.error("참여자가 없습니다.");
      return;
    }
    const startTime = Date.now() + 3000;
    
    // 🌟 게임 시작 시 모든 팀의 첫 출발 시간을 동일하게 세팅
    const initialBatonTimes: Record<number, number> = {};
    for(let i=0; i<roomData.teamCount; i++) initialBatonTimes[i] = startTime;

    await updateDoc(doc(db, 'relay_rooms', roomId!), { 
      status: 'countdown',
      startTime,
      teamBatonTimes: initialBatonTimes,
      finishedTeams: []
    });
  };

  const handleLeaveRoom = async () => {
    if (!roomId) return;
    const roomRef = doc(db, 'relay_rooms', roomId);
    
    if (roomData?.hostId === user?.uid) {
      if (window.confirm("방장이 나가면 방이 파괴됩니다.")) {
        await updateDoc(roomRef, { status: 'destroyed' });
        navigate('/relay-game');
      }
    } else {
      if (window.confirm("방에서 나가시겠습니까?")) {
        // 객체 구조에서 내 캐릭터 필드만 안전하게 삭제
        await updateDoc(roomRef, {
          [`players.${user.uid}`]: deleteField()
        });
        navigate('/relay-game');
      }
    }
  };

  // 🌟 게임 종료 후 다시 대기실로 리셋 (방장 전용)
  const handleResetRoom = async () => {
    if (!isHost || !roomId) return;
    
    const initialActiveTurns: Record<number, number> = {};
    for(let i=0; i<roomData.teamCount; i++) initialActiveTurns[i] = 1;

    const resetPlayers = { ...roomData.players };
    Object.keys(resetPlayers).forEach(uid => {
       resetPlayers[uid].isFinished = false;
       resetPlayers[uid].x = 1;
       resetPlayers[uid].y = 14;
       resetPlayers[uid].lapTime = null; // 기록 초기화
    });

    await updateDoc(doc(db, 'relay_rooms', roomId), {
       status: 'waiting',
       activeTurns: initialActiveTurns,
       finishedTeams: [],
       teamBatonTimes: {},
       players: resetPlayers
    });
    toast.success("초기화 완료! 다음 판을 준비하세요.");
  };

  // ==========================================
  // [인게임 액션] 랙 제로 + 충돌 방지 이동 로직
  // ==========================================
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const currentRoom = roomDataRef.current;
      const currentUser = userRef.current;

      if (!currentRoom || currentRoom.status !== 'playing' || !currentUser) return;
      
      const me = currentRoom.players[currentUser.uid];
      if (!me) return;

      const myTeamTurn = currentRoom.activeTurns[me.teamIndex];
      if (me.turnOrder !== myTeamTurn || me.isFinished) return;

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();

      if (isMovingRef.current) return;

      let dx = 0, dy = 0;
      if (e.key === 'ArrowUp') dy = -1;
      else if (e.key === 'ArrowDown') dy = 1;
      else if (e.key === 'ArrowLeft') dx = -1;
      else if (e.key === 'ArrowRight') dx = 1;
      else return;

      const nx = me.x + dx;
      const ny = me.y + dy;

      if (ny < 0 || ny >= SNAIL_TRACK.length || nx < 0 || nx >= SNAIL_TRACK[0].length) return;
      if (SNAIL_TRACK[ny][nx] === 1) return;

      // 🌟 교실 와이파이를 고려한 이동 스로틀링 (150ms 쿨타임)
      isMovingRef.current = true;
      setTimeout(() => { isMovingRef.current = false; }, 150);

      // 바통 존 도달 체크
      const isBatonZone = (nx === 7 && ny === 7);
      
      const roomRef = doc(db, 'relay_rooms', currentRoom.id);
      
      // 🌟 낙관적 업데이트 (화면 먼저 즉시 이동하여 체감 랙 제로!)
      const localPlayers = { ...currentRoom.players };
      localPlayers[currentUser.uid] = { ...me, x: nx, y: ny };

      // 🌟 객체 점 표기법(Dot notation)을 사용해 다른 주자의 데이터에 영향 없이 내 좌표만 덮어씀 (Race Condition 방지)
      const updates: any = {
        [`players.${currentUser.uid}.x`]: nx,
        [`players.${currentUser.uid}.y`]: ny
      };
      
      if (isBatonZone) {
        const now = Date.now();
        // 🌟 내 랩타임 계산 (현재 시간 - 이전 주자의 도착시간)
        const myLapTime = now - currentRoom.teamBatonTimes[me.teamIndex];

        localPlayers[currentUser.uid].isFinished = true;
        localPlayers[currentUser.uid].lapTime = myLapTime;

        updates[`players.${currentUser.uid}.isFinished`] = true;
        updates[`players.${currentUser.uid}.lapTime`] = myLapTime;
        
        const currentTurn = currentRoom.activeTurns[me.teamIndex];
        if (currentTurn < currentRoom.membersPerTeam) {
          toast.success(`바통 터치! ${currentTurn + 1}번 주자 출발!`, { id: 'baton' });
          updates[`activeTurns.${me.teamIndex}`] = currentTurn + 1;
          updates[`teamBatonTimes.${me.teamIndex}`] = now;
        } else {
          const finishedTeams = currentRoom.finishedTeams || [];
          if (!finishedTeams.includes(me.teamIndex)) {
            finishedTeams.push(me.teamIndex);
            toast.success(`🎉 ${TEAM_NAMES[me.teamIndex]} 완주! (${finishedTeams.length}등)`, { id: 'finish' });
            updates.finishedTeams = finishedTeams;

            // 🌟 모든 팀이 완주했는지 확인 후 게임 종료 상태로 전환
            if (finishedTeams.length === currentRoom.teamCount) {
              updates.status = 'finished';
            }
          }
        }
      }
      
      setRoomData({ ...currentRoom, players: localPlayers }); // UI 즉시 반영
      await updateDoc(roomRef, updates); // 서버 비동기 전송
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!user) return null;

  // 객체로 변경된 players를 렌더링에 편하게 쓰기 위해 배열로 변환
  const playersArray = roomData?.players ? Object.values(roomData.players) : [];
  const isHost = roomData?.hostId === user.uid;
  const me = roomData?.players?.[user.uid];

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
                <span className="text-4xl block mb-2">🏃‍♀️🏃‍♂️💨</span>
                <h1 className="text-3xl font-black">달팽이 이어달리기</h1>
                <p className="text-slate-400 font-bold mt-2">팀원들과 순서를 맞춰 트랙을 완주하고 명예의 전당에 오르세요!</p>
              </div>
              
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-600 flex flex-col gap-4 w-full md:w-auto shadow-inner">
                <input type="text" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} placeholder="방 이름 입력" className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold outline-none text-sm" />
                <div className="flex gap-2">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 font-bold mb-1 ml-1">팀 개수</span>
                    <select value={teamCount} onChange={(e) => setTeamCount(Number(e.target.value))} className="w-24 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold text-sm">
                      {[2,3,4,5].map(n => <option key={n} value={n}>{n}팀</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-400 font-bold mb-1 ml-1">팀당 인원</span>
                    <select value={membersPerTeam} onChange={(e) => setMembersPerTeam(Number(e.target.value))} className="w-24 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white font-bold text-sm">
                      {[2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n}명</option>)}
                    </select>
                  </div>
                </div>
                <button onClick={handleCreateRoom} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black px-6 py-3 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2">
                  <span>🏁</span> 트랙 개설하기
                </button>
              </div>
            </div>
          </header>

          <main className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl min-h-[400px]">
            <h2 className="text-xl font-black mb-6 text-slate-300">대기 중인 트랙</h2>
            {activeRooms.length === 0 ? (
              <p className="text-center py-10 text-slate-500 font-bold">생성된 이어달리기 방이 없습니다.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeRooms.map(room => (
                  <div key={room.id} onClick={() => navigate(`/relay-game?room=${room.id}`)} className="bg-slate-900 p-6 rounded-2xl border-2 border-slate-600 hover:border-emerald-500 cursor-pointer flex justify-between items-center">
                    <div>
                      <h3 className="font-black text-xl text-white mb-1 truncate">{room.roomName}</h3>
                      <p className="text-xs text-slate-400 font-bold">{room.teamCount}팀 대결 (팀당 {room.membersPerTeam}명)</p>
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
  // roomData가 로딩되기 전 방어막
  if (!roomData) {
    return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center font-bold text-xl">트랙 입장 중... ⏳</div>;
  }

  // ==========================================
  // [화면 4] 🏆 명예의 전당 및 결과 시상식 화면
  // ==========================================
  if (roomData.status === 'finished') {
    const hallOfFame = playersArray
      .filter((p: any) => p.lapTime)
      .sort((a: any, b: any) => a.lapTime - b.lapTime)
      .slice(0, 5); 

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-950 text-white">
        <div className="w-full max-w-2xl bg-slate-800 rounded-3xl border-4 border-slate-600 shadow-2xl p-8 md:p-12 text-center animate-in zoom-in duration-500">
          <div className="text-6xl mb-6">🎉</div>
          <h1 className="text-4xl font-black text-emerald-400 mb-8">모든 팀 완주 완료!</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-700">
              <h2 className="text-xl font-black text-slate-300 mb-4">🏆 최종 팀 순위</h2>
              <ul className="space-y-3">
                {roomData.finishedTeams.map((teamIdx: number, i: number) => (
                  <li key={teamIdx} className="flex justify-between items-center bg-slate-800 px-4 py-3 rounded-xl border border-slate-700">
                    <span className="font-black text-white text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}등`}</span>
                    <span className={`font-black ${TEAM_COLORS[teamIdx].replace('bg-', 'text-')}`}>{TEAM_NAMES[teamIdx]}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-700">
              <h2 className="text-xl font-black text-yellow-400 mb-4">⚡ 명예의 전당 (최단 기록)</h2>
              <ul className="space-y-3">
                {hallOfFame.map((p: any, i: number) => (
                  <li key={p.id} className="flex justify-between items-center bg-slate-800 px-4 py-3 rounded-xl border border-yellow-500/30">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-slate-400">{i + 1}.</span>
                      <span className="font-bold text-white">{p.name}</span>
                    </div>
                    <span className="font-black text-yellow-400">{(p.lapTime / 1000).toFixed(2)}초</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex justify-center gap-4">
            <button onClick={() => navigate('/relay-game')} className="px-6 py-3 bg-slate-700 hover:bg-slate-600 font-bold rounded-xl transition-colors">
              로비로 나가기
            </button>
            {isHost && (
              <button onClick={handleResetRoom} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 font-black rounded-xl shadow-lg transition-colors">
                🔄 같은 인원으로 다시 시작
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // [화면 2] 인게임 플레이 & 카운트다운 화면
  // ==========================================
  if (roomData.status === 'countdown' || roomData.status === 'playing') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 select-none bg-slate-950">
        
        {roomData.status === 'countdown' && (
          <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center backdrop-blur-sm">
            <span className="text-[150px] font-black text-white animate-ping">
              {countdown === 0 ? 'GO!' : countdown}
            </span>
          </div>
        )}

        <div className="w-full max-w-[700px] flex justify-between items-end mb-4 px-2">
          <div>
            <span className="text-xl font-black text-emerald-400 block">달팽이 이어달리기</span>
            <span className="text-sm font-bold text-slate-400 mt-1 block">
              {me ? `${TEAM_NAMES[me.teamIndex]} - 나의 순번: ${me.turnOrder}번 주자` : '관전 모드'}
            </span>
          </div>
          <button onClick={handleLeaveRoom} className="px-4 py-2 bg-rose-900/50 hover:bg-rose-800 text-rose-200 rounded-lg text-sm font-bold transition-colors">
            {isHost ? '게임 종료 및 파괴' : '기권/방 나가기'}
          </button>
        </div>

        <div className="bg-slate-800 p-3 md:p-6 rounded-2xl border-4 border-slate-600 shadow-2xl relative overflow-hidden">
          
          {/* 완주 현황판 */}
          {roomData.finishedTeams?.length > 0 && (
            <div className="absolute top-4 left-4 z-40 bg-black/70 p-4 rounded-xl border border-slate-600 backdrop-blur-sm">
              <h3 className="text-sm font-black text-white mb-2">🏁 실시간 완주</h3>
              <div className="space-y-1">
                {roomData.finishedTeams.map((teamIdx: number, rank: number) => (
                  <div key={teamIdx} className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <span>{rank + 1}등:</span>
                    <span className={TEAM_COLORS[teamIdx].replace('bg-', 'text-')}>{TEAM_NAMES[teamIdx]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-[2px] md:gap-1 bg-green-950" style={{ gridTemplateColumns: `repeat(${SNAIL_TRACK[0].length}, minmax(0, 1fr))` }}>
            {SNAIL_TRACK.map((row: number[], y: number) => 
              row.map((cell: number, x: number) => {
                
                const occupants = playersArray.filter((p: any) => 
                  p.x === x && p.y === y && 
                  (p.turnOrder === roomData.activeTurns[p.teamIndex] || p.isFinished)
                );
                
                const isStartZone = cell === 2 && x === 1 && y === 14;
                const isBatonZone = cell === 2 && x === 7 && y === 7;

                return (
                  <div key={`${x}-${y}`} className={`w-5 h-5 sm:w-8 sm:h-8 md:w-10 md:h-10 flex items-center justify-center rounded-sm relative
                      ${cell === 1 ? 'bg-green-800 shadow-inner' : 
                        isStartZone ? 'bg-blue-400/20 border border-blue-400' : 
                        isBatonZone ? 'bg-yellow-400/20 border border-yellow-400' : 
                        'bg-slate-800'}
                    `}>
                    
                    {isStartZone && <span className="absolute text-[8px] text-blue-300">START</span>}
                    {isBatonZone && <span className="absolute text-[8px] text-yellow-300">TOUCH</span>}

                    {occupants.map((o: any, idx: number) => (
                      <div key={o.id} className={`w-3 h-3 md:w-5 md:h-5 rounded-full absolute ${TEAM_COLORS[o.teamIndex]} border-2 border-white shadow-md z-10 transition-transform ${o.isFinished ? 'opacity-50' : 'animate-pulse'}`} style={{ transform: `translate(${idx * 4 - 4}px, ${idx * 4 - 4}px)` }}>
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </div>
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
            <p className="text-emerald-400 font-bold mt-2">목표: 팀원 {roomData.membersPerTeam}명이 모두 트랙을 돌아야 합니다.</p>
          </div>
          <button onClick={handleLeaveRoom} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold text-sm">
            방 나가기
          </button>
        </header>

        <main className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl">
          <h2 className="text-xl font-black mb-6 text-slate-300">🚩 팀 선택 및 엔트리</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {Array.from({ length: roomData.teamCount }).map((_, teamIdx) => {
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
            {isHost && (
              <button onClick={handleStartGame} className="px-12 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl shadow-lg transition-all active:scale-95 text-lg flex items-center gap-2">
                <span>🏁</span> 달리기 시작!
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}