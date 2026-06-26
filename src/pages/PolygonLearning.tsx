// src/pages/PolygonLearning.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

// ==========================================
// 퀴즈 데이터베이스 (다양한 문제 상황)
// ==========================================
const QUIZ_DATA = {
  rectangle: [
    { q: "가로가 7cm, 세로가 4cm인 직사각형 수첩의 둘레는 몇 cm일까요?", a: 22 },
    { q: "둘레가 30cm인 직사각형 액자가 있습니다. 가로가 10cm라면 세로는 몇 cm일까요?", a: 5 },
    { q: "가로 15m, 세로 10m인 직사각형 텃밭의 테두리에 울타리를 치려고 합니다. 울타리의 총 길이는?", a: 50 }
  ],
  parallelogram: [
    { q: "밑변이 8cm, 옆변이 5cm인 평행사변형 타일의 둘레는?", a: 26 },
    { q: "둘레가 40m인 평행사변형 모양의 공원이 있습니다. 한 밑변이 12m라면 다른 옆변의 길이는?", a: 8 },
    { q: "밑변 6cm, 옆변 9cm인 평행사변형을 2개 이어붙였을 때, 테두리의 총 길이는? (힌트: 겹치는 부분 생각!)", a: 42 }
  ],
  rhombus: [
    { q: "한 변의 길이가 9cm인 마름모 모양의 연의 둘레는?", a: 36 },
    { q: "둘레가 48cm인 마름모 모양의 쿠션이 있습니다. 이 쿠션의 한 변의 길이는?", a: 12 },
    { q: "철사 60cm를 남김없이 구부려 마름모를 만들었습니다. 한 변의 길이는 몇 cm가 될까요?", a: 15 }
  ],
  regular: [
    { q: "한 변의 길이가 5cm인 정팔각형의 둘레는?", a: 40 },
    { q: "둘레가 36cm인 정육각형의 한 변의 길이는?", a: 6 },
    { q: "한 변이 12cm인 정삼각형과 한 변이 9cm인 정사각형 중 둘레가 더 긴 도형의 둘레는?", a: 36 }
  ],
  finalBoss: [
    { q: "[종합] 한 변이 8cm인 정사각형과 둘레가 같은 직사각형이 있습니다. 이 직사각형의 가로가 10cm일 때 세로는?", a: 6 },
    { q: "[종합] 밑변이 7cm, 옆변이 6cm인 평행사변형 3개의 둘레의 합은?", a: 78 }
  ]
};

// ==========================================
// 공통 퀴즈 컴포넌트
// ==========================================
function QuizModule({ questions, onComplete }: { questions: any[], onComplete: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState('');

  const handleCheck = () => {
    if (parseInt(answer) === questions[currentIndex].a) {
      toast.success("정답입니다! 최고예요! 🎉");
      setAnswer('');
      if (currentIndex + 1 < questions.length) {
        setCurrentIndex(currentIndex + 1);
      } else {
        onComplete();
      }
    } else {
      toast.error("아쉽네요! 다시 한번 천천히 계산해 보세요. 🤔");
    }
  };

  return (
    <div className="bg-slate-800 p-8 rounded-[2rem] border-4 border-indigo-500/30 shadow-xl mt-8">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-black text-white">도전! 실전 연습 문제 📝</h3>
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
// 각 도형별 학습 섬 (Island) 컴포넌트들
// ==========================================

function RectangleIsland({ onClear }: { onClear: () => void }) {
  const [w, setW] = useState(5);
  const [h, setH] = useState(3);
  const [step, setStep] = useState<1|2>(1); // 1: 원리, 2: 퀴즈

  return (
    <div className="animate-in fade-in zoom-in-95 duration-500">
      <h2 className="text-3xl font-black text-sky-400 mb-6 flex items-center gap-3">
        🟦 직사각형의 섬 <span className="text-lg text-slate-400 font-bold ml-auto">마주보는 변의 길이는 같다!</span>
      </h2>
      
      {step === 1 ? (
        <div className="bg-slate-800 p-8 rounded-[2rem] border-2 border-sky-900">
          <p className="text-slate-300 font-bold mb-6 text-lg">슬라이더를 움직여보고 직사각형의 둘레를 구하는 공식을 발견해 보세요.</p>
          <div className="flex flex-col md:flex-row gap-10 items-center">
            <div className="w-full md:w-1/2 h-64 bg-slate-900 rounded-3xl flex items-center justify-center relative border-4 border-slate-700">
              <div className="bg-sky-500/20 border-4 border-sky-500 flex items-center justify-center relative transition-all" style={{ width: `${w * 20}px`, height: `${h * 20}px` }}>
                <span className="absolute -top-8 text-sky-400 font-black text-lg">{w}cm</span>
                <span className="absolute -right-12 text-sky-400 font-black text-lg">{h}cm</span>
              </div>
            </div>
            <div className="w-full md:w-1/2 space-y-6">
              <div>
                <label className="block font-black text-slate-400 mb-2 text-lg">가로: {w}cm</label>
                <input type="range" min="2" max="10" value={w} onChange={e=>setW(Number(e.target.value))} className="w-full accent-sky-500 h-3 rounded-lg" />
              </div>
              <div>
                <label className="block font-black text-slate-400 mb-2 text-lg">세로: {h}cm</label>
                <input type="range" min="2" max="10" value={h} onChange={e=>setH(Number(e.target.value))} className="w-full accent-sky-500 h-3 rounded-lg" />
              </div>
              <div className="bg-sky-900/50 p-6 rounded-2xl border border-sky-800 text-center">
                <p className="text-sky-300 font-bold mb-2">💡 발견한 공식</p>
                <p className="text-2xl font-black text-white">( 가로 + 세로 ) x 2 = 둘레</p>
                <p className="text-xl font-bold text-sky-400 mt-2">({w} + {h}) x 2 = {(w+h)*2}cm</p>
              </div>
              <button onClick={() => setStep(2)} className="w-full bg-sky-500 hover:bg-sky-400 text-white font-black py-4 rounded-xl text-lg shadow-lg active:scale-95 transition-all">
                공식 이해 완료! 연습문제 풀기 ➡
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

function ParallelogramIsland({ onClear }: { onClear: () => void }) {
  const [b, setB] = useState(6);
  const [s, setS] = useState(4);
  const [step, setStep] = useState<1|2>(1);

  return (
    <div className="animate-in fade-in zoom-in-95 duration-500">
      <h2 className="text-3xl font-black text-emerald-400 mb-6 flex items-center gap-3">
        ▱ 평행사변형의 섬 <span className="text-lg text-slate-400 font-bold ml-auto">기울어져도 원리는 직사각형과 같다!</span>
      </h2>
      
      {step === 1 ? (
        <div className="bg-slate-800 p-8 rounded-[2rem] border-2 border-emerald-900">
          <div className="flex flex-col md:flex-row gap-10 items-center">
            <div className="w-full md:w-1/2 h-64 bg-slate-900 rounded-3xl flex items-center justify-center relative border-4 border-slate-700">
              <div className="bg-emerald-500/20 border-4 border-emerald-500 transition-all transform -skew-x-12 relative" style={{ width: `${b * 20}px`, height: `${s * 20}px` }}>
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-emerald-400 font-black text-lg skew-x-12">{b}cm</span>
                <span className="absolute -right-14 top-1/2 -translate-y-1/2 text-emerald-400 font-black text-lg skew-x-12">{s}cm</span>
              </div>
            </div>
            <div className="w-full md:w-1/2 space-y-6">
              <div>
                <label className="block font-black text-slate-400 mb-2 text-lg">밑변: {b}cm</label>
                <input type="range" min="3" max="10" value={b} onChange={e=>setB(Number(e.target.value))} className="w-full accent-emerald-500 h-3 rounded-lg" />
              </div>
              <div>
                <label className="block font-black text-slate-400 mb-2 text-lg">옆변: {s}cm</label>
                <input type="range" min="3" max="10" value={s} onChange={e=>setS(Number(e.target.value))} className="w-full accent-emerald-500 h-3 rounded-lg" />
              </div>
              <div className="bg-emerald-900/50 p-6 rounded-2xl border border-emerald-800 text-center">
                <p className="text-emerald-300 font-bold mb-2">💡 발견한 공식</p>
                <p className="text-2xl font-black text-white">( 밑변 + 옆변 ) x 2 = 둘레</p>
                <p className="text-xl font-bold text-emerald-400 mt-2">({b} + {s}) x 2 = {(b+s)*2}cm</p>
              </div>
              <button onClick={() => setStep(2)} className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-black py-4 rounded-xl text-lg shadow-lg active:scale-95 transition-all">
                연습문제로 실력 다지기 ➡
              </button>
            </div>
          </div>
        </div>
      ) : (
        <QuizModule questions={QUIZ_DATA.parallelogram} onComplete={onClear} />
      )}
    </div>
  );
}

function RhombusIsland({ onClear }: { onClear: () => void }) {
  const [s, setS] = useState(5);
  const [step, setStep] = useState<1|2>(1);

  return (
    <div className="animate-in fade-in zoom-in-95 duration-500">
      <h2 className="text-3xl font-black text-fuchsia-400 mb-6 flex items-center gap-3">
        ◇ 마름모의 섬 <span className="text-lg text-slate-400 font-bold ml-auto">네 변의 길이가 모두 똑같아!</span>
      </h2>
      
      {step === 1 ? (
        <div className="bg-slate-800 p-8 rounded-[2rem] border-2 border-fuchsia-900">
          <div className="flex flex-col md:flex-row gap-10 items-center">
            <div className="w-full md:w-1/2 h-64 bg-slate-900 rounded-3xl flex items-center justify-center relative border-4 border-slate-700">
              <div className="bg-fuchsia-500/20 border-4 border-fuchsia-500 transition-all transform rotate-45 relative" style={{ width: `${s * 20}px`, height: `${s * 20}px` }}>
                <span className="absolute -top-8 -left-8 text-fuchsia-400 font-black text-lg -rotate-45">{s}cm</span>
              </div>
            </div>
            <div className="w-full md:w-1/2 space-y-6">
              <div>
                <label className="block font-black text-slate-400 mb-2 text-lg">한 변의 길이: {s}cm</label>
                <input type="range" min="3" max="10" value={s} onChange={e=>setS(Number(e.target.value))} className="w-full accent-fuchsia-500 h-3 rounded-lg" />
              </div>
              <div className="bg-fuchsia-900/50 p-6 rounded-2xl border border-fuchsia-800 text-center">
                <p className="text-fuchsia-300 font-bold mb-2">💡 발견한 공식</p>
                <p className="text-2xl font-black text-white">한 변의 길이 x 4 = 둘레</p>
                <p className="text-xl font-bold text-fuchsia-400 mt-2">{s} x 4 = {s*4}cm</p>
              </div>
              <button onClick={() => setStep(2)} className="w-full bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-black py-4 rounded-xl text-lg shadow-lg active:scale-95 transition-all">
                연습문제로 실력 다지기 ➡
              </button>
            </div>
          </div>
        </div>
      ) : (
        <QuizModule questions={QUIZ_DATA.rhombus} onComplete={onClear} />
      )}
    </div>
  );
}

function RegularPolygonIsland({ onClear }: { onClear: () => void }) {
  const [sides, setSides] = useState(5); // 오각형
  const [length, setLength] = useState(4);
  const [step, setStep] = useState<1|2>(1);

  const getPolygonName = (s: number) => {
    const names: Record<number, string> = { 3: '정삼각형', 4: '정사각형', 5: '정오각형', 6: '정육각형', 7: '정칠각형', 8: '정팔각형' };
    return names[s] || `정${s}각형`;
  };

  return (
    <div className="animate-in fade-in zoom-in-95 duration-500">
      <h2 className="text-3xl font-black text-amber-400 mb-6 flex items-center gap-3">
        ⭐ 정다각형의 섬 <span className="text-lg text-slate-400 font-bold ml-auto">변의 개수만큼 곱해주면 끝!</span>
      </h2>
      
      {step === 1 ? (
        <div className="bg-slate-800 p-8 rounded-[2rem] border-2 border-amber-900">
          <div className="flex flex-col md:flex-row gap-10 items-center">
            <div className="w-full md:w-1/2 h-64 bg-slate-900 rounded-3xl flex items-center justify-center relative border-4 border-slate-700">
               {/* CSS로 다각형 근사치 그리기 (시각적 재미 요소) */}
               <div className="text-amber-500 text-9xl font-black drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]">
                 {sides === 3 && '🔺'}
                 {sides === 4 && '🟦'}
                 {sides === 5 && '⬠'}
                 {sides === 6 && '⬡'}
                 {sides > 6 && '⚙️'}
               </div>
            </div>
            <div className="w-full md:w-1/2 space-y-6">
              <div>
                <label className="block font-black text-slate-400 mb-2 text-lg">어떤 도형인가요? : {getPolygonName(sides)}</label>
                <input type="range" min="3" max="8" value={sides} onChange={e=>setSides(Number(e.target.value))} className="w-full accent-amber-500 h-3 rounded-lg" />
              </div>
              <div>
                <label className="block font-black text-slate-400 mb-2 text-lg">한 변의 길이: {length}cm</label>
                <input type="range" min="2" max="10" value={length} onChange={e=>setLength(Number(e.target.value))} className="w-full accent-amber-500 h-3 rounded-lg" />
              </div>
              <div className="bg-amber-900/50 p-6 rounded-2xl border border-amber-800 text-center">
                <p className="text-amber-300 font-bold mb-2">💡 발견한 공식</p>
                <p className="text-2xl font-black text-white">한 변의 길이 x 변의 수 = 둘레</p>
                <p className="text-xl font-bold text-amber-400 mt-2">{length} x {sides} = {length*sides}cm</p>
              </div>
              <button onClick={() => setStep(2)} className="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-black py-4 rounded-xl text-lg shadow-lg active:scale-95 transition-all">
                연습문제로 실력 다지기 ➡
              </button>
            </div>
          </div>
        </div>
      ) : (
        <QuizModule questions={QUIZ_DATA.regular} onComplete={onClear} />
      )}
    </div>
  );
}

// ==========================================
// 메인 부모 컴포넌트: 전체 맵 및 네비게이션
// ==========================================
type ViewState = 'map' | 'rectangle' | 'parallelogram' | 'rhombus' | 'regular' | 'boss';

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

  const isAllCleared = clearedStages.length >= 4; // 보스전을 제외한 4개 섬 클리어 여부

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        
        {/* 상단 헤더 */}
        <div className="flex justify-between items-center mb-10 bg-slate-800/50 p-4 rounded-3xl backdrop-blur-sm border border-slate-700/50">
          <button onClick={() => navigate('/')} className="text-slate-300 hover:bg-slate-700 px-6 py-3 rounded-2xl font-bold transition-colors">
            🏠 홈으로
          </button>
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-indigo-400 to-fuchsia-400">
              다각형 둘레 탐험대 🧭
            </h1>
          </div>
          <div className="text-right px-4">
            <span className="text-slate-400 font-bold text-sm block">획득한 뱃지</span>
            <span className="text-2xl">{clearedStages.length} / 5</span>
          </div>
        </div>

        {/* 뷰 라우팅 */}
        {currentView === 'map' && (
          <div className="animate-in fade-in zoom-in-95 duration-500">
            <p className="text-center text-slate-400 font-bold text-xl mb-10">
              배우고 싶은 도형의 섬을 선택하세요. 4개의 섬을 모두 정복하면 최종 보스전이 열립니다!
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <button onClick={() => setCurrentView('rectangle')} className={`p-8 rounded-[2.5rem] border-4 transition-all hover:scale-[1.02] text-left relative overflow-hidden ${clearedStages.includes('직사각형') ? 'bg-slate-800 border-sky-500/50' : 'bg-slate-800 border-slate-700 hover:border-sky-500'}`}>
                {clearedStages.includes('직사각형') && <div className="absolute top-6 right-6 text-4xl">🏆</div>}
                <div className="text-6xl mb-4">🟦</div>
                <h3 className="text-3xl font-black text-white mb-2">직사각형의 섬</h3>
                <p className="text-slate-400 font-bold text-lg">가로와 세로의 비밀을 밝혀라!</p>
              </button>

              <button onClick={() => setCurrentView('parallelogram')} className={`p-8 rounded-[2.5rem] border-4 transition-all hover:scale-[1.02] text-left relative overflow-hidden ${clearedStages.includes('평행사변형') ? 'bg-slate-800 border-emerald-500/50' : 'bg-slate-800 border-slate-700 hover:border-emerald-500'}`}>
                {clearedStages.includes('평행사변형') && <div className="absolute top-6 right-6 text-4xl">🏆</div>}
                <div className="text-6xl mb-4 transform -skew-x-12 inline-block">▱</div>
                <h3 className="text-3xl font-black text-white mb-2">평행사변형의 섬</h3>
                <p className="text-slate-400 font-bold text-lg">기울어진 사각형의 둘레 구하기</p>
              </button>

              <button onClick={() => setCurrentView('rhombus')} className={`p-8 rounded-[2.5rem] border-4 transition-all hover:scale-[1.02] text-left relative overflow-hidden ${clearedStages.includes('마름모') ? 'bg-slate-800 border-fuchsia-500/50' : 'bg-slate-800 border-slate-700 hover:border-fuchsia-500'}`}>
                {clearedStages.includes('마름모') && <div className="absolute top-6 right-6 text-4xl">🏆</div>}
                <div className="text-6xl mb-4">◇</div>
                <h3 className="text-3xl font-black text-white mb-2">마름모의 섬</h3>
                <p className="text-slate-400 font-bold text-lg">네 변의 길이가 같은 마법의 도형</p>
              </button>

              <button onClick={() => setCurrentView('regular')} className={`p-8 rounded-[2.5rem] border-4 transition-all hover:scale-[1.02] text-left relative overflow-hidden ${clearedStages.includes('정다각형') ? 'bg-slate-800 border-amber-500/50' : 'bg-slate-800 border-slate-700 hover:border-amber-500'}`}>
                {clearedStages.includes('정다각형') && <div className="absolute top-6 right-6 text-4xl">🏆</div>}
                <div className="text-6xl mb-4 text-amber-500 drop-shadow-md">⬡</div>
                <h3 className="text-3xl font-black text-white mb-2">정다각형의 섬</h3>
                <p className="text-slate-400 font-bold text-lg">곱셈구구로 한 방에 해결하기</p>
              </button>
            </div>

            {/* 최종 보스전 버튼 */}
            <div className="text-center mt-12">
              {isAllCleared ? (
                 <button onClick={() => setCurrentView('boss')} className="bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-400 hover:to-orange-400 text-white px-12 py-6 rounded-[2rem] font-black text-2xl shadow-[0_0_40px_rgba(244,63,94,0.4)] hover:scale-105 transition-all animate-bounce">
                   🔥 최종 보스전 도전하기 🔥
                 </button>
              ) : (
                <div className="inline-block bg-slate-800 border border-slate-700 px-8 py-4 rounded-[2rem] text-slate-500 font-bold text-lg flex items-center gap-3 mx-auto w-fit">
                  <span>🔒 모든 섬을 정복하면 최종 보스전이 열립니다</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 각 섬 화면 렌더링 (지도 가리기) */}
        {currentView !== 'map' && (
          <div className="mb-6">
            <button onClick={() => setCurrentView('map')} className="text-slate-400 hover:text-white font-bold bg-slate-800 px-6 py-2 rounded-xl transition-colors mb-8 text-sm">
              ← 지도로 돌아가기
            </button>
            
            {currentView === 'rectangle' && <RectangleIsland onClear={() => handleClear('직사각형')} />}
            {currentView === 'parallelogram' && <ParallelogramIsland onClear={() => handleClear('평행사변형')} />}
            {currentView === 'rhombus' && <RhombusIsland onClear={() => handleClear('마름모')} />}
            {currentView === 'regular' && <RegularPolygonIsland onClear={() => handleClear('정다각형')} />}
            
            {currentView === 'boss' && (
               <div className="animate-in zoom-in duration-500">
                  <h2 className="text-4xl font-black text-rose-500 mb-2 text-center">🔥 최종 보스: 섞여 있는 문제들</h2>
                  <p className="text-slate-400 font-bold text-center mb-8 text-lg">지금까지 배운 모든 공식을 총동원하세요!</p>
                  <QuizModule questions={QUIZ_DATA.finalBoss} onComplete={() => {
                     toast.success("전설적인 실력입니다! 다각형 둘레 완벽 마스터!! 🎆", { duration: 8000, icon: '👑' });
                     setCurrentView('map');
                     setClearedStages([...clearedStages, '마스터']);
                  }} />
               </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}