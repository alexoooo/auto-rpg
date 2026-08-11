// The fight trace as `crates/lab/src/trace.rs` writes it.
//
// This file is the reader half of a two-file contract and it is deliberately
// not the worker protocol: no wasm, no ABI, no generated header. The trace
// exists so somebody can look at an articulated fight before anything else about
// it is calibrated, and it can be deleted in the commit that lands the real
// pose channel.
//
// Every number that came out of the simulation is a raw 16.16 fixed-point
// integer. Nothing in here divides one; the views do, once, at the point they
// turn a world coordinate into a pixel. That keeps exact comparisons -- "is this
// energy above the floor", "did this tip move at all" -- on the integers the
// simulation actually decided them on.

export const TRACE_SCHEMA = "arpg-fight-trace-2";

export type V3 = readonly [number, number, number];
/** `[index, generation]`, as `EntityId` is spelled on the Rust side. */
export type EntityKey = readonly [number, number];

export interface Segment {
  readonly hilt: V3;
  readonly tip: V3;
  readonly radius: number;
}

export interface ShieldFace {
  readonly centre: V3;
  readonly normal: V3;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly thickness: number;
}

export interface Region {
  readonly lower: V3;
  readonly upper: V3;
  readonly radius: number;
  readonly present: boolean;
}

export interface Arm {
  readonly hand: V3;
  /** Relative to the body origin, per `PosedArm::velocity`. */
  readonly vel: V3;
  /** Where the actuator is trying to put the hand, world space. */
  readonly target: V3;
  readonly fatigue: number;
}

export interface Pose {
  readonly id: EntityKey;
  readonly body: V3;
  /** Binary angle, 65536 to the turn. */
  readonly yaw: number;
  readonly vel: V3;
  readonly arms: readonly [Arm, Arm];
  readonly weapons: readonly [Segment | null, Segment | null];
  readonly shield: ShieldFace | null;
  readonly regions: readonly Region[];
  readonly integrity: readonly number[];
  readonly wound: readonly number[];
  readonly blood: number;
  readonly shock: number;
  readonly severed: number;
  readonly equipmentMask: number;
  readonly intent: "hold" | "attack" | "flee";
  readonly target: EntityKey | null;
  readonly hints: readonly [number, number];
}

export interface Contact {
  readonly a: EntityKey;
  readonly aSlot: number;
  readonly b: EntityKey;
  readonly bSlot: number;
  /** Index into `Trace.contactKinds`. */
  readonly kind: number;
  /** Index into `Trace.regionNames`, or `Trace.noRegion`. */
  readonly region: number;
  readonly point: V3;
  readonly normal: V3;
  readonly velocityA: V3;
  readonly velocityB: V3;
  readonly impulseA: V3;
  readonly impulseB: V3;
  readonly toi: number;
  readonly group: number;
  readonly alpha: number;
  /** Per **group**, not per contact: `closure_energy` over every collider in
   *  the time-of-impact group, bodies' own translational energy included, and
   *  copied unchanged into every row of that group. Never compare it to
   *  `contactEnergyFloor` -- use {@link share}. */
  readonly groupBefore: number;
  readonly groupAfter: number;
  readonly groupDissipated: number;
  readonly cut: number;
  readonly thrust: number;
  readonly pressure: number;
  readonly deflected: number;
  readonly severed: boolean;
}

/**
 * The energy this one contact was allocated out of its group's dissipation.
 *
 * **The only quantity `CONTACT_ENERGY_FLOOR` is charged against.** `channels()`
 * deducts the floor from this share and splits what is left between cut and
 * thrust, returning `(cut, thrust, share - cut - thrust)` -- so the three
 * published channels sum back to it exactly. Zero for weapon-weapon and
 * weapon-shield rows, which have no wound channel and pay no floor.
 */
export function share(contact: Contact): number {
  return contact.cut + contact.thrust + contact.pressure;
}

/** How fast the two colliders were closing at the fact, raw units per tick. */
export function closureSpeed(contact: Contact): number {
  return length(sub(contact.velocityA, contact.velocityB));
}

export interface Frame {
  readonly t: number;
  readonly poses: readonly Pose[];
  readonly contacts: readonly Contact[];
  /** Heroes, then Monsters. */
  readonly health: readonly [number, number];
}

export interface Carried {
  readonly action: string;
  readonly binding: string;
  readonly mass: number;
  readonly balance: number;
  readonly geometry: "segment" | "shield";
  readonly length?: number;
  readonly radius?: number;
  readonly halfWidth?: number;
  readonly halfHeight?: number;
  readonly thickness?: number;
}

export interface BodyInfo {
  readonly index: number;
  readonly kind: string;
  readonly faction: string;
  readonly anatomy: {
    readonly standingHeight: number;
    readonly shoulderHeight: number;
    readonly shoulderHalfWidth: number;
    readonly armLength: number;
    readonly handRadius: number;
  };
  readonly carried: readonly (Carried | null)[];
}

export interface Trace {
  readonly schema: string;
  /** Raw units in one world unit. 65536, carried rather than assumed. */
  readonly one: number;
  readonly scenario: string;
  readonly mirrored: boolean;
  /** Null for a mirrored run, which is a run of a different scenario. */
  readonly fingerprint: string | null;
  readonly seed: number;
  readonly script: string;
  readonly outcome: string;
  readonly timedOut: boolean;
  readonly ticks: number;
  readonly maxTicks: number;
  readonly arena: readonly [number, number];
  readonly frameCount: number;
  readonly truncated: boolean;
  readonly impactThreshold: number;
  readonly contactEnergyFloor: number;
  readonly regionNames: readonly string[];
  readonly hintNames: readonly string[];
  readonly contactKinds: readonly string[];
  readonly bodySlot: number;
  readonly noRegion: number;
  readonly bodies: readonly BodyInfo[];
  readonly frames: readonly Frame[];
}

/**
 * Indexed access that fails loudly.
 *
 * `noUncheckedIndexedAccess` is on, and the honest answer to "what if frame 4000
 * is missing" is that the file is malformed and every number after it is a lie.
 * A `?? fallback` would draw that lie.
 */
export function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error(`trace index ${index} is out of range`);
  return value;
}

export async function loadTrace(url: string): Promise<Trace> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: ${response.status} ${response.statusText}`);
  }
  const value = (await response.json()) as Trace;
  // Refused rather than adapted to. A viewer that guesses at an unknown schema
  // is the failure this whole detour exists to avoid: being shown something
  // plausible that is not what the simulation did.
  if (value.schema !== TRACE_SCHEMA) {
    throw new Error(`trace schema is ${String(value.schema)}, this page reads ${TRACE_SCHEMA}`);
  }
  if (!Array.isArray(value.frames) || value.frames.length === 0) {
    throw new Error("trace carries no frames");
  }
  return value;
}

export function add(a: V3, b: V3): V3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: V3, k: number): V3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

export function length(a: V3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

/**
 * The four corners of a shield face, in the order `shield_face` builds them.
 *
 * **The one piece of simulation geometry this page rebuilds**, mirroring
 * `crates/sim/src/combat/geometry.rs:119`. It is not published: the collider is
 * crate-private and the pose row carries the centre, the normal and the extents
 * instead. The mirror is four lines and it is drawn together with its own centre
 * and normal, so a drift shows up on screen as a rectangle that has come off its
 * own marker rather than as a quietly wrong picture.
 */
export function shieldCorners(shield: ShieldFace): readonly [V3, V3, V3, V3] {
  const front = add(shield.centre, scale(shield.normal, shield.thickness / 2 / 65536));
  const left: V3 = [-shield.normal[1], shield.normal[0], 0];
  const side = scale(left, shield.halfWidth / 65536);
  const up: V3 = [0, 0, shield.halfHeight];
  return [
    sub(sub(front, side), up),
    sub(add(front, side), up),
    add(add(front, side), up),
    add(sub(front, side), up),
  ];
}
