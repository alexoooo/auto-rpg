import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { StandableWorldRegistry } from "../supported-locomotion-runtime.ts";
import { LAYER, COLLIDES } from "../physics.ts";
import { cellKey, isFloor, walkable, type DungeonMap, type Point } from "./map.ts";
import { boundary, wallSurface, type WallFace } from "./fog.ts";
import { dungeonFog } from "./fog-plugin.ts";

/** Visible surfaces are merged into one mesh per square of this many cells a side, so that a level is a few dozen
 * draws rather than one per wall run and a batch of two thousand tile instances. */
export const VISUAL_CHUNK = 16;
const WALL_HEIGHT = 2.8;
/** A floor tile's half-width and height: the 2 cm gaps between tiles are the grid the floor reads as. */
const TILE = Object.freeze({ half: 0.49, y: 0.015 });

type Corner = readonly [number, number, number];
interface Quad { cell: Point; corners: Corner[]; normal: Corner }

/** A wall quad's four corners, in order around it, and the way it faces. */
function faceCorners(x: number, z: number, face: WallFace): Omit<Quad, "cell"> {
  const h = WALL_HEIGHT;
  switch (face) {
    case "top": return { corners: [[x - 0.5, h, z - 0.5], [x - 0.5, h, z + 0.5], [x + 0.5, h, z + 0.5], [x + 0.5, h, z - 0.5]], normal: [0, 1, 0] };
    case "x+": return { corners: [[x + 0.5, 0, z - 0.5], [x + 0.5, h, z - 0.5], [x + 0.5, h, z + 0.5], [x + 0.5, 0, z + 0.5]], normal: [1, 0, 0] };
    case "x-": return { corners: [[x - 0.5, 0, z - 0.5], [x - 0.5, h, z - 0.5], [x - 0.5, h, z + 0.5], [x - 0.5, 0, z + 0.5]], normal: [-1, 0, 0] };
    case "z+": return { corners: [[x - 0.5, 0, z + 0.5], [x - 0.5, h, z + 0.5], [x + 0.5, h, z + 0.5], [x + 0.5, 0, z + 0.5]], normal: [0, 0, 1] };
    case "z-": return { corners: [[x - 0.5, 0, z - 0.5], [x - 0.5, h, z - 0.5], [x + 0.5, h, z - 0.5], [x + 0.5, 0, z - 0.5]], normal: [0, 0, -1] };
    default: { const never: never = face; throw new Error(`No corners for wall face ${String(never)}`); }
  }
}

/**
 * Quads merged into one mesh per chunk of `VISUAL_CHUNK` cells, named `${prefix}.${cx}.${cz}`. UVs are world
 * metres, by the rule `mapUvsInMetres` in `src/arena-room.ts` applies: x and z on a face looking up, the
 * horizontal along the face and the height on a side. Babylon's front face winds so that the right-handed cross
 * product of its first two edges points away from the normal, and each quad is ordered to match.
 */
function mergedQuads(scene: Scene, prefix: string, quads: readonly Quad[]): Mesh[] {
  const chunks = new Map<string, Quad[]>();
  for (const quad of quads) {
    const key = `${Math.floor(quad.cell.x / VISUAL_CHUNK)}.${Math.floor(quad.cell.z / VISUAL_CHUNK)}`;
    const chunk = chunks.get(key);
    if (chunk) chunk.push(quad); else chunks.set(key, [quad]);
  }
  return [...chunks].map(([key, chunk]) => {
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (const { corners, normal } of chunk) {
      const base = positions.length / 3;
      for (const [x, y, z] of corners) {
        positions.push(x, y, z); normals.push(...normal);
        if (normal[1] !== 0) uvs.push(x, z); else if (normal[0] !== 0) uvs.push(z, y); else uvs.push(x, y);
      }
      const [a, b, c] = corners, u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const facing = (u[1] * v[2] - u[2] * v[1]) * normal[0] + (u[2] * v[0] - u[0] * v[2]) * normal[1]
        + (u[0] * v[1] - u[1] * v[0]) * normal[2];
      if (facing < 0) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    const mesh = new Mesh(`${prefix}.${key}`, scene), data = new VertexData();
    data.positions = positions; data.normals = normals; data.uvs = uvs; data.indices = indices;
    data.applyToMesh(mesh, false);
    mesh.isPickable = false; mesh.freezeWorldMatrix();
    return mesh;
  });
}

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
      // A footprint that starts inside the solid -- a body that fell against a wall -- may leave it:
      // the path is clear once it is clear, and must end clear (physical contact session 02).
      let cleared = walkable(map, from, footprint.radiusM, true);
      for (let i = 1; i <= steps; i++) {
        const at = i / steps;
        if (walkable(map, { x: from.x + (to.x - from.x) * at, z: from.z + (to.z - from.z) * at }, footprint.radiusM, true)) { safe = at; cleared = true; continue; }
        if (!cleared) {
          if (i < steps) continue;
          return { colliderId: "dungeon-solid", fraction: 0,
            point: { x: from.x, y: from.y, z: from.z }, upwardNormal: up };
        }
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
  // PBR, so that the torches and the lantern fall off here as they do on the golems. Colours are authored in sRGB.
  const material = (name: string, color: string, roughness = 0.92) => {
    const m = new PBRMaterial(name, scene); m.albedoColor = Color3.FromHexString(color).toLinearSpace();
    m.metallic = 0; m.roughness = roughness; m.maxSimultaneousLights = 4; return m;
  };
  const stone = material("dungeon basalt", "#494b55"), floorMaterial = material("worn flagstones", "#77747a");
  const wood = material("ironbound doors", "#806044", 0.8);
  const bodies: PhysicsAggregate[] = [];
  const box = (name: string, x: number, y: number, z: number, width: number, height: number, depth: number) => {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene); mesh.position.set(x, y, z);
    const body = new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0, friction: 0.8, restitution: 0.02 }, scene);
    body.shape.filterMembershipMask = LAYER.WORLD; body.shape.filterCollideMask = COLLIDES.WORLD;
    bodies.push(body); return { mesh, body };
  };
  const floor = box("dungeon slab", (map.size - 1) / 2, -0.5, (map.size - 1) / 2, map.size, 1, map.size);
  floor.mesh.isVisible = false;
  // The colliders are what they always were, and none is drawn: `wallSurface` draws their outer skin instead.
  for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size;) {
    if (!boundary(map, x, z)) { x++; continue; }
    const start = x; while (x < map.size && x - start < 4 && boundary(map, x, z)) x++;
    const wall = box(`wall.${z}.${start}`, (start + x - 1) / 2, 1.4, z, x - start, 2.8, 1);
    wall.mesh.isVisible = false; wall.mesh.isPickable = false;
  }
  const doors = map.doors.map(d => {
    const object = box(`door.${d.id}`, d.point.x, 1.25, d.point.z, d.axis === "x" ? 0.35 : 3, 2.5, d.axis === "z" ? 0.35 : 3);
    object.mesh.material = wood; object.mesh.isPickable = false; object.mesh.isVisible = visuals; return object;
  });
  // Fog is a mask the surfaces read (`fog-plugin.ts`), so nothing here is shown or hidden cell by cell.
  const fog = visuals ? dungeonFog(scene, map) : null;
  const surfaces: Mesh[] = [];
  if (fog) {
    for (const surface of [stone, floorMaterial, wood]) fog.attach(surface);
    const tiles: Quad[] = [];
    for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size; x++) if (isFloor(map, x, z)) {
      const { half: h, y } = TILE;
      tiles.push({ cell: { x, z }, normal: [0, 1, 0], corners: [[x - h, y, z - h], [x - h, y, z + h], [x + h, y, z + h], [x + h, y, z - h]] });
    }
    for (const mesh of mergedQuads(scene, "floor.visual", tiles)) { mesh.material = floorMaterial; surfaces.push(mesh); }
    const walls = wallSurface(map).map(({ cell, face }) => ({ cell, ...faceCorners(cell.x, cell.z, face) }));
    for (const mesh of mergedQuads(scene, "wall.visual", walls)) { mesh.material = stone; surfaces.push(mesh); }
  }
  const exit = MeshBuilder.CreateTorus("exit sigil", { diameter: 2, thickness: 0.12, tessellation: 40 }, scene);
  exit.position.set(map.exit.x, 0.06, map.exit.z); exit.isPickable = false; exit.isVisible = false;
  // #42b998 in linear light has a luminance of 0.381; bloom extracts what exceeds its 1.1 threshold after the 1.15
  // exposure, so x3 (0.381 x 3 x 1.15 = 1.32) glows and the x2.2 first written (0.965) did not.
  const exitMaterial = material("exit light", "#93edcf");
  exitMaterial.emissiveColor = Color3.FromHexString("#42b998").toLinearSpace().scale(3); exit.material = exitMaterial;
  return {
    registry, fog, surfaces,
    openNearby(actors: readonly Point[]) {
      for (const door of map.doors) if (!door.open && actors.some(p => Math.hypot(p.x - door.point.x, p.z - door.point.z) < 2.5)) {
        door.open = true;
        doors[door.id].body.shape.filterCollideMask = 0;
        doors[door.id].body.shape.filterMembershipMask = 0;
        doors[door.id].mesh.isVisible = false;
      }
    },
    /** Writes the fog mask from what the hero sees and has seen. A closed door is drawn wherever the mask shows it. */
    present(visible: ReadonlySet<number>, explored: ReadonlySet<number>, hero: Point, pitch: number) {
      if (!fog) return;
      fog.update(visible, explored, pitch); fog.setHero(hero);
      exit.isVisible = explored.has(cellKey(map, map.exit));
    },
    /** Where the walls in front of the hero open. The page calls it every frame; `present` runs every 100 ms. */
    setHero(hero: Point) { fog?.setHero(hero); },
    dispose() { for (const body of bodies) body.dispose(); fog?.dispose(); },
  };
}
