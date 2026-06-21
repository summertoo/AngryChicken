import Box2DFactory from 'box2d-wasm';
import box2dWasmUrl from 'box2d-wasm/build/es/Box2D.wasm?url';

export type EntityRole = 'chicken' | 'bug' | 'block' | 'ground';
export type EntityShape = 'box' | 'circle';

export interface BodyMeta {
  id: number;
  role: EntityRole;
  shape: EntityShape;
  kind?: string;
  color: string;
  width?: number;
  height?: number;
  radius?: number;
  density: number;
  friction: number;
  restitution: number;
}

type Box2DModule = typeof Box2D & EmscriptenModule;

const factory = Box2DFactory as unknown as (overrides?: Partial<Box2DModule>) => Promise<Box2DModule>;

export class PhysicsWorld {
  static box2d: Box2DModule | null = null;

  world!: Box2D.b2World;
  bodies: Box2D.b2Body[] = [];
  metas: Map<Box2D.b2Body, BodyMeta> = new Map();

  private velocityIterations = 8;
  private positionIterations = 3;
  private pixelsPerMeter = 30;
  private gravityY = 9.8;

  get gravity(): number { return this.gravityY; }

  setGravity(y: number): void {
    this.gravityY = y;
    const b = this.b;
    const g = new b.b2Vec2(0, y);
    this.world.SetGravity(g);
    g.__destroy__();
    for (const body of this.bodies) {
      const meta = this.metas.get(body);
      if (!meta || meta.role === 'ground') continue;
      body.SetAwake(true);
    }
  }

  static async create(): Promise<PhysicsWorld> {
    const wasmResponse = await fetch(box2dWasmUrl);
    if (!wasmResponse.ok) {
      throw new Error(`Failed to fetch box2d-wasm binary: ${wasmResponse.status} ${wasmResponse.statusText}`);
    }
    const wasmBinary = await wasmResponse.arrayBuffer();
    PhysicsWorld.box2d = await factory({ wasmBinary });
    const w = new PhysicsWorld();
    w.world = new PhysicsWorld.box2d.b2World(new PhysicsWorld.box2d.b2Vec2(0, w.gravityY));
    return w;
  }

  px2m(px: number): number {
    return px / this.pixelsPerMeter;
  }

  m2px(m: number): number {
    return m * this.pixelsPerMeter;
  }

  private get b(): Box2DModule {
    if (!PhysicsWorld.box2d) throw new Error('PhysicsWorld not initialized');
    return PhysicsWorld.box2d;
  }

  createGround(x: number, y: number, w: number, h: number, color = '#4CAF50', id = 0, kind?: string): Box2D.b2Body {
    const b = this.b;
    const def = new b.b2BodyDef();
    def.type = b.b2_staticBody;
    def.position = new b.b2Vec2(this.px2m(x), this.px2m(y));

    const body = this.world.CreateBody(def);

    const fdef = new b.b2FixtureDef();
    const shape = new b.b2PolygonShape();
    shape.SetAsBox(this.px2m(w) / 2, this.px2m(h) / 2);
    fdef.shape = shape;
    fdef.friction = 2.0;
    body.CreateFixture(fdef);

    this.bodies.push(body);
    this.metas.set(body, {
      id,
      role: 'ground',
      shape: 'box',
      kind,
      color,
      width: w,
      height: h,
      density: 0,
      friction: 0.6,
      restitution: 0,
    });
    return body;
  }

  createBox(
    x: number, y: number, w: number, h: number,
    density = 1.0, color = '#8B5A2B',
    id = 0, role: EntityRole = 'block',
    kind?: string,
    friction = 0.4,
    restitution = 0.1,
    angle = 0,
  ): Box2D.b2Body {
    const b = this.b;
    const def = new b.b2BodyDef();
    def.type = b.b2_dynamicBody;
    def.position = new b.b2Vec2(this.px2m(x), this.px2m(y));
    def.angle = angle;

    const body = this.world.CreateBody(def);

    const fdef = new b.b2FixtureDef();
    const shape = new b.b2PolygonShape();
    shape.SetAsBox(this.px2m(w) / 2, this.px2m(h) / 2);
    fdef.shape = shape;
    fdef.density = density;
    fdef.friction = friction;
    fdef.restitution = restitution;
    body.CreateFixture(fdef);

    this.bodies.push(body);
    this.metas.set(body, {
      id,
      role,
      shape: 'box',
      kind,
      color,
      width: w,
      height: h,
      density,
      friction,
      restitution,
    });
    return body;
  }

  createCircle(
    x: number, y: number, r: number,
    density = 1.0, color = '#FFD700',
    id = 0, role: EntityRole = 'bug',
    kind?: string,
    friction = 0.4,
    restitution = 0.3,
  ): Box2D.b2Body {
    const b = this.b;
    const def = new b.b2BodyDef();
    def.type = b.b2_dynamicBody;
    def.position = new b.b2Vec2(this.px2m(x), this.px2m(y));

    const body = this.world.CreateBody(def);

    const fdef = new b.b2FixtureDef();
    const shape = new b.b2CircleShape();
    shape.m_radius = this.px2m(r);
    fdef.shape = shape;
    fdef.density = density;
    fdef.friction = friction;
    fdef.restitution = restitution;
    body.CreateFixture(fdef);

    this.bodies.push(body);
    this.metas.set(body, {
      id,
      role,
      shape: 'circle',
      kind,
      color,
      radius: r,
      density,
      friction,
      restitution,
    });
    return body;
  }

  step(dt: number): void {
    this.world.Step(dt, this.velocityIterations, this.positionIterations);
    this.world.ClearForces();
  }

  destroyBody(body: Box2D.b2Body): void {
    const idx = this.bodies.indexOf(body);
    if (idx >= 0) this.bodies.splice(idx, 1);
    this.metas.delete(body);
    this.world.DestroyBody(body);
  }
}
