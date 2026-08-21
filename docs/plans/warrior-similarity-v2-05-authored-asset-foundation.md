# Session 05 -- authored asset and PBR foundation

## Outcome

Replace the primitive-only authoring ceiling with an explicit, reproducible
workflow for a humanoid base, fitted armour meshes, and baked export-parity PBR
materials while keeping the browser turntable operational.

## Implementation

- Select or author a legally redistributable humanoid base and record source,
  license, scale, coordinate system, topology, and import/rebuild procedure.
- Define stable semantic joints, equipment sockets, review landmarks, object
  names, region IDs, and material IDs independent of topology.
- Add deterministic source assets or a documented Blender rebuild step; do not
  hide manual state in an untracked `.blend`.
- Enable UV and tangent export and validate base-colour, normal, metallic,
  roughness, and occlusion textures through the shipped GLB path.
- Extend asset validation with texture presence, dimensions, colour-space,
  material-slot, UV, tangent, node-name, bound, and payload limits.
- Preserve the phase-01 asset as a selectable comparison control until phase 02
  is formally launched.

## Verification

Double export must be byte-identical or produce a documented deterministic
equivalent. Validate GLB structure, browser loading, all eight review cameras,
region/material passes, payload bounds, and package build/tests.

