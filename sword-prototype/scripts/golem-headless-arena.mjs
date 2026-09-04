import { readFile } from "node:fs/promises";

import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import HavokPhysics from "@babylonjs/havok";

import { ROOM_WALL_COLLIDERS } from "../src/arena-room.ts";
import { CONFIG } from "../src/config.ts";
import { COLLIDES, LAYER, attachPhysics } from "../src/physics.ts";

const wasmPath = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const wasmBinary = await readFile(wasmPath);

/**
 * The physics-bearing arena geometry: ground slab, the room's wall colliders and the ring of
 * posts. Renamed from `populateConstructLabArena` on 2026-09-04 and inlined here, because its
 * `src/construct/lab-arena.ts` home went with the construct tree while both surviving callers
 * of this harness -- the Warrior/Warrior locomotion corpus and the supported-fist trigger
 * test -- need a floor to stand on. The geometry is byte-for-byte what the construct module
 * built; nothing here is new, so no measurement taken through it moves.
 */
function populateArena(scene) {
  if (!scene.getPhysicsEngine()) throw new Error("headless arena requires physics before geometry");
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

/**
 * The physics-bearing subset of the page arena, with a fresh Havok instance per authoritative
 * job. A physical fixture may replace the room geometry, but it must install its shapes into
 * this same scene; query-only obstacles belong in the pure registry tests, not this real-Havok
 * host.
 *
 * Salvaged on 2026-09-04 from `scripts/construct-headless-arena.mjs`
 * (`createConstructHeadlessArena`). It is the golem bench's Node harness from session 02 on.
 */
export async function createHeadlessArena({ populateDefaultGeometry = true,
  populateFixture = null } = {}) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  attachPhysics(scene, await HavokPhysics({ wasmBinary }));
  scene.getPhysicsEngine().setSubTimeStep(1000 / CONFIG.world.physicsHz);

  if (populateDefaultGeometry) populateArena(scene);
  const fixture = populateFixture?.(scene) ?? null;

  return Object.freeze({
    scene,
    fixture,
    dispose: () => { scene.dispose(); engine.dispose(); },
  });
}
