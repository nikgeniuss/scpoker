import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTimebankConfig } from '../../hooks/useTimebankConfig';
import { useAuthStore } from '../../store/authStore';
import { useClubStore } from '../../store/clubStore';
import type { CreateRoomOptions as CreateOptions, GameFormat } from '@poker-room/shared';
import { Toggle, Stepper, Segmented, RangeSlider, DualRangeSlider, Dropdown, SettingRow, InfoSheet } from './createControls';
import { fetchTemplates, putTemplates, type RoomTemplate } from '../../config/roomTemplates';
import { formatMoney, parseMoney } from '../../config/chipFormat';

const DEFAULT_TURN_DURATION_SEC = 15;
const DEFAULT_BUYIN_MIN_BB = 20;
const DEFAULT_BUYIN_MAX_BB = 100;

interface CreateRoomModalProps {
  onClose: () => void;
  onSubmit: (opts: CreateOptions) => void;
}

type FormatTab = 'cash' | 'sng' | 'mtt';

export const CreateRoomModal = ({ onClose, onSubmit }: CreateRoomModalProps) => {
  const { t } = useTranslation();

  // Пресеты блайндов по уровням ставок (см. roadmap 10.6)
  const BLIND_PRESETS = [
    { id: 'micro', label: t('createRoomModal.presetMicro'), sb: 1, bb: 2 },
    { id: 'low', label: t('createRoomModal.presetLow'), sb: 5, bb: 10 },
    { id: 'mid', label: t('createRoomModal.presetMid'), sb: 25, bb: 50 },
    { id: 'high', label: t('createRoomModal.presetHigh'), sb: 100, bb: 200 },
  ] as const;

  const TURN_DURATION_OPTS = [13, 15, 18, 20, 25].map((s) => ({ value: s, label: t('createRoomModal.secOption', { count: s }) }));

  // Тексты bottom-sheet'ов для инфо-«i». Клубные формулировки убраны (memory no-clubs).
  const INFO: Record<string, { title: string; lines: string[] }> = {
    badbeat: {
      title: t('createRoomModal.infoBadBeatTitle'),
      lines: [
        t('createRoomModal.infoBadBeatLine1'),
        t('createRoomModal.infoBadBeatLine2'),
        t('createRoomModal.infoBadBeatLine3'),
      ],
    },
    squid: { title: t('createRoomModal.infoSquidTitle'), lines: [t('createRoomModal.infoSquidLine')] },
    aof: { title: t('createRoomModal.infoAofTitle'), lines: [t('createRoomModal.infoAofLine')] },
    straddle: { title: t('createRoomModal.infoStraddleTitle'), lines: [t('createRoomModal.infoStraddleLine')] },
    calltime: { title: t('createRoomModal.infoCallTimeTitle'), lines: [t('createRoomModal.infoCallTimeLine')] },
    norathole: { title: t('createRoomModal.infoNoRatholeTitle'), lines: [t('createRoomModal.infoNoRatholeLine')] },
    bombpot: { title: t('createRoomModal.infoBombPotTitle'), lines: [t('createRoomModal.infoBombPotLine')] },
    ev: { title: t('createRoomModal.infoEvTitle'), lines: [t('createRoomModal.infoEvLine')] },
    noturn: { title: t('createRoomModal.infoNoTurnTitle'), lines: [t('createRoomModal.infoNoTurnLine')] },
    runtable: { title: t('createRoomModal.infoRunTableTitle'), lines: [t('createRoomModal.infoRunTableLine')] },
  };

  const [format] = useState<FormatTab>('cash'); // SNG/Турнир — disabled (memory game_formats)
  const [variant, setVariant] = useState<GameFormat>('nlh'); // NLH / Шорт-дэк (memory game_formats)
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [turnDurationSec, setTurnDurationSec] = useState<number>(DEFAULT_TURN_DURATION_SEC);
  const [buyInMinBb, setBuyInMinBb] = useState<number>(DEFAULT_BUYIN_MIN_BB);
  const [buyInMaxBb, setBuyInMaxBb] = useState<number>(DEFAULT_BUYIN_MAX_BB);
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState('');
  const [rakePercent, setRakePercent] = useState(0); // 0 = рейк выключен
  const [rakeCapBb, setRakeCapBb] = useState(100); // 100 = «Без Cap» (в пределах валидации 0..100)
  const [ante, setAnte] = useState(0); // фишки, 0 = нет
  const [autoStartPlayers, setAutoStartPlayers] = useState(2);
  const [sessionHours, setSessionHours] = useState(0); // 0 = без ограничения
  const [sitOutTimeoutMin, setSitOutTimeoutMin] = useState(30); // сит-аут при дисконнекте, 5..30 мин
  const [waitlistDelayMin, setWaitlistDelayMin] = useState(2); // задержка авто-посадки из очереди, 2..10 мин
  const [infoKey, setInfoKey] = useState<string | null>(null);
  const [templates, setTemplates] = useState<RoomTemplate[]>([]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const { tbLocal, setTbLocal, showTimebank } = useTimebankConfig();
  const token = useAuthStore((s) => s.token);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const myClub = useClubStore((s) => s.myClub);
  const [clubOnly, setClubOnly] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [autoExtendSession, setAutoExtendSession] = useState(false);
  // Доделка §10.6 (2026-06-26) — спец-режимы стола, все автоматические (без опта на раздачу).
  const [straddleEnabled, setStraddleEnabled] = useState(false);
  const [noTurnNoShowEnabled, setNoTurnNoShowEnabled] = useState(false);
  const [bombPotEnabled, setBombPotEnabled] = useState(false);
  const [antiCollusionEnabled, setAntiCollusionEnabled] = useState(false);
  const [doubleBoardEnabled, setDoubleBoardEnabled] = useState(false);
  const [rimtEnabled, setRimtEnabled] = useState(false);
  const [evCashoutEnabled, setEvCashoutEnabled] = useState(false);

  // Загрузка сохранённых шаблонов с сервера
  useEffect(() => {
    if (token) fetchTemplates(token).then(setTemplates);
  }, [token]);

  const activePresetId = BLIND_PRESETS.find((p) => p.sb === smallBlind && p.bb === bigBlind)?.id ?? null;
  const noop = () => undefined;
  const openInfo = (k: string) => () => setInfoKey(k);

  // Собрать текущий конфиг в CreateRoomOptions (для submit и сохранения шаблона).
  const buildOpts = (): CreateOptions => ({
    name: name.trim(),
    description: description.trim().length > 0 ? description.trim() : undefined,
    smallBlind,
    bigBlind,
    maxPlayers,
    turnDurationSec,
    buyInMinBb,
    buyInMaxBb,
    password: isPrivate ? password : undefined,
    timebank: showTimebank && tbLocal ? { ...tbLocal } : undefined,
    rake: rakePercent > 0 ? { percent: rakePercent, capBb: rakeCapBb } : undefined,
    ante: ante > 0 ? Math.min(ante, bigBlind) : undefined,
    autoStartPlayers: Math.min(autoStartPlayers, maxPlayers),
    sessionDurationHours: sessionHours > 0 ? sessionHours : undefined,
    sitOutTimeoutMin,
    waitlistDelayMin,
    format: variant,
    clubId: myClub && clubOnly ? myClub.id : undefined,
    pinned: isAdmin ? pinned : undefined,
    autoExtendSession: sessionHours > 0 && autoExtendSession ? true : undefined,
    straddleEnabled: straddleEnabled || undefined,
    noTurnNoShowEnabled: noTurnNoShowEnabled || undefined,
    bombPotEnabled: bombPotEnabled || undefined,
    antiCollusionEnabled: antiCollusionEnabled || undefined,
    doubleBoardEnabled: doubleBoardEnabled || undefined,
    rimtEnabled: rimtEnabled || undefined,
    evCashoutEnabled: evCashoutEnabled || undefined,
  });

  // Применить шаблон ко всем полям формы.
  const applyTemplate = (o: CreateOptions) => {
    setName(o.name);
    setDescription(o.description ?? '');
    setSmallBlind(o.smallBlind);
    setBigBlind(o.bigBlind);
    setMaxPlayers(o.maxPlayers);
    setTurnDurationSec(o.turnDurationSec);
    setBuyInMinBb(o.buyInMinBb);
    setBuyInMaxBb(o.buyInMaxBb);
    setIsPrivate(!!o.password);
    setPassword(o.password ?? '');
    setRakePercent(o.rake?.percent ?? 0);
    setRakeCapBb(o.rake?.capBb ?? 100);
    setAnte(o.ante ?? 0);
    setAutoStartPlayers(o.autoStartPlayers ?? 2);
    setSessionHours(o.sessionDurationHours ?? 0);
    setSitOutTimeoutMin(o.sitOutTimeoutMin ?? 30);
    setWaitlistDelayMin(o.waitlistDelayMin ?? 2);
    setVariant(o.format ?? 'nlh');
    setPinned(!!o.pinned);
    setAutoExtendSession(!!o.autoExtendSession);
    setStraddleEnabled(!!o.straddleEnabled);
    setNoTurnNoShowEnabled(!!o.noTurnNoShowEnabled);
    setBombPotEnabled(!!o.bombPotEnabled);
    setAntiCollusionEnabled(!!o.antiCollusionEnabled);
    setDoubleBoardEnabled(!!o.doubleBoardEnabled);
    setRimtEnabled(!!o.rimtEnabled);
    setEvCashoutEnabled(!!o.evCashoutEnabled);
    if (o.timebank && tbLocal) setTbLocal(o.timebank);
  };

  const doSaveTemplate = async () => {
    if (!token) return;
    const tName =
      `${smallBlind}/${bigBlind} · ${maxPlayers}max` +
      (rakePercent > 0 ? ` · ${t('createRoomModal.templateNameRake', { percent: rakePercent })}` : '') +
      (ante > 0 ? ` · ${t('createRoomModal.templateNameAnte', { amount: ante })}` : '');
    const next = [...templates.filter((tpl) => tpl.name !== tName), { name: tName, opts: buildOpts() }];
    try {
      setTemplates(await putTemplates(token, next));
      toast.success(t('createRoomModal.templateSaved'));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doDeleteTemplate = async (tName: string) => {
    if (!token) return;
    try {
      setTemplates(await putTemplates(token, templates.filter((tpl) => tpl.name !== tName)));
      toast.success(t('createRoomModal.templateDeleted'));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doRenameTemplate = async (oldName: string) => {
    const newName = editValue.trim();
    if (!token || !newName || newName === oldName) {
      setEditingName(null);
      return;
    }
    const target = templates.find((tpl) => tpl.name === oldName);
    if (!target) {
      setEditingName(null);
      return;
    }
    // Заменяем старое имя; если newName уже есть — перезаписываем (без дублей).
    const next = templates
      .filter((tpl) => tpl.name !== oldName && tpl.name !== newName)
      .concat({ name: newName, opts: target.opts });
    try {
      setTemplates(await putTemplates(token, next));
      toast.success(t('createRoomModal.templateRenamed'));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEditingName(null);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 3) return toast.error(t('createRoomModal.validationNameLength'));
    if (isPrivate && password.length < 4) return toast.error(t('createRoomModal.validationPasswordLength'));
    if (buyInMinBb < 5 || buyInMinBb > 1000) return toast.error(t('createRoomModal.validationMinBuyIn'));
    if (buyInMaxBb < buyInMinBb || buyInMaxBb > 1000) return toast.error(t('createRoomModal.validationMaxBuyIn'));
    if (description.trim().length > 200) return toast.error(t('createRoomModal.validationDescriptionLength'));
    if (showTimebank && tbLocal && tbLocal.capSec < tbLocal.startSec) {
      return toast.error(t('createRoomModal.validationTimebankCap'));
    }
    onSubmit(buildOpts());
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-stretch md:items-center justify-center md:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.97, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0f0f0f] w-full h-full md:h-auto md:max-h-[90vh] md:max-w-md md:rounded-3xl md:border md:border-white/10 flex flex-col overflow-hidden"
      >
        <form onSubmit={submit} className="flex flex-col h-full min-h-0">
          {/* Шапка */}
          <div className="shrink-0 px-5 pt-4 bg-[#0f0f0f]">
            <div className="flex items-center gap-2 mb-3">
              <button type="button" onClick={onClose} aria-label={t('createRoomModal.back')} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/5 text-white">
                <ChevronLeft size={22} />
              </button>
              <h3 className="text-lg font-bold text-white">
                {t('createRoomModal.titlePrefix')} <span className="text-emerald-400">{variant === 'shortdeck' ? t('createRoomModal.shortdeck') : t('createRoomModal.nlh')}</span>
              </h3>
            </div>
            {/* Табы форматов: Кольцевая активна; SNG/Турнир — disabled (memory game_formats) */}
            <div className="flex">
              {[
                { id: 'cash', label: t('createRoomModal.tabCash'), enabled: true },
                { id: 'sng', label: t('createRoomModal.tabSng'), enabled: false },
                { id: 'mtt', label: t('createRoomModal.tabMtt'), enabled: false },
              ].map((ft) => (
                <div
                  key={ft.id}
                  className={
                    'flex-1 text-center pb-2 text-sm font-semibold border-b-2 ' +
                    (format === ft.id
                      ? 'text-white border-emerald-500'
                      : ft.enabled
                        ? 'text-gray-400 border-transparent'
                        : 'text-gray-600 border-transparent')
                  }
                  title={ft.enabled ? '' : t('createRoomModal.soonTooltip')}
                >
                  {ft.label}
                  {!ft.enabled && <span className="block text-[9px] text-gray-600">{t('createRoomModal.soon')}</span>}
                </div>
              ))}
            </div>
            {/* Вариант игры: NLH / Шорт-дэк (memory game_formats — только эти два) */}
            <div className="flex gap-2 mt-3">
              {([
                { id: 'nlh', label: t('createRoomModal.nlh') },
                { id: 'shortdeck', label: t('createRoomModal.shortdeck') },
              ] as { id: GameFormat; label: string }[]).map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariant(v.id)}
                  className={
                    'flex-1 py-1.5 rounded-lg text-sm font-semibold border transition ' +
                    (variant === v.id
                      ? 'bg-emerald-600/20 border-emerald-500 text-white'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:text-white')
                  }
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Тело (скролл) */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4">
            {/* Загрузка сохранённых шаблонов */}
            {templates.length > 0 && (
              <div className="pt-4">
                <div className="text-xs text-gray-400 mb-1">{t('createRoomModal.templatesLabel')}</div>
                <div className="flex flex-wrap gap-2">
                  {templates.map((tpl) => (
                    <div
                      key={tpl.name}
                      className="flex items-center gap-1 bg-gray-800 border border-white/10 rounded-lg pl-2 pr-1 py-1"
                    >
                      {editingName === tpl.name ? (
                        <>
                          <input
                            value={editValue}
                            autoFocus
                            maxLength={60}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') doRenameTemplate(tpl.name);
                              if (e.key === 'Escape') setEditingName(null);
                            }}
                            className="w-32 bg-gray-900 border border-white/10 rounded px-2 py-0.5 text-white text-sm outline-none focus:border-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={() => doRenameTemplate(tpl.name)}
                            aria-label={t('createRoomModal.saveTemplateName')}
                            className="w-5 h-5 flex items-center justify-center rounded text-emerald-400 hover:bg-white/5"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingName(null)}
                            aria-label={t('createRoomModal.cancel')}
                            className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:bg-white/5 text-base leading-none"
                          >
                            ×
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => applyTemplate(tpl.opts)} className="text-sm text-white pl-1">
                            {tpl.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingName(tpl.name);
                              setEditValue(tpl.name);
                            }}
                            aria-label={t('createRoomModal.renameTemplate')}
                            className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-emerald-400 hover:bg-white/5 text-xs"
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            onClick={() => doDeleteTemplate(tpl.name)}
                            aria-label={t('createRoomModal.deleteTemplate')}
                            className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-red-400 hover:bg-white/5 text-base leading-none"
                          >
                            ×
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Заголовок стола */}
            <div className="pt-4">
              <label className="text-xs text-gray-400 mb-1 block">{t('createRoomModal.titleFieldLabel')}</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('createRoomModal.titlePlaceholder')}
                className="w-full bg-gray-800 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500"
              />
            </div>

            {/* Базовые тогглы (часть — «скоро») */}
            {myClub && (
              <SettingRow label={t('createRoomModal.clubOnlyLabel') + ' ' + myClub.name}>
                <Toggle checked={clubOnly} onChange={setClubOnly} />
              </SettingRow>
            )}
            <SettingRow label={t('createRoomModal.privateGames')}>
              <Toggle checked={isPrivate} onChange={setIsPrivate} />
            </SettingRow>
            {isPrivate && (
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('createRoomModal.passwordPlaceholder')}
                className="w-full bg-gray-800 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500 mt-2"
              />
            )}
            {isAdmin && (
              <SettingRow label={t('createRoomModal.pinToTop')}>
                <Toggle checked={pinned} onChange={setPinned} />
              </SettingRow>
            )}
            <SettingRow label={t('createRoomModal.badBeatJackpot')} soon disabled onInfo={openInfo('badbeat')}>
              <Toggle checked={false} onChange={noop} disabled />
            </SettingRow>
            <SettingRow label={t('createRoomModal.squidGame')} soon disabled onInfo={openInfo('squid')}>
              <Toggle checked={false} onChange={noop} disabled />
            </SettingRow>
            <SettingRow label={t('createRoomModal.allInOrFold')} soon disabled onInfo={openInfo('aof')}>
              <Toggle checked={false} onChange={noop} disabled />
            </SettingRow>

            {/* Размер стола + время действия */}
            <SettingRow label={t('createRoomModal.tableSize')}>
              <Stepper
                display={t('createRoomModal.maxPlayersStepper', { count: maxPlayers })}
                onDec={() => setMaxPlayers((v) => Math.max(2, v - 1))}
                onInc={() => setMaxPlayers((v) => Math.min(12, v + 1))}
              />
            </SettingRow>
            <div className="py-3 border-b border-white/5">
              <div className="text-sm text-white mb-2">{t('createRoomModal.turnDuration')}</div>
              <Segmented options={TURN_DURATION_OPTS} value={turnDurationSec} onChange={setTurnDurationSec} />
            </div>

            {/* Таймбанк */}
            <SettingRow label={t('createRoomModal.timebank')}>
              <Toggle
                checked={!!tbLocal?.enabled}
                onChange={(v) => tbLocal && setTbLocal({ ...tbLocal, enabled: v })}
                disabled={!showTimebank || !tbLocal}
              />
            </SettingRow>
            {tbLocal?.enabled && (
              <>
                <SettingRow label={t('createRoomModal.timebankStart')} disabled={!showTimebank}>
                  <Dropdown
                    value={tbLocal.startSec}
                    disabled={!showTimebank}
                    onChange={(v) => setTbLocal({ ...tbLocal, startSec: v, capSec: Math.max(tbLocal.capSec, v) })}
                    options={[20, 30, 40, 50, 60].map((s) => ({ value: s, label: t('createRoomModal.secOption', { count: s }) }))}
                  />
                </SettingRow>
                <div className={'py-3 border-b border-white/5 ' + (!showTimebank ? 'opacity-50' : '')}>
                  <div className="text-sm text-white mb-2">{t('createRoomModal.timebankBonusAfter')}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Dropdown
                      value={tbLocal.bonusEveryHands}
                      disabled={!showTimebank}
                      onChange={(v) => setTbLocal({ ...tbLocal, bonusEveryHands: v })}
                      options={[5, 10, 15, 20, 30].map((n) => ({ value: n, label: t('createRoomModal.handsOption', { count: n }) }))}
                    />
                    <Dropdown
                      value={tbLocal.bonusSec}
                      disabled={!showTimebank}
                      onChange={(v) => setTbLocal({ ...tbLocal, bonusSec: v })}
                      options={[10, 20, 30, 40, 60].map((s) => ({ value: s, label: t('createRoomModal.secOption', { count: s }) }))}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Блайнды */}
            <div className="flex items-center justify-between py-2 text-sm pt-3">
              <span className="text-gray-400">{t('createRoomModal.blindsLabel')}</span>
              <span className="text-white font-bold tabular-nums">{formatMoney(smallBlind)} / {formatMoney(bigBlind)}</span>
            </div>
            <div className="py-2">
              <div className="text-xs text-gray-400 mb-2">{t('createRoomModal.blindsSizeLabel')}</div>
              <Segmented<string>
                options={BLIND_PRESETS.map((p) => ({ value: p.id as string, label: p.label }))}
                value={activePresetId ?? ''}
                onChange={(id) => {
                  const p = BLIND_PRESETS.find((x) => x.id === id);
                  if (p) {
                    setSmallBlind(p.sb);
                    setBigBlind(p.bb);
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 py-2 border-b border-white/5">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">{t('createRoomModal.smallBlindLabel')}</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={smallBlind / 100}
                  onChange={(e) => setSmallBlind(parseMoney(e.target.value))}
                  className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">{t('createRoomModal.bigBlindLabel')}</label>
                <input
                  type="number"
                  min="0.02"
                  step="0.01"
                  value={bigBlind / 100}
                  onChange={(e) => setBigBlind(parseMoney(e.target.value))}
                  className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <SettingRow label={t('createRoomModal.ante')}>
              <Stepper
                display={ante === 0 ? t('createRoomModal.anteNone') : formatMoney(ante)}
                onDec={() => setAnte((v) => Math.max(0, v - Math.max(1, Math.round(bigBlind / 4))))}
                onInc={() => setAnte((v) => Math.min(bigBlind, v + Math.max(1, Math.round(bigBlind / 4))))}
              />
            </SettingRow>
            <SettingRow label={t('createRoomModal.straddle')} onInfo={openInfo('straddle')}>
              <Toggle checked={straddleEnabled} onChange={setStraddleEnabled} />
            </SettingRow>

            {/* Бай-ин */}
            <div className="flex items-center justify-between py-2 text-sm pt-3">
              <span className="text-gray-400">{t('createRoomModal.buyInBb')}</span>
              <span className="text-white font-bold tabular-nums">{buyInMinBb} / {buyInMaxBb}</span>
            </div>
            <div className="py-3 border-b border-white/5">
              <DualRangeSlider
                min={5}
                max={1000}
                step={5}
                low={buyInMinBb}
                high={buyInMaxBb}
                onChange={(lo, hi) => {
                  setBuyInMinBb(lo);
                  setBuyInMaxBb(hi);
                }}
              />
            </div>
            {/* Рейк (функционально) — два дропдауна: процент + Cap. 0% = выключен. */}
            <div className="py-3 border-b border-white/5 flex items-center justify-between gap-2">
              <span className="text-sm text-white shrink-0">{t('createRoomModal.rake')}</span>
              <div className="flex gap-2">
                <Dropdown
                  value={rakePercent}
                  onChange={setRakePercent}
                  options={[0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5].map((p) => ({ value: p, label: p + '%' }))}
                />
                <Dropdown
                  value={rakeCapBb}
                  onChange={setRakeCapBb}
                  options={[{ value: 100, label: t('createRoomModal.noCap') }, ...[1, 2, 3, 5, 10].map((c) => ({ value: c, label: c + ' BB' }))]}
                />
              </div>
            </div>

            {/* Прочие игровые опции (в разработке) */}
            <SettingRow label={t('createRoomModal.callTime')} soon disabled onInfo={openInfo('calltime')}>
              <Toggle checked={false} onChange={noop} disabled />
            </SettingRow>
            <SettingRow label={t('createRoomModal.noRathole')} soon disabled onInfo={openInfo('norathole')}>
              <span className="text-sm text-gray-500">{t('createRoomModal.hoursValue', { count: 6 })}</span>
            </SettingRow>
            <div className="pb-3 border-b border-white/5 opacity-40">
              <RangeSlider min={1} max={12} step={1} value={6} onChange={noop} disabled />
            </div>
            <SettingRow label={t('createRoomModal.bombPot')} onInfo={openInfo('bombpot')}>
              <Toggle checked={bombPotEnabled} onChange={setBombPotEnabled} />
            </SettingRow>
            <SettingRow label={t('createRoomModal.doubleBoard')}>
              <Toggle checked={doubleBoardEnabled} onChange={setDoubleBoardEnabled} />
            </SettingRow>
            <SettingRow label={t('createRoomModal.allInInsurance')} soon disabled>
              <Toggle checked={false} onChange={noop} disabled />
            </SettingRow>
            <SettingRow label={t('createRoomModal.evCashout')} onInfo={openInfo('ev')}>
              <Toggle checked={evCashoutEnabled} onChange={setEvCashoutEnabled} />
            </SettingRow>
            <SettingRow label={t('createRoomModal.noTurnNoShow')} onInfo={openInfo('noturn')}>
              <Toggle checked={noTurnNoShowEnabled} onChange={setNoTurnNoShowEnabled} />
            </SettingRow>
            <SettingRow label={t('createRoomModal.autoStart')}>
              <Stepper
                display={t('createRoomModal.playersStepper', { count: autoStartPlayers })}
                onDec={() => setAutoStartPlayers((v) => Math.max(2, v - 1))}
                onInc={() => setAutoStartPlayers((v) => Math.min(maxPlayers, v + 1))}
              />
            </SettingRow>
            <SettingRow label={t('createRoomModal.requiredVpip')} soon disabled>
              <Toggle checked={false} onChange={noop} disabled />
            </SettingRow>

            {/* Ограничение / организация */}
            <SettingRow label={t('createRoomModal.gameRestriction')}>
              <Toggle checked={antiCollusionEnabled} onChange={setAntiCollusionEnabled} />
            </SettingRow>
            <SettingRow label={t('createRoomModal.runItTwice')} onInfo={openInfo('runtable')}>
              <Toggle checked={rimtEnabled} onChange={setRimtEnabled} />
            </SettingRow>
            <SettingRow label={t('createRoomModal.sessionDuration')}>
              <span className="text-sm text-white">{sessionHours === 0 ? t('createRoomModal.noLimit') : sessionHours + ':00'}</span>
            </SettingRow>
            <div className="pb-3 border-b border-white/5">
              <RangeSlider min={0} max={12} step={1} value={sessionHours} onChange={setSessionHours} />
            </div>
            <SettingRow label={t('createRoomModal.autoExtend')} disabled={sessionHours === 0}>
              <Toggle
                checked={autoExtendSession}
                onChange={setAutoExtendSession}
                disabled={sessionHours === 0}
              />
            </SettingRow>
            <SettingRow label={t('createRoomModal.sitOutTimeout')}>
              <span className="text-sm text-white">{t('createRoomModal.minutesValue', { count: sitOutTimeoutMin })}</span>
            </SettingRow>
            <div className="pb-3 border-b border-white/5">
              <RangeSlider min={5} max={30} step={1} value={sitOutTimeoutMin} onChange={setSitOutTimeoutMin} />
            </div>
            <SettingRow label={t('createRoomModal.waitlistDelay')}>
              <span className="text-sm text-white">{t('createRoomModal.minutesValue', { count: waitlistDelayMin })}</span>
            </SettingRow>
            <div className="pb-3 border-b border-white/5">
              <RangeSlider min={2} max={10} step={1} value={waitlistDelayMin} onChange={setWaitlistDelayMin} />
            </div>

            {/* Описание (функционально) */}
            <div className="text-sm text-white pt-3 mb-1">{t('createRoomModal.description')}</div>
            <div className="py-2">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 200))}
                rows={2}
                placeholder={t('createRoomModal.descriptionPlaceholder')}
                className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-emerald-500 resize-none"
              />
              <div className="text-right text-[11px] text-gray-500 mt-0.5">{description.length}/200</div>
            </div>
          </div>

          {/* Фикс-низ */}
          <div className="shrink-0 px-5 py-4 border-t border-white/10 bg-[#0f0f0f] flex gap-3">
            <button
              type="button"
              onClick={doSaveTemplate}
              className="flex-1 py-3 rounded-xl border-2 border-emerald-500 text-white font-bold hover:bg-emerald-500/10"
            >
              {t('createRoomModal.saveTemplateButton')}
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 font-bold text-white"
            >
              {t('createRoomModal.create')}
            </button>
          </div>
        </form>
      </motion.div>

      {/* Bottom-sheet инфо */}
      <AnimatePresence>
        {infoKey && INFO[infoKey] && (
          <InfoSheet title={INFO[infoKey].title} onClose={() => setInfoKey(null)}>
            {INFO[infoKey].lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </InfoSheet>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
