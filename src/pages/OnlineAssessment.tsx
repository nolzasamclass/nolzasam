// src/pages/OnlineAssessment.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';

export default function OnlineAssessment({ user }: { user: any }) {
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin' || user?.userType === '교사';

  const [liveRooms, setLiveRooms] = useState<any[]>([]);
  const [activeExam, setActiveExam] = useState<any>(null);
  const [studentAnswers, setStudentAnswers] = useState<Record<string, string>>({});
  
  // 🔥 1차 제출 시점의 답안을 기억해 두기 위한 상태 추가
  const [firstAnswers, setFirstAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 🔥 상태 확장: playing(풀이중) -> retaking(1차제출 후 오답수정중) -> submitted(최종완료)
  const [examStatus, setExamStatus] = useState<'playing' | 'retaking' | 'submitted'>('playing');

  useEffect(() => {
    const q = query(collection(db, 'live_classes'), where('status', '==', 'active'));
    const unsub = onSnapshot(q, (snap) => setLiveRooms(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!activeExam || examStatus === 'submitted') return;
    const timer = setTimeout(async () => {
      try {
        await updateDoc(doc(db, `live_classes/${activeExam.id}/participants`, user.uid), {
          answers: studentAnswers, lastUpdated: new Date()
        });
      } catch (err) { console.error("자동 저장 중 에러", err); }
    }, 1000);
    return () => clearTimeout(timer);
  }, [studentAnswers, activeExam, examStatus, user.uid]);

  const handleJoinExam = async (room: any) => {
    if (room.status === 'closed') return toast.error('이미 종료된 평가입니다.');
    try {
      const pRef = doc(db, `live_classes/${room.id}/participants`, user.uid);
      const pSnap = await getDoc(pRef);
      if (pSnap.exists()) {
        const data = pSnap.data();
        if (data.status === 'submitted') return toast.error('이미 최종 제출 완료한 평가입니다.');
        
        setStudentAnswers(data.answers || {});
        setFirstAnswers(data.firstAnswers || {}); // 1차 제출 기록 복구
        setExamStatus(data.status || 'playing');
      } else {
        await setDoc(pRef, { uid: user.uid, name: user.name || '학생', answers: {}, status: 'playing', lastUpdated: new Date() });
        setStudentAnswers({});
        setFirstAnswers({});
        setExamStatus('playing');
      }
      setActiveExam(room); toast.success(`${room.title}에 입장했습니다!`);
    } catch (err) { toast.error('입장 오류 발생'); }
  };

  const handleAnswerChange = (qId: string, value: string) => {
    if (examStatus === 'submitted') return;
    setStudentAnswers(prev => ({ ...prev, [qId]: value }));
  };

  // 🔥 어떤 답안 뭉치(현재답안 vs 1차답안)를 채점할지 매개변수로 받도록 수정
  const getGradingResult = (q: any, targetAnswers: Record<string, string>) => {
    if (q.type === 'passage' || q.type === 'essay') return null;
    const sAns = targetAnswers[q.id] || '';
    if (q.type === 'multiple') return sAns === q.answer;
    if (q.type === 'short') {
      const blanks = q.shortAnswers || [q.answer || ''];
      let allCorrect = true;
      blanks.forEach((ans: string, idx: number) => {
        const s = targetAnswers[`${q.id}_${idx}`] || (idx === 0 ? targetAnswers[q.id] : '');
        if (!s || s.trim() !== ans.trim()) allCorrect = false;
      });
      return allCorrect;
    }
    return false;
  };

  const calculateScore = (targetAnswers: Record<string, string>) => {
    let correctCount = 0; let totalGradable = 0;
    activeExam.questions.forEach((q: any) => {
      if (q.type === 'passage' || q.type === 'essay') return;
      totalGradable++;
      if (getGradingResult(q, targetAnswers)) correctCount++;
    });
    return totalGradable > 0 ? Math.round((correctCount / totalGradable) * 100) : 0;
  };

  // 🔥 제출 버튼: 1차 제출(오답수정 모드 진입)과 최종 제출 분기 처리
  const handleSubmitExam = async () => {
    if (examStatus === 'playing' && activeExam.allowRetake) {
      if (!window.confirm("1차 제출을 하시겠습니까?\n채점 결과(정/오답)를 확인한 후, 한 번 더 답을 수정할 기회가 주어집니다.")) return;
      setIsSubmitting(true);
      const firstScore = calculateScore(studentAnswers);
      try {
        await updateDoc(doc(db, `live_classes/${activeExam.id}/participants`, user.uid), {
          answers: studentAnswers,
          firstAnswers: studentAnswers, // 1차 답안 보존
          status: 'retaking', // 🔥 오답 수정 모드로 변경
          score: firstScore, // 만약 중간에 닫혀도 1차 점수가 보존되도록 저장
          firstScore: firstScore,
          lastUpdated: new Date()
        });
        setFirstAnswers(studentAnswers);
        setExamStatus('retaking');
        toast.success("1차 제출 완료! ❌ 표시된 오답을 확인하고 바로 수정해 보세요.");
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) { toast.error("제출 실패"); }
      finally { setIsSubmitting(false); }
    } else {
      if (!window.confirm("최종 제출을 하시겠습니까?\n이후에는 답안을 수정할 수 없습니다.")) return;
      setIsSubmitting(true);
      const finalScore = calculateScore(studentAnswers);
      try {
        await updateDoc(doc(db, `live_classes/${activeExam.id}/participants`, user.uid), {
          answers: studentAnswers,
          status: 'submitted', // 🔥 완전히 잠김
          score: finalScore,
          lastUpdated: new Date()
        });
        setExamStatus('submitted');
        toast.success("최종 평가 제출이 완료되었습니다! 🎉");
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) { toast.error("제출 실패"); } 
      finally { setIsSubmitting(false); }
    }
  };

  // 인게임 화면 렌더링
  if (activeExam) {
    let qCount = 0;
    const showGrading = examStatus === 'retaking' || examStatus === 'submitted';
    // retaking 중에는 1차 제출했던 답안을 기준으로 ⭕❌를 보여줌
    const gradingAnswers = examStatus === 'retaking' ? firstAnswers : studentAnswers;
    const firstScore = examStatus === 'retaking' ? calculateScore(firstAnswers) : 0;
    const finalScore = examStatus === 'submitted' ? calculateScore(studentAnswers) : 0;

    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-800 flex flex-col">
        <div className="bg-white px-4 md:px-6 py-3 md:py-4 flex justify-between items-center border-b border-slate-200 sticky top-0 z-50 shadow-sm gap-2">
          <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
            <button onClick={() => setActiveExam(null)} className="shrink-0 text-slate-500 hover:text-slate-800 font-bold text-xs md:text-sm bg-slate-100 px-3 py-1.5 md:px-4 md:py-2 rounded-lg md:rounded-xl transition-colors">← 목록</button>
            <h1 className="text-base md:text-xl font-black text-indigo-600 truncate">{activeExam.title}</h1>
          </div>
          
          {/* 🔥 우측 상단 상태별 버튼 렌더링 */}
          {examStatus === 'playing' ? (
            <button onClick={handleSubmitExam} disabled={isSubmitting} className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white font-black px-4 py-2 md:px-6 md:py-2 rounded-lg md:rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 text-sm md:text-base">
              {isSubmitting ? '처리중..' : activeExam.allowRetake ? '1차 제출하기 (수정가능) 🚀' : '최종 제출하기 🚀'}
            </button>
          ) : examStatus === 'retaking' ? (
            <div className="flex items-center gap-2 md:gap-4 shrink-0">
              <span className="bg-amber-100 text-amber-600 font-black px-3 py-1.5 md:px-4 md:py-2 rounded-lg md:rounded-xl text-sm md:text-lg shadow-sm border border-amber-200">
                1차: {firstScore}점
              </span>
              <button onClick={handleSubmitExam} disabled={isSubmitting} className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-2 md:px-4 md:py-2 rounded-lg md:rounded-xl shadow-md transition-all text-xs md:text-base">
                {isSubmitting ? '처리중..' : '최종 제출하기 🚀'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 md:gap-4 shrink-0">
              <span className="bg-emerald-100 text-emerald-600 font-black px-3 py-1.5 md:px-4 md:py-2 rounded-lg md:rounded-xl text-sm md:text-lg shadow-sm border border-emerald-200">
                최종: {finalScore}점
              </span>
            </div>
          )}
        </div>

        <div className="max-w-4xl mx-auto w-full p-4 md:p-6 py-6 md:py-10 space-y-6 md:space-y-8 flex-1">
          {/* 상태별 안내 메시지 패널 */}
          {examStatus === 'retaking' && (
            <div className="bg-amber-50 border border-amber-200 p-4 md:p-6 rounded-2xl md:rounded-3xl text-center shadow-sm">
              <h2 className="text-lg md:text-2xl font-black text-amber-700 mb-1 md:mb-2">1차 제출 완료! 오답을 수정하세요.</h2>
              <p className="text-amber-600 font-bold text-xs md:text-sm">현재 오답(❌)으로 표시된 문항의 답을 그 자리에서 수정한 후 우측 상단의 [최종 제출하기]를 눌러주세요.</p>
            </div>
          )}
          {examStatus === 'submitted' && (
            <div className="bg-indigo-50 border border-indigo-200 p-4 md:p-6 rounded-2xl md:rounded-3xl text-center shadow-sm">
              <h2 className="text-lg md:text-2xl font-black text-indigo-700 mb-1 md:mb-2">수고하셨습니다! 최종 제출이 완료되었습니다.</h2>
              <p className="text-indigo-500 font-bold text-xs md:text-sm">아래에서 각 문항의 최종 정답 여부(⭕/❌)를 확인할 수 있습니다.</p>
            </div>
          )}

          {activeExam.questions.map((q: any) => {
            const isPassage = q.type === 'passage';
            if (!isPassage) qCount++;
            
            const isCorrect = showGrading ? getGradingResult(q, gradingAnswers) : null;

            return (
              <div key={q.id} className={`bg-white rounded-2xl md:rounded-[2rem] p-5 md:p-8 shadow-sm border-2 ${isPassage ? 'border-amber-200 bg-amber-50/30' : showGrading ? (isCorrect ? 'border-emerald-200' : isCorrect === false ? 'border-rose-200' : 'border-slate-200') : 'border-slate-100'}`}>
                
                {showGrading && !isPassage && q.type !== 'essay' && (
                  <div className="flex justify-between items-center mb-3 md:mb-4">
                    <div className={`text-2xl md:text-4xl font-black ${isCorrect ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {isCorrect ? '⭕ 정답' : '❌ 오답'}
                    </div>
                    {examStatus === 'retaking' && !isCorrect && (
                      <span className="text-amber-500 text-xs md:text-sm font-bold bg-amber-50 px-3 py-1 rounded-lg border border-amber-200 animate-pulse">
                        👇 답안을 수정해 보세요!
                      </span>
                    )}
                  </div>
                )}

                <div className="flex gap-3 md:gap-4 items-start mb-4 md:mb-6">
                  <div className={`text-white w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center font-black text-lg md:text-xl flex-shrink-0 shadow-sm ${isPassage ? 'bg-amber-400' : 'bg-indigo-500'}`}>
                    {isPassage ? '📖' : qCount}
                  </div>
                  <div className="flex-1 min-w-0">
                    {q.questionImage && <img src={q.questionImage} alt="문제" className="max-w-full max-h-60 rounded-lg mb-4 object-contain shadow-sm border border-slate-100" />}
                    <p className="text-base md:text-lg font-bold text-slate-800 whitespace-pre-wrap">{q.text}</p>
                  </div>
                </div>

                {!isPassage && q.type === 'multiple' && (
                  <div className="ml-12 md:ml-16 space-y-2 md:space-y-3">
                    {q.options?.map((opt: string, oIdx: number) => (
                      <label key={oIdx} className={`flex items-center gap-3 p-3 md:p-4 rounded-xl border-2 transition-all ${examStatus !== 'submitted' ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'} ${studentAnswers[q.id] === String(oIdx + 1) ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100'}`}>
                        <input type="radio" checked={studentAnswers[q.id] === String(oIdx + 1)} onChange={() => handleAnswerChange(q.id, String(oIdx + 1))} disabled={examStatus === 'submitted'} className="w-5 h-5 accent-indigo-600" />
                        <span className="font-bold text-slate-700 flex-1">{opt}</span>
                        {q.optionImages?.[oIdx] && <img src={q.optionImages[oIdx]} alt="보기" className="max-h-16 rounded" />}
                      </label>
                    ))}
                  </div>
                )}
                {!isPassage && q.type === 'short' && (
                  <div className="ml-12 md:ml-16 flex flex-wrap gap-2 md:gap-3">
                    {q.shortAnswers?.map((_: any, aIdx: number) => (
                      <input key={aIdx} type="text" value={studentAnswers[`${q.id}_${aIdx}`] || ''} onChange={(e) => handleAnswerChange(`${q.id}_${aIdx}`, e.target.value)} disabled={examStatus === 'submitted'} placeholder={`${aIdx + 1}번 빈칸`} className="bg-slate-50 border-2 border-slate-200 rounded-xl p-3 outline-none focus:border-indigo-500 font-bold text-center w-32 disabled:bg-white disabled:text-slate-800" />
                    ))}
                  </div>
                )}
                {!isPassage && q.type === 'essay' && (
                  <div className="ml-12 md:ml-16">
                    <textarea value={studentAnswers[q.id] || ''} onChange={(e) => handleAnswerChange(q.id, e.target.value)} disabled={examStatus === 'submitted'} placeholder="자신의 생각을 서술하세요." className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-4 outline-none focus:border-indigo-500 font-medium min-h-[150px] resize-none disabled:bg-white disabled:text-slate-800" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 허브 화면 (변경 없음)
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4 md:p-8 relative font-sans">
      {isAdmin && (
        <div className="w-full max-w-5xl flex justify-end mb-4 md:mb-8 gap-2">
          <button onClick={() => navigate('/admin/gradebook')} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-black shadow-md text-sm md:text-base">
            📊 성적 종합 분석
          </button>
          <button onClick={() => navigate('/admin/assessment?tab=edit')} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-black shadow-md text-sm md:text-base">
            🛠️ 평가 관리 센터
          </button>
        </div>
      )}
      <div className="w-full max-w-5xl bg-white p-6 md:p-10 rounded-[2rem] shadow-sm border border-slate-200 mt-4 md:mt-0">
        <div className="flex items-center gap-3 md:gap-4 mb-6 md:mb-8 border-b border-slate-100 pb-6">
          <div className="w-14 h-14 md:w-16 md:h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-3xl shadow-inner border border-indigo-100 shrink-0">🎓</div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-800">온라인 라이브 평가실</h1>
            <p className="text-slate-500 font-bold mt-1 text-xs md:text-base">현재 진행 중인 평가를 선택하여 입장하세요.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {liveRooms.length === 0 ? (
            <div className="col-span-full py-20 text-center bg-slate-50 rounded-3xl border border-slate-200 text-slate-400 font-bold">진행 중인 평가가 없습니다.</div>
          ) : (
            liveRooms.map(room => (
              <div key={room.id} onClick={() => handleJoinExam(room)} className="bg-white rounded-2xl p-5 md:p-6 border-2 border-slate-100 shadow-sm hover:border-indigo-400 hover:shadow-lg transition-all cursor-pointer group flex flex-col">
                <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded w-fit text-xs font-black mb-3 border border-indigo-100">{room.subject}</span>
                <h3 className="text-lg md:text-xl font-black text-slate-800 mb-2 group-hover:text-indigo-600 line-clamp-2">{room.title}</h3>
                <p className="text-sm text-slate-500 font-bold mb-6 mt-auto">선생님: {room.teacher}</p>
                <button className="w-full bg-slate-50 group-hover:bg-indigo-600 text-slate-600 group-hover:text-white font-black py-3 rounded-xl transition-colors shadow-sm">입장하기 🚀</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}