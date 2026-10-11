import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import poses from "../../../../assets/research/posture-holds.json" with { type: "json" };
import { commandable, SERVO_SECONDS, type BodyView } from "../../body.ts";
import { footStatesOf, readSupport, withinSupport } from "../../control/support.ts";
import { recoveryReady } from "../../control/recovery-ready.ts";
import { motorControl } from "../../control/motor.ts";
import { wholeBodyTracking, trackingRejected } from "../../control/whole-body.ts";
import type { MotionCommand } from "../../control/tasks.ts";
import { atan2 } from "../../math/real.ts";
import { spinBetweenToRef, turnAboutToRef, turnBetweenToRef } from "../../math/turn.ts";
import { observeBody, type BodyObservation } from "../../observation.ts";
import { guardPosture } from "../../skills/guard.ts";
import { locomotion } from "../../skills/locomotion.ts";
import { minimumJerk } from "../../skills/whole-body-strike.ts";
import type { BodySpec, Side } from "../../spec/body.ts";
import type { Vec3 } from "../../spec/quantity.ts";
import { deepFreeze } from "../../state.ts";
import type { World } from "../../world.ts";
import { applyAction } from "../actions.ts";
import type { OwnBody } from "../mind.ts";
import type { SubMind } from "../sub-mind.ts";
import { RISE, type Lie } from "./stages.ts";
import { handTransfer, HAND_TRANSFER } from "./hand-transfer.ts";
import { extensionCanStand, extensionNeedsPeel, supportedExtension } from "./supported-extension.ts";

/** Motion feedback, progress hysteresis and bounded retry deadlines; controller choices, not anatomy. */
const T = deepFreeze({ response: .15, jointWeight: .2, centreWeight: 3, rootWeight: .5, pointWeight: 2,
  poseNear: .4, contactHold: .05, stalled: 1, attempt: 6, progress: .005,
  prepare: .25, move: .65, extension: .8, poseResponse: .03, poseSpeed: 10,
  rootResponse: .3, rootOrientationWeight: 3, supportedRootWeight: 1,
  pronePitch: 1.3, kneelPitch: .2, kneeHeight: .5, transferHeight: .7,
  hipPitchFeedback: 1, foursUp: .05, foursHold: .1, foursSeconds: .3,
  footWidth: .2, footReach: .3, footLift: .18, wind: .4,
  slow: .1, minUpNormal: .9, hold: .5,
  extensionSoleUp: .995, extensionRootUp: .9, standSeconds: 1.3, standLower: .03,
  supportBand: .0001,
  contact: { normalResponseSeconds: .2, maxPoints: 64, gap: .005, minUpNormal: .9, pointSeparation: .001, forceTolerance: 1e-5, redistributionCost: 1e-6,
    iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6, liftOff: { accelerationTolerance: .1 } } });
const ZERO: Vec3 = Object.freeze([0, 0, 0]);
const SIDES = ["left", "right"] as const;
type Phase = "orient" | "acquire" | "place" | "transfer" | "extend" | "stabilize" | "complete";
interface Model {
  readonly channels: readonly { readonly name: string; readonly min: number; readonly max: number; readonly bind: number }[];
  readonly segments: readonly { readonly name: string; readonly mass: number; readonly localCentre?: Vec3 }[];
  readonly soleUp: Readonly<Record<Side, Vec3>>;
  readonly soles: Readonly<Record<Side, { readonly at: Vec3; readonly rest: readonly [number, number, number, number] }>>;
  readonly rest: readonly [number, number, number, number];
  readonly rootHeight: number;
  readonly leg: number;
  readonly gravity: number;
  readonly held: Side | null;
  readonly fours: Readonly<Record<string, number>>;
}
const other = (side: Side): Side => side === "left" ? "right" : "left";
const length = (a: Vec3, b: Vec3) => Math.sqrt((a[0] - b[0]) * (a[0] - b[0])
  + (a[1] - b[1]) * (a[1] - b[1]) + (a[2] - b[2]) * (a[2] - b[2]));

/** A loaded floor patch retains its contact width; pair averages serve observations without patches. */
export function riseContactPoints(contact: BodyObservation["contacts"][number]): readonly Vec3[] {
  if (contact.fixed === null || !(contact.impulse > 0)) return [];
  if (contact.patch) return contact.patch.filter(p => -p.normal[1] >= T.minUpNormal && p.distance <= T.contact.gap).map(p => p.point);
  if (-contact.normal[1] < T.minUpNormal) return [];
  return contact.pairs.length ? contact.pairs.filter(p => p.impulse > 0 && -p.normal[1] >= T.minUpNormal).map(p => p.point) : [contact.point];
}

/** Hand-and-knee support with the trunk clear and the pelvis above its prone orientation. */
export function riseCanPlace(o: BodyObservation, model: Pick<Model, "held" | "rest">,
  work = { up: new Vector3(), turn: new Quaternion(), inverse: new Quaternion() }): boolean {
  const root = o.segments.find(s => s.name === "lowerTrunk");
  if (!root) return false;
  Quaternion.InverseToRef(work.inverse.set(...model.rest), work.inverse);
  work.turn.set(...root.rotation).multiplyToRef(work.inverse, work.turn);
  work.up.set(0, 1, 0).applyRotationQuaternionToRef(work.turn, work.up);
  if (work.up.y <= T.foursUp) return false;
  const loaded = o.contacts.filter(c => c.fixed !== null && c.impulse > 0 && Math.abs(c.normal[1]) >= T.minUpNormal);
  const hands = model.held ? [`hand.${other(model.held)}`] : SIDES.map(side => `hand.${side}`);
  return ["shank.left", "shank.right", ...hands].every(name => loaded.some(c => c.segment === name))
    && !loaded.some(c => /Trunk|head/.test(c.segment));
}

/** A loaded sole facing up, rather than a boot touching the floor on its side or toes. */
export function riseFootPlanted(o: BodyObservation, side: Side, soleUp: Vec3,
  work = { up: new Vector3(), turn: new Quaternion() }): boolean {
  const name = `foot.${side}`, foot = o.segments.find(s => s.name === name);
  if (!foot || !o.contacts.some(c => c.segment === name && c.fixed !== null
    && c.impulse > 0 && Math.abs(c.normal[1]) >= T.minUpNormal)) return false;
  work.up.set(...soleUp).applyRotationQuaternionToRef(work.turn.set(...foot.rotation), work.up);
  return work.up.y >= T.minUpNormal;
}

/** An upright half-kneel whose lead sole, rear boot and shin carry its capture point. */
export function riseCanExtend(o: BodyObservation, lead: Side,
  model: Pick<Model, "soleUp" | "rest" | "segments" | "gravity">, ground: number,
  work = { up: new Vector3(), turn: new Quaternion(), inverse: new Quaternion() }): boolean {
  const foot = o.segments.find(s => s.name === `foot.${lead}`), root = o.segments.find(s => s.name === "lowerTrunk");
  if (!foot || !root || !riseFootPlanted(o, lead, model.soleUp[lead], work)) return false;
  if (work.up.y < T.extensionSoleUp) return false;
  Quaternion.InverseToRef(work.inverse.set(...model.rest), work.inverse);
  work.turn.set(...root.rotation).multiplyToRef(work.inverse, work.turn);
  work.up.set(0, 1, 0).applyRotationQuaternionToRef(work.turn, work.up);
  if (work.up.y < T.extensionRootUp) return false;
  const loaded = o.contacts.filter(c => c.fixed !== null && c.impulse > 0 && Math.abs(c.normal[1]) >= T.minUpNormal);
  if (![`foot.${lead}`, `foot.${other(lead)}`, `shank.${other(lead)}`].every(name => loaded.some(c => c.segment === name))
    || loaded.some(c => /Trunk|head/.test(c.segment))) return false;
  // The rear boot's toe can carry weight while its shin is down; its sole need not be flat yet.
  const patches = loaded.filter(c => /^(foot|shank)\./.test(c.segment)).map(c => ({
    corners: riseContactPoints(c).map(p => new Vector3(...p)),
  })).filter(p => p.corners.length);
  if (!patches.length) return false;
  const mass = model.segments.reduce((sum, s) => sum + s.mass, 0);
  let vx = 0, vz = 0;
  for (const s of model.segments) {
    const segment = o.segments.find(p => p.name === s.name);
    if (!segment) return false;
    vx += segment.velocity[0] * s.mass / mass; vz += segment.velocity[2] * s.mass / mass;
  }
  const span = Math.sqrt(Math.max(0, o.centre[1] - ground) / model.gravity),
    x = o.centre[0] + vx * span, z = o.centre[2] + vz * span, near = withinSupport(patches, x, z, 0);
  return near[0] === x && near[1] === z;
}

/** Human rigs with two legs, usable hands and at most one compound held item. */
export function dynamicRiseFits(spec: BodySpec): boolean {
  return (spec.model === "workshop-fighter" || spec.model === "workshop-rogue") && commandable(spec)
    && ["lowerTrunk", "middleTrunk", "upperTrunk", "shank.left", "shank.right"].every(name => spec.segments.some(s => s.name === name))
    && (spec.held?.length ?? 0) <= 1 && (spec.held ?? []).every(h => SIDES.some(side => h.segment === `hand.${side}`));
}

/** Detached contact-driven objectives; all persistent decisions belong to the policy's state. */
export function dynamicRisePolicy(input: Model) {
  const model = deepFreeze(structuredClone(input));
  if (!(model.leg > 0 && model.rootHeight > 0 && model.gravity > 0)
    || ![model.leg, model.rootHeight, model.gravity, ...model.rest].every(Number.isFinite)
    || !model.channels.length || model.channels.some(c => ![c.min, c.max, c.bind].every(Number.isFinite) || c.min > c.max)
    || SIDES.some(s => !model.soleUp?.[s] || !model.soleUp[s].every(Number.isFinite)
      || Math.abs(model.soleUp[s].reduce((n, v) => n + v * v, 0) - 1) > 1e-6)
    || SIDES.some(s => !model.soles?.[s] || ![...model.soles[s].at, ...model.soles[s].rest].every(Number.isFinite)
      || Math.abs(model.soles[s].rest.reduce((n, v) => n + v * v, 0) - 1) > 1e-6)
    || model.segments.some(s => !(s.mass > 0) || !Number.isFinite(s.mass)
      || (s.localCentre !== undefined && (!Array.isArray(s.localCentre) || s.localCentre.length !== 3
        || !s.localCentre.every(Number.isFinite))))) throw new Error("invalid dynamic rise model");
  const transfer = handTransfer(model);
  const state = { handTransfer: transfer.state, phase: "complete" as Phase, elapsed: 0, time: 0, attemptTime: 0, stagnant: 0, error: Infinity,
    stage: 0, held: 0, ready: 0, attempts: 0, retries: 0, completed: 0, began: 0, finished: 0,
    ground: 0, yaw: 0, lead: "left" as Side, roll: "right" as Side, released: false, landed: false,
    from: model.channels.map(() => 0), pointFrom: [0, 0, 0] as [number, number, number],
    pointTo: [0, 0, 0] as [number, number, number], turnFrom: [0, 0, 0, 1] as [number, number, number, number],
    turnTo: [0, 0, 0, 1] as [number, number, number, number], rootFrom: 0, lie: "front" as Lie };
  const relative = new Quaternion(), restInverse = Quaternion.Inverse(new Quaternion(...model.rest)), way = new Vector3();
  const pointTurn = new Quaternion(), turnStart = new Quaternion(), turnEnd = new Quaternion(), footSpin = new Vector3();
  const find = (o: BodyObservation, name: string) => {
    const segment = o.segments.find(s => s.name === name);
    if (!segment) throw new Error(`dynamic rise lacks ${name}`);
    return segment;
  };
  const facing = (o: BodyObservation): Lie => {
    relative.set(...find(o, "lowerTrunk").rotation).multiplyToRef(restInverse, relative);
    const front = way.set(0, 0, 1).applyRotationQuaternionToRef(relative, way).y;
    if (front > .5) return "back";
    if (front < -.5) return "front";
    return way.set(-1, 0, 0).applyRotationQuaternionToRef(relative, way).y < 0 ? "left" : "right";
  };
  const contacts = (o: BodyObservation, names?: readonly string[]) => o.contacts.filter(c => c.fixed !== null
    && c.impulse > 0 && Math.abs(c.normal[1]) >= T.minUpNormal && (!names || names.includes(c.segment)));
  const loaded = (o: BodyObservation, name: string) => contacts(o, [name]).length > 0;
  const footWork = { up: new Vector3(), turn: new Quaternion() };
  const placeWork = { up: new Vector3(), turn: new Quaternion(), inverse: new Quaternion() };
  const planted = (o: BodyObservation, side: Side) => riseFootPlanted(o, side, model.soleUp[side], footWork);
  const clear = (o: BodyObservation) => !contacts(o, ["head", "upperTrunk", "middleTrunk", "lowerTrunk"]).length;
  const capture = (o: BodyObservation): Vec3 => {
    const mass = model.segments.reduce((n, s) => n + s.mass, 0), velocity = model.segments.reduce((v, s) => {
      const motion = find(o, s.name).velocity;
      return [v[0]! + motion[0] * s.mass / mass, v[1]! + motion[1] * s.mass / mass, v[2]! + motion[2] * s.mass / mass];
    }, [0, 0, 0]);
    const span = Math.sqrt(Math.max(0, o.centre[1] - state.ground) / model.gravity);
    return [o.centre[0] + velocity[0]! * span, o.centre[1], o.centre[2] + velocity[2]! * span];
  };
  const supported = (o: BodyObservation, names: readonly string[]) => {
    if (!names.every(n => loaded(o, n))) return false;
    const patches = names.map(name => ({ corners: contacts(o, [name]).flatMap(c => riseContactPoints(c).map(p => new Vector3(...p))) }));
    if (patches.some(p => !p.corners.length)) return false;
    const p = capture(o), near = withinSupport(patches, p[0], p[2], 0);
    return near[0] === p[0] && near[1] === p[2];
  };
  const heading = (o: BodyObservation) => {
    relative.set(...find(o, "lowerTrunk").rotation).multiplyToRef(restInverse, relative);
    way.set(1, 0, 0).applyRotationQuaternionToRef(relative, way);
    return atan2(-way.z, way.x);
  };
  const enter = (phase: Phase, o: BodyObservation) => {
    transfer.reset();
    state.phase = phase; state.time = 0; state.stagnant = 0; state.error = Infinity; state.held = 0;
    state.from = o.joints.map(j => j.angle); state.rootFrom = find(o, "lowerTrunk").position[1];
    if (phase === "place") state.yaw = heading(o);
  };
  const freeHand = () => model.held ? other(model.held) : other(state.lead);
  const classify = (o: BodyObservation) => {
    state.attemptTime = 0;
    state.lie = facing(o); state.released = false; state.stage = 0;
    if (state.lie === "left" || state.lie === "right") state.roll = state.lie;
    state.yaw = heading(o);
    const lead = SIDES.find(s => planted(o, s) && !loaded(o, `shank.${s}`) && loaded(o, `shank.${other(s)}`));
    if (SIDES.every(s => planted(o, s)) && clear(o) && !o.down) enter("stabilize", o);
    else if (clear(o) && lead) { state.lead = lead; enter("transfer", o); }
    else if (riseCanPlace(o, model, placeWork)) enter("place", o);
    else enter(state.lie === "front" ? "acquire" : "orient", o);
  };
  const begin = (o: BodyObservation) => {
    state.elapsed = 0; state.attempts = 1; state.retries = 0; state.ready = 0; state.began = o.time;
    const ground = contacts(o); if (ground.length) state.ground = Math.min(...ground.map(c => c.point[1]));
    state.lead = model.held ?? "left"; state.roll = model.held ? other(model.held) : "right";
    state.landed = contacts(o).some(c => !c.segment.startsWith("foot."));
    classify(o);
  };
  const posture = (name: string) => {
    const p = RISE.rise.find(s => s.name === name)?.posture;
    if (!p || p === "reference") throw new Error(`dynamic rise has no ${name} seed`);
    return p;
  };
  const angles = (pose: Readonly<Record<string, number>>, mirror = false) => model.channels.map(c => {
    const name = mirror ? c.name.replace(".left ", ".@ ").replace(".right ", ".left ").replace(".@ ", ".right ") : c.name;
    const sign = mirror && /lateral flexion right|rotation right/.test(name) ? -1 : 1;
    return Math.max(c.min, Math.min(c.max, sign * (pose[name] ?? 0) - c.bind));
  });
  return { state, begin, end() { state.phase = "complete"; transfer.reset(); }, reclassify: classify,
    step(o: BodyObservation, dt: number): MotionCommand {
      if (!(dt > 0) || !Number.isFinite(dt)) throw new Error("invalid dynamic rise step");
      state.elapsed += dt; state.time += dt; state.attemptTime += dt;
      const ground = contacts(o); if (ground.length) state.ground = Math.min(...ground.map(c => c.point[1]));
      if (!state.landed) {
        state.landed = ground.some(c => !c.segment.startsWith("foot."));
        if (state.landed) classify(o);
        else return { joints: [], frames: [], grips: [] };
      }
      const free = other(state.lead), hand = `hand.${freeHand()}`, rear = `shank.${free}`, moving = `foot.${state.lead}`;
      const hands = model.held ? [hand] : SIDES.map(side => `hand.${side}`);
      if (state.phase === "transfer") {
        if (transfer.state.stage === "inactive") transfer.begin(o, state.lead, freeHand());
        if (transfer.state.stage !== "inactive" && state.attemptTime < T.attempt) {
          state.released = transfer.state.stage === "lift";
          return transfer.step(o, dt);
        }
      }
      const commandedPhase = state.phase, commandedStage = state.stage;
      let pose: Readonly<Record<string, number>> = {}, mirror = state.lead === "right";
      switch (state.phase) {
        case "orient": {
          const roll = RISE.roll.back, lie = facing(o);
          if (lie === "front") { enter("acquire", o); state.stage = 0; }
          else {
            if (lie === state.roll && state.stage < 2) { state.stage = 2; enter("orient", o); }
            if (state.stage === 0 && state.time >= T.wind) { state.stage = 1; enter("orient", o); }
            pose = roll[Math.min(3, state.stage)]!.posture; mirror = state.roll === "left";
          }
          break;
        }
        case "acquire": {
          pose = state.stage === 3 ? model.fours : posture(["fold", "tuck", "prop"][state.stage]!); mirror = false;
          if (SIDES.every(s => loaded(o, `shank.${s}`)) && hands.every(name => loaded(o, name))
            && clear(o) && facing(o) === "front") {
            state.held += dt;
            if (state.stage === 1 && state.held >= T.contactHold) { state.stage = 2; enter("acquire", o); }
            else if (state.stage === 2 && riseCanPlace(o, model, placeWork) && state.held >= T.contactHold) {
              state.stage = 3; enter("acquire", o);
            } else if (state.stage === 3 && riseCanPlace(o, model, placeWork)
              && state.time >= T.foursSeconds && state.held >= T.foursHold) { enter("place", o); state.stage = 0; }
          } else state.held = 0;
          break;
        }
        case "place": {
          const retained = [...hands, rear];
          if (!state.released && supported(o, retained)) {
            state.released = true; enter("place", o);
            const foot = find(o, moving);
            way.set(...model.soles[state.lead].at).applyRotationQuaternionToRef(pointTurn.set(...foot.rotation), way);
            state.pointFrom = [foot.position[0] + way.x, foot.position[1] + way.y, foot.position[2] + way.z];
            state.turnFrom = [...foot.rotation];
            const root = find(o, "lowerTrunk").position, turn = turnAboutToRef(Vector3.UpReadOnly, state.yaw, new Quaternion());
            way.set((state.lead === "left" ? -1 : 1) * model.leg * T.footWidth, 0, model.leg * T.footReach).applyRotationQuaternionToRef(turn, way);
            state.pointTo = [root[0] + way.x, state.ground, root[2] + way.z];
            turn.multiplyToRef(pointTurn.set(...model.soles[state.lead].rest), pointTurn);
            state.turnTo = [pointTurn.x, pointTurn.y, pointTurn.z, pointTurn.w];
          }
          pose = { ...model.fours };
          if (state.released) for (const [name, angle] of Object.entries(posture("reach"))) {
            if (/^(hip|knee|ankle)\.left /.test(name)) (pose as Record<string, number>)[name.replace(".left ", `.${state.lead} `)] = angle;
          }
          mirror = false;
          if (state.released && clear(o) && planted(o, state.lead) && loaded(o, rear)
            && !loaded(o, `shank.${state.lead}`)) { enter("transfer", o); state.released = false; }
          break;
        }
        case "transfer":
          pose = posture("half kneel");
          if (supported(o, [moving, rear, `foot.${free}`])) state.released = true;
          if (clear(o) && SIDES.every(s => planted(o, s)) && supported(o, [moving, `foot.${free}`])) {
            enter("extend", o); state.released = true;
          }
          break;
        case "extend":
          pose = posture("lunge 3");
          if (!o.down && clear(o) && SIDES.every(s => planted(o, s)) && !contacts(o, [hand, rear]).length) enter("stabilize", o);
          break;
        case "stabilize": case "complete": break;
        default: { const never: never = state.phase; throw new Error(`unknown dynamic rise phase ${never}`); }
      }
      if (state.phase === "acquire") {
        relative.set(...find(o, "lowerTrunk").rotation).multiplyToRef(restInverse, relative);
        const front = way.set(0, 0, 1).applyRotationQuaternionToRef(relative, way).y;
        const up = way.set(0, 1, 0).applyRotationQuaternionToRef(relative, way).y;
        // Flexing the hips pitches the pelvis forward; the measured pitch checks that reaction during the tuck.
        const correction = T.hipPitchFeedback * (atan2(-front, up) - T.pronePitch);
        pose = { ...pose, "hip.left flexion": (pose["hip.left flexion"] ?? 0) - correction,
          "hip.right flexion": (pose["hip.right flexion"] ?? 0) - correction };
      }
      const goal = angles(pose, mirror);
      let error = 0;
      for (let i = 0; i < goal.length; i++) {
        const name = model.channels[i]!.name;
        if (/ flexion$| abduction$| dorsiflexion$/.test(name)) error = Math.max(error, Math.abs(goal[i]! - o.joints[i]!.angle));
      }
      if (state.phase === "transfer" || state.phase === "extend") {
        const height = state.phase === "transfer" ? model.leg * T.transferHeight : model.rootHeight;
        error = Math.abs(state.ground + height - find(o, "lowerTrunk").position[1]);
      }
      if (((state.phase === "orient" && state.stage === 2) || (state.phase === "acquire" && state.stage < 3)) && error < T.poseNear && state.time >= T.prepare) {
        state.stage++; enter(state.phase, o);
      }
      // An outgoing pose's error cannot seed the next stage's progress baseline.
      if (state.phase === commandedPhase && state.stage === commandedStage) {
        if (error < state.error - T.progress) { state.error = error; state.stagnant = 0; }
        else state.stagnant += dt;
      }
      if (state.phase === commandedPhase && state.stage === commandedStage
        && (state.stagnant >= T.stalled || state.attemptTime >= T.attempt)) {
        state.retries++;
        if (state.attemptTime < T.attempt && state.phase === "acquire" && state.stage < 3 && facing(o) !== "back") { state.stage++; enter("acquire", o); }
        else { state.attempts++; classify(o); }
      }
      const blend = minimumJerk(state.time, T.prepare);
      const joints = model.channels.map((c, i) => ({ channel: c.name, angle: state.from[i]! + (goal[i]! - state.from[i]!) * blend.s,
        rate: (goal[i]! - state.from[i]!) * blend.v, acceleration: (goal[i]! - state.from[i]!) * blend.a,
        seconds: T.response, weight: T.jointWeight }));
      const frames: MotionCommand["frames"][number][] = [], centres: NonNullable<MotionCommand["centres"]>[number][] = [];
      const supports: NonNullable<MotionCommand["supports"]>[number][] = [];
      const bearing = state.phase === "place" || state.phase === "transfer" || state.phase === "extend" || state.phase === "acquire";
      if (bearing) {
        const names = state.phase === "acquire" ? [...hands, rear, `shank.${state.lead}`] : state.phase === "place" ? [...hands, rear] : state.phase === "transfer" ? [moving, rear] : SIDES.map(s => `foot.${s}`);
        const toe = `foot.${free}`, keepToe = (state.phase === "place" || state.phase === "transfer") && loaded(o, toe);
        const retained = [...(state.phase === "place" && !state.released ? [...names, `shank.${state.lead}`, moving]
          : state.phase === "transfer" && !state.released ? [...names, ...hands] : names), ...(keepToe ? [toe] : [])];
        if (keepToe) supports.push({ frame: { kind: "segment", name: toe }, mode: "auto", normalLoad: { pointMin: 1 } });
        for (const segment of model.segments) if (!retained.includes(segment.name)) {
          supports.push({ frame: { kind: "segment", name: segment.name }, mode: "free" });
        }
        const patches = contacts(o, names), centre: [number, number, number] = [o.centre[0], 0, o.centre[2]];
        if (patches.length) {
          centre[0] = patches.reduce((sum, c) => sum + c.point[0], 0) / patches.length;
          centre[2] = patches.reduce((sum, c) => sum + c.point[2], 0) / patches.length;
        }
        if (state.phase !== "acquire") centres.push({ id: "centre", frames: model.segments.map(s => ({ kind: "segment", name: s.name })),
          translation: { target: centre, velocity: ZERO, acceleration: ZERO, seconds: T.response, weight: T.centreWeight, axes: ["x", "z"] } });
        const yaw = turnAboutToRef(Vector3.UpReadOnly, state.yaw, new Quaternion());
        const pitch = turnAboutToRef(way.set(1, 0, 0), state.phase === "place" || state.phase === "acquire" ? T.pronePitch : T.kneelPitch, new Quaternion());
        yaw.multiplyInPlace(pitch).multiplyInPlace(new Quaternion(...model.rest));
        frames.push({ id: "root", frame: { kind: "segment", name: "lowerTrunk" }, at: ZERO,
          orientation: { target: [yaw.x, yaw.y, yaw.z, yaw.w], velocity: ZERO, acceleration: ZERO, seconds: T.rootResponse, weight: T.rootOrientationWeight } });
        if (state.phase === "acquire" || state.phase === "place") frames[0] = { ...frames[0]!, translation: { target: [0, state.ground + model.leg * T.kneeHeight, 0],
          velocity: ZERO, acceleration: ZERO, seconds: T.rootResponse, weight: T.supportedRootWeight, axes: ["y"] } };
        if (state.phase === "transfer") {
          const m = minimumJerk(state.time, T.extension), dy = state.ground + model.leg * T.transferHeight - state.rootFrom;
          frames[0] = { ...frames[0]!, translation: { target: [0, state.rootFrom + dy * m.s, 0], velocity: [0, dy * m.v, 0],
            acceleration: [0, dy * m.a, 0], seconds: T.rootResponse, weight: T.supportedRootWeight, axes: ["y"] } };
        }
        if (state.phase === "extend") {
          const m = minimumJerk(state.time, T.extension), dy = state.ground + model.rootHeight - state.rootFrom;
          frames[0] = { ...frames[0]!, translation: { target: [0, state.rootFrom + dy * m.s, 0], velocity: [0, dy * m.v, 0],
            acceleration: [0, dy * m.a, 0], seconds: T.response, weight: T.rootWeight, axes: ["y"] } };
        }
        if (state.phase === "place" && state.released) {
          const m = minimumJerk(state.time, T.move), delta = state.pointTo.map((v, k) => v - state.pointFrom[k]!);
          const lift = model.leg * T.footLift, target = m.s === 1 ? [...state.pointTo] : state.pointFrom.map((v, k) => v + delta[k]! * m.s),
            velocity = delta.map(v => v * m.v), acceleration = delta.map(v => v * m.a);
          target[1]! += 4 * lift * m.s * (1 - m.s);
          velocity[1]! += 4 * lift * (1 - 2 * m.s) * m.v;
          acceleration[1]! += 4 * lift * ((1 - 2 * m.s) * m.a - 2 * m.v * m.v);
          turnStart.set(...state.turnFrom); turnEnd.set(...state.turnTo);
          turnBetweenToRef(turnStart, turnEnd, m.s, pointTurn);
          spinBetweenToRef(turnStart, turnEnd, 1, footSpin);
          frames.push({ id: "foot", frame: { kind: "segment", name: moving }, at: model.soles[state.lead].at,
            translation: { target: target as unknown as Vec3, velocity: velocity as unknown as Vec3,
              acceleration: acceleration as unknown as Vec3, seconds: T.response, weight: T.pointWeight },
            orientation: { target: [pointTurn.x, pointTurn.y, pointTurn.z, pointTurn.w],
              velocity: [footSpin.x * m.v, footSpin.y * m.v, footSpin.z * m.v],
              acceleration: [footSpin.x * m.a, footSpin.y * m.a, footSpin.z * m.a], seconds: T.response, weight: T.pointWeight } });
        }
      }
      return { joints, frames, centres, supports, grips: [] };
    } };
}

/** A hosted recovery controller over measured contacts and the existing muscle envelope. */
export function dynamicRise(own: OwnBody, view: BodyView, world: World): SubMind {
  if (!dynamicRiseFits(own.spec)) throw new Error(`${own.spec.model} cannot take dynamic rise`);
  const { built, muscles } = own, root = built.segments.get("lowerTrunk")!;
  const leg = own.spec.segments.filter(s => /^(thigh|shank)\.left$/.test(s.name)).reduce((sum, s) => sum + length(s.proximal.value, s.distal.value), 0);
  const witness = poses.find(p => p.model === own.spec.model && p.id === "fours");
  const fours = witness ? Object.fromEntries(muscles.channels.map(c => [c.name,
    (witness.placement.joints as Record<string, number[]>)[c.joint.spec.name]![c.index]! + c.dof.spec.bind.value]))
    : RISE.rise.find(s => s.name === "fours")!.posture as Readonly<Record<string, number>>;
  const soleUp = (side: Side): Vec3 => {
    const up = Vector3.UpReadOnly.applyRotationQuaternionToRef(
      Quaternion.Inverse(built.segments.get(`foot.${side}`)!.rest), new Vector3());
    return [up.x, up.y, up.z];
  };
  const feet = footStatesOf(built);
  const sole = (side: Side): Model["soles"][Side] => {
    const foot = feet.find(f => f.segment.spec.name === `foot.${side}`)!, middle = new Vector3();
    for (const corner of foot.sole) middle.addInPlace(corner);
    middle.scaleInPlace(1 / foot.sole.length);
    const rest = foot.segment.rest;
    return { at: [middle.x, middle.y, middle.z], rest: [rest.x, rest.y, rest.z, rest.w] };
  };
  const model: Model = { channels: muscles.channels.map(c => ({ name: c.name, min: c.dof.spec.min.value, max: c.dof.spec.max.value, bind: c.dof.spec.bind.value })), fours,
    segments: [...built.segments.values()].map(s => ({ name: s.spec.name, mass: s.rigid.mass, localCentre: [...s.body.massProperties.centre] as Vec3 })), rest: [root.rest.x, root.rest.y, root.rest.z, root.rest.w],
    soleUp: { left: soleUp("left"), right: soleUp("right") },
    soles: { left: sole("left"), right: sole("right") },
    rootHeight: root.frame.origin[1], leg, gravity: Math.sqrt(world.physics.gravity.reduce((n, v) => n + v * v, 0)),
    held: SIDES.find(side => own.spec.held?.some(h => h.segment === `hand.${side}`)) ?? null };
  const policy = dynamicRisePolicy(model), tracking = wholeBodyTracking(built, muscles, world.physics.gravity, [], [],
    { capacity: HAND_TRANSFER.capacity, effortCost: 1e-6, contact: { physics: world.physics, settings: T.contact, dt: world.dt },
      jointStops: { settings: HAND_TRANSFER.jointStops, dt: world.dt } });
  const extensionModel = { ...model, feet: Object.fromEntries(feet.map(f => [f.side, {
    rest: model.soles[f.side].rest, up: model.soleUp[f.side],
    edge: f.ahead.slice(0, 2).map(i => { const p = f.sole[i]!; return [p.x, p.y, p.z] as Vec3; }) as unknown as readonly [Vec3, Vec3],
  }])) as Readonly<Record<Side, { rest: readonly [number, number, number, number]; up: Vec3; edge: readonly [Vec3, Vec3] }>> };
  const extension = supportedExtension(extensionModel);
  const observe = observeBody(built, muscles, world, () => view.senses, undefined, () => view.down, true);
  const middle = new Vector3(), zero = new Vector3(), legs = locomotion(null);
  const motor = motorControl(built, SERVO_SECONDS, guardPosture(own.spec), undefined, own.assist);
  const requestedRates = new Float64Array(muscles.channels.length);
  const extensionWork = { up: new Vector3(), turn: new Quaternion(), inverse: new Quaternion() };
  const state = { policy: policy.state, tracking: tracking.state, legs: legs.state, motor: motor.state, stabilizing: false, rejected: 0,
    extending: false, extendingNative: false, extension: extension.state, riseFrom: 0, riseYaw: 0 };
  return { get name() { return `dynamic-rise: ${policy.state.phase}`; }, state,
    wants() {
      if (legs.reference === null) legs.goal(view, null, 0, world.dt);
      return policy.state.phase !== "complete" || view.down;
    },
    begin() { policy.begin(observe()); state.stabilizing = false; state.rejected = 0; state.extending = false; state.extendingNative = false; extension.reset(); motor.reset(); },
    end() { policy.end(); state.extending = false; state.extendingNative = false; extension.reset(); motor.reset(); },
    step(_senses, dt) {
      const p = policy.state, observation = observe();
      if (!state.extending && p.phase === "transfer" && p.handTransfer.stage === "inactive"
        && riseCanExtend(observation, p.lead, model, p.ground, extensionWork)) {
        state.extending = true; p.phase = "extend"; p.time = 0; p.ready = 0;
        const rear = other(p.lead);
        state.extendingNative = !extensionNeedsPeel(observation, rear, model.soleUp[rear], extensionWork);
        if (!state.extendingNative) extension.begin(observation, p.lead, view.standing - T.standLower);
        motor.stance.read(); state.riseFrom = motor.stance.reading.centre.y - motor.stance.reading.support.y;
        const across = extensionWork.up.set(1, 0, 0).applyRotationQuaternionToRef(view.root.rotation, extensionWork.up);
        state.riseYaw = atan2(-across.z, across.x); motor.stance.reset();
      }
      if (state.extending) {
        if (!state.extendingNative) {
          const nearby = extension.state.anchors.filter(a => a.frame.kind === "segment" && world.physics
            .contactManifoldsOf(built.segments.get(a.frame.name)!.body, other => other === null)
            .some(m => m.points.some(point => point.distance <= T.contact.gap))).map(a => a.id);
          const command = extension.step(observation, dt, nearby), torque = tracking.track(command);
          if (trackingRejected(tracking.state)) { torque.fill(0); state.rejected++; }
          applyAction(muscles, { kind: "torque", torque: Array.from(torque) });
          own.assist.ask(zero, zero);
          p.elapsed += dt; p.time += dt;
          if (extension.state.phase === "ready" && extensionCanStand(observation, extensionModel, dt)) {
            state.extendingNative = true; p.time = 0; p.ready = 0; motor.reset(); motor.stance.read();
          } else if (p.time >= T.attempt) { p.retries++; p.attempts++; policy.reclassify(observation); state.extending = false; extension.reset(); }
          return;
        }
        readSupport(feet, feet, middle);
        const supports = feet.map(f => ({ segment: f.segment.spec.name, corners: f.corners.filter(c => c.y - Math.min(...f.corners.map(q => q.y)) < .03)
          .map(c => [c.x, c.y, c.z] as Vec3) }));
        p.ready = recoveryReady(observation, supports, T) && SIDES.every(s => riseFootPlanted(observation, s, model.soleUp[s])) ? p.ready + dt : 0;
        p.elapsed += dt; p.time += dt;
        const u = Math.min(1, p.time / T.standSeconds), targetHeight = view.standing - T.standLower,
          height = extension.state.phase === "inactive" ? state.riseFrom + (targetHeight - state.riseFrom) * u * u * (3 - 2 * u) : targetHeight;
        motor.stance.read(); motor.setStance({ feet: SIDES, centre: null, height, heading: state.riseYaw, walk: null }); motor.control(muscles, dt);
        if (p.time >= T.standSeconds && p.ready >= T.hold) { p.completed++; p.finished = world.time; p.phase = "complete"; state.extending = false; }
        else if (p.time >= T.attempt) { p.retries++; p.attempts++; policy.reclassify(observation); state.extending = false; }
        return;
      }
      if (p.phase === "stabilize") {
        if (!state.stabilizing) { motor.stance.read(); legs.resume({ ...view, stance: motor.stance.reading }); state.stabilizing = true; }
        readSupport(feet, feet, middle);
        const supports = feet.map(f => ({ segment: f.segment.spec.name, corners: f.corners.filter(c => c.y - Math.min(...f.corners.map(q => q.y)) < .03).map(c => [c.x, c.y, c.z] as Vec3) }));
        p.ready = recoveryReady(observation, supports, T) ? p.ready + dt : 0;
        p.elapsed += dt; p.time += dt;
        motor.stance.read(); motor.setStance(legs.goal({ ...view, stance: motor.stance.reading }, null, legs.heading, dt)); motor.control(muscles, dt);
        if (p.ready >= T.hold) { p.completed++; p.finished = world.time; p.phase = "complete"; }
        else if (view.down || p.time >= T.attempt) { p.retries++; p.attempts++; policy.reclassify(observation); state.stabilizing = false; }
        return;
      }
      for (const side of SIDES) if (side !== model.held) built.handPoses.request([{ hand: side, pose: "open" }]);
      const command = policy.step(observation, dt);
      if (!p.landed) { muscles.activation.fill(0); muscles.velocity.fill(0); own.assist.ask(zero, zero); return; }
      if (p.phase === "orient" || p.phase === "acquire") {
        for (let i = 0; i < muscles.channels.length; i++) {
          const goal = command.joints[i]!;
          requestedRates[i] = Math.max(-T.poseSpeed, Math.min(T.poseSpeed, (goal.angle - muscles.angle(i)) / T.poseResponse));
        }
        for (let i = 0; i < muscles.channels.length; i++) {
          const channel = muscles.channels[i]!, first = i - channel.index;
          let speed = 0;
          for (let k = 0; k < channel.joint.dofs.length; k++) speed += muscles.turning(i, k) * requestedRates[first + k]!;
          muscles.activation[i] = 1;
          muscles.velocity[i] = speed;
        }
        own.assist.ask(zero, zero);
        return;
      }
      tracking.check(command);
      const torque = tracking.track(command, p.phase === "place" ? T.supportBand : undefined);
      if (trackingRejected(tracking.state)) { torque.fill(0); state.rejected++; }
      own.assist.ask(zero, zero);
      applyAction(muscles, { kind: "torque", torque: Array.from(torque) });
    } };
}
