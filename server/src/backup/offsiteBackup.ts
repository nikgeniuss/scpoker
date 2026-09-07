import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { BACKUP_ENCRYPTION_KEY, BACKUP_TELEGRAM_CHAT_ID, TELEGRAM_BOT_TOKEN } from '../config.js';
import { sendAlert } from '../monitoring/alertService.js';

// Выгрузка суточного бэкапа ВНЕ машины (ROADMAP §11.3 — единственное, что защищает от отказа
// диска: обе локальные линии, history/ и daily/, лежат на том же диске C).
// Канал — уже работающий TG-бот (решение пользователя 2026-09-06): ноль новых зависимостей и
// сервисов, лимит документа 50 МБ против 2.7 МБ реальных данных.
// В архиве почты, даты рождения, bcrypt-хэши и балансы игроков, поэтому он ШИФРУЕТСЯ до отправки:
// на серверы Telegram уходит только шифротекст. Ключ (BACKUP_ENCRYPTION_KEY) живёт в .env и
// НИКОГДА не отправляется вместе с архивом — без него файл бесполезен, включая нас самих:
// потеря ключа = потеря бэкапов, хранить отдельно от сервера.

const MAGIC = Buffer.from('SCPK1'); // 5 байт — метка формата, чтобы не расшифровывать мусор
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

// === Чистая часть (шифрование и сборка — тестируются без сети) ===

// Все файлы данных одним JSON-объектом: имя → содержимое как есть (строкой, без разбора —
// повреждённый JSON тоже должен попасть в бэкап, а не уронить выгрузку).
export function buildBundle(files: Record<string, string>, dayStamp: string): string {
  return JSON.stringify({ day: dayStamp, createdAt: new Date().toISOString(), files });
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, 32);
}

// AES-256-GCM: шифротекст + тег целостности (подменённый файл не расшифруется молча).
export function encryptBundle(plain: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBundle(blob: Buffer, passphrase: string): Buffer {
  if (blob.length < MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN || !blob.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Не файл бэкапа POKER HUB (нет метки формата)');
  }
  let at = MAGIC.length;
  const salt = blob.subarray(at, (at += SALT_LEN));
  const iv = blob.subarray(at, (at += IV_LEN));
  const tag = blob.subarray(at, (at += TAG_LEN));
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(blob.subarray(at)), decipher.final()]);
}

// Полный цикл упаковки: JSON → gzip → шифрование. Обратный — в scripts/restore-offsite-backup.mjs.
export function packBundle(files: Record<string, string>, dayStamp: string, passphrase: string): Buffer {
  return encryptBundle(gzipSync(Buffer.from(buildBundle(files, dayStamp), 'utf8')), passphrase);
}

export function unpackBundle(blob: Buffer, passphrase: string): { day: string; files: Record<string, string> } {
  return JSON.parse(gunzipSync(decryptBundle(blob, passphrase)).toString('utf8'));
}

// === Отправка ===

export function isOffsiteBackupEnabled(): boolean {
  return !!(TELEGRAM_BOT_TOKEN && BACKUP_TELEGRAM_CHAT_ID && BACKUP_ENCRYPTION_KEY);
}

function readDir(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    files[name] = readFileSync(join(dir, name), 'utf8');
  }
  return files;
}

// Выгрузить суточную копию наружу. Вызывается из backupService ровно один раз в сутки — в тот
// прогон, который создал папку дня. Best-effort: сбой отправки не должен ломать локальный бэкап,
// но о нём нужно узнать — иначе «выгрузка есть» окажется иллюзией (алерт уходит тем же ботом).
export async function uploadDailyBackup(dayDir: string, dayStamp: string): Promise<boolean> {
  if (!isOffsiteBackupEnabled()) return false;
  try {
    const packed = packBundle(readDir(dayDir), dayStamp, BACKUP_ENCRYPTION_KEY as string);

    const form = new FormData();
    form.append('chat_id', BACKUP_TELEGRAM_CHAT_ID as string);
    form.append('caption', `POKER HUB backup ${dayStamp} (${Math.round(packed.length / 1024)} КБ, зашифрован)`);
    form.append('document', new Blob([new Uint8Array(packed)]), `scpoker-${dayStamp}.bundle.enc`);

    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      body: form,
    });
    const json = (await res.json()) as { ok: boolean; description?: string };
    if (!json.ok) throw new Error(json.description ?? `HTTP ${res.status}`);

    console.log(`☁️ [backup] суточная копия ${dayStamp} выгружена наружу (${Math.round(packed.length / 1024)} КБ)`);
    return true;
  } catch (err) {
    console.error('⚠️ [backup] выгрузка наружу не удалась:', err);
    void sendAlert('backup', `Выгрузка бэкапа ${dayStamp} наружу не удалась`, err);
    return false;
  }
}
