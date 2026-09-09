# Размер проекта POKER HUB

> Снимок на **2026-09-07** (коммит `0f7e318` + незакоммиченная работа текущей сессии: платный HUD,
> чистка устаревших пометок, ревизия документации, удаление двух осиротевших файлов и журнала постмортемов).
> Считаются файлы проекта: отслеживаемые git плюс новые, ещё не добавленные в индекс.
> `node_modules/`, `.git/`, `server/data/`, `server/backups/`, сборки — исключены (см. §«На диске»).

## Главные цифры

| | Файлов | Строк | Вес |
|---|---:|---:|---:|
| **Весь репозиторий** | **972** | **211 129** | **27,2 МБ** |
| Продукт (код, ассеты, доки) | 707 | 106 641 | 20,3 МБ |
| Инструментарий (`.claude`, `.github`, `.agents` и пр.) | 265 | 104 488 | 6,9 МБ |

Половина строк репозитория — не проект, а обвязка: скиллы и хуки Claude Code (`.claude`, 53 тыс. строк) и содержимое `.github` (50 тыс.). Продуктовая часть — 106 тыс. строк.

## Код

| | Файлов | Строк |
|---|---:|---:|
| Код на TypeScript/TSX (`client`, `server`, `shared`, `scripts`) | 346 | 49 737 |
| Тесты на TypeScript/TSX (там же) | 170 | 20 573 |

Тесты — **29 %** всех строк на TypeScript (или 41 % к объёму самого кода): 1232 серверных и 255 клиентских проверок. На один файл кода приходится примерно полфайла тестов.

## По каталогам продукта

| Каталог | Файлов | Строк | Вес |
|---|---:|---:|---:|
| `client/` — React-приложение | 289 | 39 701 | 4,3 МБ |
| `server/` — Node + Socket.IO | 279 | 51 851 | 2,4 МБ |
| `images/` — картинки, колоды, ассеты | 110 | 688 | 12,2 МБ |
| `scripts/` — служебные скрипты | 11 | 1 413 | 0,5 МБ |
| `docs/` — документация проекта | 7 | 1 490 | 0,5 МБ |
| `memory/` — постмортемы | 1 | 42 | <0,1 МБ |
| `shared/` — общие типы и события | 2 | 651 | <0,1 МБ |
| корень — конфиги и `package-lock.json` | 8 | 10 805 | 0,4 МБ |

Вес репозитория делают не тексты, а бинарные файлы: 112 картинок и прочих ассетов занимают **17,7 МБ** из 27,2 МБ. Весь код и вся документация вместе — меньше 10 МБ.

## Крупнейшие файлы кода

| Строк | Файл |
|---:|---|
| 3 112 | [server/src/game/GameManager.ts](../server/src/game/GameManager.ts) |
| 1 378 | [server/src/game/tournament/TournamentManager.ts](../server/src/game/tournament/TournamentManager.ts) |
| 1 281 | [client/src/pages/GameRoom.tsx](../client/src/pages/GameRoom.tsx) |
| 1 143 | [client/src/i18n/locales/en.ts](../client/src/i18n/locales/en.ts) |
| 1 141 | [client/src/i18n/locales/ru.ts](../client/src/i18n/locales/ru.ts) |
| 843 | server/src/game/\_\_tests\_\_/TournamentManager.mtt.test.ts |
| 828 | [server/src/auth/auth.ts](../server/src/auth/auth.ts) |
| 754 | [server/src/game/botBrain.ts](../server/src/game/botBrain.ts) |
| 743 | [client/src/components/lobby/CreateRoomModal.tsx](../client/src/components/lobby/CreateRoomModal.tsx) |
| 644 | [client/src/pages/admin/SettingsTab.tsx](../client/src/pages/admin/SettingsTab.tsx) |

Первые три — известные god-файлы, их развязка описана в [ROADMAP §9.3](ROADMAP.md) (пункт B). Два файла локализации в списке — это словари, а не логика.

## На диске

Рабочая папка занимает **~201 МБ** без `node_modules/` и `.git/`. Из них проектных файлов — 27 МБ, остальное рабочие данные:

| Папка | Вес | Что это |
|---|---:|---|
| `server/backups/` | 130 МБ | автоматические копии `server/data` раз в 15 минут (в git не попадают) |
| `images/` | 13 МБ | ассеты (входят в 27 МБ выше) |
| `client/dist/`, `server/dist/` | 4,6 МБ | сборки |
| `server/data/` | 3,0 МБ | боевые данные: игроки, банкроллы, турниры |

Отдельно — зависимости и история, в подсчёт проекта не входят: `node_modules/` суммарно **449 МБ** (375 в корне, 46 в `client`, 28 в `server`; ставятся из `package-lock.json`) и `.git/` — **28 МБ** на 30 коммитов.

## Как пересчитать

```bash
git ls-files --cached --others --exclude-standard | wc -l          # файлов
git ls-files --cached --others --exclude-standard -z | xargs -0 cat | wc -l   # строк
du -sh --exclude=node_modules --exclude=.git .                     # вес рабочей папки
```
