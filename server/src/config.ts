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

export const JWT_SECRET = resolveJwtSecret();
export const ALLOWED_ORIGINS = resolveAllowedOrigins();
export const TELEGRAM_BOT_TOKEN = resolveTelegramBotToken();
export const IS_PROD = isProd;
