import { useEffect } from 'react';
import { useLobbyDesignStore } from '../store/lobbyDesignStore';
import { useAppThemeStore } from '../store/appThemeStore';
import { Lobby } from './Lobby';
import { LobbyRedesign } from './LobbyRedesign';
import { AkLobby } from './AkLobby';

// Какую версию /lobby показать. Сначала общий визуальный скин приложения (appThemeStore,
// переключатель в SettingsTab → «Визуальный скин приложения») — если ak, lobbyDesign (classic/
// redesign) не смотрим, он относится только к poker-hub скину. Внутри poker-hub — переключается
// админом отдельно (вкладка «Настройки» → «Дизайн лобби»); по умолчанию редизайн
// (server/data/lobbyDesign.json), классика остаётся доступной как fallback.
export const LobbyGate = () => {
  const appTheme = useAppThemeStore((s) => s.theme);
  const design = useLobbyDesignStore((s) => s.design);
  const loaded = useLobbyDesignStore((s) => s.loaded);
  const loadPublic = useLobbyDesignStore((s) => s.loadPublic);

  useEffect(() => {
    loadPublic();
  }, [loadPublic]);

  if (appTheme === 'ak') return <AkLobby />;
  // Пока реальная настройка (classic/redesign) не подгружена — не рендерим ничего,
  // иначе на долю секунды виден дефолт стора (redesign), даже если выбрана классика.
  if (!loaded) return null;
  return design === 'classic' ? <Lobby /> : <LobbyRedesign />;
};
