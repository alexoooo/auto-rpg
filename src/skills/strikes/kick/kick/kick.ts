import { segmentResource, LEG_RESOURCE, TRUNK_RESOURCE } from "../../../framework/action.ts";
import { supportHeight } from "../../../../control/support-reference.ts";
import { Quaternion, Vector3 } from "../../../../core/math/vector.ts";
import type { Body, BodyView } from "../../../../control/body.ts";
import type { MusclePush } from "../../../../control/motor.ts";
import { footStatesOf, readSupport, withinSupport } from "../../../../control/support.ts";
import { intoFrameToRef, reachWork, solveReach } from "../../../../control/kinematics.ts";
import { bodyEffectors, copyFreedoms } from "../../../../control/effectors.ts";
import { channelName } from "../../../../core/bodies/muscle/driver.ts";
import { supportReadiness, plantedSupport } from "../../shared/support-readiness.ts";
import { stepShare, timedPushes, type TimedPush } from "../../shared/timed-push.ts";
import { STANCE_GAIT } from "../../../../control/stance/stance-tuning.ts";
import { hypot } from "../../../../core/math/real.ts";
import type { Vec3 } from "../../../../core/quantity.ts";
import { segmentOf, type BearingEnd } from "../../../../core/bodies/spec/body.ts";
import type { Pose } from "../../../../core/bodies/spec/pose.ts";
import type { ActionEnding, ActionRequest, Executor, LifecycleUpdate, TargetResolver } from "../../../framework/action.ts";
import type { LegsGoal } from "../../../framework/skill.ts";
import { withinActionWindow } from "../../../intent/action-window.ts";
import { type Side, otherSide } from "../../../../core/bodies/bilateral.ts";

/**
 * **What a kick pushes**, by name: each a channel of the kicking leg (`{kick}`), the standing leg
 * (`{stand}`) or the trunk, driven flat out over its own window of the drive (`TimedPush`) by the
 * settings `<name>Level`, `<name>From` and `<name>Length`. The hip is pushed twice, to drive and to
 * brake, and the knee twice, to chamber and to open; a level's sign is the push's sense.
 */
export const KICK_PUSHES = Object.freeze({
  hip: "hip.{kick} flexion", hipBrake: "hip.{kick} flexion", chamber: "knee.{kick} flexion", extend: "knee.{kick} flexion", ankle: "ankle.{kick} dorsiflexion",
  trunk: "lumbar flexion", standKnee: "knee.{stand} flexion", standHip: "hip.{stand} flexion",
});

type PushName = keyof typeof KICK_PUSHES;
type ScheduleKey = `${PushName}${"Level" | "From" | "Length"}`;

/** Each push's settings at none: a schedule pushes only what its settings name. */
const UNPUSHED = Object.fromEntries((Object.keys(KICK_PUSHES) as PushName[]).flatMap((name) => [[`${name}Level`, 0], [`${name}From`, 0], [`${name}Length`, 0]])) as Record<ScheduleKey, number>;

/**
 * **The kick's settings**: the keys every body's record holds, each record whole. Control data,
 * not anatomy; seconds, metres, radians and m/s. A kick runs in stages: transfer moves the centre
 * over the standing foot, both feet bearing, until it is quiet there; drive stands on that foot
 * alone, anchored where it stands, and drives the leg at the target (the aimed drive, below) and
 * on its schedule (`KICK_PUSHES`), each freedom neither moves held where the drive found it, until `follow` s after the foot first
 * touches the target or `longest` s after the drive began; set-down is the stance's step of the
 * kicking foot back to where it stood, each other freedom the drive pushed driven back to where
 * the drive found it, until the foot bears; recentre is the stance's standing, stepping where it
 * must, until both feet bear and are quiet.
 */
export const KICK_PATH = Object.freeze({
  /** The deadlines to bring the centre over the standing foot, to set the kicking one down, and to stand quiet on both feet again. */
  transferLimit: 2, setLimit: 3, recenterLimit: 3,
  /** How fast the trunk is brought over the standing foot and held there, s, and the most the centre may move at the transfer's end, m/s. */
  transferSeconds: .2, transferSlow: .12,
  /** The root's pitch held on the one foot through the drive, rad (the supported pose's). */
  lean: 0,
  /** How long a stage's end holds before the next. */
  hold: .03,
  /** How far the pelvis is lowered on the standing leg. */
  lower: .03,
  /** How long the drive runs on after the foot touches, and its longest. */
  follow: .08, longest: .8,
  /**
   * The aimed drive: from `lead` s into the drive, the leg driven first to its chamber, its strike
   * point at the target's height `chamber` m out from the hip with the knee folded, and from `knee`
   * s after `lead` toward its contact pose, the strike point `through` m past the target on the
   * line from the hip with the knee straight; each freedom at the speed that stops it there slowing
   * at `decel` rad/s² (`driven`).
   */
  lead: 0, chamber: .3, knee: .1, through: .15, decel: 150,
  /**
   * The window: the target this far ahead of the body's centre and within `across` either side of
   * its line, m, its height from `low` to `high` over the kicking sole as shares of the leg's reach
   * (hip to sole); its facing, rad, and the most ground speed it admits, m/s.
   */
  alongNear: .5, alongFar: 1.1, across: .25, low: .6, high: 1.4, facing: .5, admitSpeed: .6,
  ...UNPUSHED,
});

export type KickTuning = { readonly [K in keyof typeof KICK_PATH]: number };

/** Whether `tuning` is a kick's: each setting finite, its times and window positive where they must be, each push's level within -1 and 1 and its window not negative. */
export function validKickTuning(tuning: KickTuning): boolean {
  return Object.values(tuning).every(Number.isFinite)
    && [tuning.transferLimit, tuning.setLimit, tuning.recenterLimit, tuning.transferSeconds, tuning.transferSlow, tuning.longest, tuning.across, tuning.facing].every((v) => v > 0)
    && [tuning.hold, tuning.lower, tuning.follow, tuning.admitSpeed, tuning.low, tuning.lead, tuning.chamber, tuning.knee, tuning.through].every((v) => v >= 0) && tuning.decel > 0
    && tuning.alongFar > tuning.alongNear && tuning.high > tuning.low
    && (Object.keys(KICK_PUSHES) as PushName[]).every((name) => Math.abs(tuning[`${name}Level`]) <= 1 && tuning[`${name}From`] >= 0 && tuning[`${name}Length`] >= 0);
}

/** `tuning`'s schedule for a kick with the `kick` foot, standing on the other. */
function scheduleOf(tuning: KickTuning, kick: Side): TimedPush[] {
  return (Object.keys(KICK_PUSHES) as PushName[]).map((name) => ({
    channel: KICK_PUSHES[name].replace("{kick}", kick).replace("{stand}", otherSide(kick)),
    level: tuning[`${name}Level`], from: tuning[`${name}From`], length: tuning[`${name}Length`],
  })).filter((push) => push.level !== 0 && push.length > 0);
}

/**
 * **The kick** (`kick`): a drive of either foot ahead at a target about hip height, from where the
 * body stands, with no step to square up. Its weight goes onto the other foot; the kicking leg is
 * pushed flat out toward its contact pose, solved each step for where the target is, and on a
 * schedule (`KICK_PUSHES`); the stance then steps it back. A transfer, a set-down or a
 * recentre past its deadline ends it `stalled`; the body down ends it `interrupted`.
 */
export function kickExecutor(body: Body, actions: readonly string[], tuning: KickTuning, resolve: TargetResolver): Executor {
  if (!validKickTuning(tuning)) throw new Error("invalid kick executor settings");
  const feet = footStatesOf(body.built), support = supportReadiness(body.built), middle = new Vector3();
  const nameOf = (side: Side): BearingEnd => feet.find((foot) => foot.side === side)!.name;
  const schedules = { left: scheduleOf(tuning, "left"), right: scheduleOf(tuning, "right") };
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
  const target = new Vector3();
  /**
   * The aimed drive's step `since` s into the drive onto `posture` and `pushes`: the leg solved for
   * its chamber, its strike point at `at`'s height `chamber` m out from the hip toward it with the
   * knee folded, and from `knee` s after `lead` for its strike point `through` m past `at` on the
   * line from the hip with the knee straight; each freedom its schedule does not push driven toward
   * it (`driven`). A foot driven straight at the target from the ground rises into it from below,
   * meeting the thigh before the mark.
   */
  const aimed = (view: BodyView, side: Side, at: Vec3, since: number, step: number, posture: Record<string, number>, pushes: MusclePush[]): void => {
    const leg = legs[side], { chain, angles, hip, free, work } = leg, chambered = since < tuning.lead + tuning.knee;
    chain.forEach((joint, j) => joint.dofs.forEach((_, k) => { angles[j]![k] = view.angles[channelName(joint, k)] ?? 0; }));
    intoFrameToRef(view.root, at, target);
    const dx = target.x - hip[0], dy = target.y - hip[1], dz = target.z - hip[2], apart = hypot(dx, dy, dz) || 1, out = (apart + tuning.through) / apart;
    const level = hypot(dx, dz) || 1, toward = tuning.chamber / level;
    const goal: Vec3 = chambered ? [hip[0] + dx * toward, target.y, hip[2] + dz * toward] : [hip[0] + dx * out, hip[1] + dy * out, hip[2] + dz * out];
    for (const f of free) f.preferred = /^knee/.test(f.name) ? (chambered ? f.max : f.min) : angles[f.joint]![f.k]!;
    solveReach(chain, angles, free, [{ point: leg.point, target: goal }], undefined, work);
    const part = stepShare(since, step, tuning.lead, Infinity);
    for (const f of free) driven(view, f.name, angles[f.joint]![f.k]!, leg.scheduled.has(f.name) ? 0 : part, posture, pushes);
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
  const world = new Vector3(), turn = new Quaternion();
  /** Where `side`'s sole stands, and the foot's turn, in the world. */
  const footing = (view: BodyView, side: Side) => {
    const effector = view.effectors[`foot.${side}`]!;
    effector.points.sole!.applyRotationQuaternionToRef(view.root.rotation, world).addInPlace(view.root.position);
    view.root.rotation.multiplyToRef(effector.rotation, turn).normalize();
    return { sole: [world.x, world.y, world.z] as Vec3, rotation: [turn.x, turn.y, turn.z, turn.w] as const };
  };
  type Motion = { request: ActionRequest; foot: Side; stage: "transfer" | "drive" | "set" | "recenter"; phase: "prepare" | "commit" | "release";
    time: number; step: number; held: number; heading: number; height: number; bearing: ReturnType<typeof footing>; stood: readonly [number, number]; posture: Pose; aim: Vec3;
    touched: number | null; withdrawn: boolean; ending: ActionEnding };
  const state = { live: null as Motion | null };
  const stage = (next: Motion["stage"]) => { const live = state.live!; live.stage = next; live.time = 0; live.held = 0; };
  const release = (ending: ActionEnding, next: "set" | "recenter") => { const live = state.live!; live.ending = ending; live.phase = "release"; stage(next); };
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
      if (at[1] < sole + tuning.low * reaches[side] || at[1] > sole + tuning.high * reaches[side]) return { kind: "blocked", reason: "target is outside the kick's height band" };
      const window = { at, along: [tuning.alongNear, tuning.alongFar] as const, across: [-tuning.across, tuning.across] as const,
        facing: tuning.facing, speed: tuning.admitSpeed, ...(target.kind === "body" ? { on: target.body } : {}) };
      return withinActionWindow(view, window, around.heading) ? { kind: "ready", window } : { kind: "position", window };
    },
    resume() { state.live = null; },
    start(view, request, around) {
      if (state.live) throw new Error("kick executor already owns an instance");
      const foot = sideOf(request.effector);
      state.live = { request: { ...request }, foot, stage: "transfer", phase: "prepare", time: 0, step: 0, held: 0, heading: around.heading,
        height: supportHeight(view) - around.lower - tuning.lower, bearing: footing(view, otherSide(foot)), stood: [footing(view, foot).sole[0], footing(view, foot).sole[2]], posture: {}, aim: [0, 0, 0],
        touched: null, withdrawn: false, ending: { kind: "completed" } };
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
          if (live.time >= tuning.transferLimit) release({ kind: "stalled", reason: "support transfer deadline" }, "recenter");
          else if (live.held >= tuning.hold) {
            stage("drive"); live.phase = "commit";
            // The kicking leg's freedoms, its hip's, knee's and ankle's, and those the drive pushes, held where the drive finds them.
            const joints = [`hip.${foot} `, `knee.${foot} `, `ankle.${foot} `], pushed = new Set(schedules[foot].map((push) => push.channel));
            live.posture = Object.fromEntries(Object.entries(view.angles).filter(([channel]) => pushed.has(channel) || joints.some((joint) => channel.startsWith(joint))));
          }
          break;
        }
        case "drive": {
          const feedback = view.effectors[live.request.effector]?.feedback;
          const met = feedback?.contact?.target, request = live.request.target;
          if (live.touched === null && (feedback?.impulse ?? 0) > 0 && met?.kind === "body" && request.kind === "body" && met.body === request.body) live.touched = live.time;
          if (live.time >= tuning.longest || live.touched !== null && live.time >= live.touched + tuning.follow) release({ kind: "completed" }, "set");
          break;
        }
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
      const foot = live.foot, other = otherSide(foot), both = live.stage !== "drive", centred = live.stage === "recenter";
      const standing: LegsGoal = { walk: null, feet: both ? [nameOf("left"), nameOf("right")] : [nameOf(other)], centre: centred ? null : [live.bearing.sole[0], live.bearing.sole[2]],
        height: live.height, heading: live.heading,
        // The set-down is the stance's own step back to where the foot stood, and the recentre its own standing, which steps
        // to catch what the kick left moving: a pose holds a body only on planted feet, and takes no step.
        ...(live.stage === "set" ? { swing: { foot: nameOf(foot), to: live.stood, seconds: STANCE_GAIT.seconds, lift: STANCE_GAIT.lift } }
          : live.stage === "recenter" ? {}
          : { pose: { pitch: live.stage === "drive" ? tuning.lean : 0, seconds: tuning.transferSeconds,
            ...(both ? {} : { anchors: { [nameOf(other)]: { position: live.bearing.sole, rotation: live.bearing.rotation } } }) } }) };
      if (live.stage === "set") {
        // What the drive pushed beyond the leg, which the stance now has, is driven back to where the drive found it.
        const pushes: MusclePush[] = [], posture: Record<string, number> = {};
        for (const [channel, angle] of Object.entries(live.posture)) if (!legs[foot].chain.some((joint) => channel.startsWith(`${joint.spec.name} `))) driven(view, channel, angle, 1, posture, pushes);
        return { legs: standing, posture, pushes };
      }
      if (live.stage !== "drive") return { legs: standing };
      const pushes: MusclePush[] = [], posture = { ...live.posture }, since = live.time - live.step;
      timedPushes(schedules[foot], since, live.step, pushes);
      if (since + live.step >= tuning.lead) aimed(view, foot, live.aim, since, live.step, posture, pushes);
      return { legs: standing, posture, pushes };
    },
  };
}
