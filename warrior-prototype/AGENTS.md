# Warrior prototype operational notes

This directory is a standalone experiment. Keep its package manifest, lockfile, assets,
tests, and build commands local. Do not import from `../client`, `../crates`, `../tools`,
or `../web`; the two concept images named in the README are visual references only.

The auto-rpg determinism, simulation, frame ABI, replay, golden-hash, and asset-sidecar
contracts do not apply here. Browser correctness, glTF validity, accessible controls, and
visual review of all four turntable quadrants do.

Run `npm test`, `npm run asset:validate`, and `npm run build` before landing a change.
Do not leave a development server running.
