import RAPIER from "@dimforge/rapier3d-simd-compat";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { STANDARD_GRAVITY } from "../spec/constants.ts";
import { sourced, type Vec3 } from "../spec/quantity.ts";
import { CONTACT_FRICTION, type ColliderShape, type Contact, type EngineGrip, type EngineJoint, type FixedCollider, type JointFrames, type MassProperties,
  type PhysicsEngine, type PhysicsOptions, type PhysicsWorld, type SegmentBody } from "./engine.ts";
import { sin, cos, hypot } from "../math/real.ts";
import { turnAboutToRef } from "../math/turn.ts";

/**
 * **The core's physics engine: Rapier**, the SIMD build of its WebAssembly (`@dimforge/rapier3d-simd-compat`,
 * the owner's choice after the bake-off, `owner-physics-engine`), meeting the contract of `engine.ts`.
 * It is built from the pinned source and patch in `vendor/rapier`. The compat build carries its
 * wasm inline, so a browser and Node load it alike (`loadRapier`).
 *
 * Rapier's clock is set to the world's fixed step. Its generic joint measures a limited angle as
 * `jointAngles` reads it (`src/core/build/joint-state.ts`), and its velocity motor with infinite
 * damping and a maximum force is the contract's motor.
 *
 * **Solver conditioning** (`SOLVER`): the solver's iteration counts are named here and nowhere
 * else, and come from the bake-off's table. Bodies never sleep: a sleeping body reads a perfect zero.
 *
 * **A save** is each node's pose and Rapier's snapshot. The snapshot restores as a new world, so
 * the module holds handles and finds its objects again on a load (`rebinds`, `joints`). The nodes
 * are in it because Rapier holds a pose in single precision: a node the solver has written is its
 * body's, and a node before its first step is as it was built, in double.
 */
type Rapier = typeof RAPIER;

/** Vendor archive identity (`docs/reference/rapier-vendor.md`) and the adapter's snapshot contract. */
const REVISION = "rapier/adapter-2/sha256:2787130f67465fa8fb07bf4217b0b2fab1681a416b99668ac831e1129b810122";

/**
 * Rapier's wasm, loading or loaded: one instance a realm. Rapier's own `init` asked again while
 * its first call is still loading makes a second instance and turns the module to it, and a world
 * made in the first is from then on read out of the second's memory.
 */
let loading: Promise<Rapier> | null = null;

/** Load Rapier's wasm, once a realm: every caller waits on the one load. */
export function rapierModule(): Promise<Rapier> {
  loading ??= RAPIER.init().then(() => RAPIER);
  return loading;
}

/** **Rapier as the core's engine**, its wasm loaded. */
export async function loadRapier(): Promise<PhysicsEngine> {
  const R = await rapierModule();
  return { name: "rapier", revision: REVISION, createPhysics: (options) => createRapierPhysics(R, options, REVISION) };
}

/**
 * The solver's iterations a step (`numSolverIterations`) and the PGS passes within each
 * (`numInternalPgsIterations`): solver conditioning, not anatomy. The bake-off's cheapest setting at
 * 120 Hz and one sub-step at which a human held the 1920 Hz reference (the elbow within 0.001 rad,
 * a whole human drifting 0.4 mm in 10 s).
 */
const SOLVER = {
  iterations: sourced(16, "1", "physics-bakeoff", "Rapier at 120 Hz, one sub-step: passes the clean bar at 16 iterations"),
  pgs: sourced(2, "1", "physics-bakeoff", "with 2 internal PGS iterations"),
} as const;

/** More shapes than any body has: what orders a contact's pairs by this body's shape, then the other's. A numeric setting. */
const SHAPES_MOST = 65536;
/** The numbers of a node's pose in a save: its position and its turn. A numeric setting. */
const NODE_POSE = 7;

/** A body of a world's, or a fixed collider by its handle: a contact's other side as `contactsOf` sums it. */
type Other = RapierBody | number;
interface Sum { impulse: number; point: number[]; normal: number[] }
/** What `contactsOf` reads a body's contacts into (`createRapierPhysics`'s `scan`). */
interface Scan {
  /** The body whose contacts are being read; null between reads. */
  body: RapierBody | null;
  /** The handle of its collider Rapier is calling back about. */
  mine: number;
  wanted: ((other: SegmentBody | null) => boolean) | undefined;
  /** What the solver pushed on: each pair's point and normal, weighted by its impulse, and the same of each pair of shapes. */
  pushed: Map<Other, Sum & { pairs: Map<number, Sum & { mine: number; theirs: number }> }> | null;
  /** Everything in contact: each pair's point and normal, and how many pairs. */
  met: Map<Other, { pairs: number; point: number[]; normal: number[]; first: number[] }> | null;
  /** What a pair's reading threw, which Rapier's call back would drop: the read throws it once Rapier returns. */
  fault: { error: unknown } | null;
}
/** A Rapier body: the contract's, and Rapier's own for a probe of Rapier (`research/core-rapier-probe.mjs`). */
interface RapierBody extends SegmentBody {
  /** Rapier's own body: a velocity written to it is read from the next step on (`linearVelocityToRef`). */
  readonly rigid: RAPIER.RigidBody;
}
interface RapierJoint extends EngineJoint {
  readonly raw: RAPIER.ImpulseJoint;
}
/** A Rapier world: the contract's, and Rapier's own. The core sees only `PhysicsWorld`. */
interface RapierPhysics extends PhysicsWorld {
  readonly rapier: Rapier;
  /** Rapier's world as it is now: a load replaces it, so read it afresh. */
  readonly raw: RAPIER.World;
  addBody(node: TransformNode, shapes: readonly ColliderShape[], mass: MassProperties): RapierBody;
  addJoint(parent: SegmentBody, child: SegmentBody, frames: JointFrames): RapierJoint;
}

/** A Rapier world with the core's gravity and solver settings. */
export function createRapierPhysics(R: Rapier, { hz, gravity }: PhysicsOptions, revision = "unidentified-rapier"): RapierPhysics {
  const g: Vec3 = gravity ? [0, -STANDARD_GRAVITY.value, 0] : [0, 0, 0];
  let raw = new R.World({ x: g[0], y: g[1], z: g[2] });
  raw.timestep = 1 / hz;
  raw.numSolverIterations = SOLVER.iterations.value;
  raw.numInternalPgsIterations = SOLVER.pgs.value;
  /** The world's joints, which every joint's limits and motor are set through. */
  let joints = raw.impulseJoints.raw;
  const bodies = new Set<RapierBody>();
  const grips: { parent: RapierBody; child: RapierBody; handle: number | null }[] = [];
  /** What each body does to find its rigid body again in a world just loaded. */
  const rebinds = new Map<RapierBody, () => void>();
  /** Each body by its colliders' handles, for a contact's other side: a collider not here is a fixed one. */
  const bodyOf = new Map<number, RapierBody>();
  /** Each body collider's place among its body's shapes, as `addBody` was given them, by its handle. */
  const shapeOf = new Map<number, number>();
  /** Each body's colliders' handles, in its shapes' order. */
  const colliderHandles = new Map<RapierBody, readonly number[]>();
  /** The bodies given a force or a moment for the next step: Rapier keeps one until it is reset. */
  const forced = new Set<RapierBody>();
  /** Which world's velocities a body's read holds: a step or a load moves it on. */
  let moment = 0;
  let freed = false;
  const xyz = (v: Vec3) => ({ x: v[0], y: v[1], z: v[2] });
  const xyzw = (q: Quaternion) => ({ x: q.x, y: q.y, z: q.z, w: q.w });
  /** The contract's contact: its friction, averaged, and no bounce. */
  const contact = (desc: RAPIER.ColliderDesc): RAPIER.ColliderDesc => desc
    .setFriction(CONTACT_FRICTION).setFrictionCombineRule(R.CoefficientCombineRule.Average)
    .setRestitution(0).setRestitutionCombineRule(R.CoefficientCombineRule.Average);
  /**
   * What `contactsOf` is reading, for the one callback Rapier is given each collider in contact
   * with the body's (`pairWith`), made once with the world: most reads refuse every pair they are
   * offered, so a read makes nothing until one is wanted. A read writes it whole before Rapier
   * calls back, and leaves it empty.
   */
  const scan: Scan = { body: null, mine: 0, wanted: undefined, pushed: null, met: null, fault: null };
  const pairWith = (theirs: number): void => {
    if (scan.fault) return;
    try { readPair(theirs); } catch (error) { scan.fault = { error }; }
  };
  const readPair = (theirs: number): void => {
    // Rapier pairs no two colliders of one body; a collider with no body is a fixed one.
    const of = bodyOf.get(theirs), other: Other = of ?? theirs, mine = scan.mine;
    // Before the pair is read: reading one makes objects of Rapier's, and most pairs are refused.
    if (scan.wanted && !scan.wanted(of ?? null)) return;
    // A fixed collider is one shape.
    const shapes = [shapeOf.get(mine)!, of ? shapeOf.get(theirs)! : 0] as const;
    const pushed = scan.pushed ??= new Map(), met = scan.met ??= new Map();
    raw.narrowPhase.contactPair(mine, theirs, raw.bodies, (manifold, flipped) => {
      let impulse = 0;
      for (let i = 0; i < manifold.numContacts(); i++) impulse += manifold.contactImpulse(i);
      // In contact is a solver contact point: the two touch, or are within the distance Rapier
      // predicts a contact over (`normalizedPredictionDistance`, 0.02 m as Rapier ships).
      const points = manifold.numSolverContacts();
      if (points === 0) return;
      // The manifold's normal runs from its first collider into its second; flipped, the first is theirs.
      const n = manifold.normal(), sign = flipped ? -1 : 1;
      const at = [0, 0, 0];
      for (let i = 0; i < points; i++) {
        const p = manifold.solverContactPoint(i)!;
        at[0] += p.x / points; at[1] += p.y / points; at[2] += p.z / points;
      }
      const seen = met.get(other) ?? { pairs: 0, point: [0, 0, 0], normal: [0, 0, 0], first: [sign * n.x, sign * n.y, sign * n.z] };
      seen.pairs += 1;
      for (let c = 0; c < 3; c++) seen.point[c]! += at[c]!;
      seen.normal[0]! += sign * n.x; seen.normal[1]! += sign * n.y; seen.normal[2]! += sign * n.z;
      met.set(other, seen);
      if (!(impulse > 0)) return;
      const sum = pushed.get(other) ?? { impulse: 0, point: [0, 0, 0], normal: [0, 0, 0], pairs: new Map() };
      // A pair's key: this body's shape, then the other's, which a body has fewer of than this.
      const key = shapes[0] * SHAPES_MOST + shapes[1];
      const pair = sum.pairs.get(key) ?? { mine: shapes[0], theirs: shapes[1], impulse: 0, point: [0, 0, 0], normal: [0, 0, 0] };
      for (const to of [sum, pair]) {
        to.impulse += impulse;
        for (let c = 0; c < 3; c++) to.point[c]! += at[c]! * impulse;
        to.normal[0]! += sign * n.x * impulse; to.normal[1]! += sign * n.y * impulse; to.normal[2]! += sign * n.z * impulse;
      }
      sum.pairs.set(key, pair);
      pushed.set(other, sum);
    });
  };
  /** A body of this world's: another engine's, or another world's, is a caller's mistake. */
  const own = (body: SegmentBody): RapierBody => {
    if (!bodies.has(body as RapierBody)) throw new Error("that body is not in this Rapier world");
    return body as RapierBody;
  };

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

  /** A collider with no body: fixed in the world, under the contract's contact. */
  const fixed = (desc: RAPIER.ColliderDesc): FixedCollider => {
    const handle = raw.createCollider(contact(desc)).handle;
    let gone = false;
    return { dispose() { if (gone || freed) return; gone = true; raw.removeCollider(raw.getCollider(handle), false); } };
  };
  /** Every body's node, from its body. */
  const writeNodes = () => {
    for (const { node, rigid } of bodies) {
      const t = rigid.translation(), r = rigid.rotation();
      node.position.set(t.x, t.y, t.z);
      (node.rotationQuaternion ??= new Quaternion()).set(r.x, r.y, r.z, r.w);
    }
  };

  const physics: RapierPhysics = {
    engine: "rapier", revision, rapier: R, get raw() { return raw; }, gravity: g,
    save() {
      // Rapier's snapshot follows a version, body/grip counts, node poses and grip handles: the solver
      // holds a pose in single precision, and a node before its first step is as it was built.
      const snapshot = raw.takeSnapshot(), poses = new Float64Array(3 + NODE_POSE * bodies.size + grips.length);
      poses[0] = -2; poses[1] = bodies.size; poses[2] = grips.length;
      let k = 3;
      for (const { node } of bodies) {
        const p = node.position, q = node.rotationQuaternion ?? Quaternion.Identity();
        poses[k++] = p.x; poses[k++] = p.y; poses[k++] = p.z;
        poses[k++] = q.x; poses[k++] = q.y; poses[k++] = q.z; poses[k++] = q.w;
      }
      for (const grip of grips) poses[k++] = grip.handle ?? -1;
      const bytes = new Uint8Array(poses.byteLength + snapshot.length);
      bytes.set(new Uint8Array(poses.buffer));
      bytes.set(snapshot, poses.byteLength);
      return bytes;
    },
    load(bytes) {
      const header = bytes.length >= 24 ? new Float64Array(bytes.slice(0, 24).buffer) : [];
      const count = header[1] ?? NaN, gripCount = header[2] ?? NaN;
      const head = 8 * (3 + NODE_POSE * count + gripCount);
      const next = header[0] === -2 && Number.isInteger(count) && count >= 0
        && Number.isInteger(gripCount) && gripCount >= 0 && head < bytes.length ? R.World.restoreSnapshot(bytes.subarray(head)) : null;
      if (!next) throw new Error("these bytes are not a Rapier world");
      const gripHandles = new Float64Array(bytes.slice(8 * (3 + NODE_POSE * count), head).buffer);
      const present = new Set(grips.flatMap((g) => g.handle === null ? [] : [g.handle]));
      const restored = new Set([...gripHandles].filter((h) => h !== -1));
      let same = next.bodies.len() === raw.bodies.len() && next.colliders.len() === raw.colliders.len()
        && count === bodies.size && gripCount === grips.length
        && restored.size === [...gripHandles].filter((h) => h !== -1).length
        && next.impulseJoints.len() - restored.size === raw.impulseJoints.len() - present.size;
      // Rapier's own set reads a handle whole; its JavaScript set reads the index alone, and takes a body made in a removed one's place for it.
      for (const body of bodies) same &&= next.bodies.raw.contains(body.rigid.handle);
      raw.impulseJoints.forEach((joint) => {
        if (!present.has(joint.handle)) same &&= !restored.has(joint.handle) && next.impulseJoints.raw.contains(joint.handle);
      });
      for (let i = 0; same && i < grips.length; i++) {
        const handle = gripHandles[i]!, grip = grips[i]!;
        if (handle === -1) continue;
        same &&= next.impulseJoints.raw.contains(handle);
        if (same) {
          const joint = next.getImpulseJoint(handle);
          same &&= joint.type() === R.JointType.Fixed && joint.body1().handle === grip.parent.rigid.handle
            && joint.body2().handle === grip.child.rigid.handle;
        }
      }
      if (!same) {
        next.free();
        throw new Error("that save is of a world with other bodies, joints or colliders");
      }
      raw.free();
      raw = next;
      moment += 1;
      joints = raw.impulseJoints.raw;
      for (const rebind of rebinds.values()) rebind();
      for (let i = 0; i < grips.length; i++) grips[i]!.handle = gripHandles[i] === -1 ? null : gripHandles[i]!;
      // A save may hold a force asked for its next step; every body's is reset after that step.
      for (const body of bodies) forced.add(body);
      const poses = new Float64Array(bytes.slice(24, 8 * (3 + NODE_POSE * count)).buffer);
      let k = 0;
      for (const { node } of bodies) {
        node.position.set(poses[k++]!, poses[k++]!, poses[k++]!);
        (node.rotationQuaternion ??= new Quaternion()).set(poses[k++]!, poses[k++]!, poses[k++]!, poses[k++]!);
      }
    },
    addBody(node, shapes, mass) {
      const q = node.rotationQuaternion ?? Quaternion.Identity();
      let rigid = raw.createRigidBody(R.RigidBodyDesc.dynamic()
        .setTranslation(node.position.x, node.position.y, node.position.z)
        .setRotation(xyzw(q))
        .setCanSleep(false));
      const colliders = shapes.map((shape, k) => {
        const handle = raw.createCollider(contact(colliderOf(shape)).setDensity(0), rigid).handle;
        shapeOf.set(handle, k);
        return handle;
      });
      let properties = mass;
      // The body's velocities as last read from Rapier, each with the moment it was read at: a read
      // crosses into the wasm and makes an object, and control reads each a few times a step. A
      // call that may change a velocity outside a step forgets them (`unread`).
      const read = { linear: new Vector3(), angular: new Vector3(), linearAt: -1, angularAt: -1 };
      const unread = () => { read.linearAt = read.angularAt = -1; };
      const setMass = (m: MassProperties) => {
        unread();
        properties = m;
        rigid.setAdditionalMassProperties(m.mass, xyz(m.centre), xyz(m.moments), xyzw(m.orientation), true);
        // Rapier applies them at its next step unless told now; an impulse before then meets none.
        rigid.recomputeMassPropertiesFromColliders();
      };
      setMass(mass);
      const handle = rigid.handle;
      const body: RapierBody = {
        node, get rigid() { return rigid; },
        linearVelocityToRef(out) {
          if (read.linearAt !== moment) { const v = rigid.linvel(); read.linear.set(v.x, v.y, v.z); read.linearAt = moment; }
          return out.copyFrom(read.linear);
        },
        angularVelocityToRef(out) {
          if (read.angularAt !== moment) { const w = rigid.angvel(); read.angular.set(w.x, w.y, w.z); read.angularAt = moment; }
          return out.copyFrom(read.angular);
        },
        applyImpulse(impulse, at) { unread(); rigid.applyImpulseAtPoint(impulse, at, true); },
        applyTorqueImpulse(impulse) { unread(); rigid.applyTorqueImpulse(impulse, true); },
        applyForce(force, at) { rigid.addForceAtPoint(force, at, true); forced.add(body); },
        applyTorque(torque) { rigid.addTorque(torque, true); forced.add(body); },
        get massProperties() { return properties; },
        setMassProperties: setMass,
        engineMass: () => rigid.mass(),
        hullVertices(k) {
          const collider = rigid.collider(k);
          if (collider.shape.type !== R.ShapeType.ConvexPolyhedron) return null;
          // A hull's collider sits at the body's origin, unturned (`colliderOf`), so its own frame is the body's.
          const vertices = collider.vertices(), out: Vec3[] = [];
          for (let i = 0; i < vertices.length; i += 3) out.push([vertices[i]!, vertices[i + 1]!, vertices[i + 2]!]);
          return out;
        },
        setFixed(fixed) { unread(); rigid.setBodyType(fixed ? R.RigidBodyType.Fixed : R.RigidBodyType.Dynamic, true); },
        gapTo(point) {
          let gap = Infinity;
          for (let k = 0; k < rigid.numColliders(); k++) {
            // Solid: a point inside a shape projects onto itself, and is told so.
            const nearest = rigid.collider(k).projectPoint(xyz(point), true);
            if (!nearest) continue;
            if (nearest.isInside) return 0;
            const p = nearest.point;
            gap = Math.min(gap, hypot(point[0] - p.x, point[1] - p.y, point[2] - p.z));
          }
          return gap;
        },
      };
      bodies.add(body);
      for (const collider of colliders) bodyOf.set(collider, body);
      rebinds.set(body, () => { rigid = raw.getRigidBody(handle); });
      colliderHandles.set(body, colliders);
      return body;
    },
    addJoint(parentBody, childBody, frames) {
      const parent = own(parentBody), child = own(childBody);
      const M = R.JointAxesMask, n = frames.limits.length;
      if (n < 1 || n > 3) throw new Error(`a joint has one to three freedoms, not ${n}`);
      const locked = M.LinX | M.LinY | M.LinZ | (n < 2 ? M.AngY : 0) | (n < 3 ? M.AngZ : 0);
      const data = R.JointData.generic(xyz(frames.anchorParent), xyz(frames.anchorChild), { x: 1, y: 0, z: 0 }, locked);
      const joint = raw.createImpulseJoint(data, parent.rigid, child.rigid, true);
      joint.setLocalFrame1(xyz(frames.anchorParent), xyzw(frames.frameParent));
      joint.setLocalFrame2(xyz(frames.anchorChild), xyzw(frames.frameChild));
      joint.setContactsEnabled(false);
      const handle = joint.handle;
      const axes = [R.JointAxis.AngX, R.JointAxis.AngY, R.JointAxis.AngZ] as const;
      frames.limits.forEach(([min, max], k) => {
        joints.jointSetLimits(handle, axes[k]! as never, min, max);
        joints.jointConfigureMotorVelocity(handle, axes[k]! as never, 0, Infinity);
        joints.jointSetMotorMaxForce(handle, axes[k]! as never, 0);
      });
      return {
        get raw() { return raw.getImpulseJoint(handle); },
        setMotor(k, speed, ceiling) {
          joints.jointConfigureMotorVelocity(handle, axes[k]! as never, speed, Infinity);
          joints.jointSetMotorMaxForce(handle, axes[k]! as never, ceiling);
        },
        setMotorBounds(k, speed, negative, positive) {
          if (!Number.isInteger(k) || k < 0 || k >= n || !Number.isFinite(speed)
            || !(negative >= 0) || !(positive >= 0)) throw new Error("invalid directional motor command");
          joints.jointConfigureMotorVelocity(handle, axes[k]! as never, speed, Infinity);
          // Rapier bounds the impulse on the parent; the contract names torque on the child.
          joints.jointSetMotorForceBounds(handle, axes[k]! as never, -positive, negative);
        },
        motorStepImpulse(k) {
          if (!Number.isInteger(k) || k < 0 || k >= n) throw new Error("invalid motor freedom");
          return -joints.jointMotorStepImpulse(handle, axes[k]! as never);
        },
      };
    },
    addGrip(parentBody, childBody, frames): EngineGrip {
      const parent = own(parentBody), child = own(childBody);
      if (parent === child) throw new Error("a grip needs two distinct bodies");
      const a = xyz(frames.anchorParent), b = xyz(frames.anchorChild);
      const qa = xyzw(frames.frameParent), qb = xyzw(frames.frameChild);
      if (![...Object.values(a), ...Object.values(b), ...Object.values(qa), ...Object.values(qb)].every(Number.isFinite)) {
        throw new Error("invalid grip frame");
      }
      const slot = { parent, child, handle: null as number | null };
      grips.push(slot);
      return {
        get attached() { return slot.handle !== null; },
        attach() {
          own(parent); own(child);
          if (!grips.includes(slot)) throw new Error("grip is disposed");
          if (slot.handle !== null) return;
          const joint = raw.createImpulseJoint(R.JointData.fixed(a, qa, b, qb), parent.rigid, child.rigid, true);
          joint.setContactsEnabled(false);
          slot.handle = joint.handle;
        },
        release() {
          if (slot.handle === null || freed) return;
          raw.removeImpulseJoint(raw.getImpulseJoint(slot.handle), true);
          slot.handle = null;
        },
        dispose() {
          this.release();
          const index = grips.indexOf(slot);
          if (index >= 0) grips.splice(index, 1);
        },
      };
    },
    addFixedBox(centre, size, turn = 0) {
      return fixed(R.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2).setTranslation(...centre)
        .setRotation({ x: 0, y: sin(turn / 2), z: 0, w: cos(turn / 2) }));
    },
    addFixedShape(shape) { return fixed(colliderOf(shape)); },
    contactsOf(segment, wanted) {
      const body = own(segment);
      if (scan.body) throw new Error("a body's contacts are read while another's are");
      scan.body = body;
      scan.wanted = wanted;
      let pushed: Scan["pushed"], met: Scan["met"], fault: Scan["fault"];
      try {
        for (const mine of colliderHandles.get(body)!) {
          scan.mine = mine;
          raw.narrowPhase.contactPairsWith(mine, pairWith);
        }
      } finally {
        pushed = scan.pushed;
        met = scan.met;
        fault = scan.fault;
        scan.body = null;
        scan.wanted = undefined;
        scan.pushed = scan.met = null;
        scan.fault = null;
      }
      if (fault) throw fault.error;
      const out: Contact[] = [];
      if (!met) return out;
      const named = (other: Other) => typeof other === "number" ? { other: null, fixed: other } : { other, fixed: null };
      /** A sum's touch: its point the impulse's mean, its normal made unit. */
      const touch = ({ impulse, point, normal }: Sum) => {
        const length = hypot(normal[0]!, normal[1]!, normal[2]!);
        return { impulse, point: [point[0]! / impulse, point[1]! / impulse, point[2]! / impulse] as Vec3,
          normal: [normal[0]! / length, normal[1]! / length, normal[2]! / length] as Vec3 };
      };
      for (const [other, sum] of pushed!) {
        const pairs = [...sum.pairs.entries()].sort((a, b) => a[0] - b[0]).map(([, pair]) => ({ mine: pair.mine, theirs: pair.theirs, ...touch(pair) }));
        out.push({ ...named(other), ...touch(sum), pairs });
      }
      for (const [other, { pairs, point, normal, first }] of met) {
        if (pushed!.has(other)) continue;
        // Pairs whose normals cancel have no mean direction: the first pair's stands.
        const length = hypot(normal[0]!, normal[1]!, normal[2]!), n = length > 0 ? normal : first, by = length > 0 ? length : 1;
        out.push({ ...named(other), impulse: 0, point: [point[0]! / pairs, point[1]! / pairs, point[2]! / pairs],
          normal: [n[0]! / by, n[1]! / by, n[2]! / by], pairs: [] });
      }
      return out;
    },
    step(dt) {
      raw.timestep = dt;
      raw.step();
      moment += 1;
      for (const { rigid } of forced) { rigid.resetForces(false); rigid.resetTorques(false); }
      forced.clear();
      writeNodes();
    },
    removeBody(segment) {
      // After the world is freed its bodies went with it.
      const body = segment as RapierBody;
      if (!bodies.delete(body) || freed) return;
      for (const handle of colliderHandles.get(body)!) { shapeOf.delete(handle); bodyOf.delete(handle); }
      colliderHandles.delete(body);
      forced.delete(body);
      rebinds.delete(body);
      for (let i = grips.length - 1; i >= 0; i--) {
        const grip = grips[i]!;
        if (grip.parent === body || grip.child === body) { grip.handle = null; grips.splice(i, 1); }
      }
      raw.removeRigidBody(body.rigid);
    },
    dispose() {
      if (freed) return;
      freed = true;
      bodies.clear();
      bodyOf.clear();
      shapeOf.clear();
      colliderHandles.clear();
      forced.clear();
      rebinds.clear();
      for (const grip of grips) grip.handle = null;
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
    return turnAboutToRef(axis.normalize(), Math.PI, new Quaternion());
  }
  const axis = Vector3.Cross(from, to);
  return new Quaternion(axis.x, axis.y, axis.z, 1 + c).normalize();
}
