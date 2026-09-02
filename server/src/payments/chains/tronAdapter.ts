import { TronWeb } from 'tronweb';
import { mnemonicToSeedSync } from '@scure/bip39';
import { HDKey } from '@scure/bip32';
import type { ChainAdapter, IncomingTransfer } from './types.js';

// USDT TRC-20: 6 знаков после запятой (в отличие от ERC-20/BEP-20 USDT, у которых тоже 6 —
// совпадение упрощает exchange.ts, но проверено отдельно за каждой сетью реальным контрактом).
const USDT_DECIMALS = 6;

// Минимальный TRC-20 ABI: то, что нужно для transfer/balanceOf (как ERC-20, Tron TVM совместим с EVM ABI).
const TRC20_ABI = [
  { constant: false, inputs: [{ name: '_to', type: 'address' }, { name: '_value', type: 'uint256' }], name: 'transfer', outputs: [{ name: '', type: 'bool' }], type: 'function' },
  { constant: true, inputs: [{ name: '_owner', type: 'address' }], name: 'balanceOf', outputs: [{ name: 'balance', type: 'uint256' }], type: 'function' },
] as const;

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

export interface TronAdapterConfig {
  fullHost: string; // TronGrid URL (mainnet или Shasta)
  apiKey: string | null;
  usdtContractAddress: string;
}

export function createTronAdapter(config: TronAdapterConfig): ChainAdapter {
  const headers = config.apiKey ? { 'TRON-PRO-API-KEY': config.apiKey } : undefined;
  const tronWeb = new TronWeb({ fullHost: config.fullHost, headers });

  return {
    chain: 'tron',
    nativeSymbol: 'TRX',

    deriveAddress(mnemonic, index) {
      const seed = mnemonicToSeedSync(mnemonic);
      const root = HDKey.fromMasterSeed(seed);
      // BIP44 Tron coin type 195: m/44'/195'/0'/0/{index}
      const child = root.derive(`m/44'/195'/0'/0/${index}`);
      if (!child.privateKey) throw new Error('Не удалось вывести приватный ключ Tron-адреса');
      const privateKey = bytesToHex(child.privateKey);
      const address = TronWeb.address.fromPrivateKey(privateKey);
      if (!address) throw new Error('Не удалось получить Tron-адрес из приватного ключа');
      return { address, privateKey };
    },

    addressFromPrivateKey(privateKey) {
      const address = TronWeb.address.fromPrivateKey(privateKey);
      if (!address) throw new Error('Не удалось получить Tron-адрес из приватного ключа');
      return address;
    },

    isValidAddress(address) {
      return TronWeb.isAddress(address);
    },

    // TronGrid REST API — история TRC-20 переводов на адрес, отфильтрованная по контракту USDT.
    // Подтверждения (минимум блоков) проверяем через текущую высоту блокчейна.
    // Блочный курсор здесь не нужен и не поддерживается (scannedToBlock всегда null): выборка
    // идёт не по диапазону блоков, а по последним переводам самого адреса, поэтому простой
    // сервера не создаёт «слепого» диапазона — после рестарта те же переводы придут снова
    // (в отличие от eth_getLogs в evmAdapter, см. ROADMAP §9.2).
    async getIncomingUsdtTransfers(address, minConfirmations) {
      const url = `${config.fullHost}/v1/accounts/${address}/transactions/trc20?contract_address=${config.usdtContractAddress}&limit=50&only_to=true`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`TronGrid ${res.status}: ${await res.text().catch(() => '')}`);
      const data = (await res.json()) as { data?: Array<{ transaction_id: string; value: string; block_timestamp: number }> };
      const list = data.data ?? [];
      if (list.length === 0) return { transfers: [], scannedToBlock: null };

      let currentBlock = 0;
      try {
        const block = await tronWeb.trx.getCurrentBlock();
        currentBlock = block?.block_header?.raw_data?.number ?? 0;
      } catch {
        // если не удалось получить высоту — считаем все найденные переводы неподтверждёнными
        // (безопасный дефолт: лучше отложить зачисление, чем зачислить раньше времени)
      }

      const result: IncomingTransfer[] = [];
      for (const tx of list) {
        let blockNumber = 0;
        let confirmed = false;
        try {
          const info = await tronWeb.trx.getTransactionInfo(tx.transaction_id);
          blockNumber = info?.blockNumber ?? 0;
          confirmed = currentBlock > 0 && blockNumber > 0 && currentBlock - blockNumber >= minConfirmations;
        } catch {
          // оставляем confirmed=false — переоценим на следующем тике опроса
        }
        result.push({ txid: tx.transaction_id, amountRaw: BigInt(tx.value), blockNumber, confirmed });
      }
      return { transfers: result, scannedToBlock: null };
    },

    async sendUsdt(privateKey, toAddress, amountRaw) {
      const senderTronWeb = new TronWeb({ fullHost: config.fullHost, headers, privateKey });
      const contract = await senderTronWeb.contract(TRC20_ABI as never, config.usdtContractAddress);
      const txid: string = await contract.methods.transfer(toAddress, amountRaw.toString()).send({});
      return { txid };
    },

    async getNativeBalance(address) {
      const sun = await tronWeb.trx.getBalance(address);
      return BigInt(sun);
    },

    async getUsdtBalance(address) {
      const contract = await tronWeb.contract(TRC20_ABI as never, config.usdtContractAddress);
      const balance = await contract.methods.balanceOf(address).call();
      return BigInt(balance.toString());
    },

    async sendNative(privateKey, toAddress, amountRaw) {
      const senderTronWeb = new TronWeb({ fullHost: config.fullHost, headers, privateKey });
      const tx = await senderTronWeb.trx.sendTransaction(toAddress, Number(amountRaw));
      return { txid: tx.txid };
    },

    async estimateSweepFee() {
      // TRC20 transfer без делегированных ресурсов сжигает TRX за energy/bandwidth — точная
      // цена зависит от сети, берём консервативную фиксированную оценку (уточнить на mainnet).
      return 20_000_000n; // 20 TRX (в sun)
    },
  };
}

export const USDT_DECIMALS_TRON = USDT_DECIMALS;
