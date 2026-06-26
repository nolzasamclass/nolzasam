// src/pages/Home.tsx
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, orderBy, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';

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
    } catch (error) {
      console.error("포털 연동 에러:", error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    alert("로그아웃 되었습니다. 👋");
  };

  const handleMenuClick = (menuId: string) => {
    setSelectedMenu(menuId);
  };

  // 💡 핵심 보안 로직: 비회원은 콘텐츠 클릭 시 로그인 창으로 튕겨냅니다.
  const handleContentClick = (url: string) => {
    if (!user) {
      alert("🔒 학습 콘텐츠를 실행하려면 먼저 로그인 또는 회원가입을 해주세요!");
      navigate('/login');
      return;
    }
    // 회원일 경우만 전체 화면으로 이동
    window.location.href = url;
  };

  const filteredContents = selectedMenu === 'all' 
    ? contents 
    : contents.filter(c => c.menuId === selectedMenu);

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
            전체
          </button>
          {menus.map(m => (
            <button 
              key={m.id}
              onClick={() => handleMenuClick(m.id)}
              className={`py-4 font-black whitespace-nowrap transition-all ${selectedMenu === m.id ? `border-b-4 text-slate-900 ${getColorClass('border')}` : 'border-b-4 border-transparent text-slate-400 hover:text-slate-700'}`}
            >
              {m.name}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-grow max-w-6xl mx-auto w-full px-6 py-10">
        
        {filteredContents.length === 0 ? (
          <div className="py-24 text-center bg-white rounded-3xl border border-slate-200 shadow-sm">
            <span className="text-5xl mb-4 block opacity-30">📚</span>
            <h2 className="text-lg font-bold text-slate-500">해당 카테고리에 할당된 학습 활동이 없습니다.</h2>
          </div>
        ) : (
          <>
            {/* 1) 스마트 아이콘 카드 (Card) */}
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

            {/* 2) 아카데믹 단원 목차 (Index) */}
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

            {/* 3) 미션 뱃지 보드 (Badge) */}
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

            {/* 4) 집중 플래시보드 (Focus) */}
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