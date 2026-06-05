import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

interface RequireAdminProps {
  children: ReactNode;
}

// Гейт роута только для админов. Не-админ редиректится на '/' ДО рендера children —
// а значит и ДО загрузки lazy-чанка админки (обычный игрок этот код вообще не скачивает).
// Это лишь UX/обфускация: реальная защита — серверный adminMiddleware (JWT role) на /api/admin/*.
export const RequireAdmin = ({ children }: RequireAdminProps) => {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};
