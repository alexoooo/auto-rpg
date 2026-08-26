# Session 03 — author complete semantic subsystems

## Outcome

Create the first genuinely nonprimitive warrior meshes and screen their variants
before formal scoring. The generated v2 wrapper remains a control, not the source
of new form.

## Implementation

1. Establish `asset-src/v3/warrior-v3.blend` as the authoritative editable
   source and `asset-src/v3/export_warrior_v3.py` as a deterministic exporter.
   Record mesh, material, region, socket, bounds, and topology contracts in
   `asset-src/v3/warrior-v3.contract.json`.
2. Author complete subsystem variants:
   - torso shell plus breastplate/rear/waist transition;
   - pauldron plus upper-arm articulation, informed by 0081;
   - head plus continuous hair/beard silhouette;
   - no-cloth waist plus upper-leg transition;
   - palm/hand plus sword/shield contact surfaces.
3. Each subsystem needs at least three visibly different variants. It must be a
   connected or deliberately overlapping armour construction with intentional
   topology—not a collection of stock primitives hidden by bevels.
4. Preserve stable region/material extras and equipment sockets. The source
   includes UVs and tangents, but neutral materials remain fixed during form
   comparison.
5. Screen each variant through all eight views, mask ownership, manifold checks,
   contact checks, and randomized human A/B. Only a preferred production-valid
   variant may enter session 04.

## Production gates

- no beads, buttons, badges, fins, tubes, mittens, pouches, radial skirts, or
  countable repeated primitive language;
- no open seams, internal caps, daylight, z-fighting, swallowed plates, or
  unsupported equipment;
- no unexplained left/right asymmetry;
- no review-only procedural surface effect;
- GLB re-import matches the Blender source in all eight fixed views.

## Verification

Add validator tests for manifold topology, stable extras, sockets, UV/tangent
presence, material slots, and deterministic geometry digests. Run
`npm run asset:v2:validate`, the new v3 validator, similarity tests, package
tests, and build. The canonical asset and accepted-state hash remain unchanged.

## Phase-05 evidence

The first torso implementation did not satisfy this session. Three parameterized
ring-loft variants were visibly distinct, but formal 0086 showed that their
shared representation still reads as an egg/rubber tunic or horizontal bands.
Likewise, the UV texture screen proved exportable image textures are available,
but generic mottling cannot create missing plate construction.

The next implementation must therefore use a Blender-authored torso-to-waist
mesh with deliberate plate planes and overlaps. It must not call the existing
sphere, cone, cylinder, or ring-loft helpers to define its primary silhouette.
Produce and review three designs before session 04 resumes. The exact v5 mask
and sprint evidence is recorded in
[the rigid-v5 audit](../analysis/rigid-v5-cardinal-segmentation-and-sprint.md).
