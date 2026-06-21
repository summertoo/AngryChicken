export type ChickenKind = 'red' | 'yellow' | 'black' | 'big' | 'egg' | 'pink' | 'brown' | 'blue' | 'green' | 'shopck1' | 'shopck2';
export type BugKind = 'pigSmall' | 'pigMid' | 'pigBig' | 'wormBrown' | 'wormGreen' | 'wormRed' | 'wormPink' | 'locustMutant' | 'locust' | 'grasshopper';
export type BlockKind = 'wood' | 'stone' | 'glass' | 'woodHouse' | 'stoneTower' | 'woodFence' | 'brick' | 'woodLadder' | 'stoneSlab' | 'house' | 'haystack';

export type EntityKind = ChickenKind | BugKind | BlockKind | 'ground';

export type EntityType =
  | { kind: ChickenKind }
  | { kind: BugKind }
  | { kind: BlockKind; w: number; h: number };

export interface BugSpec {
  id: number;
  type: BugKind;
  x: number;
  y: number;
  radius: number;
}

export interface BlockSpec {
  id: number;
  type: BlockKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

export interface ChickenSpec {
  id: number;
  kind: ChickenKind;
  x: number;
  y: number;
  radius?: number;
}

export interface MaterialProps {
  density: number;
  friction: number;
  restitution: number;
  color: string;
}

export interface LevelConfig {
  id: number;
  name: string;
  description: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  chickens: number;
  slingshot: { x: number; y: number };
  ground: { y: number };
  bugs: BugSpec[];
  blocks: BlockSpec[];
}

export const CANVAS_W = 1280;
export const CANVAS_H = 720;
export const GROUND_Y = 680;
export const DEFAULT_SLINGSHOT = { x: 180, y: 470 };

export const BUG_RADIUS = {
  pigSmall: 28,
  pigMid: 32,
  pigBig: 38,
  wormBrown: 22,
  wormGreen: 22,
  wormRed: 22,
  wormPink: 20,
  locustMutant: 26,
  locust: 22,
  grasshopper: 18,
} as const;

export const BLOCK_DEFAULT_SIZE: Record<BlockKind, { w: number; h: number }> = {
  wood: { w: 40, h: 80 },
  stone: { w: 50, h: 50 },
  glass: { w: 40, h: 60 },
  woodHouse: { w: 130, h: 140 },
  stoneTower: { w: 80, h: 200 },
  woodFence: { w: 100, h: 30 },
  brick: { w: 120, h: 80 },
  woodLadder: { w: 60, h: 100 },
  stoneSlab: { w: 100, h: 20 },
  house: { w: 150, h: 160 },
  haystack: { w: 80, h: 80 },
};

export const DEFAULT_CHICKEN_RADIUS = 22;

export const CHICKEN_PROPS: Record<ChickenKind, MaterialProps> = {
  red:    { density: 1.0, friction: 1.0, restitution: 0.3, color: '#FF4500' },
  yellow: { density: 1.0, friction: 1.0, restitution: 0.3, color: '#FFD700' },
  black:  { density: 1.0, friction: 1.0, restitution: 0.3, color: '#1A1A1A' },
  big:    { density: 1.2, friction: 1.0, restitution: 0.3, color: '#8B4513' },
  egg:    { density: 0.6, friction: 0.9, restitution: 0.5, color: '#FFF8DC' },
  pink:   { density: 1.0, friction: 1.0, restitution: 0.3, color: '#FF69B4' },
  brown:  { density: 1.1, friction: 1.0, restitution: 0.3, color: '#A0522D' },
  blue:   { density: 1.0, friction: 1.0, restitution: 0.3, color: '#1E90FF' },
  green:  { density: 1.0, friction: 1.0, restitution: 0.3, color: '#32CD32' },
  shopck1: { density: 1.0, friction: 1.0, restitution: 0.3, color: '#FF4500' },
  shopck2: { density: 1.0, friction: 1.0, restitution: 0.3, color: '#FFD700' },
};

export const BUG_PROPS: Record<BugKind, MaterialProps> = {
  pigSmall:  { density: 0.8, friction: 0.5, restitution: 0.3, color: '#9ACD32' },
  pigMid:    { density: 1.0, friction: 0.5, restitution: 0.3, color: '#7CCD7C' },
  pigBig:    { density: 1.2, friction: 0.5, restitution: 0.3, color: '#5BAA5B' },
  wormBrown: { density: 0.4, friction: 0.4, restitution: 0.4, color: '#8B4513' },
  wormGreen: { density: 0.4, friction: 0.4, restitution: 0.4, color: '#228B22' },
  wormRed:   { density: 0.4, friction: 0.4, restitution: 0.4, color: '#B22222' },
  wormPink:  { density: 0.4, friction: 0.4, restitution: 0.4, color: '#FF69B4' },
  locustMutant: { density: 0.6, friction: 0.4, restitution: 0.3, color: '#8B0000' },
  locust:       { density: 0.5, friction: 0.4, restitution: 0.35, color: '#556B2F' },
  grasshopper:  { density: 0.3, friction: 0.3, restitution: 0.5, color: '#7CFC00' },
};

export const BLOCK_MATERIAL: Record<BlockKind, MaterialProps> = {
  wood:       { density: 0.5, friction: 0.4, restitution: 0.1, color: '#8B5A2B' },
  stone:      { density: 2.0, friction: 0.6, restitution: 0.05, color: '#808080' },
  glass:      { density: 0.3, friction: 0.3, restitution: 0.05, color: '#ADD8E6' },
  woodHouse:  { density: 0.6, friction: 0.4, restitution: 0.1, color: '#A0522D' },
  stoneTower: { density: 2.5, friction: 0.6, restitution: 0.05, color: '#696969' },
  woodFence:  { density: 0.4, friction: 0.3, restitution: 0.1, color: '#CD853F' },
  brick:      { density: 1.8, friction: 0.5, restitution: 0.05, color: '#B22222' },
  woodLadder: { density: 0.5, friction: 0.4, restitution: 0.1, color: '#8B5A2B' },
  stoneSlab:  { density: 2.0, friction: 0.6, restitution: 0.05, color: '#808080' },
  house:      { density: 0.7, friction: 0.4, restitution: 0.1, color: '#8B4513' },
  haystack:   { density: 0.2, friction: 0.3, restitution: 0.05, color: '#DAA520' },
};

