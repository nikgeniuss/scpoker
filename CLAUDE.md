# Инструкции для Claude по работе с проектом POKER HUB

> **ВАЖНО**: главный источник правил.
> Перед ЛЮБЫМ действием (чтение, правка, создание, удаление файлов, запуск команд) — прочитать §0 (инварианты) и §1 (главное правило).
> Остальные разделы — по ссылкам, когда задача их касается.
> Если правило здесь противоречит догадке/привычке/«лучшей практике» — побеждает правило отсюда.

---

## §0. Инварианты — НИКОГДА не нарушать

Эти правила критичны для безопасности/корректности. Если кажется, что одно из них «можно обойти ради задачи» — нельзя. Спросить пользователя.

1. **Не отдавать карты соперников клиенту до showdown.** `broadcastGameState` ходит per-socket; `getGameState(roomId, viewerId, withPeek)` отдаёт `cards` только владельцу; на `showdown` — ТОЛЬКО дошедшим до вскрытия (не сфолдившим; ≥2 контестера — иначе выигрыш без вскрытия и карты не раскрываются, фикс 2026-06-12); админу — при включённом peek; плюс добровольно показанные карты (`shownCards`, тап после раздачи) — видны всем. Была реальная утечка через DevTools (фикс 2026-05-17, [server/src/game/GameManager.ts](server/src/game/GameManager.ts)). Наблюдатель (сокет в socket.io-комнате, но не в `room.players` — режим `observeRoom`, 2026-06-12) попадает под ту же защиту: `broadcastGameState` шлёт ему base-state без карт соперников; админ-наблюдатель видит карты только через auto-peek (по роли из JWT, не по клиентскому флагу). Подсказки `handHint`/`winChance` (тумблер «Подсказка комбинации», 2026-06-12) — под той же защитой: название комбинации отдаётся только тем, кому видны карты (своё место / админ-peek / showdown), а шанс на выигрыш считается против СЛУЧАЙНЫХ рук (Монте-Карло, [equity.ts](server/src/game/equity.ts), БЕЗ знания чужих карт) — иначе по точному проценту можно было бы вычислить руку соперника.

2. **Не редактировать `server/src/*` если пользователь сейчас за реальным столом.** Каждое изменение в `server/src` триггерит nodemon-рестарт — сокеты рвутся, нужен реконнект. Активная раздача (deck/pot/ставки/фаза) переживает рестарт и доигрывается (снапшот в `active-hands.json`, восстановление через `GameManager.restoreActiveHands()` — ROADMAP §9.2, 2026-06-18), но сам разрыв соединения всё равно ощутим за столом. Перед серверным Edit'ом — спросить «играешь?». Клиентские правки (`client/src/*`) безопасны (HMR).

3. **`nodemon.json` watch только `src/`, НЕ `data/`.** Иначе записи в `server/data/*.json` (persistChips, saveRoomsSnapshot) триггерят рестарт → теряем стек в памяти → дублирование/потеря банкролла. Не «оптимизировать» обратно. См. историю инцидента §11.9.1 в [memory/postmortems-2026-Q2.md](memory/postmortems-2026-Q2.md).

4. **Запись в `server/data/*.json` — только атомарно через `writeJSON`** ([server/src/auth/storage.ts](server/src/auth/storage.ts)). Никаких прямых `writeFileSync` на эти файлы. Защита от частично записанного JSON при крэше.

5. **POKER_RULES.md — источник правды для игровой логики.** Если код противоречит [POKER_RULES.md](POKER_RULES.md) — чинить код, не правила. (Расхождения A1 min-raise/A3 incomplete all-in, упоминавшиеся здесь ранее, закрыты 2026-06-15 — см. [bettingRules.ts](server/src/game/bettingRules.ts).)

6. **Single-session middleware в `io.use()` — не обходить.** При новом handshake любые старые сокеты того же `user.id` получают `forceDisconnect`. Это фича, не баг — она защищает от мульти-аккаунтинга и race condition. Refresh защищён 1-секундной задержкой в `socket.on('disconnect')`.

7. **`git push --force` и `git reset --hard` запрещены через deny в `.claude/settings.local.json`.** Если *действительно* нужно — пользователь делает руками в терминале.

8. **Не делать `git commit` / `git push` без явной просьбы пользователя.** Команды типа «сделай ship», «закоммить» — да. Молча в конце задачи коммитить — нет.

9. **`JWT_SECRET` и `ALLOWED_ORIGINS` обязательны в `NODE_ENV=production`.** Без них сервер делает `process.exit(1)`. В dev — fallback с warning ([server/src/config.ts](server/src/config.ts)).

10. **Performance-first.** Каждый render/запрос/анимация должны иметь причину. Избегать: лишние `useState` высоко в дереве, анимации `width/height/top/left` (брать `transform`/`opacity`), broadcast'ы с полным state когда хватит diff. Не оптимизировать преждевременно — мерять при росте.

11. **Модульность-first (разделение ответственностей).** Новый код писать модульно: одна функция/файл — одна ответственность. Транспорт (socket/`io`/`fetch`) не смешивать с доменной логикой; правила покера — чистыми функциями (эталон [hands.ts](server/src/game/hands.ts)/[deck.ts](server/src/game/deck.ts)). Перед добавлением логики в большой файл (god-файлы: `GameManager.ts`, `index.ts`, `Admin.tsx`, `Lobby.tsx`, `GameRoom.tsx`) спросить себя: «это сюда по ответственности — или новый модуль/хук/сервис?». Дубль типа/события/конфига — выносить в общий модуль, не копировать (события — через `SOCKET_EVENTS`, см. §6). **Не противоречит §1**: рабочий код молча НЕ рефакторить — крупная развязка идёт в [ROADMAP §9.3](docs/ROADMAP.md) + спросить пользователя. Итог: новое — сразу модульно; старое — не раздувать god-файлы, но и не переписывать без задачи.

12. **`BotInfo.totalPnL` — источник правды для PnL-решений бота.** В `botBrain.ts` PnL-логика (`computeRiskShift`, `computePnLZone`) использует `ctx.lifetimePnL` (= `meta.bot.totalPnL` из `BotInfo`), который персистируется в `bots.json`. НЕ использовать `runtime.realizedPnL` для бизнес-решений — он session-only и сбрасывается при рестарте. Все таргеты ботов — только `'zero'` или `'plus'` (добавлено 2026-06-14).

13. **Админ-фичи: не видны и не в бандле обычного игрока; защита — серверная.** Настоящая защита админ-действий — ВСЕГДА на сервере: `adminMiddleware` (роль из подписанного JWT через `jwt.verify`) на всех `/api/admin/*` и проверка `role === 'admin'` в сокет-обработчиках (`adminPeekToggle`). Клиентский `isAdmin` (из `localStorage`) — UX/обфускация: его можно подделать руками, но это НИЧЕГО не даёт (сервер всё режет 403). Любой админ-UI: **(а)** lazy-чанк (`React.lazy`) — код НЕ в основном бандле игрока; **(б)** за `RequireAdmin` (route-гейт, редиректит не-админа ДО загрузки чанка) либо `{isAdmin && …}` (inline). Эталон: [pages/Admin.tsx](client/src/pages/Admin.tsx) и [pages/ClubAdmin.tsx](client/src/pages/ClubAdmin.tsx) (оба lazy за `RequireAdmin` в [App.tsx](client/src/App.tsx); входы — lazy `AdminNavButton`/`ClubAdminNavButton` под `{isAdmin && …}` в [Layout.tsx](client/src/components/layout/Layout.tsx)), [components/admin/](client/src/components/admin/) `AdminTableControls`/`AdminNavButton`/`ClubAdminNavButton` (lazy; peek-логика тоже там). Новую админ-фичу — строго по паттерну (lazy + серверный `adminMiddleware`); НЕ инлайнить админ-код/эндпоинты в общий клиентский бандл. Абсолют («код вообще не на сервере игрока») — только отдельным admin-билдом, но безопасность от этого не меняется (она серверная).

14. **Платежи (`server/src/payments/`) — два разных секрета, депозит ≠ хот-кошелёк, свип обязателен.** `DEPOSIT_SEED_MNEMONIC_TRON/EVM` (деривация персональных адресов игроков, [walletService.ts](server/src/payments/walletService.ts)) и `HOT_WALLET_PRIVATE_KEY_TRON/EVM` (отправка выплат, [hotWallet.ts](server/src/payments/hotWallet.ts)) — НЕ путать и не объединять. Реальные USDT приходят на персональный адрес игрока, а не на хот-кошелёк — без свипа ([sweepService.ts](server/src/payments/sweepService.ts), вызывается из `depositPollingService.ts` сразу после кредита чипов) хот-кошелёк никогда не наполнится и автовыплаты останутся без покрытия (найдено на testnet-прогоне 2026-06-19). Свип — best-effort: ошибка НЕ должна откатывать уже начисленный кредит чипов и НЕ должна терять запись депозита (см. `swept`/`sweepTxid` в `DepositRecord`, ретрай на следующих тиках). `ChainAdapter` (`chains/types.ts`) — единый интерфейс на сеть; `evmAdapter.ts` один код для ethereum/bsc (общий адрес/деривация). `LOOKBACK_BLOCKS` в `evmAdapter.ts` ограничен бесплатными RPC (publicnode.com режет `eth_getLogs` диапазоном >100 блоков) — не увеличивать без платного RPC-провайдера. Статус по сетям и testnet-прогону — [docs/ROADMAP.md](docs/ROADMAP.md) §11.1.

---

## §1. Главное правило: ничего лишнего

**Делать ровно то, что попросил пользователь. Не больше, не меньше.**

- НЕ додумывать задачу. Просили «поправить кнопку» — правится только кнопка.
- НЕ «заодно» рефакторить, переименовывать, выносить в хелперы, менять форматирование соседнего кода.
- НЕ добавлять обработку ошибок, валидацию, фолбэки, если не просили.
- НЕ добавлять комментарии «от себя».
- НЕ создавать новые файлы (README, доки, утилиты), если не просили.
- НЕ менять `package.json`, если задача не про зависимости.
- НЕ переписывать рабочий код «красивее».
- НЕ удалять «неиспользуемый» код без разрешения.

**Если по ходу видна другая проблема** — сказать пользователю, спросить, чинить ли отдельной задачей.
**Если задача неоднозначна** — задать вопрос, не выбирать «по своему усмотрению».

---

## §2. Процедура перед изменением кода

1. Прочитать §0 инварианты (выше).
2. Прочитать файл, который собираешься менять — целиком.
3. Через Grep понять, как файл используется в других местах.
4. Сформулировать про себя: «просили X. Я меняю Y. Y делает только X и ничего больше».
5. Только после этого — Edit/Write.

После: не «проверять для уверенности» повторным чтением — Edit уже подтвердил применение. Кратко сказать, что изменено.

### §2.1. Сложные задачи — ultrathink

Перед сложной задачей — extended thinking. **Сложная задача**:
- Затрагивает >1 файла/слоя (клиент+сервер).
- Меняет логику покера, состояние игры, фазы, ставки, определение победителя.
- Касается авторизации, токенов, прав доступа.
- Касается сокет-протокола, событий, синхронизации.
- Несколько правдоподобных решений, выбор неочевиден.
- Пользователь сказал «подумай», «ultrathink», «тщательно».

**В режиме**: (1) сформулировать задачу; (2) перебрать варианты с плюс/минус; (3) найти граничные случаи; (4) проверить, не ломает ли уже работающее; (5) выбрать минимальное по объёму решение.

**Оценить, не отдать ли агенту**: `Explore` для >10 файлов, `Plan` для проектирования, `general-purpose` с `run_in_background` для независимой длинной работы.

Если непонятно «сложная или простая» — считать сложной.

---

## §3. Стек и архитектура

Подробности → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Кратко:
- **client/** — React 19 + Vite + Tailwind v4 + Zustand + Framer Motion + react-router-dom + socket.io-client + `@twa-dev/sdk`
- **server/** — Node + Express 5 + Socket.IO + bcrypt + jsonwebtoken + JSON-файлы в `server/data/`
- **shared/index.ts** — общие типы (продублированы в server из-за `rootDir`, см. ARCHITECTURE.md)
- **Запуск**: `npm run dev` из корня (клиент `:5173` + сервер `:3001`)

---

## §4. Опасные действия — только с подтверждения

- `git push`, удаление веток, амэнд опубликованных коммитов
- Удаление файлов и папок
- `rm -rf`, массовая перезапись
- Изменения в `package.json` (установка/удаление зависимостей)
- Изменения в `vite.config.ts`, `tsconfig.json`, `.env`
- Очистка `server/data/*.json` (там реальные пользователи)
- Любые публичные действия: PR, комментарии, отправка сообщений
- Загрузка контента в третьесторонние веб-инструменты (может содержать чувствительное)

**Запрещено технически** через `deny` в settings (см. §0 пункт 7):
- `git push --force*`
- `git push -f*`
- `git reset --hard*`

Тесты, локальные правки исходников, `git status`, `git diff`, чтение файлов — можно без подтверждения.

---

## §5. UI: адаптивность и Telegram Mini App

**Любой UI-код должен работать на трёх таргетах:**
1. Десктоп (≥1024px).
2. Mobile (≥360px, портрет и ландшафт).
3. **Telegram Mini App** ([useTelegram.ts](client/src/hooks/useTelegram.ts), `@twa-dev/sdk`).

**Правила**:
- Tailwind-брейкпоинты (`sm:`, `md:`, `lg:`), не хардкод `width: 1200px`.
- Absolute-вёрстка должна сжиматься на 360-414px.
- Touch target ≥ 44×44px.
- Hover не должен быть единственным каналом информации.
- Full-height — `100dvh` / `100svh`, не `100vh`.
- Перед «готово» — мысленно проверить iPhone SE (375×667) и TWA-окно.

Подробности по бренду/UX → [docs/BRAND.md](docs/BRAND.md).

---

## §6. Стиль кода (соблюдать существующий)

- Комментарии — на русском (как принято: `// Раздача карт`, `// Проверка на уникальность`).
- Имена идентификаторов — на английском.
- Кавычки — одинарные.
- Точка с запятой — ставится.
- В JSX className — конкатенация `+`, не `clsx`/`classnames` без задачи.
- API-URL на клиенте — из [client/src/config/api.ts](client/src/config/api.ts), не хардкодить.
- Socket-события — через `SOCKET_EVENTS` из `shared/index.ts`. Если события нет — спросить.

---

## §7. Команды

- `npm run dev` (из корня) — клиент + сервер через `concurrently`
- `npm run dev:client` / `npm run dev:server` — отдельно
- Vite: `:5173`, Express: `:3001`
- `npm run check` (из корня) — guard контракта + typecheck (server+client) + client lint + server vitest + client vitest. `npm run check:contract` — только guard синхронности `SOCKET_EVENTS` (быстро). Прогонять после правок. Полностью зелёный с 2026-06-04 (390 серверных + 61 клиентский тест на 2026-06-14).
- Клиентские тесты: vitest 4 + jsdom + @testing-library/react. Конфиг — [client/vitest.config.ts](client/vitest.config.ts), setup — [client/src/test/setup.ts](client/src/test/setup.ts). Файлы — `*.test.ts(x)` рядом с исходником. `npm --prefix client run test` (или `test:watch`).

Не запускать `npm install` без необходимости. Не делать `build` без запроса.

**Освободить порты** (Windows, частая необходимость):
```powershell
$ports=@(3001,5173,5174); foreach($p in $ports){ Get-NetTCPConnection -LocalPort $p -State Listen -EA SilentlyContinue | %{ Stop-Process -Id $_.OwningProcess -Force } }
```

**Проверка зомби-процессов**: при каждом рестарте `npm run dev` должно быть **ровно 10** `node.exe` (цепочка: npm→concurrently→2×npm→2×npm→vite+nodemon→tsx→server). Не 10 — диагностика через `Get-CimInstance Win32_Process | Where Name -eq 'node.exe'`.

---

## §8. Память между сессиями

Договорённости с пользователем и подсказки → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (раздел «Подсказки по проекту»).

Бренд и UX-требования → [docs/BRAND.md](docs/BRAND.md).

Задачи в работе и roadmap → [docs/ROADMAP.md](docs/ROADMAP.md).

Шероховатости после выполненных задач (постмортемы) → [memory/postmortems-2026-Q2.md](memory/postmortems-2026-Q2.md). Помесячные файлы, автоматический prune через Anthropic Auto Dream.

**Что записывать в постмортемы (короткие правила):**
- Каждый пункт §11 проверяется — может ли стать (а) тестом, (б) правилом в `docs/ARCHITECTURE.md` раздел «грабли», (в) hook'ом. Иначе — не записывать.
- Закрылась шероховатость — удалить из постмортема, а не оставлять «закрыто 2026-XX-XX».

---

## §9. Договорённости с пользователем

- Пользователь пишет по-русски — отвечать по-русски.
- Правило №1 из §1: «ничего не додумывать и не лепить от себя».
- Перед любым действием — §0 + §1.
- **Все требования к игре и дизайну из чата записывать в [docs/BRAND.md](docs/BRAND.md)** — чтобы сверять проект на соответствие.
- **Performance-first**: см. §0 пункт 10.
- **Целевая конвертация в приложение**: PWA / Capacitor (Android/iOS). Избегать браузер-only API без fallback, hover-only, хардкода `localhost`.

---

## §10. Стиль работы

- При неоднозначном выборе показывать **2–4 варианта** через AskUserQuestion с пометкой «рекомендую». Не выбирать молча.
- Триггеры extended thinking: «**ультрадумай**», «**тщательно**», «**хорошо подумай**».
- «**По важности**» = отсортировать оставшиеся задачи и предложить первой самую критичную.
- **Лаконичный режим (по умолчанию, договорённость 2026-06-12).** Отвечать коротко и плотно, нормальным русским: без преамбул/расшаркиваний/повторов, минимум таблиц, только суть. Экономит output-токены. Развёрнуто — только по явному запросу. НЕ переспрашивать про это.
- После задачи — **только «возможные шероховатости»** коротко (1–2 строки, без воды). Блоки «что сделано» / «что НЕ делал и почему» НЕ писать (договорённость 2026-06-13).
- **Журнал для заказчика [docs/REPORT.md](docs/REPORT.md).** В конце сессии (особенно при переходе в новый чат) дописывать туда простым языком, что сделано — для отчёта заказчику. Когда пользователь просит **«отчёт»/«дай отчёт»** — выдать содержимое REPORT.md и **очистить файл** (оставить только шапку) под новое наполнение.
- **Новая фича → ДОПИСАТЬ тесты (если требуется).** Добавили новую функциональность — в том же заходе **дописать НОВЫЕ тесты в существующий набор** (server vitest / client vitest, рядом с исходником `*.test.ts(x)`), а не просто прогнать имеющиеся. Покрывать: чистую логику (правила покера, equity, сериализация, валидация), серверное поведение, граничные случаи. Обязательно — чистые функции и инварианты §0. Чисто-визуальные/вёрстка-правки — тесты по необходимости (или отметить в резюме, почему не покрыто). После — `npm run check` (он и прогонит новые тесты вместе со всеми).
- Шероховатости → в [memory/postmortems-2026-Q2.md](memory/postmortems-2026-Q2.md), и **только если** удовлетворяют правилу из §8 (становится тестом / правилом / hook'ом).
- Цель «адаптив под мобилу» = **всё помещается без скролла** на iPhone SE 375×667.
- При багах сервера в первый заход — **минимально-инвазивный фикс с guard'ом**. Корневые причины — отдельным пунктом roadmap.
- **Перед запуском долгоживущего процесса** (`npm run dev` и т.п.) — убить старую копию, см. §7.
- Выполненные пункты roadmap удалять **сразу** после задачи и упоминать это в резюме.
- «**Все по порядку**» = двигаться через оставшиеся 💤 по убыванию важности, но на неоднозначных подходах — спрашивать. Не делать всё молча.
- Если рефакторинг провалился (поломал работу) — **сразу откатить** к рабочему состоянию, зафиксировать инцидент в [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) раздел «Грабли», идти дальше.
- Ручные тесты (TWA, прогон по таргетам) — выполнить не могу, сообщить пользователю и предложить чеклист.
- Серверный лог фоновой dev-задачи мониторю сам (по запросу или для проверки крашей после правок). Клиент не должен запускать команды для проверки.
- **Дизайн-вдохновение — GGPoker**.
- **Экономия лимита: модель по типу задачи (договорённость 2026-06-14).** По умолчанию пользователь держит **Sonnet** для рутины (UI/вёрстка, правки по чёткому ТЗ, тесты, типы, понятные баги). На **сложной** задаче (§2.1: §0-инварианты — карты/showdown/банкролл/сайд-поты; многослойная синхронизация клиент↔сервер; проектирование с неочевидным выбором) — **напомнить пользователю переключиться на Opus** (`/model`), решение и переключение за ним: сам модель сменить не могу. Тяжёлый перебор файлов при необходимости отдавать дешёвому субагенту (`Agent` с `model: haiku`/`sonnet`), не основному диалогу.

---

## §11. GStack workflow

В окружении установлен [GStack](https://github.com/garrytan/gstack) (`~/.claude/skills/gstack/`) — 48+ skills, использовать **проактивно**. Таблица триггеров «какой skill когда вызывать» + правила «что не делать» вынесены в [docs/GSTACK_WORKFLOW.md](docs/GSTACK_WORKFLOW.md) — прочитать при работе со skill'ами (баг → `/investigate`, UI → `/qa`, ship → `/ship`, ревью → `/review`, security → `/cso`, работа с `server/data` → `/careful`).

---

## §12. task-observer — мета-скилл наблюдений за работой

В начале любой задаче-ориентированной сессии (используются инструменты, есть результат) — вызывать скилл `task-observer` до начала работы. Он копит наблюдения (повторяющиеся паттерны, поправки пользователя, находки по методологии, кандидаты в новые/улучшенные скиллы) в `skill-observations/log.md` в стабильной project-папке харнесса (`~/.claude/projects/<project-id>/`) — НЕ в этом репозитории и не в git. При загрузке любого скилла — проверять лог на OPEN-наблюдения по нему. Раз в ~7 дней при накопленных наблюдениях — предложит comprehensive review одной строкой, не блокируя текущую задачу.

Установлен: [.claude/skills/task-observer/](.claude/skills/task-observer/SKILL.md), автор Eoghan Henn (rebelytics.com), лицензия CC BY 4.0.

<!-- BEGIN sqz-claude-guidance (auto-installed by sqz init; remove this block to disable) -->

## sqz — Context Compression (READ FIRST)

sqz is installed in this project. It compresses tool output so large
files, long logs, and verbose command output cost far fewer tokens.
There are **two ways** sqz is wired in, and you should prefer each
one in the situations below.

### Preferred tools (MCP)

The `sqz-mcp` server is registered in this project's MCP config. It
exposes three read-only tools that compress their output through the
sqz pipeline:

- **`sqz_read_file`** — read a file from disk and return a compressed
  view. **PREFER this over the built-in `Read` tool** for any file
  larger than ~2KB or any file you might read more than once in the
  same session. Repeat reads return a 13-token `§ref:HASH§` reference
  instead of the full content.

- **`sqz_grep`** — search files for a literal string or regex.
  **PREFER this over the built-in `Grep`** for anything that might
  match more than a handful of lines. Caps at 200 matches by default;
  raise with `max_matches` if needed.

- **`sqz_list_dir`** — list a directory. Skips `.git`, `node_modules`,
  `target`, `dist`, `build`, `vendor`, `__pycache__` so the output
  stays focused. **PREFER this over `ls -la` via Bash** when you want
  to see a project layout.

The built-in `Read`, `Grep`, `Glob` tools remain available. Use them for:
- Tiny config files (<1KB) where compression can't help.
- Byte-exact reads you'll hash or diff (lockfiles, signatures).
- Globbing (sqz has no glob tool; `Glob` is still the right choice).

### Bash commands (hooked automatically)

When you run a shell command through the `Bash` tool, a PreToolUse hook
rewrites it to pipe output through `sqz compress`. This is transparent:
you don't need to remember to add anything, but it's useful to know
that these commands get compressed automatically:

```bash
git status           # → git status 2>&1 | sqz compress --cmd git
cargo test           # → cargo test 2>&1 | sqz compress --cmd cargo
docker ps            # → docker ps 2>&1 | sqz compress --cmd docker
kubectl get pods     # → kubectl get pods 2>&1 | sqz compress --cmd kubectl
```

The rewrite is skipped for interactive commands (`vim`, `ssh`,
`python`), compound commands (`a && b`, `a > file.txt`), and anything
already going through sqz.

### Escape hatch — when you see a `§ref:HASH§` token

If tool output contains a `§ref:a1b2c3d4§` token and you need the full
content it points at, resolve it. Three equivalent ways:

- Shell: `C:\Users\Administrator\AppData\Roaming\npm\node_modules\sqz-cli\bin\sqz.exe expand a1b2c3d4` (or paste the whole token
  `C:\Users\Administrator\AppData\Roaming\npm\node_modules\sqz-cli\bin\sqz.exe expand §ref:a1b2c3d4§`).
- MCP tool: call `expand` with `{ "prefix": "a1b2c3d4" }`.
- To get uncompressed output for one command: prefix it with
  `SQZ_NO_DEDUP=1` (e.g. `SQZ_NO_DEDUP=1 git log | sqz compress`).

If the compressed output is actively making the task harder (looping
on refs, small retries replacing one big read), call the `passthrough`
MCP tool to get raw text.

### When NOT to use sqz tools

- Writing or editing files — use the built-in `Write`/`Edit` tools.
  sqz has no write tools (by design; see issue #5 follow-up).
- Running commands interactively or in watch mode.
- Reading very small files (<1KB) where compression can't help.

<!-- END sqz-claude-guidance -->
