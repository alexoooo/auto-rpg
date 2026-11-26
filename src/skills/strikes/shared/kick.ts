import { segmentResource, LEG_RESOURCE, TRUNK_RESOURCE } from "../../framework/action.ts";
import { supportHeight } from "../../../control/support-reference.ts";
import { Quaternion, Vector3 } from "../../../core/math/vector.ts";
import type { Body, BodyView } from "../../../control/body.ts";
import type { MusclePush } from "../../../control/motor.ts";
import { footStatesOf, readSupport, soleRefusal, withinSupport } from "../../../control/support.ts";
import { intoFrameToRef, reachWork, solveReach } from "../../../control/kinematics.ts";
import { bodyEffectors, copyFreedoms } from "../../../control/effectors.ts";
import { channelName } from "../../../core/bodies/muscle/driver.ts";
import { supportReadiness, plantedSupport } from "./support-readiness.ts";
import { stepShare, timedPushes, type TimedPush } from "./timed-push.ts";
import { scalarPathToRef } from "../../../control/point-path.ts";
import type { FreedomPath } from "../../../control/motor.ts";
import { atan2, cos, hypot, sin } from "../../../core/math/real.ts";
import type { Vec3 } from "../../../core/quantity.ts";
import { segmentOf, type BearingEnd, type BodySpec } from "../../../core/bodies/spec/body.ts";
import type { Pose } from "../../../core/bodies/spec/pose.ts";
import type { ActionEnding, ActionRequest, Executor, LifecycleUpdate, TargetResolver } from "../../framework/action.ts";
import type { LegsGoal } from "../../framework/skill.ts";
import { withinActionWindow } from "../../intent/action-window.ts";
import { SIDES, type Side, otherSide } from "../../../core/bodies/bilateral.ts";

/**
 * **What a kick pushes**, by name: each a channel of the kicking leg (`{kick}`) or the trunk, driven
 * flat out over its own window of the drive (`TimedPush`) by the settings `<name>Level`, `<name>From`
 * and `<name>Length`. The hip is pushed twice, to drive and to brake, and the knee twice, to chamber
 * and to open; a level's sign is the push's sense. The standing leg is the stance's, which drives a
 * leg it stands on over any push.
 */
export const KICK_PUSHES = Object.freeze({
  hip: "hip.{kick} flexion", hipBrake: "hip.{kick} flexion", chamber: "knee.{kick} flexion", extend: "knee.{kick} flexion", ankle: "ankle.{kick} dorsiflexion",
  trunk: "lumbar flexion",
});

type PushName = keyof typeof KICK_PUSHES;
type ScheduleKey = `${PushName}${"Level" | "From" | "Length"}`;

/** Each push's settings at none: a schedule pushes only what its settings name. */
const UNPUSHED = Object.fromEntries((Object.keys(KICK_PUSHES) as PushName[]).flatMap((name) => [[`${name}Level`, 0], [`${name}From`, 0], [`${name}Length`, 0]])) as Record<ScheduleKey, number>;

/**
 * **A kick's stages' settings**, every kick's whatever drives its leg (`KICK_PATH`,
 * `FRONT_KICK_PATH`). Control data, not anatomy; seconds, metres, radians and m/s. A kick runs in
 * stages: transfer moves the centre over the standing foot, both feet bearing, until it is quiet
 * there; then it stands on that foot alone, anchored where it stands, as its drive drives the leg
 * at the target, each freedom neither moves held where the drive found it; set-down is the
 * stance's standing, which steps the kicking foot down where it catches what the drive left moving,
 * each other freedom the drive moved driven back to where the drive found it, until the foot
 * bears; recentre is the stance's standing, stepping where it must, until both feet bear and are quiet.
 */
const KICK_STAGES = Object.freeze({
  /** The deadlines to bring the centre over the standing foot, to set the kicking one down, and to stand quiet on both feet again. */
  transferLimit: 2, setLimit: 3, recenterLimit: 3,
  /** How fast the trunk is brought over the standing foot and held there, s, and the most the centre may move at the transfer's end, m/s. */
  transferSeconds: .2, transferSlow: .12,
  /** The root's pitch held on the one foot through the drive, rad (the supported pose's). */
  lean: 0,
  /**
   * How far ahead of the standing sole's middle, along the kick's heading, the centre is held, m:
   * the contact pushes the body back about the standing foot, and a centre held ahead is carried
   * back over the foot rather than past its heel.
   */
  ahead: 0,
  /** How long a stage's end holds before the next. */
  hold: .03,
  /** How far the pelvis is lowered on the standing leg. */
  lower: .03,
  /** How long the drive runs on after the foot touches. */
  follow: .08,
  /** How fast a freedom driven to a goal slows onto it, rad/s² (`driven`): the set-down's drive back, and the pushed drive's. */
  decel: 150,
  /**
   * The window, each a share of the kicking leg's reach (hip to sole), so a body of any size kicks
   * alike: the target from `alongNear` to `alongFar` ahead of the body's centre and within `across`
   * either side of its line, and from `low` to `high` over the kicking sole, a target outside that
   * band one the kick does not strike (`Readiness`' `beyond`); its facing, rad, and the most ground
   * speed it admits, m/s.
   */
  alongNear: .5178, alongFar: 1.1391, across: .2589, low: .6, high: 1.4, facing: .5, admitSpeed: .6,
});

/**
 * **The push kick's settings** (`kickExecutor`): its stages' (`KICK_STAGES`) and its drive's, the
 * keys every body's record of it holds, each record whole. The drive pushes the leg flat out at the
 * target (the aimed drive, below) and on its schedule (`KICK_PUSHES`), until `follow` s after the
 * foot first touches the target or `longest` s after the drive began.
 */
export const KICK_PATH = Object.freeze({
  ...KICK_STAGES,
  /** The drive's longest. */
  longest: .8,
  /**
   * The aimed drive, a push kick: from `lead` s into the drive, the leg driven first to its chamber,
   * its strike point at the target's height `chamber` m out from the hip toward it with the knee
   * folded; once the strike point is up at the target's height, or `knee` s after `lead` at the
   * latest, driven out level at that height, the strike point `through` m past the target with
   * the knee straight; each freedom at the speed that stops it there slowing at `decel` rad/s² (`driven`).
   */
  lead: 0, chamber: .3, knee: .1, through: .15,
  ...UNPUSHED,
});

/**
 * **The front kick's settings** (`frontKickExecutor`): its stages' (`KICK_STAGES`) and its authored
 * drive's, the keys every body's record of it holds, each record whole. The kicking leg is carried
 * along timed paths, the stance on the standing leg solving for what they ask of it. Chamber: the
 * knee brought up at the target, the hip flexed `chamberLift` past where it points the leg at the
 * target, and the knee folded to `chamberKnee`, over `chamberSeconds`; extend: the leg carried to
 * the push kick's drive through (`reachThrough`), its strike point `through` m past the target,
 * level at its height, the knee straight, over `extendSeconds`, so the foot meets the target at
 * speed with the leg behind it, held until `follow` s after the foot touches or after the
 * extension; retract: back to the chamber over `retractSeconds`. Throughout, the trunk counters the
 * leg: the lumbar extended by `counter` of the hip's flexion. Each path is followed at
 * `pathSeconds`' response: at the motor's own, the stance's solve holds a leg reaching forward short
 * of its path.
 */
export const FRONT_KICK_PATH = Object.freeze({
  ...KICK_STAGES,
  chamberSeconds: .2, chamberLift: .2, chamberKnee: 2.1, extendSeconds: .12, through: .15, retractSeconds: .15, counter: .1, pathSeconds: .03,
});

type StageTuning = { readonly [K in keyof typeof KICK_STAGES]: number };
export type KickTuning = { readonly [K in keyof typeof KICK_PATH]: number };
export type FrontKickTuning = { readonly [K in keyof typeof FRONT_KICK_PATH]: number };

/** Whether `tuning`'s stages are a kick's: each setting finite, its times and window positive where they must be. */
const validStages = (tuning: StageTuning): boolean => Object.values(tuning).every(Number.isFinite)
  && [tuning.transferLimit, tuning.setLimit, tuning.recenterLimit, tuning.transferSeconds, tuning.transferSlow, tuning.across, tuning.facing, tuning.decel].every((v) => v > 0)
  && [tuning.hold, tuning.lower, tuning.follow, tuning.admitSpeed, tuning.low].every((v) => v >= 0)
  && tuning.alongFar > tuning.alongNear && tuning.high > tuning.low;

/** Whether `tuning` is a push kick's: its stages' (`validStages`), its drive's longest positive and its reach not negative, each push's level within -1 and 1 and its window not negative. */
export function validKickTuning(tuning: KickTuning): boolean {
  return validStages(tuning) && tuning.longest > 0 && [tuning.lead, tuning.chamber, tuning.knee, tuning.through].every((v) => v >= 0)
    && (Object.keys(KICK_PUSHES) as PushName[]).every((name) => Math.abs(tuning[`${name}Level`]) <= 1 && tuning[`${name}From`] >= 0 && tuning[`${name}Length`] >= 0);
}

/** Whether `tuning` is a front kick's: its stages' (`validStages`), its paths' times positive and its reach through not negative. */
export function validFrontKickTuning(tuning: FrontKickTuning): boolean {
  return validStages(tuning) && [tuning.chamberSeconds, tuning.extendSeconds, tuning.retractSeconds, tuning.pathSeconds].every((v) => v > 0) && tuning.through >= 0;
}

/** Whether each setting `tuning` names is one of `path`'s, and finite. */
const partOf = <T>(path: T) => (tuning: Partial<T>): boolean =>
  !!tuning && typeof tuning === "object" && !Array.isArray(tuning) && Object.entries(tuning).every(([key, value]) => key in (path as object) && Number.isFinite(value));

/** Whether `tuning` holds every one of `path`'s settings, each valid (`valid`). */
const wholeOf = <T>(path: T, valid: (tuning: T) => boolean) => (tuning: Partial<T>): boolean =>
  partOf(path)(tuning) && Object.keys(path as object).every((key) => Object.hasOwn(tuning, key)) && valid(tuning as T);

export const validKickPart = partOf<KickTuning>(KICK_PATH), wholeKick = wholeOf<KickTuning>(KICK_PATH, validKickTuning);
export const validFrontKickPart = partOf<FrontKickTuning>(FRONT_KICK_PATH), wholeFrontKick = wholeOf<FrontKickTuning>(FRONT_KICK_PATH, validFrontKickTuning);

/** The soles, hips and foot effectors a kick reads. */
export function kickRefusal(spec: BodySpec): string | null {
  const soles = soleRefusal(spec);
  if (soles) return soles;
  for (const side of SIDES) {
    const segment = spec.segments.find((one) => one.name === "foot." + side);
    if (!spec.joints.some((joint) => joint.name === "hip." + side) || !segment?.points?.sole || !spec.effectors?.some((effector) => effector.segment === segment.name))
      return "the kick needs bilateral named hips and foot effectors with sole points";
  }
  return null;
}

/** `tuning`'s schedule for a kick with the `kick` foot, standing on the other. */
function scheduleOf(tuning: KickTuning, kick: Side): TimedPush[] {
  return (Object.keys(KICK_PUSHES) as PushName[]).map((name) => ({
    channel: KICK_PUSHES[name].replace("{kick}", kick),
    level: tuning[`${name}Level`], from: tuning[`${name}From`], length: tuning[`${name}Length`],
  })).filter((push) => push.level !== 0 && push.length > 0);
}

/**
 * **How a kick drives its leg**, with its settings: `pushed`, flat out toward its contact pose and
 * on its schedule (`KICK_PUSHES`), in one stage, `drive`; `authored`, along timed paths through a
 * chamber, an extension at the target and a retraction, each its own stage.
 */
type Drive = { readonly kind: "pushed"; readonly tuning: KickTuning } | { readonly kind: "authored"; readonly tuning: FrontKickTuning };

/** The stages a kick stands on its one foot through. */
const ONE_FOOT: ReadonlySet<string> = new Set(["drive", "chamber", "extend", "retract"]);

/** **The push kick** (`kick`): the kick, its leg pushed flat out (`Drive`), on `tuning` (`KICK_PATH`). */
export function kickExecutor(body: Body, actions: readonly string[], tuning: KickTuning, resolve: TargetResolver): Executor {
  if (!validKickTuning(tuning)) throw new Error("invalid kick executor settings");
  return kick(body, actions, resolve, { kind: "pushed", tuning });
}

/** **The front kick** (`kick`): the kick, its leg carried along authored paths (`Drive`), on `tuning` (`FRONT_KICK_PATH`). */
export function frontKickExecutor(body: Body, actions: readonly string[], tuning: FrontKickTuning, resolve: TargetResolver): Executor {
  if (!validFrontKickTuning(tuning)) throw new Error("invalid front kick executor settings");
  return kick(body, actions, resolve, { kind: "authored", tuning });
}

/**
 * **The kick**: a drive of either foot ahead at a target about hip height, from where the body
 * stands, with no step to square up. Its weight goes onto the other foot; the kicking leg is
 * driven as `drive` says (`Drive`); the stance then steps it down. A transfer, a set-down or a
 * recentre past its deadline ends it `stalled`; the body down ends it `interrupted`.
 */
function kick(body: Body, actions: readonly string[], resolve: TargetResolver, drive: Drive): Executor {
  const tuning: StageTuning = drive.tuning, pushed = drive.kind === "pushed" ? drive.tuning : null, paced = drive.kind === "authored" ? drive.tuning : null;
  const feet = footStatesOf(body.built), support = supportReadiness(body.built), middle = new Vector3();
  const nameOf = (side: Side): BearingEnd => feet.find((foot) => foot.side === side)!.name;
  const schedules = { left: pushed ? scheduleOf(pushed, "left") : [], right: pushed ? scheduleOf(pushed, "right") : [] };
  const footprints = { left: Object.freeze([segmentResource("foot.left"), LEG_RESOURCE, TRUNK_RESOURCE]), right: Object.freeze([segmentResource("foot.right"), LEG_RESOURCE, TRUNK_RESOURCE]) };
  /** Each leg's reach, hip to sole, m. */
  const reachOf = (side: Side): number => {
    const hip = body.built.spec.joints.find((joint) => joint.name === `hip.${side}`)!.centre.value, sole = segmentOf(body.built.spec, `foot.${side}`)!.distal.value;
    return hypot(hip[0] - sole[0], hip[1] - sole[1], hip[2] - sole[2]);
  };
  const reaches = { left: reachOf("left"), right: reachOf("right") };
  const sideOf = (name: string): Side => {
    if (name === "foot.left") return "left";
    if (name === "foot.right") return "right";
    throw new Error(`kick executor has no effector ${name}`);
  };
  /**
   * Each leg's chain, hip to foot, the freedoms the aimed drive moves, and where its hip stands in
   * the body frame. It moves the leg's flexions and the hip's abduction, which brings the leg in
   * toward the line through the standing foot, and holds the hip's turn: a leg thrown forward off
   * that line, or a hip turned flat out, spins the body about the one foot.
   */
  const legOf = (side: Side) => {
    const effector = bodyEffectors(body.built).find((one) => one.segment.spec.name === `foot.${side}`)!;
    const moved = effector.free.filter((f) => /flexion$|abduction$/.test(f.name));
    return { chain: effector.chain, free: copyFreedoms(moved), work: reachWork(moved.length), point: effector.points.get("strike")!,
      angles: effector.chain.map((joint) => joint.dofs.map(() => 0)), hip: effector.chain[0]!.spec.centre.value, scheduled: new Set(schedules[side].map((push) => push.channel)) };
  };
  const legs = { left: legOf("left"), right: legOf("right") };
  /** The angle in the body frame's sagittal plane of each leg at rest, hip to sole, from straight down, rad: what the hip's flexion turns. */
  const restOf = (side: Side): number => {
    const hip = body.built.spec.joints.find((joint) => joint.name === `hip.${side}`)!.centre.value, sole = segmentOf(body.built.spec, `foot.${side}`)!.distal.value;
    return atan2(sole[2] - hip[2], hip[1] - sole[1]);
  };
  const rests = { left: restOf("left"), right: restOf("right") };
  /** Each hip's most flexion, rad. */
  const hipMost = (side: Side): number => body.built.spec.joints.find((joint) => joint.name === `hip.${side}`)!.dofs.find((dof) => dof.positive === "flexion")!.max.value;
  const hipsMost = { left: hipMost("left"), right: hipMost("right") };
  const target = new Vector3(), hipAt = new Vector3(), strikeAt = new Vector3();
  /**
   * `side`'s leg solved toward `at` from where `view` has it, into its chain's angles
   * (`legs[side].angles`): its strike point at `at`'s height, `reach(level)` m out from the hip
   * toward `at`, `level` m from the hip along the ground; the knee straight where `straight`, else
   * folded, each other freedom it moves nearest where it stands.
   */
  const solveToward = (view: BodyView, side: Side, at: Vec3, reach: (level: number) => number, straight: boolean): void => {
    const leg = legs[side], { chain, angles, hip, free, work } = leg;
    chain.forEach((joint, j) => joint.dofs.forEach((_, k) => { angles[j]![k] = view.angles[channelName(joint, k)] ?? 0; }));
    // The hip, in the root's frame, in the world.
    hipAt.set(hip[0], hip[1], hip[2]).applyRotationQuaternionToRef(view.root.rotation, hipAt).addInPlace(view.root.position);
    const dx = at[0] - hipAt.x, dz = at[2] - hipAt.z, level = hypot(dx, dz) || 1, out = reach(level);
    intoFrameToRef(view.root, [hipAt.x + dx / level * out, at[1], hipAt.z + dz / level * out], target);
    for (const f of free) f.preferred = /^knee/.test(f.name) ? (straight ? f.min : f.max) : angles[f.joint]![f.k]!;
    solveReach(chain, angles, free, [{ point: leg.point, target: [target.x, target.y, target.z] }], undefined, work);
  };
  /**
   * **A kick's drive through**, both kicks': `side`'s leg solved (`solveToward`) for its strike
   * point `through` m past `at`, level at its height, with the knee straight. Out level from a
   * chamber, the sole meets the target at speed with the leg behind it, where a foot carried onto
   * the target slows onto it, and one driven at it from below meets the thighs before the mark.
   */
  const solveThrough = (view: BodyView, side: Side, at: Vec3, through: number): void => solveToward(view, side, at, (level) => level + through, true);
  /**
   * The aimed drive's step `since` s into `live`'s drive onto `posture` and `pushes`, a push kick:
   * the leg solved for its chamber, its strike point at the target's height `chamber` m out from
   * the hip toward it with the knee folded; then, once the strike point has risen to that height or
   * `knee` s after `lead`, for its drive through (`solveThrough`); each freedom its schedule does
   * not push driven toward it (`driven`).
   */
  const aimed = (view: BodyView, live: Motion, since: number, posture: Record<string, number>, pushes: MusclePush[]): void => {
    const side = live.foot, at = live.aim, leg = legs[side], push = pushed!;
    // The strike point, in the root's frame, in the world.
    view.effectors[`foot.${side}`]!.points.strike!.applyRotationQuaternionToRef(view.root.rotation, strikeAt).addInPlace(view.root.position);
    if (!live.out && (since >= push.lead + push.knee || strikeAt.y >= at[1])) live.out = true;
    if (live.out) solveThrough(view, side, at, push.through);
    else solveToward(view, side, at, () => push.chamber, false);
    const part = stepShare(since, live.step, push.lead, Infinity);
    for (const f of leg.free) driven(view, f.name, leg.angles[f.joint]![f.k]!, leg.scheduled.has(f.name) ? 0 : part, posture, pushes);
  };
  /**
   * `channel` set to `goal` in `posture`, and driven toward it at `part` of its strength: at the speed
   * that stops it on the goal slowing at `decel`, flat out while far and held there once on it. A
   * freedom pushed flat out to its goal runs on into its stop, and the leg's momentum throws the body.
   */
  const driven = (view: BodyView, channel: string, goal: number, part: number, posture: Record<string, number>, pushes: MusclePush[]): void => {
    const error = goal - (view.angles[channel] ?? 0), sense = error >= 0 ? 1 : -1;
    posture[channel] = goal;
    if (part > 0) pushes.push({ channel, sense, level: part, speed: sense * Math.sqrt(2 * tuning.decel * Math.abs(error)) });
  };
  const sampled: [number, number, number] = [0, 0, 0];
  /**
   * The authored drive's paths this step, `live` in one of its stages: each freedom of the stage's
   * goals (`Motion.goals`) from where the stage found it (`live.from`) toward its goal over the
   * stage's seconds.
   */
  const authored = (live: Motion): Record<string, FreedomPath> => {
    const path = paced!, seconds = live.stage === "chamber" ? path.chamberSeconds : live.stage === "extend" ? path.extendSeconds : path.retractSeconds;
    const paths: Record<string, FreedomPath> = {};
    for (const [channel, goal] of Object.entries(live.goals)) {
      const from = live.from[channel] ?? [goal, 0];
      scalarPathToRef(from[0], from[1], goal, live.time, seconds, sampled);
      paths[channel] = { angle: sampled[0], rate: sampled[1], acceleration: sampled[2], seconds: path.pathSeconds };
    }
    live.paths = paths;
    return paths;
  };
  /**
   * The authored drive's next stage: its goals (`Motion.goals`), and each path starting from where
   * its freedom is, at the rate the last step's path had it moving. The chamber and the retraction:
   * the hip flexed `chamberLift` past where it points the leg at the target, the knee folded to
   * `chamberKnee`, the leg's other freedoms where the drive found them; the extension: the leg's
   * drive through (`solveThrough`). The lumbar counters the hip's flexion in each.
   */
  const nextPaths = (view: BodyView, next: "chamber" | "extend" | "retract") => {
    const live = state.live!, foot = live.foot, leg = legs[foot], path = paced!, hipFlexion = `hip.${foot} flexion`, lumbar = "lumbar flexion";
    if (next !== "retract") {
      // The hip's flexion that points the leg, hip to sole, at the target: in the body frame's sagittal plane, less the leg's own at rest.
      intoFrameToRef(view.root, live.aim, target);
      live.aimHip = Math.min(Math.max(atan2(target.z - leg.hip[2], leg.hip[1] - target.y) - rests[foot], 0), hipsMost[foot]);
    }
    const goals: Record<string, number> = {};
    if (next === "extend") {
      solveThrough(view, foot, live.aim, path.through);
      for (const f of leg.free) goals[f.name] = leg.angles[f.joint]![f.k]!;
    } else {
      for (const f of leg.free) goals[f.name] = live.posture[f.name] ?? view.angles[f.name] ?? 0;
      goals[hipFlexion] = Math.min(live.aimHip + path.chamberLift, hipsMost[foot]);
      goals[`knee.${foot} flexion`] = path.chamberKnee;
    }
    goals[lumbar] = (live.posture[lumbar] ?? 0) - path.counter * goals[hipFlexion]!;
    live.goals = goals;
    live.from = Object.fromEntries(Object.keys(goals).map((channel) => [channel, [view.angles[channel] ?? 0, live.paths[channel]?.rate ?? 0] as const]));
    stage(next);
  };
  const world = new Vector3(), turn = new Quaternion();
  /** Where `side`'s sole stands, and the foot's turn, in the world. */
  const footing = (view: BodyView, side: Side) => {
    const effector = view.effectors[`foot.${side}`]!;
    effector.points.sole!.applyRotationQuaternionToRef(view.root.rotation, world).addInPlace(view.root.position);
    view.root.rotation.multiplyToRef(effector.rotation, turn).normalize();
    return { sole: [world.x, world.y, world.z] as Vec3, rotation: [turn.x, turn.y, turn.z, turn.w] as const };
  };
  type Motion = { request: ActionRequest; foot: Side; stage: "transfer" | "drive" | "chamber" | "extend" | "retract" | "set" | "recenter"; phase: "prepare" | "commit" | "release";
    time: number; step: number; held: number; heading: number; height: number; bearing: ReturnType<typeof footing>; posture: Pose; aim: Vec3;
    /** Whether the aimed drive has left its chamber. */
    out: boolean; touched: number | null; withdrawn: boolean; ending: ActionEnding;
    /**
     * The authored drive's: each freedom's goal in its stage; where each path of its stage began,
     * angle and rate; the paths of the last step; the hip's flexion that points the leg at the target.
     */
    goals: Record<string, number>; from: Record<string, readonly [number, number]>; paths: Record<string, FreedomPath>; aimHip: number };
  const state = { live: null as Motion | null };
  const stage = (next: Motion["stage"]) => { const live = state.live!; live.stage = next; live.time = 0; live.held = 0; };
  const release = (ending: ActionEnding, next: "set" | "recenter") => { const live = state.live!; live.ending = ending; live.phase = "release"; stage(next); };
  /** Whether the kicking foot has met the body it was thrown at, noted at the time it first did. */
  const touches = (view: BodyView, live: Motion): void => {
    const feedback = view.effectors[live.request.effector]?.feedback;
    const met = feedback?.contact?.target, request = live.request.target;
    if (live.touched === null && (feedback?.impulse ?? 0) > 0 && met?.kind === "body" && request.kind === "body" && met.body === request.body) live.touched = live.time;
  };
  const finish = (ending: ActionEnding): LifecycleUpdate => { const id = state.live!.request.id; state.live = null; return { id, ending }; };
  return {
    state,
    needs(_action, effector) { return footprints[sideOf(effector)]; },
    readiness(view, action, effector, target, around) {
      if (!actions.includes(action)) return { kind: "blocked", reason: "unknown action" };
      if (effector !== "foot.left" && effector !== "foot.right") return { kind: "blocked", reason: "unsupported effector" };
      if (view.down) return { kind: "blocked", reason: "body is down" };
      if (state.live) return { kind: "waiting", reason: "a kick is under way" };
      const at = resolve(view, target, action, effector);
      if (!at) return { kind: "blocked", reason: "target has no aim" };
      const side = sideOf(effector), sole = view.stance.ends[nameOf(side)]!.middle.y;
      const reach = reaches[side];
      if (at[1] < sole + tuning.low * reach || at[1] > sole + tuning.high * reach) return { kind: "beyond", reason: "target is outside the kick's height band" };
      const window = { at, along: [tuning.alongNear * reach, tuning.alongFar * reach] as const, across: [-tuning.across * reach, tuning.across * reach] as const,
        facing: tuning.facing, speed: tuning.admitSpeed, ...(target.kind === "body" ? { on: target.body } : {}) };
      return withinActionWindow(view, window, around.heading) ? { kind: "ready", window } : { kind: "position", window };
    },
    resume() { state.live = null; },
    start(view, request, around) {
      if (state.live) throw new Error("kick executor already owns an instance");
      const foot = sideOf(request.effector);
      state.live = { request: { ...request }, foot, stage: "transfer", phase: "prepare", time: 0, step: 0, held: 0, heading: around.heading,
        height: supportHeight(view) - around.lower - tuning.lower, bearing: footing(view, otherSide(foot)), posture: {}, aim: [0, 0, 0],
        out: false, touched: null, withdrawn: false, ending: { kind: "completed" }, goals: {}, from: {}, paths: {}, aimHip: 0 };
    },
    update(view, continued, _around, dt) {
      const live = state.live;
      if (!live) return [];
      // The feet read where they stand now: the standing sole's outline the centre is held over moves as the body does.
      support.read(view.stance.centre, view.stance.velocity, dt); readSupport(feet, feet, middle);
      if (view.down) return [finish({ kind: "interrupted", reason: "body is down" })];
      const request = continued.find((one) => one.id === live.request.id);
      if (!request) live.withdrawn = true;
      const at = resolve(view, (request ?? live.request).target, live.request.action, live.request.effector);
      if (at) live.aim = [at[0], at[1], at[2]];
      if (live.phase === "prepare" && (live.withdrawn || !at)) release(!at ? { kind: "lost", reason: "target is no longer sensed" } : { kind: "cancelled" }, "recenter");
      live.time += dt; live.step = dt;
      const foot = live.foot, other = otherSide(foot), centre = view.stance.centre;
      const inside = withinSupport([feet.find((one) => one.side === other)!], centre.x, centre.z);
      const bearingReady = support.state.loads[other] > 0 && !support.state.otherSupport && inside[0] === centre.x && inside[1] === centre.z;
      switch (live.stage) {
        case "transfer": {
          live.held = bearingReady && support.state.speed <= tuning.transferSlow ? live.held + dt : 0;
          // A centre carried out over neither foot (a blow, as a rule) is caught by the stance's own standing, which steps.
          const base = withinSupport(feet, centre.x, centre.z, 0);
          if (base[0] !== centre.x || base[1] !== centre.z) release({ kind: "interrupted", reason: "centre left its base" }, "recenter");
          else if (live.time >= tuning.transferLimit) release({ kind: "stalled", reason: "support transfer deadline" }, "recenter");
          else if (live.held >= tuning.hold) {
            if (paced) nextPaths(view, "chamber"); else stage("drive");
            live.phase = "commit";
            // The kicking leg's freedoms, its hip's, knee's and ankle's, and those the drive pushes, held where the drive finds them.
            const joints = [`hip.${foot} `, `knee.${foot} `, `ankle.${foot} `], pushed = new Set(schedules[foot].map((push) => push.channel));
            live.posture = Object.fromEntries(Object.entries(view.angles).filter(([channel]) => pushed.has(channel) || joints.some((joint) => channel.startsWith(joint))));
          }
          break;
        }
        case "drive":
          touches(view, live);
          if (live.time >= pushed!.longest || live.touched !== null && live.time >= live.touched + tuning.follow) release({ kind: "completed" }, "set");
          break;
        case "chamber":
          if (live.time >= paced!.chamberSeconds) nextPaths(view, "extend");
          break;
        case "extend":
          touches(view, live);
          if (live.time >= (live.touched ?? paced!.extendSeconds) + tuning.follow) { nextPaths(view, "retract"); live.phase = "release"; }
          break;
        case "retract":
          if (live.time >= paced!.retractSeconds) stage("set");
          break;
        case "set": {
          live.held = view.stance.phase === "stand" && support.state.loads[foot] > 0 ? live.held + dt : 0;
          if (live.held >= tuning.hold) stage("recenter");
          else if (live.time >= tuning.setLimit) return [finish({ kind: "stalled", reason: `set-down deadline after ${live.ending.reason ?? live.ending.kind}` })];
          break;
        }
        case "recenter":
          live.held = plantedSupport(support.state) ? live.held + dt : 0;
          if (live.held >= tuning.hold) return [finish(live.ending)];
          if (live.time >= tuning.recenterLimit) return [finish({ kind: "stalled", reason: `recenter deadline after ${live.ending.reason ?? live.ending.kind}` })];
          break;
        default: { const never: never = live.stage; throw new Error(`unknown kick stage ${never}`); }
      }
      return [{ id: live.request.id, phase: live.phase, stage: live.stage, holds: footprints[live.foot], ...(at ? { aim: at } : {}) }];
    },
    command(view, id) {
      const live = state.live;
      if (!live || live.request.id !== id) throw new Error(`kick executor has no instance ${id}`);
      const foot = live.foot, other = otherSide(foot), both = !ONE_FOOT.has(live.stage), own = live.stage === "set" || live.stage === "recenter";
      const standing: LegsGoal = { walk: null, feet: both ? [nameOf("left"), nameOf("right")] : [nameOf(other)], centre: own ? null : [live.bearing.sole[0] + tuning.ahead * sin(live.heading), live.bearing.sole[2] + tuning.ahead * cos(live.heading)],
        height: live.height, heading: live.heading,
        // The set-down and the recentre are the stance's own standing, which steps the kicking foot down where it catches
        // what the kick left moving: a pose holds a body only on planted feet, and takes no step; a step back to where the
        // foot stood lands where the body is no longer going.
        ...(own ? {}
          : { pose: { pitch: both ? 0 : tuning.lean, seconds: tuning.transferSeconds,
            ...(both ? {} : { anchors: { [nameOf(other)]: { position: live.bearing.sole, rotation: live.bearing.rotation } } }) } }) };
      if (live.stage === "set") {
        // What the drive pushed beyond the leg, which the stance now has, is driven back to where the drive found it.
        const pushes: MusclePush[] = [], posture: Record<string, number> = {};
        for (const [channel, angle] of Object.entries(live.posture)) if (!legs[foot].chain.some((joint) => channel.startsWith(`${joint.spec.name} `))) driven(view, channel, angle, 1, posture, pushes);
        return { legs: standing, posture, pushes };
      }
      if (live.stage === "chamber" || live.stage === "extend" || live.stage === "retract") return { legs: standing, posture: { ...live.posture }, paths: authored(live) };
      if (live.stage !== "drive") return { legs: standing };
      const pushes: MusclePush[] = [], posture = { ...live.posture }, since = live.time - live.step;
      timedPushes(schedules[foot], since, live.step, pushes);
      if (since + live.step >= pushed!.lead) aimed(view, live, since, posture, pushes);
      return { legs: standing, posture, pushes };
    },
  };
}
