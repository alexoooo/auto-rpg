import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyCommand, BodyView } from "../body.ts";
import { intoFrameToRef } from "../control/kinematics.ts";
import type { EffectorGoal } from "../control/motor.ts";
import type { StanceGoal } from "../control/stance.ts";
import { footStatesOf, readSupport, withinSupport } from "../control/support.ts";
import { STANCE_GAIT } from "../control/stance-tuning.ts";
import { contactResponse } from "../control/hand-feedback.ts";
import { supportReadiness, plantedSupport, STRIKE_SUPPORT } from "../control/support-readiness.ts";
import { hypot, sin, cos } from "../math/real.ts";
import { turnAboutToRef } from "../math/turn.ts";
import type { KickAction } from "../mind/intent.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { Skill } from "./skill.ts";
import { advanceStrike, strikeTransition, STRIKE_EVENT, type StrikeCycleState } from "./strike-cycle.ts";
import type { Side } from "../spec/body.ts";
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
/** A measured support transfer and foot adapter around the shared finite strike cycle. */
export function kickSkill(body: Body, tuning: KickTuning = KICK_PATH): Skill & {
  readonly state: object;
  readonly report: KickReport;
  command(view: BodyView, requested: KickAction | null, stance: StanceGoal | null, available: boolean, dt: number): Pick<BodyCommand, "stance" | "effectors"> | null;
} {
  tuning = Object.freeze({ ...tuning });
  if (!validKickTuning(tuning))
    throw new Error("invalid kick tuning");
  for (const side of ["left", "right"])
    if (!body.built.spec.effectors?.some(e => e.segment === `foot.${side}`))
      throw new Error("kicks require two declared foot effectors");
  const feet = footStatesOf(body.built), support = supportReadiness(body.built), middle = new Vector3();
  const local = new Vector3(), world = new Vector3(), direction = new Vector3(), inverse = new Quaternion(), turn = new Quaternion();
  const cycle: StrikeCycleState = { phase: null, time: 0, ready: 0, sequence: 0, velocity: [0, 0, 0], touching: false, impact: null };
  const hipWidth = Math.abs(body.built.spec.joints.find(j => j.name === "hip.right")!.centre.value[0] - body.built.spec.joints.find(j => j.name === "hip.left")!.centre.value[0]);
  const state = { stage: "idle" as Stage, foot: null as Side | null, action: null as KickAction | null, time: 0, held: 0,
    anchors: {} as Partial<Record<Side, {
      position: Vec3;
      rotation: Rotation;
    }>>,
    cooldown: tuning.cooldown, heading: 0, height: 0, cycle, support: support.state, previous: null as Vec3 | null,
    initial: null as {
      sole: Vec3;
      strike: Vec3;
      rotation: Rotation;
      chamber: Vec3;
    } | null,
    returned: { left: 0, right: 0 }, failed: 0, interrupted: 0, thrown: { left: 0, right: 0 }, impacts: { admitted: 0, aborted: 0 },
    placementReading: null as {
      error: number;
      angle: number;
      speed: number;
      load: number;
    } | null, placementVerified: false, withdrawalVerified: false, cycleFailed: false, setting: null as Side | null,
    footing: { left: [0, 0] as readonly [number, number], right: [0, 0] as readonly [number, number] } };
  const report: KickReport = { get foot() { return state.foot; }, get stage() { return state.stage; }, get phase() { return cycle.phase; },
    returned: state.returned, get failed() { return state.failed; }, get interrupted() { return state.interrupted; } };
  const stage = (next: Stage) => { state.stage = next; state.time = 0; state.held = 0; cycle.sequence++; };
  const finish = (success: boolean | null) => {
    if (state.foot) {
      if (success)
        state.returned[state.foot]++;
      else if (success === false)
        state.failed++;
    }
    stage("idle");
    state.foot = null;
    state.action = null;
    state.initial = null;
    state.previous = null;
    cycle.phase = null;
    cycle.impact = null;
    state.cooldown = 0;
  };
  const worldPoint = (view: BodyView, p: Vector3, out: Vector3) => p.applyRotationQuaternionToRef(view.root.rotation, out).addInPlace(view.root.position);
  const coordinates = (v: Vector3): Vec3 => [v.x, v.y, v.z];
  const place = (view: BodyView, point: string, target: Vec3, seconds: number, rotation?: Rotation): EffectorGoal => {
    intoFrameToRef(view.root, target, local);
    const goal: EffectorGoal = { response: tuning.response, places: [{ point, position: [local.x, local.y, local.z] }], seconds, follows: true, sequence: cycle.sequence };
    if (!rotation)
      return goal;
    Quaternion.InverseToRef(view.root.rotation, inverse).multiplyToRef(new Quaternion(...rotation), turn).normalize();
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
        const sole = coordinates(worldPoint(view, e.points.sole!, world));
        const strike = coordinates(worldPoint(view, e.points.strike!, world));
        view.root.rotation.multiplyToRef(e.rotation, turn).normalize();
        state.initial = { sole, strike, rotation: [turn.x, turn.y, turn.z, turn.w], chamber: [strike[0] + tuning.windup * sin(state.heading), strike[1] + tuning.lift, strike[2] + tuning.windup * cos(state.heading)] };
        for (const side of ["left", "right"] as const) {
          const sign = side === "right" ? 1 : -1;
          state.footing[side] = [middle.x + sign * hipWidth * cos(state.heading) / 2, middle.z - sign * hipWidth * sin(state.heading) / 2];
        }
        state.previous = null;
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
      const foot = state.foot!, other = foot === "left" ? "right" : "left", bearing = feet.find(f => f.side === other)!, initial = state.initial!;
      const e = view.effectors[`foot.${foot}`]!, at = e.points.strike!, now: Vec3 = [at.x, at.y, at.z], was = state.previous;
      const velocity: Vec3 = was ? [(at.x - was[0]) / dt, (at.y - was[1]) / dt, (at.z - was[2]) / dt] : [0, 0, 0];
      state.previous = now;
      const loads = support.state.loads, total = loads.left + loads.right;
      const centre = view.stance.centre, inside = withinSupport([bearing], centre.x, centre.z);
      const bearingReady = loads[other] > 0 && !support.state.otherSupport && inside[0] === centre.x && inside[1] === centre.z;
      state.time += dt;
      let goal: EffectorGoal | null = null;
      const anchor = state.anchors[other];
      const supported: StanceGoal = { feet: [other], centre: anchor ? [anchor.position[0], anchor.position[2]] : [bearing.middle.x, bearing.middle.z], height: state.height + (state.stage === "place" || state.stage === "recenter" || cycle.phase === "return" ? tuning.lower : 0), heading: state.heading, pose: { pitch: state.stage === "place" || state.stage === "recenter" ? 0 : tuning.lean, seconds: tuning.transferSeconds, anchors: state.anchors } };
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
          const sole = coordinates(worldPoint(view, e.points.sole!, world));
          const strike = coordinates(worldPoint(view, e.points.strike!, world));
          view.root.rotation.multiplyToRef(e.rotation, turn).normalize();
          state.initial = { sole, strike, rotation: [turn.x, turn.y, turn.z, turn.w], chamber: [strike[0] + tuning.windup * sin(state.heading), strike[1] + tuning.lift, strike[2] + tuning.windup * cos(state.heading)] };
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
            strikeTransition(cycle, "chamber", velocity);
          }
          break;
        }
        case "strike": break;
        case "place": {
          goal = place(view, "sole", initial.sole, tuning.placeSeconds, initial.rotation);
          const sole = worldPoint(view, e.points.sole!, world), error = hypot(sole.x - initial.sole[0], sole.y - initial.sole[1], sole.z - initial.sole[2]);
          view.root.rotation.multiplyToRef(e.rotation, turn).normalize();
          const angle = 1 - Math.abs(turn.x * initial.rotation[0] + turn.y * initial.rotation[1] + turn.z * initial.rotation[2] + turn.w * initial.rotation[3]);
          state.placementReading = { error, angle, speed: hypot(...velocity), load: loads[foot] };
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
        intoFrameToRef(view.root, initial.strike, local);
        const home: Vec3 = [local.x, local.y, local.z];
        const dx = target[0] - chamber[0], dy = target[1] - chamber[1], dz = target[2] - chamber[2], length = hypot(dx, dy, dz);
        const contactVelocity: Vec3 = length ? [dx * tuning.contactSpeed / length, dy * tuning.contactSpeed / length, dz * tuning.contactSpeed / length] : [0, 0, 0];
        const feedback = e.feedback, normal = feedback?.contact?.normal;
        direction.set(...contactVelocity).applyRotationQuaternionToRef(view.root.rotation, direction);
        const aligned = !!normal && length > 0 && Math.abs(direction.x * normal[0] + direction.y * normal[1] + direction.z * normal[2]) / tuning.contactSpeed >= tuning.normalAlignment;
        const touching = loads[foot] === 0 && (feedback?.impulse ?? 0) > 0;
        const event = advanceStrike(cycle, { at: now, velocity, home, chamber, requested: !!requested, down: view.down,
          supported: bearingReady, prepared: loads[foot] === 0, touching, intended: !!state.action!.targetId && contactResponse(feedback, state.action!.targetId) === "target",
          aligned, contactVelocity, seconds: tuning.swingSeconds }, { ...tuning, impact: tuning }, dt);
        if (event & STRIKE_EVENT.thrown)
          state.thrown[foot]++;
        if (event & STRIKE_EVENT.admitted)
          state.impacts.admitted++;
        if (event & STRIKE_EVENT.aborted)
          state.impacts.aborted++;
        if (event & STRIKE_EVENT.failed)
          state.cycleFailed = true;
        if (event & STRIKE_EVENT.returned)
          state.withdrawalVerified = true;
        if (event & STRIKE_EVENT.finished) {
          stage("place");
          goal = place(view, "sole", initial.sole, tuning.placeSeconds, initial.rotation);
        }
        else {
          const seconds = cycle.phase === "chamber" ? tuning.chamberSeconds : cycle.phase === "return" ? tuning.returnSeconds : tuning.swingSeconds;
          if (cycle.phase === "swing")
            turnAboutToRef(direction.set(1, 0, 0), -tuning.soleTurn * Math.PI / 2, turn);
          else
            Quaternion.InverseToRef(view.root.rotation, inverse).multiplyToRef(new Quaternion(...initial.rotation), turn).normalize();
          goal = { response: tuning.response, places: [{ point: "strike", position: cycle.impact?.finish ?? (cycle.phase === "swing" ? target : cycle.phase === "return" ? home : chamber) }], seconds,
            follows: true, initialVelocity: cycle.velocity, sequence: cycle.sequence,
            ...(((cycle.phase === "swing" && tuning.soleTurn > 0) || cycle.phase === "return") ? { orientation: { target: [turn.x, turn.y, turn.z, turn.w] as const, seconds: tuning.swingSeconds } } : {}),
            ...(cycle.phase === "swing" ? { terminalVelocity: contactVelocity } : {}) };
          if (cycle.impact)
            goal = { ...goal, seconds: tuning.impactSeconds, terminalVelocity: [0, 0, 0] };
        }
      }
      return { stance: report.stage === "recenter" ? { ...supported, feet: ["left", "right"], centre: null } : supported,
        ...(goal ? { effectors: { [`foot.${foot}`]: goal } } : {}) };
    } };
}
