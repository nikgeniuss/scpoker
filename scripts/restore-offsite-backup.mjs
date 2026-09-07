#!/usr/bin/env node
// Распаковка зашифрованного бэкапа, выгруженного наружу (ROADMAP §11.3).
// Бэкап, который нечем восстановить, — не бэкап, поэтому скрипт лежит рядом с выгрузкой.
//
//   node scripts/restore-offsite-backup.mjs <файл.bundle.enc> <куда-распаковать> [ключ]
//
// Ключ берётся из аргумента или из переменной окружения BACKUP_ENCRYPTION_KEY — тот же самый,
// которым сервер шифровал архив. Без ключа файл бесполезен: расшифровать его не может никто,
// включая нас, поэтому ключ хранится ОТДЕЛЬНО от сервера и от самих архивов.
//
// Скрипт НИЧЕГО не перезаписывает в server/data — распаковывает в указанную папку, дальше файлы
// переносятся руками при остановленном сервере (иначе запущенный процесс перетрёт их своей копией
// состояния из памяти).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';
import { createDecipheriv, scryptSync } from 'crypto';

const MAGIC = Buffer.from('SCPK1');
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

function decrypt(blob, passphrase) {
  if (blob.length < MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN || !blob.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Не файл бэкапа POKER HUB (нет метки формата)');
  }
  let at = MAGIC.length;
  const salt = blob.subarray(at, (at += SALT_LEN));
  const iv = blob.subarray(at, (at += IV_LEN));
  const tag = blob.subarray(at, (at += TAG_LEN));
  const decipher = createDecipheriv('aes-256-gcm', scryptSync(passphrase, salt, 32), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(blob.subarray(at)), decipher.final()]);
}

const [file, outDir, keyArg] = process.argv.slice(2);
const key = keyArg || process.env.BACKUP_ENCRYPTION_KEY;

if (!file || !outDir || !key) {
  console.error('Использование: node scripts/restore-offsite-backup.mjs <файл.bundle.enc> <папка> [ключ]');
  console.error('Ключ можно не передавать аргументом, если задан BACKUP_ENCRYPTION_KEY.');
  process.exit(1);
}
if (!existsSync(file)) {
  console.error('Файл не найден: ' + file);
  process.exit(1);
}

let bundle;
try {
  bundle = JSON.parse(gunzipSync(decrypt(readFileSync(file), key)).toString('utf8'));
} catch (err) {
  // Неверный ключ и подменённый файл выглядят одинаково — GCM-тег не сходится в обоих случаях.
  console.error('Не удалось расшифровать: неверный ключ или файл повреждён.');
  console.error(String(err.message ?? err));
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
const names = Object.keys(bundle.files ?? {});
for (const name of names) {
  writeFileSync(join(outDir, name), bundle.files[name], 'utf8');
}

console.log(`Готово: ${names.length} файлов за ${bundle.day} (снимок от ${bundle.createdAt}) → ${outDir}`);
console.log('Переносить в server/data только при ОСТАНОВЛЕННОМ сервере.');
