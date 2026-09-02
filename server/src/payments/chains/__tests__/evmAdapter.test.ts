import { describe, it, expect } from 'vitest';
import { createEvmAdapter, planScan } from '../evmAdapter.js';

// Деривация и валидация адреса — чистая логика, без сети (RPC-вызовы покрыты testnet-прогоном, ROADMAP §11.1).
describe('evmAdapter — деривация адресов (общий код для ethereum/bsc)', () => {
  const ethereum = createEvmAdapter({ chain: 'ethereum', nativeSymbol: 'ETH', rpcUrl: 'https://example.invalid', usdtContractAddress: '0x0000000000000000000000000000000000000001' });
  const bsc = createEvmAdapter({ chain: 'bsc', nativeSymbol: 'BNB', rpcUrl: 'https://example.invalid', usdtContractAddress: '0x0000000000000000000000000000000000000002' });
  const mnemonic = 'test test test test test test test test test test test junk';

  it('детерминирована: один и тот же mnemonic+index → один и тот же адрес', () => {
    const a = ethereum.deriveAddress(mnemonic, 0);
    const b = ethereum.deriveAddress(mnemonic, 0);
    expect(a.address).toBe(b.address);
    expect(a.privateKey).toBe(b.privateKey);
  });

  it('разные индексы → разные адреса', () => {
    const a = ethereum.deriveAddress(mnemonic, 0);
    const b = ethereum.deriveAddress(mnemonic, 1);
    expect(a.address).not.toBe(b.address);
  });

  it('EVM-адрес идентичен на ethereum и bsc для того же mnemonic+index (общий адрес для обеих сетей)', () => {
    const onEth = ethereum.deriveAddress(mnemonic, 3);
    const onBsc = bsc.deriveAddress(mnemonic, 3);
    expect(onEth.address).toBe(onBsc.address);
  });

  it('isValidAddress принимает корректный EVM-адрес и отклоняет мусор', () => {
    const { address } = ethereum.deriveAddress(mnemonic, 0);
    expect(ethereum.isValidAddress(address)).toBe(true);
    expect(ethereum.isValidAddress('not-an-address')).toBe(false);
    expect(ethereum.isValidAddress('TXfakeTronAddress1111111111111111')).toBe(false);
  });
});

// Курсор по блокам вместо фиксированного окна назад (ROADMAP §9.2): раньше простой сервера дольше
// окна оставлял диапазон блоков непросмотренным навсегда — реальный депозит игрока не детектился.
describe('evmAdapter — planScan (курсор по блокам)', () => {
  const MIN_CONF = 12;

  it('первый опрос адреса (курсора нет) — одно окно назад от безопасной головы', () => {
    const plan = planScan({ cursor: null, currentBlock: 1000, minConfirmations: MIN_CONF });
    const safeHead = 1000 - MIN_CONF;

    expect(plan.ranges).toHaveLength(1);
    expect(plan.ranges[0].toBlock).toBe(safeHead);
    expect(plan.ranges[0].toBlock - plan.ranges[0].fromBlock + 1).toBe(90);
    expect(plan.scannedToBlock).toBe(safeHead);
    expect(plan.lagBlocks).toBe(0);
  });

  it('никогда не сканирует блоки, не набравшие minConfirmations', () => {
    const plan = planScan({ cursor: 900, currentBlock: 1000, minConfirmations: MIN_CONF });
    const safeHead = 1000 - MIN_CONF;

    for (const range of plan.ranges) expect(range.toBlock).toBeLessThanOrEqual(safeHead);
    expect(plan.scannedToBlock).toBe(safeHead);
  });

  it('обычный тик без отставания — узкий диапазон сразу за курсором', () => {
    const plan = planScan({ cursor: 985, currentBlock: 1000, minConfirmations: MIN_CONF });

    expect(plan.ranges).toEqual([{ fromBlock: 986, toBlock: 988 }]); // safeHead = 988
    expect(plan.lagBlocks).toBe(0);
  });

  it('сканировать нечего (курсор уже на безопасной голове) — курсор не двигается', () => {
    const plan = planScan({ cursor: 988, currentBlock: 1000, minConfirmations: MIN_CONF });

    expect(plan.ranges).toHaveLength(0);
    expect(plan.scannedToBlock).toBeNull();
  });

  it('курсор впереди безопасной головы (реорг / поднятый minConfirmations) — назад не откатываемся', () => {
    const plan = planScan({ cursor: 995, currentBlock: 1000, minConfirmations: MIN_CONF });

    expect(plan.ranges).toHaveLength(0);
    expect(plan.scannedToBlock).toBeNull();
  });

  it('сеть моложе minConfirmations — сканировать нечего', () => {
    const plan = planScan({ cursor: null, currentBlock: 5, minConfirmations: MIN_CONF });

    expect(plan.ranges).toHaveLength(0);
    expect(plan.scannedToBlock).toBeNull();
  });

  it('долгий простой — нарезка на чанки под лимит RPC, не больше maxChunks за тик', () => {
    const plan = planScan({ cursor: 1000, currentBlock: 100_000, minConfirmations: MIN_CONF });

    expect(plan.ranges).toHaveLength(5); // MAX_CHUNKS_PER_POLL
    for (const range of plan.ranges) {
      expect(range.toBlock - range.fromBlock + 1).toBeLessThanOrEqual(90); // лимит eth_getLogs
    }
    expect(plan.ranges[0].fromBlock).toBe(1001); // ровно за курсором, без дыры
    expect(plan.scannedToBlock).toBe(plan.ranges[4].toBlock);
    expect(plan.lagBlocks).toBeGreaterThan(0); // остаток догоняется на следующих тиках
  });

  it('диапазоны одного тика непрерывны и не перекрываются', () => {
    const plan = planScan({ cursor: 1000, currentBlock: 100_000, minConfirmations: MIN_CONF });

    for (let i = 1; i < plan.ranges.length; i++) {
      expect(plan.ranges[i].fromBlock).toBe(plan.ranges[i - 1].toBlock + 1);
    }
  });

  it('догон по тикам не оставляет пропущенных блоков', () => {
    const currentBlock = 100_000;
    const safeHead = currentBlock - MIN_CONF;
    let cursor = 1000;
    const scanned = new Set<number>();

    // Прокручиваем тики, пока курсор не догонит голову.
    for (let tick = 0; tick < 500; tick++) {
      const plan = planScan({ cursor, currentBlock, minConfirmations: MIN_CONF });
      if (plan.ranges.length === 0) break;
      for (const range of plan.ranges) {
        const before = scanned.size;
        for (let b = range.fromBlock; b <= range.toBlock; b++) scanned.add(b);
        // Размер вырос ровно на ширину диапазона — значит ни один блок не сканируется дважды.
        expect(scanned.size).toBe(before + (range.toBlock - range.fromBlock + 1));
      }
      cursor = plan.scannedToBlock as number;
    }

    expect(cursor).toBe(safeHead); // догнали ровно до безопасной головы
    expect(scanned.size).toBe(safeHead - 1000); // и покрыли весь диапазон целиком, без дыр
  });
});
