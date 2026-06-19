import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useClubStore } from '../../store/clubStore';

// Гейт маршрута /my-club: пропускает только владельца клуба.
// Читает из Zustand-стора (данные загружены Layout при монте).
// Пока не инициализировано (загрузка) — рендерит null (не флэшит).
export const RequireClubOwner = ({ children }: { children: ReactNode }) => {
  const user = useAuthStore((s) => s.user);
  const { myClub, initialized } = useClubStore();

  if (!user) return <Navigate to="/" replace />;
  if (!initialized) return null;
  if (!myClub || myClub.ownerId !== user.id) return <Navigate to="/" replace />;
  return <>{children}</>;
};
