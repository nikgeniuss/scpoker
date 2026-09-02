import type { ReactNode } from 'react';
import { useAppThemeStore } from '../../store/appThemeStore';

interface AppThemeGateProps {
  classic: ReactNode;
  ak: ReactNode;
}

// Универсальный гейт «какую версию этой страницы показать» по appThemeStore — используется на
// роутах, где AK-версия структурно отличается от текущей (Wallet/Profile). Сама загрузка темы —
// в Layout.tsx (mount-эффект, loadPublic), тут только чтение уже загруженного стейта, как в
// LobbyGate.tsx.
export const AppThemeGate = ({ classic, ak }: AppThemeGateProps) => {
  const theme = useAppThemeStore((s) => s.theme);
  return theme === 'ak' ? <>{ak}</> : <>{classic}</>;
};
