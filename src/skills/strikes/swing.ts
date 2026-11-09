import { segmentResource, LEG_RESOURCE, TRUNK_RESOURCE } from "../framework/action.ts";
import { supportHeight } from "../../control/support-reference.ts";
import { handConfiguration } from "../reach/hand.ts";
import type { Body, BodyView } from "../../control/body.ts";
import type { MusclePush } from "../../control/motor.ts";
import { atan2, cos, hypot, sin } from "../../core/math/real.ts";
import { Vector3 } from "../../core/math/vector.ts";
import type { Vec3 } from "../../core/quantity.ts";
import { bodyEffectors } from "../../control/effectors.ts";
import { intoFrameToRef, pointAtToRef } from "../../control/kinematics.ts";
import { channelName } from "../../core/bodies/muscle/driver.ts";
import { act, ask, learnerOf, restart, start, stop } from "../../core/math/learning/learner.ts";
import { legOf } from "../locomotion/gait-scale.ts";
import { punchChannels, punchFeatures, steerPushes, type PunchLayout } from "./learned-punch.ts";
import type { Pose } from "../../core/bodies/spec/pose.ts";
import { type BearingEnd, type BodySpec } from "../../core/bodies/spec/body.ts";
import { footOn } from "../../control/support.ts";
import type { ActionEnding, ActionRequest, Executor, LifecycleUpdate, TargetResolver } from "../framework/action.ts";
import { placedHeightFits } from "../reach/arm-reach.ts";
import { faceAligner } from "./face-aligner.ts";
import type { StrikingFace } from "./straight-punch.ts";
import { clearAhead, quietToStrike, strikeWindow } from "./strike-window.ts";
import { bodyAhead } from "../locomotion/navigation/held-clearance.ts";
import { sensedActionTarget } from "../framework/action-aim.ts";
import { timedPushes, validPush, type TimedPush } from "./timed-push.ts";
import { otherSide, type Side, SIDES } from "../../core/bodies/bilateral.ts";

/**
 * **A swing's settings.** It is admitted with the body moving no faster than `pace` m/s, facing
 * the target, its head `reach` m from it across the ground (`band` m further at most, `CROWDED`
 * nearer), no more than `aside` m to either side of the line it faces, the target within the arm's
 * height band for its face (`placedHeightFits`), and with `poised` its stance already quiet. From
 * the admission the striking hand's trunk and arm channels `wound` names stand at its angles, rad
 * (the windup); with `footing`, the striking hand's, each foot first steps to its place, m behind
 * the target along the way the head faced it at the admission and to that way's right, and the
 * stance faces that way through the swing; once the feet are placed, the stance is quiet and has
 * stood wound `settle` s, each such channel at its angle or still (`WOUND_WITHIN`), `timed` pushes
 * each channel it names flat out over its own window of the swing (`TimedPush`), the rest held
 * wound.
 * The swing ends `follow` s after the hand begins to touch something, or `longest` s after it
 * began; the arm comes back to the guard over `recover` s. With `halts`, it stops a walk at once.
 * With `steered`, a swing whose kind has a steer's layout adds its steer to the pushes through the
 * swing (`steerPushes`): its trainer's, or its record's network's.
 */
export interface Swing {
  readonly pace: number;
  readonly reach: number;
  readonly band: number;
  readonly aside: number;
  readonly poised?: boolean;
  readonly halts?: boolean;
  readonly steered?: boolean;
  readonly settle: number;
  readonly wound: { readonly left: Readonly<Record<string, number>>; readonly right: Readonly<Record<string, number>> };
  readonly timed: { readonly left: readonly TimedPush[]; readonly right: readonly TimedPush[] };
  readonly footing?: { readonly left: SwingFooting; readonly right: SwingFooting };
  readonly follow: number;
  readonly longest: number;
  readonly recover: number;
}

/** Where each foot stands for a swing: m behind the target along the way the body faces it, and to that way's right. */
export type SwingFooting = Readonly<Record<Side, readonly [behind: number, right: number]>>;

const HANDS: readonly Side[] = SIDES;

/** The settings every swing names; the rest are its options. */
const REQUIRED = ["pace", "reach", "band", "aside", "settle", "follow", "longest", "recover"] as const;

/** Every setting a swing may name (`Swing`). */
export const SWING_KEYS: readonly (keyof Swing)[] = Object.freeze([...REQUIRED, "poised", "halts", "steered", "wound", "timed", "footing"]);

/** Whether `settings`, some of a swing's, are each valid: its numbers finite and not negative, its pace, reach, band, aside and length positive, its windup's angles finite, its pushes valid and its footing's places finite. */
export function validSwingPart(settings: Partial<Swing>): boolean {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return false;
  const flag = (value: unknown) => value === undefined || typeof value === "boolean";
  return REQUIRED.every((key) => settings[key] === undefined || Number.isFinite(settings[key]) && settings[key] >= 0)
    && (["pace", "reach", "band", "aside", "longest"] as const).every((key) => settings[key] === undefined || settings[key] > 0)
    && flag(settings.poised) && flag(settings.halts) && flag(settings.steered)
    && (settings.wound === undefined || HANDS.every((hand) => typeof settings.wound![hand] === "object" && settings.wound![hand] !== null
      && Object.values(settings.wound![hand]).every(Number.isFinite)))
    && (settings.timed === undefined || HANDS.every((hand) => Array.isArray(settings.timed![hand]) && settings.timed![hand].every(validPush)))
    && (settings.footing === undefined || HANDS.every((hand) => SIDES.every((foot) => {
      const place = settings.footing![hand]?.[foot];
      return Array.isArray(place) && place.length === 2 && place.every(Number.isFinite);
    })));
}

/** Whether `settings` are a swing's: each it names valid (`validSwingPart`), and every one it must name named, its windup and its pushes too. */
export function validSwing(settings: Partial<Swing>): settings is Swing {
  return validSwingPart(settings) && REQUIRED.every((key) => settings[key] !== undefined) && settings.wound !== undefined && settings.timed !== undefined;
}

/** Why a body of `spec` cannot take `settings`' windup and pushes, or null: a channel they name that it lacks. */
export function swingChannelFault(spec: BodySpec, settings: Partial<Swing>): string | null {
  const channels = new Set(spec.joints.flatMap((joint) => joint.dofs.map((dof) => `${joint.name} ${dof.positive}`)));
  const named = HANDS.flatMap((hand) => [...Object.keys(settings.wound?.[hand] ?? {}), ...(settings.timed?.[hand] ?? []).map((push) => push.channel)]);
  const missing = [...new Set(named.filter((channel) => !channels.has(channel)))];
  return missing.length ? `has no ${missing.join(", ")} to swing` : null;
}

/** The longest a swing waits for its stance to be quiet and its windup reached before it gives up, s. */
const SWING_PREPARE_LIMIT = 6;

/**
 * When a wound channel has reached its windup: within `WOUND_WITHIN` rad of its angle, or turning
 * slower than `WOUND_STILL` rad/s, as near as the muscles hold it against the item's weight.
 */
const WOUND_WITHIN = 0.1, WOUND_STILL = 0.5;

/** The most a component of the target's velocity counts in what a steer reads, m/s: a foe's lunge is under it, an aim's jump from one opening to another is cut to it. */
const AIM_SPEED = 4;

/** The least speed of the face through which its path is read and its facing turned onto it (`faceAligner`), m/s. */
const ALIGN_SPEED = 1;

/**
 * **A swing**: a held item's blow thrown on an arc that meets the target with the item's face
 * first (`StrikingFace`: the sword's edge, the club's head). Admitted where its window says
 * (`strikeWindow`), it winds the trunk and the striking arm up to its record's angles and, each
 * there or still (`WOUND_WITHIN`), stands quiet there `settle` s; then its schedule pushes each
 * channel it names flat out over its window (`timedPushes`), the arc's speed coming from the windup's range, the face meeting the target
 * where the arc passes it. With a footing, it steps the feet to it and turns the stance to the
 * target before it settles, so the arc starts from the same stance wherever the walk left it.
 * After the swing it brings the arm back to the guard. An attack given up
 * before the swing is dropped; a swing begun is thrown to its end. It has the hand, the trunk and
 * the legs from its windup to its return, and the hand grips throughout. With `align`, through the
 * swing, once the face moves faster than `ALIGN_SPEED`, the wrist turns it onto its path, either
 * way leading (`faceAligner`), its scheduled pushes dropped. With a `layout` (`PunchLayout`), a
 * `steered` swing's learner runs from its start to its release: it reads itself once as it begins
 * (one decision over the windup, which no steer moves), then every decision interval of its layout
 * through the swing (`punchFeatures`: the target from the striking shoulder, the face from the
 * target, the arm's straight length from the shoulder to the face), and adds the steer,
 * `policy`'s or its trainer's, to its pushes (`steerPushes`).
 */
export function swingExecutor(body: Body, guard: Pose, actions: readonly string[], settings: Swing, resolve: TargetResolver,
  faces: Partial<Record<Side, StrikingFace>>, { align = false, layout, policy }: { readonly align?: boolean; readonly layout?: PunchLayout;
    readonly policy?: (inputs: readonly number[]) => readonly number[] } = {}): Executor {
  const spec = body.built.spec, ahead = bodyAhead(spec), steering = layout ? steeringOf(body, faces, layout) : null;
  const alignerOf = (hand: Side) => align && faces[hand] ? faceAligner(spec, hand, faces[hand]!, { either: true }) : null;
  const aligners = { left: alignerOf("left"), right: alignerOf("right") };
  const sides = { left: [segmentResource("hand.left"), TRUNK_RESOURCE, LEG_RESOURCE], right: [segmentResource("hand.right"), TRUNK_RESOURCE, LEG_RESOURCE] } as const;
  const sideOf = (effector: string): Side => {
    if (effector === "hand.left") return "left";
    if (effector === "hand.right") return "right";
    throw new Error(`a swing has no effector ${effector}`);
  };
  const state = {
    live: null as null | { request: ActionRequest; hand: Side; phase: "prepare" | "commit" | "release"; stage: "admitting" | "set" | "settle" | "swing" | "return";
      time: number; step: number; quiet: number; lower: number; withdrawn: boolean; ending: ActionEnding;
      /** Where it aims, world; the way it faces; when its hand began to touch something and whether it touched last step. */
      target: [number, number, number]; face: number; touched: number | null; touching: boolean;
      /** Where each foot is placed, world (x, z), m, by its end, from the footing and the target and facing at the admission; null with none. */
      footing: Record<BearingEnd, [number, number]> | null;
      /** The way the stance faces with a footing, rad: the head's to the target at the admission. */
      heading: number;
      /** Each wound channel's angle last step, rad, by name: how fast it still turns toward its windup. */
      last: Record<string, number>;
      /** The face's place last step, whether it has been read, and its velocity over that step, root frame (`faceAligner`). */
      was: [number, number, number]; read: boolean; path: [number, number, number];
      /** Where the target is sensed, world, and how fast it moved over the last step, m/s, each axis within `AIM_SPEED`: what a steer reads. */
      sensed: [number, number, number]; aimed: [number, number, number];
      /** Whether a steered swing has read itself before its swing (its one decision over the windup). */
      opened: boolean },
    /** With a layout, its learner (`Learner`), running through a steered swing alone; null without. */
    learner: layout ? learnerOf(layout.inputs.length, layout.interval, false) : null,
  };
  const halt = () => { if (state.learner) stop(state.learner); };
  const release = (ending: ActionEnding) => {
    const live = state.live!; live.phase = "release"; live.stage = "return"; live.time = 0; live.ending = ending; halt();
  };
  /** The guard with the striking hand's windup over it, the other hand's channels left to the guard. */
  const wound = (hand: Side): Pose => {
    const posture: Record<string, number> = {};
    for (const [channel, angle] of Object.entries(guard)) if (!channel.includes(`.${otherSide(hand)} `)) posture[channel] = angle;
    return Object.assign(posture, settings.wound[hand]);
  };
  const guarded = (hand: Side): Pose => Object.fromEntries(Object.entries(guard).filter(([channel]) => !channel.includes(`.${otherSide(hand)} `)));
  return {
    state,
    needs(_action, effector) { return sides[sideOf(effector)]; },
    readiness(view, action, effector, target, around) {
      if (!actions.includes(action)) return { kind: "blocked", reason: "unknown action" };
      if (effector !== "hand.left" && effector !== "hand.right") return { kind: "blocked", reason: "unsupported effector" };
      if (view.down) return { kind: "blocked", reason: "body is down" };
      const hand = sideOf(effector), face = faces[hand];
      if (!face) return { kind: "blocked", reason: "the hand holds nothing it strikes with" };
      if (state.live) return { kind: "waiting", reason: "a swing is under way or returning" };
      const at = resolve(view, target, action, effector);
      if (!at) return { kind: "blocked", reason: "target has no aim" };
      if (!placedHeightFits(spec, hand, at[1] - view.head.y, face.point)) return { kind: "blocked", reason: "target is outside the arm's height band" };
      return strikeWindow(view, at, around.heading, { standOff: settings.reach, band: settings.band, aside: settings.aside, across: 0, pace: settings.pace,
        poised: settings.poised === true, clear: clearAhead(view, at, around.heading, sensedActionTarget(view, target), ahead), ...(target.kind === "body" ? { on: target.body } : {}) });
    },
    resume() { state.live = null; halt(); },
    interrupt(_view, id) { if (state.live?.request.id === id) { state.live = null; halt(); } },
    start(view, request, around) {
      if (state.live) throw new Error("a swing already owns an instance");
      const hand = sideOf(request.effector), at = resolve(view, request.target, request.action, request.effector);
      if (!at) throw new Error("a swing's target has no aim");
      const face = atan2(at[0] - view.head.x, at[2] - view.head.z), places = settings.footing?.[hand];
      // Behind is against the facing (sin, cos) over the ground; right is (cos, -sin).
      const placed = (foot: Side): [number, number] => {
        const [behind, right] = places![foot], ahead = sin(face), along = cos(face);
        return [at[0] - behind * ahead + right * along, at[2] - behind * along - right * ahead];
      };
      state.live = { request: { ...request }, hand, phase: "prepare", stage: "admitting", time: 0, step: 0, quiet: 0, lower: around.lower, withdrawn: false,
        ending: { kind: "completed" }, target: [at[0], at[1], at[2]], face, touched: null, touching: false,
        footing: places ? { [footOn(spec, "left")]: placed("left"), [footOn(spec, "right")]: placed("right") } : null, heading: face, last: {}, was: [0, 0, 0], read: false, path: [0, 0, 0],
        sensed: [at[0], at[1], at[2]], aimed: [0, 0, 0], opened: false };
      if (settings.steered && state.learner) start(state.learner);
    },
    update(view, continued, around, dt) {
      const live = state.live;
      if (!live) return [];
      if (view.down) { state.live = null; halt(); return [{ id: live.request.id, ending: { kind: "interrupted", reason: "body is down" } }]; }
      const request = continued.find((one) => one.id === live.request.id);
      if (!request) live.withdrawn = true;
      // Its stroke's end is its exit: let go in its return, it hands the arm to the guard at once.
      if (live.phase === "release" && live.withdrawn) { state.live = null; halt(); return [{ id: live.request.id, ending: live.ending }]; }
      const source = request ?? live.request, at = resolve(view, source.target, source.action, source.effector);
      if (live.phase === "prepare" && (live.withdrawn || !at)) release(!at ? { kind: "lost", reason: "target is no longer sensed" } : { kind: "cancelled" });
      if (at && live.phase === "prepare") {
        live.target[0] = at[0]; live.target[1] = at[1]; live.target[2] = at[2];
        live.face = atan2(at[0] - view.head.x, at[2] - view.head.z);
      }
      if (at) for (let i = 0; i < 3; i++) {
        live.aimed[i] = dt > 0 ? Math.max(-AIM_SPEED, Math.min(AIM_SPEED, (at[i]! - live.sensed[i]!) / dt)) : 0;
        live.sensed[i] = at[i]!;
      }
      live.time += dt; live.step = dt;
      const facePoint = faces[live.hand] && view.effectors[`hand.${live.hand}`]?.points[faces[live.hand]!.point];
      if (facePoint && aligners[live.hand]) {
        const { x, y, z } = facePoint;
        if (live.read && dt > 0) { live.path[0] = (x - live.was[0]) / dt; live.path[1] = (y - live.was[1]) / dt; live.path[2] = (z - live.was[2]) / dt; }
        live.was[0] = x; live.was[1] = y; live.was[2] = z; live.read = true;
      }
      if (live.phase === "prepare") {
        // The feet are placed before the stance settles; the legs say so a step after they were asked.
        const set = live.footing === null || live.stage !== "admitting" && (live.stage === "settle" || around.placed === true);
        live.stage = set ? "settle" : "set";
        let reached = true;
        for (const [channel, angle] of Object.entries(settings.wound[live.hand])) {
          const now = view.angles[channel] ?? 0, was = live.last[channel];
          if (Math.abs(now - angle) > WOUND_WITHIN && (was === undefined || Math.abs(now - was) > WOUND_STILL * dt)) reached = false;
          live.last[channel] = now;
        }
        live.quiet = set && quietToStrike(view) && reached ? live.quiet + dt : 0;
        if (live.time >= SWING_PREPARE_LIMIT) release({ kind: "stalled", reason: "settling deadline" });
        else if (live.quiet >= settings.settle) {
          live.phase = "commit"; live.stage = "swing"; live.time = 0; live.touched = null;
          live.touching = (view.effectors[live.request.effector]?.feedback?.impulse ?? 0) > 0;
          if (state.learner?.running) restart(state.learner);
        }
      } else if (live.phase === "commit") {
        const touching = (view.effectors[live.request.effector]?.feedback?.impulse ?? 0) > 0;
        if (touching && !live.touching && live.touched === null) live.touched = view.time;
        live.touching = touching;
        if (live.touched !== null && view.time - live.touched >= settings.follow || live.time >= settings.longest) release({ kind: "completed" });
      } else if (live.time >= settings.recover) {
        const ending = live.ending; state.live = null; halt(); return [{ id: live.request.id, ending }];
      }
      const updates: LifecycleUpdate[] = [{ id: live.request.id, phase: live.phase, stage: live.stage, holds: sides[live.hand], aim: live.target }];
      return updates;
    },
    command(view, id) {
      const live = state.live;
      if (!live || live.request.id !== id) throw new Error(`a swing has no instance ${id}`);
      const pushes: MusclePush[] = [], aligner = aligners[live.hand];
      if (live.phase === "commit") timedPushes(settings.timed[live.hand], live.time, live.step, pushes);
      const posture = live.phase === "release" ? guarded(live.hand) : wound(live.hand);
      if (aligner && live.phase === "commit") {
        const [x, y, z] = live.path;
        for (let k = pushes.length - 1; k >= 0; k--) if (aligner.channels.includes(pushes[k]!.channel)) pushes.splice(k, 1);
        if (x * x + y * y + z * z >= ALIGN_SPEED * ALIGN_SPEED) aligner.ask(view, live.path, posture, pushes);
      }
      const learner = state.learner;
      if (steering && learner?.running && live.phase !== "release") {
        const steer = act(learner, policy);
        if ((live.phase === "commit" || !live.opened) && ask(learner, live.step)) {
          live.opened = true;
          steering.read(view, live.hand, live.time, live.sensed, live.aimed, (view.effectors[live.request.effector]?.feedback?.impulse ?? 0) > 0, learner.inputs);
        }
        if (live.phase === "commit") steerPushes(pushes, steering.channels[live.hand], steer);
      }
      const configuration = handConfiguration(body.built.spec, `hand.${live.hand}`, "grip");
      return { posture, pushes, ...(configuration ? { configurations: { [`hand.${live.hand}`]: configuration } } : {}),
        legs: { walk: null, face: live.face, ...(settings.halts ? { halt: true } : {}), height: supportHeight(view) - live.lower,
          ...(live.phase !== "release" && live.footing ? { footing: live.footing, heading: live.heading } : {}) } };
    },
  };
}

/**
 * **A swing's steer as `layout` lays it out**: each hand's channels (`punchChannels`), and for
 * each hand with a face, what its readings are measured from: the shoulder's centre on the trunk
 * chain, and the arm's straight length from it to the face's point (the elbow straight, the
 * reference pose otherwise). `read` writes what a steered swing reads into `out`.
 */
function steeringOf(body: Body, faces: Partial<Record<Side, StrikingFace>>, layout: PunchLayout) {
  const spec = body.built.spec, effectors = bodyEffectors(body.built), leg = legOf(spec);
  const limbOf = (hand: Side) => {
    const face = faces[hand];
    if (!face) return null;
    const effector = effectors.find((e) => e.segment.spec.name === `hand.${hand}`)!, chain = effector.chain, trunk = effector.free[0]!.joint;
    const point = effector.points.get(face.point);
    if (!point) throw new Error(`${spec.model}'s ${hand} hand has no point ${face.point} to swing with`);
    const angles = chain.map((joint) => joint.dofs.map(() => 0)), shoulder = chain[trunk]!.spec.centre.value, at = new Vector3();
    for (const f of effector.free) if (/^elbow/.test(f.name)) angles[f.joint]![f.k] = f.min;
    pointAtToRef(chain, angles, point, at);
    return { trunkChain: chain.slice(0, trunk), angles: angles.slice(0, trunk), shoulder, point: face.point,
      arm: hypot(at.x - shoulder[0], at.y - shoulder[1], at.z - shoulder[2]) };
  };
  const limbs = { left: limbOf("left"), right: limbOf("right") };
  const channels = { left: punchChannels("left", leg, layout), right: punchChannels("right", leg, layout) };
  const shoulder = new Vector3(), target = new Vector3(), apart = new Vector3(), struck = new Vector3();
  return {
    channels,
    /** What `hand`'s swing `since` s old reads (`punchFeatures`), into `out`: the target `sensed` (world) moving at `aimed`, m/s. */
    read(view: BodyView, hand: Side, since: number, sensed: Vec3, aimed: readonly number[], touching: boolean, out: number[]): void {
      const limb = limbs[hand]!;
      limb.trunkChain.forEach((joint, j) => joint.dofs.forEach((_, k) => { limb.angles[j]![k] = view.angles[channelName(joint, k)] ?? 0; }));
      pointAtToRef(limb.trunkChain, limb.angles, limb.shoulder, shoulder);
      intoFrameToRef(view.root, sensed, target);
      view.effectors[`hand.${hand}`]!.points[limb.point]!.applyRotationQuaternionToRef(view.root.rotation, struck).addInPlace(view.root.position);
      punchFeatures(body, view, hand, channels[hand], since, apart.set(target.x - shoulder.x, target.y - shoulder.y, target.z - shoulder.z), sensed, aimed,
        touching, limb.arm, out, struck);
    },
  };
}
