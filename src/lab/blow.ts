import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body } from "../core/body.ts";
import type { BuiltBody, BuiltSegment } from "../core/build/build-body.ts";
import type { Hand } from "../core/control/motor.ts";
import { GUARD_ACTION, type Intent } from "../core/mind/intent.ts";
import type { Tactics } from "../core/mind/tactics.ts";
import { watchBlows, type BlowWatch, type Fighter, type LandedBlow } from "../core/rules/blows.ts";
import { createPool } from "../core/rules/pool.ts";
import type { Rulebook } from "../core/rules/rulebook.ts";
import type { SkillReport } from "../core/skills/skills.ts";
import { STAND } from "../core/skills/strike.ts";
import { BANDS, heldIn, type Band, type Repertoire, type StandOff, type Strike, type StrikeWindow } from "../core/skills/strikes.ts";
import type { BodySpec } from "../core/spec/body.ts";
import type { Vec3 } from "../core/spec/quantity.ts";
import type { Actor } from "./actor.ts";
import { ballOf, dummySpec, hangDummy, TARGET_CLEAR, type Dummy } from "./targets.ts";

/**
 * **One blow, thrown standing**: the rig the strike search throws its blows on
 * (`research/core-blow.mjs`), and the lab's Blow scenario (`blow-scenario.ts`) with it. A core
 * human (`src/core/body.ts`), driven by tactics that attack once (`attackOnce`), throws `strike`
 * through the strike skill (`src/core/skills/strike.ts`), the skill's repertoire being that one
 * strike: it stands in the guard `STAND` seconds where it was built, facing +z, holds the strike's
 * chamber, then pushes. Every freedom not pushed is servoed to the guard or the chamber, and the
 * legs are the stance's throughout. Every torque is a muscle's, the legs' included, so a blow is
 * thrown from the feet: the trunk turns against a body standing on the ground, not a pelvis held
 * still.
 *
 * A search's candidate is thrown exactly as the game's body throws the recipe it becomes: through
 * the same path from tactics to skill, so nothing is searched that the game does not run. And it
 * is read as a fight reads it: on a target body, under the rule a fight wounds by (`watchBlow`).
 */

/**
 * **Tactics that attack once**: `hand` attacks `target` (world) until the skills report the strike
 * thrown, then guards. `target` is read from the head each step until `time`, s, is `STAND`, then held: the
 * searches place their target from the head as the body stands then, after it has settled a few
 * centimetres forward and down from the pose it was built in. With `moved`, the point attacked is
 * moved by it (`StandOff`) once the blow is committed (its chamber and its swing): a target that
 * moved under the blow, as its tactics see it.
 */
function attackOnce(hand: Hand, target: (head: Vector3) => Vec3, time: () => number, moved?: Partial<StandOff>): Tactics {
  let aim: Vec3 | null = null;
  const guarding: Intent = { move: null, face: 0, hands: { left: GUARD_ACTION, right: GUARD_ACTION } };
  return {
    name: "attack once",
    decide({ view, report }) {
      if (!aim || time() < STAND) aim = target(view.head);
      if (report.strike.thrown[hand] > 0) return guarding;
      const thrown = moved && (report.strike.phase === "chamber" || report.strike.phase === "swing");
      const at: Vec3 = thrown ? [aim[0] + (moved.across ?? 0), aim[1] + (moved.up ?? 0), aim[2] + (moved.along ?? 0)] : aim;
      return { ...guarding, hands: { ...guarding.hands, [hand]: { kind: "attack", target: at } } };
    },
  };
}

/** Where a blow's target stands from the striker's head's centre of mass as the blow begins: straight ahead, and above, m. */
export interface BlowPlace {
  readonly ahead: number;
  readonly up: number;
}

/**
 * How high `band`'s target stands over the head of a body of `spec`: where a foe of its own
 * build has that band's part (`BANDS`), its centre of mass over the head's in the reference pose, m.
 */
export function bandRise(spec: BodySpec, band: Band): number {
  const centre = (name: string): Vec3 => {
    const segment = spec.segments.find((s) => s.name === name);
    if (!segment) throw new Error(`${spec.model} has no ${name}`);
    return segment.centreOfMass.value;
  };
  return centre(BANDS[band])[1] - centre("head")[1];
}

/** What a blow is thrown with: the hand, its strike (null for a placed blow, the skill's own with no recipe), where its target stands and the band it is. */
interface Throw {
  readonly hand: Hand;
  readonly strike: Strike | null;
  readonly place: BlowPlace;
  readonly band: Band;
  /** How far the target moves once the blow is committed, as its tactics see it (`attackOnce`); none if not given. */
  readonly moved?: Partial<StandOff>;
  /** An experiment's most a blow turns the pelvis (`SkillOptions.steer`); the skill's own if not given. */
  readonly steer?: number;
}

interface ThrownBlow extends Throw {
  readonly body: Body;
  /** What its skills report: whether a blow is being thrown, or has been, is read here and not from the clock. */
  readonly report: SkillReport;
  /** When a strike's pushes begin, s from the start; a placed blow's path begins when the body has stood. */
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
 * Throw a blow with `actor`'s body, a human in its reference pose at the origin facing +z, at a
 * target at its place from the head. `time` counts the control steps taken, s; the chamber begins
 * at `STAND` and the pushes at `pushing`.
 */
export function throwBlow(actor: Actor, thrown: Throw): ThrownBlow {
  const { body } = actor, built = body.built, { hand, strike, place, band } = thrown;
  if (strike && strike.hand !== hand) throw new Error(`${strike.name} is the ${strike.hand} hand's, not the ${hand}'s`);
  const recipe: Repertoire[number] | null = strike && { model: built.spec.model, held: heldIn(built.spec, hand), band, strike, place, found: "an experiment's", window: AT_ITS_PLACE, net: 0 };
  let time = 0;
  const tactics = attackOnce(hand, (head) => [head.x, head.y + place.up, head.z + place.ahead], () => time, thrown.moved);
  // The clock counts the step under way, whatever mind decides it.
  const skills = { repertoire: recipe ? [recipe] : [], ...(thrown.steer === undefined ? {} : { steer: thrown.steer }) };
  const { report } = actor.drive(tactics, { skills, watch: (_, dt) => { time += dt; } });
  return {
    hand, strike, place, band, body, report, pushing: STAND + (strike?.chamber?.seconds ?? 0),
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
const centreNow = (segment: BuiltSegment): Vector3 =>
  inFrameOf(segment, segment.rigid.centre).applyRotationQuaternion(segment.node.rotationQuaternion!).addInPlace(segment.node.position);

/** What a thrown blow did, as the rule a fight wounds by reads it (`watchBlows`). */
interface BlowReading {
  /** Hit points the target body lost; 0 with none hung. */
  readonly done: number;
  /** Hit points the body that threw it lost. */
  readonly cost: number;
  /**
   * The nearest the striking hand's body, with what it holds, came to the target's surface from
   * the beginning of the pushes, or of a placed blow's path, m: 0 where they touched; null
   * before then, and with no target.
   */
  readonly nearest: number | null;
  /** Whether the target body was hung: one whose place the thrower's body filled until the blow was thrown was not. */
  readonly hung: boolean;
  /** Every blow between the two, in the order they landed. */
  readonly blows: readonly LandedBlow[];
}

/** A thrown blow's target, and what the blow has done so far. */
interface BlowTarget {
  readonly reading: BlowReading;
  /** The target's centre, world: its body's, or its place until one hangs; null until the blow begins. */
  readonly centre: Vec3 | null;
  /** The target's radius, m. */
  readonly radius: number;
  dispose(): void;
}

/**
 * **Read `blow` on a target body**: a ball of the part its band names (`BANDS`, `dummySpec`),
 * hung where the blow is thrown at, from the thrower's head's centre of mass as it stands when
 * the blow begins (`STAND`), stood `off` that; and the blows between the two read under `rules`,
 * with a fresh pool for each. The body is hung as the blow begins, or as soon after as its place
 * is clear of the thrower's (`TARGET_CLEAR`), and not once the blow is thrown. With `dummy` false
 * nothing is hung, and the blow is thrown at nothing. `hung` is told the target's body as it is
 * hung, and what it returns is disposed with the target.
 */
export function watchBlow(actor: Actor, blow: ThrownBlow, rules: Rulebook,
  { dummy = true, off, hung }: { readonly dummy?: boolean; readonly off?: Partial<StandOff>; readonly hung?: (built: BuiltBody) => { dispose(): void } } = {}): BlowTarget {
  const { world } = actor, built = blow.body.built, { hand, place, band } = blow;
  const spec = dummySpec(built.spec, BANDS[band]), radius = ballOf(spec).ball.radius.value;
  const striking = built.segments.get(`hand.${hand}`), head = built.segments.get("head");
  if (!striking || !head) throw new Error(`${built.spec.model} has no ${hand} hand, or no head`);
  const segments = [...built.segments.values()];
  const attacker: Fighter = { id: "attacker", side: "attacker", built, pool: createPool(built.spec, rules) };
  let at: Vec3 | null = null, nearest: number | null = null;
  /** The target hung, the blows read between the two, and the hit points each had as it was hung. */
  let up: { readonly dummy: Dummy; readonly watch: BlowWatch; readonly whole: number; readonly told: { dispose(): void } | null } | null = null;
  const whole = attacker.pool.attachedHp();
  const centre = (): Vec3 | null => up ? [up.dummy.centre.x, up.dummy.centre.y, up.dummy.centre.z] : at;
  const hook = world.afterStep(() => {
    if (!at) {
      if (blow.time < STAND) return;
      const stood = centreNow(head);
      at = [stood.x + (off?.across ?? 0), stood.y + place.up + (off?.up ?? 0), stood.z + place.ahead + (off?.along ?? 0)];
    }
    if (!dummy) return;
    const where = at, thrown = blow.report.strike.thrown[hand] > 0;
    if (!up && !thrown && segments.every((segment) => segment.body.gapTo(where) - radius > TARGET_CLEAR)) {
      const target = hangDummy(world, spec, where, rules);
      up = { dummy: target, watch: watchBlows(world, [attacker, target.fighter], rules), whole: target.fighter.pool.attachedHp(), told: hung?.(target.fighter.built) ?? null };
    }
    if (blow.report.strike.since >= 0 || thrown) {
      const gap = Math.max(0, striking.body.gapTo(centre()!) - radius);
      nearest = nearest === null ? gap : Math.min(nearest, gap);
    }
  });
  return {
    get reading() {
      return {
        done: up ? up.whole - up.dummy.fighter.pool.attachedHp() : 0, cost: whole - attacker.pool.attachedHp(),
        nearest, hung: up !== null, blows: up?.watch.blows ?? [],
      };
    },
    get centre() { return centre(); },
    radius,
    dispose() {
      hook.dispose();
      up?.told?.dispose();
      up?.watch.dispose();
      up?.dummy.dispose();
    },
  };
}
