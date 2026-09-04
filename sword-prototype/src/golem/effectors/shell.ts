import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { materialForGolemRole, type GolemMaterialPalette } from "../materials.ts";

/**
 * The authored shell for a limb: what a module looks like, carrying no authority whatsoever.
 *
 * **Cosmetics never carry authority** (house rule), and here that is true by construction rather
 * than by intention: nothing in this file creates a `PhysicsAggregate`, a body, a shape or a
 * constraint, and every mesh it makes is `isPickable = false`. The collider is the capsule the
 * chain built; this is a set of boxes, spheres and cylinders parented to that capsule's mesh, so
 * they follow it for free.
 *
 * **Parented, which is also the disposal contract.** `Mesh.dispose(false, false)` recurses into
 * children and leaves materials alone, so a chain that disposes its collider mesh the way rung 1
 * already does takes its whole shell with it and leaves the palette's materials standing -- and
 * that second half is load-bearing, because `root.dispose(false, true)` recursively disposing a
 * *shared* material is how one weapon's disposal once removed another's texture. A shell mesh
 * that was not parented would be the leak, and the mesh census in `tests/golem-bench.test.mjs` is
 * what would find it.
 *
 * The proportions are chosen by eye against the stand, which is what the session plan asks for
 * and is not a measurement; the geometry they dress carries its own numbers and dates in
 * `src/golem/config.ts`.
 */

const attach = (mesh: Mesh, host: Mesh, at: Vector3, rotation?: Quaternion): Mesh => {
  mesh.isPickable = false;
  mesh.parent = host;
  mesh.position.copyFrom(at);
  mesh.rotationQuaternion = rotation ?? Quaternion.Identity();
  return mesh;
};

export interface BoneShellOptions {
  readonly name: string;
  /** The collider mesh this dresses. Everything made here is parented to it. */
  readonly host: Mesh;
  /** The bone's full length along its own local Y, metres. */
  readonly length: number;
  /** The collider's radius, metres. The shell is authored around it. */
  readonly radius: number;
  /** How much narrower the proud ridge is than the slab, as a fraction. */
  readonly taper: number;
  readonly materials: GolemMaterialPalette;
}

/**
 * A carved slab and a proud ridge, per bone.
 *
 * Two primitives rather than one because a single box reads as a crate: the narrower ridge set
 * proud of the slab is what makes a limb look carved rather than extruded, and it is the cheapest
 * thing that does. The bearing that belongs at each joint is `ballShell`'s, carried by the link
 * on the *inboard* side of that joint, so a chain gets one per joint by construction.
 */
export function boneShell(scene: Scene, options: BoneShellOptions): readonly AbstractMesh[] {
  const wide = options.radius * 2;
  const slab = MeshBuilder.CreateBox(`${options.name}.slab`, {
    width: wide, height: options.length - options.radius, depth: wide * 0.88,
  }, scene);
  slab.material = materialForGolemRole(options.materials, "shell");

  const ridge = MeshBuilder.CreateBox(`${options.name}.ridge`, {
    width: wide * (1 - options.taper), height: options.length * 0.58, depth: wide * 0.40,
  }, scene);
  ridge.material = materialForGolemRole(options.materials, "armour");

  return Object.freeze([
    attach(slab, options.host, Vector3.Zero()),
    // Proud along the bone's own -Z, which is the face the bench camera starts on.
    attach(ridge, options.host, new Vector3(0, -options.length * 0.06, -wide * 0.52)),
  ]);
}

export interface BallShellOptions {
  readonly name: string;
  readonly host: Mesh;
  readonly radius: number;
  /**
   * Which way the bronze band lies.
   *
   * `across` for a joint that turns about the limb's lateral -- a shoulder or an elbow -- and
   * `along` for one that turns about the limb's own long axis, which on these chains is the
   * wrist's roll. A band drawn the wrong way round is a bearing that says the joint turns
   * somewhere it does not, which is the one thing a cosmetic here can still get wrong.
   */
  readonly band: "across" | "along";
  readonly materials: GolemMaterialPalette;
}

/** A stone ball with a bronze band: what a bearing looks like. */
export function ballShell(scene: Scene, options: BallShellOptions): readonly AbstractMesh[] {
  const ball = MeshBuilder.CreateSphere(`${options.name}.ball`, {
    diameter: options.radius * 2, segments: 10,
  }, scene);
  ball.material = materialForGolemRole(options.materials, "shell");

  const band = MeshBuilder.CreateCylinder(`${options.name}.band`, {
    diameter: options.radius * 2.2, height: options.radius * 1.4, tessellation: 16,
  }, scene);
  band.material = materialForGolemRole(options.materials, "joint");
  // A cylinder is built along its own +Y, so `along` needs no turn and `across` is a quarter
  // turn about the limb's own +Z.
  const rotation = options.band === "along"
    ? Quaternion.Identity()
    : Quaternion.RotationAxis(new Vector3(0, 0, 1), Math.PI / 2);

  return Object.freeze([
    attach(ball, options.host, Vector3.Zero()),
    attach(band, options.host, Vector3.Zero(), rotation),
  ]);
}
