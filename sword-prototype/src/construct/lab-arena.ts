import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { ROOM_WALL_COLLIDERS } from "../arena-room.ts";
import { COLLIDES, LAYER } from "../physics.ts";

/** Physics-bearing arena geometry shared by browser and Node Construct Lab hosts. */
export function populateConstructLabArena(scene: Scene): void {
  if (!scene.getPhysicsEngine()) throw new Error("construct Lab arena requires physics before geometry");
  const ground = MeshBuilder.CreateBox("ground", { width: 60, height: 1, depth: 60 }, scene);
  ground.position.y = -0.5;
  const groundBody = new PhysicsAggregate(ground, PhysicsShapeType.BOX,
    { mass: 0, friction: 0.9, restitution: 0.02 }, scene);
  groundBody.shape.filterMembershipMask = LAYER.WORLD;
  groundBody.shape.filterCollideMask = COLLIDES.WORLD;

  for (const wall of ROOM_WALL_COLLIDERS) {
    const mesh = MeshBuilder.CreateBox(wall.name, { width: wall.width, height: wall.height, depth: wall.depth }, scene);
    mesh.position.set(...wall.position);
    const body = new PhysicsAggregate(mesh, PhysicsShapeType.BOX,
      { mass: 0, friction: 0.3, restitution: 0.05 }, scene);
    body.shape.filterMembershipMask = LAYER.WORLD;
    body.shape.filterCollideMask = COLLIDES.WORLD;
  }

  for (let index = 0; index < 14; index += 1) {
    const angle = index / 14 * Math.PI * 2;
    const post = MeshBuilder.CreateCylinder(`post${index}`,
      { height: 1.5, diameter: 0.17, tessellation: 8 }, scene);
    post.position.set(Math.sin(angle) * 9.5, 0.75, Math.cos(angle) * 9.5);
    const body = new PhysicsAggregate(post, PhysicsShapeType.CYLINDER, { mass: 0 }, scene);
    body.shape.filterMembershipMask = LAYER.WORLD;
    body.shape.filterCollideMask = COLLIDES.WORLD;
  }
}
