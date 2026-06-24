import dotenv from 'dotenv';

// dotenv.config() здесь, до того как другие модули прочитают process.env через этот файл
dotenv.config();

const isProd = process.env.NODE_ENV === 'production';
const DEV_DEFAULT_SECRET = 'sk-poker-secret-key';

function resolveJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (s && s.length > 0) return s;
  if (isProd) {
    // В проде секрет обязателен — без него любой токен с дефолтом будет валиден
    console.error('FATAL: JWT_SECRET is required in production');
    process.exit(1);
  }
  console.warn('⚠️  JWT_SECRET не задан, используется dev-default. НЕ ДЛЯ ПРОДА!');
  return DEV_DEFAULT_SECRET;
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
export const TRONGRID_FULL_HOST = TRON_NETWORK === 'mainnet' ? 'https://api.trongrid.io' : 'https://api.shasta.trongrid.io';
