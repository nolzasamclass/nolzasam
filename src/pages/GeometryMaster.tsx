// src/pages/GeometryMaster.tsx
import React, { useState, useRef } from 'react';
import toast, { Toaster } from 'react-hot-toast';

export default function GeometryMaster() {
  const [perimeter, setPerimeter] = useState<number | ''>('');
  const [isGenerated, setIsGenerated] = useState(false);
  const [cmToPx, setCmToPx] = useState(30);

  // 도형 단계 상태
  const [shape, setShape] = useState<'rect' | 'triangle' | 'parallelogram' | 'trapezoid' | 'rhombus'>('rect');

  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [topVertexOffset, setTopVertexOffset] = useState(0); 
  const [trapExpand, setTrapExpand] = useState(0); 
  const [trapState, setTrapState] = useState<'normal' | 'duplicated' | 'rotated' | 'attached'>('normal');

  const [rhombusState, setRhombusState] = useState<'normal' | 'separated' | 'combined'>('normal');
  const [rhombusDrag, setRhombusDrag] = useState([{x:0, y:0}, {x:0, y:0}, {x:0, y:0}, {x:0, y:0}]); 

  const [quizMode, setQuizMode] = useState(false);
  const [answers, setAnswers] = useState({ 
    base: '', height: '', area: '', 
    topBase: '', combBase: '', combArea: '', trapArea: '',
    rWidth: '', rHeight: '', rOuterArea: '', rArea: '' 
  });

  const isDragging = useRef(false);
  const activeHandle = useRef<'bottomRight' | 'topVertex' | 'topRightTrap' | 'rhombusTri' | null>(null);
  const draggingTriIdx = useRef<number | null>(null);
  
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const startWidth = useRef(0);
  const startTopOffset = useRef(0);
  const startTrapExpand = useRef(0);
  const startRhombusDrag = useRef([{x:0, y:0}, {x:0, y:0}, {x:0, y:0}, {x:0, y:0}]);

  const handleGenerate = () => {
    const p = Number(perimeter);
    if (!p || p < 4 || p % 2 !== 0) {
      toast.error('둘레는 4 이상의 짝수로 입력해 주세요! (예: 12, 16, 20)');
      return;
    }
    
    const halfPerimeter = p / 2;
    const maxPossibleCm = halfPerimeter - 1;

    const SAFE_AREA_PX = 400;
    let newCmToPx = 30; 
    if (maxPossibleCm * 30 > SAFE_AREA_PX) {
      newCmToPx = Math.max(5, Math.floor(SAFE_AREA_PX / maxPossibleCm));
    }
    setCmToPx(newCmToPx);

    const initialWidth = Math.ceil(halfPerimeter / 2);
    const initialHeight = halfPerimeter - initialWidth;
    
    setWidth(initialWidth);
    setHeight(initialHeight);
    setTopVertexOffset(0);
    setTrapExpand(0);
    setTrapState('normal');
    setRhombusState('normal');
    setRhombusDrag([{x:0,y:0}, {x:0,y:0}, {x:0,y:0}, {x:0,y:0}]);
    setShape('rect'); 
    setIsGenerated(true);
    setQuizMode(false);
  };

  const convertToTriangle = () => { setShape('triangle'); setTopVertexOffset(0); toast.success('반으로 잘라 삼각형을 만들었습니다!', { icon: '✂️' }); };
  const convertToParallelogram = () => { setShape('parallelogram'); setTopVertexOffset(0); toast.success('윗변을 밀어 평행사변형을 만들었습니다!', { icon: '▱' }); };
  const convertToTrapezoid = () => { setShape('trapezoid'); setTrapExpand(-1); setTrapState('normal'); toast.success('사다리꼴로 변형합니다!', { icon: '⏢' }); };
  const convertToRhombus = () => { setShape('rhombus'); setRhombusState('normal'); setRhombusDrag([{x:0,y:0}, {x:0,y:0}, {x:0,y:0}, {x:0,y:0}]); toast.success('직사각형 안쪽으로 마름모를 만들었습니다!', { icon: '💠' }); };

  const handlePointerDown = (e: React.PointerEvent, handle: typeof activeHandle.current, idx?: number) => {
    if (quizMode) return;
    isDragging.current = true;
    activeHandle.current = handle;
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    
    if (handle === 'rhombusTri' && idx !== undefined) {
      draggingTriIdx.current = idx;
      startRhombusDrag.current = [...rhombusDrag];
    } else {
      startWidth.current = width;
      startTopOffset.current = topVertexOffset;
      startTrapExpand.current = trapExpand;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    
    const dx = e.clientX - dragStartX.current;
    const dy = e.clientY - dragStartY.current;
    
    const cmDeltaX = Math.round(dx / cmToPx);
    const cmDeltaY = Math.round(-dy / cmToPx); 

    if (activeHandle.current === 'rhombusTri' && draggingTriIdx.current !== null) {
      const idx = draggingTriIdx.current;
      const newDrag = [...startRhombusDrag.current];
      newDrag[idx] = { x: newDrag[idx].x + dx, y: newDrag[idx].y + dy };
      setRhombusDrag(newDrag);
      return;
    }

    if (shape === 'rect' && activeHandle.current === 'bottomRight') {
      const halfPerimeter = Number(perimeter) / 2;
      const cmDelta = Math.abs(dx) > Math.abs(dy) ? cmDeltaX : cmDeltaY;
      const newWidth = startWidth.current + cmDelta;
      const newHeight = halfPerimeter - newWidth;
      if (newWidth >= 1 && newHeight >= 1) { setWidth(newWidth); setHeight(newHeight); }
    } else if ((shape === 'triangle' || shape === 'parallelogram') && activeHandle.current === 'topVertex') {
      setTopVertexOffset(startTopOffset.current + cmDeltaX);
    } else if (shape === 'trapezoid' && activeHandle.current === 'topRightTrap') {
      const newExpand = startTrapExpand.current + cmDeltaX;
      if (width + 2 * newExpand >= 1) setTrapExpand(newExpand);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDragging.current = false;
    activeHandle.current = null;
    draggingTriIdx.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  // 🔥 함수명 오류 수정 완료
  const checkAnswers = () => {
    let isCorrect = false;

    if (shape === 'rhombus') {
      const outerArea = width * height;
      isCorrect = 
        Number(answers.rWidth) === width &&
        Number(answers.rHeight) === height &&
        Number(answers.rOuterArea) === outerArea &&
        Number(answers.rArea) === outerArea / 2;
    } else if (shape === 'trapezoid' && trapState === 'attached') {
      const topBase = width + 2 * trapExpand;
      const expectedCombBase = width + topBase;
      const expectedCombArea = expectedCombBase * height;
      isCorrect = 
        Number(answers.combBase) === expectedCombBase &&
        Number(answers.height) === height &&
        Number(answers.combArea) === expectedCombArea &&
        Number(answers.trapArea) === expectedCombArea / 2;
    } else if (shape === 'trapezoid' && trapState === 'normal') {
      const topBase = width + 2 * trapExpand;
      isCorrect = 
        Number(answers.topBase) === topBase &&
        Number(answers.base) === width &&
        Number(answers.height) === height &&
        Number(answers.area) === ((topBase + width) * height) / 2;
    } else {
      const expectedArea = (shape === 'rect' || shape === 'parallelogram') ? (width * height) : ((width * height) / 2);
      isCorrect = 
        Number(answers.base) === width &&
        Number(answers.height) === height &&
        Number(answers.area) === expectedArea;
    }

    if (isCorrect) {
      toast.success('🎉 완벽해요! 넓이를 정확히 구했습니다!', { duration: 4000 });
      setQuizMode(false);
      setAnswers({ base: '', height: '', area: '', topBase: '', combBase: '', combArea: '', trapArea: '', rWidth: '', rHeight: '', rOuterArea: '', rArea: '' });
    } else {
      toast.error('앗, 어딘가 틀렸어요. 공식을 다시 생각해 볼까요?');
    }
  };

  const ORIGIN_X = 150; 
  const ORIGIN_Y = 100; 
  const w = width * cmToPx;
  const h = height * cmToPx;
  
  const maxCanvasWidth = Math.max(900, (ORIGIN_X + 4*w + 200));
  const maxCanvasHeight = Math.max(600, (2*h + 200));

  const themeColor = shape === 'rect' ? 'indigo' : shape === 'triangle' ? 'emerald' : shape === 'parallelogram' ? 'blue' : shape === 'trapezoid' ? 'purple' : 'rose';
  const shapeName = shape === 'rect' ? '직사각형' : shape === 'triangle' ? '삼각형' : shape === 'parallelogram' ? '평행사변형' : shape === 'trapezoid' ? '사다리꼴' : '마름모';

  const polyTL = `${w/2},0 0,${h/2} ${w/2},${h/2}`;
  const polyTR = `${w/2},0 ${w},${h/2} ${w/2},${h/2}`;
  const polyBL = `0,${h/2} ${w/2},${h} ${w/2},${h/2}`;
  const polyBR = `${w},${h/2} ${w/2},${h} ${w/2},${h/2}`;

  const getRhombusTransform = (i: number) => {
    if (rhombusState === 'normal') return 'none';
    if (rhombusState === 'separated') {
      const dx = (i % 2 === 0 ? -20 : 20) + rhombusDrag[i].x;
      const dy = (i < 2 ? -20 : 20) + rhombusDrag[i].y;
      return `translate(${dx}px, ${dy}px)`;
    }
    if (rhombusState === 'combined') {
      const dx = w/2 + 60;
      const dy = (i >= 2) ? 20 : 0; 
      const rot = (i === 1 || i === 3) ? 'rotate(180deg)' : ''; 
      return `translate(${dx}px, ${dy}px) ${rot}`;
    }
    return 'none';
  };

  const getRhombusOrigin = (i: number) => {
    return i < 2 ? `${w/2}px ${h/4}px` : `${w/2}px ${3*h/4}px`;
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center p-6 text-slate-800">
      <Toaster position="top-center" />
      
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-black text-slate-800 mb-2">
          📐 다각형 넓이 마스터 <span className={`text-${themeColor}-600`}>({shapeName})</span>
        </h1>
        <p className="text-slate-500 font-bold">
          {shape === 'rect' && '둘레를 입력하고 꼭짓점을 당겨보세요!'}
          {shape === 'triangle' && '윗 꼭짓점을 이동시켜도 넓이가 같은지 확인해 보세요!'}
          {shape === 'parallelogram' && '윗변을 밀어도 넓이가 유지되는 원리를 확인하세요!'}
          {shape === 'trapezoid' && '사다리꼴을 복제하고 회전하여 넓이의 비밀을 파헤치세요!'}
          {shape === 'rhombus' && '안쪽 직각삼각형 4개를 분리하고, 회전하여 합쳐보세요!'}
        </p>
      </header>

      {/* 컨트롤 패널 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8 flex flex-col md:flex-row gap-4 items-center w-full max-w-lg justify-center">
        <label className="font-bold text-slate-700">처음 직사각형 둘레 (cm):</label>
        <input 
          type="number" value={perimeter} onChange={(e) => setPerimeter(e.target.value === '' ? '' : Number(e.target.value))}
          className={`p-3 border-2 border-slate-200 rounded-xl w-32 text-center font-black text-lg outline-none focus:border-${themeColor}-400`}
          disabled={isGenerated} placeholder="예: 40"
        />
        {!isGenerated ? (
          <button onClick={handleGenerate} className="bg-indigo-600 text-white font-black px-8 py-3 rounded-xl hover:bg-indigo-500 shadow-md">도형 만들기</button>
        ) : (
          <button onClick={() => { setIsGenerated(false); setPerimeter(''); }} className="bg-slate-500 text-white font-bold px-8 py-3 rounded-xl hover:bg-slate-400">초기화</button>
        )}
      </div>

      {isGenerated && (
        <div className="flex flex-col items-center animate-fade-in w-full">
          
          <div className="w-full overflow-x-auto flex justify-center p-4">
            <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden shrink-0">
              <div className="relative" style={{ width: `${maxCanvasWidth}px`, height: `${maxCanvasHeight}px`, backgroundImage: 'radial-gradient(#cbd5e1 2px, transparent 0)', backgroundSize: `${cmToPx}px ${cmToPx}px`, backgroundPosition: `${ORIGIN_X}px ${ORIGIN_Y}px` }}>
                
                {/* SVG 렌더링 계층 */}
                <svg className="absolute top-0 left-0 overflow-visible" width="100%" height="100%">
                  <g transform={`translate(${ORIGIN_X}, ${ORIGIN_Y})`}>
                    
                    {shape === 'rect' && <rect x={0} y={0} width={w} height={h} className="fill-indigo-500/20 stroke-indigo-500 transition-all duration-75" strokeWidth="4" />}
                    
                    {shape === 'triangle' && (
                      <>
                        <line x1={topVertexOffset*cmToPx} y1={0} x2={topVertexOffset*cmToPx} y2={h} stroke="#10b981" strokeDasharray="5,5" strokeWidth="2" opacity="0.6" />
                        <polygon points={`${topVertexOffset*cmToPx},0 0,${h} ${w},${h}`} className="fill-emerald-500/20 stroke-emerald-500 transition-all duration-75" strokeWidth="4" strokeLinejoin="round" />
                      </>
                    )}

                    {shape === 'parallelogram' && (
                      <>
                        <line x1={topVertexOffset*cmToPx} y1={0} x2={topVertexOffset*cmToPx} y2={h} stroke="#3b82f6" strokeDasharray="5,5" strokeWidth="2" opacity="0.6" />
                        <polygon points={`${topVertexOffset*cmToPx},0 ${(width+topVertexOffset)*cmToPx},0 ${w},${h} 0,${h}`} className="fill-blue-500/20 stroke-blue-500 transition-all duration-75" strokeWidth="4" strokeLinejoin="round" />
                      </>
                    )}

                    {shape === 'trapezoid' && (() => {
                      const e = trapExpand * cmToPx; 
                      const trapPoints = `${-e},0 ${w+e},0 ${w},${h} 0,${h}`;
                      const duplicateX = w + Math.abs(e) + 60; 
                      return (
                        <>
                          <line x1={-e} y1={0} x2={-e} y2={h} stroke="#a855f7" strokeDasharray="5,5" strokeWidth="2" opacity="0.6" />
                          <polygon points={trapPoints} className="fill-purple-500/20 stroke-purple-500 transition-all duration-75" strokeWidth="4" strokeLinejoin="round" />
                          {trapState !== 'normal' && (
                            <g style={{ transform: trapState === 'duplicated' ? `translate(${duplicateX}px, 0)` : trapState === 'rotated' ? `translate(${duplicateX}px, 0) rotate(180deg)` : trapState === 'attached' ? `translate(${w+e}px, 0) rotate(180deg)` : 'none', transformOrigin: `${w/2}px ${h/2}px`, transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
                              <polygon points={trapPoints} className="fill-pink-500/30 stroke-pink-500" strokeWidth="4" strokeLinejoin="round" strokeDasharray="6,4" />
                            </g>
                          )}
                        </>
                      );
                    })()}

                    {/* 🔥 마름모 렌더링 */}
                    {shape === 'rhombus' && (
                      <>
                        {/* 큰 직사각형 보조선 (점선) */}
                        <rect x={0} y={0} width={w} height={h} fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="5,5" />
                        <line x1={w/2} y1={0} x2={w/2} y2={h} stroke="#cbd5e1" strokeWidth="2" strokeDasharray="5,5" />
                        <line x1={0} y1={h/2} x2={w} y2={h/2} stroke="#cbd5e1" strokeWidth="2" strokeDasharray="5,5" />

                        {/* 마름모 베이스 (빈 윤곽) */}
                        {rhombusState !== 'normal' && (
                          <polygon points={`${w/2},0 ${w},${h/2} ${w/2},${h} 0,${h/2}`} className="fill-slate-200/50 stroke-slate-300" strokeWidth="2" strokeDasharray="5,5" />
                        )}

                        {/* 4개의 조각 직각삼각형 */}
                        {[polyTL, polyTR, polyBL, polyBR].map((poly, i) => (
                          <g 
                            key={i} 
                            style={{ 
                              transform: getRhombusTransform(i), 
                              transformOrigin: getRhombusOrigin(i), 
                              transition: isDragging.current ? 'none' : 'transform 0.5s ease' 
                            }}
                            onPointerDown={(e) => rhombusState === 'separated' && handlePointerDown(e, 'rhombusTri', i)}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            className={rhombusState === 'separated' ? 'cursor-grab active:cursor-grabbing' : ''}
                          >
                            <polygon points={poly} className="fill-rose-500/40 stroke-rose-600 hover:fill-rose-500/60 transition-colors" strokeWidth="3" strokeLinejoin="round" />
                          </g>
                        ))}
                      </>
                    )}
                  </g>
                </svg>

                {/* HTML UI 계층 */}
                <div style={{ transform: `translate(${ORIGIN_X}px, ${ORIGIN_Y}px)` }} className="absolute top-0 left-0 w-0 h-0">
                  
                  {shape !== 'trapezoid' && shape !== 'rhombus' && (
                    <>
                      <div className={`absolute font-black text-sm whitespace-nowrap text-${themeColor}-600`} style={{ top: h + 15, left: w/2, transform: 'translateX(-50%)' }}>{width} cm</div>
                      <div className={`absolute font-black text-sm whitespace-nowrap text-${themeColor}-600`} style={{ top: h/2, transform: 'translateY(-50%)', left: shape === 'rect' ? w + 15 : -50 }}>{height} cm</div>
                    </>
                  )}

                  {shape === 'trapezoid' && trapState !== 'attached' && (
                    <>
                      <div className="absolute font-black text-sm text-purple-600 whitespace-nowrap" style={{ top: -30, left: w/2, transform: 'translateX(-50%)' }}>{width + 2*trapExpand} cm</div>
                      <div className="absolute font-black text-sm text-purple-600 whitespace-nowrap" style={{ top: h + 15, left: w/2, transform: 'translateX(-50%)' }}>{width} cm</div>
                      <div className="absolute font-black text-sm text-purple-600 whitespace-nowrap" style={{ top: h/2, transform: 'translateY(-50%)', left: - (trapExpand * cmToPx) - 50 }}>{height} cm</div>
                    </>
                  )}

                  {shape === 'trapezoid' && trapState === 'attached' && (
                    <>
                      <div className="absolute font-black text-sm text-indigo-600 whitespace-nowrap" style={{ top: h + 15, left: (w + (width + 2*trapExpand)*cmToPx)/2, transform: 'translateX(-50%)' }}>전체 밑변: {width + (width + 2*trapExpand)} cm</div>
                      <div className="absolute font-black text-sm text-purple-600 whitespace-nowrap" style={{ top: h/2, transform: 'translateY(-50%)', left: - (trapExpand * cmToPx) - 50 }}>{height} cm</div>
                    </>
                  )}

                  {shape === 'rhombus' && (
                    <>
                      <div className="absolute font-black text-sm text-slate-500 whitespace-nowrap" style={{ top: -25, left: w/2, transform: 'translateX(-50%)' }}>직사각형 가로: {width} cm</div>
                      <div className="absolute font-black text-sm text-slate-500 whitespace-nowrap" style={{ top: h/2, transform: 'translateY(-50%)', left: -75 }}>직사각형<br/>세로:<br/>{height} cm</div>
                    </>
                  )}
                  
                  {!quizMode && shape === 'rect' && <div className="absolute w-8 h-8 bg-amber-400 border-4 border-white rounded-full cursor-nwse-resize shadow-lg hover:scale-125 touch-none z-10" style={{ left: w-16, top: h-16 }} onPointerDown={(e) => handlePointerDown(e, 'bottomRight')} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} />}
                  {!quizMode && (shape === 'triangle' || shape === 'parallelogram') && <div className={`absolute w-8 h-8 ${shape==='triangle'?'bg-emerald-400':'bg-blue-400'} border-4 border-white rounded-full cursor-ew-resize shadow-lg hover:scale-125 touch-none z-10`} style={{ left: (shape==='triangle'?topVertexOffset:width+topVertexOffset)*cmToPx - 16, top: -16 }} onPointerDown={(e) => handlePointerDown(e, 'topVertex')} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} />}
                  {!quizMode && shape === 'trapezoid' && trapState === 'normal' && <div className="absolute w-8 h-8 bg-purple-400 border-4 border-white rounded-full cursor-ew-resize shadow-lg hover:scale-125 touch-none z-10" style={{ left: (width + trapExpand)*cmToPx - 16, top: -16 }} onPointerDown={(e) => handlePointerDown(e, 'topRightTrap')} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} />}
                </div>

              </div>
            </div>
          </div>

          {/* 액션 버튼 그룹 */}
          {!quizMode ? (
            <div className="flex flex-col md:flex-row gap-3 mt-8 flex-wrap justify-center w-full max-w-4xl">
              <button onClick={() => setQuizMode(true)} className="bg-amber-500 text-white font-black px-6 py-4 rounded-2xl shadow-md hover:bg-amber-400 active:scale-95 transition-all">📝 문제 내기</button>
              
              {shape === 'rect' && (
                <>
                  <button onClick={convertToTriangle} className="bg-emerald-500 text-white font-black px-5 py-4 rounded-2xl shadow-md hover:bg-emerald-400 active:scale-95 transition-all">✂️ 삼각형</button>
                  <button onClick={convertToParallelogram} className="bg-blue-500 text-white font-black px-5 py-4 rounded-2xl shadow-md hover:bg-blue-400 active:scale-95 transition-all">▱ 평행사변형</button>
                  <button onClick={convertToTrapezoid} className="bg-purple-500 text-white font-black px-5 py-4 rounded-2xl shadow-md hover:bg-purple-400 active:scale-95 transition-all">⏢ 사다리꼴</button>
                  <button onClick={convertToRhombus} className="bg-rose-500 text-white font-black px-5 py-4 rounded-2xl shadow-md hover:bg-rose-400 active:scale-95 transition-all">💠 마름모 만들기</button>
                </>
              )}

              {shape === 'trapezoid' && trapState === 'normal' && <button onClick={() => setTrapState('duplicated')} className="bg-pink-500 text-white font-black px-6 py-4 rounded-2xl shadow-md hover:bg-pink-400 active:scale-95 transition-all">✨ 복제하기</button>}
              {shape === 'trapezoid' && trapState === 'duplicated' && <button onClick={() => setTrapState('rotated')} className="bg-pink-600 text-white font-black px-6 py-4 rounded-2xl shadow-md hover:bg-pink-500 active:scale-95 transition-all">🔄 180도 회전하기</button>}
              {shape === 'trapezoid' && trapState === 'rotated' && <button onClick={() => setTrapState('attached')} className="bg-indigo-600 text-white font-black px-6 py-4 rounded-2xl shadow-md hover:bg-indigo-500 active:scale-95 transition-all">🧲 이어 붙이기</button>}
              {shape === 'trapezoid' && trapState === 'attached' && <button onClick={() => setTrapState('normal')} className="bg-slate-500 text-white font-black px-6 py-4 rounded-2xl shadow-md hover:bg-slate-400 active:scale-95 transition-all">↩️ 되돌리기</button>}

              {/* 마름모 전용 액션 버튼 */}
              {shape === 'rhombus' && rhombusState === 'normal' && <button onClick={() => { setRhombusState('separated'); toast('안쪽 삼각형 4개를 마우스로 이리저리 드래그 해보세요!', {icon:'🖐️'}); }} className="bg-indigo-500 text-white font-black px-6 py-4 rounded-2xl shadow-md hover:bg-indigo-400 active:scale-95 transition-all">✂️ 안쪽 삼각형 4개 분리하기</button>}
              {shape === 'rhombus' && rhombusState === 'separated' && <button onClick={() => setRhombusState('combined')} className="bg-pink-600 text-white font-black px-6 py-4 rounded-2xl shadow-md hover:bg-pink-500 active:scale-95 transition-all">🔄 회전하여 합치기 (직사각형 2개)</button>}
              {shape === 'rhombus' && rhombusState === 'combined' && <button onClick={() => { setRhombusState('normal'); setRhombusDrag([{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}]); }} className="bg-slate-500 text-white font-black px-6 py-4 rounded-2xl shadow-md hover:bg-slate-400 active:scale-95 transition-all">↩️ 처음으로 되돌리기</button>}
            </div>
          ) : (
            <div className={`bg-white p-8 rounded-3xl shadow-xl border-4 border-${themeColor}-400 flex flex-col items-center gap-6 w-full max-w-md animate-fade-in mt-8`}>
              
              {shape === 'rhombus' ? (
                <>
                  {/* 🔥 정답 확인 함수(checkAnswers) 오타 수정 완료 부분 */}
                  <h2 className="text-xl font-black text-slate-800 leading-tight text-center">Q. 마름모를 둘러싼 <span className="text-indigo-600">큰 직사각형</span>과<br/><span className="text-rose-600">마름모</span>의 넓이를 구하세요.</h2>
                  <div className="flex flex-col gap-3 w-full">
                    <div className="flex justify-between items-center bg-indigo-50 p-3 rounded-xl border border-indigo-100"><span className="font-bold text-indigo-700">큰 직사각형 가로</span><input type="number" value={answers.rWidth} onChange={e=>setAnswers({...answers, rWidth: e.target.value})} className="w-20 p-2 border-2 rounded-lg text-center font-bold outline-none focus:border-indigo-400" /></div>
                    <div className="flex justify-between items-center bg-indigo-50 p-3 rounded-xl border border-indigo-100"><span className="font-bold text-indigo-700">큰 직사각형 세로</span><input type="number" value={answers.rHeight} onChange={e=>setAnswers({...answers, rHeight: e.target.value})} className="w-20 p-2 border-2 rounded-lg text-center font-bold outline-none focus:border-indigo-400" /></div>
                    <div className="flex justify-between items-center bg-indigo-100 p-3 rounded-xl border border-indigo-300"><span className="font-black text-indigo-800">큰 직사각형 넓이</span><input type="number" value={answers.rOuterArea} onChange={e=>setAnswers({...answers, rOuterArea: e.target.value})} className="w-20 p-2 border-2 rounded-lg text-center font-black outline-none border-indigo-400 focus:border-indigo-600" /></div>
                    <div className="flex justify-between items-center bg-rose-100 p-3 rounded-xl border border-rose-300 shadow-inner mt-2"><span className="font-black text-rose-800">마름모 넓이</span><input type="number" step="0.5" value={answers.rArea} onChange={e=>setAnswers({...answers, rArea: e.target.value})} className="w-20 p-2 border-2 rounded-lg text-center font-black outline-none border-rose-400 focus:border-rose-600" /></div>
                  </div>
                </>
              ) : shape === 'trapezoid' && trapState === 'attached' ? (
                <>
                  <h2 className="text-xl font-black text-slate-800 leading-tight text-center">Q. 만들어진 <span className="text-indigo-600">평행사변형</span>과<br/><span className="text-purple-600">사다리꼴 1개</span>의 넓이를 구하세요.</h2>
                  <div className="flex flex-col gap-3 w-full">
                    <div className="flex justify-between items-center bg-indigo-50 p-3 rounded-xl border border-indigo-100"><span className="font-bold text-indigo-700">전체 평행사변형 밑변</span><input type="number" value={answers.combBase} onChange={e=>setAnswers({...answers, combBase: e.target.value})} className="w-20 p-2 border-2 rounded-lg text-center font-bold outline-none focus:border-indigo-400" /></div>
                    <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border"><span className="font-bold text-slate-600">높이 (cm)</span><input type="number" value={answers.height} onChange={e=>setAnswers({...answers, height: e.target.value})} className="w-20 p-2 border-2 rounded-lg text-center font-bold outline-none focus:border-purple-400" /></div>
                    <div className="flex justify-between items-center bg-indigo-50 p-3 rounded-xl border border-indigo-200"><span className="font-black text-indigo-700">전체 평행사변형 넓이</span><input type="number" step="0.5" value={answers.combArea} onChange={e=>setAnswers({...answers, combArea: e.target.value})} className="w-20 p-2 border-2 rounded-lg text-center font-black outline-none border-indigo-300 focus:border-indigo-500" /></div>
                    <div className="flex justify-between items-center bg-purple-100 p-3 rounded-xl border border-purple-300 shadow-inner mt-2"><span className="font-black text-purple-800">사다리꼴 1개 넓이</span><input type="number" step="0.5" value={answers.trapArea} onChange={e=>setAnswers({...answers, trapArea: e.target.value})} className="w-20 p-2 border-2 rounded-lg text-center font-black outline-none border-purple-400 focus:border-purple-600" /></div>
                  </div>
                </>
              ) : shape === 'trapezoid' && trapState === 'normal' ? (
                <>
                  <h2 className="text-xl font-black text-slate-800 text-center">Q. 이 사다리꼴의 넓이를 구하세요.</h2>
                  <div className="flex flex-col gap-3 w-full">
                    <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border"><span className="font-bold text-slate-600">윗변 (cm)</span><input type="number" value={answers.topBase} onChange={e=>setAnswers({...answers, topBase: e.target.value})} className="w-20 p-2 border-2 rounded-lg text-center font-bold outline-none focus:border-purple-400" /></div>
                    <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border"><span className="font-bold text-slate-600">아랫변 (cm)</span><input type="number" value={answers.base} onChange={e=>setAnswers({...answers, base: e.target.value})} className="w-20 p-2 border-2 rounded-lg text-center font-bold outline-none focus:border-purple-400" /></div>
                    <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border"><span className="font-bold text-slate-600">높이 (cm)</span><input type="number" value={answers.height} onChange={e=>setAnswers({...answers, height: e.target.value})} className="w-20 p-2 border-2 rounded-lg text-center font-bold outline-none focus:border-purple-400" /></div>
                    <div className="flex justify-between items-center bg-purple-50 p-3 rounded-xl border border-purple-200"><span className="font-black text-purple-700">넓이 (cm²)</span><input type="number" step="0.5" value={answers.area} onChange={e=>setAnswers({...answers, area: e.target.value})} className="w-20 p-2 border-2 rounded-lg text-center font-black outline-none border-purple-300 focus:border-purple-500" /></div>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-black text-slate-800 text-center">Q. 이 {shapeName}의 길이와 넓이를 구하세요.</h2>
                  <div className="flex flex-col gap-3 w-full">
                    <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200"><span className="font-bold text-slate-600">밑변 (cm)</span><input type="number" value={answers.base} onChange={e=>setAnswers({...answers, base: e.target.value})} className={`w-24 p-2 border-2 rounded-lg text-center font-bold outline-none focus:border-${themeColor}-400`} /></div>
                    <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200"><span className="font-bold text-slate-600">높이 (cm)</span><input type="number" value={answers.height} onChange={e=>setAnswers({...answers, height: e.target.value})} className={`w-24 p-2 border-2 rounded-lg text-center font-bold outline-none focus:border-${themeColor}-400`} /></div>
                    <div className={`flex justify-between items-center p-3 rounded-xl border bg-${themeColor}-50 border-${themeColor}-200`}><span className={`font-black text-${themeColor}-700`}>넓이 (cm²)</span><input type="number" step="0.5" value={answers.area} onChange={e=>setAnswers({...answers, area: e.target.value})} className={`w-24 p-2 border-2 rounded-lg text-center font-black outline-none border-${themeColor}-300 focus:border-${themeColor}-500`} /></div>
                  </div>
                </>
              )}

              <div className="flex gap-3 w-full mt-2">
                <button onClick={() => setQuizMode(false)} className="flex-1 bg-slate-200 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-300 transition">취소</button>
                {/* 🔥 checkGeomAnswers 오타를 checkAnswers로 수정 완료 */}
                <button onClick={checkAnswers} className="flex-1 bg-amber-500 text-white font-black py-3 rounded-xl hover:bg-amber-400 shadow-md transition active:scale-95">정답 확인</button>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}