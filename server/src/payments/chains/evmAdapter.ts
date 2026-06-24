import { ethers } from 'ethers';
import type { ChainAdapter, IncomingTransfer } from './types.js';

// Один код для Ethereum и BSC — оба EVM-совместимы, отличаются только RPC/chainId/контрактом.
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

// Сколько блоков назад смотрим за входящими переводами на каждом тике опроса.
// Найдено на testnet-прогоне (2026-06-19, Sepolia): бесплатный publicnode.com режет
// eth_getLogs диапазоном >100 блоков ("Archive requests require a personal token").
// 90 — с запасом под лимит. На mainnet с платным RPC (Alchemy/Infura) лимита нет, но
// держим то же окно — приемлемо при опросе раз в 30с (depositPollingService), пока сервер
// не лежит дольше ~15-20 мин на Ethereum. На BSC (блок ~3с) запас меньше (~4-5 мин) —
// если потребуется больше устойчивости к простою, нужен cursor по последнему блоку на адрес.
const LOOKBACK_BLOCKS = 90;

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

    async getIncomingUsdtTransfers(address, minConfirmations) {
      const contract = new ethers.Contract(config.usdtContractAddress, ERC20_ABI, provider);
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - LOOKBACK_BLOCKS);
      const filter = contract.filters.Transfer(null, address);
      const events = await contract.queryFilter(filter, fromBlock, currentBlock);

      const result: IncomingTransfer[] = [];
      for (const ev of events) {
        if (!('args' in ev) || !ev.args) continue; // пропускаем сырые Log без декодированных args
        const blockNumber = ev.blockNumber;
        const confirmed = currentBlock - blockNumber >= minConfirmations;
        const amountRaw = BigInt(ev.args.value ?? ev.args[2]);
        result.push({ txid: ev.transactionHash, amountRaw, blockNumber, confirmed });
      }
      return result;
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
