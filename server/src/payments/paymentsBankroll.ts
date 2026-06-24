import { BankrollService } from '../game/bankrollService.js';

// Платежи работают только с реальными юзерами (боты не имеют крипто-кошельков) — isBot всегда
// false, getBotChips/persistBotChips никогда не вызываются. notify — пуш BANKROLL_UPDATE в сокет,
// инжектится из index.ts (там есть io через GameManager.notifyBankroll), чтобы этот модуль не
// тянул транспорт (§0.11). Один общий BankrollService — та же единственная точка правды по chips,
// что использует GameManager (оба читают/пишут users.json через storage.ts, §0.4).
let notifyFn: (userId: string, chips: number) => void = () => {};

export function setBankrollNotifier(fn: (userId: string, chips: number) => void): void {
  notifyFn = fn;
}

export const paymentsBankroll = new BankrollService({
  isBot: () => false,
  getBotChips: () => null,
  persistBotChips: () => {},
  notify: (userId, chips) => notifyFn(userId, chips),
});
