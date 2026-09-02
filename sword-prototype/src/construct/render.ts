import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";

import type { AttachmentFrame, ModuleSpec, PartSpec, PrimitiveShape, ShellStyle } from "./blueprint.ts";
import {
  CONSTRUCT_SURFACE_RULES,
  applyConstructSurface,
  recipeForConstructShell,
  roleForConstructShell,
  type ConstructMaterialPalette,
} from "./materials.ts";

export interface ConstructPartVisual {
  readonly meshes: readonly Mesh[];
  readonly bearing: Mesh;
  readonly clearanceM: number;
  dispose(): void;
}

export interface ConstructModuleVisual {
  readonly root: TransformNode;
  readonly meshes: readonly Mesh[];
  dispose(): void;
}

export interface ConstructDebugPart {
  readonly id: string;
  readonly node: TransformNode;
  readonly shape: PrimitiveShape;
}

export interface ConstructDebugJoint {
  readonly id: string;
  readonly parent: ConstructDebugPart;
  readonly child: ConstructDebugPart;
  readonly parentFrame: AttachmentFrame;
  readonly childFrame: AttachmentFrame;
}

export interface ConstructDebugOverlay {
  readonly meshes: readonly Mesh[];
  dispose(): void;
}

export interface ConstructSurfaceBinding {
  readonly targetKind: "part" | "module" | "joint";
  readonly targetId: string;
  readonly primitiveId: string;
  readonly seed: number;
  readonly shapeKind: PrimitiveShape["kind"];
  readonly extentsM: readonly [number, number, number];
  readonly relief: "none" | "core-front";
  healthRatio: number;
}

export interface ConstructSurfaceDamageDescription {
  readonly targetKind: ConstructSurfaceBinding["targetKind"];
  readonly targetId: string;
  readonly remaining: number;
  readonly maximum: number;
}

export interface ConstructSurfaceRenderAudit {
  readonly meshes: number;
  readonly materials: number;
  readonly textures: number;
  readonly plugins: number;
  readonly requested: import("./procedural-surface.ts").ConstructSurfaceMode;
  readonly effective: import("./procedural-surface.ts").ConstructSurfaceMode;
  readonly fallbackReason: string | null;
  readonly damagedBindings: number;
}

const dimensions = (shape: PrimitiveShape, clearanceM: number): Vector3 => {
  switch (shape.kind) {
    case "box": return new Vector3(
      shape.sizeM[0] + clearanceM * 2,
      shape.sizeM[1] + clearanceM * 2,
      shape.sizeM[2] + clearanceM * 2,
    );
    case "capsule": return new Vector3(
      (shape.radiusM + clearanceM) * 2,
      Math.max(shape.lengthM, shape.radiusM * 2) + clearanceM * 2,
      (shape.radiusM + clearanceM) * 2,
    );
    case "cylinder": return new Vector3(
      (shape.radiusM + clearanceM) * 2,
      shape.lengthM + clearanceM * 2,
      (shape.radiusM + clearanceM) * 2,
    );
    case "sphere": return new Vector3(
      (shape.radiusM + clearanceM) * 2,
      (shape.radiusM + clearanceM) * 2,
      (shape.radiusM + clearanceM) * 2,
    );
  }
};

const tuple = (value: Vector3): readonly [number, number, number] =>
  Object.freeze([value.x, value.y, value.z]);

/**
 * Support colliders may be wider than their stone casing. This is a saved presentation style,
 * not a body-name exception: physics, support and damage retain the authored primitive while the
 * inset visible mesh owns the correspondingly narrower picking surface.
 */
export function constructPresentedShellShape(shape: PrimitiveShape, style: ShellStyle): PrimitiveShape {
  if (style !== "support") return shape;
  if (shape.kind !== "box") throw new Error('construct shell style "support" requires a box primitive');
  return Object.freeze({ kind: "box" as const,
    sizeM: Object.freeze([shape.sizeM[0] * 0.90, shape.sizeM[1], shape.sizeM[2] * 0.90] as const) });
}

/** FNV-1a over authored semantic names. Build order, faction and mutable health never enter. */
export function constructSurfaceSeed(...semanticIds: readonly string[]): number {
  let value = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(semanticIds.join("\0"))) {
    value ^= byte;
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0) / 0xffffffff;
}

const bindingKey = (kind: ConstructSurfaceBinding["targetKind"], id: string): string => `${kind}\0${id}`;

/**
 * Render metadata is owned beside the meshes and addressed only by stable semantic damage keys.
 * This registry deliberately knows neither Limb objects nor ConstructDamageState.
 */
export class ConstructSurfaceRegistry {
  private readonly scene: Scene;
  private readonly palette: ConstructMaterialPalette;
  private readonly bindings = new Map<string, Set<ConstructSurfaceBinding>>();
  private disposed = false;

  constructor(scene: Scene, palette: ConstructMaterialPalette) {
    this.scene = scene;
    this.palette = palette;
  }

  bind(mesh: Mesh, binding: ConstructSurfaceBinding, damageEligible = true): void {
    mesh.metadata = { ...(mesh.metadata ?? {}), constructSurfaceBinding: binding };
    if (!damageEligible) return;
    const key = bindingKey(binding.targetKind, binding.targetId);
    const set = this.bindings.get(key) ?? new Set<ConstructSurfaceBinding>();
    set.add(binding);
    this.bindings.set(key, set);
  }

  rebindJoint(jointId: string, childPartId: string, bearing: Mesh): void {
    const prior = bearing.metadata?.constructSurfaceBinding as ConstructSurfaceBinding | undefined;
    const binding: ConstructSurfaceBinding = {
      targetKind: "joint",
      targetId: jointId,
      primitiveId: prior?.primitiveId ?? `${childPartId}:bearing`,
      seed: constructSurfaceSeed("joint", jointId, prior?.primitiveId ?? `${childPartId}:bearing`, "bearing"),
      shapeKind: "cylinder",
      extentsM: prior?.extentsM ?? Object.freeze([0.1, 0.1, 0.1]),
      relief: "none",
      healthRatio: 1,
    };
    this.bind(bearing, binding);
  }

  publish(damage: ConstructSurfaceDamageDescription): void {
    if (!Number.isFinite(damage.maximum) || damage.maximum <= 0) {
      throw new Error(`construct surface damage maximum must be finite and positive, got ${damage.maximum}`);
    }
    const healthRatio = Math.max(0, Math.min(1,
      Number.isFinite(damage.remaining) ? damage.remaining / damage.maximum : 0));
    for (const binding of this.bindings.get(bindingKey(damage.targetKind, damage.targetId)) ?? []) {
      binding.healthRatio = healthRatio;
    }
  }

  audit(): ConstructSurfaceRenderAudit {
    const paletteMaterials = new Set([
      this.palette.carvedStone, this.palette.functionalMetal, this.palette.constructWood, this.palette.rune,
    ]);
    const factionMeshes = this.scene.meshes.filter((mesh) =>
      mesh.metadata?.constructSurfaceFaction === this.palette.faction && paletteMaterials.has(mesh.material as never));
    const damagedBindings = factionMeshes.filter((mesh) => {
      const binding = mesh.metadata?.constructSurfaceBinding as ConstructSurfaceBinding | undefined;
      return binding !== undefined && binding.healthRatio < 1;
    }).length;
    return Object.freeze({
      meshes: factionMeshes.length,
      materials: paletteMaterials.size,
      textures: [this.palette.carvedStone.albedoTexture, this.palette.carvedStone.bumpTexture]
        .filter((texture) => texture !== null).length,
      plugins: this.palette.plugins.length,
      requested: this.palette.surface.requested,
      effective: this.palette.surface.effective,
      fallbackReason: this.palette.surface.reason,
      damagedBindings,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bindings.clear();
  }
}

const surfaceBinding = (
  targetKind: ConstructSurfaceBinding["targetKind"],
  targetId: string,
  primitiveId: string,
  shape: PrimitiveShape,
  clearanceM: number,
  shellStyle: string,
): ConstructSurfaceBinding => ({
  targetKind,
  targetId,
  primitiveId,
  seed: constructSurfaceSeed(targetKind, targetId, primitiveId, shellStyle),
  shapeKind: shape.kind,
  extentsM: tuple(dimensions(shape, clearanceM)),
  relief: shape.kind === "box" && shellStyle === "core" ? "core-front" : "none",
  healthRatio: 1,
});

const shell = (scene: Scene, name: string, shape: PrimitiveShape, clearanceM: number): Mesh => {
  const size = dimensions(shape, clearanceM);
  switch (shape.kind) {
    case "box":
      return MeshBuilder.CreateBox(name, {
        width: size.x, height: size.y, depth: size.z, wrap: true,
      }, scene);
    case "capsule":
      return MeshBuilder.CreateCapsule(name, {
        height: size.y, radius: size.x / 2, tessellation: 12, subdivisions: 2,
      }, scene);
    case "cylinder":
      return MeshBuilder.CreateCylinder(name, {
        height: size.y, diameter: size.x, tessellation: 16,
      }, scene);
    case "sphere":
      return MeshBuilder.CreateSphere(name, { diameter: size.x, segments: 12 }, scene);
  }
};

const containedScale = (shape: PrimitiveShape): number => {
  const size = dimensions(shape, 0);
  return Math.min(size.x, size.y, size.z) * 0.13;
};

/**
 * Build the visible mechanical reading of one authoritative primitive. The large shell is the
 * collider grown by exactly the declared clearance; bearings and rune cores remain inside that
 * envelope, so they cannot quietly enlarge hit geometry.
 */
export function buildConstructPartVisual(
  scene: Scene,
  owner: TransformNode,
  part: PartSpec,
  palette: ConstructMaterialPalette,
  surfaces: ConstructSurfaceRegistry,
): ConstructPartVisual {
  const made: Mesh[] = [];
  const presentedShape = constructPresentedShellShape(part.shape, part.shell.style);
  const body = shell(scene, `construct.${part.id}.shell`, presentedShape, part.shell.visualClearanceM);
  body.parent = owner;
  body.isPickable = true;
  surfaces.bind(body, surfaceBinding("part", part.id, `${part.id}:shell`, presentedShape,
    part.shell.visualClearanceM, part.shell.style));
  applyConstructSurface(body, palette, recipeForConstructShell(part.shell.style));
  made.push(body);

  const accentSize = containedScale(presentedShape);
  const bearing = MeshBuilder.CreateCylinder(
    `construct.${part.id}.bearing`,
    { height: accentSize * 0.55, diameter: accentSize * 2, tessellation: 12 },
    scene,
  );
  bearing.parent = owner;
  bearing.rotationQuaternion = Quaternion.FromEulerAngles(0, 0, Math.PI / 2);
  surfaces.bind(bearing, surfaceBinding("part", part.id, `${part.id}:bearing`,
    { kind: "cylinder", radiusM: accentSize, lengthM: accentSize * 0.55 }, 0, "bearing"), false);
  applyConstructSurface(bearing, palette, CONSTRUCT_SURFACE_RULES.joint.recipe);
  bearing.isPickable = false;
  made.push(bearing);

  const core = MeshBuilder.CreateSphere(
    `construct.${part.id}.rune-core`,
    { diameter: accentSize * 0.62, segments: 8 },
    scene,
  );
  core.parent = owner;
  core.position.z = Math.min(dimensions(presentedShape, 0).z * 0.35, accentSize * 1.3);
  surfaces.bind(core, surfaceBinding("part", part.id, `${part.id}:rune-core`,
    { kind: "sphere", radiusM: accentSize * 0.31 }, 0, "rune"), false);
  applyConstructSurface(core, palette, CONSTRUCT_SURFACE_RULES.rune.recipe);
  core.isPickable = false;
  made.push(core);

  let disposed = false;
  return {
    meshes: made,
    bearing,
    clearanceM: part.shell.visualClearanceM,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (let index = made.length - 1; index >= 0; index -= 1) {
        // The scene palette, including its generated grain textures, outlives every part.
        made[index].dispose(false, false);
      }
    },
  };
}

/** Module roots are socket-local facts that later launcher and combat sessions may take over without reparenting. */
export function buildConstructModuleVisual(
  scene: Scene,
  owner: TransformNode,
  socketFrame: AttachmentFrame,
  module: ModuleSpec,
  palette: ConstructMaterialPalette,
  surfaces: ConstructSurfaceRegistry,
): ConstructModuleVisual {
  const root = new TransformNode(`construct.${module.id}.module-root`, scene);
  root.parent = owner;
  root.position.copyFromFloats(...socketFrame.positionM);
  root.rotationQuaternion = Quaternion.FromArray(socketFrame.rotation);
  root.metadata = { constructModuleId: module.id, constructModuleKind: module.kind };
  const meshes: Mesh[] = [];
  try {
    const standOff = Math.hypot(socketFrame.positionM[0], socketFrame.positionM[2]);
    if (module.kind === "launcher" && standOff > 0.10) {
      // A collision-safe socket must still read as attached hardware. Route an
      // L bracket outboard first, then forward: the old shortest diagonal cut
      // straight through the chest and merely hid the same violation in a
      // non-solving visual.
      const makeBracket = (name: string, size: Vector3, position: Vector3) => {
        const bracket = MeshBuilder.CreateBox(`construct.${module.id}.${name}`, {
          width: size.x, height: size.y, depth: size.z,
        }, scene);
        bracket.parent = root;
        bracket.position.copyFrom(position);
        bracket.metadata = { constructModuleId: module.id, constructModuleKind: module.kind,
          constructSurfaceRole: "joint", presentationOnlyMountBracket: true };
        surfaces.bind(bracket, surfaceBinding("module", module.id, `${module.id}:${name}`,
          { kind: "box", sizeM: [size.x, size.y, size.z] }, 0, "bearing"), false);
        applyConstructSurface(bracket, palette, CONSTRUCT_SURFACE_RULES.joint.recipe);
        bracket.isPickable = false;
        meshes.push(bracket);
      };
      const x = socketFrame.positionM[0];
      const z = socketFrame.positionM[2];
      if (Math.abs(x) > 0.11) {
        // The pitch-arm shell already covers the first decimetre from its
        // socket. Drawing that span a second time put the cosmetic bracket
        // through the torso even though the actual launcher was clear.
        // The driven pitch-arm's 100 mm physical radius already owns the inner span. A bracket
        // beginning at 80 mm looked connected in bind pose but crossed the torso during the live
        // aim envelope. Begin at 140 mm: the small shell gap remains visually closed by the
        // bearing clearance, while no presentation-only box enters authoritative anatomy.
        const visible = Math.abs(x) - 0.14;
        makeBracket("mount-outboard", new Vector3(visible, 0.06, 0.06),
          // `root` is already at the offset socket. The owner's old socket is
          // therefore at (-x, -z): the outboard leg belongs in that rear plane,
          // not beside the launcher where it can sweep back through the torso.
          new Vector3(-Math.sign(x) * visible / 2, 0, -z));
      }
      makeBracket("mount-forward", new Vector3(0.06, 0.06, Math.abs(z) + 0.05),
        new Vector3(0, 0, -z / 2));
    }
    for (const spec of module.geometry) {
      const presentedShape = constructPresentedShellShape(spec.shape, spec.shell.style);
      const mesh = shell(scene, `construct.${module.id}.${spec.id}`, presentedShape,
        spec.shell.visualClearanceM);
      mesh.parent = root;
      mesh.position.copyFromFloats(...spec.frame.positionM);
      mesh.rotationQuaternion = Quaternion.FromArray(spec.frame.rotation);
      const role = roleForConstructShell(spec.shell.style);
      mesh.metadata = { constructModuleId: module.id, constructModuleKind: module.kind, constructSurfaceRole: role,
        authoritativePrimitiveId: spec.id };
      surfaces.bind(mesh, surfaceBinding("module", module.id, spec.id, presentedShape,
        spec.shell.visualClearanceM, spec.shell.style));
      applyConstructSurface(mesh, palette, CONSTRUCT_SURFACE_RULES[role].recipe);
      mesh.isPickable = false;
      meshes.push(mesh);
    }
  } catch (error) {
    for (let index = meshes.length - 1; index >= 0; index -= 1) meshes[index].dispose(false, false);
    root.dispose(false, false);
    throw error;
  }
  let disposed = false;
  return {
    root,
    meshes,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (let index = meshes.length - 1; index >= 0; index -= 1) meshes[index].dispose(false, false);
      root.dispose(false, false);
    },
  };
}

const frameWorld = (part: ConstructDebugPart, frame: AttachmentFrame): { position: Vector3; rotation: Quaternion } => {
  const partRotation = part.node.rotationQuaternion ?? Quaternion.Identity();
  const localRotation = Quaternion.FromArray(frame.rotation);
  return {
    position: Vector3.TransformCoordinates(Vector3.FromArray(frame.positionM),
      part.node.computeWorldMatrix(true)),
    rotation: partRotation.multiply(localRotation).normalize(),
  };
};

/** Debug facts are sampled from live body nodes and collider bounds; the blueprint supplies labels and local frames only. */
export function buildConstructDebugOverlay(
  scene: Scene,
  parts: readonly ConstructDebugPart[],
  joints: readonly ConstructDebugJoint[],
): ConstructDebugOverlay {
  const material = new StandardMaterial("construct.debug.material", scene);
  material.emissiveColor = new Color3(0.2, 0.9, 1);
  material.alpha = 0.45;
  const meshes: Mesh[] = [];
  for (const part of parts) {
    const box = MeshBuilder.CreateBox(`construct.debug.${part.id}.collider`, { size: 1 }, scene);
    const bounds = part.node.physicsBody?.getBoundingBox();
    if (bounds) {
      box.scaling.copyFrom(bounds.maximumWorld.subtract(bounds.minimumWorld));
      box.position.copyFrom(bounds.minimumWorld.add(bounds.maximumWorld).scale(0.5));
    }
    box.material = material;
    box.isPickable = false;
    box.visibility = 0.18;
    meshes.push(box);
  }
  for (const joint of joints) {
    for (const [side, sampled] of [
      ["parent", frameWorld(joint.parent, joint.parentFrame)],
      ["child", frameWorld(joint.child, joint.childFrame)],
    ] as const) {
      const axis = MeshBuilder.CreateLines(`construct.debug.${joint.id}.${side}`, {
        points: [sampled.position, sampled.position.add(Vector3.Right().rotateByQuaternionToRef(sampled.rotation, new Vector3()).scale(0.12))],
      }, scene);
      axis.color = new Color3(1, side === "parent" ? 0.35 : 0.85, 0.15);
      axis.isPickable = false;
      meshes.push(axis);
    }
  }
  let disposed = false;
  return {
    meshes,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (let index = meshes.length - 1; index >= 0; index -= 1) meshes[index].dispose(false, false);
      material.dispose(false, false);
    },
  };
}
