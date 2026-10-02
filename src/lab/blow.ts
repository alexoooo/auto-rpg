import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body } from "../core/body.ts";
import type { BuiltSegment } from "../core/build/build-body.ts";
import type { Hand } from "../core/control/motor.ts";
import { GUARD_ACTION, type Intent } from "../core/mind/intent.ts";
import type { Tactics } from "../core/mind/tactics.ts";
import type { SkillReport } from "../core/skills/skills.ts";
import { STAND } from "../core/skills/strike.ts";
import { heldIn, type Strike, type StrikeWindow } from "../core/skills/strikes.ts";
import type { Vec3 } from "../core/spec/quantity.ts";
import type { Actor } from "./actor.ts";

/**
 * **One blow, thrown standing**: the rig the strike searches throw their blows on
 * (`research/core-strike.mjs`, `research/core-club-strike.mjs`), and the lab's Blow scenario
 * (`blow-scenario.ts`) with them. A core human (`src/core/body.ts`), driven by tactics that attack
 * once (`attackOnce`), throws `strike` through the strike skill (`src/core/skills/strike.ts`), the
 * skill's repertoire being that one strike: it stands in the guard `STAND` seconds where it was
 * built, facing +z, holds the strike's chamber, then pushes. Every freedom not pushed is servoed to
 * the guard or the chamber, and the legs are the stance's throughout. Every torque is a muscle's,
 * the legs' included, so a blow is thrown from the feet: the trunk turns against a body standing
 * on the ground, not a pelvis held still.
 *
 * A search's candidate is thrown exactly as the game's body throws the recipe it becomes: through
 * the same path from tactics to skill, so nothing is searched that the game does not run.
 */

/**
 * **Tactics that attack once**: `hand` attacks `target` (world) until the skills report the strike
 * thrown, then guards. `target` is read from the head each step until `time`, s, is `STAND`, then held: the
 * searches place their target from the head as the body stands then, after it has settled a few
 * centimetres forward and down from the pose it was built in.
 */
function attackOnce(hand: Hand, target: (head: Vector3) => Vec3, time: () => number): Tactics {
  let aim: Vec3 | null = null;
  const guarding: Intent = { move: null, face: 0, hands: { left: GUARD_ACTION, right: GUARD_ACTION } };
  return {
    name: "attack once",
    decide({ view, report }) {
      if (!aim || time() < STAND) aim = target(view.head);
      if (report.strike.thrown[hand] > 0) return guarding;
      return { ...guarding, hands: { ...guarding.hands, [hand]: { kind: "attack", target: aim } } };
    },
  };
}

export interface ThrownBlow {
  readonly body: Body;
  /** What its skills report: whether a blow is being thrown, or has been, is read here and not from the clock. */
  readonly report: SkillReport;
  /** When the pushes begin, s from the start. */
  readonly pushing: number;
  /** The control steps taken, s. */
  readonly time: number;
  dispose(): void;
}

/**
 * An experiment's window: its target is read from the head until the blow begins, so it stands at
 * the recipe's place but for rounding, which a centimetre each way holds.
 */
const AT_ITS_PLACE: StrikeWindow = { along: [-0.01, 0.01], across: [-0.01, 0.01], up: [-0.01, 0.01] };

/**
 * Throw `strike` with `actor`'s body, a human in its reference pose at the origin facing +z,
 * at a target `distance` straight ahead of its head. `time` counts the control steps taken, s; the
 * chamber begins at `STAND` and the pushes at `pushing`.
 */
export function throwBlow(actor: Actor, strike: Strike, distance: number): ThrownBlow {
  const { body } = actor, built = body.built;
  const recipe = { model: built.spec.model, held: heldIn(built.spec, strike.hand), strike, distance, found: "an experiment's", window: AT_ITS_PLACE };
  let time = 0;
  const tactics = attackOnce(strike.hand, (head) => [head.x, head.y, head.z + distance], () => time);
  // The clock counts the step under way, whatever mind decides it.
  const { report } = actor.drive(tactics, { skills: { repertoire: [recipe] }, watch: (_, dt) => { time += dt; } });
  return {
    body, report, pushing: STAND + (strike.chamber?.seconds ?? 0),
    get time() { return time; },
    dispose: () => actor.dispose(),
  };
}

/** `point` (body frame, reference pose) in `segment`'s own frame. */
export function inFrameOf(segment: BuiltSegment, point: Vec3): Vector3 {
  const f = segment.frame, d = [point[0] - f.origin[0], point[1] - f.origin[1], point[2] - f.origin[2]] as const;
  return new Vector3(...([f.x, f.y, f.z].map((a) => d[0] * a[0] + d[1] * a[1] + d[2] * a[2]) as [number, number, number]));
}

/** Where `segment`'s rigid body's centre is now, world. */
export const centreNow = (segment: BuiltSegment): Vector3 =>
  inFrameOf(segment, segment.rigid.centre).applyRotationQuaternion(segment.node.rotationQuaternion!).addInPlace(segment.node.position);
