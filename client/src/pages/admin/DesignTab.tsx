import { useState, useEffect, useCallback } from 'react';
import { InfoButton } from '../../components/lobby/createControls';
import { useAdminInfo } from '../../components/admin/useAdminInfo';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import { useAdminApi } from '../../hooks/useAdminApi';
import { DEFAULT_DESIGN, CARD_BACK_PRESETS } from '../../config/design';
import type { DesignConfig, DesignPreset } from '../../config/design';

// Вкладка «Дизайн»: только рубашка карт. Лицо карт теперь выбирает игрок в «Настройках Игры»
// (карусель колоды classic/colored); секции «Страница регистрации» и «Фишки» убраны как
// неиспользуемые. Состояние дизайна локально (как у других вкладок).
export const DesignTab = () => {
  const { openInfo, infoSheet } = useAdminInfo();
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

  return (
    <div className="space-y-10 pb-20">
      {infoSheet}
      <InfoButton onClick={openInfo('design.cardBack')} />
      <DesignSection
        title="Рубашка карт"
        description="Дизайн обратной стороны карты"
        presets={CARD_BACK_PRESETS}
        selected={design.cardBackStyle}
        onSelect={(id) => setDesign((prev) => ({ ...prev, cardBackStyle: id }))}
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
