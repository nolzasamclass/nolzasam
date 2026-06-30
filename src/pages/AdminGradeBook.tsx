// src/pages/AdminGradeBook.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export default function AdminGradeBook() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'stats' | 'student' | 'print'>('stats');
  const [closedExams, setClosedExams] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  
  const [selectedExamId, setSelectedExamId] = useState('');
  const [examParticipants, setExamParticipants] = useState<any[]>([]);
  const [examDetail, setExamDetail] = useState<any>(null);

  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentRecords, setStudentRecords] = useState<any[]>([]);

  useEffect(() => {
    // 1. 종료된 모든 시험 정보 가져오기
    const fetchExams = async () => {
      const snap = await getDocs(query(collection(db, 'live_classes'), where('status', '==', 'closed')));
      setClosedExams(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    // 2. 승인된 전체 학생 목록 가져오기
    const fetchStudents = async () => {
      const snap = await getDocs(query(collection(db, 'users'), where('approved', '==', true)));
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((s:any) => s.role !== 'admin'));
    };
    fetchExams(); fetchStudents();
  }, []);

  // 특정 시험 선택 시 해당 시험의 결과(참여자 데이터) 불러오기
  useEffect(() => {
    if (activeTab === 'stats' && selectedExamId) {
      const detail = closedExams.find(e => e.id === selectedExamId);
      setExamDetail(detail);
      getDocs(collection(db, `live_classes/${selectedExamId}/participants`)).then(snap => {
        setExamParticipants(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
      });
    }
  }, [selectedExamId, activeTab]);

  // 특정 학생 선택 시, 그 학생이 응시한 모든 시험 기록 추합하기
  useEffect(() => {
    if ((activeTab === 'student' || activeTab === 'print') && selectedStudentId) {
      const records: any[] = [];
      const fetchStudentData = async () => {
        for (const exam of closedExams) {
          const snap = await getDocs(query(collection(db, `live_classes/${exam.id}/participants`), where('uid', '==', selectedStudentId)));
          if (!snap.empty) {
            const data = snap.docs[0].data();
            records.push({ examTitle: exam.title, subject: exam.subject, score: data.score || 0, date: exam.closedAt?.toDate()?.toLocaleDateString() || '날짜 없음' });
          }
        }
        setStudentRecords(records);
      };
      fetchStudentData();
    }
  }, [selectedStudentId, activeTab]);

  // 성적표 인쇄 함수 (현재 윈도우 인쇄 대화상자 호출)
  const handlePrint = () => { window.print(); };

  // 통계 계산용 헬퍼 함수
  const getAverage = (arr: any[]) => arr.length > 0 ? (arr.reduce((acc, curr) => acc + (curr.score || 0), 0) / arr.length).toFixed(1) : 0;
  
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans print:bg-white">
      {/* 🟢 화면에서만 보이는 헤더 (인쇄 시 숨김) */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center sticky top-0 z-40 shadow-sm print:hidden">
        <div className="flex items-center gap-6">
          <button onClick={() => navigate('/admin/assessment?tab=results')} className="text-slate-500 hover:text-indigo-600 font-bold text-sm bg-slate-100 px-4 py-2 rounded-xl">← 뒤로 가기</button>
          <h1 className="text-xl font-black text-indigo-600">📊 학생 성적 종합 관리 센터</h1>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button onClick={()=>setActiveTab('stats')} className={`px-6 py-2 rounded-lg font-black text-sm transition-all ${activeTab === 'stats' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}>1. 시험별 문항 분석</button>
          <button onClick={()=>setActiveTab('student')} className={`px-6 py-2 rounded-lg font-black text-sm transition-all ${activeTab === 'student' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}>2. 학생별 성적 조회</button>
          <button onClick={()=>setActiveTab('print')} className={`px-6 py-2 rounded-lg font-black text-sm transition-all ${activeTab === 'print' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-white'}`}>3. 통지표 인쇄 (NEIS)</button>
        </div>
      </div>

      <div className="p-8 max-w-6xl mx-auto w-full print:p-0 print:max-w-none">
        
        {/* 탭 1. 문항 통계 분석 */}
        {activeTab === 'stats' && (
          <div className="animate-in fade-in space-y-6 print:hidden">
            <select value={selectedExamId} onChange={e => setSelectedExamId(e.target.value)} className="w-full bg-white border-2 border-slate-200 rounded-xl px-6 py-4 text-lg font-bold shadow-sm">
              <option value="" disabled>분석할 시험을 선택하세요</option>
              {closedExams.map(ex => <option key={ex.id} value={ex.id}>{ex.title} ({ex.subject})</option>)}
            </select>

            {examParticipants.length > 0 && examDetail && (
              <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
                <h2 className="text-2xl font-black text-slate-800 mb-6">📈 전체 성적 요약</h2>
                <div className="grid grid-cols-3 gap-6 mb-8">
                  <div className="bg-indigo-50 p-6 rounded-2xl text-center"><p className="text-indigo-500 font-bold mb-2">응시 인원</p><p className="text-4xl font-black text-indigo-700">{examParticipants.length}명</p></div>
                  <div className="bg-emerald-50 p-6 rounded-2xl text-center"><p className="text-emerald-500 font-bold mb-2">전체 평균</p><p className="text-4xl font-black text-emerald-700">{getAverage(examParticipants)}점</p></div>
                  <div className="bg-amber-50 p-6 rounded-2xl text-center"><p className="text-amber-500 font-bold mb-2">최고 점수</p><p className="text-4xl font-black text-amber-700">{Math.max(...examParticipants.map(p=>p.score||0))}점</p></div>
                </div>

                <h2 className="text-2xl font-black text-slate-800 mb-4">🏆 학생별 점수 분포</h2>
                <div className="space-y-3">
                  {examParticipants.sort((a,b) => b.score - a.score).map((p, idx) => (
                    <div key={p.uid} className="flex items-center gap-4 text-sm font-bold">
                      <span className="w-6 text-slate-400">{idx+1}</span>
                      <span className="w-20 truncate">{p.name}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden"><div className="bg-indigo-500 h-full rounded-full" style={{ width: `${p.score || 0}%` }}></div></div>
                      <span className="w-12 text-right">{p.score}점</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 탭 2. 학생별 성적 조회 */}
        {activeTab === 'student' && (
          <div className="animate-in fade-in flex gap-6 print:hidden">
            {/* 학생 명단 (좌측) */}
            <div className="w-64 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 bg-slate-800 text-white font-black text-center">학생 명부</div>
              <div className="overflow-y-auto h-[600px] divide-y divide-slate-100">
                {students.map(s => (
                  <button key={s.id} onClick={() => setSelectedStudentId(s.id)} className={`w-full text-left px-6 py-4 font-bold transition-colors ${selectedStudentId === s.id ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-slate-50 text-slate-700'}`}>
                    {s.name} <span className="text-xs text-slate-400 font-normal ml-2">{s.grade}학년</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 성적 대시보드 (우측) */}
            <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
              {!selectedStudentId ? (
                <div className="h-full flex items-center justify-center text-slate-400 font-bold text-lg">좌측 명부에서 학생을 선택하세요.</div>
              ) : (
                <>
                  <h2 className="text-3xl font-black text-slate-800 mb-6">{students.find(s=>s.id === selectedStudentId)?.name} 학생 누적 성적</h2>
                  <div className="mb-6 p-6 bg-emerald-50 border border-emerald-200 rounded-2xl flex justify-between items-center">
                     <span className="text-emerald-700 font-bold text-lg">전체 누적 평균 점수</span>
                     <span className="text-4xl font-black text-emerald-600">{getAverage(studentRecords)}점</span>
                  </div>
                  
                  <table className="w-full text-left text-sm font-bold text-slate-700">
                    <thead className="bg-slate-100">
                      <tr><th className="p-4 rounded-tl-xl">응시일</th><th className="p-4">과목</th><th className="p-4">시험 제목</th><th className="p-4 text-right rounded-tr-xl">취득 점수</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {studentRecords.length === 0 ? <tr><td colSpan={4} className="p-8 text-center text-slate-400">응시 기록이 없습니다.</td></tr> : 
                        studentRecords.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-4">{r.date}</td><td className="p-4"><span className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded text-xs">{r.subject}</span></td>
                            <td className="p-4">{r.examTitle}</td><td className="p-4 text-right text-lg text-indigo-600 font-black">{r.score}점</td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        )}

        {/* 탭 3. 통지표 인쇄 (NEIS 스타일 A4 문서) */}
        {activeTab === 'print' && (
          <div className="animate-in fade-in">
            <div className="mb-6 flex justify-between items-center print:hidden">
               <select value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)} className="bg-white border-2 border-slate-200 rounded-xl px-4 py-2 font-bold outline-none">
                 <option value="" disabled>학생을 선택하세요</option>
                 {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
               </select>
               <button onClick={handlePrint} disabled={!selectedStudentId} className="bg-slate-800 hover:bg-black text-white px-8 py-3 rounded-xl font-black shadow-lg disabled:opacity-30">🖨️ 성적표 인쇄하기 (PDF 저장)</button>
            </div>

            {selectedStudentId && (
              /* A4 사이즈 레이아웃 적용 (@media print 에서 여백 제거) */
              <div className="bg-white mx-auto border border-slate-300 shadow-2xl print:shadow-none print:border-none p-12" style={{ width: '210mm', minHeight: '297mm' }}>
                <div className="text-center border-b-4 border-slate-800 pb-6 mb-8">
                  <h1 className="text-4xl font-black text-slate-900 tracking-widest mb-2">학 업 성 취 도  통 지 표</h1>
                  <p className="text-lg font-bold text-slate-600">2026학년도 알지오 초등학교</p>
                </div>
                
                <div className="flex justify-between items-end mb-6 font-bold text-lg text-slate-800">
                   <div>
                     <span className="inline-block w-24 text-slate-500">성 명 :</span> {students.find(s=>s.id === selectedStudentId)?.name}
                   </div>
                   <div>
                     <span className="inline-block w-24 text-slate-500">학 년 / 반 :</span> {students.find(s=>s.id === selectedStudentId)?.grade}학년 {students.find(s=>s.id === selectedStudentId)?.classNum}반
                   </div>
                </div>

                <div className="border-t-2 border-slate-800 mb-8"></div>
                <h3 className="text-xl font-black mb-4">■ 교과 평가 결과</h3>
                
                <table className="w-full border-collapse border border-slate-400 text-center mb-8 font-bold">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="border border-slate-400 p-3">과목</th>
                      <th className="border border-slate-400 p-3">평가 내용 (시험 제목)</th>
                      <th className="border border-slate-400 p-3">성취도 (점수)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentRecords.length === 0 ? <tr><td colSpan={3} className="p-8">평가 기록이 없습니다.</td></tr> : 
                      studentRecords.map((r, i) => (
                        <tr key={i}>
                          <td className="border border-slate-400 p-3">{r.subject}</td>
                          <td className="border border-slate-400 p-3 text-left pl-4">{r.examTitle}</td>
                          <td className="border border-slate-400 p-3">
                            {r.score >= 90 ? '매우 잘함' : r.score >= 70 ? '잘함' : '보통'} ({r.score}점)
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>

                <h3 className="text-xl font-black mb-4">■ 종합 발달 상황 및 교사 의견</h3>
                <div className="border border-slate-400 p-6 min-h-[200px] leading-loose font-medium text-slate-800">
                  위 학생은 온라인 평가를 통해 측정한 교과 성취도가 평균 {getAverage(studentRecords)}점이며, 스스로 학습하는 자기주도적 태도가 돋보입니다. 
                  <br/><br/>(이 공간에 선생님의 코멘트나 학교장 직인을 추가할 수 있습니다.)
                </div>

                <div className="mt-20 text-center font-bold text-xl text-slate-800">
                   2026년 6월 30일 <br/><br/>
                   <span className="text-2xl font-black tracking-widest">알 지 오 초 등 학 교 장</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* 화면 인쇄를 위한 전용 CSS 삽입 */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:bg-white { background-color: white !important; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:border-none { border: none !important; }
          .print\\:p-0 { padding: 0 !important; }
          .print\\:max-w-none { max-width: none !important; }
          .animate-in { visibility: visible !important; position: absolute; left: 0; top: 0; width: 100%; }
          .animate-in * { visibility: visible; }
          @page { margin: 0; size: A4 portrait; }
        }
      `}</style>
    </div>
  );
}