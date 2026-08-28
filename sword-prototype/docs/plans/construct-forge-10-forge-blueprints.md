# Session 10 -- build bodies in the in-game Forge

## Outcome

A player can assemble, preview, save, export and import a construct without editing JSON or using a
console. Parts attach through declared sockets, so the Forge cannot create a disconnected or
misaligned body. Starting a fight uses the exact canonical blueprint that was previewed.

## Implement

Create `src/forge/model.ts` as the pure reducer over a `ConstructBlueprint`. Commands add/remove a
part, connect/disconnect a joint, mount/unmount a module, change an allowed dimension and rename an
ID. Every command returns either a newly validated blueprint or a refusal; no reducer mutates the
input or leaves a half-edit.

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

Parsing validates each layer before publication and recomputes all digests. Local storage is a
versioned library with atomic replace semantics. Import/export are ordinary file buttons and
downloads; the user never pastes code. A malformed import leaves the existing library and preview
untouched and shows the precise refusal.

Create `src/forge/screen.ts` and `src/forge.css`. Add a Forge route/panel from the setup screen at
`src/setup.ts#L36`: catalog, part tree, socket list, selected-part dimensions, mass/health/power
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
- `undo_redo_round_trips_canonical_blueprint_bytes`
- `saved_construct_import_recomputes_all_three_digests_and_refuses_unknown_versions`
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
