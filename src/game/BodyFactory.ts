import { PhysicsWorld } from '../physics/PhysicsWorld';
import {
  BugSpec,
  BlockSpec,
  ChickenSpec,
  BlockKind,
  BugKind,
  ChickenKind,
  BLOCK_MATERIAL,
  BUG_PROPS,
  CHICKEN_PROPS,
  DEFAULT_CHICKEN_RADIUS,
} from '../levels/types';

export class BodyFactory {
  constructor(private world: PhysicsWorld) {}

  createBug(spec: BugSpec): Box2D.b2Body {
    const props = BUG_PROPS[spec.type];
    return this.world.createCircle(
      spec.x, spec.y, spec.radius,
      props.density, props.color,
      spec.id, 'bug', spec.type,
      props.friction, props.restitution,
    );
  }

  createBlock(spec: BlockSpec): Box2D.b2Body {
    const props = BLOCK_MATERIAL[spec.type];
    return this.world.createBox(
      spec.x, spec.y, spec.w, spec.h,
      props.density, props.color,
      spec.id, 'block', spec.type,
      props.friction, props.restitution,
      spec.rotation ?? 0,
    );
  }

  createChicken(spec: ChickenSpec): Box2D.b2Body {
    const props = CHICKEN_PROPS[spec.kind];
    const r = spec.radius ?? DEFAULT_CHICKEN_RADIUS;
    return this.world.createCircle(
      spec.x, spec.y, r,
      props.density, props.color,
      spec.id, 'chicken', spec.kind,
      props.friction, props.restitution,
    );
  }
}
