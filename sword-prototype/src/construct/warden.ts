import { validateControlGraph, type ActionSpec, type ConstructControlGraph } from "./actions.ts";
import { validateBlueprint, type AttachmentFrame, type ConstructBlueprint, type JointSpec, type PartSpec } from "./blueprint.ts";
import type { ConstructProgram, ProgramRule } from "./program.ts";
import type { SensorSpec } from "./sensors.ts";
import { SUPPORTED_QUADRUPED_CRAWL_V1 } from "./locomotion.ts";

const I = [0, 0, 0, 1] as const;
const X_QUARTER_TURN = [0.7071067811865476, 0, 0, 0.7071067811865476] as const;
export const WARDEN_SWORD_BIND = Object.freeze({ socketForwardM: 0.55, historicalSocketForwardM: 0.13 });
const yRotation = (radians: number): readonly [number, number, number, number] =>
  Object.freeze([0, Math.sin(radians / 2), 0, Math.cos(radians / 2)] as const);
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
  health: fatal ? 15 : 6,
  armour: fatal ? 2.1 : 0.9,
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
  health: 8, armour: 0.6,
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
  // The shield is a one-bearing flail arm, not a plate rotated in place on the flank. Its
  // Y bearing sweeps the real compound leaf from an outside chamber into the frontal lane.
  bearing("bearing-shield", "core", "shield-bearing", [-0.56, 0.02, 0.05], [0, -0.11, 0], [0, 1, 0], -0.55, 0.55, 170),
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
    socket, compatibilityTag, geometry: Object.freeze(pieces), massKg, health: 4, armour: 0.5 });

const commonModules = Object.freeze([
  ...WARDEN_LIMB_ATTACHMENTS.map(({ id }) => Object.freeze({ ...moduleBase(`foot-${id}`, "contact-sensor",
    `socket-${id}-foot`, "contact-sensor", [geometry("pad", { kind: "box", sizeM: [0.34, 0.08, 0.44] }, "plate")], 2),
    sensorChannels: Object.freeze([`contact-foot-${id}`, `slip-foot-${id}`]) })),
  Object.freeze({ ...moduleBase("warden-sensor", "opponent-sensor", "socket-sensor", "sensor",
    [geometry("housing", { kind: "box", sizeM: [0.20, 0.15, 0.24] }, "plate"),
      geometry("lens", { kind: "sphere", radiusM: 0.045 }, "bearing", [0, 0, 0.13])], 2),
    sensorChannels: Object.freeze(["core-upright", "core-roll-rad", "core-pitch-rad",
      "line-of-sight", "opponent-range", "opponent-relative-speed",
      "opponent-upright", "opponent-rising",
      "opponent-local-x", "opponent-local-y", "opponent-local-z",
      "opponent-aim-local-x",
      "opponent-local-vx", "opponent-local-vy", "opponent-local-vz",
      ...WARDEN_LIMB_ATTACHMENTS.map(({ id }) => `joint-live-bearing-${id}-upper`)]) }),
  Object.freeze({ ...moduleBase("warden-shield", "shield", "socket-shield", "shield",
    // The plate is the contact leaf. A short outboard knuckle clears the core at every authored
    // cover/bash angle, and the diagonal stone spar makes the long frontal reach visibly honest.
    // The former side plate rotated around Z, so its contact point moved vertically and could not
    // physically reach a frontal opponent even though the scheduler reported a bash phase.
    [geometry("knuckle", { kind: "box", sizeM: [0.18, 0.12, 0.10] }, "bearing", [-0.20, 0, 0.10]),
      geometry("brace", { kind: "box", sizeM: [0.12, 0.12, 0.64] }, "bearing",
        [-0.275, 0, 0.41], yRotation(-0.253)),
      geometry("plate", { kind: "box", sizeM: [0.75, 0.50, 0.09] }, "plate", [-0.35, 0, 0.75]),
      geometry("boss", { kind: "cylinder", lengthM: 0.08, radiusM: 0.08 }, "bearing",
        [-0.35, 0, 0.80], X_QUARTER_TURN)], 14),
    mountedContactStriker: Object.freeze({ kind: "authored-shove" as const,
      localContactPoint: Object.freeze([-0.35, 0, 0.795]) as readonly [number, number, number],
      shoveSpecificImpulseMps: 0.008 }) }),
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
        muzzleSpeedMps: 42, penetrationEfficiency: 1 }) })
  : Object.freeze({ ...moduleBase("dorsal-sword", "sword", "socket-dorsal-output", "dorsal-weapon",
      [geometry("pedestal", { kind: "box", sizeM: [0.12, 0.12, 0.42] }, "bearing", [0, 0, -0.21]),
        geometry("socket", { kind: "cylinder", lengthM: 0.16, radiusM: 0.06 }, "bearing", [0, 0, 0], X_QUARTER_TURN),
        geometry("blade", { kind: "box", sizeM: [0.10, 1.10, 0.035] }, "plate", [0, 0, 0.60], X_QUARTER_TURN)], 11),
      striker: Object.freeze({ localTipM: Object.freeze([0, 0, 1.15]) as readonly [number, number, number],
        localEdgeDirection: Object.freeze([1, 0, 0]) as readonly [number, number, number],
        localFlatDirection: Object.freeze([0, -1, 0]) as readonly [number, number, number], damageScale: 1.2 }) });

export function wardenBlueprint(variant: "crossbow" | "sword" = "crossbow"): ConstructBlueprint {
  const modules = variant === "crossbow" ? commonModules : commonModules.filter(({ kind }) => kind !== "magazine");
  const sockets = variant === "sword" ? baseSockets.map((socket) => socket.id === "socket-dorsal-output"
    ? Object.freeze({ ...socket, frame: frame([0, 0.09, WARDEN_SWORD_BIND.socketForwardM]) }) : socket) : baseSockets;
  return validateBlueprint({
    version: 4,
    id: `warden-${variant}`,
    rootPart: "core",
    parts: baseParts,
    joints: baseJoints,
    sockets,
    modules: [...modules, weaponModule(variant)],
  });
}

const locomotionJoints = Object.freeze(limbJoints.map(({ id }) => id));
const footModules = Object.freeze(WARDEN_LIMB_ATTACHMENTS.map(({ id }) => `foot-${id}`));
const WARDEN_BALANCE_CHAIN = Object.freeze(["bearing-sensor-mast"]);
const WARDEN_CRAWL_MISSING = Object.freeze(WARDEN_LIMB_ATTACHMENTS.map(({ id }) => id));
export type WardenLocomotionMode = "raw" | "assisted";

export function wardenControl(variant: "crossbow" | "sword" = "crossbow",
  locomotionMode: WardenLocomotionMode = "raw"): ConstructControlGraph {
  const weapon = variant === "crossbow" ? "dorsal-crossbow" : "dorsal-sword";
  const locomotionController = (mode: "move" | "turn" | "brace" | "recover") =>
    locomotionMode === "assisted" ? `supported-quadruped-${mode}`
      : mode === "move" || mode === "turn" ? `quadruped-${mode}` : mode;
  const weaponAction: ActionSpec = variant === "crossbow"
    ? { id: "fire", controller: "fire-projectile", group: "dorsal-mount",
        claims: ["module:dorsal-crossbow", "module:dorsal-magazine", "resource:power-mount", "resource:ammo-dorsal-magazine",
          "resource:sensor-line-of-sight"], parameters: {
          "target-lateral-offset": { kind: "number", min: -0.6, max: 0.6, unit: "metres" },
          "target-lane-blend": { kind: "number", min: 0, max: 1, unit: "scalar" },
          "aim-epsilon-rad": { kind: "number", min: 0.004, max: 0.04, unit: "radians" },
          "follow-through-s": { kind: "number", min: 0, max: 0.25, unit: "seconds" },
        } }
    : { id: "cut", controller: "warden-sword-sweep", group: "dorsal-mount",
        claims: ["module:dorsal-sword", "resource:power-mount", "resource:sensor-line-of-sight"], parameters: {
          direction: { kind: "number", min: -1, max: 1, unit: "scalar" },
        } };
  const supportBinding = (id: string) => ({
    joints: [`bearing-${id}-upper`, `bearing-${id}-lower`, `bearing-${id}-ankle`, `bearing-${id}-foot`],
    modules: [`foot-${id}`],
  });
  const crawlGroups = locomotionMode === "assisted" ? WARDEN_CRAWL_MISSING.map((missing) => {
    const supports = WARDEN_LIMB_ATTACHMENTS.map(({ id }) => id).filter((id) => id !== missing);
    return { id: `locomotion-without-${missing}`,
      joints: [...supports.flatMap((id) => supportBinding(id).joints), ...WARDEN_BALANCE_CHAIN],
      modules: supports.flatMap((id) => supportBinding(id).modules),
      bindings: { ...Object.fromEntries(supports.map((id) => [id, supportBinding(id)])),
        "balance-chain": { joints: WARDEN_BALANCE_CHAIN, modules: [] } } };
  }) : [];
  const crawlActions: ActionSpec[] = locomotionMode === "assisted" ? WARDEN_CRAWL_MISSING.map((missing) => ({
    id: `crawl-without-${missing}`, controller: "supported-quadruped-crawl",
    group: `locomotion-without-${missing}`, claims: ["resource:balance"], parameters: {
      forward: { kind: "number", min: -1, max: 1, unit: "scalar" },
      right: { kind: "number", min: -1, max: 1, unit: "scalar" },
      yaw: { kind: "number", min: -1, max: 1, unit: "scalar" },
      speed: { kind: "number", min: 0, max: SUPPORTED_QUADRUPED_CRAWL_V1.MAX_SPEED_MPS,
        unit: "metres-per-second" },
    },
  })) : [];
  return validateControlGraph({
    version: 1,
    groups: [
      { id: "locomotion", joints: locomotionMode === "assisted"
        ? [...locomotionJoints, ...WARDEN_BALANCE_CHAIN] : locomotionJoints, modules: footModules,
        bindings: { ...Object.fromEntries(WARDEN_LIMB_ATTACHMENTS.map(({ id }) => [id, supportBinding(id)])),
          ...(locomotionMode === "assisted" ? {
          "balance-chain": { joints: WARDEN_BALANCE_CHAIN, modules: [] },
        } : {}) } },
      ...crawlGroups,
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
      { id: "move", controller: locomotionController("move"), group: "locomotion", claims: ["resource:balance"], parameters: {
        forward: { kind: "number", min: -1, max: 1, unit: "scalar" },
        right: { kind: "number", min: -1, max: 1, unit: "scalar" },
        speed: { kind: "number", min: 0, max: locomotionMode === "assisted" ? 1.6 : 2.2,
          unit: "metres-per-second" },
      } },
      { id: "turn", controller: locomotionController("turn"), group: "locomotion", claims: ["resource:balance"], parameters: {
        yaw: { kind: "number", min: -1, max: 1, unit: "scalar" },
      } },
      { id: "brace", controller: locomotionController("brace"), group: "locomotion", claims: ["resource:balance"], parameters: {} },
      { id: "recover", controller: locomotionController("recover"), group: "locomotion", claims: ["resource:balance"], parameters: {} },
      ...crawlActions,
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
      { id: "bash", controller: "warden-shield-bash", group: "shield",
        claims: ["module:warden-shield", "resource:power-shield"], parameters: {} },
    ],
  });
}

export const WARDEN_SENSORS: readonly SensorSpec[] = Object.freeze([
  Object.freeze({ id: "core-upright", unit: "boolean", source: "self" }),
  Object.freeze({ id: "core-roll-rad", unit: "radians", source: "self" }),
  Object.freeze({ id: "core-pitch-rad", unit: "radians", source: "self" }),
  Object.freeze({ id: "opponent-range", unit: "metres", source: "opponent" }),
  Object.freeze({ id: "opponent-relative-speed", unit: "metres-per-second", source: "opponent" }),
  Object.freeze({ id: "opponent-upright", unit: "boolean", source: "opponent" }),
  Object.freeze({ id: "opponent-rising", unit: "boolean", source: "opponent" }),
  Object.freeze({ id: "opponent-local-x", unit: "metres", source: "opponent" }),
  Object.freeze({ id: "opponent-local-y", unit: "metres", source: "opponent" }),
  Object.freeze({ id: "opponent-local-z", unit: "metres", source: "opponent" }),
  // Mounted launchers already solve from this blocker-aware geometric lane. The Warden's
  // opponent sensor omitted the channel, so its generic tracker silently fell back to core
  // centre and one deterministic arena side fired through the opposing flank shield forever.
  Object.freeze({ id: "opponent-aim-local-x", unit: "metres", source: "opponent" }),
  Object.freeze({ id: "opponent-local-vx", unit: "metres-per-second", source: "opponent" }),
  Object.freeze({ id: "opponent-local-vy", unit: "metres-per-second", source: "opponent" }),
  Object.freeze({ id: "opponent-local-vz", unit: "metres-per-second", source: "opponent" }),
  Object.freeze({ id: "ammo-dorsal-magazine", unit: "scalar", source: "self" }),
  Object.freeze({ id: "line-of-sight", unit: "boolean", source: "opponent" }),
  ...WARDEN_LIMB_ATTACHMENTS.map(({ id }) => Object.freeze({
    id: `contact-foot-${id}`, unit: "boolean" as const, source: "contact" as const,
  })),
  ...WARDEN_LIMB_ATTACHMENTS.map(({ id }) => Object.freeze({
    id: `slip-foot-${id}`, unit: "metres-per-second" as const, source: "contact" as const,
  })),
  ...WARDEN_LIMB_ATTACHMENTS.map(({ id }) => Object.freeze({
    id: `joint-live-bearing-${id}-upper`, unit: "boolean" as const, source: "self" as const,
  })),
]);

export function wardenProgram(variant: "crossbow" | "sword" = "crossbow",
  locomotionMode: WardenLocomotionMode = "raw"): ConstructProgram {
  const constant = (value: number | boolean,
    unit?: "scalar" | "metres" | "metres-per-second" | "radians" | "seconds" | "joules") =>
    Object.freeze({ op: "constant" as const, value, ...(unit ? { unit } : {}) });
  const sensor = (id: string) => Object.freeze({ op: "sensor" as const, id });
  const active = (action: string) => Object.freeze({ op: "active" as const, action });
  const and = (...values: import("./program.ts").Expression[]) =>
    Object.freeze({ op: "and" as const, values: Object.freeze(values) });
  const or = (...values: import("./program.ts").Expression[]) =>
    Object.freeze({ op: "or" as const, values: Object.freeze(values) });
  const not = (value: import("./program.ts").Expression) => Object.freeze({ op: "not" as const, value });
  const lt = (left: import("./program.ts").Expression, right: import("./program.ts").Expression) =>
    Object.freeze({ op: "lt" as const, left, right });
  const lte = (left: import("./program.ts").Expression, right: import("./program.ts").Expression) =>
    Object.freeze({ op: "lte" as const, left, right });
  const gt = (left: import("./program.ts").Expression, right: import("./program.ts").Expression) =>
    Object.freeze({ op: "gt" as const, left, right });
  const gte = (left: import("./program.ts").Expression, right: import("./program.ts").Expression) =>
    Object.freeze({ op: "gte" as const, left, right });
  const parameter = (value: import("./program.ts").Expression) =>
    Object.freeze({ kind: "expression" as const, value });
  const upright = sensor("core-upright");
  const range = sensor("opponent-range");
  const localX = sensor("opponent-local-x");
  const visible = sensor("line-of-sight");
  const magazineAmmo = sensor("ammo-dorsal-magazine");
  const volleyStarted = lt(magazineAmmo, constant(18));
  const stablyDownedOpponent = and(not(sensor("opponent-upright")), not(sensor("opponent-rising")));
  const meleeTargetable = or(visible, stablyDownedOpponent);
  // The 2026-09-01 authored-entry bracket separated three different decisions. A blocker-side
  // 0.12 m lane missed almost every Warden core; centre mass plus the generic 0.04 rad release
  // window reached all eight rows but remained imprecise, while 0.01 rad produced bilateral
  // physical damage in 8/8. Reload makes the public fire capability unavailable on the tick after
  // launch, so a nonzero Action tail was always cancelled rather than completed. Recoil remains
  // an independently admitted brace, while the physical launch is the fire Action's honest edge.
  // The crossbow chassis deliberately carries its opponent in the shield's left frontal lane;
  // centring the core left the real plate sweeping empty space against a moving Duelist. The
  // sword chassis keeps the symmetric dorsal-mount lane.
  const alignmentMinimumM = variant === "crossbow" ? -0.52 : -0.10;
  const alignmentMaximumM = variant === "crossbow" ? -0.15 : 0.10;
  const aligned = and(gte(localX, constant(alignmentMinimumM, "metres")),
    lte(localX, constant(alignmentMaximumM, "metres")));
  // The dorsal sword has 1.15 m of declared socket-to-tip reach. The former 2.20 m close
  // boundary stopped the carrier before the entire physical sweep, producing many admitted
  // cuts and no contact. It now enters the shield envelope before winding the sword: starting
  // the broad dorsal sweep outside that envelope let the Duelist's buckler close the lane before
  // the Warden's own plate had displaced it.
  const swordAttackAboveM = 1.95;
  const closeAboveM = variant === "crossbow" ? 1.05 : 1.45;
  const retreatBelowM = variant === "crossbow" ? 0.75 : 1.15;
  const closeSpeedMps = variant === "crossbow" ? 1.1 : 0.65;
  const bashRangeM = variant === "crossbow" ? 1.30 : 1.60;
  const attackRules: readonly ProgramRule[] = variant === "crossbow"
    ? [Object.freeze({ id: "attack-in-range", action: "fire", priority: 50, optional: true, dwellS: 0.20,
      // The combined-arms Warden earns its shot after entering the real shield envelope. Starting
      // at eight metres let a bolt decide some bouts before the public bash could touch either
      // mirror; the close, bash and delayed fire form one observable assault sequence.
      condition: or(active("fire"), and(upright,
        // The first bolt follows a real shield drive. `active("bash")` is historical only for
        // this bounded Action generation: it guarantees the combined-arms sequence without
        // inventing a hidden "has bashed" sensor or firing outside the physical clinch.
        or(and(not(volleyStarted), active("bash"), lt(range, constant(1.30, "metres"))),
          and(volleyStarted, meleeTargetable, lt(range, constant(8, "metres")))))),
      utility: constant(20), parameters: Object.freeze({
        // Zero selects fresh centre mass inside the mount. Unlike the old live cancellation
        // offset, this constant remains the same scheduler Action while the opponent moves.
        "target-lane-blend": parameter(constant(0)),
        "target-lateral-offset": parameter(constant(0, "metres")),
        "aim-epsilon-rad": parameter(constant(0.01, "radians")),
        "follow-through-s": parameter(constant(0, "seconds")),
      }) })]
    : [Object.freeze({ id: "attack-in-range", action: "cut", priority: 50, optional: true, dwellS: 0.10,
      // Once admitted, finish the physical stroke through transient sight/range flicker. The
      // former condition repeatedly cancelled the mount during wind and reported many starts but
      // almost no completed cuts against a moving Duelist.
      // A committed physical stroke owns its bounded return even if the target starts rising.
      // Conditioning the live Action on a posture sensor cancelled the left-side mirror during
      // the exact interval in which recovery lifted the target back through the sword path.
      // Range and sight flicker must not cancel a committed stroke, but losing the carrier's
      // supported posture must. Continuing to drive the dorsal blade while the core fell let a
      // late Action fold otherwise-safe mount geometry through its own chassis.
      condition: and(upright, or(active("cut"), and(meleeTargetable,
        lt(range, constant(swordAttackAboveM, "metres"))))), utility: constant(20),
      parameters: Object.freeze({ direction: parameter(constant(1)) }) })];
  const crawlRules: readonly ProgramRule[] = locomotionMode === "assisted" ? WARDEN_CRAWL_MISSING.map((missing) => {
    const liveSupports = WARDEN_LIMB_ATTACHMENTS.map(({ id }) => id).filter((id) => id !== missing);
    return Object.freeze({ id: `crawl-without-${missing}-while-closing`, action: `crawl-without-${missing}`,
      priority: 10, optional: false, dwellS: 0,
      condition: Object.freeze({ op: "and" as const, values: Object.freeze([
        Object.freeze({ op: "sensor" as const, id: "core-upright" }),
        // Contact sensors leave the installed manifest with their detached limb. A core
        // topology channel names the absent support while the rule separately requires
        // fresh evidence from every support the fallback will actually spend.
        Object.freeze({ op: "not" as const, value: Object.freeze({ op: "sensor" as const,
          id: `joint-live-bearing-${missing}-upper` }) }),
        ...liveSupports.map((id) => Object.freeze({ op: "sensor" as const, id: `contact-foot-${id}` })),
        Object.freeze({ op: "gt" as const,
          left: Object.freeze({ op: "sensor" as const, id: "opponent-range" }),
          right: Object.freeze({ op: "constant" as const, value: closeAboveM, unit: "metres" as const }) }),
      ]) }), utility: Object.freeze({ op: "constant" as const, value: 4.5 }),
      parameters: Object.freeze({
        forward: Object.freeze({ kind: "expression" as const,
          value: Object.freeze({ op: "constant" as const, value: 1 }) }),
        right: Object.freeze({ kind: "expression" as const,
          value: Object.freeze({ op: "constant" as const, value: 0 }) }),
        yaw: Object.freeze({ kind: "expression" as const,
          value: Object.freeze({ op: "constant" as const, value: 0 }) }),
        speed: Object.freeze({ kind: "expression" as const,
          value: Object.freeze({ op: "constant" as const,
            value: SUPPORTED_QUADRUPED_CRAWL_V1.MAX_SPEED_MPS, unit: "metres-per-second" as const }) }),
      }) } as ProgramRule);
  }) : [];
  const rules: ProgramRule[] = [
    Object.freeze({ id: "recover-when-fallen", action: "recover", priority: 100, optional: false, dwellS: 0,
      condition: not(upright), utility: constant(100), parameters: Object.freeze({}) }),
    ...attackRules,
    Object.freeze({ id: "turn-left", action: "turn", priority: 70, optional: false, dwellS: 0,
      condition: and(upright, lt(localX, constant(alignmentMinimumM, "metres"))), utility: constant(28),
      parameters: Object.freeze({ yaw: parameter(constant(-1)) }) }),
    Object.freeze({ id: "turn-right", action: "turn", priority: 70, optional: false, dwellS: 0,
      condition: and(upright, gt(localX, constant(alignmentMaximumM, "metres"))), utility: constant(28),
      parameters: Object.freeze({ yaw: parameter(constant(1)) }) }),
    Object.freeze({ id: "retreat-clinch", action: "move", priority: 62, optional: false, dwellS: 0,
      condition: variant === "crossbow"
        ? and(upright, volleyStarted, lt(range, constant(2.40, "metres")))
        : and(upright, lt(range, constant(retreatBelowM, "metres"))), utility: constant(24),
      parameters: Object.freeze({ forward: parameter(constant(-1)), right: parameter(constant(0)),
        speed: parameter(constant(0.8, "metres-per-second")) }) }),
    Object.freeze({ id: "close-distance", action: "move", priority: variant === "crossbow" ? 64 : 61,
      optional: false, dwellS: 0,
      condition: variant === "crossbow"
        ? and(upright, aligned,
          or(and(not(volleyStarted), gt(range, constant(closeAboveM, "metres"))),
            and(volleyStarted, gt(range, constant(6, "metres")))))
        : and(upright, aligned, gt(range, constant(closeAboveM, "metres"))), utility: constant(23),
      parameters: Object.freeze({ forward: parameter(constant(1)), right: parameter(constant(0)),
        speed: parameter(constant(closeSpeedMps, "metres-per-second")) }) }),
    ...crawlRules,
  ];
  if (variant === "crossbow") {
    rules.push(
      Object.freeze({ id: "brace-during-volley", action: "brace", priority: 63, optional: false, dwellS: 0,
        condition: and(upright, or(active("fire"), active("bash"))), utility: constant(25),
        parameters: Object.freeze({}) }),
      Object.freeze({ id: "track-between-shots", action: "track", priority: 40, optional: true, dwellS: 0,
        condition: and(upright, visible, lt(range, constant(8, "metres"))), utility: constant(12),
        parameters: Object.freeze({}) }),
    );
  } else {
    rules.push(
      Object.freeze({ id: "brace-during-assault", action: "brace", priority: 63, optional: false, dwellS: 0,
        condition: and(upright, or(active("cut"), active("bash"))), utility: constant(25),
        parameters: Object.freeze({}) }),
      Object.freeze({ id: "guard-while-closing", action: "guard", priority: 40, optional: true, dwellS: 0,
        condition: and(upright, visible, gte(range, constant(swordAttackAboveM, "metres"))),
        utility: constant(8), parameters: Object.freeze({}) }),
    );
  }
  rules.push(Object.freeze({ id: "bash-in-clinch", action: "bash",
    priority: 48, optional: true, dwellS: 0,
    condition: or(active("bash"), and(upright, meleeTargetable,
      lt(range, constant(bashRangeM, "metres")))),
    utility: constant(18), parameters: Object.freeze({}) }));
  rules.push(
    Object.freeze({ id: "brace-in-band", action: "brace", priority: 30, optional: false, dwellS: 0,
      condition: and(upright, aligned, gte(range, constant(retreatBelowM, "metres")),
        lte(range, constant(closeAboveM, "metres"))),
      utility: constant(6), parameters: Object.freeze({}) }),
    Object.freeze({ id: "cover", action: "cover", priority: 20, optional: false, dwellS: 0,
      condition: and(upright, visible), utility: constant(3), parameters: Object.freeze({
        joint: Object.freeze({ kind: "enum", value: "bearing-shield" }),
        // Return to the outside chamber after a bash. The old +0.30 rad cover parked the broad
        // plate in front of the dorsal muzzle, so the newly combined assault could bash or fire
        // but not physically do both.
        "angle-rad": parameter(constant(-0.42, "radians")),
      }) }),
  );
  return Object.freeze({
    version: 1,
    id: `warden-mind-${variant}`,
    rules: Object.freeze(rules),
  });
}
