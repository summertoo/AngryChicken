import { GameEvent } from '../game/Events';
import { BodyMeta } from './PhysicsWorld';

const KILL_IMPULSE_THRESHOLD = 0.5;

type Box2DModule = typeof Box2D & EmscriptenModule;

function createContactListener(box2d: Box2DModule, tracker: CollisionTracker): Box2D.JSContactListener {
  const listener = new box2d.JSContactListener() as unknown as Record<string, unknown>;
  listener.BeginContact = (contactPtr: number): void => {
    const contact = box2d.wrapPointer(contactPtr, box2d.b2Contact);
    tracker.handleBeginContact(contact);
  };
  listener.EndContact = (_contactPtr: number): void => {
  };
  listener.PreSolve = (_contactPtr: number, _oldManifoldPtr: number): void => {
  };
  listener.PostSolve = (contactPtr: number, impulsePtr: number): void => {
    const contact = box2d.wrapPointer(contactPtr, box2d.b2Contact);
    const impulse = box2d.wrapPointer(impulsePtr, box2d.b2ContactImpulse);
    tracker.handlePostSolve(contact, impulse);
  };
  return listener as unknown as Box2D.JSContactListener;
}

export class CollisionTracker {
  private world: Box2D.b2World;
  private box2d: Box2DModule;
  private metas: Map<Box2D.b2Body, BodyMeta>;
  private events: GameEvent[] = [];
  private killedBugIds: Set<number> = new Set();
  private listener: Box2D.JSContactListener | null = null;
  private ppm: number;

  constructor(world: Box2D.b2World, box2d: Box2DModule, metas: Map<Box2D.b2Body, BodyMeta>, pixelsPerMeter = 30) {
    this.world = world;
    this.box2d = box2d;
    this.metas = metas;
    this.ppm = pixelsPerMeter;
  }

  install(): void {
    if (this.listener) return;
    this.listener = createContactListener(this.box2d, this);
    this.world.SetContactListener(this.listener);
  }

  handleBeginContact(contact: Box2D.b2Contact): void {
    const fixA = contact.GetFixtureA();
    const fixB = contact.GetFixtureB();
    const bodyA = fixA.GetBody();
    const bodyB = fixB.GetBody();
    const metaA = this.metas.get(bodyA);
    const metaB = this.metas.get(bodyB);
    if (!metaA || !metaB) return;
  }

  handlePostSolve(contact: Box2D.b2Contact, impulse: Box2D.b2ContactImpulse): void {
    const fixA = contact.GetFixtureA();
    const fixB = contact.GetFixtureB();
    const bodyA = fixA.GetBody();
    const bodyB = fixB.GetBody();
    const metaA = this.metas.get(bodyA);
    const metaB = this.metas.get(bodyB);
    if (!metaA || !metaB) return;

    const count = impulse.count;
    let maxImpulse = 0;
    for (let i = 0; i < count; i++) {
      const ni = impulse.get_normalImpulses(i);
      if (ni > maxImpulse) maxImpulse = ni;
    }
    if (maxImpulse < 0.05) return;

    const bugMeta = metaA.role === 'bug' ? metaA : metaB.role === 'bug' ? metaB : null;
    const otherMeta = bugMeta === metaA ? metaB : metaA;
    if (!bugMeta) return;
    if (this.killedBugIds.has(bugMeta.id)) return;

    if (otherMeta.role === 'ground' && maxImpulse >= KILL_IMPULSE_THRESHOLD) {
      this.events.push({
        type: 'bug_killed',
        bugId: bugMeta.id,
        killer: 'ground',
        impulse: maxImpulse,
      });
      this.killedBugIds.add(bugMeta.id);
      return;
    }

    if ((otherMeta.role === 'chicken' || otherMeta.role === 'block') && maxImpulse >= KILL_IMPULSE_THRESHOLD) {
      this.events.push({
        type: 'bug_killed',
        bugId: bugMeta.id,
        killer: otherMeta.role === 'chicken' ? 'chicken' : 'block',
        impulse: maxImpulse,
      });
      this.killedBugIds.add(bugMeta.id);
    }
    if (maxImpulse >= KILL_IMPULSE_THRESHOLD) {
      let blockMeta: BodyMeta | null = null;
      let blockBody: Box2D.b2Body | null = null;
      if (metaA.role === 'block') { blockMeta = metaA; blockBody = bodyA; }
      else if (metaB.role === 'block') { blockMeta = metaB; blockBody = bodyB; }
      if (blockMeta && blockBody) {
        const bp = blockBody.GetPosition();
        const bx = bp.x * this.ppm;
        const by = bp.y * this.ppm;
        this.events.push({
          type: 'block_impact',
          blockId: blockMeta.id,
          x: bx,
          y: by,
          kind: blockMeta.kind ?? 'wood',
          impulse: maxImpulse,
        });
      }
    }
  }

  markBugAlive(bugId: number): void {
    this.killedBugIds.delete(bugId);
  }

  reset(): void {
    this.events = [];
    this.killedBugIds.clear();
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  isBugDead(bugId: number): boolean {
    return this.killedBugIds.has(bugId);
  }
}
