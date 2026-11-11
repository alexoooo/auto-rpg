/**
 * **How the Strike drill reads a trial**: the striker's one action from its request to its end, and
 * each touch of the asked limb on the target, its physical reading reported beside the person's reference
 * (`BAR`), which does not decide whether the action lands. Every rung reads its trials so.
 */
import { pointOfToRef, turnOfToRef } from "../../core/bodies/read-motion.ts";
import { Quaternion, Vector3 } from "../../core/math/vector.ts";
import { rigidPoints } from "../../core/bodies/build/rigid.ts";
import { jointAngles } from "../../core/bodies/build/joint-state.ts";
import { regionSegments } from "../../skills/framework/action-aim.ts";
import { drillTask, type DrillPhase } from "../../minds/command/drill.ts";
import { sensedPhase } from "../../skills/perception/threat.ts";
import { centreReading } from "../../control/observation.ts";
import { aimOf, holdsNothing } from "../../skills/reach/hand.ts";
import { effectorAim } from "../../control/effectors.ts";
import { sensedPosture } from "../../skills/perception/threat.ts";
import { acos, asin, cos } from "../../core/math/real.ts";
import { skillOf } from "../../skills/framework/menu.ts";
import { faceOf } from "../../skills/strikes/held-blow.ts";
import type { Mechanism } from "../../combat/rulebook.ts";
import type { BuiltBout } from "../bout.ts";
import type { HostedBody } from "../../minds/seat/hosted-body.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { modelSpec } from "../../core/bodies/models.ts";
import { startVelocity } from "../../skills/framework/profile.ts";
import { placeInWindow } from "../../skills/intent/action-window.ts";
import type { Reader } from "../evaluation.ts";
import { type Side, SIDES } from "../../core/bodies/bilateral.ts";
import { swingMotion, type SwingMotion } from "./motion.ts";
import { swellShapes } from "./swell.ts";

export type Mark = "high" | "middle" | "legs";

/** The segment `steps` joints above `segment` in `spec`'s tree: a hand's forearm at 1, its upper arm at 2. */
function limbAbove(spec: BodySpec, segment: string, steps: number): string | undefined {
  let at: string | undefined = segment;
  for (let k = 0; k < steps && at !== undefined; k++) at = spec.joints.find((joint) => joint.child === at)?.parent;
  return at;
}
export type Hand = Side;

/** The limb a trial strikes with: a hand, read against the bar's fist or held blow, or a foot, read against its stomp (`Bar.foot`). */
export type Limb = { readonly hand: Hand } | { readonly foot: Hand };

/** The hand `limb` names; null for a foot. */
export const handOf = (limb: Limb): Hand | null => "hand" in limb ? limb.hand : null;

/** The effector's segment `limb` names: `hand.right`, `foot.left`. */
export const effectorOf = (limb: Limb): string => "hand" in limb ? `hand.${limb.hand}` : `foot.${limb.foot}`;

/** What a blow is judged by (`BAR`, `barOf`). */
type Bar = {
  /** A fist's speed over its last `run` m, m/s, and the effective mass it meets with, kg, by hand. */
  readonly speed: { readonly right: number; readonly left: number };
  readonly mass: { readonly right: number; readonly left: number };
  readonly run: number; readonly cone: number; readonly within: number; readonly along: number; readonly bend: number; readonly lean: number;
  /** A held item's blow: its energy, J; a point's, its closing speed at the contact, m/s; an edge's, the item's far end's speed into the contact, m/s. */
  readonly held: { readonly energy: number; readonly point: number; readonly edge: number };
  /** A foot's blow, a stomp's: the foot's speed into the contact over its last `run` m, m/s. */
  readonly foot: number;
  /**
   * A bonk's, a club's blow at the head (`Overhead`): its `energy`, J; how high the club hand
   * rises over the crown in the chamber (`hand`), and the swell over the point it strikes
   * (`rise`), m; the shaft's sweep from the chamber to contact, its least and most, and its largest
   * reversal, degrees; and how far below horizontal the swell's path comes in, degrees.
   */
  readonly overhead: { readonly energy: number; readonly hand: number; readonly rise: number; readonly sweep: readonly [number, number]; readonly reversal: number; readonly descent: number };
};

/**
 * **The human reference beside a blow**, the untrained adult man's fist less one SD (Adamec et al. 2021,
 * Table 3, male, fist; [human strike reference](../../../docs/reference/human-strike-reference.md#1-punches-straight-jabcross-hook)):
 * its speed over its last `run` m before contact, m/s, and the effective mass it meets on its own
 * side, kg, by hand: the right is the guard's rear hand (dominant 8.0 ± 1.2 m/s, 2.93 ± 0.81 kg),
 * the left its lead (non-dominant 6.2 ± 0.9 m/s, 3.27 ± 0.93 kg). Its last `run` m come in within
 * `cone` degrees of the surface's normal, as the punch competency's straight blow does, and it
 * meets the target within `within` s of the action's start, an engineering bound.
 *
 * And it is a punch: its last
 * `run` m come out more along the arm than across it, within `along` degrees of the line from the
 * striking shoulder to the strike point at contact (a thrust runs along that line, a swing across
 * it; an elbow near straight opens mostly across it, so a person's punch is not held nearer); the
 * elbow is within `bend` degrees of straight (its range's end) at contact; and the chest is within
 * `lean` degrees of upright then.
 *
 * A blow from a hand holding an item is judged by `held` alone: its `energy`, J, the rules' energy
 * of the blow on the Warrior (on another body, its pair's share, `pairShare`), at least the untrained adult's blow with a crutch less one SD (Frantz, Sprenger &
 * Jackowski 2026, 75.5 ± 10.7 J, the household implement nearest a club swung one-handed;
 * [human strike reference](../../../docs/reference/human-strike-reference.md#2-one-handed-stickclubbaton-and-bats-as-a-two-handed-ceiling));
 * a point's blow by its `point` instead, its closing speed into the contact, m/s: the fencers'
 * underarm thrust less one SD (Horsfall 1999, men 6.0 ± 1.4 m/s; [section 3a](../../../docs/reference/human-strike-reference.md#3a-one-handed-thrust-a-persons-stab));
 * an edge's by its `edge`, the speed of the item's far end (its point farthest from the grip, where
 * the source measured a rod's) over its last `run` m into the contact: the lay men's one-handed rod
 * less one SD (Muggenthaler 2018, 23.9 m/s at the tip, the SD derived from Trinh 2018's range;
 * [section 3](../../../docs/reference/human-strike-reference.md#3-one-handed-sword-cut));
 * and met with what its action strikes with, as the rules read the contact (`ExecutorPart.meets`:
 * the club blunt, the sword's cut with its edge, its thrust with its point). Its time is reported, not
 * tested: the fist's `within` is engineering.
 *
 * A club's blow at the head, a bonk, is judged by `overhead` instead (`Overhead`): its energy, a
 * full-strength blow's, 86.3 J, set at 90% of the strongest bonk meeting the form below that a
 * search of the Warrior found (95.9 J), above the crutch blow's mean, a full blow rather than less
 * one SD (Frantz, Sprenger & Jackowski 2026, 75.5 J; the same
 * [section 2](../../../docs/reference/human-strike-reference.md#2-one-handed-stickclubbaton-and-bats-as-a-two-handed-ceiling));
 * and its form: in the chamber the club hand over the crown and the swell 0.25 m over the point it
 * strikes; one stroke sweeping 45 to 150 degrees with no reversal past 10; coming in at least 45
 * degrees below horizontal; the elbow within `bend` of straight. The form's numbers are set so the
 * blow is an overhead one rather than a swing.
 *
 * A foot's blow, a stomp, is judged by `foot` alone: its foot's speed into the contact, the stamps
 * on a dummy in a simulated ruck less one SD (Oudshoorn et al. 2018, 4.3 m/s, 2.1 to 6.3 over 12
 * people, the SD derived from the range; [human strike reference](../../../docs/reference/human-strike-reference.md#3b-stomp)).
 */
export const BAR: Bar = Object.freeze({
  speed: Object.freeze({ right: 6.8, left: 5.3 }),
  mass: Object.freeze({ right: 2.12, left: 2.34 }),
  run: .1, cone: 20, within: .5, along: 45, bend: 30, lean: 30,
  held: Object.freeze({ energy: 64.8, point: 4.6, edge: 18.5 }),
  foot: 3,
  overhead: Object.freeze({ energy: 86.3, hand: 0, rise: .25, sweep: Object.freeze([45, 150] as const), reversal: 10, descent: 45 }),
});

/** m M / (m + M), and m where M is `Infinity`: the mass a contact's energy goes with (`impactEnergy`). */
const reduced = (m: number, big: number): number => Number.isFinite(big) ? m * big / (m + big) : m;

/**
 * **A held blow's energy bar on a target of `target`**, a share of `Bar.held.energy`, which is set
 * for the Warrior struck: a blow gives up its energy with the reduced mass of the pair it meets
 * (`impactEnergy`), so the same blow on a lighter body gives up less. The share is the pair's
 * reduced mass, the striker's `kg` against the `struck` mass the contact met, over the pair's on
 * the Warrior, whose mass met there is the struck mass scaled by the two bodies' masses, as
 * `barOf` scales a fist's mass by its striker's. A Warrior struck reads the bar itself.
 */
function pairShare(kg: number, struck: number, target: BodySpec): number {
  const onWarrior = struck * BAR_BODY.mass.value / target.mass.value;
  return reduced(kg, struck) / reduced(kg, onWarrior);
}

/** A body's strength: its muscles' peak isometric torques, both ways about every joint's every axis, summed, N m. */
function strengthOf(spec: BodySpec): number {
  let sum = 0;
  for (const joint of spec.joints) for (const dof of joint.dofs) if (dof.muscle) sum += dof.muscle.peakPositive.value + dof.muscle.peakNegative.value;
  return sum;
}

/** The body `BAR` is set for: the toed Warrior at the default attributes. */
const BAR_BODY = modelSpec("workshop-fighter");
const BARS = new WeakMap<BodySpec, Bar>();

/**
 * **The bar for a striker of `spec`**: `BAR`, the Warrior's, scaled by the striker's strength and
 * mass against his. The energy a body puts into a blow is its muscles' work, so it scales with
 * their strength (`strengthOf`, the ratio `s`); the mass a blow meets with scales with the body's
 * (`m`); a speed is then the one that carries that energy in that mass, `sqrt(s / m)`. So a held
 * item's energy is scaled by `s`, a fist's mass by `m` and its speed and a foot's by `sqrt(s / m)`; the form's
 * angles and time are not. The Warrior's is `BAR` itself. Checked against the one sex difference
 * the sources measure at a fixed implement: women swing a 1 kg rod one-handed at 0.72 of men's tip
 * speed, 0.52 of the energy (Muggenthaler et al. 2018,
 * [human strike reference](../../../docs/reference/human-strike-reference.md#2-one-handed-stickclubbaton-and-bats-as-a-two-handed-ceiling)),
 * where the Rogue's `s` is 0.52.
 */
function barOf(spec: BodySpec): Bar {
  const known = BARS.get(spec);
  if (known) return known;
  const strength = strengthOf(spec) / strengthOf(BAR_BODY), mass = spec.mass.value / BAR_BODY.mass.value, speed = Math.sqrt(strength / mass);
  const bar: Bar = strength === 1 && mass === 1 ? BAR : Object.freeze({ ...BAR,
    speed: Object.freeze({ right: BAR.speed.right * speed, left: BAR.speed.left * speed }),
    mass: Object.freeze({ right: BAR.mass.right * mass, left: BAR.mass.left * mass }),
    held: Object.freeze({ energy: BAR.held.energy * strength, point: BAR.held.point * speed, edge: BAR.held.edge * speed }), foot: BAR.foot * speed,
    overhead: Object.freeze({ ...BAR.overhead, energy: BAR.overhead.energy * strength }) });
  BARS.set(spec, bar);
  return bar;
}

/** A touch of the striker's on the target: when, by which of its segments on which of the target's, and in the rules' units. */
type StrikeContact = {
  readonly time: number; readonly by: string; readonly on: string; readonly closing: number; readonly energy: number; readonly damage: number;
  /** What it met the target with, as the rules read the contact: the mechanism that priced the target's wound. */
  readonly mechanism: Mechanism;
  /** The effective mass the striking segment met on its own side, kg. */
  readonly kg: number;
  /** The effective mass the contact met on the target's side, kg. */
  readonly struck: number;
};

/** A bonk's tests (`Bar.overhead`), as the drill names one it fell short of. */
export type OverheadTest = "chamber" | "one stroke" | "descent" | "swell on the head" | "arm straight" | "full strength" | "back to guard";

/**
 * **A bonk's reading**: a club's blow at the head against `Bar.overhead`. The chamber is the
 * swell's highest place between the action's start and the contact. It reads the club hand's
 * greatest height over the striker's crown up to the chamber (`hand`) and the swell's height there
 * over its place at contact (`rise`), m; the angle the shaft turned from the chamber to contact
 * (`sweep`), and the most it turned back from the farthest it had come (`reversal`), rad; how far
 * below horizontal the swell's last `run` m came in (`descent`), rad; whether the limb's first
 * touch on the target was the swell's collider on the mark (`swell`); the contact's energy over
 * the bar's (`share`); and whether the hand came back to its guard (`back`). `short` names each
 * test it did not meet.
 */
export type Overhead = {
  readonly hand: number; readonly rise: number; readonly sweep: number; readonly reversal: number; readonly descent: number;
  readonly swell: boolean; readonly share: number; readonly back: boolean;
  readonly short: readonly OverheadTest[];
};

/**
 * How the asked limb's touch on the mark measured against the bar: a bare hand's against each of
 * its fist's tests; a hand's holding an item against `hard` alone; a foot's against `fast` alone,
 * by its stomp's speed (`Bar.foot`), its arm's form null.
 */
type StrikeHit = StrikeContact & {
  /** Its strike point's speed over its last `run` m, m/s; null where it travelled less. */
  readonly speed: number | null;
  /** The cosine between that travel and the surface's normal; null where it travelled less. */
  readonly straight: number | null;
  /** The cosine between that travel and the line from the shoulder to the strike point at contact; null where it travelled less. */
  readonly along: number | null;
  /** How far the elbow was from straight at contact, and the chest from upright, rad; null for a foot. */
  readonly bend: number | null; readonly lean: number | null;
  /** A foot's blow: the speed its bar reads (`Bar.foot`), m/s, and that bar; null for a hand. */
  readonly foot: { readonly speed: number; readonly bar: number } | null;
  /** Which of the bar's tests it met; null for a test the bar does not set the limb. */
  readonly fast: boolean | null; readonly heavy: boolean | null; readonly square: boolean | null; readonly soon: boolean | null;
  readonly lined: boolean | null; readonly extended: boolean | null; readonly upright: boolean | null;
  /** A held item's blow: what its bar reads (`Bar.held`: a point's closing speed or an edge's far end's speed, m/s, else the energy, J) and that bar; null for a limb that holds nothing. */
  readonly held: { readonly value: number; readonly bar: number } | null;
  /** Whether a held item's blow met its bar (`held`); null for a limb that holds nothing. */
  readonly hard: boolean | null;
  /** Whether a held item's blow met the target with what its action strikes with (`ExecutorPart.meets`); null for a limb that holds nothing. */
  readonly faced: boolean | null;
  /** A bonk's reading, a club's blow at the head (`Overhead`); null for any other blow. */
  readonly overhead: Overhead | null;
};

/**
 * How a trial came out: `landed`, a touch of the limb on the mark with its declared striking surface while its
 * action ran, the striker up and its action ended; `weak`, on the mark before completion or with another surface;
 * `guarded`, the limb on the target's arms alone, its guard; `elsewhere`, the limb on the
 * target's body but not the mark; `missed`, committed and nothing of the
 * limb's on the target; `abandoned`, begun and ended before committing; `outside`, never in its
 * window; `refused` or `waiting`, never admitted for the reason its readiness gave; `unbegun`,
 * ordered and never begun by the mind, whose skill no longer admitted it or whose limb a blow it
 * could not let go still held; `fell`, the
 * striker down at any time of the trial; `unreached`, a fight that never came to its moment;
 * `unlaid`, a target the rung lays down not lying by the drill's first moment (`Ending.laid`):
 * the fixture did not reach its case.
 */
type StrikeOutcome = "landed" | "weak" | "guarded" | "elsewhere" | "missed" | "abandoned" | "outside" | "refused" | "waiting" | "unbegun" | "fell" | "unreached" | "unlaid";

/**
 * Whether a trial's fixture reached its case, by its outcome's label: every outcome but `unreached`
 * and `unlaid`. A blow not begun there (its skill refused it, the body never came into its
 * window, was still waiting or fell first) is a skill that did not deliver where it was asked,
 * worth nothing there.
 */
export const strikeOffered = (outcome: string | null): boolean => outcome !== null && outcome !== "unreached" && outcome !== "unlaid";

/** What a trial came to. */
export type StrikeReading = {
  readonly motion?: SwingMotion;
  readonly outcome: StrikeOutcome;
  /** The drill's last phase before its action, and the reason its readiness last gave. */
  readonly phase: DrillPhase;
  /**
   * The target's phase as the striker sensed it (the `phase` percept, `sensedPhase`) where its
   * trial began: the step the drill was first ready to ask or its action began, whichever came
   * first, else the step the drill had the body; null where it never had it.
   */
  readonly foePhase: string | null;
  /**
   * The target as the striker sensed it then: its posture (`sensedPosture`), how far apart the two
   * were, centre to centre across the ground (the striker's stance centre to the target's sensed
   * centre), m, and the striker's velocity against the target's (`startVelocity`): closing on it
   * and across the line to it, positive to the striker's right, m/s; null where it never sensed it.
   */
  readonly foeAt: { readonly posture: string; readonly apart: number; readonly velocity: readonly [number, number] } | null;
  /**
   * Where the striker stood then in the window of the drill's choice, as its menu read it
   * (`MenuEntry.readiness`): the target's offset from the window's middle, ahead and to its right,
   * m (`placeInWindow`); null where its readiness named no window.
   */
  readonly inWindow: readonly [number, number] | null;
  readonly reason: string;
  /** When the drill had the body, s: the bout's start, or the moment its fight was handed to it; null where it never was. */
  readonly handed: number | null;
  /** When the drill was first ready to ask (its readiness said ready, or it asked), s; null where it never was. */
  readonly ready: number | null;
  /** At the action's start: which feet bore on the ground, and the centre of mass's speed over it, m/s; null where it did not start. */
  readonly asked: { readonly bearing: readonly Hand[]; readonly speed: number } | null;
  /** When the action began, committed, released and ended, s; null where it did not. */
  readonly began: number | null; readonly committed: number | null; readonly released: number | null; readonly ended: number | null;
  readonly ending: string | null;
  /** A hand's first touch on the mark with the intended mechanism, or else its fastest; a foot's fastest; null where none. */
  readonly hit: StrikeHit | null;
  /** The bar the striker's blow was judged by (`barOf` its body, unless the reader was given one). */
  readonly bar: Bar;
  /**
   * The hit points each of the target's segments lost to the striker's touches over the trial, by
   * the segment touched: from the step the drill had the body (`handed`), so a fight's blows
   * before its moment are the fight's, not the trial's.
   */
  readonly dealt: Readonly<Record<string, number>>;
  /** The hit points the striker lost in its contacts with the target over the trial (from `handed`, as `dealt`), any part on any part. */
  readonly taken: number;
  /**
   * Where the drill let its action go (`StillCondition.letGo`): when it let it go and when the
   * hand was back at its guard (`BACK`), s (null where it was not by the trial's end), and the hit
   * points the striker lost from the let-go until then; absent where it did not let one go.
   */
  readonly letGo?: { readonly at: number; readonly again: number | null; readonly opening: number };
  /**
   * From its action's end until the limb was back at its guard and still (`BACK`), s: the rest of
   * its cycle before it can begin again; null where it was not within `Ending.recover` s, or its
   * action was let go or did not end.
   */
  readonly recovers: number | null;
  /** The limb's nearest approach to where its action aimed (`ActionStatus.aim`), m, over the steps the reader saw it under way, a hand's by its fist; null where it never said. */
  readonly nearest: number | null;
  /**
   * The percepts it left the striker in once its limb was back at its guard after its action ended
   * (`recovers`), by name: the range head to head across the ground to the target (`range`, m: the
   * striker's head to the target's `marks.high`); null where its limb was not back, or its action
   * was let go or did not end.
   */
  readonly exit: { readonly range: number } | null;
  readonly down: boolean;
  readonly seconds: number;
};

/** The hit points a trial took from the target, every segment's together (`StrikeReading.dealt`). */
function dealtIn(r: Pick<StrikeReading, "dealt">): number {
  let sum = 0;
  for (const on in r.dealt) sum += r.dealt[on]!;
  return sum;
}

/**
 * **What a blow's value is made of**: the life its trial took from the target less the life the
 * striker lost (`net`, hit points), and its action's cycle, from its start until the limb was back
 * at its guard (`recovers`), or to the trial's end where it was not (`cycle`, s), before a fall's
 * rise is added. None for a trial whose action did not begin.
 */
export function strikeTrade(r: Pick<StrikeReading, "began" | "ended" | "recovers" | "seconds" | "dealt" | "taken">): { readonly net: number; readonly cycle: number } | null {
  if (r.began === null) return null;
  return { net: dealtIn(r) - r.taken, cycle: (r.ended !== null && r.recovers !== null ? r.ended + r.recovers : r.seconds) - r.began };
}

/**
 * **The hand back at its guard**, as the body reads it: its strike point within `within` m of where
 * it was, against the chest and turned with it, when its action began, and moving against the
 * chest at no more than `still` m/s.
 */
const BACK = Object.freeze({ within: .05, still: .3 });

/**
 * When a trial ends: the protocol's longest, how long it runs on after the action's end, how long
 * it waits after the action's end or its let-go for the limb back at its guard (`recover`), and how
 * long the striker may wait to be admitted `settled` s after the drill has the body.
 */
interface Ending {
  readonly seconds: number; readonly settle: number; readonly recover: number; readonly settled: number; readonly patience: number;
  readonly motion?: true;
  /** How the rung lays its target down (a shove at a segment, m/s of its mass): it lies once its middle trunk's centre is under `LIES` of its height as built. */
  readonly laid?: { readonly segment: string; readonly speed: number };
}

/** A laid target lies once its middle trunk's centre is under this share of its height as built (`Ending.laid`): a body folded sitting holds it above. */
const LIES = 1 / 3;

/**
 * The reader of a trial in which the striker, the bout's left side, asks one action with `limb` at
 * the right side's `mark`, ending as `ending` says, a hand's judged by `bar`, its side led by the
 * drill Commander (`Duel.commanded`, `drillTask`). The striker's actions while its drill is
 * fighting (`DrillPhase`) are the fight's, not the drill's. With no `bar`, a hand's blow is judged
 * by its body's (`barOf`).
 */
export function readStrike({ world, duel, catalog }: Pick<BuiltBout, "world" | "duel" | "catalog">, limbAsked: { readonly mark: Mark } & Limb,
  ending: Ending, given?: Bar): Reader<StrikeReading> {
  const left = duel.duelists.left, skills = left.minded.skills;
  if (!skills) throw new Error("the striker runs no skills");
  const { mark } = limbAsked, hand = handOf(limbAsked), effector = effectorOf(limbAsked);
  const target = duel.duelists.right.built.spec, marked = new Set(regionSegments(target, { kind: "mark", mark }));
  /** The target's arms, hand to upper arm: what a guard meets a blow with. */
  const arms = new Set(SIDES.flatMap((side) => [0, 1, 2].map((steps) => limbAbove(target, `hand.${side}`, steps))).filter((name) => name !== undefined));
  const limb = left.built.segments.get(effector);
  if (!limb) throw new Error(`the striker has no ${effector}`);
  const motion = ending.motion ? swingMotion(left.built, effector) : null;
  /** The skill its drill Commander asks. */
  const drilled = (duel.recipe.commanders?.left as { readonly skill?: string } | undefined)?.skill;
  const spec = left.built.spec, points = rigidPoints(spec, limb.spec), point = new Vector3(), bar = given ?? barOf(spec);
  /** Whether the asked hand holds an item, its blow judged by the held item's bar (`Bar.held`) and its strike point the item's. */
  const armed = hand !== null && !holdsNothing(spec, effector);
  /** What the action asked meets the target with (`ExecutorPart.meets`), read where it begins: blunt where its executor says none. */
  let meets: Mechanism = "blunt";
  /** The strike point: a hand's fist, or the face of what it holds its action meets with (`faceOf`), its item's aim where it has none such; a foot's own. */
  let aim = points.get(hand === null ? effectorAim(spec, effector) : aimOf(spec, hand))!.value;
  /** What an edge's speed is read at (`Bar.held`): the held item's point farthest from its grip; the strike point where the hand holds nothing. */
  const far = (() => {
    const item = hand === null ? undefined : spec.held?.find((one) => one.segment === effector)?.item;
    if (!item) return aim;
    let best: string | null = null, reach = -1;
    for (const [name, at] of Object.entries(item.points)) {
      const [x, y, z] = at.value, out = x * x + y * y + z * z;
      if (out > reach) { reach = out; best = name; }
    }
    return best === null ? aim : points.get(best)!.value;
  })(), farAt = new Vector3();
  const chest = left.built.segments.get("upperTrunk");
  if (!chest) throw new Error("the striker has no chest to read its limb against");
  /** A hand's arm, what a punch's form is read by: its shoulder, its elbow and the elbow's straight end; null for a foot. */
  const arm = hand === null ? null : (() => {
    const shoulderJoint = spec.joints.find((joint) => joint.child === limbAbove(spec, effector, 2)), upperArm = shoulderJoint && left.built.segments.get(shoulderJoint.child);
    const elbowJoint = spec.joints.find((joint) => joint.child === limbAbove(spec, effector, 1)), elbow = elbowJoint && left.built.joints.get(elbowJoint.name);
    if (!shoulderJoint || !upperArm || !elbowJoint || !elbow) throw new Error(`the striker's ${effector} has no shoulder or elbow to read a punch's form by`);
    return { shoulderJoint, upperArm, elbow, straight: elbowJoint.dofs[0]!.min.value };
  })();
  /**
   * A bonk's watch: whether the action is a bonk (a blunt held blow at the high mark), decided where
   * it begins; the striker's head and its crown, body frame; the swell's colliders and its shaft's
   * ends; each step of the action (`CLUB` numbers a step): its time, the club hand's height, the
   * crown's, the swell's place and the shaft's direction; and the limb's first touch on the target.
   */
  let bonked = false;
  const headOf = left.built.segments.get("head"), crown = spec.segments.find((one) => one.name === "head")?.distal.value;
  const swells = armed ? swellShapes(limb.rigid) : new Set<number>(), shaftEnds = [points.get("swellFrom")?.value, points.get("swellTo")?.value] as const;
  const club: number[] = [], CLUB = 9, grip = new Vector3(), top = new Vector3(), shaftFrom = new Vector3(), shaftTo = new Vector3();
  const foeSegments = new Map([...duel.duelists.right.built.segments].map(([name, one]) => [one.body.id, name]));
  let touch: { readonly time: number; readonly swell: boolean; readonly on: string } | null = null;
  const angles: number[] = [];
  const shoulder = new Vector3(), turn = new Quaternion(), up = new Vector3(), chestAt = new Vector3(), ORIGIN = [0, 0, 0] as const;
  /** The strike point against the chest, turned with it, where its action began; and as the last step left it. */
  const rest = new Vector3(), held = new Vector3(), was = new Vector3();
  /** The strike point against the chest, in the chest's turn, into `out`. */
  const againstChest = (out: Vector3): Vector3 => {
    pointOfToRef(limb, aim, point); pointOfToRef(chest, ORIGIN, chestAt); turnOfToRef(chest, turn);
    return point.subtractToRef(chestAt, out).applyRotationQuaternionToRef(Quaternion.InverseToRef(turn, turn), out);
  };
  /** The strike point's path, world, a step at a time: time, the strike point's x, y, z, and a hand's shoulder's x, y, z (0 for a foot), its elbow's bend and the chest's lean, rad (0 for a foot), and the far point's x, y, z (`far`). */
  const path: number[] = [];
  const STRIDE = 12;
  const times = { began: null as number | null, committed: null as number | null, released: null as number | null, ended: null as number | null };
  const coneCosine = cos(bar.cone * Math.PI / 180), alongCosine = cos(bar.along * Math.PI / 180), bend = bar.bend * Math.PI / 180, lean = bar.lean * Math.PI / 180;
  let id: number | null = null, phase: DrillPhase = "lost", reason = "", down = false, handed: number | null = null, fought = false, ready: number | null = null;
  /** When the drill let its action go; when the watch for the limb back at its guard (`BACK`) began where it did not, at the action's end; and when it was back. */
  let letAt: number | null = null, watching: number | null = null, again: number | null = null, nearest: number | null = null;
  /** The laid target's middle trunk, its height as built, and whether it lay by the drill's first moment: null before that moment, or with no `laid`. */
  const trunk = ending.laid ? centreReading(duel.duelists.right.built, "middleTrunk") : null;
  trunk?.update();
  const built = trunk ? trunk.centre.y : 0;
  let lay: boolean | null = null;
  /** The striker's view, where its body is hosted: where its fists were as its last step read them. */
  const view = "view" in left.body ? (left.body as HostedBody).view : null;
  let asked: StrikeReading["asked"] = null;
  /** The target's phase and where it was, as the striker sensed them where its trial began, and where the drill had the body. */
  let foeBegan: Sensed | null = null, atHand: Sensed | null = null;
  const head = centreReading(left.built, "head"), centre = new Vector3(), theirHead = centreReading(duel.duelists.right.built, target.marks.high);
  /** The range head to head across the ground to the target, as this step left the two, m. */
  const range = (): number => {
    head.update(); theirHead.update();
    const dx = theirHead.centre.x - head.centre.x, dz = theirHead.centre.z - head.centre.z;
    return Math.sqrt(dx * dx + dz * dz);
  };
  let exit: StrikeReading["exit"] = null;
  type Sensed = { readonly phase: string; readonly at: StrikeReading["foeAt"]; readonly window: StrikeReading["inWindow"] };
  /** Where the striker stands now in the window of the drill's choice (`placeInWindow`), as its menu reads it; null where it names none. */
  const placed = (): StrikeReading["inWindow"] => {
    if (!view) return null;
    const entry = skills.actions.menu().find((one) => one.limb === effector && one.foe === duel.duelists.right.id && one.region?.kind === "mark" && one.region.mark === mark
      && (drilled === undefined || one.skill === drilled));
    const ready = entry?.readiness;
    return (ready?.kind === "ready" || ready?.kind === "position") && ready.window
      ? placeInWindow(ready.window, view.stance.centre.x, view.stance.centre.z, skills.report.legs.heading) : null;
  };
  const velocity = new Vector3(), segments = [...left.built.segments.values()], mass = segments.reduce((sum, segment) => sum + segment.rigid.mass, 0);
  /** The striker's centre of mass's velocity over the ground, as this step left it, m/s. */
  const moving = (): { readonly x: number; readonly z: number } => {
    let x = 0, z = 0;
    for (const segment of segments) { segment.body.linearVelocityToRef(velocity); x += segment.rigid.mass * velocity.x; z += segment.rigid.mass * velocity.z; }
    return { x: x / mass, z: z / mass };
  };
  /**
   * The target as the striker senses it now: its phase (`sensedPhase`), posture (`sensedPosture`),
   * how far apart the two are, and the striker's velocity against the target's sensed one, along
   * the line between them and across it (`startVelocity`).
   */
  const sensed = (): Sensed => {
    head.update();
    const at = left.body.observe().centre, senses = left.senses(), other = senses.others.find((one) => one.id === duel.duelists.right.id);
    const phase = sensedPhase({ senses, head: head.centre, stance: { centre: centre.set(at[0], at[1], at[2]) } }, duel.duelists.right.id);
    if (!other) return { phase, at: null, window: null };
    const dx = other.centre.x - at[0], dz = other.centre.z - at[2], own = moving();
    return { phase, at: { posture: sensedPosture(other), apart: Math.sqrt(dx * dx + dz * dz),
      velocity: startVelocity({ x: dx, z: dz }, { x: own.x - other.velocity.x, z: own.z - other.velocity.z }) }, window: placed() };
  };
  /** Which feet bear on the ground, and the centre of mass's speed over it, as this step left them. */
  const footing = (): NonNullable<StrikeReading["asked"]> => {
    const { x, z } = moving(), contacts = left.body.observe().contacts;
    const bearing = SIDES.filter((side) => contacts.some((contact) => contact.segment === `foot.${side}` && contact.fixed !== null && contact.impulse > 0));
    return { bearing, speed: Math.sqrt(x * x + z * z) };
  };
  /** The actions the fight asked before the drill had the body. */
  const before = new Set<number>();
  /** The last step before `time`'s place in `path`, or -1. */
  const stepBefore = (time: number): number => {
    let end = path.length - STRIDE;
    while (end >= 0 && path[end]! >= time) end -= STRIDE;
    return end;
  };
  /** The strike point's travel over its last `bar.run` m before `time` (the far point's, from `of` 9): its speed and its direction, or null where it travelled less. */
  const approach = (time: number, of = 1): { speed: number; direction: [number, number, number] } | null => {
    const end = stepBefore(time);
    if (end < 0) return null;
    const ex = path[end + of]!, ey = path[end + of + 1]!, ez = path[end + of + 2]!;
    for (let k = end - STRIDE; k >= 0; k -= STRIDE) {
      const dx = ex - path[k + of]!, dy = ey - path[k + of + 1]!, dz = ez - path[k + of + 2]!, far = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (far < bar.run) continue;
      const next = k + STRIDE, nx = ex - path[next + of]!, ny = ey - path[next + of + 1]!, nz = ez - path[next + of + 2]!, near = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const f = far === near ? 0 : (far - bar.run) / (far - near), at = path[k]! + f * (path[next]! - path[k]!);
      const sx = path[k + of]! + f * (path[next + of]! - path[k + of]!), sy = path[k + of + 1]! + f * (path[next + of + 1]! - path[k + of + 1]!), sz = path[k + of + 2]! + f * (path[next + of + 2]! - path[k + of + 2]!);
      const tx = ex - sx, ty = ey - sy, tz = ez - sz, length = Math.sqrt(tx * tx + ty * ty + tz * tz);
      return { speed: bar.run / (path[end]! - at), direction: [tx / length, ty / length, tz / length] };
    }
    return null;
  };
  /**
   * The bonk's reading (`Overhead`) of a contact at `time` giving up `energy` J against `bar` J, the
   * swell's last `run` m `travel`, the elbow `bent` from straight, rad.
   */
  const overheadOf = (time: number, energy: number, against: number, travel: { readonly direction: readonly number[] } | null, bent: number): Overhead => {
    let end = club.length - CLUB, chamber = 0, hand = -Infinity, farthest = 0, reversal = 0;
    while (end > 0 && club[end]! > time) end -= CLUB;
    for (let k = 0; k <= end; k += CLUB) if (club[k + 4]! > club[chamber + 4]!) chamber = k;
    for (let k = 0; k <= chamber; k += CLUB) hand = Math.max(hand, club[k + 1]! - club[k + 2]!);
    const turned = (k: number) => acos(Math.max(-1, Math.min(1, club[chamber + 6]! * club[k + 6]! + club[chamber + 7]! * club[k + 7]! + club[chamber + 8]! * club[k + 8]!)));
    for (let k = chamber; k <= end; k += CLUB) { const now = turned(k); farthest = Math.max(farthest, now); reversal = Math.max(reversal, farthest - now); }
    const rise = club[chamber + 4]! - club[end + 4]!, sweep = turned(end), descent = travel ? asin(Math.max(-1, Math.min(1, -travel.direction[1]!))) : 0;
    const swell = touch !== null && touch.swell && marked.has(touch.on), share = energy / against, back = watching !== null && again !== null;
    const o = bar.overhead, rad = Math.PI / 180;
    const short: OverheadTest[] = [
      ...hand >= o.hand && rise >= o.rise ? [] : ["chamber" as const],
      ...sweep >= o.sweep[0] * rad && sweep <= o.sweep[1] * rad && reversal <= o.reversal * rad ? [] : ["one stroke" as const],
      ...descent >= o.descent * rad ? [] : ["descent" as const],
      ...swell ? [] : ["swell on the head" as const],
      ...bent <= bend ? [] : ["arm straight" as const],
      ...share >= 1 ? [] : ["full strength" as const],
      ...back ? [] : ["back to guard" as const]];
    return { hand, rise, sweep, reversal, descent, swell, share, back, short };
  };
  return {
    afterStep() {
      const drill = drillTask(duel.commanded("left")?.task ?? "lost");
      if (drill.phase === "fighting") {
        fought = true;
        for (const one of skills.report.actions) before.add(one.id);
        return;
      }
      if (handed === null) { handed = fought ? world.time : 0; atHand = sensed(); }
      if (trunk && lay === null && world.time >= handed + ending.settled) { trunk.update(); lay = trunk.centre.y < LIES * built; }
      // The drill's action: the first with the asked limb at a body that the fight did not ask, or
      // the fight's own that the drill carries on from its moment (`adopts`), under way as it takes the body.
      const action = id !== null ? skills.report.actions.find((one) => one.id === id)
        : skills.report.actions.find((one) => !before.has(one.id) && one.effector === effector && one.target.kind === "body")
          ?? (drill.phase === "under way" ? [...skills.report.actions].reverse().find((one) => one.effector === effector && one.target.kind === "body") : undefined);
      if (action && id === null) {
        id = action.id; times.began = world.time; asked = footing(); foeBegan ??= sensed();
        const kind = skillOf(skills.actions.kit, action.action);
        const registered = kind !== null && catalog.isKind(kind) && catalog.partOf({ kind }).role === "executor";
        meets = (registered ? catalog.partLookup.of("executor", { kind: kind! }).meets : undefined) ?? "blunt";
        const face = armed && hand !== null ? faceOf(spec, hand, meets) : null;
        if (face) aim = points.get(face.point)!.value;
        bonked = armed && mark === "high" && meets === "blunt" && swells.size > 0 && headOf !== undefined && crown !== undefined && shaftEnds.every((one) => one !== undefined);
        againstChest(rest);
      }
      if (action && action.id === id) {
        if (action.phase === "commit" && times.committed === null) times.committed = world.time;
        if (action.phase === "release" && times.released === null) times.released = world.time;
      }
      if (id !== null && times.ended === null && !skills.report.actions.some((one) => one.id === id)) times.ended = world.time;
      motion?.take(world.time, action && action.id === id ? action.phase : null);
      const aimed = action && action.id === id ? action.aim : null;
      const tip = !aimed ? null : hand === null || armed ? pointOfToRef(limb, aim, point) : view?.pointMotion[effector]?.knuckles?.position ?? null;
      if (aimed && tip) {
        const dx = tip.x - aimed[0], dy = tip.y - aimed[1], dz = tip.z - aimed[2], apart = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (nearest === null || apart < nearest) nearest = apart;
      }
      if (drill.phase === "let go" && letAt === null && watching === null) { letAt = world.time; againstChest(was); }
      else if (letAt === null && watching === null && times.ended !== null) { watching = times.ended; againstChest(was); }
      else if ((letAt ?? watching) !== null && again === null) {
        againstChest(held);
        const moved = Vector3.Distance(held, was) / world.dt;
        if (Vector3.Distance(held, rest) <= BACK.within && moved <= BACK.still) { again = world.time; if (letAt === null) exit = { range: range() }; }
        was.copyFrom(held);
      }
      if (id === null) {
        phase = drill.phase;
        if ((phase === "ready" || phase === "striking") && ready === null) { ready = world.time; foeBegan ??= sensed(); }
        reason = drill.reason;
      }
      if (id !== null && times.ended === null) {
        pointOfToRef(limb, far, farAt);
        pointOfToRef(limb, aim, point);
        if (arm) {
          pointOfToRef(arm.upperArm, arm.shoulderJoint.centre.value, shoulder);
          up.set(0, 1, 0).applyRotationQuaternionToRef(turnOfToRef(chest, turn), up);
          path.push(world.time, point.x, point.y, point.z, shoulder.x, shoulder.y, shoulder.z,
            jointAngles(arm.elbow, angles)[0]! - arm.straight, acos(Math.max(-1, Math.min(1, up.y))), farAt.x, farAt.y, farAt.z);
        } else {
          path.push(world.time, point.x, point.y, point.z, 0, 0, 0, 0, 0, farAt.x, farAt.y, farAt.z);
        }
        if (bonked) {
          pointOfToRef(limb, limb.frame.origin, grip); pointOfToRef(headOf!, crown!, top);
          pointOfToRef(limb, shaftEnds[0]!, shaftFrom); pointOfToRef(limb, shaftEnds[1]!, shaftTo);
          const sx = shaftTo.x - shaftFrom.x, sy = shaftTo.y - shaftFrom.y, sz = shaftTo.z - shaftFrom.z, s = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
          club.push(world.time, grip.y, top.y, point.x, point.y, point.z, sx / s, sy / s, sz / s);
          if (touch === null) for (const one of world.physics.contactsOf(limb.body)) {
            const on = one.other ? foeSegments.get(one.other.id) : undefined;
            if (on !== undefined && one.pairs.some((pair) => pair.impulse > 0)) {
              touch = { time: world.time, swell: one.pairs.some((pair) => pair.impulse > 0 && swells.has(pair.mine)), on };
              break;
            }
          }
        }
      }
      down ||= left.body.down;
    },
    get ended() {
      const watched = letAt ?? watching;
      return world.time >= ending.seconds || times.ended !== null && world.time >= times.ended + ending.settle
        && (again !== null || watched !== null && world.time >= watched + ending.recover)
        || id === null && handed !== null && world.time >= handed + ending.settled + ending.patience;
    },
    reading() {
      // The trial's blows: those from the step the drill had the body, the bout's start but in a fight, whose earlier blows are the fight's.
      const from = handed ?? 0;
      let taken = 0, opening = 0;
      for (const blow of duel.blows) for (const side of blow.sides)
        if (blow.time >= from && side.fighter === "left" && blow.sides.some((other) => other.fighter === "right")) {
          taken += side.damage;
          if (letAt !== null && blow.time >= letAt && blow.time <= (again ?? world.time)) opening += side.damage;
        }
      const touches = duel.blows.flatMap((blow) => {
        if (blow.kind !== "impact" || blow.time < from) return [];
        const k = blow.sides.findIndex((side) => side.fighter === "left"), by = blow.sides[k], on = blow.sides[1 - k];
        if (!by || !on || on.fighter !== "right" || on.item !== null) return [];
        const sign = k === 0 ? 1 : -1, normal = [blow.normal[0] * sign, blow.normal[1] * sign, blow.normal[2] * sign] as const;
        return [{ contact: { time: blow.time, by: by.segment, on: on.segment, closing: blow.closing, energy: blow.energy, damage: on.damage, kg: by.kg, struck: on.kg,
          mechanism: on.mechanism ?? "blunt" }, normal }];
      });
      const live = (time: number) => times.began !== null && time >= times.began && time <= (times.ended ?? world.time);
      const byLimb = touches.filter(({ contact }) => contact.by === effector && live(contact.time));
      const hits = byLimb.filter(({ contact }) => marked.has(contact.on)).map(({ contact, normal }): StrikeHit => {
        const travel = approach(contact.time), at = stepBefore(contact.time);
        const straight = travel && travel.direction[0] * normal[0] + travel.direction[1] * normal[1] + travel.direction[2] * normal[2];
        if (hand === null) {
          const foot = { speed: travel?.speed ?? 0, bar: bar.foot };
          return { ...contact, speed: travel?.speed ?? null, straight, along: null, bend: null, lean: null, foot, held: null,
            fast: foot.speed >= foot.bar, heavy: null, square: null, soon: null, lined: null, extended: null, upright: null, hard: null, faced: null, overhead: null };
        }
        const ax = path[at + 1]! - path[at + 4]!, ay = path[at + 2]! - path[at + 5]!, az = path[at + 3]! - path[at + 6]!, arm = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
        const along = travel && (travel.direction[0] * ax + travel.direction[1] * ay + travel.direction[2] * az) / arm;
        const bent = at < 0 ? Math.PI : path[at + 7]!, leaning = at < 0 ? Math.PI : path[at + 8]!;
        if (armed) {
          const judged = meets === "point" ? { value: contact.closing, bar: bar.held.point }
            : meets === "edge" ? { value: approach(contact.time, 9)?.speed ?? 0, bar: bar.held.edge }
            : { value: contact.energy, bar: (bonked ? bar.overhead.energy : bar.held.energy) * pairShare(contact.kg, contact.struck, target) };
          return { ...contact, speed: travel?.speed ?? null, straight, along, bend: bent, lean: leaning, foot: null, held: judged,
            fast: null, heavy: null, square: null, soon: null, lined: null, extended: null, upright: null, hard: judged.value >= judged.bar,
            faced: contact.mechanism === meets, overhead: bonked ? overheadOf(contact.time, contact.energy, judged.bar, travel, bent) : null };
        }
        return { ...contact, speed: travel?.speed ?? null, straight, along, bend: bent, lean: leaning, foot: null, held: null,
          fast: travel !== null && travel.speed >= bar.speed[hand], heavy: contact.kg >= bar.mass[hand], square: straight !== null && straight >= coneCosine,
          soon: times.began !== null && contact.time - times.began <= bar.within,
          lined: along !== null && along >= alongCosine, extended: bent <= bend, upright: leaning <= lean, hard: null, faced: null, overhead: null };
      });
      const fastest = hits.reduce<StrikeHit | null>((best, one) => best === null || (one.speed ?? 0) > (best.speed ?? 0) ? one : best, null);
      const hit = hand === null ? fastest : hits.find(hit => hit.faced !== false) ?? fastest;
      const ledger = id === null ? undefined : skills.report.ledger.find((record) => record.id === id);
      const outcome: StrikeOutcome = handed === null ? "unreached" : lay === false ? "unlaid" : down ? "fell" : hit ? hit.faced !== false && times.ended !== null && (hit.overhead === null || hit.overhead.short.length === 0) ? "landed" : "weak"
        : byLimb.length ? byLimb.every(({ contact }) => arms.has(contact.on)) ? "guarded" : "elsewhere"
        : times.committed !== null ? "missed" : id !== null ? "abandoned" : phase === "position" ? "outside" : phase === "waiting" ? "waiting" : phase === "striking" ? "unbegun" : "refused";
      const foe = foeBegan ?? atHand;
      const dealt: Record<string, number> = {};
      for (const { contact } of touches) dealt[contact.on] = (dealt[contact.on] ?? 0) + contact.damage;
      return { outcome, phase, foePhase: foe?.phase ?? null, foeAt: foe?.at ?? null, inWindow: foe?.window ?? null, reason, handed, ready: ready ?? times.began, asked, ...times, ending: ledger?.ending.kind ?? null, hit, bar, dealt, taken,
        ...(letAt === null ? {} : { letGo: { at: letAt, again, opening } }),
        recovers: watching !== null && again !== null ? again - watching : null, nearest, exit, down, seconds: world.time,
        ...(motion ? { motion: motion.reading() } : {}) };
    },
  };
}
