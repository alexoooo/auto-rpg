import { pathToFileURL } from "node:url";

import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsEventType, PhysicsShapeType } from
  "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";

import { CONFIG } from "../src/config.ts";
import { Construct, constructProfileForBlueprint } from "../src/construct/construct.ts";
import { humanoidSavedConstruct, HUMANOID_SENSORS } from "../src/construct/humanoid.ts";
import { stepPair } from "../src/fighter.ts";
import { idleMind } from "../src/mind.ts";
import { COLLIDES, LAYER } from "../src/physics.ts";
import { blankIntent } from "../src/policies.ts";
import { StandableWorldRegistry } from "../src/supported-locomotion-runtime.ts";
import { SUPPORTED_LOCOMOTION_V1 } from "../src/supported-locomotion-state.ts";
import { unitDefinition } from "../src/units.ts";
import { createConstructHeadlessArena } from "./construct-headless-arena.mjs";

const FIXED = 1 / CONFIG.world.physicsHz;
const EMPTY_LOADOUT = Object.freeze({ primary: "empty", secondary: "empty" });
const ACTIVE_SIDE = "left";
const PARKED_ORIGIN = Object.freeze({ x: 4, y: 0, z: -4 });

export const PHYSICAL_OBSTACLE_CORPUS_V1 = Object.freeze({
  version: 1,
  physicsHz: 240,
  maximumJointFrameErrorM: 0.080,
  maximumPartSpeedMps: 12,
  maximumSupportGraceS: SUPPORTED_LOCOMOTION_V1.SUPPORT_GRACE_S,
  cellIds: Object.freeze(["ledge-support-loss", "slope-35-accepted", "slope-50-refused",
    "snag-stall-or-trip", "occupied-recovery-refused"]),
});

const point = (x, y, z) => Object.freeze({ x, y, z });
const hit = (id, at, normal, fraction = 1) => Object.freeze({ colliderId: id, fraction,
  point: point(at.x, at.y, at.z), upwardNormal: normal });

const materialsFor = (scene) => {
  const owner = new StandardMaterial("physical-obstacles.material", scene);
  return Object.freeze({ owner, fighter: Object.freeze({ flesh: owner, cloth: owner, steel: owner,
    leather: owner, brass: owner, hide: owner, wood: owner, arrowAccent: owner }) });
};

const box = (scene, fixtureBodies, { id, centre, size, rotationX = 0, friction = 0.9 }) => {
  const mesh = MeshBuilder.CreateBox(id, { width: size.x, height: size.y, depth: size.z }, scene);
  mesh.position.set(centre.x, centre.y, centre.z);
  mesh.rotation.x = rotationX;
  const aggregate = new PhysicsAggregate(mesh, PhysicsShapeType.BOX,
    { mass: 0, friction, restitution: 0 }, scene);
  aggregate.shape.filterMembershipMask = LAYER.WORLD;
  aggregate.shape.filterCollideMask = COLLIDES.WORLD;
  fixtureBodies.set(aggregate.body, id);
  return Object.freeze({ id, mesh, aggregate, centre: point(centre.x, centre.y, centre.z),
    size: point(size.x, size.y, size.z), rotationX });
};

const registerPlane = (registry, { id, bounds, normal, heightAt, sweep = () => null }) => {
  registry.register(Object.freeze({ id, category: "standable-world", ownerPartId: null,
    upwardNormal: normal, sweep,
    support: (at) => at.x >= bounds.minX && at.x <= bounds.maxX &&
      at.z >= bounds.minZ && at.z <= bounds.maxZ
      ? hit(id, point(at.x, heightAt(at.x, at.z), at.z), normal) : null }));
};

const registerWall = (registry, { id, axis, face, sign = 1 }) => {
  registry.register(Object.freeze({ id, category: "wall", ownerPartId: null,
    upwardNormal: Object.freeze([0, 1, 0]), support: () => null,
    sweep: (from, to, footprint) => {
      const limit = face - sign * footprint.radiusM;
      const start = sign * from[axis]; const end = sign * to[axis];
      const signedLimit = sign * limit;
      if (start >= signedLimit) return hit(id, from, Object.freeze([0, 1, 0]), 0);
      if (end < signedLimit || end === start) return null;
      const fraction = Math.max(0, Math.min(1, (signedLimit - start) / (end - start)));
      return hit(id, point(from.x + (to.x - from.x) * fraction,
        from.y + (to.y - from.y) * fraction, from.z + (to.z - from.z) * fraction),
      Object.freeze([0, 1, 0]), fraction);
    } }));
};

const addParkingPad = (scene, registry, fixtureBodies) => {
  const bounds = Object.freeze({ minX: 2.5, maxX: 5.5, minZ: -5.5, maxZ: -2.5 });
  box(scene, fixtureBodies, { id: "parking-pad", centre: point(4, -0.1, -4),
    size: point(3, 0.2, 3) });
  registerPlane(registry, { id: "parking-pad", bounds, normal: Object.freeze([0, 1, 0]),
    heightAt: () => 0 });
};

const obstacleGeometry = (kind) => (scene) => {
  const registry = new StandableWorldRegistry();
  const fixtureBodies = new Map();
  addParkingPad(scene, registry, fixtureBodies);
  if (kind === "ledge") {
    const bounds = Object.freeze({ minX: -1.2, maxX: 1.2, minZ: -0.9, maxZ: 0.72 });
    // Fighter shins deliberately stop 40 mm above the ordinary floor. This ledge rises 41 mm:
    // one millimetre of initial solver overlap makes physical ledge contact an observed fact.
    box(scene, fixtureBodies, { id: "ledge-platform", centre: point(0, -0.059, -0.09),
      size: point(2.4, 0.2, 1.62) });
    registerPlane(registry, { id: "ledge-platform", bounds, normal: Object.freeze([0, 1, 0]),
      heightAt: () => 0.041 });
    return Object.freeze({ kind, registry, fixtureBodies, declaration: Object.freeze({
      obstacleId: "ledge-platform", edgeZ: bounds.maxZ }) });
  }
  if (kind === "slope-35" || kind === "slope-50") {
    const degrees = kind === "slope-35" ? 35 : 50;
    const radians = degrees * Math.PI / 180;
    const normal = Object.freeze([0, Math.cos(radians), Math.sin(radians)]);
    const thickness = 0.20;
    const bounds = Object.freeze({ minX: -1.8, maxX: 1.8, minZ: -1.2, maxZ: 1.2 });
    box(scene, fixtureBodies, { id: kind, centre: point(0, -normal[1] * thickness / 2,
      -normal[2] * thickness / 2), size: point(3.6, thickness, 2.4), rotationX: radians });
    registerPlane(registry, { id: kind, bounds, normal,
      heightAt: (_x, z) => -Math.tan(radians) * z,
      sweep: kind === "slope-50" ? (from) => hit(kind, from, normal, 0) : () => null });
    return Object.freeze({ kind, registry, fixtureBodies, declaration: Object.freeze({
      obstacleId: kind, degrees, bounds }) });
  }
  const floorBounds = Object.freeze({ minX: -2, maxX: 2, minZ: -2, maxZ: 3 });
  box(scene, fixtureBodies, { id: "obstacle-floor", centre: point(0, -0.1, 0.5),
    size: point(4, 0.2, 5) });
  registerPlane(registry, { id: "obstacle-floor", bounds: floorBounds,
    normal: Object.freeze([0, 1, 0]), heightAt: () => 0 });
  if (kind === "snag") {
    const nearFaceZ = 0.64;
    box(scene, fixtureBodies, { id: "snag", centre: point(0, 0.14, nearFaceZ + 0.07),
      size: point(0.70, 0.28, 0.14), friction: 1 });
    registerWall(registry, { id: "snag", axis: "z", face: nearFaceZ });
    return Object.freeze({ kind, registry, fixtureBodies, declaration: Object.freeze({
      obstacleId: "snag", nearFaceZ }) });
  }
  if (kind === "occupied") {
    // The 0.465 m carrier overlaps this plane. The 0.20 m clearance deliberately puts the outer
    // feet against a real curb without invalidating the authored standing posture, then keeps the
    // naturally settled fallen body in contact throughout its refused recovery request. Four sides
    // do that without following the body or teleporting geometry, so falling away cannot turn the
    // occupied probe clear.
    const cageClearanceM = 0.20;
    const curbCentre = cageClearanceM + 0.05;
    const walls = [
      { id: "recovery-wall-north", axis: "z", sign: 1, centre: point(0, 0.11, curbCentre),
        size: point(1.4, 0.22, 0.10), face: cageClearanceM },
      { id: "recovery-wall-south", axis: "z", sign: -1, centre: point(0, 0.11, -curbCentre),
        size: point(1.4, 0.22, 0.10), face: -cageClearanceM },
      { id: "recovery-wall-east", axis: "x", sign: 1, centre: point(curbCentre, 0.11, 0),
        size: point(0.10, 0.22, 1.4), face: cageClearanceM },
      { id: "recovery-wall-west", axis: "x", sign: -1, centre: point(-curbCentre, 0.11, 0),
        size: point(0.10, 0.22, 1.4), face: -cageClearanceM },
    ];
    for (const wall of walls) {
      box(scene, fixtureBodies, { id: wall.id, centre: wall.centre, size: wall.size, friction: 1 });
      registerWall(registry, { id: wall.id, axis: wall.axis, face: wall.face, sign: wall.sign });
    }
    return Object.freeze({ kind, registry, fixtureBodies, declaration: Object.freeze({
      obstacleIds: Object.freeze(walls.map(({ id }) => id)), cageClearanceM }) });
  }
  if (kind === "clear-recovery") {
    return Object.freeze({ kind, registry, fixtureBodies, declaration: Object.freeze({
      obstacleId: "obstacle-floor", nearFaceZ: null }) });
  }
  throw new Error(`unknown physical obstacle geometry ${kind}`);
};

const mindFor = (commandAt) => {
  const intent = blankIntent();
  let step = 0;
  return Object.freeze({ name: "physical-obstacle-exercise", decide: () => {
    const command = commandAt(step);
    intent.forward = command.forward ?? 0;
    intent.strafe = command.strafe ?? 0;
    intent.turn = command.turn ?? 0;
    step += 1;
    return intent;
  } });
};

const jointFrameError = (fighter) => Math.max(0, ...fighter.limbs
  .filter(({ severed, attachment }) => !severed && attachment)
  .flatMap(({ attachment }) => attachment.getBodiesUsingConstraint().map(({ parentBody, childBody }) => {
    const parent = Vector3.TransformCoordinates(attachment.options.pivotA,
      parentBody.transformNode.computeWorldMatrix(true));
    const child = Vector3.TransformCoordinates(attachment.options.pivotB,
      childBody.transformNode.computeWorldMatrix(true));
    return Vector3.Distance(parent, child);
  })));

const upDot = (node) => Vector3.Dot(Vector3.Up().rotateByQuaternionToRef(
  node.rotationQuaternion ?? Quaternion.Identity(), new Vector3()), Vector3.Up());

const bodySample = (fighter) => {
  const diagnostic = fighter.locomotion.diagnostic();
  return Object.freeze({ centre: point(fighter.centre().x, fighter.centre().y, fighter.centre().z),
    pelvis: point(fighter.pelvis.mesh.position.x, fighter.pelvis.mesh.position.y,
      fighter.pelvis.mesh.position.z),
    pelvisUp: upDot(fighter.pelvis.mesh),
    torsoHeightAbovePelvisM: fighter.torso.mesh.position.y - fighter.pelvis.mesh.position.y,
    headHeightAboveTorsoM: fighter.head.mesh.position.y - fighter.torso.mesh.position.y,
    maximumPartSpeedMps: Math.max(0, ...fighter.limbs.filter(({ severed }) => !severed)
      .map(({ part }) => part.body.getLinearVelocity().length())),
    maximumJointFrameErrorM: jointFrameError(fighter),
    locomotion: Object.freeze({ state: diagnostic.state.state,
      supportMissingS: diagnostic.state.supportMissingS,
      freshSupportBindings: diagnostic.freshSupportBindings,
      requested: diagnostic.requested, allowed: diagnostic.allowed,
      blockedReason: diagnostic.blockedReason, releaseReason: diagnostic.releaseReason,
      recoveryProgress: diagnostic.recoveryProgress }) });
};

const constructSample = (construct) => {
  const root = construct.runtime.part(construct.runtime.blueprint.rootPart).node;
  const pelvis = construct.runtime.part("pelvis").node;
  const head = construct.runtime.part("head").node;
  const diagnostic = construct.locomotion.diagnostic();
  return Object.freeze({ centre: point(root.position.x, root.position.y, root.position.z),
    pelvis: point(pelvis.position.x, pelvis.position.y, pelvis.position.z),
    pelvisUp: upDot(root), torsoHeightAbovePelvisM: root.position.y - pelvis.position.y,
    headHeightAboveTorsoM: head.position.y - root.position.y,
    maximumPartSpeedMps: Math.max(0, ...[...construct.runtime.parts.values()]
      .map(({ body }) => body.getLinearVelocity().length())),
    maximumJointFrameErrorM: Math.max(0, ...[...construct.runtime.joints.values()].map((joint) => {
      const frames = joint.liveFrames();
      return Vector3.Distance(frames.parent.position, frames.child.position);
    })),
    recoverActionActive: construct.control.snapshot().active.some(({ action }) => action === "recover"),
    locomotion: Object.freeze({ state: diagnostic.state.state,
      supportMissingS: diagnostic.state.supportMissingS,
      freshSupportBindings: diagnostic.freshSupportBindings,
      requested: diagnostic.requested, allowed: diagnostic.allowed,
      blockedReason: diagnostic.blockedReason, releaseReason: diagnostic.releaseReason,
      recoveryProgress: diagnostic.recoveryProgress }) });
};

const observeFixtureContacts = (fighter, fixtureBodies, stepRef) => {
  const contacts = [];
  const observers = [];
  for (const limb of fighter.limbs.filter(({ severed }) => !severed)) {
    const body = limb.part.body;
    body.setCollisionCallbackEnabled(true);
    const observable = body.getCollisionObservable();
    const observer = observable.add((event) => {
      if (event.type === PhysicsEventType.COLLISION_FINISHED) return;
      const fixtureId = fixtureBodies.get(event.collidedAgainst) ?? fixtureBodies.get(event.collider);
      if (!fixtureId) return;
      contacts.push(Object.freeze({ step: stepRef.value, limb: limb.key, fixtureId,
        type: event.type, point: event.point ? point(event.point.x, event.point.y, event.point.z) : null,
        normal: event.normal ? point(event.normal.x, event.normal.y, event.normal.z) : null,
        impulseNs: event.impulse }));
    });
    if (observer) observers.push({ observable, observer });
  }
  return Object.freeze({ contacts, dispose: () => {
    for (const { observable, observer } of observers) observable.remove(observer);
  } });
};

const cellSpec = (id) => {
  if (id === "ledge-support-loss") return Object.freeze({ geometry: "ledge", steps: 480,
    origin: point(0, 0, -0.35), facing: 0, command: () => ({ forward: 1 }) });
  if (id === "slope-35-accepted") return Object.freeze({ geometry: "slope-35", steps: 360,
    origin: point(-0.5, 0, 0), facing: Math.PI / 2, command: () => ({ forward: 0.55 }) });
  if (id === "slope-50-refused") return Object.freeze({ geometry: "slope-50", steps: 120,
    origin: point(-0.5, 0, 0), facing: Math.PI / 2, command: () => ({ forward: 0.55 }) });
  if (id === "snag-stall-or-trip") return Object.freeze({ geometry: "snag", steps: 480,
    origin: point(0, 0, 0), facing: 0, command: () => ({ forward: 1 }) });
  if (id === "occupied-recovery-refused") return Object.freeze({ geometry: "occupied", steps: 300,
    origin: point(0, 0, 0), facing: 0,
    // Fighter recovery is the public movement request while fallen, not a hidden recover switch.
    command: (step) => ({ forward: step >= 72 ? 1 : 0 }), shoveStep: 48 });
  throw new Error(`unknown physical obstacle cell ${id}`);
};

const constructCommand = (action) => Object.freeze({ version: 1, requests: Object.freeze([
  Object.freeze({ request: Object.freeze({ action, parameters: Object.freeze({}) }),
    priority: 100, sourceIndex: 0 }),
]) });

async function runRecoveryTrial(occupied) {
  const arena = await createConstructHeadlessArena({ populateDefaultGeometry: false,
    populateFixture: obstacleGeometry(occupied ? "occupied" : "clear-recovery") });
  const materials = materialsFor(arena.scene);
  const saved = humanoidSavedConstruct();
  const definition = Object.freeze({ blueprint: saved.blueprint, control: saved.control,
    program: saved.program, sensors: HUMANOID_SENSORS,
    profile: constructProfileForBlueprint(saved.blueprint) });
  const active = new Construct({ scene: arena.scene, side: ACTIVE_SIDE, origin: Vector3.Zero(),
    facing: 0, materials: materials.fighter, policyName: "construct-program",
    locomotionMode: "supported", locomotionWorld: arena.fixture.registry }, definition);
  const parked = unitDefinition("warrior").build({ scene: arena.scene, side: "right",
    origin: new Vector3(PARKED_ORIGIN.x, PARKED_ORIGIN.y, PARKED_ORIGIN.z), facing: 0,
    mind: idleMind(), loadout: EMPTY_LOADOUT, materials: materials.fighter,
    locomotionMode: "supported", locomotionWorld: arena.fixture.registry });
  const stepRef = { value: -1 };
  active.control.installCommandSource(`physical-recovery-${occupied ? "occupied" : "clear"}`,
    () => constructCommand(stepRef.value >= 72 ? "recover" : "brace"));
  const contactObserver = observeFixtureContacts(active, arena.fixture.fixtureBodies, stepRef);
  try {
    const plugin = arena.scene.getPhysicsEngine().getPhysicsPlugin();
    for (const body of [...active.runtime.parts.values()].map(({ body }) => body)
      .concat(parked.limbs.map(({ part }) => part.body))) plugin.setActivationControl(body, 1);
    const samples = [];
    for (let step = 0; step < 300; step += 1) {
      stepRef.value = step;
      if (step === 48) active.queueStabilityEvent({ horizontalShoveNs: [12, 0] });
      stepPair(active, parked, FIXED, step * FIXED);
      arena.scene._renderId += 1;
      arena.scene._advancePhysicsEngineStep(1000 * FIXED);
      samples.push(Object.freeze({ step, active: constructSample(active), parked: bodySample(parked) }));
    }
    return Object.freeze({ physics: `real-havok-fixed-${CONFIG.world.physicsHz}hz`,
      footprintRadiusM: active.constructProfile.collisionRadius, fixture: arena.fixture.declaration,
      samples: Object.freeze(samples), contacts: Object.freeze([...contactObserver.contacts]) });
  } finally {
    contactObserver.dispose(); active.dispose(); parked.dispose();
    materials.owner.dispose(false, false); arena.dispose();
  }
}

async function runOccupiedRecoveryCell() {
  const occupied = await runRecoveryTrial(true);
  const clear = await runRecoveryTrial(false);
  return Object.freeze({ id: "occupied-recovery-refused", ...occupied,
    clearCounterfactual: clear });
}

async function runCell(id) {
  if (id === "occupied-recovery-refused") return runOccupiedRecoveryCell();
  const spec = cellSpec(id);
  const arena = await createConstructHeadlessArena({ populateDefaultGeometry: false,
    populateFixture: obstacleGeometry(spec.geometry) });
  const materials = materialsFor(arena.scene);
  const definition = unitDefinition("warrior");
  const activeMind = mindFor(spec.command);
  const build = (side, origin, facing, mind) => definition.build({ scene: arena.scene, side,
    origin: new Vector3(origin.x, origin.y, origin.z), facing, mind, loadout: EMPTY_LOADOUT,
    materials: materials.fighter, locomotionMode: "supported", locomotionWorld: arena.fixture.registry });
  const active = build(ACTIVE_SIDE, spec.origin, spec.facing, activeMind);
  const parked = build("right", PARKED_ORIGIN, 0, idleMind());
  const stepRef = { value: -1 };
  const contactObserver = observeFixtureContacts(active, arena.fixture.fixtureBodies, stepRef);
  try {
    const plugin = arena.scene.getPhysicsEngine().getPhysicsPlugin();
    for (const fighter of [active, parked]) for (const { part } of fighter.limbs) {
      plugin.setActivationControl(part.body, 1);
    }
    const samples = [];
    for (let step = 0; step < spec.steps; step += 1) {
      stepRef.value = step;
      if (step === spec.shoveStep) active.queueStabilityEvent({ horizontalShoveNs: [12, 0] });
      stepPair(active, parked, FIXED, step * FIXED);
      arena.scene._renderId += 1;
      arena.scene._advancePhysicsEngineStep(1000 * FIXED);
      samples.push(Object.freeze({ step, active: bodySample(active), parked: bodySample(parked) }));
    }
    const footprintRadiusM = Math.max(CONFIG.body.torsoRadius,
      CONFIG.body.hipSide + CONFIG.body.thighRadius);
    return Object.freeze({ id, physics: `real-havok-fixed-${CONFIG.world.physicsHz}hz`,
      footprintRadiusM, fixture: arena.fixture.declaration,
      samples: Object.freeze(samples), contacts: Object.freeze([...contactObserver.contacts]) });
  } finally {
    contactObserver.dispose(); active.dispose(); parked.dispose();
    materials.owner.dispose(false, false); arena.dispose();
  }
}

export async function runPhysicalObstacleCorpus() {
  const cells = [];
  for (const id of PHYSICAL_OBSTACLE_CORPUS_V1.cellIds) cells.push(await runCell(id));
  return Object.freeze({ version: 1, fixture: PHYSICAL_OBSTACLE_CORPUS_V1,
    cells: Object.freeze(cells) });
}

const postureValid = ({ pelvisUp, torsoHeightAbovePelvisM, headHeightAboveTorsoM }) =>
  pelvisUp > 0.72 && torsoHeightAbovePelvisM > 0.25 && headHeightAboveTorsoM > 0.25;

const firstIndex = (samples, accepts) => samples.findIndex(({ active }) => accepts(active));

export function assertPhysicalObstacleCorpus(report) {
  const failures = [];
  const expected = PHYSICAL_OBSTACLE_CORPUS_V1;
  if (report.version !== expected.version ||
      JSON.stringify(report.fixture) !== JSON.stringify(expected)) {
    failures.push("the frozen physical obstacle fixture changed");
  }
  if (JSON.stringify(report.cells?.map(({ id }) => id)) !==
      JSON.stringify(expected.cellIds)) failures.push("the exact five-cell physical matrix changed");
  for (const cell of report.cells ?? []) {
    const fail = (message) => failures.push(`${cell.id}: ${message}`);
    if (cell.physics !== "real-havok-fixed-240hz") fail("the cell did not use fixed-step Havok");
    if (cell.samples.length !== cellSpec(cell.id).steps) fail("the retained physical stream is incomplete");
    const active = cell.samples.map(({ active }) => active);
    const obstacleIds = cell.fixture.obstacleIds ?? [cell.fixture.obstacleId];
    const relevantContacts = cell.contacts.filter(({ fixtureId }) => obstacleIds.includes(fixtureId));
    if (relevantContacts.length === 0 || relevantContacts.some(({ point, impulseNs }) =>
      point === null || !Number.isFinite(impulseNs))) fail("the declared obstacle has no solver contact evidence");
    const maximumJointError = Math.max(...active.map(({ maximumJointFrameErrorM }) => maximumJointFrameErrorM));
    const maximumPartSpeed = Math.max(...active.map(({ maximumPartSpeedMps }) => maximumPartSpeedMps), 0);
    if (maximumJointError > expected.maximumJointFrameErrorM) fail("joint-frame error exceeded 0.080 m");
    if (maximumPartSpeed > expected.maximumPartSpeedMps) fail("an obstacle launched a body part");
    if (cell.id === "ledge-support-loss") {
      const lost = firstIndex(cell.samples, ({ locomotion }) => locomotion.freshSupportBindings.length === 0);
      const fallen = firstIndex(cell.samples, ({ locomotion }) => locomotion.state === "fallen");
      if (lost < 0 || fallen < 0 || fallen <= lost) fail("the ledge did not produce support loss then release");
      if (lost >= 0 && fallen >= 0) {
        const elapsed = (fallen - lost) / report.fixture.physicsHz;
        if (!(elapsed >= expected.maximumSupportGraceS &&
            elapsed <= expected.maximumSupportGraceS + 2 * FIXED)) {
          fail("ledge release did not follow the frozen support grace");
        }
      }
      const maxZ = Math.max(...active.map(({ centre }) => centre.z));
      if (maxZ <= cell.fixture.edgeZ) fail("the physical body never crossed the declared ledge envelope");
      if (fallen >= 0 && !active.slice(fallen).every(({ locomotion }) =>
        !locomotion.allowed || Math.hypot(locomotion.allowed.localForward,
          locomotion.allowed.localRight) === 0)) fail("the released ledge body air-walked");
    } else if (cell.id === "slope-35-accepted") {
      const start = active[0].centre; const bounds = cell.fixture.bounds;
      if (start.x + cell.footprintRadiusM < bounds.minX ||
          start.x - cell.footprintRadiusM > bounds.maxX ||
          start.z + cell.footprintRadiusM < bounds.minZ ||
          start.z - cell.footprintRadiusM > bounds.maxZ) fail("the declared footprint missed the slope envelope");
      if (cell.fixture.degrees !== 35 || !active.every(({ locomotion }) =>
        locomotion.freshSupportBindings.length > 0 && locomotion.state === "supported")) {
        fail("the physical 35 degree slope was not accepted throughout");
      }
      if (active.at(-1).centre.x - active[0].centre.x < 0.50) fail("accepted slope drive did not move");
    } else if (cell.id === "slope-50-refused") {
      const start = active[0].centre; const bounds = cell.fixture.bounds;
      if (start.x + cell.footprintRadiusM < bounds.minX ||
          start.x - cell.footprintRadiusM > bounds.maxX ||
          start.z + cell.footprintRadiusM < bounds.minZ ||
          start.z - cell.footprintRadiusM > bounds.maxZ) fail("the declared footprint missed the slope envelope");
      if (cell.fixture.degrees !== 50 || !active.some(({ locomotion }) =>
        locomotion.state === "fallen" && locomotion.releaseReason ===
          "fresh standable support is unavailable")) fail("the physical 50 degree slope was not refused");
      if (active.some(({ locomotion }) => locomotion.freshSupportBindings.length > 0)) {
        fail("the excessive slope fabricated standable evidence");
      }
      if (active.some(({ locomotion }) => locomotion.allowed &&
        Math.abs(locomotion.allowed.localForward) > 1e-9)) fail("the excessive slope allowed drive");
    } else if (cell.id === "snag-stall-or-trip") {
      const reached = active.some(({ centre }) => centre.z + cell.footprintRadiusM >= cell.fixture.nearFaceZ - 1e-3);
      const stalled = active.slice(-120).every(({ locomotion }) => locomotion.state === "fallen" ||
        !locomotion.allowed || Math.abs(locomotion.allowed.localForward) < 0.02);
      if (!reached) fail("the declared carrier envelope never intersected the snag");
      if (!stalled) fail("the snag neither stalled nor tripped the body");
    } else if (cell.id === "occupied-recovery-refused") {
      const occupied = cell.footprintRadiusM >= cell.fixture.cageClearanceM;
      const fallen = firstIndex(cell.samples, ({ locomotion }) => locomotion.state === "fallen");
      if (!occupied) fail("the recovery footprint did not intersect the declared wall");
      if (!active.some(({ recoverActionActive }) => recoverActionActive === true)) {
        fail("the public Construct recover Action was never admitted");
      }
      if (active.some((body) => body.recoverActionActive === true &&
        Math.min(Math.abs(Math.abs(body.centre.x) - cell.fixture.cageClearanceM),
          Math.abs(Math.abs(body.centre.z) - cell.fixture.cageClearanceM)) > cell.footprintRadiusM)) {
        fail("a recovery request did not intersect any declared cage plane");
      }
      if (fallen < 0 || !active.slice(fallen).every(({ locomotion }) => locomotion.state === "fallen" &&
        locomotion.recoveryProgress === 0)) fail("occupied recovery entered or completed rising");
      if (!relevantContacts.some(({ step }) => active[step]?.recoverActionActive === true &&
          active[step]?.locomotion.state === "fallen" && active[step]?.locomotion.recoveryProgress === 0)) {
        fail("the real cage stopped contacting the body during refused recovery");
      }
      if (active.slice(0, Math.max(0, fallen)).some((body) => !postureValid(body))) {
        fail("the body lost posture before the authored knockdown");
      }
      const control = cell.clearCounterfactual;
      const controlActive = control?.samples?.map(({ active: body }) => body) ?? [];
      const controlStates = controlActive.map(({ locomotion }) => locomotion.state);
      if (control?.physics !== "real-havok-fixed-240hz" || controlActive.length !== 300 ||
          !control.contacts.some(({ fixtureId, point: at }) => fixtureId === control.fixture.obstacleId && at) ||
          !controlActive.some(({ recoverActionActive }) => recoverActionActive === true) ||
          !controlStates.includes("fallen") || !controlStates.includes("rising")) {
        fail("the clear-space physical counterfactual did not admit rising through the same public Action");
      }
    }
  }
  if (failures.length) throw new Error(`real-Havok obstacle corpus failed: ${failures.join("; ")}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = assertPhysicalObstacleCorpus(await runPhysicalObstacleCorpus());
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
