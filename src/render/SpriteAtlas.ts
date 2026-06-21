import { BlockKind, BugKind, ChickenKind } from '../levels/types';

const BASE = import.meta.env.BASE_URL;

const SPRITE_DB: Record<string, string> = {
  chicken: `${BASE}sprites/chicken.png`,
  shopck1: `${BASE}shop/shopck1.png`,
  shopck2: `${BASE}shop/shopck2.png`,
  wormGreen: `${BASE}sprites/bug1.png`,
  wormBrown: `${BASE}sprites/bug2.png`,
  wormPink: `${BASE}sprites/bug3.png`,
  locustMutant: `${BASE}sprites/locust_mutant.png`,
  locust: `${BASE}sprites/locust.png`,
  grasshopper: `${BASE}sprites/grasshopper.png`,
  wood: `${BASE}sprites/wood.png`,
  woodHouse: `${BASE}sprites/wood_house.png`,
  brick: `${BASE}sprites/brick.png`,
  stoneTower: `${BASE}sprites/stone_house.png`,
  stoneSlab: `${BASE}sprites/brick_wall.png`,
  woodLadder: `${BASE}sprites/tower1.png`,
  woodFence: `${BASE}sprites/wood_house.png`,
  glass: `${BASE}sprites/brick_wall2.png`,
  stone: `${BASE}sprites/stone_house.png`,
  house: `${BASE}sprites/house.png`,
  haystack: `${BASE}sprites/haystack.png`,
};

export class SpriteAtlas {
  private images = new Map<string, HTMLImageElement>();
  private loaded = false;
  private readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.loadAll();
  }

  private async loadAll(): Promise<void> {
    const entries = Object.entries(SPRITE_DB);
    let anyLoaded = false;
    const promises = entries.map(([kind, url]) => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          this.images.set(kind, img);
          anyLoaded = true;
          resolve();
        };
        img.onerror = () => {
          console.warn(`[sprite] Failed to load: ${url}`);
          resolve();
        };
        img.src = url;
      });
    });
    await Promise.all(promises);
    this.loaded = anyLoaded;
  }

  async ready(): Promise<void> {
    return this.readyPromise;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  drawChicken(ctx: CanvasRenderingContext2D, kind: ChickenKind, cx: number, cy: number, radius: number, angle = 0): boolean {
    const img = this.images.get(kind) ?? this.images.get('chicken');
    if (!img) return false;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const s = radius * 2;
    ctx.drawImage(img, -s / 2, -s / 2, s, s);
    ctx.restore();
    return true;
  }

  drawBug(ctx: CanvasRenderingContext2D, kind: BugKind, cx: number, cy: number, radius: number, angle = 0): boolean {
    const img = this.images.get(kind);
    if (!img) return false;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const s = radius * 2;
    ctx.drawImage(img, -s / 2, -s / 2, s, s);
    ctx.restore();
    return true;
  }

  drawBlock(ctx: CanvasRenderingContext2D, kind: BlockKind, cx: number, cy: number, w: number, h: number, angle = 0): boolean {
    const img = this.images.get(kind);
    if (!img) return false;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return true;
  }
}
