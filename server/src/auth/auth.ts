import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { readJSON, writeJSON } from './storage.js';
import { JWT_SECRET } from '../config.js';

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: 'player' | 'admin';
  chips: number;
  createdAt: string;
  banned?: boolean;
  publicId?: string; // короткий публичный ID в формате XXXX-XXXX
  country?: string;  // ISO 3166-1 alpha-2 (например, 'RU', 'US')
  telegramId?: number; // ID пользователя в Telegram (из initData.user.id)
  displayName?: string; // имя из Telegram (first_name [+ last_name]) — показывается за столом вместо username
  lastLogin?: string; // ISO-время последнего успешного входа
  alias?: string; // псевдоним-заметка админа (≤40 симв.)
  note?: string;  // произвольное примечание админа (≤500 симв.)
  roomTemplates?: RoomTemplate[]; // сохранённые шаблоны создания стола (per-user)
  opponentNotes?: Record<string, string>; // приватные заметки на оппонентов: targetUserId → текст (≤300 симв.)
  avatarSeed?: string; // выбранный seed аватара (из AVATAR_PRESETS); не задан = фоллбэк на id
}

// Шаблон создания стола. opts хранится opaque (валидируется при createRoom).
export interface RoomTemplate {
  name: string;
  opts: unknown;
}

export interface TelegramUserPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

// Человекочитаемое имя из TG payload для показа за столом: «Имя Фамилия» → @username → tg<id>.
export function tgDisplayName(tg: TelegramUserPayload): string {
  const name = [tg.first_name, tg.last_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (tg.username) return tg.username;
  return `tg${tg.id}`;
}

// Алфавит для publicId — без 0/O/1/I, чтобы не путать визуально (32 символа)
const PUBLIC_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomChunk(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    s += PUBLIC_ID_ALPHABET[Math.floor(Math.random() * PUBLIC_ID_ALPHABET.length)];
  }
  return s;
}

// Сгенерировать уникальный publicId с учётом уже занятых
function generatePublicId(existing: Set<string>): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = `${randomChunk(4)}-${randomChunk(4)}`;
    if (!existing.has(candidate)) return candidate;
  }
  // Маловероятно при 32^8 пространстве — но fallback на uuid-derived хвост
  return `${randomChunk(4)}-${randomChunk(4)}`;
}

// Одноразовая миграция: проставить publicId всем юзерам, у кого его нет.
// Вызывается из index.ts при старте сервера.
export function migratePublicIds(): void {
  try {
    const users = readJSON('users.json') as User[];
    const existing = new Set<string>();
    for (const u of users) if (u.publicId) existing.add(u.publicId);
    let changed = false;
    for (const u of users) {
      if (!u.publicId) {
        u.publicId = generatePublicId(existing);
        existing.add(u.publicId);
        changed = true;
      }
    }
    if (changed) {
      writeJSON('users.json', users);
      console.log(`Migrated publicId for ${users.filter(u => u.publicId).length} user(s)`);
    }
  } catch {
    // users.json нет или повреждён — миграция пропускается
  }
}

// Начальный банкролл при регистрации — берём из settings.json (с fallback на 1000)
function getInitialChips(): number {
  try {
    const s = readJSON('settings.json') as { defaultPlayerChips?: number };
    if (typeof s.defaultPlayerChips === 'number' && s.defaultPlayerChips > 0) {
      return Math.floor(s.defaultPlayerChips);
    }
  } catch {
    // settings.json нет или повреждён — fallback на дефолт ниже
  }
  return 1000;
}

export function registerUser(username: string, password: string, email: string): User | null {
  const users = readJSON('users.json') as User[];

  // Проверка на уникальность username
  if (users.find(u => u.username === username)) {
    return null; // username уже существует
  }

  // Проверка на уникальность email
  if (users.find(u => u.email === email)) {
    return null; // email уже используется
  }

  const existingPublicIds = new Set<string>();
  for (const u of users) if (u.publicId) existingPublicIds.add(u.publicId);

  const newUser: User = {
    id: uuid(),
    username,
    email,
    passwordHash: bcrypt.hashSync(password, 10),
    role: users.length === 0 ? 'admin' : 'player',
    chips: getInitialChips(),
    createdAt: new Date().toISOString(),
    publicId: generatePublicId(existingPublicIds),
  };

  users.push(newUser);
  writeJSON('users.json', users);
  return newUser;
}

export function loginUser(username: string, password: string): string | null {
  const users = readJSON('users.json') as User[];
  const user = users.find(u => u.username === username);

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return null;
  }
  if (user.banned) {
    return null;
  }

  // Фиксируем время входа (для админ-карточки игрока)
  user.lastLogin = new Date().toISOString();
  writeJSON('users.json', users);

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return token;
}

// Шаблоны создания стола конкретного юзера (для /api/templates).
export function getUserTemplates(userId: string): RoomTemplate[] {
  const users = readJSON('users.json') as User[];
  const u = users.find((x) => x.id === userId);
  return u && Array.isArray(u.roomTemplates) ? u.roomTemplates : [];
}

// Перезаписать весь список шаблонов юзера. Синхронно (без await) — атомарно через writeJSON.
export function setUserTemplates(userId: string, templates: RoomTemplate[]): RoomTemplate[] {
  const users = readJSON('users.json') as User[];
  const u = users.find((x) => x.id === userId);
  if (!u) return [];
  u.roomTemplates = templates;
  writeJSON('users.json', users);
  return templates;
}

// Приватные заметки текущего юзера на оппонентов (ROADMAP §10.10).
export function getOpponentNotes(userId: string): Record<string, string> {
  const users = readJSON('users.json') as User[];
  const u = users.find((x) => x.id === userId);
  return u?.opponentNotes ?? {};
}

// Записать/очистить заметку на оппонента. Пустой/пробельный текст — удаляет ключ.
export function setOpponentNote(userId: string, targetId: string, text: string): Record<string, string> {
  const users = readJSON('users.json') as User[];
  const u = users.find((x) => x.id === userId);
  if (!u) return {};
  if (!u.opponentNotes) u.opponentNotes = {};
  const trimmed = text.trim();
  if (trimmed) {
    u.opponentNotes[targetId] = trimmed;
  } else {
    delete u.opponentNotes[targetId];
  }
  writeJSON('users.json', users);
  return u.opponentNotes;
}

// Сохранить выбранный seed аватара (валидация по списку AVATAR_PRESETS — на стороне роута).
export function setAvatarSeed(userId: string, seed: string): boolean {
  const users = readJSON('users.json') as User[];
  const u = users.find((x) => x.id === userId);
  if (!u) return false;
  u.avatarSeed = seed;
  writeJSON('users.json', users);
  return true;
}

// Смена имени пользователя из профиля. Уникальность — как при регистрации.
export function updateUsername(
  userId: string,
  newUsername: string,
): { user: User } | { error: 'invalid' | 'taken' } {
  const username = newUsername.trim();
  if (username.length < 3 || username.length > 32) return { error: 'invalid' };

  const users = readJSON('users.json') as User[];
  const target = users.find((u) => u.id === userId);
  if (!target) return { error: 'invalid' };
  if (users.find((u) => u.username === username && u.id !== userId)) return { error: 'taken' };

  target.username = username;
  writeJSON('users.json', users);
  return { user: target };
}

// Смена email из профиля. Уникальность — как при регистрации.
export function updateEmail(
  userId: string,
  newEmail: string,
): { user: User } | { error: 'invalid' | 'taken' } {
  const email = newEmail.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'invalid' };

  const users = readJSON('users.json') as User[];
  const target = users.find((u) => u.id === userId);
  if (!target) return { error: 'invalid' };
  if (users.find((u) => u.email === email && u.id !== userId)) return { error: 'taken' };

  target.email = email;
  writeJSON('users.json', users);
  return { user: target };
}

export function getUserByToken(token: string): User | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
    const users = readJSON('users.json') as User[];
    return users.find(u => u.id === decoded.id) || null;
  } catch {
    return null;
  }
}

export function isAdmin(token: string): boolean {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string };
    return decoded.role === 'admin';
  } catch {
    return false;
  }
}

export function makeAdmin(adminToken: string, targetUsername: string): boolean {
  if (!isAdmin(adminToken)) return false;

  const users = readJSON('users.json') as User[];
  const user = users.find(u => u.username === targetUsername);
  if (!user) return false;

  user.role = 'admin';
  writeJSON('users.json', users);
  return true;
}

// === Telegram WebApp авторизация ===

// Валидация initData по HMAC-SHA256 по официальному алгоритму Telegram.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// Возвращает распарсенного TG-юзера если подпись валидна и не протухла, иначе null.
export function validateTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 86400,
): TelegramUserPayload | null {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  // Собираем data_check_string: ключи в алфавитном порядке, "key=value", через \n
  const keys: string[] = [];
  params.forEach((_v, k) => keys.push(k));
  keys.sort();
  const dataCheckString = keys.map((k) => `${k}=${params.get(k)}`).join('\n');

  // secret_key = HMAC_SHA256("WebAppData", botToken)
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  // Constant-time compare чтобы не палить байты подписи через тайминги
  const ok =
    computedHash.length === hash.length &&
    crypto.timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(hash, 'hex'));
  if (!ok) return null;

  // Проверка свежести (защита от replay старых initData)
  const authDateStr = params.get('auth_date');
  if (!authDateStr) return null;
  const authDate = parseInt(authDateStr, 10);
  if (!Number.isFinite(authDate)) return null;
  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec < 0 || ageSec > maxAgeSec) return null;

  const userStr = params.get('user');
  if (!userStr) return null;
  try {
    const parsed = JSON.parse(userStr);
    if (typeof parsed?.id !== 'number') return null;
    return parsed as TelegramUserPayload;
  } catch {
    return null;
  }
}

// Найти/создать юзера по TG payload, выдать JWT.
// Возвращает null если юзер найден, но забанен.
export function loginOrRegisterTelegramUser(
  tg: TelegramUserPayload,
): { token: string; user: User } | null {
  const users = readJSON('users.json') as User[];

  let user = users.find((u) => u.telegramId === tg.id);
  if (user) {
    if (user.banned) return null;
  } else {
    // Подобрать username: предпочитаем @username из TG, иначе "tg<id>".
    // Если username уже занят локально — добавляем суффикс.
    const baseName = (tg.username && /^[A-Za-z0-9_]{3,32}$/.test(tg.username))
      ? tg.username
      : `tg${tg.id}`;
    let username = baseName;
    let suffix = 1;
    while (users.find((u) => u.username === username)) {
      username = `${baseName}${suffix++}`;
    }

    const existingPublicIds = new Set<string>();
    for (const u of users) if (u.publicId) existingPublicIds.add(u.publicId);

    user = {
      id: uuid(),
      username,
      email: `tg-${tg.id}@telegram.local`, // синтетический email — TG-юзеры email не дают
      passwordHash: '', // вход только через TG; passwordHash='' bcrypt.compareSync вернёт false
      role: users.length === 0 ? 'admin' : 'player',
      chips: getInitialChips(),
      createdAt: new Date().toISOString(),
      publicId: generatePublicId(existingPublicIds),
      telegramId: tg.id,
    };

    users.push(user);
  }

  // Имя из Telegram — обновляем при каждом входе (могло измениться), показывается за столом.
  user.displayName = tgDisplayName(tg);
  // Фиксируем время входа (новый или существующий TG-юзер)
  user.lastLogin = new Date().toISOString();
  writeJSON('users.json', users);

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
  return { token, user };
}

// === Привязка Telegram к существующему аккаунту (browser → код → подтверждение в Mini App) ===

// Одноразовые коды привязки: code → { userId, expiresAt }. В памяти — TTL короткий, переживать
// рестарт не нужно. Протухшие чистятся лениво при обращении.
const linkCodes = new Map<string, { userId: string; expiresAt: number }>();
const LINK_CODE_TTL_MS = 10 * 60 * 1000;

// Сгенерировать код привязки для залогиненного юзера (вызывается из защищённого роута).
export function createTelegramLinkCode(userId: string): string {
  const now = Date.now();
  for (const [c, v] of linkCodes) if (v.expiresAt < now) linkCodes.delete(c);
  const code = crypto.randomBytes(24).toString('base64url');
  linkCodes.set(code, { userId, expiresAt: now + LINK_CODE_TTL_MS });
  return code;
}

// Привязать TG-личность к аккаунту по коду. Если этот telegramId уже создал отдельный
// (дубль) аккаунт — вливаем его баланс в целевой и удаляем дубль. Возвращает { token, user }
// объединённого аккаунта либо { error }.
export function linkTelegramToAccount(
  code: string,
  tg: TelegramUserPayload,
): { token: string; user: User } | { error: 'code' | 'banned' | 'conflict' } {
  const now = Date.now();
  const entry = linkCodes.get(code);
  if (!entry || entry.expiresAt < now) {
    linkCodes.delete(code);
    return { error: 'code' };
  }

  const users = readJSON('users.json') as User[];
  const target = users.find((u) => u.id === entry.userId);
  if (!target) return { error: 'code' };
  if (target.banned) return { error: 'banned' };

  // target уже привязан к ДРУГОМУ Telegram — молча не перепривязываем.
  if (target.telegramId && target.telegramId !== tg.id) return { error: 'conflict' };

  // TG-дубль (аккаунт, который этот Telegram создал ранее автологином) — вливаем баланс, удаляем.
  const dup = users.find((u) => u.telegramId === tg.id && u.id !== target.id);
  if (dup) {
    if (dup.banned) return { error: 'banned' };
    target.chips += dup.chips;
    const idx = users.indexOf(dup);
    if (idx >= 0) users.splice(idx, 1);
  }

  target.telegramId = tg.id;
  target.displayName = tgDisplayName(tg);
  target.lastLogin = new Date().toISOString();
  writeJSON('users.json', users);
  linkCodes.delete(code);

  const token = jwt.sign(
    { id: target.id, username: target.username, role: target.role },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
  return { token, user: target };
}
