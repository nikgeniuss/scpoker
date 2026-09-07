import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactNiceAvatar from 'react-nice-avatar';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ChevronRight, Copy, Check, DollarSign, ArrowDownCircle, ArrowUpCircle, Gem, Gift, Send,
  UserCircle, ShieldAlert, History, Settings2, Inbox, Globe, HelpCircle,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useRakebackStore } from '../store/rakebackStore';
import { countryFlag } from '../utils/country';
import { formatMoney } from '../config/chipFormat';
import { avatarConfig } from '../utils/avatar';
import { AvatarPickerModal } from '../components/profile/AvatarPickerModal';
import { API_URL } from '../config/api';
import { GameSettingsModal } from '../components/game/GameSettingsModal';
import { loadBetPresets, saveBetPresets } from '../config/betPresets';
import { loadChipDisplay, saveChipDisplay } from '../config/chipFormat';
import { loadCardDeck, saveCardDeck } from '../config/cardDeck';
import { loadGameSettings, saveGameSettings } from '../config/gameSettings';

// AK-скин профиля ("/profile" при appTheme='ak') — по референсу AK Poker: тёмно-синий баннер
// с аватаром/ником сверху, светлые карточки ниже. Та же функциональность, что в Profile.tsx
// (классический скин), просто в AK-вёрстке — роуты/модалки/хуки не дублируются.
// Реферальной механики (начисление бонусов за приглашённых) в проекте нет — карточка
// «Пригласите друзей» ниже декоративная, кнопки показывают тост-заглушку (см. AkClub.tsx).

export const AkProfile = () => {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const setAvatarSeed = useAuthStore((s) => s.setAvatarSeed);
  const totalPaid = useRakebackStore((s) => s.totalPaid);
  const rakebackEnabled = useRakebackStore((s) => s.enabled);
  const tier = useRakebackStore((s) => s.tier);
  const loadRakebackMine = useRakebackStore((s) => s.loadMine);
  const navigate = useNavigate();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [betPresets, setBetPresets] = useState(() => loadBetPresets());
  const [chipDisplay, setChipDisplay] = useState(() => loadChipDisplay());
  const [cardDeck, setCardDeck] = useState(() => loadCardDeck());
  const [gameSettings, setGameSettings] = useState(() => loadGameSettings());

  useEffect(() => {
    loadRakebackMine(token);
  }, [loadRakebackMine, token]);

  const MENU_ITEMS = [
    { icon: <UserCircle size={20} />, label: 'Данные аккаунта', to: '/account' },
    { icon: <ShieldAlert size={20} />, label: 'Ответственная игра', to: '/responsible-gambling' },
    { icon: <History size={20} />, label: 'История раздач', to: '/pokercraft' },
    { icon: <Settings2 size={20} />, label: 'Настройки игры', to: null, onClick: () => setSettingsOpen(true) },
    { icon: <Inbox size={20} />, label: 'Входящие', to: '/inbox' },
    { icon: <Globe size={20} />, label: 'Язык', to: '/language' },
    { icon: <HelpCircle size={20} />, label: 'Как играть в покер', to: '/help' },
  ];

  if (!user) return null;

  const flag = countryFlag(user.country);
  const displayId = user.publicId || user.id;

  const pickAvatar = async (seed: string) => {
    setAvatarSeed(seed);
    setPickerOpen(false);
    try {
      await fetch(`${API_URL}/auth/avatar`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed }),
      });
    } catch { /* noop */ }
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(displayId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1500);
    } catch { /* noop */ }
  };

  const inviteSoon = () => toast('Приглашение друзей — скоро', { icon: '👥' });

  return (
    <div className="ak-font min-h-[100dvh] bg-ak-bg text-ak-text pb-8">
      {/* Шапка-баннер — атмосферный градиент вместо фото-сцены референса */}
      <div
        className="relative overflow-hidden px-4 pt-5 pb-11"
        style={{ background: 'linear-gradient(160deg, #0a2a8c 0%, #041c64 45%, #020a2e 100%)' }}
      >
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-ak-gold/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-10 w-40 h-40 rounded-full bg-ak-teal/20 blur-3xl pointer-events-none" />

        <h1 className="relative text-lg font-bold text-white">Профиль</h1>

        <div className="relative mt-4 flex items-center gap-3">
          <button
            className="w-16 h-16 rounded-full overflow-hidden shrink-0 ring-2 ring-white/25"
            onClick={() => setPickerOpen(true)}
            title="Сменить аватар"
          >
            <ReactNiceAvatar className="w-full h-full" shape="circle" {...avatarConfig(user.avatarSeed || user.id)} />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-white font-bold text-base truncate">{user.username}</span>
              {flag && <span className="text-base" title={user.country ?? ''}>{flag}</span>}
            </div>
            <button onClick={copyId} className="mt-0.5 flex items-center gap-1 text-white/60 text-xs">
              <span>ID: {displayId}</span>
              {copiedId ? <Check size={12} className="text-ak-green" /> : <Copy size={12} />}
            </button>
            {/* Реальный VIP-уровень из rakebackService (тот же тир, что в Profile.tsx и на
                /rewards). Скрыт, пока рейкбэк выключен админом или тир ещё не загружен —
                иначе бейдж обещал бы уровень системы, которая ничего не начисляет. */}
            {rakebackEnabled && tier && (
              <span className="mt-1.5 inline-block px-2.5 py-0.5 rounded-full bg-white/10 border border-white/20 text-white text-[11px] font-bold tracking-wide">
                VIP {tier.name.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Контент */}
      <div className="relative -mt-6 px-4 max-w-md mx-auto space-y-3">
        {/* Баланс + пополнение/вывод */}
        <div className="rounded-[13px] bg-ak-card shadow-sm p-4">
          <button onClick={() => navigate('/wallet')} className="w-full flex items-center justify-between min-h-[44px]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-ak-green/15 flex items-center justify-center text-ak-green shrink-0">
                <DollarSign size={18} />
              </div>
              <span className="text-lg font-bold">{formatMoney(user.chips ?? 0)}</span>
            </div>
            <span className="flex items-center gap-0.5 text-ak-text-muted text-sm">
              Транзакции <ChevronRight size={16} />
            </span>
          </button>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => navigate('/wallet')}
              className="min-h-[44px] flex items-center justify-center gap-1.5 rounded-[5px] bg-ak-teal text-white text-sm font-bold"
            >
              <ArrowDownCircle size={16} /> Пополнение
            </button>
            <button
              onClick={() => navigate('/wallet')}
              className="min-h-[44px] flex items-center justify-center gap-1.5 rounded-[5px] bg-ak-navy text-white text-sm font-bold"
            >
              <ArrowUpCircle size={16} /> Вывод
            </button>
          </div>
        </div>

        {/* Рейкбэк — переиспользует rakebackStore (та же цифра, что на /rakeback) */}
        <button
          onClick={() => navigate('/rakeback')}
          className="w-full rounded-[13px] bg-ak-card shadow-sm p-4 flex items-center justify-between min-h-[44px]"
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-ak-gold/15 flex items-center justify-center text-ak-gold shrink-0">
              <Gem size={18} />
            </div>
            <div className="text-left">
              <div className="text-[11px] text-ak-text-muted leading-none mb-0.5">Рейкбэк</div>
              <div className="text-lg font-bold leading-none">{formatMoney(totalPaid)}</div>
            </div>
          </div>
          <span className="flex items-center gap-0.5 text-ak-text-muted text-sm">
            Подробности <ChevronRight size={16} />
          </span>
        </button>

        {/* Приглашение друзей — декоративно, реферальной механики в проекте нет */}
        <div className="rounded-[13px] overflow-hidden shadow-sm" style={{ background: 'linear-gradient(135deg, #eaf3ff 0%, #dcebff 100%)' }}>
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-ak-navy/10 flex items-center justify-center text-ak-navy shrink-0">
                  <Gift size={18} />
                </div>
                <p className="text-sm text-ak-text leading-snug">Приглашайте друзей и играйте вместе</p>
              </div>
              <button onClick={inviteSoon} className="shrink-0 flex items-center gap-0.5 text-ak-navy text-xs font-bold min-h-[44px]">
                Сведения <ChevronRight size={14} />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={inviteSoon}
                className="flex-1 min-h-[44px] flex items-center justify-center gap-2 rounded-[5px] bg-ak-navy text-white text-sm font-bold"
              >
                <Send size={16} /> Пригласить друзей
              </button>
              <button
                onClick={inviteSoon}
                title="Пригласить друзей"
                className="w-11 h-11 shrink-0 rounded-[5px] bg-white border border-ak-navy/15 flex items-center justify-center text-ak-navy"
              >
                <Copy size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Меню — те же роуты/модалки, что в Profile.tsx (классический скин) */}
        <div className="rounded-[13px] bg-ak-card shadow-sm divide-y divide-ak-bg overflow-hidden">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.label}
              className="w-full flex items-center gap-3 px-4 min-h-[44px] py-3 text-left"
              onClick={() => (item.onClick ? item.onClick() : item.to && navigate(item.to))}
            >
              <span className="text-ak-text-muted shrink-0">{item.icon}</span>
              <span className="flex-1 min-w-0 text-sm font-medium truncate">{item.label}</span>
              <ChevronRight size={16} className="text-ak-text-muted shrink-0" />
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {pickerOpen && (
          <AvatarPickerModal
            currentSeed={user.avatarSeed || user.id}
            onClose={() => setPickerOpen(false)}
            onPick={pickAvatar}
          />
        )}
      </AnimatePresence>

      <GameSettingsModal
        open={settingsOpen}
        initialPresets={betPresets}
        initialChipDisplay={chipDisplay}
        initialDeck={cardDeck}
        initialSettings={gameSettings}
        onClose={() => setSettingsOpen(false)}
        onSave={({ presets, chipDisplay: nextDisplay, deck: nextDeck, settings: nextSettings }) => {
          setBetPresets(presets);
          saveBetPresets(presets);
          setChipDisplay(nextDisplay);
          saveChipDisplay(nextDisplay);
          setCardDeck(nextDeck);
          saveCardDeck(nextDeck);
          setGameSettings(nextSettings);
          saveGameSettings(nextSettings);
        }}
      />
    </div>
  );
};
