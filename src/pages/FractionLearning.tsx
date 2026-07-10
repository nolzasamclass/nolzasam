// src/pages/FractionLearning.tsx
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, increment, arrayUnion, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';

interface FractionLearningProps {
  user: any;
}

export default function FractionLearning({ user }: FractionLearningProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const stageId = searchParams.get('stage') || 's3-1';

  // 🌟 하드코딩 제거: DB에서 가져온 데이터를 저장할 상태
  const [stageData, setStageData] = useState<any[]>([]);
  const [isFetchingDB, setIsFetchingDB] = useState(true);

  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [userAnswer, setUserAnswer] = useState({ whole: '', numerator: '', denominator: '' });
  const [isShaking, setIsShaking] = useState(false);
  const [hintMessage, setHintMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // 🌟 DB에서 현재 스테이지 문제 목록 불러오기
  useEffect(() => {
    const fetchStageQuestions = async () => {
      setIsFetchingDB(true);
      try {
        const docSnap = await getDoc(doc(db, 'fraction_questions', stageId));
        if (docSnap.exists() && docSnap.data().steps) {
          setStageData(docSnap.data().steps);
        } else {
          setStageData([]); // 데이터가 없을 경우
        }
      } catch (error) {
        console.error("DB 로드 에러:", error);
        toast.error("문제 데이터를 불러오는데 실패했습니다.");
      } finally {
        setIsFetchingDB(false);
      }
    };
    fetchStageQuestions();
  }, [stageId]);

  // 스텝 변경 시 입력창 초기화
  useEffect(() => {
    setUserAnswer({ whole: '', numerator: '', denominator: '' });
    setHintMessage('');
  }, [currentStepIdx]);

  // DB 로딩 중 화면
  if (isFetchingDB) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-black text-2xl animate-pulse">문제 은행 금고를 여는 중... ⏳</div>;
  }

  // DB에 문제가 없는 경우 예외 처리
  if (stageData.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <div className="text-6xl mb-6">🚧</div>
        <h2 className="text-2xl font-black text-slate-300 mb-4">선생님이 아직 이 섬의 탐험 문제를 준비 중입니다!</h2>
        <button onClick={() => navigate('/fraction-map')} className="px-6 py-3 bg-indigo-600 rounded-xl font-bold hover:bg-indigo-500">지도 화면으로 돌아가기</button>
      </div>
    );
  }

  const currentStepData = stageData[currentStepIdx];

  const handleCheckAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    const { whole, numerator, denominator } = userAnswer;

    if (!numerator.trim() || !denominator.trim()) {
      return toast.error("분자와 분모는 필수입니다!");
    }

    const targetWhole = currentStepData.correctAnswer.whole || "";
    const targetNum = currentStepData.correctAnswer.numerator;
    const targetDen = currentStepData.correctAnswer.denominator;

    if (whole.trim() === targetWhole && numerator.trim() === targetNum && denominator.trim() === targetDen) {
      setHintMessage('');
      toast.success("정답입니다! 정말 잘했어요! 🎉");

      if (currentStepIdx < stageData.length - 1) {
        setCurrentStepIdx(prev => prev + 1);
      } else {
        setLoading(true);
        try {
          const batch = writeBatch(db);
          const userRef = doc(db, 'users', user.uid);
          
          batch.update(userRef, {
            fractionProgress: arrayUnion(stageId),
            points: increment(100) 
          });

          const statsRef = doc(db, 'class_stats', 'fraction_global');
          batch.set(statsRef, { totalClears: increment(1) }, { merge: true });

          await batch.commit();
          
          toast.success("🏆 축하합니다! 이번 스테이지의 모든 탐험을 마쳤습니다!", { duration: 4000 });
          navigate('/fraction-map');
        } catch (error) {
          console.error(error);
          toast.error("진도 저장 중 에러가 발생했습니다.");
        } finally {
          setLoading(false);
        }
      }
    } else {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 500);

      if (whole.trim() !== targetWhole) {
        setHintMessage("💡 앞에 있는 자연수 부분을 다시 확인해 보세요. (가분수인지 대분수인지 확인!)");
        return;
      }

      const userNumInt = parseInt(numerator);
      const userDenInt = parseInt(denominator);
      const targetNumInt = parseInt(targetNum);
      const targetDenInt = parseInt(targetDen);

      if (userDenInt !== targetDenInt && userNumInt === targetNumInt) {
        setHintMessage("💡 전체를 몇 개로 나누었는지 '분모'를 확인해 보세요!");
      } else if (userNumInt !== targetNumInt && userDenInt === targetDenInt) {
        setHintMessage("💡 그중 몇 개를 차지하는지 '분자'를 확인해 보세요!");
      } else if (userNumInt / userDenInt === targetNumInt / targetDenInt) {
        setHintMessage("💡 크기는 같지만, 문제에서 요구하는 (약분/통분된) 정확한 수를 입력해 보세요!");
      } else {
        setHintMessage("💡 좌측의 그림과 문제를 다시 천천히 읽어볼까요?");
      }
    }
  };

  const renderVisualInput = () => {
    const { visualType, totalParts, filledParts } = currentStepData;
    const objectCount = Math.ceil(Math.max(filledParts, totalParts) / totalParts); 

    if (visualType === 'pizza') {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-6">
          <div className="flex flex-wrap justify-center gap-4">
            {Array.from({ length: objectCount }).map((_, objIdx) => (
              <svg key={objIdx} width="120" height="120" viewBox="0 0 200 200" className="drop-shadow-xl">
                <circle cx="100" cy="100" r="90" fill="#334155" stroke="#475569" strokeWidth="4" />
                {Array.from({ length: totalParts }).map((_, i) => {
                  const globalPieceIdx = objIdx * totalParts + i;
                  const isFilled = globalPieceIdx < filledParts;
                  
                  if (totalParts > 20) {
                     return isFilled ? <circle key={i} cx="100" cy="100" r="90" fill="#34d399" /> : null;
                  }

                  const angle = (360 / totalParts) * i;
                  const nextAngle = (360 / totalParts) * (i + 1);
                  const rad1 = (Math.PI * (angle - 90)) / 180;
                  const rad2 = (Math.PI * (nextAngle - 90)) / 180;
                  const x1 = 100 + 90 * Math.cos(rad1);
                  const y1 = 100 + 90 * Math.sin(rad1);
                  const x2 = 100 + 90 * Math.cos(rad2);
                  const y2 = 100 + 90 * Math.sin(rad2);

                  const pathData = totalParts === 1 
                    ? `M 100 10 A 90 90 0 1 1 99.9 10 Z` 
                    : `M 100 100 L ${x1} ${y1} A 90 90 0 0 1 ${x2} ${y2} Z`;

                  return (
                    <path
                      key={i}
                      d={pathData}
                      fill={isFilled ? '#34d399' : '#1e293b'}
                      stroke="#475569"
                      strokeWidth="2"
                      className="transition-colors duration-500"
                    />
                  );
                })}
              </svg>
            ))}
          </div>
          <span className="text-sm font-bold text-slate-400">
            [시각 자료: {totalParts}등분 도형 조각이 총 {filledParts}개 있음]
          </span>
        </div>
      );
    }

    if (visualType === 'beaker') {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4">
          <div className="flex justify-center gap-6">
            {Array.from({ length: objectCount }).map((_, objIdx) => {
              const remainingFilled = Math.max(0, filledParts - (objIdx * totalParts));
              const currentFilled = Math.min(totalParts, remainingFilled);
              
              return (
                <div key={objIdx} className="w-20 h-40 border-4 border-slate-400 rounded-b-2xl relative bg-slate-900 overflow-hidden flex flex-col justify-end shadow-2xl">
                  <div 
                    className="bg-sky-500 w-full transition-all duration-700 border-t-2 border-sky-300" 
                    style={{ height: `${(currentFilled / totalParts) * 100}%` }}
                  ></div>
                  {totalParts <= 20 && Array.from({ length: totalParts - 1 }).map((_, i) => (
                    <div 
                      key={i} 
                      className="absolute left-0 w-4 h-0.5 bg-slate-500" 
                      style={{ bottom: `${((i + 1) / totalParts) * 100}%` }}
                    ></div>
                  ))}
                </div>
              )
            })}
          </div>
          <span className="text-sm font-bold text-slate-400">
            [시각 자료: 액체가 총 {filledParts}칸 차오름]
          </span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans overflow-x-hidden">
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>

      <header className="bg-slate-800 p-4 border-b border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-md z-10">
        <button onClick={() => navigate('/fraction-map')} className="text-slate-400 hover:text-white font-bold text-xs bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700 transition-colors">
          ⛺ 지도 화면으로 나가기
        </button>
        
        <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-full border border-slate-700">
          <span className="text-xs font-black text-slate-400 mr-2">진행 단계</span>
          {stageData.map((step, idx) => (
            <span 
              key={step.stepNum} 
              className={`text-lg transition-transform duration-300 ${idx <= currentStepIdx ? 'scale-110' : 'opacity-30'}`}
            >
              {idx < currentStepIdx ? '✅' : idx === currentStepIdx ? '🔵' : '⚪'}
            </span>
          ))}
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2">
        <div className="p-6 md:p-8 bg-slate-800/40 border-b lg:border-b-0 lg:border-r border-slate-700 flex flex-col justify-center items-center min-h-[350px]">
          <div className="text-center max-w-md w-full bg-slate-800/80 p-8 rounded-[2rem] border border-slate-700 shadow-xl">
            <div className="text-xs font-black bg-indigo-900/60 text-indigo-300 px-3 py-1 rounded-full inline-block mb-6 border border-indigo-700">
              조작 및 관찰 영역
            </div>
            {renderVisualInput()}
          </div>
        </div>

        <div className="p-6 md:p-12 flex flex-col justify-center max-w-xl mx-auto w-full space-y-6">
          <div className="space-y-3">
            <span className="text-emerald-400 font-black text-sm tracking-wider">QUESTION {currentStepData.stepNum}</span>
            <h2 className="text-xl md:text-2xl font-black leading-relaxed text-white">
              {currentStepData.question}
            </h2>
          </div>

          <form onSubmit={handleCheckAnswer} className="space-y-6 pt-4">
            <div className="flex items-center justify-center gap-4 bg-slate-800 p-8 rounded-[2rem] border border-slate-700 shadow-inner">
              <div className="flex items-center gap-3">
                <input 
                  type="text" 
                  pattern="[0-9]*"
                  inputMode="numeric"
                  value={userAnswer.whole}
                  onChange={e => setUserAnswer({...userAnswer, whole: e.target.value})}
                  className="w-16 h-20 p-2 bg-slate-900 rounded-xl text-center font-black text-3xl text-amber-400 outline-none border-2 border-transparent focus:border-amber-500 placeholder-slate-700 transition-all"
                  placeholder="자연수"
                />
                
                <div className="flex flex-col items-center space-y-2 w-24">
                  <input 
                    type="text" 
                    pattern="[0-9]*"
                    inputMode="numeric"
                    value={userAnswer.numerator}
                    onChange={e => setUserAnswer({...userAnswer, numerator: e.target.value})}
                    className="w-full p-3 bg-slate-900 rounded-xl text-center font-black text-2xl text-emerald-400 outline-none border-2 border-transparent focus:border-emerald-500 placeholder-slate-700 transition-all"
                    placeholder="분자"
                  />
                  <div className="w-full h-1.5 bg-slate-500 rounded-full"></div>
                  <input 
                    type="text" 
                    pattern="[0-9]*"
                    inputMode="numeric"
                    value={userAnswer.denominator}
                    onChange={e => setUserAnswer({...userAnswer, denominator: e.target.value})}
                    className="w-full p-3 bg-slate-900 rounded-xl text-center font-black text-2xl text-cyan-400 outline-none border-2 border-transparent focus:border-cyan-500 placeholder-slate-700 transition-all"
                    placeholder="분모"
                  />
                </div>
              </div>
            </div>

            {hintMessage && (
              <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-xl text-amber-300 font-bold text-sm text-center animate-in fade-in duration-300">
                {hintMessage}
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className={`w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-xl shadow-lg transition-all active:scale-95 text-lg tracking-wider
                ${isShaking ? 'animate-shake bg-rose-600 hover:bg-rose-600' : ''}
                ${loading ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {loading ? "진행도 저장 중..." : "정답 확인하기 ➡"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}