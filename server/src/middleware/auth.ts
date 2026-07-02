import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../auth/verifyToken.js';
import { isSessionValid } from '../auth/sessionStore.js';

// sid отсутствует у токенов, выпущенных до «Мои устройства» (§10.15, ROADMAP) — таким даём пройти.
// Если sid есть — сессия должна существовать в sessions.json (иначе её отозвали — см. revokeSession).
function sessionRevoked(decoded: { sid?: string }): boolean {
  return !!decoded.sid && !isSessionValid(decoded.sid);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'No token' });
    return;
  }
  const decoded = verifyToken<{ sid?: string }>(token);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  if (sessionRevoked(decoded)) {
    res.status(401).json({ error: 'Session revoked' });
    return;
  }
  (req as unknown as { user: unknown }).user = decoded;
  next();
}

export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'No token' });
    return;
  }
  const decoded = verifyToken<{ role: string; sid?: string }>(token);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  if (sessionRevoked(decoded)) {
    res.status(401).json({ error: 'Session revoked' });
    return;
  }
  if (decoded.role !== 'admin') {
    res.status(403).json({ error: 'Admin only' });
    return;
  }
  (req as unknown as { user: unknown }).user = decoded;
  next();
}
