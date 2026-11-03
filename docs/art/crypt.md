# The crypt's art

The crypt (`?play=dungeon`, `src/dungeon/`) offers three dungeons, each with its own art:

| Setup label | `?scene=` | Layout | Art |
|---|---|---|---|
| Generated depths (the default) | none | `generateLevel` (`src/dungeon/level.ts`), after Diablo's Cathedral | built in code from the level's cells |
| The Rootbound Crypt | `reference` | one fixed chamber, `referenceChamber` (`src/dungeon/reference.ts`) | an authored Blender chamber, `chamber.glb` |
| Random Crypt | `random-crypt` | four connected chambers, `generateCryptDungeon` (`src/dungeon/crypt-dungeon.ts`) | pieces of an authored Blender kit, `kit.glb`, placed by seed |

## The rule every piece keeps

The art carries no authority. Collision is the map's: `dungeonSolids` (`src/dungeon/solids.ts`)
turns the map's walls, doors and obstacles into fixed boxes in the world and lists them as
`solids`. Nothing the look adds may add one: after the look is built, `src/dungeon/main.ts`
compares the count of `solids` and throws if it changed.

- A wall's art stands inside the rock cells it dresses. A wall-mounted piece (a sconce, roots)
  stands at most 0.08 m proud of its rock face (`SCONCE.proud`, `DRESSING.hungProud`).
- Floor relief stays within a centimetre of the flat collision floor: it is wear, not terrain.
- A solid-looking furnishing is an obstacle in the map, and its art is placed with it.
- Flames, damp, moss and stains are light or surface, with no body.
- Moving a wall or a tomb means changing the layout and the collision descriptors together.

## Generated depths

Everything is built at runtime from the level's cells; there is no model file.

- **Walls and floor.** `buildDungeonWorld` merges the wall and floor meshes; `src/dungeon/masonry.ts`
  lays procedural wall blocks; `src/dungeon/stone.ts` gives the floor and wall materials, textured
  from the Poly Haven sets registered in `src/render/textures.json` (consumers `dungeon.floor` and
  `dungeon.wall`). `?floor=flat`, `?wall=flat`, `?masonry=0` and `?dressing=0` turn each off for
  comparison.
- **Dressing.** `src/dungeon/dressing.ts` places torches and floor clutter (`DRESSING`,
  `torchPlacements`); `src/dungeon/decals.ts` paints the decal atlas in code; `src/dungeon/fire.ts`
  draws animated 3D flame volumes.
- **Light.** `lightDungeon` (`src/dungeon/lighting.ts`) builds the lights, SSAO and the post
  pipeline from `DUNGEON_LOOK`; many torch lights share a `ClusteredLightContainer`.
- **Fog and cutaways.** `src/dungeon/fog-plugin.ts` and `src/dungeon/fog.ts` darken what the party
  has not seen and cut down the walls between the camera and the party.
- **Camera.** `frameDungeon` (`src/dungeon/camera.ts`): orthographic, `CAMERA_PITCH` (`bearing.ts`, pi/6) unless
  `?pitch=` says otherwise, `?azimuth=` for the bearing.

`window.__dungeon.look` (`src/dungeon/look-probe.ts`) switches each part of the look from the
console and times the GPU, for measuring frame cost on the owner's machine.

## The Rootbound Crypt

A single authored room: bevelled flagstones, staggered masonry, blind arches with coping, roots,
damp patches, a carved sarcophagus and warm torch pools, under a diagonal orthographic camera
(`REFERENCE_CAMERA`: 42 degrees, 135 degrees, zoom 6.5).

- `src/dungeon/reference.ts` owns the floor, door, spawns, exit and the sarcophagus obstacle
  (2.5 x 1.15 x 1.1 m), in metres. The sarcophagus blocks walking and not sight: it is lower than
  the map's sight line (`blocksSight` false).
- `src/dungeon/reference-look.ts` (`dressReference`) loads only visuals: the GLB, the stone maps,
  the shadow-casting spot lights, `CryptDamp` (three patches of darker, glossier paving in the
  opaque floor's material, not puddle planes) and `CryptCutaway` (the walls nearest the camera cut
  down to sills; they stay full-height obstacles). The working door's two visual meshes come from
  `level.doorVisuals` (`buildDungeonWorld`), whose door code still owns their visibility and
  collision. The door's wood is the Poly Haven set registered as `wood` in `src/render/textures.json`.
- `REFERENCE_LIGHT` (`src/dungeon/lighting.ts`) gives the room its cooler fill and dimmer carried
  light.

### Rebuilding the chamber

Blender 4.5 LTS, from the repository root:

```powershell
blender --background --python scripts/dungeon/build-reference.py
```

`scripts/dungeon/build-reference.py` builds the room with the shared helpers in
`scripts/dungeon/crypt_geometry.py`, seeded 271828 (and 314159 for the moss, flakes and scatter).
It writes:

- `assets/dungeon-reference/chamber.blend`, saved before the per-material join, so every component
  stays individually named and editable;
- `assets/art/environment/dungeon-reference/chamber.glb`, its geometry batched by material into seven nodes;
- `assets/art/environment/dungeon-reference/stone-albedo.png`, `stone-normal.png` (OpenGL convention) and
  `stone-orm.png` (occlusion, roughness, metalness), 1024 px, periodic so they tile without seams;
- `assets/dungeon-reference/manifest.json`: provenance, triangle count and the maps' hashes.

The geometry and the stone maps are authored here; nothing is downloaded. Keep the GLB's node
transforms and Babylon's clockwise face winding when replacing the export. Two rules in
`crypt_geometry.py` hold the exported surfaces right:

- **Colour before UVs.** Stone variation is a vertex colour. Adding a corner attribute reallocates
  a Blender mesh's data, so acquire UV handles only after adding the colour, or the UV writes
  corrupt the colours.
- **World-space projection.** Planar UVs are chosen by each face's world-space normal, so rotated
  arch stones do not collapse to stripes.

## Random Crypt

Four chambers on a two-by-two grid, joined by three corridors with a working door at each end.
The entrance is a Guard Hall with room for the party; the other three are a seeded shuffle of a
Burial Chamber, a Ruined Chapel and a Rootbound Chamber, each in one of three arrangements and
either way round. The exit is in the chamber farthest from the entrance, and each of the other
three holds two enemies placed away from the doors. The camera follows the leader; the wheel sets zoom 2-18.

[Guard hall at seed 42, High quality](guard-hall.webp).

- **Plan.** `generateCryptDungeon(seed)` returns a `CryptRoomPlan` (`src/dungeon/crypt-plan.ts`):
  the gameplay `DungeonMap` plus the art's placements, the room bounds, torches and damp regions.
  Layout and decoration draw from separate random streams, so the same seed always gives the same
  crypt.
- **Furnishings.** `CRYPT_FURNITURE` (`src/environment/furniture.ts`) gives each solid piece's
  size: tomb, column, altar, bench, rack and root-covered cluster. Placing one (`cryptFurniture`)
  adds an obstacle to the map and an art placement that share an `obstacleId`. `CRYPT_SIGHT` says
  which block sight: columns do, racks do not. Banners and moss are cosmetic.
- **Look per room.** `CRYPT_ROOM_LOOK` tints each room's torches (colour, light and shadow
  intensity); damp lies beneath the guard hall's torches and in the rootbound room. Only the two shadow lights nearest the
  camera's target are on at once.
- **Paving and weathering.** `CRYPT_PAVING` packs one-, two- and four-cell paving modules by seed;
  the chapel favours large slabs. `CryptWeathering` (`src/dungeon/crypt-weathering.ts`) stains the
  stone in world space with one soil tint per room kind, cleaner along each room's two centre axes.
- **Surfaces and fittings.** The kit's stone has fractured mesh faces and chipped outlines
  (`scripts/dungeon/crypt_stone.py`), with different dry-wall and worn-floor roughness and trim tint.
  Detailed slate, split timber and woven cloth maps (`scripts/dungeon/crypt_surfaces.py`) accompany aligned timber grain, iron
  straps and rivets, folded banners and shallow basket sconces. Water darkens the paving and
  lowers its roughness on the same opaque surface; no reflection planes cover the joints.
- **Assembly.** `assembleCryptKit` (`src/environment/crypt-kit.ts`) clones the kit's pieces for each
  placement and merges them by material, nine batches in the Crypt. The Arena uses the same kit
  and assembly with individual column meshes retaining their collider identities.
- **Visibility.** Opaque furnishings are drawn from the visibility of the floor around them, as
  walls and closed doors are. `revealScenery` (`src/dungeon/scenery-visibility.ts`) keeps the
  scenery's own memory of what has been seen, with corner samples and small gaps filled; it never
  writes the run's explored or visible cells, which the minds read.
- **Hover.** `EnemyHover` (`src/dungeon/hover.ts`) outlines the enemy under the cursor with a
  stencil highlight.

The Random Crypt uses the Rootbound Crypt's spot lights, cutaways and damp system
(`dressReference`), with its own cool fill, warm torch key and colour grade (`CRYPT_LIGHT`,
`CRYPT_GRADE`). Its camera follows the hero at zoom 5.2. High renders at a hardware scaling of 1 (CSS pixels)
with 2048 px shadow maps and SSAO; Reduced renders at 1/1.4 with 1024 px shadow maps and no SSAO.

### Rebuilding the kit

```powershell
blender --background --python scripts/dungeon/build-kit.py
```

`scripts/dungeon/build-kit.py` uses the same helpers (`crypt_geometry.py`) and writes
`assets/crypt-kit/kit.blend`, `assets/crypt-kit/manifest.json` and
`assets/art/environment/crypt-kit/kit.glb`: metre-space pieces with their origins baked in. The tomb is
taken from `chamber.blend`'s sarcophagus. `crypt_stone.py` builds the macro relief in the stone's
faces, removes wall faces buried in their supports, and chips the paving while keeping it within
a centimetre of the collision floor. Wall stone is authored to millimetre precision.

`crypt_surfaces.py` writes nine maps beside `kit.glb`: stone albedo at 1024 px, normal at 384 px
and packed occlusion/roughness/metalness at 256 px; timber at 512/256/128 px; cloth at 128 px.
The stone and timber source PNGs are generated material inputs, produced with the built-in
imagegen tool. [Material prompts](../../assets/crypt-kit/stone-source.json) record their provenance.
Fine normal relief is inferred from the source images' luminance; it is not a measured height
scan. Macro stone relief is geometry. Cloth weave is authored at seed 161803. The output hashes
are in the kit manifest. No chamber file is rewritten.

### Triangles

`assets/crypt-kit/manifest.json` lists triangles per piece before assembly and merging by material.
The placed count depends on the seed and its room sizes and dressing.

No triangle budget is set: one waits on the frame rate measured on a range of hardware
([roadmap](../roadmap.md)).

## Textures

`src/render/textures.json` registers every downloaded map: Poly Haven CC0 sets at 1K, each row with its
source URL, SHA-256 and the materials that use it, and each source's licence listed apart by URL. `node scripts/dungeon/fetch-textures.mjs
<asset>:<consumer>:<metresPerRepeat> ...` downloads a set into `assets/art/environment/textures/` and
registers it; it checks the hashes and refuses a registry it did not write.
