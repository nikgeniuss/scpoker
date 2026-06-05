import { useEffect, useState } from 'react';
import { API_URL } from '../config/api';
import type { TimebankConfig, TimebankSettings as TimebankPublicConfig } from '@poker-room/shared';

// Загрузка глобального конфига таймбанка для формы создания стола.
// Возвращает локально-редактируемую копию (tbLocal) + признак, показывать ли секцию
// (per-table override разрешён глобально). Вынесено из CreateRoomModal (ROADMAP §9.3-E).
export function useTimebankConfig() {
  const [tbGlobal, setTbGlobal] = useState<TimebankPublicConfig | null>(null);
  const [tbLocal, setTbLocal] = useState<TimebankConfig | null>(null); // null до первого fetch'а

  useEffect(() => {
    fetch(API_URL + '/timebank-config')
      .then((r) => r.json())
      .then((d: TimebankPublicConfig) => {
        setTbGlobal(d);
        // Локальный стейт секции инициализируется значениями глобал
        setTbLocal({
          enabled: d.enabled,
          startSec: d.startSec,
          bonusSec: d.bonusSec,
          bonusEveryHands: d.bonusEveryHands,
          capSec: d.capSec,
        });
      })
      .catch(() => {
        // На молчаливой ошибке — просто не показываем секцию (override считаем false)
        setTbGlobal({
          enabled: false,
          startSec: 0,
          bonusSec: 0,
          bonusEveryHands: 10,
          capSec: 60,
          allowPerTableOverride: false,
        });
      });
  }, []);

  const showTimebank = !!(tbGlobal && tbGlobal.allowPerTableOverride && tbLocal);

  return { tbLocal, setTbLocal, showTimebank };
}
