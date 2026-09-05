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

**Two pages come up on that one server**, and both are named in `vite.config.ts` because Vite's
default input is `index.html` alone -- a second page that works in dev and is absent from `dist` is
a config failure wearing a routing failure's clothes. `/` is the arena; `/bench.html` is the golem
module bench, one module at a time on a fixed block.

Everything else `package.json` defines: `check`, `test`, `build`, `preview`, `measure`,
`asset:build`, `asset:review`, `asset:verify`, `asset:qualify`, `asset:dimensions`,
`texture:fetch`, `texture:verify`, `armour:fetch`, `armour:verify`, `armour:extract`. **Checked
2026-09-05**: every `npm run` command named anywhere in this file, `README.md` or `docs/design.md`
still exists, and no command is defined here that the manifest does not have. The forge, learning
and playtest commands went with their code on 2026-09-04 and no document still calls one.

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
  before each. Driving the arm from the render loop refreshes the keyframed anchor's target
  on only the first of them, so it coasts through the rest -- the arm wandered close to four
  metres from where it was pointed.
- **A sleeping body hides every steady-state defect.** Havok deactivates the arm at rest, so
  a measurement taken after it settles reads a perfect zero no matter how badly it shakes
  when awake. Force `pl.setActivationControl(body, 1)` before trusting any rest measurement.
- **A weld whose two frames disagree at construction is a violation the solver clears by
  flinging the thing.** Every weapon here was built in the fighter's frame and welded into
  the hand's, which for the sword was a half turn out; peak tip speed in the first fifth of a
  second of a fighter standing perfectly still was 48.3 m/s for the sword and 80.4 for the
  club. `weapon.ts`'s `mountRotation` builds each kind in the frame its own weld demands and
  those become 23.9 and 19.1, which is the arm lifting out of its build pose and nothing
  else. If you add a kind, build it through `mountRotation` -- and note that a bout's *peak*
  readings carry a frame-one flick forever, because a peak is a maximum.
- **A ternary chain with a default branch is not a dispatch table, it is a silent
  substitution.** `Weapon`'s constructor read `kind === "shield" ? buildShield : buildClub`,
  so any kind added to the union and to the picker compiled clean, passed `tsc`, passed the
  build, and shipped **as a club** -- which for a shield means a shield-shaped thing that
  scores crushing blows and severs limbs. It is a `never` default now
  (`weapon.ts`'s `unbuildable`), so a kind without a builder is a compile error. The same
  shape of hole is worth looking for wherever a union is switched on: `handsFor`, `mountFor`
  and `PARRY_LABEL` are the ones that existed, and only the last was already total.
- **A test helper that reconstructs geometry from `CONFIG` is pinned to one kind's geometry.**
  `tests/shield.test.mjs` sampled the plate by rebuilding the heater shield's rectangle from
  `CONFIG.shield` inline. Handed a buckler it would have gone on passing while sampling a
  440x600 mm patch of empty air where a 340 mm disc is -- a green test asserting nothing,
  which is the defect this file calls the worst one available. It takes the kind now.
- **A body built overlapping another on a layer that forbids the overlap deadlocks the chain
  driving it, and the symptom is a pose.** A shield stands 110 mm off the fist along the
  hand's +X, a hand is built in the torso's frame, so an off-hand shield was built inside its
  owner's pelvis. The contact pinned the arm at full extension before the anchor had lifted
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
  `vite build` are both perfectly happy. The symptom is that pressing `G` does nothing at
  all. Fourth member of the same family as the physics, shadow, outline and `Culling/ray`
  imports -- when a Babylon feature works in the playground and not here, suspect a missing
  side-effect import before suspecting the feature.
- **The glTF loader needs `@babylonjs/loaders/glTF/2.0/glTFLoader.js` imported for its side
  effect.** Fifth member of the same family, and the quietest: without it the costume simply
  never arrives, which is indistinguishable from a missing asset file, a failed fetch or a
  bad path -- and `src/figure.ts` is built to degrade to primitives on all of those, so the
  page looks *fine*. Nothing is logged and nothing throws. Five members of this family now:
  physics, shadow/depth/post-process, outline, `Culling/ray`, `edgesRenderer`, and this. When
  a Babylon feature works in the playground and not here, suspect a missing side-effect
  import before suspecting the feature.
- **A material with a texture that will not come ready is a mesh that is not drawn.** Four
  CC0 tiling normal maps were once wired into the palette and every material carrying one
  disappeared. The repaired pipeline builds the fallback colour first and attaches each map
  only from its decode-success callback; failure therefore leaves a drawable mesh. A diffuse
  map **multiplies** `albedoColor` rather than replacing it, so the neutral character albedo
  and the side tint are separate on purpose. Blender computes tangent space only for tris and
  quads, so `plate()` is triangulated before export and `check-warrior.mjs` requires tangents
  on every normal-mapped primitive. Imported tangents are normalized in `Figure.wear`;
  Babylon-built weapons use a separate material family with the Babylon-LH basis even when
  both families deliberately reuse the same pinned image file.
- **A carried mesh does not own its arena material.** Babylon's
  `root.dispose(false, true)` recursively disposes child materials and textures. That was
  harmless while every weapon died only with its scene, then failed as soon as one sword
  shared a real map with another: disposing the first removed the second's texture and left
  the shared-surface cache pointing at a corpse. `disposeCarriedRoot` always passes false for
  material/texture disposal; Weapon and Arrow own bodies and nodes, while the scene alone
  owns the palette. `shared_weapon_textures_survive_one_weapon_being_disposed` was watched
  fail against the one-boolean mutation.
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
  whatsoever. There is no error, no warning and no null. `src/blood.ts` carries the import
  and is the only thing in the tree that needs it so far.
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
  always first by up to three substeps. The symptom is a clean nine per cent regression in
  the weapon, in a build where the physics is provably bit-identical: peak anchor-to-hand
  error read 273.84 mm against a true 242.88, with tip speed and elbow drift shifted to
  match. The tell was a rest-pose error that neither decayed nor responded to what the arm
  had been doing, which is not a physical offset. `Fighter.observe` therefore reads
  `mesh.position` and `mesh.rotationQuaternion` and nothing else: every bone, anchor and the
  sword's root is a scene-root node, so those two fields *are* the world transform, Havok's
  `syncTransform` writes them at the end of every solver step, and reading them stamps
  nothing. `tests/view.test.mjs` pins it. Anything added to `observe` later that goes through
  `getWorldMatrix()`, `absolutePosition` or `absoluteRotationQuaternion` is wrong and that
  test will say so.
- **A reading is only comparable with another taken in the same harness.** There are two:
  the page, and the headless bench (`scripts/measure.mjs` and its relatives). They agree on
  converged behaviour and **disagree by about 9 % on the arm's peak transient with identical
  code** -- 264.97 mm against 242.88 -- and why is not established. Solver ordering, solver
  islanding, the render id, the rig overlay and the `Mind` seam have each been tested and
  eliminated; the remaining suspects are what else the page has in the scene. Neither
  harness is wrong. Putting both in one column is, and it has already produced a regression
  report about a build where nothing had changed. Name the harness in every figure you
  record. Full account in `docs/measurements.md`.
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
  reading. The first 0.6 s, because an arm is built hanging straight down and the anchor
  keyframes onto the commanded pose on the very first control step -- a snap worth **77 m/s**
  in a fighter that never swings, and the page does it too the moment you press Fight. And a
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
  of centre. Every jump assertion in `tests/handover.test.mjs` now comes in a pair with its
  unseeded control beside it.

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
    not by how faithful the fixture is**; `publishedFixture` in `tests/fixtures/view.mjs` exists
    so a test can take a real publication and then sever a hand on it, which is one stated edit
    to a real record rather than a whole invented one. (It also carries why `structuredClone` of
    a live view is not that: Babylon's `Vector3` keeps `_x/_y/_z` behind prototype accessors, so
    a cloned point reads `undefined` from every `.x`.)
- **`PhysicsViewer` leaks constraints across a toggle, and `hideConstraint` corrupts its own
  list.** `dispose()` hides impostors, bodies and inertia meshes and never touches
  `_constraints`, so a shown constraint left in place at toggle-off leaks its meshes *and*
  its before-render sync, once per toggle, forever. And `hideConstraint` splices the entry
  out and then *also* swaps what it thinks is the last entry into the hole it just closed,
  overwriting a live neighbour with `undefined` unless the entry removed was the last one.
  `src/rigview.ts` therefore takes constraints down from the end, by hand, before disposing,
  and rebuilds the whole set rather than differencing it. Also: the constructor's third
  parameter defaults to the **shared** `UtilityLayerRenderer.DefaultUtilityLayer`, and a
  default parameter only fires for `undefined` -- pass an explicit `null` to make the viewer
  build and own the layer its `dispose()` will take down.
- **Blender's glTF exporter is not byte-reproducible.** Two consecutive builds from
  identical input differ in about 14 000 of 61 662 words of the binary chunk, almost all of
  it triangle index order, and `PYTHONHASHSEED=0` does not settle it. Two builds are the same
  warrior and never the same file, so the digest in `scripts/run-blender.mjs` pins the
  *file* -- catching a working copy that is not what the repository holds -- and
  `scripts/check-warrior.mjs` is what answers whether the asset is right. Separately,
  **Blender evaluates `matrix_world` from the dependency graph, which is only stepped by the
  next operator**, so a bake loop reading it gets every sub-object right *except the last one
  built in each piece*, which welds in at its unscaled primitive size. Half the figure is
  correct, which is the failure mode that survives a glance; `build_warrior.py` uses
  `matrix_basis` and says so.
- **`gltf-validator` is not a dependency of this directory** and exists only in the
  repository root's `node_modules`. Reaching up into it is exactly what the boundary rule at
  the top of this file forbids, and it would check the wrong thing anyway: what can go wrong
  in an authored asset here is dimensional, not structural.
- **Stopping input is not pausing a physics game.** `Controls.pause()` alone leaves the
  keyframed torso carrying the velocity `steer` last gave it. `pauseHost` therefore disables
  scene physics before it stops controls, and `resumeHost` enables physics immediately
  before controls. The render loop still paints the frozen frame; blood particle update
  speed and every game-time notice are frozen separately because both otherwise advance
  from presentation work outside the solver.
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
  sibling `#pause-menu`, and neither method can toggle the other's target. The rule remains
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
  rather than a fight finished. The bench sets its own now, in `scripts/measure.mjs`. When a
  number's justification names a harness, check which harness is about to read it.
- **`src/scoring.ts`, `src/config.ts` and `src/buttons.ts` are imported directly by Node**
  in the test run, so their intra-directory imports carry explicit `.ts` extensions. Vite
  does not care; Node's ESM resolver does. `buttons.ts` imports nothing today, which is
  the only reason it does not show one -- give it an import and it needs the extension. The
  same graph carries a second constraint: **Node runs a `.ts` file by stripping its types,
  and strip-only mode rejects TypeScript parameter properties** --
  `constructor(private readonly scene: Scene)` fails to parse with "TypeScript parameter
  property is not supported in strip-only mode". One of them anywhere in what a harness
  imports blocks the whole harness, so those files use fields and assignments instead.
- **This tree is mixed, on Windows, with `core.autocrlf` false and no `.gitattributes` that
  covers any of it.** *(Corrected 2026-09-05: "no `.gitattributes`" was wrong. There are two --
  the repository root's, which names no `sword-prototype/` path at all, and
  `sword-prototype/.gitattributes`, whose nine patterns are all under `asset-src/armour/`,
  `asset-src/body/` and `public/assets/`, pinning deterministic extracts to LF. Two of those nine
  now name files the 2026-09-04 demolition deleted. Nothing in `src/`, `tests/`, `scripts/` or
  `docs/` is covered by either, so the rest of this entry stands unchanged.)* Git
  therefore stores exactly the bytes written, and a tool that rewrites a file with the
  platform's line ending silently converts the whole thing. Nothing breaks and every check
  still passes -- but `git diff` then reports the file as wholly replaced, a 90-line change
  reads as 308 added and 222 removed, and the change becomes unreviewable at precisely the
  moment somebody wants to review it. Writing through the editor tools preserves the
  convention; shell redirection and any script opening a file in **text** mode do not
  (Python's `open(p, "w")` is the one that has already done it here -- use `"wb"` and bytes,
  or pass `newline=""`). `git diff --ignore-cr-at-eol --numstat` tells you in one command
  whether a suspiciously large diff is real; compare it against plain `--numstat` and any
  file where the two disagree has had its endings rewritten.

  **Which file is which, measured rather than assumed.** Most of `src/` is LF, and **two
  files are pure CRLF in `HEAD`**:

  | CRLF | LF | Mixed |
  | --- | --- | --- |
  | `src/rig.ts`, `scripts/fetch-polyhaven.mjs` | everything else in `src/`, `tests/`, `scripts/`, `asset-src/`, **including `src/arena.ts` and `src/combat.ts`** | `src/style.css`, `src/scoring.ts`, `src/physics.ts` |

  **Four of this table's six original cells were wrong, and the whole point of the section
  above is that nobody re-ran the recipe against the table it introduced.** Re-measured
  2026-09-04 by the golem plan set's coordinator, twice -- once with the `git show | tr -dc`
  recipe printed below, once with a direct byte count in Python -- and confirmed against
  `2be433a`, the commit before that plan set began, so none of it is damage the golem work
  did. `src/arena.ts` carries **0** CR against 200 LF and `src/combat.ts` **0** against 635:
  both are and were pure LF. `src/physics.ts` is 159 CRLF against 129 bare-LF lines, with a
  bare-LF block in the middle that session 04 found by hand while editing it. `src/rig.ts`
  (197/0) and `scripts/fetch-polyhaven.mjs` (74/0) are the two the table got right.

  **Re-measured 2026-09-05 at `4d0a5e2`, by counting bytes and not by quoting the paragraph
  above.** The classification is unchanged and four of the six counts are not, which is the reason
  to re-take them rather than repeat them. CRLF against *bare* LF, in `HEAD` and in the working
  tree alike (they agree): `src/arena.ts` 0/200 and `src/combat.ts` 0/635, both still pure LF;
  `src/rig.ts` **220/0** and `scripts/fetch-polyhaven.mjs` 74/0, both still pure CRLF;
  `src/physics.ts` **159/182**, `src/scoring.ts` **338/153** and `src/style.css` **506/215**, all
  three still mixed. `style.css` lost 226 bare-LF lines when the Forge's stylesheet went on
  2026-09-04, which is why its bare-LF count fell rather than rose while every CR count in the tree
  stayed exactly where it was. Nothing in eleven sessions of golem work changed a single CR.

  `src/style.css` is genuinely mixed -- **506 CRLF lines against 441 bare-LF ones** at
  `2be433a`, not the 468/492 this entry claimed -- and has been since before any of this. A
  session that "tidied" its bare-LF lines turned a 126-line addition into a 150/24 diff and
  had to be undone.

  So the rule that survives is **match the region you are editing, not the file**: three of
  the files here are mixed, and a belief that a whole file is CRLF is precisely what produces
  a wholesale rewrite.

  **`src/scoring.ts` moved from the first column to the third on 2026-09-04, and it was never
  in the first one.** It was six files here and it is five: measured at `870190d`, before the
  golem plan set touched anything, `scoring.ts` carried **338 CR against 435 LF** -- 338 CRLF
  lines and 97 bare-LF ones -- so it has been mixed for as long as this entry has claimed it
  was pure. The correction matters in the direction the paragraph below states: a `\r\n`
  pattern silently matches nothing on the 97, exactly as an `\n` pattern silently matches
  nothing on the 338. Match the *region* you are editing, not the file. Session 07's golem
  ram row appended 56 more bare-LF lines to the tail of it, which is why the live numbers are
  now 338 against 491.

  So: **match whatever ending the file you are editing already has**, check before you write,
  and do not normalise anything wholesale on the way past. The practical trap is a script
  that searches for `"a\n b"` in a CRLF file and silently matches nothing -- if a Python or
  `perl` edit reports zero replacements in `combat.ts` or `scoring.ts`, that is why, and the
  answer is `\r\n` in the pattern rather than a rewrite of the file.

  Three agents have now reported this tree as uniformly *CRLF* after checking with
  `grep -c $'\r'`, which counts *lines containing* a CR and so returns the line count for a
  CRLF file and a mixed one alike; a fourth reported it as uniformly *LF* on the strength of
  six spot checks that all happened to land on LF files. **The anchored spelling
  `grep -c $'\r$'` is no better**: run against `AGENTS.md` and `README.md`, which contain
  zero CR bytes, it returns their full line counts. None of those is a measurement. This is:

  ```bash
  for f in $(git ls-files sword-prototype/src); do
    printf "%-24s cr=%s lf=%s\n" "$f" \
      $(git show HEAD:"$f" | tr -dc '\r' | wc -c) $(git show HEAD:"$f" | tr -dc '\n' | wc -c)
  done
  ```

  and `git diff --ignore-cr-at-eol --numstat` against plain `--numstat` is the after-the-fact
  check: any file where the two disagree has had its endings rewritten.
- **A hand-written `FighterView` has to carry every field the real one does.** There are
  exactly two in the tree -- `tests/minds.test.mjs`'s `facing()` and `scripts/measure.mjs`'s
  `phantom` -- and both are plain JS, so neither is a compile error when the view grows a
  field. Both threw on the first substep the day it grew `hands`, twelve tests and the whole
  bench at once, with a `TypeError` that names the policy rather than the fixture. Grep for
  `self: {` before adding a field to the view.
- **A fixture may simplify the world; it may not describe one that cannot exist.**
  `Fighter.describe` fills `BodyView.shoulder` from the primary hand's socket, so a fixture
  where those two disagree is arguing with a body the arena would never hand a policy. The
  test fixture hangs *both* hands off one shoulder -- a stated simplification, and the reason
  it cannot see the "aim from your own socket" rule at all, which is why that rule has a test
  of its own that moves the socket the way the arena does.
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
  because a centipede was being driven through a hand slot it does not have. `Centipede.update`
  moved onto it, `crawlerMind` wrote it, every test drove it -- and the *host* side was left
  behind: `Controls.state.natural` was initialised in the field list and never assigned again,
  and `splitMind` took `natural` from the policy, so even a written one would have been
  discarded. The setup screen offers the "you" radio for either side whatever the unit, so
  somebody could take a centipede, walk it around, and find the attack button dead. This is the
  same shape as the unread-field rule above, pointed the other way: a field nothing *writes* is
  as broken as one nothing reads, and it is harder to see because the type checks and the tests
  that drive it by hand all pass. `applyButtonPose` in `src/buttons.ts` owns the mapping now --
  one press onto the acting hand and the natural striker together -- because `input.ts` cannot
  be loaded by Node and a rule written there is a rule no test can reach.
- **The stroke geometry in `policies.ts` is written for a right arm** -- "high and outside,
  on the sword shoulder's side" -- and has to be mirrored by `HandView.outboard` for the
  other one. So does a shield's placement, and so does the wrist roll that goes with it. Get
  the roll's sign backwards and it does not look like a hand held wrong, it looks like an arm
  coming apart: 504 mm of hand-to-anchor stray, because the shoulder cone refuses the twist
  and the solver pays for the orientation out of the position.
- **`Combat.log` keeps the newest 24 entries.** A bout produces hundreds, so a total summed
  from it at the end is not a total, it is the last second and a half. Accumulate from
  `lastHit` per step instead, keyed on `at`.
- **A mutation battery poisons the dev server that is watching the tree.** Vite caches a
  transform per file and invalidates it on the watcher's event. A script that edits a source
  file, runs a test and restores it in a few milliseconds can leave the *mutated* text in
  that cache -- and the owner's server on 5180 goes on serving it, through a reload, with no
  error anywhere. It cost a session's visual check: `Arm.strikeReach` returned the right
  number while `Fighter.describe` published `reachNeutral`, because `fighter.ts` was the
  mutated module and `arm.ts` was not. **After running mutations, before believing anything
  in the page, fetch the modules you changed and grep the served text** --
  `await fetch("/src/fighter.ts").then(r => r.text())` -- and re-touch any that come back
  stale. Do not restart the server to fix it; it is not yours. Note the served text is
  esbuild's output, so match on a distinctive identifier rather than on your own formatting.
- **`grep -c $'\r'` is not a line-ending check.** It reported every line of a pure-LF file as
  containing a carriage return, which sent a whole file through a needless CRLF conversion
  and produced a 292-line diff on a four-line change. This repository has `core.autocrlf =
  false` and a `.gitattributes` that pins only a handful of asset extracts, so **each file's real
  endings are whatever is committed** and they are not uniform: ~~`src/scoring.ts` and
  `src/combat.ts` are CRLF, `src/config.ts` and every test file are LF, and `src/style.css`
  is genuinely mixed.~~ *(Struck 2026-09-05. This sentence is a second, uncorrected copy of the
  table above and it is wrong the same way: `src/combat.ts` carries **no CR at all** and
  `src/scoring.ts` is mixed rather than CRLF. The entry above carries the measured
  classification; two statements of one fact in one file is how the wrong one survives a
  correction, so read that one and not this.)* Count bytes in Python (`data.count(b"\r\n")` against
  `data.count(b"\n")`), and gate the commit on `git diff --numstat` being identical to
  `git diff --ignore-cr-at-eol --numstat`.
- **A caller holding its own copy of a rule is the same defect as a missing table row, and
  is much harder to see.** `combat.ts` skipped the damage model for a contact below
  `minCutSpeed` -- a real optimisation, worth having -- and that is the *blade's* number.
  The club's own lower floor therefore never ran in a fight for the whole of the club's
  life, while passing its unit test the entire time. If a module owns a rule, it owns the
  cheap early-out for that rule too; export the predicate rather than letting the caller
  approximate it.
- **A range constant in `policies.ts` is a weapon's length in disguise.** `duelist.hold`,
  `duelist.strike` and `swinger.engage` were all "an arm at `reachNeutral` with an arming
  sword on the end of it", stated in a comment and nowhere a program could read. Any weapon
  of another length stands outside its own range and swings at the air -- measured, 31 blows
  against 398. They shift by `HandView.reach` now; a new range added here has to shift too.
- **`rollForStroke` folds its answer into +-pi/2, and that fold is a claim about the
  weapon.** It is right for a double-edged blade, where `roll` and `roll +- pi` are the same
  cut, and exactly wrong for anything single-bitted -- where its tie-break picks the poll,
  and measured, picked it for both policies and both hands every time. It takes a
  `bothEdges` argument, defaulted to the blade's answer. Any new stroke has to pass
  `cutsBothWays` of what the hand is actually holding.
- **A view field with no reader and a view field with no reader *yet* look identical.**
  `HandView.reach` was removed one session for having none and put back the next, because
  the weapon that needed it did not exist yet. The rule about unread fields is still right
  -- `SelfView.reach` went three sessions unread and is gone for good -- but before deleting
  one, try to name the reader that is coming. If you can, leave it and write the name down.

- **A `PhysicsShapeContainer`'s collision filter does nothing at all.** Havok filters on
  the **leaf** shapes; setting `filterMembershipMask` on the container writes to the
  container's own shape, which nothing consults, and *reading it back hands you garbage*
  -- a shape set to 8 returned 383476. Every weapon in this directory had its layers set
  that way since the file was written, so **for its whole life a weapon collided with
  everything**: measured on one fighter swept through its envelope for twelve seconds, the
  sword logged 1687 contacts against its own upper arm, 1572 against its own forearm, 853
  against its own torso and 795 against its own shield, and the shield logged 985 against
  its owner's head and 725/669 against its owner's two arms. That last one is the
  expensive one -- a shield's own forearm sits inside its stand-off by construction, so
  that is permanent contact between a 4 kg lever and the chain driving it, which is the
  exact failure the four-layers-per-side table was invented to prevent.

  It hid because the symptom is **friction, not a hole**: an arm that tracks its anchor a
  little worse than it should, in a prototype whose whole subject is how well an arm tracks
  its anchor. `Weapon` keeps its leaves in `parts` and sets the masks on each
  (`relayer`); `Arrow` uses a bare `PhysicsShapeBox` and no container at all.
  `.review/mask-probe.mjs` is the six-case drop that settles it, and
  `tests/weapons.test.mjs` asserts the read-back per kind. **If you add a compound body,
  set the filter on its children.**
- **`setTargetTransform` is not a teleport for a DYNAMIC body.** It is the *target* of a
  keyframed one and against a dynamic body it does nothing: six shots nominally from one
  origin ended at -6.63, -12.19, -4.35, -9.94, -1.93 and -7.66, because the body carried on
  from wherever the last one left it while `mesh.position` was being overwritten from it
  every step. Write the transform node and set `body.disablePreStep = false`, which is
  `PhysicsPrestepType.TELEPORT` under a boolean's name; a hundred launches then land at the
  same place with spread **0**. Put the flag back up one step later -- and note that "one
  step later" has to mean *after* a solver step has run, so the code that lowers it must
  run **before** the code that raises it in the same control step. `Quiver.step` is called
  as the first line of `Arm.update` for that reason.
- **Two watchers on one body, and the order they were added in decides the outcome.**
  `Arrow` watches its own collisions to know it has struck, and `Combat` watches the same
  body to score the blow. `Arrow`'s observer is added first -- in its constructor, before a
  fighter exists to be handed to a `Combat` -- so setting "spent" inside that callback
  marks the arrow spent *before* the watcher that scores it runs, and **every arrow in the
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
  An arrow caches its free-flight velocity each control step and is scored from that.
- **`getLinearVelocityToRef` is not allocation-free, and the name is why this has now cost
  two sessions.** The obvious reading of `ToRef` in Babylon is "the version that does not
  allocate", and for `getObjectCenterWorldToRef` it is true -- that one copies
  `transformNode.position` and never crosses into the plugin at all, 0.1 B a call. The two
  velocity readers do cross: `HavokPlugin.getLinearVelocityToRef` reads
  `this._hknp.HP_Body_GetLinearVelocity(pluginRef.hpBodyId)[1]`
  (`node_modules/@babylonjs/core/Physics/v2/Plugins/havokPlugin.js:1210`), and the
  emscripten glue builds a fresh JS array per call. **The `ToRef` saves the destination
  `Vector3` and nothing else.** Measured on 9.18.1 with `.review/boundary-count.mjs`:
  **216 B/call** linear, **184 B/call** angular, against 0.1 for the object centre.
  Session 16 planned a per-frame publication on the premise that the `ToRef` pair was free,
  and shipped an `observe` that read velocities eight times where four had been read
  before -- a bare-handed fighter went from allocating nothing per view to about 1.6 KB a
  step at 240 Hz. So: **the budget is the number of boundary reads, not the number of
  `Vector3`s**, the cheap direction is to ask once and derive every consumer from that
  reading, and a point that coincides with the body's own centre needs no angular read at
  all because `w x 0` is zero. `describeFighter` costs two reads for a held weapon and one
  for a bare fist; `tests/policy-perception.test.mjs` counts the plugin calls per `observe`
  and fails when a reader is added, which is exact where a heap sample is not.
- **Do not infer an event from a side effect that has a second cause.** Three probes in one
  session disagreed about the archer's rate of fire, because each watched something that
  goes up when an arrow is loosed: the count of live arrows (also moves when one is
  culled), `live` going true (misses a *recycled* arrow, which goes live->live), and the
  age resetting (`Arrow.step` also resets `age` when a shot **strikes**, so every hit reads
  as a new shot). The age watcher was the worst: it reported 16 shots in 20 s of which 12
  left the string at under 4 m/s, which looked exactly like a broken draw and was a broken
  probe. Wrapping `Quiver.loose` itself settled it in one run: 96 calls, **every one at
  48.0 m/s**, one every 1.25 s. When a measurement is surprising, instrument the *call*.
- **A weapon that cannot sever cannot win a bout, and that is a rule rather than a
  balance number.** `beaten()` ends a bout on a severed head or torso, or on all twelve
  parts at zero. An arrow deliberately never severs, so an archer cannot win: against
  `idle` -- a fighter that stands still and does nothing -- it landed 80 arrows for 274.7
  damage a bout over sixteen 30-second bouts and killed **0**. Against `swinger` it hit
  98.9 % of what it loosed for 366.2 damage and died 16/16. The rule's own docstring
  already flags the alternative and reserves it for a person; the point for anybody adding
  a weapon is that **damage and lethality are separate systems here**, and a new kind has
  to say which one it participates in.
- **A fighter used to retreat at a dead run.** `steer` multiplied `input.forward` by
  `walkSpeed` whatever its sign, which nobody noticed for as long as the only policy that
  backed up did it in short bursts -- and which became load-bearing the moment there was a
  policy whose whole plan is distance. A fighter that retreats as fast as its pursuer
  advances cannot be caught, so the first archer bench came back 0 kills and 0 deaths at
  the cap: a stalemate that no amount of tuning the bow could have touched, because it was
  not about the bow. `fighter.backSpeed` is 59 % of a walk now, and the cost to the melee
  policies is in `docs/measurements.md`.
- **`asset:verify` mirrors the whole `CONFIG.fighter` block, not just the bones.** Adding
  `backSpeed` -- a walking speed, nothing dimensional -- fails it. `npm run asset:dimensions`
  rewrites the sidecar without rebuilding the `.glb`, which is right exactly when nothing
  dimensional moved; read the diff before believing that.

- **Babylon removes observers asynchronously.** `Observable.remove` and `removeCallback`
  mark an observer `_willBeUnregistered` immediately, then splice it on a zero-delay timer.
  A lifecycle census taken synchronously after disposal must count active observers rather
  than the raw backing-array length, or every correct removal looks like a leak.
  `tests/integration.test.mjs` learned this while auditing 25 rebuilds; it still catches a
  genuinely live callback because marked observers no longer participate in notification.

**The next five entries are about code deleted on 2026-09-04** -- the KayKit Knight and the
construct/Forge trees. *(Counted 2026-09-05: this said "four" and there are five, which is what a
count in prose does when a bullet is appended under it.)* They are kept because the lessons are about Babylon, Havok and how a body
experiment goes wrong, not about the units that taught them; the tests and files they name resolve
through `docs/deleted-paths.md`. Read them as findings, not as descriptions of the current tree.

- **Babylon starts an animation while parsing the exact KayKit Knight GLB.** With Babylon
  9.18.1 the retained source actions are not inert reference data by default:
  `1H_Melee_Attack_Chop` starts and produces 123 scene animatables. The asset-native figure must
  stop every container group before publication and stop every instantiated group again. Letting
  the creator clip and the physics solver both drive the skeleton is the visual equivalent of two
  controllers fighting over one body; `tests/kaykit-knight-asset.test.mjs` and
  `tests/kaykit-runtime.test.mjs` pin zero animatables at both boundaries.

- **A world-preserving reparent proves no weapon alignment.** The first KayKit spike checked that
  `setParent()` moved its visual by under 0.1 mm and called the mount good while the 1.775 m creator
  sword and the 1.03 m procedural collider occupied different volumes. That test only judged the
  operation it had just performed. Asset-native weapons derive connected components, convex
  collision hulls, point, edge and flat from the creator point cloud, then compare the live Havok
  bounds with the rendered bounds. A grip test that never asks hit/scoring geometry is false green.

- **A selectable imported figure needs two failure boundaries.** Name and skeleton qualification
  alone did not prove that Havok could build the creator weapon geometry; a forced failure during
  the second KayKit weapon transfer leaked 44 meshes, 58 transform nodes, one skeleton, 22
  animation groups and 19 physics bodies because a throwing constructor leaves no object for its
  caller to dispose. Preparation now checks indexed topology, connected-component count, convex
  volume and the sword PCA frame before enabling the picker. Construction still owns a transaction:
  `KayKitFigure` releases its imported graph and `Fighter` releases its whole physics graph if an
  unexpected transfer fails. Keep both; preflight explains expected refusal and rollback contains
  everything a loader or physics backend can still do unexpectedly.

- **Havok's private constraint-to-body map is a debug history, not a live-resource census.**
  Version 9.18.1 adds entries in `initConstraint` but does not remove them in
  `disposeConstraint`, even though the native constraint is disabled and released there.
  The integration lifecycle audit wraps those two plugin calls and balances the actual
  `_pluginData` IDs; reading `_constraintToBodyIdPair.size` would report a leak forever.

- **General self-collision is not a physicality fix for a driven articulated body.** Adjacent
  capsules overlap at their joint seams by construction, so turning every owner pair on makes
  the motors buzz against their own anatomy. The opposite failure is just as misleading:
  `selfCollisionCount === 0` proves nothing about pairs the filters never admitted. Physicality
  uses three narrow boundaries instead: anatomical controller limits (an impossible strapped-shield
  command is reflected to a same-side carry and its wrist turn is reversed), pair-atomic planning
  plus command-volume clearance for an owner's sword and shield, and authored mount clearance
  validated through the live articulation envelope.
  A generic mount-versus-own-trunk layer changed the Warden's established dorsal-yaw contact into
  a dorsal-pitch hit, so it was rejected rather than relayering every launcher. A hidden shield
  leaf was also rejected because it changed mass, inertia and debris; the retained resolver tests
  the visible plate against the blade, hand, forearm and achieved-to-command sweep without adding
  physics geometry. For mounted hardware, prove bind clearance and live clearance in both mirrors while
  preserving the established aiming chain. Reparenting the Arbalest bearings onto a new brace made
  a clean-looking mount that could no longer aim; the accepted socket offset changes mounting,
  not the controller's joint response.

**The next five entries are what the golem work paid for**, 2026-09-04 to 2026-09-05. Like the
group above they are about Havok, the docs gate and how a durable record rots, rather than about
the body that taught them.

- **The docs gate resolves a file reference against the *working tree*, so an untracked file can
  make a rotted reference look live -- on one machine, indefinitely.** `tests/docs.test.mjs`
  builds its resolution index with `walk(ROOT, RESOLVE_SKIP, () => true)` and asks the tree
  *before* it asks `docs/deleted-paths.md`, which is right (a path can be deleted and later
  re-added) and has this hole: `RESOLVE_SKIP` holds `node_modules`, `dist`, `.deps-stage`,
  `.review` and `.git`, and nothing else -- so every other ignored, untracked, machine-local
  directory is in the index, and resolution is by path *suffix*. **The live instance is the span
  reading rows.jsonl in `docs/measurements.md`** (written without backticks here on purpose, so
  that this entry does not become a second one): it names the output file of a runner deleted on
  2026-09-04, and it resolves only because this machine still holds that name three directories
  deep under .tools/, untracked, matched by a `.gitignore` line. The same
  commit is green here and red in a fresh worktree. **Verification recipe:**
  `git worktree add <tmp> HEAD`, junction `node_modules` in at both levels, then
  `node --test tests/docs.test.mjs`; run it before believing that a docs gate you have not
  changed is telling you about the repository rather than about your disk. The class is the point
  and the instance is only an example: strike the span, name it in `NOT_A_PATH_TARGETS` as the
  generated artefact name it is, or have the resolver ignore untracked paths. The third closes the
  class.

- **On a low-axis chain the anchor's *rate limit* shapes a commanded move and its force ceiling
  does not, and a hand rate is not a tip rate.** Both halves were got wrong at once by scaling the
  Warrior's numbers. Swept over 1400 N to 14000 N on a 29.5 kg chain, every figure of an ordinary
  move stops changing above about 3900 -- 8.71 m/s of peak, 59.9 mm of lag and 11.605 mm of wander
  read identically at 3900, 9000 and 14000 -- so a force ceiling chosen for authority is a number
  with no reader. The rate is the opposite: 6 m/s **at the hand** is about 34 m/s at the tip,
  because the point sits 1.52 m from the socket against the hand's 0.72 and the forearm turns
  about the elbow as well, and the guard raise duly peaked at 34.46 m/s until the rate came down
  to 1.2. If a limb reads as a teleport, look at the rate limit and at the lever between the
  driven point and the measured one, not at the torque. (One row of that force sweep reproduces as
  an outlier 4 times out of 4 -- 6000 N gives 1704.9 mm of lag where 5000 and 7000 give 59.9 -- and
  has never been explained.)

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

- **A golem bout on the measure bench must pass `locomotionMode: "supported"`, and the pair step
  throws if you forget.** `runBout` defaults it to legacy on purpose -- every Warrior figure in
  `docs/measurements.md` was taken there and a bench that quietly switched would move all of them
  -- while a golem's locomotion *is* the physical V1 port. `stepControlledPair` refuses a pair
  where only one side has one and throws "supported locomotion pair construction produced only one
  physical V1 port" before the first frame, which is the good failure: a forgotten line cannot
  produce a quietly wrong number. Two consequences to carry: the Warrior in a mixed golem cell is
  therefore on the supported carrier and is **not** the Warrior of the `duelist vs swinger` tables,
  and `scripts/measure.mjs` shares one Havok module across a run where a scratch script makes a
  fresh one per bout -- same shape, different cell, different column.

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

## House rules

Thirteen, and each one was paid for. *(Counted 2026-09-05: this said "seven", which is what a
count in prose does when six more rules are appended under it. Two of the thirteen are about the
construct qualification system deleted on 2026-09-04 and are kept as findings, the way the traps
above their heading are.)*

- **A policy plays with the controller a person plays with.** `Mind.decide` returns an
  `Intent`, and `Controls.state` is annotated as one -- so the person and the AI hand a
  fighter the same fields. Nothing may reach past it to set a joint angle, place a
  blade, or ask for a pose the solver would refuse a person. An AI that could pose the arm
  directly would be a different game's AI. **The command is not the controller**, which is
  the correction session 15 made: `Intent` was a type alias for the human's own
  `InputState`, so the wheel's `zoom` was a field on every policy's command and a dimension
  in every sweep that measured one. Camera state -- zoom, orbit, pan -- lives on
  `CameraGestureState` in `src/camera.ts` and reaches no mind. The seam survives; the alias
  does not.

  **The field count used to be written here and kept going stale** -- nine, then eight, then
  seven, and eight again since session 17 gave a natural striker its own channel, because a
  creature whose weapon is its head was being driven through a hand slot it does not have.
  `COMBAT_FIELDS` in `tests/fixtures/intent.mjs` names the set and is asserted against every
  producer of a command, which is the copy that cannot drift. **That claim named
  `tests/minds.test.mjs` while there were six hand-written copies of the literal** -- `minds`,
  `integration`, `arena`, `handover` and two in `options`, four of them anonymous inline arrays
  -- so it was a single-sourcing claim about a set stated six times. One list now, on the model
  `tests/fixtures/view.mjs` set, and mutating it turns all five files red. The one place the two sides are
  not identical is a *narrowing* rather than a second field: `Intent.actingHand` is
  `HandName | null`, and `Controls.state` is `Intent & { actingHand: HandName }`, because a
  cursor is always on a hand and a set of jaws is not one.
- **Cosmetics never carry authority.** `src/figure.ts` and anything in the authored asset
  own no collision and decide no hit.
- **The visible room is not the collision arena.** `src/arena-room.ts` keeps the original
  ground/post aggregates in one owner and body-free dressing in another. A solid cosmetic
  below the conservative reach ceiling is refused unless it names an existing collider;
  distance beyond the slab is not safety because an animated fighter can keep moving.
  Translucent scrims, flat floor markings and overhead beams are the explicit body-free
  cases. Do not bypass `validateRoomPlacements`
  with builder-local scenery.
- **The rig overlay creates no body, shape or constraint.** `__sword.rigview.audit()` pins
  it across toggles rather than a comment claiming it.
- **No feel complaint is fixed by raising a motor ceiling without a measured before/after
  table beside the number in `src/config.ts`.** Every number in the `arm` block was set that
  way and each one carries its table.
- **Every measurement names its harness**, for the reason in the traps above.
- **Commit each landable change as it lands.** The one question this directory could not
  settle -- where the 9 % transient disagreement comes from -- needed two builds bisected,
  and neither had been committed. It is the cheapest rule here and the one that has already
  cost the most.

- **A change to shared execution-layer code gets a bout either side of it, and the null
  control is not optional because it is a null.** `npm run measure -- --only duelist-swinger
  --bouts 120` at seed 20260823 is the established one, and `src/policies.ts` does not import
  `src/options.ts`, so a tactic-layer change *cannot* reach it -- which is the point. The four
  functions both layers share -- `applyActionPosture`, `actionCoverAt`, `actionAimAt`,
  `actionArcherAim` -- are the leak path, and this bout is the cheapest thing that would say
  so. The real control for an option-layer change is the zero-delta parity sweep,
  `the_scripted_meta_controller_matches_the_policy_it_replaces`. Session 16 shipped green at
  474 tests, took the duelist from 40.8 % to 28.3 % against the swinger, and nobody knew until
  the next session went looking -- about 2.5 standard deviations at 120 bouts. `docs/measurements.md`
  under "What that is worth in bouts" carries the table.

**The five entries from here to the end of this list are also about the deleted construct trees**,
for the same reason and with the same warning: their digests, corpora and named Minds no longer
exist, and the rules they state -- a recovery that cannot require what it restores, a qualification
identity that is a pair, worker count as scheduling only, a green counter that cannot rescue a red
bout, foot contact that is not a posture verdict -- are what was paid for.

- **Recovery cannot require the support state it exists to restore.** The first construct
  controller required three planted contacts in its constructor, so a fallen Mind selected
  `recover` forever and the scheduler refused it forever. Move, turn and brace retain that
  admission rule; recovery does not. The current Warden proves longitudinal recovery under real
  off-centre impulses. The superseded raw corpus accumulated 234,442 stuck steps. A historical
  combat-value-v2 corpus qualified under schedule `e74cb441`, source `e5d255e7` and run
  `7a626bcd`, but the later fire-lifecycle correction invalidated that source identity. The fresh
  next run was schedule `8253502c`, source `f82bc3d3`, run `97a634ab`: only one of eight rows dealt
  bilateral physical damage, seven omitted both brace and fire, and all eight reached the time cap.
  The later Effigy sibling-foot correction moves current source to `420906e8`; that source has no
  qualification receipt. Recovery remains proved; authored combat entry does not.
- **A construct qualification identity is a pair.** `scheduleDigest` covers the complete frozen
  assignment and thresholds; `sourceDigest` covers runtime sources and construct scripts but
  deliberately excludes `src/construct/learning/schedule.ts`. Including the schedule in both made
  writing `entryGate.sourceDigest` change the source digest it was trying to pin. Do not collapse
  the pair or narrow the broad source list without a mutation test.
- **Construct worker count is scheduling only.** Jobs, seeds, mirrors and shard boundaries are
  frozen before workers start; aggregation and checkpoint updates are by job index. Eight workers
  match the eight-job authored corpus. Requesting 32 there demonstrated eight live jobs, not
  32-way scaling. **One worker realm runs one Havok arena at a time.** Havok's wasm state is
  realm-global: `Promise.all` over two bouts in one Node realm changes physical outcomes even when
  both scenes are separately constructed and disposed. Parallel qualification therefore uses
  isolated worker threads, with a sequential loop inside each worker; the parent alone restores
  frozen index order and commits checkpoints. `qualification_workers_never_overlap_two_arenas_in_one_JavaScript_realm`
  mutation-proves the old scheduler unsafe, and the real-Havok worker-count parity test pins the
  replacement. Do not replace the worker loop with async concurrency.
- **A green counter cannot rescue a red bout.** The zero-damage authored corpus originally had
  zero stuck steps and zero capability losses because its action/power loop never progressed.
  The superseded assisted row had seven of eight bilateral-damage cells and zero stuck steps, but
  all eight timed out and omitted required move/brace Actions. Its 337 named capability losses
  were telemetry, not unexplained capability disappearance. A later historical entry advanced
  only after all clauses passed together, then became stale when its source changed. The fresh
  entry is red for damage, Action and completion failures together; production writes no shard or
  artifact when entry is red.
- **Foot contact does not prove a humanoid is standing.** The first Swordbearer test accepted two
  live foot contacts while the whole body was lying on its back. A biped posture claim needs root-up,
  torso height and head-above-torso together over the claimed interval. Its mixed Warrior harness
  records all three and the first posture-loss time; a contact count remains useful sensor evidence,
  not a stability verdict.

## Where the design lives

`docs/design.md` is the map: what each subsystem is, and the decisions that belong to no
single file. `docs/measurements.md` is every number that has been taken, the harness that
took it, and the list of what is still owed -- all of which is a judgement about how the
game feels and needs somebody to play it.

`docs/deleted-paths.md` is generated rather than written: every path that once existed here
and does not now, taken from `git log --no-renames --diff-filter=D`. It is what lets a comment
name a deleted script *in order to say it was deleted* without a checker demanding that
accurate history be falsified. **Regenerate it in the same change that deletes a file** -- the
command is in its own header, and `tests/docs.test.mjs` fails with the exact difference if you
forget. That test also gates every backticked file reference and line anchor outside
`docs/plans/`, so a pointer that stops resolving, or an anchor that runs off the end of its
file, is a red test rather than a reader's wasted afternoon. It does **not** require an anchor
to land on a declaration, the way the repository root's `tools/check_docs.js` does: measured over
this tree, **149 of the 254 anchors that resolve to a source file land mid-statement**, and almost
all of them are right, because the house style here points at the line that does the thing. That
ratio holds over every grammar it has been taken under -- it was 101 of 206 under the two-spelling
sweep that decided it -- and `docs/measurements.md` names the space for each.

**"The same change" takes two commits, and that phrasing is what hides it** *(corrected
2026-09-05)*. The generator reads `git log --diff-filter=D` over **committed** history, so while a
deletion sits only in the working tree the log has nothing to report and a regeneration run there
reproduces the register you already had. The sequence is: commit the deletion, then regenerate,
then commit the register -- and **the docs gate is legitimately red in between**, which is a state
to expect rather than to debug. Say so in the second commit message, because a bisect landing on
the first one otherwise finds a red tree with no explanation in it.

**A line-shifting edit is invisible to that gate**, which is its one real limit: an anchor that
still lands inside its file but now points one line off is neither out of range nor unresolvable.
Keep an edit above an anchor line-neutral, or re-point what it moved.

**Name the construct; a line number is a fact with no test.** That gate checks an anchor lands
*inside* its file, not that it lands on what the prose means -- so "`selectValidationChampion` in
`quality-diversity.ts`" survives every edit above it and "`quality-diversity.ts` ~~:93~~" survives only
until somebody adds an import. Prefer the name. When a line number is genuinely wanted, re-point it
by **locating the construct the prose names and refusing any target that is not unique** -- never by
adding the file's line delta, which has produced wrong anchors here twice, once while repairing the
very defect it introduced.

**A file that is deleted takes every anchor into it with it, and the answer is to strike, never to
re-point.** Sixty-five of them were struck on 2026-09-04 when the learning trees went; the file
names stay and resolve through the register, the numbers are struck through in the prose, and
`docs/measurements.md` carries the account. A consequence worth knowing before writing a checker
against it: **the tree is down to one live bare `:nnn` continuation outside `docs/plans/`**, and it
is a grammar example rather than a pointer -- every continuation that actually pointed somewhere was
carried by a file that session deleted, or by `docs/design.md`, which lost about 660 lines the same
day and therefore rotted the rest.

**Never re-point an anchor inside a superseded sentence.** A struck-through claim with a live-looking
`#Lnnn` in it reads to the next sweep as a live anchor, so it gets moved rather than read: one dead
anchor into `src/learning/meta.ts` was re-pointed from 154 to 150 *in the same hunk that said it was
being left alone*, re-publishing a number for a line that exists at no number at all. Strike the
number, date the supersession, keep the sentence. `docs/measurements.md` carries that account.

Everything else is written beside the code it decides. `src/config.ts` is the tuning
surface a person reaches, and it is deliberately mutable: the page exposes `window.__sword`, so
`__sword.config.arm.stiffness = 1600` takes effect on the next frame.

**It is not quite everything, and the exception is deliberate rather than an oversight.** The
option layer keeps its own frozen block -- `ACTION_TUNING` in `src/action-primitives.ts`, and
`TARGET_SPAN_FRACTION` in `src/options.ts` -- and neither is reachable from `__sword.config`.
`options.ts` and `learning/features.ts` may not import `config.ts` at all, which
`options_and_features_have_no_mutable_config_backdoor` pins by reading the source text: a
legality or aim rule a console command can move is a rule an artifact can be trained against
and deployed without. Both places say so in their own docstrings. Adding a number there is a
contract change, and adding one to `config.ts` that the option layer needs is not available. Tune from the console
first, then write the number back into the file. Motor ceilings and damping are set on
native solver objects at construction, so those need `__sword.left.applyTuning()` to push
them across.

`src/scoring.ts` is the balance rule -- what counts as a cut, a thrust, or a clang -- kept
pure and free of Babylon so it can be argued with in `tests/scoring.test.mjs` rather than
only by swinging. Changes to how the game rewards a blow belong there, with a test.

Two commands beyond the usual, both slow and both deliberately outside `npm test`:

```powershell
npm run measure        # bouts, headless -- prints the policy table. NOT 90 s any more; see below
npm run asset:verify   # checks the committed warrior.glb still fits the rig
```

**`npm run measure` at its defaults took 2350.3 s on 2026-09-05** -- thirty-nine minutes, exit 0,
seed 20260823, on the development host -- against the "about 90 s" this line and `README.md` have
both claimed since before the golem section existed. Nothing is wrong: `--bouts` defaults to 40 and
the golem cells run pairs of golems to a 60 s cap, so the run is doing about twenty-six times the
work the estimate was written for. What follows is operational rather than a defect. **Reach for
`--only <section>` and not for the bare command**: `posture`, `swing`, a `<a>-<b>` matchup name,
`fists`, `shield-archer` and `golem` are the sections, and `--bouts` is a flag. Budget the whole
run as a thing you start and come back to, and expect the process to hold about 3 GB of resident
memory by the end, because the Havok module is shared across bouts here rather than rebuilt.
