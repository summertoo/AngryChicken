import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CollisionTracker } from '../physics/CollisionTracker';
import { BodyFactory } from './BodyFactory';
import { Slingshot } from './Slingshot';
import { StateMachine, GameState } from './StateMachine';
import { LevelConfig, CANVAS_W, CANVAS_H, GROUND_Y, BugKind } from '../levels/types';
import { getLevel } from '../levels/levels';
import { ParticleSystem } from './Particles';
import { audio } from './Audio';
import { generateEnvironment, type EnvironmentConfig } from './Environment';

const EDITOR_STORAGE_PREFIX = 'crazych.editor.level.';
const COMMUNITY_STORAGE_PREFIX = 'crazych.community.level.';

export interface BugKillInfo {
  bugId: number;
  x: number;
  y: number;
  kind: BugKind;
  killer: string;
}

export interface GameCallbacks {
  onStateChange?: (state: GameState) => void;
  onLevelLoaded?: (level: LevelConfig, bugsAlive: number) => void;
}

export class Game {
  readonly physics: PhysicsWorld;
  readonly collisions: CollisionTracker;
  readonly factory: BodyFactory;
  readonly particles: ParticleSystem = new ParticleSystem();

  slingshot!: Slingshot;
  state: StateMachine = new StateMachine();

  currentLevel!: LevelConfig;
  aliveBugIds: Set<number> = new Set();
  isInteractive = false;
  setupPrepared = false;
  environment: EnvironmentConfig = generateEnvironment(1);

  private callbacks: GameCallbacks;
  private prevState: GameState = 'AIM';

  constructor(
    physics: PhysicsWorld,
    collisions: CollisionTracker,
    factory: BodyFactory,
    callbacks: GameCallbacks = {},
  ) {
    this.physics = physics;
    this.collisions = collisions;
    this.factory = factory;
    this.callbacks = callbacks;
  }

  loadLevel(id: number): boolean {
    const stored = this.loadFromStorage(id);
    const level = stored ?? getLevel(id);
    if (!level) return false;

    try {
      for (const body of [...this.physics.bodies]) {
        this.physics.destroyBody(body);
      }

      this.collisions.reset();
      this.aliveBugIds.clear();
      this.particles.clear();

      this.physics.createGround(CANVAS_W / 2, GROUND_Y, CANVAS_W, 40, '#8B7355', 0, 'ground');

      for (const spec of level.bugs) {
        this.factory.createBug(spec);
        this.aliveBugIds.add(spec.id);
      }

      for (const spec of level.blocks) {
        this.factory.createBlock(spec);
      }

      this.slingshot = new Slingshot(
        this.physics, this.factory,
        level.slingshot.x, level.slingshot.y,
        3, 1,
        level.ground.y,
      );
      this.slingshot.loadChicken();

      this.state.reset();
      this.isInteractive = false;
      this.setupPrepared = false;
      this.currentLevel = level;
      this.environment = generateEnvironment(level.id);
      this.prevState = this.state.getState();

    } catch (e) {
      console.error(`[Game.loadLevel] Error loading level ${id}:`, e);
    }

    this.callbacks.onLevelLoaded?.(level, this.aliveBugIds.size);
    return true;
  }

  restart(): void {
    this.loadLevel(this.currentLevel.id);
  }

  nextLevel(): boolean {
    return this.loadLevel(this.currentLevel.id + 1);
  }

  makeInteractive(): void {
    if (this.isInteractive) return;
    this.isInteractive = true;
    this.collisions.reset();
  }

  processCollisions(): BugKillInfo[] {
    const events = this.collisions.drainEvents();
    if (!this.isInteractive) {
      return [];
    }
    const killed: BugKillInfo[] = [];
    for (const ev of events) {
      if (ev.type === 'bug_killed') {
        this.aliveBugIds.delete(ev.bugId);
        const body = this.findBodyById(ev.bugId, 'bug');
        if (body) {
          const meta = this.physics.metas.get(body);
          const p = body.GetPosition();
          const x = this.physics.m2px(p.x);
          const y = this.physics.m2px(p.y);
          const kind = (meta?.kind ?? 'wormGreen') as BugKind;
          killed.push({ bugId: ev.bugId, x, y, kind, killer: ev.killer });
          this.physics.destroyBody(body);
          audio.kill();
        }
      } else if (ev.type === 'block_impact' && ev.impulse >= 1.0) {
        const kind = ev.kind;
        if (kind === 'wood' || kind === 'woodHouse' || kind === 'woodFence') {
          this.particles.spawnSplinter(ev.x, ev.y, 6);
          audio.splinter();
        } else if (kind === 'stone' || kind === 'stoneTower' || kind === 'stoneSlab') {
          this.particles.spawnDust(ev.x, ev.y, 5);
          audio.dust();
        } else if (kind === 'glass') {
          this.particles.spawnBugDeath(ev.x, ev.y, '#B0E0E6', 8);
          audio.glassBreak();
        }
      }
    }
    return killed;
  }

  cleanupOutOfBoundsBugs(): number[] {
    const removed: number[] = [];
    const margin = 120;
    for (const body of [...this.physics.bodies]) {
      const meta = this.physics.metas.get(body);
      if (!meta || meta.role !== 'bug') continue;
      const p = body.GetPosition();
      const x = this.physics.m2px(p.x);
      const y = this.physics.m2px(p.y);
      const isOutOfBounds =
        x < -margin ||
        x > CANVAS_W + margin ||
        y < -margin ||
        y > CANVAS_H + margin;
      if (isOutOfBounds) {
        this.aliveBugIds.delete(meta.id);
        this.physics.destroyBody(body);
        removed.push(meta.id);
      }
    }
    return removed;
  }

  findBodyById(id: number, role?: 'bug' | 'block' | 'chicken' | 'ground'): Box2D.b2Body | undefined {
    for (const body of this.physics.bodies) {
      const meta = this.physics.metas.get(body);
      if (meta && meta.id === id && (role === undefined || meta.role === role)) return body;
    }
    return undefined;
  }

  notifyStateChange(): void {
    const s = this.state.getState();
    if (s !== this.prevState) {
      this.callbacks.onStateChange?.(s);
      this.prevState = s;
    }
  }

  finalizeSetup(): void {
    if (this.setupPrepared) return;
    this.collisions.reset();
    this.isInteractive = false;
    this.setupPrepared = true;
  }

  private loadFromStorage(id: number): LevelConfig | null {
    const editorRaw = localStorage.getItem(`${EDITOR_STORAGE_PREFIX}${id}`);
    if (editorRaw) {
      try { return JSON.parse(editorRaw) as LevelConfig; } catch { /* ignore */ }
    }
    const communityRaw = localStorage.getItem(`${COMMUNITY_STORAGE_PREFIX}${id}`);
    if (communityRaw) {
      try { return JSON.parse(communityRaw) as LevelConfig; } catch { /* ignore */ }
    }
    return null;
  }
}
