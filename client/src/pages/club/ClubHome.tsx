import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useMyClub } from '../../hooks/useMyClub';
import { ClubBrowse } from './ClubBrowse';
import { ClubMemberView } from './ClubMemberView';

// Точка входа «Клуб» (/club): ветвится по состоянию игрока.
// Владелец → /my-club (полная админка). Участник → просмотр состава + выход.
// Нет клуба → список открытых клубов / создать / статус заявки.
export const ClubHome = () => {
  const user = useAuthStore((s) => s.user);
  const { myClub, initialized, refresh } = useMyClub();

  if (!initialized) return null;
  if (myClub && user && myClub.ownerId === user.id) return <Navigate to="/my-club" replace />;
  if (myClub) return <ClubMemberView club={myClub} onRefresh={refresh} />;
  return <ClubBrowse />;
};
