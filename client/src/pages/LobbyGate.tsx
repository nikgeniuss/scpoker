import { useEffect } from 'react';
import { useLobbyDesignStore } from '../store/lobbyDesignStore';
import { Lobby } from './Lobby';
import { LobbyRedesign } from './LobbyRedesign';

// Какую версию /lobby показать — переключается админом (вкладка «Настройки» → «Дизайн лобби»).
// По умолчанию редизайн (server/data/lobbyDesign.json); классика остаётся доступной как fallback.
export const LobbyGate = () => {
  const design = useLobbyDesignStore((s) => s.design);
  const loadPublic = useLobbyDesignStore((s) => s.loadPublic);

  useEffect(() => {
    loadPublic();
  }, [loadPublic]);

  return design === 'classic' ? <Lobby /> : <LobbyRedesign />;
};
