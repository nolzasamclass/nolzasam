// src/pages/AdminFractionDB.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';

const STAGES = [
  { id: 's3-1', title: '3학년: 분수의 기초' }, { id: 's3-2', title: '3학년: 진분수와 가분수' },
  { id: 's4-1', title: '4학년: 덧셈의 항구' }, { id: 's4-2', title: '4학년: 뺄셈의 등대' },
  { id: 's5-1', title: '5학년: 크기가 같은 분수' }, { id: 's5-2', title: '5학년: 약분과 통분' },
  { id: 's6-1', title: '6학년: 분수의 나눗셈' }, { id: 's6-2', title: '6학년: 분수와 소수의 만남' }
];

interface QuestionStep {
  stepNum: number;
  question: string;
  visualType: 'pizza' | 'beaker';
  totalParts: number;
  filledParts: number;
  correctAnswer: { whole: string; numerator: string; denominator: string; };
}

export default function AdminFractionDB() {
  const navigate = useNavigate();
  const [selectedStage, setSelectedStage] = useState('s3-1');
  const [questions, setQuestions] = useState<QuestionStep[]>([]);
  const [loading, setLoading] = useState(false);

  // 새 문제 폼 상태
  const [newQuestion, setNewQuestion] = useState('');
  const [visualType, setVisualType] = useState<'pizza'|'beaker'>('pizza');
  const [totalParts, setTotalParts] = useState(4);
  const [filledParts, setFilledParts] = useState(1);
  const [ansWhole, setAnsWhole] = useState('');
  const [ansNum, setAnsNum] = useState('');
  const [ansDen, setAnsDen] = useState('');

  // 1. 선택한 스테이지의 DB 데이터 불러오기
  useEffect(() => {
    const fetchQuestions = async () => {
      setLoading(true);
      try {
        const docSnap = await getDoc(doc(db, 'fraction_questions', selectedStage));
        if (docSnap.exists()) {
          setQuestions(docSnap.data().steps || []);
        } else {
          setQuestions([]);
        }
      } catch (error) {
        console.error(error);
        toast.error("데이터 로드 실패");
      } finally {
        setLoading(false);
      }
    };
    fetchQuestions();
  }, [selectedStage]);

  // 2. 새 문제 DB에 추가하기
  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !ansNum.trim() || !ansDen.trim()) return toast.error("문제와 정답(분자/분모)을 입력하세요.");

    const newStep: QuestionStep = {
      stepNum: questions.length + 1,
      question: newQuestion,
      visualType,
      totalParts,
      filledParts,
      correctAnswer: { whole: ansWhole, numerator: ansNum, denominator: ansDen }
    };

    const updatedQuestions = [...questions, newStep];
    
    try {
      await setDoc(doc(db, 'fraction_questions', selectedStage), {
        stageId: selectedStage,
        steps: updatedQuestions,
        updatedAt: new Date()
      }, { merge: true });
      
      setQuestions(updatedQuestions);
      toast.success("새 문제가 추가되었습니다!");
      
      // 폼 초기화
      setNewQuestion(''); setAnsWhole(''); setAnsNum(''); setAnsDen('');
    } catch (error) {
      toast.error("저장 실패");
    }
  };

  // 3. 문제 삭제
  const handleDelete = async (index: number) => {
    if (!window.confirm("이 문제를 삭제하시겠습니까?")) return;
    const updatedQuestions = questions.filter((_, i) => i !== index).map((q, i) => ({ ...q, stepNum: i + 1 }));
    try {
      await updateDoc(doc(db, 'fraction_questions', selectedStage), { steps: updatedQuestions });
      setQuestions(updatedQuestions);
      toast.success("삭제되었습니다.");
    } catch (error) {
      toast.error("삭제 실패");
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8 font-sans pb-20">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <header className="flex justify-between items-center border-b border-slate-700 pb-6">
          <div>
            <button onClick={() => navigate('/admin')} className="text-slate-400 font-bold text-sm mb-2 hover:text-white">← 관리자 대시보드</button>
            <h1 className="text-3xl font-black text-indigo-400">⚙️ 분수 탐험 문제은행 DB 관리</h1>
          </div>
          <select 
            value={selectedStage} 
            onChange={(e) => setSelectedStage(e.target.value)}
            className="bg-slate-800 border-2 border-indigo-500 rounded-xl px-6 py-3 font-black text-lg outline-none"
          >
            {STAGES.map(s => <option key={s.id} value={s.id}>[{s.id}] {s.title}</option>)}
          </select>
        </header>

        {/* 기존 등록된 문제 목록 */}
        <div className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">📚 등록된 문제 목록 ({questions.length}개)</h2>
          {loading ? <div className="text-center py-10 text-slate-500">DB 로딩 중...</div> : 
            questions.length === 0 ? <div className="text-center py-10 text-slate-500 font-bold bg-slate-900 rounded-xl border border-slate-700">이 스테이지에는 아직 등록된 문제가 없습니다.</div> : (
            <div className="space-y-4">
              {questions.map((q, idx) => (
                <div key={idx} className="flex flex-col md:flex-row justify-between bg-slate-900 p-6 rounded-2xl border border-slate-700 gap-4">
                  <div className="flex-1">
                    <span className="bg-indigo-600 text-white text-xs font-black px-3 py-1 rounded-full mb-2 inline-block">STEP {q.stepNum}</span>
                    <h3 className="font-bold text-lg mb-2">{q.question}</h3>
                    <div className="flex gap-4 text-sm text-slate-400 font-medium">
                      <span>🎨 시각: {q.visualType === 'pizza' ? '피자' : '비커'} ({q.totalParts}등분 중 {q.filledParts}칸)</span>
                      <span>💡 정답: {q.correctAnswer.whole ? `${q.correctAnswer.whole}와(과) ` : ''}{q.correctAnswer.numerator}/{q.correctAnswer.denominator}</span>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(idx)} className="bg-rose-500/20 text-rose-400 border border-rose-500/50 px-4 py-2 rounded-xl font-bold hover:bg-rose-500 hover:text-white h-fit">삭제</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 새 문제 추가 폼 */}
        <form onSubmit={handleAddQuestion} className="bg-slate-800 p-8 rounded-3xl border border-slate-700 shadow-xl space-y-6">
          <h2 className="text-xl font-bold mb-2">➕ 새로운 문제 추가하기</h2>
          
          <div>
            <label className="block text-sm font-bold text-slate-400 mb-2">문제 내용 (질문)</label>
            <input type="text" value={newQuestion} onChange={e=>setNewQuestion(e.target.value)} className="w-full p-4 bg-slate-900 rounded-xl border border-slate-600 outline-none focus:border-indigo-500 text-white font-bold" placeholder="예: 4조각으로 나눈 피자 중 1조각은 분수로 얼마일까요?" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 space-y-4">
              <h3 className="text-indigo-400 font-black mb-4">1. 시각 자료 설정 (좌측 화면)</h3>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">그래픽 유형</label>
                <select value={visualType} onChange={e=>setVisualType(e.target.value as any)} className="w-full p-3 bg-slate-800 rounded-lg outline-none font-bold">
                  <option value="pizza">🍕 원형 (피자)</option>
                  <option value="beaker">🧪 막대형 (비커)</option>
                </select>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-400 mb-1">몇 등분? (전체)</label>
                  <input type="number" min="1" value={totalParts} onChange={e=>setTotalParts(Number(e.target.value))} className="w-full p-3 bg-slate-800 rounded-lg outline-none font-bold text-center" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-400 mb-1">몇 조각? (색칠)</label>
                  <input type="number" min="1" value={filledParts} onChange={e=>setFilledParts(Number(e.target.value))} className="w-full p-3 bg-slate-800 rounded-lg outline-none font-bold text-center" />
                </div>
              </div>
            </div>

            <div className="md:col-span-2 bg-slate-900 p-6 rounded-2xl border border-slate-700">
              <h3 className="text-emerald-400 font-black mb-4">2. 정답 설정 (학생이 입력해야 할 값)</h3>
              <div className="flex items-center gap-6 justify-center mt-6">
                <div className="text-center">
                  <label className="block text-xs font-bold text-slate-400 mb-2">자연수 (대분수용)</label>
                  <input type="text" value={ansWhole} onChange={e=>setAnsWhole(e.target.value)} className="w-20 p-4 bg-slate-800 rounded-xl font-black text-2xl text-center text-amber-400 outline-none focus:ring-2 focus:ring-amber-500" placeholder="0" />
                </div>
                <div className="flex flex-col gap-2 w-28">
                  <input type="text" value={ansNum} onChange={e=>setAnsNum(e.target.value)} className="w-full p-3 bg-slate-800 rounded-xl font-black text-xl text-center text-emerald-400 outline-none focus:ring-2 focus:ring-emerald-500" placeholder="분자" />
                  <div className="w-full h-1 bg-slate-600 rounded-full"></div>
                  <input type="text" value={ansDen} onChange={e=>setAnsDen(e.target.value)} className="w-full p-3 bg-slate-800 rounded-xl font-black text-xl text-center text-cyan-400 outline-none focus:ring-2 focus:ring-cyan-500" placeholder="분모" />
                </div>
              </div>
            </div>
          </div>

          <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-xl shadow-lg transition-all active:scale-95 text-lg">
            이 문제를 DB에 저장하기 💾
          </button>
        </form>

      </div>
    </div>
  );
}