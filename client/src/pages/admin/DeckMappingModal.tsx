import { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useAdminApi } from '../../hooks/useAdminApi';
import { BASE_URL } from '../../config/api';
import type { DeckInfo } from '../../store/decksStore';

// === Модалка ручного mapping: сетка 4×13 + список нераспознанных файлов ===
// Вынесено из Admin.tsx (ROADMAP §9.3-E).

const RANKS_ORDER: Array<'2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A'> = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
];
const SUITS_ORDER: Array<{ key: 'S' | 'H' | 'D' | 'C'; label: string; color: string }> = [
  { key: 'S', label: '♠ Пики', color: 'text-white' },
  { key: 'H', label: '♥ Червы', color: 'text-red-400' },
  { key: 'D', label: '♦ Бубны', color: 'text-red-400' },
  { key: 'C', label: '♣ Трефы', color: 'text-white' },
];

const cardKeyOf = (rank: string, suitLetter: string) => rank + suitLetter;

// Массив всех 52 ключей в порядке масть→ранг — для usedFilesExcept и подсчётов
const allKeysFlat: string[] = SUITS_ORDER.flatMap((s) => RANKS_ORDER.map((r) => r + s.key));

interface DeckMappingModalProps {
  deck: DeckInfo;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export const DeckMappingModal = ({ deck, onClose, onSaved }: DeckMappingModalProps) => {
  const { token } = useAuthStore();
  const api = useAdminApi(token);
  // Начальный draft = текущий manualMap (только override'ы; пустой ключ = «использовать авто»)
  const [draft, setDraft] = useState<Record<string, string>>({ ...deck.manualMap });
  const [saving, setSaving] = useState(false);

  // Текущее значение слота: manual override → auto. Используется для отображения.
  const effective = (key: string): string => {
    if (draft[key] !== undefined) return draft[key]; // даже пустая строка = override на «нет файла»
    return deck.autoMap[key] || '';
  };

  // Какие файлы УЖЕ использованы в effective-mapping (исключая текущий ключ)
  const usedFilesExcept = (currentKey: string): Set<string> => {
    const used = new Set<string>();
    for (const k of allKeysFlat) {
      if (k === currentKey) continue;
      const f = effective(k);
      if (f) used.add(f);
    }
    return used;
  };

  const setSlot = (key: string, filename: string) => {
    setDraft((prev) => ({ ...prev, [key]: filename }));
  };

  const resetSlot = (key: string) => {
    setDraft((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const resetAllOverrides = () => {
    setDraft({});
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/admin/decks/' + encodeURIComponent(deck.id) + '/mapping', { manualMap: draft }, 'Ошибка сохранения');
      toast.success('Mapping сохранён');
      await onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Подсчёт «потерянных» файлов (есть в колоде, но не назначены никуда)
  const usedNow = new Set<string>();
  for (const k of allKeysFlat) {
    const f = effective(k);
    if (f) usedNow.add(f);
  }
  const orphanFiles = deck.files.filter((f) => !usedNow.has(f.filename));

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-2 md:inset-8 z-[70] bg-gray-900 rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-white">Mapping колоды «{deck.label}»</h3>
            <p className="text-xs text-gray-400">
              {deck.files.length} файл(ов), {52 - deck.missingCards.length}/52 карт назначено
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetAllOverrides}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white"
              title="Удалить все ручные override'ы — вернуться к авто"
            >
              Сбросить override
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="text-sm px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold"
            >
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 text-white"
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 md:p-4">
          {/* Сетка 4 ряда × 13 колонок. На mobile — горизонтальный скролл. */}
          <div className="min-w-[900px] md:min-w-0">
            <div className="grid gap-2 text-xs" style={{ gridTemplateColumns: '80px repeat(13, minmax(70px, 1fr))' }}>
              {/* Шапка с рангами */}
              <div />
              {RANKS_ORDER.map((r) => (
                <div key={r} className="text-center text-gray-400 font-semibold">
                  {r}
                </div>
              ))}
              {/* Строки по мастям */}
              {SUITS_ORDER.map((s) => (
                <div key={s.key} className="contents">
                  <div className={'flex items-center font-semibold ' + s.color}>{s.label}</div>
                  {RANKS_ORDER.map((r) => {
                    const key = cardKeyOf(r, s.key);
                    const current = effective(key);
                    const isOverridden = draft[key] !== undefined;
                    return (
                      <SlotCell
                        key={key}
                        cardKey={key}
                        deckId={deck.id}
                        files={deck.files}
                        currentFile={current}
                        isOverridden={isOverridden}
                        usedElsewhere={usedFilesExcept(key)}
                        onSet={(fname) => setSlot(key, fname)}
                        onReset={() => resetSlot(key)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {orphanFiles.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-semibold text-white mb-2">
                Файлы не назначены ни одной карте ({orphanFiles.length}):
              </h4>
              <div className="flex flex-wrap gap-2">
                {orphanFiles.map((f) => (
                  <div
                    key={f.filename}
                    className="flex items-center gap-2 bg-gray-800 px-2 py-1 rounded-lg text-xs text-gray-300"
                    title={f.filename}
                  >
                    <img
                      src={BASE_URL + f.url}
                      alt={f.filename}
                      className="w-6 h-8 object-cover rounded"
                      draggable={false}
                    />
                    <span className="truncate max-w-[140px]">{f.filename}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Эти файлы доступны в выпадающих списках слотов выше — назначьте вручную, куда нужно.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
};

interface SlotCellProps {
  cardKey: string;
  deckId: string;
  files: DeckInfo['files'];
  currentFile: string;
  isOverridden: boolean;
  usedElsewhere: Set<string>;
  onSet: (filename: string) => void;
  onReset: () => void;
}

const SlotCell = ({ cardKey, deckId, files, currentFile, isOverridden, usedElsewhere, onSet, onReset }: SlotCellProps) => {
  return (
    <div
      className={
        'rounded-lg border p-1 flex flex-col items-center gap-1 ' +
        (currentFile ? 'border-gray-700' : 'border-red-500/40 bg-red-950/20') +
        (isOverridden ? ' ring-2 ring-emerald-500/60' : '')
      }
    >
      <div className="w-12 h-16 bg-gray-800 rounded flex items-center justify-center overflow-hidden">
        {currentFile ? (
          <img
            src={BASE_URL + '/decks/' + deckId + '/' + encodeURIComponent(currentFile)}
            alt={cardKey}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <span className="text-red-400 text-xs">нет</span>
        )}
      </div>
      <select
        value={currentFile}
        onChange={(e) => {
          if (e.target.value === '') onReset();
          else onSet(e.target.value);
        }}
        className="w-full text-[10px] bg-gray-800 text-white rounded px-1 py-0.5 border border-gray-700"
        title={currentFile || '(не назначено)'}
      >
        <option value="">(не назначено)</option>
        {files.map((f) => {
          const used = usedElsewhere.has(f.filename);
          return (
            <option key={f.filename} value={f.filename}>
              {used ? '⚠ ' : ''}
              {f.filename}
            </option>
          );
        })}
      </select>
      {isOverridden && (
        <button
          onClick={onReset}
          className="text-[10px] text-emerald-400 hover:text-emerald-300"
          title="Удалить override — вернуться к auto-mapping"
        >
          ⤺ auto
        </button>
      )}
    </div>
  );
};
