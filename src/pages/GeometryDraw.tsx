// src/pages/GeometryDraw.tsx
import React, { useState, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';

// --- 타입 및 설정 ---
type Unit = 'cm' | 'm' | 'km';
type Tool = 'triangle' | 'rect' | 'parallelogram' | 'trapezoid' | 'rhombus';
type Mode = 'free' | 'mission';

interface Point { x: number; y: number }

interface ShapeMetrics {
  base?: number;
  height?: number;
  topBase?: number;
  diag1?: number;
  diag2?: number;
  hLine?: { x1: number; y1: number; x2: number; y2: number }; // 높이 보조선
}

interface Shape { 
  id: string; 
  type: Tool; 
  points: Point[]; 
  area: number;
  metrics: ShapeMetrics;
}

const GRID_SIZE = 40; // 모눈 1칸 = 40px

// 미션 윤곽선 데이터 (집 모양)
const MISSION_OUTLINE: Point[] = [
  { x: 4, y: 8 }, { x: 10, y: 2 }, { x: 16, y: 8 }, { x: 16, y: 14 }, { x: 4, y: 14 }
];

// 신발끈 공식 (미션 윤곽선 넓이 계산용)
const calculateShoelaceArea = (points: Point[]): number => {
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
  
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });

  const [answerArea, setAnswerArea] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);

  // --- 스마트 작도 로직 (모눈 교차점 스냅 & 수평 고정) ---
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!tool || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    
    // 🔥 해결 1: SVG 내부 격자망(0,0 기준)과 완벽하게 일치하도록 스냅 좌표 계산
    let snapX = Math.round((e.clientX - rect.left) / GRID_SIZE);
    let snapY = Math.round((e.clientY - rect.top) / GRID_SIZE);
    
    // 🔥 해결 2: 밑변을 무조건 수평으로 그리도록 강제 유도 (5학년 과정 최적화)
    if (['triangle', 'parallelogram', 'trapezoid'].includes(tool) && currentPoints.length === 1) {
      snapY = currentPoints[0].y; // 밑변 끝점은 무조건 시작점과 같은 높이
    }
    // 사다리꼴의 윗변(4번째 점)도 무조건 3번째 점과 수평이 되도록 강제
    if (tool === 'trapezoid' && currentPoints.length === 3) {
      snapY = currentPoints[2].y;
    }

    setMousePos({ x: snapX, y: snapY });
  };

  const handlePointerDown = () => {
    if (!tool) { toast('먼저 그릴 도형 도구를 선택해주세요!', { icon: '👆' }); return; }
    
    const newPt = { ...mousePos };
    
    // 같은 자리에 연속 클릭하는 실수 방지
    if (currentPoints.length > 0) {
      const lastPt = currentPoints[currentPoints.length - 1];
      if (lastPt.x === newPt.x && lastPt.y === newPt.y) return;
    }

    const pts = [...currentPoints, newPt];
    
    // 도형별 완성 로직
    if (tool === 'triangle' && pts.length === 3) {
      finishShape(tool, pts);
    } 
    else if (tool === 'rect' && pts.length === 2) {
      const p1 = pts[0]; const p2 = pts[1];
      finishShape(tool, [p1, {x: p2.x, y: p1.y}, p2, {x: p1.x, y: p2.y}]);
    }
    else if (tool === 'parallelogram' && pts.length === 3) {
      const p1 = pts[0]; const p2 = pts[1]; const p3 = pts[2];
      const p4 = { x: p3.x - (p2.x - p1.x), y: p3.y }; // 평행사변형 4번째 점 자동 계산
      finishShape(tool, [p1, p2, p3, p4]);
    }
    else if (tool === 'trapezoid' && pts.length === 4) {
      finishShape(tool, pts);
    }
    else if (tool === 'rhombus' && pts.length === 2) {
      const center = pts[0]; const corner = pts[1];
      const dx = Math.abs(corner.x - center.x);
      const dy = Math.abs(corner.y - center.y);
      finishShape(tool, [
        { x: center.x, y: center.y - dy }, { x: center.x + dx, y: center.y },
        { x: center.x, y: center.y + dy }, { x: center.x - dx, y: center.y }
      ]);
    } else {
      setCurrentPoints(pts);
    }
  };

  // 🔥 5학년 교육과정 맞춤 측정 (밑변, 높이 등 공식 데이터 추출)
  const finishShape = (type: Tool, finalPts: Point[]) => {
    let area = 0;
    let metrics: ShapeMetrics = {};

    try {
      if (type === 'triangle') {
        const base = Math.abs(finalPts[1].x - finalPts[0].x);
        const height = Math.abs(finalPts[2].y - finalPts[0].y);
        if (base === 0 || height === 0) throw new Error();
        area = (base * height) / 2;
        metrics = { base, height, hLine: { x1: finalPts[2].x, y1: finalPts[2].y, x2: finalPts[2].x, y2: finalPts[0].y } };
      } 
      else if (type === 'rect') {
        const base = Math.abs(finalPts[1].x - finalPts[0].x);
        const height = Math.abs(finalPts[2].y - finalPts[0].y);
        if (base === 0 || height === 0) throw new Error();
        area = base * height;
        metrics = { base, height };
      }
      else if (type === 'parallelogram') {
        const base = Math.abs(finalPts[1].x - finalPts[0].x);
        const height = Math.abs(finalPts[2].y - finalPts[0].y);
        if (base === 0 || height === 0) throw new Error();
        area = base * height;
        metrics = { base, height, hLine: { x1: finalPts[2].x, y1: finalPts[2].y, x2: finalPts[2].x, y2: finalPts[0].y } };
      }
      else if (type === 'trapezoid') {
        const base = Math.abs(finalPts[1].x - finalPts[0].x);
        const topBase = Math.abs(finalPts[3].x - finalPts[2].x);
        const height = Math.abs(finalPts[2].y - finalPts[0].y);
        if (base === 0 || topBase === 0 || height === 0) throw new Error();
        area = ((base + topBase) * height) / 2;
        metrics = { base, topBase, height, hLine: { x1: finalPts[2].x, y1: finalPts[2].y, x2: finalPts[2].x, y2: finalPts[0].y } };
      }
      else if (type === 'rhombus') {
        const diag1 = 2 * Math.abs(finalPts[1].x - finalPts[0].x);
        const diag2 = 2 * Math.abs(finalPts[2].y - finalPts[0].y);
        if (diag1 === 0 || diag2 === 0) throw new Error();
        area = (diag1 * diag2) / 2;
        metrics = { diag1, diag2 };
      }
    } catch {
      toast.error('도형의 형태가 올바르지 않습니다. 다시 그려주세요.');
      setCurrentPoints([]); return;
    }
    
    const newShape: Shape = { id: `sh_${Date.now()}`, type, points: finalPts, area, metrics };
    setShapes([...shapes, newShape]);
    setCurrentPoints([]);
    setTool(null);
    toast.success('도형 작도 완료!');
  };

  // --- 정답 확인 ---
  const checkAnswer = () => {
    if (shapes.length === 0) { toast.error('먼저 모눈종이에 도형을 그려주세요!'); return; }
    
    const totalDrawnArea = shapes.reduce((sum, sh) => sum + sh.area, 0);
    const userAnswer = Number(answerArea);

    if (mode === 'free') {
      if (userAnswer === totalDrawnArea) {
        toast.success(`🎉 정답입니다! (총 넓이: ${totalDrawnArea} ${unit}²)`, { duration: 4000 });
        setShapes([]); setAnswerArea('');
      } else {
        toast.error('앗, 계산이 틀렸어요. 도형의 밑변과 높이를 다시 확인해 보세요!');
      }
    } else if (mode === 'mission') {
      const targetArea = calculateShoelaceArea(MISSION_OUTLINE);
      if (userAnswer !== totalDrawnArea) {
        toast.error(`입력한 넓이가 틀렸습니다. 공식에 맞게 다시 계산해 보세요.`);
        return;
      }
      if (totalDrawnArea !== targetArea) {
        toast.error(`넓이는 맞게 계산했지만, 윤곽선에 빈틈이 있거나 도형이 윤곽선을 삐져나갔습니다!`);
        return;
      }
      toast.success(`🏆 미션 클리어! 윤곽선을 완벽하게 채우고 넓이(${targetArea} ${unit}²)도 맞췄습니다!`, { duration: 5000, icon: '🌟' });
      setShapes([]); setAnswerArea('');
    }
  };

  // --- 시각적 렌더링 헬퍼 ---
  const renderShapeMetrics = (sh: Shape) => {
    const { type, metrics, points } = sh;
    const G = GRID_SIZE;
    const m = metrics;
    
    // 점선 보조선 그리기
    const hLine = m.hLine ? <line x1={m.hLine.x1 * G} y1={m.hLine.y1 * G} x2={m.hLine.x2 * G} y2={m.hLine.y2 * G} stroke="#ef4444" strokeWidth="2" strokeDasharray="5,5" /> : null;
    
    const labels = [];
    const textStyle = "fill-slate-700 font-bold text-sm pointer-events-none select-none drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)]";

    if (type === 'triangle' || type === 'parallelogram') {
      const p0 = points[0]; const p1 = points[1];
      labels.push(<text key="base" x={((p0.x + p1.x)/2) * G} y={p0.y * G + 20} textAnchor="middle" className={textStyle}>{m.base} {unit}</text>);
      if (m.hLine) labels.push(<text key="height" x={m.hLine.x1 * G + 10} y={((m.hLine.y1 + m.hLine.y2)/2) * G} alignmentBaseline="middle" className="fill-red-600 font-bold text-sm pointer-events-none">{m.height} {unit}</text>);
    } 
    else if (type === 'rect') {
      const p0 = points[0]; const p2 = points[2];
      labels.push(<text key="base" x={((p0.x + p2.x)/2) * G} y={Math.max(p0.y, p2.y) * G + 20} textAnchor="middle" className={textStyle}>{m.base} {unit}</text>);
      labels.push(<text key="height" x={Math.max(p0.x, p2.x) * G + 10} y={((p0.y + p2.y)/2) * G} alignmentBaseline="middle" className={textStyle}>{m.height} {unit}</text>);
    }
    else if (type === 'trapezoid') {
      const p0 = points[0]; const p1 = points[1]; const p2 = points[2]; const p3 = points[3];
      labels.push(<text key="base" x={((p0.x + p1.x)/2) * G} y={p0.y * G + 20} textAnchor="middle" className={textStyle}>{m.base} {unit}</text>);
      labels.push(<text key="topBase" x={((p2.x + p3.x)/2) * G} y={p2.y * G - 10} textAnchor="middle" className={textStyle}>{m.topBase} {unit}</text>);
      if (m.hLine) labels.push(<text key="height" x={m.hLine.x1 * G + 10} y={((m.hLine.y1 + m.hLine.y2)/2) * G} alignmentBaseline="middle" className="fill-red-600 font-bold text-sm pointer-events-none">{m.height} {unit}</text>);
    }
    else if (type === 'rhombus') {
      const center = points[0];
      // 마름모 대각선 보조선
      labels.push(<line key="d1" x1={(center.x - m.diag1!/2)*G} y1={center.y*G} x2={(center.x + m.diag1!/2)*G} y2={center.y*G} stroke="#ef4444" strokeWidth="2" strokeDasharray="5,5" />);
      labels.push(<line key="d2" x1={center.x*G} y1={(center.y - m.diag2!/2)*G} x2={center.x*G} y2={(center.y + m.diag2!/2)*G} stroke="#ef4444" strokeWidth="2" strokeDasharray="5,5" />);
      labels.push(<text key="t1" x={center.x * G} y={(center.y - m.diag2!/2) * G - 10} textAnchor="middle" className={textStyle}>{m.diag1} {unit}</text>);
      labels.push(<text key="t2" x={(center.x + m.diag1!/2) * G + 10} y={center.y * G} alignmentBaseline="middle" className={textStyle}>{m.diag2} {unit}</text>);
    }

    return <g>{hLine}{labels}</g>;
  };

  const renderPreview = () => {
    if (!tool || currentPoints.length === 0) return null;
    const p0 = currentPoints[0];
    const p = mousePos;
    const G = GRID_SIZE;
    
    let poly = null;
    if (tool === 'rect') poly = `${p0.x*G},${p0.y*G} ${p.x*G},${p0.y*G} ${p.x*G},${p.y*G} ${p0.x*G},${p.y*G}`;
    else if (tool === 'rhombus') {
      const dx = Math.abs(p.x - p0.x); const dy = Math.abs(p.y - p0.y);
      poly = `${p0.x*G},${(p0.y-dy)*G} ${(p0.x+dx)*G},${p0.y*G} ${p0.x*G},${(p0.y+dy)*G} ${(p0.x-dx)*G},${p0.y*G}`;
    }
    else if (currentPoints.length === 1) poly = `${p0.x*G},${p0.y*G} ${p.x*G},${p.y*G}`;
    else if (currentPoints.length === 2) {
      const p1 = currentPoints[1];
      if (tool === 'triangle') poly = `${p0.x*G},${p0.y*G} ${p1.x*G},${p1.y*G} ${p.x*G},${p.y*G}`;
      else if (tool === 'parallelogram') poly = `${p0.x*G},${p0.y*G} ${p1.x*G},${p1.y*G} ${(p.x+(p1.x-p0.x))*G},${p.y*G} ${p.x*G},${p.y*G}`;
      else if (tool === 'trapezoid') poly = `${p0.x*G},${p0.y*G} ${p1.x*G},${p1.y*G} ${p.x*G},${p.y*G}`;
    }
    else if (currentPoints.length === 3 && tool === 'trapezoid') {
      const p1 = currentPoints[1]; const p2 = currentPoints[2];
      poly = `${p0.x*G},${p0.y*G} ${p1.x*G},${p1.y*G} ${p2.x*G},${p2.y*G} ${p.x*G},${p.y*G}`;
    }

    return poly ? <polygon points={poly} fill="none" stroke="#f59e0b" strokeWidth="3" strokeDasharray="6,4" /> : null;
  };

  const getGuideText = () => {
    if (!tool) return '👆 위에서 그릴 도형을 선택하세요';
    const c = currentPoints.length;
    if (tool === 'triangle') return c===0 ? '밑변의 시작점을 찍어주세요' : c===1 ? '밑변의 끝점을 찍어주세요 (수평 고정)' : '높이를 결정할 꼭짓점을 찍어주세요';
    if (tool === 'rect') return c===0 ? '한쪽 모서리를 찍어주세요' : '반대쪽 대각선 모서리를 찍어주세요';
    if (tool === 'parallelogram') return c===0 ? '밑변의 시작점을 찍어주세요' : c===1 ? '밑변의 끝점을 찍어주세요 (수평 고정)' : '윗변의 왼쪽 꼭짓점을 찍어주세요';
    if (tool === 'trapezoid') return c===0 ? '밑변의 시작점을 찍어주세요' : c===1 ? '밑변의 끝점을 찍어주세요 (수평 고정)' : c===2 ? '윗변의 왼쪽 꼭짓점을 찍어주세요' : '윗변의 오른쪽 끝점을 찍어주세요 (수평 고정)';
    if (tool === 'rhombus') return c===0 ? '마름모의 정중앙(교점)을 찍어주세요' : '마름모의 꼭짓점을 쭉 당겨서 찍어주세요';
    return '';
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center p-6 text-slate-800 font-sans">
      <Toaster position="top-center" />
      
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-black text-indigo-600 mb-2">✍️ 알지오 작도 마스터</h1>
        <p className="text-slate-500 font-bold">모눈종이 교차점에 점을 찍어 정확한 다각형을 작도해 보세요!</p>
      </header>

      {/* 상단 컨트롤 및 도구 모음 */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6 w-full max-w-5xl flex flex-wrap justify-between items-center gap-4">
        
        {/* 모드 전환 */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button onClick={() => { setMode('free'); setShapes([]); }} className={`px-6 py-2 rounded-lg font-black transition ${mode === 'free' ? 'bg-indigo-500 text-white shadow' : 'text-slate-500 hover:bg-slate-200'}`}>자유 작도</button>
          <button onClick={() => { setMode('mission'); setShapes([]); }} className={`px-6 py-2 rounded-lg font-black transition ${mode === 'mission' ? 'bg-rose-500 text-white shadow' : 'text-slate-500 hover:bg-slate-200'}`}>미션 모드</button>
        </div>

        {/* 작도 도구 */}
        <div className="flex gap-2 border-l-2 border-slate-200 pl-4">
          <button onClick={() => { setTool('triangle'); setCurrentPoints([]); }} className={`px-4 py-2 rounded-lg font-bold border-2 transition ${tool === 'triangle' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 hover:border-slate-300'}`}>🔺 삼각형</button>
          <button onClick={() => { setTool('rect'); setCurrentPoints([]); }} className={`px-4 py-2 rounded-lg font-bold border-2 transition ${tool === 'rect' ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-slate-300'}`}>🟦 직사각형</button>
          <button onClick={() => { setTool('parallelogram'); setCurrentPoints([]); }} className={`px-4 py-2 rounded-lg font-bold border-2 transition ${tool === 'parallelogram' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:border-slate-300'}`}>▱ 평행사변형</button>
          <button onClick={() => { setTool('trapezoid'); setCurrentPoints([]); }} className={`px-4 py-2 rounded-lg font-bold border-2 transition ${tool === 'trapezoid' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 hover:border-slate-300'}`}>⏢ 사다리꼴</button>
          <button onClick={() => { setTool('rhombus'); setCurrentPoints([]); }} className={`px-4 py-2 rounded-lg font-bold border-2 transition ${tool === 'rhombus' ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-slate-200 hover:border-slate-300'}`}>💠 마름모</button>
        </div>

        {/* 단위 전환 */}
        <div className="flex items-center gap-2 font-bold text-slate-600 border-l-2 border-slate-200 pl-4">
          단위:
          <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className="p-2 bg-slate-100 rounded-lg outline-none cursor-pointer">
            <option value="cm">cm</option>
            <option value="m">m</option>
            <option value="km">km</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-8 w-full max-w-6xl justify-center items-start">
        
        {/* 모눈종이 캔버스 */}
        <div className="bg-white p-4 rounded-[2rem] shadow-xl border-4 border-slate-300 shrink-0">
          
          <div className="mb-4 text-center font-bold text-slate-500 flex justify-between items-center px-4">
            <span className="text-indigo-600 font-black tracking-tight">{getGuideText()}</span>
            <button onClick={() => { setShapes([]); setCurrentPoints([]); setTool(null); }} className="text-rose-500 hover:underline">모두 지우기</button>
          </div>

          <svg 
            ref={svgRef} width={800} height={600} 
            className={`bg-slate-50 border border-slate-300 rounded-xl transition-colors ${tool ? 'cursor-crosshair hover:bg-slate-100' : 'cursor-default'}`}
            onPointerMove={handlePointerMove} onPointerDown={handlePointerDown}
          >
            {/* 🔥 해결: 완벽한 격자선 패턴 (이제 십자 교차점에 완벽하게 스냅됩니다) */}
            <defs>
              <pattern id="gridLines" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
                <path d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`} fill="none" stroke="#cbd5e1" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#gridLines)" />

            {/* 미션 모드 윤곽선 */}
            {mode === 'mission' && (
              <polygon points={MISSION_OUTLINE.map(p => `${p.x * GRID_SIZE},${p.y * GRID_SIZE}`).join(' ')} fill="#f8fafc" stroke="#94a3b8" strokeWidth="4" strokeDasharray="10,5" strokeLinejoin="round" />
            )}

            {/* 완성된 도형들 */}
            {shapes.map((sh) => (
              <g key={sh.id}>
                <polygon points={sh.points.map(p => `${p.x * GRID_SIZE},${p.y * GRID_SIZE}`).join(' ')} className="fill-indigo-500/20 stroke-indigo-600 transition-all" strokeWidth="3" strokeLinejoin="round" />
                {renderShapeMetrics(sh)}
              </g>
            ))}

            {/* 작도 가이드 프리뷰 */}
            {renderPreview()}

            {/* 작도 중인 점들 */}
            {currentPoints.map((p, i) => (
              <circle key={i} cx={p.x * GRID_SIZE} cy={p.y * GRID_SIZE} r="6" fill="#f59e0b" />
            ))}

            {/* 마우스 커서 스냅 포인트 */}
            {tool && <circle cx={mousePos.x * GRID_SIZE} cy={mousePos.y * GRID_SIZE} r="5" fill="#ef4444" className="pointer-events-none" opacity="0.8" />}
          </svg>
        </div>

        {/* 퀴즈 패널 */}
        <div className="bg-white p-8 rounded-3xl shadow-xl border-4 border-amber-400 w-full max-w-sm flex flex-col gap-6 animate-fade-in">
          <h2 className="text-2xl font-black text-slate-800">
            {mode === 'free' ? '🧠 자유 넓이 탐구' : '🚀 윤곽선 채우기 미션'}
          </h2>
          <p className="text-slate-500 font-bold leading-relaxed">
            {mode === 'free' ? '도형에 표시된 길이를 공식에 대입하여, 화면에 그려진 전체 넓이를 구해보세요.' : '도형을 빈틈없이 겹치지 않게 조립하여 집 모양을 채우고, 전체 넓이를 구하세요!'}
          </p>
          
          <div className="bg-amber-50 p-6 rounded-2xl border border-amber-200 flex flex-col items-center">
            <span className="font-black text-amber-700 mb-2">화면에 그려진 총 넓이</span>
            <div className="flex items-center gap-2">
              <input type="number" step="0.5" value={answerArea} onChange={(e) => setAnswerArea(e.target.value)} className="w-32 p-3 border-2 border-amber-300 rounded-xl text-center font-black text-xl outline-none focus:border-amber-500" />
              <span className="text-xl font-black text-slate-600">{unit}²</span>
            </div>
          </div>

          <button onClick={checkAnswer} className="w-full bg-amber-500 text-white font-black text-xl py-4 rounded-xl hover:bg-amber-400 active:scale-95 transition-all shadow-md mt-2">
            ✅ 정답 확인하기
          </button>
        </div>

      </div>
    </div>
  );
}