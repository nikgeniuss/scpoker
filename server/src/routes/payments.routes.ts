import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { GameManager } from '../game/GameManager.js';
import { getOrCreateDepositAddress } from '../payments/walletService.js';
import { readDeposits } from '../payments/depositsStorage.js';
import { getUserWithdrawalHistory, createWithdrawalRequest } from '../payments/withdrawalService.js';
import type { PaymentChain } from '@poker-room/shared';

const CHAINS: PaymentChain[] = ['tron', 'ethereum', 'bsc'];

// Платёжные роуты игрока (/api/payments/*) — депозитные адреса, история, заявка на вывод.
// Настройки/очередь/approve — в paymentsAdmin.routes.ts (только админ).
export function createPaymentsRouter(gameManager: GameManager): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get('/wallet', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const settings = gameManager.getSettings().payments;
    const chains: Record<string, { enabled: boolean; address: string | null }> = {};
    for (const chain of CHAINS) {
      const family = chain === 'tron' ? 'tron' : 'evm';
      const mapping = getOrCreateDepositAddress(userId, family);
      chains[chain] = {
        enabled: settings.chains[chain]?.enabled ?? false,
        address: 'error' in mapping ? null : mapping.address,
      };
    }
    res.json({
      enabled: settings.enabled,
      exchangeRateCentsPerUsdt: settings.exchangeRateCentsPerUsdt,
      minWithdrawalUsdt: settings.minWithdrawalUsdt,
      maxWithdrawalUsdt: settings.maxWithdrawalUsdt,
      chains,
    });
  });

  router.get('/history', (req, res) => {
    const userId = (req as unknown as { user: { id: string } }).user.id;
    const deposits = readDeposits().filter((d) => d.userId === userId);
    const withdrawals = getUserWithdrawalHistory(userId);
    res.json({ deposits, withdrawals });
  });

  router.post('/withdraw', (req, res) => {
    const user = (req as unknown as { user: { id: string; username: string } }).user;
    const { chain, amountUsdt, payoutAddress } = req.body as {
      chain?: unknown;
      amountUsdt?: unknown;
      payoutAddress?: unknown;
    };
    if (!CHAINS.includes(chain as PaymentChain)) {
      res.status(400).json({ error: 'invalid-chain' });
      return;
    }
    if (typeof amountUsdt !== 'number' || typeof payoutAddress !== 'string') {
      res.status(400).json({ error: 'invalid-body' });
      return;
    }
    const settings = gameManager.getSettings().payments;
    const result = createWithdrawalRequest(user.id, user.username, chain as PaymentChain, amountUsdt, payoutAddress, settings);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    res.status(201).json(result);
  });

  return router;
}
