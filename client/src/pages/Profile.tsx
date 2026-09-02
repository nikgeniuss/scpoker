import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactNiceAvatar from 'react-nice-avatar';
import { AnimatePresence } from 'framer-motion';
import { ChevronRight, History, Settings2, Inbox, Globe, HelpCircle, Wallet as WalletIcon, Gem, Trophy, ShieldAlert, LogOut, Gift } from 'lucide-react';
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
import { useHandsChart } from '../hooks/useHandsChart';

export function Profile() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const token = useAuthStore(s => s.token);
  const setAvatarSeed = useAuthStore(s => s.setAvatarSeed);
  const logout = useAuthStore(s => s.logout);
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [betPresets, setBetPresets] = useState(() => loadBetPresets());
  const [chipDisplay, setChipDisplay] = useState(() => loadChipDisplay());
  const [cardDeck, setCardDeck] = useState(() => loadCardDeck());
  const [gameSettings, setGameSettings] = useState(() => loadGameSettings());
  const { totalHands } = useHandsChart();
  const { enabled: rakebackEnabled, tier, loadMine } = useRakebackStore();

  useEffect(() => {
    loadMine(token);
  }, [loadMine, token]);

  const MENU_ITEMS = [
    { icon: <WalletIcon size={20} />, label: t('profile.wallet'), sub: null, to: '/wallet' },
    { icon: <Gem size={20} />, label: t('profile.rakeback'), sub: null, to: '/rakeback' },
    { icon: <Trophy size={20} />, label: t('profile.rewards'), sub: null, to: '/rewards' },
    { icon: <Gift size={20} />, label: t('profile.referral'), sub: null, to: '/referral' },
    { icon: <ShieldAlert size={20} />, label: t('profile.responsibleGambling'), sub: null, to: '/responsible-gambling' },
    { icon: <History size={20} />, label: t('profile.pokerCraft'), sub: t('profile.pokerCraftSub'), to: '/pokercraft' },
    { icon: <Settings2 size={20} />, label: t('profile.gameSettings'), sub: null, to: null, onClick: () => setSettingsOpen(true) },
    { icon: <Inbox size={20} />, label: t('profile.inbox'), sub: null, to: '/inbox' },
    { icon: <Globe size={20} />, label: t('profile.language'), sub: null, to: '/language' },
    { icon: <HelpCircle size={20} />, label: t('profile.help'), sub: null, to: '/help' },
  ];

  if (!user) return null;

  const flag = countryFlag(user.country);

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

  return (
    <div className="min-h-[100dvh] bg-[#0a0f1a] text-white flex flex-col">
    <div className="w-full max-w-md mx-auto flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-14 pb-6">
        <button onClick={() => navigate(-1)} className="text-white/40 hover:text-white/80 mr-1">
          <ChevronRight size={22} className="rotate-180" />
        </button>
        <span className="text-lg font-bold">{t('profile.title')}</span>
      </div>

      {/* Avatar + info */}
      <div className="flex flex-col items-center gap-3 pb-8">
        <button
          className="w-20 h-20 rounded-full shadow-lg overflow-hidden"
          onClick={() => setPickerOpen(true)}
          title={t('profile.changeAvatar')}
        >
          <ReactNiceAvatar className="w-full h-full" shape="circle" {...avatarConfig(user.avatarSeed || user.id)} />
        </button>
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">{user.username}</span>
            {flag && <span className="text-xl" title={user.country ?? ''}>{flag}</span>}
          </div>
          {user.publicId && (
            <span className="text-white/40 text-sm font-mono tracking-wider">{user.publicId}</span>
          )}
          {rakebackEnabled && tier && (
            <span className="mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30">
              <Gem size={11} className="text-emerald-400" />
              <span className="text-[10px] font-black tracking-wider text-emerald-400">
                {t('profile.vip')} {tier.name.toUpperCase()}
              </span>
            </span>
          )}
        </div>

        <button
          className="mt-2 px-6 py-2 rounded-full border border-white/15 text-white/60 text-sm hover:bg-white/5 transition-colors"
          onClick={() => navigate('/account')}
        >
          {t('profile.accountData')}
        </button>
      </div>

      <div className="px-4 flex flex-col gap-3 mb-5">
        {/* Баланс */}
        <div className="rounded-2xl bg-white/5 p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-white/40 text-xs mb-1">{t('profile.balance')}</div>
            <div className="text-2xl font-black tabular-nums">{formatMoney(user.chips ?? 0)}</div>
          </div>
          <button
            className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-green-600 text-white flex-shrink-0"
            onClick={() => navigate('/wallet')}
          >
            {t('profile.deposit')}
          </button>
        </div>

        {/* Статистика — «Рук сыграно» реальные (см. useHandsChart), остальные три пока не
            трекаются в БД (см. UserStats в statsService.ts) — TODO(roadmap): см. ROADMAP §9.1 */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl bg-white/5 p-3.5">
            <div className="text-white/40 text-[10px] mb-1">{t('profile.handsPlayed')}</div>
            <div className="text-lg font-bold tabular-nums">{totalHands}</div>
          </div>
          <div className="rounded-2xl bg-white/5 p-3.5">
            <div className="text-white/40 text-[10px] mb-1">{t('profile.wins')}</div>
            <div className="text-lg font-bold tabular-nums text-white/30">—</div>
          </div>
          <div className="rounded-2xl bg-white/5 p-3.5">
            <div className="text-white/40 text-[10px] mb-1">{t('profile.roi')}</div>
            <div className="text-lg font-bold tabular-nums text-white/30">—</div>
          </div>
          <div className="rounded-2xl bg-white/5 p-3.5">
            <div className="text-white/40 text-[10px] mb-1">{t('profile.hoursAtTable')}</div>
            <div className="text-lg font-bold tabular-nums text-white/30">—</div>
          </div>
        </div>
      </div>

      {/* Menu */}
      <div className="flex-1 px-4">
        <div className="rounded-2xl bg-white/5 divide-y divide-white/5 overflow-hidden">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.label}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/5 transition-colors"
              onClick={() => (item.onClick ? item.onClick() : item.to && navigate(item.to))}
            >
              <span className="text-white/40">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{item.label}</div>
                {item.sub && <div className="text-xs text-white/30">{item.sub}</div>}
              </div>
              <ChevronRight size={16} className="text-white/20 flex-shrink-0" />
            </button>
          ))}
          <button
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/5 transition-colors"
            onClick={() => { logout(); navigate('/'); }}
          >
            <span className="text-red-400"><LogOut size={20} /></span>
            <span className="flex-1 text-sm font-medium text-red-400">{t('nav.logout')}</span>
          </button>
        </div>
      </div>

      <div className="pb-24" />
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
}
