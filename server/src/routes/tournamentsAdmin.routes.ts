import { Router } from 'express';
import { adminMiddleware } from '../middleware/auth.js';
import type { TournamentManager } from '../game/tournament/TournamentManager.js';
import type { CreateTournamentOptions } from '@poker-room/shared';

// Админ-роуты турниров (/api/admin/tournaments/*) — создание/принудительный старт/отмена.
// Создаёт турнир ТОЛЬКО админ (реальный призовой фонд) — решение пользователя, см. ROADMAP §10.
export function createTournamentsAdminRouter(tournamentManager: TournamentManager): Router {
  const router = Router();
  router.use(adminMiddleware);

  router.post('/', (req, res) => {
    const admin = (req as unknown as { user: { id: string } }).user;
    const body = req.body as Partial<CreateTournamentOptions>;
    if (
      typeof body.name !== 'string' ||
      typeof body.format !== 'string' ||
      typeof body.buyIn !== 'number' ||
      typeof body.startingStack !== 'number' ||
      typeof body.tableSize !== 'number' ||
      typeof body.blindSpeed !== 'string' ||
      typeof body.levelUpMinutes !== 'number' ||
      (body.type !== undefined && body.type !== 'sng' && body.type !== 'mtt')
    ) {
      res.status(400).json({ error: 'invalid-body' });
      return;
    }
    const opts: CreateTournamentOptions = {
      name: body.name,
      type: body.type === 'mtt' ? 'mtt' : 'sng',
      format: body.format === 'shortdeck' ? 'shortdeck' : 'nlh',
      buyIn: body.buyIn,
      startingStack: body.startingStack,
      startingBigBlind: typeof body.startingBigBlind === 'number' ? body.startingBigBlind : undefined,
      tableSize: body.tableSize,
      blindSpeed: body.blindSpeed as CreateTournamentOptions['blindSpeed'],
      levelUpMinutes: body.levelUpMinutes,
      lateRegMinutes: typeof body.lateRegMinutes === 'number' ? body.lateRegMinutes : undefined,
      itmPercent: typeof body.itmPercent === 'number' ? body.itmPercent as CreateTournamentOptions['itmPercent'] : undefined,
      payoutMode: body.payoutMode === 'fixed' ? 'fixed' : body.payoutMode === 'itm' ? 'itm' : undefined,
      fixedPayoutPlaces: typeof body.fixedPayoutPlaces === 'number' ? body.fixedPayoutPlaces : undefined,
      reEntryEnabled: typeof body.reEntryEnabled === 'boolean' ? body.reEntryEnabled : undefined,
      maxReEntries: typeof body.maxReEntries === 'number' ? body.maxReEntries : undefined,
      reEntryFee: typeof body.reEntryFee === 'number' ? body.reEntryFee : undefined,
      guaranteedPrizePool: typeof body.guaranteedPrizePool === 'number' ? body.guaranteedPrizePool : undefined,
      bountyEnabled: typeof body.bountyEnabled === 'boolean' ? body.bountyEnabled : undefined,
      bountyType: body.bountyType === 'progressive' ? 'progressive' : body.bountyType === 'flat' ? 'flat' : undefined,
      bountyPercent: typeof body.bountyPercent === 'number' ? body.bountyPercent : undefined,
    };
    const result = tournamentManager.create(opts, admin.id);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    res.status(201).json(result);
  });

  router.post('/:id/cancel', (req, res) => {
    const result = tournamentManager.cancel(req.params.id);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  router.post('/:id/add-bots', (req, res) => {
    const count = Number((req.body as { count?: unknown }).count);
    if (!Number.isInteger(count) || count < 1) {
      res.status(400).json({ error: 'invalid-body' });
      return;
    }
    const result = tournamentManager.addBots(req.params.id, count);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  router.post('/:id/force-start', (req, res) => {
    const result = tournamentManager.forceStart(req.params.id);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  return router;
}
