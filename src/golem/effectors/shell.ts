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
 * A carved slab, a proud ridge and a bronze bearing at the far end, per bone.
 *
 * Three primitives rather than one, and each earns its place. A single box reads as a crate, so
 * the narrower ridge set proud of it is what makes a limb look carved rather than extruded. And
 * the bearing is at the bone's **distal** end rather than its proximal one, which is not
 * arbitrary: put at the proximal end it would sit inside whatever bearing the link above already
 * carries, and put nowhere at all -- which is what the first draft did -- the joints are visible
 * gaps between two slabs and the limb reads as a stack of boxes with air between them. Distal
 * gives exactly one bearing per joint: the collar's `ballShell` covers the shoulder, the upper
 * arm's covers the elbow, the forearm's covers the wrist.
 *
 * The slab runs the bone's **full length** for the same reason. Cut short by a radius it left a
 * 70 mm gap at every joint, which the bearing then has to hide rather than decorate.
 *
 * Chosen by eye against the stand with the blade on, 2026-09-04.
 */
export function boneShell(scene: Scene, options: BoneShellOptions): readonly AbstractMesh[] {
  const wide = options.radius * 2;
  const slab = MeshBuilder.CreateBox(`${options.name}.slab`, {
    width: wide, height: options.length, depth: wide * 0.88,
  }, scene);
  slab.material = materialForGolemRole(options.materials, "shell");

  const ridge = MeshBuilder.CreateBox(`${options.name}.ridge`, {
    width: wide * (1 - options.taper), height: options.length * 0.58, depth: wide * 0.40,
  }, scene);
  ridge.material = materialForGolemRole(options.materials, "armour");

  const bearing = MeshBuilder.CreateCylinder(`${options.name}.bearing`, {
    diameter: wide * 1.16, height: wide * 1.06, tessellation: 16,
  }, scene);
  bearing.material = materialForGolemRole(options.materials, "joint");

  return Object.freeze([
    attach(slab, options.host, Vector3.Zero()),
    // Proud along the bone's own -Z, which is the face the bench camera starts on.
    attach(ridge, options.host, new Vector3(0, -options.length * 0.06, -wide * 0.52)),
    // Lying across the bone, because the axis a bearing is drawn about is the axis its joint
    // turns about, and every joint below the shoulder here turns about the limb's own lateral.
    attach(bearing, options.host, new Vector3(0, -options.length / 2, 0),
      Quaternion.RotationAxis(new Vector3(0, 0, 1), Math.PI / 2)),
  ]);
}

export interface PlateShellOptions {
  readonly name: string;
  readonly host: Mesh;
  /** The collider slab's own extents in its local X, Y and Z, metres. */
  readonly size: Vector3;
  /** How far the chamfered face is inset from the slab's edge, metres. */
  readonly chamferInset: number;
  /** How proud the bronze rim stands, as a fraction of the slab's thickness. */
  readonly rimProud: number;
  readonly materials: GolemMaterialPalette;
}

/**
 * A chamfered face and a bronze rim over the plate's own slab.
 *
 * Two primitives, and each is there for a reason a flat box does not answer. The **chamfer** is
 * a smaller slab set proud of the outer face, so the board reads as carved from a block rather
 * than sawn from a sheet -- the same argument `boneShell`'s ridge carries. The **rim** is a
 * slightly oversized thin slab at the board's own mid-plane, so a band of bronze shows all the
 * way round the edge from any angle, which is what tells a person at a glance which way the
 * board faces.
 *
 * Neither creates a body, a shape or a constraint, and both are `isPickable = false`. The
 * collider is the slab underneath: cosmetics never carry authority, and a rim that stood proud
 * in the *collider* would be a plate that blocks 30 mm wider than it looks.
 */
export function plateShell(scene: Scene, options: PlateShellOptions): readonly AbstractMesh[] {
  const s = options.size;
  const inset = options.chamferInset;
  const chamfer = MeshBuilder.CreateBox(`${options.name}.chamfer`, {
    width: Math.max(0.02, s.x - inset * 2),
    height: s.y * 0.6,
    depth: Math.max(0.02, s.z - inset * 2),
  }, scene);
  chamfer.material = materialForGolemRole(options.materials, "armour");

  const rim = MeshBuilder.CreateBox(`${options.name}.rim`, {
    width: s.x + 0.03, height: s.y * options.rimProud, depth: s.z + 0.03,
  }, scene);
  rim.material = materialForGolemRole(options.materials, "joint");

  return Object.freeze([
    // Proud of the **outer** face, which is the slab's own +Y: that is the face normal in
    // `Weapon`'s shield frame and the direction the plate is asked to point.
    attach(chamfer, options.host, new Vector3(0, s.y * 0.5, 0)),
    attach(rim, options.host, Vector3.Zero()),
  ]);
}

export interface BarShellOptions {
  readonly name: string;
  readonly host: Mesh;
  /** The head's diameter, metres, and where its centre sits along the host's own +Y. */
  readonly headDiameter: number;
  readonly headAt: number;
  /** Where each grip collar sits along the host's own +Y, metres. */
  readonly grips: readonly number[];
  /** The haft's collider radius, metres. The collars are authored around it. */
  readonly haftRadius: number;
  readonly materials: GolemMaterialPalette;
}

/**
 * A head at one end and a collar at each grip: what a two-handed bar looks like.
 *
 * The head is drawn here and **weighed** in `TERMINAL_MACE.mass` and `balanceFraction`, which is
 * the one place in this file where a shell and a number have to agree: the collider is a single
 * capsule the length of the whole bar, because a second leaf would mean a
 * `PhysicsShapeContainer` and a container's own collision filter is a shape nothing consults.
 * So the head's mass is real and its *shape* is cosmetic, and a session that moves the drawn
 * head has to move the balance point with it.
 *
 * The collars are what make the trailing arm read as gripping rather than touching, which is the
 * gate's own question about this terminal.
 */
export function barShell(scene: Scene, options: BarShellOptions): readonly AbstractMesh[] {
  const head = MeshBuilder.CreateSphere(`${options.name}.head`, {
    diameter: options.headDiameter, segments: 12,
  }, scene);
  head.material = materialForGolemRole(options.materials, "armour");
  const drawn: AbstractMesh[] = [attach(head, options.host, new Vector3(0, options.headAt, 0))];

  for (const [index, at] of options.grips.entries()) {
    const collar = MeshBuilder.CreateCylinder(`${options.name}.grip${index}`, {
      diameter: options.haftRadius * 2.5, height: options.haftRadius * 2.2, tessellation: 14,
    }, scene);
    collar.material = materialForGolemRole(options.materials, "joint");
    // A cylinder is built along its own +Y and the bar runs along +Y, so a collar needs no turn.
    drawn.push(attach(collar, options.host, new Vector3(0, at, 0)));
  }
  return Object.freeze(drawn);
}

export interface BeadShellOptions {
  readonly name: string;
  readonly host: Mesh;
  readonly radius: number;
  /** Where the bead sits along the host's own +Y, metres: the segment's far end. */
  readonly at: number;
  readonly materials: GolemMaterialPalette;
}

/**
 * One bronze bead at a lash segment's far end.
 *
 * The whip's own colliders are drawn -- a bead is a capsule and a capsule is what it looks like,
 * the same case the blade makes for being its own mesh -- so all this adds is the knuckle at
 * each joint, which is what stops eight identical capsules reading as a rope of sausages. At the
 * segment's **far** end for `boneShell`'s reason: put at the near end it would sit inside the
 * bead above it, and put nowhere at all the joints are visible gaps.
 */
export function beadShell(scene: Scene, options: BeadShellOptions): readonly AbstractMesh[] {
  const bead = MeshBuilder.CreateSphere(`${options.name}.bead`, {
    diameter: options.radius * 2.5, segments: 8,
  }, scene);
  bead.material = materialForGolemRole(options.materials, "joint");
  return Object.freeze([attach(bead, options.host, new Vector3(0, options.at, 0))]);
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
