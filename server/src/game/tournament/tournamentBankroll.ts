import { BankrollService } from '../bankrollService.js';

// Турнирный бай-ин/выплата работают только с реальными юзерами (боты в турнирах не участвуют —
// нет нужды в крипто/банкролл-сценариях ботов). notify — пуш BANKROLL_UPDATE в сокет, инжектится
// из index.ts через GameManager.notifyBankroll (тот же паттерн, что paymentsBankroll.ts — общий
// BankrollService/users.json, §0.4, не отдельная точка правды по chips).
let notifyFn: (userId: string, chips: number) => void = () => {};

export function setTournamentBankrollNotifier(fn: (userId: string, chips: number) => void): void {
  notifyFn = fn;
}

export const tournamentBankroll = new BankrollService({
  isBot: () => false,
  getBotChips: () => null,
  persistBotChips: () => {},
  notify: (userId, chips) => notifyFn(userId, chips),
});
