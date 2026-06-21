import { PhysicsWorld } from '../physics/PhysicsWorld';
import { BodyFactory } from './BodyFactory';
import { ChickenKind, CHICKEN_PROPS } from '../levels/types';

const MAX_PULL = 110;
const POWER_SCALE = 8.0;
const TRAJECTORY_STEPS = 70;
const TRAJECTORY_DT = 1 / 60;
const LAUNCH_THRESHOLD = 8;
const PICK_RADIUS = 50;
const BRANCH_LEN = 42;
const BRANCH_ANGLE = Math.PI / 4;
const CHICKEN_REST_OFFSET_Y = -18;
const CHICKEN_LINEAR_DAMPING = 1.0;
const CHICKEN_ANGULAR_DAMPING = 3.0;
const SETTLED_VELOCITY_THRESHOLD = 1.5;
const BOMB_RADIUS = 12;
const BOMB_DENSITY = 8;
const BOMB_DROP_VY = 2;

export interface Vec2 { x: number; y: number; }

export interface SlingshotFrameGeometry {
  trunkBase: Vec2;
  fork: Vec2;
  leftTip: Vec2;
  rightTip: Vec2;
}

export class Slingshot {
  private world: PhysicsWorld;
  private factory: BodyFactory;
  private origin: Vec2;
  private groundY: number;
  private selectedKind: ChickenKind = 'shopck1';
  private chickenCounts: Record<string, number> = { shopck1: 0, shopck2: 0 };

  isDragging = false;
  isLoaded = false;
  loadedKind: ChickenKind = 'shopck1';

  private dragPos: Vec2 = { x: 0, y: 0 };
  private loadedRadius = 22;
  private nextId = 1;
  private activeChickens: Set<Box2D.b2Body> = new Set();
  activeBomberBody: Box2D.b2Body | null = null;
  bombs: Set<Box2D.b2Body> = new Set();

  constructor(world: PhysicsWorld, factory: BodyFactory, x: number, y: number, regularCount: number, bomberCount: number, groundY: number) {
    this.world = world;
    this.factory = factory;
    this.origin = { x, y };
    this.groundY = groundY;
    this.chickenCounts.shopck1 = regularCount;
    this.chickenCounts.shopck2 = bomberCount;
  }

  selectKind(kind: ChickenKind): void {
    if (kind === 'shopck1' || kind === 'shopck2') {
      if (this.chickenCounts[kind] > 0) {
        this.selectedKind = kind;
        if (this.isLoaded) {
          this.loadedKind = kind;
        }
      }
    }
  }

  getSelectedKind(): ChickenKind {
    return this.selectedKind;
  }

  getAvailable(): { kind: ChickenKind; count: number }[] {
    return [
      { kind: 'shopck1', count: this.chickenCounts.shopck1 },
      { kind: 'shopck2', count: this.chickenCounts.shopck2 },
    ];
  }

  getFrameGeometry(): SlingshotFrameGeometry {
    const forkX = this.origin.x;
    const forkY = this.origin.y;
    const tipLX = forkX - Math.sin(BRANCH_ANGLE) * BRANCH_LEN;
    const tipLY = forkY - Math.cos(BRANCH_ANGLE) * BRANCH_LEN;
    const tipRX = forkX + Math.sin(BRANCH_ANGLE) * BRANCH_LEN;
    const tipRY = forkY - Math.cos(BRANCH_ANGLE) * BRANCH_LEN;
    return {
      trunkBase: { x: forkX, y: this.groundY },
      fork: { x: forkX, y: forkY },
      leftTip: { x: tipLX, y: tipLY },
      rightTip: { x: tipRX, y: tipRY },
    };
  }

  private getChickenRestPos(): Vec2 {
    return {
      x: this.origin.x,
      y: this.origin.y + CHICKEN_REST_OFFSET_Y,
    };
  }

  loadChicken(): void {
    if (this.chickenCounts[this.selectedKind] <= 0) {
      if (this.chickenCounts.shopck1 > 0) this.selectedKind = 'shopck1';
      else if (this.chickenCounts.shopck2 > 0) this.selectedKind = 'shopck2';
      else {
        this.isLoaded = false;
        return;
      }
    }
    this.isLoaded = true;
    this.loadedKind = this.selectedKind;
    this.dragPos = this.getChickenRestPos();
  }

  hasChickens(): boolean {
    return this.chickenCounts.shopck1 > 0 || this.chickenCounts.shopck2 > 0;
  }

  remaining(): number {
    return this.chickenCounts.shopck1 + this.chickenCounts.shopck2;
  }

  getOrigin(): Vec2 {
    return { ...this.origin };
  }

  getChickenRenderPos(): Vec2 {
    if (this.isDragging) return { ...this.dragPos };
    return this.getChickenRestPos();
  }

  getLoadedRadius(): number {
    return this.loadedRadius;
  }

  isInside(x: number, y: number): boolean {
    if (!this.isLoaded) return false;
    const rest = this.getChickenRestPos();
    const dx = x - rest.x;
    const dy = y - rest.y;
    return dx * dx + dy * dy < PICK_RADIUS * PICK_RADIUS;
  }

  onPointerDown(x: number, y: number): boolean {
    if (this.isInside(x, y)) {
      this.isDragging = true;
      this.dragPos = { x, y };
      return true;
    }
    return false;
  }

  onPointerMove(x: number, y: number): void {
    if (this.isDragging) {
      this.dragPos = { x, y };
    }
  }

  onPointerUp(): Box2D.b2Body | null {
    if (!this.isDragging) return null;
    this.isDragging = false;

    const rest = this.getChickenRestPos();
    const dx = this.dragPos.x - rest.x;
    const dy = this.dragPos.y - rest.y;
    const pull = Math.sqrt(dx * dx + dy * dy);

    if (pull < LAUNCH_THRESHOLD) return null;

    const cappedPull = Math.min(pull, MAX_PULL);
    const dirX = -dx / pull;
    const dirY = -dy / pull;
    const pull_m = this.world.px2m(cappedPull);
    const vx_m = dirX * pull_m * POWER_SCALE;
    const vy_m = dirY * pull_m * POWER_SCALE;

    const kind = this.loadedKind;
    this.chickenCounts[kind]--;
    const id = this.nextId++;
    const body = this.factory.createChicken({
      id,
      kind,
      x: rest.x,
      y: rest.y,
      radius: this.loadedRadius,
    });

    const box2d = PhysicsWorld.box2d!;
    const vel = new box2d.b2Vec2(vx_m, vy_m);
    body.SetLinearVelocity(vel);
    vel.__destroy__();
    body.SetAngularVelocity(0);
    body.SetLinearDamping(0);
    body.SetAngularDamping(CHICKEN_ANGULAR_DAMPING);

    this.activeChickens.add(body);
    if (kind === 'shopck2') {
      this.activeBomberBody = body;
    }
    this.isLoaded = false;
    return body;
  }

  canDropBomb(): boolean {
    if (!this.activeBomberBody) return false;
    const metas = this.world.metas;
    return metas.has(this.activeBomberBody);
  }

  dropBomb(): { body: Box2D.b2Body; x: number; y: number } | null {
    if (!this.activeBomberBody || !this.world.metas.has(this.activeBomberBody)) {
      this.activeBomberBody = null;
      return null;
    }
    const p = this.activeBomberBody.GetPosition();
    const x = this.world.m2px(p.x);
    const y = this.world.m2px(p.y);

    const box2d = PhysicsWorld.box2d!;

    // Recoil: chicken gets forward + upward boost (air-jump feel)
    const chickenVel = this.activeBomberBody.GetLinearVelocity();
    const dir = Math.sign(chickenVel.x) || 1;
    const recoilVx = chickenVel.x + dir * 8;
    const recoilVy = chickenVel.y - 3;
    const recoilVel = new box2d.b2Vec2(recoilVx, recoilVy);
    this.activeBomberBody.SetLinearVelocity(recoilVel);
    this.activeBomberBody.SetAngularVelocity(dir * -6);
    recoilVel.__destroy__();

    // Create bomb below chicken to avoid overlap push (which causes horizontal drift)
    const bombY = y + this.loadedRadius + BOMB_RADIUS + 4;
    const body = this.world.createCircle(
      x, bombY, BOMB_RADIUS, BOMB_DENSITY, '#333', this.nextId++, 'block', 'bomb',
      0.5, 0.1,
    );
    const vel = new box2d.b2Vec2(0, BOMB_DROP_VY);
    body.SetLinearVelocity(vel);
    vel.__destroy__();

    this.bombs.add(body);
    this.activeBomberBody = null;
    return { body, x, y: bombY };
  }

  updateChickenDamping(metas: Map<Box2D.b2Body, unknown>): void {
    for (const body of this.activeChickens) {
      if (!metas.has(body)) {
        this.activeChickens.delete(body);
        if (body === this.activeBomberBody) this.activeBomberBody = null;
        continue;
      }
      const v = body.GetLinearVelocity();
      const speed = Math.sqrt(v.x * v.x + v.y * v.y);
      if (speed < SETTLED_VELOCITY_THRESHOLD) {
        body.SetLinearDamping(CHICKEN_LINEAR_DAMPING);
      } else {
        body.SetLinearDamping(0);
      }
    }
    for (const bomb of this.bombs) {
      if (!metas.has(bomb)) {
        this.bombs.delete(bomb);
        continue;
      }
      // Apply damping to bomb so it stops quickly after hitting ground
      const v = bomb.GetLinearVelocity();
      const speed = Math.sqrt(v.x * v.x + v.y * v.y);
      if (speed < SETTLED_VELOCITY_THRESHOLD) {
        bomb.SetLinearDamping(5.0);
        bomb.SetAngularDamping(5.0);
      }
    }
  }

  clearActiveChickens(): void {
    this.activeChickens.clear();
    this.activeBomberBody = null;
    this.bombs.clear();
  }

  computeTrajectory(): Vec2[] {
    if (!this.isDragging) return [];
    const rest = this.getChickenRestPos();
    const dx = this.dragPos.x - rest.x;
    const dy = this.dragPos.y - rest.y;
    const pull = Math.sqrt(dx * dx + dy * dy);
    if (pull < LAUNCH_THRESHOLD) return [];

    const cappedPull = Math.min(pull, MAX_PULL);
    const dirX = -dx / pull;
    const dirY = -dy / pull;
    const pull_m = this.world.px2m(cappedPull);
    const vx_m = dirX * pull_m * POWER_SCALE;
    let vy_m = dirY * pull_m * POWER_SCALE;
    const g = this.world.gravity;

    let px_m = this.world.px2m(rest.x);
    let py_m = this.world.px2m(rest.y);
    const pts: Vec2[] = [];
    for (let i = 0; i < TRAJECTORY_STEPS; i++) {
      px_m += vx_m * TRAJECTORY_DT;
      py_m += vy_m * TRAJECTORY_DT;
      vy_m += g * TRAJECTORY_DT;
      const x = this.world.m2px(px_m);
      const y = this.world.m2px(py_m);
      if (y > 800) break;
      pts.push({ x, y });
    }
    return pts;
  }

  getLoadedColor(): string {
    return CHICKEN_PROPS[this.loadedKind].color;
  }

  getLoadedKind(): ChickenKind {
    return this.loadedKind;
  }
}
