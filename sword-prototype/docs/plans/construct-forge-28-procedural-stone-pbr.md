# Session 28 — procedural stone and bronze PBR foundation

## Outcome

Add the reference image's foundational surface language to Constructs: faceted grey stone,
multi-scale grain, dark crack networks and warm bronze joints. Session 29 adds semantic per-part
seeds, edge wear and carved relief. Keep Babylon's PBR lighting, shadows, fog and tone mapping.
Keep render and collision silhouettes exact.

This is a presentation system. It cannot affect physics, targeting, saved Constructs, policy facts
or combat digests. It does not claim genuine chipped silhouettes, bevel geometry or recessed
topology; those require a separate visual-shell project.

## Public presentation contract

Create the new module **src/construct/procedural-surface.ts** with:

```ts
export const CONSTRUCT_PROCEDURAL_SURFACE_VERSION = 1 as const;
export type ConstructSurfaceMode = "procedural-pbr" | "mapped-pbr";

export interface ConstructSurfaceAudit {
  readonly requested: ConstructSurfaceMode;
  readonly effective: ConstructSurfaceMode;
  readonly reason: string | null;
  readonly shaderVersion: 1;
}
```

The production default remains `mapped-pbr` through Sessions 28 and 29. Tests and the visual audit
request `procedural-pbr` explicitly; Session 30 may switch the default only after its functional and
visible-performance gates pass. Gameplay and saved Construct data do not store that option.

## Implement

1. Create **tests/construct-procedural-surface.test.mjs** for shader source/capability, palette census,
   fallback and NullEngine isolation tests. Extend each shared `PBRMaterial` created by `constructMaterials` at
   `src/construct/materials.ts#L209` with one `MaterialPluginBase`. Do not use a replacement
   `ShaderMaterial`, clone materials per part, or introduce a draw call per effect.

2. Inject deterministic GLSL into the PBR custom points. Vertex injection passes object-local
   position and normal. Fragment injection changes only albedo, normal and metallic/roughness.
   There is no time uniform, `Math.random`, alpha discard or vertex displacement.

3. Stone uses bounded low/high-frequency value noise, a cellular crack ridge and derivative normal
   perturbation. Freeze the intended ranges:

   ```ts
   export const PROCEDURAL_STONE_V1 = Object.freeze({
     lowFrequencyPerM: 1.7,
     highFrequencyPerM: 11,
     crackFrequencyPerM: 4.5,
     crackWidth: 0.055,
     roughnessMin: 0.82,
     roughnessMax: 0.98,
     normalStrength: 0.62,
   });
   ```

   Noise is object-local so a moving limb carries its pattern. Session 29 supplies the semantic
   per-primitive seed and extents required to prevent repeated limbs from looking stamped.

4. Bronze uses metallic `>= 0.8`, roughness in `0.34..0.58`, warm base colour, darker recess noise
   and restrained oxidation. It must remain readable under the arena's direct light with HDR/IBL
   disabled; no unlit compensation.

5. Change `rune-inlay` in `CONSTRUCT_MATERIAL_PROFILES` at
   `src/construct/materials.ts#L88` from emissive/unlit to non-emissive mineral/bronze contrast.
   The reference has carved relief, not glowing neon seams.

6. Preserve the generated textures from `stoneTextures` at
   `src/construct/materials.ts#L172`. They remain attached and become effective automatically when
   the procedural define is dropped. Do not asynchronously swap texture resources: an unready map
   has previously made whole meshes disappear.

7. Capability selection refuses procedural mode by name when the backend cannot compile the
   pinned GLSL path or lacks required high precision/derivatives. Register an effect fallback rank
   that removes `CONSTRUCT_PROCEDURAL`; record the resulting reason in audit metadata.

8. Preserve one palette per scene/faction and the existing disposal order. HMR/rebuild must not
   grow meshes, materials, textures, plugins, observers or physics bodies.

## Tests watched failing

- `procedural_surface_capability_refuses_unsupported_GL_with_a_named_fallback`
- `procedural_surface_audit_reports_requested_effective_reason_and_version`
- `stone_noise_is_object_local_and_does_not_swim_when_a_mesh_moves`
- `procedural_mode_adds_no_material_instance_or_draw_call_per_part`
- `bronze_remains_metallic_rough_and_lit_without_an_HDR_environment`
- `rune_inlay_is_non_emissive`
- `mapped_PBR_remains_a_complete_synchronous_fallback`
- `twenty_rebuilds_dispose_every_palette_plugin_and_texture`
- `shader_constants_cannot_change_any_saved_or_physics_digest`

Mutation proof: use world position for noise; add a time term; remove the fallback define; make the
rune unlit; clone one stone material per part. The named test must fail before restoration.

## Digest and evidence prediction

- No blueprint, control, program, report, combat or learning digest moves. The broad Construct
  qualification source fingerprint intentionally moves because it hashes every `src/**/*.ts`,
  including presentation sources; old qualification rows become stale even though authoritative
  state is byte-identical.
- Render screenshots and material audit evidence are new presentation artifacts.
- A simulation snapshot, health report and transform trace produced under procedural and forced
  fallback mode must be byte-identical.

## Verification

```powershell
node --test tests/construct-materials.test.mjs tests/construct-procedural-surface.test.mjs
node --test tests/construct-runtime.test.mjs tests/construct-physical-fallbacks.test.mjs
npm test
npm run check
npm run build
git diff --check -- .
```
