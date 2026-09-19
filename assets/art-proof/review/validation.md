# Graphics proof validation — 2026-09-18

## Browser rendering

Measured from the production build in Chrome 153 on Windows, WebGL 2 via ANGLE / D3D11.
The available GPU was **Intel Iris Xe**, not the discrete desktop GPU requested as the target.
The tab remained visible for the entire measurement; other pages were not opened during it.

| 60-second moving-scene run (before the final guard-hold adjustment) | Result |
|---|---:|
| Render resolution | 1920 × 1080 |
| Duration | 60.0663 s |
| Frame intervals | 1,925 |
| Average frame rate | 32.0 fps |
| Median frame interval | 28.1 ms |
| 95th-percentile frame interval | 47.8 ms |
| Draw calls at completion, including rendering passes | 152 |
| Active triangles at completion | 149,954 |
| Art-proof runtime asset files | 14,277,932 bytes |

This does **not** meet the 60 fps target on this integrated GPU. Discrete-GPU performance is not
verified. The proof uses FXAA without multisample render targets, half-resolution SSAO, one
2048 shadow map, shared PBR textures, and instanced static scenery. The existing HDR, engine code,
and Havok wasm are additional to the art-proof asset size above. Frame intervals include browser
scheduling and are not GPU execution timings.

Five consecutive rebuilds preserved all observed resource counts: 631 meshes, 18 textures,
21 materials, and 193 meshes carrying physics bodies. Original/modeled toggling did not change
the physical body count. Pause held both the simulation clock and all limb positions constant
across a one-second observation; pointer-drag still changed the camera while paused.

The production proof emitted no console warnings or errors during the final visual/interaction
checks. `modeled-arena.jpg` and `original-arena.jpg` compare both appearances in the same scene;
`modeled-close.jpg` shows the inspection view. These are direct browser captures, not Blender renders.
The production arena and bench also loaded without console errors. Temporarily withholding the
production golem GLB displayed the visible load-error panel; the asset was then restored.
The final demonstration holds guard after 16 seconds instead of accumulating walking drift.
A 48-second browser advance kept the golem framed, and both automated appearance fixtures
verify that the additional 32 seconds move its pelvis by less than 5 cm.

## Automated checks

- `npm run check`: passed.
- `npm run build`: passed; outputs include `/`, `/bench.html`, and `/art-proof.html`.
- Three new art-proof tests: passed, including a full 16-second physical equivalence comparison
  between original and modeled appearances with real Havok bodies and the actual exported GLB.
- `npm test`: 547 tests; 544 passed and 3 failed.

All three failures were reproduced against an untouched `HEAD` archive with the original files:

1. `nothing a golem publishes reaches the world transform through a world matrix` reports
   the pre-existing comment at `src/golem/wear.ts:22`.
2. `the ram's lunge scores on a post and the plain head scores nothing on the same one` observes
   4.58 J against a 7.84 J blunt floor.
3. `a ram plate touched outside a lunge scores nothing, and a lunge scores once` reports that
   the contact was not a scoring blow.

No combat tuning or test thresholds were changed to conceal these baseline failures.

## Art assessment

This establishes an asset pipeline and a working visual study, not a claim of a pixel-exact
concept-art match. The model retains the game's dimensions and modular silhouette. Modeled bevels,
inward chips, a tapered blade and angular inlay provide real geometry detail; the environment adds
irregular pavement, masonry, braziers, hanging fabric and outcrops. Further authored sculpt detail,
richer environment dressing, impact effects and a complete game UI remain subsequent art work.
