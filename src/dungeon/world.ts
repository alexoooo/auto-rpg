import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { StandableWorldRegistry } from "../supported-locomotion-runtime.ts";
import { LAYER, COLLIDES } from "../physics.ts";
import { cellKey, isFloor, walkable, type DungeonMap, type Point } from "./map.ts";

export function buildDungeonWorld(scene: Scene, map: DungeonMap, visuals = true) {
  const registry = new StandableWorldRegistry();
  const up = [0, 1, 0] as const;
  registry.register({ id: "dungeon-ground", category: "standable-world", ownerPartId: null, upwardNormal: up,
    support: at => isFloor(map, Math.round(at.x), Math.round(at.z))
      ? { colliderId: "dungeon-ground", fraction: 1, point: { x: at.x, y: 0, z: at.z }, upwardNormal: up } : null,
    sweep: () => null });
  registry.register({ id: "dungeon-solid", category: "wall", ownerPartId: null, upwardNormal: up,
    support: () => null,
    sweep: (from, to, footprint) => {
      // Substeps are short, but sample the entire sweep for callers proposing a longer move.
      const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.15));
      let safe = 0;
      for (let i = 1; i <= steps; i++) {
        const at = i / steps;
        if (walkable(map, { x: from.x + (to.x - from.x) * at, z: from.z + (to.z - from.z) * at }, footprint.radiusM, true)) { safe = at; continue; }
        let low = safe, high = at;
        for (let j = 0; j < 10; j++) {
          const middle = (low + high) / 2;
          if (walkable(map, { x: from.x + (to.x - from.x) * middle, z: from.z + (to.z - from.z) * middle }, footprint.radiusM, true)) low = middle;
          else high = middle;
        }
        return { colliderId: "dungeon-solid", fraction: low,
          point: { x: from.x + (to.x - from.x) * low, y: from.y, z: from.z + (to.z - from.z) * low }, upwardNormal: up };
      }
      return null;
    } });
  const material = (name: string, color: string) => {
    const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(color);
    m.specularColor.setAll(0.08); return m;
  };
  const stone = material("dungeon basalt", "#494b55"), floorMaterial = material("worn flagstones", "#77747a");
  const wood = material("ironbound doors", "#806044");
  const bodies: PhysicsAggregate[] = [];
  const box = (name: string, x: number, y: number, z: number, width: number, height: number, depth: number) => {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene); mesh.position.set(x, y, z);
    const body = new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0, friction: 0.8, restitution: 0.02 }, scene);
    body.shape.filterMembershipMask = LAYER.WORLD; body.shape.filterCollideMask = COLLIDES.WORLD;
    bodies.push(body); return { mesh, body };
  };
  const floor = box("dungeon slab", (map.size - 1) / 2, -0.5, (map.size - 1) / 2, map.size, 1, map.size);
  floor.mesh.isVisible = false;
  const walls: { mesh: AbstractMesh; cells: number[] }[] = [];
  const boundary = (x: number, z: number) => !isFloor(map, x, z) &&
    [-1, 0, 1].some(dx => [-1, 0, 1].some(dz => isFloor(map, x + dx, z + dz)));
  for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size;) {
    if (!boundary(x, z)) { x++; continue; }
    const start = x; while (x < map.size && x - start < 4 && boundary(x, z)) x++;
    const wall = box(`wall.${z}.${start}`, (start + x - 1) / 2, 1.4, z, x - start, 2.8, 1);
    wall.mesh.material = stone; wall.mesh.isPickable = false;
    const cells: number[] = [];
    for (let at = start - 1; at <= x; at++) for (let dz = -1; dz <= 1; dz++)
      if (isFloor(map, at, z + dz)) cells.push((z + dz) * map.size + at);
    walls.push({ mesh: wall.mesh, cells });
  }
  const doors = map.doors.map(d => {
    const object = box(`door.${d.id}`, d.point.x, 1.25, d.point.z, d.axis === "x" ? 0.35 : 3, 2.5, d.axis === "z" ? 0.35 : 3);
    object.mesh.material = wood; object.mesh.isPickable = false; return object;
  });
  const tiles: { mesh: AbstractMesh; memory: AbstractMesh; key: number }[] = [];
  if (visuals) {
    const source = MeshBuilder.CreateGround("flagstone", { width: 0.98, height: 0.98 }, scene);
    source.material = floorMaterial; source.isVisible = false;
    const memorySource = source.clone("remembered flagstone");
    memorySource.material = material("remembered floor", "#242831"); memorySource.isVisible = false;
    for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size; x++) if (isFloor(map, x, z)) {
      const mesh = source.createInstance(`tile.${x}.${z}`); mesh.position.set(x, 0.015, z); mesh.isPickable = false;
      const memory = memorySource.createInstance(`memory.${x}.${z}`); memory.position.copyFrom(mesh.position); memory.isPickable = false;
      tiles.push({ mesh, memory, key: z * map.size + x });
    }
  }
  const exit = MeshBuilder.CreateTorus("exit sigil", { diameter: 2, thickness: 0.12, tessellation: 40 }, scene);
  exit.position.set(map.exit.x, 0.06, map.exit.z); exit.isPickable = false;
  const exitMaterial = material("exit light", "#93edcf"); exitMaterial.emissiveColor = Color3.FromHexString("#42b998"); exit.material = exitMaterial;
  return {
    registry,
    openNearby(actors: readonly Point[]) {
      for (const door of map.doors) if (!door.open && actors.some(p => Math.hypot(p.x - door.point.x, p.z - door.point.z) < 2.5)) {
        door.open = true;
        doors[door.id].body.shape.filterCollideMask = 0;
        doors[door.id].body.shape.filterMembershipMask = 0;
        doors[door.id].mesh.isVisible = false;
      }
    },
    present(visible: ReadonlySet<number>, explored: ReadonlySet<number>, hero: Point) {
      for (const tile of tiles) { tile.mesh.isVisible = visible.has(tile.key); tile.memory.isVisible = explored.has(tile.key) && !visible.has(tile.key); }
      for (const wall of walls) {
        wall.mesh.isVisible = wall.cells.some(k => explored.has(k));
        // Camera looks from +X,+Z. Foreground walls within the hero's projected column fade.
        const dx = wall.mesh.position.x - hero.x, dz = wall.mesh.position.z - hero.z;
        const width = wall.mesh.getBoundingInfo().boundingBox.extendSize.x;
        const obstructs = dx + dz > 0 && dx + dz < 9 && Math.abs(dx - dz) < width + 2.5;
        wall.mesh.visibility = obstructs ? 0.16 : wall.cells.some(k => visible.has(k)) ? 1 : 0.25;
      }
      for (const door of map.doors) doors[door.id].mesh.isVisible = !door.open &&
        (explored.has(cellKey(map, door.point)) || [...explored].some(k => Math.hypot(k % map.size - door.point.x, Math.floor(k / map.size) - door.point.z) < 1.6));
      exit.isVisible = explored.has(cellKey(map, map.exit));
    },
    dispose() { for (const body of bodies) body.dispose(); },
  };
}
