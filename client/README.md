# POKER HUB — клиент

React-приложение покерного рума: лобби, игровой стол, турниры, кошелёк, награды, админ-панель.
Работает в браузере (десктоп и мобильный) и внутри Telegram Mini App.

> До 2026-09-07 здесь лежал дефолтный README шаблона Vite — он не имел отношения к проекту.

## Стек

React 19 · Vite · TypeScript · Tailwind v4 (`@tailwindcss/vite`) · Zustand · Framer Motion ·
react-router-dom · socket.io-client · react-i18next (ru/en) · lucide-react · `@twa-dev/sdk`.

## Запуск

Из **корня репозитория** (поднимает клиент и сервер разом):

```bash
npm run dev          # Vite :5173 + Express :3001
```

Только клиент — `npm run dev:client` из корня либо `npm run dev` здесь. Сервер на `:3001` нужен
в любом случае: без него не будет ни авторизации, ни сокетов.

## Проверки

```bash
npm run lint         # ESLint
npm run typecheck    # tsc -b --noEmit
npm run test         # vitest + jsdom + @testing-library/react
npm run test:watch   # то же в watch-режиме
```

Из корня всё разом (плюс серверная часть и guard контракта событий) — `npm run check`.

## Как устроено

| Папка | Что внутри |
| --- | --- |
| `src/pages/` | экраны-роуты (`GameRoom`, лобби, турниры, кошелёк, награды, `admin/*`) |
| `src/components/` | компоненты по доменам: `game/`, `lobby/`, `layout/`, `admin/`, `auth/` |
| `src/store/` | Zustand-сторы (auth, комнаты, турниры, кошелёк, награды, подписки) |
| `src/config/` | чистые модули без React: адрес API, формат денег, пресеты ставок, коды ошибок |
| `src/hooks/` | хуки, включая `useTelegram` и хуки экранов |
| `src/i18n/locales/` | словари `ru.ts` / `en.ts` — оба обязаны покрывать одинаковый набор ключей |

Тесты лежат рядом с исходником: `*.test.ts(x)`.

## Правила, которые легко нарушить

- Адрес API — только из `src/config/api.ts`, `localhost` не хардкодить: клиент открывают и с
  публичного IP, и из Telegram.
- Socket-события — только через `SOCKET_EVENTS` из `@poker-room/shared`; синхронность клиента и
  сервера проверяет `npm run check:contract`.
- Вёрстка обязана жить на трёх целях: десктоп ≥1024, мобильный от 360, окно Telegram Mini App.
  Полная высота — `100dvh`/`100svh`, тач-цель ≥44×44px, hover не должен быть единственным
  каналом информации.
- Админ-код — только lazy-чанком за `RequireAdmin` или под `{isAdmin && …}`; настоящая защита
  всегда серверная.

Остальное — в [CLAUDE.md](../CLAUDE.md) и [docs/](../docs/).
