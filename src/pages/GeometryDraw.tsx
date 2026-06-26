// src/pages/GeometryDraw.tsx
import React, { useState, useRef, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';

// 🔥 파이어베이스 Firestore 함수들 불러오기
import { collection, doc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, limit, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase'; // 👈 선생님의 firebase 설정 파일 경로에 맞게 수정해 주세요! (예: '../firebase')

// --- 타입 및 설정 ---
type Unit = 'cm' | 'm' | 'km';
type Tool = 'triangle' | 'rect' | 'parallelogram' | 'trapezoid' | 'rhombus';
type Mode = 'free' | 'mission' | 'multi';
type MultiStep = 'lobby' | 'waiting' | 'playing';

interface Point { x: number; y: number }
interface ShapeMetrics { base?: number; height?: number; topBase?: number; diag1?: number; diag2?: number; hLine?: { x1: number; y1: number; x2: number; y2: number }; }
interface Shape { id: string; type: Tool; points: Point[]; area: number; metrics: ShapeMetrics; }
interface Player { id: string; name: string; score: number; isMaster: boolean }
interface Room { id: string; hostName: string; maxUsers: number; status: MultiStep; players: Player[] }

const GRID_SIZE = 40; 

const MISSIONS = [
  { id: 1, name: "🏠 1단계: 귀여운 집 만들기", outline: [ {x: 6, y: 7}, {x: 10, y: 3}, {x: 14, y: 7}, {x: 14, y: 13}, {x: 6, y: 13} ] },
  { id: 2, name: "⛵ 2단계: 돛단배 만들기", outline: [ {x: 10, y: 2}, {x: 16, y: 10}, {x: 14, y: 14}, {x: 6, y: 14}, {x: 4, y: 10} ] },
  { id: 3, name: "🚀 3단계: 우주 로켓 만들기", outline: [ {x:10, y:2}, {x:12, y:6}, {x:15, y:13}, {x:12, y:13}, {x:10, y:15}, {x:8, y:13}, {x:5, y:13}, {x:8, y:6} ] }
];

const calculateArea = (points: Point[]): number => {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += (points[i].x * points[j].y) - (points[j].x * points[i].y);
  }
  return Math.abs(area / 2);
};

export default function GeometryDraw() {
  const [mode, setMode] = useState<Mode>('free');
  const [unit, setUnit] = useState<Unit>('cm');
  const [tool, setTool] = useState<Tool | null>(null);
  
  // 싱글플레이 상태
  const [stage, setStage] = useState<number>(0);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [answerArea, setAnswerArea] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);

  // --- 멀티 대전 파이어베이스 연동 상태 ---
  const [multiStep, setMultiStep] = useState<MultiStep>('lobby');
  const [myName, setMyName] = useState<string>(''); 
  const [myId] = useState<string>(`user_${Math.floor(Math.random() * 100000)}`); // 고유 접속 ID
  
  const [roomMaxUsers, setRoomMaxUsers] = useState<number>(5);
  const [roomList, setRoomList] = useState<Room[]>([]); // 로비에 표시될 방 목록
  const [rankings, setRankings] = useState<any[]>([]); // 실시간 랭킹 목록

  // 현재 접속한 방 데이터
  const [roomId, setRoomId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentTurnId, setCurrentTurnId] = useState<string>(''); // 현재 문제를 내는 사람 ID
  const [problemShapes, setProblemShapes] = useState<Shape[]>([]); // 출제자가 서버에 올린 도형들
  const [problemTotalArea, setProblemTotalArea] = useState<number>(0); // 정답 면적

  // 내 상태 확인 헬퍼
  const amIMaster = players.find(p => p.id === myId)?.isMaster || false;
  const isMyTurn = currentTurnId === myId;

  // 1. 실시간 랭킹 및 방 목록 불러오기 (로비 접속 시)
  useEffect(() => {
    // 랭킹 리스너 (상위 5명)
    const qRank = query(collection(db, 'rankings'), orderBy('score', 'desc'), limit(5));
    const unsubRank = onSnapshot(qRank, (snap) => setRankings(snap.docs.map(d => d.data())));

    // 방 목록 리스너 (대기 중인 방만)
    const qRoom = query(collection(db, 'rooms'));
    const unsubRoom = onSnapshot(qRoom, (snap) => {
      const activeRooms = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Room))
        .filter(r => r.status === 'waiting'); // 게임이 시작되지 않은 방만 표시
      setRoomList(activeRooms);
    });

    return () => { unsubRank(); unsubRoom(); };
  }, []);

  // 2. 현재 방 실시간 동기화 리스너 (방 입장 후)
  useEffect(() => {
    if (!roomId) return;
    const unsub = onSnapshot(doc(db, 'rooms', roomId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setPlayers(data.players || []);
        setMultiStep(data.status); // 방장이 시작 누르면 전원 playing으로 넘어감
        setCurrentTurnId(data.currentTurnId || '');
        setProblemShapes(data.problemShapes || []);
        setProblemTotalArea(data.problemTotalArea || 0);
      } else {
        // 방이 폭파되었거나 삭제된 경우
        toast.error('방장이 게임방을 폭파했습니다.');
        setRoomId(null);
        setMultiStep('lobby');
        setShapes([]); setProblemShapes([]);
      }
    });
    return () => unsub();
  }, [roomId]);

  // --- 작도 로직 (마우스) ---
  const handlePointerMove = (e: React.PointerEvent) => {
    if (mode === 'multi' && multiStep === 'playing' && !isMyTurn) return; // 내 턴 아니면 그리기 차단
    if (!tool || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    let snapX = Math.round((e.clientX - rect.left) / GRID_SIZE);
    let snapY = Math.round((e.clientY - rect.top) / GRID_SIZE);
    
    snapX = Math.max(0, Math.min(snapX, 20)); snapY = Math.max(0, Math.min(snapY, 15));
    
    if (['triangle', 'parallelogram', 'trapezoid'].includes(tool) && currentPoints.length === 1) snapY = currentPoints[0].y;
    if (tool === 'trapezoid' && currentPoints.length === 3) snapY = currentPoints[2].y;
    setMousePos({ x: snapX, y: snapY });
  };

  const handlePointerDown = () => {
    if (mode === 'multi' && multiStep === 'playing' && !isMyTurn) { toast.error('다른 친구가 문제를 내는 시간입니다!'); return; }
    if (!tool) { toast('먼저 그릴 도형 도구를 선택해주세요!', { icon: '👆' }); return; }
    
    const newPt = { ...mousePos };
    if (currentPoints.length > 0) {
      const lastPt = currentPoints[currentPoints.length - 1];
      if (lastPt.x === newPt.x && lastPt.y === newPt.y) return;
    }

    const pts = [...currentPoints, newPt];
    if (tool === 'triangle' && pts.length === 3) finishShape(tool, pts);
    else if (tool === 'rect' && pts.length === 2) {
      const p1 = pts[0]; const p2 = pts[1];
      finishShape(tool, [p1, {x: p2.x, y: p1.y}, p2, {x: p1.x, y: p2.y}]);
    }
    else if (tool === 'parallelogram' && pts.length === 3) {
      const p1 = pts[0]; const p2 = pts[1]; const p3 = pts[2];
      const p4 = { x: p3.x + (p2.x - p1.x), y: p3.y }; 
      finishShape(tool, [p1, p2, p4, p3]);
    }
    else if (tool === 'trapezoid' && pts.length === 4) finishShape(tool, pts);
    else if (tool === 'rhombus' && pts.length === 2) {
      const center = pts[0]; const corner = pts[1];
      const dx = Math.abs(corner.x - center.x); const dy = Math.abs(corner.y - center.y);
      finishShape(tool, [ { x: center.x, y: center.y - dy }, { x: center.x + dx, y: center.y }, { x: center.x, y: center.y + dy }, { x: center.x - dx, y: center.y } ]);
    } else setCurrentPoints(pts);
  };

  const finishShape = (type: Tool, finalPts: Point[]) => {
    let area = 0; let metrics: ShapeMetrics = {};
    try {
      if (type === 'triangle') {
        const base = Math.abs(finalPts[1].x - finalPts[0].x); const height = Math.abs(finalPts[2].y - finalPts[0].y);
        if (base === 0 || height === 0) throw new Error();
        area = (base * height) / 2; metrics = { base, height, hLine: { x1: finalPts[2].x, y1: finalPts[2].y, x2: finalPts[2].x, y2: finalPts[0].y } };
      } 
      else if (type === 'rect') {
        const base = Math.abs(finalPts[1].x - finalPts[0].x); const height = Math.abs(finalPts[2].y - finalPts[0].y);
        if (base === 0 || height === 0) throw new Error();
        area = base * height; metrics = { base, height };
      }
      else if (type === 'parallelogram') {
        const base = Math.abs(finalPts[1].x - finalPts[0].x); const height = Math.abs(finalPts[2].y - finalPts[0].y);
        if (base === 0 || height === 0) throw new Error();
        area = base * height; metrics = { base, height, hLine: { x1: finalPts[2].x, y1: finalPts[2].y, x2: finalPts[2].x, y2: finalPts[0].y } };
      }
      else if (type === 'trapezoid') {
        const base = Math.abs(finalPts[1].x - finalPts[0].x); const topBase = Math.abs(finalPts[3].x - finalPts[2].x); const height = Math.abs(finalPts[2].y - finalPts[0].y);
        if (base === 0 || topBase === 0 || height === 0) throw new Error();
        area = ((base + topBase) * height) / 2; metrics = { base, topBase, height, hLine: { x1: finalPts[2].x, y1: finalPts[2].y, x2: finalPts[2].x, y2: finalPts[0].y } };
      }
      else if (type === 'rhombus') {
        const diag1 = Math.abs(finalPts[1].x - finalPts[3].x); const diag2 = Math.abs(finalPts[2].y - finalPts[0].y);
        if (diag1 === 0 || diag2 === 0) throw new Error();
        area = (diag1 * diag2) / 2; metrics = { diag1, diag2 };
      }
    } catch { toast.error('도형 형태가 올바르지 않습니다.'); setCurrentPoints([]); return; }
    
    setShapes([...shapes, { id: `sh_${Date.now()}`, type, points: finalPts, area, metrics }]); setCurrentPoints([]); setTool(null);
  };

  const checkAnswer = () => {
    if (shapes.length === 0) { toast.error('먼저 도형을 그려주세요!'); return; }
    const totalDrawnArea = shapes.reduce((sum, sh) => sum + sh.area, 0);
    const userAnswer = Number(answerArea);

    if (mode === 'free') {
      if (userAnswer === totalDrawnArea) { toast.success(`🎉 정답! (${totalDrawnArea} ${unit}²)`); setShapes([]); setAnswerArea(''); } 
      else toast.error('계산이 틀렸어요. 도형 길이를 다시 확인해 보세요!');
    } else if (mode === 'mission') {
      const targetArea = calculateArea(MISSIONS[stage].outline);
      if (userAnswer !== totalDrawnArea) { toast.error(`입력한 넓이가 틀렸습니다.`); return; }
      if (totalDrawnArea !== targetArea) { toast.error(`도형이 윤곽선을 벗어났거나 겹쳤습니다!`); return; }

      if (stage < MISSIONS.length - 1) { toast.success(`🎉 클리어! 다음 단계로!`, { icon: '🌟' }); setStage(stage + 1); } 
      else { toast.success(`🏆 모든 미션을 클리어했습니다!`, { icon: '👑' }); setStage(0); }
      setShapes([]); setAnswerArea('');
    }
  };

  // --- 🔥 파이어베이스 멀티 대전 핵심 로직 ---
  const handleCreateRoom = async () => {
    if (!myName.trim()) { toast.error('먼저 닉네임을 입력해 주세요!'); return; }
    const newRoomRef = await addDoc(collection(db, 'rooms'), {
      hostName: myName,
      maxUsers: roomMaxUsers,
      status: 'waiting',
      players: [{ id: myId, name: myName, score: 0, isMaster: true }],
      currentTurnId: '',
      problemShapes: [],
      problemTotalArea: 0
    });
    setRoomId(newRoomRef.id);
    toast.success('게임방이 개설되었습니다!');
  };

  const handleJoinRoom = async (targetRoom: Room) => {
    if (!myName.trim()) { toast.error('먼저 닉네임을 입력해 주세요!'); return; }
    if (targetRoom.players.length >= targetRoom.maxUsers) { toast.error('방에 인원이 가득 찼습니다!'); return; }
    
    await updateDoc(doc(db, 'rooms', targetRoom.id), {
      players: arrayUnion({ id: myId, name: myName, score: 0, isMaster: false })
    });
    setRoomId(targetRoom.id);
    toast.success(`${targetRoom.hostName}님의 방에 입장했습니다!`);
  };

  const handleStartMultiGame = async () => {
    if (!roomId) return;
    await updateDoc(doc(db, 'rooms', roomId), {
      status: 'playing',
      currentTurnId: myId // 방장이 무조건 첫 출제
    });
    toast('게임 시작! 첫 문제는 방장이 출제합니다.', { icon: '🎮' });
  };

  const handleDestroyRoom = async () => {
    if (roomId) await deleteDoc(doc(db, 'rooms', roomId));
  };

  const handleSubmitProblem = async () => {
    if (shapes.length === 0) { toast.error('도형을 한 개 이상 그려야 출제할 수 있습니다!'); return; }
    const totalArea = shapes.reduce((sum, sh) => sum + sh.area, 0);
    
    // 문제를 DB에 전송 (출제자는 나로 유지하여 다른 친구들이 풀게 함)
    await updateDoc(doc(db, 'rooms', roomId!), {
      problemShapes: shapes,
      problemTotalArea: totalArea
    });
    setShapes([]);
    toast.success('문제를 서버에 전송했습니다! 친구들이 풀 때까지 기다려주세요.');
  };

  const handleSolveProblem = async () => {
    if (Number(answerArea) === problemTotalArea) {
      toast.success('🎉 정답을 가장 먼저 맞혔습니다! +10점', { duration: 4000 });
      
      // 내 점수 +10점 올리기
      const updatedPlayers = players.map(p => p.id === myId ? { ...p, score: p.score + 10 } : p);
      
      // 1. 방 정보 업데이트 (턴을 내 턴으로 가져오고 문제 초기화)
      await updateDoc(doc(db, 'rooms', roomId!), {
        players: updatedPlayers,
        currentTurnId: myId, 
        problemShapes: [],
        problemTotalArea: 0
      });

      // 2. 글로벌 랭킹 업데이트 (명예의 전당용)
      const myCurrentScore = updatedPlayers.find(p => p.id === myId)?.score || 10;
      await setDoc(doc(db, 'rankings', myId), { name: myName, score: myCurrentScore }, { merge: true });

      setAnswerArea('');
      toast('이제 내가 출제자입니다! 친구들에게 문제를 내주세요.', { icon: '✏️', duration: 4000 });
    } else {
      toast.error('앗, 계산이 틀렸어요. 다른 친구가 맞히기 전에 다시 도전하세요!');
    }
  };

  // --- 시각적 렌더링 헬퍼 ---
  const renderShapeMetrics = (sh: Shape) => {
    const { type, metrics, points } = sh; const G = GRID_SIZE; const m = metrics;
    const hLine = m.hLine ? <line x1={m.hLine.x1 * G} y1={m.hLine.y1 * G} x2={m.hLine.x2 * G} y2={m.hLine.y2 * G} stroke="#ef4444" strokeWidth="2" strokeDasharray="5,5" /> : null;
    const labels = []; const textStyle = "fill-slate-700 font-bold text-sm pointer-events-none select-none drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]";

    if (type === 'triangle' || type === 'parallelogram') {
      labels.push(<text key="base" x={((points[0].x + points[1].x)/2) * G} y={points[0].y * G + 20} textAnchor="middle" className={textStyle}>{m.base} {unit}</text>);
      if (m.hLine) labels.push(<text key="h" x={m.hLine.x1 * G + 10} y={((m.hLine.y1 + m.hLine.y2)/2) * G} alignmentBaseline="middle" className="fill-red-600 font-bold text-sm pointer-events-none">{m.height} {unit}</text>);
    } else if (type === 'rect') {
      labels.push(<text key="base" x={((points[0].x + points[2].x)/2) * G} y={Math.max(points[0].y, points[2].y) * G + 20} textAnchor="middle" className={textStyle}>{m.base} {unit}</text>);
      labels.push(<text key="h" x={Math.max(points[0].x, points[2].x) * G + 10} y={((points[0].y + points[2].y)/2) * G} alignmentBaseline="middle" className={textStyle}>{m.height} {unit}</text>);
    } else if (type === 'trapezoid') {
      labels.push(<text key="base" x={((points[0].x + points[1].x)/2) * G} y={points[0].y * G + 20} textAnchor="middle" className={textStyle}>{m.base} {unit}</text>);
      labels.push(<text key="tBase" x={((points[2].x + points[3].x)/2) * G} y={points[2].y * G - 10} textAnchor="middle" className={textStyle}>{m.topBase} {unit}</text>);
      if (m.hLine) labels.push(<text key="h" x={m.hLine.x1 * G + 10} y={((m.hLine.y1 + m.hLine.y2)/2) * G} alignmentBaseline="middle" className="fill-red-600 font-bold text-sm pointer-events-none">{m.height} {unit}</text>);
    } else if (type === 'rhombus') {
      const centerX = (points[1].x + points[3].x) / 2; const centerY = (points[0].y + points[2].y) / 2;
      labels.push(<line key="d1" x1={(centerX - m.diag1!/2)*G} y1={centerY*G} x2={(centerX + m.diag1!/2)*G} y2={centerY*G} stroke="#ef4444" strokeWidth="2" strokeDasharray="5,5" />);
      labels.push(<line key="d2" x1={centerX*G} y1={(centerY - m.diag2!/2)*G} x2={centerX*G} y2={(centerY + m.diag2!/2)*G} stroke="#ef4444" strokeWidth="2" strokeDasharray="5,5" />);
      labels.push(<text key="t1" x={centerX * G} y={(centerY - m.diag2!/2) * G - 10} textAnchor="middle" className={textStyle}>{m.diag1} {unit}</text>);
      labels.push(<text key="t2" x={(centerX + m.diag1!/2) * G + 10} y={centerY * G} alignmentBaseline="middle" className={textStyle}>{m.diag2} {unit}</text>);
    }
    return <g>{hLine}{labels}</g>;
  };

  const renderPreview = () => {
    if (!tool || currentPoints.length === 0) return null;
    const p0 = currentPoints[0]; const p = mousePos; const G = GRID_SIZE; let poly = null;
    
    if (tool === 'rect') poly = `${p0.x*G},${p0.y*G} ${p.x*G},${p0.y*G} ${p.x*G},${p.y*G} ${p0.x*G},${p.y*G}`;
    else if (tool === 'rhombus') {
      const dx = Math.abs(p.x - p0.x); const dy = Math.abs(p.y - p0.y);
      poly = `${p0.x*G},${(p0.y-dy)*G} ${(p0.x+dx)*G},${p0.y*G} ${p0.x*G},${(p0.y+dy)*G} ${(p0.x-dx)*G},${p0.y*G}`;
    }
    else if (currentPoints.length === 1) poly = `${p0.x*G},${p0.y*G} ${p.x*G},${p.y*G}`;
    else if (currentPoints.length === 2) {
      if (tool === 'triangle') poly = `${p0.x*G},${p0.y*G} ${currentPoints[1].x*G},${currentPoints[1].y*G} ${p.x*G},${p.y*G}`;
      else if (tool === 'parallelogram') poly = `${p0.x*G},${p0.y*G} ${currentPoints[1].x*G},${currentPoints[1].y*G} ${(p.x+(currentPoints[1].x-p0.x))*G},${p.y*G} ${p.x*G},${p.y*G}`;
      else if (tool === 'trapezoid') poly = `${p0.x*G},${p0.y*G} ${currentPoints[1].x*G},${currentPoints[1].y*G} ${p.x*G},${p.y*G}`;
    }
    else if (currentPoints.length === 3 && tool === 'trapezoid') {
      poly = `${p0.x*G},${p0.y*G} ${currentPoints[1].x*G},${currentPoints[1].y*G} ${currentPoints[2].x*G},${currentPoints[2].y*G} ${p.x*G},${p.y*G}`;
    }
    return poly ? <polygon points={poly} fill="none" stroke="#f59e0b" strokeWidth="3" strokeDasharray="6,4" /> : null;
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center p-6 text-slate-800 font-sans">
      <Toaster position="top-center" />
      
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-black text-indigo-600 mb-2">✍️ 도형 마스터</h1>
        <p className="text-slate-500 font-bold">모눈종이 교차점에 점을 찍어 정확한 다각형을 작도해 보세요!</p>
      </header>

      {/* 상단 탭 메뉴 */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6 w-full max-w-5xl flex flex-wrap justify-between items-center gap-4">
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button onClick={() => { setMode('free'); setShapes([]); setAnswerArea(''); }} className={`px-6 py-2 rounded-lg font-black transition ${mode === 'free' ? 'bg-indigo-500 text-white shadow' : 'text-slate-500 hover:bg-slate-200'}`}>자유 작도</button>
          <button onClick={() => { setMode('mission'); setStage(0); setShapes([]); setAnswerArea(''); }} className={`px-6 py-2 rounded-lg font-black transition ${mode === 'mission' ? 'bg-rose-500 text-white shadow' : 'text-slate-500 hover:bg-slate-200'}`}>미션 모드</button>
          <button onClick={() => { setMode('multi'); if(!roomId) setMultiStep('lobby'); }} className={`px-6 py-2 rounded-lg font-black transition ${mode === 'multi' ? 'bg-violet-600 text-white shadow' : 'text-slate-500 hover:bg-slate-200'}`}>🎮 멀티 대전</button>
        </div>

        {!(mode === 'multi' && multiStep === 'playing' && !isMyTurn) && mode !== 'multi' || (mode === 'multi' && multiStep === 'playing' && isMyTurn) ? (
          <div className="flex gap-2 border-l-2 border-slate-200 pl-4">
            <button onClick={() => { setTool('triangle'); setCurrentPoints([]); }} className={`px-4 py-2 rounded-lg font-bold border-2 transition ${tool === 'triangle' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 hover:border-slate-300'}`}>🔺 삼각형</button>
            <button onClick={() => { setTool('rect'); setCurrentPoints([]); }} className={`px-4 py-2 rounded-lg font-bold border-2 transition ${tool === 'rect' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-slate-300'}`}>🟦 직사각형</button>
            <button onClick={() => { setTool('parallelogram'); setCurrentPoints([]); }} className={`px-4 py-2 rounded-lg font-bold border-2 transition ${tool === 'parallelogram' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:border-slate-300'}`}>▱ 평행사변형</button>
            <button onClick={() => { setTool('trapezoid'); setCurrentPoints([]); }} className={`px-4 py-2 rounded-lg font-bold border-2 transition ${tool === 'trapezoid' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 hover:border-slate-300'}`}>⏢ 사다리꼴</button>
            <button onClick={() => { setTool('rhombus'); setCurrentPoints([]); }} className={`px-4 py-2 rounded-lg font-bold border-2 transition ${tool === 'rhombus' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 hover:border-slate-300'}`}>💠 마름모</button>
          </div>
        ) : null}

        <div className="flex items-center gap-2 font-bold text-slate-600 border-l-2 border-slate-200 pl-4">
          단위:
          <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className="p-2 bg-slate-100 rounded-lg outline-none cursor-pointer">
            <option value="cm">cm</option><option value="m">m</option><option value="km">km</option>
          </select>
        </div>
      </div>

      {/* 🚀 화면 1: 멀티플레이 로비 (진짜 데이터 연결) */}
      {mode === 'multi' && multiStep === 'lobby' && (
        <div className="w-full max-w-5xl bg-white p-10 rounded-[2rem] shadow-xl border-4 border-violet-200 animate-fade-in flex flex-col gap-8">
          
          <div className="flex items-center gap-4 bg-violet-50 p-4 rounded-xl border border-violet-100">
            <span className="font-black text-violet-800 text-xl">내 닉네임 설정:</span>
            <input type="text" placeholder="예: 도형왕지우" value={myName} onChange={(e) => setMyName(e.target.value)} maxLength={10} className="flex-1 p-3 border-2 border-violet-300 rounded-xl font-bold text-lg outline-none focus:border-violet-500" />
          </div>

          <div className="flex flex-col xl:flex-row gap-8">
            {/* 좌측: 실시간 방 목록 */}
            <div className="flex-[2] bg-slate-50 p-6 rounded-2xl border border-slate-200 flex flex-col gap-4 min-h-[300px]">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2">🟢 현재 대기 중인 방</h3>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-500">인원:</span>
                  <input type="number" min="2" max="20" value={roomMaxUsers} onChange={(e)=>setRoomMaxUsers(Number(e.target.value))} className="w-16 p-2 text-center rounded-lg border-2 border-violet-300 outline-none" /> 
                  <button onClick={handleCreateRoom} className="px-6 py-2 bg-violet-600 text-white font-black rounded-lg hover:bg-violet-500 transition-all">방 만들기 +</button>
                </div>
              </div>
              
              <div className="flex flex-col gap-3">
                {roomList.length === 0 ? (
                  <div className="text-center text-slate-400 font-bold py-10">현재 만들어진 방이 없습니다.<br/>방 만들기 버튼을 눌러 먼저 시작해 보세요!</div>
                ) : (
                  roomList.map(room => (
                    <div key={room.id} className="flex justify-between items-center p-4 bg-white rounded-xl shadow-sm border border-slate-200 font-bold">
                      <span className="text-lg text-slate-700">👑 {room.hostName}님의 게임방</span>
                      <div className="flex items-center gap-4">
                        <span className="text-indigo-500">{room.players.length} / {room.maxUsers} 명</span>
                        <button onClick={() => handleJoinRoom(room)} className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-400 active:scale-95 transition-all">입장하기 ➔</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 우측: 랭킹 */}
            <div className="flex-[1] bg-amber-50 p-6 rounded-2xl border border-amber-200">
              <h3 className="text-xl font-black text-amber-800 mb-4 flex items-center gap-2">🏆 실시간 명예의 전당</h3>
              <div className="flex flex-col gap-3">
                {rankings.map((rk, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-white rounded-lg shadow-sm border border-amber-100 font-bold">
                    <span className={`text-lg ${idx === 0 ? 'text-amber-500' : 'text-slate-500'}`}>{idx + 1}위</span>
                    <span className="text-slate-700 truncate max-w-[100px]">{rk.name}</span>
                    <span className="text-indigo-600">{rk.score} 점</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🚀 화면 2: 대기방 */}
      {mode === 'multi' && multiStep === 'waiting' && (
        <div className="w-full max-w-2xl bg-white p-10 rounded-[2rem] shadow-xl border-4 border-violet-300 animate-fade-in text-center flex flex-col gap-6">
          <h2 className="text-3xl font-black text-violet-700">⏳ 대기실</h2>
          <p className="text-slate-500 font-bold">친구들이 접속할 때까지 기다려주세요... (현재 {players.length} 명)</p>
          
          <div className="bg-slate-50 p-6 rounded-2xl flex flex-wrap gap-4 justify-center min-h-[150px] border border-slate-200">
            {players.map(p => (
              <div key={p.id} className="px-4 py-2 bg-white border-2 border-indigo-200 rounded-full font-bold text-indigo-700 flex items-center gap-2 shadow-sm">
                {p.isMaster && '👑'} {p.name}
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-4 mt-4">
            {amIMaster ? (
              <>
                <button onClick={handleDestroyRoom} className="px-6 py-3 bg-rose-100 text-rose-600 font-black rounded-xl hover:bg-rose-200 transition-colors">방 폭파하기</button>
                <button onClick={handleStartMultiGame} className="px-8 py-3 bg-violet-600 text-white font-black rounded-xl shadow-lg hover:bg-violet-500 transition-colors">🚀 게임 시작!</button>
              </>
            ) : (
              <p className="text-violet-600 font-bold animate-pulse">방장이 게임을 시작할 때까지 기다려 주세요...</p>
            )}
          </div>
        </div>
      )}

      {/* 🚀 화면 3: 본 게임 화면 */}
      {(mode !== 'multi' || (mode === 'multi' && multiStep === 'playing')) && (
        <div className="flex flex-col xl:flex-row gap-8 w-full max-w-6xl justify-center items-start">
          
          <div className="bg-white p-4 rounded-[2rem] shadow-xl border-4 border-slate-300 shrink-0 relative">
            <div className="mb-4 text-center font-bold text-slate-500 flex justify-between items-center px-4">
              {mode === 'multi' ? (
                <span className="text-violet-600 font-black text-lg">
                  {isMyTurn ? '✏️ 내 턴입니다! 자유롭게 도형을 여러 개 그려 문제를 출제하세요.' : '🤔 다른 친구가 문제를 내고 있습니다. 대기하세요...'}
                </span>
              ) : (
                <span>{tool ? '✏️ 점을 찍어 도형을 완성하세요' : '👆 위에서 그릴 도형을 선택하세요'}</span>
              )}
              {(!mode || mode !== 'multi' || isMyTurn) && <button onClick={() => { setShapes([]); setCurrentPoints([]); setTool(null); }} className="text-rose-500 hover:underline">모두 지우기</button>}
            </div>

            <svg 
              ref={svgRef} width={800} height={600} 
              className={`bg-slate-50 border border-slate-300 rounded-xl transition-colors ${tool && (!mode || mode!=='multi' || isMyTurn) ? 'cursor-crosshair hover:bg-slate-100' : 'cursor-not-allowed'}`}
              onPointerMove={handlePointerMove} onPointerDown={handlePointerDown}
            >
              <defs><pattern id="gridLines" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse"><path d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`} fill="none" stroke="#cbd5e1" strokeWidth="1"/></pattern></defs>
              <rect width="100%" height="100%" fill="url(#gridLines)" />

              {mode === 'mission' && <polygon points={MISSIONS[stage].outline.map(p => `${p.x * GRID_SIZE},${p.y * GRID_SIZE}`).join(' ')} fill="#f8fafc" stroke="#94a3b8" strokeWidth="4" strokeDasharray="10,5" strokeLinejoin="round" />}
              
              {/* 그려진 도형 (싱글) 또는 출제된 도형 (멀티) */}
              {(mode === 'multi' && !isMyTurn ? problemShapes : shapes).map((sh) => (
                <g key={sh.id}>
                  <polygon points={sh.points.map(p => `${p.x * GRID_SIZE},${p.y * GRID_SIZE}`).join(' ')} className="fill-indigo-500/20 stroke-indigo-600" strokeWidth="3" strokeLinejoin="round" />
                  {renderShapeMetrics(sh)}
                </g>
              ))}

              {renderPreview()}
              {currentPoints.map((p, i) => <circle key={i} cx={p.x * GRID_SIZE} cy={p.y * GRID_SIZE} r="6" fill="#f59e0b" />)}
              {tool && <circle cx={mousePos.x * GRID_SIZE} cy={mousePos.y * GRID_SIZE} r="5" fill="#ef4444" className="pointer-events-none" opacity="0.8" />}
            </svg>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-xl border-4 border-amber-400 w-full max-w-sm flex flex-col gap-6 animate-fade-in">
            {mode === 'multi' ? (
              <>
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-2xl font-black text-violet-700">⚔️ 멀티 대전</h2>
                  {amIMaster && <button onClick={handleDestroyRoom} className="text-sm font-bold text-rose-500 hover:underline">방 폭파</button>}
                </div>
                
                {/* 현재 점수판 */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-2 mb-2">
                  <span className="text-sm font-bold text-slate-500">🎮 우리 방 점수 현황</span>
                  {players.map(p => (
                    <div key={p.id} className="flex justify-between font-bold text-sm">
                      <span className={p.id === myId ? 'text-violet-600' : 'text-slate-700'}>{p.name} {p.id === currentTurnId && '✏️'}</span>
                      <span className="text-indigo-600">{p.score}점</span>
                    </div>
                  ))}
                </div>

                {isMyTurn ? (
                  <div className="flex flex-col gap-4 text-center">
                    <p className="font-bold text-slate-600 bg-slate-100 p-4 rounded-xl">원하는 도형을 여러 개 조합하여<br/>멋진 넓이 문제를 출제해 보세요!</p>
                    <button onClick={handleSubmitProblem} className="w-full bg-violet-600 text-white font-black text-xl py-4 rounded-xl hover:bg-violet-500 shadow-md">
                      📝 문제 제출하기
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <p className="font-bold text-slate-600">친구가 출제한 도형의 전체 넓이를 가장 먼저 맞혀 10점을 획득하세요!</p>
                    <div className="bg-amber-50 p-6 rounded-2xl border border-amber-200 flex flex-col items-center">
                      <span className="font-black text-amber-700 mb-2">정답 입력</span>
                      <div className="flex items-center gap-2">
                        <input type="number" step="0.5" value={answerArea} onChange={(e) => setAnswerArea(e.target.value)} disabled={problemShapes.length === 0} className="w-32 p-3 border-2 border-amber-300 rounded-xl text-center font-black text-xl outline-none disabled:bg-slate-200" />
                        <span className="text-xl font-black text-slate-600">{unit}²</span>
                      </div>
                    </div>
                    <button onClick={handleSolveProblem} disabled={problemShapes.length === 0} className="w-full bg-amber-500 text-white font-black text-xl py-4 rounded-xl hover:bg-amber-400 disabled:bg-slate-300 shadow-md">
                      ✅ 정답 외치기!
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className="text-2xl font-black text-slate-800">{mode === 'free' ? '🧠 자유 넓이 탐구' : <span className="text-rose-500">{MISSIONS[stage].name}</span>}</h2>
                <p className="text-slate-500 font-bold leading-relaxed">{mode === 'free' ? '화면에 그려진 전체 넓이를 구해보세요.' : '윤곽선을 완벽하게 채우고, 전체 넓이를 구하세요!'}</p>
                <div className="bg-amber-50 p-6 rounded-2xl border border-amber-200 flex flex-col items-center">
                  <span className="font-black text-amber-700 mb-2">화면에 그려진 총 넓이</span>
                  <div className="flex items-center gap-2">
                    <input type="number" step="0.5" value={answerArea} onChange={(e) => setAnswerArea(e.target.value)} className="w-32 p-3 border-2 border-amber-300 rounded-xl text-center font-black text-xl outline-none" />
                    <span className="text-xl font-black text-slate-600">{unit}²</span>
                  </div>
                </div>
                <button onClick={checkAnswer} className="w-full bg-amber-500 text-white font-black text-xl py-4 rounded-xl hover:bg-amber-400 active:scale-95 transition-all shadow-md mt-2">✅ 정답 확인하기</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}