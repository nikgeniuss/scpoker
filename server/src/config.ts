import dotenv from 'dotenv';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// dotenv.config() здесь, до того как другие модули прочитают process.env через этот файл.
// quiet: true — dotenv иначе печатает на каждый вызов строку «injected env (N) from .env // tip: …»
// со случайной подсказкой, часть которых рекламирует платные продукты мейнтейнера. Строка сыпалась
// при каждом старте dev-сервера и в каждом тестовом файле, который тянет config.ts.
dotenv.config({ quiet: true });

const isProd = process.env.NODE_ENV === 'production';
// Публичная константа-секрет остаётся ТОЛЬКО для тестов: они должны подписывать и проверять
// токены детерминированно, а тестовый процесс наружу не смотрит.
const TEST_SECRET = 'sk-poker-secret-key';
const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITEST;
const DEV_SECRET_FILE = join(dirname(fileURLToPath(import.meta.url)), '../data/dev-jwt-secret.txt');

// Dev-секрет: случайный, но постоянный между рестартами (лежит в server/data/, git его не видит).
// Раньше здесь была та же строка, что лежит в открытом репозитории: любой, кто её знал, мог
// подписать себе токен с role=admin, если сервер случайно поднимут без NODE_ENV=production
// (аудит 2026-09-08). Файл читается один раз при старте.
function devSecretFromFile(): string {
  try {
    if (existsSync(DEV_SECRET_FILE)) {
      const saved = readFileSync(DEV_SECRET_FILE, 'utf-8').trim();
      if (saved.length >= 32) return saved;
    }
    const generated = randomBytes(32).toString('hex');
    mkdirSync(dirname(DEV_SECRET_FILE), { recursive: true });
    writeFileSync(DEV_SECRET_FILE, generated, 'utf-8');
    return generated;
  } catch {
    // Диск недоступен — секрет живёт только в памяти процесса: токены инвалидируются рестартом,
    // но подделать их по известной константе всё равно нельзя.
    return randomBytes(32).toString('hex');
  }
}

function resolveJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (s && s.length > 0) return s;
  if (isProd) {
    // В проде секрет обязателен — без него любой токен с дефолтом будет валиден
    console.error('FATAL: JWT_SECRET is required in production');
    process.exit(1);
  }
  if (isTest) return TEST_SECRET;
  console.warn('⚠️  JWT_SECRET не задан, сгенерирован локальный dev-секрет (server/data/dev-jwt-secret.txt). НЕ ДЛЯ ПРОДА!');
  return devSecretFromFile();
}

function resolveAllowedOrigins(): string[] | '*' {
  const raw = process.env.ALLOWED_ORIGINS;
  if (raw && raw.trim().length > 0) {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (isProd) {
    console.error('FATAL: ALLOWED_ORIGINS is required in production (comma-separated list)');
    process.exit(1);
  }
  console.warn('⚠️  ALLOWED_ORIGINS не задан, разрешены все origin. НЕ ДЛЯ ПРОДА!');
  return '*';
}

// TELEGRAM_BOT_TOKEN опционален: если не задан — endpoint /api/auth/telegram вернёт 503.
// В проде ставим обязательным только если хотим TG-аутентификацию (нет жёсткого fail).
function resolveTelegramBotToken(): string | null {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (t && t.length > 0) return t;
  if (!isProd) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN не задан, TG MiniApp авторизация отключена.');
  }
  return null;
}

// Платежи (USDT TRC-20/ERC-20/BEP-20) — опциональный модуль, не фейлит старт сервера
// без этих переменных (включается только если admin явно поставит payments.enabled).
// Без дев-дефолтов: в отличие от JWT_SECRET, захардкоженный дефолт для приватного ключа/seed
// реальных денег — это риск, а не удобство.
function resolveSecret(envName: string): string | null {
  const v = process.env[envName];
  if (v && v.length > 0) return v;
  console.warn(`⚠️  ${envName} не задан, эта часть крипто-платежей отключена.`);
  return null;
}

// Mainnet требует ЯВНОГО опт-ина через env, независимо от NODE_ENV — деплой в прод
// не должен случайно включить реальные сети, если переменная не выставлена осознанно.
function resolveTronNetwork(): 'mainnet' | 'shasta' {
  return process.env.TRON_NETWORK === 'mainnet' ? 'mainnet' : 'shasta';
}

function resolveEvmNetwork(): 'mainnet' | 'testnet' {
  return process.env.EVM_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
}

export const JWT_SECRET = resolveJwtSecret();
export const ALLOWED_ORIGINS = resolveAllowedOrigins();
export const TELEGRAM_BOT_TOKEN = resolveTelegramBotToken();
export const IS_PROD = isProd;

export const DEPOSIT_SEED_MNEMONIC_TRON = resolveSecret('DEPOSIT_SEED_MNEMONIC_TRON');
export const DEPOSIT_SEED_MNEMONIC_EVM = resolveSecret('DEPOSIT_SEED_MNEMONIC_EVM');
export const HOT_WALLET_PRIVATE_KEY_TRON = resolveSecret('HOT_WALLET_PRIVATE_KEY_TRON');
export const HOT_WALLET_PRIVATE_KEY_EVM = resolveSecret('HOT_WALLET_PRIVATE_KEY_EVM');
export const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY || null;

// Мониторинг и выгрузка бэкапов наружу (ROADMAP §11.3) — оба через уже существующего TG-бота,
// новых сервисов и зависимостей не заводим. Все три переменные опциональны: не заданы —
// соответствующая функция просто выключена (сервер стартует как раньше).
// ALERT_TELEGRAM_CHAT_ID — куда слать алерты о падении процесса и ошибках записи данных.
// BACKUP_TELEGRAM_CHAT_ID — куда слать суточный архив (можно тот же чат/канал).
// BACKUP_ENCRYPTION_KEY — парольная фраза, которой архив шифруется ПЕРЕД отправкой: внутри
// почты, даты рождения, хэши паролей и балансы, отдавать это в открытом виде нельзя.
export const ALERT_TELEGRAM_CHAT_ID = process.env.ALERT_TELEGRAM_CHAT_ID || null;
export const BACKUP_TELEGRAM_CHAT_ID = process.env.BACKUP_TELEGRAM_CHAT_ID || null;
export const BACKUP_ENCRYPTION_KEY = process.env.BACKUP_ENCRYPTION_KEY || null;
export const TRON_NETWORK = resolveTronNetwork();
export const EVM_NETWORK = resolveEvmNetwork();
export const ETH_RPC_URL =
  process.env.ETH_RPC_URL ||
  (EVM_NETWORK === 'mainnet'
    ? 'https://ethereum-rpc.publicnode.com'
    : 'https://ethereum-sepolia-rpc.publicnode.com');
export const BSC_RPC_URL =
  process.env.BSC_RPC_URL ||
  (EVM_NETWORK === 'mainnet'
    ? 'https://bsc-rpc.publicnode.com'
    : 'https://bsc-testnet-rpc.publicnode.com');

// USDT-контракты. На mainnet — официальные адреса. На testnet нет канонического USDT —
// нужно явно задать через env адрес тестового токена, задеплоенного для прогона (план §12).
// Пустая строка = сеть не настроена (адаптер для неё не создаётся, см. chains/index.ts).
export const TRON_USDT_CONTRACT =
  process.env.TRON_USDT_CONTRACT || (TRON_NETWORK === 'mainnet' ? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' : '');
export const ETH_USDT_CONTRACT =
  process.env.ETH_USDT_CONTRACT || (EVM_NETWORK === 'mainnet' ? '0xdAC17F958D2ee523a2206206994597C13D831ec7' : '');
export const BSC_USDT_CONTRACT =
  process.env.BSC_USDT_CONTRACT || (EVM_NETWORK === 'mainnet' ? '0x55d398326f99059fF775485246999027B3197955' : '');
// Потолок комиссии одного TRC-20 перевода (sun; 1 TRX = 1e6 sun). Без него TronWeb отправляет
// транзакцию с нулевым feeLimit, и при нехватке energy у отправителя она отваливается с
// OUT_OF_ENERGY — то есть выплата игроку молча не проходит. Официальные примеры TronWeb ставят
// 100-150 TRX; берём 100 TRX и оставляем настраиваемым: реальная цена energy на mainnet плавает.
export const TRON_FEE_LIMIT_SUN = Math.max(0, Number(process.env.TRON_FEE_LIMIT_SUN) || 100_000_000);
export const TRONGRID_FULL_HOST = TRON_NETWORK === 'mainnet' ? 'https://api.trongrid.io' : 'https://api.shasta.trongrid.io';
