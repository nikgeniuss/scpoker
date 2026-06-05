import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

interface GuestOnlyProps {
  children: ReactNode;
}

// Зеркало RequireAuth: для /login и /register. Залогиненного юзера отправляем на главную.
export const GuestOnly = ({ children }: GuestOnlyProps) => {
  const token = useAuthStore((s) => s.token);

  if (token) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
