import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { validateBlueprint } from "../src/construct/blueprint.ts";
import { blueprintDigest } from "../src/construct/canonical.ts";
import { groundedConstructOriginY, resolveConstructBindTransforms } from
  "../src/construct/compile.ts";
import { humanoidBlueprint, humanoidControl, humanoidProgram,
  humanoidProfileMetrics, HUMANOID_SENSORS } from "../src/construct/humanoid.ts";
import { saveConstruct } from "../src/construct/codec.ts";

export const SCALED_LOCOMOTION_TARGET_CROWN_M = 0.90;
export const CONSTRUCT_GROUND_CLEARANCE_M = 0.002;

const triple = (value, by) => value.map((entry) => entry * by);
const frame = (value, by) => ({ ...value, positionM: triple(value.positionM, by) });
const shape = (value, by) => value.kind === "box"
  ? { kind: value.kind, sizeM: triple(value.sizeM, by) }
  : value.kind === "sphere"
    ? { kind: value.kind, radiusM: value.radiusM * by }
    : { kind: value.kind, lengthM: value.lengthM * by, radiusM: value.radiusM * by };
const shell = (value, by) => ({ ...value, visualClearanceM: value.visualClearanceM * by });

const BASE_CROWN_M = humanoidProfileMetrics().crownHeight;
// `groundedConstructOriginY` adds 2 mm after it finds the lowest scaled collider. That fixed
// clearance is not body geometry and must not itself be similarity-scaled. Scaling by 0.90 /
// 1.8995 would therefore produce a 0.901052... m body. Scale the physical collider span on both
// sides of that fixed clearance instead, then measure the resulting crown from the compiled bind.
export const SCALED_LOCOMOTION_BODY_SCALE =
  (SCALED_LOCOMOTION_TARGET_CROWN_M - CONSTRUCT_GROUND_CLEARANCE_M) /
  (BASE_CROWN_M - CONSTRUCT_GROUND_CLEARANCE_M);
export const SCALED_LOCOMOTION_MASS_SCALE = SCALED_LOCOMOTION_BODY_SCALE ** 3;
export const SCALED_LOCOMOTION_FIXTURE_SPEED_MPS = 0.40;

/**
 * The supported-locomotion corpus's physically scaled evidence humanoid. All body/contact
 * dimensions and attachment translations share one similarity transform; part/module mass follows
 * volume. Havok derives
 * each body's inertia from that scaled shape and mass. The ordinary steel sword is carried by the
 * scaled socket but keeps its real geometry, striker point and 1.4 kg mass.
 */
export function scaleLocomotionFixtureBlueprint(source = humanoidBlueprint()) {
  const by = SCALED_LOCOMOTION_BODY_SCALE;
  const massBy = SCALED_LOCOMOTION_MASS_SCALE;
  const parts = source.parts.map((part) => ({ ...part,
    shape: shape(part.shape, by), massKg: part.massKg * massBy,
    centreOfMassM: triple(part.centreOfMassM, by), shell: shell(part.shell, by) }));
  const joints = source.joints.map((joint) => ({ ...joint,
    parentFrame: frame(joint.parentFrame, by), childFrame: frame(joint.childFrame, by) }));
  const sockets = source.sockets.map((socket) => ({ ...socket, frame: frame(socket.frame, by) }));
  const modules = source.modules.map((module) => {
    if (module.kind === "sword") return structuredClone(module);
    return { ...module, massKg: module.massKg * massBy,
      geometry: module.geometry.map((primitive) => ({ ...primitive,
        frame: frame(primitive.frame, by), shape: shape(primitive.shape, by),
        shell: shell(primitive.shell, by) })) };
  });
  return validateBlueprint({ ...source, id: "locomotion-fixture-090", parts, joints, sockets, modules });
}

export function scaledLocomotionFixtureMetrics(blueprint = scaleLocomotionFixtureBlueprint()) {
  const origin = new Vector3(0, groundedConstructOriginY(blueprint), 0);
  const transforms = resolveConstructBindTransforms(blueprint, origin);
  const root = transforms.get(blueprint.rootPart);
  const head = transforms.get("head");
  const headSpec = blueprint.parts.find(({ id }) => id === "head");
  const sword = blueprint.modules.find(({ kind }) => kind === "sword");
  const socket = blueprint.sockets.find(({ id }) => id === sword?.socket);
  const owner = socket ? transforms.get(socket.part) : null;
  if (!root || !head || headSpec?.shape.kind !== "sphere" || !sword?.striker || !socket || !owner) {
    throw new Error("scaled locomotion fixture lost its root, head, or ordinary sword bind geometry");
  }
  const socketRotation = owner.rotation.multiply(Quaternion.FromArray(socket.frame.rotation)).normalize();
  const anchor = Vector3.FromArray(socket.frame.positionM)
    .rotateByQuaternionToRef(owner.rotation, new Vector3()).addInPlace(owner.position);
  const tip = Vector3.FromArray(sword.striker.localTipM)
    .rotateByQuaternionToRef(socketRotation, new Vector3()).addInPlace(anchor);
  return Object.freeze({ reach: Vector3.Distance(root.position, tip),
    crownHeight: head.position.y + headSpec.shape.radiusM,
    vitalHeight: root.position.y,
    collisionRadius: humanoidProfileMetrics().collisionRadius * SCALED_LOCOMOTION_BODY_SCALE });
}

export function scaledLocomotionFixture() {
  const blueprint = scaleLocomotionFixtureBlueprint();
  const metrics = scaledLocomotionFixtureMetrics(blueprint);
  const profile = Object.freeze({ kind: "swordbearer-effigy", label: "0.90 m locomotion fixture",
    ...metrics, footPartIds: Object.freeze(["left-foot", "right-foot"]) });
  const program = structuredClone(humanoidProgram());
  program.id = "locomotion-fixture-090-program";
  // The production 1.2 m/s stride left both 0.90 m feet airborne beyond the frozen 0.10 s
  // grace. 0.40 m/s is the first two-facing bracket that retains physical support; this fixture
  // is evidence for scale-sensitive gait, not a production tuning change.
  const close = program.rules.find(({ id }) => id === "full-close-distance");
  if (close?.parameters.speed?.kind !== "expression" || close.parameters.speed.value.op !== "constant") {
    throw new Error("scaled locomotion fixture lost the authored close-speed expression");
  }
  close.parameters.speed.value.value = SCALED_LOCOMOTION_FIXTURE_SPEED_MPS;
  program.rules = program.rules.filter(({ action }) =>
    ["recover", "move", "turn", "stabilize"].includes(action));
  const saved = saveConstruct(profile.label, blueprint, humanoidControl(), program, HUMANOID_SENSORS);
  return Object.freeze({ blueprint, saved, profile, sensors: HUMANOID_SENSORS,
    blueprintDigest: blueprintDigest(blueprint) });
}
