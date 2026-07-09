// src/pages/Home.tsx
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, orderBy, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import toast from 'react-hot-toast';

const EDU_ICONS = ['💡', '🚀', '🔬', '🧩', '📝', '🎨', '⚙️', '🧭', '📚', '🎯'];

export default function Home({ user }: { user: any }) {
  const navigate = useNavigate();
  const [menus, setMenus] = useState<any[]>([]);
  const [contents, setContents] = useState<any[]>([]);
  const [selectedMenu, setSelectedMenu] = useState<string>('all');
  
  const [siteSettings, setSiteSettings] = useState({
    layout: 'card', 
    color: 'indigo', 
    title: '놀자샘 스스로 학습 놀이터'
  });

  // 💡 DB에서 가져온 권한 데이터를 안전하게 배열로 변환
  const getRolesArray = (roles: any): string[] => {
    if (!roles || roles === 'all') return [];
    if (Array.isArray(roles)) return roles;
    if (typeof roles === 'string') return [roles];
    return [];
  };

  useEffect(() => {
    fetchPortalData();
    const unsubSettings = onSnapshot(doc(db, 'site_settings', 'main'), (snapshot) => {
      if (snapshot.exists()) setSiteSettings(snapshot.data() as any);
    });
    return () => unsubSettings();
  }, []);

  const fetchPortalData = async () => {
    try {
      const menuSnap = await getDocs(query(collection(db, 'site_menus'), orderBy('createdAt', 'asc')));
      setMenus(menuSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const contentSnap = await getDocs(query(collection(db, 'site_contents'), orderBy('createdAt', 'desc')));
      setContents(contentSnap.docs.map((d, i) => ({ 
        id: d.id, 
        icon: EDU_ICONS[i % EDU_ICONS.length],
        ...d.data() 
      })));
    } catch (error) { console.error("포털 연동 에러:", error); }
  };

  const handleLogout = async () => {
    await signOut(auth);
    toast.success("로그아웃 되었습니다. 👋");
  };

  // 🌟 핵심 필터: 다중 선택(배열) 권한 검증 로직 완벽 적용!
  const visibleMenus = menus.filter(m => {
    const roles = getRolesArray(m.allowedRoles);
    
    // 1. 전체 공개 (권한 배열이 비어있음)
    if (roles.length === 0) return true;
    
    // 2. 권한이 필요한데 로그인을 안 했다면 (차단)
    if (!user) return false;
    
    // 3. 관리자(선생님)는 무조건 모든 메뉴 열람 가능 (통과)
    if (user.role === 'admin' || user.role === '교사') return true;
    
    // 4. 메뉴의 허용 역할 배열에 '현재 유저의 역할'이 포함되어 있는지 확인 (통과)
    return roles.includes(user.role);
  });

  const visibleMenuIds = visibleMenus.map(m => m.id);
  
  const filteredContents = contents.filter(c => {
    if (selectedMenu === 'all') return visibleMenuIds.includes(c.menuId);
    return c.menuId === selectedMenu;
  });

  const handleMenuClick = (menuId: string) => {
    setSelectedMenu(menuId);
  };

  const handleContentClick = (url: string) => {
    if (!user) {
      toast.error("🔒 이 콘텐츠를 실행하려면 먼저 로그인 또는 회원가입을 해주세요!");
      navigate('/login');
      return;
    }
    window.location.href = url;
  };

  const getColorClass = (type: 'bg' | 'text' | 'border' | 'btn' | 'light') => {
    const c = siteSettings.color;
    if (type === 'bg') return c === 'emerald' ? 'bg-emerald-600' : c === 'rose' ? 'bg-rose-600' : c === 'amber' ? 'bg-amber-500' : 'bg-indigo-600';
    if (type === 'text') return c === 'emerald' ? 'text-emerald-600' : c === 'rose' ? 'text-rose-600' : c === 'amber' ? 'text-amber-500' : 'text-indigo-600';
    if (type === 'border') return c === 'emerald' ? 'border-emerald-600' : c === 'rose' ? 'border-rose-600' : c === 'amber' ? 'border-amber-500' : 'border-indigo-600';
    if (type === 'btn') return c === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-500' : c === 'rose' ? 'bg-rose-600 hover:bg-rose-500' : c === 'amber' ? 'bg-amber-500 hover:bg-amber-400' : 'bg-indigo-600 hover:bg-indigo-500';
    if (type === 'light') return c === 'emerald' ? 'bg-emerald-50 text-emerald-600' : c === 'rose' ? 'bg-rose-50 text-rose-600' : c === 'amber' ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600';
    return '';
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col relative text-slate-800">
      
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40 h-[65px]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center h-full">
          <Link to="/" onClick={() => handleMenuClick('all')} className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <span className={getColorClass('text')}>🏫</span> {siteSettings.title}
          </Link>
          <div className="flex gap-4 items-center font-bold text-sm">
            {user ? (
              <>
                <span className="text-slate-500 hidden sm:inline-block">[{user.role || '회원'}] {user.name}님</span>
                {user.role === 'admin' && (
                  <Link to="/admin" className={`px-3 py-1.5 text-white rounded-lg transition-colors shadow-sm ${getColorClass('btn')}`}>
                    ⚙️ 관리자
                  </Link>
                )}
                <button onClick={handleLogout} className="text-slate-400 hover:text-slate-700 transition-colors">로그아웃</button>
              </>
            ) : (
              <>
                <Link to="/login" className="px-4 py-2 text-slate-500 hover:text-slate-800 transition-colors">로그인</Link>
                <Link to="/signup" className={`px-4 py-2 text-white rounded-lg transition-all shadow-sm ${getColorClass('btn')}`}>회원가입</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="bg-slate-50 border-b border-slate-200 sticky top-[65px] z-30 h-[55px]">
        <div className="max-w-6xl mx-auto px-6 flex gap-8 overflow-x-auto custom-scrollbar h-full">
          <button 
            onClick={() => handleMenuClick('all')}
            className={`py-4 font-black whitespace-nowrap transition-all ${selectedMenu === 'all' ? `border-b-4 text-slate-900 ${getColorClass('border')}` : 'border-b-4 border-transparent text-slate-400 hover:text-slate-700'}`}
          >
            전체 모아보기
          </button>
          
          {visibleMenus.map(m => {
            const hasRestriction = getRolesArray(m.allowedRoles).length > 0;
            return (
              <button 
                key={m.id}
                onClick={() => handleMenuClick(m.id)}
                className={`py-4 font-black whitespace-nowrap transition-all flex items-center gap-1 ${selectedMenu === m.id ? `border-b-4 text-slate-900 ${getColorClass('border')}` : 'border-b-4 border-transparent text-slate-400 hover:text-slate-700'}`}
              >
                {m.name}
                {hasRestriction && <span className="text-[9px] bg-slate-200 text-slate-500 px-1.5 rounded-sm">🔒</span>}
              </button>
            )
          })}
        </div>
      </div>

      <main className="flex-grow max-w-6xl mx-auto w-full px-6 py-10">
        
        {filteredContents.length === 0 ? (
          <div className="py-24 text-center bg-white rounded-3xl border border-slate-200 shadow-sm animate-in fade-in">
            <span className="text-5xl mb-4 block opacity-30">📭</span>
            <h2 className="text-lg font-bold text-slate-500">
              {selectedMenu === 'all' 
                ? "현재 열람 가능한 학습 콘텐츠가 없습니다." 
                : "이 카테고리에는 아직 배포된 콘텐츠가 없습니다."}
            </h2>
          </div>
        ) : (
          <>
            {siteSettings.layout === 'card' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
                {filteredContents.map(c => (
                  <div key={c.id} onClick={() => handleContentClick(c.url)} className="bg-white rounded-3xl p-8 border-2 border-slate-100 shadow-sm hover:border-slate-300 hover:shadow-lg transition-all cursor-pointer flex flex-col h-full group">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-6 transition-transform group-hover:scale-110 ${getColorClass('light')}`}>
                      {c.icon}
                    </div>
                    <h3 className="text-xl font-black text-slate-800 line-clamp-1 mb-2 group-hover:text-slate-600 transition-colors">{c.title}</h3>
                    <p className="text-sm text-slate-500 font-medium line-clamp-2 leading-relaxed flex-1">{c.desc}</p>
                  </div>
                ))}
              </div>
            )}

            {siteSettings.layout === 'index' && (
              <div className="space-y-3 max-w-4xl mx-auto animate-in fade-in duration-300">
                {filteredContents.map(c => (
                  <div key={c.id} onClick={() => handleContentClick(c.url)} className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-slate-400 hover:shadow-md cursor-pointer transition-all flex gap-5 items-center group">
                    <div className="w-14 h-14 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center text-2xl flex-shrink-0 group-hover:bg-slate-100 transition-colors">
                      {c.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-black text-slate-800 truncate group-hover:text-slate-600">{c.title}</h3>
                      <p className="text-sm text-slate-500 mt-0.5 truncate font-medium">{c.desc}</p>
                    </div>
                    <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full bg-slate-50 group-hover:bg-slate-200 transition-colors text-slate-400">
                      ➜
                    </div>
                  </div>
                ))}
              </div>
            )}

            {siteSettings.layout === 'badge' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-in fade-in duration-300">
                {filteredContents.map(c => (
                  <div key={c.id} onClick={() => handleContentClick(c.url)} className={`bg-white p-6 rounded-[2rem] border-2 hover:shadow-md cursor-pointer transition-all flex items-center gap-5 group hover:-translate-y-1 ${getColorClass('border')}`}>
                    <div className="text-4xl group-hover:scale-110 transition-transform origin-bottom">
                      {c.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xl font-black text-slate-800 truncate">{c.title}</h3>
                      <p className="text-sm text-slate-500 font-medium mt-1 truncate">{c.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {siteSettings.layout === 'focus' && (
              <div className="max-w-2xl mx-auto space-y-10 animate-in fade-in duration-300">
                {filteredContents.map(c => (
                  <div key={c.id} onClick={() => handleContentClick(c.url)} className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all cursor-pointer group p-10 text-center">
                    <div className="text-6xl mb-6 group-hover:scale-110 transition-transform duration-300 inline-block">{c.icon}</div>
                    <h3 className="text-3xl font-black text-slate-900 mb-4 group-hover:text-slate-700 transition-colors">{c.title}</h3>
                    <p className="text-base text-slate-500 font-medium leading-relaxed">{c.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}