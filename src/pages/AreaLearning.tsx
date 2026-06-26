// src/pages/PolygonLearning.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

// ==========================================
// 3단계 연습문제 데이터베이스
// [1단계: 직관], [2단계: 공식], [3단계: 역산/실생활]
// ==========================================
const QUIZ_DATA = {
  unit: [
    { q: "[1단계] 가로 1cm, 세로 1cm인 정사각형의 넓이는 1cm² 입니다. 타일 12개로 덮인 직사각형의 넓이는 몇 cm²일까요?", a: 12 },
    { q: "[2단계] 단위 넓이 1cm² 타일이 가로로 4개, 세로로 3줄 있습니다. 전체 넓이는?", a: 12 },
    { q: "[3단계] 넓이가 20cm²인 수첩을 1cm² 스티커로 빈틈없이 덮으려면 스티커는 몇 개 필요한가요?", a: 20 }
  ],
  rectangle: [
    { q: "[1단계] 가로 6칸, 세로 4칸의 모눈(1cm²)으로 덮인 직사각형의 넓이는?", a: 24 },
    { q: "[2단계] 가로가 8cm, 세로가 5cm인 직사각형 모양 스마트폰 화면의 넓이는?", a: 40 },
    { q: "[3단계] 넓이가 36cm²인 직사각형의 세로가 4cm일 때, 가로는 몇 cm인가요?", a: 9 }
  ],
  triangle: [
    { q: "[1단계] 밑변이 4cm, 높이가 3cm인 직사각형의 넓이는 12cm²입니다. 이것을 대각선으로 반 자른 삼각형의 넓이는?", a: 6 },
    { q: "[2단계] 밑변이 10cm, 높이가 6cm인 삼각형 깃발의 넓이는 몇 cm²인가요?", a: 30 },
    { q: "[3단계] 넓이가 24cm²인 삼각형이 있습니다. 밑변이 8cm라면 높이는 몇 cm일까요?", a: 6 }
  ],
  rhombus: [
    { q: "[1단계] 두 대각선이 4cm, 6cm인 마름모를 감싸는 직사각형의 넓이는 24cm²입니다. 마름모의 넓이는?", a: 12 },
    { q: "[2단계] 두 대각선의 길이가 각각 10cm, 8cm인 마름모 모양 방패의 넓이는?", a: 40 },
    { q: "[3단계] 넓이가 50cm²인 마름모 연이 있습니다. 한 대각선이 10cm일 때, 다른 대각선은 몇 cm인가요?", a: 10 }
  ],
  trapezoid: [
    { q: "[1단계] 사다리꼴 2개를 이어붙여 만든 평행사변형의 넓이가 40cm²입니다. 원래 사다리꼴 1개의 넓이는?", a: 20 },
    { q: "[2단계] 윗변 4cm, 아랫변 6cm, 높이가 5cm인 사다리꼴 창문의 넓이는?", a: 25 },
    { q: "[3단계] 윗변이 3cm, 아랫변이 5cm인 사다리꼴의 넓이가 16cm²입니다. 이 사다리꼴의 높이는 몇 cm인가요?", a: 4 }
  ]
};

// ==========================================
// 공통 3단계 퀴즈 모듈
// ==========================================
function QuizModule({ questions, onComplete }: { questions: any[], onComplete: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState('');

  const handleCheck = () => {
    if (parseInt(answer) === questions[currentIndex].a) {
      toast.success("정답입니다! 완벽하게 이해했네요! 🎉");
      setAnswer('');
      if (currentIndex + 1 < questions.length) {
        setCurrentIndex(currentIndex + 1);
      } else {
        onComplete();
      }
    } else {
      toast.error("조금만 더 생각해 볼까요? 공식을 다시 떠올려 보세요! 🤔");
    }
  };

  return (
    <div className="bg-slate-800 p-8 rounded-[2rem] border-4 border-indigo-500/30 shadow-xl mt-8">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-black text-white">도전! 3단계 연습 문제 📝</h3>
        <span className="bg-indigo-600 px-4 py-1 rounded-full text-sm font-bold text-white">
          {currentIndex + 1} / {questions.length}
        </span>
      </div>
      <p className="text-2xl font-bold text-slate-200 mb-8 leading-snug">
        {questions[currentIndex].q}
      </p>
      <div className="flex gap-4">
        <input 
          type="number" 
          value={answer} 
          onChange={e => setAnswer(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCheck()}
          className="flex-1 bg-slate-900 border-2 border-slate-600 rounded-2xl px-6 py-4 text-2xl font-black text-white text-center outline-none focus:border-indigo-500 transition-colors"
          placeholder="정답 입력 (숫자만)"
        />
        <button onClick={handleCheck} className="bg-indigo-500 hover:bg-indigo-400 text-white px-10 py-4 rounded-2xl font-black text-xl transition-transform active:scale-95 shadow-lg">
          확인
        </button>
      </div>
    </div>
  );
}

// ==========================================
// [1] 단위 넓이 (1cm²) 타일 채우기 섬
// ==========================================
function UnitIsland({ onClear }: { onClear: () => void }) {
  const totalTiles = 12; // 4x3
  const [tiles, setTiles] = useState<boolean[]>(Array(totalTiles).fill(false));
  const [step, setStep] = useState<1|2>(1);

  const handleTileClick = (index: number) => {
    const newTiles = [...tiles];
    newTiles[index] = true;
    setTiles(newTiles);
    if (!newTiles[index]) toast('착!', { icon: '🟦', duration: 500 });
  };

  const isAllFilled = tiles.every(t => t);

  return (
    <div className="animate-in fade-in zoom-in-95 duration-500">
      <h2 className="text-3xl font-black text-blue-400 mb-6 flex items-center gap-3">
        🟦 단위 넓이의 섬 <span className="text-lg text-slate-400 font-bold ml-auto">넓이는 타일의 개수다!</span>
      </h2>
      
      {step === 1 ? (
        <div className="bg-slate-800 p-8 rounded-[2rem] border-2 border-blue-900 text-center">
          <p className="text-slate-300 font-bold mb-6 text-lg">빈 공간을 클릭해서 <span className="text-blue-400">가로 1cm, 세로 1cm인 단위 타일(1cm²)</span>로 모두 채워보세요!</p>
          
          <div className="grid grid-cols-4 gap-1 w-64 mx-auto mb-8 p-1 bg-slate-900 border-4 border-slate-700 rounded-lg">
            {tiles.map((isFilled, idx) => (
              <button 
                key={idx} 
                onClick={() => handleTileClick(idx)}
                className={`h-14 rounded-sm transition-all duration-300 flex items-center justify-center font-bold text-xs ${isFilled ? 'bg-blue-500 text-white shadow-inner scale-100' : 'bg-slate-800 border border-slate-700 hover:bg-slate-700 scale-95'}`}
              >
                {isFilled && '1cm²'}
              </button>
            ))}
          </div>

          {isAllFilled ? (
            <div className="animate-in slide-in-from-bottom-4">
              <p className="text-2xl font-black text-white mb-2">타일 12개로 꽉 채웠어요! 🎉</p>
              <p className="text-blue-300 font-bold mb-6">가로 1cm, 세로 1cm를 곱하면 1cm²(1제곱센티미터)가 됩니다.<br/>cm가 두 번 곱해져서 오른쪽 위에 작은 2가 붙는 거예요!</p>
              <button onClick={() => setStep(2)} className="bg-blue-500 hover:bg-blue-400 text-white font-black px-10 py-4 rounded-xl text-lg shadow-lg active:scale-95 transition-all">
                개념 이해 완료! 연습문제 풀기 ➡
              </button>
            </div>
          ) : (
             <p className="text-slate-500 font-bold">아직 덜 채워진 공간이 있어요.</p>
          )}
        </div>
      ) : (
        <QuizModule questions={QUIZ_DATA.unit} onComplete={onClear} />
      )}
    </div>
  );
}

// ==========================================
// [2] 직사각형과 정사각형의 섬
// ==========================================
function RectangleIsland({ onClear }: { onClear: () => void }) {
  const [w, setW] = useState(5);
  const [h, setH] = useState(3);
  const [step, setStep] = useState<1|2>(1);

  return (
    <div className="animate-in fade-in zoom-in-95 duration-500">
      <h2 className="text-3xl font-black text-sky-400 mb-6 flex items-center gap-3">
        🟩 직사각형의 섬 <span className="text-lg text-slate-400 font-bold ml-auto">일일이 세지 말고 곱하자!</span>
      </h2>
      
      {step === 1 ? (
        <div className="bg-slate-800 p-8 rounded-[2rem] border-2 border-sky-900">
          <div className="flex flex-col md:flex-row gap-10 items-center">
            <div className="w-full md:w-1/2 h-64 bg-slate-900 rounded-3xl flex items-center justify-center relative border-4 border-slate-700 overflow-hidden">
              <div 
                className="grid gap-[1px] bg-slate-600 border-2 border-sky-500 transition-all" 
                style={{ gridTemplateColumns: `repeat(${w}, minmax(0, 1fr))`, width: `${w * 25}px`, height: `${h * 25}px` }}
              >
                {Array.from({ length: w * h }).map((_, i) => (
                  <div key={i} className="bg-sky-500/80 w-full h-full flex items-center justify-center text-[8px] text-white/50 font-black">1</div>
                ))}
              </div>
            </div>
            <div className="w-full md:w-1/2 space-y-6">
              <div>
                <label className="block font-black text-slate-400 mb-2 text-lg">가로 (타일 개수): {w}</label>
                <input type="range" min="2" max="8" value={w} onChange={e=>setW(Number(e.target.value))} className="w-full accent-sky-500 h-3 rounded-lg" />
              </div>
              <div>
                <label className="block font-black text-slate-400 mb-2 text-lg">세로 (줄 수): {h}</label>
                <input type="range" min="2" max="8" value={h} onChange={e=>setH(Number(e.target.value))} className="w-full accent-sky-500 h-3 rounded-lg" />
              </div>
              <div className="bg-sky-900/50 p-6 rounded-2xl border border-sky-800 text-center">
                <p className="text-sky-300 font-bold mb-2">💡 발견한 공식</p>
                <p className="text-2xl font-black text-white">가로 × 세로 = 넓이</p>
                <p className="text-xl font-bold text-sky-400 mt-2">{w} × {h} = {w*h}cm²</p>
              </div>
              <button onClick={() => setStep(2)} className="w-full bg-sky-500 hover:bg-sky-400 text-white font-black py-4 rounded-xl text-lg shadow-lg active:scale-95 transition-all">
                연습문제로 실력 다지기 ➡
              </button>
            </div>
          </div>
        </div>
      ) : (
        <QuizModule questions={QUIZ_DATA.rectangle} onComplete={onClear} />
      )}
    </div>
  );
}

// ==========================================
// [3] 삼각형의 섬 (절반의 마법)
// ==========================================
function TriangleIsland({ onClear }: { onClear: () => void }) {
  const [isTransformed, setIsTransformed] = useState(false);
  const [step, setStep] = useState<1|2>(1);

  // SVG viewBox가 "0 0 200 100" 이고, 
  // 원본 삼각형이 0,0 150,100 사각형을 채우고 있으므로,
  // 합쳐질 직사각형의 중심 좌표는 (150/2, 100/2) = (75, 50) 입니다.

  return (
    <div className="animate-in fade-in zoom-in-95 duration-500">
      <h2 className="text-3xl font-black text-emerald-400 mb-6 flex items-center gap-3">
        🔺 삼각형의 섬 <span className="text-lg text-slate-400 font-bold ml-auto">복사해서 붙이면 직사각형!</span>
      </h2>
      
      {step === 1 ? (
        <div className="bg-slate-800 p-8 rounded-[2rem] border-2 border-emerald-900">
          <p className="text-slate-300 font-bold mb-6 text-lg text-center">삼각형은 타일을 세기 어려워요. [쌍둥이 소환] 버튼을 눌러보세요!</p>
          <div className="flex flex-col items-center gap-8">
            <div className="w-64 h-40 bg-slate-900 rounded-3xl flex items-center justify-center relative border-4 border-slate-700 overflow-hidden">
               {/* 직각삼각형 SVG 애니메이션 */}
               <svg viewBox="0 0 200 100" className="w-48 h-24 overflow-visible">
                  {/* 원본 삼각형: 0,100(좌하), 150,100(우하), 0,0(좌상) */}
                  <polygon points="0,100 150,100 0,0" className="fill-emerald-500 opacity-90 stroke-emerald-400 stroke-2" />
                  
                  {/* 복사되어 회전하는 삼각형 */}
                  <polygon 
                    points="0,100 150,100 0,0" 
                    className={`fill-emerald-400/80 stroke-emerald-300 stroke-2`}
                    // 🌟 핵심 해결책: SVG transform 속성을 사용하여 미래 직사각형의 중심(75, 50)을 기준으로 180도 회전
                    transform={isTransformed ? `rotate(180, 75, 50)` : `rotate(0, 75, 50)`}
                    style={{ 
                      opacity: isTransformed ? 1 : 0,
                      transition: 'transform 1000ms, opacity 1000ms' // 🌟 CSS로 애니메이션 처리
                    }}
                  />
                  <text x="60" y="120" className="fill-emerald-300 font-bold text-sm">밑변 (15cm)</text>
                  <text x="-60" y="60" className="fill-emerald-300 font-bold text-sm origin-center -rotate-90">높이 (10cm)</text>
               </svg>
            </div>

            <div className="flex gap-4 relative z-20">
              <button 
                onClick={() => setIsTransformed(!isTransformed)} 
                className="bg-slate-700 hover:bg-slate-600 text-emerald-400 font-black px-6 py-3 rounded-xl border border-emerald-800 transition-all active:scale-95 shadow-md"
              >
                {isTransformed ? '원래대로 되돌리기' : '✨ 쌍둥이 소환해서 합체하기!'}
              </button>
            </div>

            {isTransformed && (
              <div className="bg-emerald-900/50 p-6 rounded-2xl border border-emerald-800 text-center w-full max-w-md animate-in slide-in-from-bottom-4 relative z-10">
                <p className="text-emerald-300 font-bold mb-2">💡 발견한 공식</p>
                <p className="text-lg font-bold text-white mb-1">똑같은 걸 2개 붙였더니 <span className="text-emerald-400">직사각형(밑변×높이)</span>이 되었어요!</p>
                <p className="text-2xl font-black text-white">그래서 넓이는 <span className="text-emerald-400">(밑변 × 높이) ÷ 2</span></p>
                <button onClick={() => setStep(2)} className="mt-6 w-full bg-emerald-500 hover:bg-emerald-400 text-white font-black py-4 rounded-xl text-lg shadow-lg active:scale-95 transition-all">
                  연습문제로 실력 다지기 ➡
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <QuizModule questions={QUIZ_DATA.triangle} onComplete={onClear} />
      )}
    </div>
  );
}

// ==========================================
// [4] 마름모의 섬 (액자 씌우기)
// ==========================================
function RhombusIsland({ onClear }: { onClear: () => void }) {
  const [isFramed, setIsFramed] = useState(false);
  const [step, setStep] = useState<1|2>(1);

  return (
    <div className="animate-in fade-in zoom-in-95 duration-500">
      <h2 className="text-3xl font-black text-fuchsia-400 mb-6 flex items-center gap-3">
        ◇ 마름모의 섬 <span className="text-lg text-slate-400 font-bold ml-auto">직사각형 액자 속에 갇힌 보석!</span>
      </h2>
      
      {step === 1 ? (
        <div className="bg-slate-800 p-8 rounded-[2rem] border-2 border-fuchsia-900">
          <p className="text-slate-300 font-bold mb-6 text-lg text-center">[액자 씌우기]를 눌러 마름모를 감싸는 직사각형을 만들어보세요.</p>
          <div className="flex flex-col items-center gap-8">
            <div className="w-64 h-64 bg-slate-900 rounded-3xl flex items-center justify-center relative border-4 border-slate-700">
               <svg viewBox="0 0 200 200" className="w-48 h-48 overflow-visible">
                  {/* 대각선 가이드 선 */}
                  <line x1="100" y1="0" x2="100" y2="200" className="stroke-fuchsia-700 stroke-1 stroke-dasharray-4" />
                  <line x1="0" y1="100" x2="200" y2="100" className="stroke-fuchsia-700 stroke-1 stroke-dasharray-4" />
                  
                  {/* 외부 직사각형 액자 */}
                  <rect 
                    x="0" y="0" width="200" height="200" 
                    className={`fill-fuchsia-500/20 stroke-fuchsia-400 stroke-dashed stroke-2 transition-all duration-1000 ${isFramed ? 'opacity-100' : 'opacity-0'}`} 
                  />
                  {/* 외부 모서리 삼각형들 (접혀들어오는 효과 연출용) */}
                  <polygon points="0,0 100,0 0,100" className={`fill-fuchsia-500/40 transition-all duration-1000 ${isFramed ? 'opacity-100' : 'opacity-0'}`} />
                  <polygon points="200,0 100,0 200,100" className={`fill-fuchsia-500/40 transition-all duration-1000 ${isFramed ? 'opacity-100' : 'opacity-0'}`} />
                  <polygon points="0,200 100,200 0,100" className={`fill-fuchsia-500/40 transition-all duration-1000 ${isFramed ? 'opacity-100' : 'opacity-0'}`} />
                  <polygon points="200,200 100,200 200,100" className={`fill-fuchsia-500/40 transition-all duration-1000 ${isFramed ? 'opacity-100' : 'opacity-0'}`} />

                  {/* 원본 마름모 */}
                  <polygon points="100,0 200,100 100,200 0,100" className="fill-fuchsia-600 stroke-fuchsia-300 stroke-2 relative z-10" />
               </svg>
            </div>

            <button 
              onClick={() => setIsFramed(!isFramed)} 
              className="bg-slate-700 hover:bg-slate-600 text-fuchsia-400 font-black px-6 py-3 rounded-xl border border-fuchsia-800 transition-all"
            >
              {isFramed ? '액자 벗기기' : '🖼️ 직사각형 액자 씌우기'}
            </button>

            {isFramed && (
              <div className="bg-fuchsia-900/50 p-6 rounded-2xl border border-fuchsia-800 text-center w-full max-w-md animate-in slide-in-from-bottom-4">
                <p className="text-fuchsia-300 font-bold mb-2">💡 발견한 공식</p>
                <p className="text-lg font-bold text-white mb-1">직사각형 넓이(가로 대각선 × 세로 대각선)의 <span className="text-fuchsia-400">정확히 절반</span>이에요!</p>
                <p className="text-2xl font-black text-white">넓이 = <span className="text-fuchsia-400">(한 대각선 × 다른 대각선) ÷ 2</span></p>
                <button onClick={() => setStep(2)} className="mt-6 w-full bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-black py-4 rounded-xl text-lg shadow-lg active:scale-95 transition-all">
                  연습문제로 실력 다지기 ➡
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <QuizModule questions={QUIZ_DATA.rhombus} onComplete={onClear} />
      )}
    </div>
  );
}

// ==========================================
// [5] 사다리꼴의 섬 (거꾸로 붙이기)
// ==========================================
function TrapezoidIsland({ onClear }: { onClear: () => void }) {
  const [isTransformed, setIsTransformed] = useState(false);
  const [step, setStep] = useState<1|2>(1);

  return (
    <div className="animate-in fade-in zoom-in-95 duration-500">
      <h2 className="text-3xl font-black text-amber-400 mb-6 flex items-center gap-3">
        ⏢ 사다리꼴의 섬 <span className="text-lg text-slate-400 font-bold ml-auto">뒤집어 붙이면 거대한 평행사변형!</span>
      </h2>
      
      {step === 1 ? (
        <div className="bg-slate-800 p-8 rounded-[2rem] border-2 border-amber-900">
          <p className="text-slate-300 font-bold mb-6 text-lg text-center">윗변과 아랫변이 달라요. [쌍둥이 소환]으로 똑같은 걸 뒤집어 붙여볼까요?</p>
          <div className="flex flex-col items-center gap-8">
            <div className="w-full max-w-lg h-48 bg-slate-900 rounded-3xl flex items-center justify-center relative border-4 border-slate-700 overflow-hidden">
               <svg viewBox="0 0 400 150" className="w-full h-32 overflow-visible">
                  {/* 원본 사다리꼴: 윗변 60, 아랫변 120 */}
                  <polygon points="60,0 120,0 160,100 40,100" className="fill-amber-500 stroke-amber-200 stroke-2" />
                  
                  {/* 복사 및 회전, 이동된 사다리꼴 */}
                  <polygon 
                    points="60,0 120,0 160,100 40,100" 
                    className="fill-amber-400/80 stroke-amber-200 stroke-2 transition-all duration-1000 origin-center"
                    style={{ 
                      transform: isTransformed ? 'translate(90px, 0px) rotate(180deg)' : 'translate(0px, 0px) rotate(0deg)',
                      opacity: isTransformed ? 1 : 0
                    }}
                  />
                  <text x="75" y="-10" className="fill-amber-300 font-bold text-sm">윗변</text>
                  <text x="85" y="125" className="fill-amber-300 font-bold text-sm">아랫변</text>
               </svg>
            </div>

            <button 
              onClick={() => setIsTransformed(!isTransformed)} 
              className="bg-slate-700 hover:bg-slate-600 text-amber-400 font-black px-6 py-3 rounded-xl border border-amber-800 transition-all"
            >
              {isTransformed ? '원래대로 되돌리기' : '✨ 쌍둥이 소환해서 뒤집어 붙이기!'}
            </button>

            {isTransformed && (
              <div className="bg-amber-900/50 p-6 rounded-2xl border border-amber-800 text-center w-full max-w-md animate-in slide-in-from-bottom-4">
                <p className="text-amber-300 font-bold mb-2">💡 발견한 공식</p>
                <p className="text-lg font-bold text-white mb-1">합쳤더니 가로가 <span className="text-amber-400">(윗변 + 아랫변)</span>인 평행사변형이 되었어요!</p>
                <p className="text-xl font-black text-white">넓이 = <span className="text-amber-400">(윗변 + 아랫변) × 높이 ÷ 2</span></p>
                <button onClick={() => setStep(2)} className="mt-6 w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-black py-4 rounded-xl text-lg shadow-lg active:scale-95 transition-all">
                  연습문제로 실력 다지기 ➡
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <QuizModule questions={QUIZ_DATA.trapezoid} onComplete={onClear} />
      )}
    </div>
  );
}

// ==========================================
// 메인 컨트롤러: 맵 네비게이션
// ==========================================
type ViewState = 'map' | 'unit' | 'rectangle' | 'triangle' | 'rhombus' | 'trapezoid';

export default function PolygonLearning() {
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState<ViewState>('map');
  const [clearedStages, setClearedStages] = useState<string[]>([]);

  const handleClear = (stage: string) => {
    if (!clearedStages.includes(stage)) {
      setClearedStages([...clearedStages, stage]);
    }
    toast.success(`축하합니다! ${stage} 마스터 뱃지 획득! 🏆`, { duration: 4000, style: { fontSize: '1.2rem', padding: '16px' }});
    setCurrentView('map');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        
        {/* 상단 헤더 */}
        <div className="flex justify-between items-center mb-10 bg-slate-800/50 p-4 rounded-3xl backdrop-blur-sm border border-slate-700/50">
          <button onClick={() => navigate('/')} className="text-slate-300 hover:bg-slate-700 px-6 py-3 rounded-2xl font-bold transition-colors">
            🏠 홈으로
          </button>
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-emerald-400 to-amber-400">
              다각형 넓이 탐험대 🗺️
            </h1>
          </div>
          <div className="text-right px-4">
            <span className="text-slate-400 font-bold text-sm block">획득한 뱃지</span>
            <span className="text-2xl">{clearedStages.length} / 5</span>
          </div>
        </div>

        {/* 지도 뷰 */}
        {currentView === 'map' && (
          <div className="animate-in fade-in zoom-in-95 duration-500">
            <p className="text-center text-slate-400 font-bold text-xl mb-10">
              가장 먼저 <span className="text-blue-400">[단위 넓이의 섬]</span>부터 방문하는 것을 추천해요!
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              <button onClick={() => setCurrentView('unit')} className={`p-8 rounded-[2.5rem] border-4 transition-all hover:scale-[1.02] text-left relative overflow-hidden ${clearedStages.includes('단위 넓이') ? 'bg-slate-800 border-blue-500/50' : 'bg-slate-800 border-slate-700 hover:border-blue-500'}`}>
                {clearedStages.includes('단위 넓이') && <div className="absolute top-6 right-6 text-4xl">🏆</div>}
                <div className="text-6xl mb-4">🟦</div>
                <h3 className="text-2xl font-black text-white mb-2">단위 넓이의 섬</h3>
                <p className="text-slate-400 font-bold text-sm">1cm²의 비밀 밝히기</p>
              </button>

              <button onClick={() => setCurrentView('rectangle')} className={`p-8 rounded-[2.5rem] border-4 transition-all hover:scale-[1.02] text-left relative overflow-hidden ${clearedStages.includes('직사각형') ? 'bg-slate-800 border-sky-500/50' : 'bg-slate-800 border-slate-700 hover:border-sky-500'}`}>
                {clearedStages.includes('직사각형') && <div className="absolute top-6 right-6 text-4xl">🏆</div>}
                <div className="text-6xl mb-4">🟩</div>
                <h3 className="text-2xl font-black text-white mb-2">직사각형의 섬</h3>
                <p className="text-slate-400 font-bold text-sm">가로 세로 곱셈의 마법</p>
              </button>

              <button onClick={() => setCurrentView('triangle')} className={`p-8 rounded-[2.5rem] border-4 transition-all hover:scale-[1.02] text-left relative overflow-hidden ${clearedStages.includes('삼각형') ? 'bg-slate-800 border-emerald-500/50' : 'bg-slate-800 border-slate-700 hover:border-emerald-500'}`}>
                {clearedStages.includes('삼각형') && <div className="absolute top-6 right-6 text-4xl">🏆</div>}
                <div className="text-6xl mb-4 text-emerald-500">🔺</div>
                <h3 className="text-2xl font-black text-white mb-2">삼각형의 섬</h3>
                <p className="text-slate-400 font-bold text-sm">÷2를 잊지 마세요!</p>
              </button>

              <button onClick={() => setCurrentView('rhombus')} className={`p-8 rounded-[2.5rem] border-4 transition-all hover:scale-[1.02] text-left relative overflow-hidden ${clearedStages.includes('마름모') ? 'bg-slate-800 border-fuchsia-500/50' : 'bg-slate-800 border-slate-700 hover:border-fuchsia-500'}`}>
                {clearedStages.includes('마름모') && <div className="absolute top-6 right-6 text-4xl">🏆</div>}
                <div className="text-6xl mb-4">◇</div>
                <h3 className="text-2xl font-black text-white mb-2">마름모의 섬</h3>
                <p className="text-slate-400 font-bold text-sm">대각선끼리 곱하고 반으로!</p>
              </button>

              <button onClick={() => setCurrentView('trapezoid')} className={`p-8 rounded-[2.5rem] border-4 transition-all hover:scale-[1.02] text-left relative overflow-hidden ${clearedStages.includes('사다리꼴') ? 'bg-slate-800 border-amber-500/50' : 'bg-slate-800 border-slate-700 hover:border-amber-500'}`}>
                {clearedStages.includes('사다리꼴') && <div className="absolute top-6 right-6 text-4xl">🏆</div>}
                <div className="text-6xl mb-4">⏢</div>
                <h3 className="text-2xl font-black text-white mb-2">사다리꼴의 섬</h3>
                <p className="text-slate-400 font-bold text-sm">위 아래 더하고 쌍둥이 합체!</p>
              </button>
            </div>
          </div>
        )}

        {/* 렌더링 스위치 */}
        {currentView !== 'map' && (
          <div className="mb-6">
            <button onClick={() => setCurrentView('map')} className="text-slate-400 hover:text-white font-bold bg-slate-800 px-6 py-2 rounded-xl transition-colors mb-8 text-sm">
              ← 지도로 돌아가기
            </button>
            
            {currentView === 'unit' && <UnitIsland onClear={() => handleClear('단위 넓이')} />}
            {currentView === 'rectangle' && <RectangleIsland onClear={() => handleClear('직사각형')} />}
            {currentView === 'triangle' && <TriangleIsland onClear={() => handleClear('삼각형')} />}
            {currentView === 'rhombus' && <RhombusIsland onClear={() => handleClear('마름모')} />}
            {currentView === 'trapezoid' && <TrapezoidIsland onClear={() => handleClear('사다리꼴')} />}
          </div>
        )}

      </div>
    </div>
  );
}