export interface BugKilledEvent {
  type: 'bug_killed';
  bugId: number;
  killer: 'chicken' | 'block' | 'ground';
  impulse: number;
}

export interface BlockImpactEvent {
  type: 'block_impact';
  blockId: number;
  x: number;
  y: number;
  kind: string;
  impulse: number;
}

export interface BlockFallingEvent {
  type: 'block_falling';
  blockId: number;
  speed: number;
}

export interface ChickenSettledEvent {
  type: 'chicken_settled';
  chickenId: number;
}

export interface BugLandedEvent {
  type: 'bug_landed';
  bugId: number;
  impulse: number;
}

export type GameEvent =
  | BugKilledEvent
  | BlockImpactEvent
  | BlockFallingEvent
  | ChickenSettledEvent
  | BugLandedEvent;
