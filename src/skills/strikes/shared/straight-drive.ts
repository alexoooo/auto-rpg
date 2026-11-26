import { heldAt } from "../../../core/bodies/spec/body.ts";
import { segmentResource, LEG_RESOURCE, TRUNK_RESOURCE } from "../../framework/action.ts";
import { supportHeight } from "../../../control/support-reference.ts";

import { Vector3 } from "../../../core/math/vector.ts";
import type { Body, BodyView } from "../../../control/body.ts";
import { bodyEffectors, copyFreedoms, type Freedom } from "../../../control/effectors.ts";
import { intoFrameToRef, pointAtToRef, reachWork, solveReach } from "../../../control/kinematics.ts";
import type { MusclePush } from "../../../control/motor.ts";
import type { Pose } from "../../../core/bodies/spec/pose.ts";
import { atan2, cos, hypot, sin } from "../../../core/math/real.ts";
import { channelName } from "../../../core/bodies/muscle/driver.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { Vec3 } from "../../../core/quantity.ts";
import type { ActionEnding, ActionRequest, Executor, LifecycleUpdate, Readiness, Resource, TargetResolver } from "../../framework/action.ts";
import type { LegsGoal } from "../../framework/skill.ts";
import type { ContactTarget } from "../../../core/bodies/contact-identity.ts";
import { bodiesClear, clearAhead, quietToStrike, strikeWindow, trunksClear } from "./strike-window.ts";
import type { BodySense } from "../../../core/bodies/senses.ts";
import { sensedActionTarget } from "../../framework/action-aim.ts";
import { stepShare, timedPushes, validPush, type TimedPush } from "./timed-push.ts";
import { handConfiguration, closesToStrike } from "../../reach/hand.ts";
import { keepsWalk, steerChannels, steerFeatures, stanceAsks, steerPushes, type SteerLayout } from "./steer.ts";
import type { StrikingFace } from "./held-face.ts";
import { act, ask, learnerOf, start, stop } from "../../../core/math/learning/learner.ts";
import { legOf } from "../../locomotion/shared/leg.ts";

import { fistOn } from "../../../core/bodies/human/endpoints.ts";
import { heldFrame } from "../../../core/bodies/build/rigid.ts";
import { faceAligner } from "./face-aligner.ts";
import { type Side, otherSide, SIDES } from "../../../core/bodies/bilateral.ts";

/** The turn about up that brings `hand`'s shoulder forward: a turn of a positive angle about up carries a body's right (+x) back (-z). */
const turnSense = (hand: Side): 1 | -1 => hand === "right" ? -1 : 1;

/**
 * **A straight drive's settings.** It is admitted with the body moving no faster than `pace`
 * m/s, facing the target, with it `reach` of the arm's straight length (shoulder to striking point)
 * from the striking shoulder, no more than `band` m further across the ground and no nearer than
 * `CROWDED`, and no more than `aside` m (`band` where unset) to either side of the line it faces
 * (with `squared`, of the line the striking shoulder faces along as the drive carries it, so a
 * target is struck from in front of that shoulder rather than across the body),
 * the target no more than `reach` of the arm above or below the shoulder, nor more than `above` m
 * above it where given, and with `poised` its stance already quiet (`quietToStrike`), so that it never
 * waits to settle while a foe closes (`driveReadiness`: the mind brings the body there), and stands for `settle` s with
 * both feet bearing (no foot swinging in a step), its striking point set on the
 * line from the shoulder to the target `chamber` m from the shoulder (none at 0). Then the hips
 * turn its striking shoulder forward by `hips` rad (the stance's heading, `Claim.steer`), the
 * chest by `turn` rad and the trunk leans `lean` rad, and `lead` s later the arm is driven at its
 * contact pose: straight at a point `through` m past the target along the line from the shoulder,
 * the elbow `elbow` s after the rest of the arm, so the upper arm lifts the hand to the line
 * before the forearm opens along it. Each channel is pushed flat out until it is within `brake`
 * rad of its goal, then held there by the posture. The drive ends `follow` s after the hand begins
 * to touch something, or `longest` s after it began; the arm comes back to the guard over
 * `recover` s. With `halts`, it stops a walk at once from its
 * start (`LegsGoal.halt`, `StanceGoal.halt`): a step not yet lifted is not taken. With `timed`, a
 * channel the striking hand's schedule names is not pushed toward its goal: each of its pushes
 * (`TimedPush`) drives the channel flat out over its own window of the drive. A channel it does
 * not name is pushed toward its goal as above, and the posture beneath is the one above. With `fire`,
 * the arm's drive begins as soon as the fist comes within `fire` of the arm's length of
 * the target, if that is before `lead`: the arm opens at the same distance whatever the range.
 * With `steered`, every decision interval of its layout it reads itself (`steerFeatures`, into its
 * state's `features`) and adds its state's `steer` to the pushes of its trunk and arm
 * (`steerPushes`) and asks the stance with it (`stanceAsks`): a turn added to the legs' heading
 * (`LegsGoal.heading`) and a shift of its centre from the support's middle (`LegsGoal.centre`),
 * and keeps a walk under way or halts it in place of `halts` (`keepsWalk`), as its layout lays
 * the steer out (`StraightDriveOptions.layout`); the steer is its trainer's to set, and none
 * at the drive's start. With `deeper`, its window sends a walk under way `deeper` m
 * past its spot toward the target while its blow is live (`Window.through`), so the body travels
 * into the blow. With `inside`, its window keeps the two trunks clear and lets the hands meet
 * (`trunksClear`), so it may be thrown from inside the guards; else every segment of either body
 * (`bodiesClear`).
 */
export interface StraightDrive {
  readonly pace: number;
  readonly reach: number;
  readonly band: number;
  readonly aside?: number;
  readonly squared?: boolean;
  readonly poised?: boolean;
  readonly above?: number;
  readonly settle: number;
  readonly through: number;
  readonly hips: number;
  readonly turn: number;
  readonly lean: number;
  readonly chamber: number;
  readonly lead: number;
  readonly elbow: number;
  readonly brake: number;
  readonly follow: number;
  readonly longest: number;
  readonly recover: number;
  readonly halts?: boolean;
  readonly fire?: number;
  readonly deeper?: number;
  readonly inside?: boolean;
  readonly steered?: boolean;
  readonly timed?: { readonly left: readonly TimedPush[]; readonly right: readonly TimedPush[] };
}

/** The settings every straight drive names; the rest are its options. */
const REQUIRED = ["pace", "reach", "band", "settle", "through", "hips", "turn", "lean", "chamber", "lead", "elbow", "brake", "follow", "longest", "recover"] as const;

/** Every setting a straight drive may name (`StraightDrive`). */
export const STRAIGHT_DRIVE_KEYS: readonly (keyof StraightDrive)[] = Object.freeze([...REQUIRED, "aside", "squared", "poised", "above", "halts",
  "fire", "deeper", "inside", "steered", "timed"]);

/**
 * Whether `settings`, some of a straight drive's, are each valid: finite and not negative but the
 * chamber, the pace, reach, band and drive's length positive, each option of its kind.
 */
export function validStraightDrivePart(settings: Partial<StraightDrive>): boolean {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return false;
  const flag = (value: unknown) => value === undefined || typeof value === "boolean";
  return REQUIRED.every((key) => settings[key] === undefined || Number.isFinite(settings[key]) && (settings[key] >= 0 || key === "chamber"))
    && (["pace", "reach", "band", "longest"] as const).every((key) => settings[key] === undefined || settings[key] > 0)
    && flag(settings.halts) && flag(settings.squared) && flag(settings.poised) && flag(settings.steered) && flag(settings.inside)
    && (settings.fire === undefined || Number.isFinite(settings.fire) && settings.fire >= 0)
    && (settings.deeper === undefined || Number.isFinite(settings.deeper) && settings.deeper >= 0)
    && (settings.aside === undefined || Number.isFinite(settings.aside) && settings.aside > 0)
    && (settings.above === undefined || Number.isFinite(settings.above))
    && (settings.timed === undefined || HANDS.every((hand) => Array.isArray(settings.timed![hand]) && settings.timed![hand].every(validPush)));
}

/** Whether `settings` are a straight drive's: each it names valid (`validStraightDrivePart`), and every one it must name named. */
export function validStraightDrive(settings: Partial<StraightDrive>): settings is StraightDrive {
  return validStraightDrivePart(settings) && REQUIRED.every((key) => settings[key] !== undefined);
}

/** Why a body of `spec` cannot take `settings`' schedule, or null: a channel it pushes that the body lacks. */
export function timedChannelFault(spec: BodySpec, settings: Pick<StraightDrive, "timed">): string | null {
  const channels = new Set(spec.joints.flatMap((joint) => joint.dofs.map((dof) => `${joint.name} ${dof.positive}`)));
  const missing = settings.timed ? HANDS.flatMap((hand) => settings.timed![hand].map((push) => push.channel)).filter((channel) => !channels.has(channel)) : [];
  return missing.length ? `has no ${missing.join(", ")} to push` : null;
}

/** Whether a body of `spec` can throw a straight drive: a hand effector each side that makes a fist (`fistOn`), below a chest, and a thoracic joint that turns it. */
export function straightDriveFits(spec: BodySpec): boolean {
  const hand = (side: Side) => spec.effectors?.some((e) => e.segment === `hand.${side}` && e.base === "upperTrunk" && fistOn(spec, side) === e.segment) ?? false;
  return hand("left") && hand("right") && spec.joints.some((j) => j.name === "thoracic");
}

/** How far behind the striking point a face's second point is set along its facing, m: the lever the arm's solve turns the item by. */
const FACE_LEVER = 0.3;

/** What a hand's straight drive moves: the arm's chain from the root, its free freedoms, the trunk's, and the shoulder. */
interface Limb {
  readonly chain: ReturnType<typeof bodyEffectors>[number]["chain"];
  /** The arm's freedoms (`solveReach`), each drawn toward the contact pose's preferred angle. */
  readonly free: Freedom[];
  readonly work: ReturnType<typeof reachWork>;
  /** The striking point, body frame, reference pose, and its name. */
  readonly point: Vec3;
  readonly aim: string;
  /** With a face, a point of the hand `FACE_LEVER` m behind the striking point against its facing, body frame, reference pose; null for a fist. */
  readonly behind: Vec3 | null;
  /** The chain's joints before the arm's, and the shoulder's centre on the last of their segments. */
  readonly trunk: number;
  readonly shoulder: Vec3;
  /** The shoulder to the striking point with the elbow straight and the wrist on line, m. */
  readonly arm: number;
  /** The chain's joints before the arm's, their channels and their rows of `angles`. */
  readonly trunkChain: Limb["chain"];
  readonly trunkNames: readonly (readonly string[])[];
  readonly trunkAngles: number[][];
  /** The trunk's goals at contact, by channel: the chest's turn and the lean, each the way that brings this shoulder forward. */
  readonly goals: readonly { readonly channel: string; readonly joint: number; readonly k: number; readonly angle: number }[];
  /** The trunk's turning channels, the chest's and then the waist's, each of those it has; and the elbow's. */
  readonly turns: readonly string[];
  readonly elbow: ReadonlySet<string>;
  /** The angles the solve works in, by chain joint. */
  readonly angles: number[][];
}

/** Where a straight drive is: standing at its stand-off, driven, or coming back. */
type Phase = "settle" | "swing" | "return";

const HANDS: readonly Side[] = SIDES;

/** The most a component of the target's velocity counts, m/s: a foe's lunge is under it, the aim's jump from one opening to another is cut to it. */
const AIM_SPEED = 4;

const facingWork = new Vector3();
/**
 * The way `foe`'s body faces, world, into `out` (made where null): its upper trunk's forward, the
 * segment's local -z (a standing body's faces its heading), a unit vector; null where no body is
 * seen or it has no upper trunk.
 */
function faceOf(foe: BodySense | null, out: [number, number, number] | null): [number, number, number] | null {
  const trunk = foe?.segments.get("upperTrunk");
  if (!trunk) return null;
  facingWork.set(0, 0, -1).applyRotationQuaternionToRef(trunk.rotation, facingWork);
  const into = out ?? [0, 0, 0];
  into[0] = facingWork.x; into[1] = facingWork.y; into[2] = facingWork.z;
  return into;
}

/**
 * Where `foe`'s forearms are, world, into `out` (made where null): the left's centre, then the
 * right's; null where no body is seen or it has not both.
 */
function guardOf(foe: BodySense | null, out: number[] | null): number[] | null {
  const left = foe?.segments.get("forearm.left"), right = foe?.segments.get("forearm.right");
  if (!left || !right) return null;
  const into = out ?? [0, 0, 0, 0, 0, 0];
  into[0] = left.centre.x; into[1] = left.centre.y; into[2] = left.centre.z;
  into[3] = right.centre.x; into[4] = right.centre.y; into[5] = right.centre.z;
  return into;
}

/** What a straight drive's skill gives it beyond its settings (`straightDriveExecutor`). */
export interface StraightDriveOptions {
  /** What the skill is called in its errors and reasons. */
  readonly label: string;
  /** How its steer reads and pushes (`SteerLayout`): its network's inputs and outputs. */
  readonly layout: SteerLayout;
  /** The hands that strike with a held face (`StrikingFace`), gripped; a hand it names none for is refused. Absent, each hand strikes with its fist. */
  readonly faces?: Partial<Record<Side, StrikingFace>>;
  /** Its steer from what it reads, where a network steers it. */
  readonly policy?: (features: readonly number[]) => number[];
  /** How it throws its commit, and what it does with the legs (`Throw`): the drive's own (`DRIVE_THROW`) or its skill's. */
  readonly throws: ThrowMaker;
}

/**
 * **How a straight drive's executor throws** (`StraightDriveOptions.throws`), made for one
 * executor: what it holds as a hand strikes, whether the body is quiet enough to begin its commit,
 * what a touch is its touch, its posture and pushes each step of its commit, when that is over, the
 * channels it leaves alone, and the legs goal it gives. Its window, its preparation and its return
 * are the drive's (`straightDriveExecutor`).
 */
export interface Throw {
  /** Its memory (`src/core/state.ts`): what it keeps through one commit. */
  readonly state: object;
  /** What it holds as `hand` strikes: the hand, the trunk, and the legs where it stands on them. */
  holds(hand: Side): readonly Resource[];
  /** Whether `view`'s body is quiet enough to begin its commit, once its `settle` s have passed. */
  quiet(view: BodyView): boolean;
  /** Its commit begun: what it keeps through one commit set anew. */
  begin(): void;
  /** Whether a touch of the striking hand on `met` is its touch: what its commit's `touched` counts from. */
  touches(met: ContactTarget | undefined): boolean;
  /** Its posture as `hand` throws, `since` s into its commit and touched `touched` s ago (null before), its pushes added to `pushes`. */
  drive(view: BodyView, hand: Side, since: number, touched: number | null, pushes: MusclePush[]): Pose;
  /** Whether its commit is over, `since` s in and touched `touched` s ago (null before). */
  done(since: number, touched: number | null): boolean;
  /** The channels it asks nothing of as `hand` strikes, of its posture and its pushes. */
  leaves(hand: Side): ReadonlySet<string>;
  /** Its legs goal as `hand` strikes in `phase`, its body `lower` m below its support's height, the legs heading `heading`; null where it leaves the legs to whatever walks them. */
  legs(view: BodyView, hand: Side, phase: "prepare" | "commit" | "release", lower: number, heading: number): LegsGoal | null;
}

/** **A throw made for one executor** (`Throw`), of its body, its guard, its technique (`StraightTechnique`), its settings and its steer. */
export type ThrowMaker = (made: { readonly body: Body; readonly guard: Pose; readonly technique: StraightTechnique; readonly settings: StraightDrive;
  readonly policy: ((features: readonly number[]) => number[]) | undefined }) => Throw;

/** What a reach finds (`StraightTechnique`'s `reach`): what a throw of a skill's own solves its arm by. */
export interface StrokeReach {
  /** The shoulder to the target, m; how far along that line the striking point stands, m; the arm straight, shoulder to striking point, m. */
  readonly apart: number;
  readonly along: number;
  readonly arm: number;
  /** The trunk's contact goals: the chest's turn and the lean that bring the shoulder forward (`StraightDrive.turn`, `lean`). */
  readonly trunk: readonly Goal[];
  /** The trunk's turning channels, the chest's and then the waist's, each of those it has; and the elbow's, among the arm's. */
  readonly turns: readonly string[];
  readonly elbow: ReadonlySet<string>;
  /** The arm's angles the reach asks. */
  readonly pose: readonly Goal[];
}

/** A channel and the angle it is driven to, rad. */
export interface Goal { readonly channel: string; readonly angle: number }

/**
 * **A straight drive**: a hand's blow thrown with the arm lined up behind its striking point, so
 * that it meets its target with the arm's mass behind it rather than an elbow giving way. Admitted
 * with the target `reach` from the head, facing it (`driveReadiness`), it
 * stands there `settle` s with both feet bearing, its striking point on the line (its chamber): a stance
 * shifting its weight for a step still bears on both, and so counts while the body moves no
 * faster than a shift's pace (`quietToStrike`), since waiting for the step to land costs it
 * blows. Then it turns the hips and the chest and leans the trunk to bring the striking shoulder
 * forward, and drives the arm, `lead` s behind, at its contact pose, solved each step for where the target is (`solveReach`): the striking point on
 * the line from the shoulder, `through` m past the target, with the elbow straight and the wrist
 * on the line where the reach leaves them free. Each channel is pushed flat out toward its goal
 * and held once near it (`StraightDrive.brake`). After the drive it brings the arm back to the
 * guard and stands. An attack given up before the drive is dropped; a drive begun is thrown to its
 * end. It has the legs from its stand to its return, and the hand is closed throughout.
 */
function straightTechnique(body: Body, guard: Pose, settings: StraightDrive, { label, layout, faces }: StraightDriveOptions, { trained }: { readonly trained: boolean }) {
  const built = body.built, spec = built.spec, sense = { left: turnSense("left"), right: turnSense("right") };
  if (!straightDriveFits(spec)) throw new Error(`${spec.model} cannot throw the ${label}`);
  const effectors = bodyEffectors(built), at = new Vector3(), before = new Vector3();
  const limbOf = (hand: Side): Limb => {
    const effector = effectors.find((e) => e.segment.spec.name === `hand.${hand}`)!, face = faces?.[hand];
    const { chain } = effector, trunk = effector.free[0]!.joint, aim = face?.point ?? effector.model.point;
    if (!effector.points.has(aim)) throw new Error(`${spec.model}'s ${hand} hand has no point ${aim} to strike with`);
    const held = face ? heldAt(spec, `hand.${hand}`) : undefined;
    if (face && !held) throw new Error(`${spec.model}'s ${hand} hand holds nothing to strike with`);
    /** The face's facing in the body frame, reference pose, and the point behind the striking point against it. */
    const behind = held && face ? (() => {
      const frame = heldFrame(held), f = face.facing, p = effector.points.get(aim)!;
      const way = [0, 1, 2].map((k) => frame.x[k]! * f[0] + frame.y[k]! * f[1] + frame.z[k]! * f[2]), length = hypot(way[0]!, way[1]!, way[2]!);
      return [0, 1, 2].map((k) => p[k]! - way[k]! / length * FACE_LEVER) as unknown as Vec3;
    })() : null;
    const angles = chain.map((joint) => joint.dofs.map(() => 0));
    const shoulder = chain[trunk]!.spec.centre.value;
    // Each trunk freedom named, signed by which way of it carries the shoulder forward (+z) from the reference pose.
    const goals: Limb["goals"][number][] = [];
    /** The trunk's freedom of `joint` whose channel `pattern` matches, by its chain joint and its place there; null where it has none. */
    const freedomOf = (joint: string, pattern: RegExp): { readonly j: number; readonly k: number } | null => {
      const j = chain.findIndex((c) => c.spec.name === joint);
      if (j < 0 || j >= trunk) return null;
      const k = chain[j]!.dofs.findIndex((_, i) => pattern.test(channelName(chain[j]!, i)));
      return k < 0 ? null : { j, k };
    };
    const goal = (joint: string, pattern: RegExp, amount: number) => {
      const found = freedomOf(joint, pattern);
      if (!found) return;
      const { j, k } = found, dof = chain[j]!.dofs[k]!.spec;
      pointAtToRef(chain.slice(0, trunk), angles.slice(0, trunk), shoulder, before);
      angles[j]![k] = 0.1;
      pointAtToRef(chain.slice(0, trunk), angles.slice(0, trunk), shoulder, at);
      angles[j]![k] = 0;
      const angle = (at.z > before.z ? 1 : -1) * amount;
      goals.push({ channel: channelName(chain[j]!, k), joint: j, k, angle: Math.max(dof.min.value, Math.min(dof.max.value, angle)) });
    };
    goal("thoracic", /rotation/, settings.turn);
    goal("lumbar", /^lumbar flexion$/, settings.lean);
    const turns = ["thoracic", "lumbar"].flatMap((joint) => { const found = freedomOf(joint, /rotation/); return found ? [channelName(chain[found.j]!, found.k)] : []; });
    const elbow: ReadonlySet<string> = new Set(effector.free.filter((f) => /^elbow/.test(f.name)).map((f) => f.name));
    for (const f of effector.free) if (elbow.has(f.name)) angles[f.joint]![f.k] = f.min;
    pointAtToRef(chain, angles, effector.points.get(aim)!, at);
    for (const f of effector.free) angles[f.joint]![f.k] = 0;
    const arm = hypot(at.x - shoulder[0], at.y - shoulder[1], at.z - shoulder[2]);
    return { chain, free: copyFreedoms(effector.free), work: reachWork(effector.free.length), point: effector.points.get(aim)!, aim, behind,
      trunk, shoulder, arm, goals, turns, elbow, angles, trunkChain: chain.slice(0, trunk),
      trunkNames: chain.slice(0, trunk).map((joint) => joint.dofs.map((_, k) => channelName(joint, k))), trunkAngles: angles.slice(0, trunk) };
  };
  const limbs = { left: limbOf("left"), right: limbOf("right") };
  const forward = new Vector3();
  /** The way `frame`'s forward (+z, the reference pose's) faces about up, rad, as a heading is counted. */
  const facingOf = (frame: BodyView["root"]): number => {
    forward.set(0, 0, 1).applyRotationQuaternionToRef(frame.rotation, forward);
    return atan2(forward.x, forward.z);
  };
  /** The channels each hand's schedule names, which are pushed only on it. */
  const leg = legOf(body.built.spec), steeredChannels = { left: steerChannels("left", leg, layout), right: steerChannels("right", leg, layout) };
  const scheduled = { left: new Set((settings.timed?.left ?? []).map((p) => p.channel)), right: new Set((settings.timed?.right ?? []).map((p) => p.channel)) };
  const state = {
    hand: null as Side | null, phase: null as Phase | null,
    /**
     * What it last saw of its target as it aimed: the way the target's body faces, world, null
     * where none was seen (`faceOf`); and where its forearms are (`guardOf`). A commit that no
     * longer aims steers on by what it last saw.
     */
    seen: { facing: null as [number, number, number] | null, guard: null as number[] | null },
    /** Where it aims, world, the last target asked, and how fast that moved over the last step, m/s (`aimAt`); the way it faces as the drive began. */
    target: [0, 0, 0] as [number, number, number], aimed: [0, 0, 0] as [number, number, number], face: 0,
    /** Seconds stood at the stand-off on both feet; when the drive began, when its hand began to touch, whether it touched last step, and when it came back. */
    stood: 0, began: 0, touched: null as number | null, touching: false, ended: 0, now: 0, headY: 0,
    /** The last solve's shoulder to target, m, and how far along that line the striking point stood (`solve`). */
    apart: 0, along: 0,
    /** When the arm's drive began, s into the drive that began at `firedFor`, where `fire` began it before `lead`. */
    fired: null as number | null, firedFor: -1,
    /** The control step's length, s, as the last update had it: what a push covers of it. */
    step: 0,
    /**
     * With `steered`: its learner (`Learner`), running through the drive: what the drive last read
     * of itself (`steerFeatures`) every `layout.interval` s, and the steer it adds (`steerPushes`).
     */
    learner: learnerOf(layout.inputs.length, layout.interval, { running: false, trained }),
    still: 0, thrown: { left: 0, right: 0 },
    /**
     * Each shoulder at contact from the head as the last step left it, across, up and forward, m:
     * the shoulder from the pelvis with the trunk at its contact goals and the hips turned, the
     * pelvis upright over the centre of mass and facing the legs' heading (its own where the read
     * is given none), as it stands at contact; so neither where the pelvis points nor how far it
     * trails the centre of mass as the body walks moves it.
     */
    shoulders: { left: [0, 0, 0] as [number, number, number], right: [0, 0, 0] as [number, number, number] },
  };
  /**
   * How far across the ground the head stands from a target `up` m above it, facing it, for the
   * target to be `reach` of the arm from the `hand`'s shoulder as the drive carries it forward.
   */
  const standOff = (hand: Side, up: number): number => {
    const [across, high, ahead] = state.shoulders[hand], length = settings.reach * limbs[hand].arm, rise = up - high;
    const ground = Math.sqrt(Math.max(0, length * length - rise * rise));
    return Math.max(0, ahead + Math.sqrt(Math.max(0, ground * ground - across * across)));
  };
  const end = () => { state.hand = null; state.phase = null; state.touched = null; state.stood = 0; state.still = 0; stop(state.learner); };
  /** The motion enters `phase`: its learner runs through a steered swing alone. */
  const enter = (phase: Phase): void => {
    state.phase = phase;
    if (settings.steered === true && phase === "swing") start(state.learner); else stop(state.learner);
  };
  const target = new Vector3(), shoulder = new Vector3(), head = new Vector3(), apart = new Vector3(), face = new Vector3();
  /**
   * The arm's angles that put its striking point `out` m from the shoulder on the line to the
   * target, into the limb's `angles`: the `trunk` as it stands, or at its contact goals where
   * `turned`; the elbow drawn toward `elbow`, a fist's wrist toward the line, the shoulder and a
   * held face's wrist toward where they are, a held face's arm from its guard.
   */
  const solve = (view: BodyView, limb: Limb, { trunk, out, elbow }: {
    readonly trunk: TrunkAt; readonly out: (apart: number, along: number) => number; readonly elbow: number | null;
  }): void => {
    const { chain, angles, free, goals } = limb;
    chain.forEach((joint, j) => joint.dofs.forEach((_, k) => { angles[j]![k] = view.angles[channelName(joint, k)] ?? 0; }));
    if (trunk === "turned") for (const g of goals) angles[g.joint]![g.k] = g.angle;
    // A held face's arm is solved from the guard, wherever a chamber has drawn it: one contact pose, not the one nearest a drawn-back arm.
    if (limb.behind) for (const f of free) angles[f.joint]![f.k] = guard[f.name] ?? angles[f.joint]![f.k]!;
    intoFrameToRef(view.root, state.target, target);
    pointAtToRef(chain.slice(0, limb.trunk), angles.slice(0, limb.trunk), limb.shoulder, shoulder);
    const dx = target.x - shoulder.x, dy = target.y - shoulder.y, dz = target.z - shoulder.z, apart = hypot(dx, dy, dz) || 1;
    // How far along the line from the shoulder the striking point is as the body stands, m.
    const p = view.effectors[`hand.${limb === limbs.left ? "left" : "right"}`]?.points[limb.aim];
    const along = p ? ((p.x - shoulder.x) * dx + (p.y - shoulder.y) * dy + (p.z - shoulder.z) * dz) / apart : 0;
    state.apart = apart; state.along = along;
    const reach = out(apart, along) / apart;
    for (const f of free) f.preferred = limb.elbow.has(f.name) ? elbow ?? f.min : /^wrist/.test(f.name) && !limb.behind ? 0 : angles[f.joint]![f.k]!;
    const tx = shoulder.x + dx * reach, ty = shoulder.y + dy * reach, tz = shoulder.z + dz * reach, back = FACE_LEVER / apart;
    solveReach(chain, angles, free, limb.behind ? [{ point: limb.point, target: [tx, ty, tz] }, { point: limb.behind, target: [tx - dx * back, ty - dy * back, tz - dz * back] }]
      : [{ point: limb.point, target: [tx, ty, tz] }], undefined, limb.work);
  };
  /** The guard with the striking arm set on the line to the target, `chamber` m from the shoulder; the guard itself with no chamber. */
  const chamber = (view: BodyView, hand: Side): Pose | null => {
    if (settings.chamber === 0) return null;
    const limb = limbs[hand], posture: Record<string, number> = { ...guard };
    solve(view, limb, { trunk: "standing", out: () => settings.chamber, elbow: guard[`elbow.${hand} flexion`] ?? null });
    for (const f of limb.free) posture[f.name] = limb.angles[f.joint]![f.k]!;
    return posture;
  };
  /**
   * The posture and pushes of a drive `since` s old: the trunk's goals from its start; from `lead`
   * (or as `fire` begins it) the arm's contact pose, the striking point `through` m past the target
   * on the line from the shoulder, the elbow straight and the wrist on the line, the elbow from
   * `elbow` s later.
   */
  const drive = (view: BodyView, hand: Side, since: number, pushes: MusclePush[], policy?: (features: readonly number[]) => number[]): Pose => {
    const limb = limbs[hand], posture: Record<string, number> = { ...(chamber(view, hand) ?? guard) }, step = state.step;
    solve(view, limb, { trunk: "turned", out: (apart) => apart + settings.through, elbow: null });
    /** The share of this control step, from `since` for `step` s, that falls from `from` to `to`; with no step, whether `since` does. */
    const share = (from: number, to: number) => stepShare(since, step, from, to);
    const push = (channel: string, goal: number, part = 1) => {
      const error = goal - (view.angles[channel] ?? 0);
      if (!scheduled[hand].has(channel) && Math.abs(error) > settings.brake) pushes.push({ channel, sense: error > 0 ? 1 : -1, level: part });
      posture[channel] = goal;
    };
    if (settings.timed) timedPushes(settings.timed[hand], since, step, pushes);
    for (const g of limb.goals) push(g.channel, g.angle);
    if (state.firedFor !== state.began) { state.firedFor = state.began; state.fired = null; }
    if (settings.fire !== undefined && state.fired === null && since < settings.lead) {
      const fist = view.pointMotion[fistOn(spec, hand)!]!.knuckles!.position, dx = state.target[0] - fist.x, dy = state.target[1] - fist.y, dz = state.target[2] - fist.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= settings.fire * limb.arm) state.fired = since;
    }
    const start = state.fired ?? settings.lead;
    if (share(start, Infinity) > 0) {
      for (const f of limb.free) {
        const part = share(limb.elbow.has(f.name) ? start + settings.elbow : start, Infinity);
        if (part > 0) push(f.name, limb.angles[f.joint]![f.k]!, part);
      }
    }
    if (settings.steered) steer(view, hand, since, pushes, policy);
    return posture;
  };
  /**
   * The learned steer of a drive `since` s old added to `pushes` (`steerPushes`): every decision
   * interval it reads the drive (`steerFeatures`), the target where the last solve left it in the
   * body frame. A throw of a skill's own (`Throw`) may be steered alike, after it.
   */
  const steer = (view: BodyView, hand: Side, since: number, pushes: MusclePush[], policy?: (features: readonly number[]) => number[]): void => {
    const limb = limbs[hand], learner = state.learner, outputs = act(learner, policy);
    if (ask(learner, state.step)) {
      // The shoulder where the trunk stands, against the target the solve left in the body frame.
      const { chain, angles, trunk } = limb;
      for (let j = 0; j < trunk; j++) chain[j]!.dofs.forEach((_, k) => { angles[j]![k] = view.angles[channelName(chain[j]!, k)] ?? 0; });
      pointAtToRef(limb.trunkChain, angles, limb.shoulder, apart);
      steerFeatures({ body, view, hand, channels: steeredChannels[hand], since, fromShoulder: apart.set(target.x - apart.x, target.y - apart.y, target.z - apart.z),
        target: state.target, aimed: state.aimed, touching: (view.effectors[`hand.${hand}`]?.feedback?.impulse ?? 0) > 0, arm: limb.arm,
        strike: limb.behind ? struck(view, hand, limb) : null, facing: state.seen.facing, guard: state.seen.guard }, learner.inputs);
    }
    steerPushes(pushes, steeredChannels[hand], outputs);
  };
  /** Where a held face's striking point is, world, as `view` has it. */
  const struck = (view: BodyView, hand: Side, limb: Limb): Vector3 =>
    view.effectors[`hand.${hand}`]!.points[limb.aim]!.applyRotationQuaternionToRef(view.root.rotation, face).addInPlace(view.root.position);
  const read = (view: BodyView, heading?: number) => {
      // The head from the centre of mass, across and forward of the way the legs head, and up from the pelvis.
      const r = view.root, centre = view.stance.centre, h = heading ?? facingOf(r), c = cos(h), sn = sin(h);
      const dx = view.head.x - centre.x, dz = view.head.z - centre.z;
      head.set(dx * c - dz * sn, view.head.y - r.position.y, dx * sn + dz * c);
      state.headY = view.head.y;
      for (const side of HANDS) {
        const limb = limbs[side], { trunkChain, trunkNames, trunkAngles } = limb;
        for (let j = 0; j < trunkChain.length; j++) {
          const names = trunkNames[j]!, row = trunkAngles[j]!;
          for (let k = 0; k < names.length; k++) row[k] = view.angles[names[k]!] ?? 0;
        }
        for (const g of limb.goals) trunkAngles[g.joint]![g.k] = g.angle;
        pointAtToRef(trunkChain, trunkAngles, limb.shoulder, shoulder);
        // The hips' turn swings the shoulder forward about up through the root.
        const h = settings.hips, toward = shoulder.x < 0 ? -1 : 1, x = shoulder.x * cos(h) - toward * shoulder.z * sin(h), z = toward * shoulder.x * sin(h) + shoulder.z * cos(h);
        const into = state.shoulders[side];
        into[0] = x - head.x; into[1] = shoulder.y - head.y; into[2] = z - head.z;
      }
  };
  /** Aims at `at`, world, and reads how fast the target moved since it aimed `dt` s before (at rest with none). */
  const aimAt = (at: readonly number[], dt = 0): void => {
    for (let i = 0; i < 3; i++) {
      state.aimed[i] = dt > 0 ? Math.max(-AIM_SPEED, Math.min(AIM_SPEED, (at[i]! - state.target[i]!) / dt)) : 0;
      state.target[i] = at[i]!;
    }
  };
  /**
   * The arm's pose that puts its striking point `out(apart, along)` m from the shoulder on the line
   * to the target (`apart` m from it, the striking point now `along` m along it), the elbow drawn
   * straight and the wrist onto the line, with the `trunk` as it stands or at its contact goals where
   * `turned` (`StrokeReach`).
   */
  const reach = (view: BodyView, hand: Side, { out, trunk }: { readonly out: (apart: number, along: number) => number; readonly trunk: TrunkAt }): StrokeReach => {
    const limb = limbs[hand];
    solve(view, limb, { trunk, out, elbow: null });
    return { apart: state.apart, along: state.along, arm: limb.arm, trunk: limb.goals.map((g) => ({ channel: g.channel, angle: g.angle })), turns: limb.turns, elbow: limb.elbow,
      pose: limb.free.map((f) => ({ channel: f.name, angle: limb.angles[f.joint]![f.k]! })) };
  };
  return { state, end, enter, read, standOff, chamber, drive, steer, reach, sense, steeredChannels, aimAt,
    heightFits: (hand: Side, up: number) => Math.abs(up - state.shoulders[hand][1]) <= settings.reach * limbs[hand].arm
      && (settings.above === undefined || up - state.shoulders[hand][1] <= settings.above) };
}

/** Where a straight drive's arm is solved with the trunk: as it stands, or turned to its contact goals. */
export type TrunkAt = "standing" | "turned";

/** **A straight drive's technique** (`straightTechnique`): what a throw (`Throw`) drives, reaches and steers by. */
export type StraightTechnique = ReturnType<typeof straightTechnique>;

/** Nothing left alone. */
const NONE: ReadonlySet<string> = new Set();

/**
 * **The drive's own throw** (`Throw`): it holds its hand, the trunk and the legs and stands on
 * them; begins once the stance is quiet (`quietToStrike`); drives its technique's drive (`drive`:
 * its schedule, its brake and its steer) until `follow` s after its first touch or `longest` s; and
 * asks the legs to stand at its height, halted where its settings or its steer say, the hips
 * turned and the weight shifted as its steer asks (`stanceAsks`, `keepsWalk`).
 */
export const DRIVE_THROW: ThrowMaker = ({ technique, settings, policy }) => {
  const motion = technique.state, sides = { left: [segmentResource("hand.left"), TRUNK_RESOURCE, LEG_RESOURCE], right: [segmentResource("hand.right"), TRUNK_RESOURCE, LEG_RESOURCE] };
  return {
    state: {},
    holds: (hand) => sides[hand],
    quiet: quietToStrike,
    begin() {},
    touches: () => true,
    drive: (view, hand, since, _touched, pushes) => technique.drive(view, hand, since, pushes, policy),
    done: (since, touched) => touched !== null && touched >= settings.follow || since >= settings.longest,
    leaves: () => NONE,
    legs(view, hand, phase, lower, heading) {
      const sense = technique.sense[hand], shift: [number, number] = [0, 0];
      const turn = phase === "commit" ? stanceAsks(technique.steeredChannels[hand], motion.learner.outputs, motion.face, sense, shift) : 0;
      // The hips turned from the legs' heading, and the weight moved from the middle of the soles the stance stands on.
      const steer = phase === "commit" ? sense * settings.hips + turn : 0, support = view.stance.support;
      // A walk under way kept where the steer keeps it (`keepsWalk`), else stood, and halted where the steer or `halts` says.
      const keeps = phase === "commit" ? keepsWalk(technique.steeredChannels[hand], motion.learner.outputs) : null;
      return { ...(keeps ? {} : { walk: null }), face: motion.face, ...((keeps === null ? settings.halts : !keeps) ? { halt: true } : {}), height: supportHeight(view) - lower,
        ...(steer ? { heading: heading + steer } : {}),
        ...(shift[0] === 0 && shift[1] === 0 ? {} : { centre: [support.x + shift[0], support.z + shift[1]] as const }) };
    },
  };
};

/** A stopped approach must establish its local stroke within this many seconds. */
const PREPARE_LIMIT = 6;

/**
 * Whether `hand`'s straight drive at `at` (`technique`'s, with `settings`) can be thrown from where
 * the body stands, facing `heading`: blocked out of the arm's height band; else ready within its
 * window, its stand-off on the ground from the target, or the window to walk to; the window on the
 * body `on` names, where the target is on one.
 */
function driveReadiness(view: BodyView, technique: ReturnType<typeof straightTechnique>, settings: StraightDrive, hand: Side, at: Vec3, heading: number, clear: number, on: string | undefined): Readiness {
  const reach = technique.standOff(hand, at[1] - view.head.y);
  if (!technique.heightFits(hand, at[1] - view.head.y)) return { kind: "blocked", reason: "target is outside the arm's height band" };
  return strikeWindow(view, at, heading, { standOff: reach, band: settings.band, aside: settings.aside ?? settings.band,
    across: settings.squared ? technique.state.shoulders[hand][0] : 0, pace: settings.pace, poised: settings.poised === true, clear, ...(on === undefined ? {} : { on }),
    ...(settings.deeper ? { through: settings.deeper } : {}) });
}

/**
 * **A straight drive's executor**, the straight punch's and the sword thrust's: an instance owns
 * settling, its committed drive and its bounded guard return. Its skill gives it what it is
 * called, its steer's layout and the network that steers it, the faces its hands strike with,
 * and how it throws (`StraightDriveOptions`, `Throw`). With a held face, from its chamber
 * through its drive, the wrist turns the face onto the line from it to the target, facing first
 * (`faceAligner`), and the schedule's and the solve's pushes leave the wrist to it.
 */
export function straightDriveExecutor(body: Body, guard: Pose, actions: readonly string[], settings: StraightDrive,
  resolve: TargetResolver, options: StraightDriveOptions): Executor {
  const { label, faces, policy } = options;
  if (!validStraightDrive(settings)) throw new Error(`invalid ${label} settings`);
  const technique = straightTechnique(body, guard, settings, options, { trained: policy !== undefined }), motion = technique.state;
  const throws = options.throws({ body, guard, technique, settings, policy });
  technique.read(body.view);
  const clear = (settings.inside ? trunksClear : bodiesClear)(body.built.spec);
  const alignerOf = (hand: Side) => faces?.[hand] ? faceAligner(body.built.spec, hand, faces[hand]!) : null;
  const aligners = { left: alignerOf("left"), right: alignerOf("right") }, aimed = new Vector3(), toward = new Float64Array(3);
  const sides = { left: throws.holds("left"), right: throws.holds("right") } as const;
  const sideOf = (effector: string): Side => {
    if (effector === "hand.left") return "left";
    if (effector === "hand.right") return "right";
    throw new Error(`${label} has no effector ${effector}`);
  };
  const state = { motion, throws: throws.state, live: null as null | { request: ActionRequest; hand: Side; phase: "prepare" | "commit" | "release";
    stage: "admitting" | "settle" | "swing" | "return"; time: number; quiet: number; lower: number;
    withdrawn: boolean; ending: ActionEnding } };
  const release = (ending: ActionEnding) => {
    const live = state.live!; live.phase = "release"; live.stage = "return"; live.time = 0; live.ending = ending; technique.enter("return");
  };
  const sparse = (posture: Pose, hand: Side): Pose => Object.fromEntries(Object.entries(posture)
    .filter(([channel]) => !channel.includes(`.${otherSide(hand)} `) && !throws.leaves(hand).has(channel)));
  return {
    state,
    needs(_action, effector) { return sides[sideOf(effector)]; },
    readiness(view, action, effector, target, around) {
      if (!actions.includes(action)) return { kind: "blocked", reason: "unknown action" };
      if (effector !== "hand.left" && effector !== "hand.right") return { kind: "blocked", reason: "unsupported effector" };
      if (view.down) return { kind: "blocked", reason: "body is down" };
      if (faces && !faces[sideOf(effector)]) return { kind: "blocked", reason: "the hand holds nothing it strikes with" };
      if (state.live) return { kind: "waiting", reason: `${label} is striking or returning` };
      const at = resolve(view, target, action, effector);
      if (!at) return { kind: "blocked", reason: "target has no aim" };
      const foe = sensedActionTarget(view, target);
      return driveReadiness(view, technique, settings, sideOf(effector), at, around.heading, clearAhead(view, at, around.heading, foe, clear),
        target.kind === "body" ? target.body : undefined);
    },
    resume() { state.live = null; technique.end(); },
    interrupt(_view, id) { if (state.live?.request.id === id) { state.live = null; technique.end(); } },
    start(view, request, around) {
      if (state.live) throw new Error(`${label} already owns an instance`);
      const hand = sideOf(request.effector), at = resolve(view, request.target, request.action, request.effector);
      if (!at) throw new Error(`${label} target has no aim`);
      state.live = { request: { ...request }, hand, phase: "prepare", stage: "admitting", time: 0, quiet: 0, lower: around.lower,
        withdrawn: false, ending: { kind: "completed" } };
      motion.hand = hand; technique.enter("settle"); technique.aimAt(at); motion.face = atan2(at[0] - view.head.x, at[2] - view.head.z);
      motion.began = view.time; motion.now = view.time; motion.touched = null; motion.touching = false;
    },
    update(view, continued, around, dt) {
      technique.read(view, around.heading); motion.now = view.time; motion.step = dt;
      const live = state.live;
      if (!live) return [];
      if (view.down) { state.live = null; technique.end(); return [{ id: live.request.id, ending: { kind: "interrupted", reason: "body is down" } }]; }
      const request = continued.find(one => one.id === live.request.id);
      if (!request) live.withdrawn = true;
      // Its stroke's end is its exit: let go in its return, it hands the arm to the guard at once.
      if (live.phase === "release" && live.withdrawn) { state.live = null; technique.end(); return [{ id: live.request.id, ending: live.ending }]; }
      const source = request ?? live.request, at = resolve(view, source.target, source.action, source.effector);
      if (live.phase === "prepare" && (live.withdrawn || !at)) release(!at ? { kind: "lost", reason: "target is no longer sensed" } : { kind: "cancelled" });
      if (at && !live.withdrawn && live.phase !== "release") {
        technique.aimAt(at, dt);
        const foe = sensedActionTarget(view, source.target);
        const seen = technique.state.seen;
        seen.facing = faceOf(foe, seen.facing); seen.guard = guardOf(foe, seen.guard);
      }
      live.time += dt;
      if (live.phase === "prepare") {
        live.stage = "settle";
        const quiet = throws.quiet(view);
        live.quiet = quiet ? live.quiet + dt : 0;
        if (live.time >= PREPARE_LIMIT) release({ kind: "stalled", reason: "settling deadline" });
        else if (quiet && live.quiet >= settings.settle) {
          live.phase = "commit"; live.stage = "swing"; live.time = 0; technique.enter("swing"); throws.begin();
          motion.began = view.time; motion.touched = null; motion.face = atan2(motion.target[0] - view.head.x, motion.target[2] - view.head.z);
          motion.touching = (view.effectors[live.request.effector]?.feedback?.impulse ?? 0) > 0;
        }
      } else if (live.phase === "commit") {
        const feedback = view.effectors[live.request.effector]?.feedback;
        const touching = (feedback?.impulse ?? 0) > 0 && throws.touches(feedback?.contact?.target);
        if (touching && !motion.touching && motion.touched === null) motion.touched = view.time;
        motion.touching = touching;
        if (throws.done(live.time, motion.touched === null ? null : view.time - motion.touched)) release({ kind: "completed" });
      } else if (live.time >= settings.recover) {
        const ending = live.ending; state.live = null; technique.end(); return [{ id: live.request.id, ending }];
      }
      const updates: LifecycleUpdate[] = [{ id: live.request.id, phase: live.phase, stage: live.stage, holds: sides[live.hand], aim: motion.target }];
      return updates;
    },
    command(view, id, around) {
      const live = state.live;
      if (!live || live.request.id !== id) throw new Error(`${label} has no instance ${id}`);
      const pushes: MusclePush[] = [];
      const touched = motion.touched === null ? null : view.time - motion.touched;
      let posture = live.phase === "commit" ? throws.drive(view, live.hand, live.time, touched, pushes)
        : live.phase === "prepare" ? technique.chamber(view, live.hand) ?? guard : guard;
      const aligner = aligners[live.hand], at = faces?.[live.hand] && view.effectors[`hand.${live.hand}`]?.points[faces[live.hand]!.point];
      if (aligner && at && live.phase !== "release") {
        // The face's way to the target, from where it stands, body frame.
        intoFrameToRef(view.root, motion.target, aimed);
        toward[0] = aimed.x - at.x; toward[1] = aimed.y - at.y; toward[2] = aimed.z - at.z;
        posture = { ...posture };
        for (let k = pushes.length - 1; k >= 0; k--) if (aligner.channels.includes(pushes[k]!.channel)) pushes.splice(k, 1);
        aligner.ask(view, toward, posture as Record<string, number>, pushes);
      }
      const hand = faces?.[live.hand] ? handConfiguration(body.built.spec, `hand.${live.hand}`, "grip")
        : closesToStrike(body.built.spec, live.hand) ? handConfiguration(body.built.spec, `hand.${live.hand}`, "fist") : null;
      const leaves = throws.leaves(live.hand);
      for (let k = pushes.length - 1; k >= 0; k--) if (leaves.has(pushes[k]!.channel)) pushes.splice(k, 1);
      const arm = { posture: sparse(posture, live.hand), pushes, ...(hand ? { configurations: { [`hand.${live.hand}`]: hand } } : {}) };
      const legs = throws.legs(view, live.hand, live.phase, live.lower, around.heading);
      return legs ? { ...arm, legs } : arm;
    },
  };
}
