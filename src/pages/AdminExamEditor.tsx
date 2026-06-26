// src/pages/AdminExamEditor.tsx
import { useState, useEffect } from 'react';
import { collection, doc, setDoc, updateDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../firebase';
import toast from 'react-hot-toast';

interface Question {
  id: string;
  type: 'multiple' | 'short' | 'essay' | 'passage';
  text: string;
  questionImage?: string;
  options?: string[];
  optionImages?: (string | null)[];
  answer?: string;
  shortAnswers?: string[];
}

interface AdminExamEditorProps {
  user: any;
  targetExam: any;
  onClose: () => void;
  onSaved: () => void;
}

export default function AdminExamEditor({ user, targetExam, onClose, onSaved }: AdminExamEditorProps) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [allowRetake, setAllowRetake] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  // 카테고리(메뉴) 불러오기
  useEffect(() => {
    getDocs(collection(db, 'site_menus')).then(snap => {
      const fetchedCategories = snap.docs.map(d => d.data().name);
      setCategories(fetchedCategories.length > 0 ? fetchedCategories : ['기본 과목']);
      if (!targetExam && fetchedCategories.length > 0) setSubject(fetchedCategories[0]);
    });
  }, []);

  // 기존 데이터 세팅 (5지선다 보정)
  useEffect(() => {
    if (targetExam) {
      setTitle(targetExam.title || '');
      setSubject(targetExam.subject || '');
      setAllowRetake(targetExam.allowRetake ?? true);
      
      const loadedQs = (targetExam.questions || []).map((q: any) => {
        if (q.type === 'multiple') {
          const opts = [...(q.options || [])];
          while (opts.length < 5) opts.push(''); // 기존 4지선다를 5지선다로 규격 맞춤
          return { ...q, options: opts };
        }
        return q;
      });
      setQuestions(loadedQs);
    } else {
      setTitle('');
      setAllowRetake(true);
      setQuestions([{ id: 'q_' + Date.now(), type: 'multiple', text: '', options: ['', '', '', '', ''], optionImages: [null, null, null, null, null], answer: '1' }]);
    }
  }, [targetExam]);

  const handleImageUpload = async (file: File, path: string): Promise<string> => {
    const storage = getStorage();
    const storageRef = ref(storage, `exam_images/${path}/${Date.now()}_${file.name}`);
    setIsUploading(true);
    try {
      const snapshot = await uploadBytes(storageRef, file);
      return await getDownloadURL(snapshot.ref);
    } catch (e) {
      toast.error("이미지 업로드 실패");
      throw e;
    } finally {
      setIsUploading(false);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent, qId: string) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const url = await handleImageUpload(file, 'question');
          setQuestions(prev => prev.map(q => q.id === qId ? { ...q, questionImage: url } : q));
        }
      }
    }
  };

  const addQuestion = (type: 'multiple' | 'short' | 'essay' | 'passage') => {
    const newQ: Question = {
      id: 'q_' + Date.now() + Math.random().toString(36).substr(2, 5),
      type,
      text: '',
      ...(type === 'multiple' && { options: ['', '', '', '', ''], optionImages: [null, null, null, null, null], answer: '1' }),
      ...(type === 'short' && { shortAnswers: [''] })
    };
    setQuestions([...questions, newQ]);
  };

  const removeQuestion = (id: string) => setQuestions(questions.filter(q => q.id !== id));

  // 💡 문항 순서 변경 로직
  const moveQuestion = (idx: number, direction: 'up' | 'down') => {
    const newQs = [...questions];
    if (direction === 'up' && idx > 0) {
      [newQs[idx - 1], newQs[idx]] = [newQs[idx], newQs[idx - 1]];
    } else if (direction === 'down' && idx < newQs.length - 1) {
      [newQs[idx + 1], newQs[idx]] = [newQs[idx], newQs[idx + 1]];
    }
    setQuestions(newQs);
  };

  const handleSaveExam = async () => {
    if (!title.trim()) return toast.error("시험지 제목을 입력하세요.");
    if (questions.length === 0) return toast.error("최소 1개 이상의 문항을 출제해야 합니다.");

    try {
      const examData = {
        title: title.trim(), subject, allowRetake, questions,
        teacher: user?.name || '관리자',
        updatedAt: serverTimestamp(),
        ...(targetExam ? {} : { createdAt: serverTimestamp() })
      };

      if (targetExam) {
        await updateDoc(doc(db, 'exam_templates', targetExam.id), examData);
        toast.success("시험지가 성공적으로 수정되었습니다.");
      } else {
        await setDoc(doc(collection(db, 'exam_templates')), examData);
        toast.success("새로운 시험지가 출제 완료되었습니다.");
      }
      onSaved();
    } catch (e) { toast.error("저장 중 오류가 발생했습니다."); }
  };

  let displayQNum = 0;

  return (
    <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-xl animate-in fade-in max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-100">
        <h2 className="text-2xl font-black text-slate-800">
          {targetExam ? '📝 시험지 수정하기' : '➕ 새 시험지 출제하기'}
        </h2>
        <button onClick={onClose} className="text-slate-500 hover:text-rose-500 font-bold bg-slate-100 px-4 py-2 rounded-xl transition-colors">
          취소 / 닫기
        </button>
      </div>

      {/* 기본 정보 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div>
          <label className="block text-sm font-bold text-slate-600 mb-2">시험 제목</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 1단원 평가" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 font-bold outline-none focus:border-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-600 mb-2">과목 / 카테고리</label>
          <select value={subject} onChange={e => setSubject(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 font-bold outline-none focus:border-indigo-500">
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-bold text-slate-600 mb-2">학생 재응시 권한</label>
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button type="button" onClick={() => setAllowRetake(true)} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${allowRetake ? 'bg-indigo-500 text-white shadow' : 'text-slate-500 hover:bg-white'}`}>허용</button>
            <button type="button" onClick={() => setAllowRetake(false)} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${!allowRetake ? 'bg-rose-500 text-white shadow' : 'text-slate-500 hover:bg-white'}`}>불가</button>
          </div>
        </div>
      </div>

      {/* 문항 에디터 리스트 */}
      <div className="space-y-6 mb-8">
        {questions.map((q, idx) => {
          const isPassage = q.type === 'passage';
          if (!isPassage) displayQNum++;

          return (
            <div key={q.id} className={`p-6 rounded-2xl border-2 relative transition-colors ${isPassage ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200 shadow-sm'}`}>
              
              {/* 제어 버튼 (순서변경/삭제) */}
              <div className="absolute top-4 right-4 flex items-center gap-1">
                <button onClick={() => moveQuestion(idx, 'up')} disabled={idx === 0} className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded hover:bg-slate-200 disabled:opacity-30 text-slate-600 font-bold">▲</button>
                <button onClick={() => moveQuestion(idx, 'down')} disabled={idx === questions.length - 1} className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded hover:bg-slate-200 disabled:opacity-30 text-slate-600 font-bold">▼</button>
                <div className="w-2"></div>
                <button type="button" onClick={() => removeQuestion(q.id)} className="text-rose-500 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded font-bold text-sm">삭제</button>
              </div>
              
              <div className="flex items-center gap-2 mb-4">
                <span className={`px-3 py-1 rounded-lg text-xs font-black text-white ${isPassage ? 'bg-amber-500' : 'bg-indigo-500'}`}>
                  {isPassage ? '📖 지문/안내' : `문항 ${displayQNum}`}
                </span>
                <span className="text-slate-500 text-xs font-bold">[{q.type === 'multiple' ? '객관식' : q.type === 'short' ? '주관식 단답형' : q.type === 'essay' ? '서술형' : '공통 읽기 자료'}]</span>
              </div>

              {/* 문항 내용 입력 (이미지 붙여넣기 공통 적용) */}
              <textarea 
                value={q.text} 
                onChange={e => {
                  const updated = [...questions];
                  updated[idx].text = e.target.value;
                  setQuestions(updated);
                }} 
                onPaste={(e) => handlePaste(e, q.id)}
                placeholder="내용을 입력하거나 이미지를 캡처 후 붙여넣기(Ctrl+V) 하세요." 
                className={`w-full bg-white border border-slate-300 rounded-xl p-4 text-slate-800 font-medium outline-none focus:border-indigo-500 mb-4 resize-y ${isPassage ? 'min-h-[120px]' : 'min-h-[80px]'}`} 
              />

              {/* 문제 이미지 미리보기 */}
              <div className="mb-4">
                <input type="file" accept="image/*" onChange={async (e) => {
                  if (e.target.files?.[0]) {
                    const url = await handleImageUpload(e.target.files[0], 'question');
                    const updated = [...questions];
                    updated[idx].questionImage = url;
                    setQuestions(updated);
                  }
                }} className="text-xs text-slate-500 font-bold" />
                {q.questionImage && <img src={q.questionImage} alt="미리보기" className="mt-2 max-h-40 rounded-xl border border-slate-200 shadow-sm" />}
              </div>

              {/* 1. 5지선다 객관식 옵션 */}
              {q.type === 'multiple' && q.options && (
                <div className="space-y-2 pl-4 border-l-4 border-indigo-100">
                  {q.options.map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-3">
                      <input type="radio" name={`correct_${q.id}`} checked={q.answer === String(oIdx + 1)} onChange={() => {
                        const updated = [...questions];
                        updated[idx].answer = String(oIdx + 1);
                        setQuestions(updated);
                      }} className="accent-indigo-500 w-5 h-5 cursor-pointer" />
                      <input type="text" value={opt} onChange={e => {
                        const updated = [...questions];
                        if (updated[idx].options) updated[idx].options![oIdx] = e.target.value;
                        setQuestions(updated);
                      }} placeholder={`${oIdx + 1}번 보기`} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-500" />
                    </div>
                  ))}
                </div>
              )}

              {/* 2. 주관식 단답형 빈칸 정답 */}
              {q.type === 'short' && q.shortAnswers && (
                <div className="pl-4 border-l-4 border-indigo-100 space-y-2">
                  {q.shortAnswers.map((ans, aIdx) => (
                    <div key={aIdx} className="flex gap-2 items-center">
                      <span className="text-xs text-slate-500 font-bold">{aIdx + 1}번 정답:</span>
                      <input type="text" value={ans} onChange={e => {
                        const updated = [...questions];
                        if (updated[idx].shortAnswers) updated[idx].shortAnswers![aIdx] = e.target.value;
                        setQuestions(updated);
                      }} className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-800 outline-none focus:border-indigo-500 w-48 text-center" />
                      {q.shortAnswers!.length > 1 && (
                        <button type="button" onClick={() => {
                          const updated = [...questions];
                          updated[idx].shortAnswers = updated[idx].shortAnswers!.filter((_, i) => i !== aIdx);
                          setQuestions(updated);
                        }} className="text-rose-500 text-xs font-bold bg-rose-50 px-2 py-1 rounded">삭제</button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => {
                    const updated = [...questions];
                    updated[idx].shortAnswers!.push('');
                    setQuestions(updated);
                  }} className="text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg text-xs font-black">+ 빈칸(정답) 추가</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 justify-between items-center pt-6 border-t border-slate-200">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => addQuestion('multiple')} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-xl font-black text-sm transition-colors">+ 5지선다 객관식</button>
          <button type="button" onClick={() => addQuestion('short')} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-xl font-black text-sm transition-colors">+ 주관식 단답형</button>
          <button type="button" onClick={() => addQuestion('essay')} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-xl font-black text-sm transition-colors">+ 서술형</button>
          <button type="button" onClick={() => addQuestion('passage')} className="bg-amber-100 hover:bg-amber-200 text-amber-700 px-4 py-3 rounded-xl font-black text-sm transition-colors">+ 📖 지문/안내</button>
        </div>

        <button type="button" onClick={handleSaveExam} disabled={isUploading} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black px-10 py-4 rounded-xl shadow-lg transition-transform active:scale-95 text-lg">
          {isUploading ? '이미지 업로드 중...' : targetExam ? '시험지 수정 완료 💾' : '시험지 최종 출제하기 🚀'}
        </button>
      </div>
    </div>
  );
}