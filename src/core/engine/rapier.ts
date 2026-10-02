import RAPIER from "@dimforge/rapier3d-simd-compat";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { STANDARD_GRAVITY } from "../spec/constants.ts";
import { sourced, type Vec3 } from "../spec/quantity.ts";
import { CONTACT_FRICTION, type ColliderShape, type Contact, type EngineJoint, type FixedCollider, type JointFrames, type MassProperties,
  type PhysicsEngine, type PhysicsOptions, type PhysicsWorld, type SegmentBody } from "./engine.ts";
import { sin, cos, hypot } from "../math/real.ts";
import { turnAboutToRef } from "../math/turn.ts";

/**
 * **The core's physics engine: Rapier**, the SIMD build of its WebAssembly (`@dimforge/rapier3d-simd-compat`,
 * the owner's choice after the bake-off, `owner-physics-engine`), meeting the contract of `engine.ts`.
 * The compat build carries its wasm inline, so a browser and Node load it alike (`loadRapier`).
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
  return { name: "rapier", createPhysics: (options) => createRapierPhysics(R, options) };
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

/** The numbers of a node's pose in a save: its position and its turn. A numeric setting. */
const NODE_POSE = 7;

/** A Rapier body: the contract's, and Rapier's own for a probe of Rapier (`research/core-rapier-probe.mjs`). */
interface RapierBody extends SegmentBody {
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
export function createRapierPhysics(R: Rapier, { hz, gravity }: PhysicsOptions): RapierPhysics {
  const g: Vec3 = gravity ? [0, -STANDARD_GRAVITY.value, 0] : [0, 0, 0];
  let raw = new R.World({ x: g[0], y: g[1], z: g[2] });
  raw.timestep = 1 / hz;
  raw.numSolverIterations = SOLVER.iterations.value;
  raw.numInternalPgsIterations = SOLVER.pgs.value;
  /** The world's joints, which every joint's limits and motor are set through. */
  let joints = raw.impulseJoints.raw;
  const bodies = new Set<RapierBody>();
  /** What each body does to find its rigid body again in a world just loaded. */
  const rebinds = new Map<RapierBody, () => void>();
  /** Each body by its rigid body's handle, for a contact's other side. */
  const byHandle = new Map<number, RapierBody>();
  /** The bodies given a force or a moment for the next step: Rapier keeps one until it is reset. */
  const forced = new Set<RapierBody>();
  let freed = false;
  const xyz = (v: Vec3) => ({ x: v[0], y: v[1], z: v[2] });
  const xyzw = (q: Quaternion) => ({ x: q.x, y: q.y, z: q.z, w: q.w });
  /** The contract's contact: its friction, averaged, and no bounce. */
  const contact = (desc: RAPIER.ColliderDesc): RAPIER.ColliderDesc => desc
    .setFriction(CONTACT_FRICTION).setFrictionCombineRule(R.CoefficientCombineRule.Average)
    .setRestitution(0).setRestitutionCombineRule(R.CoefficientCombineRule.Average);
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
    engine: "rapier", rapier: R, get raw() { return raw; }, gravity: g,
    save() {
      // Rapier's snapshot, after the count of bodies and each node's pose as it stands: the solver
      // holds a pose in single precision, and a node before its first step is as it was built.
      const snapshot = raw.takeSnapshot(), poses = new Float64Array(1 + NODE_POSE * bodies.size);
      poses[0] = bodies.size;
      let k = 1;
      for (const { node } of bodies) {
        const p = node.position, q = node.rotationQuaternion ?? Quaternion.Identity();
        poses[k++] = p.x; poses[k++] = p.y; poses[k++] = p.z;
        poses[k++] = q.x; poses[k++] = q.y; poses[k++] = q.z; poses[k++] = q.w;
      }
      const bytes = new Uint8Array(poses.byteLength + snapshot.length);
      bytes.set(new Uint8Array(poses.buffer));
      bytes.set(snapshot, poses.byteLength);
      return bytes;
    },
    load(bytes) {
      const count = bytes.length >= 8 ? new Float64Array(bytes.slice(0, 8).buffer)[0]! : NaN;
      const head = 8 * (1 + NODE_POSE * count);
      const next = Number.isInteger(count) && count >= 0 && head < bytes.length ? R.World.restoreSnapshot(bytes.subarray(head)) : null;
      if (!next) throw new Error("these bytes are not a Rapier world");
      let same = next.bodies.len() === raw.bodies.len() && next.colliders.len() === raw.colliders.len()
        && next.impulseJoints.len() === raw.impulseJoints.len();
      // Rapier's own set reads a handle whole; its JavaScript set reads the index alone, and takes a body made in a removed one's place for it.
      for (const body of bodies) same &&= next.bodies.raw.contains(body.rigid.handle);
      if (!same) {
        next.free();
        throw new Error("that save is of a world with other bodies, joints or colliders");
      }
      raw.free();
      raw = next;
      joints = raw.impulseJoints.raw;
      for (const rebind of rebinds.values()) rebind();
      // A save may hold a force asked for its next step; every body's is reset after that step.
      for (const body of bodies) forced.add(body);
      const poses = new Float64Array(bytes.slice(8, head).buffer);
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
      for (const shape of shapes) raw.createCollider(contact(colliderOf(shape)).setDensity(0), rigid);
      let properties = mass;
      const setMass = (m: MassProperties) => {
        properties = m;
        rigid.setAdditionalMassProperties(m.mass, xyz(m.centre), xyz(m.moments), xyzw(m.orientation), true);
        // Rapier applies them at its next step unless told now; an impulse before then meets none.
        rigid.recomputeMassPropertiesFromColliders();
      };
      setMass(mass);
      const handle = rigid.handle;
      const body: RapierBody = {
        node, get rigid() { return rigid; },
        linearVelocityToRef(out) { const v = rigid.linvel(); return out.set(v.x, v.y, v.z); },
        angularVelocityToRef(out) { const w = rigid.angvel(); return out.set(w.x, w.y, w.z); },
        applyImpulse(impulse, at) { rigid.applyImpulseAtPoint(impulse, at, true); },
        applyTorqueImpulse(impulse) { rigid.applyTorqueImpulse(impulse, true); },
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
        setFixed(fixed) { rigid.setBodyType(fixed ? R.RigidBodyType.Fixed : R.RigidBodyType.Dynamic, true); },
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
      byHandle.set(handle, body);
      rebinds.set(body, () => { rigid = raw.getRigidBody(handle); });
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
      };
    },
    addFixedBox(centre, size, turn = 0) {
      return fixed(R.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2).setTranslation(...centre)
        .setRotation({ x: 0, y: sin(turn / 2), z: 0, w: cos(turn / 2) }));
    },
    addFixedShape(shape) { return fixed(colliderOf(shape)); },
    contactsOf(segment) {
      const body = own(segment);
      const touched = new Map<RapierBody, { impulse: number; point: number[]; normal: number[] }>();
      for (let k = 0; k < body.rigid.numColliders(); k++) {
        const mine = body.rigid.collider(k);
        raw.contactPairsWith(mine, (theirs) => {
          // Rapier pairs no two colliders of one body; a fixed collider has no body of ours.
          const parent = theirs.parent(), other = parent ? byHandle.get(parent.handle) : undefined;
          if (!other) return;
          raw.contactPair(mine, theirs, (manifold, flipped) => {
            let impulse = 0;
            for (let i = 0; i < manifold.numContacts(); i++) impulse += manifold.contactImpulse(i);
            const points = manifold.numSolverContacts();
            if (!(impulse > 0) || points === 0) return;
            // The manifold's normal runs from its first collider into its second; flipped, the first is theirs.
            const n = manifold.normal(), sign = flipped ? -1 : 1;
            const at = [0, 0, 0];
            for (let i = 0; i < points; i++) {
              const p = manifold.solverContactPoint(i)!;
              at[0] += p.x / points; at[1] += p.y / points; at[2] += p.z / points;
            }
            const sum = touched.get(other) ?? { impulse: 0, point: [0, 0, 0], normal: [0, 0, 0] };
            sum.impulse += impulse;
            for (let c = 0; c < 3; c++) sum.point[c]! += at[c]! * impulse;
            sum.normal[0]! += sign * n.x * impulse; sum.normal[1]! += sign * n.y * impulse; sum.normal[2]! += sign * n.z * impulse;
            touched.set(other, sum);
          });
        });
      }
      const out: Contact[] = [];
      for (const [other, { impulse, point, normal }] of touched) {
        const length = hypot(normal[0]!, normal[1]!, normal[2]!);
        out.push({ other, impulse, point: [point[0]! / impulse, point[1]! / impulse, point[2]! / impulse],
          normal: [normal[0]! / length, normal[1]! / length, normal[2]! / length] });
      }
      return out;
    },
    step(dt) {
      raw.timestep = dt;
      raw.step();
      for (const { rigid } of forced) { rigid.resetForces(false); rigid.resetTorques(false); }
      forced.clear();
      writeNodes();
    },
    removeBody(segment) {
      // After the world is freed its bodies went with it.
      const body = segment as RapierBody;
      if (!bodies.delete(body) || freed) return;
      byHandle.delete(body.rigid.handle);
      forced.delete(body);
      rebinds.delete(body);
      raw.removeRigidBody(body.rigid);
    },
    dispose() {
      if (freed) return;
      freed = true;
      bodies.clear();
      byHandle.clear();
      forced.clear();
      rebinds.clear();
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
