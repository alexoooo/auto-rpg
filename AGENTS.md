# Operational notes

This repository **is the game**: physically-simulated melee between bodies assembled from
modules -- stone golems and armoured human warriors -- in the browser, on Babylon.js and Havok,
with an arena and a dungeon mode. Beside the game's source in `src/` are its tests and headless
harness (`tests/`), a policy league and machine-learning lab that run the real bout runner
(`research/`), asset-export scripts (`scripts/`), design notes (`docs/`) and the GitHub Pages
deploy (`.github/workflows/pages.yml`). On 2026-09-18 the Warrior -- the humanoid fighter the
golems replaced, with its `src/arm.ts`, `src/weapon.ts` and `src/arrow.ts` -- was cut,
everything that was not the game (the Rust client and crates, a separate warrior prototype, their
tools and docs) was deleted, and the game under `sword-prototype/` was flattened to the root.
`research/`, the dungeon and the human body family in `src/golem/humanoid/` came after that.

What applies here is browser correctness, a clean `tsc --noEmit`, and a build that runs. Run
`npm test`, `npm run check` and `npm run build` before landing a change. Do not leave a
development server running.

## Commands

```powershell
npm ci        # not `install` -- exact lockfile, identical on every machine
npm run dev   # http://localhost:5180, strictPort
npm run check # tsc --noEmit
npm test      # node --test tests/*.test.mjs
npm run build # check, then vite build
npm run preview
```

The five scripts after `npm ci` are the whole of `package.json`'s `scripts`. **Four pages come up
on that one server**, and all four are named in `vite.config.ts`'s `rollupOptions.input` because
Vite's default input is `index.html` alone -- a second page that works in dev and is absent from
`dist` is a config failure wearing a routing failure's clothes. `/` is the game: one document,
`index.html` with the entry `src/app.ts`, holding the main menu, the arena at `?play=arena` (an
arena link, `?matchup=`, opens it directly) and the dungeon at `?play=dungeon`, each screen a
`<template>` mounted once per page load. `/dungeon.html` only forwards to `./?play=dungeon`;
`/bench.html` is the module bench, one module on a stand or an effector in each socket;
`/art-proof.html` is the golem art proof.

**The headless harness is `tests/harness/`.** `bout-runner.mjs` exports `freshHavok`,
`createBout` and `runBout`, and the tests and `research/` both run bouts through it;
`golem-headless-arena.mjs` exports `createHeadlessArena`, the physics arena without a browser and
without fighters; `golem-bench.mjs` stands one module on the stand and `golem-torso-bench.mjs` a
trunk with a head on it. Both benches, `reading-variation.mjs` and `stroke-phase.mjs` also run
directly under `node`. It is how a body gets measured without a person watching.

## Traps that have already cost time

- **Physics must be enabled before any body is created.** `buildArena` brings up Havok
  immediately after constructing the `Scene` and before the first `PhysicsAggregate`, and
  it must stay that way. Creating a body first fails with `No Physics Engine available`,
  which names neither the cause nor the file. `attachPhysics` in `src/physics.ts` throws its
  own message if the engine is somehow absent afterwards.
- **Babylon's tree-shaken build does not attach `Scene.prototype.enablePhysics`.**
  `src/physics.ts` imports `@babylonjs/core/Physics/joinedPhysicsEngineComponent.js` purely
  for that side effect. Deleting the "unused" import compiles, passes `tsc`, and breaks the
  page at runtime. The same is true of the shadow, depth-renderer and post-process-pipeline
  imports at the top of `src/arena.ts`.
- **Chrome does not paint WebGL in a hidden tab.** A screenshot of a backgrounded window
  shows the DOM overlay updating over a black canvas, `getActiveMeshes()` returns 0, and it
  looks exactly like a broken renderer. Check `document.visibilityState` before believing
  it -- and `engine.frameId` frozen across a wait is the sharper tell, because Chrome pauses
  `requestAnimationFrame` outright rather than merely slowing it.

  **There is a way through, and two sessions were blocked before anybody found it.** Step
  the world by hand (`scene._renderId += 1; scene._advancePhysicsEngineStep(1000/60)`), then
  call `scene.render()` yourself, and the canvas really paints -- a screenshot of the tab
  comes back with a full frame in it. So a visual check *can* be made from a background
  window; it just cannot be made by waiting for one.
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
  before each. When the Warrior's arm was driven from the render loop, its keyframed anchor's
  target was refreshed on only the first of them and coasted through the rest -- the arm
  wandered close to four metres from where it was pointed. `BuiltModule.step` in
  `src/golem/module.ts` is called from that observable for this reason, by the arena, bench and
  dungeon pages alike.
- **A sleeping body hides every steady-state defect.** Havok deactivates the arm at rest, so
  a measurement taken after it settles reads a perfect zero no matter how badly it shakes
  when awake. Force `pl.setActivationControl(body, 1)` before trusting any rest measurement.
- **A weld whose two frames disagree at construction is a violation the solver clears by
  flinging the thing.** Every Warrior weapon was built in the fighter's frame and welded into
  the hand's, which for the sword was a half turn out; peak tip speed in the first fifth of a
  second of a fighter standing perfectly still was 48.3 m/s for the sword and 80.4 for the
  club. Building each kind in the frame its own weld demanded (`mountRotation` in the Warrior's
  `weapon.ts`) brought those to 23.9 and 19.1, which was the arm lifting out of its build pose
  and nothing else. If you add a welded body, build it in the frame its weld demands -- and note
  that a bout's *peak* readings carry a frame-one flick forever, because a peak is a maximum.
- **A ternary chain with a default branch is not a dispatch table, it is a silent
  substitution.** The Warrior's `Weapon` constructor read
  `kind === "shield" ? buildShield : buildClub`, so any kind added to the union and to the picker
  compiled clean, passed `tsc`, passed the build, and shipped **as a club** -- which for a shield
  means a shield-shaped thing that scores crushing blows and severs limbs. The repair was a
  `never` default, which made a kind without a builder a compile error. The same shape of hole is
  worth looking for wherever a union is switched on: `handsFor`, `mountFor` and `PARRY_LABEL` are
  the ones that existed, and only the last was already total.
- **A test helper that reconstructs geometry from `CONFIG` is pinned to one kind's geometry.**
  `tests/shield.test.mjs` sampled the plate by rebuilding the heater shield's rectangle from
  `CONFIG.shield` inline. Handed a buckler it would have gone on passing while sampling a
  440x600 mm patch of empty air where a 340 mm disc is -- a green test asserting nothing,
  which is the defect this file calls the worst one available. The repair was to make the helper
  take the kind.
- **A body built overlapping another on a layer that forbids the overlap deadlocks the chain
  driving it, and the symptom is a pose.** The Warrior's shield stood 110 mm off the fist along
  the hand's +X and a hand was built in the torso's frame, so an off-hand shield was built inside
  its owner's pelvis. The contact pinned the arm at full extension before the anchor had lifted
  it once; the hand therefore never re-orientated; the overlap therefore never cleared. The
  arm sat 315 mm from where it was commanded, looking exactly like a badly-chosen rest pose,
  and no amount of looking at the pose was going to find it. **Measure the hand against its
  anchor.** A driven arm that is not within a few millimetres of its own anchor is not posed
  wrongly, it is stuck on something.
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
- **A button over the arena is also a press on the arena.** `Controls` listens on the window, so a
  click on a DOM control is a thrust as well, and `#hud` is `pointer-events: none` besides. The
  HUD's Take / Let go buttons and the verdict bar therefore take the pointer back themselves, stop
  `pointerdown` and `pointermove` from reaching the window, and let `pointerup` through, so that a
  press begun on the canvas still ends over them. Each also blurs itself on click, because a
  focused button takes Enter, and a held Space, whose repeats `Controls` does not cancel, as a
  second press.
- **A level maintained from edges is permanently wrong after one lost edge.** `thrust`
  and `guard` were once set on `pointerdown` and cleared on `pointerup`, which is correct
  only for as long as the browser delivers every release -- and it does not. A
  `pointercancel` reports its `button` as -1, so aliasing it to the `pointerup` handler
  cleared nothing at all; a button let go outside the window never reports up; a tab
  hidden mid-hold swallows the release as well. The symptom was an arm locked in the
  guard pose with nothing held, and no amount of further clicking freed it. Whether a
  button is down is a *level*, so read it from `event.buttons` -- the live bitmask that
  every pointer event carries, `pointermove` included -- and the next twitch of the mouse
  repairs a lost edge. `src/buttons.ts` holds that rule and keeps edges for actions
  alone, which must fire once per press. Same lesson as the trap above: nothing the
  browser says about the end of a gesture is guaranteed to arrive.
- **`scene.pick` needs `@babylonjs/core/Culling/ray.js` imported for its side effect.**
  Without it the call throws "Ray needs to be imported before as it contains a side-effect
  required by your code" -- once per frame from inside the render loop, which is easy to
  miss entirely if the tab happens to be hidden. Same family as the physics and shadow
  imports above. `renderOutline` is a module augmentation with the same requirement, from
  `@babylonjs/core/Rendering/outlineRenderer.js`.
- **`PhysicsViewer` needs `@babylonjs/core/Rendering/edgesRenderer.js` imported for its
  side effect.** It calls `enableEdgesRendering()` on the inertia box and on the constraint
  cage, and in the tree-shaken build that method does not exist. The failure is worse than
  the others in this family because what it throws is a bare **string**, not an `Error`: it
  carries no stack, and a `catch (e)` that reads `e.message` reports `undefined`. `tsc` and
  `vite build` are both perfectly happy. When the Warrior's rig view drew through it, the
  symptom was that pressing `G` did nothing at all; nothing in the tree uses `PhysicsViewer`
  now. Fourth member of the same family as the physics, shadow, outline and `Culling/ray`
  imports -- when a Babylon feature works in the playground and not here, suspect a missing
  side-effect import before suspecting the feature.
- **A carried mesh does not own its arena material.** Babylon's
  `root.dispose(false, true)` recursively disposes child materials and textures. That was
  harmless while every weapon died only with its scene, then failed as soon as one sword
  shared a real map with another: disposing the first removed the second's texture and left
  the shared-surface cache pointing at a corpse. A body part owns its body, shape and meshes,
  and the scene alone owns the palette: every golem and human part disposes its mesh with
  `dispose(false, false)`, which takes a parented shell with it and leaves materials standing.
  The header of `src/golem/effectors/shell.ts` states that contract. The one owner of materials
  below the scene is the human skin in `src/golem/humanoid/appearance.ts`: it creates its own
  per-side `PBRMaterial`s and chainmail textures, and its `dispose` takes down exactly those.
- **Three ways to ask the wrong question about why something is not on screen**, all of
  which cost time here in one sitting:
  - `Material.isReady(mesh)` returns **false for every material** when called outside a
    render pass, textures or no textures. It is not "is this material broken".
  - `scene.materials` does **not** reliably contain every material in the scene -- several
    of the palette were attached to meshes, rendering, and absent from that list. Reach
    materials through `mesh.material`.
  - After an HMR update `main.ts` builds a **second scene**, and the first one's materials
    linger on nothing with their textures abandoned mid-load at 0x0. Any reading taken after
    an edit, without a full navigation, may be of the corpse. Navigate, do not reload.

  The thing that settled it in one step was stripping the textures at the console and
  taking a screenshot. **Look at it before probing it.**
- **Particles need `@babylonjs/core/Particles/particleSystemComponent` imported for their
  side effect.** Sixth member of the family, and it fails the most convincingly of all of
  them: a `ParticleSystem` constructs cleanly, accepts every setting you give it, takes
  `start()` without complaint, reports a sensible `getCapacity()`, and emits nothing
  whatsoever. There is no error, no warning and no null. `src/damage-feedback.ts` carries the
  import for the arena's particles; `src/blood.ts`, which only its own test loads, carries it
  too.
- **A hidden tab never renders, so picking silently finds nothing.** `requestAnimationFrame`
  does not fire, no view matrix is ever computed, and every `scene.pick` misses. Call
  `scene.render()` once by hand before believing a picking result taken from the console.
- **Test the wobble with a sweep, not a jump.** Teleporting the cursor and watching the arm
  converge shows a clean monotonic settle with zero overshoot -- and tells you nothing,
  because a teleport gives the blade no momentum to carry. Sweeping the cursor for a quarter
  of a second and then holding it still is what a player does, and it turns the same
  measurement from "no ringing at all" into ten direction changes over 0.68 s.
- **`getWorldMatrix()` short-circuits on the render id, and *reading* it stamps that id as
  a side effect.** The first half is the obvious one: step the solver from the console
  without rendering and every derived reading -- tip position, tip speed, absolute positions
  -- freezes at its first value, because the matrix is only recomputed when the render id
  changes, so whole sweeps come back as exactly 0.0. Force `computeWorldMatrix(true)` on
  every node you intend to read.

  The second half is the one that has cost the most, three separate times. Whoever reads a
  node first in a frame gets a fresh matrix and **silently converts every later reader that
  frame -- including a person measuring from the console -- into a reader of that first
  sample.** With the control loop at 240 Hz against a 60 Hz display, a per-substep reader is
  always first by up to three substeps. On the Warrior the symptom was a clean nine per cent
  regression in the weapon, in a build where the physics was provably bit-identical: peak
  anchor-to-hand error read 273.84 mm against a true 242.88, with tip speed and elbow drift
  shifted to match. The tell was a rest-pose error that neither decayed nor responded to what the
  arm had been doing, which is not a physical offset. `Golem.observe` and `Golem.describe` in
  `src/golem/golem.ts` therefore read `mesh.position` and `mesh.rotationQuaternion` and nothing
  else: every golem body is a scene-root node, so those two fields *are* the world transform,
  Havok's `syncTransform` writes them at the end of every solver step, and reading them stamps
  nothing. `nothing a golem publishes reaches the world transform through a world matrix` in
  `tests/golem-bench.test.mjs` pins it by reading the source under `src/golem/` and
  `src/bench/`. Anything added there that goes through `getWorldMatrix()`, `absolutePosition`
  or `absoluteRotationQuaternion` is wrong and that test will say so.
- **The whole simulation graph runs headless under Node, and the recipe is not obvious.**
  `NullEngine`, then a `Scene`, then `attachPhysics(scene, havok)` exactly as `arena.ts`
  does. **Havok's wasm must be handed over as bytes** -- its emscripten glue calls `fetch()`
  and Node cannot fetch a `file://` URL, so `locateFile` does not save you:
  `HavokPhysics({ wasmBinary: await readFile(".../HavokPhysics.wasm") })`. Step with
  `scene._advancePhysicsEngineStep(1000 / 60)`, the millisecond-valued call that runs
  Babylon's fixed sub-step accumulator and notifies `onBeforePhysicsObservable` before each
  solver step, which is where the control loop hangs -- it is the *only* correct way to
  advance without rendering. Advance `scene._renderId += 1` once per simulated frame, or
  every matrix the arm reads freezes at its first sample (see the trap above). Measured at
  about 39x real time for a full two-fighter bout. This is why the `?url` wasm import lives
  in `arena.ts` and `physics.ts` exposes `attachPhysics(scene, havok)`: `?url` is a Vite
  spelling that Node's resolver rejects outright, and one line of it at the top of the module
  every hittable thing imports took the whole graph out of Node's reach.
- **A blade that is *struck* goes far faster than one that is driven, and a peak that does
  not say which it is means nothing.** Two exclusions are mandatory for any tip-speed
  reading. The first 0.6 s (`BENCH_READOUT.startupExclusionSeconds`), because an arm is built
  hanging straight down and has to be driven onto its commanded pose: the Warrior's anchor
  keyframed there on the very first control step, a snap worth **77 m/s** in a fighter that
  never swung, and a golem arm ramps there over `CHAIN_REACH.acquireSeconds`. And a
  quarter second after any contact: blade on blade, a glance off a body, or a dropped sword
  hitting the floor all spin the blade past anything a motor could do, measured over
  **100 m/s**. Related: **a swing measured from rest is a floor on a swing measured in
  flight, not an estimate of it** -- the swinger's commit stroke peaks at 22.2 m/s from a
  settled chamber and at 40 as the fourth leg of a running cycle.

  **A golem stroke needs a third window of the same idiom, and it is not a tip-speed one.**
  `BENCH_READOUT.strokeExclusionSeconds` is 0.5 s, and what it protects is the *stuck* readings --
  the tip-to-command lag and the anchor stray -- rather than the peak. A stroke does not stop when
  its last phase does: the follow phase deliberately drops the drive's force ceiling so the limb
  leaves its anchor, and measured, the cut's stray peaks at 387.3 mm during the phase *after* the
  one it runs in and is back under a millimetre 0.42 s after the follow ends. Take a lag reading
  inside that and you have measured a follow-through and called it a limb hanging up. The whip is
  where the windows and the subject collide: a lash long enough to be interesting touches the floor
  at rest, one contact per step would exclude every reading of it, and that -- rather than taste --
  is what bounded the lash's length.
- **A green test can assert nothing, and that is the worst defect this directory
  produces**, because it is invisible by construction. The only way to know a test is not
  that is to mutate the thing it is about and watch it go red. Doing so has already rewritten
  four assertions here that were satisfied by their own setup, and caught a `handover` test
  that passed against a deliberately broken cursor inverse -- the aiming envelope is
  asymmetric (azimuth runs -1.15 to +1.30), so the correct inverse and the plausible one that
  divides by a single half-range **agree exactly for a positive azimuth**. Sample both sides
  of centre. The repair put every jump assertion in that suite in a pair with its unseeded
  control beside it.

  **Two further shapes, both found by review and never by the suite**, in one session:

  - **A test asserting a few leaves of a record it claims to be about.** "Goes inert" read 2 of
    19 command leaves, and a handless branch that turned, crouched and thrust with the off hand
    would have passed it; "no hand slot is written" read three booleans. **Assert the whole
    record against a fresh one** -- `assert.deepEqual(command, freshIntent())` covers every leaf
    at once and grows with the command, which a list of field names does not.
  - **A fixture that cannot exhibit the defect.** A schedule/mask agreement test ran 48 solver
    steps per cell on real published bodies -- careful, expensive, and structurally blind to its
    own subject, because the two sides diverge only when a hand comes off. An intact body cannot
    show a capability-loss bug however real it is. **Choose the fixture by what the defect needs,
    not by how faithful the fixture is**: take a real publication and make one stated edit to it,
    such as severing a hand, rather than inventing a whole record. `fixtureOf` in
    `tests/golem-mind.test.mjs` and in `tests/tactics-v4.test.mjs` does that. `publishedFixture`
    in `tests/fixtures/view.mjs` was written for it and has no caller: it throws on every current
    golem publication, because that file's `BODY_FIELDS` lacks the `effectors` and
    `capabilities` fields a golem's view now carries. Do not clone a live view with
    `structuredClone`: Babylon's `Vector3` keeps `_x/_y/_z` behind prototype accessors, so a
    cloned point reads `undefined` from every `.x`.
- **`PhysicsViewer` leaks constraints across a toggle, and `hideConstraint` corrupts its own
  list.** `dispose()` hides impostors, bodies and inertia meshes and never touches
  `_constraints`, so a shown constraint left in place at toggle-off leaks its meshes *and*
  its before-render sync, once per toggle, forever. And `hideConstraint` splices the entry
  out and then *also* swaps what it thinks is the last entry into the hole it just closed,
  overwriting a live neighbour with `undefined` unless the entry removed was the last one.
  The Warrior's `src/rigview.ts` therefore took constraints down from the end, by hand, before
  disposing, and rebuilt the whole set rather than differencing it. Also: the constructor's third
  parameter defaults to the **shared** `UtilityLayerRenderer.DefaultUtilityLayer`, and a
  default parameter only fires for `undefined` -- pass an explicit `null` to make the viewer
  build and own the layer its `dispose()` will take down.
- **Stopping input is not pausing a physics game.** Stopping controls alone leaves a keyframed
  body -- a golem's pelvis, chassis or yoke -- carrying the velocity its last target gave it.
  `pauseHost` in `src/host-run.ts` therefore disables scene physics before it pauses controls,
  and `resumeHost` enables physics immediately before controls. The render loop still paints the
  frozen frame; damage-feedback particle update speed (`DamageFeedback.setPaused`) and every
  game-time notice (`advanceActiveHostTimers`) are frozen separately because both otherwise
  advance from presentation work outside the solver.
- **A screen inferred from a state machine changes when the state machine does, and nobody
  wrote that transition.** `showCurtain(show: boolean)` derived which curtain you were
  looking at from `state.phase === "select"`, so a *pause* was the setup screen with two
  blocks hidden by a class. The moment anything moved the phase -- and the sixty-second bout
  cap moved it, on its own, under a fight somebody was still having -- the pause silently
  became the character pickers over a live arena, with the only button on offer wired to
  dispose both fighters. The resume branch was `phase === "fight"`, so from there the key
  was dead for the rest of the session. Two bugs, one report ("pause doesn't un-pause, the
  game is gone"), and one cause. The first repair made the curtain screen an explicit
  argument, but it still covered the evidence when a screenshot tool took focus. The
  current boundary is `ArenaPresentation`: setup owns `#curtain`, pause owns the compact
  sibling `#pause-menu`, and neither method can toggle the other's target. A decided bout adds a
  third sibling, the verdict bar `#bout-end` (Replay, Random replay, Setup), which `main.ts` shows
  from `state.phase === "over"` and which touches nothing but itself. The rule remains
  `pauseAction` in `bout.ts`, and **a key that pauses must never also be the key that leaves
  for setup.**
- **Pause does not grant UI permission.** The Arena diagnostics disclosure is player-owned state.
  Opening its large `<details>` panel on a pause edge covered the exact frozen frame pause exists
  to inspect. Pause may expose only the already-committed compact `#pause-menu`; it must not open,
  close, expand or navigate any other surface.
- **Pause freezes game authority, not the camera.** A frozen arena exists to be inspected. Keep
  middle-drag orbit, Shift+middle-drag pan, wheel zoom and camera mode/bearing keys live through
  `Controls.pauseCombat()`, and keep camera placement plus room occlusion after `runHostFrame`'s
  simulation gate. Putting them back inside the active callback recreates a view the player cannot
  reframe for a screenshot.
- **A constant tuned for the bench does not become a player's by being in `config.ts`.**
  `bout.capSeconds` was 60 and every word of the argument beside it was about running a
  hundred bouts headlessly at 250x real time. Nothing in it was about somebody at a
  keyboard, and against a policy that does not close, sixty seconds is a fight interrupted
  rather than a fight finished. It is the page's 600 now, and a harness cap is its caller's:
  `runBout` in `tests/harness/bout-runner.mjs` sets none of its own and falls back to
  `capSeconds` when no `maxSeconds` is passed. When a number's justification names a harness,
  check which harness is about to read it.
- **Most of `src/` is imported directly by Node** in the test run -- `scoring.ts`, `config.ts`
  and `buttons.ts`, and everything a body, a mind, a bout or a harness pulls in -- so relative
  imports there carry explicit `.ts` extensions. Vite does not care; Node's ESM resolver does.
  The page entries and presentation modules no test loads (`main.ts`, `input.ts`, `hud.ts` and
  the like) are the ones that omit them. `buttons.ts` imports nothing today, which is
  the only reason it does not show one -- give it an import and it needs the extension. The
  same graph carries a second constraint: **Node runs a `.ts` file by stripping its types,
  and strip-only mode rejects TypeScript parameter properties** --
  `constructor(private readonly scene: Scene)` fails to parse with "TypeScript parameter
  property is not supported in strip-only mode". One of them anywhere in what a harness
  imports blocks the whole harness, so those files use fields and assignments instead.
- **A hand-written `FighterView` has to carry every field the real one does.** There are three
  whole ones in the tree -- `facing()` in `tests/minds.test.mjs` and the `view()` helpers in
  `tests/options.test.mjs` and `tests/recorder.test.mjs` -- plus the partial `handsView` in
  `tests/human-ownership.test.mjs`, and all are plain JS, so none is a compile error when the
  view grows a field. The two that existed the day it grew `hands` both threw on the first
  substep, twelve tests and the whole bench at once, with a `TypeError` that names the policy
  rather than the fixture. The three whole ones are built through `assertCompleteView` in
  `tests/fixtures/view.mjs`, which checks them against that file's hand-kept field lists, so add
  a field to the view and to those lists together. `self: {` does not find the recorder's; grep
  for `assertCompleteView`, `FighterView` and `handsView` instead. Those lists are checked only
  against the hand-written views, never against a real publication, and they already lack two
  fields a golem publishes (see `publishedFixture` above).
- **A fixture may simplify the world; it may not describe one that cannot exist.**
  `Golem.describe` fills `BodyView.shoulder` from the primary hand's socket, so a fixture
  where those two disagree is arguing with a body the arena would never hand a policy.
  `facing()` in `tests/minds.test.mjs` hangs *both* hands off one shoulder -- a stated
  simplification, and the reason it cannot see the "aim from your own socket" rule at all. That
  rule can only be checked on a view where each hand's `shoulder` is its own socket, as it is in
  a real publication.
- **A feedback loop against the arm winds up.** The arm follows a commanded pose with real
  lag, so a controller that reads the achieved pose, takes the error and steps the command
  toward it will run the command past what the arm can reach and sit on the limit: measured,
  237 of 420 steps pinned at the wrist stop with the hand 137 mm off its own anchor. If a
  policy needs a pose held, prefer a constant chosen from a sweep -- the placements here are
  defined relative to the thing being covered, so what looks like it needs tracking usually
  does not.
- **A view field with no reader is a field that will drift.** `HandView` shipped three of
  them for one session's servo and they went out with the servo. `WEAPON_KINDS` sat unread
  for two sessions and is the reason the rule is written down at all.
- **A command channel with no writer is a button a person cannot press, and it looks exactly
  like a body that does not work.** Session 17 gave a natural striker its own `Intent.natural`
  because a body whose weapon is its own head was being driven through a hand slot it does not
  have. The body side moved onto it, a mind wrote it, every test drove it -- and the *host* side
  was left behind: `Controls.state.natural` was initialised in the field list and never assigned
  again, and `splitMind` took `natural` from the policy, so even a written one would have been
  discarded. A person can take either side whatever the body, so somebody could take a
  head-butting golem, walk it around, and find the attack button dead. This is the same shape as the unread-field rule above, pointed the other way: a field nothing *writes* is
  as broken as one nothing reads, and it is harder to see because the type checks and the tests
  that drive it by hand all pass. `applyButtonPose` in `src/buttons.ts` owns the mapping now --
  one press onto the acting hand and the natural striker together -- because `input.ts` cannot
  be loaded by Node and a rule written there is a rule no test can reach.
- **`Combat.log` keeps the newest 24 entries.** A bout produces hundreds, so a total summed
  from it at the end is not a total, it is the last second and a half. Accumulate from
  `lastHit` per step instead, keyed on `at`.
- **A mutation battery poisons the dev server that is watching the tree.** Vite caches a
  transform per file and invalidates it on the watcher's event. A script that edits a source
  file, runs a test and restores it in a few milliseconds can leave the *mutated* text in
  that cache -- and the owner's server on 5180 goes on serving it, through a reload, with no
  error anywhere. It cost a session's visual check: the Warrior's `Arm.strikeReach` returned the
  right number while its `Fighter.describe` published `reachNeutral`, because `fighter.ts` was
  the mutated module and the Warrior's `src/arm.ts` was not. **After running mutations, before
  believing anything in the page, fetch the modules you changed and grep the served text** --
  `await fetch("/src/golem/golem.ts").then(r => r.text())` -- and re-touch any that come back
  stale. Do not restart the server to fix it; it is not yours. Note the served text is
  esbuild's output, so match on a distinctive identifier rather than on your own formatting.
- **Line endings: measure what is committed, not what is on disk.** This clone gets
  `core.autocrlf = true` from Git for Windows' system gitconfig
  (`git config --show-origin core.autocrlf` says so); the repository sets nothing itself and has
  no `.gitattributes`. Under that setting the working copy is not the committed file: a file
  committed with LF may sit on disk as CRLF, LF or a mix, depending on what last wrote it, and git
  turns it back into LF on commit. So `grep -c $'\r'`, or anything else that reads the working
  copy, is not a line-ending check -- one such reading sent a file through a needless CRLF
  conversion and a 292-line diff on a four-line change. The exception is a file whose committed
  blob already contains a CR: git converts it in neither direction and stores exactly the bytes
  written, so an edit there must match the endings of the region it touches, and a tool that
  rewrites the whole file with one ending converts all of it. On a machine with
  `core.autocrlf = false`, every file behaves like that exception. List the committed text files
  that contain a CR:

  ```bash
  git grep -Il '' HEAD -- . | sed 's/^HEAD://' | while read -r f; do
    c=$(git show HEAD:"$f" | tr -dc '\r' | wc -c)
    if [ "$c" -gt 0 ]; then
      printf "%-40s cr=%s lf=%s\n" "$f" "$c" "$(git show HEAD:"$f" | tr -dc '\n' | wc -c)"
    fi
  done
  ```

  and gate the commit on `git diff --numstat` being identical to
  `git diff --ignore-cr-at-eol --numstat`: any file where the two disagree has had its endings
  rewritten.
- **A caller holding its own copy of a rule is the same defect as a missing table row, and
  is much harder to see.** `combat.ts` skipped the damage model for a contact below
  `minCutSpeed` -- a real optimisation, worth having -- and that is the *blade's* number.
  The club's own lower floor therefore never ran in a fight for the whole of the club's
  life, while passing its unit test the entire time. If a module owns a rule, it owns the
  cheap early-out for that rule too; export the predicate rather than letting the caller
  approximate it.
- **`rollForStroke` folds its answer into +-pi/2, and that fold is a claim about the
  weapon.** It is right for a double-edged blade, where `roll` and `roll +- pi` are the same
  cut, and exactly wrong for anything single-bitted -- where its tie-break picks the poll,
  and measured, picked it for both policies and both hands every time. It takes a
  `bothEdges` argument, defaulted to the blade's answer. Any new stroke has to pass
  `cutsBothWays` of what the hand is actually holding.
- **A view field with no reader and a view field with no reader *yet* look identical.**
  `HandView.reach` was removed one session for having none and put back the next, because
  the weapon that needed it did not exist yet. The rule about unread fields is still right, but
  before deleting one, try to name the reader that is coming. If you can, leave it and write the
  name down.

- **A `PhysicsShapeContainer`'s collision filter does nothing at all.** Havok filters on
  the **leaf** shapes; setting `filterMembershipMask` on the container writes to the
  container's own shape, which nothing consults, and *reading it back hands you garbage*
  -- a shape set to 8 returned 383476. Every Warrior weapon had its layers set that way from
  the day its file was written, so **for its whole life a weapon collided with
  everything**: measured on one fighter swept through its envelope for twelve seconds, the
  sword logged 1687 contacts against its own upper arm, 1572 against its own forearm, 853
  against its own torso and 795 against its own shield, and the shield logged 985 against
  its owner's head and 725/669 against its owner's two arms. That last one was the
  expensive one -- a shield's own forearm sat inside its stand-off by construction, so
  that was permanent contact between a 4 kg lever and the chain driving it, which is the
  exact failure the four-layers-per-side table was invented to prevent.

  It hid because the symptom is **friction, not a hole**: an arm that tracks its anchor a
  little worse than it should, in a prototype whose whole subject is how well an arm tracks
  its anchor. Every golem and human part is a single leaf shape and never a container, so its
  mask goes on the shape Havok consults. The filter is read back through
  `collisionFilterIsExact` in `src/physics.ts` on every part of an assembled default golem
  (`every_golem_part_is_filtered_on_its_own_leaf_onto_one_of_the_two_golem_rows` in
  `tests/golem-arena.test.mjs`) and on every registered effector's parts
  (`tests/golem-bench.test.mjs`); `writeCollisionFilter` beside it writes a compound's leaves.
  **If you add a compound body, set the filter on its children.**
- **`setTargetTransform` is not a teleport for a DYNAMIC body.** It is the *target* of a
  keyframed one and against a dynamic body it does nothing: six shots nominally from one
  origin ended at -6.63, -12.19, -4.35, -9.94, -1.93 and -7.66, because the body carried on
  from wherever the last one left it while `mesh.position` was being overwritten from it
  every step. Write the transform node and set `body.disablePreStep = false`, which is
  `PhysicsPrestepType.TELEPORT` under a boolean's name; a hundred launches then land at the
  same place with spread **0**. Put the flag back up one step later -- and note that "one
  step later" has to mean *after* a solver step has run, so the code that lowers it must
  run **before** the code that raises it in the same control step. The Warrior's quiver was
  stepped as the first line of its arm's update for that reason.
- **Two watchers on one body, and the order they were added in decides the outcome.**
  The Warrior's `Arrow` watched its own collisions to know it had struck, and `Combat` watched
  the same body to score the blow. `Arrow`'s observer was added first -- in its constructor,
  before a fighter existed to be handed to a `Combat` -- so setting "spent" inside that callback
  marked the arrow spent *before* the watcher that scored it ran, and **every arrow in the
  game scored nothing**: 0 of 288 over twelve bouts, with no error anywhere and a flight
  that looked perfectly healthy. Set a flag in the callback and promote it on the next
  control step; then neither watcher needs to know the other exists.
- **`velocityAt` is the right question for a blade and the wrong one for a projectile.**
  `linear + w x r` is what a sword's contact point actually moves at, because the rotation
  is the arm's and is there before the contact. An arrow has no rotation in flight, so any
  `w` at the contact was put there *by* the contact, and over a 0.36 m half-shaft that is
  tens of metres a second. Fired at 48 m/s into a keyframed slab, the three readings were:
  body's linear velocity **38.4**, last control step **48.0**, `linear + w x r` **5.6**.
  The last is what the damage model was being handed, and it did it *consistently* -- a
  tight band around 27 m/s, which is the shape of a systematic error rather than of noise.
  The repair cached the arrow's free-flight velocity each control step and scored from that,
  and a projectile added to `Combat` has to do the same.
- **Havok's inertia is per kilogram, and its linear velocity belongs to the centre of mass.** Both
  read like the textbook quantity, and neither is.
  - `getMassProperties().inertia` and `setMassProperties({ inertia })` carry the tensor **divided by
    the body's mass**: the solver turns a body as if its inertia were `inertia * mass`. So every
    floor written against it is per kilogram, whatever its comment says. That covers
    `CHAIN_REACH.jointInertiaFloor` (commented "0.30 kg m²"), `HUMAN_ARM_DRIVE.inertiaFloor`, and
    `castToCarried`: its argument is named `inertiaKgM2`, is the terminal's per-kilogram figure, and
    is applied to a ring of a different mass. Each value was tuned against the solver, so the numbers
    are right and the units in their names are wrong.
  - A model that takes that field as kg m² reads a turning part as lighter than it is.
    `src/body-inertia.ts` multiplies by the mass. With that factor, it agrees with the Node impact
    bench's edge tap within 5 %.
  - `getLinearVelocityToRef` is the velocity of the **centre of mass**, but `getObjectCenterWorld`
    is the transform node's position, the geometric centre. `linear + w x r` with `r` taken from
    the latter was off by `w x 0.104 m` on a turning mace. A tap on its edge read 0.875 kg, against
    the 1.07 kg that the rigid-body formula gives (Node impact bench).
  - `RigidStrike.centreOfMass()` reads the local balance point once, at construction, and places it
    from `mesh.position` and `mesh.rotationQuaternion`. Only a part whose centre of mass is off its
    middle shows the error: today the mace and the maul.
- **`getLinearVelocityToRef` is not allocation-free, and the name is why this has now cost
  two sessions.** The obvious reading of `ToRef` in Babylon is "the version that does not
  allocate", and for `getObjectCenterWorldToRef` it is true -- that one copies
  `transformNode.position` and never crosses into the plugin at all, 0.1 B a call. The two
  velocity readers do cross: `HavokPlugin.getLinearVelocityToRef` reads
  `this._hknp.HP_Body_GetLinearVelocity(pluginRef.hpBodyId)[1]`
  (`node_modules/@babylonjs/core/Physics/v2/Plugins/havokPlugin.js:1210`), and the
  emscripten glue builds a fresh JS array per call. **The `ToRef` saves the destination
  `Vector3` and nothing else.** Measured on 9.18.1: **216 B/call** linear, **184 B/call**
  angular, against 0.1 for the object centre.
  Session 16 planned a per-frame publication on the premise that the `ToRef` pair was free,
  and shipped an `observe` that read velocities eight times where four had been read
  before -- a bare-handed fighter went from allocating nothing per view to about 1.6 KB a
  step at 240 Hz. So: **the budget is the number of boundary reads, not the number of
  `Vector3`s**, the cheap direction is to ask once and derive every consumer from that
  reading, and a point that coincides with the body's own centre needs no angular read at
  all because `w x 0` is zero. `refreshRoot` in `src/golem/locomotion/biped.ts` is the pattern:
  one velocity read per substep, which every sample then reads back. No test counts the plugin
  calls a publication makes, so a reader added to `Golem.describe` goes unnoticed unless someone
  measures it. `describe` already makes one `velocityAt` call per live hand, on that hand's first
  striker, and each call is one linear and one angular read.
- **Do not infer an event from a side effect that has a second cause.** Three probes in one
  session disagreed about the Warrior archer's rate of fire, because each watched something
  that goes up when an arrow is loosed: the count of live arrows (also moved when one was
  culled), `live` going true (missed a *recycled* arrow, which went live->live), and the
  age resetting (`Arrow.step` also reset `age` when a shot **struck**, so every hit read
  as a new shot). The age watcher was the worst: it reported 16 shots in 20 s of which 12
  left the string at under 4 m/s, which looked exactly like a broken draw and was a broken
  probe. Wrapping `Quiver.loose` itself settled it in one run: 96 calls, **every one at
  48.0 m/s**, one every 1.25 s. When a measurement is surprising, instrument the *call*.
- **A bout ends on a fatal part or an empty bar; severing is not required.** `beaten()` in
  `src/bout.ts` is true when any part flagged `fatal` is severed or at zero health, or when
  `vitality()` -- one weighted reading of every part's wound -- reaches zero. So any weapon that
  does damage can win by wearing the bar down. Which parts are fatal is data each module
  declares (`GolemPart.fatal`), not a rule in `beaten()`: today the head module's head (not its
  neck) and the carrier part of each locomotion module (the biped's pelvis, the multileg's
  chassis, the wheel module's yoke).
  Two consequences of the bar's arithmetic are easy to miss. A part's wound stops counting once
  that part is at zero, so more damage to an emptied limb that is still attached is wasted. And
  `Golem.scaleVitality` rescales every part's weight so the weights sum to
  `GOLEM_ASSEMBLY.vitalityTotal`, so any part carrying at least `1 / vitalityTotal` of that sum
  ends the bout through the bar alone when emptied, whether or not it is `fatal`.
- **Babylon removes observers asynchronously.** `Observable.remove` and `removeCallback`
  mark an observer `_willBeUnregistered` immediately, then splice it on a zero-delay timer.
  A lifecycle census taken synchronously after disposal must count active observers rather
  than the raw backing-array length, or every correct removal looks like a leak.
  The rebuild-lifecycle audit learned this while auditing 25 rebuilds; it still catches a
  genuinely live callback because marked observers no longer participate in notification.
- **Havok's private constraint-to-body map is a debug history, not a live-resource census.**
  Version 9.18.1 adds entries in `initConstraint` but does not remove them in
  `disposeConstraint`, even though the native constraint is disabled and released there.
  `twenty_five_golem_rebuilds_return_every_counted_resource_to_baseline` in
  `tests/golem-arena.test.mjs` therefore wraps those two plugin calls and balances the actual
  `_pluginData` IDs; reading `_constraintToBodyIdPair.size` would report a leak forever.
- **General self-collision is not a physicality fix for a driven articulated body.** Adjacent
  capsules overlap at their joint seams by construction, so turning every owner pair on makes the
  motors buzz against their own anatomy. The opposite failure is just as misleading:
  `selfCollisionCount === 0` proves nothing about pairs the filters never admitted. Two earlier
  bodies -- the Warrior and the construct trees, both since deleted -- used three narrow
  boundaries instead: anatomical controller limits (an impossible strapped-shield command
  was reflected to a same-side carry and its wrist turn reversed), pair-atomic planning plus
  command-volume clearance for an owner's sword and shield, and authored mount clearance
  validated through the live articulation envelope. Two broader fixes were tried there and
  rejected: a generic mount-versus-own-trunk layer changed the Warden's established dorsal-yaw
  contact into a dorsal-pitch hit, and a hidden shield leaf changed mass, inertia and debris.
  Reparenting the Arbalest bearings onto a new brace made a clean-looking mount that could no
  longer aim. For mounted hardware, prove bind clearance and live clearance in both mirrors while
  preserving the established aiming chain.

**The next three entries are what the golem work paid for**, 2026-09-04 to 2026-09-05.

- **On a low-axis chain the anchor's *rate limit* shapes a commanded move and its force ceiling
  does not, and a hand rate is not a tip rate.** Both halves were got wrong at once by scaling a
  humanoid arm's numbers. Swept over 1400 N to 14000 N on a 29.5 kg chain, every figure of an
  ordinary move stops changing above about 3900 -- 8.71 m/s of peak, 59.9 mm of lag and 11.605 mm
  of wander read identically at 3900, 9000 and 14000 -- so a force ceiling chosen for authority is
  a number with no reader. The rate is the opposite: 6 m/s **at the hand** is about 34 m/s at the
  tip, because the point sits 1.52 m from the socket against the hand's 0.72 and the forearm turns
  about the elbow as well, and the guard raise duly peaked at 34.46 m/s until the rate came down
  to 1.2. If a limb reads as a teleport, look at the rate limit and at the lever between the
  driven point and the measured one, not at the torque. (One row of that force sweep reproduces as
  an outlier 4 times out of 4 -- 6000 N gives 1704.9 mm of lag where 5000 and 7000 give 59.9 --
  and has never been explained.)

- **A collision filter that forbids a pair also forbids every piece of evidence that the pair
  would have been bad.** The counterpart of the container-mask trap above, and it bit the golem's
  plate. A golem's parts are on layers that cannot touch each other, so nothing in the solver will
  ever report a board inside its own torso; a self-contact count of zero is a check that no pair
  was admitted by accident and is not a clearance measurement. The only way to know was to sample
  the board's collider corners from `mesh.position` and `mesh.rotationQuaternion` against the
  trunk's box over a driven sweep, and at a held shield's proportions that came back **-127 mm** --
  a quarter of the board inside the body, silently, through every green test. What it cost: the
  board is smaller than it was drawn, it gives up 0.97 rad of the wrist's 1.57 rad of flexion, and
  pushing it further out along the limb *deepened* the intrusion to -200 mm because that lengthens
  the arm the bend swings it through. If a layer table exists to prevent a pair, the geometry that
  pair would have reported has to be measured some other way or it is not measured at all.

- **A comment can be wrong about a code path in a way no test will ever catch, because it is a
  claim about behaviour rather than behaviour.** A golem row asserted that `defaultPolicy:
  "golem-duelist"` meant a corner that becomes a golem opens on a body that fights. It does not:
  `withUnit` in `src/bout.ts` treats a policy as a saved user choice and never installs a unit's
  default -- which that function's own comment says in as many words -- and the field is only the
  fallback in `unitDefinition().build` for a caller that names no policy. It was found by driving
  the setup screen and noticing the picker still said `idle`. Nothing in 642 tests would have
  caught it. The rule that follows is the green-test rule pointed at prose: **a sentence about a
  code path is asserted by executing the path, and until somebody does, it is a hypothesis with
  good formatting.**

- **A material with a texture that will not come ready is a mesh that is not drawn.** Four CC0
  tiling normal maps were once wired into the palette and every material carrying one
  disappeared. `surface()` in `src/surface.ts` builds the fallback colour first and attaches
  each map only from its decode-success callback, so failure leaves a drawable mesh. A diffuse
  map **multiplies** `albedoColor` rather than replacing it, which is why `surface()` sets the
  colour to white when the albedo map decodes: the descriptor's colour is the fallback, and left
  in place it would darken the image.
- **A reading is only comparable with another taken in the same harness.** The page -- the arena
  or `/bench.html` -- and the Node harnesses under `tests/harness/` agree on converged behaviour,
  but **disagreed by about 9 % on the Warrior arm's peak transient with identical code** --
  264.97 mm against 242.88 -- and why was never established. Solver ordering, solver islanding,
  the render id and the `Mind` seam were each tested and eliminated; the remaining suspects are
  what else the page has in the scene. Neither harness is wrong. Putting a page reading and a
  Node reading in one column is, and it has already produced a regression report about a build
  where nothing had changed. Name the harness in every figure you record.
- **A golem bout in the headless harness must pass `locomotionMode: "supported"`, and the pair
  step throws if you forget.** `createBout` in `tests/harness/bout-runner.mjs` leaves it
  undefined, and only `"supported"` makes it build the one flat world registry both corners must
  share. Without it each golem's locomotion module builds a registry of its own, and
  `resolvePhysicalSupportedPair` in `src/supported-locomotion-production.ts` throws "supported
  pair must share one world-query registry" on the first step, which is the good failure: a
  forgotten line cannot produce a quietly wrong number.
- **A uniform mass scale does not size a force, because one mass in the arm refuses to
  scale.** `SHIPPED_MASS_SCALE` at the head of `src/golem/config.ts` is 0.162 and `kg()` wraps
  every mass derived as volume times 2600 kg/m3. **`TERMINAL_BLADE.mass` is 1.30 kg and is
  deliberately not wrapped** -- an arming sword already weighs what an arming sword weighs -- and
  it is about a third of what the hand holds. So "the arm lost five sixths of its mass, scale its
  forces by 0.162" is false, and on 2026-09-18 it was applied to five constants before anybody
  noticed: `STROKE_INERTIA.ref` (in `src/golem/tactics.ts`), `CHAIN_PITCH.motorTorque`,
  `CHAIN_REACH.anchorForce`, `ANCHOR_DRIVE.linearForce` and `CHAIN_WRIST.rollTorque`/`bendTorque`.
  The blade is the *only* such exception -- the legs, neck and waist hold nothing that refuses to
  scale, and their tables were left alone correctly -- so the rule is narrow and it is entirely
  about the arm.

  **Size a force off the arm rather than off the scale.** `CHAIN_REACH` has since lost its
  `anchorForce`; each of the other four carries its own derivation in its own doc comment, and
  `linearForce`'s is "850 N per the Warrior's 6.50 kg of arm and sword, times whatever the Node
  bench prints for this chain", which run unchanged gives 854 N. The bench prints the driven mass
  (`runGolemBench(...).massKg`) for exactly this purpose.

  **Since 2026-09-24 the stone body is not on `kg()` either.** Its trunk, pelvis, legs, head, wheel,
  multileg and the bench's ride block are on `bodyKg()`, at `STONE_BODY_DENSITY` (1300 kg/m3), which
  is 3.086 times `kg()` (`BODY_OVER_SHIPPED`). Every torque that moves those parts goes through
  `onBody()` by the same factor, and the arm links and items stay on `kg()`, so that an arm
  cannot lift a body its own size. So the body's legs, neck and waist tables *were* rescaled, by
  the factor their own parts grew, which is this rule applied rather than broken. The human and the
  skeleton pin the shipped values they inherit from stone, because their masses did not move.

- **A conclusion is void if the thing it was measured against has since been corrected, even
  when the number it picked was right.** Three tables in `config.ts` were swept twice on
  2026-09-18 and `CHAIN_REACH.anchorRate` three times. Its second take reasoned "a force scaled
  with the mass it moves leaves the acceleration alone, so the rate is the rate it was" -- and the
  force had not been scaled with the mass it moves. The third sweep put it back at 5 with a
  measurement. **Re-deriving a value that does not move is not wasted work**, because what is
  being kept in the file is the argument and not the digit.

- **The fight columns and the bench columns disagree, and the bench is the one to believe.**
  Raising `CHAIN_REACH.anchorRate` improves every bout-level number -- fewer contacts, a larger
  share of them real blows, a higher closing speed -- monotonically, past the point where the arm
  has stopped following its command at all. At rate 18 the driven anchor sat 217 mm from where it
  was sent and a blade tip peaked at 75.5 m/s. **A flung blade is fast, and fast is not the same
  as good at fighting.** `stroke stray` in the `reachRate` sweep is the column that catches it,
  and `tests/golem-bench.test.mjs` already refuses a cut that strays more than 50 mm from its own
  anchor.

- **Counts over a bout are not scale-free, and Phase 2 deliberately changes what a bout is.**
  Nine assertions across three test files went red on 2026-09-18 without anything breaking: floors
  like "100 contacts", "25 plate blocks", "20 second blows" and "the bout ran 13 of its 14
  seconds". Fights got shorter and cleaner -- which is the entire point of the phase -- so every
  count taken over one went down. Three repairs, in order of preference:
  1. **A rate**, if the floor is guarding against a bout that did not happen.
  2. **More bouts**, if it is a corpus for a per-event rule. `a_golem_stroke_claims_each_part_once`
     takes three seed pairs now; the honest answer to a thin corpus is more bouts, not a lower
     floor. Tag events with their bout -- `report.at` restarts at zero in each one.
  3. **`result.ending`**, if the floor spelt "the bout ran its cap" and meant "there was a bout to
     measure". That proxy only ever worked because nothing could win.

  And a fourth, which is not a floor at all: **a distributional claim pinned to one seed.** The
  skirmisher backs off more than the fencer on 7 of 10 seeds and by 1.50 pooled, and the single
  bout the test was pinned to is one of the three where it does not.

- **A bench that excludes a fixed number of steps is assuming a speed.** Two instruments were
  wrong rather than their thresholds on 2026-09-18. `peakGripStrayMm` excluded exactly one step
  after the maul's grip latches, because on a slow arm one step was enough for the solver to clear
  the violation the latch builds; on a corrected arm the latch fires 38.9 mm out and the clearing
  takes seven steps, so the bench reported the second of them as the joint's error. `parryProbe`'s
  2.0 s hold was too short for an arm with real authority to stop moving in -- its own
  `settleRippleMm` said so, and the *arrival* was the number that moved. **Prefer an exclusion
  that times itself** (wait for the error to stop falling) over one that counts steps, and when a
  reading depends on how long you watched, watch longer until it stops.

- **The carrier's gait is an ellipse, and a planner that checks a direction is checking one the
  body will not take.** `VirtualLocomotionCarrier.propose` scales each local axis by its own
  ceiling (ahead, back and to the side differ), so with the facing held away from the direction
  of travel, `composeIntent`'s forward/strafe split comes out a few degrees off the planned
  direction. On a corridor wall that is a move into the wall, and when a sweep refused the whole
  move, the hero stood there for the rest of the run: 19 of 21 classic seeds, while the one seed
  the test ran passed. `resolveGroupMoves` in `src/dungeon/locomotion.ts` slides the refused part
  along the wall, and `STALL` in `src/dungeon/run.ts` replans a leg the body has stopped on. Test
  navigation on more than one seed.

## House rules

Each one was paid for.

- **A policy plays with the controller a person plays with.** `Mind.decide` returns an `Intent`,
  and `Controls.state` is annotated as one -- so the person and the AI hand a fighter the same
  fields. Nothing may reach past it to set a joint angle, place a blade, or ask for a pose the
  solver would refuse a person. An AI that could pose the arm directly would be a different
  game's AI. **The command is not the controller**: `Intent` was once a type alias for the
  human's own `InputState`, so the mouse wheel's `zoom` was a field on every policy's command.
  Camera state -- zoom, orbit, pan -- lives on `CameraGestureState` in `src/camera.ts` and
  reaches no mind. The seam survives; the alias does not.

  **The field count used to be written here and kept going stale**, so it is not written here.
  `COMBAT_FIELDS` in `tests/fixtures/intent.mjs` names the set and is asserted against every
  producer of a command, which is the copy that cannot drift; mutating it turns several files
  red at once. The one place the two sides are not identical is a *narrowing* rather than a
  second field: `Intent.actingHand` is `HandName | null`, and `Controls.state` is
  `Intent & { actingHand: HandName }`, because a cursor is always on a hand and a set of jaws is
  not one.
- **Cosmetics never carry authority.** Anything purely decorative owns no collision and decides
  no hit.
- **The visible room is not the collision arena.** `src/arena-room.ts` keeps the ground and post
  aggregates in one owner and body-free dressing in another. A solid cosmetic below the
  conservative reach ceiling is refused unless it names an existing collider; distance beyond the
  slab is not safety, because a fighter can keep moving. Translucent scrims, flat floor markings
  and overhead beams are the explicit body-free cases. Do not bypass `validateRoomPlacements`
  with builder-local scenery.
- **No feel complaint is fixed by raising a motor ceiling without a measured before/after table
  beside the number.** The live ceilings are in `src/golem/config.ts` for the golem chains and in
  `TORQUES` in `src/golem/humanoid/arm.ts` for the human arm. Two golem ceilings break the rule
  today. `CHAIN_REACH`'s `yawTorque`, `shoulderTorque` and `elbowTorque` (720, 1200 and 720) have
  only a line comment. `HEAD_NECK.pitchTorque` is 100, while its doc comment's table picks 260
  and scales it to 42; the only argument for 100 is the line comment "A 42 Nm neck allowed 9.91
  degrees of head tilt". Measure either one before moving it, and write the table in when you
  do. `CONFIG.arm` in `src/config.ts` still carries the Warrior's arm numbers with their
  measurements, but nothing reads its motor fields (`linearMotorForce`, `wristMotorForce` and the
  like).
- **Every measurement names its harness**, for the reason in the traps above.
- **Commit each landable change as it lands.** The one question this tree could not settle --
  where the 9 % transient disagreement comes from -- needed two builds bisected, and neither had
  been committed. It is the cheapest rule here and the one that has already cost the most.
- **A change to shared execution-layer code gets a bout either side of it, and the null control
  is not optional because it is a null.** What `src/policies.ts` and `src/options.ts` both import
  from `src/action-primitives.ts` -- today `actionStrokeRoll`, `applyActionPosture`,
  `blankThreat`, `freshIntent` and `selectThreat` -- is the leak path. A change shipped green at
  474 tests once and moved a matchup by about 2.5 standard deviations, and nobody knew until the
  next session went looking.
- **Recovery cannot require the support state it exists to restore.** The controller of the
  construct trees (deleted, like the Warrior) required three planted contacts in its
  constructor, so a fallen mind selected `recover` forever and the scheduler refused it forever.
  The same holds for a golem: whatever lets a knocked-down carrier rise may not require the
  support that the knockdown took away. Other actions may keep that admission rule; recovery may
  not.
- **One worker realm runs one Havok arena at a time.** Havok's wasm state is realm-global:
  `Promise.all` over two bouts in one Node realm changes physical outcomes even when both scenes
  are separately constructed and disposed. Parallel work therefore needs isolated worker threads
  with a sequential loop inside each one: `runJobs` in `research/runner.mjs` gives each lane its
  own `Worker` and hands it one job at a time, and `research/worker.mjs` answers each job only
  when its bout is done. Do not replace a worker loop with async concurrency.

## Where the design lives

Beside the code it decides, first: the argument for a constant is its doc comment in `config.ts`,
with the table that chose it. `docs/` holds what does not belong to one file -- working plans in
`docs/plans/`, dated design analyses in `docs/analysis/`, and the standing notes
`docs/humanoids.md` and `docs/movement-stability.md`.

`src/config.ts` is the tuning surface a person reaches, and it is deliberately mutable: the arena
page exposes it as `window.__sword.config`, so `__sword.config.combat.hitCooldown = 0.2` takes
effect on the next contact. Nothing exposes `src/golem/config.ts`, where a golem's tables live --
not `__sword.config`, and not the bench's `__golem` -- so a golem number is changed in the file,
and the page is then navigated rather than trusted to HMR (see "Three ways to ask the wrong
question" above). Two kinds of motor ceiling live there. Most are handed over every substep: the
arm chain, the wrist, the torso's twist and lean and the neck pass their table's value to
`JointServo.track`, the human arm passes `TORQUES` to `JointActuator.drive`, and the actuator (both
in `src/golem/joint-servo.ts`) writes it to the joint, times the body's `MotorTone`, whenever that
product changes. The tone is full except on a body whose locomotion names a `fallenTone` -- today
the skeleton's -- while it is knocked down and rising; see `motorTone` in `src/golem/golem.ts`.
A number in a table is therefore the ceiling of a body on its feet. The rest are written at
construction: `CHAIN_PITCH.motorTorque`, the locomotion waist, and the legs and the wheel's
spin, which are rewritten on the edges into and out of a knockdown and never per substep. For
`src/config.ts`, tune from the console first, then write the number back into the file with its
table.

**There is one deliberate exception.** The option layer keeps its own frozen block --
`ACTION_TUNING` in `src/action-primitives.ts`, and `TARGET_SPAN_FRACTION` in `src/options.ts` --
and neither is reachable from `__sword.config`. `options.ts` may not import `config.ts` at all,
which `options_and_features_have_no_mutable_config_backdoor` pins by reading the source text: a
legality or aim rule a console command can move is a rule an artifact can be trained against and
deployed without. Both places say so in their own docstrings.

`src/scoring.ts` is the balance rule -- what counts as a cut, a thrust, or a clang -- kept pure
and free of Babylon so it can be argued with in `tests/scoring.test.mjs` rather than only by
swinging. Changes to how the game rewards a blow belong there, with a test.

**Name the construct; a line number is a fact with no test.** "`validateRoomPlacements` in
`src/arena-room.ts`" survives every edit above it and a bare `:93` survives only until somebody
adds an import. Prefer the name. When a line number is genuinely wanted, locate the construct the
prose names and refuse any target that is not unique -- never add the file's line delta, which has
produced wrong anchors here twice, once while repairing the very defect it introduced.
