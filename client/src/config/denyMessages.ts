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
  'on-cooldown': 'Вход за стол временно закрыт админом',
  'closed': 'Комната закрыта админом',
  'no-chips': 'У вас закончились фишки',
  'insufficient-bankroll': 'Недостаточно фишек для минимального бай-ина',
  'invalid-buyin': 'Сумма бай-ина вне допустимого диапазона',
  'too-many-tables': 'Открыто максимум столов (3) — закройте один',
  'club-members-only': 'Стол только для членов клуба',
  'anti-collusion': 'Вход запрещён: с этого IP/устройства уже занято место за этим столом',
};

export function denyMessage(reason: string, fallback: string, retryAfterSec?: number): string {
  // Временный кик: показываем остаток времени, если сервер его прислал.
  if (reason === 'on-cooldown' && retryAfterSec && retryAfterSec > 0) {
    const min = Math.ceil(retryAfterSec / 60);
    return 'Вход за стол закрыт админом. Попробуйте через ' + min + ' мин';
  }
  return DENY_MESSAGES[reason] ?? fallback;
}
