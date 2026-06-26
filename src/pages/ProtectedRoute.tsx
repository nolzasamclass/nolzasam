// src/pages/ProtectedRoute.tsx
import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: ReactNode;
  user: any;
  adminOnly?: boolean;
}

export default function ProtectedRoute({ children, user, adminOnly = false }: ProtectedRouteProps) {
  // 1. 일반 로그인 세션 검증
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 2. 최고 관리자 권한 도달성 검증
 if (adminOnly) {
  const isAdmin = user.role === 'admin';
  if (!isAdmin) {
    // 렌더링 중단을 막기 위해 alert 대신 즉시 튕겨내기
    return (
      <>
        {/* 아주 짧은 순간 보일 수 있으니 Toast 등으로 대체해도 좋습니다 */}
        <Navigate to="/" replace />
      </>
    );
  }
}
  return <>{children}</>;
}