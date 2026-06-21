import { Transaction } from '@mysten/sui/transactions';
import { PACKAGE_ID, ORIGINAL_PACKAGE_ID, TREASURY_ID, CRAFT_SKIN_PRICE, PACK_PASS_PRICE } from './config';
import { WalletManager } from './WalletManager';

export interface SkinData {
  id: { id: string };
  primary: number;
  secondary: number;
  pattern: number;
  eye: number;
  accessory: number;
  rarity: number;
  seed: string;
  name: string;
}

export interface LevelPassData {
  id: { id: string };
  pack_id: number;
}

export interface SkinBoxData {
  id: { id: string };
  price: string;
  remaining: string;
  rarities: number[];
}

export interface UserLevelData {
  id: { id: string };
  creator: string;
  name: string;
  description: string;
  blob_id: string;
  price: string;
  play_count: string;
  rating_sum: string;
  rating_count: string;
}

export class SuiClient {
  constructor(private wallet: WalletManager) {}

  async getOwnedSkins(): Promise<SkinData[]> {
    return this.wallet.getOwnedObjects<SkinData>(`${PACKAGE_ID}::game::ChickenSkin`);
  }

  async getOwnedPasses(): Promise<LevelPassData[]> {
    return this.wallet.getOwnedObjects<LevelPassData>(`${PACKAGE_ID}::game::LevelPackPass`);
  }

  async getOwnedBoxes(): Promise<SkinBoxData[]> {
    return this.wallet.getOwnedObjects<SkinBoxData>(`${PACKAGE_ID}::game::SkinBox`);
  }

  async getUserLevels(): Promise<UserLevelData[]> {
    return this.wallet.getOwnedObjects<UserLevelData>(`${PACKAGE_ID}::game::UserLevel`);
  }

  async getAdminCapId(): Promise<string | null> {
    if (!this.wallet.currentAccount) return null;
    const types = [
      `${PACKAGE_ID}::game::AdminCap`,
      `${ORIGINAL_PACKAGE_ID}::game::AdminCap`,
    ];
    for (const type of types) {
      const result = await this.wallet.rpc.getOwnedObjects({
        owner: this.wallet.currentAccount,
        filter: { StructType: type },
        options: { showContent: true },
      });
      const obj = result.data.find(o => o.data?.content?.dataType === 'moveObject');
      if (obj?.data?.objectId) return obj.data.objectId;
    }
    return null;
  }

  private async executeTx(tx: Transaction): Promise<string> {
    const result = await this.wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      chain: 'sui:testnet',
    });
    return result.digest;
  }

  private sender(): string {
    const addr = this.wallet.currentAccount;
    if (!addr) throw new Error('Wallet not connected');
    return addr;
  }

  // ─── v1 (testnet, backward compat) ───

  async openSkinBox(boxId: string, price: number): Promise<string> {
    const tx = new Transaction();
    const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(price)]);
    tx.moveCall({
      target: `${PACKAGE_ID}::game::open_skin_box`,
      arguments: [tx.object(boxId), payment],
    });
    tx.transferObjects([payment], tx.pure.address(this.sender()));
    return this.executeTx(tx);
  }

  async craftSkin(
    primary: number, secondary: number, pattern: number, eye: number, accessory: number, name: string,
  ): Promise<string> {
    const tx = new Transaction();
    const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(CRAFT_SKIN_PRICE)]);
    tx.moveCall({
      target: `${PACKAGE_ID}::game::craft_skin`,
      arguments: [payment, tx.pure.u32(primary), tx.pure.u32(secondary), tx.pure.u8(pattern), tx.pure.u8(eye), tx.pure.u8(accessory), tx.pure.string(name)],
    });
    tx.transferObjects([payment], tx.pure.address(this.sender()));
    return this.executeTx(tx);
  }

  async purchasePackPass(packId: number): Promise<string> {
    const tx = new Transaction();
    const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(PACK_PASS_PRICE)]);
    tx.moveCall({
      target: `${PACKAGE_ID}::game::purchase_pack_pass`,
      arguments: [payment, tx.pure.u8(packId)],
    });
    tx.transferObjects([payment], tx.pure.address(this.sender()));
    return this.executeTx(tx);
  }

  // ─── v2 (mainnet, treasury) ───

  async purchasePackPassV2(packId: number): Promise<string> {
    const tx = new Transaction();
    const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(PACK_PASS_PRICE)]);
    tx.moveCall({
      target: `${PACKAGE_ID}::game::purchase_pack_pass_v2`,
      arguments: [payment, tx.pure.u8(packId), tx.object(TREASURY_ID!)],
    });
    tx.transferObjects([payment], tx.pure.address(this.sender()));
    return this.executeTx(tx);
  }

  async craftSkinV2(
    primary: number, secondary: number, pattern: number, eye: number, accessory: number, name: string,
  ): Promise<string> {
    const tx = new Transaction();
    const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(CRAFT_SKIN_PRICE)]);
    tx.moveCall({
      target: `${PACKAGE_ID}::game::craft_skin_v2`,
      arguments: [payment, tx.pure.u32(primary), tx.pure.u32(secondary), tx.pure.u8(pattern), tx.pure.u8(eye), tx.pure.u8(accessory), tx.pure.string(name), tx.object(TREASURY_ID!)],
    });
    tx.transferObjects([payment], tx.pure.address(this.sender()));
    return this.executeTx(tx);
  }

  async openSkinBoxV2(boxId: string, price: number): Promise<string> {
    const tx = new Transaction();
    const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(price)]);
    tx.moveCall({
      target: `${PACKAGE_ID}::game::open_skin_box_v2`,
      arguments: [tx.object(boxId), payment, tx.object(TREASURY_ID!)],
    });
    tx.transferObjects([payment], tx.pure.address(this.sender()));
    return this.executeTx(tx);
  }

  async purchaseLevelAccess(levelId: string, price: number): Promise<string> {
    const tx = new Transaction();
    const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(price)]);
    tx.moveCall({
      target: `${PACKAGE_ID}::game::purchase_level_access`,
      arguments: [tx.object(levelId), payment],
    });
    tx.transferObjects([payment], tx.pure.address(this.sender()));
    return this.executeTx(tx);
  }

  async publishLevel(name: string, description: string, blobId: string, price: number): Promise<string> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::game::publish_level`,
      arguments: [tx.pure.string(name), tx.pure.string(description), tx.pure.string(blobId), tx.pure.u64(price)],
    });
    return this.executeTx(tx);
  }

  async rateLevel(levelId: string, rating: number): Promise<string> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::game::rate_level`,
      arguments: [tx.object(levelId), tx.pure.u8(rating)],
    });
    return this.executeTx(tx);
  }

  async createSkinBox(adminCapId: string, price: number, remaining: number, rarities: number[]): Promise<string> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::game::create_skin_box`,
      arguments: [
        tx.object(adminCapId),
        tx.pure.u64(price),
        tx.pure.u64(remaining),
        tx.pure.vector('u8', rarities),
      ],
    });
    return this.executeTx(tx);
  }
}
