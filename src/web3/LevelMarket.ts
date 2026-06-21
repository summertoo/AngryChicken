import type { LevelConfig } from '../levels/types';
import type { WalrusClient } from './WalrusClient';
import type { WalletManager } from './WalletManager';
import { PACKAGE_ID } from './config';
import { Transaction } from '@mysten/sui/transactions';

export interface CommunityLevel {
  levelId: string;
  creator: string;
  blobId: string;
  price: string;
  name: string;
  description: string;
  playCount: number;
  ratingSum: number;
  ratingCount: number;
}

export class LevelMarket {
  constructor(
    private wallet: WalletManager,
    private walrus: WalrusClient,
  ) {}

  async fetchAll(): Promise<CommunityLevel[]> {
    if (!this.wallet.currentAccount) return [];

    const eventsRes = await this.wallet.rpc.queryEvents({
      query: {
        MoveEventType: `${PACKAGE_ID}::game::LevelPublished`,
      },
      limit: 50,
    });

    const levels: CommunityLevel[] = [];
    for (const event of eventsRes.data) {
      const parsed = event.parsedJson as {
        creator: string;
        level_id: string;
        blob_id: string;
        price: string;
      } | null;
      if (!parsed) continue;

      try {
        const objRes = await this.wallet.rpc.getObject({
          id: parsed.level_id,
          options: { showContent: true },
        });
        const fields = (objRes.data?.content as {
          dataType: 'moveObject';
          fields: {
            name: string;
            description: string;
            play_count: string;
            rating_sum: string;
            rating_count: string;
            blob_id: string;
            price: string;
            creator: string;
          };
        } | undefined)?.fields;

        levels.push({
          levelId: parsed.level_id,
          creator: parsed.creator,
          blobId: parsed.blob_id,
          price: parsed.price,
          name: fields?.name ?? 'Untitled',
          description: fields?.description ?? '',
          playCount: fields ? Number(fields.play_count) : 0,
          ratingSum: fields ? Number(fields.rating_sum) : 0,
          ratingCount: fields ? Number(fields.rating_count) : 0,
        });
      } catch {
        levels.push({
          levelId: parsed.level_id,
          creator: parsed.creator,
          blobId: parsed.blob_id,
          price: parsed.price,
          name: 'Untitled',
          description: '',
          playCount: 0,
          ratingSum: 0,
          ratingCount: 0,
        });
      }
    }
    return levels;
  }

  async loadLevel(blobId: string): Promise<LevelConfig> {
    return this.walrus.downloadLevel(blobId);
  }

  async purchaseLevel(levelId: string, price: string): Promise<string> {
    const tx = new Transaction();
    const priceNum = BigInt(price);
    const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(priceNum)]);
    tx.moveCall({
      target: `${PACKAGE_ID}::game::purchase_level_access`,
      arguments: [tx.object(levelId), coin],
    });
    tx.setSender(this.wallet.currentAccount!);
    const serialized = await tx.build({ client: this.wallet.rpc });
    const result = await this.wallet.signAndExecuteTransactionBlock({
      transactionBlock: serialized,
      chain: 'sui:testnet',
    });
    return result.digest;
  }
}
