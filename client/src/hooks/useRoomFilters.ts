import { useMemo, useState } from 'react';
import type { RoomInfo } from '@poker-room/shared';

export type FormatTab = 'all' | 'nlh' | 'shortdeck';

// Фильтры лобби (поиск/мои/ожидающие/скрыть недоступные/формат) + производные счётчики.
// Вынесено из Lobby (ROADMAP §9.3-E).
export function useRoomFilters(rooms: RoomInfo[], myId: string | null) {
  const [search, setSearch] = useState('');
  const [myOnly, setMyOnly] = useState(false);
  const [hideUnavailable, setHideUnavailable] = useState(false);
  const [waitingOnly, setWaitingOnly] = useState(false);
  // Таб формата игры. Активен NLH; Шорт-дэк — disabled «скоро».
  const [formatTab, setFormatTab] = useState<FormatTab>('all');

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
      // formatTab: 'all' и 'nlh' пропускают всё (у нас только NLH-столы).
      // 'shortdeck' пока не имеет столов — фильтр отсечёт всё, но кнопка disabled.
      if (formatTab !== 'all' && formatTab !== 'nlh') return false;
      return true;
    });
  }, [rooms, search, myOnly, hideUnavailable, waitingOnly, formatTab, myId]);

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
    filtered, myRoomsCount, onlineCount, tableCount,
  };
}
