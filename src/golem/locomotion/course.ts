import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { COLLIDES, LAYER } from "../../physics.ts";
import type {
  LocomotionFootprint,
  StandableWorldRegistry,
  WorldPoint,
  WorldQueryCollider,
  WorldQueryHit,
} from "../../supported-locomotion-runtime.ts";

/**
 * The locomotion bench's course: things to walk into, both as Havok bodies and as query colliders.
 *
 * **Two halves, and they are not the same half.** `AGENTS.md`'s rule is that a support query unit
 * test is not a physical obstacle corpus: a fake root that records bounded forces can prove a
 * clamp or a slope predicate, but it cannot prove Havok penetration, joint-frame error or what a
 * real leg does when it meets a real post. So every obstacle here exists **twice** -- as a real
 * `PhysicsAggregate` on the world layer that the golem's feet actually collide with, and as a
 * `WorldQueryCollider` in the registry the virtual carrier navigates against -- and the two halves
 * are built from the same numbers in the same call so they cannot drift apart.
 *
 * That pairing is the whole point. The carrier is bodyless and has no idea a post exists unless
 * the registry tells it; the feet are real bodies and hit the post whether the registry knows or
 * not. A course that registered only one half would be exactly the failure this file is for: the
 * golem either walks its carrier through a post while its legs jam on it, or stops in front of
 * empty air.
 *
 * **What the V1 carrier does not do, stated so nobody reads the low step as a claim it does.** The
 * carrier's `commit` preserves its own `y`, so it does not climb: `LocomotionFootprint.stepHeightM`
 * is the vertical tolerance on *support evidence*, not a step a carrier ascends. The low step here
 * is the cell that asks what a walking golem's legs do when they meet a 0.12 m lip while the root
 * stays where it is; the curb is the cell that asks whether the carrier stops.
 */

/** Where each piece of the course stands, in the bench's own frame. Metres. */
export const LOCOMOTION_COURSE = Object.freeze({
  /** A low lip in front of the stand: walkable in the sense that the support evidence survives. */
  step: Object.freeze({ x: 0, z: 2.0, width: 3.2, depth: 1.4, height: 0.12 }),
  /** A curb behind it, tall enough that the carrier's own footprint sweep must refuse it. */
  curb: Object.freeze({ x: 0, z: -2.4, width: 3.2, depth: 0.5, height: 0.40 }),
  /** A row of the arena's own ring posts, brought in close enough to circle. */
  posts: Object.freeze([
    Object.freeze({ x: -1.15, z: 3.6 }),
    Object.freeze({ x: 0, z: 3.6 }),
    Object.freeze({ x: 1.15, z: 3.6 }),
  ]),
  postRadius: 0.085,
  postHeight: 1.5,
});

export interface LocomotionCourse {
  readonly meshes: readonly Mesh[];
  dispose(): void;
}

/** The physical half: real bodies on the world layer, which is what a foot actually hits. */
export function buildLocomotionCourse(scene: Scene, material?: Material): LocomotionCourse {
  const C = LOCOMOTION_COURSE;
  const meshes: Mesh[] = [];
  const aggregates: PhysicsAggregate[] = [];
  const solid = (mesh: Mesh, friction: number): void => {
    if (material) mesh.material = material;
    mesh.receiveShadows = true;
    const body = new PhysicsAggregate(mesh, mesh.name.includes("post")
      ? PhysicsShapeType.CYLINDER : PhysicsShapeType.BOX,
    { mass: 0, friction, restitution: 0.02 }, scene);
    body.shape.filterMembershipMask = LAYER.WORLD;
    body.shape.filterCollideMask = COLLIDES.WORLD;
    meshes.push(mesh);
    aggregates.push(body);
  };

  const step = MeshBuilder.CreateBox("golem.course.step",
    { width: C.step.width, height: C.step.height, depth: C.step.depth }, scene);
  step.position.set(C.step.x, C.step.height / 2, C.step.z);
  solid(step, 0.9);

  const curb = MeshBuilder.CreateBox("golem.course.curb",
    { width: C.curb.width, height: C.curb.height, depth: C.curb.depth }, scene);
  curb.position.set(C.curb.x, C.curb.height / 2, C.curb.z);
  solid(curb, 0.9);

  for (const [index, post] of C.posts.entries()) {
    const mesh = MeshBuilder.CreateCylinder(`golem.course.post${index}`,
      { height: C.postHeight, diameter: C.postRadius * 2, tessellation: 8 }, scene);
    mesh.position.set(post.x, C.postHeight / 2, post.z);
    solid(mesh, 0.5);
  }

  return Object.freeze({
    meshes,
    dispose: (): void => {
      for (const aggregate of aggregates) aggregate.dispose();
      for (let index = meshes.length - 1; index >= 0; index -= 1) {
        if (!meshes[index].isDisposed()) meshes[index].dispose(false, false);
      }
    },
  });
}

const UP_NORMAL = Object.freeze([0, 1, 0] as const);

const hit = (id: string, fraction: number, at: WorldPoint,
  upwardNormal: readonly [number, number, number] = UP_NORMAL): WorldQueryHit =>
  Object.freeze({ colliderId: id, fraction,
    point: Object.freeze({ x: at.x, y: at.y, z: at.z }), upwardNormal });

/**
 * The earliest fraction along `from -> to` at which a swept disc of `radius` touches a disc of
 * `other` at `(cx, cz)`, or null.
 *
 * The same quadratic `resolveCarrierPair` uses for two carriers, written once more here because a
 * post is a disc too and duplicating the pair resolver's private helper would be a second copy of
 * a rule -- which is the defect that let the club's own damage floor never run.
 */
const sweptDisc = (from: WorldPoint, to: WorldPoint, cx: number, cz: number,
  required: number): number | null => {
  const px = from.x - cx;
  const pz = from.z - cz;
  const vx = to.x - from.x;
  const vz = to.z - from.z;
  const c = px * px + pz * pz - required * required;
  if (c <= 0) return 0;
  const a = vx * vx + vz * vz;
  if (a <= 1e-18) return null;
  const b = 2 * (px * vx + pz * vz);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = (-b - Math.sqrt(discriminant)) / (2 * a);
  return root >= 0 && root <= 1 ? root : null;
};

/** The earliest fraction at which a swept disc enters an axis-aligned box, or null. */
const sweptBox = (from: WorldPoint, to: WorldPoint, box: Readonly<{
  x: number; z: number; width: number; depth: number;
}>, radius: number): number | null => {
  const halfX = box.width / 2 + radius;
  const halfZ = box.depth / 2 + radius;
  const inside = (x: number, z: number): boolean =>
    Math.abs(x - box.x) <= halfX && Math.abs(z - box.z) <= halfZ;
  if (inside(from.x, from.z)) return 0;
  if (!inside(to.x, to.z)) return null;
  // A bisection rather than a slab intersection: the segment is one substep long -- at 1.2 m/s
  // and 240 Hz that is 5 mm -- so twenty halvings resolve the contact to well under a micron,
  // and a rectangle's exact entry point is not worth a second copy of a slab test that would then
  // have to agree with this one.
  let low = 0;
  let high = 1;
  for (let index = 0; index < 24; index += 1) {
    const mid = (low + high) / 2;
    if (inside(from.x + (to.x - from.x) * mid, from.z + (to.z - from.z) * mid)) high = mid;
    else low = mid;
  }
  return high;
};

/**
 * The query half: register the same course into the registry the carrier navigates against.
 *
 * Returns the collider ids, so a caller that rebuilds a module can take its own course back out
 * again -- `StandableWorldRegistry.register` throws on a duplicate id, which is what makes a
 * bench that rebuilds its module without unregistering fail loudly rather than quietly double.
 */
export function registerLocomotionCourse(registry: StandableWorldRegistry): readonly string[] {
  const C = LOCOMOTION_COURSE;
  const ids: string[] = [];
  const add = (collider: WorldQueryCollider): void => {
    registry.register(collider);
    ids.push(collider.id);
  };

  add(Object.freeze({
    id: "golem.course.step",
    // Standable, not a wall: its top is inside the footprint's own step envelope, so a sole on it
    // still publishes support and the carrier is not asked to refuse it.
    category: "standable-world" as const,
    ownerPartId: null,
    upwardNormal: UP_NORMAL,
    sweep: () => null,
    support: (at: WorldPoint): WorldQueryHit | null =>
      Math.abs(at.x - C.step.x) <= C.step.width / 2 && Math.abs(at.z - C.step.z) <= C.step.depth / 2
        ? hit("golem.course.step", 1, { x: at.x, y: C.step.height, z: at.z })
        : null,
  }));

  add(Object.freeze({
    id: "golem.course.curb",
    category: "wall" as const,
    ownerPartId: null,
    upwardNormal: UP_NORMAL,
    support: () => null,
    sweep: (from: WorldPoint, to: WorldPoint, footprint: LocomotionFootprint): WorldQueryHit | null => {
      const fraction = sweptBox(from, to, C.curb, footprint.radiusM);
      return fraction === null ? null : hit("golem.course.curb", fraction,
        { x: from.x + (to.x - from.x) * fraction, y: from.y, z: from.z + (to.z - from.z) * fraction });
    },
  }));

  for (const [index, post] of C.posts.entries()) {
    const id = `golem.course.post${index}`;
    add(Object.freeze({
      id,
      category: "wall" as const,
      ownerPartId: null,
      upwardNormal: UP_NORMAL,
      support: () => null,
      sweep: (from: WorldPoint, to: WorldPoint, footprint: LocomotionFootprint): WorldQueryHit | null => {
        const fraction = sweptDisc(from, to, post.x, post.z, C.postRadius + footprint.radiusM);
        return fraction === null ? null : hit(id, fraction,
          { x: from.x + (to.x - from.x) * fraction, y: from.y,
            z: from.z + (to.z - from.z) * fraction });
      },
    }));
  }
  return Object.freeze(ids);
}
