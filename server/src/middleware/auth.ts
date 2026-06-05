import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../auth/verifyToken.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'No token' });
    return;
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  (req as any).user = decoded;
  next();
}

export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'No token' });
    return;
  }
  const decoded = verifyToken<{ role: string }>(token);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  if (decoded.role !== 'admin') {
    res.status(403).json({ error: 'Admin only' });
    return;
  }
  (req as any).user = decoded;
  next();
}
