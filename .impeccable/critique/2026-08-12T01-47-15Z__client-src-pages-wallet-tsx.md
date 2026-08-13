---
target: client/src/pages/Wallet.tsx
total_score: 13
p0_count: 2
p1_count: 2
timestamp: 2026-08-12T01-47-15Z
slug: client-src-pages-wallet-tsx
---
**Method: dual-agent (A: design-review subagent · B: detector subagent)**

## Design Health Score — Wallet.tsx
Total: 13/40 (Poor). Nielsen 1-10: 1,2,1,1,1,2,1,2,2,0.

## Anti-Patterns Verdict
LLM: generic dark-fintech form, off-token bg #0a0f1a, primary button off-spec (flat vs gradient in design.json), emerald/gold vocabulary barely used, DESIGN.md names wallet directly as example of a page without accent vocabulary.
Detector: 0 findings — narrow ruleset (CSS-syntax/specific tokens), not project-design-system-aware; divergence expected, not a quality signal. Browser overlay unavailable this session (no Playwright/computer-use).

## What's Working
1. Deposit color (text-emerald-400) — correct Two Lights Rule usage.
2. Hairline borders (border-white/10) match DESIGN.md.
3. Mobile field ergonomics (inputMode=decimal, disabled reasons as text).

## Priority Issues
[P0] No review/confirm step before irreversible withdrawal — typo in address/network = real money loss. Fix: confirm modal with summary + client-side address format validation. Command: harden
[P0] Real bug: missing catch in submitWithdraw/requestWithdrawal — network failure during withdraw gives zero feedback, risk of duplicate submission. Command: harden
[P1] Withdrawal statuses have no color coding — rejected/failed render same as paid; alert-red exists in system, unused. Command: colorize
[P1] No loading state, no pending-deposit state — loading from store unused; store fetch shows dash+disabled button indistinguishable from broken. Command: clarify
[P2] Screen off design-system tokens — bg-[#0a0f1a] hardcoded hex not in palette; primary button not matching ds-btn-primary gradient spec. Command: colorize

## Persona Red Flags
Jordan (first-timer, money-anxious): no confirm before irreversible withdraw; silence after sending USDT; copyAddress has no .catch(), Telegram WebView Clipboard API can silently fail.
Riley (stress test): network drop mid-withdrawal confirmed as real bug (P0); rejected withdrawal visually identical to success; USDT-vs-chips unit mismatch between form and history.

## Minor Observations
Touch targets below 44x44 (back button, copy button). focus-visible on withdraw button doesn't match design.json spec. No Max button on amount. Limits shown statically, not validated live.
