import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ChevronLeft, Ticket, Coins, Sparkles } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useShopStore, type ShopItem } from '../store/shopStore';
import { useInventoryStore, type CosmeticItem } from '../store/inventoryStore';
import { useRewardsWalletStore } from '../store/rewardsWalletStore';
import { useTournamentStore } from '../store/tournamentStore';
import { formatMoney } from '../config/chipFormat';
import { frameRingClass, tableGlowColor } from '../config/cosmetics';
import type { EquippableCosmeticType } from '../store/inventoryStore';

// Магазин лояльности (ROADMAP §10.21.6) — обмен HUB-коинов на house-funded вход в турнир.
// Игрок выбирает тикет → выбирает открытый турнир с ТЕМ ЖЕ бай-ином (сервер перепроверяет
// совпадение) → «Обменять». Вся логика (debit+promo+redeem) — на сервере, тут только UI-обвязка.
const SHOP_ERROR_KEYS = new Set([
  'item-not-found',
  'tournament-not-found',
  'buyin-mismatch',
  'network-blocked',
  'insufficient-balance',
  'invalid-request',
  'registration-closed',
  'full',
]);
const COSMETICS_ERROR_KEYS = new Set([
  'shop-disabled',
  'item-not-found',
  'already-owned',
  'insufficient-balance',
  'not-owned',
  'invalid-request',
]);
// Слот экипировки по типу — эмодзи сюда не входит (не экипируется, достаточно владения,
// можно использовать сразу несколько купленных эмодзи одновременно).
const EQUIP_SLOT: Record<EquippableCosmeticType, 'frame' | 'title' | 'tableGlow'> = {
  avatarFrame: 'frame',
  title: 'title',
  tableGlow: 'tableGlow',
};
const COSMETIC_LABEL_KEY: Record<CosmeticItem['type'], string> = {
  avatarFrame: 'shop.cosmetics.frameLabel',
  title: 'shop.cosmetics.titleLabel',
  emoji: 'shop.cosmetics.emojiLabel',
  tableGlow: 'shop.cosmetics.tableGlowLabel',
};

export const LoyaltyShop = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const { enabled, catalog, loadPublic, redeem } = useShopStore();
  const {
    enabled: cosmeticsEnabled,
    catalog: cosmeticsCatalog,
    owned,
    equipped,
    loadPublic: loadCosmeticsPublic,
    loadMine: loadCosmeticsMine,
    purchase: purchaseCosmetic,
    equip: equipCosmetic,
  } = useInventoryStore();
  const { balance, loadMine } = useRewardsWalletStore();
  const { tournaments, fetchTournaments } = useTournamentStore();
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<Record<string, string>>({});
  const [pendingCosmeticId, setPendingCosmeticId] = useState<string | null>(null);

  useEffect(() => {
    loadPublic();
    loadMine(token);
    loadCosmeticsPublic();
    loadCosmeticsMine(token);
    if (token) fetchTournaments(token);
  }, [loadPublic, loadMine, loadCosmeticsPublic, loadCosmeticsMine, fetchTournaments, token]);

  const handleBuyCosmetic = async (item: CosmeticItem) => {
    setPendingCosmeticId(item.id);
    const result = await purchaseCosmetic(token, item.id);
    setPendingCosmeticId(null);
    if ('error' in result) {
      toast.error(t(COSMETICS_ERROR_KEYS.has(result.error) ? `shop.cosmetics.error.${result.error}` : 'shop.cosmetics.error.unknown'));
      return;
    }
    toast.success(t('shop.cosmetics.bought'));
  };

  const handleToggleEquip = async (item: CosmeticItem) => {
    if (item.type === 'emoji') return; // эмодзи не экипируется — достаточно владения
    const slot = EQUIP_SLOT[item.type];
    const isEquipped = equipped[slot] === item.id;
    setPendingCosmeticId(item.id);
    const result = await equipCosmetic(token, isEquipped ? null : item.id, item.type);
    setPendingCosmeticId(null);
    if ('error' in result) {
      toast.error(t(COSMETICS_ERROR_KEYS.has(result.error) ? `shop.cosmetics.error.${result.error}` : 'shop.cosmetics.error.unknown'));
    }
  };

  const matchingTournaments = (item: ShopItem) =>
    tournaments.filter((tour) => tour.buyIn === item.ticketBuyIn && tour.status === 'registering');

  const handleRedeem = async (item: ShopItem) => {
    const tournamentId = selectedTournament[item.id];
    if (!tournamentId) {
      toast.error(t('shop.pickTournament'));
      return;
    }
    setRedeemingId(item.id);
    const result = await redeem(token, item.id, tournamentId);
    setRedeemingId(null);
    if ('error' in result) {
      toast.error(t(SHOP_ERROR_KEYS.has(result.error) ? `shop.error.${result.error}` : 'shop.error.unknown'));
      return;
    }
    toast.success(t('shop.redeemed'));
    loadMine(token);
    if (token) fetchTournaments(token);
  };

  return (
    <div className="min-h-[100dvh] bg-black text-white">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">
        <div className="relative flex items-center justify-center mb-5">
          <button
            onClick={() => navigate('/rewards')}
            aria-label={t('shop.back')}
            className="absolute left-0 w-10 h-10 flex items-center justify-center rounded-full text-white/80 hover:bg-white/10"
          >
            <ChevronLeft size={26} />
          </button>
          <h1 className="text-xl font-bold">{t('shop.title')}</h1>
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-6 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm text-amber-300 font-bold">
            <Coins size={16} /> {t('shop.balance')}
          </span>
          <span className="text-lg font-black tabular-nums text-amber-300">{balance} HUB</span>
        </div>

        {!enabled ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-gray-400">
            {t('shop.disabled')}
          </div>
        ) : catalog.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-gray-400">
            {t('shop.empty')}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {catalog.map((item) => {
              const options = matchingTournaments(item);
              const canAfford = balance >= item.cost;
              return (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-400/30 flex items-center justify-center flex-shrink-0">
                      <Ticket size={18} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{item.title}</div>
                      <div className="text-xs text-gray-500">{t('shop.buyInValue', { amount: formatMoney(item.ticketBuyIn) })}</div>
                    </div>
                    <div className="text-sm font-black text-amber-400 tabular-nums flex-shrink-0">{item.cost} HUB</div>
                  </div>

                  {options.length === 0 ? (
                    <div className="text-xs text-gray-600">{t('shop.noOpenTournaments')}</div>
                  ) : (
                    <div className="flex gap-2">
                      <select
                        value={selectedTournament[item.id] ?? ''}
                        onChange={(e) => setSelectedTournament((s) => ({ ...s, [item.id]: e.target.value }))}
                        className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-sm text-white outline-none focus:border-emerald-400"
                      >
                        <option value="">{t('shop.selectTournament')}</option>
                        {options.map((tour) => (
                          <option key={tour.id} value={tour.id} className="bg-gray-800">
                            {tour.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleRedeem(item)}
                        disabled={!canAfford || redeemingId === item.id}
                        className="flex-shrink-0 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 text-sm font-bold disabled:opacity-40"
                      >
                        {redeemingId === item.id ? t('shop.redeeming') : t('shop.redeem')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {cosmeticsEnabled && cosmeticsCatalog.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-bold text-gray-400 mb-3">{t('shop.cosmetics.title')}</h2>
            <div className="flex flex-col gap-3">
              {cosmeticsCatalog.map((item) => {
                const isOwned = owned.includes(item.id);
                const isEquippable = item.type !== 'emoji';
                const isEquipped = isEquippable && equipped[EQUIP_SLOT[item.type as EquippableCosmeticType]] === item.id;
                const canAfford = balance >= item.cost;
                const pending = pendingCosmeticId === item.id;
                const glowColor = item.type === 'tableGlow' ? tableGlowColor(item.value) : undefined;
                return (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 flex items-center gap-3">
                    <div
                      className={
                        'w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center flex-shrink-0 ' +
                        (item.type === 'avatarFrame' ? frameRingClass(item.value) : '')
                      }
                      style={glowColor ? { backgroundColor: glowColor } : undefined}
                    >
                      {item.type === 'emoji' ? (
                        <span className="text-xl leading-none">{item.value}</span>
                      ) : (
                        <Sparkles size={18} className="text-emerald-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{item.name}</div>
                      <div className="text-xs text-gray-500">{t(COSMETIC_LABEL_KEY[item.type])}</div>
                    </div>
                    {isOwned ? (
                      isEquippable ? (
                        <button
                          onClick={() => handleToggleEquip(item)}
                          disabled={pending}
                          className={
                            'flex-shrink-0 px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-40 ' +
                            (isEquipped ? 'bg-white/10 border border-white/20' : 'bg-gradient-to-r from-emerald-500 to-green-600')
                          }
                        >
                          {isEquipped ? t('shop.cosmetics.unequip') : t('shop.cosmetics.equip')}
                        </button>
                      ) : (
                        <span className="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-bold bg-white/10 border border-white/20 text-gray-300">
                          {t('shop.cosmetics.owned')}
                        </span>
                      )
                    ) : (
                      <button
                        onClick={() => handleBuyCosmetic(item)}
                        disabled={!canAfford || pending}
                        className="flex-shrink-0 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 text-sm font-bold disabled:opacity-40"
                      >
                        {pending ? t('shop.cosmetics.buying') : `${t('shop.cosmetics.buy')} · ${item.cost} HUB`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
