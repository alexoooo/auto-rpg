# Asset pipeline

**Purpose:** Describe the current Canvas PNG pipeline, procedural v2 greybox, and pinned representative-room GLB pipeline.
**Status:** current
**Canonical source:** [`web/assets/ASSET_SPEC.md`](../../web/assets/ASSET_SPEC.md), [`web/assets/manifest.json`](../../web/assets/manifest.json), [`web/assets.js`](../../web/assets.js), and the [renderer visibility contract](../reference/renderer-contract.md#visibility-and-subsystem-presence)
**Update when:** Asset formats, validation, manifest semantics, loading, fallback behavior, or render integration changes.

The playable Canvas path consumes a checked-in PNG set. The v2 GPU client defaults
to procedural geometry and optionally loads the current pinned representative-room
GLB under `room=representative`. It loads no combatant or articulated rig files.
All generation and validation are offline; presentation inputs never enter
`Scenario`, `World`, replay, or a hash domain.

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

`web/index.html` loads `draw.js`, `rig.js`, and `assets.js` before `main.js`.
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

The v2 renderer creates known floor and wall tiles, disclosed doors and torches,
unit bodies, and snapshot-local transients from primitives. It loads no room art,
rig, texture, or model file and has no asset-loader dependency. Unknown geometry has
no instance; remembered known topology uses a separate material; and current
furniture exists only while its disclosed record is present. This is a visibility
and renderer-boundary proof.

The representative route dynamically imports the pinned room loader only after the
engine and Scene exist. It validates the root-hosted room GLB and semantic sidecar before
publishing an immutable semantic kit; the canonical validator report remains
build/evidence provenance and is not deployed. Hidden enabled source meshes support
classic instances as Scene-owned, nonspatial resources without becoming visible,
pickable, shadow, debug, or presence entries. The validated container, its sources,
and its materials are disposed together. The exact manifest, generator, hashes, budgets, disclosure mapping, and
failure lifecycle are current in the [room asset contract](../reference/room-asset-contract.md#manifest-semantics).
`CONCEPT.png` remains the ultimate visual target and never a runtime dependency. The
preserved [legacy renderer reference](../performance/evidence/2026-08-08-legacy-renderer-reference.png)
is the minimum replacement threshold for readability;
reaching that parity does not complete the ultimate art direction. The initial room
art decision is `replace` in the [room matrix](../performance/v2-room-matrix.md#visible-review-record).

The generator-v2 vertex-color kit is a superseded reproducible intermediate. The
current generator-v3 candidate embeds the checked floor and wall PNGs from
`tools/art/textures/` while retaining deterministic `COLOR_0` modulation; it has
closed output pins and budgets. It remains under `replace` until visible review, so
current mechanics must not be mistaken for accepted art.

The current compact 16 x 10 composition route defined by the
[visual review contract](../reference/room-asset-contract.md#visual-review-contract)
supports fixed and free review on both current GPU backends independently of the unchanged 48 x 32
performance stress fixture. Current mechanics do not imply an art pass.

> **Proposed by v2 -- not shipped:** The
> [combatant integration phase](../plans/v2-18-combatant-integration.md) proposes
> representative combatant and articulated rig GLBs. No current browser path loads
> those assets.
