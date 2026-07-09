// src/pages/AdminDashboard.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, getDocs, doc, deleteDoc, addDoc, setDoc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { signOut } from 'firebase/auth';
import toast from 'react-hot-toast'; 

interface AdminDashboardProps {
  user?: any;
}

export default function AdminDashboard({ user }: AdminDashboardProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'menus' | 'contents' | 'users' | 'settings'>('menus'); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [userActiveTab, setUserActiveTab] = useState<'pending' | 'approved'>('pending');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [menus, setMenus] = useState<any[]>([]);
  const [contents, setContents] = useState<any[]>([]);
  
  // 🌟 다중 선택(배열)을 지원하도록 상태 변경
  const [newMenuForm, setNewMenuForm] = useState<{name: string, allowedRoles: string[]}>({ name: '', allowedRoles: [] });
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [editingMenuForm, setEditingMenuForm] = useState<{name: string, allowedRoles: string[]}>({ name: '', allowedRoles: [] });

  const [contentForm, setContentForm] = useState({ menuId: '', title: '', desc: '', url: '' }); 
  const [editingContentId, setEditingContentId] = useState<string | null>(null);

  const [siteSettings, setSiteSettings] = useState({ layout: 'card', color: 'indigo', title: '놀자샘 스스로 학습 놀이터' });
  const [localTitle, setLocalTitle] = useState('');

  // 💡 DB에서 가져온 권한 데이터를 안전하게 배열로 변환하는 유틸리티 함수
  const getRolesArray = (roles: any): string[] => {
    if (!roles || roles === 'all') return [];
    if (Array.isArray(roles)) return roles;
    if (typeof roles === 'string') return [roles];
    return [];
  };

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
      fetchedMenus.sort((a: any, b: any) => (a.order ?? a.createdAt?.seconds ?? 0) - (b.order ?? b.createdAt?.seconds ?? 0));
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

  const handleMigrateRoles = async () => {
    if (!window.confirm("🚨 구버전 역할인 '학생'을 모두 '학급 학생'으로 일괄 변경하시겠습니까?")) return;
    try {
      const batch = writeBatch(db);
      let count = 0;
      users.forEach(u => {
        if (u.role === '학생') { batch.update(doc(db, "users", u.uid), { role: '학급 학생' }); count++; }
      });
      if (count > 0) {
        await batch.commit(); toast.success(`🎉 ${count}명 업데이트 완료!`); fetchUsersData();
      } else { toast.error("업데이트할 데이터가 없습니다."); }
    } catch (err) { toast.error("업데이트 중 오류가 발생했습니다."); }
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
    if (!newPwd || newPwd.length !== 4 || isNaN(Number(newPwd))) return alert("비밀번호는 반드시 숫자 4자리여야 합니다.");
    try { await updateDoc(doc(db, "users", uid), { plainPassword: newPwd }); toast.success("비밀번호 변경 완료"); fetchUsersData(); } 
    catch (err) { toast.error("비밀번호 변경 실패"); }
  };

  const handleDeleteUser = async (uid: string, name: string) => {
    if (!window.confirm(`[${name}] 회원의 데이터를 영구 삭제하시겠습니까?`)) return;
    try { await deleteDoc(doc(db, "users", uid)); toast.success("삭제되었습니다."); fetchUsersData(); } 
    catch (e) { toast.error("삭제 실패"); }
  };

  const handleAddMenu = async () => {
    if (!newMenuForm.name.trim()) return toast.error("메뉴 이름을 입력해주세요.");
    try { 
      await addDoc(collection(db, 'site_menus'), { 
        name: newMenuForm.name.trim(), 
        allowedRoles: newMenuForm.allowedRoles, // 배열 저장
        createdAt: serverTimestamp(), 
        order: menus.length 
      }); 
      setNewMenuForm({ name: '', allowedRoles: [] }); fetchSiteData(); toast.success("새 카테고리 메뉴 신설!"); 
    } catch (err) { toast.error("메뉴 생성 실패"); }
  };

  const handleDeleteMenu = async (id: string, name: string) => {
    if (!window.confirm(`[${name}] 메뉴를 삭제하시겠습니까?`)) return;
    try { await deleteDoc(doc(db, 'site_menus', id)); fetchSiteData(); } catch (err) { toast.error("삭제 실패"); }
  };

  const handleEditMenuStart = (menu: any) => { 
    setEditingMenuId(menu.id); 
    setEditingMenuForm({ name: menu.name, allowedRoles: getRolesArray(menu.allowedRoles) }); 
  };

  const handleEditMenuSave = async (id: string) => {
    if (!editingMenuForm.name.trim()) return toast.error("메뉴 이름을 입력해주세요.");
    try {
      await updateDoc(doc(db, 'site_menus', id), { name: editingMenuForm.name.trim(), allowedRoles: editingMenuForm.allowedRoles });
      setEditingMenuId(null); fetchSiteData(); toast.success("수정 완료되었습니다.");
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
      newMenus.forEach((menu, i) => { batch.update(doc(db, 'site_menus', menu.id), { order: i }); });
      await batch.commit();
    } catch (err) { toast.error("순서 변경 저장 실패"); fetchSiteData(); }
  };

  const handleSaveContent = async () => {
    if (!contentForm.menuId || !contentForm.title || !contentForm.url) return toast.error("필수 입력 사항을 채워주세요.");
    try { 
      if (editingContentId) {
        await updateDoc(doc(db, 'site_contents', editingContentId), { ...contentForm }); toast.success("콘텐츠 정보 수정 완료!");
      } else {
        await addDoc(collection(db, 'site_contents'), { ...contentForm, createdAt: serverTimestamp() }); toast.success("새 콘텐츠 생성 완료!"); 
      }
      setContentForm({ menuId: '', title: '', desc: '', url: '' }); setEditingContentId(null); fetchSiteData(); 
    } catch (err) { toast.error("저장 실패"); }
  };

  const handleEditContentStart = (content: any) => { setEditingContentId(content.id); setContentForm({ menuId: content.menuId || '', title: content.title || '', desc: content.desc || '', url: content.url || '' }); };
  const handleCancelContentEdit = () => { setEditingContentId(null); setContentForm({ menuId: '', title: '', desc: '', url: '' }); };
  const handleDeleteContent = async (id: string) => {
    if (!window.confirm("이 콘텐츠를 삭제하시겠습니까?")) return;
    try { await deleteDoc(doc(db, 'site_contents', id)); if (editingContentId === id) handleCancelContentEdit(); fetchSiteData(); toast.success("삭제 완료"); } catch (err) { toast.error("삭제 실패"); }
  };

  const handleSaveSettings = async (updatedFields: Partial<typeof siteSettings>) => {
    try {
      const nextSettings = { ...siteSettings, ...updatedFields };
      await setDoc(doc(db, 'site_settings', 'main'), nextSettings, { merge: true });
      setSiteSettings(nextSettings);
      if (updatedFields.title !== undefined) toast.success("타이틀 적용 완료!");
    } catch (err) { toast.error("설정 보존 실패"); }
  };

  return (
    <div className="min-h-screen flex bg-slate-100 font-sans text-slate-800 relative">
      <div className="md:hidden bg-slate-900 text-white w-full h-16 flex items-center justify-between px-4 fixed top-0 left-0 z-40 shadow-md">
        <div className="font-black text-lg flex items-center gap-2"><span>⚙️</span> 포털 제어 센터</div>
        <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-slate-800 rounded-lg focus:outline-none">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg>
        </button>
      </div>

      {isSidebarOpen && <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setIsSidebarOpen(false)}></div>}

      <div className={`fixed inset-y-0 left-0 w-64 bg-slate-900 text-white flex flex-col shadow-2xl z-50 transform transition-transform duration-300 ease-in-out md:static md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 text-lg font-black border-b border-slate-800 flex justify-between items-center">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2"><span>⚙️</span> 제어 센터</div>
            <span className="text-[11px] text-indigo-400 font-bold mt-1">접속관리자: {user?.name || '마스터교사'}</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">✖</button>
        </div>
        
        <nav className="flex-1 py-6 flex flex-col gap-2 px-4 overflow-y-auto">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-4 mt-2">구조 설계 및 콘텐츠</div>
          <button onClick={() => { setActiveTab('menus'); setIsSidebarOpen(false); }} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'menus' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>📁 메뉴(과목) 관리</button>
          <button onClick={() => { setActiveTab('contents'); setIsSidebarOpen(false); }} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'contents' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>✍️ 하위 콘텐츠 연동</button>
          
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-4 mt-6">포털 시스템 제어</div>
          <button onClick={() => { setActiveTab('users'); setIsSidebarOpen(false); }} className={`text-left px-4 py-3 rounded-xl font-bold transition-all flex justify-between items-center ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <span>👥 사용자 계정 통제</span>
            {pendingUsers.length > 0 && <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full">{pendingUsers.length}</span>}
          </button>
          <button onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }} className={`text-left px-4 py-3 rounded-xl font-bold transition-all ${activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>🎨 디자인 설정</button>
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2">
          <button onClick={() => navigate('/')} className="w-full text-left px-4 py-3 rounded-xl font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors flex items-center gap-2"><span>🏠</span> 홈 화면 가기</button>
          <button onClick={() => { signOut(auth); navigate('/'); }} className="w-full text-left px-4 py-3 rounded-xl font-bold text-rose-400 hover:bg-rose-950 transition-colors flex items-center gap-2"><span>🚪</span> 로그아웃</button>
        </div>
      </div>

      <div className="flex-1 p-4 pt-20 md:p-10 md:pt-10 overflow-y-auto w-full max-w-full">
        
        {activeTab === 'menus' && (
          <div className="max-w-4xl animate-in fade-in duration-300">
            <h1 className="text-2xl md:text-3xl font-black text-slate-800 mb-2">📁 메뉴(과목) 개설 관리</h1>
            
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200 mb-8 flex flex-col gap-4">
              <h3 className="text-base md:text-lg font-black text-slate-800">새로운 카테고리 신설</h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <input type="text" value={newMenuForm.name} onChange={e=>setNewMenuForm({...newMenuForm, name: e.target.value})} placeholder="카테고리명 (예: 스포츠 클럽)" className="flex-1 p-3 rounded-xl border-2 border-slate-200 outline-none focus:border-indigo-500 font-bold" />
                <button onClick={handleAddMenu} className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-8 py-3 rounded-xl whitespace-nowrap">메뉴 생성</button>
              </div>
              
              {/* 🌟 다중 권한 선택 토글 UI */}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-sm font-bold text-slate-500 mr-2">열람 권한 (중복 선택 가능):</span>
                <button onClick={() => setNewMenuForm({...newMenuForm, allowedRoles: []})} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${newMenuForm.allowedRoles.length === 0 ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>전체 공개</button>
                {['학급 학생', '일반 학생', '학부모', '교사'].map(role => (
                  <button 
                    key={role} 
                    onClick={() => {
                      const prev = newMenuForm.allowedRoles;
                      setNewMenuForm({...newMenuForm, allowedRoles: prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]});
                    }} 
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${newMenuForm.allowedRoles.includes(role) ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h3 className="text-base md:text-lg font-black mb-4">현재 배포된 과목 리스트 (순서 조정 가능)</h3>
              <ul className="space-y-3">
                {menus.map((m, index) => {
                  const rolesDisplay = getRolesArray(m.allowedRoles);

                  return (
                    <li key={m.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50 p-4 rounded-xl border-2 border-slate-100 gap-4">
                      {editingMenuId === m.id ? (
                        <div className="flex-1 flex flex-col gap-3 w-full">
                          <div className="flex gap-2">
                            <input type="text" value={editingMenuForm.name} onChange={e => setEditingMenuForm({...editingMenuForm, name: e.target.value})} className="flex-1 p-2 rounded-lg border-2 border-emerald-300 font-bold" />
                            <button onClick={() => handleEditMenuSave(m.id)} className="bg-emerald-500 text-white font-black px-4 py-2 rounded-lg">저장</button>
                            <button onClick={() => setEditingMenuId(null)} className="bg-slate-300 text-slate-700 font-bold px-4 py-2 rounded-lg">취소</button>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-500 mr-1">권한:</span>
                            <button onClick={() => setEditingMenuForm({...editingMenuForm, allowedRoles: []})} className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${editingMenuForm.allowedRoles.length === 0 ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>전체 공개</button>
                            {['학급 학생', '일반 학생', '학부모', '교사'].map(role => (
                              <button key={role} onClick={() => {
                                const prev = editingMenuForm.allowedRoles;
                                setEditingMenuForm({...editingMenuForm, allowedRoles: prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]});
                              }} className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all ${editingMenuForm.allowedRoles.includes(role) ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>
                                {role}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3 w-full sm:w-auto">
                            <div className="flex flex-col gap-0.5 mr-1">
                              <button onClick={() => handleMoveMenu(index, 'up')} disabled={index === 0} className="w-7 h-5 flex items-center justify-center bg-white border border-slate-200 rounded text-[10px] font-black hover:bg-slate-100">▲</button>
                              <button onClick={() => handleMoveMenu(index, 'down')} disabled={index === menus.length - 1} className="w-7 h-5 flex items-center justify-center bg-white border border-slate-200 rounded text-[10px] font-black hover:bg-slate-100">▼</button>
                            </div>
                            <span className="text-slate-800 text-base md:text-lg font-black">{m.name}</span>
                            
                            {/* 🌟 다중 권한 뱃지 출력 */}
                            <div className="flex gap-1 flex-wrap ml-2">
                              {rolesDisplay.length === 0 ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-500">전체공개</span>
                              ) : (
                                rolesDisplay.map((r: string) => (
                                  <span key={r} className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">{r}</span>
                                ))
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleEditMenuStart(m)} className="text-sm text-indigo-600 bg-indigo-50 px-4 py-2 rounded-lg font-bold">수정</button>
                            <button onClick={() => handleDeleteMenu(m.id, m.name)} className="text-sm text-rose-500 bg-white px-4 py-2 rounded-lg font-bold border border-rose-200">삭제</button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {/* 하위 콘텐츠 및 사용자 탭 코드는 생략하지 않고 100% 동일하게 유지합니다. */}
        {activeTab === 'contents' && (
          <div className="max-w-6xl animate-in fade-in duration-300">
            <h1 className="text-2xl md:text-3xl font-black text-slate-800 mb-6">✍️ 하위 학습 콘텐츠 연동</h1>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              <div className="bg-white p-6 md:p-8 rounded-3xl shadow-md border border-slate-200 h-fit">
                <h3 className="text-lg font-black mb-6 text-indigo-600 border-b border-slate-100 pb-4">{editingContentId ? '수정 중...' : '새로운 연동'}</h3>
                <div className="space-y-4">
                  <select value={contentForm.menuId} onChange={e=>setContentForm({...contentForm, menuId: e.target.value})} className="w-full p-3 rounded-xl border-2 border-slate-200 font-bold">
                    <option value="">카테고리 선택</option>
                    {menus.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <input type="text" value={contentForm.url} onChange={e=>setContentForm({...contentForm, url: e.target.value})} placeholder="URL 입력 (/quiz-1)" className="w-full p-3 rounded-xl border-2 border-slate-200 font-mono text-sm font-bold" />
                  <input type="text" value={contentForm.title} onChange={e=>setContentForm({...contentForm, title: e.target.value})} placeholder="콘텐츠 제목" className="w-full p-3 rounded-xl border-2 border-slate-200 font-black" />
                  <textarea value={contentForm.desc} onChange={e=>setContentForm({...contentForm, desc: e.target.value})} placeholder="설명" className="w-full p-4 rounded-xl border-2 border-slate-200 h-28 resize-none font-medium" />
                  <div className="flex gap-2">
                    <button onClick={handleSaveContent} className="flex-1 bg-indigo-600 text-white font-black py-4 rounded-xl">저장하기</button>
                    {editingContentId && <button onClick={handleCancelContentEdit} className="bg-slate-200 text-slate-700 font-black py-4 px-6 rounded-xl">취소</button>}
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 max-h-[700px] overflow-y-auto">
                <h3 className="text-lg font-black text-slate-700 mb-4">목록 (클릭하여 수정)</h3>
                <div className="space-y-4">
                  {contents.map(c => (
                    <div key={c.id} onClick={() => handleEditContentStart(c)} className={`bg-white p-5 rounded-2xl border relative cursor-pointer ${editingContentId === c.id ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300'}`}>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteContent(c.id); }} className="absolute top-4 right-4 text-xs font-bold bg-rose-50 text-rose-500 px-3 py-1.5 rounded-lg hover:bg-rose-500 hover:text-white">삭제</button>
                      <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">{menus.find(m=>m.id === c.menuId)?.name || '미분류'}</span>
                      <h4 className="text-base font-black text-slate-800 mt-1">{c.title}</h4>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">{c.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="max-w-6xl animate-in fade-in duration-300">
            <h1 className="text-2xl md:text-3xl font-black text-slate-800 mb-6 flex justify-between items-center">
              <span>👥 사용자 계정 원격 통제</span>
              <button onClick={handleMigrateRoles} className="bg-amber-500 hover:bg-amber-600 text-white text-xs md:text-sm font-black px-4 py-2 rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-2">
                <span>🛠️</span> <span className="hidden md:inline">기존 '학생' 일괄 업데이트</span><span className="md:hidden">데이터 변환</span>
              </button>
            </h1>

            <div className="flex gap-2 mb-6 border-b border-slate-200 pb-4">
              <button onClick={() => setUserActiveTab('pending')} className={`px-6 py-2.5 rounded-full font-black text-sm ${userActiveTab === 'pending' ? 'bg-rose-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-100'}`}>
                가입 승인 대기 {pendingUsers.length > 0 && <span className="bg-white text-rose-600 px-2 ml-1 rounded-full text-xs">{pendingUsers.length}</span>}
              </button>
              <button onClick={() => setUserActiveTab('approved')} className={`px-6 py-2.5 rounded-full font-black text-sm ${userActiveTab === 'approved' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-100'}`}>
                정식 회원 명부 ({approvedUsers.length})
              </button>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <input type="text" placeholder="이름/아이디 검색" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} className="p-2 rounded-xl border border-slate-300 font-bold text-xs w-64 outline-none focus:border-indigo-500" />
                {userActiveTab === 'pending' && selectedIds.length > 0 && (
                  <button onClick={handleBulkApprove} className="bg-emerald-500 text-white text-xs font-black px-4 py-2 rounded-lg">✔ 일괄 승인 ({selectedIds.length})</button>
                )}
              </div>

              <div className="overflow-x-auto w-full custom-scrollbar">
                <table className="w-full text-left text-sm font-bold text-slate-700 min-w-[900px]">
                  <thead className="bg-slate-100 border-b border-slate-200">
                    <tr>
                      {userActiveTab === 'pending' && <th className="p-4 w-10 text-center"><input type="checkbox" checked={pendingUsers.length > 0 && selectedIds.length === pendingUsers.length} onChange={handleSelectAllPending} className="w-4 h-4 accent-indigo-500" /></th>}
                      <th className="p-4 w-24 text-center">신분</th>
                      <th className="p-4 w-32">기본 정보</th>
                      <th className="p-4 w-48">비상 연락망</th>
                      <th className="p-4 w-32">소속 정보</th>
                      {userActiveTab === 'approved' && <th className="p-4 w-24">임시 비번</th>}
                      <th className="p-4 text-center">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? <tr><td colSpan={7} className="p-10 text-center text-slate-400">불러오는 중...</td></tr> : (userActiveTab === 'pending' ? pendingUsers : approvedUsers).length === 0 ? <tr><td colSpan={7} className="p-10 text-center text-slate-400">회원이 없습니다.</td></tr> : (
                      (userActiveTab === 'pending' ? pendingUsers : approvedUsers).map((u: any) => (
                        <tr key={u.uid} className="hover:bg-slate-50 transition-colors">
                          {userActiveTab === 'pending' && <td className="p-4 text-center"><input type="checkbox" checked={selectedIds.includes(u.uid)} onChange={() => handleToggleSelect(u.uid)} className="w-4 h-4 accent-indigo-500" /></td>}
                          <td className="p-4 text-center">
                            <span className={`px-2.5 py-1 rounded text-xs block text-center ${u.role === '학급 학생' ? 'bg-blue-100 text-blue-700' : u.role === '일반 학생' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="text-slate-900 text-base">{u.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{u.username || u.email}</div>
                          </td>
                          <td className="p-4">
                            {u.role.includes('학생') ? (
                              <div className="text-[11px] flex flex-col gap-1 text-slate-500">
                                <span>🎂 {u.birthDate || '미입력'}</span>
                                <span className={u.studentPhone ? "text-slate-700" : "text-slate-400"}>📞 학생: {u.studentPhone || '없음'}</span>
                                <span className="text-indigo-600 font-black">👨‍👩‍👦 학부모({u.parentName || '?'}): {u.parentPhone || '없음'}</span>
                              </div>
                            ) : u.role === '학부모' ? (
                              <div className="text-[11px] text-slate-500">👦 자녀: <strong className="text-slate-700">{u.childName || '미입력'}</strong></div>
                            ) : (<span className="text-slate-300 text-xs">-</span>)}
                          </td>
                          <td className="p-4">
                            <div className="text-xs text-slate-600 truncate max-w-[150px]" title={u.school}>{u.school}</div>
                            {u.grade && <div className="text-[10px] text-slate-400">{u.grade}학년 {u.classNum}반</div>}
                          </td>
                          {userActiveTab === 'approved' && <td className="p-4 font-mono text-emerald-500 tracking-widest">{u.plainPassword || '••••'}</td>}
                          <td className="p-4 text-center space-x-1 whitespace-nowrap">
                            {userActiveTab === 'pending' ? (
                              <button onClick={() => handleApproveSingle(u.uid)} className="text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded hover:bg-emerald-500 hover:text-white transition-all text-xs">승인</button>
                            ) : (
                              <button onClick={() => handleResetPassword(u.uid, u.name)} className="text-sky-600 bg-sky-50 px-3 py-1.5 rounded hover:bg-sky-500 hover:text-white transition-all text-xs">비번수정</button>
                            )}
                            <button onClick={()=>handleDeleteUser(u.uid, u.name)} className="text-rose-500 bg-rose-50 px-3 py-1.5 rounded hover:bg-rose-500 hover:text-white transition-all text-xs">삭제</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-5xl space-y-8 animate-in fade-in duration-300">
            <div><h1 className="text-3xl font-black text-slate-800 mb-2">🎨 홈화면 디자인 테마 설정</h1></div>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-base font-black text-slate-800 mb-3">🖥️ 포털 대문 타이틀 텍스트 설정</h3>
              <div className="flex gap-4">
                <input type="text" value={localTitle} onChange={e => setLocalTitle(e.target.value)} className="flex-1 p-3 bg-slate-50 border-2 border-slate-200 rounded-xl font-black text-xl outline-none focus:border-indigo-500" />
                <button onClick={() => handleSaveSettings({ title: localTitle })} className="bg-indigo-600 text-white px-8 rounded-xl font-black">적용</button>
              </div>
            </div>
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><span>📐</span> 레이아웃 선택</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {[{ id: 'card', icon: '💡' }, { id: 'index', icon: '📑' }, { id: 'badge', icon: '🚀' }, { id: 'focus', icon: '🎯' }].map(item => (
                  <button key={item.id} onClick={() => handleSaveSettings({ layout: item.id })} className={`p-5 rounded-2xl border-4 text-center ${siteSettings.layout === item.id ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
                    <div className="text-3xl mb-2">{item.icon}</div>
                    <h4 className="font-black text-sm uppercase">{item.id}</h4>
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="text-lg font-black text-slate-800 mb-4">🎨 컬러 조합</h3>
              <div className="flex gap-4">
                {[{ id: 'indigo', c: 'bg-indigo-600' }, { id: 'emerald', c: 'bg-emerald-600' }, { id: 'rose', c: 'bg-rose-600' }, { id: 'amber', c: 'bg-amber-500' }].map(c => (
                  <button key={c.id} onClick={() => handleSaveSettings({ color: c.id })} className={`flex items-center gap-2 p-3 rounded-xl border-2 ${siteSettings.color === c.id ? 'border-slate-900 bg-slate-50 font-black' : 'border-slate-200 text-slate-500'}`}>
                    <span className={`w-4 h-4 rounded-full ${c.c}`}></span>{c.id}
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