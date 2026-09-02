import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getUserReferralInfo } from '../game/referralService.js';

// Реферальная программа (/api/referral, ROADMAP §10.21.5). Только личный кабинет — код и
// счётчики приглашённых, привязка кода возможна ТОЛЬКО на регистрации (см. auth.ts registerUser).
export function createReferralRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/me', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    res.json(getUserReferralInfo(userId));
  });

  return router;
}
