import { validateControlGraph, type ConstructControlGraph } from "./actions.ts";
import { validateBlueprint, type AttachmentFrame, type ConstructBlueprint, type JointSpec,
  type ModuleKind, type PartSpec } from "./blueprint.ts";
import { saveConstruct, type SavedConstruct } from "./codec.ts";
import type { ConstructProgram } from "./program.ts";
import type { SensorSpec } from "./sensors.ts";
import { swordbearerDuelistProgram } from "./swordbearer-duelist.ts";

const I = [0, 0, 0, 1] as const;
const frame = (positionM: readonly [number, number, number] = [0, 0, 0]): AttachmentFrame =>
  Object.freeze({ positionM: Object.freeze([...positionM]) as [number, number, number], rotation: I });
const part = (id: string, shape: PartSpec["shape"], massKg: number,
  style: PartSpec["shell"]["style"] = "plate", fatal = false): PartSpec => Object.freeze({
  id, shape: Object.freeze(shape), massKg, centreOfMassM: Object.freeze([0, 0, 0] as const),
  friction: id.includes("foot") ? 1.35 : id.includes("hand") ? 1.05 : 0.72, restitution: 0.04,
  health: fatal ? 480 : 120, armour: fatal ? 38 : 16, vitalityWeight: fatal ? 1 : 0, fatal,
  shell: Object.freeze({ style, visualClearanceM: style === "bearing" ? 0.003 : 0.008 }),
});
const joint = (id: string, parentPart: string, childPart: string,
  parentPosition: readonly [number, number, number], childPosition: readonly [number, number, number],
  axis: "x" | "y" | "z", minRad: number, maxRad: number, maxTorqueNm = 240,
  damping = 8): JointSpec => Object.freeze({
  id, parentPart, childPart, parentFrame: frame(parentPosition), childFrame: frame(childPosition),
  angularAxes: Object.freeze([Object.freeze({ id: axis, minRad, maxRad, damping,
    maxTorqueNm, maxSpeedRadS: axis === "y" ? 7 : 4.5 })]), health: 160, armour: 12,
});
const geometry = (id: string, shape: PartSpec["shape"], style: PartSpec["shell"]["style"],
  positionM: readonly [number, number, number] = [0, 0, 0]) => Object.freeze({
  id, frame: frame(positionM), shape: Object.freeze(shape),
  shell: Object.freeze({ style, visualClearanceM: style === "bearing" ? 0.002 : 0.006 }),
});
const moduleBase = (id: string, kind: ModuleKind, socket: string, compatibilityTag: string,
  pieces: readonly ReturnType<typeof geometry>[], massKg: number) => ({ id, kind, socket,
  compatibilityTag, geometry: Object.freeze(pieces), massKg, health: 90, armour: 12 });

const leftArmParts = Object.freeze([
  part("left-upper-arm", { kind: "capsule", lengthM: 0.55, radiusM: 0.105 }, 8, "piston"),
  part("left-forearm", { kind: "capsule", lengthM: 0.45, radiusM: 0.09 }, 6, "piston"),
  part("left-wrist", { kind: "cylinder", lengthM: 0.20, radiusM: 0.08 }, 3, "bearing"),
  part("left-hand", { kind: "box", sizeM: [0.22, 0.16, 0.25] }, 4),
]);
const leftArmJoints = Object.freeze([
  joint("left-shoulder", "torso", "left-upper-arm", [-0.42, 0.25, 0], [0, 0.275, 0], "x", -0.95, 0.95),
  joint("left-elbow", "left-upper-arm", "left-forearm", [0, -0.275, 0], [0, 0.225, 0], "x", -1.25, 0.35),
  joint("left-wrist", "left-forearm", "left-wrist", [0, -0.225, 0], [0, 0.10, 0], "x", -0.75, 0.75, 150),
  joint("left-palm", "left-wrist", "left-hand", [0, -0.10, 0], [0, 0.08, 0.03], "x", -0.55, 0.55, 150),
]);

const leg = (side: "left" | "right", x: number) => {
  // Heavy-stone chassis experiment, mass only: thigh/shin/ankle/foot were
  // 18/14/6/18 kg. Geometry and the two contact leaves deliberately do not move.
  const parts = Object.freeze([
    part(`${side}-thigh`, { kind: "capsule", lengthM: 0.32, radiusM: 0.12 }, 60, "piston"),
    part(`${side}-shin`, { kind: "capsule", lengthM: 0.30, radiusM: 0.10 }, 50, "piston"),
    part(`${side}-ankle`, { kind: "cylinder", lengthM: 0.12, radiusM: 0.085 }, 25, "bearing"),
    part(`${side}-foot`, { kind: "box", sizeM: [0.40, 0.14, 0.55] }, 80),
  ]);
  // The initial 300/220/260/180/180 Nm, damping-8 leg was sized like a human
  // exoskeleton but drives a roughly 200 kg stone body. These are actuator values,
  // not solver support: every correction still crosses the declared joint motors.
  const hip = joint(`${side}-hip`, "pelvis", `${side}-thigh`, [x, -0.11, 0], [0, 0.16, 0],
    "x", -0.9, 0.9, 1000, 18);
  const joints = Object.freeze([
    Object.freeze({ ...hip, angularAxes: Object.freeze([...hip.angularAxes,
      Object.freeze({ id: "y" as const, minRad: -0.45, maxRad: 0.45, damping: 18,
        maxTorqueNm: 750, maxSpeedRadS: 4.2 })]) }),
    joint(`${side}-knee`, `${side}-thigh`, `${side}-shin`, [0, -0.16, 0], [0, 0.15, 0],
      "x", -1.25, 0.35, 900, 16),
    joint(`${side}-ankle`, `${side}-shin`, `${side}-ankle`, [0, -0.15, 0], [0, 0.06, 0],
      "x", -0.75, 0.75, 650, 16),
    joint(`${side}-sole`, `${side}-ankle`, `${side}-foot`, [0, -0.06, 0], [0, 0.07, 0.04],
      "x", -0.55, 0.55, 500, 14),
  ]);
  return { parts, joints };
};
const leftLeg = leg("left", -0.19); const rightLeg = leg("right", 0.19);

const bodyParts = Object.freeze([
  part("torso", { kind: "box", sizeM: [0.72, 0.78, 0.34] }, 52, "core", true),
  // Pelvis was 70 kg; 180 kg makes the authored identity a bottom-heavy stone golem.
  part("pelvis", { kind: "box", sizeM: [0.60, 0.22, 0.30] }, 180, "core"),
  part("neck", { kind: "cylinder", lengthM: 0.16, radiusM: 0.10 }, 4, "bearing"),
  part("head", { kind: "sphere", radiusM: 0.22 }, 10, "core"),
  ...leftArmParts, ...leftLeg.parts, ...rightLeg.parts,
  part("sword-shoulder-yaw", { kind: "cylinder", lengthM: 0.18, radiusM: 0.13 }, 6, "bearing"),
  part("sword-arm-pitch", { kind: "capsule", lengthM: 0.58, radiusM: 0.10 }, 8, "piston"),
]);
const bodyJoints = Object.freeze([
  // Waist was 380 Nm/damping 8 before the same golem-scale correction.
  joint("waist", "torso", "pelvis", [0, -0.39, 0], [0, 0.11, 0], "z", -0.22, 0.22, 1200, 18),
  joint("neck-bearing", "torso", "neck", [0, 0.39, 0], [0, -0.08, 0], "y", -0.55, 0.55, 100),
  joint("head-bearing", "neck", "head", [0, 0.08, 0], [0, -0.22, 0], "y", -0.35, 0.35, 80),
  ...leftArmJoints, ...leftLeg.joints, ...rightLeg.joints,
  joint("sword-yaw", "torso", "sword-shoulder-yaw", [0.42, 0.25, 0], [0, -0.09, 0], "y", -2.5, 2.5, 900),
  joint("sword-pitch", "sword-shoulder-yaw", "sword-arm-pitch", [0, 0.09, 0], [0, 0.29, 0], "x", -0.75, 1.65, 650),
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
  Object.freeze({ id: "opponent-range", unit: "metres", source: "opponent" }),
  Object.freeze({ id: "opponent-relative-speed", unit: "metres-per-second", source: "opponent" }),
  ...["x", "y", "z"].flatMap((axis) => [
    Object.freeze({ id: `opponent-local-${axis}`, unit: "metres" as const, source: "opponent" as const }),
    Object.freeze({ id: `opponent-local-v${axis}`, unit: "metres-per-second" as const, source: "opponent" as const }),
  ]),
  Object.freeze({ id: "line-of-sight", unit: "boolean", source: "opponent" }),
  ...CONTACTS.flatMap(({ role }) => [
    Object.freeze({ id: `contact-${role}`, unit: "boolean" as const, source: "contact" as const }),
    Object.freeze({ id: `slip-${role}`, unit: "metres-per-second" as const, source: "contact" as const }),
  ]),
]);

export function humanoidBlueprint(): ConstructBlueprint {
  const sockets = [
    ...CONTACTS.map(({ socket, part: owner }) => ({ id: socket, part: owner, frame: frame([0, -0.08, 0]), accepts: ["contact-sensor"] })),
    { id: "socket-sword-hand", part: "sword-arm-pitch", frame: frame([0, -0.29, 0]), accepts: ["dorsal-weapon"] },
    { id: "socket-face-sensor", part: "head", frame: frame([0, 0, 0.20]), accepts: ["sensor"] },
    { id: "socket-heart", part: "torso", frame: frame([0, 0, -0.15]), accepts: ["power-core"] },
  ];
  const modules = [
    ...CONTACTS.map(({ role, module, socket }) => Object.freeze({ ...moduleBase(module, "contact-sensor", socket,
      "contact-sensor", [geometry("pad", { kind: "box", sizeM: [0.38, 0.08, 0.50] }, "plate")], 2),
      sensorChannels: Object.freeze([`contact-${role}`, `slip-${role}`]) })),
    Object.freeze({ ...moduleBase("effigy-sight", "opponent-sensor", "socket-face-sensor", "sensor",
      [geometry("face", { kind: "box", sizeM: [0.22, 0.14, 0.08] }, "plate")], 2),
      sensorChannels: Object.freeze(HUMANOID_SENSORS.map(({ id }) => id).filter((id) => !id.startsWith("contact-") && !id.startsWith("slip-"))) }),
    Object.freeze({ ...moduleBase("effigy-heart", "power-core", "socket-heart", "power-core",
      [geometry("heart", { kind: "sphere", radiusM: 0.11 }, "core")], 7), capacityJ: 24_000, maxOutputW: 620 }),
    Object.freeze({ ...moduleBase("effigy-sword", "sword", "socket-sword-hand", "dorsal-weapon", [
      geometry("grip", { kind: "cylinder", lengthM: 0.18, radiusM: 0.05 }, "bearing"),
      geometry("guard", { kind: "box", sizeM: [0.34, 0.08, 0.08] }, "bearing", [0, 0, 0.08]),
      geometry("blade", { kind: "box", sizeM: [0.10, 0.05, 1.05] }, "plate", [0, 0, 0.58]),
    ], 6), striker: Object.freeze({ localTipM: [0, 0, 1.105] as const,
      localEdgeDirection: [1, 0, 0] as const, localFlatDirection: [0, 1, 0] as const, damageScale: 1.15 }) }),
  ];
  return validateBlueprint({ version: 1, id: "swordbearer-effigy", rootPart: "torso",
    parts: bodyParts, joints: bodyJoints, sockets, modules });
}

export function humanoidControl(): ConstructControlGraph {
  const locomotionJoints = CONTACTS.flatMap(({ role }) => chain(role));
  const postureJoints = ["waist", "neck-bearing", "head-bearing", "left-shoulder", "left-elbow", "left-wrist", "left-palm"];
  return validateControlGraph({ version: 1, groups: [
    { id: "locomotion", joints: locomotionJoints, modules: CONTACTS.map(({ module }) => module),
      bindings: Object.fromEntries(CONTACTS.map(({ role, module }) => [role, { joints: chain(role), modules: [module] }])) },
    { id: "sword-arm", joints: ["sword-yaw", "sword-pitch"], modules: ["effigy-sword"], bindings: {
      yaw: { joints: ["sword-yaw"], modules: [] }, pitch: { joints: ["sword-pitch"], modules: [] },
      output: { joints: [], modules: ["effigy-sword"] }, sword: { joints: [], modules: ["effigy-sword"] },
    } },
    { id: "posture", joints: postureJoints, modules: [], bindings: {} },
    { id: "whole-body", joints: bodyJoints.map(({ id }) => id), modules: [], bindings: {} },
  ], actions: [
    { id: "hold", controller: "hold-joints", group: "whole-body", claims: [], parameters: {} },
    { id: "stabilize", controller: "hold-joints", group: "posture", claims: [], parameters: {} },
    // The first biped gait writes legitimate motors but falls and travels backwards in a real
    // Havok probe. This fixed body therefore does not advertise move/turn until they earn a
    // two-facing physical gate; accepting a request the chassis cannot honour would be worse.
    { id: "brace", controller: "biped-brace", group: "locomotion", claims: ["resource:balance"], parameters: {} },
    { id: "aim", controller: "aim-direction", group: "sword-arm",
      claims: ["resource:power-mount", "resource:sensor-line-of-sight"], parameters: {
        yaw: { kind: "number", min: -2.5, max: 2.5, unit: "radians" },
        pitch: { kind: "number", min: -0.75, max: 1.65, unit: "radians" },
      } },
    { id: "sweep", controller: "sweep-compact-arc", group: "sword-arm",
      claims: ["module:effigy-sword", "resource:power-mount", "resource:sensor-line-of-sight"],
      parameters: { direction: { kind: "number", min: -1, max: 1, unit: "scalar" } } },
    { id: "guard", controller: "guard-mount", group: "sword-arm",
      claims: ["module:effigy-sword", "resource:power-mount", "resource:sensor-line-of-sight"], parameters: {} },
  ] });
}

export function humanoidProgram(): ConstructProgram {
  const control = humanoidControl();
  return swordbearerDuelistProgram(control, HUMANOID_SENSORS);
}

export function humanoidSavedConstruct(): SavedConstruct {
  return saveConstruct("Swordbearer Effigy", humanoidBlueprint(), humanoidControl(), humanoidProgram(), HUMANOID_SENSORS);
}
