# Session 29 — semantic surface binding, relief and damage wear

**Status (2026-09-01): implemented, focused-green and recorded durably; its presentation-only
isolation is retained for Session 30's integrated gate.**

## Outcome

Bind the procedural PBR foundation to real Construct damage targets without per-mesh materials or
simulation state. Every part receives a stable local pattern, eligible cores receive restrained
apparent carving, and damage deepens cracks only on the exact part, module or joint that was hit.

The shader's visual effects remain fragment-only; vertex injection may carry object-local varyings,
but cannot displace vertices or alter depth. Health-driven appearance is one-way presentation:
authoritative damage may update render metadata, but render state can never feed damage, AI,
targeting, collision, picking or saved content.

## Render-only binding

Add to `src/construct/render.ts#L114`:

```ts
export interface ConstructSurfaceBinding {
  readonly targetKind: "part" | "module" | "joint";
  readonly targetId: string;
  readonly primitiveId: string;
  readonly seed: number;
  readonly shapeKind: PrimitiveShape["kind"];
  readonly extentsM: readonly [number, number, number];
  readonly relief: "none" | "core-front";
  healthRatio: number;
}
```

`seed` is a stable hash of the saved semantic target ID, module ID where applicable, primitive ID
and shell style. Primitive IDs alone are not globally unique across modules. It must not
depend on build order, object identity, faction, current health or `Math.random`. Faction continues
to select palette colour, not crack placement.

`relief` is `core-front` only for box-shaped geometry whose authored shell style is `core`. Do not
switch on names such as `torso` or `core`; a renamed but semantically identical body must render the
same class of surface.

## Implement

1. When `renderConstructPart` and module geometry are created near
   `src/construct/render.ts#L114`, attach one `ConstructSurfaceBinding` to mesh metadata before
   `applyConstructSurface`. Primitive extents are derived from the validated shape and visual
   clearance. Return the part's existing `construct.<part>.bearing` mesh explicitly from
   `buildConstructPartVisual`; after compile has the joint table, register each joint ID to its
   child part's bearing mesh. The validated body tree permits one parent joint per child, so this is
   a total, unambiguous mapping. The binding owns no Babylon material or physics handle.

2. In **src/construct/procedural-surface.ts**, have the shared material plugin's
   `bindForSubMesh` read the current mesh binding and set seed, extents, relief and health ratio
   uniforms. Do not store health on the shared material; doing so scars every part using the
   faction palette.

3. Add an analytic geometric recess pattern on the dominant local-front face of eligible box
   cores. The signed-distance pattern is a nested angular/rune path similar to the reference chest
   plate. It modifies albedo, normal and roughness only. It does not emit light, change depth,
   discard fragments or appear on back/side faces, spheres, cylinders or ordinary plates.

4. Bind authoritative damage one way without adding a render dependency to
   `ConstructDamageState`. During construction, `src/construct/render.ts#L114` returns a render-side
   registry keyed by the stable presentation key `{ targetKind, targetId }`, not a `Limb` object.
   Add `ConstructDamageTargets.describe(target)` at `src/construct/damage-target.ts#L139`; after
   `Construct.applyDamage` at `src/construct/construct.ts#L761` receives the numeric applied damage,
   it asks that owner for `{ targetKind, targetId, remaining, maximum }` and publishes the tuple to
   the registry. Proxy module/joint limbs are created after visuals, so object identity cannot be
   the registration key.

   The mapping is exact and many-to-one by authoritative damage target: a part updates its shell
   bindings; a module updates all of that module's semantic primitive bindings; a joint updates the
   named bearing binding attached to that joint. Unrelated ornaments and adjacent bodies do not
   change. Detached targets retain their last appearance. Disposing/rebuilding clears the registry
   with the meshes.

5. Damage appearance follows these frozen presentation bands:

   ```ts
   export const PROCEDURAL_DAMAGE_WEAR_V1 = Object.freeze({
     beginsBelowHealthRatio: 0.75,
     maximumAtHealthRatio: 0.10,
     crackDarkeningMax: 0.22,
     freshEdgeLighteningMax: 0.16,
     normalIncreaseMax: 0.28,
   });
   ```

   Clamp every input. Zero/invalid maximum health is refused before reaching the shader.

6. Preserve target outlines, pickability, shadow casting, `costume` membership, pause-camera
   inspection and the `G` rig-overlay hide/restore path. The rig overlay keeps its separate debug
   `StandardMaterial` and never receives the procedural plugin.

7. Add a render audit helper that reports per scene/faction: mesh count, material count, texture
   count, plugin count, requested/effective mode, fallback reason and count of damaged bindings.
   Expose it through the existing in-game diagnostics UI, not a browser-console recipe.

## Tests watched failing

- `surface_seed_is_stable_across_build_order_and_absent_from_canonical_blueprints`
- `two_semantic_parts_do_not_receive_one_stamped_noise_origin`
- `core_relief_is_limited_to_the_front_of_box_shaped_core_shells`
- `damage_binding_changes_only_the_exact_part_module_or_joint_damage_target`
- `shared_materials_do_not_share_health_ratio`
- `detached_parts_keep_their_last_visual_damage_without_remaining_authoritative`
- `procedural_surface_metadata_never_enters_saved_Construct_or_policy_facts`
- `picking_outlines_shadows_pause_camera_and_rig_overlay_survive_surface_binding`
- `twenty_rebuilds_show_zero_mesh_material_texture_plugin_or_binding_growth`

Mutation proof: seed by build index; write health onto the material; infer relief from `part.id`;
update every binding after one hit; include render metadata in canonical serialization. Each mutation
must make its named test red.

## Browser visual acceptance

Capture the same seeded Warden and Swordbearer under procedural and forced-fallback modes:

- intact stone shows large facets and fine grain without UV seams;
- cracks remain bounded and do not become camera-distance moiré;
- bronze reads as metal under direct arena light with HDR disabled;
- carved relief is visible but non-glowing and does not appear on rear/side faces;
- damaging one limb changes that limb only;
- orbit/zoom/pause does not make patterns swim;
- shadows, outlines, picking and `G` overlay remain correct;
- no mesh disappears while the shader or fallback compiles.

This session records pixels and resource counts, not performance. Per repository policy, hidden
automated tabs cannot establish rendering performance; Session 30 owns the visible-browser bracket.

## Digest and evidence prediction

No authoritative digest moves. The broad Construct qualification source fingerprint intentionally
moves because its conservative owner hashes every `src/**/*.ts`; rerun it rather than pretending a
render edit retained source identity. Procedural/fallback runs on identical bout input must produce
byte-identical body transforms, support state, health, contacts, actions, verdict and saved
Construct digests.

## Verification

```powershell
node --test tests/construct-materials.test.mjs tests/construct-procedural-surface.test.mjs
node --test tests/construct-damage.test.mjs tests/construct-runtime.test.mjs
npm test
npm run check
npm run build
git diff --check -- .
```
