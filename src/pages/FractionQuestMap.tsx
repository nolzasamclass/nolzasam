// src/pages/FractionQuestMap.tsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';

interface FractionQuestMapProps {
  user: any;
}

const STAGES = [
  { id: 's3-1', grade: 3, title: '분수의 기초', type: '개념', desc: '전체를 똑같이 나누기', island: '조각난 대륙' },
  { id: 's3-2', grade: 3, title: '진분수와 가분수', type: '조작', desc: '분수 피자 만들기', island: '조각난 대륙' },
  { id: 's4-1', grade: 4, title: '덧셈의 항구', type: '연산', desc: '분모가 같은 분수의 덧셈', island: '연산의 항구' },
  { id: 's4-2', grade: 4, title: '뺄셈의 등대', type: '연산', desc: '분모가 같은 분수의 뺄셈', island: '연산의 항구' },
  { id: 's5-1', grade: 5, title: '크기가 같은 분수', type: '개념', desc: '변신하는 분수들', island: '통분의 산맥' },
  { id: 's5-2', grade: 5, title: '약분과 통분', type: '조작', desc: '분수 다이어트', island: '통분의 산맥' },
  { id: 's6-1', grade: 6, title: '분수의 나눗셈', type: '연산', desc: '분수를 나누어보자', island: '소수의 바다' },
  { id: 's6-2', grade: 6, title: '분수와 소수의 만남', type: '개념', desc: '두 세계의 연결', island: '소수의 바다' },
];

export default function FractionQuestMap({ user }: FractionQuestMapProps) {
  const navigate = useNavigate();
  const [completedStages, setCompletedStages] = useState<string[]>([]);
  const [classProgress, setClassProgress] = useState<number>(0);
  
  const stageRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  useEffect(() => {
    if (user?.fractionProgress) {
      setCompletedStages(user.fractionProgress);
    }
  }, [user]);

  useEffect(() => {
    const statsRef = doc(db, 'class_stats', 'fraction_global');
    const unsub = onSnapshot(statsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const totalClears = data.totalClears || 0;
        const totalExpected = 30 * STAGES.length; 
        const percentage = Math.min(Math.round((totalClears / totalExpected) * 100), 100);
        setClassProgress(percentage);
      }
    });
    return () => unsub();
  }, []);

  const recommendedStage = STAGES.find(s => !completedStages.includes(s.id)) || STAGES[STAGES.length - 1];

  useEffect(() => {
    if (recommendedStage && stageRefs.current[recommendedStage.id]) {
      setTimeout(() => {
        stageRefs.current[recommendedStage.id]?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center'
        });
      }, 500);
    }
  }, [recommendedStage]);

  const getTitle = (points: number) => {
    if (points >= 500) return '👑 소수 마스터';
    if (points >= 300) return '🚀 분수 정복자';
    if (points >= 100) return '🧭 탐험가';
    return '🌱 분수 초보자';
  };

  const userPoints = user?.points || 0;
  const userTitle = getTitle(userPoints);

  const handleStageClick = (stage: any, isCompleted: boolean, isLocked: boolean) => {
    if (isLocked) {
      toast.error(`🔒 이전 단계를 먼저 완료해야 해요!`);
      return;
    }
    if (isCompleted) {
      toast('✅ 이미 완료한 학습입니다. 다시 복습할까요?', { icon: '💡' });
      navigate(`/fraction-learning?stage=${stage.id}`);
      return;
    }
    navigate(`/fraction-learning?stage=${stage.id}`);
  };

  const islands = Array.from(new Set(STAGES.map(s => s.island)));

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 md:p-10 font-sans overflow-x-hidden">
      <div className="max-w-6xl mx-auto">
        
        <div className="flex flex-col md:flex-row justify-between items-center bg-slate-800 p-6 rounded-3xl border border-slate-700 shadow-xl mb-12 gap-6">
          <div>
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 mb-2">
              🗺️ 분수·소수 대탐험
            </h1>
            <p className="text-slate-400 text-sm font-medium">분수의 기초부터 소수와의 만남까지, 모험을 떠나볼까요?</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-700 flex items-center gap-4">
              <div className="text-4xl text-amber-400 animate-bounce">✨</div>
              <div>
                <div className="text-xs text-slate-400 font-bold mb-1">나의 칭호: {userTitle}</div>
                <div className="text-xl font-black text-amber-400">{userPoints} P</div>
              </div>
            </div>

            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-700 flex-1 md:w-64">
              <div className="flex justify-between text-xs font-bold mb-2">
                <span className="text-emerald-400">🔥 우리 반 전체 탐험율</span>
                <span className="text-slate-300">{classProgress}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-emerald-500 to-cyan-500 h-3 rounded-full transition-all duration-1000" 
                  style={{ width: `${classProgress}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-16 relative">
          {islands.map((islandName) => {
            const islandStages = STAGES.filter(s => s.island === islandName);
            
            return (
              <div key={islandName} className="relative z-10">
                <h2 className="text-2xl font-black text-slate-200 mb-8 flex items-center gap-3">
                  <span className="bg-slate-800 px-4 py-2 rounded-xl border border-slate-700 shadow-md">
                    🏝️ {islandName}
                  </span>
                </h2>
                
                <div className="flex flex-col md:flex-row items-center gap-6 md:gap-0 bg-slate-800/30 p-8 rounded-[3rem] border border-slate-700/50">
                  {islandStages.map((stage, i) => {
                    const stageIndex = STAGES.findIndex(s => s.id === stage.id);
                    const isCompleted = completedStages.includes(stage.id);
                    const isLocked = stageIndex > 0 && !completedStages.includes(STAGES[stageIndex - 1].id);
                    const isRecommended = stage.id === recommendedStage?.id;

                    return (
                      <div key={stage.id} className="flex flex-col md:flex-row items-center">
                        {/* 🌟 수정된 부분: ref 콜백 함수에 중괄호 적용 */}
                        <button
                          ref={(el) => { stageRefs.current[stage.id] = el; }}
                          onClick={() => handleStageClick(stage, isCompleted, isLocked)}
                          className={`relative group flex flex-col items-center justify-center w-28 h-28 rounded-full border-4 shadow-xl transition-all duration-300
                            ${isCompleted ? 'bg-emerald-500 border-emerald-400 hover:bg-emerald-400' 
                            : isLocked ? 'bg-slate-800 border-slate-700 opacity-60 cursor-not-allowed' 
                            : 'bg-indigo-600 border-indigo-400 hover:bg-indigo-500 hover:scale-105'}
                            ${isRecommended ? 'ring-4 ring-amber-400 ring-offset-4 ring-offset-slate-900 animate-pulse' : ''}
                          `}
                        >
                          <span className="text-3xl mb-1">
                            {isCompleted ? '⭐' : isLocked ? '🔒' : '⛵'}
                          </span>
                          <span className="text-xs font-black text-center px-2 leading-tight text-white drop-shadow-md">
                            {stage.title}
                          </span>
                          <span className={`absolute -bottom-3 px-3 py-1 rounded-full text-[10px] font-black border-2 shadow-sm
                            ${isCompleted ? 'bg-emerald-900 text-emerald-300 border-emerald-700' 
                            : 'bg-slate-900 text-slate-300 border-slate-700'}`}>
                            {stage.type}
                          </span>
                        </button>
                        
                        {i < islandStages.length - 1 && (
                          <div className="hidden md:block w-16 h-2 bg-slate-700 rounded-full mx-2 relative overflow-hidden">
                            <div className={`h-full ${isCompleted ? 'bg-emerald-400' : 'bg-transparent'} transition-all duration-1000`}></div>
                          </div>
                        )}
                        {i < islandStages.length - 1 && (
                          <div className="md:hidden h-10 w-2 bg-slate-700 rounded-full my-2 relative overflow-hidden">
                             <div className={`w-full ${isCompleted ? 'bg-emerald-400 h-full' : 'h-0'} transition-all duration-1000`}></div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}