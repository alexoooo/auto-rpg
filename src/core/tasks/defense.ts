import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { buildBody, type BuiltSegment } from "../build/build-body.ts";
import { intercept } from "../control/intercept.ts";
import { pointMotion } from "../control/point-motion.ts";
import { createEquipment } from "../equipment.ts";
import type { PhysicsEngine, SegmentBody } from "../engine/engine.ts";
import { equipHands } from "../human/equipment.ts";
import { modelSpec, type HumanoidModel } from "../models.ts";
import { woodenClub } from "../items/club.ts";
import { HELD, type Held } from "../items/held.ts";
import { sin, cos } from "../math/real.ts";
import { createMotionBody } from "../mind/motion.ts";
import { createObjectSenses } from "../mind/object-senses.ts";
import { clockSenses } from "../mind/senses.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import { createWorld } from "../world.ts";
import { trackingRejected } from "../control/whole-body.ts";
import { jointStopProbeSettings } from "./stop-settings.ts";
import type { Side } from "../spec/body.ts";

/** Declared mechanical task and controller inputs (`docs/reference/point-defense.md#physical-fixture-and-declared-inputs`). */
const SETTINGS = deepFreeze({
  releaseSeconds: 3, watchSeconds: 10, delaySeconds: 0.025, angle: 0.8, bothLateral: 0.08,
  guardLateral: 0.25, guardHeight: 0.05, planeForward: 0.25, lower: 0.04,
  anchorRadius: 0.01, anchorMass: 1, anchorMoment: 0.001, limits: [-0.1, 1.6] as const,
  readyTolerance: 0.03, readySpeed: 0.1, readySeconds: 0.25, closing: 0.05,
  rootSeconds: 0.15, rootPositionWeight: 10, rootRotationWeight: 1, centreWeight: 10,
  seconds: 0.08, weight: 1, horizon: 0.5, contactImpulse: 0.005, braceWeight: 0.2,
  returnSeconds: 0.5, retreatDistance: 0.1, marginFraction: 0.1, marginWeight: 1, travelSpeed: 3,
  postureSeconds: 0.2, armWeight: 0.03, bodyWeight: 0.3, effortCost: 1e-6,
  capture: { distance: 0.002, rotationError: 0.00001 },
  floor: { centre: [0, -0.5, 0] as Vec3, size: [20, 1, 20] as Vec3 },
  contact: { maxPoints: 64, gap: 0.005, minUpNormal: 0.9, forceTolerance: 1e-5,
    iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6 },
});
const ZERO: Vec3 = Object.freeze([0, 0, 0]);
const tuple = (v: Vector3): Vec3 => [v.x, v.y, v.z];
const distance = (a: Vec3, b: Vec3) => Math.sqrt(a.reduce((sum, v, k) => sum + (v - b[k]!) * (v - b[k]!), 0));
const local = (part: BuiltSegment, point: Vec3): Vec3 => {
  const d = point.map((v, k) => v - part.frame.origin[k]!) as unknown as Vec3;
  return [part.frame.x, part.frame.y, part.frame.z].map((axis) => axis.reduce((sum, v, k) => sum + v * d[k]!, 0)) as unknown as Vec3;
};

/** A gravity-driven club, held only for preparation and then free on one declared hinge. */
function incomingClub(world: ReturnType<typeof createWorld>, id: string, pivot: Vec3, angle: number) {
  const turn = Math.PI - angle, rotation = new Quaternion(sin(turn / 2), 0, 0, cos(turn / 2));
  const item = createEquipment(world, { id, item: woodenClub(), pose: { position: pivot,
    rotation: [rotation.x, rotation.y, rotation.z, rotation.w] }, grips: [], capture: { distance: 0, rotationError: 0 }, ccd: true });
  item.body.setFixed(true);
  const node = new TransformNode(`${id}.anchor`, world.scene); node.position.set(...pivot); node.rotationQuaternion = Quaternion.Identity();
  const anchor = world.physics.addBody(node, [{ kind: "sphere", centre: ZERO, radius: SETTINGS.anchorRadius }], {
    mass: SETTINGS.anchorMass, centre: ZERO, moments: [SETTINGS.anchorMoment, SETTINGS.anchorMoment, SETTINGS.anchorMoment], orientation: Quaternion.Identity(),
  });
  anchor.setFixed(true);
  world.physics.addJoint(anchor, item.body, { anchorParent: ZERO, anchorChild: ZERO, frameParent: rotation,
    frameChild: Quaternion.Identity(), limits: [SETTINGS.limits] });
  return { item, anchor, dispose() { item.dispose(); world.physics.removeBody(anchor); node.dispose(false, false); } };
}

/** Shared physical head-defense task. All body contacts are measured independently of the policy. */
export function createDefenseProbe(scene: Scene, engine: PhysicsEngine, config: {
  readonly model: HumanoidModel; readonly hands: Side | "both"; readonly held: Held;
  readonly hz: number; readonly actuation: "symmetric" | "directional"; readonly offset: number;
  readonly variant: "predict" | "pose"; readonly angleOffset?: number;
  readonly jointStops?: boolean;
}) {
  const stopSettings = jointStopProbeSettings(config.jointStops);
  if (!Number.isSafeInteger(config.hz) || config.hz < 120 || config.hz % 120 !== 0 || !Number.isFinite(config.offset)
    || !["left", "right", "both"].includes(config.hands) || !HELD.includes(config.held)
    || !["predict", "pose"].includes(config.variant) || !Number.isFinite(config.angleOffset ?? 0)
    || Math.abs(config.angleOffset ?? 0) > 0.1) throw new Error("invalid defense fixture");
  const configuration = deepFreeze({ ...config, ...(stopSettings ? { stopPrediction: stopSettings } : {}), task: "point-defense", protocol: 1, settings: SETTINGS,
    protected: ["head", "upperTrunk"], engineRevision: engine.revision, gravity: true, pin: null,
    assists: { root: 0, weapon: false }, prediction: "sampled point acceleration; necessary reach and travel-time filters" });
  const world = createWorld(scene, engine, { gravity: true, hz: config.hz, actuation: config.actuation });
  world.physics.addFixedBox(SETTINGS.floor.centre, SETTINGS.floor.size);
  const built = buildBody(modelSpec(config.model), world, { position: ZERO });
  const root = built.segments.get("lowerTrunk")!, head = built.segments.get("head")!;
  const rootPosition = tuple(root.node.position), q = root.node.rotationQuaternion!, rootRotation = [q.x, q.y, q.z, q.w] as const;
  const centreGoal = tuple(["left", "right"].map((side) => {
    const part = built.segments.get(`foot.${side}`)!.body, point = new Vector3(...part.massProperties.centre);
    return point.applyRotationQuaternionToRef(part.node.rotationQuaternion!, point).addInPlace(part.node.position);
  }).reduce((a, b) => a.add(b)).scale(0.5));
  const sides: readonly Side[] = config.hands === "both" ? ["left", "right"] : [config.hands], club = woodenClub();
  const items = config.held === "empty" ? [] : sides.map((side) => equipHands(world, built, { id: side, item: club,
    primary: side, grips: [{ side, at: ZERO }], capture: SETTINGS.capture, ccd: true }));
  const effectors = sides.map((side) => {
    const hand = built.segments.get(`hand.${side}`)!, item = items.find((e) => e.id === side);
    const shoulder = built.joints.get(`shoulder.${side}`)!, elbow = built.joints.get(`elbow.${side}`)!, wrist = built.joints.get(`wrist.${side}`)!;
    const at = item ? club.points[club.aim!]!.value : local(hand, hand.spec.points!.knuckles!.value);
    const grasp = item?.model.grips[0];
    const beyondWrist = grasp ? distance(local(hand, wrist.spec.centre.value), grasp.bodyFrame.position) + distance(at, grasp.itemFrame.position)
      : distance(local(hand, wrist.spec.centre.value), at);
    const reach = distance(shoulder.spec.centre.value, elbow.spec.centre.value) + distance(elbow.spec.centre.value, wrist.spec.centre.value) + beyondWrist;
    const x = config.offset + (config.hands === "both" ? (side === "left" ? -SETTINGS.bothLateral : SETTINGS.bothLateral) : 0);
    const rig = incomingClub(world, `incoming.${side}`, [x, head.node.position.y + club.points[club.aim!]!.value[1], 0], SETTINGS.angle + (config.angleOffset ?? 0));
    return { side, rig, body: item?.body ?? hand.body, frame: item ? { kind: "item" as const, id: item.id } : { kind: "segment" as const, name: hand.spec.name }, at,
      guard: [side === "left" ? -SETTINGS.guardLateral : SETTINGS.guardLateral, head.node.position.y + SETTINGS.guardHeight, SETTINGS.planeForward] as Vec3,
      reach: { frame: { kind: "segment" as const, name: shoulder.child.spec.name }, at: local(shoulder.child, shoulder.spec.centre.value), distance: reach } };
  });
  const sensing = createObjectSenses(world, effectors.map((e) => ({ id: e.rig.item.node.name, owner: "script",
    body: e.rig.item.body, points: { tip: club.points[club.aim!]!.value } })), SETTINGS.delaySeconds * config.hz), clock = clockSenses(world);
  let policy!: ReturnType<typeof intercept>;
  const feedback = (target: Vec3, seconds: number, weight: number) => ({ target, velocity: ZERO, acceleration: ZERO, seconds, weight });
  const body = createMotionBody(built, world, (model) => {
    policy = intercept({ ...SETTINGS, enabled: config.variant === "predict",
      effectors: effectors.map((e) => ({ id: e.side, frame: e.frame, at: e.at, guard: e.guard,
        threat: { id: e.rig.item.node.name, point: "tip" }, plane: { point: [0, 0, SETTINGS.planeForward], normal: [0, 0, 1] },
        reach: e.reach, travelSpeed: SETTINGS.travelSpeed, braceRotation: config.held === "club" })),
      joints: model.channels.map((c) => ({ channel: c.name, angle: /shoulder|elbow|wrist/.test(c.name) ? (c.min + c.max) / 2 : Math.max(c.min, Math.min(c.max, 0)),
        rate: 0, acceleration: 0, seconds: SETTINGS.postureSeconds, weight: /shoulder|elbow|wrist/.test(c.name) ? SETTINGS.armWeight : SETTINGS.bodyWeight })),
      hold: [{ id: "root", frame: { kind: "segment", name: "lowerTrunk" }, at: ZERO,
        translation: { ...feedback([rootPosition[0], rootPosition[1] - SETTINGS.lower, rootPosition[2]], SETTINGS.rootSeconds, SETTINGS.rootPositionWeight), axes: ["y"] },
        orientation: { ...feedback(ZERO, SETTINGS.rootSeconds, SETTINGS.rootRotationWeight), target: rootRotation } }],
      centres: [{ id: "centre", frames: model.frames, translation: { ...feedback(centreGoal, SETTINGS.rootSeconds, SETTINGS.centreWeight), axes: ["x", "z"] } }],
    }, model, model.equipment);
    return policy;
  }, { senses: () => ({ ...clock(), objects: sensing.read() }), items, grants: items.map((item) => ({ item, grip: item.id })),
    fixed: [], capacity: effectors.length + 2, effortCost: SETTINGS.effortCost, ...(stopSettings ? { jointStops: stopSettings } : {}), contact: SETTINGS.contact });
  const ownParts = [...built.segments.values()], members = ownParts.map((p) => p.body).concat(items.map((i) => i.body), effectors.map((e) => e.rig.item.body));
  const index = new Map(members.map((part, i) => [part, i])), byBody = new Map(ownParts.map((part) => [part.body, part.spec.name]));
  const state = { steps: 0, released: false, ready: 0, prepared: false, fell: false, rejectedSteps: 0,
    guards: effectors.map((e) => ({ side: e.side, error: 0, qualifyingContacts: 0, firstBlock: -1, peakImpulse: 0, closing: 0 })),
    contacts: ownParts.map((part) => ({ segment: part.spec.name, samples: 0, impulse: 0, peakImpulse: 0, firstContact: -1 })),
    protectedImpulse: 0, firstProtected: -1,
    before: members.map(() => ({ centre: ZERO, velocity: ZERO, spin: ZERO })) };
  const point = new Vector3(), velocity = new Vector3(), spin = new Vector3(), motion = pointMotion(items.map((item) => item.model));
  const readMotion = (part: SegmentBody) => {
    point.set(...part.massProperties.centre).applyRotationQuaternionToRef(part.node.rotationQuaternion!, point).addInPlace(part.node.position);
    return { centre: tuple(point), velocity: tuple(part.linearVelocityToRef(velocity)), spin: tuple(part.angularVelocityToRef(spin)) };
  };
  const contactVelocity = (part: SegmentBody, at: Vec3) => {
    const prior = state.before[index.get(part)!]!;
    point.set(at[0] - prior.centre[0], at[1] - prior.centre[1], at[2] - prior.centre[2]);
    spin.set(...prior.spin); Vector3.CrossToRef(spin, point, velocity); velocity.addInPlaceFromFloats(...prior.velocity);
    return tuple(velocity);
  };
  const before = world.beforeStep(() => {
    if (!state.released && state.steps >= SETTINGS.releaseSeconds * config.hz) {
      state.prepared = state.ready >= SETTINGS.readySeconds; state.released = true;
      for (const e of effectors) e.rig.item.body.setFixed(false);
    }
    members.forEach((part, i) => { state.before[i] = readMotion(part); });
  });
  const after = world.afterStep(() => {
    state.steps++; const observation = body.observe(); state.fell ||= observation.down;
    if (trackingRejected(body.report())) state.rejectedSteps++;
    const readings = effectors.map((e, i) => {
      const reading = motion.own(observation, e.frame, e.at);
      state.guards[i]!.error = distance(reading.position, e.guard); return reading;
    });
    if (!state.released) state.ready = !observation.down && readings.every((r, i) => state.guards[i]!.error < SETTINGS.readyTolerance
      && distance(r.velocity, ZERO) < SETTINGS.readySpeed) ? state.ready + world.dt : 0;
    if (!state.released) return;
    effectors.forEach((e, i) => {
      const guard = state.guards[i]!;
      for (const contact of world.physics.contactsOf(e.rig.item.body)) if (contact.impulse > 0 && contact.other) {
        const name = byBody.get(contact.other);
        if (name) {
          const row = state.contacts.find((r) => r.segment === name)!;
          row.samples++; row.impulse += contact.impulse; row.peakImpulse = Math.max(row.peakImpulse, contact.impulse);
          if (row.firstContact < 0) row.firstContact = state.steps;
          if (configuration.protected.includes(name)) {
            state.protectedImpulse += contact.impulse; if (state.firstProtected < 0) state.firstProtected = state.steps;
          }
        }
        if (contact.other !== e.body) continue;
        const a = contactVelocity(e.rig.item.body, contact.point), b = contactVelocity(e.body, contact.point);
        const closing = a.reduce((sum, v, k) => sum + (v - b[k]!) * contact.normal[k]!, 0);
        if (closing <= SETTINGS.closing) continue;
        guard.qualifyingContacts++; guard.peakImpulse = Math.max(guard.peakImpulse, contact.impulse); guard.closing = Math.max(guard.closing, closing);
        if (guard.firstBlock < 0) guard.firstBlock = state.steps;
      }
    });
  });
  return { world, built, body, items, incoming: effectors.map((e) => e.rig.item), configuration, geometry: { floor: SETTINGS.floor, obstacle: null },
    state: { body: body.state, task: state, objects: sensing.state },
    get complete() { return state.steps >= SETTINGS.watchSeconds * config.hz; },
    observe: () => deepFreeze({ body: body.observe(), task: { ...structuredClone(state),
      phase: !state.released ? "prepare" : state.steps >= SETTINGS.watchSeconds * config.hz ? "complete" : "defend" } }),
    dispose() { before.dispose(); after.dispose(); sensing.dispose(); body.dispose(); for (const item of items) item.dispose();
      for (const e of effectors) e.rig.dispose(); built.dispose(); world.dispose(); } };
}
