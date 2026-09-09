// Конфиг первым импортом — он сам грузит .env. Иначе другие модули прочитают process.env слишком рано.
import { ALLOWED_ORIGINS, TELEGRAM_BOT_TOKEN } from './config.js';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { GameManager } from './game/GameManager.js';
import { recordHandStat } from './game/statsService.js';
import { recordRoomCreated } from './game/roomEvents.js';
import { recordFrozenTable } from './game/frozenTableLog.js';
import { migratePublicIds } from './auth/auth.js';
import { IMAGES_DIR } from './decks/decks.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { createPublicRouter } from './routes/public.routes.js';
import { createTemplatesRouter } from './routes/templates.routes.js';
import { createNotesRouter } from './routes/notes.routes.js';
import { createHandsRouter } from './routes/hands.routes.js';
import { createInboxRouter } from './routes/inbox.routes.js';
import { createClubRouter } from './routes/club.routes.js';
import { createPaymentsRouter } from './routes/payments.routes.js';
import { createPaymentsAdminRouter } from './routes/paymentsAdmin.routes.js';
import { recordHand } from './game/handHistory.js';
import { registerSocketHandlers } from './socket/registerSocketHandlers.js';
import { setBankrollNotifier } from './payments/paymentsBankroll.js';
import { setPaymentsInboxNotifier } from './payments/paymentsInbox.js';
import { start as startDepositPolling } from './payments/depositPollingService.js';
import { TournamentManager } from './game/tournament/TournamentManager.js';
import { setTournamentBankrollNotifier } from './game/tournament/tournamentBankroll.js';
import { createTournamentsRouter } from './routes/tournaments.routes.js';
import { createTournamentsAdminRouter } from './routes/tournamentsAdmin.routes.js';
import { createPromoCodesAdminRouter } from './routes/promoCodesAdmin.routes.js';
import { createRakebackRouter } from './routes/rakeback.routes.js';
import { createStreakRouter } from './routes/streak.routes.js';
import { createAchievementsRouter } from './routes/achievements.routes.js';
import { createMissionsRouter } from './routes/missions.routes.js';
import { createChestsRouter } from './routes/chests.routes.js';
import { createRaceRouter } from './routes/race.routes.js';
import { start as startRaceScheduler } from './game/raceService.js';
import { createReferralRouter } from './routes/referral.routes.js';
import { start as startReferralScheduler } from './game/referralService.js';
import { start as startBackups } from './backup/backupService.js';
import { createShopRouter } from './routes/shop.routes.js';
import { createInventoryRouter } from './routes/inventory.routes.js';
import { createRewardsWalletRouter } from './routes/rewardsWallet.routes.js';
import { createResponsibleGamblingRouter } from './routes/responsibleGambling.routes.js';
import { createProfileRouter } from './routes/profile.routes.js';
import { start as startTableTimeTicker } from './game/tableTimeService.js';
import { startBot } from './bot/bot.js';
import { installCrashAlerts, sendAlert, isAlertingEnabled } from './monitoring/alertService.js';

// CORS:
// - В dev (ALLOWED_ORIGINS не задан) — origin: '*', credentials: false.
// - В проде — origin: whitelist + credentials: true.
// origin: '*' + credentials: true в браузере не работает — нельзя смешивать.
const corsConfig =
  ALLOWED_ORIGINS === '*'
    ? { origin: '*' as const, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], credentials: false }
    : { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], credentials: true };

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsConfig,
  transports: ['websocket', 'polling'],
});

app.use(cors(corsConfig));
app.use(express.json());

// Статика колод карт: images/<deckName>/*.png → /decks/<deckName>/*.png.
// Картинки публичные (нужны всем игрокам для отрисовки карт), auth не требуется.
app.use(
  '/decks',
  express.static(IMAGES_DIR, {
    maxAge: 0,
    etag: false,
    lastModified: false,
    fallthrough: true,
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    },
  }),
);

const gameManager = new GameManager(io);
// Трекинг статистики раздач (ROADMAP §10.10 «Фаза 3») — пишем результаты людей в hands.json.
gameManager.statsRecorder = recordHandStat;
// Лог открытия столов (метрика «столов открыто» в админ-вкладке «Данные»).
gameManager.roomEventRecorder = recordRoomCreated;
// История раздач (ROADMAP §10.10) — снимок каждой раздачи в hands-detailed.json.
gameManager.handRecorder = recordHand;
// Лог восстановлений зависших столов (table watchdog, ROADMAP) — для диагностики.
gameManager.frozenTableRecorder = recordFrozenTable;
// Восстановление активных раздач после рестарта (ROADMAP §9.2) — строго после колбэков выше.
gameManager.restoreActiveHands();
// Watchdog зависших столов: проверка каждые 15с, мягкое восстановление (ROADMAP).
gameManager.startTableWatchdog();
// Лимит времени сессии (ROADMAP §11.2): проверка каждые 60с, только предупреждение.
gameManager.startSessionTimeWatchdog();

// Платежи (ROADMAP §11.1): депозиты/выводы используют отдельный BankrollService-инстанс
// (paymentsBankroll), но нотификации (онлайн-обновление баланса, инбокс) идут через тот же
// GameManager/io, что и игра — колбэки, чтобы payments-домен не зависел от GameManager напрямую (§0.11).
setBankrollNotifier((userId, chips) => gameManager.notifyBankroll(userId, chips));
setPaymentsInboxNotifier((userId, type, text) => gameManager.sendInboxNotification(userId, type, text));
startDepositPolling(30_000, () => gameManager.getSettings().payments, () => gameManager.getSettings().responsibleGambling);

// Турниры (ROADMAP §10 «Турниры», SNG v1) — оркестрация поверх GameManager (createTournamentTable/
// seatTournamentPlayer/setTableBlinds/closeTournamentTable + onTournamentBust колбэк).
setTournamentBankrollNotifier((userId, chips) => gameManager.notifyBankroll(userId, chips));
const tournamentManager = new TournamentManager(gameManager);
tournamentManager.restoreTournaments();

// Роуты по доменам (ROADMAP §9.3-C). Публичные пути — на '/', auth/admin — под своими префиксами.
app.use('/', createPublicRouter(gameManager));
app.use('/api/auth', createAuthRouter(gameManager));
app.use('/api/admin', createAdminRouter(gameManager));
app.use('/api/templates', createTemplatesRouter());
app.use('/api/notes', createNotesRouter());
app.use('/api/hands', createHandsRouter());
app.use('/api/inbox', createInboxRouter());
app.use('/api/clubs', createClubRouter());
app.use('/api/payments', createPaymentsRouter(gameManager));
app.use('/api/admin/payments', createPaymentsAdminRouter());
app.use('/api/tournaments', createTournamentsRouter(tournamentManager));
app.use('/api/admin/tournaments', createTournamentsAdminRouter(tournamentManager));
app.use('/api/admin/promo-codes', createPromoCodesAdminRouter(tournamentManager));
app.use('/api/rakeback', createRakebackRouter());
app.use('/api/streak', createStreakRouter());
app.use('/api/achievements', createAchievementsRouter());
app.use('/api/missions', createMissionsRouter());
app.use('/api/chests', createChestsRouter());
app.use('/api/race', createRaceRouter());
startRaceScheduler(15 * 60_000); // проверка закрытия периода раз в 15 мин — период измеряется днями, точность не критична
app.use('/api/referral', createReferralRouter());
startReferralScheduler(15 * 60_000); // батч-проверка порога раздач по всем непогашенным связям

// Резервное копирование server/data (ROADMAP §11.3): git-история изменений + суточные копии,
// заодно уборка брошенных временных файлов storage.ts. Пишет в server/backups (вне nodemon-watch,
// рестарт не триггерит). Раз в 15 минут — данные меняются каждой раздачей, но снимок дешёвый.
startBackups(15 * 60_000);
app.use('/api/shop', createShopRouter(tournamentManager, () => gameManager.getSettings().paidFeatures.hudMode));
app.use('/api/inventory', createInventoryRouter());
app.use('/api/rewards-wallet', createRewardsWalletRouter());
app.use('/api/responsible-gambling', createResponsibleGamblingRouter(gameManager));
app.use('/api/profile', createProfileRouter());
// Тик «Часов за столом» (ROADMAP §9.1): раз в минуту всем сидящим за столами начисляется минута.
// Не по событиям выхода — их легко пропустить (leave/disconnect/bust/kick) и рестарт теряет сессию.
startTableTimeTicker(60_000, () => gameManager.getSeatedHumanIds());

// Весь socket-слой (handshake JWT + single-session + обработчики событий).
registerSocketHandlers(io, gameManager);

// Одноразовая миграция: проставить publicId старым юзерам без него (см. 10.8)
migratePublicIds();

// Меню бота (инлайн-кнопки) — опционально, как и TG MiniApp-авторизация: без токена просто не запускается.
if (TELEGRAM_BOT_TOKEN) {
  void startBot();
}

// Алерты о падении процесса (ROADMAP §11.3). Ставим ПОСЛЕ инициализации всего остального, но до
// listen: раньше падение можно было заметить только зайдя на машину и посмотрев консоль.
installCrashAlerts();

const PORT = Number(process.env.PORT) || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port ' + PORT);
  // Сообщение о старте — это и проверка канала, и сигнал о незамеченном рестарте: частые
  // «сервер поднялся» подряд означают крэш-луп, даже если сам крэш-алерт не дошёл.
  if (isAlertingEnabled()) void sendAlert('startup', `Сервер запущен на порту ${PORT}`);
});
