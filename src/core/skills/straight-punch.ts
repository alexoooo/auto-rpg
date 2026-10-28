import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyView } from "../body.ts";
import { bodyEffectors } from "../control/effectors.ts";
import { intoFrameToRef, pointAtToRef, reachWork, solveReach } from "../control/kinematics.ts";
import type { MusclePush, PointTask, Pose } from "../control/motor.ts";
import { atan2, cos, hypot, sin } from "../math/real.ts";
import { channelName } from "../muscle/driver.ts";
import type { BodySpec, Side } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import { type StrikeReport } from "./strike.ts";
import { turnSense } from "./whole-body-strike.ts";
import type { ActionEnding, ActionRequest, Executor, LifecycleUpdate, Readiness, TargetResolver } from "./action.ts";
import { withinActionWindow } from "../mind/action-window.ts";
import { closesToStrike } from "./strikes.ts";
import { PUNCH_DECIDE, punchChannels, punchFeatures, stanceAsks, steerPushes } from "./learned-punch.ts";
import { legOf } from "./gait-scale.ts";

/**
 * **A straight punch's settings.** It is admitted with the body moving no faster than `pace`
 * m/s, facing the target, with it `reach` of the arm's straight length (shoulder to knuckles)
 * from the punching shoulder, no more than `band` m further across the ground and no nearer than
 * `CROWDED`, and no more than `aside` m (`band` where unset) to either side of the line it faces
 * (with `squared`, of the line the punching shoulder faces along as the drive carries it, so a
 * target is struck from in front of that shoulder rather than across the body),
 * the target no more than `reach` of the arm above or below the shoulder, nor more than `above` m
 * above it where given, and with `poised` its stance already quiet (`quietToPunch`), so that it never
 * waits to settle while a foe closes (`punchReadiness`: the tactics bring the body there), and stands for `settle` s with
 * both feet bearing (no foot swinging in a step), its fist set on the
 * line from the shoulder to the target `chamber` m from the shoulder (none at 0). Then the hips
 * turn its punching shoulder forward by `hips` rad (the stance's heading, `Claim.steer`), the
 * chest by `turn` rad and the trunk leans `lean` rad, and `lead` s later the arm is driven at its
 * contact pose: straight at a point `through` m past the target along the line from the shoulder,
 * the elbow `elbow` s after the rest of the arm, so the upper arm lifts the fist to the line
 * before the forearm opens along it. Each channel is pushed flat out until it is within `brake`
 * rad of its goal, then held there by the posture; with `ease`, its push falls in proportion to what is
 * left within `ease` rad of the goal, so the arm settles on its line rather than pushing past it
 * each step. The drive ends `follow` s after the hand begins
 * to touch something, or `longest` s after it began; the arm comes back to the guard over
 * `recover` s. With `landed`, the drive also waits for both feet to bear: a step under way lands
 * first, as a boxer's lead foot lands with the jab. With `halts`, it stops a walk at once from its
 * start (`LegsGoal.halt`, `StanceGoal.halt`): a step not yet lifted is not taken. With `driven`, the arm is not pushed joint by
 * joint: from `lead` its striking point is driven (`PointTask`) to where the contact pose puts it,
 * at the speed `accel` m/s^2 gives it over what is left of the way, and no less than it gives over
 * `arrive` m, so the fist meets the target moving and the arm's range stops it; the velocity that
 * asks closed at `steer` per second and the ask no more than `accel`. The arm is drawn toward its
 * contact pose beneath it, and the whole-body solve gives what the muscles can. With `timed`, a
 * channel the punching hand's schedule names is not pushed toward its goal: each of its pushes
 * (`TimedPush`) drives the channel flat out over its own window of the drive. A channel it does
 * not name is pushed toward its goal as above, and the posture beneath is the one above. With both,
 * the schedule pushes its channels and the striking point is driven as `driven` says. With `fire`,
 * the arm's drive begins as soon as the striking point comes within `fire` of the arm's length of
 * the target, if that is before `lead`: the arm opens at the same distance whatever the range.
 * With `steered`, every `PUNCH_DECIDE` s of the drive it reads itself (`punchFeatures`, into its
 * state's `features`) and adds its state's `steer` to the pushes of its trunk, legs and arm
 * (`steerPushes`); the steer is its trainer's to set, and none at the drive's start. With
 * `steered` `stance`, the steer's legs' outputs are asks of the stance instead (`stanceAsks`):
 * a turn added to the legs' heading (`LegsGoal.heading`) and a shift of its centre from the support's
 * middle (`LegsGoal.centre`).
 */
export interface StraightPunch {
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
  readonly landed?: boolean;
  readonly halts?: boolean;
  readonly fire?: number;
  readonly ease?: number;
  readonly steered?: boolean | "stance";
  readonly driven?: { readonly accel: number; readonly steer: number; readonly arrive: number };
  readonly timed?: { readonly left: readonly TimedPush[]; readonly right: readonly TimedPush[] };
}

/**
 * **A push on a schedule**: `channel` driven flat out from `from` s into the drive for `length` s,
 * at `level` of its muscles' strength, its sign the push's sense. A control step the window covers
 * in part pushes for that part (its level times the share of the step covered), so a schedule asks
 * the same impulse at every rate.
 */
export interface TimedPush { readonly channel: string; readonly level: number; readonly from: number; readonly length: number }

/** Whether `push` is a timed push: a level from -1 to 1, its window finite and not negative. */
const validPush = (push: TimedPush) => typeof push.channel === "string" && [push.level, push.from, push.length].every(Number.isFinite)
  && Math.abs(push.level) <= 1 && push.from >= 0 && push.length >= 0;

/**
 * A straight punch's drive settings: a bare-handed search of Arena
 * bouts of the Puncher against Classic, Combat, Brawler, Kicker, Scrapper and itself fighting
 * back, scored by the hit points and the share of the head each side lost and held to the punch
 * test's walked-in blows on a Warrior standing in guard (`research/punch-in-bout.mjs --scene
 * --head 2`), rounded, with the arm pushed flat out to its goal (no `brake`) and brought back over
 * 0.376 s, not the searched 0.26 s, over which it fell eight times as often against itself, and the
 * hips turned 0.22 rad, which beat the searched 0.077 against itself without falling more; at the
 * longest reach whose fist still meets its target with the arm behind it: an arm apart, not chest
 * to chest. The entry band permits 0.05 m beyond that stand-off: the bounded drive must reach a
 * stationary target without relying on a foe walking into it.
 */
export const STRAIGHT_PUNCH: StraightPunch = deepFreeze({
  pace: 1.021, reach: 0.8, band: 0.05, settle: 0, through: 0.265, hips: 0.22, turn: 0.41, lean: 0.276,
  chamber: 0.195, lead: 0.055, elbow: 0, brake: 0, follow: 0.02, longest: 0.249, recover: 0.376,
});

/** Whether `settings` are a straight punch's: every one finite and not negative, the pace, reach, band and drive's length positive. */
export function validStraightPunch(settings: StraightPunch): boolean {
  const values = [settings.pace, settings.reach, settings.band, settings.settle, settings.through, settings.hips, settings.turn, settings.lean,
    settings.chamber, settings.lead, settings.elbow, settings.brake, settings.follow, settings.longest, settings.recover];
  return values.every((v) => Number.isFinite(v) && v >= 0) && settings.pace > 0 && settings.reach > 0 && settings.band > 0 && settings.longest > 0
    && (settings.landed === undefined || typeof settings.landed === "boolean")
    && (settings.halts === undefined || typeof settings.halts === "boolean")
    && (settings.fire === undefined || Number.isFinite(settings.fire) && settings.fire >= 0)
    && (settings.aside === undefined || Number.isFinite(settings.aside) && settings.aside > 0)
    && (settings.squared === undefined || typeof settings.squared === "boolean")
    && (settings.poised === undefined || typeof settings.poised === "boolean")
    && (settings.above === undefined || Number.isFinite(settings.above))
    && (settings.ease === undefined || Number.isFinite(settings.ease) && settings.ease > 0)
    && (settings.steered === undefined || typeof settings.steered === "boolean" || settings.steered === "stance")
    && (settings.driven === undefined || [settings.driven.accel, settings.driven.steer, settings.driven.arrive].every((v) => Number.isFinite(v) && v >= 0) && settings.driven.accel > 0)
    && (settings.timed === undefined || HANDS.every((hand) => Array.isArray(settings.timed![hand]) && settings.timed![hand].every(validPush)));
}

/** The channels `settings` push on a schedule that a body of `spec` lacks. */
function missingTimedChannels(spec: BodySpec, settings: StraightPunch): readonly string[] {
  const channels = new Set(spec.joints.flatMap((joint) => joint.dofs.map((dof) => `${joint.name} ${dof.positive}`)));
  return settings.timed ? HANDS.flatMap((hand) => settings.timed![hand].map((push) => push.channel)).filter((channel) => !channels.has(channel)) : [];
}

/**
 * Why a body of `spec` cannot take `settings`' schedule, or null: a channel it lacks, or one on
 * the arm a `driven` drive moves (from the joint that leaves the hand's base down), which a body
 * refuses to push while it drives the hand's point.
 */
export function timedChannelFault(spec: BodySpec, settings: StraightPunch): string | null {
  const missing = missingTimedChannels(spec, settings);
  if (missing.length) return `has no ${missing.join(", ")} to push`;
  if (!settings.timed || !settings.driven) return null;
  const driven = HANDS.flatMap((hand) => {
    const base = spec.effectors?.find((e) => e.segment === `hand.${hand}`)?.base, arm = new Set<string>();
    for (let at: string | undefined = `hand.${hand}`; at !== undefined && at !== base;) {
      const joint = spec.joints.find((j) => j.child === at);
      joint?.dofs.forEach((dof) => arm.add(`${joint.name} ${dof.positive}`));
      at = joint?.parent;
    }
    return settings.timed![hand].map((push) => push.channel).filter((channel) => arm.has(channel));
  });
  return driven.length ? `pushes ${driven.join(", ")} on the arm it drives` : null;
}

/** Whether a body of `spec` can throw the straight punch: a hand effector each side, below a chest, and a thoracic joint that turns it. */
export function straightPunchFits(spec: BodySpec): boolean {
  const hand = (side: Side) => spec.effectors?.some((e) => e.segment === `hand.${side}` && e.base === "upperTrunk") ?? false;
  return hand("left") && hand("right") && spec.joints.some((j) => j.name === "thoracic");
}

/** What a hand's straight punch moves: the arm's chain from the root, its free freedoms, the trunk's, and the shoulder. */
interface Limb {
  readonly chain: ReturnType<typeof bodyEffectors>[number]["chain"];
  /** The arm's freedoms (`solveReach`), each drawn toward the contact pose's preferred angle. */
  readonly free: { joint: number; k: number; min: number; max: number; preferred: number; name: string }[];
  readonly work: ReturnType<typeof reachWork>;
  /** The striking point, body frame, reference pose, and its name. */
  readonly point: Vec3;
  readonly aim: string;
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
  /** The angles the solve works in, by chain joint. */
  readonly angles: number[][];
}

/** Where a straight punch is: standing at its stand-off, driven, or coming back. */
type Phase = "settle" | "swing" | "return";

/** How far nearer than its stand-off a foe may come before the punch backs out from it, m. */
const CROWDED = 0.05;

/**
 * The fastest its centre of mass may move across the ground, m/s, for a stance shifting its weight
 * for a step to count as set: a drive begun from a shift while the body still carries its walk
 * throws it over.
 */
const SHIFTING_PACE = 0.25;

const HANDS: readonly Side[] = Object.freeze(["left", "right"]);

/** The most a component of the target's velocity counts, m/s: a foe's lunge is under it, the aim's jump from one opening to another is cut to it. */
const AIM_SPEED = 4;
/**
 * **The straight punch**: a hand's blow thrown with the arm lined up behind the fist, for a fist
 * that meets its target with the arm's mass behind it rather than an elbow giving way. Admitted
 * with the target `reach` from the head, facing it (`punchReadiness`), it
 * stands there `settle` s with both feet bearing, its fist on the line (its chamber): a stance
 * shifting its weight for a step still bears on both, and so counts while the body moves no
 * faster than `SHIFTING_PACE`, since waiting for the step to land would cost it a quarter of its
 * punches. Then it turns the hips and the
 * chest and leans the trunk to bring the punching shoulder forward, and drives the arm, `lead` s
 * behind, at its
 * contact pose, solved each step for where the target is (`solveReach`): the striking point on
 * the line from the shoulder, `through` m past the target, with the elbow straight and the wrist
 * on the line where the reach leaves them free. Each channel is pushed flat out toward its goal
 * and held once near it (`StraightPunch.brake`). After the drive it brings the arm back to the
 * guard and stands. An attack given up before the drive is dropped; a drive begun is thrown to its
 * end. It has the legs from its stand to its return, and the hand is closed throughout.
 */
export function straightTechnique(body: Body, guard: Pose, settings: StraightPunch) {
  const built = body.built, spec = built.spec, sense = { left: turnSense("left"), right: turnSense("right") };
  if (!straightPunchFits(spec)) throw new Error(`${spec.model} cannot throw the straight punch`);
  const effectors = bodyEffectors(built), at = new Vector3(), before = new Vector3();
  const limbOf = (hand: Side): Limb => {
    const effector = effectors.find((e) => e.segment.spec.name === `hand.${hand}`)!;
    const { chain } = effector, trunk = effector.free[0]!.joint, aim = effector.model.point;
    const angles = chain.map((joint) => joint.dofs.map(() => 0));
    const shoulder = chain[trunk]!.spec.centre.value;
    // Each trunk freedom named, signed by which way of it carries the shoulder forward (+z) from the reference pose.
    const goals: Limb["goals"][number][] = [];
    const goal = (joint: string, pattern: RegExp, amount: number) => {
      const j = chain.findIndex((c) => c.spec.name === joint);
      if (j < 0 || j >= trunk) return;
      const k = chain[j]!.dofs.findIndex((_, i) => pattern.test(channelName(chain[j]!, i)));
      if (k < 0) return;
      const dof = chain[j]!.dofs[k]!.spec;
      pointAtToRef(chain.slice(0, trunk), angles.slice(0, trunk), shoulder, before);
      angles[j]![k] = 0.1;
      pointAtToRef(chain.slice(0, trunk), angles.slice(0, trunk), shoulder, at);
      angles[j]![k] = 0;
      const angle = (at.z > before.z ? 1 : -1) * amount;
      goals.push({ channel: channelName(chain[j]!, k), joint: j, k, angle: Math.max(dof.min.value, Math.min(dof.max.value, angle)) });
    };
    goal("thoracic", /rotation/, settings.turn);
    goal("lumbar", /^lumbar flexion$/, settings.lean);
    for (const f of effector.free) if (/^elbow/.test(f.name)) angles[f.joint]![f.k] = f.min;
    pointAtToRef(chain, angles, effector.points.get(aim)!, at);
    for (const f of effector.free) angles[f.joint]![f.k] = 0;
    const arm = hypot(at.x - shoulder[0], at.y - shoulder[1], at.z - shoulder[2]);
    return { chain, free: effector.free.map((f) => ({ ...f })), work: reachWork(effector.free.length), point: effector.points.get(aim)!, aim,
      trunk, shoulder, arm, goals, angles, trunkChain: chain.slice(0, trunk),
      trunkNames: chain.slice(0, trunk).map((joint) => joint.dofs.map((_, k) => channelName(joint, k))), trunkAngles: angles.slice(0, trunk) };
  };
  const limbs = { left: limbOf("left"), right: limbOf("right") };
  /** The channels each hand's schedule names, which are pushed only on it. */
  const leg = legOf(body.built.spec), steeredChannels = { left: punchChannels("left", settings.steered ?? false, leg), right: punchChannels("right", settings.steered ?? false, leg) };
  const scheduled = { left: new Set((settings.timed?.left ?? []).map((p) => p.channel)), right: new Set((settings.timed?.right ?? []).map((p) => p.channel)) };
  const state = {
    hand: null as Side | null, phase: null as Phase | null,
    /** Where it aims, world, the last target asked, and how fast that moved over the last step, m/s (`aimAt`); the way it faces as the drive began. */
    target: [0, 0, 0] as [number, number, number], aimed: [0, 0, 0] as [number, number, number], face: 0,
    /** Seconds stood at the stand-off on both feet; when the drive began, when its hand began to touch, whether it touched last step, and when it came back. */
    stood: 0, began: 0, touched: null as number | null, touching: false, ended: 0, now: 0, headY: 0,
    /** When the arm's drive began, s into the drive that began at `firedFor`, where `fire` began it before `lead`. */
    fired: null as number | null, firedFor: -1,
    /** The control step's length, s, as the last update had it: what a push covers of it. */
    step: 0,
    /**
     * With `steered`: what the drive last read of itself (`punchFeatures`), when, s into it, the
     * steer it adds (`steerPushes`), and when the steer was last set from what it read.
     */
    features: [] as number[], decided: -Infinity, steer: [] as number[], steeredAt: -Infinity,
    still: 0, thrown: { left: 0, right: 0 },
    /**
     * Each shoulder at contact from the head as the last step left it, in the body frame: the
     * trunk at its contact goals and the hips turned, across, up and forward, m.
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
  const report: StrikeReport = {
    get hand() { return state.hand; },
    get phase() { return state.phase; },
    get blow() { return state.phase ? "placed" : null; },
    get distance() { return state.hand && state.phase ? standOff(state.hand, state.target[1] - state.headY) : null; },
    get since() { return state.phase === "swing" || state.phase === "return" ? state.now - state.began : -Infinity; },
    follows: true,
    thrown: state.thrown,
    get still() { return state.still; },
    rangeAt: (hand, up) => ({ reach: standOff(hand, up), along: [-CROWDED, settings.band] }),
  };
  const end = () => { state.hand = null; state.phase = null; state.touched = null; state.stood = 0; state.still = 0; };
  const target = new Vector3(), shoulder = new Vector3(), head = new Vector3(), goal = new Vector3(), apart = new Vector3(), headAt: [number, number, number] = [0, 0, 0];
  /**
   * The arm's angles that put its striking point `out` m from the shoulder on the line to the
   * target, into the limb's `angles`: the trunk as it stands, or at its contact goals with
   * `turned`; the elbow drawn toward `elbow`, the wrist toward the line, the shoulder toward where it is.
   */
  const solve = (view: BodyView, limb: Limb, turned: boolean, out: (apart: number) => number, elbow: number | null): void => {
    const { chain, angles, free, goals } = limb;
    chain.forEach((joint, j) => joint.dofs.forEach((_, k) => { angles[j]![k] = view.angles[channelName(joint, k)] ?? 0; }));
    if (turned) for (const g of goals) angles[g.joint]![g.k] = g.angle;
    intoFrameToRef(view.root, state.target, target);
    pointAtToRef(chain.slice(0, limb.trunk), angles.slice(0, limb.trunk), limb.shoulder, shoulder);
    const dx = target.x - shoulder.x, dy = target.y - shoulder.y, dz = target.z - shoulder.z, apart = hypot(dx, dy, dz) || 1, reach = out(apart) / apart;
    for (const f of free) f.preferred = /^elbow/.test(f.name) ? elbow ?? f.min : /^wrist/.test(f.name) ? 0 : angles[f.joint]![f.k]!;
    solveReach(chain, angles, free, [{ point: limb.point, target: [shoulder.x + dx * reach, shoulder.y + dy * reach, shoulder.z + dz * reach] }], undefined, limb.work);
  };
  /** The guard with the punching arm set on the line to the target, `chamber` m from the shoulder; the guard itself with no chamber. */
  const chamber = (view: BodyView, hand: Side): Pose | null => {
    if (settings.chamber === 0) return null;
    const limb = limbs[hand], posture: Record<string, number> = { ...guard };
    solve(view, limb, false, () => settings.chamber, guard[`elbow.${hand} flexion`] ?? null);
    for (const f of limb.free) posture[f.name] = limb.angles[f.joint]![f.k]!;
    return posture;
  };
  /**
   * The posture, pushes and point driven of a drive `since` s old: the trunk's goals from its
   * start; from `lead` the arm's contact pose, the striking point `through` m past the target on
   * the line from the shoulder, the elbow straight and the wrist on the line, the elbow from
   * `elbow` s later; or with `driven`, the arm drawn to that pose and its striking point driven
   * (`drivenPoint`).
   */
  const drive = (view: BodyView, hand: Side, since: number, pushes: MusclePush[], points: PointTask[], policy?: (features: readonly number[]) => number[]): Pose => {
    const limb = limbs[hand], posture: Record<string, number> = { ...(chamber(view, hand) ?? guard) }, step = state.step;
    solve(view, limb, true, (apart) => apart + settings.through, null);
    /** The share of this control step, from `since` for `step` s, that falls from `from` to `to`; with no step, whether `since` does. */
    const share = (from: number, to: number) => step > 0 ? Math.max(0, Math.min(since + step, to) - Math.max(since, from)) / step
      : since >= from && since < to ? 1 : 0;
    const push = (channel: string, goal: number, part = 1) => {
      const error = goal - (view.angles[channel] ?? 0);
      if (!scheduled[hand].has(channel) && Math.abs(error) > settings.brake) pushes.push({ channel, sense: error > 0 ? 1 : -1,
        level: part * (settings.ease === undefined ? 1 : Math.min(1, Math.abs(error) / settings.ease)) });
      posture[channel] = goal;
    };
    if (settings.timed) for (const p of settings.timed[hand]) {
      const part = share(p.from, p.from + p.length);
      if (part > 0 && p.level !== 0) pushes.push({ channel: p.channel, sense: p.level > 0 ? 1 : -1, level: Math.abs(p.level) * part });
    }
    for (const g of limb.goals) push(g.channel, g.angle);
    if (state.firedFor !== state.began) { state.firedFor = state.began; state.fired = null; state.decided = -Infinity; state.steeredAt = -Infinity; state.steer.length = 0; }
    if (settings.fire !== undefined && state.fired === null && since < settings.lead) {
      const fist = view.fists[hand].position, dx = state.target[0] - fist.x, dy = state.target[1] - fist.y, dz = state.target[2] - fist.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= settings.fire * limb.arm) state.fired = since;
    }
    const start = state.fired ?? settings.lead;
    if (since >= start && settings.driven) {
      for (const f of limb.free) posture[f.name] = limb.angles[f.joint]![f.k]!;
      points.push(drivenPoint(view, hand, limb, settings.driven));
    } else if (share(start, Infinity) > 0) {
      for (const f of limb.free) {
        const part = share(/^elbow/.test(f.name) ? start + settings.elbow : start, Infinity);
        if (part > 0) push(f.name, limb.angles[f.joint]![f.k]!, part);
      }
    }
    if (settings.steered) {
      // A policy's steer from what the drive last read holds from the step after it read it.
      if (policy && state.decided > state.steeredAt) {
        state.steeredAt = state.decided;
        const steer = policy(state.features);
        state.steer.length = 0;
        for (const level of steer) state.steer.push(level);
      }
      if (since >= state.decided + PUNCH_DECIDE - 1e-9) {
        state.decided = since;
        // The shoulder where the trunk stands, against the target the solve above left in the body frame.
        const { chain, angles, trunk } = limb;
        for (let j = 0; j < trunk; j++) chain[j]!.dofs.forEach((_, k) => { angles[j]![k] = view.angles[channelName(chain[j]!, k)] ?? 0; });
        pointAtToRef(limb.trunkChain, angles, limb.shoulder, apart);
        punchFeatures(body, view, hand, steeredChannels[hand], since, apart.set(target.x - apart.x, target.y - apart.y, target.z - apart.z), state.target, state.aimed,
          (view.effectors[`hand.${hand}`]?.feedback?.impulse ?? 0) > 0, limb.arm, state.features);
      }
      steerPushes(pushes, steeredChannels[hand], state.steer);
    }
    return posture;
  };
  /**
   * The striking point driven to where the limb's contact pose, as last solved, puts it: toward it at
   * the speed `accel` gives over the way left, or over `arrive` where that is longer, that velocity
   * closed at `steer` and the ask no more than `accel`.
   */
  const drivenPoint = (view: BodyView, hand: Side, limb: Limb, { accel, steer, arrive }: NonNullable<StraightPunch["driven"]>): PointTask => {
    pointAtToRef(limb.chain, limb.angles, limb.point, goal);
    goal.applyRotationQuaternionToRef(view.root.rotation, goal).addInPlace(view.root.position);
    const fist = view.fists[hand], v = fist.velocity;
    const dx = goal.x - fist.position.x, dy = goal.y - fist.position.y, dz = goal.z - fist.position.z, apart = hypot(dx, dy, dz);
    const speed = apart > 0 ? Math.sqrt(2 * accel * Math.max(apart, arrive)) / apart : 0;
    const ax = steer * (dx * speed - v.x), ay = steer * (dy * speed - v.y), az = steer * (dz * speed - v.z), size = hypot(ax, ay, az);
    const scale = size > accel ? accel / size : 1;
    return { segment: `hand.${hand}`, point: limb.aim, accel: [ax * scale, ay * scale, az * scale] };
  };
  const read = (view: BodyView) => {
      headAt[0] = view.head.x; headAt[1] = view.head.y; headAt[2] = view.head.z;
      intoFrameToRef(view.root, headAt, head);
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
  return { state, report, end, read, standOff, chamber, drive, sense, steeredChannels, aimAt,
    heightFits: (hand: Side, up: number) => Math.abs(up - state.shoulders[hand][1]) <= settings.reach * limbs[hand].arm
      && (settings.above === undefined || up - state.shoulders[hand][1] <= settings.above) };
}

/** A stopped approach must establish its local stroke within this many seconds. */
export const PUNCH_PREPARE_LIMIT = 6;

/** Whether the body stands quiet enough to drive a punch: standing, or shifting its weight no faster than `SHIFTING_PACE`. */
export const quietToPunch = (view: BodyView): boolean =>
  view.stance.phase === "stand" || view.stance.phase === "shift" && hypot(view.stance.velocity.x, view.stance.velocity.z) < SHIFTING_PACE;

/**
 * Whether `hand`'s straight punch at `at` (`technique`'s, with `settings`) can be thrown from where
 * the body stands, facing `heading`: blocked out of the arm's height band; else ready within its
 * window, its stand-off on the ground from the target, or the window to walk to.
 */
export function punchReadiness(view: BodyView, technique: ReturnType<typeof straightTechnique>, settings: StraightPunch, hand: Side, at: Vec3, heading: number): Readiness {
  const reach = technique.standOff(hand, at[1] - view.head.y);
  if (!technique.heightFits(hand, at[1] - view.head.y)) return { kind: "blocked", reason: "target is outside the arm's height band" };
  const dx = view.head.x - view.stance.centre.x, dz = view.head.z - view.stance.centre.z;
  const ahead = dx * sin(heading) + dz * cos(heading), across = dx * cos(heading) - dz * sin(heading) + (settings.squared ? technique.state.shoulders[hand][0] : 0);
  // Entry permits the configured approach speed and a modest bearing error before settling.
  const window = { at, along: [reach + ahead - CROWDED, reach + ahead + settings.band] as const,
    across: [across - (settings.aside ?? settings.band), across + (settings.aside ?? settings.band)] as const, facing: .4, speed: settings.pace };
  if (!withinActionWindow(view, window, heading) || settings.poised && !quietToPunch(view)) return { kind: "position", window };
  return { kind: "ready" };
}

/**
 * A straight-punch instance owns settling, its committed drive and its bounded guard return;
 * `requireArmAim` checks the aim while the trunk leads the arm; `policy` sets a steered punch's
 * steer from what it reads (`PunchPolicy`).
 */
export function straightPunchExecutor(body: Body, guard: Pose, actions: readonly string[], settings: StraightPunch,
  resolve: TargetResolver, { requireArmAim = false, policy }: { readonly requireArmAim?: boolean; readonly policy?: (features: readonly number[]) => number[] } = {}): Executor {
  if (!validStraightPunch(settings)) throw new Error("invalid straight punch settings");
  const technique = straightTechnique(body, guard, settings), motion = technique.state;
  technique.read(body.view);
  const sides = { left: ["hand.left", "trunk", "legs"], right: ["hand.right", "trunk", "legs"] } as const;
  const sideOf = (effector: string): Side => {
    if (effector === "hand.left") return "left";
    if (effector === "hand.right") return "right";
    throw new Error(`straight punch has no effector ${effector}`);
  };
  const state = { motion, live: null as null | { request: ActionRequest; hand: Side; phase: "prepare" | "commit" | "release";
    stage: "admitting" | "settle" | "swing" | "return"; time: number; quiet: number; lower: number;
    withdrawn: boolean; ending: ActionEnding } };
  const release = (ending: ActionEnding) => {
    const live = state.live!; live.phase = "release"; live.stage = "return"; live.time = 0; live.ending = ending; motion.phase = "return";
  };
  const sparse = (posture: Pose, hand: Side): Pose => Object.fromEntries(Object.entries(posture)
    .filter(([channel]) => !channel.includes(`.${hand === "left" ? "right" : "left"} `)));
  return {
    state,
    needs(_action, effector) { return sides[sideOf(effector)]; },
    readiness(view, action, effector, target, around) {
      if (!actions.includes(action)) return { kind: "blocked", reason: "unknown action" };
      if (effector !== "hand.left" && effector !== "hand.right") return { kind: "blocked", reason: "unsupported effector" };
      if (view.down) return { kind: "blocked", reason: "body is down" };
      if (state.live) return { kind: "waiting", reason: "straight punch is striking or returning" };
      const at = resolve(view, target, action, effector);
      if (!at) return { kind: "blocked", reason: "target has no aim" };
      return punchReadiness(view, technique, settings, sideOf(effector), at, around.heading);
    },
    resume() { state.live = null; technique.end(); },
    interrupt(_view, id) { if (state.live?.request.id === id) { state.live = null; technique.end(); } },
    start(view, request, around) {
      if (state.live) throw new Error("straight punch already owns an instance");
      const hand = sideOf(request.effector), at = resolve(view, request.target, request.action, request.effector);
      if (!at) throw new Error("straight punch target has no aim");
      state.live = { request: { ...request }, hand, phase: "prepare", stage: "admitting", time: 0, quiet: 0, lower: around.lower,
        withdrawn: false, ending: { kind: "completed" } };
      motion.hand = hand; motion.phase = "settle"; technique.aimAt(at); motion.face = atan2(at[0] - view.head.x, at[2] - view.head.z);
      motion.began = view.time; motion.now = view.time; motion.touched = null; motion.touching = false;
    },
    update(view, continued, _around, dt) {
      technique.read(view); motion.now = view.time; motion.step = dt;
      const live = state.live;
      if (!live) return [];
      if (view.down) { state.live = null; technique.end(); return [{ id: live.request.id, ending: { kind: "interrupted", reason: "body is down" } }]; }
      const request = continued.find(one => one.id === live.request.id);
      if (!request) live.withdrawn = true;
      const source = request ?? live.request, at = resolve(view, source.target, source.action, source.effector);
      if (live.phase === "prepare" && (live.withdrawn || !at)) release(!at ? { kind: "lost", reason: "target is no longer sensed" } : { kind: "cancelled" });
      else if (requireArmAim && live.phase === "commit" && live.time < settings.lead && !at) release({ kind: "completed" });
      if (at && !live.withdrawn && live.phase !== "release") technique.aimAt(at, dt);
      live.time += dt;
      if (live.phase === "prepare") {
        live.stage = "settle";
        const quiet = quietToPunch(view);
        live.quiet = quiet ? live.quiet + dt : 0;
        if (live.time >= PUNCH_PREPARE_LIMIT) release({ kind: "stalled", reason: "settling deadline" });
        else if (quiet && live.quiet >= settings.settle) {
          live.phase = "commit"; live.stage = "swing"; live.time = 0; motion.phase = "swing";
          motion.began = view.time; motion.touched = null; motion.face = atan2(motion.target[0] - view.head.x, motion.target[2] - view.head.z);
          motion.touching = (view.effectors[live.request.effector]?.feedback?.impulse ?? 0) > 0;
        }
      } else if (live.phase === "commit") {
        const touching = (view.effectors[live.request.effector]?.feedback?.impulse ?? 0) > 0;
        if (touching && !motion.touching && motion.touched === null) motion.touched = view.time;
        motion.touching = touching;
        if (motion.touched !== null && view.time - motion.touched >= settings.follow || live.time >= settings.longest) release({ kind: "completed" });
      } else if (live.time >= settings.recover) {
        const ending = live.ending; state.live = null; technique.end(); return [{ id: live.request.id, ending }];
      }
      const updates: LifecycleUpdate[] = [{ id: live.request.id, phase: live.phase, stage: live.stage, holds: sides[live.hand] }];
      return updates;
    },
    command(view, id, around) {
      const live = state.live;
      if (!live || live.request.id !== id) throw new Error(`straight punch has no instance ${id}`);
      const pushes: MusclePush[] = [], points: PointTask[] = [];
      const posture = live.phase === "commit" ? technique.drive(view, live.hand, live.time, pushes, points, policy)
        : live.phase === "prepare" ? technique.chamber(view, live.hand) ?? guard : guard;
      const sense = technique.sense[live.hand], shift: [number, number] = [0, 0];
      const turn = live.phase === "commit" ? stanceAsks(technique.steeredChannels[live.hand], motion.steer, motion.face, sense, shift) : 0;
      // The hips turned from the legs' heading, and the weight moved from the middle of the soles the stance stands on.
      const steer = live.phase === "commit" ? sense * settings.hips + turn : 0, support = view.stance.support;
      return { posture: sparse(posture, live.hand), pushes, points, ...(closesToStrike(body.built.spec, live.hand) ? { handPoses: { [`hand.${live.hand}`]: "fist" as const } } : {}),
        legs: { walk: null, face: motion.face, ...(settings.halts ? { halt: true } : {}), height: view.standing - live.lower,
          ...(steer ? { heading: around.heading + steer } : {}),
          ...(shift[0] === 0 && shift[1] === 0 ? {} : { centre: [support.x + shift[0], support.z + shift[1]] as const }) } };
    },
  };
}
