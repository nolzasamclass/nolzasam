// src/pages/PixyCubeStage1.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  getDocs, 
  orderBy, 
  limit, 
  increment,
  runTransaction 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import toast, { Toaster } from 'react-hot-toast';

// --- 1. 픽시큐브 4종 데이터 정의 ---
interface CubeFace { 
  type: 'solid' | 'diagonal' | 'crescent'; 
  bg: string; 
  patternColor?: string; 
  rotation?: number; 
}

const CUBE_TEMPLATES: Record<string, CubeFace[]> = {
  'Red/Blue': [
    { type: 'solid', bg: 'bg-rose-500' }, { type: 'solid', bg: 'bg-blue-600' }, 
    { type: 'diagonal', bg: 'bg-rose-500', patternColor: 'blue', rotation: 0 }, { type: 'diagonal', bg: 'bg-rose-500', patternColor: 'blue', rotation: 2 }, 
    { type: 'crescent', bg: 'bg-blue-600', patternColor: 'red', rotation: 0 }, { type: 'crescent', bg: 'bg-rose-500', patternColor: 'blue', rotation: 2 },  
  ],
  'Blue/Yellow': [
    { type: 'solid', bg: 'bg-blue-600' }, { type: 'solid', bg: 'bg-amber-400' },
    { type: 'diagonal', bg: 'bg-blue-600', patternColor: 'yellow', rotation: 0 }, { type: 'diagonal', bg: 'bg-blue-600', patternColor: 'yellow', rotation: 2 },
    { type: 'crescent', bg: 'bg-amber-400', patternColor: 'blue', rotation: 0 }, { type: 'crescent', bg: 'bg-blue-600', patternColor: 'yellow', rotation: 2 },
  ],
  'Red/Green': [
    { type: 'solid', bg: 'bg-rose-500' }, { type: 'solid', bg: 'bg-emerald-500' },
    { type: 'diagonal', bg: 'bg-rose-500', patternColor: 'green', rotation: 0 }, { type: 'diagonal', bg: 'bg-rose-500', patternColor: 'green', rotation: 2 },
    { type: 'crescent', bg: 'bg-emerald-500', patternColor: 'red', rotation: 0 }, { type: 'crescent', bg: 'bg-rose-500', patternColor: 'green', rotation: 2 },
  ],
  'Green/Yellow': [
    { type: 'solid', bg: 'bg-emerald-500' }, { type: 'solid', bg: 'bg-amber-400' },
    { type: 'diagonal', bg: 'bg-emerald-500', patternColor: 'yellow', rotation: 0 }, { type: 'diagonal', bg: 'bg-emerald-500', patternColor: 'yellow', rotation: 2 },
    { type: 'crescent', bg: 'bg-amber-400', patternColor: 'green', rotation: 0 }, { type: 'crescent', bg: 'bg-emerald-500', patternColor: 'yellow', rotation: 2 },
  ]
};
const CUBE_KEYS = ['Red/Blue', 'Blue/Yellow', 'Red/Green', 'Green/Yellow'];

// --- 2. 멀티플레이용 정규 스테이지 족보 ---
const baseStage1 = [[{faceIdx:4,rot:2}, {faceIdx:4,rot:3}, {faceIdx:4,rot:1}, {faceIdx:4,rot:0}], [{faceIdx:5,rot:2}, {faceIdx:5,rot:3}, {faceIdx:5,rot:1}, {faceIdx:5,rot:0}], [{faceIdx:4,rot:0}, {faceIdx:4,rot:1}, {faceIdx:4,rot:3}, {faceIdx:4,rot:2}], [{faceIdx:5,rot:0}, {faceIdx:5,rot:1}, {faceIdx:5,rot:3}, {faceIdx:5,rot:2}], [{faceIdx:4,rot:1}, {faceIdx:4,rot:2}, {faceIdx:4,rot:0}, {faceIdx:4,rot:3}]];
const baseStage2 = [[{faceIdx:2,rot:1}, {faceIdx:2,rot:2}, {faceIdx:2,rot:0}, {faceIdx:2,rot:3}], [{faceIdx:2,rot:3}, {faceIdx:2,rot:0}, {faceIdx:2,rot:2}, {faceIdx:2,rot:1}], [{faceIdx:2,rot:1}, {faceIdx:2,rot:2}, {faceIdx:0,rot:0}, {faceIdx:0,rot:0}], [{faceIdx:0,rot:0}, {faceIdx:0,rot:0}, {faceIdx:2,rot:0}, {faceIdx:2,rot:3}], [{faceIdx:2,rot:0}, {faceIdx:1,rot:0}, {faceIdx:2,rot:3}, {faceIdx:1,rot:0}]];
const baseStage3 = [[{faceIdx:2,rot:0}, {faceIdx:2,rot:2}, {faceIdx:2,rot:2}, {faceIdx:2,rot:0}], [{faceIdx:2,rot:1}, {faceIdx:2,rot:1}, {faceIdx:2,rot:3}, {faceIdx:2,rot:3}], [{faceIdx:4,rot:1}, {faceIdx:4,rot:2}, {faceIdx:4,rot:0}, {faceIdx:4,rot:3}], [{faceIdx:2,rot:2}, {faceIdx:2,rot:1}, {faceIdx:2,rot:3}, {faceIdx:2,rot:0}], [{faceIdx:4,rot:0}, {faceIdx:4,rot:2}, {faceIdx:4,rot:1}, {faceIdx:4,rot:3}]];
const baseStage4 = [[{faceIdx:0,rot:0}, {faceIdx:1,rot:0}, {faceIdx:1,rot:0}, {faceIdx:0,rot:0}], [{faceIdx:1,rot:0}, {faceIdx:0,rot:0}, {faceIdx:0,rot:0}, {faceIdx:1,rot:0}], [{faceIdx:2,rot:0}, {faceIdx:2,rot:1}, {faceIdx:2,rot:3}, {faceIdx:2,rot:2}], [{faceIdx:2,rot:1}, {faceIdx:2,rot:0}, {faceIdx:2,rot:0}, {faceIdx:2,rot:1}], [{faceIdx:2,rot:2}, {faceIdx:2,rot:3}, {faceIdx:2,rot:3}, {faceIdx:2,rot:2}]];

const STAGE_MISSIONS = [
  { stage: 1, title: "만달라 대칭 코스", patternType: "꽃 무늬", levels: Array.from({length: 20}, (_, i) => ({ level: i+1, design: baseStage1[i % 5] })) },
  { stage: 2, title: "형태 모방 코스", patternType: "사물 형상", levels: Array.from({length: 20}, (_, i) => ({ level: i+1, design: baseStage2[i % 5] })) },
  { stage: 3, title: "미로 개척 코스", patternType: "선 연결", levels: Array.from({length: 20}, (_, i) => ({ level: i+1, design: baseStage3[i % 5] })) },
  { stage: 4, title: "격자 착시 코스", patternType: "체크보드", levels: Array.from({length: 20}, (_, i) => ({ level: i+1, design: baseStage4[i % 5] })) }
];

// --- 3. 공통 무늬 렌더러 ---
function CubeFaceRenderer({ face, customRotation = 0, isSeamless = false, isHighlighted = false }: { face: CubeFace; customRotation?: number; isSeamless?: boolean; isHighlighted?: boolean }) {
  if (!face) return <div className="w-full h-full bg-slate-800 rounded-2xl" />;
  const totalRotation = ((face.rotation || 0) + customRotation) % 4;
  const rotationClass = [`rotate-0`, `rotate-90`, `rotate-180`, `rotate-270`][totalRotation];
  const borderStyle = isSeamless ? '' : `rounded-2xl border ${isHighlighted ? 'border-amber-400 border-4 shadow-[0_0_15px_rgba(251,191,36,0.8)]' : 'border-white/20 shadow-inner'}`;

  if (face.type === 'solid') return <div className={`w-full h-full ${face.bg} ${borderStyle}`} />;
  if (face.type === 'diagonal') {
    const triangleColor = face.patternColor === 'blue' ? 'border-b-blue-600' : face.patternColor === 'yellow' ? 'border-b-amber-400' : face.patternColor === 'green' ? 'border-b-emerald-500' : 'border-b-rose-500';
    return (
      <div className={`w-full h-full ${face.bg} relative overflow-hidden ${rotationClass} ${borderStyle}`}>
        <div className={`absolute bottom-0 right-0 w-0 h-0 border-t-[100px] border-t-transparent border-r-[100px] border-r-transparent border-b-[100px] ${triangleColor} border-l-[100px] border-l-transparent`} />
      </div>
    );
  }
  if (face.type === 'crescent') {
    const circleColor = face.patternColor === 'red' ? 'bg-rose-500' : face.patternColor === 'blue' ? 'bg-blue-600' : face.patternColor === 'green' ? 'bg-emerald-500' : 'bg-amber-400';
    return (
      <div className={`w-full h-full ${face.bg} relative overflow-hidden ${rotationClass} ${borderStyle}`}>
        <div className={`absolute -top-12 -left-12 w-24 h-24 rounded-full ${circleColor}`} />
      </div>
    );
  }
  return null;
}

// --- 메인 앱 컴포넌트 ---
export default function PixyCubeStage1() {
  const navigate = useNavigate();
  const myId = auth.currentUser?.uid || sessionStorage.getItem('pixy_myId') || `user_${Math.random().toString(36).substring(2, 9)}`;
  const myName = auth.currentUser?.displayName || sessionStorage.getItem('pixy_myName') || '';
  if (!sessionStorage.getItem('pixy_myId')) sessionStorage.setItem('pixy_myId', myId);

  // === 앱 상태 관리 (새로고침 방어용 세션 스토리지 연동) ===
  const [appMode, setAppMode] = useState<string>(() => sessionStorage.getItem('pixy_appMode') || 'MAIN_SELECT');
  const [myRoomId, setMyRoomId] = useState<string | null>(() => sessionStorage.getItem('pixy_myRoomId') || null);
  const [myTeamId, setMyTeamId] = useState<string | null>(() => sessionStorage.getItem('pixy_myTeamId') || null);
  
  useEffect(() => { sessionStorage.setItem('pixy_appMode', appMode); }, [appMode]);
  useEffect(() => { myRoomId ? sessionStorage.setItem('pixy_myRoomId', myRoomId) : sessionStorage.removeItem('pixy_myRoomId'); }, [myRoomId]);
  useEffect(() => { myTeamId ? sessionStorage.setItem('pixy_myTeamId', myTeamId) : sessionStorage.removeItem('pixy_myTeamId'); }, [myTeamId]);

  // === 싱글 플레이 상태 (타임어택) ===
  const [spSolvedCount, setSpSolvedCount] = useState(0);
  const [spStartTime, setSpStartTime] = useState<number | null>(null);
  const [spTarget, setSpTarget] = useState<{faceIdx:number, rot:number}[]>([]);
  const [spRanks, setSpRanks] = useState<any[]>([]);
  const [playerCubes, setPlayerCubes] = useState([{ faceIdx: 0, rot: 0 }, { faceIdx: 0, rot: 0 }, { faceIdx: 0, rot: 0 }, { faceIdx: 0, rot: 0 }]);

  // 새로고침 시 싱글플레이 화면인데 타겟이 비어있으면 자동 생성 (백지 방어)
  useEffect(() => {
    if (appMode === 'SP_PLAY' && spTarget.length === 0) {
      generateRandomTarget();
      if (!spStartTime) setSpStartTime(Date.now());
    }
  }, [appMode, spTarget.length]);

  // === 멀티 플레이 상태 ===
  const [mpRanks, setMpRanks] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [roomData, setRoomData] = useState<any>(null);
  const [teamData, setTeamData] = useState<any>(null);

  // 🛠️ 치명적 오류 수정 1: reload() 제거. 이름 입력 후 자연스럽게 넘어가도록 고침.
  const checkName = () => {
    if (!myName) { 
      const name = prompt("게임에 사용할 별명을 입력해주세요!"); 
      if (name) { 
        sessionStorage.setItem('pixy_myName', name); 
        return name; 
      } 
      return null; 
    }
    return myName;
  };

  // ==========================================
  // DB 구독 및 데이터 패칭
  // ==========================================
  useEffect(() => {
    if (appMode === 'SP_LOBBY') {
      getDocs(query(collection(db, 'pixy_sp_ranks'), orderBy('timeMs', 'asc'), limit(10))).then(s => setSpRanks(s.docs.map(d => d.data())));
    }
    if (['MP_LOBBY', 'MP_INDIV_LOBBY', 'MP_TEAM_LOBBY'].includes(appMode)) {
      getDocs(query(collection(db, 'pixy_mp_ranks'), orderBy('score', 'desc'), limit(10))).then(s => setMpRanks(s.docs.map(d => d.data())));
    }
    
    let unsubRooms: any, unsubTeams: any;
    if (['MP_INDIV_LOBBY', 'MP_TEAM_LOBBY'].includes(appMode)) {
      unsubRooms = onSnapshot(query(collection(db, 'pixy_rooms'), where('status', '==', 'waiting')), s => setRooms(s.docs.map(d => ({id:d.id, ...d.data()}))));
      unsubTeams = onSnapshot(query(collection(db, 'pixy_teams'), where('status', '==', 'waiting')), s => setTeams(s.docs.map(d => ({id:d.id, ...d.data()}))));
    }
    return () => { unsubRooms?.(); unsubTeams?.(); };
  }, [appMode]);

  // 내 팀 구독 (팀전)
  useEffect(() => {
    if (!myTeamId) return;
    const unsub = onSnapshot(doc(db, 'pixy_teams', myTeamId), (snap) => {
      if (!snap.exists()) {
        toast.error("팀이 해체되었습니다.");
        setMyTeamId(null); setAppMode('MP_TEAM_LOBBY'); return;
      }
      const data = snap.data();
      setTeamData(data);
      if (data.roomId && !myRoomId) {
        setMyRoomId(data.roomId);
        setAppMode('MP_TEAM_PLAY');
        toast.success("🔥 팀 매치가 성사되었습니다! 게임 시작!");
      }
    });
    return () => unsub();
  }, [myTeamId, myRoomId]);

  // 내 게임방 구독 (개인전 & 팀전 공통)
  useEffect(() => {
    if (!myRoomId) return;
    const unsub = onSnapshot(doc(db, 'pixy_rooms', myRoomId), (snap) => {
      if (!snap.exists()) {
        toast.error("방이 종료되어 로비로 이동합니다.");
        setMyRoomId(null); setMyTeamId(null); setRoomData(null);
        setAppMode('MAIN_SELECT'); return;
      }
      const data = snap.data();
      setRoomData(data);
      
      if (data.type === 'individual' && data.status === 'playing' && appMode !== 'MP_INDIV_PLAY') setAppMode('MP_INDIV_PLAY');
      if (data.status === 'stageResult' && appMode !== 'STAGE_RESULT') setAppMode('STAGE_RESULT');
      if (data.status === 'waiting' && appMode !== 'MP_INDIV_WAIT' && appMode !== 'MP_TEAM_WAIT') setAppMode(data.type === 'team' ? 'MP_TEAM_WAIT' : 'MP_INDIV_WAIT');

      if (data.lastWinner && data.lastWinner !== "SYSTEM") {
        toast.success(`🚀 [${data.lastWinner}] 정답 제출! 다음 미션!`, { duration: 2500, id: 'win' });
      }
    });
    return () => unsub();
  }, [myRoomId, appMode]);

  // --- 브라우저 이탈(새로고침/탭 닫기) 방어 알고리즘 ---
  useEffect(() => {
    if (!myRoomId && !myTeamId) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '게임 진행 중 페이지를 벗어나면 방/팀에서 퇴장 처리됩니다.';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [myRoomId, myTeamId]);


  // ==========================================
  // 안전 제어 및 리팩토링 알고리즘
  // ==========================================
  const performEmergencyReset = () => {
    sessionStorage.removeItem('pixy_appMode');
    sessionStorage.removeItem('pixy_myRoomId');
    sessionStorage.removeItem('pixy_myTeamId');
    window.location.href = '/';
  };

  /**
   * 퇴장 및 방장 권한 위임 원자적 연산 알고리즘 (Host Migration & Transaction)
   */
  const leaveEverything = async () => {
    if (myRoomId) {
      const roomRef = doc(db, 'pixy_rooms', myRoomId);
      try {
        await runTransaction(db, async (transaction) => {
          const roomDoc = await transaction.get(roomRef);
          if (!roomDoc.exists()) return;

          const data = roomDoc.data();
          if (data.type === 'individual') {
            const players = data.players || [];
            const remaining = players.filter((p: any) => p.id !== myId);

            if (remaining.length === 0) {
              transaction.delete(roomRef);
            } else {
              const updates: any = { players: remaining };
              if (data.hostId === myId) {
                updates.hostId = remaining[0].id;
                updates.roomName = `${remaining[0].name}의 개인전 방`;
              }
              transaction.update(roomRef, updates);
            }
          } else if (data.type === 'team') {
            if (data.hostId === myId) transaction.delete(roomRef);
          }
        });
      } catch (e) {
        console.error("방 퇴장 오류:", e);
      }
    }

    if (myTeamId) {
      const teamRef = doc(db, 'pixy_teams', myTeamId);
      try {
        await runTransaction(db, async (transaction) => {
          const teamDoc = await transaction.get(teamRef);
          if (!teamDoc.exists()) return;

          const data = teamDoc.data();
          const members = data.members || [];
          const remaining = members.filter((m: any) => m.id !== myId);

          if (remaining.length === 0) {
            transaction.delete(teamRef);
          } else {
            const updates: any = { members: remaining };
            if (data.hostId === myId) {
              updates.hostId = remaining[0].id;
            }
            transaction.update(teamRef, updates);
          }
        });
      } catch (e) {
        console.error("팀 퇴장 오류:", e);
      }
    }

    setMyRoomId(null); setMyTeamId(null); setRoomData(null); setTeamData(null);
    setAppMode('MAIN_SELECT');
    toast.success("안전하게 퇴장 처리되었습니다.");
  };

  // ==========================================
  // 싱글 플레이 (타임어택) 로직
  // ==========================================
  const generateRandomTarget = () => {
    setSpTarget(Array.from({length:4}, () => ({ faceIdx: Math.floor(Math.random()*6), rot: Math.floor(Math.random()*4) })));
  };

  const startSPGame = () => {
    setSpSolvedCount(0); setSpStartTime(Date.now()); generateRandomTarget();
    setPlayerCubes([{ faceIdx:0, rot:0 }, { faceIdx:0, rot:0 }, { faceIdx:0, rot:0 }, { faceIdx:0, rot:0 }]);
    setAppMode('SP_PLAY');
  };

  const checkSPAnswer = async () => {
    if (spTarget.length !== 4) return;
    let isCorrect = true;
    for (let i = 0; i < 4; i++) {
      const pFace = CUBE_TEMPLATES[CUBE_KEYS[i]][playerCubes[i].faceIdx];
      const tFace = CUBE_TEMPLATES[CUBE_KEYS[i]][spTarget[i].faceIdx];
      if (pFace.type !== tFace.type || pFace.bg !== tFace.bg || pFace.patternColor !== tFace.patternColor) { isCorrect = false; break; }
      if (pFace.type !== 'solid' && (((pFace.rotation||0)+playerCubes[i].rot)%4 !== ((tFace.rotation||0)+spTarget[i].rot)%4)) { isCorrect = false; break; }
    }
    
    if (!isCorrect) return toast.error("앗! 모양이나 회전이 틀렸어요.");
    
    const newCount = spSolvedCount + 1;
    if (newCount >= 10) {
      const totalTime = Date.now() - (spStartTime || Date.now());
      setAppMode('SP_RESULT');
      const name = checkName();
      if (name) await setDoc(doc(collection(db, 'pixy_sp_ranks')), { userId: myId, name, timeMs: totalTime, date: serverTimestamp() });
    } else {
      toast.success(`${newCount}/10 통과! 다음 문제!`, { duration: 1000 });
      setSpSolvedCount(newCount); generateRandomTarget();
      setPlayerCubes([{ faceIdx:0, rot:0 }, { faceIdx:0, rot:0 }, { faceIdx:0, rot:0 }, { faceIdx:0, rot:0 }]);
    }
  };


  // ==========================================
  // 멀티플레이 - 공통 및 개인전
  // ==========================================
  const addMpScore = async (points: number) => {
    const name = checkName(); if(!name) return;
    await setDoc(doc(db, 'pixy_mp_ranks', myId), { userId: myId, name, score: increment(points) }, { merge: true });
  };

  const createIndivRoom = async (max: number) => {
    const name = checkName(); if(!name) return;
    try {
      const roomRef = doc(collection(db, 'pixy_rooms'));
      await setDoc(roomRef, {
        id: roomRef.id,
        roomName: `${name}의 개인전 방`, hostId: myId, maxPlayers: max, status: 'waiting', type: 'individual',
        players: [{ id: myId, name, score: 0 }], currentStageIdx: 0, currentLevelIdx: 0, lastWinner: null,
        createdAt: serverTimestamp()
      });
      setMyRoomId(roomRef.id); setAppMode('MP_INDIV_WAIT');
      toast.success("개인전 방을 개설했습니다.");
    } catch(e) {
      toast.error("방 생성에 실패했습니다.");
    }
  };

  const joinIndivRoom = async (r: any) => {
    const name = checkName(); if(!name) return;
    const roomRef = doc(db, 'pixy_rooms', r.id);

    try {
      await runTransaction(db, async (transaction) => {
        const roomDoc = await transaction.get(roomRef);
        if (!roomDoc.exists()) throw new Error("방이 존재하지 않습니다.");

        const data = roomDoc.data();
        const players = data.players || [];

        if (players.some((p: any) => p.id === myId)) return;
        if (players.length >= data.maxPlayers) throw new Error("방 정원이 이미 가득 찼습니다.");

        transaction.update(roomRef, {
          players: [...players, { id: myId, name, score: 0 }]
        });
      });

      setMyRoomId(r.id); setAppMode('MP_INDIV_WAIT');
      toast.success("방에 입장했습니다.");
    } catch(e: any) {
      toast.error(e.message || "입장 실패");
    }
  };

  const startIndivGame = async () => {
    if(!myRoomId) return;
    await updateDoc(doc(db, 'pixy_rooms', myRoomId), { status: 'playing', currentStageIdx: 0, currentLevelIdx: 0, lastWinner: "SYSTEM" });
  };


  // ==========================================
  // 멀티플레이 - 팀전 매칭 및 제어
  // ==========================================
  const createTeam = async (teamName: string) => {
    if(!teamName) return; const name = checkName(); if(!name) return;
    try {
      const teamRef = doc(collection(db, 'pixy_teams'));
      await setDoc(teamRef, {
        id: teamRef.id,
        name: teamName, hostId: myId, members: [{ id: myId, name }],
        status: 'waiting', challengeRequest: null, roomId: null,
        createdAt: serverTimestamp()
      });
      setMyTeamId(teamRef.id); setAppMode('MP_TEAM_WAIT');
      toast.success(`[${teamName}] 팀이 생성되었습니다.`);
    } catch(e) {
      toast.error("팀 생성 실패");
    }
  };

  const joinTeam = async (t: any) => {
    const name = checkName(); if(!name) return;
    const teamRef = doc(db, 'pixy_teams', t.id);

    try {
      await runTransaction(db, async (transaction) => {
        const teamDoc = await transaction.get(teamRef);
        if (!teamDoc.exists()) throw new Error("팀이 존재하지 않습니다.");

        const data = teamDoc.data();
        const members = data.members || [];

        if (members.some((m: any) => m.id === myId)) return;
        if (members.length >= 4) throw new Error("팀의 최대 정원(4명)이 가득 찼습니다.");

        transaction.update(teamRef, {
          members: [...members, { id: myId, name }]
        });
      });

      setMyTeamId(t.id); setAppMode('MP_TEAM_WAIT');
      toast.success("팀에 합류했습니다.");
    } catch(e: any) {
      toast.error(e.message || "팀 합류 실패");
    }
  };

  const sendChallenge = async (targetTeam: any) => {
    if(!teamData) return;
    await updateDoc(doc(db, 'pixy_teams', targetTeam.id), { challengeRequest: { fromTeamId: myTeamId, fromTeamName: teamData.name } });
    toast.success(`${targetTeam.name} 팀에게 대결을 신청했습니다!`);
  };

  const acceptChallenge = async () => {
    if (!teamData || !teamData.challengeRequest) return;
    try {
      const roomRef = doc(collection(db, 'pixy_rooms'));
      const targetTeamId = teamData.challengeRequest.fromTeamId;
      const initialCubes = { "0":{faceIdx:0,rot:0}, "1":{faceIdx:0,rot:0}, "2":{faceIdx:0,rot:0}, "3":{faceIdx:0,rot:0} };

      await setDoc(roomRef, {
        id: roomRef.id,
        hostId: myId,
        type: 'team', status: 'playing', currentStageIdx: 0, currentLevelIdx: 0, lastWinner: null,
        teamScores: { [myTeamId!]: 0, [targetTeamId]: 0 },
        teamCubes: { [myTeamId!]: initialCubes, [targetTeamId]: initialCubes },
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'pixy_teams', myTeamId!), { roomId: roomRef.id, challengeRequest: null, status: 'playing' });
      await updateDoc(doc(db, 'pixy_teams', targetTeamId), { roomId: roomRef.id, status: 'playing' });
    } catch (e) {
      toast.error("대결 매치 오픈 중 오류 발생");
    }
  };

  // --- 정답 검증 (개인전 및 팀전 통합) ---
  const submitMpAnswer = async () => {
    if(!roomData) return;
    const sIdx = roomData.currentStageIdx || 0; 
    const lIdx = roomData.currentLevelIdx || 0;
    const activeStage = STAGE_MISSIONS[sIdx] || STAGE_MISSIONS[0];
    const targetDesign = activeStage.levels[lIdx]?.design || activeStage.levels[0].design;
    const isTeamMode = roomData.type === 'team';
    
    let currentCubes = playerCubes;
    if (isTeamMode) {
      const myTeamCubeData = roomData.teamCubes?.[myTeamId || ''];
      if (!myTeamCubeData) return toast.error("서버와 동기화 중입니다. 잠시 후 다시 시도해주세요.");
      currentCubes = [myTeamCubeData["0"], myTeamCubeData["1"], myTeamCubeData["2"], myTeamCubeData["3"]];
    }

    let isCorrect = true;
    for (let i = 0; i < 4; i++) {
      const cubeData = currentCubes[i] || { faceIdx:0, rot:0 };
      const tDesignData = targetDesign[i] || { faceIdx:0, rot:0 };
      
      const pFace = CUBE_TEMPLATES[CUBE_KEYS[i]][cubeData.faceIdx];
      const tFace = CUBE_TEMPLATES[CUBE_KEYS[i]][tDesignData.faceIdx];
      
      if (!pFace || !tFace) { isCorrect = false; break; }
      if (pFace.type !== tFace.type || pFace.bg !== tFace.bg || pFace.patternColor !== tFace.patternColor) { isCorrect = false; break; }
      if (pFace.type !== 'solid' && (((pFace.rotation||0)+cubeData.rot)%4 !== ((tFace.rotation||0)+tDesignData.rot)%4)) { isCorrect = false; break; }
    }

    if (!isCorrect) return toast.error("앗! 누군가 잘못 맞췄거나 빈틈이 있습니다.");

    addMpScore(isTeamMode ? 5 : 10); 

    // 🛠️ 치명적 오류 수정 2: 스테이지 스킵 방지 및 팀전 결과창 반영 로직 수정
    if (isTeamMode) {
      const nextLevel = lIdx + 1;
      const isLastLevel = nextLevel === 20;
      const initialCubes = { "0":{faceIdx:0,rot:0}, "1":{faceIdx:0,rot:0}, "2":{faceIdx:0,rot:0}, "3":{faceIdx:0,rot:0} };
      
      const updates: any = { 
        currentLevelIdx: isLastLevel ? 0 : nextLevel,
        status: isLastLevel ? 'stageResult' : 'playing', // 팀전도 결과창으로 넘어가도록 추가
        lastWinner: (teamData?.name || "알수없음") + " 팀",
        [`teamScores.${myTeamId}`]: increment(10)
      };
      Object.keys(roomData.teamCubes || {}).forEach(tId => { updates[`teamCubes.${tId}`] = initialCubes; });
      await updateDoc(doc(db, 'pixy_rooms', myRoomId!), updates);
      
    } else {
      const nextLevel = lIdx + 1;
      const isLastLevel = nextLevel === 20;
      const roomRef = doc(db, 'pixy_rooms', myRoomId!);

      try {
        await runTransaction(db, async (transaction) => {
          const roomDoc = await transaction.get(roomRef);
          if (!roomDoc.exists()) return;
          
          const data = roomDoc.data();
          const currentPlayers = data.players || [];
          
          const updatedPlayers = currentPlayers.map((p: any) => 
            p.id === myId ? { ...p, score: (p.score || 0) + 10 } : p
          );

          transaction.update(roomRef, {
            currentLevelIdx: isLastLevel ? 0 : nextLevel,
            status: isLastLevel ? 'stageResult' : 'playing',
            lastWinner: myName,
            players: updatedPlayers
          });
        });
      } catch (e) {
        console.error("점수 업데이트 트랜잭션 실패:", e);
        toast.error("점수 반영 중 오류가 발생했습니다. 다시 시도해 주세요.");
      }
    }
  };

  // 🛠️ 치명적 오류 수정 3: 방장의 '다음 스테이지' 제어 전용 함수 신설
  const handleNextStage = async () => {
    const nextStageIdx = (roomData.currentStageIdx || 0) + 1;
    
    // 만약 4스테이지(인덱스 3)를 모두 깼다면 게임 완전 종료 처리
    if (nextStageIdx > 3) {
      toast.success("모든 스테이지를 정복했습니다! 메인으로 돌아갑니다.", { icon: '👑', duration: 5000 });
      await updateDoc(doc(db, 'pixy_rooms', myRoomId!), { status: 'waiting', lastWinner: "SYSTEM" });
      setAppMode('MP_LOBBY');
    } else {
      await updateDoc(doc(db, 'pixy_rooms', myRoomId!), {
        status: 'playing', 
        currentLevelIdx: 0, 
        currentStageIdx: nextStageIdx, 
        lastWinner: "SYSTEM"
      });
    }
  };

  // --- 조작계 헬퍼 ---
  const handleCubeControl = (cubeIdx: number, action: 'face' | 'rot') => {
    if (appMode === 'MP_TEAM_PLAY') {
      if(!roomData || !myTeamId || !roomData.teamCubes?.[myTeamId]) return;
      const current = roomData.teamCubes[myTeamId][String(cubeIdx)];
      updateDoc(doc(db, 'pixy_rooms', myRoomId!), {
        [`teamCubes.${myTeamId}.${cubeIdx}.${action === 'face' ? 'faceIdx' : 'rot'}`] : action === 'face' ? (current.faceIdx + 1) % 6 : (current.rot + 1) % 4
      });
    } else {
      setPlayerCubes(prev => prev.map((c, i) => i === cubeIdx ? { ...c, [action === 'face' ? 'faceIdx' : 'rot']: action === 'face' ? (c.faceIdx+1)%6 : (c.rot+1)%4 } : c));
    }
  };


  // ==========================================
  // 🖥️ UI 렌더링 파트
  // ==========================================
  if (appMode === 'MAIN_SELECT') {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center">
        <h1 className="text-5xl font-black mb-6 text-indigo-400">🧩 픽시큐브 마스터</h1>
        <div className="flex flex-col md:flex-row gap-6 mt-8">
          <button onClick={() => setAppMode('SP_LOBBY')} className="bg-slate-800 border-4 border-indigo-500 p-8 rounded-3xl w-64 hover:scale-105 transition-all">
            <div className="text-6xl mb-4">👤</div><h2 className="text-2xl font-black">1인용 스피드런</h2><p className="text-sm mt-2 text-slate-400">랜덤 10제 기록 경쟁</p>
          </button>
          <button onClick={() => setAppMode('MP_LOBBY')} className="bg-slate-800 border-4 border-emerald-500 p-8 rounded-3xl w-64 hover:scale-105 transition-all">
            <div className="text-6xl mb-4">👥</div><h2 className="text-2xl font-black">멀티 플레이</h2><p className="text-sm mt-2 text-slate-400">개인전 / 팀전 대결</p>
          </button>
        </div>
        <button onClick={() => navigate('/')} className="mt-12 text-slate-500 underline font-bold hover:text-white">포털로 돌아가기</button>
      </div>
    );
  }

  if (appMode === 'SP_LOBBY') {
    return (
      <div className="min-h-screen bg-slate-900 p-8 text-white max-w-2xl mx-auto flex flex-col items-center">
        <h1 className="text-4xl font-black text-indigo-400 mb-8">👤 싱글 스피드런 로비</h1>
        <button onClick={startSPGame} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black text-2xl py-6 rounded-3xl mb-8 shadow-xl">🚀 타임어택 10제 시작하기</button>
        <div className="w-full bg-slate-800 p-6 rounded-3xl border border-slate-700">
          <h2 className="text-xl font-bold mb-4 text-center border-b border-slate-700 pb-2">🏆 명예의 전당 (최단 시간)</h2>
          {spRanks.length === 0 ? <p className="text-center text-slate-500 py-4">아직 기록이 없습니다.</p> : spRanks.map((r, i) => (
            <div key={i} className="flex justify-between items-center bg-slate-900 p-3 rounded-xl mb-2 font-bold">
              <span><span className="text-amber-400 mr-2">{i+1}위</span> {r.name}</span>
              <span className="text-indigo-400">{(r.timeMs / 1000).toFixed(1)}초</span>
            </div>
          ))}
        </div>
        <button onClick={() => setAppMode('MAIN_SELECT')} className="mt-8 text-slate-500 underline hover:text-white">뒤로가기</button>
      </div>
    );
  }

  if (appMode === 'SP_PLAY' || appMode === 'SP_RESULT') {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6">
        <Toaster position="top-center" />
        {appMode === 'SP_RESULT' ? (
          <div className="text-center animate-fade-in">
            <h1 className="text-6xl mb-6">🎉</h1>
            <h2 className="text-4xl font-black mb-4">10문제 완주 성공!</h2>
            <p className="text-2xl text-indigo-400 font-bold mb-12">기록: {((Date.now() - (spStartTime||Date.now()))/1000).toFixed(1)}초</p>
            <div className="flex gap-4 justify-center">
              <button onClick={startSPGame} className="px-8 py-4 bg-emerald-600 rounded-2xl font-black text-xl hover:bg-emerald-500">🔄 재도전</button>
              <button onClick={() => setAppMode('SP_LOBBY')} className="px-8 py-4 bg-slate-800 rounded-2xl font-black text-xl hover:bg-slate-700">그만두기</button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-5xl">
            <div className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
               <button onClick={() => setAppMode('SP_LOBBY')} className="bg-slate-800 px-4 py-2 rounded-xl">포기</button>
               <h1 className="text-2xl font-black bg-indigo-600 px-6 py-2 rounded-full shadow-lg">진행도: {spSolvedCount} / 10</h1>
            </div>
            <div className="flex flex-col md:flex-row gap-16 justify-center">
              <div className="bg-slate-800 p-8 rounded-[3rem] border-4 border-indigo-500 flex justify-center items-center">
                <div className="grid grid-cols-2 gap-0 w-[200px] h-[200px] rounded-2xl overflow-hidden">
                  {spTarget.map((design, idx) => ( <div key={`target-${idx}`} className="w-[100px] h-[100px]"><CubeFaceRenderer face={CUBE_TEMPLATES[CUBE_KEYS[idx]][design.faceIdx]} customRotation={design.rot} isSeamless={true} /></div> ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6 bg-slate-800/50 p-6 rounded-[2.5rem]">
                {playerCubes.map((cube, idx) => (
                  <div key={idx} className="flex flex-col items-center bg-slate-900 p-3.5 rounded-2xl border border-slate-700">
                    <div className="w-[100px] h-[100px] mb-3"><CubeFaceRenderer face={CUBE_TEMPLATES[CUBE_KEYS[idx]][cube.faceIdx]} customRotation={cube.rot} /></div>
                    <div className="flex gap-2"><button onClick={()=>handleCubeControl(idx,'face')} className="bg-slate-700 text-xs px-3 py-2 rounded-lg font-bold">면변경</button><button onClick={()=>handleCubeControl(idx,'rot')} className="bg-indigo-600 text-xs px-3 py-2 rounded-lg font-bold">회전</button></div>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={checkSPAnswer} className="w-full max-w-md mx-auto block mt-12 bg-indigo-600 text-white font-black text-2xl py-5 rounded-2xl">✅ 제출하기</button>
          </div>
        )}
      </div>
    );
  }

  if (appMode === 'MP_LOBBY') {
    return (
      <div className="min-h-screen bg-slate-900 p-8 text-white max-w-5xl mx-auto flex flex-col md:flex-row gap-8">
        <div className="flex-1 flex flex-col gap-6">
          <div className="flex justify-between items-center mb-4"><h1 className="text-4xl font-black text-emerald-400">👥 멀티 로비</h1><button onClick={leaveEverything} className="bg-slate-800 px-4 py-2 rounded-xl">뒤로</button></div>
          <button onClick={() => setAppMode('MP_INDIV_LOBBY')} className="bg-slate-800 border-4 border-sky-500 p-10 rounded-3xl hover:bg-slate-700 transition flex items-center justify-between">
            <div className="text-left"><h2 className="text-3xl font-black">⚔️ 개인전</h2><p className="text-slate-400 mt-2">2~20명 배틀로얄 방 개설 및 입장</p></div><span className="text-4xl">➡</span>
          </button>
          <button onClick={() => setAppMode('MP_TEAM_LOBBY')} className="bg-slate-800 border-4 border-amber-500 p-10 rounded-3xl hover:bg-slate-700 transition flex items-center justify-between">
            <div className="text-left"><h2 className="text-3xl font-black">🤝 팀전</h2><p className="text-slate-400 mt-2">4인 1조 팀 매치 방 개설 및 도전</p></div><span className="text-4xl">➡</span>
          </button>
        </div>
        <div className="w-full md:w-80 bg-slate-800 p-6 rounded-3xl border border-slate-700 h-fit">
          <h2 className="text-xl font-bold mb-4 text-center border-b border-slate-700 pb-2">🎖️ 멀티 누적 포인트 랭킹</h2>
          {mpRanks.length === 0 ? <p className="text-center text-slate-500 py-4">아직 기록이 없습니다.</p> : mpRanks.map((r, i) => (
            <div key={i} className="flex justify-between items-center bg-slate-900 p-3 rounded-xl mb-2 font-bold text-sm">
              <span className="truncate w-32"><span className="text-emerald-400 mr-2">{i+1}위</span> {r.name}</span><span className="text-sky-400">{r.score} PT</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (appMode === 'MP_INDIV_LOBBY') {
    return (
      <div className="min-h-screen bg-slate-900 p-8 text-white max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4"><h1 className="text-3xl font-black text-sky-400">⚔️ 개인전 로비</h1><button onClick={()=>setAppMode('MP_LOBBY')} className="bg-slate-800 px-4 py-2 rounded-xl">뒤로</button></div>
        <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700 flex flex-col md:flex-row gap-4 mb-8">
          <select id="maxP" className="bg-slate-900 p-4 rounded-xl font-bold border border-slate-600 outline-none w-full md:w-auto flex-1">{[2,4,10,20].map(n => <option key={n} value={n}>{n}명 방 만들기</option>)}</select>
          <button onClick={() => createIndivRoom(Number((document.getElementById('maxP') as any).value))} className="bg-sky-600 font-black px-8 py-4 rounded-xl hover:bg-sky-500">방 개설하기</button>
        </div>
        <div className="space-y-4">
          {rooms.filter(r=>r.type==='individual').map(r => (
            <div key={r.id} onClick={() => joinIndivRoom(r)} className="bg-slate-800 p-5 rounded-2xl border border-slate-700 flex justify-between items-center cursor-pointer hover:bg-slate-700">
              <div><h3 className="font-bold text-xl">{r.roomName}</h3><p className="text-sm text-slate-400">{(r.players||[]).length} / {r.maxPlayers} 명 대기중</p></div>
              {r.hostId === myId ? <button onClick={(e) => { e.stopPropagation(); deleteDoc(doc(db,'pixy_rooms',r.id)); }} className="bg-rose-500 px-4 py-2 rounded-xl font-bold">삭제</button> : <span className="bg-sky-500 px-6 py-2 rounded-xl font-bold">참가</span>}
            </div>
          ))}
          {rooms.filter(r=>r.type==='individual').length === 0 && <p className="text-center text-slate-500 py-12">개설된 개인전 방이 없습니다.</p>}
        </div>
      </div>
    );
  }

  if (appMode === 'MP_INDIV_WAIT') {
    if (!roomData) return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">데이터 로딩 중...</div>;
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white text-center p-6">
        <h1 className="text-4xl font-black mb-4 text-sky-400">{roomData.roomName}</h1>
        <p className="text-slate-400 mb-8">모두 준비가 완료되면 방장이 시작 버튼을 누릅니다.</p>
        <div className="flex flex-wrap gap-4 justify-center max-w-2xl mb-12">
          {(roomData.players||[]).map((p:any) => <div key={p.id} className="bg-slate-800 px-6 py-3 rounded-2xl font-bold">{p.id===roomData.hostId?'👑':''} {p.name}</div>)}
        </div>
        <div className="flex gap-4">
          <button onClick={leaveEverything} className="px-8 py-4 bg-slate-800 rounded-2xl font-bold">방 나가기</button>
          {roomData.hostId === myId && <button onClick={startIndivGame} className="px-12 py-4 bg-sky-600 rounded-2xl font-black text-xl">🚀 게임 시작</button>}
        </div>
      </div>
    );
  }

  if (appMode === 'MP_TEAM_LOBBY') {
    return (
      <div className="min-h-screen bg-slate-900 p-8 text-white max-w-5xl mx-auto">
        <Toaster />
        <div className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4"><h1 className="text-3xl font-black text-amber-400">🤝 팀 매칭 로비</h1><button onClick={()=>setAppMode('MP_LOBBY')} className="bg-slate-800 px-4 py-2 rounded-xl">뒤로</button></div>
        <div className="bg-slate-800 p-6 rounded-3xl border border-slate-700 flex flex-col md:flex-row gap-4 mb-8">
          <input id="tName" type="text" placeholder="멋진 팀 이름을 입력하세요" className="flex-1 bg-slate-900 p-4 rounded-xl font-bold border border-slate-600 outline-none" />
          <button onClick={() => createTeam((document.getElementById('tName') as any).value)} className="bg-amber-600 px-8 py-4 font-black rounded-xl hover:bg-amber-500 text-slate-900 w-full md:w-auto">우리 팀 만들기</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {teams.map(t => (
            <div key={t.id} className="bg-slate-800 p-5 rounded-3xl border border-slate-700">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-black text-xl text-amber-400">{t.name} <span className="text-sm text-slate-400 ml-2">({(t.members||[]).length}/4)</span></h3>
                {t.hostId === myId ? <button onClick={() => deleteDoc(doc(db,'pixy_teams',t.id))} className="text-rose-500 text-sm font-bold bg-rose-500/10 px-3 py-1 rounded-lg">해체</button> : 
                 !myTeamId && <button onClick={() => joinTeam(t)} className="bg-slate-700 px-4 py-1.5 rounded-lg font-bold text-sm hover:bg-slate-600">합류하기</button>}
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {(t.members||[]).map((m:any) => <span key={m.id} className="bg-slate-900 px-3 py-1 rounded-full text-xs font-bold border border-slate-700">{m.id===t.hostId?'👑':''} {m.name}</span>)}
              </div>
              {myTeamId && teamData?.hostId === myId && t.id !== myTeamId && (
                <button onClick={() => sendChallenge(t)} className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 rounded-xl">⚔️ 이 팀에 대결 신청</button>
              )}
            </div>
          ))}
          {teams.length === 0 && <p className="text-center text-slate-500 py-12 md:col-span-2">결성된 팀이 없습니다.</p>}
        </div>
      </div>
    );
  }

  if (appMode === 'MP_TEAM_WAIT') {
    if (!teamData) return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">데이터 로딩 중...</div>;
    const isHost = teamData.hostId === myId;
    return (
      <div className="min-h-screen bg-slate-900 p-8 text-white flex flex-col items-center justify-center text-center">
        <h1 className="text-4xl font-black text-amber-400 mb-4">{teamData.name}</h1>
        <p className="text-slate-400 mb-8">팀원이 모이면 방장이 로비에서 다른 팀에게 대결을 신청할 수 있습니다.</p>
        <div className="flex flex-wrap justify-center gap-4 mb-12">
          {(teamData.members||[]).map((m:any) => <div key={m.id} className="bg-slate-800 px-6 py-3 rounded-2xl font-bold border border-slate-700">{m.id===teamData.hostId?'👑':''} {m.name}</div>)}
        </div>
        {isHost && teamData.challengeRequest && (
          <div className="bg-rose-500/20 border-4 border-rose-500 p-8 rounded-3xl animate-pulse">
            <h2 className="text-2xl font-black mb-4">🚨 대결 신청 도착!</h2>
            <p className="mb-6 font-bold text-lg">[{teamData.challengeRequest.fromTeamName}] 팀이 도전장을 내밀었습니다!</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button onClick={acceptChallenge} className="bg-rose-600 text-white font-black px-8 py-3 rounded-xl hover:bg-rose-500">수락하고 게임 시작!</button>
              <button onClick={() => updateDoc(doc(db,'pixy_teams',myTeamId!), { challengeRequest: null })} className="bg-slate-800 text-slate-300 font-bold px-8 py-3 rounded-xl">거절</button>
            </div>
          </div>
        )}
        <button onClick={leaveEverything} className="mt-12 text-slate-500 underline hover:text-white">팀 탈퇴하기</button>
      </div>
    );
  }

  // 🛠️ 치명적 오류 수정 파트: 스테이지 결과창
  if (appMode === 'STAGE_RESULT') {
    if (!roomData) return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">데이터 로딩 중...</div>;
    const amIHost = roomData.hostId === myId;
    const isTeam = roomData.type === 'team';
    
    let rankingUI = null;
    if (isTeam) {
      const sortedTeams = Object.entries(roomData.teamScores || {}).sort(([,a], [,b]) => (b as number) - (a as number));
      rankingUI = sortedTeams.map(([tId, score], idx) => (
         <div key={tId} className={`flex justify-between items-center p-4 mb-2 rounded-xl border ${idx === 0 ? 'bg-amber-500/20 border-amber-500' : 'bg-slate-900 border-slate-700'}`}>
            <span className={`text-2xl font-black ${idx === 0 ? 'text-amber-400' : 'text-slate-500'}`}>{idx + 1}위 {tId === myTeamId ? '(우리팀)' : ''}</span>
            <span className="text-xl font-black text-emerald-400">{score as number}점</span>
         </div>
      ));
    } else {
      const sortedPlayers = [...(roomData.players||[])].sort((a, b) => b.score - a.score);
      rankingUI = sortedPlayers.map((p, idx) => (
         <div key={p.id} className={`flex justify-between items-center p-4 mb-2 rounded-xl border ${idx === 0 ? 'bg-amber-500/20 border-amber-500' : 'bg-slate-900 border-slate-700'}`}>
            <span className={`text-2xl font-black ${idx === 0 ? 'text-amber-400' : 'text-slate-500'}`}>{idx + 1}위 {p.name}</span>
            <span className="text-xl font-black text-emerald-400">{p.score}점</span>
         </div>
      ));
    }

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center">
        <h1 className="text-5xl font-black mb-4 text-amber-400">🏆 STAGE {(roomData.currentStageIdx||0) + 1} 종료!</h1>
        <p className="text-xl font-bold text-slate-300 mb-8">이번 스테이지의 누적 점수 순위입니다.</p>
        
        <div className="bg-slate-800 p-8 rounded-3xl border-4 border-amber-500/50 w-full max-w-2xl mb-8 shadow-2xl">
          {rankingUI}
        </div>

        {amIHost ? (
          // 방장 전용 '다음 스테이지 진행' 또는 '엔딩' 처리 버튼
          <button onClick={handleNextStage} className="bg-emerald-500 text-slate-900 px-12 py-4 rounded-2xl font-black text-2xl hover:bg-emerald-400 shadow-xl">다음 스테이지 시작 ➡</button>
        ) : (
          <p className="text-slate-500 font-bold animate-pulse">방장이 다음 스테이지를 준비 중입니다...</p>
        )}
        <button onClick={leaveEverything} className="mt-8 text-slate-500 underline">로비로 나가기</button>
      </div>
    );
  }

  if (appMode === 'MP_INDIV_PLAY' || appMode === 'MP_TEAM_PLAY') {
    if (!roomData) return <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white"><div className="text-4xl animate-spin mb-4">⏳</div><h2 className="text-xl font-bold">서버 동기화 중...</h2></div>;

    const isTeam = roomData.type === 'team';
    const sIdx = roomData.currentStageIdx || 0;
    const lIdx = roomData.currentLevelIdx || 0;
    
    const activeStage = STAGE_MISSIONS[sIdx];
    if (!activeStage) return <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center"><p className="mb-4">데이터 오류가 발생했습니다.</p><button onClick={performEmergencyReset} className="bg-rose-500 p-4 rounded-xl font-bold">강제 초기화</button></div>;
    const activeLevel = activeStage.levels[lIdx] || activeStage.levels[0];

    const teamCubeData = isTeam && myTeamId && roomData?.teamCubes?.[myTeamId] ? roomData.teamCubes[myTeamId] : null;
    const currentCubes = teamCubeData ? [teamCubeData["0"], teamCubeData["1"], teamCubeData["2"], teamCubeData["3"]] : playerCubes;
    
    const myTeamMemberIndex = isTeam && teamData?.members ? teamData.members.findIndex((m:any) => m.id === myId) : -1;
    const teamSize = isTeam && teamData?.members ? teamData.members.length : 1;
    const myControlledCubes = isTeam ? [0,1,2,3].filter(i => i % teamSize === myTeamMemberIndex) : [0,1,2,3];

    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-between p-6 pb-12 font-sans selection:bg-indigo-500">
        <Toaster position="top-center" />
        
        <header className="w-full max-w-5xl flex justify-between items-center mb-6 border-b border-slate-800 pb-4">
          <button onClick={leaveEverything} className="bg-slate-800 px-4 py-2 rounded-xl text-sm font-bold">종료</button>
          <div className="text-center">
            <span className={`px-4 py-1.5 rounded-full font-black text-xs md:mr-2 block md:inline-block mb-2 md:mb-0 ${isTeam ? 'bg-amber-600' : 'bg-sky-600'}`}>STAGE {activeStage.stage} - {activeLevel.level}/20</span>
            <span className="text-xl md:text-2xl font-black block md:inline-block">{activeStage.title}</span>
          </div>
          <div className="text-right text-xs md:text-sm font-bold bg-slate-800 px-3 md:px-4 py-2 rounded-xl whitespace-nowrap">
             {isTeam ? `팀: ${roomData.teamScores?.[myTeamId!]||0} PT` : `내점수: ${roomData.players?.find((p:any)=>p.id===myId)?.score || 0} PT`}
          </div>
        </header>

        <main className="w-full max-w-5xl flex flex-col md:flex-row items-center justify-center gap-12">
          <div className="bg-slate-800 p-8 rounded-[3rem] border-4 border-slate-700 flex flex-col items-center">
            <span className="text-slate-400 font-bold mb-4">🎯 목표 무늬</span>
            <div className="grid grid-cols-2 gap-0 w-[200px] h-[200px] rounded-2xl overflow-hidden bg-slate-900">
              {activeLevel.design.map((d:any, i:number) => <div key={i} className="w-[100px] h-[100px]"><CubeFaceRenderer face={CUBE_TEMPLATES[CUBE_KEYS[i]][d.faceIdx]} customRotation={d.rot} isSeamless={true} /></div>)}
            </div>
          </div>

          <div className="bg-slate-800/50 p-6 rounded-[2.5rem] border-4 border-slate-700 flex flex-col items-center">
             <span className="text-slate-400 font-bold mb-4">{isTeam ? '🤝 공유 보드 (노란 테두리: 내 담당)' : '🕹️ 내 조작판'}</span>
             <div className="grid grid-cols-2 gap-6">
                {currentCubes.map((cube, idx) => {
                  const isMine = myControlledCubes.includes(idx);
                  return (
                    <div key={idx} className="flex flex-col items-center">
                      <div className="w-[100px] h-[100px] mb-3 relative">
                        <CubeFaceRenderer face={CUBE_TEMPLATES[CUBE_KEYS[idx]][cube.faceIdx]} customRotation={cube.rot} isHighlighted={isTeam && isMine} />
                      </div>
                      <div className="flex gap-1.5">
                        <button disabled={!isMine} onClick={()=>handleCubeControl(idx,'face')} className={`text-[11px] px-2.5 py-1.5 rounded-lg font-bold ${isMine?'bg-slate-700 hover:bg-slate-600 active:scale-95':'bg-slate-800 text-slate-600'}`}>면변경</button>
                        <button disabled={!isMine} onClick={()=>handleCubeControl(idx,'rot')} className={`text-[11px] px-2.5 py-1.5 rounded-lg font-bold ${isMine?'bg-indigo-600 hover:bg-indigo-500 active:scale-95':'bg-slate-800 text-slate-600'}`}>회전</button>
                      </div>
                    </div>
                  );
                })}
             </div>
          </div>
        </main>
        
        <button onClick={submitMpAnswer} className={`mt-12 w-full max-w-md text-white font-black text-2xl py-5 rounded-2xl active:scale-95 shadow-xl transition-all ${isTeam ? 'bg-amber-600 hover:bg-amber-500 border-b-4 border-amber-800' : 'bg-sky-600 hover:bg-sky-500 border-b-4 border-sky-800'}`}>
          ✅ 제출하기
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-4xl mb-4">⚠️ 시스템 오류 복구 중...</h1>
      <p className="text-slate-400 mb-8">이전 데이터와 충돌이 발생했습니다. 초기화해주세요.</p>
      <button onClick={performEmergencyReset} className="px-8 py-4 bg-rose-600 rounded-2xl font-black text-xl">초기화 및 홈으로</button>
    </div>
  );
}