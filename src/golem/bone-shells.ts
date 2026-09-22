import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

import type { HEAD_NECK } from "./config.ts";
import type { BallShellOptions, BoneShellOptions } from "./effectors/shell.ts";
import { materialForGolemRecipe, materialForGolemRole, type GolemMaterialPalette } from "./materials.ts";

/**
 * Bone shells: what a skeleton looks like, carrying no authority whatsoever.
 *
 * The same contract as `src/golem/effectors/shell.ts`. Nothing here creates a body, a shape or a
 * constraint; every mesh is parented to its host collider, is `isPickable = false`, and goes
 * with the host's `dispose(false, false)` while the palette's materials stay standing.
 *
 * **Each builder hides its host.** A carved shell dresses a collider that stays visible; a bone
 * shell is the whole drawing of its part, so the capsule or box underneath would show through
 * the gaps between the bones. The human skin treats its hosts the same way
 * (`src/golem/humanoid/appearance.ts`), and `forgeAppearance` skips a hidden source.
 *
 * Everything is `carved-bone` except the skull's eyes, which are `rune` and are spheres: forge
 * art replaces a 24-vertex box in the rune material, so a rune box here would be swapped for a
 * carved inlay.
 *
 * The proportions are a first draft for a person to adjust on the bench, not a measurement. In
 * each host's local frame, Y runs along a bone, and on a head, pelvis or trunk +Z is forward.
 */

const attach = (mesh: Mesh, host: Mesh, at: Vector3, rotation?: Quaternion): Mesh => {
  mesh.isPickable = false;
  mesh.parent = host;
  mesh.position.copyFrom(at);
  mesh.rotationQuaternion = rotation ?? Quaternion.Identity();
  return mesh;
};

const bone = (materials: GolemMaterialPalette) => materialForGolemRecipe(materials, "carved-bone");

/** A quarter turn about X: a cylinder built along +Y then runs along +Z. */
const ALONG_Z = (): Quaternion => Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI / 2);
/** A quarter turn about Z: a cylinder built along +Y then runs along X. */
const ACROSS_X = (): Quaternion => Quaternion.RotationAxis(new Vector3(0, 0, 1), Math.PI / 2);

/** A limb bone: a shaft with a condyle at each end. `taper` is a carved slab's and is not read. */
export function boneShaft(scene: Scene, options: BoneShellOptions): readonly AbstractMesh[] {
  options.host.isVisible = false;
  const r = options.radius;
  const shaft = MeshBuilder.CreateCylinder(`${options.name}.shaft`, {
    diameter: 2 * r * 0.85, height: options.length * 0.84, tessellation: 10,
  }, scene);
  shaft.material = bone(options.materials);
  const made: Mesh[] = [attach(shaft, options.host, Vector3.Zero())];
  for (const [end, sign] of [["Near", -1], ["Far", 1]] as const) {
    const condyle = MeshBuilder.CreateSphere(`${options.name}.condyle${end}`, {
      diameter: 2 * r * 1.45, segments: 8,
    }, scene);
    condyle.material = shaft.material;
    made.push(attach(condyle, options.host, new Vector3(0, sign * (options.length / 2 - r * 0.5), 0)));
  }
  return Object.freeze(made);
}

/** A joint: a bone knuckle, and an axle along the limb when the bearing has one. No band. */
export function boneKnuckle(scene: Scene, options: BallShellOptions): readonly AbstractMesh[] {
  options.host.isVisible = false;
  const knuckle = MeshBuilder.CreateSphere(`${options.name}.knuckle`, {
    diameter: options.radius * 2, segments: 8,
  }, scene);
  knuckle.material = bone(options.materials);
  const made: Mesh[] = [attach(knuckle, options.host, Vector3.Zero())];
  if (options.axleLength) {
    const axle = MeshBuilder.CreateCylinder(`${options.name}.axle`, {
      diameter: options.radius * 1.1, height: options.axleLength, tessellation: 10,
    }, scene);
    axle.material = knuckle.material;
    made.push(attach(axle, options.host, Vector3.Zero()));
  }
  return Object.freeze(made);
}

/** The trunk: a spine at the back, a sternum at the front, five ribs and a clavicle. */
export function ribcageShell(scene: Scene, options: {
  readonly name: string;
  readonly host: Mesh;
  readonly tuning: { readonly coreWidth: number; readonly coreHeight: number; readonly coreDepth: number };
  readonly materials: GolemMaterialPalette;
}): readonly AbstractMesh[] {
  options.host.isVisible = false;
  const W = options.tuning.coreWidth, H = options.tuning.coreHeight, D = options.tuning.coreDepth;
  const material = bone(options.materials);
  const made: Mesh[] = [];

  const spine = MeshBuilder.CreateCylinder(`${options.name}.spine`, {
    diameter: 0.032, height: H, tessellation: 10,
  }, scene);
  made.push(attach(spine, options.host, new Vector3(0, 0, -D * 0.38)));
  const sternum = MeshBuilder.CreateCylinder(`${options.name}.sternum`, {
    diameter: 0.024, height: H * 0.55, tessellation: 10,
  }, scene);
  made.push(attach(sternum, options.host, new Vector3(0, 0, D * 0.44)));

  // Five ribs from the floating ribs up to the first, widest in the middle. A torus lies in its
  // own XZ plane, which is the plane a rib runs round the trunk in; the Z scale makes it the
  // trunk's depth rather than its width.
  const spans = [0.78, 0.92, 0.98, 0.94, 0.80];
  for (const [index, span] of spans.entries()) {
    const rib = MeshBuilder.CreateTorus(`${options.name}.rib${index}`, {
      diameter: W * span, thickness: 0.014, tessellation: 16,
    }, scene);
    rib.scaling.z = D / W;
    const y = H * (-0.30 + (0.36 + 0.30) * (index / (spans.length - 1)));
    made.push(attach(rib, options.host, new Vector3(0, y, 0)));
  }

  const clavicle = MeshBuilder.CreateCylinder(`${options.name}.clavicle`, {
    diameter: 0.024, height: W * 0.86, tessellation: 10,
  }, scene);
  made.push(attach(clavicle, options.host, new Vector3(0, H * 0.46, 0), ACROSS_X()));

  for (const mesh of made) mesh.material = material;
  return Object.freeze(made);
}

/** A skull: a cranium, a jaw and two rune eyes. Sized by the head table it was built from. */
export function skullShell(scene: Scene, options: {
  readonly name: string;
  readonly host: Mesh;
  readonly table: typeof HEAD_NECK;
  readonly materials: GolemMaterialPalette;
}): readonly AbstractMesh[] {
  options.host.isVisible = false;
  const N = options.table;
  const W = N.headWidth, H = N.headHeight, D = N.headDepth;

  const cranium = MeshBuilder.CreateSphere(`${options.name}.cranium`, { diameter: W, segments: 8 }, scene);
  cranium.scaling.set(1, H / W, D / W);
  cranium.material = bone(options.materials);
  const jaw = MeshBuilder.CreateBox(`${options.name}.jaw`, {
    width: W * 0.62, height: H * 0.22, depth: D * 0.50,
  }, scene);
  jaw.material = cranium.material;

  const made: Mesh[] = [
    attach(cranium, options.host, new Vector3(0, H * 0.08, 0)),
    attach(jaw, options.host, new Vector3(0, -H * 0.36, D * 0.18)),
  ];
  for (const [side, sign] of [["L", -1], ["R", 1]] as const) {
    const eye = MeshBuilder.CreateSphere(`${options.name}.eye${side}`, { diameter: W * 0.20, segments: 8 }, scene);
    eye.material = materialForGolemRole(options.materials, "rune");
    made.push(attach(eye, options.host, new Vector3(sign * W * 0.22, H * 0.02, N.browOffset * 0.85)));
  }
  return Object.freeze(made);
}

/**
 * A pelvis: a ring standing upright and facing forward, and a sacrum at the back.
 *
 * The torus is built lying in its XZ plane, turned a quarter about X to stand in XY, and squashed
 * on its own Z (which the turn makes vertical) so the ring is as tall as the collider rather than
 * as tall as it is wide.
 */
export function bonePelvisShell(scene: Scene, options: {
  readonly name: string;
  readonly host: Mesh;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly materials: GolemMaterialPalette;
}): readonly AbstractMesh[] {
  options.host.isVisible = false;
  const diameter = options.width * 0.9;
  const ring = MeshBuilder.CreateTorus(`${options.name}.ring`, {
    diameter, thickness: options.height * 0.35, tessellation: 16,
  }, scene);
  ring.scaling.z = options.height / diameter;
  ring.material = bone(options.materials);
  const sacrum = MeshBuilder.CreateCylinder(`${options.name}.sacrum`, {
    diameter: options.height * 0.5, height: options.height, tessellation: 10,
  }, scene);
  sacrum.material = ring.material;
  return Object.freeze([
    attach(ring, options.host, Vector3.Zero(), ALONG_Z()),
    attach(sacrum, options.host, new Vector3(0, 0, -options.depth * 0.35)),
  ]);
}

/** A foot: three metatarsals running forward and a heel. */
export function boneFootShell(scene: Scene, options: {
  readonly name: string;
  readonly host: Mesh;
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly materials: GolemMaterialPalette;
}): readonly AbstractMesh[] {
  options.host.isVisible = false;
  const material = bone(options.materials);
  const made: Mesh[] = [];
  for (const [index, across] of [-0.3, 0, 0.3].entries()) {
    const metatarsal = MeshBuilder.CreateCylinder(`${options.name}.metatarsal${index}`, {
      diameter: options.height * 0.36, height: options.length * 0.7, tessellation: 10,
    }, scene);
    metatarsal.material = material;
    made.push(attach(metatarsal, options.host,
      new Vector3(across * options.width, 0, options.length * 0.10), ALONG_Z()));
  }
  const heel = MeshBuilder.CreateSphere(`${options.name}.heel`, {
    diameter: options.height * 0.9, segments: 8,
  }, scene);
  heel.material = material;
  made.push(attach(heel, options.host, new Vector3(0, 0, -options.length * 0.38)));
  return Object.freeze(made);
}
