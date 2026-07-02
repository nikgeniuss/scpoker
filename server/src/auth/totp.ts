import crypto from 'crypto';

// TOTP (RFC 6238) на чистом crypto, без внешних зависимостей (speakeasy/otplib) —
// проект минимизирует зависимости (CLAUDE.md §1/§4: правки package.json — отдельное решение).

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  const rem = bits.length % 5;
  if (rem) {
    const chunk = bits.slice(bits.length - rem).padEnd(5, '0');
    out += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return out;
}

function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter % 2 ** 32, 4);
  const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

// Новый случайный секрет (160 бит — стандартная длина для TOTP), в base32.
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

// Текущий 6-значный код для секрета (шаг 30с) — используется только в тестах.
export function generateTotp(secretBase32: string, time = Date.now(), stepSec = 30): string {
  const counter = Math.floor(time / 1000 / stepSec);
  return hotp(base32Decode(secretBase32), counter);
}

// Проверка кода с допуском ±window шагов (часовой дрейф клиента/сервера).
export function verifyTotp(secretBase32: string, token: string, window = 1, time = Date.now(), stepSec = 30): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const counter = Math.floor(time / 1000 / stepSec);
  const secret = base32Decode(secretBase32);
  for (let i = -window; i <= window; i++) {
    if (hotp(secret, counter + i) === token) return true;
  }
  return false;
}

// Секрет группами по 4 символа — для ручного ввода в приложение-аутентификатор.
export function formatSecretForDisplay(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}
