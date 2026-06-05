import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { readJSON, writeJSON } from './storage.js';
import { JWT_SECRET } from '../config.js';

interface User {
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
}

export interface TelegramUserPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
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
  } catch {}
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

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return token;
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
    writeJSON('users.json', users);
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
  return { token, user };
}
