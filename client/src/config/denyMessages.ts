// Единый словарь сообщений отказа во входе/доступе (событие joinDenied).
// Раньше дублировался в useLobbyData и useGameRoom с разнобоем формулировок (ROADMAP §9.3-F).
// Для совпадающих по смыслу ключей (in-game/no-chips) взята более точная формулировка GameRoom.
// Контекстный fallback передаётся вызывающим (в лобби — «Не удалось войти», за столом — «Доступ закрыт: …»).
export const DENY_MESSAGES: Record<string, string> = {
  'not-found': 'Комната не найдена',
  'wrong-password': 'Неверный пароль',
  'password-required': 'Требуется пароль',
  'full': 'Комната заполнена',
  'in-game': 'Раздача уже идёт — дождитесь окончания',
  'kicked': 'Вас удалил админ',
  'closed': 'Комната закрыта админом',
  'no-chips': 'У вас закончились фишки',
  'insufficient-bankroll': 'Недостаточно фишек для минимального бай-ина',
  'invalid-buyin': 'Сумма бай-ина вне допустимого диапазона',
};

export function denyMessage(reason: string, fallback: string): string {
  return DENY_MESSAGES[reason] ?? fallback;
}
