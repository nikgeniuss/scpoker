// Конфиг первым импортом — он сам грузит .env. Иначе другие модули прочитают process.env слишком рано.
import { ALLOWED_ORIGINS } from './config.js';
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

// Платежи (ROADMAP §11.1): депозиты/выводы используют отдельный BankrollService-инстанс
// (paymentsBankroll), но нотификации (онлайн-обновление баланса, инбокс) идут через тот же
// GameManager/io, что и игра — колбэки, чтобы payments-домен не зависел от GameManager напрямую (§0.11).
setBankrollNotifier((userId, chips) => gameManager.notifyBankroll(userId, chips));
setPaymentsInboxNotifier((userId, type, text) => gameManager.sendInboxNotification(userId, type, text));
startDepositPolling(30_000, () => gameManager.getSettings().payments);

// Турниры (ROADMAP §10 «Турниры», SNG v1) — оркестрация поверх GameManager (createTournamentTable/
// seatTournamentPlayer/setTableBlinds/closeTournamentTable + onTournamentBust колбэк).
setTournamentBankrollNotifier((userId, chips) => gameManager.notifyBankroll(userId, chips));
const tournamentManager = new TournamentManager(gameManager);
tournamentManager.restoreTournaments();

// Роуты по доменам (ROADMAP §9.3-C). Публичные пути — на '/', auth/admin — под своими префиксами.
app.use('/', createPublicRouter(gameManager));
app.use('/api/auth', createAuthRouter());
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

// Весь socket-слой (handshake JWT + single-session + обработчики событий).
registerSocketHandlers(io, gameManager);

// Одноразовая миграция: проставить publicId старым юзерам без него (см. 10.8)
migratePublicIds();

const PORT = Number(process.env.PORT) || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port ' + PORT);
});
