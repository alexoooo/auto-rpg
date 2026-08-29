import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";

import type { AttachmentFrame, ModuleSpec, PartSpec, PrimitiveShape } from "./blueprint.ts";
import {
  applyConstructSurface,
  materialForConstructRole,
  recipeForConstructShell,
  roleForConstructShell,
  type ConstructMaterialPalette,
} from "./materials.ts";

export interface ConstructPartVisual {
  readonly meshes: readonly Mesh[];
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
): ConstructPartVisual {
  const made: Mesh[] = [];
  const body = shell(scene, `construct.${part.id}.shell`, part.shape, part.shell.visualClearanceM);
  body.parent = owner;
  body.isPickable = true;
  applyConstructSurface(body, palette, recipeForConstructShell(part.shell.style));
  made.push(body);

  const accentSize = containedScale(part.shape);
  const bearing = MeshBuilder.CreateCylinder(
    `construct.${part.id}.bearing`,
    { height: accentSize * 0.55, diameter: accentSize * 2, tessellation: 12 },
    scene,
  );
  bearing.parent = owner;
  bearing.rotationQuaternion = Quaternion.FromEulerAngles(0, 0, Math.PI / 2);
  bearing.material = materialForConstructRole(palette, "joint");
  bearing.isPickable = false;
  made.push(bearing);

  const core = MeshBuilder.CreateSphere(
    `construct.${part.id}.rune-core`,
    { diameter: accentSize * 0.62, segments: 8 },
    scene,
  );
  core.parent = owner;
  core.position.z = Math.min(dimensions(part.shape, 0).z * 0.35, accentSize * 1.3);
  core.material = materialForConstructRole(palette, "rune");
  core.isPickable = false;
  made.push(core);

  let disposed = false;
  return {
    meshes: made,
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
): ConstructModuleVisual {
  const root = new TransformNode(`construct.${module.id}.module-root`, scene);
  root.parent = owner;
  root.position.copyFromFloats(...socketFrame.positionM);
  root.rotationQuaternion = Quaternion.FromArray(socketFrame.rotation);
  root.metadata = { constructModuleId: module.id, constructModuleKind: module.kind };
  const meshes: Mesh[] = [];
  try {
    for (const spec of module.geometry) {
      const mesh = shell(scene, `construct.${module.id}.${spec.id}`, spec.shape, spec.shell.visualClearanceM);
      mesh.parent = root;
      mesh.position.copyFromFloats(...spec.frame.positionM);
      mesh.rotationQuaternion = Quaternion.FromArray(spec.frame.rotation);
      const role = roleForConstructShell(spec.shell.style);
      mesh.material = materialForConstructRole(palette, role);
      mesh.metadata = { constructModuleId: module.id, constructModuleKind: module.kind, constructSurfaceRole: role,
        authoritativePrimitiveId: spec.id };
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
