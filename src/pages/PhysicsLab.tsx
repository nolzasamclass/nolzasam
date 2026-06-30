// src/pages/PhysicsLab.tsx
import React, { useRef, useState } from 'react';
import Matter from 'matter-js';
import { Toaster, toast } from 'react-hot-toast';

// --- 타입 정의 ---
type Tool = 'ramp' | 'domino' | 'spring' | 'fan';
type Mode = 'edit' | 'play';

interface Item {
  id: string;
  type: Tool;
  x: number;
  y: number;
  angle: number; // 도(degree) 단위
}

interface Hint {
  type: Tool;
  x: number;
  y: number;
  angle: number;
}

interface StageData {
  id: number;
  title: string;
  desc: string;
  spawn: { x: number; y: number };
  goal: { x: number; y: number; width: number; height: number };
  inventory: Record<Tool, number>;
  hints: Hint[];
  statics: { x: number; y: number; width: number; height: number }[]; // 고정 벽/장애물
}

// --- 🌟 5단계 미션 기획 데이터 ---
const STAGES: Record<number, StageData> = {
  1: {
    id: 1,
    title: "1단계: 고양이 깨우기 (튜토리얼)",
    desc: "점선 윤곽선에 맞춰 경사로와 도미노를 끌어다 놓으세요!",
    spawn: { x: 100, y: 100 },
    goal: { x: 700, y: 550, width: 80, height: 80 },
    inventory: { ramp: 1, domino: 1, spring: 0, fan: 0 },
    hints: [
      { type: 'ramp', x: 200, y: 300, angle: 30 },
      { type: 'domino', x: 400, y: 500, angle: 0 }
    ],
    statics: []
  },
  2: {
    id: 2,
    title: "2단계: 부서진 다리",
    desc: "경사로를 회전시켜 공이 절벽을 건너가게 다리를 만들어주세요.",
    spawn: { x: 100, y: 100 },
    goal: { x: 700, y: 400, width: 80, height: 80 },
    inventory: { ramp: 3, domino: 0, spring: 0, fan: 0 },
    hints: [],
    statics: [
      { x: 100, y: 300, width: 200, height: 20 },
      { x: 700, y: 500, width: 200, height: 20 }
    ]
  },
  3: {
    id: 3,
    title: "3단계: 통통 튀는 트램펄린",
    desc: "스프링을 바닥에 깔아 공을 높은 벽 너머로 튕겨 올리세요!",
    spawn: { x: 100, y: 100 },
    goal: { x: 600, y: 200, width: 80, height: 80 },
    inventory: { ramp: 2, domino: 0, spring: 1, fan: 0 },
    hints: [],
    statics: [
      { x: 400, y: 400, width: 20, height: 400 } // 높은 벽
    ]
  },
  4: {
    id: 4,
    title: "4단계: 강풍 주의보",
    desc: "선풍기를 배치하여 바람의 힘으로 공을 언덕 위로 밀어 올리세요.",
    spawn: { x: 100, y: 400 },
    goal: { x: 700, y: 100, width: 80, height: 80 },
    inventory: { ramp: 2, domino: 0, spring: 0, fan: 1 },
    hints: [],
    statics: [
      { x: 400, y: 300, width: 600, height: 20 } // 긴 언덕
    ]
  },
  5: {
    id: 5,
    title: "5단계: 알지오 골드버그 마스터",
    desc: "모든 부품을 총동원하여 복잡한 미로를 뚫고 목표에 도달하세요!",
    spawn: { x: 100, y: 50 },
    goal: { x: 700, y: 550, width: 80, height: 80 },
    inventory: { ramp: 4, domino: 5, spring: 2, fan: 1 },
    hints: [],
    statics: [
      { x: 200, y: 200, width: 300, height: 20 },
      { x: 600, y: 400, width: 300, height: 20 }
    ]
  }
};

export default function PhysicsLab() {
  const [stageId, setStageId] = useState<number>(1);
  const stageData = STAGES[stageId];

  const [mode, setMode] = useState<Mode>('edit');
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<{ id: string, offsetX: number, offsetY: number } | null>(null);
  const [isCleared, setIsCleared] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const renderRef = useRef<Matter.Render | null>(null);

  // 남은 인벤토리 계산
  const getRemainingCount = (type: Tool) => {
    const used = items.filter(item => item.type === type).length;
    return stageData.inventory[type] - used;
  };

  // --- 🖱️ 드래그 앤 드롭 제어 (Edit 모드 전용) ---
  const handlePointerDown = (e: React.PointerEvent, item: Item) => {
    if (mode === 'play') return;
    e.stopPropagation(); // 배경 클릭 방지
    setSelectedId(item.id);
    const rect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return;
    
    // 마우스 커서와 아이템 중심의 오프셋 계산
    const offsetX = (e.clientX - rect.left) - item.x;
    const offsetY = (e.clientY - rect.top) - item.y;
    setDragItem({ id: item.id, offsetX, offsetY });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (mode === 'play' || !dragItem) return;
    const rect = e.currentTarget.getBoundingClientRect();
    let newX = (e.clientX - rect.left) - dragItem.offsetX;
    let newY = (e.clientY - rect.top) - dragItem.offsetY;

    // 화면 밖으로 나가지 않게 제한
    newX = Math.max(0, Math.min(newX, 800));
    newY = Math.max(0, Math.min(newY, 600));

    setItems(items.map(item => item.id === dragItem.id ? { ...item, x: newX, y: newY } : item));
  };

  const handlePointerUp = () => {
    if (!dragItem) return;

    // 🔥 스냅(Snap) 기능: 1단계 튜토리얼용
    if (stageData.hints.length > 0) {
      const currentItem = items.find(i => i.id === dragItem.id);
      if (currentItem) {
        stageData.hints.forEach(hint => {
          if (hint.type === currentItem.type) {
            const dist = Math.sqrt(Math.pow(hint.x - currentItem.x, 2) + Math.pow(hint.y - currentItem.y, 2));
            if (dist < 40) { // 40px 이내로 접근하면 자석처럼 달라붙음
              setItems(prev => prev.map(i => i.id === dragItem.id ? { ...i, x: hint.x, y: hint.y, angle: hint.angle } : i));
              toast.success('완벽한 위치입니다!', { icon: '✨' });
            }
          }
        });
      }
    }
    setDragItem(null);
  };

  // --- 🛠️ 편집 도구 액션 ---
  const handleAddItem = (type: Tool) => {
    if (getRemainingCount(type) <= 0) {
      toast.error('부품을 모두 사용했습니다!');
      return;
    }
    const newItem: Item = { id: `item_${Date.now()}`, type, x: 400, y: 300, angle: 0 };
    setItems([...items, newItem]);
    setSelectedId(newItem.id);
  };

  const handleRotate = (amount: number) => {
    setItems(items.map(item => item.id === selectedId ? { ...item, angle: item.angle + amount } : item));
  };

  const handleDelete = () => {
    setItems(items.filter(item => item.id !== selectedId));
    setSelectedId(null);
  };

  const handleClearAll = () => {
    if (window.confirm('배치한 부품을 모두 초기화하시겠습니까?')) {
      setItems([]);
      setSelectedId(null);
    }
  };

  // --- ⚙️ 물리 엔진 (Play 모드 실행) ---
  const startSimulation = () => {
    setMode('play');
    setSelectedId(null);
    setIsCleared(false);

    if (engineRef.current) Matter.Engine.clear(engineRef.current);
    if (renderRef.current) { Matter.Render.stop(renderRef.current); renderRef.current.canvas.remove(); }

    const engine = Matter.Engine.create();
    engineRef.current = engine;
    
    if (canvasRef.current) {
      const render = Matter.Render.create({
        element: canvasRef.current,
        engine: engine,
        options: { width: 800, height: 600, wireframes: false, background: 'transparent' }
      });
      renderRef.current = render;
      Matter.Render.run(render);
    }

    const worldBodies: Matter.Body[] = [];

    // 1. 기본 바닥 및 테두리 생성
    worldBodies.push(Matter.Bodies.rectangle(400, 610, 810, 60, { isStatic: true, render: { fillStyle: '#cbd5e1' } }));
    worldBodies.push(Matter.Bodies.rectangle(-10, 300, 60, 600, { isStatic: true, render: { visible: false } }));
    worldBodies.push(Matter.Bodies.rectangle(810, 300, 60, 600, { isStatic: true, render: { visible: false } }));

    // 2. 스테이지 장애물 생성
    stageData.statics.forEach(st => {
      worldBodies.push(Matter.Bodies.rectangle(st.x, st.y, st.width, st.height, { isStatic: true, render: { fillStyle: '#475569' } }));
    });

    // 3. 목표 지점(별) 생성
    const goal = Matter.Bodies.rectangle(stageData.goal.x, stageData.goal.y, stageData.goal.width, stageData.goal.height, {
      isStatic: true, isSensor: true, label: 'target', render: { fillStyle: '#fbbf24' }
    });
    worldBodies.push(goal);

    // 4. 사용자가 배치한 부품들 생성
    items.forEach(item => {
      const radians = item.angle * (Math.PI / 180);
      let body: Matter.Body | null = null;

      if (item.type === 'ramp') {
        body = Matter.Bodies.rectangle(item.x, item.y, 160, 20, { isStatic: true, angle: radians, friction: 0.01, render: { fillStyle: '#f59e0b' } });
      } else if (item.type === 'domino') {
        body = Matter.Bodies.rectangle(item.x, item.y, 20, 80, { restitution: 0.2, friction: 0.1, density: 0.05, angle: radians, render: { fillStyle: '#ef4444' } });
      } else if (item.type === 'spring') {
        body = Matter.Bodies.rectangle(item.x, item.y, 80, 20, { isStatic: true, restitution: 1.3, angle: radians, render: { fillStyle: '#10b981' } });
      } else if (item.type === 'fan') {
        body = Matter.Bodies.rectangle(item.x, item.y, 40, 40, { isStatic: true, angle: radians, render: { fillStyle: '#94a3b8' } });
        // 바람 구역 계산 (회전 각도 고려하여 오른쪽에 센서 영역 생성)
        const windX = item.x + Math.cos(radians) * 120;
        const windY = item.y + Math.sin(radians) * 120;
        const windZone = Matter.Bodies.rectangle(windX, windY, 200, 60, {
          isStatic: true, isSensor: true, angle: radians, label: 'windZone', render: { fillStyle: 'rgba(56, 189, 248, 0.2)' }
        });
        worldBodies.push(windZone);
      }
      if (body) worldBodies.push(body);
    });

    // 5. 주인공 공 생성 (고정된 Spawn 위치에서 투하)
    const ball = Matter.Bodies.circle(stageData.spawn.x, stageData.spawn.y, 15, {
      label: 'ball', restitution: 0.7, friction: 0.005, density: 0.04, render: { fillStyle: '#3b82f6' }
    });
    worldBodies.push(ball);

    Matter.Composite.add(engine.world, worldBodies);

    // 6. 충돌 및 바람 이벤트 로직
    Matter.Events.on(engine, 'collisionStart', (event: any) => {
      event.pairs.forEach((pair: any) => {
        if ((pair.bodyA.label === 'ball' && pair.bodyB.label === 'target') || (pair.bodyB.label === 'ball' && pair.bodyA.label === 'target')) {
          if (!isCleared) {
            toast.success(`🎉 ${stageData.title} 클리어!`, { duration: 5000, icon: '⭐️' });
            setIsCleared(true);
          }
        }
      });
    });

    Matter.Events.on(engine, 'beforeUpdate', () => {
      const bodies = Matter.Composite.allBodies(engine.world);
      const windZones = bodies.filter((b: any) => b.label === 'windZone');
      const balls = bodies.filter((b: any) => b.label === 'ball');

      balls.forEach((b: any) => {
        windZones.forEach((zone: any) => {
          if (Matter.Bounds.overlaps(b.bounds, zone.bounds)) {
            // 바람 방향(zone의 각도)으로 밀어냄
            const forceX = Math.cos(zone.angle) * 0.0015;
            const forceY = Math.sin(zone.angle) * 0.0015;
            Matter.Body.applyForce(b, b.position, { x: forceX, y: forceY });
          }
        });
      });
    });

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);
  };

  const stopSimulation = () => {
    setMode('edit');
    if (renderRef.current) {
      Matter.Render.stop(renderRef.current);
      renderRef.current.canvas.remove();
      renderRef.current = null;
    }
    if (engineRef.current) {
      Matter.Engine.clear(engineRef.current);
      engineRef.current = null;
    }
  };

  // --- 화면 렌더링 헬퍼 ---
  const renderItemShape = (type: Tool) => {
    if (type === 'ramp') return <div className="w-[160px] h-[20px] bg-amber-500 rounded-full shadow-md border-2 border-amber-600" />;
    if (type === 'domino') return <div className="w-[20px] h-[80px] bg-red-500 rounded shadow-md border-2 border-red-600" />;
    if (type === 'spring') return <div className="w-[80px] h-[20px] bg-emerald-500 rounded shadow-md border-2 border-emerald-600 flex items-center justify-center"><span className="text-white text-[10px] font-black">⬆️ SPRING</span></div>;
    if (type === 'fan') return (
      <div className="relative">
        <div className="w-[40px] h-[40px] bg-slate-400 rounded-full shadow-md border-2 border-slate-500 flex items-center justify-center text-xl">💨</div>
        {/* 선풍기 바람 표시 (UI용) */}
        <div className="absolute top-1/2 left-[40px] -translate-y-1/2 w-[200px] h-[60px] bg-sky-400/20 rounded-r-full pointer-events-none border-y border-r border-sky-400/30 border-dashed flex items-center pl-4 text-sky-500 font-black">»»» WIND</div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center p-6 md:p-10 font-sans select-none">
      <Toaster position="top-center" />
      
      <header className="mb-4 text-center">
        <h1 className="text-3xl font-black text-emerald-400 mb-2">🧪 알지오 구조대 (물리 퍼즐)</h1>
        <p className="text-slate-300 font-bold">{stageData.title} - {stageData.desc}</p>
      </header>

      {/* 상단 컨트롤 패널 */}
      <div className="bg-slate-800 p-4 rounded-3xl flex flex-wrap justify-between items-center gap-6 mb-6 shadow-xl border border-slate-700 w-full max-w-[800px]">
        
        {/* 모드 전환 버튼 */}
        <div className="flex gap-2">
          {mode === 'edit' ? (
            <button onClick={startSimulation} className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white font-black rounded-xl shadow-lg flex items-center gap-2 animate-pulse">
              ▶ 실행하기
            </button>
          ) : (
            <button onClick={stopSimulation} className="px-6 py-2 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-xl shadow-lg flex items-center gap-2">
              ⏹ 정지 및 설계 수정
            </button>
          )}
        </div>

        {/* 인벤토리 (설계 모드에서만 활성화) */}
        <div className="flex gap-2">
          {(['ramp', 'domino', 'spring', 'fan'] as Tool[]).map(t => {
            if (stageData.inventory[t] === 0 && items.filter(i=>i.type===t).length === 0) return null; // 해당 스테이지에 없는 부품은 숨김
            const remain = getRemainingCount(t);
            return (
              <button key={t} onClick={() => handleAddItem(t)} disabled={mode === 'play' || remain <= 0} 
                className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all 
                ${mode === 'play' ? 'opacity-30 cursor-not-allowed bg-slate-700 text-slate-400' : 
                  remain > 0 ? 'bg-slate-700 text-white hover:bg-slate-600 border border-slate-600' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>
                {t === 'ramp' && '🪵 경사로'} {t === 'domino' && '🧱 도미노'} {t === 'spring' && '🌀 스프링'} {t === 'fan' && '💨 선풍기'}
                <span className={`px-2 py-0.5 rounded-full text-xs ${remain > 0 ? 'bg-indigo-500' : 'bg-slate-600'}`}>{remain}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 메인 게임 화면 (800x600 캔버스) */}
      <div className="relative">
        <div 
          className="w-[800px] h-[600px] bg-slate-50 rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-700 relative bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTAgMGg0MHY0MEgwem0wIDBoNDB2NDBIMHoiIGZpbGw9Im5vbmUiLz48cGF0aCBkPSJNMCAwdjQwTTAgMGg0MCIgc3Ryb2tlPSIjZTJlOGYwIiBzdHJva2Utd2lkdGg9IjEiIGZpbGw9Im5vbmUiLz48L3N2Zz4=')]"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Play 모드 캔버스가 렌더링될 곳 */}
          <div ref={canvasRef} className={`absolute inset-0 ${mode === 'play' ? 'z-10' : '-z-10 opacity-0'}`} />

          {/* Edit 모드에서만 보이는 요소들 */}
          {mode === 'edit' && (
            <>
              {/* 고정 벽면 렌더링 */}
              {stageData.statics.map((st, i) => (
                <div key={i} className="absolute bg-slate-600 rounded-sm" style={{ left: st.x - st.width/2, top: st.y - st.height/2, width: st.width, height: st.height }} />
              ))}

              {/* 공 스폰 위치 안내 */}
              <div className="absolute w-[30px] h-[30px] bg-blue-500 rounded-full shadow-lg border-4 border-white animate-bounce" style={{ left: stageData.spawn.x - 15, top: stageData.spawn.y - 15 }} />
              <div className="absolute text-blue-600 font-black text-xs" style={{ left: stageData.spawn.x - 20, top: stageData.spawn.y - 35 }}>START</div>

              {/* 목표 지점 안내 */}
              <div className="absolute bg-amber-400/50 border-4 border-amber-500 border-dashed rounded-xl flex items-center justify-center text-4xl" style={{ left: stageData.goal.x - stageData.goal.width/2, top: stageData.goal.y - stageData.goal.height/2, width: stageData.goal.width, height: stageData.goal.height }}>⭐️</div>

              {/* 1단계 힌트(윤곽선) 렌더링 */}
              {stageData.hints.map((h, i) => (
                <div key={i} className="absolute opacity-40 pointer-events-none" style={{ left: h.x, top: h.y, transform: `translate(-50%, -50%) rotate(${h.angle}deg)` }}>
                  <div className="border-4 border-dashed border-slate-500 grayscale">{renderItemShape(h.type)}</div>
                </div>
              ))}

              {/* 배치된 부품 렌더링 */}
              {items.map(item => (
                <div 
                  key={item.id} 
                  onPointerDown={(e) => handlePointerDown(e, item)}
                  className={`absolute cursor-move transition-transform ${dragItem?.id === item.id ? 'scale-110 z-50 opacity-80' : 'z-20'} ${selectedId === item.id ? 'ring-4 ring-indigo-500 ring-offset-2 ring-offset-slate-50' : ''}`}
                  style={{ left: item.x, top: item.y, transform: `translate(-50%, -50%) rotate(${item.angle}deg)` }}
                >
                  {renderItemShape(item.type)}
                </div>
              ))}
            </>
          )}
        </div>

        {/* 편집 컨트롤 (아이템 선택 시 팝업) */}
        {mode === 'edit' && selectedId && !dragItem && (
          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm p-3 rounded-2xl shadow-xl border-2 border-indigo-200 flex flex-col gap-2 z-50">
            <div className="text-xs font-black text-indigo-800 text-center mb-1">부품 제어</div>
            <div className="flex gap-2">
              <button onClick={() => handleRotate(-15)} className="p-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg font-bold">↺ 15°</button>
              <button onClick={() => handleRotate(15)} className="p-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg font-bold">↻ 15°</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleRotate(-90)} className="flex-1 p-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg font-bold">세우기/눕히기</button>
            </div>
            <button onClick={handleDelete} className="mt-1 w-full p-2 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg font-bold border border-rose-200">🗑️ 삭제</button>
          </div>
        )}
      </div>

      {/* 하단 스테이지 내비게이션 */}
      <div className="flex gap-2 mt-6">
        <button onClick={handleClearAll} disabled={mode === 'play'} className="px-4 py-2 bg-slate-700 text-slate-300 font-bold rounded-lg hover:bg-slate-600 disabled:opacity-30 mr-4">전체 삭제</button>
        {([1, 2, 3, 4, 5] as number[]).map(s => (
          <button 
            key={s} 
            onClick={() => { setStageId(s); setItems([]); setSelectedId(null); setMode('edit'); setIsCleared(false); }}
            className={`px-5 py-2 rounded-lg font-black transition-all ${stageId === s ? 'bg-emerald-500 text-white shadow-lg scale-110' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            {s}단계
          </button>
        ))}
      </div>
    </div>
  );
}