# Asset pipeline

**Purpose:** Describe the current Canvas PNG pipeline, procedural GPU fallbacks, and pinned room-asset and combatant glTF-binary pipelines.
**Status:** current
**Canonical source:** [`web/assets/ASSET_SPEC.md`](../../web/assets/ASSET_SPEC.md), [`web/assets/manifest.json`](../../web/assets/manifest.json), [`web/assets.js`](../../web/assets.js), the [room asset contract](../reference/room-asset-contract.md), the [combatant asset contract](../reference/combatant-asset-contract.md), and the [renderer visibility contract](../reference/renderer-contract.md#visibility-and-subsystem-presence)
**Update when:** Asset formats, validation, manifest semantics, loading, fallback behavior, where the rig node list lives, or render integration changes.

The playable Canvas path consumes a checked-in PNG set. The v2 GPU client retains
procedural room and figure geometry as controls and fallbacks, loads the pinned
representative-room `GLB` when that room is selected. It separately loads the pinned
Fighter and Brute combatant glTF binary for authored GPU dresses. All generation and validation are
offline; presentation inputs never enter `Scenario`, `World`, replay, or a hash
domain.

## Authoring and review

[`web/assets/ASSET_SPEC.md`](../../web/assets/ASSET_SPEC.md) is the binding authoring
contract: projection, pixels per world unit, palette, dimensions, alpha rules, naming,
facings, frames, pivots, anchors, and the expected deliverable report. The permanent
`CONCEPT.png` is a visual target, not a runtime asset. `FEEDBACK.md` records review
results and locks files that passed; it also distinguishes permanent references from
regenerable assets.

The committed source images are RGBA PNGs organized under environment, fighter, and
weapon directories. The current manifest describes surfaces, wall faces,
billboards/animations, weapons, and layered actors. It carries semantic keys and
placement data -- world size, cell, facing/frame lists, anchor, pivot, hilt, and tip --
so renderer code asks for a key rather than spelling a filename.

## Offline checks

[`tools/measure_assets.js`](../../tools/measure_assets.js) is a dependency-free PNG
decoder and contract checker. It walks the asset directories in stable order, checks
container/bit-depth/interlace/alpha properties, dimensions, naming, footing, actor
cells, pivots, frame drift, tight weapon crops, and multi-pixel halos. It prints the
measured bounds beside the specification and emits manifest fragments for review; it
does not silently rewrite `manifest.json`.

[`tools/gen_test_assets.js`](../../tools/gen_test_assets.js) is the original recipe
for the deliberately ugly projection/actor/weapon fixtures, with a hand-written PNG
encoder independent from the measuring tool's decoder. Its current output list is
stale, however: the 32 green Fighter body rectangles were retired and replaced by
production art on 2026-08-08, as [`FEEDBACK.md`](../../web/assets/FEEDBACK.md) records,
but the script would still overwrite those production paths. The only surviving
fixture identities are `floor_a` and `test_bar`, and the review record locks even
those checked-in files against regeneration. The script therefore has no safe
current output ownership and must not be run until its recipe and the review record
are deliberately reconciled.

`manifest.json` is reviewed input. A new file is not live merely because it exists on
disk: it must pass measurement and receive a semantic manifest entry. Conversely,
reference images and Markdown review/specification files at the asset root are not
loaded by the page.

## Browser loading and fallback

`web/legacy.html` loads `draw.js`, `rig.js`, and `assets.js` before `main.js`.
`assets.js` fetches the manifest once at boot without blocking wasm or the game loop.
It expands `{facing}` and `{frame}` patterns once during parsing, then lazily creates
an `Image` on the first request for each leaf. Surfaces and faces become reusable
`CanvasPattern` paint entries; other images enter the same fixed paint table directly.
Draw extraction receives a paint-table index, never an `HTMLImageElement`.

Failure is an explicit supported path. A missing or malformed manifest, unknown key,
404, decode failure, or paint-table exhaustion returns `DL_NO_PAINT`, warns at most
once, and takes the procedural fallback already present at the draw site. Failed
images are terminal and are not retried every frame. `?noart=1` or the
`assetsEnabled` console switch exercises the same fallback path for review.

`rig.js` owns body-local proportions and alternative sprite/procedural rows;
`main.js` combines those tables with snapshot pose and camera projection; `draw.js`
alone touches Canvas. A resolved composite body replaces its fallback body segments,
while arm/shield/weapon rows may remain mixed during incremental integration. The
weapon art is stretched between the projected hilt and tip of the same simulation
blade segment used by combat, keeping presentation and hit geometry joined at the
snapshot rather than at an asset-specific correction.

## v2 GPU asset paths

The v2 renderer creates snapshot-local transients and retains primitive room and unit
sources as its explicit geometry control and bounded fallback. The default `#/game`
route attempts the authored room and authored Fighter/Brute first. Unknown geometry
has no instance; remembered known topology uses a separate material; and current
furniture exists only while its disclosed record is present. This remains a visibility
and renderer-boundary proof even when authored meshes hang from the same presentation
identities.

The representative route dynamically imports the pinned room loader only after the
engine and Scene exist. It validates the root-hosted room `GLB` and semantic sidecar before
publishing an immutable semantic kit; the canonical validator report remains
build/evidence provenance and is not deployed. The arena's `[Texture]` dress is a second
consumer of the same kit, behind the same loader, pins and validation, imported on the
first press and never by `[Geometry]`. It instances floor and wall roles only, and it is
the one route where an absent authored room is not terminal: it falls back to a
procedural floor and names which one is drawn. See the
[browser runtime](browser-runtime.md#visibility-authority) for why the two routes differ
there. Hidden enabled source meshes support
classic instances as Scene-owned, nonspatial resources without becoming visible,
pickable, shadow, debug, or presence entries. The validated container, its sources,
and its materials are disposed together. The exact manifest, generator, hashes, budgets, disclosure mapping, and
failure lifecycle are current in the [room asset contract](../reference/room-asset-contract.md#manifest-semantics).
`CONCEPT.png` remains the ultimate visual target and never a runtime dependency. The
preserved [legacy renderer reference](../performance/evidence/2026-08-08-legacy-renderer-reference.png)
is the minimum replacement threshold for readability;
reaching that parity does not complete the ultimate art direction. The initial room
art decision is `replace` in the [room matrix](../performance/v2-room-matrix.md#visible-review-record).

The generator-v2 vertex-color kit and generator-v3 textured box-wall kit are
superseded reproducible intermediates. The current generator-v4 kit crops the pinned
concept material atlas into embedded floor and wall textures, retains deterministic
`COLOR_0` modulation, and builds coursed masonry while preserving semantic names
and pivots. The game treats solid cells as volume and gives every disclosed
solid-to-open side a stable cell-plus-cardinal-side instance, then caps each solid
with inset stone coping. Camera and visibility bands do not enter the wall key;
neighbour disclosure reconciles new sides around retained instances. A local
screen-space policy may lower only the near face actually covering the hero. This
supersedes the -X/-Z run omission refuted by the 2026-08-17 owner screenshots.
Remembered walls stay opaque, imported glTF
quaternions are cleared before semantic quarter turns, and per-tile door publications
group into one lintel/end-jamb span with modular aged-wood leaves. The arena independently uses the L, T, straight,
and capped-end roles for its synthetic centreline ring. The kit has closed output
pins and budgets; automated closure does not constitute visible topology acceptance,
foreground performance evidence, or completion of the painted concept direction.

The current compact 16 x 10 composition route defined by the
[visual review contract](../reference/room-asset-contract.md#visual-review-contract)
supports fixed and free review on both current GPU backends independently of the unchanged 48 x 32
performance stress fixture. Current mechanics do not imply an art pass.

> **Authored combatants are a current optional presentation path.** The
> [combatant asset contract](../reference/combatant-asset-contract.md#semantic-and-skin-closure)
> pins the representative Fighter and Brute rigs, their two real skins, eight cosmetic
> clips, sidecar, validator, and bounded sibling loader. The loader fetches the binary container and
> canonical sidecar once per Scene, enforces MIME and byte caps before allocation,
> verifies generated identity and SHA-256 pins, and rejects any node, mesh, material,
> skeleton, bone, animation, collection, transform, or bound outside the exact semantic
> closure before adding the hidden sources to the Scene.
>
> `#/game` attempts that load during GPU renderer initialization. Each supported live
> unit gets an independently cloned skeleton and skinned mesh set; the already-published
> procedural rig supplies the exact named endpoints, while idle/walk/stagger/fall clips
> are sampled cosmetically and those endpoints are restored afterward. Unsupported
> kinds, validation/load failure, or per-clone failure keep the procedural figure;
> abort remains terminal. Fog, generation retirement, picking, shadow, effect, audio,
> and debug presence apply to whichever dress is active, and disposal owns every clone
> plus the shared container.
> The current authored closure uses separate upper-arm/forearm/hand meshes on both
> archetypes, a tapered Fighter torso with kite shield and shaped sword, and a broader
> forward-headed Brute with a heavy-ended club. Validator metrics bound shoulder/head
> proportions, projected equipment area and the 40-pixel class silhouette; those
> presentation bounds do not alter the shared 16-bone semantic rig.
>
> `#/arena` memoizes the same load on the first `[Texture]` request, never for
> `[Geometry]`. Its per-body clone is driven from published pose, region, weapon,
> shield, contact, health, and stride rows; severed or absent regions remove matching
> authored meshes, first-person layer masks hide the viewer's own head/torso, and only
> published contacts open stagger/fall slots. A failed load leaves the procedural
> textured proxy in place. Neither route lets a clip, skin, bone, or socket write back
> into simulation state.
