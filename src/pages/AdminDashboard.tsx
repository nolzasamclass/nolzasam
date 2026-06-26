// src/pages/AdminDashboard.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, getDocs, doc, deleteDoc, addDoc, setDoc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { signOut } from 'firebase/auth';
import toast from 'react-hot-toast'; // 🌟 에러 해결: 예쁜 알림창 도구를 가져옵니다!

export default function AdminDashboard({ user }: { user: any }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'menus' | 'contents' | 'users' | 'settings'>('menus'); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // ==========================================
  // 1. 유저 제어 관련 상태
  // ==========================================
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [userActiveTab, setUserActiveTab] = useState<'pending' | 'approved'>('pending');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // ==========================================
  // 2. 🌟 과목/콘텐츠 관리 상태 
  // ==========================================
  const [menus, setMenus] = useState<any[]>([]);
  const [contents, setContents] = useState<any[]>([]);
  const [newMenuName, setNewMenuName] = useState('');
  
  // 수정 중인 메뉴의 상태 추적
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [editingMenuName, setEditingMenuName] = useState('');

  const [contentForm, setContentForm] = useState({ menuId: '', title: '', desc: '', url: '' }); 

  // ==========================================
  // 3. 디자인 설정 상태
  // ==========================================
  const [siteSettings, setSiteSettings] = useState({ layout: 'card', color: 'indigo', title: '놀자샘 스스로 학습 놀이터' });
  const [localTitle, setLocalTitle] = useState('');

  useEffect(() => {
    fetchSiteData();
    const unsubSettings = onSnapshot(doc(db, 'site_settings', 'main'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as any;
        setSiteSettings(data);
        setLocalTitle(data.title || ''); 
      }
    });
    if (activeTab === 'users') fetchUsersData();
    return () => unsubSettings();
  }, [activeTab]);

  const fetchSiteData = async () => {
    try {
      const menuSnap = await getDocs(collection(db, 'site_menus'));
      const fetchedMenus = menuSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // 순서(order) 필드가 있으면 그걸 우선하고, 없으면 생성 시간으로 정렬
      fetchedMenus.sort((a: any, b: any) => {
        const orderA = a.order !== undefined ? a.order : (a.createdAt?.seconds || 0);
        const orderB = b.order !== undefined ? b.order : (b.createdAt?.seconds || 0);
        return orderA - orderB;
      });
      setMenus(fetchedMenus);

      const contentSnap = await getDocs(query(collection(db, 'site_contents'), orderBy('createdAt', 'desc')));
      setContents(contentSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) { console.error("데이터 로드 에러:", error); }
  };

  const fetchUsersData = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'users'), orderBy('createdAt', 'desc')));
      setUsers(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() })));
      setSelectedIds([]);
    } catch (error) { console.error("회원 정보 로드 실패:", error); } 
    finally { setLoading(false); }
  };

  const pendingUsers = users.filter(u => !u.approved && u.role !== 'admin' && ((u.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (u.username || '').toLowerCase().includes(searchTerm.toLowerCase())));
  const approvedUsers = users.filter(u => u.approved && u.role !== 'admin' && ((u.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || (u.username || '').toLowerCase().includes(searchTerm.toLowerCase())));

  const getDisplayGradeClass = (u: any) => {
    let text = u.school || '';
    if (u.grade && u.classNum) text += ` ${u.grade}학년 ${u.classNum}반`;
    return text;
  };

  const handleToggleSelect = (uid: string) => setSelectedIds(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  const handleSelectAllPending = (e: React.ChangeEvent<HTMLInputElement>) => e.target.checked ? setSelectedIds(pendingUsers.map(u => u.uid)) : setSelectedIds([]);
  
  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return toast.error("승인할 회원을 선택해 주세요.");
    if (!window.confirm(`선택한 ${selectedIds.length}명의 가입을 일괄 승인하시겠습니까?`)) return;
    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => batch.update(doc(db, "users", id), { approved: true }));
      await batch.commit();
      toast.success("일괄 승인이 완료되었습니다.");
      fetchUsersData();
    } catch (err) { toast.error("승인 처리 중 오류 발생"); }
  };

  const handleApproveSingle = async (uid: string) => {
    try { await updateDoc(doc(db, "users", uid), { approved: true }); toast.success("가입이 승인되었습니다."); fetchUsersData(); } 
    catch (err) { toast.error("승인 실패"); }
  };

  const handleResetPassword = async (uid: string, name: string) => {
    const newPwd = prompt(`[${name}] 회원의 새 비밀번호를 입력하세요 (숫자 4자리):`);
    if (!newPwd) return;
    if (newPwd.length !== 4 || isNaN(Number(newPwd))) return alert("비밀번호는 반드시 숫자 4자리여야 합니다.");
    try { await updateDoc(doc(db, "users", uid), { plainPassword: newPwd }); toast.success("비밀번호가 정상적으로 변경되었습니다."); fetchUsersData(); } 
    catch (err) { toast.error("비밀번호 변경 실패"); }
  };

  const handleDeleteUser = async (uid: string, name: string) => {
    if (!window.confirm(`[${name}] 회원의 데이터를 영구 삭제하시겠습니까?`)) return;
    try { await deleteDoc(doc(db, "users", uid)); toast.success("삭제되었습니다."); fetchUsersData(); } 
    catch (e) { toast.error("삭제 실패"); }
  };

  // ----------------------------------------------------
  // 과목 메뉴 강력 관리
  // ----------------------------------------------------
  const handleAddMenu = async () => {
    if (!newMenuName.trim()) return toast.error("메뉴 이름을 입력해주세요.");
    try { 
      await addDoc(collection(db, 'site_menus'), { 
        name: newMenuName.trim(), 
        createdAt: serverTimestamp(),
        order: menus.length 
      }); 
      setNewMenuName(''); 
      fetchSiteData(); 
      toast.success("새 카테고리 메뉴가 신설되었습니다!"); 
    } 
    catch (err) { toast.error("메뉴 생성 실패"); }
  };

  const handleDeleteMenu = async (id: string, name: string) => {
    if (!window.confirm(`[${name}] 메뉴를 삭제하시겠습니까?\n홈 화면에서 해당 카테고리가 증발합니다.`)) return;
    try { await deleteDoc(doc(db, 'site_menus', id)); fetchSiteData(); } 
    catch (err) { toast.error("삭제 실패"); }
  };

  const handleEditMenuStart = (menu: any) => {
    setEditingMenuId(menu.id);
    setEditingMenuName(menu.name);
  };

  const handleEditMenuSave = async (id: string) => {
    if (!editingMenuName.trim()) return toast.error("메뉴 이름을 입력해주세요.");
    try {
      await updateDoc(doc(db, 'site_menus', id), { name: editingMenuName.trim() });
      setEditingMenuId(null);
      fetchSiteData();
      toast.success("수정 완료되었습니다.");
    } catch (err) { toast.error("수정 실패"); }
  };

  const handleMoveMenu = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === menus.length - 1) return;

    const newMenus = [...menus];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newMenus[index], newMenus[targetIndex]] = [newMenus[targetIndex], newMenus[index]];
    
    setMenus(newMenus);

    try {
      const batch = writeBatch(db);
      newMenus.forEach((menu, i) => {
        batch.update(doc(db, 'site_menus', menu.id), { order: i });
      });
      await batch.commit();
    } catch (err) {
      toast.error("순서 변경 저장에 실패했습니다.");
      fetchSiteData();
    }
  };

  const handleAddContent = async () => {
    if (!contentForm.menuId || !contentForm.title || !contentForm.url) return toast.error("메뉴 분류, 콘텐츠 제목, 실행 주소(URL)는 필수 입력 사항입니다.");
    try { await addDoc(collection(db, 'site_contents'), { ...contentForm, createdAt: serverTimestamp() }); setContentForm({ menuId: '', title: '', desc: '', url: '' }); fetchSiteData(); toast.success("새로운 콘텐츠가 지정 카테고리에 할당되었습니다!"); } 
    catch (err) { toast.error("콘텐츠 연동 실패"); }
  };

  const handleDeleteContent = async (id: string) => {
    if (!window.confirm("이 콘텐츠를 삭제하시겠습니까?")) return;
    try { await deleteDoc(doc(db, 'site_contents', id)); fetchSiteData(); } 
    catch (err) { toast.error("삭제 실패"); }
  };

  const handleSaveSettings = async (updatedFields: Partial<typeof siteSettings>) => {
    try {
      const nextSettings = { ...siteSettings, ...updatedFields };
      await setDoc(doc(db, 'site_settings', 'main'), nextSettings, { merge: true });
      setSiteSettings(nextSettings);
      if (updatedFields.title !== undefined) toast.success("타이틀이 성공적으로 적용되었습니다!");
    } catch (err) { toast.error("설정 보존 실패"); }
  };

  return (
    <div className="min-h-screen flex bg-slate-100 font-sans text-slate-800 relative">
      
      {/* 모바일 전용 상단 헤더 */}
      <div className="md:hidden bg-slate-900 text-white w-full h-16 flex items-center justify-between px-4 fixed top-0 left-0 z-40 shadow-md">
        <div className="font-black text-lg flex items-center gap-2"><span>⚙️</span> 포털 제어 센터</div>
        <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-slate-800 rounded-lg focus:outline-none">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg>
        </button>
      </div>

      {/* 모바일용 메뉴 오버레이 */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setIsSidebarOpen(false)}></div>
      )}

      {/* 좌측 사이드바 */}
      <div className={`fixed inset-y-0 left-0 w-64 bg-slate-900 text-white flex flex-col shadow-2xl z-50 transform transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 text-lg font-black border-b border-slate-800 flex justify-between items-center">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2"><span>⚙️</span> 포털 제어 센터</div>
            <span className="text-[11px] text-indigo-400 font-bold mt-1">접속관리자: {user?.name || '마스터교사'}</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">✖</button>
        </div>
        
        <nav className="flex-1 py-6 flex flex-col gap-2 px-4 overflow-y-auto">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-4 mt-2">구조 설계 및 콘텐츠 배포</div>
          <button onClick={() => { setActiveTab('menus'); setIsSidebarOpen(false); }} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'menus' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>📁 메뉴(과목) 개설 관리</button>
          <button onClick={() => { setActiveTab('contents'); setIsSidebarOpen(false); }} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'contents' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>✍️ 하위 콘텐츠 연동</button>
          
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-4 mt-6">포털 시스템 제어</div>
          <button onClick={() => { setActiveTab('users'); setIsSidebarOpen(false); }} className={`text-left px-4 py-3 rounded-xl font-bold transition-all flex justify-between items-center ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <span>👥 사용자 계정 통제</span>
            {pendingUsers.length > 0 && <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full">{pendingUsers.length}</span>}
          </button>
          <button onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>🎨 홈화면 디자인 설정</button>
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          <button onClick={() => navigate('/')} className="w-full text-left px-4 py-3 rounded-xl font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors flex items-center gap-2"><span>🏠</span> 메인 홈 화면 가기</button>
          <button onClick={() => { signOut(auth); navigate('/'); }} className="w-full text-left px-4 py-3 rounded-xl font-bold text-rose-400 hover:bg-rose-950 transition-colors flex items-center gap-2"><span>🚪</span> 로그아웃</button>
        </div>
      </div>

      {/* 우측 작업 화면 */}
      <div className="flex-1 p-4 pt-20 md:p-10 md:pt-10 overflow-y-auto w-full max-w-full">
        
        {/* 메뉴 개설 관리 */}
        {activeTab === 'menus' && (
          <div className="max-w-4xl animate-in fade-in duration-300">
            <h1 className="text-2xl md:text-3xl font-black text-slate-800 mb-2">📁 메뉴(과목) 개설 관리</h1>
            <p className="text-sm md:text-base text-slate-500 font-bold mb-8">홈 화면 상단 탭에 노출될 카테고리(국어, 수학, 동아리방 등)를 자유롭게 개설, 수정하고 순서를 변경하세요.</p>
            
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200 mb-8">
              <h3 className="text-base md:text-lg font-black mb-4">새로운 과목/메뉴 이름</h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <input type="text" value={newMenuName} onChange={e=>setNewMenuName(e.target.value)} placeholder="예: 5학년 사회, 정보통신 윤리" className="flex-1 p-3 rounded-xl border-2 border-slate-200 outline-none focus:border-indigo-500 font-bold" />
                <button onClick={handleAddMenu} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-black px-8 py-3 rounded-xl transition-colors shadow-md">과목 추가</button>
              </div>
            </div>

            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200">
              <h3 className="text-base md:text-lg font-black mb-4">현재 배포된 과목 리스트 (순서 조정 가능)</h3>
              <ul className="space-y-3">
                {menus.map((m, index) => (
                  <li key={m.id} className={`flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50 p-3 md:p-4 rounded-xl border-2 transition-colors gap-4 ${editingMenuId === m.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-100 hover:border-indigo-200'}`}>
                    
                    {editingMenuId === m.id ? (
                      <div className="flex-1 flex gap-2 w-full">
                        <input type="text" value={editingMenuName} onChange={e => setEditingMenuName(e.target.value)} className="flex-1 p-2 rounded-lg border-2 border-emerald-300 outline-none focus:border-emerald-500 font-black text-slate-800 text-sm md:text-base" autoFocus />
                        <button onClick={() => handleEditMenuSave(m.id)} className="bg-emerald-500 text-white font-black px-4 py-2 rounded-lg hover:bg-emerald-600 text-xs md:text-sm shadow-sm whitespace-nowrap">저장</button>
                        <button onClick={() => setEditingMenuId(null)} className="bg-slate-300 text-slate-700 font-bold px-4 py-2 rounded-lg hover:bg-slate-400 text-xs md:text-sm whitespace-nowrap">취소</button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                          <div className="flex flex-col gap-0.5 mr-1">
                            <button onClick={() => handleMoveMenu(index, 'up')} disabled={index === 0} className="w-7 h-5 flex items-center justify-center bg-white border border-slate-200 rounded text-slate-400 hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-20 text-[10px] font-black transition-colors leading-none">▲</button>
                            <button onClick={() => handleMoveMenu(index, 'down')} disabled={index === menus.length - 1} className="w-7 h-5 flex items-center justify-center bg-white border border-slate-200 rounded text-slate-400 hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-20 text-[10px] font-black transition-colors leading-none">▼</button>
                          </div>
                          <span className="text-slate-800 text-base md:text-lg font-black">{m.name}</span>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto justify-end mt-2 sm:mt-0 border-t sm:border-0 border-slate-200 pt-3 sm:pt-0">
                          <button onClick={() => handleEditMenuStart(m)} className="text-xs md:text-sm text-indigo-600 bg-indigo-50 border border-indigo-200 px-4 py-2 rounded-lg hover:bg-indigo-500 hover:text-white transition-colors shadow-sm font-bold">이름 수정</button>
                          <button onClick={() => handleDeleteMenu(m.id, m.name)} className="text-xs md:text-sm text-rose-500 bg-white border border-rose-200 px-4 py-2 rounded-lg hover:bg-rose-50 transition-colors shadow-sm font-bold">삭제</button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* 하위 콘텐츠 등록 */}
        {activeTab === 'contents' && (
          <div className="max-w-6xl animate-in fade-in duration-300">
            <h1 className="text-2xl md:text-3xl font-black text-slate-800 mb-2">✍️ 하위 학습 콘텐츠 연동</h1>
            <p className="text-sm md:text-base text-slate-500 font-bold mb-8">개발된 학습 앱이나 퀴즈 코드 주소(URL)를 카테고리에 연결하여 버튼을 생성합니다.</p>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              <div className="bg-white p-6 md:p-8 rounded-3xl shadow-md border border-slate-200 h-fit">
                <h3 className="text-lg md:text-xl font-black mb-6 text-indigo-600 border-b border-slate-100 pb-4">학습 연동 설정</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-500 mb-1">소속 메뉴(과목) 선택</label>
                    <select value={contentForm.menuId} onChange={e=>setContentForm({...contentForm, menuId: e.target.value})} className="w-full p-3 rounded-xl border-2 border-slate-200 outline-none focus:border-indigo-500 font-bold text-slate-700">
                      <option value="">연결할 카테고리를 고르세요</option>
                      {menus.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-500 mb-1">개발 코드 주소 (URL)</label>
                    <input type="text" value={contentForm.url} onChange={e=>setContentForm({...contentForm, url: e.target.value})} placeholder="예: /math-game" className="w-full p-3 rounded-xl border-2 border-slate-200 outline-none focus:border-indigo-500 font-mono text-sm text-sky-600 font-bold" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-500 mb-1">학습 콘텐츠 제목</label>
                    <input type="text" value={contentForm.title} onChange={e=>setContentForm({...contentForm, title: e.target.value})} placeholder="예: 3단원 화산과 지진 퀴즈" className="w-full p-3 rounded-xl border-2 border-slate-200 outline-none focus:border-indigo-500 font-black text-slate-800" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-500 mb-1">학습 안내/설명</label>
                    <textarea value={contentForm.desc} onChange={e=>setContentForm({...contentForm, desc: e.target.value})} placeholder="무엇을 배우는 활동인지 간략하게 적어주세요." className="w-full p-4 rounded-xl border-2 border-slate-200 outline-none focus:border-indigo-500 h-28 resize-none font-medium" />
                  </div>
                  <button onClick={handleAddContent} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-xl transition-all active:scale-95 text-base md:text-lg">홈 화면에 연동 버튼 생성 🚀</button>
                </div>
              </div>

              <div className="bg-slate-50 p-4 md:p-6 rounded-3xl border border-slate-200 overflow-y-auto max-h-[500px] md:max-h-[750px] custom-scrollbar">
                <h3 className="text-base md:text-lg font-black text-slate-700 mb-4">연동된 학습 콘텐츠 목록</h3>
                <div className="space-y-4">
                  {contents.map(c => (
                    <div key={c.id} className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 relative group flex flex-col md:block">
                      <button onClick={()=>handleDeleteContent(c.id)} className="static md:absolute mt-2 md:mt-0 md:top-4 md:right-4 text-xs font-bold bg-rose-50 text-rose-500 px-3 md:px-2.5 py-2 md:py-1.5 rounded-lg md:opacity-0 md:group-hover:opacity-100 transition-opacity hover:bg-rose-500 hover:text-white w-full md:w-auto text-center order-last md:order-none">연결 해제</button>
                      <div>
                        <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-100">{menus.find(m=>m.id === c.menuId)?.name || '미분류'}</span>
                        <h4 className="text-sm md:text-base font-black text-slate-800 mt-1">{c.title}</h4>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{c.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 유저 제어 */}
        {activeTab === 'users' && (
          <div className="max-w-5xl animate-in fade-in duration-300">
            <h1 className="text-2xl md:text-3xl font-black text-slate-800 mb-6 flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-3">
              <span>👥 사용자 계정 원격 통제</span>
            </h1>

            <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-200 pb-4">
              <button onClick={() => setUserActiveTab('pending')} className={`px-4 md:px-6 py-2 md:py-2.5 rounded-full font-black text-xs md:text-sm transition-all flex items-center gap-2 ${userActiveTab === 'pending' ? 'bg-rose-500 text-white shadow-md' : 'bg-white text-slate-500 hover:bg-slate-100'}`}>
                <span>가입 승인 대기</span>
                {pendingUsers.length > 0 && <span className="bg-white text-rose-600 px-2 py-0.5 rounded-full text-[10px] md:text-xs">{pendingUsers.length}</span>}
              </button>
              <button onClick={() => setUserActiveTab('approved')} className={`px-4 md:px-6 py-2 md:py-2.5 rounded-full font-black text-xs md:text-sm transition-all ${userActiveTab === 'approved' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-500 hover:bg-slate-100'}`}>
                정식 회원 명부 ({approvedUsers.length})
              </button>
            </div>

            <div className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-3 md:p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <input type="text" placeholder="이름 또는 아이디 검색..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} className="p-2 rounded-xl border border-slate-300 font-bold text-xs w-full sm:w-64 outline-none focus:border-indigo-500" />
                {userActiveTab === 'pending' && selectedIds.length > 0 && (
                  <button onClick={handleBulkApprove} className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black px-4 py-2 rounded-lg shadow-sm">
                    ✔ 선택 일괄 승인 ({selectedIds.length})
                  </button>
                )}
              </div>

              <div className="overflow-x-auto w-full">
                {userActiveTab === 'pending' && (
                  <table className="w-full text-left text-xs md:text-sm font-bold text-slate-700 min-w-[600px]">
                    <thead className="bg-slate-100 border-b border-slate-200">
                      <tr>
                        <th className="p-3 md:p-4 w-10 text-center"><input type="checkbox" checked={pendingUsers.length > 0 && selectedIds.length === pendingUsers.length} onChange={handleSelectAllPending} className="w-4 h-4 accent-indigo-500" /></th>
                        <th className="p-3 md:p-4">신분</th>
                        <th className="p-3 md:p-4">이름</th>
                        <th className="p-3 md:p-4">아이디</th>
                        <th className="p-3 md:p-4">학교/학년</th>
                        <th className="p-3 md:p-4 text-center">관리</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? <tr><td colSpan={6} className="p-6 md:p-10 text-center text-slate-400">동기화 중...</td></tr> : pendingUsers.length === 0 ? <tr><td colSpan={6} className="p-6 md:p-10 text-center text-slate-400">대기 중인 회원이 없습니다.</td></tr> : (
                        pendingUsers.map((u: any) => (
                          <tr key={u.uid} className="hover:bg-slate-50">
                            <td className="p-3 md:p-4 text-center"><input type="checkbox" checked={selectedIds.includes(u.uid)} onChange={() => handleToggleSelect(u.uid)} className="w-4 h-4 accent-indigo-500" /></td>
                            <td className="p-3 md:p-4"><span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-[10px] md:text-xs">{u.role}</span></td>
                            <td className="p-3 md:p-4 text-slate-900">{u.name}</td>
                            <td className="p-3 md:p-4 font-mono text-slate-500 text-[10px] md:text-xs">{u.username || u.email}</td>
                            <td className="p-3 md:p-4 text-slate-500 text-[10px] md:text-xs">{getDisplayGradeClass(u)}</td>
                            <td className="p-3 md:p-4 text-center space-x-1 md:space-x-2 whitespace-nowrap">
                              <button onClick={() => handleApproveSingle(u.uid)} className="text-emerald-600 bg-emerald-50 px-2 md:px-3 py-1 md:py-1.5 rounded hover:bg-emerald-500 hover:text-white transition-all text-[10px] md:text-xs">승인</button>
                              <button onClick={()=>handleDeleteUser(u.uid, u.name)} className="text-rose-500 bg-rose-50 px-2 md:px-3 py-1 md:py-1.5 rounded hover:bg-rose-500 hover:text-white transition-all text-[10px] md:text-xs">삭제</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}

                {userActiveTab === 'approved' && (
                  <table className="w-full text-left text-xs md:text-sm font-bold text-slate-700 min-w-[500px]">
                    <thead className="bg-slate-100 border-b border-slate-200">
                      <tr>
                        <th className="p-3 md:p-4">신분</th>
                        <th className="p-3 md:p-4">이름</th>
                        <th className="p-3 md:p-4">아이디</th>
                        <th className="p-3 md:p-4">임시 비번</th>
                        <th className="p-3 md:p-4 text-center">보안 제어</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? <tr><td colSpan={5} className="p-6 md:p-10 text-center text-slate-400">동기화 중...</td></tr> : approvedUsers.length === 0 ? <tr><td colSpan={5} className="p-6 md:p-10 text-center text-slate-400">회원이 없습니다.</td></tr> : (
                        approvedUsers.map((u: any) => (
                          <tr key={u.uid} className="hover:bg-slate-50">
                            <td className="p-3 md:p-4"><span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] md:text-xs">{u.role}</span></td>
                            <td className="p-3 md:p-4 text-slate-900">{u.name}</td>
                            <td className="p-3 md:p-4 font-mono text-slate-500 text-[10px] md:text-xs">{u.username || u.email}</td>
                            <td className="p-3 md:p-4 font-mono text-emerald-500 tracking-widest">{u.plainPassword || '••••'}</td>
                            <td className="p-3 md:p-4 text-center space-x-1 md:space-x-2 whitespace-nowrap">
                              <button onClick={() => handleResetPassword(u.uid, u.name)} className="text-sky-600 bg-sky-50 px-2 md:px-3 py-1 md:py-1.5 rounded hover:bg-sky-500 hover:text-white transition-all text-[10px] md:text-xs">비번수정</button>
                              <button onClick={() => handleDeleteUser(u.uid, u.name)} className="text-rose-500 bg-rose-50 px-2 md:px-3 py-1 md:py-1.5 rounded hover:bg-rose-500 hover:text-white transition-all text-[10px] md:text-xs">삭제</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 🎨 디자인 설정 */}
        {activeTab === 'settings' && (
          <div className="max-w-5xl space-y-6 md:space-y-8 animate-in fade-in duration-300">
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-slate-800 mb-2">🎨 홈화면 디자인 테마 설정</h1>
              <p className="text-sm md:text-base text-slate-500 font-bold">포털 메인 화면에 학습 콘텐츠 버튼들이 어떤 레이아웃으로 출력될지 결정합니다.</p>
            </div>

            <div className="bg-white p-5 md:p-6 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-sm md:text-base font-black text-slate-800 mb-3">🖥️ 포털 대문 타이틀 텍스트 설정</h3>
              <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
                <input type="text" value={localTitle} onChange={e => setLocalTitle(e.target.value)} placeholder="예: 상수쌤 스스로 학습 놀이터" className="flex-1 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-black text-lg md:text-xl text-slate-800 outline-none focus:border-indigo-500" />
                <button onClick={() => handleSaveSettings({ title: localTitle })} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-black shadow-sm transition-all">텍스트 적용</button>
              </div>
            </div>

            <div className="bg-white p-5 md:p-8 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-base md:text-lg font-black text-slate-800 mb-4 md:mb-6 flex items-center gap-2"><span>📐</span> 콘텐츠 연동 버튼 출력 형식 선택</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                {[
                  { id: 'card', title: '스마트 아이콘 카드', desc: '이모지와 함께 강조되는 모던하고 깔끔한 정사각형 카드형 보드', icon: '💡' },
                  { id: 'index', title: '아카데믹 단원 목차', desc: '교과서 목차나 논문 리스트처럼 지적이고 단정하게 정렬된 목록형', icon: '📑' },
                  { id: 'badge', title: '미션 뱃지 보드', desc: '초등학생의 흥미를 자극하는 가로로 넓은 타원형의 게임 뱃지 형태', icon: '🚀' },
                  { id: 'focus', title: '집중 플래시보드', desc: '가운데 정렬된 큼직한 텍스트로 하나의 콘텐츠에 완전히 몰입하는 형태', icon: '🎯' },
                ].map(item => (
                  <button key={item.id} onClick={() => handleSaveSettings({ layout: item.id })} className={`p-4 md:p-5 rounded-2xl text-left border-2 md:border-4 flex flex-row sm:flex-col justify-between transition-all items-center sm:items-start gap-4 sm:gap-0 ${siteSettings.layout === item.id ? 'border-indigo-600 bg-indigo-50/40 shadow-sm' : 'border-slate-200 bg-white'}`}>
                    <div className="flex-1">
                      <div className="text-2xl md:text-3xl mb-0 sm:mb-3">{item.icon}</div>
                      <h4 className="font-black text-slate-800 text-sm mb-1 sm:mb-2">{item.title}</h4>
                      <p className="text-slate-500 text-[10px] md:text-[11px] font-bold leading-relaxed hidden sm:block">{item.desc}</p>
                    </div>
                    <div className="flex items-center justify-end">
                      <span className={`w-4 h-4 rounded-full border-2 ${siteSettings.layout === item.id ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}></span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white p-5 md:p-8 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-base md:text-lg font-black text-slate-800 mb-4">🎨 글로벌 포인트 브랜딩 컬러 조합</h3>
              <div className="flex flex-wrap gap-2 md:gap-4">
                {[
                  { id: 'indigo', name: '인디고 블루 (기본)', color: 'bg-indigo-600' },
                  { id: 'emerald', name: '에메랄드 그린 (과학/자연)', color: 'bg-emerald-600' },
                  { id: 'rose', name: '로즈 핑크 (문해력/국어)', color: 'bg-rose-600' },
                  { id: 'amber', name: '앰버 옐로우 (사회/활동)', color: 'bg-amber-500' }
                ].map(c => (
                  <button key={c.id} onClick={() => handleSaveSettings({ color: c.id })} className={`flex items-center gap-2 p-2 md:p-3 rounded-lg md:rounded-xl border-2 transition-all ${siteSettings.color === c.id ? 'border-slate-900 bg-slate-50 font-black' : 'border-slate-200 font-bold text-slate-500'}`}>
                    <span className={`w-3 h-3 md:w-4 md:h-4 rounded-full ${c.color}`}></span>
                    <span className="text-[10px] md:text-xs">{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}