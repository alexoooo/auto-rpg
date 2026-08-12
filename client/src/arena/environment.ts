// The room the fighters stand in, and the light that makes it read as one.
//
// **This file exists only for `[Texture]`.** `[Geometry]` has no light, no
// shadow, no floor but a grid of lines and no environment at all -- that is what
// makes it the control, and everything here is what the control is a control on.
//
// **Two floors, and the second is a fallback rather than a downgrade path.** The
// authored kit under `web/assets3d/` is the same GLB, the same sidecar, the same
// pinned hashes and the same validator the `#/game` representative room loads,
// reached through the same `render/room-assets.ts`. If it is not there, this mode
// still renders, on a procedural plane. That is a deliberate departure from the
// rule in
// [`room-asset-contract.md`](../../../docs/reference/room-asset-contract.md#loader-lifecycle-and-failure),
// which makes a missing asset **terminal** -- and the reason the two differ is
// the reason that rule exists. `#/game?room=representative` is a reader asking
// for the authored room by name, and silently answering with a different room
// would be answering a question they did not ask. `#/arena`'s `[Texture]` asks
// for a lit fighter; the room is the backdrop it is standing in, and a backdrop
// that took the whole panel down with it when a development fixture was missing
// would make the one mode this session exists to build unusable on any tree
// without the assets checked out. The degradation is not silent either:
// {@link ArenaEnvironment.description} says which floor is on the screen, on the
// panel's own label.

import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

import type { FightHeader } from "../fight/source.js";
import type { RoomPieceName } from "../render/room-asset-contract.js";
import type { RoomAsset, RoomAssetFetcher } from "../render/room-assets.js";

const ONE = 65536;
const QUARTER_TURN = Math.PI / 2;

/**
 * The kit's own generator seed, so `floor_a`/`floor_b` alternate the way the kit
 * was authored and reviewed. It is `tools/art/manifest.json`'s `generatorSeed` -- not
 * `web/assets/manifest.json`, which is the Canvas page's PNG manifest and has no
 * seed in it -- and it is the number `RoomEnvironmentPresentation` defaults to;
 * a different seed would be a different floor pattern with nothing to recommend it.
 */
const ROOM_FIXTURE_SEED = 1592594996;

/**
 * The shadow map's resolution, matched to the greybox room's 1024.
 *
 * Same number, same reason -- it is the size the offline residency estimate in
 * the room asset contract is computed against -- and the arena's caster set is
 * two orders of magnitude smaller than the 48 x 32 stress fixture's, so nothing
 * here argues for more.
 */
const SHADOW_MAP_SIZE = 1024;

/**
 * The room is built one tile wider than the arena on every side.
 *
 * The published arena is 24 by 16 and a body may stand anywhere in it, so a wall
 * ring laid on the outermost tiles would put masonry inside the space the
 * simulation is using. One tile of margin puts the ring immediately outside the
 * published rectangle instead, where it is scenery and can never be walked into.
 */
const WALL_MARGIN = 1;

/**
 * The procedural plane's mesh name.
 *
 * **Not `arena-floor`**, which is `[Geometry]`'s line grid in `scene.ts`. Both
 * live in the same `Scene`, so sharing a name makes `scene.getMeshByName` return
 * whichever registered first -- a coin flip that a test can be written against
 * and pass for the wrong reason.
 */
export const PROCEDURAL_FLOOR = "arena-texture-floor";

export type ArenaEnvironmentCounts = Readonly<{
  sources: number; instances: number; lights: number; shadowCasters: number;
}>;

/** What the authored-room load did, once it has finished trying. */
export type ArenaFloorKind = "procedural" | "authored";

export type ArenaTiles = Readonly<{ cols: number; rows: number }>;

/** The tile grid the room is laid on: the published arena plus its wall margin. */
export function arenaTiles(header: FightHeader): ArenaTiles {
  return Object.freeze({
    cols: Math.round(header.arena[0] / ONE) + 2 * WALL_MARGIN,
    rows: Math.round(header.arena[1] / ONE) + 2 * WALL_MARGIN,
  });
}

const onRing = (tx: number, ty: number, tiles: ArenaTiles): boolean =>
  tx >= 0 && ty >= 0 && tx < tiles.cols && ty < tiles.rows
  && (tx === 0 || ty === 0 || tx === tiles.cols - 1 || ty === tiles.rows - 1);

/**
 * Which floor variant a tile takes, and which wall piece stands on the ring.
 *
 * **`render/room-environment.ts`'s two rules, restated over a rectangle, and
 * neither of them is trusted to stay restated.** The reason they are copied at
 * all is an import boundary that this page is not allowed to cross:
 * `chooseRoomWall` reads a `PresentationSnapshot` whose tile codes come from
 * `protocol/abi.generated.ts`, and
 * `the_arena_and_the_fight_modules_reach_neither_the_worker_nor_the_wasm` in
 * `studio-shell.test.mjs` keeps `#/arena` clear of the worker and the wasm ABI so
 * that `npm run view` -- Vite with no wasm build at all -- is enough to open a
 * recorded fight. Importing either function pulls that module in transitively,
 * and with it the whole `RoomEnvironmentPresentation`, its lights and its
 * shadow generator, into a chunk that wanted three lines of arithmetic.
 *
 * So the pin is the test rather than the import:
 * `the_arena_room_lays_the_kit_out_by_the_same_rule_the_greybox_does` runs the
 * greybox's own `chooseRoomFloor` and `chooseRoomWall` over an equivalent
 * snapshot for **every tile of the grid the arena actually builds** -- 468 floors
 * and 84 walls -- and requires the same piece and the same quarter turn on all of
 * them. A change to either rule that is not mirrored here fails there.
 *
 * The neighbour order below is `chooseRoomWall`'s -- north, east, south, west --
 * because the quarter turns are stated in it.
 */
export function arenaFloor(tx: number, ty: number): Extract<RoomPieceName, "floor_a" | "floor_b"> {
  const value = (ROOM_FIXTURE_SEED + Math.imul(tx, 0x9e3779b1) + Math.imul(ty, 0x85ebca6b)) >>> 0;
  return (Math.imul(value, 0xc2b2ae35) >>> 0) & 1 ? "floor_b" : "floor_a";
}
export function arenaWall(
  tx: number, ty: number, tiles: ArenaTiles,
): Readonly<{ piece: RoomPieceName; quarterTurns: 0 | 1 | 2 | 3 }> {
  const solid = [
    onRing(tx, ty - 1, tiles), onRing(tx + 1, ty, tiles),
    onRing(tx, ty + 1, tiles), onRing(tx - 1, ty, tiles),
  ] as const;
  const neighbours = solid.reduce((sum, value) => sum + (value ? 1 : 0), 0);
  const found = solid.findIndex(Boolean);
  const first: 0 | 1 | 2 | 3 = found < 0 ? 0 : found as 0 | 1 | 2 | 3;
  if (neighbours === 2 && ((solid[0] && solid[2]) || (solid[1] && solid[3]))) {
    return Object.freeze({ piece: "wall_straight", quarterTurns: solid[1] ? 0 : 1 } as const);
  }
  if (neighbours === 2) return Object.freeze({ piece: "wall_inside", quarterTurns: first });
  if (neighbours >= 3) return Object.freeze({ piece: "wall_outside", quarterTurns: first });
  return Object.freeze({ piece: "wall_end", quarterTurns: first });
}

export class ArenaEnvironment {
  readonly #scene: Scene;
  readonly #key: DirectionalLight;
  readonly #fill: HemisphericLight;
  readonly #shadows: ShadowGenerator;
  readonly #floorMaterial: PBRMaterial;
  readonly #instances: InstancedMesh[] = [];
  /**
   * Aborted on disposal, so a load in flight when the route leaves stops at the
   * next of `loadRoomAsset`'s checkpoints rather than importing a container into
   * a `Scene` the stage has already given back.
   */
  readonly #loading = new AbortController();
  /** The one authored-room attempt, kept whatever it answered. See {@link load}. */
  #loaded: Promise<ArenaFloorKind> | null = null;
  #floor: Mesh | null = null;
  #room: RoomAsset | null = null;
  #reason = "not attempted";
  #fitKey = "";
  #enabled = false;
  #disposed = false;

  constructor(scene: Scene) {
    this.#scene = scene;
    // **The direction is `RoomEnvironmentPresentation`'s own key**, `(-0.45, -1,
    // -0.35)`, because that is the angle the authored kit's stonework was
    // authored and reviewed under and a second angle beside it would light the
    // same walls two ways. It is 24 degrees off vertical, so a body's shadow
    // falls sideways rather than straight under it -- a shadow directly beneath a
    // capsule tells a reader nothing about its height, which is half of what a
    // shadow is for in the 3/4 panel.
    //
    // **The position and the intensity are this file's and are not measured.**
    // A directional light's position is only the shadow frustum's origin, so it
    // is set to a corner above the far end of a 24 by 16 arena rather than the
    // greybox's `(12, 24, 16)`, which is over a 48 by 32 room on the other sign
    // of `z`. The intensity is higher than the greybox's 1.15 because that scene
    // has eight torches adding to it and this one has none; it was set by looking
    // at the picture, which is the only way anything about a light is ever set,
    // and the picture is on the owed list in `v2-ui-03`.
    this.#key = new DirectionalLight("arena-key", new Vector3(-0.45, -1, -0.35), scene);
    this.#key.position = new Vector3(18, 26, -4);
    this.#key.intensity = 2.2;
    // The greybox room's reviewed fill, by the numbers, because it is the fill
    // the owner accepted against the legacy reference on 2026-08-09 and a second
    // set of hand-picked constants beside it would be two answers to one
    // question. See `applyAuthoredRoomLighting` in `render/room-review.ts`.
    this.#fill = new HemisphericLight("arena-fill", new Vector3(0, 1, 0), scene);
    this.#fill.diffuse = new Color3(0.68, 0.60, 0.50);
    this.#fill.groundColor = new Color3(0.08, 0.065, 0.055);
    this.#fill.intensity = 0.58;
    this.#shadows = new ShadowGenerator(SHADOW_MAP_SIZE, this.#key);
    this.#shadows.useBlurExponentialShadowMap = true;
    this.#floorMaterial = new PBRMaterial("arena-floor-material", scene);
    this.#floorMaterial.albedoColor = new Color3(0.17, 0.16, 0.15);
    this.#floorMaterial.metallic = 0;
    this.#floorMaterial.roughness = 0.95;
    this.setEnabled(false);
  }

  /**
   * On for `[Texture]`, off for `[Geometry]`, and nothing is rebuilt either way.
   *
   * The lights are disabled rather than disposed and the meshes are disabled
   * rather than retired, so a reader pressing the two buttons alternately is not
   * paying for a shadow map, a GLB parse or a material compile each time.
   *
   * `shadowEnabled` is redundant beside `setEnabled` on this Babylon --
   * `shadowGeneratorSceneComponent`'s `_gatherRenderTargets` gates on
   * `light.isEnabled() && light.shadowEnabled`, so either one alone takes the
   * shadow map out of the render targets. It is written anyway because it says
   * what is meant at the one place a reader will look for it, and because the
   * gate is Babylon's rather than ours to depend on.
   */
  setEnabled(on: boolean): void {
    this.#enabled = on;
    this.#key.setEnabled(on);
    this.#key.shadowEnabled = on;
    this.#fill.setEnabled(on);
    this.#floor?.setEnabled(on && this.#room === null);
    for (const mesh of this.#instances) mesh.setEnabled(on);
  }

  /** Which floor is on the screen, for the panel's label. */
  get floor(): ArenaFloorKind { return this.#room === null ? "procedural" : "authored"; }

  description(): string {
    return this.#room === null ? `procedural floor (${this.#reason})` : "authored room";
  }

  /**
   * Lay the floor out over the arena this fight publishes.
   *
   * Rebuilt only when the arena's size changes -- once a fight -- or when the
   * authored kit arrives and replaces the plane it was standing in for.
   */
  fit(header: FightHeader): void {
    const key = `${header.arena[0]}x${header.arena[1]}:${this.floor}`;
    if (key === this.#fitKey) return;
    this.#fitKey = key;
    this.#clearInstances();
    const width = header.arena[0] / ONE;
    const depth = header.arena[1] / ONE;
    if (this.#room === null) {
      this.#procedural(width, depth);
      return;
    }
    this.#floor?.setEnabled(false);
    this.#authored(arenaTiles(header), depth);
    this.setEnabled(this.#enabled);
  }

  /**
   * Fetch, hash and validate the authored kit, or record why there is not one.
   *
   * Never throws and never rejects: every outcome this can have is a floor. The
   * `fetcher` seam is the whole of the injection --
   * `a_missing_room_asset_degrades_the_textured_mode_to_a_procedural_floor` hands
   * in one that answers 404 for the GLB, so the failure is the real loader's real
   * failure path over a genuinely absent file rather than a claim read off this
   * source.
   */
  async load(fetcher?: RoomAssetFetcher): Promise<ArenaFloorKind> {
    // **Memoised on the first attempt, outcome regardless**, which is two rules
    // at once. A second press while the first megabyte is still in flight would
    // otherwise start a second `loadRoomAsset`, and the later `#room =` would
    // orphan the earlier container -- its meshes and materials left in the
    // `Scene` with nothing holding them and `dispose` releasing only the
    // survivor. And a load that *failed* must not be retried on every press:
    // `room-asset-contract.md` says a failed authored room never retries, and a
    // page that re-fetched, re-hashed and re-validated a megabyte each time a
    // reader flicked between the two modes would be doing exactly that.
    this.#loaded ??= this.#load(fetcher);
    return this.#loaded;
  }

  async #load(fetcher?: RoomAssetFetcher): Promise<ArenaFloorKind> {
    if (this.#disposed || this.#room !== null) return this.floor;
    try {
      // Dynamic, exactly as `#/game` imports it, and for the same two reasons:
      // the glTF 2 loader must stay out of every chunk that does not ask for it,
      // and `roomAssetChunks.length === 1` in the build test is what says it did.
      // A static import here would inline a second copy into the arena's chunk.
      const module = await import("../render/room-assets.js");
      const asset = await module.loadRoomAsset(this.#scene, this.#loading.signal, fetcher);
      if (this.#disposed) { asset.dispose(); return "procedural"; }
      this.#room = asset;
      this.#fitKey = "";
    } catch (error) {
      // Sanitised the way the room contract asks: the reader gets the stage the
      // loader refused at, which is what distinguishes "no such file" from "the
      // bytes do not hash to the pin", and nothing from the fetch itself.
      this.#reason = error instanceof Error ? error.message : "load failed";
    }
    return this.floor;
  }

  /**
   * What is retained, whether or not it is on the screen.
   *
   * **Deliberately not zeroed when the mode is off**, and that was a real defect
   * for a while: these counts exist to catch a registry that stopped retiring, so
   * a count that reports zero the moment a mode is switched off cannot detect the
   * leak it is there for -- and the assertion that "every proxy caster left the
   * render list" was reading its own short circuit. In `[Geometry]` after a
   * `[Texture]` press the room is parked rather than gone, so the honest answer
   * is the parked numbers, and `ArenaContent.describe` says "room parked" beside
   * them so nobody reads 552 instances as 552 drawn instances.
   *
   * The sources are the ones actually instanced rather than the whole kit: the
   * arena uses six of the kit's twelve pieces, and a count that said twelve would
   * be describing the loader instead of the picture.
   */
  counts(): ArenaEnvironmentCounts {
    const used = new Set(this.#instances.map((mesh) => mesh.sourceMesh));
    return Object.freeze({
      sources: this.#room === null ? (this.#floor === null ? 0 : 1) : used.size,
      instances: this.#instances.length,
      lights: this.#enabled ? 2 : 0,
      shadowCasters: this.#shadows.getShadowMap()?.renderList?.length ?? 0,
    });
  }

  addShadowCaster(mesh: AbstractMesh): void {
    this.#shadows.addShadowCaster(mesh, false);
  }

  removeShadowCaster(mesh: AbstractMesh): void {
    this.#shadows.removeShadowCaster(mesh, false);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#loading.abort();
    this.#clearInstances();
    this.#floor?.dispose();
    this.#floor = null;
    this.#floorMaterial.dispose();
    this.#shadows.dispose();
    this.#key.dispose();
    this.#fill.dispose();
    this.#room?.dispose();
    this.#room = null;
  }

  /** One plane, the arena's size plus its wall margin, receiving every shadow. */
  #procedural(width: number, depth: number): void {
    this.#floor?.dispose();
    const floor = MeshBuilder.CreateGround(PROCEDURAL_FLOOR, {
      width: width + 2 * WALL_MARGIN, height: depth + 2 * WALL_MARGIN,
    }, this.#scene);
    // The arena's own rectangle runs `x` in `[0, width]` and scene `z` in
    // `[-depth, 0]`, because world `+y` is scene `-z`; a ground is built centred
    // on its own origin, so this is where its centre goes.
    floor.position.set(width / 2, 0, -depth / 2);
    floor.material = this.#floorMaterial;
    floor.receiveShadows = true;
    floor.isPickable = false;
    floor.setEnabled(this.#enabled);
    this.#floor = floor;
  }

  /**
   * The authored kit, instanced over the arena's rectangle.
   *
   * **The room's `ty` axis runs opposite the world's `y`, and that is a
   * translation rather than a reflection.** The arena maps world `(x, y)` to
   * scene `(x, -z)`, so its rectangle occupies scene `z` in `[-depth, 0]`; the
   * kit is authored `+X`/`+Z` on the ground with its origin at a tile centre.
   * Laying tile `ty` at `z = ty + 0.5 - depth - margin` keeps the kit's own `+z`
   * pointing the way it was authored -- which is what `chooseRoomWall`'s quarter
   * turns are stated in -- and lands the whole grid over the arena. Mirroring the
   * grid instead would turn every authored corner inside out, which is the same
   * class of bug the arena's own axis mapping exists to avoid.
   */
  #authored(tiles: ArenaTiles, depth: number): void {
    const room = this.#room;
    if (room === null) return;
    for (const piece of ["floor_a", "floor_b"] as const) {
      // A general renderer rule and not a per-mesh correction: a floor receives
      // and does not cast. `room-assets.ts` validates the kit with shadows off
      // because the greybox decides that per instance; the arena decides it per
      // role, and there are two roles.
      const source = room.pieces.get(piece);
      if (source !== undefined) source.receiveShadows = true;
    }
    for (let ty = 0; ty < tiles.rows; ty++) {
      for (let tx = 0; tx < tiles.cols; tx++) {
        const x = tx + 0.5 - WALL_MARGIN;
        const z = ty + 0.5 - WALL_MARGIN - depth;
        this.#place(room, arenaFloor(tx, ty), x, z, 0, false);
        if (!onRing(tx, ty, tiles)) continue;
        const wall = arenaWall(tx, ty, tiles);
        this.#place(room, wall.piece, x, z, wall.quarterTurns, true);
      }
    }
  }

  #place(room: RoomAsset, piece: RoomPieceName,
    x: number, z: number, quarterTurns: number, caster: boolean): void {
    const source = room.pieces.get(piece);
    if (source === undefined) return;
    const mesh = source.createInstance(`arena-room:${piece}:${x}:${z}`);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = quarterTurns * QUARTER_TURN;
    mesh.isPickable = false;
    mesh.setEnabled(this.#enabled);
    this.#instances.push(mesh);
    // Only the walls cast. A floor tile's shadow lands on the floor tile it is,
    // so every one of them would be shadow-map fill rate spent on nothing.
    if (caster) this.#shadows.addShadowCaster(mesh, false);
  }

  #clearInstances(): void {
    for (const mesh of this.#instances.splice(0)) {
      this.#shadows.removeShadowCaster(mesh, false);
      mesh.dispose();
    }
  }
}
