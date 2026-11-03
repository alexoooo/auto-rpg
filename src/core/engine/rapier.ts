import RAPIER from "@dimforge/rapier3d-simd-compat";
import { Quaternion, Vector3 } from "../math/vector.ts";
import { CONTACT_FRICTION, STANDARD_GRAVITY } from "../spec/constants.ts";
import { sourced, type Vec3 } from "../spec/quantity.ts";
import { type ColliderShape, type Contact, type ContactMaterial, type ContactManifold, type ContactPair, type ContactSink, type EngineGrip, type EngineJoint, type FixedCollider, type JointFrames, type MassProperties,
  type PhysicsEngine, type PhysicsOptions, type PhysicsWorld, type Pose, type SegmentBody } from "./engine.ts";
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
 * **A save** is each body's pose and Rapier's snapshot. The snapshot restores as a new world, so
 * the module holds handles and finds its objects again on a load (`rebinds`, `joints`). The poses
 * are in it because Rapier holds a pose in single precision: a pose the solver has written is its
 * body's, and a pose before its first step is as it was built, in double. A save names the world it
 * was made in by a digest of what the world holds as it was asked for (`worldDigest`): the snapshot
 * carries its own shapes, frictions and joints, so a save loaded into a world built otherwise would
 * bring back the other world's, and is refused.
 */
type Rapier = typeof RAPIER;

/** Vendor archive identity (`docs/reference/rapier-vendor.md`) and the adapter's snapshot contract. */
const REVISION = "rapier/adapter-12/sha256:317197f478ddd9b7a09846c1683269ed52d583e91f7f283e009e689e25e75318";

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

/** A solver profile: Rapier's coordinate angular limits and per-point contact friction, each off unless named. */
interface SolverProfile { readonly coordinateAngularLimits?: boolean; readonly pointContactFriction?: boolean }

/** Rapier with immutable limit/friction selection, its WASM loaded once. The measured profiles are in docs/reference/contact-friction.md. */
export async function loadRapier(profile: SolverProfile = {}): Promise<PhysicsEngine> {
  const { coordinateAngularLimits = false, pointContactFriction = false } = profile;
  const R = await rapierModule();
  const name = profileName(coordinateAngularLimits, pointContactFriction);
  const revision = REVISION + (coordinateAngularLimits ? "/coordinate-limits" : "") + (pointContactFriction ? "/point-friction" : "");
  return { name, revision, createPhysics: (options) => createRapierPhysics(R, options, revision, { coordinateAngularLimits, pointContactFriction }) };
}

const profileName = (coordinate: boolean, point: boolean): string => `rapier${coordinate ? "-coordinate" : ""}${point ? "-coulomb" : ""}`;

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
/**
 * How far apart, m, two shapes' bounding spheres stand beyond their radii for an overlap test of
 * them to be skipped as one that cannot meet: a margin over the single precision Rapier holds a
 * shape in. A numeric setting.
 */
const SHAPE_TEST_MARGIN = 0.01;
/** The numbers of a body's pose in a save: its position and its turn. A numeric setting. */
const SAVED_POSE = 7;

/** A save's header, in doubles: its version (`SAVE_VERSION`), the body count, the grip count and the world's digest. */
const HEADER = 4;
const SAVE_VERSION = -4;

/** A 53-bit digest of `text` (cyrb53): exact in a double, and the same in every engine. */
function digest(text: string): number {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** A contact read that finds nothing: one list, never written. */
const NONE: readonly never[] = Object.freeze([]);
/**
 * The numbers `contactsOf` keeps of each other side it meets (`OTHER` apiece): the fixed
 * collider's handle, if the side is one; how many of its manifolds have solver contacts, their
 * points and normals summed and the first normal; whether the solver pushed on it, and then the
 * impulse and the points and normals weighted by it summed. A numeric layout.
 */
const MET = { fixed: 0, pairs: 1, point: 2, normal: 5, first: 8, pushed: 11, impulse: 12, pushedPoint: 13, pushedNormal: 16 } as const;
const OTHER = 19;
/** The numbers it keeps of each pair of shapes the solver pushed on (`SHAPE_PAIR` apiece). A numeric layout. */
const PAIR = { other: 0, key: 1, mine: 2, theirs: 3, impulse: 4, point: 5, normal: 8 } as const;
const SHAPE_PAIR = 11;
/** A body's numbers in the pose read (`rbPosesAndVelocities`): translation, rotation, linear and angular velocity. A numeric layout. */
const POSE = 13;
/** A motor command's numbers (`jointSetMotors`): the joint, its axis, the kind and four values. A numeric layout. */
const MOTOR = 7;
/** The kinds of motor command `jointSetMotors` takes. */
const MOTOR_KIND = { velocity: 0, bounded: 1, spring: 2 } as const;
/** A Rapier body: the contract's, and Rapier's own for a probe of Rapier (`research/core-rapier-probe.mjs`). */
interface RapierBody extends SegmentBody {
  /** Rapier's own body: a velocity written to it is read from the next step on (`linearVelocityToRef`). */
  readonly rigid: RAPIER.RigidBody;
}
/** A body's velocities as last read from Rapier, each with the moment it was read at (`createRapierPhysics`'s `moment`). */
interface Velocities { readonly linear: Vector3; readonly angular: Vector3; linearAt: number; angularAt: number }
interface RapierJoint extends EngineJoint {
  readonly raw: RAPIER.ImpulseJoint;
}
/** A Rapier world: the contract's, and Rapier's own. The core sees only `PhysicsWorld`. */
interface RapierPhysics extends PhysicsWorld {
  readonly rapier: Rapier;
  /** Rapier's world as it is now: a load replaces it, so read it afresh. */
  readonly raw: RAPIER.World;
  addBody(pose: Pose, shapes: readonly ColliderShape[], mass: MassProperties, options?: { readonly ccd?: boolean; readonly materials?: readonly ContactMaterial[] }): RapierBody;
  addJoint(parent: SegmentBody, child: SegmentBody, frames: JointFrames): RapierJoint;
}

/** A Rapier world with the core's gravity and solver settings. */
export function createRapierPhysics(R: Rapier, { hz, gravity }: PhysicsOptions, revision = "unidentified-rapier",
  { coordinateAngularLimits = false, pointContactFriction = false }: SolverProfile = {}): RapierPhysics {
  const g: Vec3 = gravity ? [0, -STANDARD_GRAVITY.value, 0] : [0, 0, 0];
  let raw = new R.World({ x: g[0], y: g[1], z: g[2] });
  raw.integrationParameters.coordinateAngularLimits = coordinateAngularLimits;
  raw.integrationParameters.pointContactFriction = pointContactFriction;
  raw.timestep = 1 / hz;
  raw.numSolverIterations = SOLVER.iterations.value;
  raw.numInternalPgsIterations = SOLVER.pgs.value;
  /** The world's joints, which every joint's limits and motor are set through. */
  let joints = raw.impulseJoints.raw;
  const bodies = new Set<RapierBody>();
  const grips: { parent: RapierBody; child: RapierBody; handle: number | null; suppressed: boolean }[] = [];
  const jointPartners = new Map<RapierBody, Set<RapierBody>>();
  // The pinned binding invokes physics hooks only through its event-queue step path.
  const events = new R.EventQueue(true);
  /** What each body does to find its rigid body again in a world just loaded. */
  const rebinds = new Map<RapierBody, () => void>();
  /**
   * Each body collider's body, for a contact's other side, and its place among its body's shapes,
   * as `addBody` was given them, by its handle: a collider not here is a fixed one. A handle is
   * the collider's index and generation as a double's bits (little-endian, as wasm's memory is),
   * read here by those two words: a map keyed by the handle would box it at every lookup.
   */
  const owners = { body: [] as (RapierBody | undefined)[], shape: [] as number[], generation: [] as number[] };
  const handleBits = new Float64Array(1), handleWords = new Uint32Array(handleBits.buffer);
  /** The index of the collider `handle` names in `owners`, or -1 if none of its generation is there. */
  const ownerAt = (handle: number): number => {
    handleBits[0] = handle;
    const index = handleWords[0]!;
    return owners.generation[index] === handleWords[1] ? index : -1;
  };
  const bodyOf = (handle: number): RapierBody | undefined => { const at = ownerAt(handle); return at < 0 ? undefined : owners.body[at]; };
  const shapeOf = (handle: number): number => owners.shape[ownerAt(handle)]!;
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
  /** Pair exclusions are shared by discrete contacts and the continuous sweep. */
  const hooks: RAPIER.PhysicsHooks = {
    filterContactPair(a, b) {
      const first = bodyOf(a), second = bodyOf(b);
      if (first && second) {
        if (jointPartners.get(first)?.has(second)) return null;
        for (const grip of grips) if ((grip.handle !== null || grip.suppressed)
          && (grip.parent === first && grip.child === second || grip.parent === second && grip.child === first)) return null;
      }
      return R.SolverFlags.COMPUTE_IMPULSE;
    },
    filterIntersectionPair: () => true,
  };
  const enableFilter = (body: RapierBody, discrete = false) => {
    for (const handle of colliderHandles.get(body)!) {
      const collider = raw.getCollider(handle);
      collider.setActiveHooks(collider.activeHooks() | R.ActiveHooks.FILTER_CCD_PAIRS
        | (discrete ? R.ActiveHooks.FILTER_CONTACT_PAIRS : 0));
    }
  };
  /** Query the shapes themselves even while their collision pair is excluded. */
  const overlaps = (a: RapierBody, b: RapierBody): boolean => {
    for (const first of colliderHandles.get(a)!) for (const second of colliderHandles.get(b)!) {
      const contact = raw.getCollider(first).contactCollider(raw.getCollider(second), 0);
      if (contact && contact.distance <= 0) return true;
    }
    return false;
  };
  /**
   * The bodies the bulk reads list, in `bodies`' order, with their handles and their
   * colliders' handles, each body's colliders in its shapes' order; made again once a body comes
   * or goes (null). `slotOf` is each body's first collider's place among them.
   */
  let listed: { readonly bodies: readonly RapierBody[]; readonly handles: Float64Array; readonly colliders: Float64Array } | null = null;
  const slotOf = new Map<RapierBody, number>();
  const listFor = () => {
    if (listed) return listed;
    const list = [...bodies], handles = new Float64Array(list.length);
    const colliders = new Float64Array(list.reduce((n, body) => n + colliderHandles.get(body)!.length, 0));
    let k = 0;
    list.forEach((body, i) => {
      handles[i] = body.id;
      slotOf.set(body, k);
      for (const handle of colliderHandles.get(body)!) colliders[k++] = handle;
    });
    return listed = { bodies: list, handles, colliders };
  };

  /**
   * Every listed collider's contacts, read out of Rapier in one call (`contact_readings`, the
   * vendored patch's) as its narrow phase and the bodies' poses stand: a step, a load or a change
   * to a body's mass, type or presence makes them stale, and the next reader reads them again.
   */
  let contacts = new Float64Array(4096);
  let contactsFresh = false;
  // Each body's contacts and manifolds as an unfiltered read last made them: the same until the contacts are read again.
  const whole = { contacts: new Map<unknown, readonly Contact[]>(), manifolds: new Map<unknown, readonly ContactManifold[]>() };
  const readContacts = () => {
    if (contactsFresh) return;
    whole.contacts.clear(); whole.manifolds.clear();
    const { colliders } = listFor();
    const length = raw.narrowPhase.raw.contact_readings(raw.bodies.raw, colliders, contacts);
    if (length > contacts.length) {
      contacts = new Float64Array(2 * length);
      raw.narrowPhase.raw.contact_readings(raw.bodies.raw, colliders, contacts);
    }
    contactsFresh = true;
  };
  /** Whether a body's contacts are being read: a reader's `wanted` reads none itself. */
  let reading = false;
  /**
   * What `contactsOf` sums a body's contacts in, kept with the world and grown as needed: the
   * other sides it meets in the order met (`others`, each a body or null for a fixed collider, and
   * `met`), the order the solver first pushed on
   * each (`pushOrder`), and the pairs of shapes it pushed on (`shapePairs`); `order` puts one
   * side's pairs in order.
   */
  const sums = { others: [] as (RapierBody | null)[], met: new Float64Array(8 * OTHER), pushOrder: new Int32Array(8),
    shapePairs: new Float64Array(8 * SHAPE_PAIR), order: new Int32Array(8) };
  /**
   * The index of the side `other`, or the fixed collider `fixed` if it is null, among the sides met
   * so far, `count` of them: a new one is made, its sums zero.
   */
  const sideOf = (other: RapierBody | null, fixed: number, count: number, first0: number, first1: number, first2: number): number => {
    for (let i = 0; i < count; i++) if (sums.others[i] === other && (other !== null || sums.met[OTHER * i + MET.fixed] === fixed)) return i;
    if (OTHER * (count + 1) > sums.met.length) {
      const met = new Float64Array(2 * sums.met.length); met.set(sums.met); sums.met = met;
      const order = new Int32Array(2 * sums.pushOrder.length); order.set(sums.pushOrder); sums.pushOrder = order;
    }
    sums.others[count] = other;
    const o = OTHER * count;
    sums.met.fill(0, o, o + OTHER);
    sums.met[o + MET.fixed] = fixed;
    sums.met[o + MET.first] = first0; sums.met[o + MET.first + 1] = first1; sums.met[o + MET.first + 2] = first2;
    return count;
  };
  /** The index of the pair of shapes `key` on side `side` among the `count` pushed on so far: a new one is made, its sums zero. */
  const shapePairOf = (side: number, key: number, mine: number, theirs: number, count: number): number => {
    for (let i = 0; i < count; i++) {
      if (sums.shapePairs[SHAPE_PAIR * i + PAIR.other] === side && sums.shapePairs[SHAPE_PAIR * i + PAIR.key] === key) return i;
    }
    if (SHAPE_PAIR * (count + 1) > sums.shapePairs.length) {
      const pairs = new Float64Array(2 * sums.shapePairs.length); pairs.set(sums.shapePairs); sums.shapePairs = pairs;
      sums.order = new Int32Array(2 * sums.order.length);
    }
    const p = SHAPE_PAIR * count;
    sums.shapePairs.fill(0, p, p + SHAPE_PAIR);
    sums.shapePairs[p + PAIR.other] = side; sums.shapePairs[p + PAIR.key] = key;
    sums.shapePairs[p + PAIR.mine] = mine; sums.shapePairs[p + PAIR.theirs] = theirs;
    return count;
  };

  /** A push the solver gave, added at `i` of `to`: its impulse, then its point and its normal each weighted by it. */
  const push = (to: Float64Array, i: number, impulse: number, ax: number, ay: number, az: number, nx: number, ny: number, nz: number) => {
    to[i]! += impulse;
    to[i + 1]! += ax * impulse; to[i + 2]! += ay * impulse; to[i + 3]! += az * impulse;
    to[i + 4]! += nx * impulse; to[i + 5]! += ny * impulse; to[i + 6]! += nz * impulse;
  };
  /**
   * The contacts `contactsOf` summed of `sides` sides, `pushes` of them pushed on in `shapePairs`
   * pairs of shapes, told to `sink`: first what was pushed on, in the order first pushed, each its
   * point the impulse's mean and its normal made unit, and its pairs of shapes in this body's
   * shapes' order, then the other's; then what was not, its point the pairs' mean.
   */
  const tellContacts = (sides: number, pushes: number, shapePairs: number, sink: ContactSink): void => {
    const met = sums.met, s = sums.shapePairs, order = sums.order;
    for (let q = 0; q < pushes; q++) {
      const side = sums.pushOrder[q]!, other = sums.others[side] ?? null, o = OTHER * side;
      // Its pairs of shapes, by key: each key is one pair's.
      let count = 0;
      for (let p = 0; p < shapePairs; p++) {
        if (s[SHAPE_PAIR * p + PAIR.other] !== side) continue;
        let k = count++;
        for (; k > 0 && s[SHAPE_PAIR * order[k - 1]! + PAIR.key]! > s[SHAPE_PAIR * p + PAIR.key]!; k--) order[k] = order[k - 1]!;
        order[k] = p;
      }
      const impulse = met[o + MET.impulse]!, at = o + MET.pushedPoint, along = o + MET.pushedNormal;
      const length = hypot(met[along]!, met[along + 1]!, met[along + 2]!);
      sink.contact(other, other === null ? met[o + MET.fixed]! : null, impulse, met[at]! / impulse, met[at + 1]! / impulse, met[at + 2]! / impulse,
        met[along]! / length, met[along + 1]! / length, met[along + 2]! / length, count);
      for (let k = 0; k < count; k++) {
        const p = SHAPE_PAIR * order[k]!, impulse = s[p + PAIR.impulse]!;
        const length = hypot(s[p + PAIR.normal]!, s[p + PAIR.normal + 1]!, s[p + PAIR.normal + 2]!);
        sink.pair(s[p + PAIR.mine]!, s[p + PAIR.theirs]!, impulse, s[p + PAIR.point]! / impulse, s[p + PAIR.point + 1]! / impulse, s[p + PAIR.point + 2]! / impulse,
          s[p + PAIR.normal]! / length, s[p + PAIR.normal + 1]! / length, s[p + PAIR.normal + 2]! / length);
      }
    }
    for (let side = 0; side < sides; side++) {
      const o = OTHER * side;
      if (met[o + MET.pushed] === 1) continue;
      const other = sums.others[side] ?? null, pairs = met[o + MET.pairs]!;
      // Pairs whose normals cancel have no mean direction: the first pair's stands.
      const length = hypot(met[o + MET.normal]!, met[o + MET.normal + 1]!, met[o + MET.normal + 2]!);
      const n = length > 0 ? o + MET.normal : o + MET.first, by = length > 0 ? length : 1;
      sink.contact(other, other === null ? met[o + MET.fixed]! : null, 0, met[o + MET.point]! / pairs, met[o + MET.point + 1]! / pairs, met[o + MET.point + 2]! / pairs,
        met[n]! / by, met[n + 1]! / by, met[n + 2]! / by, 0);
    }
  };
  /** The contacts and manifolds told as objects (`Contact`, `ContactManifold`), into `made`, which the reader that asks takes. */
  const making = {
    contacts: [] as Contact[], manifolds: [] as ContactManifold[],
    contact(other: SegmentBody | null, fixed: number | null, impulse: number, px: number, py: number, pz: number, nx: number, ny: number, nz: number) {
      making.contacts.push({ other, fixed, impulse, point: [px, py, pz], normal: [nx, ny, nz], pairs: [] });
    },
    pair(mine: number, theirs: number, impulse: number, px: number, py: number, pz: number, nx: number, ny: number, nz: number) {
      (making.contacts[making.contacts.length - 1]!.pairs as ContactPair[]).push({ mine, theirs, impulse, point: [px, py, pz], normal: [nx, ny, nz] });
    },
    manifold(other: SegmentBody | null, fixed: number | null, mine: number, theirs: number, nx: number, ny: number, nz: number, impulse: number) {
      making.manifolds.push({ other, fixed, mine, theirs, normal: [nx, ny, nz], points: [], impulse });
    },
    point(x: number, y: number, z: number, distance: number) {
      (making.manifolds[making.manifolds.length - 1]!.points as { point: Vec3; distance: number }[]).push({ point: [x, y, z], distance });
    },
  };

  /** `body`'s manifolds as `contactManifoldsOf` reads them, told to `sink`. */
  const tellManifolds = (body: RapierBody, wanted: ((other: SegmentBody | null) => boolean) | undefined, sink: ContactSink): void => {
    if (reading) throw new Error("a body's contacts are read while another's are");
    reading = true;
    try {
        // Each collider's record in `contacts` (`contact_readings`): its pairs, each the other
        // collider, whether it is the pair's first, where the pair ends and its manifolds.
        const slot = slotOf.get(body)!, count = colliderHandles.get(body)!.length;
        for (let mine = 0; mine < count; mine++) {
          let at = contacts[slot + mine]!;
          const pairs = contacts[at++]!;
          for (let p = 0; p < pairs; p++) {
            const theirs = contacts[at]!, flipped = contacts[at + 1] === 1, end = contacts[at + 2]!, manifolds = contacts[at + 3]!;
            const other = bodyOf(theirs) ?? null;
            if (wanted && !wanted(other)) { at = end; continue; }
            at += 4;
            for (let m = 0; m < manifolds; m++) {
              const solver = contacts[at]!, sign = flipped ? -1 : 1;
              const nx = contacts[at + 1]!, ny = contacts[at + 2]!, nz = contacts[at + 3]!, impulse = contacts[at + 4]!;
              at += 5;
              if (solver === 0) continue;
              sink.manifold(other, other === null ? theirs : null, mine, other === null ? 0 : shapeOf(theirs), sign * nx, sign * ny, sign * nz, impulse, solver);
              for (let k = 0; k < solver; k++, at += 4) sink.point(contacts[at]!, contacts[at + 1]!, contacts[at + 2]!, contacts[at + 3]!);
            }
          }
        }
    } finally { reading = false; }
  };
  /** `body`'s contacts as `contactsOf` reads them, told to `sink`. */
  const tellContactsOf = (body: RapierBody, wanted: ((other: SegmentBody | null) => boolean) | undefined, sink: ContactSink): void => {
    if (reading) throw new Error("a body's contacts are read while another's are");
    reading = true;
    let sides = 0, pushes = 0, shapePairs = 0;
    try {
        const slot = slotOf.get(body)!, count = colliderHandles.get(body)!.length;
        for (let mine = 0; mine < count; mine++) {
          let at = contacts[slot + mine]!;
          const pairs = contacts[at++]!;
          for (let p = 0; p < pairs; p++) {
            // Rapier pairs no two colliders of one body; a collider with no body is a fixed one.
            const theirs = contacts[at]!, flipped = contacts[at + 1] === 1, end = contacts[at + 2]!, manifolds = contacts[at + 3]!;
            const of = bodyOf(theirs);
            if (wanted && !wanted(of ?? null)) { at = end; continue; }
            at += 4;
            // A fixed collider is one shape.
            const theirShape = of ? shapeOf(theirs) : 0;
            // The manifold's normal runs from its first collider into its second; flipped, the first is theirs.
            const sign = flipped ? -1 : 1;
            for (let m = 0; m < manifolds; m++) {
              // In contact is a solver contact point: the two touch, or are within the distance Rapier
              // predicts a contact over (`normalizedPredictionDistance`, 0.02 m as Rapier ships).
              const points = contacts[at]!, impulse = contacts[at + 4]!;
              const nx = sign * contacts[at + 1]!, ny = sign * contacts[at + 2]!, nz = sign * contacts[at + 3]!;
              at += 5;
              if (points === 0) continue;
              let ax = 0, ay = 0, az = 0;
              for (let i = 0; i < points; i++, at += 4) { ax += contacts[at]! / points; ay += contacts[at + 1]! / points; az += contacts[at + 2]! / points; }
              const side = sideOf(of ?? null, theirs, sides, nx, ny, nz);
              if (side === sides) sides++;
              const met = sums.met, o = OTHER * side;
              met[o + MET.pairs]! += 1;
              met[o + MET.point]! += ax; met[o + MET.point + 1]! += ay; met[o + MET.point + 2]! += az;
              met[o + MET.normal]! += nx; met[o + MET.normal + 1]! += ny; met[o + MET.normal + 2]! += nz;
              if (!(impulse > 0)) continue;
              if (met[o + MET.pushed] === 0) { met[o + MET.pushed] = 1; sums.pushOrder[pushes++] = side; }
              // A pair's key: this body's shape, then the other's, which a body has fewer of than this.
              const pair = shapePairOf(side, mine * SHAPES_MOST + theirShape, mine, theirShape, shapePairs);
              if (pair === shapePairs) shapePairs++;
              push(met, o + MET.impulse, impulse, ax, ay, az, nx, ny, nz);
              push(sums.shapePairs, SHAPE_PAIR * pair + PAIR.impulse, impulse, ax, ay, az, nx, ny, nz);
            }
          }
        }
      if (sides > 0) tellContacts(sides, pushes, shapePairs, sink);
    } finally {
      reading = false;
      for (let i = 0; i < sides; i++) sums.others[i] = null;
    }
  };

  /** Every listed body's pose and velocities, read out of Rapier in one call (`rbPosesAndVelocities`) after a step. */
  let poses = new Float64Array(0);
  /** Each body's velocities as last read from Rapier (`addBody`'s `read`). */
  const velocities = new Map<RapierBody, Velocities>();

  /**
   * Motor commands asked for since the joints were last set, `MOTOR` numbers each, set in one
   * call (`jointSetMotors`) in the order asked: before the step, and before anything else that
   * changes or reads the world's joints, so each joint is as the commands made one at a time
   * would have left it.
   */
  let motors = new Float64Array(MOTOR * 128);
  let motorCount = 0;
  const command = (handle: number, axis: number, kind: number, a: number, b: number, c: number, d: number) => {
    if (MOTOR * (motorCount + 1) > motors.length) { const more = new Float64Array(2 * motors.length); more.set(motors); motors = more; }
    const at = MOTOR * motorCount++;
    motors[at] = handle; motors[at + 1] = axis; motors[at + 2] = kind;
    motors[at + 3] = a; motors[at + 4] = b; motors[at + 5] = c; motors[at + 6] = d;
  };
  const setMotors = () => {
    if (motorCount === 0) return;
    joints.jointSetMotors(motors, motorCount);
    motorCount = 0;
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

  /** Each shape a body's collider has been asked whether it can take (`canChangeShape`), made once. */
  const asked = new WeakMap<ColliderShape, RAPIER.ColliderDesc>();
  /** Each Rapier shape's bounding radius about its own origin, m, found once; null for a kind not bounded here. */
  const bounds = new WeakMap<RAPIER.Shape, number | null>();
  const boundOf = (shape: RAPIER.Shape): number | null => {
    let radius = bounds.get(shape);
    if (radius !== undefined) return radius;
    switch (shape.type) {
      case R.ShapeType.Ball: radius = (shape as RAPIER.Ball).radius; break;
      case R.ShapeType.Capsule: { const capsule = shape as RAPIER.Capsule; radius = capsule.halfHeight + capsule.radius; break; }
      case R.ShapeType.Cuboid: { const h = (shape as RAPIER.Cuboid).halfExtents; radius = Math.sqrt(h.x * h.x + h.y * h.y + h.z * h.z); break; }
      case R.ShapeType.ConvexPolyhedron: {
        const v = (shape as RAPIER.ConvexPolyhedron).vertices;
        let most = 0;
        for (let i = 0; i + 2 < v.length; i += 3) most = Math.max(most, v[i]! * v[i]! + v[i + 1]! * v[i + 1]! + v[i + 2]! * v[i + 2]!);
        radius = Math.sqrt(most);
        break;
      }
      default: radius = null;
    }
    bounds.set(shape, radius);
    return radius;
  };

  /**
   * What the world holds, each as it was asked for, in the order made: every body's shapes, mass and
   * materials, every joint's frames and every grip slot by the bodies they join, every fixed
   * collider. A save names its world by their digest (`worldDigest`). A hand's shape changed, a mass
   * set or a grip taken after a body is made is state, not how the world was built.
   */
  const made = {
    bodies: new Map<RapierBody, string>(),
    joints: new Map<object, { readonly parent: RapierBody; readonly child: RapierBody; readonly asked: string }>(),
    grips: new Map<object, { readonly parent: RapierBody; readonly child: RapierBody }>(),
    fixed: new Map<number, string>(),
  };
  let named: number | null = null;
  const worldDigest = () => {
    if (named !== null) return named;
    const order = [...made.bodies.keys()], at = (body: RapierBody) => order.indexOf(body);
    return named = digest([revision, ...made.bodies.values(),
      ...[...made.joints.values()].map(({ parent, child, asked }) => `joint ${at(parent)} ${at(child)} ${asked}`),
      ...[...made.grips.values()].map(({ parent, child }) => `grip ${at(parent)} ${at(child)}`),
      ...made.fixed.values()].join("\n"));
  };

  /** A collider with no body: fixed in the world, under the contract's contact. */
  const fixed = (desc: RAPIER.ColliderDesc, asked: unknown): FixedCollider => {
    const handle = raw.createCollider(contact(desc)).handle;
    made.fixed.set(handle, JSON.stringify(["fixed", asked])); named = null;
    let gone = false;
    return { id: handle, dispose() { if (gone || freed) return; gone = true; made.fixed.delete(handle); named = null; raw.removeCollider(raw.getCollider(handle), false); } };
  };
  /** Every body's pose from its body, and its velocities as read at this moment, out of Rapier in one call. */
  const writePoses = () => {
    const { bodies: list, handles } = listFor();
    if (poses.length !== POSE * list.length) poses = new Float64Array(POSE * list.length);
    raw.bodies.raw.rbPosesAndVelocities(handles, poses);
    for (let i = 0; i < list.length; i++) {
      const body = list[i]!, pose = body.pose, read = velocities.get(body)!, at = POSE * i;
      pose.position.set(poses[at]!, poses[at + 1]!, poses[at + 2]!);
      pose.rotation.set(poses[at + 3]!, poses[at + 4]!, poses[at + 5]!, poses[at + 6]!);
      read.linear.set(poses[at + 7]!, poses[at + 8]!, poses[at + 9]!); read.linearAt = moment;
      read.angular.set(poses[at + 10]!, poses[at + 11]!, poses[at + 12]!); read.angularAt = moment;
    }
  };

  const physics: RapierPhysics = {
    engine: profileName(coordinateAngularLimits, pointContactFriction), revision, rapier: R, get raw() { setMotors(); return raw; }, gravity: g,
    save() {
      setMotors();
      // Rapier's snapshot follows a version, body/grip counts, body poses, grip handles and release exclusions: the solver
      // holds a pose in single precision, and a pose before its first step is as it was built.
      const snapshot = raw.takeSnapshot(), poses = new Float64Array(HEADER + SAVED_POSE * bodies.size + 2 * grips.length);
      poses[0] = SAVE_VERSION; poses[1] = bodies.size; poses[2] = grips.length; poses[3] = worldDigest();
      let k = HEADER;
      for (const { pose } of bodies) {
        const p = pose.position, q = pose.rotation;
        poses[k++] = p.x; poses[k++] = p.y; poses[k++] = p.z;
        poses[k++] = q.x; poses[k++] = q.y; poses[k++] = q.z; poses[k++] = q.w;
      }
      for (const grip of grips) poses[k++] = grip.handle ?? -1;
      for (const grip of grips) poses[k++] = grip.suppressed ? 1 : 0;
      const bytes = new Uint8Array(poses.byteLength + snapshot.length);
      bytes.set(new Uint8Array(poses.buffer));
      bytes.set(snapshot, poses.byteLength);
      return bytes;
    },
    load(bytes) {
      // A refused load leaves the world as it was, its motors set.
      setMotors();
      const header = bytes.length >= 8 * HEADER ? new Float64Array(bytes.slice(0, 8 * HEADER).buffer) : [];
      const count = header[1] ?? NaN, gripCount = header[2] ?? NaN;
      if (header[0] === -3) throw new Error("that save is in a format before a save named its world: make it again");
      if (header[0] === SAVE_VERSION && header[3] !== worldDigest()) throw new Error("that save has other bodies, joints or colliders, or a different physics configuration: it was made in a world built otherwise");
      const head = 8 * (HEADER + SAVED_POSE * count + 2 * gripCount);
      const next = header[0] === SAVE_VERSION && Number.isInteger(count) && count >= 0
        && Number.isInteger(gripCount) && gripCount >= 0 && head < bytes.length ? R.World.restoreSnapshot(bytes.subarray(head)) : null;
      if (!next) throw new Error("these bytes are not a Rapier world");
      const gripData = new Float64Array(bytes.slice(8 * (HEADER + SAVED_POSE * count), head).buffer);
      const gripHandles = gripData.subarray(0, gripCount), suppressed = gripData.subarray(gripCount);
      const present = new Set(grips.flatMap((g) => g.handle === null ? [] : [g.handle]));
      const restored = new Set([...gripHandles].filter((h) => h !== -1));
      let same = next.bodies.len() === raw.bodies.len() && next.colliders.len() === raw.colliders.len()
        && next.integrationParameters.coordinateAngularLimits === coordinateAngularLimits
        && next.integrationParameters.pointContactFriction === pointContactFriction
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
        same &&= (suppressed[i] === 0 || suppressed[i] === 1) && (handle === -1 || suppressed[i] === 0);
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
        throw new Error("that save has other bodies, joints or colliders, or a different physics configuration");
      }
      raw.free();
      raw = next;
      moment += 1;
      contactsFresh = false;
      joints = raw.impulseJoints.raw;
      for (const rebind of rebinds.values()) rebind();
      for (let i = 0; i < grips.length; i++) {
        grips[i]!.handle = gripHandles[i] === -1 ? null : gripHandles[i]!;
        grips[i]!.suppressed = suppressed[i] === 1;
      }
      // A save may hold a force asked for its next step; every body's is reset after that step.
      for (const body of bodies) forced.add(body);
      const poses = new Float64Array(bytes.slice(8 * HEADER, 8 * (HEADER + SAVED_POSE * count)).buffer);
      let k = 0;
      for (const { pose } of bodies) {
        pose.position.set(poses[k++]!, poses[k++]!, poses[k++]!);
        pose.rotation.set(poses[k++]!, poses[k++]!, poses[k++]!, poses[k++]!);
      }
    },
    addBody(pose, shapes, mass, { ccd = false, materials: givenMaterials = [] } = {}) {
      if (typeof ccd !== "boolean") throw new Error("CCD must be a boolean");
      const preparedMaterials = givenMaterials.map(given => {
        if (given?.friction !== undefined && !(given.friction >= 0 && Number.isFinite(given.friction))) throw new Error("a friction coefficient must be finite and nonnegative");
        return given && (given.friction === undefined ? {} : { friction: given.friction });
      });
      const q = pose.rotation;
      let rigid = raw.createRigidBody(R.RigidBodyDesc.dynamic()
        .setTranslation(pose.position.x, pose.position.y, pose.position.z)
        .setRotation(xyzw(q))
        .setCcdEnabled(ccd)
        .setCanSleep(false));
      const colliders = shapes.map((shape, k) => {
        const material = preparedMaterials[k];
        const desc = contact(colliderOf(shape)).setDensity(0);
        // Rapier combines two colliders' coefficients by the rule of the higher priority, and Max is the highest.
        if (material?.friction !== undefined) desc.setFriction(material.friction).setFrictionCombineRule(R.CoefficientCombineRule.Max);
        const handle = raw.createCollider(desc, rigid).handle;
        handleBits[0] = handle;
        owners.shape[handleWords[0]!] = k; owners.generation[handleWords[0]!] = handleWords[1]!;
        return handle;
      });
      let properties = mass;
      // The body's velocities as last read from Rapier, each with the moment it was read at: a read
      // crosses into the wasm and makes an object, and control reads each a few times a step. A
      // step reads them with the poses (`writePoses`); a call that may change a velocity outside a
      // step forgets them (`unread`).
      const read: Velocities = { linear: new Vector3(), angular: new Vector3(), linearAt: -1, angularAt: -1 };
      const unread = () => { read.linearAt = read.angularAt = -1; };
      const setMass = (m: MassProperties) => {
        unread();
        // A contact's solver points are anchored at the body's centre of mass.
        contactsFresh = false;
        properties = m;
        rigid.setAdditionalMassProperties(m.mass, xyz(m.centre), xyz(m.moments), xyzw(m.orientation), true);
        // Rapier applies them at its next step unless told now; an impulse before then meets none.
        rigid.recomputeMassPropertiesFromColliders();
      };
      setMass(mass);
      const handle = rigid.handle;
      const body: RapierBody = {
        pose, id: handle, get rigid() { return rigid; },
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
        gripping: () => grips.some(g => g.handle !== null && (g.parent === body || g.child === body)),
        canChangeShape(k, shape) {
          const handle = colliders[k];
          if (handle === undefined) throw new Error("unknown collider index");
          let desc = asked.get(shape);
          if (!desc) asked.set(shape, desc = colliderOf(shape));
          const position = new Vector3(desc.translation.x, desc.translation.y, desc.translation.z);
          const rotation = new Quaternion(desc.rotation.x, desc.rotation.y, desc.rotation.z, desc.rotation.w);
          const currentTurn = rigid.rotation(), turn = new Quaternion(currentTurn.x, currentTurn.y, currentTurn.z, currentTurn.w);
          position.applyRotationQuaternionToRef(turn, position);
          const origin = rigid.translation(); position.addInPlaceFromFloats(origin.x, origin.y, origin.z);
          turn.multiplyToRef(rotation, rotation);
          const reach = boundOf(desc.shape);
          let clear = true;
          // The new shape as the engine tests it, made at the first test and let go after the last: made, a hull is its whole hull.
          let tested = null as { shape: ReturnType<RAPIER.Shape["intoRaw"]>; at: ReturnType<typeof RAPIER.VectorOps.intoRaw>; turn: ReturnType<typeof RAPIER.RotationOps.intoRaw> } | null;
          try {
            raw.colliders.forEach(other => {
              if (!clear || bodyOf(other.handle) === body || other.isSensor()
                || hooks.filterContactPair(handle, other.handle, rigid.handle, other.parent()?.handle ?? 0) === null) return;
              // Shapes whose bounding spheres stand apart cannot meet, so only those near are tested.
              const theirs = boundOf(other.shape);
              if (reach !== null && theirs !== null) {
                const at = other.translation(), dx = at.x - position.x, dy = at.y - position.y, dz = at.z - position.z, apart = reach + theirs + SHAPE_TEST_MARGIN;
                if (dx * dx + dy * dy + dz * dz > apart * apart) return;
              }
              tested ??= { shape: desc.shape.intoRaw(), at: R.VectorOps.intoRaw(position), turn: R.RotationOps.intoRaw(rotation) };
              if (raw.colliders.raw.coIntersectsShape(other.handle, tested.shape, tested.at, tested.turn)) clear = false;
            });
          } finally {
            if (tested) { tested.shape.free(); tested.at.free(); tested.turn.free(); }
          }
          return clear;
        },
        changeShape(k, shape) {
          const handle = colliders[k];
          if (handle === undefined) throw new Error("unknown collider index");
          const desc = colliderOf(shape), collider = raw.getCollider(handle);
          collider.setShape(desc.shape);
          collider.setTranslationWrtParent(desc.translation);
          collider.setRotationWrtParent(desc.rotation);
        },
        hullVertices(k) {
          const collider = rigid.collider(k);
          if (collider.shape.type !== R.ShapeType.ConvexPolyhedron) return null;
          // A hull's collider sits at the body's origin, unturned (`colliderOf`), so its own frame is the body's.
          const vertices = collider.vertices(), out: Vec3[] = [];
          for (let i = 0; i < vertices.length; i += 3) out.push([vertices[i]!, vertices[i + 1]!, vertices[i + 2]!]);
          return out;
        },
        setFixed(fixed) { unread(); contactsFresh = false; rigid.setBodyType(fixed ? R.RigidBodyType.Fixed : R.RigidBodyType.Dynamic, true); },
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
      made.bodies.set(body, JSON.stringify(["body", shapes, mass, ccd, preparedMaterials])); named = null;
      for (const collider of colliders) owners.body[ownerAt(collider)] = body;
      rebinds.set(body, () => { rigid = raw.getRigidBody(handle); });
      colliderHandles.set(body, colliders);
      velocities.set(body, read);
      listed = null; contactsFresh = false;
      return body;
    },
    addJoint(parentBody, childBody, frames) {
      const parent = own(parentBody), child = own(childBody);
      setMotors();
      const M = R.JointAxesMask, n = frames.limits.length;
      if (n < 1 || n > 3) throw new Error(`a joint has one to three freedoms, not ${n}`);
      const locked = M.LinX | M.LinY | M.LinZ | (n < 2 ? M.AngY : 0) | (n < 3 ? M.AngZ : 0);
      const data = R.JointData.generic(xyz(frames.anchorParent), xyz(frames.anchorChild), { x: 1, y: 0, z: 0 }, locked);
      const joint = raw.createImpulseJoint(data, parent.rigid, child.rigid, true);
      made.joints.set(joint, { parent, child, asked: JSON.stringify(frames) }); named = null;
      joint.setLocalFrame1(xyz(frames.anchorParent), xyzw(frames.frameParent));
      joint.setLocalFrame2(xyz(frames.anchorChild), xyzw(frames.frameChild));
      joint.setContactsEnabled(false);
      enableFilter(parent); enableFilter(child);
      if (!jointPartners.has(parent)) jointPartners.set(parent, new Set());
      if (!jointPartners.has(child)) jointPartners.set(child, new Set());
      jointPartners.get(parent)!.add(child); jointPartners.get(child)!.add(parent);
      const handle = joint.handle;
      const axes = [R.JointAxis.AngX, R.JointAxis.AngY, R.JointAxis.AngZ] as const;
      frames.limits.forEach(([min, max], k) => {
        joints.jointSetLimits(handle, axes[k]! as never, min, max);
        joints.jointConfigureMotorVelocity(handle, axes[k]! as never, 0, Infinity);
        joints.jointSetMotorMaxForce(handle, axes[k]! as never, 0);
      });
      return {
        get raw() { setMotors(); return raw.getImpulseJoint(handle); },
        // Each motor command is set with the others before the step (`setMotors`). A velocity motor
        // is acceleration-based, Rapier's default model, with infinite damping and no stiffness.
        setMotor(k, speed, ceiling) { command(handle, axes[k]!, MOTOR_KIND.velocity, speed, ceiling, 0, 0); },
        setMotorBounds(k, speed, negative, positive) {
          if (!Number.isInteger(k) || k < 0 || k >= n || !Number.isFinite(speed)
            || !(negative >= 0) || !(positive >= 0)) throw new Error("invalid directional motor command");
          // Rapier bounds the impulse on the parent; the contract names torque on the child.
          command(handle, axes[k]!, MOTOR_KIND.bounded, speed, -positive, negative, 0);
        },
        setSpring(k, target, stiffness, negative, positive) {
          if (!Number.isInteger(k) || k < 0 || k >= n || !Number.isFinite(target) || !(stiffness > 0) || !Number.isFinite(stiffness)
            || !(negative >= 0) || !(positive >= 0)) throw new Error("invalid spring motor command");
          // Force-based, with no damping: the stiffness is N m/rad, not scaled by the bodies' inertia.
          command(handle, axes[k]!, MOTOR_KIND.spring, target, stiffness, -positive, negative);
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
      const slot = { parent, child, handle: null as number | null, suppressed: false };
      made.grips.set(slot, { parent, child }); named = null;
      enableFilter(parent); enableFilter(child, true);
      grips.push(slot);
      return {
        get attached() { return slot.handle !== null; },
        get collisionSuppressed() { return slot.handle !== null || slot.suppressed; },
        frames() {
          if (slot.handle === null) return null;
          const joint = raw.getImpulseJoint(slot.handle);
          const a = joint.anchor1(), b = joint.anchor2(), qa = joint.frameX1(), qb = joint.frameX2();
          return { anchorParent: [a.x, a.y, a.z], anchorChild: [b.x, b.y, b.z],
            frameParent: new Quaternion(qa.x, qa.y, qa.z, qa.w), frameChild: new Quaternion(qb.x, qb.y, qb.z, qb.w) };
        },
        attach(captured) {
          own(parent); own(child);
          if (!grips.includes(slot)) throw new Error("grip is disposed");
          if (slot.handle !== null) return;
          setMotors();
          const ca = captured ? xyz(captured.anchorParent) : a, cb = captured ? xyz(captured.anchorChild) : b;
          const cqa = captured ? xyzw(captured.frameParent) : qa, cqb = captured ? xyzw(captured.frameChild) : qb;
          if (![...Object.values(ca), ...Object.values(cb), ...Object.values(cqa), ...Object.values(cqb)].every(Number.isFinite)
            || cqa.x * cqa.x + cqa.y * cqa.y + cqa.z * cqa.z + cqa.w * cqa.w === 0
            || cqb.x * cqb.x + cqb.y * cqb.y + cqb.z * cqb.z + cqb.w * cqb.w === 0) throw new Error("invalid grip frame");
          const joint = raw.createImpulseJoint(R.JointData.fixed(ca, cqa, cb, cqb), parent.rigid, child.rigid, true);
          joint.setContactsEnabled(false);
          slot.handle = joint.handle;
          slot.suppressed = false;
        },
        release() {
          if (slot.handle === null || freed) return;
          setMotors();
          raw.removeImpulseJoint(raw.getImpulseJoint(slot.handle), true);
          slot.handle = null;
          slot.suppressed = overlaps(parent, child);
        },
        dispose() {
          this.release();
          slot.suppressed = false;
          const index = grips.indexOf(slot);
          if (index >= 0) grips.splice(index, 1);
          made.grips.delete(slot); named = null;
        },
      };
    },
    addFixedBox(centre, size, turn = 0) {
      return fixed(R.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2).setTranslation(...centre)
        .setRotation({ x: 0, y: sin(turn / 2), z: 0, w: cos(turn / 2) }), ["box", centre, size, turn]);
    },
    addFixedShape(shape) { return fixed(colliderOf(shape), shape); },
    contactManifoldsOf(segment, wanted) {
      const body = own(segment);
      readContacts();
      const kept = wanted ? undefined : whole.manifolds.get(body);
      if (kept) return kept;
      making.manifolds = [];
      tellManifolds(body, wanted, making);
      const made = making.manifolds.length === 0 ? NONE : making.manifolds;
      making.manifolds = [];
      if (!wanted) whole.manifolds.set(body, made);
      return made;
    },
    contactsOf(segment, wanted) {
      const body = own(segment);
      readContacts();
      const kept = wanted ? undefined : whole.contacts.get(body);
      if (kept) return kept;
      making.contacts = [];
      tellContactsOf(body, wanted, making);
      const made = making.contacts.length === 0 ? NONE : making.contacts;
      making.contacts = [];
      if (!wanted) whole.contacts.set(body, made);
      return made;
    },
    tellContacts(segment, sink) {
      readContacts();
      tellContactsOf(own(segment), undefined, sink);
    },
    tellManifolds(segment, sink) {
      readContacts();
      tellManifolds(own(segment), undefined, sink);
    },
    step(dt) {
      raw.timestep = dt;
      for (const grip of grips) if (grip.suppressed && !overlaps(grip.parent, grip.child)) grip.suppressed = false;
      setMotors();
      raw.step(events, hooks);
      moment += 1;
      contactsFresh = false;
      for (const { rigid } of forced) { rigid.resetForces(false); rigid.resetTorques(false); }
      forced.clear();
      writePoses();
    },
    removeBody(segment) {
      // After the world is freed its bodies went with it.
      const body = segment as RapierBody;
      if (!bodies.delete(body) || freed) return;
      setMotors();
      listed = null; contactsFresh = false;
      velocities.delete(body);
      slotOf.delete(body);
      made.bodies.delete(body);
      for (const [key, { parent, child }] of made.joints) if (parent === body || child === body) made.joints.delete(key);
      for (const [key, { parent, child }] of made.grips) if (parent === body || child === body) made.grips.delete(key);
      named = null;
      for (const handle of colliderHandles.get(body)!) { const at = ownerAt(handle); owners.body[at] = undefined; owners.generation[at] = -1; }
      colliderHandles.delete(body);
      forced.delete(body);
      rebinds.delete(body);
      jointPartners.delete(body);
      for (const partners of jointPartners.values()) partners.delete(body);
      for (let i = grips.length - 1; i >= 0; i--) {
        const grip = grips[i]!;
        if (grip.parent === body || grip.child === body) { grip.handle = null; grip.suppressed = false; grips.splice(i, 1); }
      }
      raw.removeRigidBody(body.rigid);
    },
    dispose() {
      if (freed) return;
      freed = true;
      bodies.clear();
      owners.body.length = owners.shape.length = owners.generation.length = 0;
      colliderHandles.clear();
      listed = null; slotOf.clear(); velocities.clear();
      motorCount = 0;
      forced.clear();
      rebinds.clear();
      for (const grip of grips) { grip.handle = null; grip.suppressed = false; }
      grips.length = 0; jointPartners.clear();
      events.free();
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
