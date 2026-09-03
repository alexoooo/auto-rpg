import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { validateControlGraph, type ConstructControlGraph } from "./actions.ts";
import { validateBlueprint, type AttachmentFrame, type ConstructBlueprint, type JointSpec,
  type ModuleKind, type PartSpec } from "./blueprint.ts";
import { saveConstruct, type SavedConstruct } from "./codec.ts";
import type { ConstructProgram } from "./program.ts";
import type { SensorSpec } from "./sensors.ts";
import { swordbearerDuelistProgram } from "./swordbearer-duelist.ts";
import { groundedConstructOriginY, resolveConstructBindTransforms } from "./compile.ts";
import { humanoidActuator, humanoidLength, humanoidMass, humanoidShape,
  humanoidTriple } from "./humanoid-scale.ts";
import { SUPPORTED_BIPED_LIMP_V1 } from "./biped.ts";
import { ATHLETIC_HUMANOID_CHASSIS_V1 as CHASSIS } from "./humanoid-chassis.ts";
export { HUMANOID_SCALE } from "./humanoid-scale.ts";

const I = [0, 0, 0, 1] as const;
// The first Swordbearer-only corpus selected 30 here, but that boundary did not survive the
// exact Twinblade body: its neutral second sword changes collision coverage. Keep this authored
// core value as chassis data; session 18's whole-construct multiplier and identical-body 8/8
// corpus are the balance authority, not the superseded adjacent-value claim.
export const HUMANOID_FATAL_HEALTH = 10;
const frame = (positionM: readonly [number, number, number] = [0, 0, 0],
  bodyScaled = true): AttachmentFrame => Object.freeze({
  positionM: bodyScaled ? humanoidTriple(positionM) : Object.freeze([...positionM]) as [number, number, number],
  rotation: I,
});
const part = (id: string, shape: PartSpec["shape"], massKg: number,
  style: PartSpec["shell"]["style"] = "plate", fatal = false): PartSpec => Object.freeze({
  id, shape: humanoidShape(shape), massKg: humanoidMass(massKg), centreOfMassM: Object.freeze([0, 0, 0] as const),
  friction: id.includes("foot") ? 1.35 : id.includes("hand") ? 1.05 : 0.72, restitution: 0.04,
  health: fatal ? HUMANOID_FATAL_HEALTH : 6, armour: fatal ? 1.9 : 0.8,
  vitalityWeight: fatal ? 1 : 0, fatal,
  // Feet are already broad contact primitives. Inflating their visible shell made the siblings
  // intersect while adding no support; every other shell retains the ordinary stone clearance.
  shell: Object.freeze({ style, visualClearanceM: id.endsWith("-foot") ? 0 :
    humanoidLength(style === "bearing" ? 0.003 : 0.008) }),
});
const joint = (id: string, parentPart: string, childPart: string,
  parentPosition: readonly [number, number, number], childPosition: readonly [number, number, number],
  axis: "x" | "y" | "z", minRad: number, maxRad: number, maxTorqueNm = 240,
  damping = 8, maxSpeedRadS = axis === "y" ? 7 : 4.5): JointSpec => Object.freeze({
  id, parentPart, childPart, parentFrame: frame(parentPosition), childFrame: frame(childPosition),
  angularAxes: Object.freeze([Object.freeze({ id: axis, minRad, maxRad,
    damping: humanoidActuator(damping), maxTorqueNm: humanoidActuator(maxTorqueNm),
    maxSpeedRadS })]), health: 8, armour: 0.6,
});
const geometry = (id: string, shape: PartSpec["shape"], style: PartSpec["shell"]["style"],
  positionM: readonly [number, number, number] = [0, 0, 0], bodyScaled = true) => Object.freeze({
  id, frame: frame(positionM, bodyScaled), shape: bodyScaled ? humanoidShape(shape) : Object.freeze(shape),
  shell: Object.freeze({ style, visualClearanceM: bodyScaled
    ? humanoidLength(style === "bearing" ? 0.002 : 0.006) : style === "bearing" ? 0.002 : 0.006 }),
});
const moduleBase = (id: string, kind: ModuleKind, socket: string, compatibilityTag: string,
  pieces: readonly ReturnType<typeof geometry>[], massKg: number, bodyScaled = true) => ({ id, kind, socket,
  compatibilityTag, geometry: Object.freeze(pieces), massKg: bodyScaled ? humanoidMass(massKg) : massKg,
  health: 4.5, armour: 0.6 });

const leftArmParts = Object.freeze([
  Object.freeze({ ...part("left-upper-arm", { kind: "capsule", lengthM: 0.55, radiusM: CHASSIS.upperArmRadiusM }, 8, "piston"), health: 8, armour: 1.0 }),
  Object.freeze({ ...part("left-forearm", { kind: "capsule", lengthM: 0.45, radiusM: CHASSIS.forearmRadiusM }, 6, "piston"), health: 8, armour: 1.0 }),
  Object.freeze({ ...part("left-wrist", { kind: "cylinder", lengthM: 0.20, radiusM: CHASSIS.wristRadiusM }, 3, "bearing"), health: 8, armour: 1.0 }),
  Object.freeze({ ...part("left-hand", { kind: "box", sizeM: CHASSIS.hand }, 4), health: 8, armour: 1.0 }),
]);
const leftArmJoints = Object.freeze([
  Object.freeze({ ...joint("left-shoulder", "torso", "left-upper-arm", [-0.42, 0.25, 0], [0, 0.275, 0], "x", -0.95, 0.95),
    angularAxes: Object.freeze([
      ...joint("left-shoulder", "torso", "left-upper-arm", [-0.42, 0.25, 0], [0, 0.275, 0], "x", -0.95, 0.95).angularAxes,
      Object.freeze({ id: "y" as const, minRad: -0.42, maxRad: 0.42, damping: humanoidActuator(8),
        maxTorqueNm: humanoidActuator(340), maxSpeedRadS: 5 }),
    ]), health: 8, armour: 1.1 }),
  Object.freeze({ ...joint("left-elbow", "left-upper-arm", "left-forearm", [0, -0.275, 0], [0, 0.225, 0], "x", -1.25, 0.35), health: 8, armour: 1.1 }),
  Object.freeze({ ...joint("left-wrist", "left-forearm", "left-wrist", [0, -0.225, 0], [0, 0.10, 0], "x", -0.75, 0.75, 150), health: 8, armour: 1.1 }),
  Object.freeze({ ...joint("left-palm", "left-wrist", "left-hand", [0, -0.10, 0], [0, 0.08, 0.03], "x", -0.55, 0.55, 150), health: 8, armour: 1.1 }),
]);

const leg = (side: "left" | "right", x: number) => {
  // Heavy-stone chassis experiment, mass only: thigh/shin/ankle/foot were
  // 18/14/6/18 kg. Geometry and the two contact leaves deliberately do not move.
  const parts = Object.freeze([
    part(`${side}-thigh`, { kind: "capsule", lengthM: 0.32, radiusM: CHASSIS.thighRadiusM }, 60, "piston"),
    part(`${side}-shin`, { kind: "capsule", lengthM: 0.30, radiusM: CHASSIS.shinRadiusM }, 50, "piston"),
    part(`${side}-ankle`, { kind: "cylinder", lengthM: 0.12, radiusM: CHASSIS.ankleRadiusM }, 25, "bearing"),
    // The support collider retains the physically qualified slab. The saved support shell style
    // draws a smaller stone casing inside it, avoiding sibling overlap without retuning locomotion.
    part(`${side}-foot`, { kind: "box", sizeM: [0.40, 0.14, 0.55] }, 80, "support"),
  ]);
  // The initial 300/220/260/180/180 Nm, damping-8 leg was sized like a human
  // exoskeleton but drives a roughly 200 kg stone body. These are actuator values,
  // not solver support: every correction still crosses the declared joint motors.
  const hip = joint(`${side}-hip`, "pelvis", `${side}-thigh`, [x, -0.11, 0], [0, 0.16, 0],
    "x", -0.9, 0.9, 1000, 18);
  const joints = Object.freeze([
    Object.freeze({ ...hip, angularAxes: Object.freeze([...hip.angularAxes,
      Object.freeze({ id: "y" as const, minRad: -0.45, maxRad: 0.45,
        damping: humanoidActuator(18), maxTorqueNm: humanoidActuator(750), maxSpeedRadS: 4.2 })]) }),
    joint(`${side}-knee`, `${side}-thigh`, `${side}-shin`, [0, -0.16, 0], [0, 0.15, 0],
      "x", -1.25, 0.35, 900, 16),
    joint(`${side}-ankle`, `${side}-shin`, `${side}-ankle`, [0, -0.15, 0], [0, 0.06, 0],
      "x", -0.75, 0.75, 650, 16),
    joint(`${side}-sole`, `${side}-ankle`, `${side}-foot`, [0, -0.06, 0], [0, 0.07, 0.04],
      "x", -0.55, 0.55, 500, 14),
  ]);
  return { parts, joints };
};
// Keep the measured hip spacing. Widening it to +/-0.21 m moved the left thigh into the wrist's
// clearance envelope; +/-0.225 m also destabilized the historical combat-topple recovery.
const leftLeg = leg("left", -0.19); const rightLeg = leg("right", 0.19);

const bodyParts = Object.freeze([
  part("torso", { kind: "box", sizeM: CHASSIS.torso }, 52, "core", true),
  // Pelvis was 70 kg; 180 kg makes the authored identity a bottom-heavy stone golem.
  part("pelvis", { kind: "box", sizeM: CHASSIS.pelvis }, 180, "core"),
  part("neck", { kind: "cylinder", lengthM: 0.16, radiusM: 0.10 }, 4, "bearing"),
  part("head", { kind: "sphere", radiusM: 0.22 }, 10, "core"),
  ...leftArmParts, ...leftLeg.parts, ...rightLeg.parts,
  part("sword-shoulder-yaw", { kind: "cylinder", lengthM: 0.18, radiusM: CHASSIS.swordBearingRadiusM }, 6, "bearing"),
  Object.freeze({ ...part("sword-arm-pitch", { kind: "capsule", lengthM: 0.58, radiusM: CHASSIS.shinRadiusM }, 8, "piston"), health: 8, armour: 1.1 }),
]);
const bodyJoints = Object.freeze([
  // Waist was 380 Nm/damping 8 before the same golem-scale correction.
  joint("waist", "torso", "pelvis", [0, -0.39, 0], [0, 0.11, 0], "z", -0.22, 0.22, 1200, 18),
  joint("neck-bearing", "torso", "neck", [0, 0.39, 0], [0, -0.08, 0], "y", -0.55, 0.55, 100),
  joint("head-bearing", "neck", "head", [0, 0.08, 0], [0, -0.22, 0], "y", -0.35, 0.35, 80),
  ...leftArmJoints, ...leftLeg.joints, ...rightLeg.joints,
  // The 900/650 Nm mount spent most admissions chasing its phase target and completed at most
  // three sweeps in the 30 s frozen active bouts. Three times that torque makes the full physical
  // stroke complete in roughly 0.9--1.4 s without changing the ordinary 1.4 kg sword or its damage.
  // Six times torque was measured too: it made contacts noisier and did not improve either mirror.
  Object.freeze({ ...joint("sword-yaw", "torso", "sword-shoulder-yaw", [0.42, 0.25, 0], [0, -0.09, 0], "y", -2.5, 2.5,
    2700, 8, 12), health: 10, armour: 1.2 }),
  Object.freeze({ ...joint("sword-pitch", "sword-shoulder-yaw", "sword-arm-pitch", [0, 0.09, 0], [0, 0.29, 0], "x", -0.75, 1.65,
    1950, 8, 10), health: 10, armour: 1.2 }),
]);

const CONTACTS = Object.freeze([
  Object.freeze({ role: "left-foot", part: "left-foot", module: "contact-left-foot", socket: "socket-left-foot" }),
  Object.freeze({ role: "right-foot", part: "right-foot", module: "contact-right-foot", socket: "socket-right-foot" }),
]);
const chain = (role: string): readonly string[] => role === "left-foot"
  ? ["left-hip", "left-knee", "left-ankle", "left-sole"]
    : ["right-hip", "right-knee", "right-ankle", "right-sole"];

export const HUMANOID_SENSORS: readonly SensorSpec[] = Object.freeze([
  Object.freeze({ id: "core-upright", unit: "boolean", source: "self" }),
  Object.freeze({ id: "core-roll-rad", unit: "radians", source: "self" }),
  Object.freeze({ id: "core-pitch-rad", unit: "radians", source: "self" }),
  // These are live hardware/geometry facts. The Mind can decline actions whose real carrying
  // chain is gone, while the mount safety controller uses only the declared sword/core pair.
  Object.freeze({ id: "left-arm-ready", unit: "boolean", source: "self" }),
  Object.freeze({ id: "left-arm-integrity", unit: "scalar", source: "self", combatValue: "normalized" }),
  Object.freeze({ id: "sword-ready", unit: "boolean", source: "self" }),
  Object.freeze({ id: "sword-arm-integrity", unit: "scalar", source: "self", combatValue: "normalized" }),
  Object.freeze({ id: "sword-core-clearance-m", unit: "metres", source: "self" }),
  Object.freeze({ id: "opponent-range", unit: "metres", source: "opponent" }),
  Object.freeze({ id: "opponent-relative-speed", unit: "metres-per-second", source: "opponent" }),
  ...["x", "y", "z"].flatMap((axis) => [
    Object.freeze({ id: `opponent-local-${axis}`, unit: "metres" as const, source: "opponent" as const }),
    Object.freeze({ id: `opponent-local-v${axis}`, unit: "metres-per-second" as const, source: "opponent" as const }),
  ]),
  Object.freeze({ id: "opponent-blocker-present", unit: "boolean", source: "opponent" }),
  ...["x", "y", "z"].map((axis) => Object.freeze({
    id: `opponent-blocker-local-${axis}`, unit: "metres" as const, source: "opponent" as const,
  })),
  Object.freeze({ id: "opponent-weapon-present", unit: "boolean", source: "opponent" }),
  ...["x", "y", "z"].map((axis) => Object.freeze({
    id: `opponent-weapon-local-${axis}`, unit: "metres" as const, source: "opponent" as const,
  })),
  ...["x", "y", "z"].map((axis) => Object.freeze({
    id: `opponent-weapon-local-v${axis}`, unit: "metres-per-second" as const, source: "opponent" as const,
  })),
  Object.freeze({ id: "opponent-weapon-speed-mps", unit: "metres-per-second", source: "opponent" }),
  Object.freeze({ id: "line-of-sight", unit: "boolean", source: "opponent" }),
  ...CONTACTS.flatMap(({ role }) => [
    Object.freeze({ id: `contact-${role}`, unit: "boolean" as const, source: "contact" as const }),
    Object.freeze({ id: `slip-${role}`, unit: "metres-per-second" as const, source: "contact" as const }),
  ]),
]);

export function humanoidBlueprint(): ConstructBlueprint {
  const sockets = [
    ...CONTACTS.map(({ socket, part: owner }) => ({ id: socket, part: owner, frame: frame([0, -0.08, 0]), accepts: ["contact-sensor"] })),
    { id: "socket-left-gauntlet", part: "left-hand", frame: frame([0, 0, 0.13]), accepts: ["gauntlet"] },
    { id: "socket-sword-hand", part: "sword-arm-pitch", frame: frame([0, -0.29, 0]), accepts: ["dorsal-weapon"] },
    { id: "socket-face-sensor", part: "head", frame: frame([0, 0, 0.20]), accepts: ["sensor"] },
    { id: "socket-heart", part: "torso", frame: frame([0, 0, -0.15]), accepts: ["power-core"] },
  ];
  const modules = [
    ...CONTACTS.map(({ role, module, socket }) => Object.freeze({ ...moduleBase(module, "contact-sensor", socket,
      "contact-sensor", [geometry("pad", { kind: "box", sizeM: [0.38, 0.08, 0.50] }, "support")], 2),
      sensorChannels: Object.freeze([`contact-${role}`, `slip-${role}`]) })),
    Object.freeze({ ...moduleBase("effigy-sight", "opponent-sensor", "socket-face-sensor", "sensor",
      [geometry("face", { kind: "box", sizeM: [0.22, 0.14, 0.08] }, "plate")], 2),
      sensorChannels: Object.freeze(HUMANOID_SENSORS.map(({ id }) => id).filter((id) =>
        !id.startsWith("contact-") && !id.startsWith("slip-"))) }),
    Object.freeze({ ...moduleBase("effigy-heart", "power-core", "socket-heart", "power-core",
      [geometry("heart", { kind: "sphere", radiusM: 0.11 }, "core")], 7), capacityJ: 24_000, maxOutputW: 620 }),
    // Broad carved stone is defensive and blunt. The smaller bronze ridge is an
    // actual separate collider leaf: a hit only cuts if the manifold resolves to
    // that leaf and its signed physical edge motion qualifies in Combat.
    Object.freeze({ ...moduleBase("effigy-gauntlet", "gauntlet", "socket-left-gauntlet", "gauntlet", [
      geometry("stone-face", { kind: "box", sizeM: [0.24, 0.22, 0.14] }, "plate", [0, 0, 0.12]),
      geometry("bronze-ridge", { kind: "box", sizeM: [0.035, 0.14, 0.12] }, "bearing", [0.145, 0, 0.18]),
      geometry("wrist-brace", { kind: "box", sizeM: [0.16, 0.14, 0.20] }, "bearing", [0, 0, -0.08]),
    ], 5), health: 8, armour: 1.2,
      mountedContactStriker: Object.freeze({ kind: "authored-surface" as const, action: "gauntlet-strike",
        surfaces: Object.freeze([
          Object.freeze({ id: "stone-face", primitiveId: "stone-face", kind: "mass" as const,
            localContactPoint: [0, 0, humanoidLength(0.19)] as const, damageScale: 0.55,
            shoveSpecificImpulseMps: 0.004 }),
          Object.freeze({ id: "bronze-ridge", primitiveId: "bronze-ridge", kind: "edge" as const,
            localContactPoint: [humanoidLength(0.1625), 0, humanoidLength(0.18)] as const, damageScale: 0.48,
            localEdgeDirection: [0, 0, 1] as const, localFlatDirection: [1, 0, 0] as const }),
        ]) }) }),
    // The physical weapon is an ordinary metre-long sword, not a similarity-scaled stone beam.
    // Its own torso is now a real collision partner; safe clearance is therefore enforced by
    // Havok rather than pretending a short decorative blade is a fighting reach. At 1.4 kg it
    // retains ordinary weapon inertia; the former 6 kg fantasy mass toppled the resized biped
    // during its first committed sweep and was not truthful to that contract.
    Object.freeze({ ...moduleBase("effigy-sword", "sword", "socket-sword-hand", "dorsal-weapon", [
      geometry("grip", { kind: "cylinder", lengthM: 0.18, radiusM: 0.05 }, "bearing", [0, 0, 0], false),
      geometry("guard", { kind: "box", sizeM: [0.34, 0.08, 0.08] }, "bearing", [0, 0, 0.08], false),
      geometry("blade", { kind: "box", sizeM: [0.10, 0.05, 1.05] }, "plate", [0, 0, 0.58], false),
    ], 1.4, false), health: 8, armour: 1.2, striker: Object.freeze({ localTipM: [0, 0, 1.105] as const,
      localEdgeDirection: [1, 0, 0] as const, localFlatDirection: [0, 1, 0] as const, damageScale: 1.15 }) }),
  ];
  return validateBlueprint({ version: 5, id: "swordbearer-effigy", rootPart: "torso",
    parts: bodyParts, joints: bodyJoints, sockets, modules });
}

/** Host-facing dimensions measured from the scaled bind pose and its unscaled ordinary sword. */
export function humanoidProfileMetrics(): Readonly<{ reach: number; crownHeight: number;
  vitalHeight: number; collisionRadius: number }> {
  const blueprint = humanoidBlueprint();
  const origin = new Vector3(0, groundedConstructOriginY(blueprint), 0);
  const transforms = resolveConstructBindTransforms(blueprint, origin);
  const root = transforms.get(blueprint.rootPart) as { position: Vector3; rotation: Quaternion };
  const head = transforms.get("head") as { position: Vector3; rotation: Quaternion };
  const headSpec = blueprint.parts.find(({ id }) => id === "head");
  const sword = blueprint.modules.find(({ id }) => id === "effigy-sword");
  const socket = blueprint.sockets.find(({ id }) => id === sword?.socket);
  const owner = socket ? transforms.get(socket.part) : undefined;
  if (headSpec?.shape.kind !== "sphere" || !sword?.striker || !socket || !owner) {
    throw new Error("Swordbearer profile metrics require the declared head and mounted sword bind geometry");
  }
  const socketRotation = owner.rotation.multiply(Quaternion.FromArray(socket.frame.rotation)).normalize();
  const anchor = Vector3.FromArray(socket.frame.positionM)
    .rotateByQuaternionToRef(owner.rotation, new Vector3()).addInPlace(owner.position);
  const tip = Vector3.FromArray(sword.striker.localTipM)
    .rotateByQuaternionToRef(socketRotation, new Vector3()).addInPlace(anchor);
  return Object.freeze({ reach: Vector3.Distance(root.position, tip),
    crownHeight: head.position.y + headSpec.shape.radiusM,
    vitalHeight: root.position.y, collisionRadius: humanoidLength(0.62) });
}

/** Bind dimensions consumed by target solvers; all points are root-local at identity facing. */
export function humanoidSwordBindMetrics(): Readonly<{ yawPivotRootM: readonly [number, number, number];
  pitchPivotRootM: readonly [number, number, number]; pitchToSocketM: number; socketToTipM: number }> {
  const blueprint = humanoidBlueprint();
  const transforms = resolveConstructBindTransforms(blueprint);
  const point = (partId: string, local: readonly [number, number, number]): Vector3 => {
    const transform = transforms.get(partId);
    if (!transform) throw new Error(`Swordbearer bind metrics lost part "${partId}"`);
    return Vector3.FromArray(local).rotateByQuaternionToRef(transform.rotation, new Vector3())
      .addInPlace(transform.position);
  };
  const yaw = blueprint.joints.find(({ id }) => id === "sword-yaw");
  const pitch = blueprint.joints.find(({ id }) => id === "sword-pitch");
  const sword = blueprint.modules.find(({ id }) => id === "effigy-sword");
  const socket = blueprint.sockets.find(({ id }) => id === sword?.socket);
  if (!yaw || !pitch || !sword?.striker || !socket) throw new Error("Swordbearer bind metrics lost its sword chain");
  const yawPivot = point(yaw.parentPart, yaw.parentFrame.positionM);
  const pitchPivot = point(pitch.parentPart, pitch.parentFrame.positionM);
  const anchor = point(socket.part, socket.frame.positionM);
  return Object.freeze({ yawPivotRootM: Object.freeze([yawPivot.x, yawPivot.y, yawPivot.z] as const),
    pitchPivotRootM: Object.freeze([pitchPivot.x, pitchPivot.y, pitchPivot.z] as const),
    pitchToSocketM: Vector3.Distance(pitchPivot, anchor),
    socketToTipM: Math.hypot(...sword.striker.localTipM) });
}

export function humanoidControl(): ConstructControlGraph {
  const locomotionJoints = CONTACTS.flatMap(({ role }) => chain(role));
  const balanceChain = ["waist", "neck-bearing", "head-bearing"];
  const postureJoints = ["left-shoulder", "left-elbow", "left-wrist", "left-palm"];
  const limpGroup = (side: "left" | "right") => {
    const role = `${side}-foot`;
    const contact = CONTACTS.find((row) => row.role === role);
    if (!contact) throw new Error(`humanoid control lost ${role}`);
    return { id: `locomotion-limp-${side}`, joints: [...chain(role), ...balanceChain], modules: [contact.module],
      bindings: { [role]: { joints: chain(role), modules: [contact.module] },
        "balance-chain": { joints: balanceChain, modules: [] } } };
  };
  return validateControlGraph({ version: 1, groups: [
    { id: "locomotion", joints: [...locomotionJoints, ...balanceChain], modules: CONTACTS.map(({ module }) => module),
      bindings: { ...Object.fromEntries(CONTACTS.map(({ role, module }) =>
        [role, { joints: chain(role), modules: [module] }])),
      "balance-chain": { joints: balanceChain, modules: [] } } },
    limpGroup("left"),
    limpGroup("right"),
    { id: "sword-arm", joints: ["sword-yaw", "sword-pitch"], modules: ["effigy-sword"], bindings: {
      yaw: { joints: ["sword-yaw"], modules: [] }, pitch: { joints: ["sword-pitch"], modules: [] },
      output: { joints: [], modules: ["effigy-sword"] }, sword: { joints: [], modules: ["effigy-sword"] },
    } },
    { id: "posture", joints: postureJoints, modules: [], bindings: {} },
    // The permanent left gauntlet is attached to the real four-joint arm. It owns
    // its own group so guard/check strokes can run with the right sword and feet,
    // but cannot silently overlap another left-arm action.
    { id: "offhand-guard", joints: postureJoints, modules: ["effigy-gauntlet"], bindings: {
      shoulder: { joints: ["left-shoulder"], modules: [] },
      elbow: { joints: ["left-elbow"], modules: [] },
      wrist: { joints: ["left-wrist"], modules: [] },
      palm: { joints: ["left-palm"], modules: [] },
      gauntlet: { joints: [], modules: ["effigy-gauntlet"] },
    } },
    { id: "whole-body", joints: bodyJoints.map(({ id }) => id), modules: [], bindings: {} },
  ], actions: [
    { id: "hold", controller: "hold-joints", group: "whole-body", claims: [], parameters: {} },
    { id: "stabilize", controller: "hold-joints", group: "posture", claims: [], parameters: {} },
    { id: "move", controller: "supported-biped-move", group: "locomotion", claims: ["resource:balance"],
      parameters: { forward: { kind: "number", min: -1, max: 1, unit: "scalar" },
        right: { kind: "number", min: -1, max: 1, unit: "scalar" },
        speed: { kind: "number", min: 0, max: 1.6, unit: "metres-per-second" } } },
    ...(["advance", "withdraw", "orbit-left", "orbit-right"] as const).map((id) => ({
      id, controller: "supported-biped-combat-move", group: "locomotion", claims: ["resource:balance"],
      parameters: {
        forward: { kind: "number" as const, min: -1, max: 1, unit: "scalar" as const },
        right: { kind: "number" as const, min: -1, max: 1, unit: "scalar" as const },
        yaw: { kind: "number" as const, min: -1, max: 1, unit: "scalar" as const },
        speed: { kind: "number" as const, min: 0, max: 1.6, unit: "metres-per-second" as const },
      },
    })),
    // Named sidesteps keep an authored Mind from laundering an evasive manoeuvre through an
    // unlabelled move vector. They retain every ordinary supported-biped constraint and claim.
    ...(["left", "right"] as const).map((side) => ({
      id: `dodge-${side}`, controller: "supported-biped-move", group: "locomotion",
      claims: ["resource:balance"], parameters: {
        forward: { kind: "number" as const, min: -1, max: 1, unit: "scalar" as const },
        right: { kind: "number" as const, min: -1, max: 1, unit: "scalar" as const },
        speed: { kind: "number" as const, min: 0, max: 1.6, unit: "metres-per-second" as const },
      },
    })),
    ...(["left", "right"] as const).map((side) => ({
      id: `limp-${side}`, controller: `supported-biped-limp-${side}`,
      group: `locomotion-limp-${side}`, claims: ["resource:balance"], parameters: {
        forward: { kind: "number" as const, min: -1, max: 1, unit: "scalar" as const },
        right: { kind: "number" as const, min: -1, max: 1, unit: "scalar" as const },
        yaw: { kind: "number" as const, min: -1, max: 1, unit: "scalar" as const },
        speed: { kind: "number" as const, min: 0, max: SUPPORTED_BIPED_LIMP_V1.MAX_SPEED_MPS,
          unit: "metres-per-second" as const },
      },
    })),
    { id: "turn", controller: "supported-biped-turn", group: "locomotion", claims: ["resource:balance"],
      parameters: { yaw: { kind: "number", min: -1, max: 1, unit: "scalar" } } },
    { id: "brace", controller: "supported-biped-brace", group: "locomotion",
      claims: ["resource:balance"], parameters: {} },
    { id: "recover", controller: "supported-biped-recover", group: "locomotion",
      claims: ["resource:balance"], parameters: {} },
    { id: "aim", controller: "aim-direction", group: "sword-arm",
      claims: ["resource:power-mount", "resource:sensor-line-of-sight"], parameters: {
        yaw: { kind: "number", min: -2.5, max: 2.5, unit: "radians" },
        pitch: { kind: "number", min: -0.75, max: 1.65, unit: "radians" },
      } },
    { id: "sweep", controller: "swordbearer-target-sweep", group: "sword-arm",
      claims: ["module:effigy-sword", "resource:power-mount", "resource:sensor-line-of-sight"],
      parameters: { direction: { kind: "number", min: -1, max: 1, unit: "scalar" } } },
    { id: "guard", controller: "guard-mount", group: "sword-arm",
      claims: ["module:effigy-sword", "resource:power-mount", "resource:sensor-line-of-sight"], parameters: {} },
    { id: "stow-sword", controller: "mount-safe-hold", group: "sword-arm",
      claims: ["resource:power-mount"], parameters: {
        yaw: { kind: "number", min: -2.5, max: 2.5, unit: "radians" },
        pitch: { kind: "number", min: -0.75, max: 1.65, unit: "radians" },
        "tilted-pitch": { kind: "number", min: -0.75, max: 1.65, unit: "radians" },
        "minimum-clearance-m": { kind: "number", min: 0.006, max: 0.20, unit: "metres" },
      } },
    { id: "offhand-guard", controller: "humanoid-offhand-guard", group: "offhand-guard",
      claims: ["module:effigy-gauntlet", "resource:power-offhand-guard"], parameters: {} },
    { id: "gauntlet-strike", controller: "humanoid-gauntlet-strike", group: "offhand-guard",
      claims: ["module:effigy-gauntlet", "resource:power-offhand-guard", "resource:sensor-line-of-sight"], parameters: {} },
  ] });
}

export function humanoidProgram(): ConstructProgram {
  const control = humanoidControl();
  return swordbearerDuelistProgram(control, HUMANOID_SENSORS);
}

export function humanoidSavedConstruct(): SavedConstruct {
  return saveConstruct("Swordbearer Effigy", humanoidBlueprint(), humanoidControl(), humanoidProgram(), HUMANOID_SENSORS);
}
