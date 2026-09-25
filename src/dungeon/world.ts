import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { StandableWorldRegistry } from "../supported-locomotion-runtime.ts";
import { LAYER, COLLIDES } from "../physics.ts";
import { cellKey, isFloor, walkable, type DungeonMap, type Point } from "./map.ts";
import { boundary, WALL_HEIGHT, wallSurface, type WallFace } from "./fog.ts";
import { dungeonFog } from "./fog-plugin.ts";
import { dungeonStone, flatStone, type DungeonSurfaces } from "./stone.ts";
import { masonryQuads, type Quad } from "./masonry.ts";
import { DRESSING, FLOOR_TOP, HUNG_TOP, decalCorners, decalHeight, hungCentre, muralHeight, type Dressing, type TorchPlacement } from "./dressing.ts";
import { ATLAS, atlasRect, decalAtlas, muralRect } from "./decals.ts";

/** Visible surfaces are merged into one mesh per square of this many cells a side, so that a level is a few dozen
 * draws rather than one per wall run and a batch of two thousand tile instances. */
export const VISUAL_CHUNK = 16;
/** A floor tile's half-width and height. A flat floor's tiles leave 2 cm gaps, the only grid it has; a textured
 * floor's meet edge to edge, and the texture draws its own joints. */
const TILE = Object.freeze({ flatHalf: 0.49, half: 0.5, y: FLOOR_TOP });

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
 * Quads merged into one mesh per chunk of `VISUAL_CHUNK` cells, named `${prefix}.${cx}.${cz}`. A quad's own UVs are
 * used where it has them; otherwise UVs are world metres over the span one image repeat covers, by the rule
 * `mapUvsInMetres` in `src/arena-room.ts` applies: x and z on a face looking up, the horizontal along the face and
 * the height on a side. If any quad has a `shade`, every quad gets a grey vertex colour, which multiplies the
 * albedo. Babylon's front face winds so that the right-handed cross product of its first two edges points away
 * from the normal, and each quad is ordered to match.
 */
function mergedQuads(scene: Scene, prefix: string, quads: readonly Quad[], metresPerRepeat: number): Mesh[] {
  const chunks = new Map<string, Quad[]>();
  for (const quad of quads) {
    const key = `${Math.floor(quad.cell.x / VISUAL_CHUNK)}.${Math.floor(quad.cell.z / VISUAL_CHUNK)}`;
    const chunk = chunks.get(key);
    if (chunk) chunk.push(quad); else chunks.set(key, [quad]);
  }
  return [...chunks].map(([key, chunk]) => {
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
    const shaded = chunk.some(q => q.shade !== undefined);
    for (const { corners, normal, uvs: own, shade = 1 } of chunk) {
      const base = positions.length / 3;
      corners.forEach(([x, y, z], i) => {
        positions.push(x, y, z); normals.push(...normal);
        if (shaded) colors.push(shade, shade, shade, 1);
        const m = metresPerRepeat;
        if (own) uvs.push(...own[i]);
        else if (normal[1] !== 0) uvs.push(x / m, z / m); else if (normal[0] !== 0) uvs.push(z / m, y / m); else uvs.push(x / m, y / m);
      });
      const [a, b, c] = corners, u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const facing = (u[1] * v[2] - u[2] * v[1]) * normal[0] + (u[2] * v[0] - u[0] * v[2]) * normal[1]
        + (u[0] * v[1] - u[1] * v[0]) * normal[2];
      if (facing < 0) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    const mesh = new Mesh(`${prefix}.${key}`, scene), data = new VertexData();
    data.positions = positions; data.normals = normals; data.uvs = uvs; data.indices = indices;
    if (shaded) data.colors = colors;
    data.applyToMesh(mesh, false);
    mesh.isPickable = false; mesh.freezeWorldMatrix();
    return mesh;
  });
}

/** A closed door's leaf, built for a door across x -- 3 m wide in x, 0.35 m deep in z -- and turned for one across
 * z. Every piece sits inside the door's collider box, and goes when it does. */
const DOOR_LEAF = Object.freeze({
  planks: 6, gap: 0.02, height: 2.42, depths: Object.freeze([0.2, 0.24] as const),
  bands: Object.freeze([0.55, 1.85] as const), bandHeight: 0.12, bandDepth: 0.28, bandWidth: 2.9,
  ring: Object.freeze({ x: 0.55, y: 1.2, diameter: 0.18, thickness: 0.03 }),
});
/** An iron sconce under each torch's flame, set into the wall face: no piece stands more than `proud` off it. */
export const SCONCE = Object.freeze({ proud: 0.08, plate: Object.freeze([0.12, 0.3, 0.02] as const), plateY: 1.82, cupY: 1.9 });

/** Pieces built about the origin, merged into one mesh and placed: a fitting's parts share one draw. */
function fitting(name: string, pieces: Mesh[], x: number, z: number, turn: number): Mesh {
  const mesh = Mesh.MergeMeshes(pieces, true, true)!;
  mesh.name = name; mesh.isPickable = false;
  mesh.position.set(x, 0, z); mesh.rotation.y = turn; mesh.freezeWorldMatrix();
  return mesh;
}

/** `visuals` is false for a world with no drawn floor or walls, true for the flat colours, and otherwise the page's
 * chosen stone (`dungeonStone` in `stone.ts`). The colliders are the same in every case, and none is drawn. */
export function buildDungeonWorld(scene: Scene, map: DungeonMap, visuals: boolean | DungeonSurfaces = true) {
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
  const wood = flatStone(scene, "ironbound doors", "#806044", 0.8);
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
    const wall = box(`wall.${z}.${start}`, (start + x - 1) / 2, WALL_HEIGHT / 2, z, x - start, WALL_HEIGHT, 1);
    wall.mesh.isVisible = false; wall.mesh.isPickable = false;
  }
  const iron = flatStone(scene, "door and sconce iron", "#3b3734", 0.5); iron.metallic = 0.7;
  const doors = map.doors.map(d => {
    const object = box(`door.${d.id}`, d.point.x, 1.25, d.point.z, d.axis === "x" ? 0.35 : 3, 2.5, d.axis === "z" ? 0.35 : 3);
    object.mesh.material = wood; object.mesh.isPickable = false; object.mesh.isVisible = false;
    if (visuals === false) return { ...object, leaf: [] as Mesh[] };
    const L = DOOR_LEAF, width = (3 - L.gap * (L.planks + 1)) / L.planks, turn = d.axis === "x" ? Math.PI / 2 : 0;
    const planks = Array.from({ length: L.planks }, (_, i) => {
      const plank = MeshBuilder.CreateBox("plank", { width, height: L.height, depth: L.depths[i % 2] }, scene);
      plank.position.set(-1.5 + L.gap + width / 2 + i * (width + L.gap), 0.02 + L.height / 2, 0); return plank;
    });
    const bands = L.bands.map(y => {
      const band = MeshBuilder.CreateBox("band", { width: L.bandWidth, height: L.bandHeight, depth: L.bandDepth }, scene);
      band.position.y = y; return band;
    });
    const rings = [1, -1].map(side => {
      const ring = MeshBuilder.CreateTorus("ring", { diameter: L.ring.diameter, thickness: L.ring.thickness, tessellation: 16 }, scene);
      ring.rotation.x = Math.PI / 2; ring.position.set(L.ring.x, L.ring.y, side * (L.bandDepth / 2 + L.ring.thickness / 2)); return ring;
    });
    const leaf = [fitting(`door.${d.id}.leaf`, planks, d.point.x, d.point.z, turn), fitting(`door.${d.id}.iron`, [...bands, ...rings], d.point.x, d.point.z, turn)];
    leaf[0].material = wood; leaf[1].material = iron;
    return { ...object, leaf };
  });
  // Fog is a mask the surfaces read (`fog-plugin.ts`), so nothing here is shown or hidden cell by cell.
  const look = visuals === true ? dungeonStone(scene) : visuals || null;
  const fog = look ? dungeonFog(scene, map) : null;
  const surfaces: Mesh[] = [], fittings: { mesh: Mesh; floor: number }[] = [];
  if (look && fog) {
    fog.attach(look.floor.material, look.floor.textured ? "floor" : null);
    fog.attach(look.wall.material, look.wall.textured ? "wall" : null);
    fog.attach(wood, null); fog.attach(iron, null);
    const tiles: Quad[] = [], h = look.floor.textured ? TILE.half : TILE.flatHalf, { y } = TILE;
    for (let z = 0; z < map.size; z++) for (let x = 0; x < map.size; x++) if (isFloor(map, x, z))
      tiles.push({ cell: { x, z }, normal: [0, 1, 0], corners: [[x - h, y, z - h], [x - h, y, z + h], [x + h, y, z + h], [x + h, y, z - h]] });
    for (const mesh of mergedQuads(scene, "floor.visual", tiles, look.floor.metresPerRepeat)) { mesh.material = look.floor.material; surfaces.push(mesh); }
    const walls = look.masonry === false ? wallSurface(map).map(({ cell, face }) => ({ cell, ...faceCorners(cell.x, cell.z, face) }))
      : masonryQuads(map, look.wall.metresPerRepeat);
    for (const mesh of mergedQuads(scene, "wall.visual", walls, look.wall.metresPerRepeat)) { mesh.material = look.wall.material; surfaces.push(mesh); }
  }
  const exit = MeshBuilder.CreateTorus("exit sigil", { diameter: 2, thickness: 0.12, tessellation: 40 }, scene);
  exit.position.set(map.exit.x, 0.06, map.exit.z); exit.isPickable = false; exit.isVisible = false;
  // #42b998 in linear light has a luminance of 0.381; bloom extracts what exceeds its 1.1 threshold after the 1.15
  // exposure, so x3 (0.381 x 3 x 1.15 = 1.32) glows and the x2.2 first written (0.965) did not.
  const exitMaterial = flatStone(scene, "exit light", "#93edcf");
  exitMaterial.emissiveColor = Color3.FromHexString("#42b998").toLinearSpace().scale(3); exit.material = exitMaterial;
  return {
    registry, fog, surfaces,
    openNearby(actors: readonly Point[]) {
      for (const door of map.doors) if (!door.open && actors.some(p => Math.hypot(p.x - door.point.x, p.z - door.point.z) < 2.5)) {
        door.open = true;
        doors[door.id].body.shape.filterCollideMask = 0;
        doors[door.id].body.shape.filterMembershipMask = 0;
        for (const mesh of doors[door.id].leaf) mesh.isVisible = false;
      }
    },
    /** An iron sconce under each torch's flame, hidden until the floor it faces is explored, as its flame is. The fog
     * reads a fitting's top and underside from that floor cell and its front from the wall, which shows as soon as a
     * diagonal neighbour is explored: without the gate, the front of a sconce was drawn without its top. */
    sconces(torches: readonly TorchPlacement[]): Mesh[] {
      if (!fog) return [];
      const S = SCONCE;
      return torches.map((torch, i) => {
        const [w, h, d] = S.plate, plate = MeshBuilder.CreateBox("plate", { width: w, height: h, depth: d }, scene);
        plate.position.set(0, S.plateY, d / 2);
        const arm = MeshBuilder.CreateBox("arm", { width: 0.03, height: 0.03, depth: S.proud - d }, scene);
        arm.position.set(0, S.cupY - 0.06, d + (S.proud - d) / 2);
        const cup = MeshBuilder.CreateCylinder("cup", { diameterTop: S.proud - 0.01, diameterBottom: 0.035, height: 0.08, tessellation: 10 }, scene);
        cup.position.set(0, S.cupY, (S.proud + 0.01) / 2);
        // Built facing +z from a face at z = 0, and turned to face the floor the torch lights.
        const mesh = fitting(`torch.sconce.${i}`, [plate, arm, cup], torch.cell.x + torch.facing.x * 0.5,
          torch.cell.z + torch.facing.z * 0.5, Math.atan2(torch.facing.x, torch.facing.z));
        mesh.material = iron; mesh.isVisible = false; surfaces.push(mesh);
        fittings.push({ mesh, floor: cellKey(map, { x: torch.cell.x + torch.facing.x, z: torch.cell.z + torch.facing.z }) });
        return mesh;
      });
    },
    /**
     * The level's clutter (`dressingPlacements`), in one atlas painted in code (`decals.ts`), alpha-tested and fogged,
     * and owning no body. Markings, roots and murals are merged a chunk at a time, each set apart; puddles in a glossy
     * material, to catch the torchlight. A mural shows only its tile's part of its own aspect (`muralRect`), with the
     * tile's left edge on the left as the camera looks at the face. A web is a mesh of its own, hidden until the floor
     * it hangs over is explored, as a sconce is: it faces into the room on a diagonal, so the fog reads half of it from
     * the rock and half from the floor.
     */
    dress(dressing: readonly Dressing[]): Mesh[] {
      if (!fog || !dressing.length) return [];
      const atlas = RawTexture.CreateRGBATexture(decalAtlas(), ATLAS.tile * ATLAS.columns, ATLAS.tile * ATLAS.rows, scene,
        true, false, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
      atlas.name = "dungeon dressing atlas"; atlas.hasAlpha = true; atlas.wrapU = atlas.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
      const material = (name: string, roughness: number) => {
        const m = flatStone(scene, name, "#ffffff", roughness);
        m.albedoTexture = atlas; m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST; m.alphaCutOff = 0.5;
        fog.attach(m, null); return m;
      };
      const matte = material("dungeon dressing", 0.95), glossy = material("dungeon puddles", 0.12);
      const flat: Quad[] = [], wet: Quad[] = [], hung: Quad[] = [], murals: Quad[] = [], webs: { quad: Quad; floor: Point }[] = [];
      const top = HUNG_TOP, proud = DRESSING.hungProud;
      for (const d of dressing) {
        if (d.kind === "decal") {
          const [u0, v0, u1, v1] = atlasRect(d.decal), y = decalHeight(d.layer);
          const quad: Quad = { cell: { x: Math.round(d.at.x), z: Math.round(d.at.z) }, normal: [0, 1, 0],
            corners: decalCorners(d).map(p => [p.x, y, p.z]) as Quad["corners"], uvs: [[u0, v0], [u0, v1], [u1, v1], [u1, v0]] };
          (d.decal === "puddle" ? wet : flat).push(quad);
        } else if (d.kind === "roots") {
          const [u0, v0, u1, v1] = atlasRect("roots"), c = hungCentre(d), along = { x: Math.abs(d.facing.z), z: Math.abs(d.facing.x) };
          const at = (s: number, y: number): [number, number, number] =>
            [c.x + d.facing.x * proud + along.x * s * d.width / 2, y, c.z + d.facing.z * proud + along.z * s * d.width / 2];
          hung.push({ cell: d.cell, normal: [d.facing.x, 0, d.facing.z], corners: [at(-1, top), at(1, top), at(1, top - d.drop), at(-1, top - d.drop)],
            uvs: [[u0, v0], [u1, v0], [u1, v1], [u0, v1]] });
        } else if (d.kind === "mural") {
          // Screen right, looking at the face from in front of it, is (-facing.z, facing.x).
          const [u0, v0, u1, v1] = muralRect(d.piece), c = hungCentre(d), right = { x: -d.facing.z, z: d.facing.x };
          const high = d.y + muralHeight(d) / 2, low = d.y - muralHeight(d) / 2;
          const at = (s: number, y: number): [number, number, number] =>
            [c.x + d.facing.x * proud + right.x * s * d.width / 2, y, c.z + d.facing.z * proud + right.z * s * d.width / 2];
          murals.push({ cell: d.cell, normal: [d.facing.x, 0, d.facing.z], corners: [at(-1, high), at(1, high), at(1, low), at(-1, low)],
            uvs: [[u0, v0], [u1, v0], [u1, v1], [u0, v1]] });
        } else {
          const [u0, v0, u1, v1] = atlasRect("cobweb"), { corner: c, into } = d, n = Math.SQRT1_2;
          const onX = (y: number): [number, number, number] => [c.x + into.x * d.span, y, c.z + into.z * proud];
          const onZ = (y: number): [number, number, number] => [c.x + into.x * proud, y, c.z + into.z * d.span];
          const floor = { x: c.x + into.x / 2, z: c.z + into.z / 2 };
          webs.push({ floor, quad: { cell: floor, normal: [into.x * n, 0, into.z * n],
            corners: [onX(top), onZ(top), onZ(top - d.drop), onX(top - d.drop)], uvs: [[u0, v0], [u1, v0], [u1, v1], [u0, v1]] } });
        }
      }
      const meshes: Mesh[] = [];
      const add = (list: Mesh[], m: PBRMaterial) => { for (const mesh of list) { mesh.material = m; surfaces.push(mesh); meshes.push(mesh); } };
      add(mergedQuads(scene, "dressing.floor", flat, 1), matte);
      add(mergedQuads(scene, "dressing.puddles", wet, 1), glossy);
      add(mergedQuads(scene, "dressing.hung", hung, 1), matte);
      add(mergedQuads(scene, "dressing.murals", murals, 1), matte);
      for (const [i, { quad, floor }] of webs.entries()) {
        const [mesh] = mergedQuads(scene, `dressing.web.${i}`, [quad], 1);
        mesh.isVisible = false; fittings.push({ mesh, floor: cellKey(map, floor) }); add([mesh], matte);
      }
      return meshes;
    },
    /** Writes the fog mask from what the hero sees and has seen. A closed door is drawn wherever the mask shows it. */
    present(visible: ReadonlySet<number>, explored: ReadonlySet<number>, hero: Point, pitch: number, toward: Point) {
      if (!fog) return;
      fog.update(visible, explored, pitch, toward); fog.setHero(hero);
      exit.isVisible = explored.has(cellKey(map, map.exit));
      for (const { mesh, floor } of fittings) mesh.isVisible = explored.has(floor);
    },
    /** Where the walls in front of the hero open. The page calls it every frame; `present` runs every 100 ms. */
    setHero(hero: Point) { fog?.setHero(hero); },
    dispose() { for (const body of bodies) body.dispose(); fog?.dispose(); },
  };
}
