import { describe, it, expect } from 'vitest';
import { gunzipSync } from 'zlib';
import {
  buildBundle,
  encryptBundle,
  decryptBundle,
  packBundle,
  unpackBundle,
} from '../offsiteBackup.js';

// Выгрузка бэкапа наружу (ROADMAP §11.3). Проверяем ровно то, от чего зависит восстановление:
// упакованное распаковывается обратно байт в байт, чужим ключом — не распаковывается вовсе.

const FILES = {
  'users.json': '[{"id":"u1","email":"a@b.c","chips":1000}]',
  'battered.json': '{ это не валидный JSON', // повреждённый файл тоже должен попасть в бэкап
};
const KEY = 'правильный-ключ-длиной-побольше';

describe('buildBundle', () => {
  it('кладёт файлы как есть, не разбирая JSON', () => {
    const bundle = JSON.parse(buildBundle(FILES, '2026-09-06'));
    expect(bundle.day).toBe('2026-09-06');
    expect(bundle.files).toEqual(FILES);
    expect(typeof bundle.createdAt).toBe('string');
  });
});

describe('encryptBundle / decryptBundle', () => {
  it('расшифровка тем же ключом возвращает исходные байты', () => {
    const plain = Buffer.from('секрет: балансы игроков');
    expect(decryptBundle(encryptBundle(plain, KEY), KEY).equals(plain)).toBe(true);
  });

  it('чужой ключ не расшифровывает (тег целостности не сходится)', () => {
    const blob = encryptBundle(Buffer.from('секрет'), KEY);
    expect(() => decryptBundle(blob, 'другой-ключ')).toThrow();
  });

  it('подменённый байт шифротекста ломает расшифровку, а не проходит молча', () => {
    const blob = encryptBundle(Buffer.from('секрет'), KEY);
    blob[blob.length - 1] ^= 0xff;
    expect(() => decryptBundle(blob, KEY)).toThrow();
  });

  it('посторонний файл отбивается по метке формата', () => {
    expect(() => decryptBundle(Buffer.from('просто текст, не бэкап'), KEY)).toThrow(/метки формата/);
  });

  it('шифротекст не содержит исходных данных в открытом виде', () => {
    const blob = encryptBundle(Buffer.from('email@example.com'), KEY);
    expect(blob.toString('utf8')).not.toContain('email@example.com');
  });

  it('два шифрования одних данных дают разные байты (соль и IV случайны)', () => {
    const plain = Buffer.from('одно и то же');
    expect(encryptBundle(plain, KEY).equals(encryptBundle(plain, KEY))).toBe(false);
  });
});

describe('packBundle / unpackBundle — полный цикл выгрузки и восстановления', () => {
  it('файлы возвращаются в точности, включая повреждённый JSON', () => {
    const packed = packBundle(FILES, '2026-09-06', KEY);
    const restored = unpackBundle(packed, KEY);
    expect(restored.day).toBe('2026-09-06');
    expect(restored.files).toEqual(FILES);
  });

  it('данные внутри сжаты (gzip читается после расшифровки)', () => {
    const packed = packBundle(FILES, '2026-09-06', KEY);
    const inner = gunzipSync(decryptBundle(packed, KEY)).toString('utf8');
    expect(JSON.parse(inner).files['users.json']).toBe(FILES['users.json']);
  });

  it('пустая папка данных не ломает упаковку', () => {
    expect(unpackBundle(packBundle({}, '2026-09-06', KEY), KEY).files).toEqual({});
  });
});
