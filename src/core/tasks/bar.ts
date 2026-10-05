import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { buildBody } from "../build/build-body.ts";
import type { MotionCommand } from "../control/tasks.ts";
import type { PhysicsEngine } from "../engine/engine.ts";
import { equipHands } from "../human/equipment.ts";
import { modelSpec, type BodyModel } from "../human/spec.ts";
import { woodenClub } from "../items/club.ts";
import { cos, sin } from "../math/real.ts";
import { createMotionBody } from "../mind/motion.ts";
import type { Side } from "../human/landmarks.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import { physicalReading } from "../observation.ts";
import { createWorld } from "../world.ts";

/** Pinned bar experiment inputs, numeric settings (`docs/reference/motion-tracking.md`). */
const SETTINGS = deepFreeze({
  capture: { distance: 0.03, rotationError: 0.02 }, secondary: [0, 0.12, 0] as Vec3,
  pose: [0, 0.1, 0.4] as Vec3, travel: [0, 0.08, 0.08] as Vec3, swing: 0.45,
  obstacle: { offset: [0, 0.8, 0.75] as Vec3, size: [0.2, 0.2, 0.05] as Vec3 },
  seconds: { move: 1, swing: 2, release: 4, return: 5, finish: 7.5 },
  postureSeconds: 0.2, trackingSeconds: 0.15, armWeight: 0.03, bodyWeight: 0.3,
  positionWeight: 1, rotationWeight: 0.2, effortCost: 1e-6, capacity: 2,
  returnTolerance: 0.03, returnHoldSeconds: 0.25,
});
/** Measured sticking-support experiment inputs, numeric settings (`docs/reference/standing-bar.md`). */
const STANDING = deepFreeze({ maxPoints: 64, gap: 0.005, minUpNormal: 0.9, forceTolerance: 1e-5,
  iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6,
  rootSeconds: 0.2, rootWeight: 1, floor: { centre: [0, -0.1, 0] as Vec3, size: [5, 0.2, 5] as Vec3 } });
const ZERO: Vec3 = [0, 0, 0];
const tuple = (v: Vector3): Vec3 => [v.x, v.y, v.z];
const rotation = (q: Quaternion) => [q.x, q.y, q.z, q.w] as const;

/**
 * A shared Node/browser load-path fixture: anatomical hands, one club, gravity, and an explicit
 * pelvis pin or measured ground support. A reference policy captures, moves, swings against a fixed obstacle and releases
 * either grip. The return asks position alone; a fixed orientation can exceed a remaining wrist's
 * range. Recovery, moving targets and combat need their own tasks.
 */
export function createBarProbe(scene: Scene, engine: PhysicsEngine, config: {
  readonly model: BodyModel; readonly release: Side; readonly hz: number;
  readonly actuation: "symmetric" | "directional"; readonly offset: number;
  readonly support?: "pinned" | "standing";
}) {
  if (!Number.isSafeInteger(config.hz) || config.hz < 120 || config.hz % 120 !== 0
    || !Number.isFinite(config.offset) || (config.release !== "left" && config.release !== "right")) throw new Error("invalid bar fixture configuration");
  const support = config.support ?? "pinned";
  if (support !== "pinned" && support !== "standing") throw new Error("invalid bar support configuration");
  const standing = support === "standing";
  const configuration = deepFreeze({ ...config, task: "shared-bar", protocol: 3, support, settings: SETTINGS,
    contact: standing ? STANDING : null, engineRevision: engine.revision, pin: standing ? null : "lowerTrunk", gravity: true, ccd: true,
    assists: { root: 0, weapon: false }, modelAccess: "coupled dynamics, anatomy and registered equipment" });
  const spec = modelSpec(config.model);
  const world = createWorld(scene, engine, { gravity: true, hz: config.hz, actuation: config.actuation });
  const built = buildBody(spec, world, { position: ZERO }), root = built.segments.get("lowerTrunk")!;
  if (standing) world.physics.addFixedBox(STANDING.floor.centre, STANDING.floor.size);
  else root.body.setFixed(true);
  const rootPosition = tuple(root.node.position), rootRotation = rotation(root.node.rotationQuaternion!);
  const item = equipHands(world, built, { id: "bar", item: woodenClub(), primary: "right",
    grips: [{ side: "right", at: ZERO }, { side: "left", at: SETTINGS.secondary }], capture: SETTINGS.capture, ccd: true });
  const obstacleGeometry = deepFreeze({ centre: [SETTINGS.obstacle.offset[0], root.node.position.y + SETTINGS.obstacle.offset[1], SETTINGS.obstacle.offset[2]] as Vec3, size: SETTINGS.obstacle.size });
  const obstacle = world.physics.addFixedBox(obstacleGeometry.centre, obstacleGeometry.size);
  const base = new Vector3(config.offset, root.node.position.y + SETTINGS.pose[1], SETTINGS.pose[2]);
  const turn = new Quaternion(0, -Math.sqrt(0.5), 0, Math.sqrt(0.5));
  const swing = new Quaternion(sin(SETTINGS.swing / 2), 0, 0, cos(SETTINGS.swing / 2));
  swing.multiplyToRef(turn, swing);
  const state = { steps: 0, captured: -1, released: false, complete: false, returnHeld: 0, contactSteps: 0, peakImpulse: 0,
    movedError: null as number | null, finalError: Vector3.Distance(item.node.position, base), peakGripGap: 0,
    fell: false, minRootHeight: root.node.position.y, supportSteps: 0, rejectedSteps: 0, peakTension: 0, peakFrictionViolation: 0, maxSolveWork: 0,
    releaseContinuous: null as boolean | null, pendingRelease: null as readonly number[] | null };
  const motion = (target: Vec3) => ({ target, velocity: ZERO, acceleration: ZERO, seconds: SETTINGS.trackingSeconds, weight: SETTINGS.positionWeight });
  const body = createMotionBody(built, world, (model) => {
    const grip = model.equipment[0]!.grips.find((g) => g.name === "left")!;
    const inverse = new Quaternion(); Quaternion.InverseToRef(new Quaternion(...grip.bodyFrame.rotation), inverse);
    const handTurn = new Quaternion(...grip.itemFrame.rotation);
    turn.multiplyToRef(handTurn, handTurn); handTurn.multiplyToRef(inverse, handTurn);
    const handAt = new Vector3(...grip.itemFrame.position), offset = new Vector3(...grip.bodyFrame.position);
    handAt.applyRotationQuaternionToRef(turn, handAt).addInPlace(base);
    offset.applyRotationQuaternionToRef(handTurn, offset); handAt.subtractInPlace(offset);
    const joints = model.channels.map((c) => ({ channel: c.name, angle: Math.max(c.min, Math.min(c.max, 0)), rate: 0, acceleration: 0,
      seconds: SETTINGS.postureSeconds, weight: /shoulder|elbow|wrist/.test(c.name) ? SETTINGS.armWeight : SETTINGS.bodyWeight }));
    return { name: "bar-reference", state, step(observation): MotionCommand {
      const reading = observation.equipment![0]!;
      if (state.captured < 0 && reading.grips.every((g) => g.attached)) state.captured = state.steps;
      const elapsed = state.captured < 0 ? -1 : (state.steps - state.captured) / configuration.hz;
      const returning = elapsed >= SETTINGS.seconds.return;
      const position: Vec3 = elapsed >= SETTINGS.seconds.move && !returning
        ? [base.x + SETTINGS.travel[0], base.y + SETTINGS.travel[1], base.z + SETTINGS.travel[2]] : tuple(base);
      const orientation = elapsed >= SETTINGS.seconds.swing ? swing : turn;
      const frames: MotionCommand["frames"][number][] = [{ id: "bar", frame: { kind: "item", id: "bar" }, at: ZERO,
        translation: motion(position), ...(returning ? {} : { orientation: { target: rotation(orientation), velocity: ZERO,
          acceleration: ZERO, seconds: SETTINGS.trackingSeconds, weight: SETTINGS.rotationWeight } }) }];
      if (state.captured < 0) frames.push({ id: "capture", frame: { kind: "segment", name: "hand.left" }, at: ZERO,
        translation: motion(tuple(handAt)), orientation: { target: rotation(handTurn), velocity: ZERO, acceleration: ZERO,
          seconds: SETTINGS.trackingSeconds, weight: SETTINGS.rotationWeight } });
      const grips: MotionCommand["grips"][number][] = [];
      if (state.captured < 0) grips.push({ item: "bar", grip: "left", attached: true });
      if (elapsed >= SETTINGS.seconds.release && !state.released) {
        state.pendingRelease = [...reading.position, ...reading.rotation, ...reading.velocity, ...reading.spin];
        state.released = true; grips.push({ item: "bar", grip: configuration.release, attached: false });
      }
      if (elapsed >= SETTINGS.seconds.move && elapsed < SETTINGS.seconds.swing) {
        const dx = position[0] - reading.position[0], dy = position[1] - reading.position[1], dz = position[2] - reading.position[2];
        state.movedError = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      const dx = base.x - reading.position[0], dy = base.y - reading.position[1], dz = base.z - reading.position[2];
      state.returnHeld = returning && dx * dx + dy * dy + dz * dz < SETTINGS.returnTolerance * SETTINGS.returnTolerance ? state.returnHeld + 1 : 0;
      state.complete ||= elapsed >= SETTINGS.seconds.finish && state.returnHeld >= SETTINGS.returnHoldSeconds * configuration.hz;
      state.steps++;
      if (standing) frames.push({ id: "root", frame: { kind: "segment", name: "lowerTrunk" }, at: ZERO,
        translation: { target: rootPosition, velocity: ZERO, acceleration: ZERO, seconds: STANDING.rootSeconds, weight: STANDING.rootWeight },
        orientation: { target: rootRotation, velocity: ZERO, acceleration: ZERO, seconds: STANDING.rootSeconds, weight: STANDING.rootWeight } });
      return { joints, frames, grips };
    } };
  }, { items: [item], grants: ["left", "right"].map((grip) => ({ item, grip })), fixed: standing ? [] : [root.body],
    capacity: SETTINGS.capacity + (standing ? 1 : 0), effortCost: SETTINGS.effortCost, ...(standing ? { contact: STANDING } : {}) });
  const a = new Vector3(), b = new Vector3(), physical = physicalReading(built);
  const before = world.beforeStep(() => {
    if (!state.pendingRelease) return;
    const reading = item.observe(), now = [...reading.position, ...reading.rotation, ...reading.velocity, ...reading.spin];
    state.releaseContinuous = now.every((v, i) => v === state.pendingRelease![i]);
    state.pendingRelease = null;
  });
  const after = world.afterStep(() => {
    const reading = item.observe();
    const contacts = reading.contacts.filter((c) => c.fixed === obstacle.id && c.impulse > 0);
    if (contacts.length) state.contactSteps++;
    for (const contact of contacts) state.peakImpulse = Math.max(state.peakImpulse, contact.impulse);
    for (const grip of reading.grips) if (grip.attachment) {
      const hand = built.segments.get(`hand.${grip.name}`)!;
      a.set(...grip.attachment.bodyFrame.position).applyRotationQuaternionToRef(hand.node.rotationQuaternion!, a).addInPlace(hand.node.position);
      b.set(...grip.attachment.itemFrame.position).applyRotationQuaternionToRef(item.node.rotationQuaternion!, b).addInPlace(item.node.position);
      state.peakGripGap = Math.max(state.peakGripGap, Vector3.Distance(a, b));
    }
    state.finalError = Vector3.Distance(item.node.position, base);
    state.fell ||= physical().down; state.minRootHeight = Math.min(state.minRootHeight, root.node.position.y);
    const report = body.report().contact;
    if (report) {
      if (report.points) state.supportSteps++;
      if (report.status === "rejected") state.rejectedSteps++;
      state.peakTension = Math.max(state.peakTension, report.tension);
      state.peakFrictionViolation = Math.max(state.peakFrictionViolation, report.frictionViolation);
      state.maxSolveWork = Math.max(state.maxSolveWork, report.solve?.work ?? 0);
    }
  });
  return { world, built, body, item, configuration, geometry: { obstacle: obstacleGeometry, floor: standing ? STANDING.floor : null },
    state: { body: body.state }, get complete() { return state.complete; },
    observe: () => ({ task: { ...state, pendingRelease: state.pendingRelease ? [...state.pendingRelease] : null }, body: body.observe() }),
    dispose() { before.dispose(); after.dispose(); body.dispose(); item.dispose(); built.dispose(); world.dispose(); } };
}
