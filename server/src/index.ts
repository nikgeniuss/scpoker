// Конфиг первым импортом — он сам грузит .env. Иначе другие модули прочитают process.env слишком рано.
import { ALLOWED_ORIGINS } from './config.js';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { GameManager } from './game/GameManager.js';
import { recordHandStat } from './game/statsService.js';
import { recordRoomCreated } from './game/roomEvents.js';
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
import { recordHand } from './game/handHistory.js';
import { registerSocketHandlers } from './socket/registerSocketHandlers.js';

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

// Роуты по доменам (ROADMAP §9.3-C). Публичные пути — на '/', auth/admin — под своими префиксами.
app.use('/', createPublicRouter(gameManager));
app.use('/api/auth', createAuthRouter());
app.use('/api/admin', createAdminRouter(gameManager));
app.use('/api/templates', createTemplatesRouter());
app.use('/api/notes', createNotesRouter());
app.use('/api/hands', createHandsRouter());
app.use('/api/inbox', createInboxRouter());
app.use('/api/clubs', createClubRouter());

// Весь socket-слой (handshake JWT + single-session + обработчики событий).
registerSocketHandlers(io, gameManager);

// Одноразовая миграция: проставить publicId старым юзерам без него (см. 10.8)
migratePublicIds();

const PORT = Number(process.env.PORT) || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port ' + PORT);
});
