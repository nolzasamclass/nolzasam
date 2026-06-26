// src/App.tsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore'; 
import { Toaster } from 'react-hot-toast';

import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import AdminDashboard from './pages/AdminDashboard';
import ProtectedRoute from './pages/ProtectedRoute';
import TypingGame from './pages/TypingGame';
import PolygonLearning from './pages/PolygonLearning';
import AreaLearning from './pages/AreaLearning';
import OnlineAssessment from './pages/OnlineAssessment';
import AdminAssessment from './pages/AdminAssessment';
import PixyCubeStage1 from './pages/PixyCubeStage1'
import GeometryMaster from './pages/GeometryMaster';
import GeometryDraw from './pages/GeometryDraw';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | undefined;
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        unsubscribeSnapshot = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
          if (docSnap.exists()) setUser({ ...currentUser, ...docSnap.data() });
          else setUser(currentUser);
          setLoading(false);
        });
      } else {
        setUser(null); setLoading(false);
        if (unsubscribeSnapshot) { unsubscribeSnapshot(); unsubscribeSnapshot = undefined; }
      }
    });
    return () => { unsubscribeAuth(); if (unsubscribeSnapshot) unsubscribeSnapshot(); };
  }, []);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white text-xl font-bold">시스템 부팅 중... 🚀</div>;

  return (
    <>
      <Toaster position="top-center" toastOptions={{ duration: 3000, style: { borderRadius: '16px', fontWeight: 'bold' } }} />
      <Router>
        <Routes>
          <Route path="/" element={<Home user={user} />} />
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
          <Route path="/signup" element={user ? <Navigate to="/" /> : <Signup />} />
          <Route path="/admin" element={<ProtectedRoute user={user} adminOnly={true}><AdminDashboard user={user} /></ProtectedRoute>} />
          <Route path="/typing-game" element={<ProtectedRoute user={user}><TypingGame user={user} /></ProtectedRoute>} />
          <Route path="/polygon" element={<ProtectedRoute user={user}><PolygonLearning /></ProtectedRoute>} />
          <Route path="/area" element={<ProtectedRoute user={user}><AreaLearning /></ProtectedRoute>} />
          <Route path="/online-assessment" element={<ProtectedRoute user={user}><OnlineAssessment user={user} /></ProtectedRoute>} />
          <Route path="/admin/assessment" element={<ProtectedRoute user={user} adminOnly={true}><AdminAssessment user={user} /></ProtectedRoute>} />
          <Route path="/pixy-stage1" element={<ProtectedRoute user={user}><PixyCubeStage1 /></ProtectedRoute>} />
          <Route path="/geometry-master" element={<ProtectedRoute user={user}><GeometryMaster /></ProtectedRoute>} />
          <Route path="/geometry-draw" element={<GeometryDraw />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Router>
    </>
  );
}