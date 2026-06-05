// Идентичность бота: единый предикат вместо дублей startsWith('bot:') в
// GameManager и BotManager (ROADMAP §9.3-D). Bot-id всегда имеет префикс 'bot:'.
export const BOT_ID_PREFIX = 'bot:';

export function isBot(playerId: string): boolean {
  return playerId.startsWith(BOT_ID_PREFIX);
}
