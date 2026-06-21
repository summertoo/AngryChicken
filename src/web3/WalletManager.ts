import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { getWallets, type Wallet, type WalletWithFeatures } from '@mysten/wallet-standard';
import type { SkinData, LevelPassData } from './SuiClient';
import { PACKAGE_ID } from './config';

export interface WalletOption {
  id: string;
  name: string;
  icon?: string;
  adapter: WalletAdapter;
}

export interface WalletAdapter {
  connect(): Promise<string>;
  disconnect(): Promise<void>;
  signAndExecuteTransactionBlock(input: {
    transactionBlock: Uint8Array | Transaction | string;
    chain?: string;
  }): Promise<{ digest: string }>;
}

class StandardAdapter implements WalletAdapter {
  private accountAddress = '';

  constructor(
    private wallet: Wallet,
    private getLatestWallet: () => Wallet | undefined,
  ) {}

  async connect(): Promise<string> {
    const feat = this.wallet.features['standard:connect'] as {
      connect(input?: { silent?: boolean }): Promise<{ accounts: { address: string }[] }>;
    };
    const result = await feat.connect();
    if (!result.accounts?.length) throw new Error('No accounts returned');
    this.accountAddress = result.accounts[0].address;
    return this.accountAddress;
  }

  async disconnect(): Promise<void> {
    const feat = this.wallet.features['standard:disconnect'] as {
      disconnect(): Promise<void>;
    };
    if (feat) await feat.disconnect();
    this.accountAddress = '';
  }

  async signAndExecuteTransactionBlock(input: {
    transactionBlock: Uint8Array | Transaction | string;
    chain?: string;
  }): Promise<{ digest: string }> {
    const wallet = this.getLatestWallet() ?? this.wallet;
    const chain = input.chain ?? 'sui:testnet';

    // Pass Transaction object directly (wallet calls .toJSON())
    if (!(input.transactionBlock instanceof Transaction)) {
      throw new Error('Expected Transaction object');
    }
    const tx = input.transactionBlock;

    const account = { address: this.accountAddress };

    // Try new API: sui:signAndExecuteTransaction
    const execFeat = wallet.features['sui:signAndExecuteTransaction'] as {
      signAndExecuteTransaction(input: {
        transaction: typeof tx;
        account: { address: string };
        chain: string;
      }): Promise<{ digest: string }>;
    } | undefined;
    if (execFeat) {
      return execFeat.signAndExecuteTransaction({ transaction: tx, account, chain });
    }

    // Fallback: signTransaction + RPC execute
    const signFeat = wallet.features['sui:signTransaction'] as {
      signTransaction(input: {
        transaction: typeof tx;
        account: { address: string };
        chain: string;
      }): Promise<{ bytes: string; signature: string }>;
    } | undefined;
    if (signFeat) {
      const { bytes, signature } = await signFeat.signTransaction({ transaction: tx, account, chain });
      const rpcClient = new SuiClient({ url: getFullnodeUrl('testnet') });
      const execResult = await rpcClient.executeTransactionBlock({
        transactionBlock: bytes,
        signature,
      });
      return { digest: execResult.digest };
    }

    // Legacy API: sui:signAndExecuteTransactionBlock
    const legacyFeat = wallet.features['sui:signAndExecuteTransactionBlock'] as {
      signAndExecuteTransactionBlock(input: {
        transactionBlock: typeof tx;
        account: { address: string };
        chain: string;
      }): Promise<{ digest: string }>;
    } | undefined;
    if (legacyFeat) {
      return legacyFeat.signAndExecuteTransactionBlock({ transactionBlock: tx, account, chain });
    }

    throw new Error('Wallet does not support signAndExecute or signTransaction');
  }
}

class LegacyWindowAdapter implements WalletAdapter {
  name = 'Sui Wallet';

  private get wallet(): {
    connect(): Promise<{ accounts: { address: string }[] }>;
    disconnect(): Promise<void>;
    signAndExecuteTransactionBlock(input: {
      transactionBlock: Uint8Array | string;
      chain?: string;
    }): Promise<{ digest: string }>;
  } {
    const w = (window as unknown as Record<string, unknown>).suiWallet as {
      connect(): Promise<{ accounts: { address: string }[] }>;
      disconnect(): Promise<void>;
      signAndExecuteTransactionBlock(input: unknown): Promise<{ digest: string }>;
    } | undefined;
    if (!w) throw new Error('No legacy wallet found');
    return w as typeof w & { disconnect(): Promise<void> };
  }

  async connect(): Promise<string> {
    const { accounts } = await this.wallet.connect();
    if (!accounts?.length) throw new Error('No accounts returned');
    return accounts[0].address;
  }

  async disconnect(): Promise<void> {
    await this.wallet.disconnect();
  }

  async signAndExecuteTransactionBlock(input: {
    transactionBlock: Uint8Array | Transaction | string;
    chain?: string;
  }): Promise<{ digest: string }> {
    // Legacy window.suiWallet expects bytes or string, not Transaction
    let txBlock: string | Uint8Array;
    if (input.transactionBlock instanceof Transaction) {
      txBlock = await input.transactionBlock.build({ client: new SuiClient({ url: getFullnodeUrl('testnet') }) });
    } else {
      txBlock = input.transactionBlock;
    }
    return this.wallet.signAndExecuteTransactionBlock({
      transactionBlock: txBlock,
      chain: input.chain,
    });
  }
}

export class WalletManager {
  isConnected = false;
  currentAccount: string | null = null;
  activeSkin: SkinData | null = null;
  ownedSkins: SkinData[] = [];
  passIds: Set<number> = new Set();

  availableWallets: WalletOption[] = [];

  private activeAdapter: WalletAdapter | null = null;
  private registeredWallets: Wallet[] = [];
  private rpcClient: SuiClient;
  private unregister?: () => void;

  constructor() {
    this.rpcClient = new SuiClient({ url: getFullnodeUrl('testnet') });
    this.scanWallets();
  }

  get rpc(): SuiClient {
    return this.rpcClient;
  }

  isAvailable(): boolean {
    return this.availableWallets.length > 0;
  }

  private scanWallets(): void {
    this.availableWallets = [];

    // 1. Wallet-standard wallets
    try {
      const ws = getWallets();
      this.registeredWallets = [...ws.get()];
      for (const w of this.registeredWallets) {
        const hasConnect = 'standard:connect' in w.features;
        const hasSign = 'sui:signAndExecuteTransactionBlock' in w.features
          || 'sui:signAndExecuteTransaction' in w.features;
        if (!hasConnect || !hasSign) continue;
        this.availableWallets.push({
          id: `standard:${w.name}`,
          name: w.name,
          icon: (w as unknown as Record<string, unknown>).icon as string | undefined,
          adapter: new StandardAdapter(w, () => {
            const wallets = getWallets().get();
            return wallets.find(x => x.name === w.name);
          }),
        });
      }

      this.unregister = ws.on('register', (wallet: Wallet) => {
        const hasConnect = 'standard:connect' in wallet.features;
        const hasSign = 'sui:signAndExecuteTransactionBlock' in wallet.features
          || 'sui:signAndExecuteTransaction' in wallet.features;
        if (!hasConnect || !hasSign) return;
        this.registeredWallets.push(wallet);
        this.availableWallets.push({
          id: `standard:${wallet.name}`,
          name: wallet.name,
          icon: (wallet as unknown as Record<string, unknown>).icon as string | undefined,
          adapter: new StandardAdapter(wallet, () => {
            const wallets = getWallets().get();
            return wallets.find(x => x.name === wallet.name);
          }),
        });
      });
    } catch (e) {
      console.warn('[wallet] Wallet-standard scan failed:', e);
    }

    // 2. Legacy window.suiWallet (fallback)
    const legacyWallet = (window as unknown as Record<string, unknown>).suiWallet as unknown;
    if (legacyWallet) {
      const alreadyAdded = this.availableWallets.some(w => w.name === 'Sui Wallet');
      if (!alreadyAdded) {
        this.availableWallets.push({
          id: 'legacy:suiWallet',
          name: 'Sui Wallet',
          adapter: new LegacyWindowAdapter(),
        });
      }
    }
  }

  async connect(walletId?: string): Promise<string> {
    const target = walletId
      ? this.availableWallets.find(w => w.id === walletId)
      : this.availableWallets[0];
    if (!target) throw new Error('No wallet available');

    this.activeAdapter = target.adapter;
    this.currentAccount = await target.adapter.connect();
    this.isConnected = true;
    return this.currentAccount;
  }

  disconnect(): void {
    if (this.activeAdapter) {
      this.activeAdapter.disconnect().catch(() => {});
    }
    this.activeAdapter = null;
    this.currentAccount = null;
    this.isConnected = false;
  }

  async getBalance(): Promise<number> {
    if (!this.currentAccount) return 0;
    const balance = await this.rpcClient.getBalance({
      owner: this.currentAccount,
      coinType: '0x2::sui::SUI',
    });
    return Number(balance.totalBalance) / 1e9;
  }

  async signAndExecuteTransactionBlock(input: {
    transactionBlock: Uint8Array | Transaction | string;
    chain?: string;
  }): Promise<{ digest: string }> {
    if (!this.activeAdapter) throw new Error('Wallet not connected');
    return this.activeAdapter.signAndExecuteTransactionBlock(input);
  }

  async getOwnedObjects<T>(type: string): Promise<T[]> {
    if (!this.currentAccount) return [];
    const result = await this.rpcClient.getOwnedObjects({
      owner: this.currentAccount,
      filter: { StructType: type },
      options: { showContent: true },
    });
    return result.data
      .filter((obj): obj is typeof obj & { data: { content: { dataType: 'moveObject'; fields: T } } } =>
        obj.data?.content?.dataType === 'moveObject'
      )
      .map(obj => (obj.data!.content as { dataType: 'moveObject'; fields: T }).fields);
  }

  async refreshPasses(): Promise<void> {
    this.passIds.clear();
    try {
      const passes = await this.getOwnedObjects<LevelPassData>(`${PACKAGE_ID}::game::LevelPackPass`);
      for (const pass of passes) this.passIds.add(pass.pack_id);
    } catch (err) {
      console.warn('[wallet] Failed to load passes:', err);
    }
  }

  hasPackPass(packId: number): boolean {
    return this.passIds.has(packId);
  }
}
