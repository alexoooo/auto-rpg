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

export const TRACE_SCHEMA = "arpg-fight-trace-4";

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

/** One live articulated arrow. Slot plus generation is its stable identity. */
export interface Projectile {
  readonly id: EntityKey;
  readonly owner: EntityKey;
  readonly position: V3;
  readonly velocity: V3;
  readonly radius: number;
  readonly remainingRange: number;
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
  /**
   * The five columns a live fight does not have, and null is what says so.
   *
   * `ContactResolution` carries a velocity and an impulse per side and a group
   * alpha; the published 32-word event row carries none of them -- the alpha
   * because it is a solver search result, the other four because nothing had
   * asked for them when the row was frozen. A trace, which is written from the
   * whole struct, fills all five. Growing the row would move
   * `COMBAT_EVENT_LAYOUT_VERSION` and `ARTICULATED_STREAM_DIGEST`, so it belongs
   * to a session that wants them rather than to the one that noticed.
   *
   * Nullable rather than zero-filled, because a zero closing speed is a
   * measurement -- two colliders that met while moving together -- and a reader
   * cannot tell it from an absence.
   */
  readonly velocityA: V3 | null;
  readonly velocityB: V3 | null;
  readonly impulseA: V3 | null;
  readonly impulseB: V3 | null;
  readonly toi: number;
  readonly group: number;
  readonly alpha: number | null;
  /** Per **group**, not per contact: `closure_energy` over every collider in
   *  the time-of-impact group, bodies' own translational energy included, and
   *  copied unchanged into every row of that group. Never compare it to
   *  `contactEnergyFloor` -- use {@link share}. */
  readonly groupBefore: number;
  readonly groupAfter: number;
  readonly groupDissipated: number;
  readonly cut: number;
  readonly thrust: number;
  /**
   * Everything the edge and the point did not take.
   *
   * **Not purely inert, and the name is older than the mechanic.** Since
   * combat-arms-05 the sim splits this remainder again, into a *crushing*
   * channel that wounds and a residual that does not, and the event layout has
   * three channel words rather than four -- so what arrives here is
   * `crush + pressure`. A wooden club's whole blow is in this number and it
   * does real damage; a blade's is the energy floor and does none. The two
   * cannot be told apart from the published words alone, which is a known gap
   * and a layout change to close.
   */
  readonly pressure: number;
  readonly deflected: number;
  readonly severed: boolean;
}

/**
 * The energy this one contact was allocated out of its group's dissipation.
 *
 * **The only quantity `CONTACT_ENERGY_FLOOR` is charged against.** `channels()`
 * deducts the floor from this share and splits what is left between cut,
 * thrust and crush, and the publisher folds crush back into `pressure` -- so
 * the three published channels still sum back to the share exactly, which is
 * what makes this function correct and what keeps a crushing blow's ring the
 * size the blow actually was. Zero for weapon-weapon and weapon-shield rows,
 * which have no wound channel and pay no floor.
 */
export function share(contact: Contact): number {
  return contact.cut + contact.thrust + contact.pressure;
}

/**
 * How fast the two colliders were closing at the fact, raw units per tick, or
 * null when the source did not publish the two velocities.
 */
export function closureSpeed(contact: Contact): number | null {
  const { velocityA, velocityB } = contact;
  if (velocityA === null || velocityB === null) return null;
  return length(sub(velocityA, velocityB));
}

export interface Frame {
  readonly t: number;
  readonly poses: readonly Pose[];
  readonly projectiles: readonly Projectile[];
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
  /**
   * What drove each side.
   *
   * Schema 2 carried one `script`, because until v2-19 every trace put the same
   * script on both bodies. A learned fight has a checkpoint on the Fighter and a
   * script on the Brute, and a header that named only one of them would leave a
   * reader to guess which -- so both are published and the schema moved rather
   * than the field quietly changing meaning.
   */
  readonly heroes: string;
  readonly monsters: string;
  /** SHA-256 of the checkpoint that drove the learned side, or null. */
  readonly checkpoint: string | null;
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

/**
 * There is no recording at this URL, which is not the same as a broken one.
 *
 * Recorded fights are a development fixture -- `.gitignore` excludes
 * `web/fight*.json`, `npm run trace` writes them, and the production bundle
 * carries none of them -- so "absent" is the *expected* answer in a shipped
 * build and in a fresh clone alike. A viewer that reported it the way it
 * reports a corrupt file would tell a reader the application is broken when it
 * is not, which is why absence is a type here rather than one more message a
 * caller has to pattern-match a string out of.
 */
export class TraceUnavailable extends Error {
  /** The status that carried the refusal; 200 when a host answered with a page. */
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** The file is a trace, but not one this reader knows how to read. */
export class TraceSchemaMismatch extends Error {}

export async function loadTrace(url: string, signal: AbortSignal): Promise<Trace> {
  // The signal reaches the network stack rather than only a flag, because this
  // is an 8-9 MB body: a reader who leaves the arena one second in would
  // otherwise go on downloading a fight for a route that no longer exists, and
  // a second visit inside that window would run a second download beside it.
  const response = await fetch(url, { signal });
  if (response.status === 404) {
    throw new TraceUnavailable(`${url}: ${response.status} ${response.statusText}`, 404);
  }
  // A host that rewrites unknown paths to its own index page reports the same
  // absence as 200 and an HTML body -- `vite preview` does it, and so does most
  // static hosting. Read as a parse failure it would blame a missing file for
  // being corrupt; read here as what it is, it reaches the same explanation a
  // 404 does.
  if (response.ok && (response.headers.get("content-type") ?? "").includes("html")) {
    throw new TraceUnavailable(
      `${url}: the server answered with a page rather than a recording`, response.status,
    );
  }
  if (!response.ok) {
    throw new Error(`${url}: ${response.status} ${response.statusText}`);
  }
  const value = (await response.json()) as Trace;
  // Refused rather than adapted to. A viewer that guesses at an unknown schema
  // is the failure this whole detour exists to avoid: being shown something
  // plausible that is not what the simulation did.
  if (value.schema !== TRACE_SCHEMA) {
    throw new TraceSchemaMismatch(
      `trace schema is ${String(value.schema)}, this page reads ${TRACE_SCHEMA}`,
    );
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
