import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { buildBody } from "../build/build-body.ts";
import { pointStrike } from "../control/point-strike.ts";
import type { PhysicsEngine, SegmentBody } from "../engine/engine.ts";
import { equipHands } from "../human/equipment.ts";
import { modelSpec, type HumanoidModel } from "../models.ts";
import { woodenClub } from "../items/club.ts";
import { createMotionBody } from "../mind/motion.ts";
import { createObjectSenses } from "../mind/object-senses.ts";
import { clockSenses } from "../mind/senses.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import { createWorld } from "../world.ts";
import { trackingRejected } from "../control/whole-body.ts";
import { jointStopProbeSettings } from "./stop-settings.ts";
import { createSwingTarget } from "./swing-target.ts";
import type { Side } from "../spec/body.ts";

/** Static point-strike experiment inputs, numeric settings (`docs/reference/point-strike.md`). */
const SETTINGS = deepFreeze({
  lateral: 0.25, height: 0.15, clubHeight: 0.75, guard: 0.25, target: 0.65, obstacle: 0.7, missOffset: 0.7,
  obstacleSize: [0.2, 0.2, 0.08] as Vec3, floor: { centre: [0, -0.5, 0] as Vec3, size: [20, 1, 20] as Vec3 },
  seconds: 0.15, weight: 1, tolerance: 0.02, readySeconds: 0.25, strikeSeconds: 0.5, followSeconds: 0.5, returnSeconds: 0.5,
  postureSeconds: 0.2, armWeight: 0.03, bodyWeight: 0.3, effortCost: 1e-6, continueSeconds: 1, closing: 0.05,
  capture: { distance: 0.002, rotationError: 0.00001 },
  contact: { maxPoints: 64, gap: 0.005, minUpNormal: 0.9, forceTolerance: 1e-5,
    iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6 },
});
/** Moving-target fixture inputs, numeric settings (`docs/reference/moving-strike.md`). */
const SWING = deepFreeze({ mass: 2, length: 1, limit: 0.3, anchorRadius: 0.02, anchorMass: 1, anchorMoment: 0.001,
  aim: [0, 0, -0.05] as Vec3, impact: { impulse: 0.005, seconds: 0.15 } });
/** Centre-control experiment inputs, numeric settings (`docs/reference/centre-control.md`). */
const CENTRE = deepFreeze({ lower: 0.04, positionWeight: 10, centreWeight: 10, followSeconds: 0.75 });
/** Shared grip preparation and guard geometry, numeric settings (`docs/reference/shared-strike.md`). */
const SHARED = deepFreeze({ capture: { distance: 0.03, rotationError: 0.02 }, secondary: [0, 0.12, 0] as Vec3,
  pose: [0, 0.1, 0.4] as Vec3, guard: 0.4, rotationWeight: 0.2, gripTolerance: 0.001 });
const ZERO: Vec3 = Object.freeze([0, 0, 0]);
const tuple = (v: Vector3): Vec3 => [v.x, v.y, v.z];

/** Shared physical fixture for a reference point-space strike, including a deliberately missed target. */
export function createPointStrikeProbe(scene: Scene, engine: PhysicsEngine, config: {
  readonly model: HumanoidModel; readonly hands: Side | "both"; readonly held: "empty" | "club";
  readonly hz: number; readonly actuation: "symmetric" | "directional"; readonly offset: number; readonly miss: boolean;
  readonly centreControl?: boolean; readonly continueSeconds?: number;
  readonly shared?: { readonly release?: Side };
  readonly swing?: { readonly angle: number; readonly speed: number; readonly delay: number; readonly tracking: boolean; readonly braking: boolean };
  readonly jointStops?: boolean;
}) {
  const stopSettings = jointStopProbeSettings(config.jointStops);
  if (!Number.isSafeInteger(config.hz) || config.hz < 120 || config.hz % 120 !== 0 || !Number.isFinite(config.offset)
    || !["left", "right", "both"].includes(config.hands) || !["empty", "club"].includes(config.held)) throw new Error("invalid point strike fixture");
  if (config.shared && (config.hands !== "both" || config.held !== "club"
    || (config.shared.release !== undefined && config.shared.release !== "left" && config.shared.release !== "right"))) throw new Error("shared strike requires both hands and one club");
  const swing = config.swing ? deepFreeze({ ...config.swing }) : null;
  const continueSeconds = config.continueSeconds ?? SETTINGS.continueSeconds;
  if (!(Number.isFinite(continueSeconds) && continueSeconds > 0)
    || (config.centreControl !== undefined && typeof config.centreControl !== "boolean")) throw new Error("invalid strike continuation or centre control");
  if (swing && (!Number.isSafeInteger(swing.delay) || swing.delay < 0 || !Number.isFinite(swing.angle) || Math.abs(swing.angle) > SWING.limit
    || !Number.isFinite(swing.speed) || typeof swing.tracking !== "boolean" || typeof swing.braking !== "boolean")) throw new Error("invalid moving strike configuration");
  const impact = swing?.braking || (!swing && config.centreControl) ? SWING.impact : null;
  const configuration = deepFreeze({ ...config, ...(stopSettings ? { stopPrediction: stopSettings } : {}), ...(swing ? { swing } : {}), task: "point-strike", protocol: 4,
    settings: { ...SETTINGS, continueSeconds, ...(config.centreControl ? { followSeconds: CENTRE.followSeconds } : {}) },
    ...(config.centreControl ? { centreSettings: CENTRE } : {}),
    ...(config.shared ? { shared: { ...config.shared }, sharedSettings: SHARED } : {}),
    ...(config.shared?.release ? { releaseReturn: "reference-hand-position" } : {}),
    ...(impact ? { impactResponse: impact } : {}),
    ...(swing ? { targetRig: SWING } : {}),
    engineRevision: engine.revision, gravity: true, pin: null, assists: { root: 0, weapon: false } });
  const world = createWorld(scene, engine, { gravity: true, hz: config.hz, actuation: config.actuation });
  world.physics.addFixedBox(SETTINGS.floor.centre, SETTINGS.floor.size);
  const built = buildBody(modelSpec(config.model), world, { position: ZERO }), root = built.segments.get("lowerTrunk")!;
  const rootPosition = tuple(root.node.position), q = root.node.rotationQuaternion!, rootRotation = [q.x, q.y, q.z, q.w] as const;
  const centreGoal = tuple(["left", "right"].map((side) => {
    const body = built.segments.get(`foot.${side}`)!.body;
    const point = new Vector3(...body.massProperties.centre);
    return point.applyRotationQuaternionToRef(body.node.rotationQuaternion!, point).addInPlace(body.node.position);
  }).reduce((a, b) => a.add(b)).scale(0.5));
  const sides: readonly Side[] = config.shared ? ["right"] : config.hands === "both" ? ["left", "right"] : [config.hands];
  const spec = woodenClub();
  const items = config.held === "empty" ? [] : sides.map((side) => equipHands(world, built, { id: side, item: spec,
    primary: side, grips: [{ side, at: ZERO }, ...(config.shared ? [{ side: "left" as const, at: SHARED.secondary }] : [])],
    capture: config.shared ? SHARED.capture : SETTINGS.capture, ccd: true }));
  const effectors = sides.map((side) => {
    const item = items.find((i) => i.id === side), body = item?.body ?? built.segments.get(`hand.${side}`)!.body;
    const x = (config.shared ? 0 : side === "left" ? -SETTINGS.lateral : SETTINGS.lateral) + config.offset;
    const y = rootPosition[1] + (config.held === "club" ? SETTINGS.clubHeight : SETTINGS.height);
    const geometry = { centre: [x + (config.miss && !swing ? SETTINGS.missOffset : 0), y,
      SETTINGS.obstacle + (config.miss && swing ? SETTINGS.missOffset : 0)] as Vec3, size: SETTINGS.obstacleSize };
    const rig = swing ? createSwingTarget(world, { ...SWING, ...swing, id: `target.${side}`, ...geometry }) : null;
    return { side, body, rig, obstacle: rig ? null : world.physics.addFixedBox(geometry.centre, geometry.size), geometry,
      frame: item ? { kind: "item" as const, id: item.id } : { kind: "segment" as const, name: `hand.${side}` },
      at: item ? spec.points[spec.aim!]!.value : ZERO, guard: [x, y, config.shared ? SHARED.guard : SETTINGS.guard] as Vec3, target: [x, y, SETTINGS.target] as Vec3 };
  });
  const observer = swing ? createObjectSenses(world, effectors.map((e) => ({ id: e.rig!.body.node.name,
    owner: null, body: e.rig!.body, points: { strike: SWING.aim } })), swing.delay) : null;
  const clock = clockSenses(world);
  const state = { fell: false, completeAt: -1, steps: 0, rejectedSteps: 0,
    ...(config.shared ? { shared: { captured: -1, releasedAt: -1, sharedHits: 0, peakGripGap: 0,
      releaseContinuous: null as boolean | null, pendingRelease: null as readonly number[] | null,
      guardPosture: null as readonly number[] | null } } : {}),
    strikes: effectors.map((e) => ({ side: e.side, contacts: 0, peakImpulse: 0, closing: 0, firstHit: -1, returnError: 0,
      targetTravel: 0, targetSpeed: 0, firstTargetContact: -1 })),
    before: effectors.map(() => ({ centre: ZERO, velocity: ZERO, spin: ZERO })),
    targetBefore: effectors.map(() => ({ centre: ZERO, velocity: ZERO, spin: ZERO })) };
  const feedback = (target: Vec3) => ({ target, velocity: ZERO, acceleration: ZERO, seconds: SETTINGS.seconds, weight: SETTINGS.weight });
  const releasedFrame = configuration.shared?.release ? { kind: "segment" as const, name: `hand.${configuration.shared.release}` } : null;
  const releasedGuard = releasedFrame ? tuple(built.segments.get(releasedFrame.name)!.node.position) : null;
  let policy!: ReturnType<typeof pointStrike>;
  const body = createMotionBody(built, world, (model) => {
    const joints = model.channels.map((c) => ({ channel: c.name, angle: Math.max(c.min, Math.min(c.max, 0)), rate: 0, acceleration: 0,
      seconds: SETTINGS.postureSeconds, weight: /shoulder|elbow|wrist/.test(c.name) ? SETTINGS.armWeight : SETTINGS.bodyWeight }));
    const returnJoints = joints.map((goal, i) => /shoulder|elbow|wrist/.test(goal.channel)
      ? { ...goal, angle: (model.channels[i]!.min + model.channels[i]!.max) / 2 } : goal);
    policy = pointStrike({ ...configuration.settings, ...(impact ? { impact } : {}),
      effectors: effectors.map((e) => ({ id: e.side, frame: e.frame, at: e.at, guard: e.guard, target: e.target,
        ...(swing?.tracking && !config.miss ? { targetObject: { id: e.rig!.body.node.name, point: "strike" } } : {}) })),
      joints,
      hold: [{ id: "root", frame: { kind: "segment", name: "lowerTrunk" }, at: ZERO, translation: feedback(rootPosition),
        orientation: { ...feedback(ZERO), target: rootRotation } }],
    }, model.equipment);
    const approach = config.shared ? (() => {
      const grip = model.equipment[0]!.grips.find((g) => g.name === "left")!;
      const turn = new Quaternion(0, -Math.sqrt(0.5), 0, Math.sqrt(0.5)), inverse = new Quaternion();
      const base = new Vector3(config.offset, rootPosition[1] + SHARED.pose[1], SHARED.pose[2]);
      Quaternion.InverseToRef(new Quaternion(...grip.bodyFrame.rotation), inverse);
      const handTurn = new Quaternion(...grip.itemFrame.rotation);
      turn.multiplyToRef(handTurn, handTurn); handTurn.multiplyToRef(inverse, handTurn);
      const handAt = new Vector3(...grip.itemFrame.position), offset = new Vector3(...grip.bodyFrame.position);
      handAt.applyRotationQuaternionToRef(turn, handAt).addInPlace(base);
      offset.applyRotationQuaternionToRef(handTurn, offset); handAt.subtractInPlace(offset);
      const rotation = (q: Quaternion) => [q.x, q.y, q.z, q.w] as const;
      return [{ id: "item-capture", frame: { kind: "item" as const, id: items[0]!.id }, at: ZERO,
        translation: feedback(tuple(base)), orientation: { ...feedback(ZERO), target: rotation(turn), weight: SHARED.rotationWeight } },
      { id: "hand-capture", frame: { kind: "segment" as const, name: "hand.left" }, at: ZERO,
        translation: feedback(tuple(handAt)), orientation: { ...feedback(ZERO), target: rotation(handTurn), weight: SHARED.rotationWeight } }];
    })() : null;
    if (!configuration.centreControl && !approach) return policy;
    return { ...policy, step(observation, dt) {
      if (approach && state.shared!.captured < 0) {
        if (observation.equipment![0]!.grips.every((g) => g.attached)) state.shared!.captured = state.steps;
        else return { joints, grips: [{ item: items[0]!.id, grip: "left", attached: true }], frames: [
          { id: "root", frame: { kind: "segment", name: "lowerTrunk" }, at: ZERO, translation: feedback(rootPosition),
            orientation: { ...feedback(ZERO), target: rootRotation } }, ...approach] };
      }
      let command = policy.step(observation, dt);
      if (state.shared && !state.shared.guardPosture && policy.state.phase === "strike") state.shared.guardPosture = observation.joints
        .map((j, i) => Math.max(model.channels[i]!.min, Math.min(model.channels[i]!.max, j.angle)));
      if (configuration.shared?.release && state.shared!.releasedAt < 0 && policy.state.phase === "return") {
        const reading = observation.equipment![0]!;
        state.shared!.pendingRelease = [...reading.position, ...reading.rotation, ...reading.velocity, ...reading.spin];
        state.shared!.releasedAt = state.steps;
        command = { ...command, grips: [{ item: items[0]!.id, grip: configuration.shared.release, attached: false }] };
      }
      const returning = policy.state.phase === "return" || policy.state.phase === "complete";
      // The released hand withdraws to its reference location instead of pressing the item it left.
      if (releasedFrame && releasedGuard && returning) command = { ...command, frames: [...command.frames,
        { id: "released-hand", frame: releasedFrame, at: ZERO, translation: feedback(releasedGuard) }] };
      if (!configuration.centreControl) return command;
      const measuredReturn = state.shared?.guardPosture;
      return { ...command, joints: returning
        ? measuredReturn ? joints.map((goal, i) => /shoulder|elbow|wrist/.test(goal.channel)
          && !(configuration.shared?.release && goal.channel.includes(`.${configuration.shared.release} `)) ? { ...goal, angle: measuredReturn[i]! } : goal) : returnJoints
        : command.joints,
        frames: command.frames.map((goal) => goal.id !== "root" ? goal : { ...goal,
        translation: { ...feedback([rootPosition[0], rootPosition[1] - CENTRE.lower, rootPosition[2]]), axes: ["y"] as const, weight: CENTRE.positionWeight } }),
        centres: [{ id: "centre", frames: model.frames, translation: { ...feedback(centreGoal), axes: ["x", "z"] as const, weight: CENTRE.centreWeight } }] };
    } };
  }, { ...(observer ? { senses: () => ({ ...clock(), objects: observer.read() }) } : {}),
    items, grants: items.flatMap((item) => (config.shared ? ["left", "right"] : [item.id]).map((grip) => ({ item, grip }))),
    fixed: [], capacity: (config.shared ? 3 : 1 + effectors.length) + (configuration.centreControl ? 1 : 0),
    effortCost: SETTINGS.effortCost, ...(stopSettings ? { jointStops: stopSettings } : {}), contact: SETTINGS.contact });
  const point = new Vector3(), v = new Vector3(), spin = new Vector3();
  const motion = (part: SegmentBody) => {
    point.set(...part.massProperties.centre).applyRotationQuaternionToRef(part.node.rotationQuaternion!, point).addInPlace(part.node.position);
    return { centre: tuple(point), velocity: tuple(part.linearVelocityToRef(v)), spin: tuple(part.angularVelocityToRef(spin)) };
  };
  const before = world.beforeStep(() => {
    if (state.shared?.pendingRelease) {
      const reading = items[0]!.observe(), now = [...reading.position, ...reading.rotation, ...reading.velocity, ...reading.spin];
      state.shared.releaseContinuous = now.every((v, i) => v === state.shared!.pendingRelease![i]);
      state.shared.pendingRelease = null;
    }
    effectors.forEach((e, i) => {
      state.before[i] = motion(e.body);
      if (e.rig) state.targetBefore[i] = motion(e.rig.body);
    });
  });
  const after = world.afterStep(() => {
    state.steps++; state.fell ||= body.observe().down;
    if (state.shared) for (const grip of items[0]!.observe().grips) if (grip.attachment) {
      const hand = built.segments.get(`hand.${grip.name}`)!;
      point.set(...grip.attachment.bodyFrame.position).applyRotationQuaternionToRef(hand.node.rotationQuaternion!, point).addInPlace(hand.node.position);
      v.set(...grip.attachment.itemFrame.position).applyRotationQuaternionToRef(items[0]!.node.rotationQuaternion!, v).addInPlace(items[0]!.node.position);
      state.shared.peakGripGap = Math.max(state.shared.peakGripGap, Vector3.Distance(point, v));
    }
    if (trackingRejected(body.report())) state.rejectedSteps++;
    if (policy.state.phase === "complete" && state.completeAt < 0) state.completeAt = state.steps;
    effectors.forEach((e, i) => {
      const row = state.strikes[i]!, prior = state.before[i]!;
      point.set(...e.at).applyRotationQuaternionToRef(e.body.node.rotationQuaternion!, point).addInPlace(e.body.node.position);
      row.returnError = Math.sqrt(e.guard.reduce((sum, x, k) => sum + (x - [point.x, point.y, point.z][k]!) * (x - [point.x, point.y, point.z][k]!), 0));
      if (e.rig) {
        if (row.firstTargetContact < 0 && world.physics.contactsOf(e.rig.body).some((c) => c.impulse > 0)) row.firstTargetContact = state.steps;
        if (row.firstTargetContact < 0) {
          const priorTarget = state.targetBefore[i]!;
          row.targetTravel = Math.max(row.targetTravel, Math.abs(priorTarget.centre[0] - e.geometry.centre[0]));
          row.targetSpeed = Math.max(row.targetSpeed, Math.sqrt(priorTarget.velocity.reduce((sum, x) => sum + x * x, 0)));
        }
      }
      if (policy.state.phase !== "strike" && policy.state.phase !== "follow") return;
      for (const contact of world.physics.contactsOf(e.body)) if ((e.rig ? contact.other === e.rig.body : contact.fixed === e.obstacle!.id) && contact.impulse > 0) {
        point.set(contact.point[0] - prior.centre[0], contact.point[1] - prior.centre[1], contact.point[2] - prior.centre[2]);
        spin.set(...prior.spin); Vector3.CrossToRef(spin, point, v); v.addInPlaceFromFloats(...prior.velocity);
        if (e.rig) {
          const other = state.targetBefore[i]!;
          point.set(contact.point[0] - other.centre[0], contact.point[1] - other.centre[1], contact.point[2] - other.centre[2]);
          spin.set(...other.spin); Vector3.CrossToRef(spin, point, point); point.addInPlaceFromFloats(...other.velocity); v.subtractInPlace(point);
        }
        const closing = v.x * contact.normal[0] + v.y * contact.normal[1] + v.z * contact.normal[2];
        if (closing <= SETTINGS.closing) continue;
        if (state.shared && items[0]!.observe().grips.every((g) => g.attached)) state.shared.sharedHits++;
        row.contacts++; row.peakImpulse = Math.max(row.peakImpulse, contact.impulse); row.closing = Math.max(row.closing, closing);
        if (row.firstHit < 0) row.firstHit = state.steps;
      }
    });
  });
  return { world, built, body, items, targets: effectors.flatMap((e) => e.rig ? [e.rig] : []), configuration,
    geometry: { floor: SETTINGS.floor, obstacles: effectors.flatMap((e) => e.rig ? [] : [e.geometry]) },
    state: { body: body.state, task: state, ...(observer ? { objects: observer.state } : {}) },
    get complete() { return state.completeAt >= 0 && state.steps - state.completeAt >= configuration.settings.continueSeconds * configuration.hz; },
    observe: () => deepFreeze({ body: body.observe(), task: { ...structuredClone(state), phase: policy.state.phase } }),
    dispose() { before.dispose(); after.dispose(); observer?.dispose(); body.dispose(); for (const item of items) item.dispose();
      for (const e of effectors) e.rig?.dispose(); built.dispose(); world.dispose(); } };
}
