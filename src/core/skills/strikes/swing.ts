import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyView } from "../../body.ts";
import { heldFrame, rigidPoints } from "../../build/rigid.ts";
import { pointAtToRef, specChainTo } from "../../control/kinematics.ts";
import type { MusclePush } from "../../control/motor.ts";
import { solve3To } from "../../math/flat.ts";
import { atan2 } from "../../math/real.ts";
import { channelName } from "../../muscle/driver.ts";
import type { JointKinematics } from "../../read-body.ts";
import type { Pose } from "../../spec/pose.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import { otherSide, type BodySpec, type Side } from "../../spec/body.ts";
import type { ActionEnding, ActionRequest, Executor, LifecycleUpdate, TargetResolver } from "../framework/action.ts";
import { placedHeightFits } from "./arm-reach.ts";
import type { StrikingFace } from "./straight-punch.ts";
import { clearAhead, quietToStrike, strikeWindow } from "./strike-window.ts";
import { bodyAhead } from "../../navigation/held-clearance.ts";
import { sensedActionTarget } from "../../intent/action-aim.ts";
import { timedPushes, validPush, type TimedPush } from "./timed-push.ts";

/**
 * **A swing's settings.** It is admitted with the body moving no faster than `pace` m/s, facing
 * the target, its head `reach` m from it across the ground (`band` m further at most, `CROWDED`
 * nearer), no more than `aside` m to either side of the line it faces, the target within the arm's
 * height band for its face (`placedHeightFits`), and with `poised` its stance already quiet. From
 * the admission the striking hand's trunk and arm channels `wound` names stand at its angles, rad
 * (the windup); once the stance is quiet and has stood wound `settle` s, each such channel at its
 * angle or still (`WOUND_WITHIN`), `timed` pushes each channel it names flat out over its own window
 * of the swing (`TimedPush`), the rest held wound.
 * The swing ends `follow` s after the hand begins to touch something, or `longest` s after it
 * began; the arm comes back to the guard over `recover` s. With `halts`, it stops a walk at once.
 */
export interface Swing {
  readonly pace: number;
  readonly reach: number;
  readonly band: number;
  readonly aside: number;
  readonly poised?: boolean;
  readonly halts?: boolean;
  readonly settle: number;
  readonly wound: { readonly left: Readonly<Record<string, number>>; readonly right: Readonly<Record<string, number>> };
  readonly timed: { readonly left: readonly TimedPush[]; readonly right: readonly TimedPush[] };
  readonly follow: number;
  readonly longest: number;
  readonly recover: number;
}

const HANDS: readonly Side[] = Object.freeze(["left", "right"]);

/** The settings every swing names; the rest are its options. */
const REQUIRED = ["pace", "reach", "band", "aside", "settle", "follow", "longest", "recover"] as const;

/** Every setting a swing may name (`Swing`). */
export const SWING_KEYS: readonly (keyof Swing)[] = Object.freeze([...REQUIRED, "poised", "halts", "wound", "timed"]);

/** Whether `settings`, some of a swing's, are each valid: its numbers finite and not negative, its pace, reach, band, aside and length positive, its windup's angles finite and its pushes valid. */
export function validSwingPart(settings: Partial<Swing>): boolean {
  const flag = (value: unknown) => value === undefined || typeof value === "boolean";
  return REQUIRED.every((key) => settings[key] === undefined || Number.isFinite(settings[key]) && settings[key] >= 0)
    && (["pace", "reach", "band", "aside", "longest"] as const).every((key) => settings[key] === undefined || settings[key] > 0)
    && flag(settings.poised) && flag(settings.halts)
    && (settings.wound === undefined || HANDS.every((hand) => typeof settings.wound![hand] === "object" && settings.wound![hand] !== null
      && Object.values(settings.wound![hand]).every(Number.isFinite)))
    && (settings.timed === undefined || HANDS.every((hand) => Array.isArray(settings.timed![hand]) && settings.timed![hand].every(validPush)));
}

/** Whether `settings` are a swing's: each it names valid (`validSwingPart`), and every one it must name named, its windup and its pushes too. */
export function validSwing(settings: Partial<Swing>): settings is Swing {
  return REQUIRED.every((key) => settings[key] !== undefined) && settings.wound !== undefined && settings.timed !== undefined && validSwingPart(settings);
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

/** The least speed of the face through which its path is read and its facing turned into it (`edgeAligner`), m/s. */
const ALIGN_SPEED = 1;

/** How far along its facing the second point that reads the face's facing stands from the face, m. */
const ALIGN_LEVER = 0.1;

/** How far each wrist freedom is turned to read what it does to the face's facing, rad. */
const ALIGN_PROBE = 0.01;

/** The damping of the wrist's least-squares turn, rad^2: how little a freedom that barely moves the facing is asked. */
const ALIGN_DAMPING = 0.01;

/** The most a step asks a wrist freedom ahead of where it stands, rad. */
const ALIGN_MOST = 0.5;

/**
 * **The wrist that turns `hand`'s face into its path** through a stroke: each step its face moves
 * faster than `ALIGN_SPEED`, the wrist's freedoms are asked the turn that brings the face's facing
 * (`StrikingFace.facing`, as `hand` holds its item) onto the way the face moves, by a damped
 * least-squares step on the cross product of the two (`ALIGN_DAMPING`), each freedom's effect read
 * by turning it `ALIGN_PROBE` on the arm's chain as the body's angles stand. Facing against the
 * path counts as met: a two-edged blade leads with either edge. Null where `hand` holds no item or
 * has no wrist.
 */
function edgeAligner(spec: BodySpec, hand: Side, face: StrikingFace) {
  const held = spec.held?.find((one) => one.segment === `hand.${hand}`), segment = spec.segments.find((one) => one.name === `hand.${hand}`);
  if (!held || !segment) return null;
  const chain: JointKinematics[] = specChainTo(spec, `hand.${hand}`), wrist = chain.findIndex((joint) => joint.spec.name === `wrist.${hand}`);
  const at = rigidPoints(spec, segment).get(face.point)?.value;
  if (wrist < 0 || !at) return null;
  const frame = heldFrame(held), f = face.facing;
  const way = [0, 1, 2].map((k) => frame.x[k]! * f[0] + frame.y[k]! * f[1] + frame.z[k]! * f[2]);
  const length = Math.sqrt(way[0]! * way[0]! + way[1]! * way[1]! + way[2]! * way[2]!);
  const ahead = [0, 1, 2].map((k) => at[k]! + way[k]! / length * ALIGN_LEVER) as unknown as Vec3;
  const channels = chain.map((joint) => joint.dofs.map((_, k) => channelName(joint, k))), freedoms = chain[wrist]!.dofs.length;
  const angles = chain.map((joint) => joint.dofs.map(() => 0));
  const p = new Vector3(), q = new Vector3(), facing = new Float64Array(3), base = new Float64Array(3), J = new Float64Array(9);
  const A = new Float64Array(9), b = new Float64Array(3), x = new Float64Array(3);
  /** The face's facing, unit, root frame, with the chain at `angles`, onto `facing`. */
  const facingNow = () => {
    pointAtToRef(chain, angles, at, p); pointAtToRef(chain, angles, ahead, q);
    const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, n = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    facing[0] = dx / n; facing[1] = dy / n; facing[2] = dz / n;
  };
  /** The cross product of the facing and the unit path, onto `out`. */
  const across = (out: Float64Array) => {
    out[0] = facing[1]! * path[2]! - facing[2]! * path[1]!; out[1] = facing[2]! * path[0]! - facing[0]! * path[2]!; out[2] = facing[0]! * path[1]! - facing[1]! * path[0]!;
  };
  const r = new Float64Array(3), path = new Float64Array(3);
  return {
    /** The wrist's channels: the ones it asks. */
    channels: channels[wrist]!.slice(0, 3),
    /**
     * Each wrist channel's angle that turns the face into the path `v` (root frame, m/s), onto
     * `posture`; false where the face moves slower than `ALIGN_SPEED`, and nothing is asked.
     */
    ask(view: BodyView, v: readonly [number, number, number], posture: Record<string, number>): boolean {
      const speed = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
      if (speed < ALIGN_SPEED) return false;
      path[0] = v[0] / speed; path[1] = v[1] / speed; path[2] = v[2] / speed;
      for (let j = 0; j < chain.length; j++) for (let k = 0; k < angles[j]!.length; k++) angles[j]![k] = view.angles[channels[j]![k]!] ?? 0;
      facingNow(); across(base);
      J.fill(0);
      for (let k = 0; k < Math.min(freedoms, 3); k++) {
        const was = angles[wrist]![k]!;
        angles[wrist]![k] = was + ALIGN_PROBE; facingNow(); across(r); angles[wrist]![k] = was;
        for (let row = 0; row < 3; row++) J[row * 3 + k] = (r[row]! - base[row]!) / ALIGN_PROBE;
      }
      // (J'J + damping) x = -J' r: the least turn that takes the cross product to nothing.
      for (let i = 0; i < 3; i++) {
        for (let k = 0; k < 3; k++) A[i * 3 + k] = J[i]! * J[k]! + J[3 + i]! * J[3 + k]! + J[6 + i]! * J[6 + k]! + (i === k ? ALIGN_DAMPING : 0);
        b[i] = -(J[i]! * base[0]! + J[3 + i]! * base[1]! + J[6 + i]! * base[2]!);
      }
      solve3To(A, b, x);
      for (let k = 0; k < Math.min(freedoms, 3); k++) {
        const turn = Math.max(-ALIGN_MOST, Math.min(ALIGN_MOST, x[k]!));
        posture[channels[wrist]![k]!] = angles[wrist]![k]! + turn;
      }
      return true;
    },
  };
}

/**
 * **A swing**: a held item's blow thrown on an arc that meets the target with the item's face
 * first (`StrikingFace`: the sword's edge, the club's head). Admitted where its window says
 * (`strikeWindow`), it winds the trunk and the striking arm up to its record's angles and, each
 * there or still (`WOUND_WITHIN`), stands quiet there `settle` s; then its schedule pushes each
 * channel it names flat out over its window (`timedPushes`), the arc's speed coming from the windup's range, the face meeting the target
 * where the arc passes it. After the swing it brings the arm back to the guard. An attack given up
 * before the swing is dropped; a swing begun is thrown to its end. It has the hand, the trunk and
 * the legs from its windup to its return, and the hand grips throughout. With `align`, through the
 * swing the wrist turns the face into its path (`edgeAligner`), its scheduled pushes dropped.
 */
export function swingExecutor(body: Body, guard: Pose, actions: readonly string[], settings: Swing, resolve: TargetResolver,
  faces: Partial<Record<Side, StrikingFace>>, { align = false }: { readonly align?: boolean } = {}): Executor {
  const spec = body.built.spec, ahead = bodyAhead(spec);
  const aligners = { left: align && faces.left ? edgeAligner(spec, "left", faces.left) : null, right: align && faces.right ? edgeAligner(spec, "right", faces.right) : null };
  const sides = { left: ["hand.left", "trunk", "legs"], right: ["hand.right", "trunk", "legs"] } as const;
  const sideOf = (effector: string): Side => {
    if (effector === "hand.left") return "left";
    if (effector === "hand.right") return "right";
    throw new Error(`a swing has no effector ${effector}`);
  };
  const state = {
    live: null as null | { request: ActionRequest; hand: Side; phase: "prepare" | "commit" | "release"; stage: "admitting" | "settle" | "swing" | "return";
      time: number; step: number; quiet: number; lower: number; withdrawn: boolean; ending: ActionEnding;
      /** Where it aims, world; the way it faces; when its hand began to touch something and whether it touched last step. */
      target: [number, number, number]; face: number; touched: number | null; touching: boolean;
      /** Each wound channel's angle last step, rad, by name: how fast it still turns toward its windup. */
      last: Record<string, number>;
      /** The face's place last step, whether it has been read, and its velocity over that step, root frame (`edgeAligner`). */
      was: [number, number, number]; read: boolean; path: [number, number, number] },
  };
  const release = (ending: ActionEnding) => {
    const live = state.live!; live.phase = "release"; live.stage = "return"; live.time = 0; live.ending = ending;
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
    resume() { state.live = null; },
    interrupt(_view, id) { if (state.live?.request.id === id) state.live = null; },
    start(view, request, around) {
      if (state.live) throw new Error("a swing already owns an instance");
      const hand = sideOf(request.effector), at = resolve(view, request.target, request.action, request.effector);
      if (!at) throw new Error("a swing's target has no aim");
      state.live = { request: { ...request }, hand, phase: "prepare", stage: "admitting", time: 0, step: 0, quiet: 0, lower: around.lower, withdrawn: false,
        ending: { kind: "completed" }, target: [at[0], at[1], at[2]], face: atan2(at[0] - view.head.x, at[2] - view.head.z), touched: null, touching: false, last: {}, was: [0, 0, 0], read: false, path: [0, 0, 0] };
    },
    update(view, continued, _around, dt) {
      const live = state.live;
      if (!live) return [];
      if (view.down) { state.live = null; return [{ id: live.request.id, ending: { kind: "interrupted", reason: "body is down" } }]; }
      const request = continued.find((one) => one.id === live.request.id);
      if (!request) live.withdrawn = true;
      // Its stroke's end is its exit: let go in its return, it hands the arm to the guard at once.
      if (live.phase === "release" && live.withdrawn) { state.live = null; return [{ id: live.request.id, ending: live.ending }]; }
      const source = request ?? live.request, at = resolve(view, source.target, source.action, source.effector);
      if (live.phase === "prepare" && (live.withdrawn || !at)) release(!at ? { kind: "lost", reason: "target is no longer sensed" } : { kind: "cancelled" });
      if (at && live.phase === "prepare") {
        live.target[0] = at[0]; live.target[1] = at[1]; live.target[2] = at[2];
        live.face = atan2(at[0] - view.head.x, at[2] - view.head.z);
      }
      live.time += dt; live.step = dt;
      const facePoint = faces[live.hand] && view.effectors[`hand.${live.hand}`]?.points[faces[live.hand]!.point];
      if (facePoint && aligners[live.hand]) {
        const { x, y, z } = facePoint;
        if (live.read && dt > 0) { live.path[0] = (x - live.was[0]) / dt; live.path[1] = (y - live.was[1]) / dt; live.path[2] = (z - live.was[2]) / dt; }
        live.was[0] = x; live.was[1] = y; live.was[2] = z; live.read = true;
      }
      if (live.phase === "prepare") {
        live.stage = "settle";
        let reached = true;
        for (const [channel, angle] of Object.entries(settings.wound[live.hand])) {
          const now = view.angles[channel] ?? 0, was = live.last[channel];
          if (Math.abs(now - angle) > WOUND_WITHIN && (was === undefined || Math.abs(now - was) > WOUND_STILL * dt)) reached = false;
          live.last[channel] = now;
        }
        live.quiet = quietToStrike(view) && reached ? live.quiet + dt : 0;
        if (live.time >= SWING_PREPARE_LIMIT) release({ kind: "stalled", reason: "settling deadline" });
        else if (live.quiet >= settings.settle) {
          live.phase = "commit"; live.stage = "swing"; live.time = 0; live.touched = null;
          live.touching = (view.effectors[live.request.effector]?.feedback?.impulse ?? 0) > 0;
        }
      } else if (live.phase === "commit") {
        const touching = (view.effectors[live.request.effector]?.feedback?.impulse ?? 0) > 0;
        if (touching && !live.touching && live.touched === null) live.touched = view.time;
        live.touching = touching;
        if (live.touched !== null && view.time - live.touched >= settings.follow || live.time >= settings.longest) release({ kind: "completed" });
      } else if (live.time >= settings.recover) {
        const ending = live.ending; state.live = null; return [{ id: live.request.id, ending }];
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
        aligner.ask(view, live.path, posture);
        for (let k = pushes.length - 1; k >= 0; k--) if (aligner.channels.includes(pushes[k]!.channel)) pushes.splice(k, 1);
      }
      return { posture, pushes, handPoses: { [`hand.${live.hand}`]: "grip" },
        legs: { walk: null, face: live.face, ...(settings.halts ? { halt: true } : {}), height: view.standing - live.lower } };
    },
  };
}
