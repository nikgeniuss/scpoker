---
name: POKER HUB
description: Ночной VIP-зал казино — тёмный, живой покер-рум в духе GGPoker/ClubGG/PokerStars
colors:
  felt-emerald: "#10b981"
  felt-emerald-deep: "#059669"
  vip-gold: "#f59e0b"
  vip-gold-bright: "#fbbf24"
  vip-gold-deep: "#d97706"
  alert-red: "#dc2626"
  alert-red-bright: "#ef4444"
  card-back-blue: "#1e40af"
  table-felt: "#0e5e2e"
  table-felt-dark: "#0a3d1d"
  poker-green: "#1a472a"
  poker-green-dark: "#0d2616"
  void-black: "#070707"
  surface-raised: "#111827"
  surface-card: "#1f2937"
  surface-hairline: "rgba(255,255,255,0.10)"
  surface-ghost: "rgba(255,255,255,0.05)"
  ink: "#ffffff"
  ink-muted: "#9ca3af"
typography:
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  numeric:
    fontFamily: "inherit"
    fontFeature: "tabular-nums lining-nums"
  label:
    fontFamily: "Inter Tight, Inter, sans-serif"
    fontWeight: 800
    letterSpacing: "0.08em"
  display-classic:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontWeight: 600
    letterSpacing: "-0.02em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  full: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.felt-emerald}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "8px 20px"
  button-vip:
    backgroundColor: "{colors.vip-gold}"
    textColor: "#000000"
    rounded: "{rounded.lg}"
    padding: "8px 20px"
  button-ghost:
    backgroundColor: "{colors.surface-ghost}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "6px 16px"
  card-row:
    backgroundColor: "{colors.surface-ghost}"
    rounded: "{rounded.lg}"
  card-grid:
    backgroundColor: "{colors.surface-card}"
    rounded: "{rounded.lg}"
---

# Design System: POKER HUB

## 1. Overview

**Creative North Star: "Ночной VIP-зал казино"**

POKER HUB — не маркетинговый лендинг и не SaaS-дэшборд «для доверия»: это ночной, премиальный, живой зал казино в духе GGPoker/ClubGG/PokerStars. Свет — точечный (неоновый циан/мадженто на логотипе, тёплый gold-glow вокруг VIP-элементов, изумрудный accent на активных состояниях), а не разлитый ambient light — вокруг света всегда остаётся плотная тьма (`#070707`–`#111827`). Система плотная: за столом и в лобби одновременно на экране много контролов и статуса — это не минимализм, это «диспетчерская зала», где опытный игрок должен видеть всё нужное без кликов вглубь.

Система явно отвергает: светлый/кремовый/бежевый фон «для доверия» (SaaS-клише), generic AI-лендинг приёмы (градиент-текст, uppercase-eyebrow над каждой секцией, hero-metric блоки, одинаковые card-грид), и любой отход от GGPoker/ClubGG/PokerStars референса без явного запроса пользователя (PRODUCT.md, Anti-references).

**Key Characteristics:**
- Тёмный холст (`void-black` → `surface-raised`) с точечным светом, не заливкой
- Двойной accent-словарь: **emerald** = действие/успех/твой ход, **gold/amber** = премиальность/VIP/джекпот — они не взаимозаменяемы
- Плотность важнее воздуха: больше одновременно видимой информации, чем в типичном SaaS
- Tactile & confident: интерактивные элементы весомые, с заметной hover/press-реакцией (glow, gradient shift), не тонкие плоские "flat UI"

## 2. Colors

Тёмная сцена с двумя конкурирующими системами света: изумрудная (стол, действие, деньги в плюс) и золотая (VIP, джекпот, премиальность). Между ними — глубокая нейтральная тьма, не серая, а почти чёрная.

### Primary
- **Felt Emerald** (`#10b981`): основной accent — CTA "Войти" за столом, активные состояния, индикатор своего хода, положительный банкролл. Тот же оттенок используется и в CSS-теме стола (`--color-poker-gold`, историческое имя переменной, но значение — изумруд).
- **Felt Emerald Deep** (`#059669`): нижняя точка градиентов на emerald-кнопках, hover-состояния.

### Secondary
- **VIP Gold** (`#f59e0b`) / **VIP Gold Bright** (`#fbbf24`): премиальный accent — Bad Beat Jackpot, featured/VIP-столы, watermark classic-темы, предупреждающие статусы (не критичные, но заметные — «стол полон», рейк-инфо). Никогда не смешивать роль с emerald: gold = «особое», emerald = «действие».

### Tertiary
- **Alert Red** (`#dc2626` / `#ef4444`): опасность/полный стол/фолд/минус в банкролле. Единственный статусный красный в системе — не использовать для декора.
- **Card Back Blue** (`#1e40af`): зарезервирован за рубашкой карт (`theme-classic`), не для UI-хрома.

### Neutral
- **Void Black** (`#070707`): базовый холст полноэкранных сцен лобби/фичед-карточек. Более тёмный и «сценический», чем стандартный `gray-950` Tailwind, который сейчас стоит на большинстве второстепенных страниц (см. Don'ts).
- **Surface Raised** (`#111827`, Tailwind `gray-900`): карточки, панели, поднятые поверхности над холстом.
- **Surface Card** (`#1f2937`, Tailwind `gray-800`): вложенные поверхности внутри панелей (инпуты, вложенные блоки).
- **Surface Hairline** (`rgba(255,255,255,0.10)`): единственный принятый способ обозначить границу — тонкая белая линия на тёмном, не серый `border-gray-700`.
- **Surface Ghost** (`rgba(255,255,255,0.05)`): фон интерактивных строк/ghost-кнопок в состоянии покоя, `0.10` — на hover.

### Named Rules
**The Two Lights Rule.** Emerald и gold никогда не конкурируют за одну и ту же роль на одном экране. Emerald — «сделай действие», gold — «это премиально». Если на кнопке непонятно, какая роль — выбрать по функции, не по вкусу.

## 3. Typography

**Body Font:** Inter (заявлен в стеке, но веб-шрифт не подключён — фактически рендерится системным `system-ui`/`-apple-system`/Segoe UI/Roboto в зависимости от ОС)
**Label/Mono Font:** Inter Tight (только вотермарк ClubGG-темы)
**Display Font (classic-тема only):** Cormorant Garamond italic — только вотермарк стола в классической теме, не используется вне стола

**Character:** Функциональный гротеск как рабочая лошадка везде вне стола (числа, лейблы, UI-текст) — продуктовый регистр это допускает (§0 product.md: «System fonts and familiar sans defaults... are OK»). Индивидуальность system сосредоточена не в шрифтовой паре, а в цвете/свете/motion.

### Hierarchy
- **Numeric/Money** (700–900, tabular-nums): банк, стек, блайнды — всегда `font-variant-numeric: tabular-nums`, чтобы цифры не «прыгали» при обновлении.
- **Title** (700–900, 14–24px): названия столов, заголовки карточек.
- **Body** (400–600, 13–16px): описания, вторичная инфа.
- **Label** (700–800, 10–11px, uppercase, tracking 0.08–0.1em): статусные бейджи, категории фильтров.

### Named Rules
**The Unloaded Font Rule.** Пока Inter не подключён webfont-инклюдом, объявление `font-family: 'Inter'` в CSS ничего не даёт кроме отката к системному шрифту — это не осознанный выбор, а не доведённая до конца настройка. Решить явно: либо подключить Inter (`@fontsource` / Google Fonts self-hosted), либо снять объявление и оформить system-ui как осознанный выбор.

## 4. Elevation

Система слоистая (layered/lifted), не плоская: карточки, панели и особенно игровой стол используют многослойные тени и glow-эффекты, а не единый плоский `shadow-lg`. Свет — часть повествования (gold-glow вокруг VIP, emerald-glow вокруг активного хода), не только физика тени.

### Shadow Vocabulary
- **card-contact** (`0 1px 1px rgba(0,0,0,0.6)`): контактная тень карт/фишек — самый нижний, резкий слой.
- **card-ambient** (`0 8px 16px rgba(0,0,0,0.25), 0 16px 32px rgba(0,0,0,0.15)`): рассеянная тень поднятых элементов (карты, модалки).
- **emerald-glow** (`0 0 0 0 rgba(16,185,129,0.4)` → пульсирующее кольцо): банк/активный статус.
- **gold-glow** (`drop-shadow(0 8px 18px rgba(251,191,36,0.65))`): победная карта на шоудауне, VIP-элементы.
- **rail-inset** (составной `inset` box-shadow, 4 слоя): бортик стола — псевдо-физический объём через вложенные insets, не через 3D.

### Named Rules
**The Backdrop-Blur Rule.** Плавающие панели поверх контента (навбар, нижний tab-bar) — `backdrop-blur-md` + `bg-black/50..70`, не сплошная заливка. Это единственный принятый способ «поднять» UI-хром над контентом без появления второй системы теней.

## 5. Components

### Buttons
- **Shape:** `rounded-lg`/`rounded-xl` (12–16px) — никогда `rounded-full` кроме toggle-переключателей и pill-бейджей.
- **Primary (действие):** градиент `from-emerald-500 to-green-600` (или `to-emerald-700`), белый текст, `hover:shadow-lg hover:shadow-emerald-500/30` — тень окрашена в цвет кнопки, не нейтрально-серая.
- **VIP/Premium:** градиент `from-amber-400 to-amber-600` (или `-500 to -orange-600`), чёрный текст (для контраста на золоте), `hover:shadow-amber-500/30`.
- **Ghost/Secondary:** `bg-white/5 hover:bg-white/10`, `border border-white/10`, серый текст → белый на hover.
- **Danger/Queue (стол полон):** `bg-amber-500/20 text-amber-300 border-amber-500/40` — предупреждение, не критическая ошибка (красный зарезервирован за более серьёзными статусами).

### Chips / Pills
- **Style:** `rounded-full`, `bg-black/45`, цветная граница по роли (`border-emerald-500/40` / `border-amber-500/40`), текст того же accent-цвета.
- **State:** активный сегмент — сплошная заливка accent-цветом (`bg-emerald-500 text-black`), неактивный — `text-gray-400 hover:text-white` без фона.

### Cards / Containers
- **Corner Style:** `rounded-2xl` (16px) для карточек-контейнеров верхнего уровня, `rounded-lg` внутри.
- **Background:** список — `bg-white/[0.02]` в покое → `bg-white/[0.05]` на hover (едва заметная подсветка строки); сетка — `bg-gray-900/55`.
- **Border:** `border-white/10` универсально; акцентная `border-amber-500/40` только на featured/VIP-карточках.
- **Shadow Strategy:** см. Elevation — контейнеры сами по себе плоские, glow появляется по состоянию (hover/featured), не по умолчанию.

### Inputs / Fields
- **Style:** `bg-gray-800`, `border border-white/10`, `rounded-lg`.
- **Focus:** `focus:border-emerald-500` — граница, не box-shadow ring.
- **Disabled:** `opacity-40 cursor-not-allowed`.

### Navigation
- Плавающий навбар: `fixed`, `backdrop-blur-md bg-black/50 border-b border-white/10`. Нижний tab-bar (mobile) — тот же язык, `bg-black/70`, `border-t`.

### Table Felt (signature component)
Игровой стол — не часть общего компонентного словаря, а отдельная тематическая система (`theme-classic` / `theme-clubgg` в `index.css`): радиальный фетр-градиент, зерновая текстура, многослойный `poker-oval-rail` с бортиком, вотермарк по центру. Не переносить эти паттерны на UI вне стола буквально — они держат «сцену», а не хром.

## 6. Do's and Don'ts

### Do:
- **Do** использовать `felt-emerald` (#10b981) только для действия/успеха и `vip-gold` (#f59e0b/#fbbf24) только для премиальности/джекпота — не смешивать роли на одном экране (The Two Lights Rule).
- **Do** красить hover-тени кнопок в цвет самой кнопки (`hover:shadow-emerald-500/30`, `hover:shadow-amber-500/30`), не оставлять нейтральный `shadow-lg`.
- **Do** использовать `tabular-nums` на всех денежных и счётных значениях.
- **Do** держать границы как `border-white/10` (hairline), не `border-gray-700` — это разные системы, использующиеся сейчас параллельно на разных экранах.
- **Do** плавающие панели (навбар, tab-bar) — через `backdrop-blur` + полупрозрачный чёрный, не сплошной `bg-gray-950`.

### Don't:
- **Don't** светлый/кремовый/бежевый фон «для доверия» — прямое нарушение Anti-references PRODUCT.md.
- **Don't** generic AI-лендинг приёмы: градиент-текст, uppercase-eyebrow над каждой секцией, hero-metric блоки, одинаковые карточные гриды.
- **Don't** объявлять `font-family: 'Inter'`, не подключив сам шрифт — либо подключить, либо явно принять системный стек (The Unloaded Font Rule).
- **Don't** оставлять второстепенные страницы (профиль, кошелёк, статические/legal, часть админ-вкладок) на голом `bg-gray-950` + `border-gray-700` без accent-словаря — это другая, более старая система, чем та, что уже есть в лобби/столе/CreateRoomModal.
- **Don't** переносить фетровую тему стола (`theme-classic`/`theme-clubgg`, зерно, oval-rail) на обычный UI-хром вне стола — это сценический, не продуктовый слой.
