import { predictIntercept } from "../control/whole-body/intercept.ts";
import { Vector3, type Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import type { BodyView } from "../body.ts";
import { rigidPoints } from "../build/rigid.ts";
import { hypot } from "../math/real.ts";
import { aimOf } from "../skills/strikes/held-strike.ts";
import { fistOn, frameOf, segmentOf, strikersOf, type BodySpec } from "../spec/body.ts";
import { effectorAim } from "../control/effectors.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { dot, sub } from "../spec/vec.ts";
import type { Cover } from "../intent/intent.ts";
import type { BodySense } from "../mind/senses.ts";
import { lieBy, type Position } from "../control/ground-reading.ts";

/**
 * **What counts as a threat**: a foe's striking point within `within` m of the head and closing
 * on it at over `closing` m/s. Set: `docs/reference/blows.md#threat`.
 */
export const THREAT: Threat = Object.freeze({ within: 1.5, closing: 2 });

/**
 * **What a ward covers** (`threatOf` with `hold`): a foe's striking point within `within` m of the
 * body however slowly it closes, so the cover stands between the foe's weapon and the body before
 * any blow begins: 2 m, an arm and a short blade with a step to spare.
 */
const WARD: Threat = Object.freeze({ within: 2, closing: -Infinity });

/** A blow predicted to land (`threatOf`): a threat's striking point crossing the plane `out` m ahead of the head within `horizon` s. */
const PREDICTION = Object.freeze({ out: .2, horizon: .4 });

/**
 * How a threat is read (`threatOf`): what counts as one; with `prediction`, its predicted crossing;
 * with `body`, the body's axis guarded in place of the head; with `hold`, a point with no
 * crossing covered where it is.
 */
interface ThreatReading {
  readonly counts: Threat;
  readonly prediction?: { readonly out: number; readonly horizon: number };
  readonly body?: boolean;
  readonly hold?: boolean;
}

/** The readings minds use: the threat as it stands, its predicted contact on the head or on the body, and the weapon warded off. */
export const READINGS = Object.freeze({
  threat: Object.freeze({ counts: THREAT }),
  predicted: Object.freeze({ counts: THREAT, prediction: PREDICTION }),
  body: Object.freeze({ counts: THREAT, prediction: PREDICTION, body: true }),
  ward: Object.freeze({ counts: WARD, prediction: PREDICTION, body: true, hold: true }),
}) satisfies Readonly<Record<string, ThreatReading>>;

/** What counts as a threat (`THREAT`). */
interface Threat {
  readonly within: number;
  readonly closing: number;
}

/** A limb a threat is read from, and the point it strikes with in its own frame. */
interface Striking { readonly limb: string; readonly local: Vec3 }

/**
 * **What a blow of a body of `spec` is read from**: each limb it strikes with (`strikersOf`) but
 * the feet it stands on, whose steps are no blow (a human's hands, a reptile's mouth), and the point
 * each strikes with, in its own frame: a hand's aim (`aimOf`: what it holds, else its knuckles),
 * another limb's (`effectorAim`). A limb with no such point is left out.
 */
function strikingPoints(spec: BodySpec): readonly Striking[] {
  const feet = (spec.ends ?? []).flatMap((end) => end.kind === "foot" ? [end.segment] : []);
  return strikersOf(spec).filter((limb) => !feet.includes(limb)).flatMap((limb): Striking[] => {
    const segment = segmentOf(spec, limb), hand = fistOn(spec, "left") === limb ? "left" : fistOn(spec, "right") === limb ? "right" : null;
    const at = segment && rigidPoints(spec, segment).get(hand ? aimOf(spec, hand) : effectorAim(spec, limb));
    if (!segment || !at) return [];
    const { origin, x, y, z } = frameOf(segment), from = sub(at.value, origin);
    return [{ limb, local: [dot(from, x), dot(from, y), dot(from, z)] }];
  });
}

/** Each spec's striking points, found once: a spec is immutable, and so is what is read from it. */
const STRIKING = new WeakMap<BodySpec, readonly Striking[]>();

/** The vectors a threat reading works in, which carry nothing between calls. */
interface ThreatWork { readonly point: Vector3; readonly velocity: Vector3; readonly lever: Vector3 }

/** A mind's own threat readings (`threatOf`, `incomingThreat`), working in vectors no other mind shares. */
/** What a threat is read from (`threatOf`): the body's senses, its head and its centre of mass. */
interface ThreatView {
  readonly senses: BodyView["senses"];
  readonly head: BodyView["head"];
  readonly stance: Pick<BodyView["stance"], "centre">;
}

export function threatReader() {
  const work: ThreatWork = { point: new Vector3(), velocity: new Vector3(), lever: new Vector3() };
  return {
    threatOf: (view: ThreatView, reading: ThreatReading = READINGS.threat) => threatOf(view, work, reading)?.cover ?? null,
    /** The threat (`threatOf`), with the speed its striking point closes on the head at, m/s, its time to contact, s, and whose limb it is. */
    blowOf: (view: ThreatView, reading: ThreatReading = READINGS.threat) => threatOf(view, work, reading),
    incomingThreat: (view: BodyView, ownVelocity: Vec3, counts?: Threat) => incomingThreat(view, ownVelocity, work, counts),
  };
}

/**
 * **What a foe's body is doing**, read from what is sensed of it: striking, a blow of its predicted
 * to reach the head (`READINGS.predicted`); down by its spec's rule (`BodySense.down`), and rising,
 * down with its centre of mass going up faster than `RISING`; else clear. What a profile's cells are
 * indexed by (`ProfileCell.phase`).
 */
export type FoePhase = "striking" | "down" | "rising" | "clear";

/** Where `local` (a direction in a segment's own frame) points now, by its turn `rotation`, world: its y. */
const upOf = (rotation: Quaternion, local: Vec3): number =>
  new Vector3(local[0], local[1], local[2]).applyRotationQuaternionToRef(rotation, SCRATCH).y;
const SCRATCH = new Vector3();

/**
 * **A sensed body's posture** (`Position`'s names): standing while it is not down; down, how it
 * lies by its root (`marks.base`, `lieBy`): its reference forward and left carried into its root's
 * frame (`frameOf`) and turned as the root is turned now; between where its root is not sensed.
 */
export function sensedPosture(other: BodySense): Position {
  if (!other.down) return "standing";
  const base = segmentOf(other.spec, other.spec.marks.base), rotation = other.segments.get(other.spec.marks.base)?.rotation;
  if (!base || !rotation) return "between";
  const { x, y, z } = frameOf(base);
  return lieBy(upOf(rotation, [x[2], y[2], z[2]]), upOf(rotation, [-x[0], -y[0], -z[0]]));
}

/** How fast a fallen body's centre of mass goes up for it to read as rising, m/s. */
const RISING = 0.2;

/** The phase (`FoePhase`) of `focus`, `blow` the blow predicted to reach the head (`blowOf`); clear with no focus. */
export function foePhase(focus: BodySense | null, blow: ReturnType<ReturnType<typeof threatReader>["blowOf"]>): FoePhase {
  if (!focus) return "clear";
  if (focus.down) return focus.velocity.y > RISING ? "rising" : "down";
  return blow?.foe.id === focus.id ? "striking" : "clear";
}

/**
 * **The phase of the body `focus` names to a body that senses as `view` does** (`foePhase`, the
 * blow predicted, `READINGS.predicted`): the rule a reader outside the mind reads it by, a drill's
 * record of where its strike began.
 */
export function sensedPhase(view: ThreatView, focus: string): FoePhase {
  return foePhase(view.senses.others.find((other) => other.id === focus) ?? null, threatReader().blowOf(view, READINGS.predicted));
}

/**
 * The cover a body's senses ask for: of every other side's body still in the fight, the point
 * of each limb it strikes with (`strikingPoints`: a hand's aim, a reptile's mouth; placed by the
 * limb's sensed frame, moving with its sensed velocity and spin) that closes fastest on this body's
 * head, if it is a threat (`counts`:
 * `THREAT`, unless an experiment passes another); guarded, the head. Null with none. The closing
 * speed is the point's own toward the head as the head stands. What is sensed is as old as the
 * senses' delay, and nothing here corrects for it. With `prediction`, a constant-velocity
 * crossing of the plane ahead of the head replaces the current point; a threat already inside
 * the plane is covered immediately. No crossing in the horizon means no candidate. With `body`, what
 * is guarded against each point is not the head but the point of the body's axis, from its centre
 * of mass to its head, nearest it, so a blow at the trunk or an arm is read as one at the head is.
 * With `hold`, a point the prediction finds no crossing for is covered where it is. Its time to
 * contact is the crossing's, or with none its distance at its closing speed.
 */
function threatOf(view: ThreatView, { point, velocity, lever }: ThreatWork,
  { counts, prediction, body = false, hold = false }: ThreatReading): { cover: Cover; closing: number; seconds: number; foe: BodySense; limb: string } | null {
  const { senses, head } = view;
  let threat: Vec3 | null = null, guarded: Vec3 | null = null, fastest = counts.closing, soon = Infinity, by: { foe: BodySense; limb: string } | null = null;
  for (const other of senses.others) {
    if (other.side === senses.side || other.out) continue;
    let striking = STRIKING.get(other.spec);
    if (!striking) STRIKING.set(other.spec, striking = strikingPoints(other.spec));
    for (let k = 0; k < striking.length; k++) {
      const { limb, local } = striking[k]!, sensed = other.segments.get(limb);
      if (!sensed) continue;
      point.set(local[0], local[1], local[2]).applyRotationQuaternionToRef(sensed.rotation, point).addInPlace(sensed.position);
      // The point moves with the hand's centre of mass, and with its spin about that centre.
      point.subtractToRef(sensed.centre, lever);
      Vector3.CrossToRef(sensed.spin, lever, velocity).addInPlace(sensed.velocity);
      const at = body ? axisPoint(view.stance.centre, head, point) : [head.x, head.y, head.z] as const;
      const dx = point.x - at[0], dy = point.y - at[1], dz = point.z - at[2], far = hypot(dx, dy, dz);
      if (far > counts.within || far === 0) continue;
      const closing = -(dx * velocity.x + dy * velocity.y + dz * velocity.z) / far;
      if (closing <= fastest) continue;
      let candidate: Vec3 = [point.x, point.y, point.z], seconds = far / closing;
      if (prediction && far > prediction.out) {
        const normal: Vec3 = [dx / far, dy / far, dz / far];
        const crossing = predictIntercept({ time: senses.time, position: candidate, velocity: [velocity.x, velocity.y, velocity.z] },
          [0, 0, 0], { normal, point: [at[0] + normal[0] * prediction.out, at[1] + normal[1] * prediction.out,
            at[2] + normal[2] * prediction.out] }, senses.time, prediction.horizon);
        if (crossing) { candidate = crossing.position; seconds = crossing.seconds; }
        else if (!hold) continue;
      }
      fastest = closing; soon = seconds; threat = candidate; guarded = [at[0], at[1], at[2]]; by = { foe: other, limb };
    }
  }
  return threat && guarded && by && { cover: { threat, guarded }, closing: fastest, seconds: soon, ...by };
}

/** The point of the segment from `from` to `to` nearest `point`. */
function axisPoint(from: { readonly x: number; readonly y: number; readonly z: number }, to: { readonly x: number; readonly y: number; readonly z: number }, point: Vector3): readonly [number, number, number] {
  const ax = to.x - from.x, ay = to.y - from.y, az = to.z - from.z, length = ax * ax + ay * ay + az * az;
  const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((point.x - from.x) * ax + (point.y - from.y) * ay + (point.z - from.z) * az) / length));
  return [from.x + t * ax, from.y + t * ay, from.z + t * az];
}

/** Predictive defense search cells, the reference cover's plane among them: `docs/reference/combat-defense.md#settings`. */
const DEFENSE = Object.freeze({ out: .3, horizon: .3, speed: 3, reserve: .08, minimum: .05 });

/** Detached constant-motion threat, corrected for sample age and the guarded point's own motion. */
function incomingThreat(view: BodyView, ownVelocity: Vec3, { point, velocity, lever }: ThreatWork, counts: Threat = THREAT) {
  let best: { cover: Cover; seconds: number; closing: number; foe: string; limb: string } | null = null;
  for (const foe of view.senses.others) {
    if (foe.side === view.senses.side || foe.out) continue;
    let striking = STRIKING.get(foe.spec);
    if (!striking) STRIKING.set(foe.spec, striking = strikingPoints(foe.spec));
    for (let k = 0; k < striking.length; k++) {
      const { limb, local } = striking[k]!, sensed = foe.segments.get(limb);
      if (!sensed) continue;
      point.set(...local).applyRotationQuaternionToRef(sensed.rotation, point).addInPlace(sensed.position);
      point.subtractToRef(sensed.centre, lever); Vector3.CrossToRef(sensed.spin, lever, velocity).addInPlace(sensed.velocity);
      const age = Math.max(0, view.time - (foe.time ?? view.time));
      const position: Vec3 = [point.x + age * velocity.x, point.y + age * velocity.y, point.z + age * velocity.z];
      const relative: Vec3 = [velocity.x - ownVelocity[0], velocity.y - ownVelocity[1], velocity.z - ownVelocity[2]];
      const dx = position[0] - view.head.x, dy = position[1] - view.head.y, dz = position[2] - view.head.z, far = hypot(dx, dy, dz);
      if (far === 0 || far > counts.within) continue;
      const closing = -(dx * relative[0] + dy * relative[1] + dz * relative[2]) / far;
      if (closing <= counts.closing) continue;
      const speedSquared = relative[0] * relative[0] + relative[1] * relative[1] + relative[2] * relative[2];
      const inward = dx * relative[0] + dy * relative[1] + dz * relative[2], offset = far * far - DEFENSE.out * DEFENSE.out;
      const discriminant = inward * inward - speedSquared * offset;
      if (discriminant < 0) continue;
      const seconds = offset <= 0 ? 0 : offset / (-inward + Math.sqrt(discriminant));
      if (seconds > DEFENSE.horizon || (best && seconds >= best.seconds)) continue;
      const threat: Vec3 = [position[0] + seconds * velocity.x, position[1] + seconds * velocity.y, position[2] + seconds * velocity.z];
      const guarded: Vec3 = [view.head.x + seconds * ownVelocity[0], view.head.y + seconds * ownVelocity[1], view.head.z + seconds * ownVelocity[2]];

      best = { cover: { threat, guarded, seconds: Math.max(DEFENSE.minimum, seconds) }, seconds, closing, foe: foe.id, limb };
    }
  }
  return best;
}
