# Session 07 -- export-parity material hierarchy

## Outcome

Give the preferred authored blockout the target's material vocabulary without
using review-only procedural shaders or chasing exact AI-generated scratches.

## Implementation

- Bake and ship distinct scratched dark plate, polished edge wear, chainmail or
  quilted underlayer, worn leather, shield surface, skin, and hair materials.
- Use shared atlases only where their resolution and material semantics remain
  legible. Record texel density and compression decisions.
- Compare each material inside eroded region masks. Geometry, contacts, and
  structural masks must remain fixed during material studies.
- Screen variants visually under all eight fixed cameras before formal scoring;
  reject rubber, neoprene, chrome, painted-cylinder, tiled-noise, and uniformly
  procedural reads.

## Verification

The exported GLB must contain the same textures and material response used by
the review renderer. Run asset validation, both metric versions, the residual
atlas, browser tests/build, and a visible turntable review.

