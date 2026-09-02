import type { ConstructBlueprint, JointSpec, ModuleSpec, PartSpec, PrimitiveShape, ShellSpec, SocketSpec } from "../construct/blueprint.ts";
import { WARDEN_LIMB_ATTACHMENTS, wardenBlueprint } from "../construct/warden.ts";

export interface PartCatalogEntry {
  readonly id: string;
  readonly label: string;
  readonly shape: PrimitiveShape;
  readonly massKg: number;
  readonly shell: ShellSpec;
  readonly attachmentTag: "structural";
}

export interface ModuleCatalogEntry {
  readonly id: string;
  readonly label: string;
  readonly module: Omit<ModuleSpec, "id" | "socket">;
}

const shell = (style: ShellSpec["style"], visualClearanceM: number): ShellSpec =>
  Object.freeze({ style, visualClearanceM });
const frame = (positionM: readonly [number, number, number] = [0, 0, 0]) =>
  Object.freeze({ positionM, rotation: Object.freeze([0, 0, 0, 1] as const) });
const primitive = (
  id: string,
  shape: PrimitiveShape,
  style: ShellSpec["style"],
  positionM: readonly [number, number, number] = [0, 0, 0],
) => Object.freeze({ id, frame: frame(positionM), shape: Object.freeze(shape), shell: shell(style, 0.003) });

export const PART_CATALOG: readonly PartCatalogEntry[] = Object.freeze([
  Object.freeze({ id: "stone-core", label: "Carved stone core",
    shape: Object.freeze({ kind: "box", sizeM: [1, 0.6, 0.8] as const }), massKg: 80, shell: shell("core", 0.008), attachmentTag: "structural" }),
  Object.freeze({ id: "straight-plate", label: "Straight stone plate",
    shape: Object.freeze({ kind: "box", sizeM: [0.25, 0.55, 0.16] as const }), massKg: 7, shell: shell("plate", 0.008), attachmentTag: "structural" }),
  Object.freeze({ id: "piston-link", label: "Stone piston link",
    shape: Object.freeze({ kind: "capsule", lengthM: 0.5, radiusM: 0.09 }), massKg: 6, shell: shell("piston", 0.006), attachmentTag: "structural" }),
  Object.freeze({ id: "bearing", label: "Bronze bearing",
    shape: Object.freeze({ kind: "cylinder", lengthM: 0.18, radiusM: 0.14 }), massKg: 5, shell: shell("bearing", 0.003), attachmentTag: "structural" }),
  Object.freeze({ id: "foot", label: "Gripping stone foot",
    shape: Object.freeze({ kind: "box", sizeM: [0.26, 0.14, 0.34] as const }), massKg: 4, shell: shell("plate", 0.008), attachmentTag: "structural" }),
]);

export type PartAttachmentSocketId = "top" | "bottom" | "left" | "right" | "front" | "rear";
export interface PartAttachmentSocket { readonly id: PartAttachmentSocketId; readonly frame: ReturnType<typeof frame>;
  readonly accepts: readonly ["structural"]; }
const halfExtents = (shape: PrimitiveShape): readonly [number, number, number] => {
  if (shape.kind === "box") return [shape.sizeM[0] / 2, shape.sizeM[1] / 2, shape.sizeM[2] / 2];
  if (shape.kind === "sphere") return [shape.radiusM, shape.radiusM, shape.radiusM];
  if (shape.kind === "capsule") return [shape.radiusM, shape.lengthM / 2, shape.radiusM];
  return [shape.radiusM, shape.lengthM / 2, shape.radiusM];
};
export function partAttachmentSockets(part: Pick<PartSpec, "shape">): readonly PartAttachmentSocket[] {
  const [x, y, z] = halfExtents(part.shape); const accepts = Object.freeze(["structural"] as const);
  return Object.freeze([
    Object.freeze({ id: "top" as const, frame: frame([0, y, 0]), accepts }),
    Object.freeze({ id: "bottom" as const, frame: frame([0, -y, 0]), accepts }),
    Object.freeze({ id: "left" as const, frame: frame([-x, 0, 0]), accepts }),
    Object.freeze({ id: "right" as const, frame: frame([x, 0, 0]), accepts }),
    Object.freeze({ id: "front" as const, frame: frame([0, 0, z]), accepts }),
    Object.freeze({ id: "rear" as const, frame: frame([0, 0, -z]), accepts }),
  ]);
}

export interface ConnectedPartCatalogEntry {
  readonly id: string;
  readonly label: string;
  readonly corner: (typeof WARDEN_LIMB_ATTACHMENTS)[number]["id"];
}

/** Exact committed four-bearing limb fragments, not a second hand-authored approximation. */
export const CONNECTED_PART_CATALOG: readonly ConnectedPartCatalogEntry[] = Object.freeze(
  WARDEN_LIMB_ATTACHMENTS.map(({ id }) => Object.freeze({
    id: `warden-limb-${id}`,
    label: `Warden ${id.replace("-", " ")} four-joint limb`,
    corner: id,
  })),
);

export interface ConnectedPartFragment {
  readonly parts: readonly PartSpec[];
  readonly joints: readonly JointSpec[];
  readonly sockets: readonly SocketSpec[];
}

const framesEqual = (left: JointSpec["parentFrame"], right: JointSpec["parentFrame"]): boolean =>
  left.positionM.every((value, index) => value === right.positionM[index]) &&
  left.rotation.every((value, index) => value === right.rotation[index]);

/** Warden limbs are exact core-corner templates, not generic snap fragments. */
export function assertConnectedFragmentAttachment(blueprint: ConstructBlueprint,
  joints: readonly JointSpec[]): void {
  const source = wardenBlueprint();
  const sourceRoot = source.parts.find(({ id }) => id === source.rootPart)!;
  const root = blueprint.parts.find(({ id }) => id === blueprint.rootPart);
  if (!root || JSON.stringify(root) !== JSON.stringify(sourceRoot)) {
    throw new Error("connected Warden limbs require the exact unresized starter core schema");
  }
  const incoming = joints.filter(({ parentPart }) => parentPart === blueprint.rootPart);
  if (incoming.length !== 1) throw new Error("connected Warden limb must have exactly one starter-core attachment");
  const declared = source.joints.filter(({ parentPart }) => parentPart === source.rootPart)
    .find(({ parentFrame }) => framesEqual(parentFrame, incoming[0].parentFrame));
  if (!declared) throw new Error("connected Warden limb frame is not a declared starter-core corner");
  if (blueprint.joints.some((joint) => joint.parentPart === blueprint.rootPart &&
      framesEqual(joint.parentFrame, incoming[0].parentFrame))) {
    throw new Error(`connected Warden limb corner at ${incoming[0].parentFrame.positionM.join(",")} is occupied`);
  }
}

export interface TwoAxisMountFragment extends ConnectedPartFragment {
  readonly outputSocket: string;
}

const uniqueStem = (blueprint: ConstructBlueprint, base: string): string => {
  const occupied = new Set([...blueprint.parts, ...blueprint.joints, ...blueprint.sockets, ...blueprint.modules]
    .map(({ id }) => id));
  if (![...occupied].some((id) => id === base || id.startsWith(`${base}-`))) return base;
  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (![...occupied].some((id) => id === candidate || id.startsWith(`${candidate}-`))) return candidate;
  }
  throw new Error(`cannot allocate another "${base}" mount`);
};

/** A complete y-then-x physical chain whose final child owns a dorsal tool socket. */
export function instantiateTwoAxisMount(blueprint: ConstructBlueprint, parentPart: string,
  parentSocket: PartAttachmentSocketId): TwoAxisMountFragment {
  const parent = blueprint.parts.find(({ id }) => id === parentPart);
  if (!parent) throw new Error(`two-axis mount parent "${parentPart}" is missing`);
  const stem = uniqueStem(blueprint, "forge-mount");
  const yaw = Object.freeze({ id: `${stem}-yaw`, shape: Object.freeze({ kind: "cylinder" as const,
    lengthM: 0.18, radiusM: 0.14 }), massKg: 6, centreOfMassM: Object.freeze([0, 0, 0] as const),
    friction: 0.72, restitution: 0.04, health: 6, armour: 0.9, vitalityWeight: 0, fatal: false,
    shell: shell("bearing", 0.003) });
  const pitch = Object.freeze({ id: `${stem}-pitch`, shape: Object.freeze({ kind: "box" as const,
    sizeM: Object.freeze([0.28, 0.18, 0.30] as const) }), massKg: 6,
    centreOfMassM: Object.freeze([0, 0, 0] as const), friction: 0.72, restitution: 0.04,
    health: 6, armour: 0.9, vitalityWeight: 0, fatal: false, shell: shell("bearing", 0.003) });
  const opposite: Readonly<Record<PartAttachmentSocketId, PartAttachmentSocketId>> = {
    top: "bottom", bottom: "top", left: "right", right: "left", front: "rear", rear: "front",
  };
  const parentFrame = partAttachmentSockets(parent).find(({ id }) => id === parentSocket)?.frame;
  const yawChildFrame = partAttachmentSockets(yaw).find(({ id }) => id === opposite[parentSocket])?.frame;
  const yawTop = partAttachmentSockets(yaw).find(({ id }) => id === "top")?.frame;
  const pitchBottom = partAttachmentSockets(pitch).find(({ id }) => id === "bottom")?.frame;
  if (!parentFrame || !yawChildFrame || !yawTop || !pitchBottom) throw new Error("two-axis mount lost a declared attachment frame");
  const axis = (id: "x" | "y", force: number) => Object.freeze({ id, minRad: id === "y" ? -2.5 : -0.75,
    maxRad: id === "y" ? 2.5 : 1.65, damping: 8, maxTorqueNm: force, maxSpeedRadS: id === "y" ? 8 : 6 });
  const joints = Object.freeze([
    Object.freeze({ id: `${stem}-yaw-joint`, parentPart, childPart: yaw.id, parentFrame,
      childFrame: yawChildFrame, angularAxes: Object.freeze([axis("y", 900)]), health: 8, armour: 0.6 }),
    Object.freeze({ id: `${stem}-pitch-joint`, parentPart: yaw.id, childPart: pitch.id, parentFrame: yawTop,
      childFrame: pitchBottom, angularAxes: Object.freeze([axis("x", 650)]), health: 8, armour: 0.6 }),
  ]);
  const outputSocket = `${stem}-output-socket`;
  return Object.freeze({ parts: Object.freeze([yaw, pitch]), joints,
    sockets: Object.freeze([Object.freeze({ id: outputSocket, part: pitch.id,
      frame: partAttachmentSockets(pitch).find(({ id }) => id === "front")!.frame,
      accepts: Object.freeze(["dorsal-weapon"]) })]), outputSocket });
}

export const MODULE_SOCKET_CATALOG = Object.freeze([
  Object.freeze({ id: "tool-output", label: "Sword / crossbow socket", accepts: Object.freeze(["dorsal-weapon"]) }),
  Object.freeze({ id: "sensor", label: "Opponent sensor socket", accepts: Object.freeze(["sensor"]) }),
  Object.freeze({ id: "power", label: "Power core socket", accepts: Object.freeze(["power-core"]) }),
  Object.freeze({ id: "magazine", label: "Magazine socket", accepts: Object.freeze(["magazine"]) }),
  Object.freeze({ id: "shield", label: "Shield socket", accepts: Object.freeze(["shield"]) }),
]);

export function instantiateConnectedPart(
  blueprint: ConstructBlueprint,
  catalogId: string,
  parentPart: string,
): ConnectedPartFragment {
  const entry = CONNECTED_PART_CATALOG.find(({ id }) => id === catalogId);
  if (!entry) throw new Error(`unknown connected part catalog entry "${catalogId}"`);
  if (!blueprint.parts.some(({ id }) => id === parentPart)) throw new Error(`connected fragment parent "${parentPart}" is missing`);
  const source = wardenBlueprint();
  const originalStem = `limb-${entry.corner}`;
  const sourceParts = source.parts.filter(({ id }) => id.startsWith(`${originalStem}-`));
  const sourcePartIds = new Set(sourceParts.map(({ id }) => id));
  const sourceJoints = source.joints.filter(({ childPart }) => sourcePartIds.has(childPart));
  const sourceSockets = source.sockets.filter(({ part }) => sourcePartIds.has(part));
  const occupied = new Set([
    ...blueprint.parts.map(({ id }) => id), ...blueprint.joints.map(({ id }) => id), ...blueprint.sockets.map(({ id }) => id),
  ]);
  let stem = originalStem;
  for (let suffix = 2; [...occupied].some((id) => id.startsWith(`${stem}-`)); suffix += 1) stem = `${originalStem}-${suffix}`;
  const partId = (id: string): string => id.replace(originalStem, stem);
  const jointId = (id: string): string => id.replace(`bearing-${entry.corner}`, `bearing-${stem.replace(/^limb-/, "")}`);
  const socketId = (id: string): string => id.replace(`socket-${entry.corner}`, `socket-${stem.replace(/^limb-/, "")}`);
  const fragment = Object.freeze({
    parts: Object.freeze(sourceParts.map((part) => Object.freeze({ ...structuredClone(part), id: partId(part.id) }))),
    joints: Object.freeze(sourceJoints.map((joint, index) => Object.freeze({ ...structuredClone(joint), id: jointId(joint.id),
      parentPart: index === 0 ? parentPart : partId(joint.parentPart), childPart: partId(joint.childPart) }))),
    sockets: Object.freeze(sourceSockets.map((socket) => Object.freeze({ ...structuredClone(socket), id: socketId(socket.id), part: partId(socket.part) }))),
  });
  assertConnectedFragmentAttachment(blueprint, fragment.joints);
  return fragment;
}

export const MODULE_CATALOG: readonly ModuleCatalogEntry[] = Object.freeze([
  Object.freeze({ id: "launcher", label: "Auto-crossbow", module: Object.freeze({
    kind: "launcher" as const, compatibilityTag: "dorsal-weapon", geometry: Object.freeze([
      primitive("body", { kind: "box", sizeM: [0.34, 0.16, 0.48] }, "plate"),
      primitive("left-bow", { kind: "box", sizeM: [0.48, 0.05, 0.07] }, "piston", [-0.28, 0, 0.12]),
      primitive("right-bow", { kind: "box", sizeM: [0.48, 0.05, 0.07] }, "piston", [0.28, 0, 0.12]),
    ]), massKg: 12, health: 5.5, armour: 0.6, maxHeatJ: 900, coolingW: 55,
    reloadSeconds: 0.65, heatPerShotJ: 80, energyPerShotJ: 160,
    projectile: Object.freeze({ poolSize: 18, massKg: 0.08, radiusM: 0.018,
      lengthM: 0.55, muzzleSpeedMps: 42, penetrationEfficiency: 1 }),
  }) }),
  Object.freeze({ id: "sword", label: "Mounted sword", module: Object.freeze({
    kind: "sword" as const, compatibilityTag: "dorsal-weapon", geometry: Object.freeze([
      primitive("blade", { kind: "box", sizeM: [0.09, 0.06, 1.25] }, "plate", [0, 0, 0.62]),
      primitive("guard", { kind: "box", sizeM: [0.36, 0.08, 0.08] }, "bearing", [0, 0, 0.06]),
    ]), massKg: 8, health: 7.5, armour: 0.9,
    striker: Object.freeze({ localTipM: [0, 0, 1.245] as const,
      localEdgeDirection: [1, 0, 0] as const, localFlatDirection: [0, 1, 0] as const, damageScale: 1 }),
  }) }),
  Object.freeze({ id: "opponent-sensor", label: "Range and sight sensor", module: Object.freeze({
    kind: "opponent-sensor" as const, compatibilityTag: "sensor",
    geometry: Object.freeze([primitive("lens", { kind: "sphere", radiusM: 0.11 }, "core")]),
    massKg: 1.5, health: 3, armour: 0.3,
    sensorChannels: Object.freeze(["line-of-sight", "opponent-range", "opponent-relative-speed"]),
  }) }),
  Object.freeze({ id: "contact-sensor", label: "Contact sensor", module: Object.freeze({
    kind: "contact-sensor" as const, compatibilityTag: "contact-sensor",
    geometry: Object.freeze([primitive("pad", { kind: "box", sizeM: [0.24, 0.04, 0.3] }, "plate")]),
    // The Forge replaces these template tokens with IDs owned by the mounted module.
    massKg: 0.8, health: 2.75, armour: 0.25, sensorChannels: Object.freeze(["contact-sensor", "slip-sensor"]),
  }) }),
  Object.freeze({ id: "shield", label: "Stone shield", module: Object.freeze({
    kind: "shield" as const, compatibilityTag: "shield",
    geometry: Object.freeze([primitive("face", { kind: "box", sizeM: [0.72, 0.88, 0.12] }, "plate")]),
    massKg: 18, health: 13, armour: 1.5,
  }) }),
  Object.freeze({ id: "power-core", label: "Rune power core", module: Object.freeze({
    kind: "power-core" as const, compatibilityTag: "power-core",
    geometry: Object.freeze([primitive("cell", { kind: "sphere", radiusM: 0.16 }, "core")]),
    massKg: 6, health: 5, armour: 0.6, capacityJ: 24_000, maxOutputW: 520,
  }) }),
  Object.freeze({ id: "magazine", label: "Crossbow magazine", module: Object.freeze({
    kind: "magazine" as const, compatibilityTag: "magazine",
    geometry: Object.freeze([primitive("cartridge", { kind: "box", sizeM: [0.20, 0.18, 0.28] }, "plate")]),
    massKg: 5, health: 4, armour: 0.5, ammunition: 18,
  }) }),
]);
