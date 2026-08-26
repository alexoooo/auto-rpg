# Warrior prototype operational notes

This directory is a standalone experiment. Keep its package manifest, lockfile, assets,
tests, and build commands local. Do not import from `../client`, `../crates`, `../tools`,
or `../web`; the concept images named in the README are visual references only.

The auto-rpg determinism, simulation, frame ABI, replay, golden-hash, and asset-sidecar
contracts do not apply here. Browser correctness, glTF validity, accessible controls, and
visual review of all eight fixed turntable angles do.

Run `npm test`, `npm run asset:validate`, and `npm run build` before landing a change.
Do not leave a development server running.

Any visual result must land somewhere the user can actually see it. `.review/` is
ignored, so a render written only there has not been reported. Formal experiments
publish their frame automatically; everything else -- screens, spikes,
representation trials -- goes in `experiments/progress/screens/` and is linked
from its analysis document. `npm run check:visuals` fails on an image link that is
broken or points into an ignored directory.

A viewer change is not verified by the server-rendered HTML. That markup is
identical whether or not anything ever reaches the canvas, so load the page and
look at it before claiming the viewer works.

Changes under `metric/`, to the review cameras, or to part/landmark publication also
run `npm run similarity:test` and `npm run similarity`. The canonical metric is an
advisory local-ML check rather than part of `npm test`: its first setup downloads
pinned weights, and silently substituting the classical smoke score is not allowed.
The A/B comparison server follows the same foreground ownership rule as the viewer.
Scored asset iterations follow `experiments/README.md` and retain a tracked experiment
record even when their hypothesis is rejected.
