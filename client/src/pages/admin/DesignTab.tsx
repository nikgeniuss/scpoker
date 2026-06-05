import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import { useDecksStore } from '../../store/decksStore';
import type { DeckInfo } from '../../store/decksStore';
import { useAdminApi } from '../../hooks/useAdminApi';
import { BASE_URL } from '../../config/api';
import {
  DEFAULT_DESIGN,
  REGISTRATION_PRESETS,
  CARD_BACK_PRESETS,
  TABLE_FELT_PRESETS,
  CHIP_PRESETS,
  TABLE_THEME_PRESETS,
} from '../../config/design';
import type { DesignConfig, DesignPreset } from '../../config/design';
import { DeckMappingModal } from './DeckMappingModal';

// Вкладка «Дизайн»: пресеты регистрации/карт/стола/фишек + динамические колоды из images/.
// Состояние дизайна локально (как у других вкладок). Вынесено из Admin.tsx (ROADMAP §9.3-E).
export const DesignTab = () => {
  const { token } = useAuthStore();
  const api = useAdminApi(token);
  const [design, setDesign] = useState<DesignConfig>(DEFAULT_DESIGN);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    api
      .get<Partial<DesignConfig>>('/admin/design')
      .then((d) => setDesign({ ...DEFAULT_DESIGN, ...d }))
      .catch(() => {}); // как в оригинале — молча игнорируем ошибку загрузки
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const saveDesign = async () => {
    try {
      await api.put('/admin/design', design);
    } catch {
      // оригинал не показывал ошибку сохранения
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const update = (key: keyof DesignConfig, value: string) => {
    setDesign((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-10 pb-20">
      <DesignSection
        title="Страница регистрации"
        description="Стиль формы регистрации, который видят новые игроки"
        presets={REGISTRATION_PRESETS}
        selected={design.registrationStyle}
        onSelect={(id) => update('registrationStyle', id)}
      />

      <CardFaceDecksSection
        selected={design.cardFaceStyle}
        onSelect={(id) => update('cardFaceStyle', id)}
      />

      <DesignSection
        title="Рубашка карт"
        description="Дизайн обратной стороны карты"
        presets={CARD_BACK_PRESETS}
        selected={design.cardBackStyle}
        onSelect={(id) => update('cardBackStyle', id)}
      />

      <DesignSection
        title="Тема стола"
        description="Фирменный стиль: felt + rail + watermark + lighting (бандл)"
        presets={TABLE_THEME_PRESETS}
        selected={design.tableTheme}
        onSelect={(id) => update('tableTheme', id)}
      />

      <DesignSection
        title="Сукно стола (legacy)"
        description="Цвет игрового поля — перекрывается выбранной темой стола"
        presets={TABLE_FELT_PRESETS}
        selected={design.tableFelt}
        onSelect={(id) => update('tableFelt', id)}
      />

      <DesignSection
        title="Фишки"
        description="Стиль фишек на столе и в стеках игроков"
        presets={CHIP_PRESETS}
        selected={design.chipStyle}
        onSelect={(id) => update('chipStyle', id)}
      />

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={saveDesign}
        className={
          'px-8 py-3 rounded-xl font-bold text-black sticky bottom-4 ' +
          (saved ? 'bg-green-500' : 'bg-poker-gold')
        }
      >
        {saved ? '✓ Сохранено' : 'Сохранить дизайн'}
      </motion.button>
    </div>
  );
};

interface DesignSectionProps {
  title: string;
  description: string;
  presets: DesignPreset[];
  selected: string;
  onSelect: (id: string) => void;
}

const DesignSection = ({ title, description, presets, selected, onSelect }: DesignSectionProps) => {
  return (
    <section>
      <h3 className="text-xl font-bold text-white mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">{description}</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {presets.map((preset) => (
          <motion.div
            key={preset.id}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(preset.id)}
            className={
              'cursor-pointer rounded-xl overflow-hidden border-2 transition-all ' +
              (selected === preset.id
                ? 'border-poker-gold shadow-lg shadow-poker-gold/30'
                : 'border-transparent hover:border-gray-600')
            }
          >
            <div className={preset.preview + ' h-24'} />
            <div className="bg-gray-800 px-3 py-2 text-center text-white text-sm">
              {preset.label}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

// === Секция «Лицо карт»: динамический список колод из images/ ===

interface CardFaceDecksSectionProps {
  selected: string;
  onSelect: (id: string) => void;
}

const CardFaceDecksSection = ({ selected, onSelect }: CardFaceDecksSectionProps) => {
  const decks = useDecksStore((s) => s.decks);
  const loaded = useDecksStore((s) => s.loaded);
  const reload = useDecksStore((s) => s.reload);
  const [mappingDeck, setMappingDeck] = useState<DeckInfo | null>(null);

  const noDeckSelected = !decks.some((d) => d.id === selected);

  return (
    <section>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h3 className="text-xl font-bold text-white">Лицо карт</h3>
        <button
          onClick={() => reload()}
          className="text-xs px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white"
          title="Пересканировать images/"
        >
          Обновить список
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Каждая подпапка в <code className="bg-gray-800 px-1 rounded">images/</code> — отдельная колода.
        Файлы карт распознаются автоматически по имени (2C, 10H, AS, JD…). Нераспознанные можно назначить вручную.
      </p>

      {!loaded ? (
        <div className="text-gray-500 italic">Загрузка колод…</div>
      ) : decks.length === 0 ? (
        <div className="text-gray-500 italic">
          В папке images/ нет подпапок. Создайте, например, images/standard/ и положите туда PNG карт.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {/* Опция без колоды (CSS-fallback) */}
          <DeckCardPreview
            id="__none__"
            label="Без колоды (CSS)"
            previewUrl={null}
            isSelected={noDeckSelected}
            stats={null}
            onClick={() => onSelect('classic')}
            onConfigure={null}
          />
          {decks.map((d) => {
            const previewFile = d.finalMap['AS'] || d.finalMap['KH'] || Object.values(d.finalMap)[0] || null;
            const previewUrl = previewFile ? BASE_URL + '/decks/' + d.id + '/' + encodeURIComponent(previewFile) : null;
            const mappedCount = 52 - d.missingCards.length;
            const stats =
              mappedCount === 52
                ? '52/52 карт'
                : mappedCount + '/52 карт' + (d.unmappedFiles.length > 0 ? ' · ' + d.unmappedFiles.length + ' нераспозн.' : '');
            return (
              <DeckCardPreview
                key={d.id}
                id={d.id}
                label={d.label}
                previewUrl={previewUrl}
                isSelected={selected === d.id}
                stats={stats}
                warning={mappedCount < 52}
                onClick={() => onSelect(d.id)}
                onConfigure={() => setMappingDeck(d)}
              />
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {mappingDeck && (
          <DeckMappingModal
            deck={mappingDeck}
            onClose={() => setMappingDeck(null)}
            onSaved={async () => {
              await reload();
              setMappingDeck(null);
            }}
          />
        )}
      </AnimatePresence>
    </section>
  );
};

interface DeckCardPreviewProps {
  id: string;
  label: string;
  previewUrl: string | null;
  isSelected: boolean;
  stats: string | null;
  warning?: boolean;
  onClick: () => void;
  onConfigure: (() => void) | null;
}

const DeckCardPreview = ({ id, label, previewUrl, isSelected, stats, warning, onClick, onConfigure }: DeckCardPreviewProps) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={
        'rounded-xl overflow-hidden border-2 transition-all ' +
        (isSelected ? 'border-poker-gold shadow-lg shadow-poker-gold/30' : 'border-transparent hover:border-gray-600')
      }
    >
      <button
        onClick={onClick}
        className="block w-full h-24 bg-gray-800 relative cursor-pointer"
        aria-label={'Выбрать ' + label}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={label} className="w-full h-full object-contain" draggable={false} />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-white to-gray-100 flex items-center justify-center text-gray-700 text-3xl font-black">
            A♠
          </div>
        )}
      </button>
      <div className="bg-gray-800 px-3 py-2 text-center text-white text-sm" title={id}>
        <div className="truncate">{label}</div>
        {stats && (
          <div className={'text-xs mt-0.5 ' + (warning ? 'text-amber-400' : 'text-gray-400')}>
            {stats}
          </div>
        )}
        {onConfigure && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onConfigure();
            }}
            className="mt-1 text-xs px-2 py-1 rounded-md bg-emerald-600/80 hover:bg-emerald-600 text-white w-full"
          >
            Настроить вручную
          </button>
        )}
      </div>
    </motion.div>
  );
};
