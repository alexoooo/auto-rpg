# Session 10 -- build bodies in the in-game Forge

## Outcome

A player can assemble, preview, save, export and import a construct without editing JSON or using a
console. Parts attach through declared sockets, so the Forge cannot create a disconnected or
misaligned body. Starting a fight uses the exact canonical blueprint that was previewed.

## Implement

Create `src/forge/model.ts` as the pure reducer over a `ConstructBlueprint`. Because every published
blueprint must remain a connected tree, topology edits are atomic: `attachFragment` adds a part and
its parent joint at one compatible socket; `removeSubtree` removes one joint plus its entire child
subtree; module mount/unmount, allowed dimension changes and ID renames are individually valid.
There is no separate `add part` followed by `connect joint` sequence--the first half could only be
a disconnected invalid blueprint--and no free invalid draft model in v1. Every command returns
either a newly validated blueprint or the original plus a refusal; no reducer mutates the input or
leaves a half-edit.

Create `src/forge/catalog.ts` with the initial code-native vocabulary: core shells, straight and
angled plates, bearing joints, hinge joints, piston links, feet, shield, sword socket, two-axis
mount, crossbow, magazine, power core and factual sensors. Catalog entries are parameterized
blueprint fragments and surface/material recipes, never standalone meshes.

Create `src/construct/codec.ts` over session 01 canonicalization:

~~~ts
export interface SavedConstruct {
  readonly version: 1;
  readonly name: string;
  readonly blueprint: ConstructBlueprint;
  readonly control: ConstructControlGraph;
  readonly program: ConstructProgram;
  readonly digests: { readonly blueprint: string; readonly control: string; readonly program: string };
}
~~~

File import checks raw UTF-8 byte length against the 1 MiB per-construct ceiling before
`JSON.parse`, then checks every session 01/04/09 count/depth ceiling and the final canonical saved
byte length before publication; it never truncates or partially decodes an oversize layer. Parsing
recomputes all digests. Local storage is a single versioned library envelope under one key: parse
and validate a complete replacement in memory, then use one `localStorage.setItem`; no multi-key
half-commit is called atomic. Import/export are ordinary file buttons and downloads; the user never
pastes code. A malformed import leaves the existing library and preview untouched and shows the
precise refusal.

Create `src/forge/screen.ts` and `src/forge.css`. Add a Forge route/panel from the setup screen at
`src/setup.ts#L35`: catalog, part tree, socket list, selected-part dimensions, mass/health/power
summary, undo/redo and 3D preview. Selection snaps to compatible sockets; there is no freehand
translation/rotation in v1. Preview rebuilds transactionally through session 03 and keeps the last
valid preview visible when an edit is refused.

Extend `SideSetup` in `src/bout.ts` with a saved construct ID for construct units. Matchups store the
three digests, not a mutable library object. Deleting a selected library entry refuses Fight by
name rather than substituting the Bronze Warden.

## Tests watched failing

Create `tests/forge-model.test.mjs` and `tests/forge-screen.test.mjs`:

- `every_Forge_command_returns_a_valid_new_blueprint_or_the_original_with_a_refusal`
- `socket_snapping_preserves_both_attachment_frames_without_free_transform_state`
- `a_topology_edit_atomically_attaches_a_fragment_or_removes_its_whole_subtree`
- `undo_redo_round_trips_canonical_blueprint_bytes`
- `saved_construct_import_recomputes_all_three_digests_and_refuses_unknown_versions`
- `oversize_saved_constructs_refuse_before_JSON_or_preview_allocation`
- `a_failed_import_or_preview_leaves_the_library_and_last_valid_scene_unchanged`
- `the_setup_starts_the_exact_saved_digests_and_never_a_fallback_Warden`
- `the_Forge_is_complete_without_console_or_source_editing`

Mutation proof: make failed preview assign its candidate before validation and require library,
digest and scene-census assertions to fail.

## Accept

- A player can create a Warden-equivalent body from catalog pieces, save it, reload the page and
  fight with the same canonical blueprint.
- The UI clearly separates physical hardware from actions and Mind programming.
- Browser visual QA covers mouse-only construction, error recovery and preview disposal.
- `npm test`, `npm run check` and `npm run build` pass.

## Implemented remediation -- 2026-08-28

Ordinary Setup now stores and displays the exact three-digest saved-machine ID for each Construct
side. Standard Fight resolves that ID at build time and refuses a missing/deleted revision; it does
not reserve exact saves for Lab or fall back to the committed Warden. Saving from a side's Forge
selects the new revision for that side. The global Forge begins with a powered, sensor/tool-equipped
core with no locomotor branches, and the four connected catalog fragments are the ordinary route to
the Warden-equivalent limb topology. Those exact corner templates accept only the unresized starter
root and refuse an already occupied corner; they are not silently remapped onto arbitrary parts.
Apply, undo, redo and import preview transitions keep history
and the last valid preview unchanged when preview construction or host publication refuses.

Generic catalog pieces now expose six declared structural faces. Ordinary attach commands carry the
chosen parent/child faces and reducers refuse occupied, incompatible or frame-mismatched edits. A
face-bound box resize transactionally moves every incident joint and module socket to the resized
face; custom non-face attachments refuse rather than silently float. The Body shelf also creates a
complete y-then-x tool mount with a dorsal output socket, adds sensor/power/magazine/shield/tool socket
templates to new parts, and includes magazine hardware. A DOM-driven regression builds, saves,
physically compiles and steps a non-starter sword-plus-sensor branch.
