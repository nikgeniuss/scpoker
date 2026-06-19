import { useMemo, useState } from 'react';
import type { RoomInfo } from '@poker-room/shared';

export type FormatTab = 'all' | 'nlh' | 'shortdeck';
export type BlindPreset = 'all' | 'micro' | 'low' | 'medium' | 'high';

// BB-диапазоны (центы): Микро ≤0.10, Низкие 0.25–1.00, Средние 1.25–10.00, Высокие >10.00
const BLIND_RANGES: Record<Exclude<BlindPreset, 'all'>, (bb: number) => boolean> = {
  micro:  (bb) => bb <= 10,
  low:    (bb) => bb > 10  && bb <= 100,
  medium: (bb) => bb > 100 && bb <= 1000,
  high:   (bb) => bb > 1000,
};

// Фильтры лобби (поиск/мои/ожидающие/скрыть недоступные/формат) + производные счётчики.
// Вынесено из Lobby (ROADMAP §9.3-E).
export function useRoomFilters(rooms: RoomInfo[], myId: string | null) {
  const [search, setSearch] = useState('');
  const [myOnly, setMyOnly] = useState(false);
  const [hideUnavailable, setHideUnavailable] = useState(false);
  const [waitingOnly, setWaitingOnly] = useState(false);
  // Таб формата игры. Активен NLH; Шорт-дэк — disabled «скоро».
  const [formatTab, setFormatTab] = useState<FormatTab>('all');
  const [blindPreset, setBlindPreset] = useState<BlindPreset>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q) && !r.createdBy.toLowerCase().includes(q)) {
        return false;
      }
      if (myOnly && (!myId || !r.playerIds.includes(myId))) return false;
      if (waitingOnly && r.status !== 'waiting') return false;
      if (hideUnavailable) {
        const isFull = r.currentPlayers >= r.maxPlayers;
        const isPlaying = r.status === 'playing';
        // Если я уже в комнате — оставляем (имеет смысл вернуться)
        const imIn = myId && r.playerIds.includes(myId);
        if ((isFull || isPlaying) && !imIn) return false;
      }
      // Фильтр по формату стола. 'all' — все; иначе сверяем r.format ('nlh' по умолчанию
      // для legacy-комнат без поля).
      if (formatTab !== 'all' && (r.format ?? 'nlh') !== formatTab) return false;
      if (blindPreset !== 'all' && !BLIND_RANGES[blindPreset](r.bigBlind)) return false;
      return true;
    });
  }, [rooms, search, myOnly, hideUnavailable, waitingOnly, formatTab, blindPreset, myId]);

  const myRoomsCount = useMemo(
    () => (myId ? rooms.filter((r) => r.playerIds.includes(myId)).length : 0),
    [rooms, myId],
  );

  // Счётчики для шапки: уникальные игроки онлайн (по всем комнатам) и количество столов
  const onlineCount = useMemo(() => {
    const set = new Set<string>();
    for (const r of rooms) for (const id of r.playerIds) set.add(id);
    return set.size;
  }, [rooms]);
  const tableCount = rooms.length;

  return {
    search, setSearch,
    myOnly, setMyOnly,
    hideUnavailable, setHideUnavailable,
    waitingOnly, setWaitingOnly,
    formatTab, setFormatTab,
    blindPreset, setBlindPreset,
    filtered, myRoomsCount, onlineCount, tableCount,
  };
}
