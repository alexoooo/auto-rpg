import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyView } from "../body.ts";
import { intoFrameToRef } from "../control/kinematics.ts";
import type { EffectorGoal } from "../control/motor.ts";
import { footStatesOf, readSupport, withinSupport } from "../control/support.ts";
import { STANCE_GAIT } from "../control/stance-tuning.ts";
import { supportReadiness, plantedSupport } from "../control/support-readiness.ts";
import { hypot, sin, cos } from "../math/real.ts";
import { turnAboutToRef } from "../math/turn.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { STRIKE_EVENT } from "./strike-cycle.ts";
import { effectorStrike, type StrikeCourse } from "./effector-strike.ts";
import type { Side } from "../spec/body.ts";
import type { ActionEnding, ActionRequest, Executor, LifecycleUpdate, TargetResolver } from "./action.ts";
import { footEnd, type LegsGoal } from "./skill.ts";
import { withinActionWindow } from "../mind/action-window.ts";
/** Engineering experiment inputs and physical qualification: `docs/reference/front-kicks.md#execution-settings`. */
export const KICK_PATH = Object.freeze({ setupLimit: 8, lower: .05, lean: 0, transferLimit: 6, transferSeconds: .2, transferSlow: .12,
  lift: .45, windup: .15, chamberSeconds: .6, swingSeconds: .4, returnSeconds: .6, contactSpeed: 2, soleTurn: .2,
  prepareLimit: 4, returnLimit: 2, near: .04, returnNear: .04, hover: .08, slow: .3, hold: .05, followSeconds: .04,
  impactSeconds: .04, impactTravel: .04, normalAlignment: .5,
  response: .1, placeSeconds: 1, placeLimit: 6, placement: .02, placementSpeed: .1, rotationError: .001,
  recenterLimit: 4, startup: 2, cooldown: 1, over: 0, top: 1, alongNear: .25, alongFar: .65, across: .16, facing: .4, admitSpeed: .5 });
export type KickTuning = {
  readonly [K in keyof typeof KICK_PATH]: number;
};
export function validKickTuning(tuning: KickTuning): boolean {
  return Object.values(tuning).every(v => Number.isFinite(v) && v >= 0)
    && [tuning.setupLimit, tuning.transferLimit, tuning.transferSeconds, tuning.chamberSeconds, tuning.swingSeconds, tuning.returnSeconds, tuning.prepareLimit,
      tuning.returnLimit, tuning.hold, tuning.response, tuning.placeSeconds, tuning.placeLimit, tuning.recenterLimit].every(v => v > 0)
    && tuning.contactSpeed > 0 && tuning.normalAlignment <= 1 && tuning.rotationError <= 1 && tuning.soleTurn <= 1
    && tuning.over <= 1 && tuning.top > 0 && tuning.top <= 1 && tuning.alongFar > tuning.alongNear && tuning.across > 0 && tuning.facing > 0;
}
type Rotation = readonly [number, number, number, number];
/** One named kick executor shares its support transfer and cooldown between its actions. */
export function kickExecutor(body: Body, actions: readonly string[], tuning: KickTuning,
  resolve: TargetResolver): Executor {
  if (!validKickTuning(tuning)) throw new Error("invalid kick executor settings");
  const feet = footStatesOf(body.built), support = supportReadiness(body.built), middle = new Vector3();
  const local = new Vector3(), world = new Vector3(), turn = new Quaternion(), inverse = new Quaternion(), rotation = new Quaternion(), axis = new Vector3();
  const limits = Object.freeze({ ...tuning, impact: tuning });
  const strikeOf = (side: Side) => effectorStrike({ effector: `foot.${side}`, point: "strike", limits,
    chamberSeconds: tuning.chamberSeconds, returnSeconds: tuning.returnSeconds, response: tuning.response });
  const strikes = { left: strikeOf("left"), right: strikeOf("right") };
  const footprints = { left: Object.freeze(["foot.left", "legs", "trunk"]), right: Object.freeze(["foot.right", "legs", "trunk"]) };
  const sideOf = (name: string): Side => {
    if (name === "foot.left") return "left";
    if (name === "foot.right") return "right";
    throw new Error(`kick executor has no effector ${name}`);
  };
  const coordinates = (point: Vector3): Vec3 => [point.x, point.y, point.z];
  const worldPoint = (view: BodyView, point: Vector3): Vec3 => coordinates(point.applyRotationQuaternionToRef(view.root.rotation, world).addInPlace(view.root.position));
  /**
   * Where `foot` stands now and its stroke's chamber: `lift` over the point `over` of the way from
   * its strike point to `target` across the ground (0 over the foot, a front kick's; 1 over the
   * target, a stomp's), `windup` back along `heading`. The stroke starts from the chamber and
   * returns to it.
   */
  const capture = (view: BodyView, foot: Side, heading: number, target: Vec3) => {
    const effector = view.effectors[`foot.${foot}`]!, sole = worldPoint(view, effector.points.sole!), strike = worldPoint(view, effector.points.strike!);
    view.root.rotation.multiplyToRef(effector.rotation, turn).normalize();
    const x = strike[0] + tuning.over * (target[0] - strike[0]), z = strike[2] + tuning.over * (target[2] - strike[2]);
    return { sole, rotation: [turn.x, turn.y, turn.z, turn.w] as Rotation,
      chamber: [x + tuning.windup * sin(heading), strike[1] + tuning.lift, z + tuning.windup * cos(heading)] as Vec3 };
  };
  type Motion = { request: ActionRequest; foot: Side; stage: "admitting" | "setup" | "transfer" | "unload" | "strike" | "place" | "recenter";
    phase: "prepare" | "commit" | "release"; time: number; held: number; heading: number; height: number; target: Vec3;
    initial: ReturnType<typeof capture>; back: Vec3 | null; withdrawn: boolean; ending: ActionEnding; bearing: Vec3;
    bearingRotation: Rotation; setting: Side | null; footing: Record<Side, readonly [number, number]> };
  const state = { live: null as Motion | null, cooldown: tuning.cooldown, support: support.state,
    cycles: { left: strikes.left.state, right: strikes.right.state } };
  const hipWidth = Math.abs(body.built.spec.joints.find(j => j.name === "hip.right")!.centre.value[0] - body.built.spec.joints.find(j => j.name === "hip.left")!.centre.value[0]);
  const stage = (next: Motion["stage"]) => {
    const live = state.live!; live.stage = next; live.time = 0; live.held = 0; strikes[live.foot].renew();
  };
  const release = (ending: ActionEnding, next: "place" | "recenter") => {
    const live = state.live!; live.ending = ending; live.phase = "release"; stage(next);
  };
  const finish = (ending: ActionEnding): LifecycleUpdate => {
    const live = state.live!, id = live.request.id;
    strikes[live.foot].reset(); state.live = null; state.cooldown = 0;
    return { id, ending };
  };
  const courseOf = (view: BodyView, live: Motion): StrikeCourse => {
    const chamber = coordinates(intoFrameToRef(view.root, live.initial.chamber, local));
    const target = coordinates(intoFrameToRef(view.root, live.target, local));
    const dx = target[0] - chamber[0], dy = target[1] - chamber[1], dz = target[2] - chamber[2], length = hypot(dx, dy, dz);
    // The stroke returns to its chamber carried with the body as the blow moved it (`back`): clear of
    // what it struck and within reach, and placed from there.
    const p = view.root.position, home = live.back ? coordinates(intoFrameToRef(view.root, [p.x + live.back[0], p.y + live.back[1], p.z + live.back[2]], local)) : chamber;
    return { home, chamber, target, seconds: tuning.swingSeconds,
      contactVelocity: length ? [dx * tuning.contactSpeed / length, dy * tuning.contactSpeed / length, dz * tuning.contactSpeed / length] : [0, 0, 0] };
  };
  const place = (view: BodyView, live: Motion, at: Vec3): EffectorGoal => {
    intoFrameToRef(view.root, at, local);
    Quaternion.InverseToRef(view.root.rotation, inverse).multiplyToRef(rotation.copyFromFloats(...live.initial.rotation), turn).normalize();
    return { response: tuning.response, places: [{ point: "sole", position: [local.x, local.y, local.z] }],
      seconds: tuning.placeSeconds, follows: true, sequence: strikes[live.foot].state.sequence,
      orientation: { target: [turn.x, turn.y, turn.z, turn.w], seconds: tuning.placeSeconds } };
  };
  return {
    state,
    needs(_action, effector) { return footprints[sideOf(effector)]; },
    readiness(view, action, effector, target, around) {
      if (!actions.includes(action)) return { kind: "blocked", reason: "unknown action" };
      if (effector !== "foot.left" && effector !== "foot.right") return { kind: "blocked", reason: "unsupported effector" };
      if (view.down) return { kind: "blocked", reason: "body is down" };
      if (state.live || view.time - view.born < tuning.startup || state.cooldown < tuning.cooldown) return { kind: "waiting", reason: "kick startup, cooldown or return" };
      const at = resolve(view, target, action, effector);
      if (!at) return { kind: "blocked", reason: "target has no aim" };
      const foot = sideOf(effector), hip = body.built.spec.joints.find(j => j.name === `hip.${foot}`)!.centre.value;
      const sole = body.built.spec.segments.find(segment => segment.name === `foot.${foot}`)!.distal.value;
      const reach = hypot(hip[0] - sole[0], hip[1] - sole[1], hip[2] - sole[2]);
      const soleAt = view.stance.soles[foot];
      if (at[1] < soleAt.y - tuning.near || at[1] > soleAt.y + tuning.top * reach) return { kind: "blocked", reason: "target is outside the leg's height band" };
      const dx = soleAt.x - view.stance.centre.x, dz = soleAt.z - view.stance.centre.z;
      const ahead = dx * sin(around.heading) + dz * cos(around.heading), across = dx * cos(around.heading) - dz * sin(around.heading);
      // The low-kick entry uses the tracking selection's reach; admission can brake an ordinary walk.
      const window = { at, along: [ahead + tuning.alongNear, ahead + tuning.alongFar] as const, across: [across - tuning.across, across + tuning.across] as const,
        facing: tuning.facing, speed: tuning.admitSpeed, ...(target.kind === "body" ? { on: target.body } : {}) };
      if (!withinActionWindow(view, window, around.heading)) return { kind: "position", window };
      return { kind: "ready" };
    },
    resume() { state.live = null; strikes.left.reset(); strikes.right.reset(); support.state.quiet = 0; state.cooldown = 0; },
    start(view, request, around) {
      if (state.live) throw new Error("kick executor already owns an instance");
      const foot = sideOf(request.effector), other = foot === "left" ? "right" : "left";
      const target = resolve(view, request.target, request.action, request.effector);
      if (!target) throw new Error("kick target has no aim");
      const initial = capture(view, foot, around.heading, target), bearing = capture(view, other, around.heading, target);
      const x = (view.stance.soles.left.x + view.stance.soles.right.x) / 2, z = (view.stance.soles.left.z + view.stance.soles.right.z) / 2;
      state.live = { request: { ...request }, foot, stage: "admitting", phase: "prepare", time: 0, held: 0, heading: around.heading,
        height: view.standing - around.lower - tuning.lower, target: [...target], initial, back: null, withdrawn: false, ending: { kind: "completed" },
        bearing: bearing.sole, bearingRotation: bearing.rotation, setting: null,
        footing: { left: [x - hipWidth * cos(around.heading) / 2, z + hipWidth * sin(around.heading) / 2],
          right: [x + hipWidth * cos(around.heading) / 2, z - hipWidth * sin(around.heading) / 2] } };
    },
    update(view, continued, _around, dt) {
      support.read(view.stance.centre, view.stance.velocity, dt); readSupport(feet, feet, middle); state.cooldown += dt;
      const live = state.live;
      if (!live) return [];
      if (view.down) return [finish({ kind: "interrupted", reason: "body is down" })];
      const foot = live.foot, other = foot === "left" ? "right" : "left", strike = strikes[foot], velocity = strike.read(view, dt);
      const request = continued.find(one => one.id === live.request.id);
      if (!request) live.withdrawn = true;
      const source = request ?? live.request;
      const at = resolve(view, source.target, source.action, source.effector);
      if (live.phase === "prepare" && (live.withdrawn || !at)) {
        release(!at ? { kind: "lost", reason: "target is no longer sensed" } : { kind: "cancelled" },
          live.stage === "admitting" || live.stage === "setup" || live.stage === "transfer" ? "recenter" : "place");
      }
      if (at && !live.withdrawn && live.phase !== "release") live.target = [...at];
      live.time += dt;
      const bearing = feet.find(one => one.side === other)!, centre = view.stance.centre, inside = withinSupport([bearing], centre.x, centre.z);
      const bearingReady = support.state.loads[other] > 0 && !support.state.otherSupport && inside[0] === centre.x && inside[1] === centre.z;
      switch (live.stage) {
        case "admitting": stage("setup"); break;
        case "setup": {
          if (live.time >= tuning.setupLimit) { release({ kind: "stalled", reason: "support setup deadline" }, "recenter"); break; }
          const far = (side: Side) => hypot(view.stance.soles[side].x - live.footing[side][0], view.stance.soles[side].z - live.footing[side][1]);
          if (live.setting && view.stance.phase === "stand" && far(live.setting) <= tuning.near) live.setting = null;
          if (!live.setting) live.setting = far("left") > tuning.near ? "left" : far("right") > tuning.near ? "right" : null;
          live.held = !live.setting && plantedSupport(support.state) && view.stance.phase === "stand" && support.state.speed <= tuning.transferSlow ? live.held + dt : 0;
          if (live.held >= tuning.hold) {
            live.initial = capture(view, foot, live.heading, live.target);
            const captured = capture(view, other, live.heading, live.target); live.bearing = captured.sole; live.bearingRotation = captured.rotation;
            stage("transfer");
          }
          break;
        }
        case "transfer":
          live.held = bearingReady && support.state.speed <= tuning.transferSlow ? live.held + dt : 0;
          if (live.time >= tuning.transferLimit) release({ kind: "stalled", reason: "support transfer deadline" }, "recenter");
          else if (live.held >= tuning.hold) stage("unload");
          break;
        case "unload":
          live.held = support.state.loads[foot] === 0 && bearingReady ? live.held + dt : 0;
          if (live.time >= tuning.transferLimit) release({ kind: "stalled", reason: "foot unload deadline" }, "place");
          else if (live.held >= tuning.hold) { stage("strike"); strike.begin("chamber", velocity); }
          break;
        case "strike": {
          const course = courseOf(view, live);
          const event = strike.step(view, velocity, course, { requested: true, down: false, supported: bearingReady,
            prepared: support.state.loads[foot] === 0, free: support.state.loads[foot] === 0, targetId: live.request.target.body }, dt);
          if (event & STRIKE_EVENT.failed) live.ending = { kind: "stalled", reason: strike.state.phase === "return" ? "chamber deadline" : "withdrawal deadline" };
          if (event & STRIKE_EVENT.aborted) live.ending = { kind: "interrupted", reason: "stroke lost support or met blocking contact" };
          if (strike.state.phase === "swing" && !live.back) {
            const p = view.root.position, chamber = live.initial.chamber;
            live.back = [chamber[0] - p.x, chamber[1] - p.y, chamber[2] - p.z];
          }
          if (event & STRIKE_EVENT.finished) { live.phase = "release"; stage("place"); }
          else live.phase = strike.state.phase === "chamber" ? "prepare" : strike.state.phase === "swing" ? "commit" : "release";
          break;
        }
        case "place": {
          const sole = worldPoint(view, view.effectors[live.request.effector]!.points.sole!);
          const error = hypot(sole[0] - live.initial.sole[0], sole[1] - live.initial.sole[1], sole[2] - live.initial.sole[2]);
          view.root.rotation.multiplyToRef(view.effectors[live.request.effector]!.rotation, turn).normalize();
          const alignment = 1 - Math.abs(turn.x * live.initial.rotation[0] + turn.y * live.initial.rotation[1] + turn.z * live.initial.rotation[2] + turn.w * live.initial.rotation[3]);
          live.held = error <= tuning.placement && alignment <= tuning.rotationError && support.state.loads[foot] > 0 && hypot(...velocity) <= tuning.placementSpeed ? live.held + dt : 0;
          if (live.held >= tuning.hold) stage("recenter");
          else if (live.time >= tuning.placeLimit) return [finish({ kind: "stalled", reason: `placement deadline after ${live.ending.reason ?? live.ending.kind}` })];
          break;
        }
        case "recenter":
          live.held = plantedSupport(support.state) && support.state.speed <= tuning.transferSlow
            && hypot(centre.x - middle.x, centre.z - middle.z) <= tuning.placement ? live.held + dt : 0;
          if (live.held >= tuning.hold) return [finish(live.ending)];
          if (live.time >= tuning.recenterLimit) return [finish({ kind: "stalled", reason: `recenter deadline after ${live.ending.reason ?? live.ending.kind}` })];
          break;
        default: { const never: never = live.stage; throw new Error(`unknown kick stage ${never}`); }
      }
      return [{ id: live.request.id, phase: live.phase, stage: live.stage === "strike" ? strike.state.phase ?? "return" : live.stage, holds: footprints[live.foot] }];
    },
    command(view, id) {
      const live = state.live;
      if (!live || live.request.id !== id) throw new Error(`kick executor has no instance ${id}`);
      const foot = live.foot, other = foot === "left" ? "right" : "left", strike = strikes[foot];
      const centred = live.stage === "admitting" || live.stage === "setup" || live.stage === "recenter";
      const both = centred || live.stage === "transfer";
      const standing: LegsGoal = { walk: null, feet: both ? [footEnd("left"), footEnd("right")] : [footEnd(other)], centre: centred ? null : [live.bearing[0], live.bearing[2]],
        height: live.height + (centred || live.stage === "place" || strike.state.phase === "return" ? tuning.lower : 0), heading: live.heading,
        ...(live.stage === "setup" && live.setting ? {} : { pose: { pitch: centred || live.stage === "place" ? 0 : tuning.lean, seconds: tuning.transferSeconds,
          ...(both ? {} : { anchors: { [footEnd(other)]: { position: live.bearing, rotation: live.bearingRotation } } }) },
        }),
        ...(live.stage === "setup" && live.setting ? { swing: { foot: footEnd(live.setting), to: live.footing[live.setting], seconds: STANCE_GAIT.seconds, lift: STANCE_GAIT.lift } } : {}) };
      let goal: EffectorGoal | null = null;
      // Held `hover` over where it stood: clear of the ground at the toes with the foot pitched as the trunk leans on one leg.
      if (live.stage === "unload") goal = place(view, live, [live.initial.sole[0], live.initial.sole[1] + tuning.hover, live.initial.sole[2]]);
      else if (live.stage === "strike") {
        if (strike.state.phase === "swing") turnAboutToRef(axis.set(1, 0, 0), -tuning.soleTurn * Math.PI / 2, turn);
        else Quaternion.InverseToRef(view.root.rotation, inverse).multiplyToRef(rotation.copyFromFloats(...live.initial.rotation), turn).normalize();
        goal = strike.goal(courseOf(view, live), (strike.state.phase === "swing" && tuning.soleTurn > 0) || strike.state.phase === "return"
          ? { target: [turn.x, turn.y, turn.z, turn.w], seconds: tuning.swingSeconds } : undefined);
      } else if (live.stage === "place") {
        const sole = worldPoint(view, view.effectors[live.request.effector]!.points.sole!);
        const over = hypot(sole[0] - live.initial.sole[0], sole[2] - live.initial.sole[2]) <= tuning.placement;
        goal = place(view, live, over ? live.initial.sole : [live.initial.sole[0], live.initial.sole[1] + tuning.hover, live.initial.sole[2]]);
      }
      return { legs: standing, ...(goal ? { effectors: { [live.request.effector]: goal } } : {}) };
    },
  };
}
