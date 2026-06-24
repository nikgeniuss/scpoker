import { Router } from 'express';
import { adminMiddleware } from '../middleware/auth.js';
import {
  getWithdrawalsQueue,
  getWithdrawalById,
  approveWithdrawal,
  rejectWithdrawal,
} from '../payments/withdrawalService.js';
import { sendPayout, getHotWalletBalances } from '../payments/payoutService.js';
import { notifyPaymentsInbox } from '../payments/paymentsInbox.js';
import type { WithdrawalRequest } from '@poker-room/shared';

// Админ-роуты вывода (/api/admin/payments/*) — очередь заявок, approve (запускает авто-отправку
// через payoutService), reject, баланс хот-кошельков для мониторинга газа/USDT.
export function createPaymentsAdminRouter(): Router {
  const router = Router();
  router.use(adminMiddleware);

  router.get('/queue', (req, res) => {
    const status = req.query.status as WithdrawalRequest['status'] | undefined;
    res.json(getWithdrawalsQueue(status));
  });

  router.get('/hot-wallets', (req, res) => {
    getHotWalletBalances().then((balances) => res.json(balances));
  });

  // Одобрить заявку → бот сразу подписывает и отправляет транзакцию (план §11.1: без
  // ручного перевода админом). Ответ — финальная запись (paid либо failed после неудачной отправки).
  router.post('/:id/approve', (req, res) => {
    const adminId = (req as unknown as { user: { id: string } }).user.id;
    const approved = approveWithdrawal(String(req.params.id), adminId);
    if ('error' in approved) {
      res.status(400).json(approved);
      return;
    }
    sendPayout(approved).then((result) => {
      const final = getWithdrawalById(approved.id) ?? approved;
      if ('txid' in result) {
        notifyPaymentsInbox(final.userId, 'withdrawal', `Вывод отправлен: ${final.amountChips} фишек`);
      } else {
        notifyPaymentsInbox(final.userId, 'withdrawal', `Вывод не удался, обратитесь в поддержку`);
      }
      res.json(final);
    });
  });

  router.post('/:id/reject', (req, res) => {
    const adminId = (req as unknown as { user: { id: string } }).user.id;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    const result = rejectWithdrawal(String(req.params.id), adminId, reason);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    notifyPaymentsInbox(result.userId, 'withdrawal', `Заявка на вывод отклонена`);
    res.json(result);
  });

  return router;
}
