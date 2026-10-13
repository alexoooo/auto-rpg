import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyCommand, BodyView } from "../body.ts";
import { intoFrameToRef } from "../control/kinematics.ts";
import type { EffectorGoal } from "../control/motor.ts";
import type { StanceGoal } from "../control/stance.ts";
import { footStatesOf, readSupport, withinSupport } from "../control/support.ts";
import { STANCE_GAIT } from "../control/stance-tuning.ts";
import { supportReadiness, plantedSupport, STRIKE_SUPPORT } from "../control/support-readiness.ts";
import { hypot, sin, cos } from "../math/real.ts";
import { turnAboutToRef } from "../math/turn.ts";
import type { KickAttack } from "../mind/intent.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { Skill } from "./skill.ts";
import { STRIKE_EVENT, type StrikeCycleState } from "./strike-cycle.ts";
import { effectorStrike, type StrikeCourse } from "./effector-strike.ts";
import type { Side } from "../spec/body.ts";
import type { ActionEnding, ActionRequest, Executor, LifecycleUpdate, TargetRef } from "./action.ts";
import { withinActionWindow } from "../mind/action-window.ts";
/** Engineering experiment inputs and physical qualification: `docs/reference/front-kicks.md#execution-settings`. */
export const KICK_PATH = Object.freeze({ setupLimit: 8, lower: .05, lean: 0, transferLimit: 6, transferSeconds: .2, transferSlow: .12,
  lift: .45, windup: .15, chamberSeconds: .6, swingSeconds: .4, returnSeconds: .6, contactSpeed: 2, soleTurn: .2,
  prepareLimit: 4, returnLimit: 2, near: .04, slow: .3, hold: .05, followSeconds: .04,
  impactSeconds: .04, impactTravel: .04, normalAlignment: .5,
  response: .1, placeSeconds: 1, placeLimit: 6, placement: .02, placementSpeed: .1, rotationError: .001,
  recenterLimit: 4, startup: 2, cooldown: 1 });
export type KickTuning = {
  readonly [K in keyof typeof KICK_PATH]: number;
};
export function validKickTuning(tuning: KickTuning): boolean {
  return Object.values(tuning).every(v => Number.isFinite(v) && v >= 0)
    && [tuning.setupLimit, tuning.transferLimit, tuning.transferSeconds, tuning.chamberSeconds, tuning.swingSeconds, tuning.returnSeconds, tuning.prepareLimit,
      tuning.returnLimit, tuning.hold, tuning.response, tuning.placeSeconds, tuning.placeLimit, tuning.recenterLimit].every(v => v > 0)
    && tuning.contactSpeed > 0 && tuning.normalAlignment <= 1 && tuning.rotationError <= 1 && tuning.soleTurn <= 1;
}
type Rotation = readonly [number, number, number, number];
type Stage = "idle" | "setup" | "transfer" | "unload" | "strike" | "place" | "recenter";
export interface KickReport {
  readonly foot: Side | null;
  readonly stage: Stage;
  readonly phase: StrikeCycleState["phase"];
  readonly returned: Readonly<Record<Side, number>>;
  readonly failed: number;
  readonly interrupted: number;
}
/** **A kick skill**: a foot's attack, which takes the stance from the legs while it works. */
export interface KickSkill extends Skill {
  readonly state: object;
  readonly report: KickReport;
  /** The stance and foot goals for the kick `requested` or under way, over `stance`; null with none. A kick begins only while `available`. */
  command(view: BodyView, requested: KickAttack | null, stance: StanceGoal | null, available: boolean, dt: number): Pick<BodyCommand, "stance" | "effectors"> | null;
}

/** A measured support transfer and foot adapter around the shared finite strike cycle. */
export function kickSkill(body: Body, tuning: KickTuning = KICK_PATH): KickSkill {
  tuning = Object.freeze({ ...tuning });
  if (!validKickTuning(tuning))
    throw new Error("invalid kick tuning");
  for (const side of ["left", "right"])
    if (!body.built.spec.effectors?.some(e => e.segment === `foot.${side}`))
      throw new Error("kicks require two declared foot effectors");
  const feet = footStatesOf(body.built), support = supportReadiness(body.built), middle = new Vector3();
  const local = new Vector3(), world = new Vector3(), direction = new Vector3(), inverse = new Quaternion(), turn = new Quaternion(), held = new Quaternion();
  const limits = Object.freeze({ ...tuning, impact: tuning });
  const strikeOf = (side: Side) => effectorStrike({ effector: `foot.${side}`, point: "strike", limits,
    chamberSeconds: tuning.chamberSeconds, returnSeconds: tuning.returnSeconds, response: tuning.response });
  const strikes = { left: strikeOf("left"), right: strikeOf("right") };
  const hipWidth = Math.abs(body.built.spec.joints.find(j => j.name === "hip.right")!.centre.value[0] - body.built.spec.joints.find(j => j.name === "hip.left")!.centre.value[0]);
  const state = { stage: "idle" as Stage, foot: null as Side | null, action: null as KickAttack | null, time: 0, held: 0,
    anchors: {} as Partial<Record<Side, {
      position: Vec3;
      rotation: Rotation;
    }>>,
    cooldown: tuning.cooldown, heading: 0, height: 0, strikes: { left: strikes.left.state, right: strikes.right.state }, support: support.state,
    initial: null as {
      sole: Vec3;
      strike: Vec3;
      rotation: Rotation;
      chamber: Vec3;
      home: Vec3;
    } | null,
    returned: { left: 0, right: 0 }, failed: 0, interrupted: 0, placementVerified: false, withdrawalVerified: false, cycleFailed: false, setting: null as Side | null,
    footing: { left: [0, 0] as readonly [number, number], right: [0, 0] as readonly [number, number] } };
  const report: KickReport = { get foot() { return state.foot; }, get stage() { return state.stage; }, get phase() { return state.foot ? strikes[state.foot].state.phase : null; },
    returned: state.returned, get failed() { return state.failed; }, get interrupted() { return state.interrupted; } };
  const stage = (next: Stage) => { state.stage = next; state.time = 0; state.held = 0; if (state.foot) strikes[state.foot].renew(); };
  const finish = (success: boolean | null) => {
    if (state.foot) {
      if (success)
        state.returned[state.foot]++;
      else if (success === false)
        state.failed++;
    }
    stage("idle");
    if (state.foot)
      strikes[state.foot].reset();
    state.foot = null;
    state.action = null;
    state.initial = null;
    state.cooldown = 0;
  };
  const worldPoint = (view: BodyView, p: Vector3, out: Vector3) => p.applyRotationQuaternionToRef(view.root.rotation, out).addInPlace(view.root.position);
  const coordinates = (v: Vector3): Vec3 => [v.x, v.y, v.z];
  /**
   * Where the kicking foot stands as the kick begins, world frame, the chamber above and behind it,
   * and the home its stroke returns to, `near` over its strike point: a foot that comes back to the
   * ground short of its place is held there by its friction, so it comes back over it and is then set down.
   */
  const capture = (view: BodyView, e: BodyView["effectors"][string]) => {
    const sole = coordinates(worldPoint(view, e.points.sole!, world));
    const strike = coordinates(worldPoint(view, e.points.strike!, world));
    view.root.rotation.multiplyToRef(e.rotation, turn).normalize();
    return { sole, strike, rotation: [turn.x, turn.y, turn.z, turn.w] as Rotation,
      chamber: [strike[0] + tuning.windup * sin(state.heading), strike[1] + tuning.lift, strike[2] + tuning.windup * cos(state.heading)] as Vec3,
      home: [strike[0], strike[1] + tuning.near, strike[2]] as Vec3 };
  };
  const place = (view: BodyView, point: string, target: Vec3, seconds: number, rotation?: Rotation): EffectorGoal => {
    intoFrameToRef(view.root, target, local);
    const goal: EffectorGoal = { response: tuning.response, places: [{ point, position: [local.x, local.y, local.z] }], seconds, follows: true, sequence: strikes[state.foot!].state.sequence };
    if (!rotation)
      return goal;
    Quaternion.InverseToRef(view.root.rotation, inverse).multiplyToRef(held.copyFromFloats(...rotation), turn).normalize();
    return { ...goal, orientation: { target: [turn.x, turn.y, turn.z, turn.w], seconds } };
  };
  return { state, report, resume() {
      if (state.foot)
        state.interrupted++;
      finish(null);
      support.state.quiet = 0;
      state.placementVerified = false;
      state.withdrawalVerified = false;
    },
    command(view, requested, stance, available, dt) {
      if (requested && (!["left", "right"].includes(requested.foot) || requested.target.length !== 3 || !requested.target.every(Number.isFinite)))
        throw new Error("a kick requires a named foot and finite world target");
      support.read(view.stance.centre, view.stance.velocity, dt);
      readSupport(feet, feet, middle);
      state.cooldown += dt;
      if (state.stage === "idle") {
        if (!requested || !available || !stance || view.down || view.stance.phase !== "stand" || view.time < tuning.startup
          || state.cooldown < tuning.cooldown || !plantedSupport(support.state) || support.state.quiet < STRIKE_SUPPORT.hold)
          return null;
        const e = view.effectors[`foot.${requested.foot}`]!;
        state.anchors = {};
        state.foot = requested.foot;
        state.action = { ...requested, target: [...requested.target] };
        state.heading = stance.heading;
        state.height = stance.height - tuning.lower;
        state.initial = capture(view, e);
        for (const side of ["left", "right"] as const) {
          const sign = side === "right" ? 1 : -1;
          state.footing[side] = [middle.x + sign * hipWidth * cos(state.heading) / 2, middle.z - sign * hipWidth * sin(state.heading) / 2];
        }
        state.withdrawalVerified = false;
        state.placementVerified = false;
        state.cycleFailed = false;
        state.setting = null;
        stage("setup");
      }
      if (view.down) {
        state.interrupted++;
        finish(null);
        return null;
      }
      // The kick under way aims where its request moves its target.
      if (requested && requested.foot === state.foot && requested.target.some((v, k) => v !== state.action!.target[k])) state.action = { ...state.action!, target: [...requested.target] };
      const foot = state.foot!, other = foot === "left" ? "right" : "left", bearing = feet.find(f => f.side === other)!, initial = state.initial!;
      const e = view.effectors[`foot.${foot}`]!, kicking = strikes[foot], velocity = kicking.read(view, dt);
      const loads = support.state.loads, total = loads.left + loads.right;
      const centre = view.stance.centre, inside = withinSupport([bearing], centre.x, centre.z);
      const bearingReady = loads[other] > 0 && !support.state.otherSupport && inside[0] === centre.x && inside[1] === centre.z;
      state.time += dt;
      let goal: EffectorGoal | null = null;
      const anchor = state.anchors[other];
      const supported: StanceGoal = { feet: [other], centre: anchor ? [anchor.position[0], anchor.position[2]] : [bearing.middle.x, bearing.middle.z], height: state.height + (state.stage === "place" || state.stage === "recenter" || kicking.state.phase === "return" ? tuning.lower : 0), heading: state.heading, pose: { pitch: state.stage === "place" || state.stage === "recenter" ? 0 : tuning.lean, seconds: tuning.transferSeconds, anchors: state.anchors } };
      switch (state.stage) {
        case "setup": {
          if (!requested) {
            state.interrupted++;
            finish(null);
            return null;
          }
          if (state.time >= tuning.setupLimit) {
            finish(false);
            return null;
          }
          const far = (side: Side) => { const sole = view.stance.soles[side], to = state.footing[side]; return hypot(sole.x - to[0], sole.z - to[1]); };
          if (state.setting && view.stance.phase === "stand" && far(state.setting) <= tuning.near)
            state.setting = null;
          if (!state.setting)
            state.setting = far("left") > tuning.near ? "left" : far("right") > tuning.near ? "right" : null;
          if (state.setting) {
            const moving = state.setting;
            return { stance: { feet: ["left", "right"], centre: null, height: stance!.height, heading: state.heading,
                swing: { foot: moving, to: state.footing[moving], seconds: STANCE_GAIT.seconds, lift: STANCE_GAIT.lift } } };
          }
          state.held = plantedSupport(support.state) && view.stance.phase === "stand"
            && support.state.speed <= tuning.transferSlow ? state.held + dt : 0;
          if (state.held < tuning.hold)
            return { stance: { ...supported, feet: ["left", "right"], centre: null, height: stance!.height } };
          state.initial = capture(view, e);
          const be = view.effectors[`foot.${other}`]!;
          const bp = coordinates(worldPoint(view, be.points.sole!, world));
          view.root.rotation.multiplyToRef(be.rotation, turn).normalize();
          state.anchors = { [other]: { position: bp, rotation: [turn.x, turn.y, turn.z, turn.w] } };
          stage("transfer");
          return { stance: { ...supported, feet: ["left", "right"], pose: { pitch: tuning.lean, seconds: tuning.transferSeconds } } };
        }
        case "transfer": {
          const near = bearingReady;
          const ready = near && total > 0 && support.state.speed <= tuning.transferSlow;
          state.held = ready ? state.held + dt : 0;
          if (!requested) {
            state.interrupted++;
            stage("recenter");
            return { stance: { ...supported, feet: ["left", "right"], centre: null } };
          }
          if (state.time >= tuning.transferLimit) {
            state.cycleFailed = true;
            stage("recenter");
            return { stance: { ...supported, feet: ["left", "right"], centre: null } };
          }
          if (state.held < tuning.hold)
            return { stance: { ...supported, feet: ["left", "right"], pose: { pitch: tuning.lean, seconds: tuning.transferSeconds } } };
          stage("unload");
          break;
        }
        case "unload": {
          if (!requested) {
            state.interrupted++;
            stage("place");
            goal = place(view, "sole", initial.sole, tuning.placeSeconds, initial.rotation);
            break;
          }
          if (state.time >= tuning.transferLimit) {
            state.cycleFailed = true;
            stage("place");
            goal = place(view, "sole", initial.sole, tuning.placeSeconds, initial.rotation);
            break;
          }
          goal = place(view, "sole", [initial.sole[0], initial.sole[1] + tuning.near, initial.sole[2]], tuning.chamberSeconds, initial.rotation);
          state.held = loads[foot] === 0 && bearingReady ? state.held + dt : 0;
          if (state.held >= tuning.hold) {
            stage("strike");
            kicking.begin("chamber", velocity);
          }
          break;
        }
        case "strike": break;
        case "place": {
          // Off its place across the ground by more than `placement`, the sole is carried `near` over it, and set down from there.
          const sole = worldPoint(view, e.points.sole!, world), error = hypot(sole.x - initial.sole[0], sole.y - initial.sole[1], sole.z - initial.sole[2]);
          const over = hypot(sole.x - initial.sole[0], sole.z - initial.sole[2]) <= tuning.placement;
          goal = place(view, "sole", over ? initial.sole : [initial.sole[0], initial.sole[1] + tuning.near, initial.sole[2]], tuning.placeSeconds, initial.rotation);
          view.root.rotation.multiplyToRef(e.rotation, turn).normalize();
          const angle = 1 - Math.abs(turn.x * initial.rotation[0] + turn.y * initial.rotation[1] + turn.z * initial.rotation[2] + turn.w * initial.rotation[3]);
          const ready = error <= tuning.placement && angle <= tuning.rotationError && loads[foot] > 0 && hypot(...velocity) <= tuning.placementSpeed;
          state.held = ready ? state.held + dt : 0;
          if (state.held >= tuning.hold) {
            state.placementVerified = true;
            stage("recenter");
            goal = null;
          }
          else if (state.time >= tuning.placeLimit) {
            finish(false);
            return null;
          }
          break;
        }
        case "recenter": {
          state.held = plantedSupport(support.state) && support.state.speed <= tuning.transferSlow
            && hypot(centre.x - middle.x, centre.z - middle.z) <= tuning.placement ? state.held + dt : 0;
          if (state.held >= tuning.hold) {
            finish(state.cycleFailed ? false : state.placementVerified && state.withdrawalVerified ? true : null);
            return null;
          }
          if (state.time >= tuning.recenterLimit) {
            finish(false);
            return null;
          }
          return { stance: { ...supported, feet: ["left", "right"], centre: null } };
        }
        case "idle": return null;
        default: {
          const never: never = state.stage;
          throw new Error(`unknown kick stage ${never}`);
        }
      }
      if (state.stage === "strike") {
        intoFrameToRef(view.root, initial.chamber, local);
        const chamber: Vec3 = [local.x, local.y, local.z];
        intoFrameToRef(view.root, state.action!.target, local);
        const target: Vec3 = [local.x, local.y, local.z];
        intoFrameToRef(view.root, initial.home, local);
        const home: Vec3 = [local.x, local.y, local.z];
        const dx = target[0] - chamber[0], dy = target[1] - chamber[1], dz = target[2] - chamber[2], length = hypot(dx, dy, dz);
        const contactVelocity: Vec3 = length ? [dx * tuning.contactSpeed / length, dy * tuning.contactSpeed / length, dz * tuning.contactSpeed / length] : [0, 0, 0];
        const course: StrikeCourse = { home, chamber, target, contactVelocity, seconds: tuning.swingSeconds };
        const event = kicking.step(view, velocity, course, { requested: !!requested, down: view.down, supported: bearingReady,
          prepared: loads[foot] === 0, free: loads[foot] === 0, targetId: state.action!.targetId }, dt);
        if (event & STRIKE_EVENT.failed)
          state.cycleFailed = true;
        if (event & STRIKE_EVENT.returned)
          state.withdrawalVerified = true;
        if (event & STRIKE_EVENT.finished) {
          stage("place");
          goal = place(view, "sole", initial.sole, tuning.placeSeconds, initial.rotation);
        }
        else {
          const phase = kicking.state.phase;
          if (phase === "swing")
            turnAboutToRef(direction.set(1, 0, 0), -tuning.soleTurn * Math.PI / 2, turn);
          else
            Quaternion.InverseToRef(view.root.rotation, inverse).multiplyToRef(held.copyFromFloats(...initial.rotation), turn).normalize();
          goal = kicking.goal(course, (phase === "swing" && tuning.soleTurn > 0) || phase === "return"
            ? { target: [turn.x, turn.y, turn.z, turn.w], seconds: tuning.swingSeconds } : undefined);
        }
      }
      return { stance: report.stage === "recenter" ? { ...supported, feet: ["left", "right"], centre: null } : supported,
        ...(goal ? { effectors: { [`foot.${foot}`]: goal } } : {}) };
    } };
}

/** One named kick executor shares its support transfer and cooldown between its actions. */
export function kickExecutor(body: Body, actions: readonly string[], tuning: KickTuning = KICK_PATH,
  resolve: (view: BodyView, target: TargetRef, action: string, effector: string) => Vec3 | null = (_view, target) => target.kind === "point" ? target.at : null): Executor {
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
  const capture = (view: BodyView, foot: Side, heading: number) => {
    const effector = view.effectors[`foot.${foot}`]!, sole = worldPoint(view, effector.points.sole!), strike = worldPoint(view, effector.points.strike!);
    view.root.rotation.multiplyToRef(effector.rotation, turn).normalize();
    return { sole, rotation: [turn.x, turn.y, turn.z, turn.w] as Rotation,
      chamber: [strike[0] + tuning.windup * sin(heading), strike[1] + tuning.lift, strike[2] + tuning.windup * cos(heading)] as Vec3,
      home: [strike[0], strike[1] + tuning.near, strike[2]] as Vec3 };
  };
  type Motion = { request: ActionRequest; foot: Side; stage: "admitting" | "setup" | "transfer" | "unload" | "strike" | "place" | "recenter";
    phase: "prepare" | "commit" | "release"; time: number; held: number; heading: number; height: number; target: Vec3;
    initial: ReturnType<typeof capture>; withdrawn: boolean; ending: ActionEnding; bearing: Vec3;
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
    const home = coordinates(intoFrameToRef(view.root, live.initial.home, local));
    const dx = target[0] - chamber[0], dy = target[1] - chamber[1], dz = target[2] - chamber[2], length = hypot(dx, dy, dz);
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
      if (state.live || view.time < tuning.startup || state.cooldown < tuning.cooldown) return { kind: "waiting", reason: "kick startup, cooldown or return" };
      const at = resolve(view, target, action, effector);
      if (!at) return { kind: "blocked", reason: "target has no aim" };
      const foot = sideOf(effector), hip = body.built.spec.joints.find(j => j.name === `hip.${foot}`)!.centre.value;
      const sole = body.built.spec.segments.find(segment => segment.name === `foot.${foot}`)!.distal.value;
      const reach = hypot(hip[0] - sole[0], hip[1] - sole[1], hip[2] - sole[2]);
      const soleAt = view.stance.soles[foot];
      if (at[1] < soleAt.y - tuning.near || at[1] > soleAt.y + reach) return { kind: "blocked", reason: "target is outside the leg's height band" };
      const dx = soleAt.x - view.stance.centre.x, dz = soleAt.z - view.stance.centre.z;
      const ahead = dx * sin(around.heading) + dz * cos(around.heading), across = dx * cos(around.heading) - dz * sin(around.heading);
      // The low-kick entry uses the tracking selection's reach; admission can brake an ordinary walk.
      const window = { at, along: [ahead + .25, ahead + .65] as const, across: [across - .16, across + .16] as const, facing: .4, speed: .5 };
      if (!withinActionWindow(view, window, around.heading)) return { kind: "position", window };
      return { kind: "ready" };
    },
    resume() { state.live = null; strikes.left.reset(); strikes.right.reset(); support.state.quiet = 0; state.cooldown = 0; },
    start(view, request, around) {
      if (state.live) throw new Error("kick executor already owns an instance");
      const foot = sideOf(request.effector), other = foot === "left" ? "right" : "left";
      const target = resolve(view, request.target, request.action, request.effector);
      if (!target) throw new Error("kick target has no aim");
      const initial = capture(view, foot, around.heading), bearing = capture(view, other, around.heading);
      const x = (view.stance.soles.left.x + view.stance.soles.right.x) / 2, z = (view.stance.soles.left.z + view.stance.soles.right.z) / 2;
      state.live = { request: { ...request }, foot, stage: "admitting", phase: "prepare", time: 0, held: 0, heading: around.heading,
        height: view.standing - around.lower - tuning.lower, target: [...target], initial, withdrawn: false, ending: { kind: "completed" },
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
            live.initial = capture(view, foot, live.heading);
            const captured = capture(view, other, live.heading); live.bearing = captured.sole; live.bearingRotation = captured.rotation;
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
          const event = strike.step(view, velocity, courseOf(view, live), { requested: true, down: false, supported: bearingReady,
            prepared: support.state.loads[foot] === 0, free: support.state.loads[foot] === 0, targetId: live.request.target.body }, dt);
          if (event & STRIKE_EVENT.failed) live.ending = { kind: "stalled", reason: strike.state.phase === "return" ? "chamber deadline" : "withdrawal deadline" };
          if (event & STRIKE_EVENT.aborted) live.ending = { kind: "interrupted", reason: "stroke lost support or met blocking contact" };
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
      return { legs: { kind: "hold" }, lower: view.standing - live.height, delegate: ["trunk"] };
    },
    overlay(view, id, _base) {
      const live = state.live;
      if (!live || live.request.id !== id) throw new Error(`kick executor has no instance ${id}`);
      const foot = live.foot, other = foot === "left" ? "right" : "left", strike = strikes[foot];
      const centred = live.stage === "admitting" || live.stage === "setup" || live.stage === "recenter";
      const both = centred || live.stage === "transfer";
      const standing: StanceGoal = { feet: both ? ["left", "right"] : [other], centre: centred ? null : [live.bearing[0], live.bearing[2]],
        height: live.height + (centred || live.stage === "place" || strike.state.phase === "return" ? tuning.lower : 0), heading: live.heading,
        ...(live.stage === "setup" && live.setting ? {} : { pose: { pitch: centred || live.stage === "place" ? 0 : tuning.lean, seconds: tuning.transferSeconds,
          ...(both ? {} : { anchors: { [other]: { position: live.bearing, rotation: live.bearingRotation } } }) },
        }),
        ...(live.stage === "setup" && live.setting ? { swing: { foot: live.setting, to: live.footing[live.setting], seconds: STANCE_GAIT.seconds, lift: STANCE_GAIT.lift } } : {}) };
      let goal: EffectorGoal | null = null;
      if (live.stage === "unload") goal = place(view, live, [live.initial.sole[0], live.initial.sole[1] + tuning.near, live.initial.sole[2]]);
      else if (live.stage === "strike") {
        if (strike.state.phase === "swing") turnAboutToRef(axis.set(1, 0, 0), -tuning.soleTurn * Math.PI / 2, turn);
        else Quaternion.InverseToRef(view.root.rotation, inverse).multiplyToRef(rotation.copyFromFloats(...live.initial.rotation), turn).normalize();
        goal = strike.goal(courseOf(view, live), (strike.state.phase === "swing" && tuning.soleTurn > 0) || strike.state.phase === "return"
          ? { target: [turn.x, turn.y, turn.z, turn.w], seconds: tuning.swingSeconds } : undefined);
      } else if (live.stage === "place") {
        const sole = worldPoint(view, view.effectors[live.request.effector]!.points.sole!);
        const over = hypot(sole[0] - live.initial.sole[0], sole[2] - live.initial.sole[2]) <= tuning.placement;
        goal = place(view, live, over ? live.initial.sole : [live.initial.sole[0], live.initial.sole[1] + tuning.near, live.initial.sole[2]]);
      }
      return { stance: standing, ...(goal ? { effectors: { [live.request.effector]: goal } } : {}) };
    },
  };
}
