# Sword prototype operational notes

This directory is a standalone experiment. Keep its package manifest, lockfile, assets,
tests, and build commands local. Do not import from `../client`, `../crates`, `../tools`,
`../web`, or `../warrior-prototype`.

The auto-rpg determinism, simulation, frame ABI, replay, golden-hash, and asset-sidecar
contracts **do not apply here**, and that exemption is the entire point of the directory:
this is the experiment that asks what the game could be if none of them existed. What does
apply is browser correctness, a clean `tsc --noEmit`, and a build that runs.

Run `npm test`, `npm run check`, and `npm run build` before landing a change.
Do not leave a development server running.

## Commands

```powershell
npm install
npm run asset:fetch     # one-time: the CC0 environment map, ~1.5 MB
npm run dev             # http://localhost:5180
```

## Traps that have already cost time

- **Physics must be enabled before any body is created.** `buildArena` brings up Havok
  immediately after constructing the `Scene` and before the first `PhysicsAggregate`, and
  it must stay that way. Creating a body first fails with `No Physics Engine available`,
  which names neither the cause nor the file. `startPhysics` now throws its own message if
  the engine is somehow absent afterwards.
- **Babylon's tree-shaken build does not attach `Scene.prototype.enablePhysics`.**
  `src/physics.ts` imports `@babylonjs/core/Physics/joinedPhysicsEngineComponent.js` purely
  for that side effect. Deleting the "unused" import compiles, passes `tsc`, and breaks the
  page at runtime. The same is true of the shadow, depth-renderer and post-process-pipeline
  imports at the top of `src/arena.ts`.
- **Chrome does not paint WebGL in a hidden tab.** A screenshot of a backgrounded window
  shows the DOM overlay updating over a black canvas, `getActiveMeshes()` returns 0, and it
  looks exactly like a broken renderer. Check `document.visibilityState` before believing
  it. Forcing `scene.render()` from the console and sampling the canvas distinguishes the
  two in one step.
- **Backgrounding the dev server with `&` does not survive the shell call.** It dies
  silently and the next page load fails to connect.
- **`src/scoring.ts` and `src/config.ts` are imported directly by Node** in the test run,
  so their intra-directory imports carry explicit `.ts` extensions. Vite does not care;
  Node's ESM resolver does.

## Where the design lives

`src/config.ts` is the whole tuning surface, and it is deliberately mutable: the page
exposes `window.__sword`, so `__sword.config.arm.stiffness = 1600` takes effect on the next
frame. Tune from the console first, then write the number back into the file.

`src/scoring.ts` is the balance rule -- what counts as a cut, a thrust, or a clang -- kept
pure and free of Babylon so it can be argued with in `tests/scoring.test.mjs` rather than
only by swinging. Changes to how the game rewards a blow belong there, with a test.
