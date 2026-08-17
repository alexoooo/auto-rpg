# Representative room asset contract

**Purpose:** Define the exact authored-room manifest, generation, validation, disclosure, and loading contract for the shipped v2-09 representative slice.
**Status:** current
**Canonical source:** this document and the pinned versions and executable hashes in [`tools/toolchain.json`](../../tools/toolchain.json)
**Update when:** The room manifest schema, semantic kit, coordinate rules, reproducibility authority, budgets, disclosure mapping, or loader lifecycle changes.

The pinned room GLB, semantic sidecar, validator report, generated trust pins, lazy
loader, instance presentation, and review camera are current. Generator v5 replaces
the refuted v4 presentation with seamless floor edges, a concept-directed generated
atlas, stable four-sided walls, and recognizable layered torch fixtures. Its
automated asset gates are complete; foreground performance remains open.

<!-- DOC_CONTRACT: room-asset-manifest -->
## Manifest semantics

The current `tools/art/manifest.json` is schema version 1 and the sole generator
input. It records `generatorVersion: 5`, repository license `MIT`, the exact Blender
version and binary SHA-256, seed `1592594996`, unit `meter`, tile size 1, right-handed
axes, canonical decimal-string tolerance `"0.00001"`, export flags, budgets, material parameters, geometry
dimensions, semantic grammar, exact `allowedValidatorWarnings: []`, and expected
output hashes.

Generator version 5 owns deterministic style `painted-cathedral-v3`. Every
exported mesh retains one CORNER-domain `room_style` color attribute; glTF carries
it as normalized `UNSIGNED_SHORT` `VEC4` `COLOR_0`. The checked 1,254 x
1,254 `tools/art/textures/concept-material-atlas-v2.png` source has SHA-256
`5f09f791ce9d97d0ed72f708baede576d6960db50d33af7d3008d16783e61e36`.
The generator selects floor quadrant `[0,1]` and wall quadrant `[1,1]`, then
produces periodic 512 x 512 sRGB, repeat-wrapped embeds with 32 edge pixels, linear
magnification, and mipmapped linear minification. Their embedded SHA-256 values are
`0c49b0bc9241e70fc53207e28d62be30ca3787529cf5f93befbe821b98f3654a` and
`bbf4ae43f1564aaa5754eb23ee7869eaf581fb979a970c802a1a43f4a9b9e075`.
No external image URI or runtime texture request is permitted. Warm umber value
separation, high roughness, a dedicated cooler `woodEnd` response for barrel caps, and restrained metal response keep the room subordinate
to combatants; `COLOR_0` remains deterministic modulation rather than a hidden
per-instance correction. Four fitted courses of individually separated stones replace
the wall sources' former single-box silhouettes without changing semantic names,
collision/debug bounds, pivots, or placement.

The exact unique piece set is:

```text
floor_a floor_b wall_straight wall_inside wall_outside wall_end
door_frame door_leaf torch_bracket decal_rubble decal_root prop_barrel
```

Each piece has one mesh node named `ROOM_<piece>`. The only socket is the empty node
`SOCKET_torch_flame`, parented to `ROOM_torch_bracket`. Exported materials are
restricted to `floor_current`, `stone_current`, `wood_current`, and `metal_current`;
the manifest also defines the generator-only `emissive_flame` specification.
`stone_remembered` is a runtime
clone material rather than a baked material on each stone mesh.

The reviewed manifest pins three generated outputs: GLB, semantic sidecar, and
canonical validator report. All three are authoritative manifests in the toolchain
coverage list. The generated semantic sidecar records schema version 1, fixture identity
`v2-room-slice-1`, `buildInputsSha256`, GLB SHA-256, and each node's role, material, primitive, vertex
and index counts, bounds, collision/debug bounds, sockets, and generator provenance.
Names are loader keys rather than permission for environment code to contain
mesh-specific corrections.

<!-- DOC_CONTRACT: room-asset-coordinates -->
## Coordinates, origins, and sockets

The current authored kit uses metres, tile size 1, a right-handed scene, `+Y` up,
and `+X`/`+Z` ground axes. Mesh origins are the horizontal tile centre at the floor-contact plane.
The door leaf pivot is its lower hinge edge. The torch flame socket origin is the
light and emissive origin, and socket-local `+Y` points outward from the wall.

Exported mesh-node translation and rotation are identity and scale is one after
transforms are applied. Mesh data is finite, outward-facing, non-degenerate, and has
one primitive, one `[0,1]` UV set, and the exact `room_style` corner-color layer.
Runtime placement may use only semantic
pivots, sockets, bounds, and general tile transforms.

<!-- DOC_CONTRACT: room-asset-reproducibility -->
## Reproducibility and hashes

The verified project-local Blender 4.5.12 executable is the only byte-reproduction
authority. `--write` exports the repository GLB, sidecar, and validator report and prints candidate
hashes; it never edits expected hashes. A deliberate re-record edits the reviewed
manifest afterward and records why geometry changed. `--verify` exports to two
independent temporary directories, requires byte-identical GLBs, sidecars, and validator reports, and
then compares their hashes with the reviewed manifest pins without repository writes.

`buildInputsSha256` is canonical UTF-8 JSON of the manifest with the entire `outputs`
object omitted. The generated sidecar carries that build-input hash and the GLB hash;
it never carries a full-manifest hash. The manifest may therefore pin GLB and sidecar
without a hash cycle. A future verified Blender build must still pass semantic
validation, while byte drift requires review and a later re-record plan.

Generation also owns `client/src/render/room-asset.generated.ts`, whose frozen
`ROOM_FIXTURE_ID`, `ROOM_BUILD_INPUTS_SHA256`, `ROOM_SIDECAR_SHA256`, and
`ROOM_GLB_SHA256`, and `ROOM_VALIDATOR_SHA256` literals are checked against the manifest and committed bytes by
generation verification, offline validation, runtime, and the Vite build. Runtime
hashes raw sidecar bytes against the compiled pin before parsing, then compares the
parsed build-input identity and fetched GLB hash with the remaining pins.

The current generated identities are:

| Identity | SHA-256 |
|---|---|
| canonical build inputs | `593d4c43e4ce399d426c8bbd0641122e9c4901a3f2dfe6c5b85fedd8759cd4cf` |
| semantic sidecar | `4a6ec372cef32fb5b13311d0b9f0ddd8f59d99da602e550ccf885da2a0fcf064` |
| room GLB | `b8819b6e4c46fe4483448f6f936d17cc9f62b43814fed9beb77ff216af67cf06` |
| canonical validator report | `05a00c444bea02557561816c4c5d0c05a0dee8b17a8b19c88618cfaeeb807721` |
| 1,536-byte runtime stress map | `a20ba5f64ef55bd7716c2a7cf17f3065619876d1ded2e81b05199b5282222907` |

`.gitignore` owns `__pycache__/` and `*.py[cod]`. Both generation modes must leave no
Python cache under `tools/art/`; a clean import/run test checks temporary and live
repository paths.

Canonical build-input JSON recursively sorts object keys by Unicode code point,
preserves array order, emits no insignificant whitespace, uses ordinary JSON escaping
with non-ASCII UTF-8 left unescaped, and permits JSON numbers only for safe integers.
Every non-integral generator quantity is a decimal string matching
`^-?(0|[1-9][0-9]*)\.[0-9]+$` and is converted explicitly by Blender.

<!-- DOC_CONTRACT: room-asset-validation -->
## Validation and budgets

The current validator checks GLB magic, version and declared length; exact semantic
sets; bounds and tolerance; finite accessors and transforms; triangle mode, normals,
UVs and indices; sidecar and hash agreement; URI and extension policy; and the pinned
validator report. Errors and warnings must both be zero. The reviewed manifest field
is exactly `allowedValidatorWarnings: []`; widening it requires an explicit contract
and evidence change rather than silently accepting validator drift.

Payload is GLB byte length plus sidecar UTF-8 byte length and must be no larger than
25,165,824 bytes. The deterministic offline residency upper bound is:

```text
unique bufferView bytes used by vertex or index attributes
+ decoded texture width * height * 4 * 4/3, each image once
+ instanceCapacity(role) * 16 floats * 4 bytes * buffering factor 2
+ 1024 * 1024 * 4 shadow-map bytes
```

The fixed instance capacities are floor_a 768, floor_b 768, wall_straight 363
(188 stable faces plus 175 coping instances), wall_inside 0, wall_outside 0, wall_end 0,
door_frame 2, door_leaf 6, torch_bracket 10, decal_rubble 4, decal_root 4, and
prop_barrel 4. The estimate uses
capacity rather than live count and must be no larger than 268,435,456 bytes. The
texture term counts both embedded 512 x 512 RGBA images with the documented mip
factor. Engine overhead and source JavaScript are
reported separately; browser performance JSON continues to record unavailable GPU
residency rather than relabeling this offline estimate.

The checked artifacts contain 13 nodes, 12 meshes, four materials, 2,784 vertices,
and 1,404 triangles. The GLB is 1,060,408 bytes and the sidecar is 5,321 bytes, for a
validated 1,065,729-byte payload. Its offline estimate is 119,568 source-buffer bytes,
246,912 double-buffered instance bytes, 2,097,152 decoded-texture bytes, and
4,194,304 shadow-map bytes, totaling 6,657,936 bytes. Validator 2.0.0-dev.3.10 reports zero
errors, zero warnings, zero hints, and four informational messages; the
allowed warning list remains exactly empty.

The validator CLI accepts exactly three positional paths in this order: GLB,
semantic sidecar, and canonical validator report. Missing, extra, or reordered
arguments fail usage rather than selecting an implicit file.

<!-- DOC_CONTRACT: room-asset-disclosure -->
## Authored-room disclosure mapping

The current authored room repeats the renderer's authoritative disclosure boundary
for geometry, props, fixtures, light and emissive cues, shadows, picking, effects,
audio proxies, labels, debug records, and retained instances.

- VIS 0 permits no authored presence.
- VIS 1 permits remembered floor and wall topology in the remembered material only.
  Remembered floors use alpha 0.42, while remembered masonry remains opaque so its
  coursed silhouette cannot dissolve into false lintels and posts.
  It permits no current furniture, door state, prop, torch, light, shadow, or pick.
- VIS 2 permits current topology and disclosed furniture and props. Only current
  disclosed records may contribute lights, shadows, picks, effects, or debug presence.

The game interprets MAP_SOLID cells as masonry volume, not as wall axes. Every
disclosed solid-to-open interface owns one `wall:<tx>:<ty>:<side>` face, including
singleton and positive-axis sides. The key contains neither visibility band nor
camera state. Current-to-remembered transitions update that face in place, and
neighbour disclosure adds faces without replacing established meshes or shadow
casters. VIS 0 owns no face. The old -X/-Z maximal-run projection was refuted by the
2026-08-17 owner screenshots because it removed the bottom/left enclosure and made
visibility splits pop; it is no longer the runtime topology. A separate reversible
screen-space policy lowers only a camera-near face whose projected bounds overlap
the hero. It never changes topology, picking, simulation visibility, or identity.
Every disclosed solid also carries one inset opaque coping instance at height 1.55;
remembered coping keeps the same solid silhouette.

The ABI publishes one door record per doorway tile. Presentation groups contiguous
collinear records of the same state into one architectural span. A one-cell span
keeps one complete `door_frame`; a wider span repeats a compressed seamless
masonry lintel, adds jambs only at its endpoints, and uses three aged-umber plank
modules per shut tile or a true gap when open. Shut panels carry two iron straps.
Horizontal and vertical spans have exact tests.
Imported glTF identity quaternions are cleared before semantic Euler quarter turns;
otherwise Babylon ignores rotated +Y facades and door spans. The stress fixture's
175 solid tiles produce the same 188 stable runtime faces plus two singleton door
frames. The authored L/T/end meshes
remain valid kit roles for the arena's separate synthetic centreline ring, but their
game stress capacities are zero.

The room's upper-right directional key retains direction
`[-0.45, -1, -0.35]` and mount `[12, 24, 16]`, with generator-v5 diffuse
`[1, 0.68, 0.42]`, specular `[0.36, 0.23, 0.15]`, and intensity `1.6`.
Every disclosed current torch adds deterministic tapered outer and core flames at
its exact authored sconce socket. Their identity-derived phase animates only scale
and emissive presentation. Both are non-pickable and non-shadow-casting and use orange
emissive color `[1, 0.32, 0.025]`, and is removed with its material on reset,
disclosure loss, or disposal. Its capped point light uses diffuse
`[1, 0.25, 0.045]`, specular `[0.42, 0.18, 0.055]`, intensity `4`, and
range `11.5`. Each flame contributes one effect and one procedural draw group,
making stress disclosure 27 draws (eleven live room source groups plus sixteen flame layers)
without changing the nine-light contract.

Loader roots and hidden source meshes never count as presentation presence.
Epoch/reset and generational reuse retire old authored instances before a new frame
can use the same slot.

<!-- DOC_CONTRACT: room-asset-loader-lifecycle -->
## Loader lifecycle and failure

Plain `#/game` selects the representative room; explicit `room=representative`
does the same, while `room=procedural` is the removal route. Only after the authored
selection does the entry dynamically import the room module and its leaf glTF
registration. The loader stays out of the studio shell's modulepreloads and the
initial static import closure. Dev request logs must prove procedural, fixed-stress greybox, and
Canvas startup do not request or register that chunk. The renderer first creates its engine and Scene, then calls the injected
async `createEnvironment(scene, debug, signal)` factory. That factory validates and
hashes the root-hosted sidecar and bounded GLB, imports a scene-bound asset container
from the verified bytes, validates its complete object closure, then attaches that
trusted container to the same Scene. It returns the environment owner before
presentation, input, Worker initialization, or stress capture readiness.

The resulting immutable kit is keyed only by exact semantic roles.
Loader roots, source geometry, and source materials are Scene-owned resources for
the asset lifetime but remain nonspatial. Classic-instance source meshes stay
enabled because Babylon requires enabled, Scene-owned sources for WebGPU instance
evaluation, but they have
`isVisible = false`, `isPickable = false`, never enter shadow/debug/pick/presence
registries, and are owned by the kit. The loader force-compiles each distinct current
material for instances; the environment does the same for the remembered material.
Ready and capture remain blocked until an authored-room frame completes. NullEngine
evidence must prove Scene membership, instance evaluation, and complete removal of
sources and materials on disposal. Every partial load is disposed on failure.

Missing, corrupt, hash-mismatched, semantically invalid, or loader-failed room assets
produce sanitized diagnostics and are terminal for `room=representative`. They never
silently select procedural geometry, expose a partial authored room, retry each frame,
or switch GPU backend. Explicit `room=procedural` remains the procedural removal
path. That rule is scoped to `room=representative`, which is a reader naming the
authored room. `#/arena`'s `[Texture]` dress loads the same kit through the same loader
and the same pins, instances floor and wall roles only, creates no furniture, light,
pick or debug record from it, and falls back to a procedural floor named on its own
label rather than being terminal -- it asks for a lit fighter and the room is the
backdrop, so an absent development fixture may not take the mode down. Context or device loss remains terminal. Reset clears authored instances before the new epoch;
application disposal releases instances, sources, imported materials, roots, lights,
shadows, debug records, and picks exactly once.

The committed canonical validator report is build and evidence provenance, not a
runtime input. Two temporary reports must be byte-identical and match the manifest
pin and committed report. The Vite build checks its bytes and generated
`ROOM_VALIDATOR_SHA256` pin but neither serves nor copies the report; only the GLB and
sidecar are runtime-root-hosted artifacts.

## Presentation-only bounds

Room geometry, semantic metadata, sockets, collision/debug bounds, loader state,
materials, lights, and picks are presentation inputs only. They never create a
simulation body or enter `Scenario`, `World`, submitted commands, replay, or a hash
domain. `EnvironmentPresentation` receives only a general mesh factory; defects are
fixed in the generator, sidecar, validation, loader, or a general renderer rule, not
through per-mesh authoritative or placement exceptions.

Loader roots, hidden enabled source meshes, source materials, and hidden remembered
sources remain as nonspatial Scene resources until the asset is disposed. The source meshes themselves are
never visible, rendered, pickable, shadow casters, debug/presence entries, or counted
spatial instances. Disposal removes the attached container, sources, and materials
with the asset. Only snapshot-authorized classic instances are spatial presence.

## Visual review contract

The current generated kit and runtime are mechanically authoritative. The styling
revision responds to the first visible `replace` decision, but is not itself a
painted-art pass. The minimum replacement threshold is the readable hierarchy of the
preserved [legacy renderer reference](../performance/evidence/2026-08-08-legacy-renderer-reference.png),
SHA-256 `ef249c666d7c4eabb775dc32fbe943076454e2d26db88967b690df0a3ab05260`:
a bounded dark playfield, legible floor structure and depth, restrained environment
contrast, and unit/target markers that remain the primary accents. The ultimate art
direction remains [`CONCEPT.png`](../../web/assets/CONCEPT.png); reaching old-version
parity does not complete that direction, and neither image is a runtime input.

The current compact visual-review route exercises the same pinned kit and disclosure
rules independently of the 48 x 32 performance stress. Its exact query family is
`/#/game?review=room&room=representative&backend=auto|webgl2&roomCamera=fixed|free`.
It creates no Worker and exposes no performance capture. Its explicit 16 x 10
snapshot has a perimeter-only 48 solid tiles around a 14 x 8 open interior, two
doors showing open and shut states, four torches, four each of barrels, rubble, and
roots, and eight unit markers. The camera derives bounds from that 16 x 10 snapshot.
The playable authored route and compact review use clear `[0.012, 0.016, 0.032, 1]`, image-processing exposure
`1.34`/contrast `1.16`, and one non-shadow hemispheric fill with diffuse
`[0.68, 0.60, 0.50]`, ground `[0.08, 0.065, 0.055]`, and intensity `0.58`;
the fixed 48 x 32 stress fixture retains its dimensions, population, and nine-light contract; its
map/topology identity is the revised boundary-enclosure fixture. This route is
mechanically current. The 2026-08-09 review accepted generator v3's material response, fixture-origin light, join coherence, depth readability, and silhouette contrast at minimum legacy parity. Generator v5 does not inherit that visible approval; its deterministic static QA is complete and its visible-browser review remains the acceptance authority.

Compact review alone injects initial/reset fixed zoom `1.6`; ordinary and 48 x 32
stress cameras retain zoom `1`. At 16:9, the tested compact orthographic top/bottom
are `+/-8.125`; all four ground corners retain at least 20 CSS pixels of margin and
the room spans at least 60% of both viewport axes.
