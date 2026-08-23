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

Run from inside this directory; npm walks up and will otherwise build the root client.

```powershell
npm ci                  # not `install` -- exact lockfile, identical on every machine
npm run asset:fetch     # one-time: the CC0 environment map, ~1.5 MB, digest-pinned
npm run dev             # http://localhost:5180, strictPort
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
- **The dev port is `strictPort`.** It used to drift to 5181 when an orphaned server held
  5180, which meant editing one server and reading another -- and the orphan outlived a
  `TaskStop` on its parent, because killing `npx` leaves the `vite` child running. Kill by
  PID: `netstat -ano | findstr ":5180"`.
- **The solver must never see a variable timestep.** `Scene._advancePhysicsEngineStep`
  contains a fixed-step accumulator, driven by `PhysicsEngine.setSubTimeStep` (a value in
  **milliseconds**). Step by the raw frame delta instead and a motorised joint gets a
  slightly different correction every frame: measured at 40 mm of tip wander under
  realistic jitter, against 0 mm fixed. Note that `PhysicsEngine._step` itself ignores the
  sub-step -- reading only that function is how this was wrongly written off as a no-op,
  which is what introduced the shake in the first place.
- **Control runs on the physics clock, via `scene.onBeforePhysicsObservable`.** The
  accumulator takes several solver steps per rendered frame and notifies that observable
  before each. Driving the arm from the render loop refreshes the keyframed anchor's target
  on only the first of them, so it coasts through the rest -- the arm wandered close to four
  metres from where it was pointed.
- **A sleeping body hides every steady-state defect.** Havok deactivates the arm at rest, so
  a measurement taken after it settles reads a perfect zero no matter how badly it shakes
  when awake. Force `pl.setActivationControl(body, 1)` before trusting any rest measurement.
- **Do not drive physics by calling `scene.render()` in a tight loop to test.** The delta
  comes from `engine.getDeltaTime()`, which is near zero between two immediate calls, so the
  simulation crawls and every derived number is wrong. Step with a fixed delta instead.
- **Babylon cancels `pointerdown`, and that kills every mouse event after it.** Its input
  manager attaches to the canvas with `preventDefaultOnPointerDown` defaulting to true, and
  cancelling `pointerdown` suppresses the *compatibility* mouse events for the rest of that
  gesture. A listener on `mousemove`/`mousedown` therefore goes deaf the instant any button
  is held: the arm freezes and the button appears to do nothing, which reads as two bugs and
  is one. `src/input.ts` uses pointer events throughout, and `main.ts` turns the flag off as
  well. Do not "fix" a frozen-input report by adding `preventDefault` to a mouse handler --
  that handler is not being called at all.
- **`scene.pick` needs `@babylonjs/core/Culling/ray.js` imported for its side effect.**
  Without it the call throws "Ray needs to be imported before as it contains a side-effect
  required by your code" -- once per frame from inside the render loop, which is easy to
  miss entirely if the tab happens to be hidden. Same family as the physics and shadow
  imports above. `renderOutline` is a module augmentation with the same requirement, from
  `@babylonjs/core/Rendering/outlineRenderer.js`.
- **A hidden tab never renders, so picking silently finds nothing.** `requestAnimationFrame`
  does not fire, no view matrix is ever computed, and every `scene.pick` misses. Call
  `scene.render()` once by hand before believing a picking result taken from the console.
- **Test the wobble with a sweep, not a jump.** Teleporting the cursor and watching the arm
  converge shows a clean monotonic settle with zero overshoot -- and tells you nothing,
  because a teleport gives the blade no momentum to carry. Sweeping the cursor for a quarter
  of a second and then holding it still is what a player does, and it turns the same
  measurement from "no ringing at all" into ten direction changes over 0.68 s.
- **`getWorldMatrix()` short-circuits on the render id.** Step the solver from the console
  without rendering and every derived reading -- tip position, tip speed, absolute positions
  -- freezes at its first value, because the matrix is only recomputed when the render id
  changes. Whole sweeps come back as exactly 0.0. Force `computeWorldMatrix(true)` on every
  node you intend to read.
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
