import { ethers } from 'ethers';
import type { ChainAdapter, IncomingTransfer } from './types.js';

// Один код для Ethereum и BSC — оба EVM-совместимы, отличаются только RPC/chainId/контрактом.
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

// Максимальный диапазон одного eth_getLogs. Найдено на testnet-прогоне (2026-06-19, Sepolia):
// бесплатный publicnode.com режет запрос диапазоном >100 блоков ("Archive requests require a
// personal token"). 90 — с запасом под лимит.
const MAX_RANGE_BLOCKS = 90;

// Сколько таких диапазонов максимум сканируем за один тик для ОДНОГО адреса. Ограничение нужно,
// чтобы догон после долгого простоя не превращал один тик в сотни RPC-запросов подряд (бесплатный
// RPC упрётся в rate limit): остаток догоняется на следующих тиках, прогресс держит курсор.
// 5 × 90 = 450 блоков за тик ≈ 90 мин простоя Ethereum / ~20 мин BSC, при опросе раз в 30с.
const MAX_CHUNKS_PER_POLL = 5;

// Окно назад для адреса, который опрашивается ВПЕРВЫЕ (курсора ещё нет): депозит не может быть
// старше момента создания адреса, поэтому глубже смотреть незачем.
const INITIAL_LOOKBACK_BLOCKS = 90;

export interface ScanRange {
  fromBlock: number;
  toBlock: number;
}

export interface ScanPlan {
  ranges: ScanRange[];
  scannedToBlock: number | null; // null — сканировать нечего, курсор двигать нельзя
  lagBlocks: number;             // сколько блоков останется недосканированными после этого тика
}

// Какие диапазоны блоков сканировать за этот тик — чистая функция (ядро курсорной логики
// тестируется без сети; сами RPC-вызовы покрыты testnet-прогоном, ROADMAP §11.1).
export function planScan(params: {
  cursor: number | null; // последний уже обработанный блок; null — адрес опрашивается впервые
  currentBlock: number;
  minConfirmations: number;
  maxChunks?: number;
}): ScanPlan {
  const { cursor, currentBlock, minConfirmations } = params;
  const maxChunks = params.maxChunks ?? MAX_CHUNKS_PER_POLL;

  // Дальше «безопасной» головы не идём: перевод, не набравший minConfirmations, сейчас всё равно
  // не будет зачислен, а курсор, перепрыгнувший его блок, больше никогда бы его не вернул.
  const safeHead = currentBlock - minConfirmations;
  if (safeHead < 0) return { ranges: [], scannedToBlock: null, lagBlocks: 0 };

  const start = cursor === null ? Math.max(0, safeHead - INITIAL_LOOKBACK_BLOCKS + 1) : cursor + 1;
  if (start > safeHead) return { ranges: [], scannedToBlock: null, lagBlocks: 0 };

  const ranges: ScanRange[] = [];
  let from = start;
  while (from <= safeHead && ranges.length < maxChunks) {
    const toBlock = Math.min(from + MAX_RANGE_BLOCKS - 1, safeHead);
    ranges.push({ fromBlock: from, toBlock });
    from = toBlock + 1;
  }

  const scannedToBlock = ranges[ranges.length - 1].toBlock;
  return { ranges, scannedToBlock, lagBlocks: safeHead - scannedToBlock };
}

export interface EvmAdapterConfig {
  chain: 'ethereum' | 'bsc';
  nativeSymbol: string;
  rpcUrl: string;
  usdtContractAddress: string;
}

export function createEvmAdapter(config: EvmAdapterConfig): ChainAdapter {
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);

  return {
    chain: config.chain,
    nativeSymbol: config.nativeSymbol,

    deriveAddress(mnemonic, index) {
      // EVM-адрес идентичен на Ethereum и BSC (один keypair, оба используют secp256k1 + keccak) —
      // поэтому EVM-семейство сетей делит один master-seed и один индекс на пользователя.
      const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${index}`);
      return { address: wallet.address, privateKey: wallet.privateKey };
    },

    addressFromPrivateKey(privateKey) {
      return ethers.computeAddress(privateKey);
    },

    isValidAddress(address) {
      return ethers.isAddress(address);
    },

    async getIncomingUsdtTransfers(address, minConfirmations, fromCursor) {
      const contract = new ethers.Contract(config.usdtContractAddress, ERC20_ABI, provider);
      const currentBlock = await provider.getBlockNumber();
      const plan = planScan({ cursor: fromCursor ?? null, currentBlock, minConfirmations });
      if (plan.ranges.length === 0) return { transfers: [], scannedToBlock: null };

      const filter = contract.filters.Transfer(null, address);
      const transfers: IncomingTransfer[] = [];
      let scannedToBlock: number | null = null;

      for (const range of plan.ranges) {
        try {
          const events = await contract.queryFilter(filter, range.fromBlock, range.toBlock);
          for (const ev of events) {
            if (!('args' in ev) || !ev.args) continue; // пропускаем сырые Log без декодированных args
            const blockNumber = ev.blockNumber;
            const confirmed = currentBlock - blockNumber >= minConfirmations;
            const amountRaw = BigInt(ev.args.value ?? ev.args[2]);
            transfers.push({ txid: ev.transactionHash, amountRaw, blockNumber, confirmed });
          }
          scannedToBlock = range.toBlock;
        } catch (err) {
          // Сбой в середине догона не должен обнулять уже просканированные диапазоны — отдаём
          // частичный результат, остаток догоняется на следующих тиках. Ошибка на ПЕРВОМ же
          // диапазоне пробрасывается: это обычная недоступность RPC, её логирует вызывающий.
          if (scannedToBlock === null) throw err;
          console.error(`⚠️ [payments] ${config.chain}: блоки ${range.fromBlock}-${range.toBlock} не просканированы:`, err);
          break;
        }
      }

      if (plan.lagBlocks > 0) {
        console.log(`⏳ [payments] ${config.chain} ${address}: отставание ${plan.lagBlocks} блоков — догоняем на следующих тиках`);
      }
      return { transfers, scannedToBlock };
    },

    async sendUsdt(privateKey, toAddress, amountRaw) {
      const wallet = new ethers.Wallet(privateKey, provider);
      const contract = new ethers.Contract(config.usdtContractAddress, ERC20_ABI, wallet);
      const tx = await contract.transfer(toAddress, amountRaw);
      return { txid: tx.hash };
    },

    async getNativeBalance(address) {
      return provider.getBalance(address);
    },

    async getUsdtBalance(address) {
      const contract = new ethers.Contract(config.usdtContractAddress, ERC20_ABI, provider);
      const balance: bigint = await contract.balanceOf(address);
      return balance;
    },

    async sendNative(privateKey, toAddress, amountRaw) {
      const wallet = new ethers.Wallet(privateKey, provider);
      const tx = await wallet.sendTransaction({ to: toAddress, value: amountRaw });
      return { txid: tx.hash };
    },

    async estimateSweepFee() {
      // Фиксированный лимит газа ERC20 transfer (≈65k) с запасом — без estimateGas, т.к. на
      // свежем депозитном адресе нет баланса для холостой оценки (estimateGas упал бы revert'ом).
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice ?? 1_000_000_000n; // 1 gwei — safety fallback
      return (gasPrice * 80_000n * 12n) / 10n; // +20% запас
    },
  };
}
