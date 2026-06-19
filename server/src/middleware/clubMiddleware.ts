import { Request, Response, NextFunction } from 'express';
import { getClubById } from '../game/clubService.js';

// Проверяет, что аутентифицированный пользователь является владельцем клуба из :id.
// Применять ПОСЛЕ authMiddleware. При успехе пробрасывает club в req.club.
export function requireClubOwner(req: Request, res: Response, next: NextFunction): void {
  const jwtUser = (req as unknown as { user: { id: string } }).user;
  const club = getClubById(String(req.params.id));
  if (!club) {
    res.status(404).json({ error: 'Клуб не найден' });
    return;
  }
  if (club.ownerId !== jwtUser.id) {
    res.status(403).json({ error: 'Только владелец клуба' });
    return;
  }
  (req as unknown as { club: unknown }).club = club;
  next();
}
