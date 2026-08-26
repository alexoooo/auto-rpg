# Authored asset v2 boundary

The phase-02 asset path is parallel to the phase-01 control:

- `asset-src/v2/warrior-v2.blend` is the inspectable Blender source generated
  by the deterministic rebuild script.
- `asset-src/v2/build_warrior_v2.py` publishes stable structural/material
  extras, triangulated export topology, UVs, tangents, and PBR texture nodes.
- `asset-src/v2/warrior-v2.contract.json` owns region, payload, triangle, and
  coordinate-system limits.
- `asset-src/v2/texture-manifest.json` owns texture hashes, channels, colour
  intent, and provenance.
- `public/assets/warrior-v2.glb` is a comparison asset. The shipped v1 control
  remains `warrior.glb`; add `?asset=v2` to the standalone viewer URL to inspect
  the parallel asset.

The first PBR source tile was generated with the built-in image-generation tool
from the prompt recorded in the texture manifest, then copied into
`asset-src/v2/texture-sources/`. Deterministic code derives the exported base,
normal, and ORM seed maps. Review-only procedural shader detail is forbidden.

The v2 rebuild currently preserves the accepted phase-01 broad form. More
precisely, `build_warrior_v2.py` invokes `build_warrior.py` and adds publication,
triangulation, UV, tangent, and PBR contracts. It does not yet replace the
primitive topology. The generated `.blend` is an inspectable export foundation,
not evidence that an authored humanoid or fitted armour model exists.

New authored subsystems replace complete semantic regions directly in the
Blender source, retain stable extras/sockets, and pass residual and production
gates before becoming canonical. A helper that merely emits more spheres,
cylinders, tori, cones, or flat prisms does not satisfy this boundary.

```powershell
npm run asset:v2:build
npm run asset:v2:validate
npm run build
```

The validator requires a clean Khronos report, all 24 semantic regions, UVs,
normals, exported tangents, embedded base-colour/normal/ORM maps for every
surface material, verified source texture hashes, and the declared
payload/triangle ceilings. The two flat black eye-socket inserts deliberately
remain untextured: their beveled cap topology cannot publish stable tangents and
their constant material is the export contract rather than a scored surface.
