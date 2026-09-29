import RAPIER from "@dimforge/rapier3d-simd-compat";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { STANDARD_GRAVITY } from "../spec/constants.ts";
import { sourced, type Quantity, type Vec3 } from "../spec/quantity.ts";

/**
 * **The core's physics engine: Rapier**, the SIMD build of its WebAssembly (`@dimforge/rapier3d-simd-compat`,
 * the owner's choice after the bake-off, `owner-physics-engine`). The compat build carries its wasm
 * inline, so a browser and Node load it alike (`loadRapier`); Havok stays with the old path.
 *
 * The core never hands the engine a variable step: `PhysicsWorld.step` takes the world's fixed step
 * (`src/core/world.ts`), and Rapier's own clock is set to it. After each step every body's node is
 * written from its body, so everything that reads a pose reads the nodes (H24), as before.
 *
 * **Solver conditioning** (`SOLVER`): the solver's iteration counts, which Havok did not expose, are
 * named here and nowhere else, and come from the bake-off's table. Bodies never sleep: a sleeping
 * body reads a perfect zero (H08).
 */
export type Rapier = typeof RAPIER;

/** Load Rapier's wasm; once per realm is enough, and later calls return at once. */
export async function loadRapier(): Promise<Rapier> {
  await RAPIER.init();
  return RAPIER;
}

/** The fixed step's rate: physics and control run at 120 Hz. */
export const PHYSICS_HZ: Quantity<number> = sourced(120, "Hz", "owner-physics-rate",
  "physics and control at 120 Hz from the release of 2026-09-25");

/**
 * The solver's iterations a step (`numSolverIterations`) and the PGS passes within each
 * (`numInternalPgsIterations`): solver conditioning, not anatomy. The bake-off's cheapest setting at
 * 120 Hz and one sub-step at which a human held the 1920 Hz reference (the elbow within 0.001 rad,
 * a whole human drifting 0.4 mm in 10 s).
 */
export const SOLVER = {
  iterations: sourced(16, "1", "physics-bakeoff", "Rapier at 120 Hz, one sub-step: passes the clean bar at 16 iterations"),
  pgs: sourced(2, "1", "physics-bakeoff", "with 2 internal PGS iterations"),
} as const;

export interface PhysicsOptions {
  /** Steps a second. */
  readonly hz: number;
  /** Standard gravity, or none. */
  readonly gravity: boolean;
}

/** Mass properties as the spec gives them: kg, the centre in the body's frame, principal moments (kg m2) and their axes. */
export interface MassProperties {
  readonly mass: number;
  readonly centre: Vec3;
  readonly moments: Vec3;
  readonly orientation: Quaternion;
}

/**
 * **A dynamic body with its node**: what the core reads of a body and does to it. Velocities are the
 * centre of mass's (Rapier's `linvel`, as Havok's, H49) and are read into a caller's vector.
 */
export interface SegmentBody {
  readonly node: TransformNode;
  readonly rigid: RAPIER.RigidBody;
  linearVelocityToRef(out: Vector3): Vector3;
  angularVelocityToRef(out: Vector3): Vector3;
  /** An impulse (N s, world) at a point (world). */
  applyImpulse(impulse: Vector3, at: Vector3): void;
  readonly massProperties: MassProperties;
  setMassProperties(properties: MassProperties): void;
  /** Hold the body still where it is, or let it go again. */
  setFixed(fixed: boolean): void;
}

/** A body's shape, in its own frame: what `PhysicsWorld.addBody` gives it colliders for. */
export type ColliderShape =
  | { readonly kind: "capsule"; readonly from: Vec3; readonly to: Vec3; readonly radius: number }
  | { readonly kind: "box"; readonly centre: Vec3; readonly size: Vec3 }
  | { readonly kind: "sphere"; readonly centre: Vec3; readonly radius: number }
  | { readonly kind: "hull"; readonly points: readonly Vec3[] };

/**
 * **A joint between two bodies**: a generic joint whose frame's X, Y and Z are the joint's
 * constraint axes (`BuiltJoint.axes`), set in each body's own frame, with every linear axis locked
 * and each angular axis past the freedoms locked. Freedom k is angular axis k, limited to its range
 * as Rapier's limit measures it (`src/core/build/joint-state.ts`), and driven by a velocity motor
 * on the same axis. The two bodies do not collide with each other.
 */
export interface JointFrames {
  readonly anchorParent: Vec3;
  readonly anchorChild: Vec3;
  /** The constraint axes in each body's frame. */
  readonly frameParent: Quaternion;
  readonly frameChild: Quaternion;
  /** Each freedom's range, rad, about its constraint axis: freedom k's is `limits[k]`. */
  readonly limits: readonly (readonly [number, number])[];
}

export interface CoreJoint {
  readonly raw: RAPIER.ImpulseJoint;
  /**
   * Freedom k's motor: turn the child relative to the parent about the parent-fixed axis at `speed`
   * (rad/s), with at most `ceiling` (N m) either way. The motor is a hard velocity constraint
   * (infinite damping, so no softness), bounded by the ceiling times the step.
   */
  setMotor(k: number, speed: number, ceiling: number): void;
}

export interface PhysicsWorld {
  readonly rapier: Rapier;
  readonly raw: RAPIER.World;
  readonly gravity: Vec3;
  /** A dynamic body at its node's pose, its colliders massless: its mass is `mass`. */
  addBody(node: TransformNode, shapes: readonly ColliderShape[], mass: MassProperties): SegmentBody;
  addJoint(parent: SegmentBody, child: SegmentBody, frames: JointFrames): CoreJoint;
  /** A fixed box, centre and full size, world. */
  addGround(centre: Vec3, size: Vec3): RAPIER.Collider;
  /** One solver step of `dt`, then every body's node written from its body. */
  step(dt: number): void;
  /** Remove a body, its colliders and its joints; nothing once the world is disposed. */
  removeBody(body: SegmentBody): void;
  /** Free the world and everything in it; again is nothing. */
  dispose(): void;
}

/** A Rapier world with the core's gravity and solver settings. */
export function createPhysics(R: Rapier, { hz, gravity }: PhysicsOptions): PhysicsWorld {
  const g: Vec3 = gravity ? [0, -STANDARD_GRAVITY.value, 0] : [0, 0, 0];
  const raw = new R.World({ x: g[0], y: g[1], z: g[2] });
  raw.timestep = 1 / hz;
  raw.numSolverIterations = SOLVER.iterations.value;
  raw.numInternalPgsIterations = SOLVER.pgs.value;
  const bodies = new Set<SegmentBody>();
  let freed = false;
  const xyz = (v: Vec3) => ({ x: v[0], y: v[1], z: v[2] });
  const xyzw = (q: Quaternion) => ({ x: q.x, y: q.y, z: q.z, w: q.w });

  const colliderOf = (shape: ColliderShape): RAPIER.ColliderDesc => {
    switch (shape.kind) {
      case "capsule": {
        // Rapier's capsule runs along its own y; turn y onto the segment from `from` to `to`.
        const d = new Vector3(shape.to[0] - shape.from[0], shape.to[1] - shape.from[1], shape.to[2] - shape.from[2]);
        const length = d.length();
        const turn = length > 0 ? turnBetween(Vector3.Up(), d.scale(1 / length)) : Quaternion.Identity();
        return R.ColliderDesc.capsule(length / 2, shape.radius)
          .setTranslation((shape.from[0] + shape.to[0]) / 2, (shape.from[1] + shape.to[1]) / 2, (shape.from[2] + shape.to[2]) / 2)
          .setRotation(xyzw(turn));
      }
      case "box":
        return R.ColliderDesc.cuboid(shape.size[0] / 2, shape.size[1] / 2, shape.size[2] / 2).setTranslation(...shape.centre);
      case "sphere":
        return R.ColliderDesc.ball(shape.radius).setTranslation(...shape.centre);
      case "hull": {
        const desc = R.ColliderDesc.convexHull(new Float32Array(shape.points.flat()));
        if (!desc) throw new Error("Rapier could not build a convex hull of these points");
        return desc;
      }
      default: {
        const never: never = shape;
        throw new Error(`unknown shape ${JSON.stringify(never)}`);
      }
    }
  };

  const physics: PhysicsWorld = {
    rapier: R, raw, gravity: g,
    addBody(node, shapes, mass) {
      const q = node.rotationQuaternion ?? Quaternion.Identity();
      const rigid = raw.createRigidBody(R.RigidBodyDesc.dynamic()
        .setTranslation(node.position.x, node.position.y, node.position.z)
        .setRotation(xyzw(q))
        .setCanSleep(false));
      for (const shape of shapes) raw.createCollider(colliderOf(shape).setDensity(0), rigid);
      let properties = mass;
      const setMass = (m: MassProperties) => {
        properties = m;
        rigid.setAdditionalMassProperties(m.mass, xyz(m.centre), xyz(m.moments), xyzw(m.orientation), true);
        // Rapier applies them at its next step unless told now; an impulse before then meets none.
        rigid.recomputeMassPropertiesFromColliders();
      };
      setMass(mass);
      const body: SegmentBody = {
        node, rigid,
        linearVelocityToRef(out) { const v = rigid.linvel(); return out.set(v.x, v.y, v.z); },
        angularVelocityToRef(out) { const w = rigid.angvel(); return out.set(w.x, w.y, w.z); },
        applyImpulse(impulse, at) { rigid.applyImpulseAtPoint(impulse, at, true); },
        get massProperties() { return properties; },
        setMassProperties: setMass,
        setFixed(fixed) { rigid.setBodyType(fixed ? R.RigidBodyType.Fixed : R.RigidBodyType.Dynamic, true); },
      };
      bodies.add(body);
      return body;
    },
    addJoint(parent, child, frames) {
      const M = R.JointAxesMask, n = frames.limits.length;
      if (n < 1 || n > 3) throw new Error(`a joint has one to three freedoms, not ${n}`);
      const locked = M.LinX | M.LinY | M.LinZ | (n < 2 ? M.AngY : 0) | (n < 3 ? M.AngZ : 0);
      const data = R.JointData.generic(xyz(frames.anchorParent), xyz(frames.anchorChild), { x: 1, y: 0, z: 0 }, locked);
      const joint = raw.createImpulseJoint(data, parent.rigid, child.rigid, true);
      joint.setLocalFrame1(xyz(frames.anchorParent), xyzw(frames.frameParent));
      joint.setLocalFrame2(xyz(frames.anchorChild), xyzw(frames.frameChild));
      joint.setContactsEnabled(false);
      const set = raw.impulseJoints.raw, handle = joint.handle;
      const axes = [R.JointAxis.AngX, R.JointAxis.AngY, R.JointAxis.AngZ] as const;
      frames.limits.forEach(([min, max], k) => {
        set.jointSetLimits(handle, axes[k]! as never, min, max);
        set.jointConfigureMotorVelocity(handle, axes[k]! as never, 0, Infinity);
        set.jointSetMotorMaxForce(handle, axes[k]! as never, 0);
      });
      return {
        raw: joint,
        setMotor(k, speed, ceiling) {
          set.jointConfigureMotorVelocity(handle, axes[k]! as never, speed, Infinity);
          set.jointSetMotorMaxForce(handle, axes[k]! as never, ceiling);
        },
      };
    },
    addGround(centre, size) {
      return raw.createCollider(R.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2).setTranslation(...centre));
    },
    step(dt) {
      raw.timestep = dt;
      raw.step();
      for (const { node, rigid } of bodies) {
        const t = rigid.translation(), r = rigid.rotation();
        node.position.set(t.x, t.y, t.z);
        (node.rotationQuaternion ??= new Quaternion()).set(r.x, r.y, r.z, r.w);
      }
    },
    removeBody(body) {
      // After the world is freed its bodies went with it.
      if (!bodies.delete(body) || freed) return;
      raw.removeRigidBody(body.rigid);
    },
    dispose() {
      if (freed) return;
      freed = true;
      bodies.clear();
      raw.free();
    },
  };
  return physics;
}

/** The shortest turn taking unit `from` onto unit `to`. */
function turnBetween(from: Vector3, to: Vector3): Quaternion {
  const c = Vector3.Dot(from, to);
  if (c < -1 + 1e-12) {
    // Half a turn, about any axis square to `from`.
    const axis = Math.abs(from.x) < 0.9 ? Vector3.Cross(from, Vector3.Right()) : Vector3.Cross(from, Vector3.Forward());
    return Quaternion.RotationAxis(axis.normalize(), Math.PI);
  }
  const axis = Vector3.Cross(from, to);
  return new Quaternion(axis.x, axis.y, axis.z, 1 + c).normalize();
}
