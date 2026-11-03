import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyView } from "../../body.ts";
import { bodyEffectors } from "../../control/effectors.ts";
import { intoFrameToRef, pointAtToRef, reachWork, solveReach } from "../../control/kinematics.ts";
import type { MusclePush } from "../../control/motor.ts";
import type { Pose } from "../../spec/pose.ts";
import { atan2, cos, hypot, sin } from "../../math/real.ts";
import { channelName } from "../../muscle/driver.ts";
import type { BodySpec, Side } from "../../spec/body.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import type { ActionEnding, ActionRequest, Executor, LifecycleUpdate, Readiness, TargetResolver } from "../framework/action.ts";
import { clearAhead, quietToStrike, strikeWindow } from "./strike-window.ts";
import { bodyAhead } from "../../navigation/held-clearance.ts";
import { sensedActionTarget } from "../../intent/action-aim.ts";
import { stepShare, timedPushes, validPush, type TimedPush } from "./timed-push.ts";
import { closesToStrike } from "./held-strike.ts";
import { keepsWalk, PUNCH_DECIDE, PUNCH_LAYOUT, punchChannels, punchFeatures, stanceAsks, steerPushes, type PunchLayout } from "./learned-punch.ts";
import { learnerOf } from "../../learning/learner.ts";
import { legOf } from "../locomotion/gait-scale.ts";
import { fistOn, otherSide } from "../../spec/body.ts";
import { heldFrame } from "../../build/rigid.ts";
import { faceAligner } from "./face-aligner.ts";

/** The turn about up that brings `hand`'s shoulder forward: a turn of a positive angle about up carries a body's right (+x) back (-z). */
const turnSense = (hand: Side): 1 | -1 => hand === "right" ? -1 : 1;

/**
 * **A straight punch's settings.** It is admitted with the body moving no faster than `pace`
 * m/s, facing the target, with it `reach` of the arm's straight length (shoulder to knuckles)
 * from the punching shoulder, no more than `band` m further across the ground and no nearer than
 * `CROWDED`, and no more than `aside` m (`band` where unset) to either side of the line it faces
 * (with `squared`, of the line the punching shoulder faces along as the drive carries it, so a
 * target is struck from in front of that shoulder rather than across the body),
 * the target no more than `reach` of the arm above or below the shoulder, nor more than `above` m
 * above it where given, and with `poised` its stance already quiet (`quietToStrike`), so that it never
 * waits to settle while a foe closes (`punchReadiness`: the tactics bring the body there), and stands for `settle` s with
 * both feet bearing (no foot swinging in a step), its fist set on the
 * line from the shoulder to the target `chamber` m from the shoulder (none at 0). Then the hips
 * turn its punching shoulder forward by `hips` rad (the stance's heading, `Claim.steer`), the
 * chest by `turn` rad and the trunk leans `lean` rad, and `lead` s later the arm is driven at its
 * contact pose: straight at a point `through` m past the target along the line from the shoulder,
 * the elbow `elbow` s after the rest of the arm, so the upper arm lifts the fist to the line
 * before the forearm opens along it. Each channel is pushed flat out until it is within `brake`
 * rad of its goal, then held there by the posture. The drive ends `follow` s after the hand begins
 * to touch something, or `longest` s after it began; the arm comes back to the guard over
 * `recover` s. With `halts`, it stops a walk at once from its
 * start (`LegsGoal.halt`, `StanceGoal.halt`): a step not yet lifted is not taken. With `timed`, a
 * channel the punching hand's schedule names is not pushed toward its goal: each of its pushes
 * (`TimedPush`) drives the channel flat out over its own window of the drive. A channel it does
 * not name is pushed toward its goal as above, and the posture beneath is the one above. With `fire`,
 * the arm's drive begins as soon as the striking point comes within `fire` of the arm's length of
 * the target, if that is before `lead`: the arm opens at the same distance whatever the range.
 * With `steered`, every `PUNCH_DECIDE` s of the drive it reads itself (`punchFeatures`, into its
 * state's `features`) and adds its state's `steer` to the pushes of its trunk and arm
 * (`steerPushes`) and asks the stance with it (`stanceAsks`): a turn added to the legs' heading
 * (`LegsGoal.heading`) and a shift of its centre from the support's middle (`LegsGoal.centre`),
 * and keeps a walk under way or halts it in place of `halts` (`keepsWalk`), as its layout lays
 * the steer out (`PUNCH_LAYOUT`); the steer is its trainer's to set, and none
 * at the drive's start.
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
  readonly halts?: boolean;
  readonly fire?: number;
  readonly steered?: boolean;
  readonly timed?: { readonly left: readonly TimedPush[]; readonly right: readonly TimedPush[] };
}

/** The settings every straight punch names; the rest are its options. */
const REQUIRED = ["pace", "reach", "band", "settle", "through", "hips", "turn", "lean", "chamber", "lead", "elbow", "brake", "follow", "longest", "recover"] as const;

/** Every setting a straight punch may name (`StraightPunch`). */
export const STRAIGHT_PUNCH_KEYS: readonly (keyof StraightPunch)[] = Object.freeze([...REQUIRED, "aside", "squared", "poised", "above", "halts",
  "fire", "steered", "timed"]);

/**
 * Whether `settings`, some of a straight punch's, are each valid: finite and not negative but the
 * chamber, the pace, reach, band and drive's length positive, each option of its kind.
 */
export function validStraightPunchPart(settings: Partial<StraightPunch>): boolean {
  const flag = (value: unknown) => value === undefined || typeof value === "boolean";
  return REQUIRED.every((key) => settings[key] === undefined || Number.isFinite(settings[key]) && (settings[key] >= 0 || key === "chamber"))
    && (["pace", "reach", "band", "longest"] as const).every((key) => settings[key] === undefined || settings[key] > 0)
    && flag(settings.halts) && flag(settings.squared) && flag(settings.poised) && flag(settings.steered)
    && (settings.fire === undefined || Number.isFinite(settings.fire) && settings.fire >= 0)
    && (settings.aside === undefined || Number.isFinite(settings.aside) && settings.aside > 0)
    && (settings.above === undefined || Number.isFinite(settings.above))
    && (settings.timed === undefined || HANDS.every((hand) => Array.isArray(settings.timed![hand]) && settings.timed![hand].every(validPush)));
}

/** Whether `settings` are a straight punch's: each it names valid (`validStraightPunchPart`), and every one it must name named. */
export function validStraightPunch(settings: Partial<StraightPunch>): settings is StraightPunch {
  return REQUIRED.every((key) => settings[key] !== undefined) && validStraightPunchPart(settings);
}

/** Why a body of `spec` cannot take `settings`' schedule, or null: a channel it pushes that the body lacks. */
export function timedChannelFault(spec: BodySpec, settings: Pick<StraightPunch, "timed">): string | null {
  const channels = new Set(spec.joints.flatMap((joint) => joint.dofs.map((dof) => `${joint.name} ${dof.positive}`)));
  const missing = settings.timed ? HANDS.flatMap((hand) => settings.timed![hand].map((push) => push.channel)).filter((channel) => !channels.has(channel)) : [];
  return missing.length ? `has no ${missing.join(", ")} to push` : null;
}

/** Whether a body of `spec` can throw the straight punch: a hand effector each side that makes a fist (`fistOn`), below a chest, and a thoracic joint that turns it. */
export function straightPunchFits(spec: BodySpec): boolean {
  const hand = (side: Side) => spec.effectors?.some((e) => e.segment === `hand.${side}` && e.base === "upperTrunk" && fistOn(spec, side) === e.segment) ?? false;
  return hand("left") && hand("right") && spec.joints.some((j) => j.name === "thoracic");
}

/**
 * **What a hand strikes with where it is not its fist**: a named point of what it holds (`point`),
 * and the way of the item, in its own frame, that meets the target (`facing`): at its contact pose
 * the arm holds that way along the line from the shoulder to the target, as it holds a fist's
 * knuckles on it. A hand with none strikes with its fist.
 */
export interface StrikingFace { readonly point: string; readonly facing: Vec3 }

/** How far behind the striking point a face's second point is set along its facing, m: the lever the arm's solve turns the item by. */
const FACE_LEVER = 0.3;

/** What a hand's straight punch moves: the arm's chain from the root, its free freedoms, the trunk's, and the shoulder. */
interface Limb {
  readonly chain: ReturnType<typeof bodyEffectors>[number]["chain"];
  /** The arm's freedoms (`solveReach`), each drawn toward the contact pose's preferred angle. */
  readonly free: { joint: number; k: number; min: number; max: number; preferred: number; name: string }[];
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
  /** The angles the solve works in, by chain joint. */
  readonly angles: number[][];
}

/** Where a straight punch is: standing at its stand-off, driven, or coming back. */
type Phase = "settle" | "swing" | "return";



const HANDS: readonly Side[] = Object.freeze(["left", "right"]);

/** The most a component of the target's velocity counts, m/s: a foe's lunge is under it, the aim's jump from one opening to another is cut to it. */
const AIM_SPEED = 4;
/**
 * **The straight punch**: a hand's blow thrown with the arm lined up behind the fist, for a fist
 * that meets its target with the arm's mass behind it rather than an elbow giving way. Admitted
 * with the target `reach` from the head, facing it (`punchReadiness`), it
 * stands there `settle` s with both feet bearing, its fist on the line (its chamber): a stance
 * shifting its weight for a step still bears on both, and so counts while the body moves no
 * faster than a shift's pace (`quietToStrike`), since waiting for the step to land would cost it a quarter of its
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
function straightTechnique(body: Body, guard: Pose, settings: StraightPunch, faces: Partial<Record<Side, StrikingFace>>, layout: PunchLayout) {
  const built = body.built, spec = built.spec, sense = { left: turnSense("left"), right: turnSense("right") };
  if (!straightPunchFits(spec)) throw new Error(`${spec.model} cannot throw the straight punch`);
  const effectors = bodyEffectors(built), at = new Vector3(), before = new Vector3();
  const limbOf = (hand: Side): Limb => {
    const effector = effectors.find((e) => e.segment.spec.name === `hand.${hand}`)!, face = faces[hand];
    const { chain } = effector, trunk = effector.free[0]!.joint, aim = face?.point ?? effector.model.point;
    if (!effector.points.has(aim)) throw new Error(`${spec.model}'s ${hand} hand has no point ${aim} to strike with`);
    const held = face ? spec.held?.find((h) => h.segment === `hand.${hand}`) : undefined;
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
    return { chain, free: effector.free.map((f) => ({ ...f })), work: reachWork(effector.free.length), point: effector.points.get(aim)!, aim, behind,
      trunk, shoulder, arm, goals, angles, trunkChain: chain.slice(0, trunk),
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
  const leg = legOf(body.built.spec), steeredChannels = { left: punchChannels("left", leg, layout), right: punchChannels("right", leg, layout) };
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
     * With `steered`: its learner (`Learner`: what the drive last read of itself, `punchFeatures`;
     * the steer it adds, `steerPushes`; its decisions, and whether its drive runs), when, s into
     * the drive, it last read itself, and when the steer was last set from what it read.
     */
    learner: learnerOf(0, false), decided: -Infinity, steeredAt: -Infinity,
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
  const end = () => { state.hand = null; state.phase = null; state.touched = null; state.stood = 0; state.still = 0; state.learner.running = false; };
  /** The motion enters `phase`: its learner runs through a steered swing alone. */
  const enter = (phase: Phase): void => { state.phase = phase; state.learner.running = settings.steered === true && phase === "swing"; };
  const target = new Vector3(), shoulder = new Vector3(), head = new Vector3(), apart = new Vector3(), face = new Vector3();
  /**
   * The arm's angles that put its striking point `out` m from the shoulder on the line to the
   * target, into the limb's `angles`: the trunk as it stands, or at its contact goals with
   * `turned`; the elbow drawn toward `elbow`, a fist's wrist toward the line, the shoulder and a
   * held face's wrist toward where they are, a held face's arm from its guard.
   */
  const solve = (view: BodyView, limb: Limb, turned: boolean, out: (apart: number) => number, elbow: number | null): void => {
    const { chain, angles, free, goals } = limb;
    chain.forEach((joint, j) => joint.dofs.forEach((_, k) => { angles[j]![k] = view.angles[channelName(joint, k)] ?? 0; }));
    if (turned) for (const g of goals) angles[g.joint]![g.k] = g.angle;
    // A held face's arm is solved from the guard, wherever a chamber has drawn it: one contact pose, not the one nearest a drawn-back arm.
    if (limb.behind) for (const f of free) angles[f.joint]![f.k] = guard[f.name] ?? angles[f.joint]![f.k]!;
    intoFrameToRef(view.root, state.target, target);
    pointAtToRef(chain.slice(0, limb.trunk), angles.slice(0, limb.trunk), limb.shoulder, shoulder);
    const dx = target.x - shoulder.x, dy = target.y - shoulder.y, dz = target.z - shoulder.z, apart = hypot(dx, dy, dz) || 1, reach = out(apart) / apart;
    for (const f of free) f.preferred = /^elbow/.test(f.name) ? elbow ?? f.min : /^wrist/.test(f.name) && !limb.behind ? 0 : angles[f.joint]![f.k]!;
    const tx = shoulder.x + dx * reach, ty = shoulder.y + dy * reach, tz = shoulder.z + dz * reach, back = FACE_LEVER / apart;
    solveReach(chain, angles, free, limb.behind ? [{ point: limb.point, target: [tx, ty, tz] }, { point: limb.behind, target: [tx - dx * back, ty - dy * back, tz - dz * back] }]
      : [{ point: limb.point, target: [tx, ty, tz] }], undefined, limb.work);
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
   * The posture and pushes of a drive `since` s old: the trunk's goals from its start; from `lead`
   * the arm's contact pose, the striking point `through` m past the target on the line from the
   * shoulder, the elbow straight and the wrist on the line, the elbow from `elbow` s later.
   */
  const drive = (view: BodyView, hand: Side, since: number, pushes: MusclePush[], policy?: (features: readonly number[]) => number[]): Pose => {
    const limb = limbs[hand], posture: Record<string, number> = { ...(chamber(view, hand) ?? guard) }, step = state.step;
    solve(view, limb, true, (apart) => apart + settings.through, null);
    /** The share of this control step, from `since` for `step` s, that falls from `from` to `to`; with no step, whether `since` does. */
    const share = (from: number, to: number) => stepShare(since, step, from, to);
    const push = (channel: string, goal: number, part = 1) => {
      const error = goal - (view.angles[channel] ?? 0);
      if (!scheduled[hand].has(channel) && Math.abs(error) > settings.brake) pushes.push({ channel, sense: error > 0 ? 1 : -1, level: part });
      posture[channel] = goal;
    };
    if (settings.timed) timedPushes(settings.timed[hand], since, step, pushes);
    for (const g of limb.goals) push(g.channel, g.angle);
    if (state.firedFor !== state.began) { state.firedFor = state.began; state.fired = null; state.decided = -Infinity; state.steeredAt = -Infinity; state.learner.outputs.length = 0; }
    if (settings.fire !== undefined && state.fired === null && since < settings.lead) {
      const fist = view.fists[hand]!.position, dx = state.target[0] - fist.x, dy = state.target[1] - fist.y, dz = state.target[2] - fist.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= settings.fire * limb.arm) state.fired = since;
    }
    const start = state.fired ?? settings.lead;
    if (share(start, Infinity) > 0) {
      for (const f of limb.free) {
        const part = share(/^elbow/.test(f.name) ? start + settings.elbow : start, Infinity);
        if (part > 0) push(f.name, limb.angles[f.joint]![f.k]!, part);
      }
    }
    if (settings.steered) {
      // A policy's steer from what the drive last read holds from the step after it read it.
      if (policy && state.decided > state.steeredAt) {
        state.steeredAt = state.decided;
        const steer = policy(state.learner.inputs);
        state.learner.outputs.length = 0;
        for (const level of steer) state.learner.outputs.push(level);
      }
      if (since >= state.decided + PUNCH_DECIDE - 1e-9) {
        state.decided = since; state.learner.decisions++;
        // The shoulder where the trunk stands, against the target the solve above left in the body frame.
        const { chain, angles, trunk } = limb;
        for (let j = 0; j < trunk; j++) chain[j]!.dofs.forEach((_, k) => { angles[j]![k] = view.angles[channelName(chain[j]!, k)] ?? 0; });
        pointAtToRef(limb.trunkChain, angles, limb.shoulder, apart);
        punchFeatures(body, view, hand, steeredChannels[hand], since, apart.set(target.x - apart.x, target.y - apart.y, target.z - apart.z), state.target, state.aimed,
          (view.effectors[`hand.${hand}`]?.feedback?.impulse ?? 0) > 0, limb.arm, state.learner.inputs, limb.behind ? struck(view, hand, limb) : null);
      }
      steerPushes(pushes, steeredChannels[hand], state.learner.outputs);
    }
    return posture;
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
  return { state, end, enter, read, standOff, chamber, drive, sense, steeredChannels, aimAt,
    heightFits: (hand: Side, up: number) => Math.abs(up - state.shoulders[hand][1]) <= settings.reach * limbs[hand].arm
      && (settings.above === undefined || up - state.shoulders[hand][1] <= settings.above) };
}

/** A stopped approach must establish its local stroke within this many seconds. */
const PUNCH_PREPARE_LIMIT = 6;


/**
 * Whether `hand`'s straight punch at `at` (`technique`'s, with `settings`) can be thrown from where
 * the body stands, facing `heading`: blocked out of the arm's height band; else ready within its
 * window, its stand-off on the ground from the target, or the window to walk to; the window on the
 * body `on` names, where the target is on one.
 */
function punchReadiness(view: BodyView, technique: ReturnType<typeof straightTechnique>, settings: StraightPunch, hand: Side, at: Vec3, heading: number, clear: number, on: string | undefined): Readiness {
  const reach = technique.standOff(hand, at[1] - view.head.y);
  if (!technique.heightFits(hand, at[1] - view.head.y)) return { kind: "blocked", reason: "target is outside the arm's height band" };
  return strikeWindow(view, at, heading, { standOff: reach, band: settings.band, aside: settings.aside ?? settings.band,
    across: settings.squared ? technique.state.shoulders[hand][0] : 0, pace: settings.pace, poised: settings.poised === true, clear, ...(on === undefined ? {} : { on }) });
}

/** Why settings `settings` cannot drive a held item's face, or null: `fire` reads the fist. */
export const faceFault = (settings: Partial<StraightPunch>): string | null =>
  settings.fire !== undefined ? "a held face is not fired: `fire` reads the fist" : null;

/**
 * A straight-punch instance owns settling, its committed drive and its bounded guard return;
 * `requireArmAim` checks the aim while the trunk leads the arm; `policy` sets a steered punch's
 * steer from what it reads (`PunchRecord.network`), its inputs and outputs as `layout` lays them out
 * (`PUNCH_LAYOUT` where not given). With `faces`, the hands that strike are the ones
 * it names, each with the face of what it holds (`StrikingFace`), gripped, not with its fist; a hand
 * it names none for is refused. From its chamber through its drive, the wrist of a hand that holds
 * a face turns the face onto the line from it to the target, facing first (`faceAligner`), and the
 * schedule's and the solve's pushes leave the wrist to it.
 */
export function straightPunchExecutor(body: Body, guard: Pose, actions: readonly string[], settings: StraightPunch,
  resolve: TargetResolver, { requireArmAim = false, policy, faces, layout = PUNCH_LAYOUT }: { readonly requireArmAim?: boolean; readonly policy?: (features: readonly number[]) => number[];
    readonly faces?: Partial<Record<Side, StrikingFace>>; readonly layout?: PunchLayout } = {}): Executor {
  if (!validStraightPunch(settings)) throw new Error("invalid straight punch settings");
  if (faces && faceFault(settings)) throw new Error(faceFault(settings)!);
  const technique = straightTechnique(body, guard, settings, faces ?? {}, layout), motion = technique.state;
  technique.read(body.view);
  const ahead = bodyAhead(body.built.spec);
  const alignerOf = (hand: Side) => faces?.[hand] ? faceAligner(body.built.spec, hand, faces[hand]!, { either: false }) : null;
  const aligners = { left: alignerOf("left"), right: alignerOf("right") }, aimed = new Vector3(), toward = new Float64Array(3);
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
    const live = state.live!; live.phase = "release"; live.stage = "return"; live.time = 0; live.ending = ending; technique.enter("return");
  };
  const sparse = (posture: Pose, hand: Side): Pose => Object.fromEntries(Object.entries(posture)
    .filter(([channel]) => !channel.includes(`.${otherSide(hand)} `)));
  return {
    state,
    needs(_action, effector) { return sides[sideOf(effector)]; },
    readiness(view, action, effector, target, around) {
      if (!actions.includes(action)) return { kind: "blocked", reason: "unknown action" };
      if (effector !== "hand.left" && effector !== "hand.right") return { kind: "blocked", reason: "unsupported effector" };
      if (view.down) return { kind: "blocked", reason: "body is down" };
      if (faces && !faces[sideOf(effector)]) return { kind: "blocked", reason: "the hand holds nothing it strikes with" };
      if (state.live) return { kind: "waiting", reason: "straight punch is striking or returning" };
      const at = resolve(view, target, action, effector);
      if (!at) return { kind: "blocked", reason: "target has no aim" };
      return punchReadiness(view, technique, settings, sideOf(effector), at, around.heading, clearAhead(view, at, around.heading, sensedActionTarget(view, target), ahead),
        target.kind === "body" ? target.body : undefined);
    },
    resume() { state.live = null; technique.end(); },
    interrupt(_view, id) { if (state.live?.request.id === id) { state.live = null; technique.end(); } },
    start(view, request, around) {
      if (state.live) throw new Error("straight punch already owns an instance");
      const hand = sideOf(request.effector), at = resolve(view, request.target, request.action, request.effector);
      if (!at) throw new Error("straight punch target has no aim");
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
      else if (requireArmAim && live.phase === "commit" && live.time < settings.lead && !at) release({ kind: "completed" });
      if (at && !live.withdrawn && live.phase !== "release") technique.aimAt(at, dt);
      live.time += dt;
      if (live.phase === "prepare") {
        live.stage = "settle";
        const quiet = quietToStrike(view);
        live.quiet = quiet ? live.quiet + dt : 0;
        if (live.time >= PUNCH_PREPARE_LIMIT) release({ kind: "stalled", reason: "settling deadline" });
        else if (quiet && live.quiet >= settings.settle) {
          live.phase = "commit"; live.stage = "swing"; live.time = 0; technique.enter("swing");
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
      const updates: LifecycleUpdate[] = [{ id: live.request.id, phase: live.phase, stage: live.stage, holds: sides[live.hand], aim: motion.target }];
      return updates;
    },
    command(view, id, around) {
      const live = state.live;
      if (!live || live.request.id !== id) throw new Error(`straight punch has no instance ${id}`);
      const pushes: MusclePush[] = [];
      let posture = live.phase === "commit" ? technique.drive(view, live.hand, live.time, pushes, policy)
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
      const sense = technique.sense[live.hand], shift: [number, number] = [0, 0];
      const turn = live.phase === "commit" ? stanceAsks(technique.steeredChannels[live.hand], motion.learner.outputs, motion.face, sense, shift) : 0;
      // The hips turned from the legs' heading, and the weight moved from the middle of the soles the stance stands on.
      const steer = live.phase === "commit" ? sense * settings.hips + turn : 0, support = view.stance.support;
      // A walk under way kept where the steer keeps it (`keepsWalk`), else stood, and halted where the steer or `halts` says.
      const keeps = live.phase === "commit" ? keepsWalk(technique.steeredChannels[live.hand], motion.learner.outputs) : null;
      const hand = faces?.[live.hand] ? "grip" as const : closesToStrike(body.built.spec, live.hand) ? "fist" as const : null;
      return { posture: sparse(posture, live.hand), pushes, ...(hand ? { handPoses: { [`hand.${live.hand}`]: hand } } : {}),
        legs: { ...(keeps ? {} : { walk: null }), face: motion.face, ...((keeps === null ? settings.halts : !keeps) ? { halt: true } : {}), height: view.standing - live.lower,
          ...(steer ? { heading: around.heading + steer } : {}),
          ...(shift[0] === 0 && shift[1] === 0 ? {} : { centre: [support.x + shift[0], support.z + shift[1]] as const }) } };
    },
  };
}
