import { validateControlGraph, type ActionSpec, type ConstructControlGraph } from "./actions.ts";
import { validateBlueprint, type AttachmentFrame, type ConstructBlueprint, type JointSpec, type PartSpec } from "./blueprint.ts";
import type { ConstructProgram, ProgramRule } from "./program.ts";
import type { SensorSpec } from "./sensors.ts";

const I = [0, 0, 0, 1] as const;
const X_QUARTER_TURN = [0.7071067811865476, 0, 0, 0.7071067811865476] as const;
const frame = (positionM: readonly [number, number, number] = [0, 0, 0],
  rotation: readonly [number, number, number, number] = I): AttachmentFrame =>
  Object.freeze({ positionM: Object.freeze([...positionM]) as [number, number, number],
    rotation: Object.freeze([...rotation]) as [number, number, number, number] });

const part = (
  id: string,
  shape: PartSpec["shape"],
  massKg: number,
  style: PartSpec["shell"]["style"] = "plate",
  vitalityWeight = 0,
  fatal = false,
): PartSpec => Object.freeze({
  id, shape: Object.freeze(shape), massKg, centreOfMassM: Object.freeze([0, 0, 0] as const),
  shell: Object.freeze({ style, visualClearanceM: style === "plate" || style === "core" || style === "piston" ? 0.008 : 0.003 }),
  health: fatal ? 500 : 120,
  armour: fatal ? 42 : 18,
  vitalityWeight,
  fatal,
  friction: id.endsWith("foot") ? 1.05 : 0.72,
  restitution: 0.04,
});

const bearing = (
  id: string,
  parentPart: string,
  childPart: string,
  parentPosition: readonly [number, number, number],
  childPosition: readonly [number, number, number],
  axis: readonly [number, number, number],
  min: number,
  max: number,
  force = 240,
  speed = 4.2,
): JointSpec => Object.freeze({
  id, parentPart, childPart, parentFrame: frame(parentPosition), childFrame: frame(childPosition),
  angularAxes: Object.freeze([Object.freeze({ id: axis[0] === 1 ? "x" as const : axis[1] === 1 ? "y" as const : "z" as const,
    minRad: min, maxRad: max, damping: 8, maxTorqueNm: force, maxSpeedRadS: speed })]),
  health: 160, armour: 12,
});

type Corner = Readonly<{ id: "front-left" | "front-right" | "rear-left" | "rear-right"; x: number; z: number }>;
export const WARDEN_LIMB_ATTACHMENTS: readonly Corner[] = Object.freeze([
  Object.freeze({ id: "front-left", x: -0.48, z: 0.34 }),
  Object.freeze({ id: "front-right", x: 0.48, z: 0.34 }),
  Object.freeze({ id: "rear-left", x: -0.48, z: -0.34 }),
  Object.freeze({ id: "rear-right", x: 0.48, z: -0.34 }),
]);

/** One frozen physical template; attachment frames are the only per-corner difference. */
export const WARDEN_LIMB_TEMPLATE = Object.freeze({
  upper: Object.freeze({ shape: Object.freeze({ kind: "capsule", lengthM: 0.42, radiusM: 0.105 }), massKg: 8 }),
  lower: Object.freeze({ shape: Object.freeze({ kind: "capsule", lengthM: 0.38, radiusM: 0.09 }), massKg: 6 }),
  ankle: Object.freeze({ shape: Object.freeze({ kind: "capsule", lengthM: 0.20, radiusM: 0.075 }), massKg: 3 }),
  foot: Object.freeze({ shape: Object.freeze({ kind: "box", sizeM: Object.freeze([0.25, 0.13, 0.34]) }), massKg: 4 }),
});

const limbParts = WARDEN_LIMB_ATTACHMENTS.flatMap(({ id }) => [
  part(`limb-${id}-upper`, WARDEN_LIMB_TEMPLATE.upper.shape as PartSpec["shape"], WARDEN_LIMB_TEMPLATE.upper.massKg),
  part(`limb-${id}-lower`, WARDEN_LIMB_TEMPLATE.lower.shape as PartSpec["shape"], WARDEN_LIMB_TEMPLATE.lower.massKg),
  part(`limb-${id}-ankle`, WARDEN_LIMB_TEMPLATE.ankle.shape as PartSpec["shape"], WARDEN_LIMB_TEMPLATE.ankle.massKg),
  part(`limb-${id}-foot`, WARDEN_LIMB_TEMPLATE.foot.shape as PartSpec["shape"], WARDEN_LIMB_TEMPLATE.foot.massKg),
]);

const limbJoints = WARDEN_LIMB_ATTACHMENTS.flatMap(({ id, x, z }) => [
  bearing(`bearing-${id}-upper`, "core", `limb-${id}-upper`, [x, -0.20, z], [0, 0.21, 0], [1, 0, 0], -0.9, 0.9),
  bearing(`bearing-${id}-lower`, `limb-${id}-upper`, `limb-${id}-lower`, [0, -0.21, 0], [0, 0.19, 0], [1, 0, 0], -1.25, 0.35),
  bearing(`bearing-${id}-ankle`, `limb-${id}-lower`, `limb-${id}-ankle`, [0, -0.19, 0], [0, 0.10, 0], [1, 0, 0], -0.75, 0.75, 150),
  bearing(`bearing-${id}-foot`, `limb-${id}-ankle`, `limb-${id}-foot`, [0, -0.10, 0], [0, 0.065, 0.04], [1, 0, 0], -0.55, 0.55, 150),
]);

const baseParts: readonly PartSpec[] = Object.freeze([
  part("core", { kind: "box", sizeM: [1.12, 0.58, 0.82] }, 92, "core", 1, true),
  ...limbParts,
  part("dorsal-yaw", { kind: "cylinder", lengthM: 0.24, radiusM: 0.17 }, 7, "bearing"),
  part("dorsal-pitch", { kind: "box", sizeM: [0.32, 0.18, 0.26] }, 6, "bearing"),
  part("sensor-mast", { kind: "capsule", lengthM: 0.42, radiusM: 0.07 }, 3, "piston"),
  part("shield-bearing", { kind: "cylinder", lengthM: 0.22, radiusM: 0.16 }, 6, "bearing"),
]);

const baseJoints: readonly JointSpec[] = Object.freeze([
  ...limbJoints,
  bearing("bearing-dorsal-yaw", "core", "dorsal-yaw", [0, 0.29, -0.05], [0, -0.12, 0], [0, 1, 0], -2.5, 2.5, 900, 8),
  bearing("bearing-dorsal-pitch", "dorsal-yaw", "dorsal-pitch", [0, 0.12, 0], [0, -0.09, 0], [1, 0, 0], -0.75, 0.65, 650, 6),
  bearing("bearing-sensor-mast", "core", "sensor-mast", [0, 0.29, 0.24], [0, -0.21, 0], [0, 1, 0], -0.55, 0.55, 80),
  bearing("bearing-shield", "core", "shield-bearing", [-0.56, 0.02, 0.05], [0, -0.11, 0], [0, 0, 1], -0.55, 0.55, 170),
]);

const baseSockets = Object.freeze([
  ...WARDEN_LIMB_ATTACHMENTS.map(({ id }) => Object.freeze({ id: `socket-${id}-foot`, part: `limb-${id}-foot`,
    frame: frame([0, -0.065, 0]), accepts: Object.freeze(["contact-sensor"]) })),
  Object.freeze({ id: "socket-dorsal-output", part: "dorsal-pitch", frame: frame([0, 0.09, 0.13]),
    accepts: Object.freeze(["dorsal-weapon"]) }),
  Object.freeze({ id: "socket-sensor", part: "sensor-mast", frame: frame([0, 0.21, 0]),
    accepts: Object.freeze(["sensor"]) }),
  Object.freeze({ id: "socket-shield", part: "shield-bearing", frame: frame([0, 0.11, 0]),
    accepts: Object.freeze(["shield"]) }),
  Object.freeze({ id: "socket-power", part: "core", frame: frame([0, 0, -0.30]),
    accepts: Object.freeze(["power-core"]) }),
  Object.freeze({ id: "socket-magazine", part: "core", frame: frame([0, 0, 0.30]),
    accepts: Object.freeze(["magazine"]) }),
]);

const geometry = (id: string, shape: PartSpec["shape"], style: PartSpec["shell"]["style"],
  position: readonly [number, number, number] = [0, 0, 0],
  rotation: readonly [number, number, number, number] = I) => Object.freeze({ id, frame: frame(position, rotation),
    shape: Object.freeze(shape), shell: Object.freeze({ style, visualClearanceM: style === "bearing" ? 0.002 : 0.006 }) });
const moduleBase = (id: string, kind: import("./blueprint.ts").ModuleKind, socket: string,
  compatibilityTag: string, pieces: readonly ReturnType<typeof geometry>[], massKg: number) => ({ id, kind,
    socket, compatibilityTag, geometry: Object.freeze(pieces), massKg, health: 80, armour: 10 });

const commonModules = Object.freeze([
  ...WARDEN_LIMB_ATTACHMENTS.map(({ id }) => Object.freeze({ ...moduleBase(`foot-${id}`, "contact-sensor",
    `socket-${id}-foot`, "contact-sensor", [geometry("pad", { kind: "box", sizeM: [0.34, 0.08, 0.44] }, "plate")], 2),
    sensorChannels: Object.freeze([`contact-foot-${id}`, `slip-foot-${id}`]) })),
  Object.freeze({ ...moduleBase("warden-sensor", "opponent-sensor", "socket-sensor", "sensor",
    [geometry("housing", { kind: "box", sizeM: [0.20, 0.15, 0.24] }, "plate"),
      geometry("lens", { kind: "sphere", radiusM: 0.045 }, "bearing", [0, 0, 0.13])], 2),
    sensorChannels: Object.freeze(["core-upright", "core-roll-rad", "core-pitch-rad",
      "line-of-sight", "opponent-range", "opponent-relative-speed",
      "opponent-local-x", "opponent-local-y", "opponent-local-z",
      "opponent-local-vx", "opponent-local-vy", "opponent-local-vz"]) }),
  Object.freeze(moduleBase("warden-shield", "shield", "socket-shield", "shield",
    [geometry("plate", { kind: "box", sizeM: [0.72, 0.84, 0.09] }, "plate", [0, 0, 0.10]),
      geometry("boss", { kind: "cylinder", lengthM: 0.08, radiusM: 0.11 }, "bearing", [0, 0, 0.17])], 14)),
  Object.freeze({ ...moduleBase("warden-power", "power-core", "socket-power", "power-core",
    [geometry("core", { kind: "sphere", radiusM: 0.12 }, "core")], 8), capacityJ: 24_000, maxOutputW: 520 }),
  Object.freeze({ ...moduleBase("dorsal-magazine", "magazine", "socket-magazine", "magazine",
    [geometry("cartridge", { kind: "box", sizeM: [0.20, 0.18, 0.28] }, "plate")], 5), ammunition: 18 }),
]);

const weaponModule = (variant: "crossbow" | "sword") => variant === "crossbow"
  ? Object.freeze({ ...moduleBase("dorsal-crossbow", "launcher", "socket-dorsal-output", "dorsal-weapon",
      [geometry("stock", { kind: "box", sizeM: [0.16, 0.15, 0.48] }, "plate"),
        geometry("rail", { kind: "box", sizeM: [0.055, 0.055, 0.58] }, "bearing", [0, 0.07, 0.02])], 9),
      maxHeatJ: 1200, coolingW: 65, reloadSeconds: 0.65, heatPerShotJ: 85, energyPerShotJ: 160,
      projectile: Object.freeze({ poolSize: 24, massKg: 0.12, radiusM: 0.018, lengthM: 0.34,
        muzzleSpeedMps: 42, damageScale: 1.15 }) })
  : Object.freeze({ ...moduleBase("dorsal-sword", "sword", "socket-dorsal-output", "dorsal-weapon",
      [geometry("socket", { kind: "cylinder", lengthM: 0.16, radiusM: 0.06 }, "bearing", [0, 0, 0], X_QUARTER_TURN),
        geometry("blade", { kind: "box", sizeM: [0.10, 1.10, 0.035] }, "plate", [0, 0, 0.60], X_QUARTER_TURN)], 11),
      striker: Object.freeze({ localTipM: Object.freeze([0, 0, 1.15]) as readonly [number, number, number],
        localEdgeDirection: Object.freeze([1, 0, 0]) as readonly [number, number, number],
        localFlatDirection: Object.freeze([0, -1, 0]) as readonly [number, number, number], damageScale: 1.2 }) });

export function wardenBlueprint(variant: "crossbow" | "sword" = "crossbow"): ConstructBlueprint {
  const modules = variant === "crossbow" ? commonModules : commonModules.filter(({ kind }) => kind !== "magazine");
  return validateBlueprint({
    version: 1,
    id: `warden-${variant}`,
    rootPart: "core",
    parts: baseParts,
    joints: baseJoints,
    sockets: baseSockets,
    modules: [...modules, weaponModule(variant)],
  });
}

const locomotionJoints = Object.freeze(limbJoints.map(({ id }) => id));
const footModules = Object.freeze(WARDEN_LIMB_ATTACHMENTS.map(({ id }) => `foot-${id}`));

export function wardenControl(variant: "crossbow" | "sword" = "crossbow"): ConstructControlGraph {
  const weapon = variant === "crossbow" ? "dorsal-crossbow" : "dorsal-sword";
  const weaponAction: ActionSpec = variant === "crossbow"
    ? { id: "fire", controller: "fire-projectile", group: "dorsal-mount",
        claims: ["module:dorsal-crossbow", "module:dorsal-magazine", "resource:power-mount", "resource:ammo-dorsal-magazine",
          "resource:sensor-line-of-sight"], parameters: {} }
    : { id: "cut", controller: "sweep-arc", group: "dorsal-mount",
        claims: ["module:dorsal-sword", "resource:power-mount", "resource:sensor-line-of-sight"], parameters: {
          direction: { kind: "number", min: -1, max: 1, unit: "scalar" },
        } };
  return validateControlGraph({
    version: 1,
    groups: [
      { id: "locomotion", joints: locomotionJoints, modules: footModules,
        bindings: Object.fromEntries(WARDEN_LIMB_ATTACHMENTS.map(({ id }) => [id, {
          joints: [`bearing-${id}-upper`, `bearing-${id}-lower`, `bearing-${id}-ankle`, `bearing-${id}-foot`],
          modules: [`foot-${id}`],
        }])) },
      { id: "dorsal-mount", joints: ["bearing-dorsal-yaw", "bearing-dorsal-pitch"],
        modules: variant === "crossbow" ? [weapon, "dorsal-magazine"] : [weapon],
        bindings: { yaw: { joints: ["bearing-dorsal-yaw"], modules: [] },
          pitch: { joints: ["bearing-dorsal-pitch"], modules: [] }, output: { joints: [],
            modules: variant === "crossbow" ? [weapon, "dorsal-magazine"] : [weapon] },
          ...(variant === "crossbow" ? { launcher: { joints: [], modules: [weapon] } }
            : { sword: { joints: [], modules: [weapon] } }) } },
      { id: "shield", joints: ["bearing-shield"], modules: ["warden-shield"],
        bindings: { bearing: { joints: ["bearing-shield"], modules: ["warden-shield"] } } },
      { id: "whole-body", joints: baseJoints.map(({ id }) => id), modules: [], bindings: {} },
    ],
    actions: [
      { id: "hold", controller: "hold-joints", group: "whole-body", claims: [], parameters: {} },
      { id: "move", controller: "quadruped-move", group: "locomotion", claims: ["resource:balance"], parameters: {
        forward: { kind: "number", min: -1, max: 1, unit: "scalar" },
        right: { kind: "number", min: -1, max: 1, unit: "scalar" },
        speed: { kind: "number", min: 0, max: 2.2, unit: "metres-per-second" },
      } },
      { id: "turn", controller: "quadruped-turn", group: "locomotion", claims: ["resource:balance"], parameters: {
        yaw: { kind: "number", min: -1, max: 1, unit: "scalar" },
      } },
      { id: "brace", controller: "brace", group: "locomotion", claims: ["resource:balance"], parameters: {} },
      { id: "recover", controller: "recover", group: "locomotion", claims: ["resource:balance"], parameters: {} },
      { id: "aim", controller: "aim-direction", group: "dorsal-mount",
        claims: ["resource:power-mount", "resource:sensor-line-of-sight"], parameters: {
          yaw: { kind: "number", min: -2.5, max: 2.5, unit: "radians" },
          pitch: { kind: "number", min: -0.75, max: 0.65, unit: "radians" },
        } },
      ...(variant === "crossbow" ? [{ id: "track", controller: "track-target", group: "dorsal-mount",
        claims: ["module:dorsal-crossbow", "resource:power-mount", "resource:sensor-line-of-sight"],
        parameters: {} }] : []),
      weaponAction,
      ...(variant === "sword" ? [{ id: "guard", controller: "guard-mount", group: "dorsal-mount",
        claims: ["module:dorsal-sword", "resource:power-mount", "resource:sensor-line-of-sight"], parameters: {} }] : []),
      { id: "cover", controller: "turn-joint-to-angle", group: "shield", claims: [], parameters: {
        joint: { kind: "enum", values: ["bearing-shield"] },
        "angle-rad": { kind: "number", min: -0.55, max: 0.55, unit: "radians" },
      } },
    ],
  });
}

export const WARDEN_SENSORS: readonly SensorSpec[] = Object.freeze([
  Object.freeze({ id: "core-upright", unit: "boolean", source: "self" }),
  Object.freeze({ id: "core-roll-rad", unit: "radians", source: "self" }),
  Object.freeze({ id: "core-pitch-rad", unit: "radians", source: "self" }),
  Object.freeze({ id: "opponent-range", unit: "metres", source: "opponent" }),
  Object.freeze({ id: "opponent-relative-speed", unit: "metres-per-second", source: "opponent" }),
  Object.freeze({ id: "opponent-local-x", unit: "metres", source: "opponent" }),
  Object.freeze({ id: "opponent-local-y", unit: "metres", source: "opponent" }),
  Object.freeze({ id: "opponent-local-z", unit: "metres", source: "opponent" }),
  Object.freeze({ id: "opponent-local-vx", unit: "metres-per-second", source: "opponent" }),
  Object.freeze({ id: "opponent-local-vy", unit: "metres-per-second", source: "opponent" }),
  Object.freeze({ id: "opponent-local-vz", unit: "metres-per-second", source: "opponent" }),
  Object.freeze({ id: "line-of-sight", unit: "boolean", source: "opponent" }),
  ...WARDEN_LIMB_ATTACHMENTS.map(({ id }) => Object.freeze({
    id: `contact-foot-${id}`, unit: "boolean" as const, source: "contact" as const,
  })),
  ...WARDEN_LIMB_ATTACHMENTS.map(({ id }) => Object.freeze({
    id: `slip-foot-${id}`, unit: "metres-per-second" as const, source: "contact" as const,
  })),
]);

export function wardenProgram(variant: "crossbow" | "sword" = "crossbow"): ConstructProgram {
  const attack = variant === "crossbow" ? "fire" : "cut";
  const attackParameters: ProgramRule["parameters"] = variant === "sword"
    ? Object.freeze({ direction: Object.freeze({ kind: "expression", value: Object.freeze({ op: "constant", value: 1 }) }) })
    : Object.freeze({});
  const rules: readonly ProgramRule[] = Object.freeze([
    Object.freeze({ id: "recover-when-fallen", action: "recover", priority: 40, optional: false, dwellS: 0.2,
      condition: Object.freeze({ op: "not", value: Object.freeze({ op: "sensor", id: "core-upright" }) }),
      utility: Object.freeze({ op: "constant", value: 100 }), parameters: Object.freeze({}) }),
    Object.freeze({ id: "attack-in-range", action: attack, priority: 25, optional: true, dwellS: 0.1,
      condition: Object.freeze({ op: "and", values: Object.freeze([
        Object.freeze({ op: "sensor", id: "line-of-sight" }),
        Object.freeze({ op: "lt", left: Object.freeze({ op: "sensor", id: "opponent-range" }),
          right: Object.freeze({ op: "constant", value: variant === "crossbow" ? 8 : 2.2, unit: "metres" }) }),
      ]) }), utility: Object.freeze({ op: "constant", value: 20 }), parameters: attackParameters }),
    ...(variant === "sword" ? [Object.freeze({ id: "guard-while-closing", action: "guard", priority: 18,
      optional: true, dwellS: 0.2, condition: Object.freeze({ op: "and", values: Object.freeze([
        Object.freeze({ op: "sensor", id: "line-of-sight" }),
        Object.freeze({ op: "gt", left: Object.freeze({ op: "sensor", id: "opponent-range" }),
          right: Object.freeze({ op: "constant", value: 2.2, unit: "metres" }) }),
      ]) }), utility: Object.freeze({ op: "constant", value: 8 }), parameters: Object.freeze({}) })] : []),
    Object.freeze({ id: "close-distance", action: "move", priority: 10, optional: false, dwellS: 0.2,
      condition: Object.freeze({ op: "and", values: Object.freeze([
        Object.freeze({ op: "sensor", id: "core-upright" }),
        Object.freeze({ op: "gt", left: Object.freeze({ op: "sensor", id: "opponent-range" }),
          right: Object.freeze({ op: "constant", value: 2, unit: "metres" }) }),
      ]) }),
      utility: Object.freeze({ op: "constant", value: 5 }), parameters: Object.freeze({
        forward: Object.freeze({ kind: "expression", value: Object.freeze({ op: "constant", value: 1 }) }),
        right: Object.freeze({ kind: "expression", value: Object.freeze({ op: "constant", value: 0 }) }),
        speed: Object.freeze({ kind: "expression", value: Object.freeze({
          op: "constant", value: 1.1, unit: "metres-per-second",
        }) }),
      }) }),
    Object.freeze({ id: "brace-in-range", action: "brace", priority: 10, optional: false, dwellS: 0.1,
      condition: Object.freeze({ op: "and", values: Object.freeze([
        Object.freeze({ op: "sensor", id: "core-upright" }),
        Object.freeze({ op: "lt", left: Object.freeze({ op: "sensor", id: "opponent-range" }),
          right: Object.freeze({ op: "constant", value: 2, unit: "metres" }) }),
      ]) }), utility: Object.freeze({ op: "constant", value: 4 }), parameters: Object.freeze({}) }),
    Object.freeze({ id: "cover", action: "cover", priority: 15, optional: false, dwellS: 0.1,
      condition: Object.freeze({ op: "sensor", id: "line-of-sight" }),
      utility: Object.freeze({ op: "constant", value: 3 }), parameters: Object.freeze({
        joint: Object.freeze({ kind: "enum", value: "bearing-shield" }),
        "angle-rad": Object.freeze({ kind: "expression", value: Object.freeze({
          op: "constant", value: 0.3, unit: "radians",
        }) }),
      }) }),
  ]);
  return Object.freeze({
    version: 1,
    id: `warden-mind-${variant}`,
    rules,
  });
}
