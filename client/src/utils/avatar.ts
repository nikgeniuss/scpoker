// Детерминированные аватары игроков через react-nice-avatar (локально, офлайн, MIT).
// genConfig(seed) даёт стабильный конфиг лица из строки — один и тот же seed (player.id)
// = одно и то же лицо. Рендер компонентом <ReactNiceAvatar {...config} /> в seat'ах.
import { genConfig } from 'react-nice-avatar';
import type { AvatarFullConfig } from 'react-nice-avatar';

export type AvatarCfg = Required<AvatarFullConfig>;

// Кэш по seed — genConfig не бесплатен, а seat перерисовывается часто (ход/таймер).
const cache = new Map<string, AvatarCfg>();

// Вернуть конфиг аватара для игрока. seed — стабильный id (или username как fallback).
export function avatarConfig(seed: string): AvatarCfg {
  const key = seed || 'anon';
  const hit = cache.get(key);
  if (hit) return hit;
  const cfg = genConfig(key);
  cache.set(key, cfg);
  return cfg;
}
