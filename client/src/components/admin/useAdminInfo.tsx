import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ADMIN_INFO } from '../../config/adminInfo';
import { InfoSheet } from '../lobby/createControls';

// Обвязка подсказок «i» для вкладок админки: состояние + готовая шторка. Вкладок девять, и
// копировать в каждую одинаковые useState/AnimatePresence/InfoSheet смысла нет (§0.10).
//
// Применение: const { openInfo, infoSheet } = useAdminInfo();
//   <InfoButton onClick={openInfo('settings.rakePercent')} /> ... {infoSheet}
// Ключ, которого нет в ADMIN_INFO, шторку не откроет — на это есть guard-тест adminInfo.test.ts.
export function useAdminInfo() {
  const [infoKey, setInfoKey] = useState<string | null>(null);
  const openInfo = (key: string) => () => setInfoKey(key);
  const entry = infoKey ? ADMIN_INFO[infoKey] : undefined;

  const infoSheet = (
    <AnimatePresence>
      {entry && (
        <InfoSheet title={entry.title} onClose={() => setInfoKey(null)}>
          {entry.lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </InfoSheet>
      )}
    </AnimatePresence>
  );

  return { openInfo, infoSheet };
}
