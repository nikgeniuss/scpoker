import type { PaymentChain } from '@poker-room/shared';

// Входящий перевод USDT, найденный при опросе сети (depositPollingService).
export interface IncomingTransfer {
  txid: string;
  amountRaw: bigint;
  blockNumber: number;
  confirmed: boolean; // confirmations адаптера >= configured minConfirmations
}

// Общий интерфейс блокчейн-сети для платежей (§11.1 ROADMAP). Один адаптер на сеть;
// ethereum/bsc — оба через EvmAdapter (один код, разные RPC/контракт), tron — через TronAdapter.
export interface ChainAdapter {
  chain: PaymentChain;
  nativeSymbol: string; // TRX / ETH / BNB — на это нужен баланс хот-кошелька для газа/energy
  deriveAddress(mnemonic: string, index: number): { address: string; privateKey: string };
  addressFromPrivateKey(privateKey: string): string;
  isValidAddress(address: string): boolean;
  // minConfirmations передаётся явно (из settings.payments.chains[chain]), чтобы адаптер
  // не хранил собственное состояние конфига — конфиг живёт только в GameManager.settings.
  getIncomingUsdtTransfers(address: string, minConfirmations: number): Promise<IncomingTransfer[]>;
  sendUsdt(privateKey: string, toAddress: string, amountRaw: bigint): Promise<{ txid: string }>;
  getNativeBalance(address: string): Promise<bigint>;
  getUsdtBalance(address: string): Promise<bigint>;
  // Перевод нативной монеты (TRX/ETH/BNB) — нужен, чтобы профинансировать газ на депозитном
  // адресе перед свипом (sweepService переносит реально пришедшие USDT на хот-кошелёк).
  sendNative(privateKey: string, toAddress: string, amountRaw: bigint): Promise<{ txid: string }>;
  // Сколько нативной монеты нужно на адресе, чтобы он мог сам отправить один перевод USDT.
  estimateSweepFee(): Promise<bigint>;
}
