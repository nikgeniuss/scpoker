import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Trophy } from 'lucide-react';
import { Stepper, Segmented, SettingRow, Toggle } from './createControls';
import { parseMoney, formatMoney } from '../../config/chipFormat';
import type { CreateTournamentOptions, BlindSpeed, GameFormat, TournamentType, MttItmPercent, MttPayoutMode, BountyType } from '@poker-room/shared';

const SPEED_OPTIONS: Array<{ value: BlindSpeed; label: string }> = [
  { value: 'slow', label: 'Медленно' },
  { value: 'regular', label: 'Стандартная' },
  { value: 'turbo', label: 'Турбо' },
  { value: 'hyper', label: 'Гипер' },
];

const FORMAT_OPTIONS: Array<{ value: GameFormat; label: string }> = [
  { value: 'nlh', label: 'NLH' },
  { value: 'shortdeck', label: 'Шорт-дэк' },
];

const TYPE_OPTIONS: Array<{ value: TournamentType; label: string }> = [
  { value: 'sng', label: 'SNG (1 стол)' },
  { value: 'mtt', label: 'MTT (мультистол)' },
];

const ITM_OPTIONS: Array<{ value: MttItmPercent; label: string }> = [
  { value: 10, label: '10%' },
  { value: 12, label: '12%' },
  { value: 15, label: '15%' },
  { value: 20, label: '20%' },
];

const PAYOUT_MODE_OPTIONS: Array<{ value: MttPayoutMode; label: string }> = [
  { value: 'itm', label: 'ITM %' },
  { value: 'fixed', label: 'Фикс. мест' },
];

const BOUNTY_TYPE_OPTIONS: Array<{ value: BountyType; label: string }> = [
  { value: 'flat', label: 'Флэт' },
  { value: 'progressive', label: 'Progressive (PKO)' },
];

interface CreateTournamentModalProps {
  onClose: () => void;
  onSubmit: (opts: CreateTournamentOptions) => void;
}

// Создание турнира (SNG v1) — только админ (решение пользователя, реальный призовой фонд).
export const CreateTournamentModal = ({ onClose, onSubmit }: CreateTournamentModalProps) => {
  const [name, setName] = useState('Sit & Go');
  const [type, setType] = useState<TournamentType>('sng');
  const [format, setFormat] = useState<GameFormat>('nlh');
  const [buyIn, setBuyIn] = useState(1000); // в центах (как везде в проекте)
  const [startingStack, setStartingStack] = useState(1000);
  const [tableSize, setTableSize] = useState(6);
  const [blindSpeed, setBlindSpeed] = useState<BlindSpeed>('regular');
  const [levelUpMinutes, setLevelUpMinutes] = useState(12);
  const [lateRegMinutes, setLateRegMinutes] = useState(10);
  const [itmPercent, setItmPercent] = useState<MttItmPercent>(15);
  const [payoutMode, setPayoutMode] = useState<MttPayoutMode>('itm');
  const [fixedPayoutPlaces, setFixedPayoutPlaces] = useState(9);
  const [reEntryEnabled, setReEntryEnabled] = useState(false);
  const [maxReEntries, setMaxReEntries] = useState(1);
  const [guaranteeEnabled, setGuaranteeEnabled] = useState(false);
  const [guaranteedPrizePool, setGuaranteedPrizePool] = useState(10000);
  const [bountyEnabled, setBountyEnabled] = useState(false);
  const [bountyType, setBountyType] = useState<BountyType>('flat');
  const [bountyPercent, setBountyPercent] = useState(50);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(), type, format, buyIn, startingStack, tableSize, blindSpeed, levelUpMinutes,
      ...(type === 'mtt'
        ? {
            lateRegMinutes,
            payoutMode,
            ...(payoutMode === 'fixed' ? { fixedPayoutPlaces } : { itmPercent }),
            reEntryEnabled,
            ...(reEntryEnabled ? { maxReEntries } : {}),
            ...(guaranteeEnabled ? { guaranteedPrizePool } : {}),
          }
        : {}),
      bountyEnabled,
      ...(bountyEnabled ? { bountyType, bountyPercent } : {}),
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-900 border border-amber-500/30 rounded-3xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Trophy size={18} className="text-amber-400" />
            Создать турнир
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submit}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название турнира"
            className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-amber-500 mb-2"
          />

          <SettingRow label="Тип турнира">
            <Segmented options={TYPE_OPTIONS} value={type} onChange={setType} />
          </SettingRow>

          <SettingRow label="Формат">
            <Segmented options={FORMAT_OPTIONS} value={format} onChange={setFormat} />
          </SettingRow>

          <SettingRow label="Мест за столом">
            <Stepper
              display={tableSize}
              onDec={() => setTableSize((v) => Math.max(2, v - 1))}
              onInc={() => setTableSize((v) => Math.min(9, v + 1))}
            />
          </SettingRow>

          <SettingRow label="Бай-ин">
            <input
              value={formatMoney(buyIn)}
              onChange={(e) => setBuyIn(Math.max(1, parseMoney(e.target.value)))}
              className="w-24 text-right bg-gray-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm outline-none focus:border-amber-500"
            />
          </SettingRow>

          <SettingRow label="Стартовый стек">
            <input
              value={formatMoney(startingStack)}
              onChange={(e) => setStartingStack(Math.max(1, parseMoney(e.target.value)))}
              className="w-24 text-right bg-gray-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm outline-none focus:border-amber-500"
            />
          </SettingRow>

          <SettingRow label="Скорость блайндов">
            <Segmented options={SPEED_OPTIONS} value={blindSpeed} onChange={setBlindSpeed} />
          </SettingRow>

          <SettingRow label="Уровень, мин">
            <Stepper
              display={levelUpMinutes}
              onDec={() => setLevelUpMinutes((v) => Math.max(1, v - 1))}
              onInc={() => setLevelUpMinutes((v) => Math.min(60, v + 1))}
            />
          </SettingRow>

          <SettingRow label="Баунти / PKO">
            <Toggle checked={bountyEnabled} onChange={setBountyEnabled} />
          </SettingRow>

          {bountyEnabled && (
            <>
              <SettingRow label="Тип баунти">
                <Segmented options={BOUNTY_TYPE_OPTIONS} value={bountyType} onChange={setBountyType} />
              </SettingRow>
              <SettingRow label="Доля бай-ина в баунти, %">
                <Stepper
                  display={bountyPercent}
                  onDec={() => setBountyPercent((v) => Math.max(1, v - 5))}
                  onInc={() => setBountyPercent((v) => Math.min(90, v + 5))}
                />
              </SettingRow>
            </>
          )}

          {type === 'mtt' && (
            <>
              <SettingRow label="Поздняя рег., мин">
                <Stepper
                  display={lateRegMinutes}
                  onDec={() => setLateRegMinutes((v) => Math.max(0, v - 1))}
                  onInc={() => setLateRegMinutes((v) => Math.min(120, v + 1))}
                />
              </SettingRow>

              <SettingRow label="Призовые места">
                <Segmented options={PAYOUT_MODE_OPTIONS} value={payoutMode} onChange={setPayoutMode} />
              </SettingRow>

              {payoutMode === 'itm' ? (
                <SettingRow label="ITM%">
                  <Segmented options={ITM_OPTIONS} value={itmPercent} onChange={setItmPercent} />
                </SettingRow>
              ) : (
                <SettingRow label="Призовых мест">
                  <Stepper
                    display={fixedPayoutPlaces}
                    onDec={() => setFixedPayoutPlaces((v) => Math.max(1, v - 1))}
                    onInc={() => setFixedPayoutPlaces((v) => Math.min(1000, v + 1))}
                  />
                </SettingRow>
              )}

              <SettingRow label="Ре-энтри">
                <Toggle checked={reEntryEnabled} onChange={setReEntryEnabled} />
              </SettingRow>

              {reEntryEnabled && (
                <SettingRow label="Макс. ре-энтри на игрока">
                  <Stepper
                    display={maxReEntries}
                    onDec={() => setMaxReEntries((v) => Math.max(1, v - 1))}
                    onInc={() => setMaxReEntries((v) => Math.min(10, v + 1))}
                  />
                </SettingRow>
              )}

              <SettingRow label="Гарантированный приз">
                <Toggle checked={guaranteeEnabled} onChange={setGuaranteeEnabled} />
              </SettingRow>

              {guaranteeEnabled && (
                <SettingRow label="Сумма гарантии">
                  <input
                    value={formatMoney(guaranteedPrizePool)}
                    onChange={(e) => setGuaranteedPrizePool(Math.max(0, parseMoney(e.target.value)))}
                    className="w-24 text-right bg-gray-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm outline-none focus:border-amber-500"
                  />
                </SettingRow>
              )}
            </>
          )}

          <button
            type="submit"
            className="w-full mt-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 font-bold text-white"
          >
            Создать
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
};
