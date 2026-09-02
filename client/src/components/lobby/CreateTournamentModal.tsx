import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy } from 'lucide-react';
import { Stepper, Segmented, SettingRow, Toggle, InfoSheet } from './createControls';
import { parseMoney, formatMoney } from '../../config/chipFormat';
import type { CreateTournamentOptions, BlindSpeed, GameFormat, TournamentType, MttPayoutMode, BountyType } from '@poker-room/shared';

// Та же лестница, что и в server/src/game/tournament/tournamentSchedule.ts (BLIND_LADDER) —
// держать в синхроне при правке. Дублируется, а не импортируется из shared: это просто список
// «круглых» пар для степпера, сервер сам находит ближайший НЕ НИЖЕ уровень при старте турнира.
const BLIND_LADDER: ReadonlyArray<readonly [number, number]> = [
  [10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300],
  [200, 400], [300, 600], [400, 800], [500, 1000], [600, 1200], [800, 1600],
  [1000, 2000], [1500, 3000], [2000, 4000], [3000, 6000], [4000, 8000],
  [5000, 10000], [6000, 12000], [8000, 16000], [10000, 20000],
];

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

const PAYOUT_MODE_OPTIONS: Array<{ value: MttPayoutMode; label: string }> = [
  { value: 'itm', label: 'ITM %' },
  { value: 'fixed', label: 'Фикс. мест' },
];

const BOUNTY_TYPE_OPTIONS: Array<{ value: BountyType; label: string }> = [
  { value: 'flat', label: 'Флэт' },
  { value: 'progressive', label: 'Progressive (PKO)' },
];

// Тексты bottom-sheet'ов для инфо-«i» по каждому пункту модалки (см. CreateRoomModal.tsx — тот же
// паттерн InfoSheet/openInfo). Хардкод на русском — файл пока без i18n (см. ROADMAP §10.19).
const INFO: Record<string, { title: string; lines: string[] }> = {
  type: {
    title: 'Тип турнира',
    lines: [
      'SNG (Sit & Go) — один стол, старт сразу после заполнения всех мест.',
      'MTT (мультистол) — несколько столов, старт вручную, столы объединяются по ходу выбывания игроков.',
    ],
  },
  format: { title: 'Формат', lines: ['Правила игры за столом: NLH (классика, 52 карты) или Шорт-дэк (36 карт, без 2–5, другой рейтинг рук).'] },
  tableSize: { title: 'Мест за столом', lines: ['Сколько игроков сидит за одним столом. Для MTT определяет, сколько столов создастся при старте (участники ÷ это число).'] },
  buyIn: { title: 'Бай-ин', lines: ['Взнос за участие — уходит в призовой фонд (за вычетом рейка и доли на баунти, если включены). 0 — бесплатный турнир.'] },
  blind: { title: 'Начальный блайнд', lines: ['Стартовый уровень малого/большого блайнда по стандартной лестнице. Дальше блайнды растут автоматически по расписанию уровней.'] },
  stack: { title: 'Стартовый стек, BB', lines: ['Глубина стека на старте в больших блайндах — сколько фишек получит каждый игрок (= начальный BB × это число).'] },
  speed: { title: 'Скорость блайндов', lines: ['Как быстро растут блайнды между уровнями: медленно/стандартно/турбо/гипер — влияет на общую длительность турнира.'] },
  level: { title: 'Уровень, мин', lines: ['Сколько минут длится каждый уровень блайндов, прежде чем они вырастут до следующего.'] },
  bounty: { title: 'Баунти / PKO', lines: ['Часть бай-ина каждого входа уходит не в общий призовой фонд, а в «цену за голову» — выплачивается тому, кто выбьет этого игрока.'] },
  bountyType: {
    title: 'Тип баунти',
    lines: [
      'Флэт — весь баунти жертвы сразу уходит убийце кэшем в банкролл.',
      'Progressive (PKO) — половина кэшем убийце сразу, половина добавляется к его СОБСТВЕННОМУ баунти (растёт по ходу турнира у выживших).',
    ],
  },
  bountyPercent: { title: 'Доля бай-ина в баунти, %', lines: ['Какой процент бай-ина каждого входа уходит в баунти-пул вместо обычного призового фонда.'] },
  rake: { title: 'Рейк, %', lines: ['Комиссия рума — эта доля бай-ина каждого входа уходит мимо призового фонда (как в реальных румах: бай-ин = приз-часть + рейк).'] },
  promo: {
    title: 'Вход по промо',
    lines: [
      'Создаёт промокод на бай-ин этого турнира. Код НЕ привязан к одному турниру — сработает на любом турнире с точно такой же суммой бай-ина, включая будущие (как тикеты в топ-румах).',
      'Игрок вводит код прямо в карточке турнира — рум платит его бай-ин сам, банкролл игрока не трогается. Код показывается только вам (создавшему турнир админу) — скопируйте и раздайте (например, в Telegram-группе).',
      'Лимит активаций — сколько раз ВСЕГО код можно погасить (разными игроками). Один игрок может использовать код только один раз.',
    ],
  },
  promoLimit: { title: 'Лимит активаций', lines: ['Сколько раз всего можно погасить этот код — разными игроками, по одному разу на игрока.'] },
  lateReg: { title: 'Поздняя рег., мин', lines: ['MTT: сколько минут после старта ещё можно зарегистрироваться (или сделать ре-энтри) — окно поздней регистрации.'] },
  minPlayers: { title: 'Мин. игроков для старта', lines: ['MTT: минимум уникальных зарегистрированных игроков, при котором можно принудительно стартовать турнир, а также при котором сработает автостарт по расписанному времени (иначе — авто-отмена с возвратом бай-инов).'] },
  maxPlayersEnabled: { title: 'Огранич. макс. участников', lines: ['MTT: включает потолок на число уникальных зарегистрированных игроков. Ре-энтри существующих игроков потолок не учитывает — только новые входы.'] },
  maxPlayers: { title: 'Макс. участников', lines: ['MTT: как только число уникальных зарегистрированных игроков достигнет этого значения, новая регистрация закрывается («турнир полон»).'] },
  payoutMode: {
    title: 'Призовые места',
    lines: [
      'ITM % — доля призовых мест считается от общего числа участников (напр. 15% от 40 = 6 мест).',
      'Фикс. мест — строго заданное число призовых мест независимо от количества участников.',
    ],
  },
  itm: { title: 'ITM%', lines: ['Какой процент участников получит приз. Свободная настройка — под любой стандарт рума (типично 10-20%).'] },
  fixedPlaces: { title: 'Призовых мест', lines: ['Строго это число призовых мест, независимо от того, сколько игроков зарегистрировалось (не больше числа участников).'] },
  curve: {
    title: 'Форма распределения приза',
    lines: [
      'Насколько сильно 1-е место получает больше остальных призовых мест.',
      '1.0 — стандартная кривая (как сейчас). Меньше 1 — площе, приз размазан ровнее по местам. Больше 1 — top-heavy, 1-е место забирает заметно больше (как в жёстких структурах WSOP-типа).',
    ],
  },
  reentry: { title: 'Ре-энтри', lines: ['MTT: после вылета можно зайти в турнир заново (новый вход, полный стек), пока открыто окно поздней регистрации.'] },
  maxReentries: { title: 'Макс. ре-энтри на игрока', lines: ['Сколько раз один игрок может воспользоваться ре-энтри за турнир (не считая самого первого входа).'] },
  unlimitedReentries: { title: 'Без ограничения', lines: ['Снимает лимит на число ре-энтри — игрок может заходить заново сколько угодно раз, пока открыто окно поздней регистрации.'] },
  reentryFee: { title: 'Цена ре-энтри', lines: ['Взнос за повторный вход — можно сделать отличным от обычного бай-ина (например, бесплатный вход + платное ре-энтри).'] },
  guarantee: { title: 'Гарантированный приз', lines: ['Минимальный призовой фонд. Если бай-инов участников не хватило до этой суммы — рум доплачивает разницу («оверлей»).'] },
  guaranteeSum: { title: 'Сумма гарантии', lines: ['Целевой размер призового фонда — рум доплатит недостающее на финише турнира, если реальные бай-ины оказались меньше.'] },
  schedule: {
    title: 'Запланированный старт',
    lines: [
      'Включите, чтобы задать конкретное время открытия регистрации и/или старта турнира вместо обычной логики (SNG стартует по заполнению стола, MTT — только вручную кнопкой «Начать сейчас»).',
      'Оба поля необязательны — можно задать только одно из них.',
    ],
  },
  regOpensAt: { title: 'Открытие регистрации', lines: ['До этого момента турнир виден в лобби, но зарегистрироваться нельзя. Если не задано — регистрация открыта сразу после создания.'] },
  scheduledStartAt: {
    title: 'Время старта турнира',
    lines: [
      'Турнир стартует автоматически в это время. SNG ждёт точное время даже если стол уже заполнился раньше; для MTT это как обычный принудительный старт.',
      'Если к этому моменту зарегистрировано меньше 2 игроков — турнир автоматически отменяется, все бай-ины возвращаются.',
    ],
  },
  fillWithBots: {
    title: 'Заполнить ботами',
    lines: [
      'Боты с человеческими именами регистрируются постепенно и в случайном порядке — часть на этапе обычной регистрации, часть на поздней (если она есть у турнира). Не все сразу.',
      'Платят бай-ин и баунти как обычный участник (идёт в общий призовой фонд). Играют слабо и стабильно сливают стек — никогда не заходят повторно после вылета, даже если включено ре-энтри.',
    ],
  },
};

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
  const [blindIdx, setBlindIdx] = useState(2); // индекс в BLIND_LADDER — стартовый уровень блайндов, по умолчанию 25/50
  const [stackBb, setStackBb] = useState(100); // стартовый стек в BB (не в фишках — админу так понятнее)
  const [tableSize, setTableSize] = useState(6);
  const [blindSpeed, setBlindSpeed] = useState<BlindSpeed>('regular');
  const [levelUpMinutes, setLevelUpMinutes] = useState(12);
  const [lateRegMinutes, setLateRegMinutes] = useState(10);
  const [minPlayers, setMinPlayers] = useState(2);
  const [maxPlayersEnabled, setMaxPlayersEnabled] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(100);
  const [itmPercent, setItmPercent] = useState(15);
  const [payoutMode, setPayoutMode] = useState<MttPayoutMode>('itm');
  const [fixedPayoutPlaces, setFixedPayoutPlaces] = useState(9);
  const [payoutCurveExponent, setPayoutCurveExponent] = useState(1);
  const [reEntryEnabled, setReEntryEnabled] = useState(false);
  const [maxReEntries, setMaxReEntries] = useState(1);
  const [unlimitedReEntries, setUnlimitedReEntries] = useState(false);
  const [reEntryFee, setReEntryFee] = useState(1000);
  const [guaranteeEnabled, setGuaranteeEnabled] = useState(false);
  const [guaranteedPrizePool, setGuaranteedPrizePool] = useState(10000);
  const [rakePercent, setRakePercent] = useState(0);
  const [promoEnabled, setPromoEnabled] = useState(false);
  const [promoMaxRedemptions, setPromoMaxRedemptions] = useState(10);
  const [bountyEnabled, setBountyEnabled] = useState(false);
  const [bountyType, setBountyType] = useState<BountyType>('flat');
  const [bountyPercent, setBountyPercent] = useState(50);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [regOpensAt, setRegOpensAt] = useState(''); // datetime-local строка, пусто — не задано
  const [scheduledStartAt, setScheduledStartAt] = useState('');
  const [fillWithBots, setFillWithBots] = useState(false);
  const [botFillTarget, setBotFillTarget] = useState(10);
  const [infoKey, setInfoKey] = useState<string | null>(null);
  const openInfo = (k: string) => () => setInfoKey(k);

  // Мобильная клавиатура перекрывает сфокусированное поле, т.к. модалка центрируется по
  // layout viewport, который браузер не сжимает под клавиатуру (fixed inset-0). Подскролливаем
  // сам инпут в видимую область — с задержкой, чтобы дождаться анимации появления клавиатуры.
  const onFieldFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const target = e.target;
    setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
  };

  const [startingSmallBlind, startingBigBlind] = BLIND_LADDER[blindIdx];
  const startingStack = startingBigBlind * stackBb;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const regOpensAtMs = scheduleEnabled && regOpensAt ? new Date(regOpensAt).getTime() : undefined;
    const scheduledStartAtMs = scheduleEnabled && scheduledStartAt ? new Date(scheduledStartAt).getTime() : undefined;
    onSubmit({
      name: name.trim(), type, format, buyIn, startingStack, startingBigBlind, tableSize, blindSpeed, levelUpMinutes,
      ...(rakePercent > 0 ? { rakePercent } : {}),
      promoEnabled,
      ...(promoEnabled ? { promoMaxRedemptions } : {}),
      ...(type === 'mtt'
        ? {
            lateRegMinutes,
            minPlayers,
            ...(maxPlayersEnabled ? { maxPlayers } : {}),
            payoutMode,
            ...(payoutMode === 'fixed' ? { fixedPayoutPlaces } : { itmPercent }),
            payoutCurveExponent,
            reEntryEnabled,
            ...(reEntryEnabled
              ? { reEntryFee, ...(unlimitedReEntries ? { unlimitedReEntries: true } : { maxReEntries }) }
              : {}),
            ...(guaranteeEnabled ? { guaranteedPrizePool } : {}),
          }
        : {}),
      bountyEnabled,
      ...(bountyEnabled ? { bountyType, bountyPercent } : {}),
      ...(regOpensAtMs ? { regOpensAt: regOpensAtMs } : {}),
      ...(scheduledStartAtMs ? { scheduledStartAt: scheduledStartAtMs } : {}),
      fillWithBots,
      ...(fillWithBots ? { botFillTarget } : {}),
    });
  };

  // Portal в document.body: страницы-хосты (Tournaments.tsx и др.) оборачивают контент в
  // `relative z-10`, что создаёт свой stacking context и «запирает» модалку внутри — снаружи
  // это видно как единый блок с эффективным z=10, а нижний таб-бар (z-40) перекрывает её целиком
  // независимо от z-index внутри (нашли живым тестом в браузере: подсказки уходили под таб-бар).
  return createPortal(
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

        <form
          onSubmit={submit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault();
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={onFieldFocus}
            placeholder="Название турнира"
            className="w-full bg-gray-800 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-amber-500 mb-2"
          />

          <SettingRow label="Запланировать старт" onInfo={openInfo('schedule')}>
            <Toggle checked={scheduleEnabled} onChange={setScheduleEnabled} />
          </SettingRow>

          {scheduleEnabled && (
            <>
              <SettingRow label="Открытие регистрации" onInfo={openInfo('regOpensAt')} wrap>
                <input
                  type="datetime-local"
                  aria-label="Открытие регистрации"
                  value={regOpensAt}
                  onChange={(e) => setRegOpensAt(e.target.value)}
                  className="bg-gray-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm outline-none focus:border-amber-500 [color-scheme:dark]"
                />
              </SettingRow>
              <SettingRow label="Старт турнира" onInfo={openInfo('scheduledStartAt')} wrap>
                <input
                  type="datetime-local"
                  aria-label="Старт турнира"
                  value={scheduledStartAt}
                  onChange={(e) => setScheduledStartAt(e.target.value)}
                  className="bg-gray-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm outline-none focus:border-amber-500 [color-scheme:dark]"
                />
              </SettingRow>
            </>
          )}

          <SettingRow label="Тип турнира" onInfo={openInfo('type')} wrap>
            <Segmented options={TYPE_OPTIONS} value={type} onChange={setType} />
          </SettingRow>

          <SettingRow label="Формат" onInfo={openInfo('format')}>
            <Segmented options={FORMAT_OPTIONS} value={format} onChange={setFormat} />
          </SettingRow>

          <SettingRow label="Мест за столом" onInfo={openInfo('tableSize')} wrap>
            <Stepper
              display={tableSize}
              onDec={() => setTableSize((v) => Math.max(2, v - 1))}
              onInc={() => setTableSize((v) => Math.min(9, v + 1))}
            />
          </SettingRow>

          <SettingRow label="Бай-ин (0 — бесплатно)" onInfo={openInfo('buyIn')}>
            <input
              type="number"
              min="0"
              step="0.01"
              value={buyIn / 100}
              onChange={(e) => setBuyIn(parseMoney(e.target.value))}
              onFocus={onFieldFocus}
              className="w-24 text-right bg-gray-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm outline-none focus:border-amber-500"
            />
          </SettingRow>

          <SettingRow label="Рейк, %" onInfo={openInfo('rake')} wrap>
            <Stepper
              display={rakePercent + '%'}
              onDec={() => setRakePercent((v) => Math.max(0, v - 1))}
              onInc={() => setRakePercent((v) => Math.min(50, v + 1))}
            />
          </SettingRow>

          <SettingRow label="Вход по промо" onInfo={openInfo('promo')}>
            <Toggle checked={promoEnabled} onChange={setPromoEnabled} />
          </SettingRow>

          {promoEnabled && (
            <SettingRow label="Лимит активаций" onInfo={openInfo('promoLimit')} wrap>
              <Stepper
                display={promoMaxRedemptions}
                onDec={() => setPromoMaxRedemptions((v) => Math.max(1, v - 1))}
                onInc={() => setPromoMaxRedemptions((v) => Math.min(1000, v + 1))}
              />
            </SettingRow>
          )}

          <SettingRow label="Начальный блайнд" onInfo={openInfo('blind')} wrap>
            <Stepper
              display={formatMoney(startingSmallBlind) + ' / ' + formatMoney(startingBigBlind)}
              onDec={() => setBlindIdx((v) => Math.max(0, v - 1))}
              onInc={() => setBlindIdx((v) => Math.min(BLIND_LADDER.length - 1, v + 1))}
            />
          </SettingRow>

          <SettingRow label="Стартовый стек, BB" onInfo={openInfo('stack')} wrap>
            <Stepper
              display={stackBb}
              onDec={() => setStackBb((v) => Math.max(10, v - 10))}
              onInc={() => setStackBb((v) => Math.min(1000, v + 10))}
            />
          </SettingRow>

          <div className="text-xs text-gray-500 text-right -mt-2 mb-1">
            = {formatMoney(startingStack)} фишек на старте
          </div>

          <SettingRow label="Скорость блайндов" onInfo={openInfo('speed')} wrap>
            <Segmented options={SPEED_OPTIONS} value={blindSpeed} onChange={setBlindSpeed} />
          </SettingRow>

          <SettingRow label="Уровень, мин" onInfo={openInfo('level')} wrap>
            <Stepper
              display={levelUpMinutes}
              onDec={() => setLevelUpMinutes((v) => Math.max(1, v - 1))}
              onInc={() => setLevelUpMinutes((v) => Math.min(60, v + 1))}
            />
          </SettingRow>

          <SettingRow label="Баунти / PKO" onInfo={openInfo('bounty')}>
            <Toggle checked={bountyEnabled} onChange={setBountyEnabled} />
          </SettingRow>

          {bountyEnabled && (
            <>
              <SettingRow label="Тип баунти" onInfo={openInfo('bountyType')} wrap>
                <Segmented options={BOUNTY_TYPE_OPTIONS} value={bountyType} onChange={setBountyType} />
              </SettingRow>
              <SettingRow label="Доля бай-ина в баунти, %" onInfo={openInfo('bountyPercent')} wrap>
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
              <SettingRow label="Мин. игроков для старта" onInfo={openInfo('minPlayers')} wrap>
                <Stepper
                  display={minPlayers}
                  onDec={() => setMinPlayers((v) => Math.max(2, v - 1))}
                  onInc={() => setMinPlayers((v) => Math.min(1000, v + 1))}
                />
              </SettingRow>

              <SettingRow label="Огранич. макс. участников" onInfo={openInfo('maxPlayersEnabled')}>
                <Toggle checked={maxPlayersEnabled} onChange={setMaxPlayersEnabled} />
              </SettingRow>

              {maxPlayersEnabled && (
                <SettingRow label="Макс. участников" onInfo={openInfo('maxPlayers')} wrap>
                  <Stepper
                    display={maxPlayers}
                    onDec={() => setMaxPlayers((v) => Math.max(Math.max(2, minPlayers), v - 1))}
                    onInc={() => setMaxPlayers((v) => Math.min(1000, v + 1))}
                  />
                </SettingRow>
              )}

              <SettingRow label="Поздняя рег., мин" onInfo={openInfo('lateReg')} wrap>
                <Stepper
                  display={lateRegMinutes}
                  onDec={() => setLateRegMinutes((v) => Math.max(0, v - 1))}
                  onInc={() => setLateRegMinutes((v) => Math.min(120, v + 1))}
                />
              </SettingRow>

              <SettingRow label="Призовые места" onInfo={openInfo('payoutMode')} wrap>
                <Segmented options={PAYOUT_MODE_OPTIONS} value={payoutMode} onChange={setPayoutMode} />
              </SettingRow>

              {payoutMode === 'itm' ? (
                <SettingRow label="ITM%" onInfo={openInfo('itm')} wrap>
                  <Stepper
                    display={itmPercent + '%'}
                    onDec={() => setItmPercent((v) => Math.max(1, v - 1))}
                    onInc={() => setItmPercent((v) => Math.min(100, v + 1))}
                  />
                </SettingRow>
              ) : (
                <SettingRow label="Призовых мест" onInfo={openInfo('fixedPlaces')} wrap>
                  <Stepper
                    display={fixedPayoutPlaces}
                    onDec={() => setFixedPayoutPlaces((v) => Math.max(1, v - 1))}
                    onInc={() => setFixedPayoutPlaces((v) => Math.min(1000, v + 1))}
                  />
                </SettingRow>
              )}

              <SettingRow label="Форма распределения приза" onInfo={openInfo('curve')} wrap>
                <Stepper
                  display={payoutCurveExponent.toFixed(1)}
                  onDec={() => setPayoutCurveExponent((v) => Math.max(0.1, Math.round((v - 0.1) * 10) / 10))}
                  onInc={() => setPayoutCurveExponent((v) => Math.min(5, Math.round((v + 0.1) * 10) / 10))}
                />
              </SettingRow>

              <SettingRow label="Ре-энтри" onInfo={openInfo('reentry')}>
                <Toggle checked={reEntryEnabled} onChange={setReEntryEnabled} />
              </SettingRow>

              {reEntryEnabled && (
                <>
                  <SettingRow label="Без ограничения" onInfo={openInfo('unlimitedReentries')}>
                    <Toggle checked={unlimitedReEntries} onChange={setUnlimitedReEntries} />
                  </SettingRow>
                  <SettingRow label="Макс. ре-энтри на игрока" onInfo={openInfo('maxReentries')} wrap>
                    <Stepper
                      display={maxReEntries}
                      disabled={unlimitedReEntries}
                      onDec={() => setMaxReEntries((v) => Math.max(1, v - 1))}
                      onInc={() => setMaxReEntries((v) => Math.min(10, v + 1))}
                    />
                  </SettingRow>
                  <SettingRow label="Цена ре-энтри" onInfo={openInfo('reentryFee')}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={reEntryFee / 100}
                      onChange={(e) => setReEntryFee(parseMoney(e.target.value))}
                      onFocus={onFieldFocus}
                      className="w-24 text-right bg-gray-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm outline-none focus:border-amber-500"
                    />
                  </SettingRow>
                </>
              )}

              <SettingRow label="Гарантированный приз" onInfo={openInfo('guarantee')}>
                <Toggle checked={guaranteeEnabled} onChange={setGuaranteeEnabled} />
              </SettingRow>

              {guaranteeEnabled && (
                <SettingRow label="Сумма гарантии" onInfo={openInfo('guaranteeSum')}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={guaranteedPrizePool / 100}
                    onChange={(e) => setGuaranteedPrizePool(parseMoney(e.target.value))}
                    onFocus={onFieldFocus}
                    className="w-24 text-right bg-gray-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm outline-none focus:border-amber-500"
                  />
                </SettingRow>
              )}
            </>
          )}

          <SettingRow label="Заполнить ботами" onInfo={openInfo('fillWithBots')}>
            <Toggle checked={fillWithBots} onChange={setFillWithBots} />
          </SettingRow>

          {fillWithBots && (
            <SettingRow label="Итоговое число ботов" wrap>
              <Stepper
                display={botFillTarget}
                onDec={() => setBotFillTarget((v) => Math.max(1, v - 1))}
                onInc={() => setBotFillTarget((v) => Math.min(100, v + 1))}
              />
            </SettingRow>
          )}

          <button
            type="submit"
            className="w-full mt-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 font-bold text-white"
          >
            Создать
          </button>
        </form>
      </motion.div>

      <AnimatePresence>
        {infoKey && INFO[infoKey] && (
          <InfoSheet title={INFO[infoKey].title} onClose={() => setInfoKey(null)}>
            {INFO[infoKey].lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </InfoSheet>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
};
