import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { validateControlGraph, type ConstructControlGraph } from "./actions.ts";
import { validateBlueprint, type ConstructBlueprint } from "./blueprint.ts";
import { saveConstruct, type SavedConstruct } from "./codec.ts";
import { groundedConstructOriginY, resolveConstructBindTransforms } from "./compile.ts";
import { humanoidBlueprint, humanoidControl, HUMANOID_SENSORS } from "./humanoid.ts";
import { humanoidLength } from "./humanoid-scale.ts";
import type { ConstructProgram } from "./program.ts";
import type { SensorSpec } from "./sensors.ts";
import { twinbladeDuelistProgram, type TwinbladeDuelistTuning } from "./twinblade-duelist.ts";

export type TwinbladeSide = "left" | "right";

const REMOVED_LEFT_PARTS = Object.freeze(["left-upper-arm", "left-forearm", "left-wrist", "left-hand"]);
const REMOVED_LEFT_JOINTS = Object.freeze(["left-shoulder", "left-elbow", "left-wrist", "left-palm"]);
const LEFT = Object.freeze({ yawPart: "left-sword-shoulder-yaw", pitchPart: "left-sword-arm-pitch",
  yawJoint: "left-sword-yaw", pitchJoint: "left-sword-pitch", socket: "socket-left-sword-hand",
  module: "left-effigy-sword" });
const RIGHT = Object.freeze({ yawPart: "sword-shoulder-yaw", pitchPart: "sword-arm-pitch",
  yawJoint: "sword-yaw", pitchJoint: "sword-pitch", socket: "socket-sword-hand",
  module: "effigy-sword" });
const MOUNTS = Object.freeze([Object.freeze({ side: "left" as const, ...LEFT }),
  Object.freeze({ side: "right" as const, ...RIGHT })]);

const required = <T extends { readonly id: string }>(rows: readonly T[], id: string, context: string): T => {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`Twinblade source lost ${context} "${id}"`);
  return row;
};

/**
 * A distinct A/B chassis. Every left mount datum is cloned from the committed right mount;
 * only identity, ownership and the torso-local X attachment are mirrored. The original
 * Swordbearer blueprint remains byte-for-byte independent of this transformation.
 */
export function twinbladeBlueprint(): ConstructBlueprint {
  const base = humanoidBlueprint();
  const rightYawPart = required(base.parts, RIGHT.yawPart, "right yaw part");
  const rightPitchPart = required(base.parts, RIGHT.pitchPart, "right pitch part");
  const rightYaw = required(base.joints, RIGHT.yawJoint, "right yaw joint");
  const rightPitch = required(base.joints, RIGHT.pitchJoint, "right pitch joint");
  const rightSocket = required(base.sockets, RIGHT.socket, "right sword socket");
  const rightSword = required(base.modules, RIGHT.module, "right sword module");
  if (!rightSword.striker) throw new Error("Twinblade source right sword lost its striker");

  const leftYaw = { ...structuredClone(rightYaw), id: LEFT.yawJoint, childPart: LEFT.yawPart,
    parentFrame: { ...structuredClone(rightYaw.parentFrame), positionM: Object.freeze([
      -rightYaw.parentFrame.positionM[0], rightYaw.parentFrame.positionM[1], rightYaw.parentFrame.positionM[2],
    ]) } };
  const leftPitch = { ...structuredClone(rightPitch), id: LEFT.pitchJoint,
    parentPart: LEFT.yawPart, childPart: LEFT.pitchPart };
  const leftSocket = { ...structuredClone(rightSocket), id: LEFT.socket, part: LEFT.pitchPart };
  const twinRightSword = structuredClone(rightSword);
  const leftSword = { ...structuredClone(twinRightSword), id: LEFT.module, socket: LEFT.socket,
    striker: { ...structuredClone(rightSword.striker),
      localEdgeDirection: Object.freeze([-rightSword.striker.localEdgeDirection[0],
        rightSword.striker.localEdgeDirection[1], rightSword.striker.localEdgeDirection[2]]) } };

  const modules = base.modules.filter(({ id }) => id !== RIGHT.module).map((module) =>
    module.id === "effigy-sight" ? { ...structuredClone(module), sensorChannels: Object.freeze([
      ...new Set([...(module.sensorChannels ?? []), "opponent-upright", "opponent-rising"]),
    ]) } : module);
  return validateBlueprint({ ...base, id: "twinblade-effigy",
    parts: [...base.parts.filter(({ id }) => !REMOVED_LEFT_PARTS.includes(id)),
      { ...structuredClone(rightYawPart), id: LEFT.yawPart },
      { ...structuredClone(rightPitchPart), id: LEFT.pitchPart }],
    joints: [...base.joints.filter(({ id }) => !REMOVED_LEFT_JOINTS.includes(id)), leftYaw, leftPitch],
    sockets: [...base.sockets, leftSocket],
    modules: [...modules, twinRightSword, leftSword] });
}

export const TWINBLADE_SENSORS: readonly SensorSpec[] = Object.freeze([
  ...HUMANOID_SENSORS,
  Object.freeze({ id: "opponent-upright", unit: "boolean", source: "opponent" } as const),
  Object.freeze({ id: "opponent-rising", unit: "boolean", source: "opponent" } as const),
]);

export function twinbladeControl(): ConstructControlGraph {
  const base = humanoidControl();
  const locomotion = required(base.groups, "locomotion", "locomotion group");
  const posture = required(base.groups, "posture", "posture group");
  const wholeBody = required(base.groups, "whole-body", "whole-body group");
  const mountJoints = MOUNTS.flatMap(({ yawJoint, pitchJoint }) => [yawJoint, pitchJoint]);
  const mountModules = MOUNTS.map(({ module }) => module);
  const mountBindings = Object.fromEntries(MOUNTS.flatMap((mount) => [
    [`${mount.side}-yaw`, { joints: [mount.yawJoint], modules: [] }],
    [`${mount.side}-pitch`, { joints: [mount.pitchJoint], modules: [] }],
    [`${mount.side}-sword`, { joints: [], modules: [mount.module] }],
  ]));
  const groups = base.groups.map((group) => group.id === posture.id
    ? { ...group, joints: group.joints.filter((id) => !REMOVED_LEFT_JOINTS.includes(id)) }
    : group.id === wholeBody.id
      ? { ...group, joints: [...group.joints.filter((id) => !REMOVED_LEFT_JOINTS.includes(id)),
        LEFT.yawJoint, LEFT.pitchJoint] }
      : group);
  groups.push({ id: "dual-sword-mounts", joints: mountJoints, modules: mountModules,
    bindings: mountBindings });
  groups.push({ id: "dual-sword-braced-body", joints: [...locomotion.joints, ...mountJoints],
    modules: [...locomotion.modules, ...mountModules], bindings: {
      ...locomotion.bindings, ...mountBindings,
    } });
  return validateControlGraph({ version: 1, groups, actions: [...base.actions,
    { id: "dual-mount-neutral", controller: "twinblade-neutral-hold", group: "dual-sword-mounts",
      claims: [...mountModules.map((id) => `module:${id}`), "resource:power-mount"], parameters: {} },
    { id: "dual-cut", controller: "twinblade-scissor-cut", group: "dual-sword-braced-body",
      claims: [...mountModules.map((id) => `module:${id}`), "resource:balance", "resource:power-mount",
        "resource:sensor-line-of-sight"], parameters: {
        "blocker-outward-m": { kind: "number", min: 0.05, max: 0.70, unit: "metres" },
        "cutter-chamber-cross-m": { kind: "number", min: 0.05, max: 0.80, unit: "metres" },
        "cutter-chamber-drop-m": { kind: "number", min: 0, max: 0.70, unit: "metres" },
        "open-lane-offset-m": { kind: "number", min: 0, max: 0.35, unit: "metres" },
        "target-height-offset-m": { kind: "number", min: -0.20, max: 0.50, unit: "metres" },
        "blocker-target-height-offset-m": { kind: "number", min: -0.20, max: 0.80, unit: "metres" },
        "cut-advance-fraction": { kind: "number", min: 0, max: 0.50, unit: "scalar" },
        "motor-speed-fraction": { kind: "number", min: 0.25, max: 1, unit: "scalar" },
        "motor-force-fraction": { kind: "number", min: 0.25, max: 1, unit: "scalar" },
        "travel-multiplier": { kind: "number", min: 0.5, max: 3, unit: "scalar" },
        "settle-allowance-s": { kind: "number", min: 0, max: 0.5, unit: "seconds" },
        "brace-knee-rad": { kind: "number", min: -0.60, max: 0.15, unit: "radians" },
        "brace-ankle-rad": { kind: "number", min: -0.25, max: 0.35, unit: "radians" },
        "brace-sole-rad": { kind: "number", min: -0.20, max: 0.30, unit: "radians" },
      } }] });
}

export function twinbladeProgram(tuning?: TwinbladeDuelistTuning): ConstructProgram {
  return twinbladeDuelistProgram(twinbladeControl(), TWINBLADE_SENSORS, tuning);
}

export interface TwinbladeBindMetrics {
  readonly yawPivotRootM: readonly [number, number, number];
  readonly pitchPivotRootM: readonly [number, number, number];
  readonly pitchToSocketM: number;
  readonly socketToTipM: number;
}

/** Per-side geometry is resolved independently from the compiled bind tree. */
export function twinbladeSwordBindMetrics(side: TwinbladeSide): Readonly<TwinbladeBindMetrics> {
  const blueprint = twinbladeBlueprint();
  const transforms = resolveConstructBindTransforms(blueprint);
  const mount = MOUNTS.find((candidate) => candidate.side === side);
  if (!mount) throw new Error(`Twinblade bind metrics do not recognize side "${side}"`);
  const point = (partId: string, local: readonly [number, number, number]): Vector3 => {
    const transform = transforms.get(partId);
    if (!transform) throw new Error(`Twinblade bind metrics lost part "${partId}"`);
    return Vector3.FromArray(local).rotateByQuaternionToRef(transform.rotation, new Vector3())
      .addInPlace(transform.position);
  };
  const yaw = required(blueprint.joints, mount.yawJoint, `${side} yaw joint`);
  const pitch = required(blueprint.joints, mount.pitchJoint, `${side} pitch joint`);
  const sword = required(blueprint.modules, mount.module, `${side} sword module`);
  const socket = required(blueprint.sockets, sword.socket, `${side} sword socket`);
  if (!sword.striker) throw new Error(`Twinblade bind metrics lost ${side} sword striker`);
  const yawPivot = point(yaw.parentPart, yaw.parentFrame.positionM);
  const pitchPivot = point(pitch.parentPart, pitch.parentFrame.positionM);
  const anchor = point(socket.part, socket.frame.positionM);
  return Object.freeze({ yawPivotRootM: Object.freeze([yawPivot.x, yawPivot.y, yawPivot.z] as const),
    pitchPivotRootM: Object.freeze([pitchPivot.x, pitchPivot.y, pitchPivot.z] as const),
    pitchToSocketM: Vector3.Distance(pitchPivot, anchor),
    socketToTipM: Math.hypot(...sword.striker.localTipM) });
}

export function twinbladeProfileMetrics(): Readonly<{ reach: number; crownHeight: number;
  vitalHeight: number; collisionRadius: number }> {
  const blueprint = twinbladeBlueprint();
  const origin = new Vector3(0, groundedConstructOriginY(blueprint), 0);
  const transforms = resolveConstructBindTransforms(blueprint, origin);
  const root = required([...transforms].map(([id, transform]) => ({ id, ...transform })),
    blueprint.rootPart, "root transform");
  const head = required([...transforms].map(([id, transform]) => ({ id, ...transform })),
    "head", "head transform");
  const headSpec = required(blueprint.parts, "head", "head part");
  if (headSpec.shape.kind !== "sphere") throw new Error("Twinblade profile requires its declared spherical head");
  const reach = Math.max(...MOUNTS.map(({ module }) => {
    const sword = required(blueprint.modules, module, "sword module");
    const socket = required(blueprint.sockets, sword.socket, "sword socket");
    const owner = transforms.get(socket.part);
    if (!sword.striker || !owner) throw new Error(`Twinblade profile lost mounted sword "${module}"`);
    const rotation = owner.rotation.multiply(Quaternion.FromArray(socket.frame.rotation)).normalize();
    const anchor = Vector3.FromArray(socket.frame.positionM)
      .rotateByQuaternionToRef(owner.rotation, new Vector3()).addInPlace(owner.position);
    const tip = Vector3.FromArray(sword.striker.localTipM)
      .rotateByQuaternionToRef(rotation, new Vector3()).addInPlace(anchor);
    return Vector3.Distance(root.position, tip);
  }));
  return Object.freeze({ reach, crownHeight: head.position.y + headSpec.shape.radiusM,
    vitalHeight: root.position.y, collisionRadius: humanoidLength(0.62) });
}

export function twinbladeSavedConstruct(tuning?: TwinbladeDuelistTuning): SavedConstruct {
  return saveConstruct("Twinblade Effigy", twinbladeBlueprint(), twinbladeControl(),
    twinbladeProgram(tuning), TWINBLADE_SENSORS);
}
