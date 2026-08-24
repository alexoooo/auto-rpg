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
  CC0 tiling normal maps were wired into the palette and every material carrying one stopped
  rendering -- the warriors lost their helms, pauldrons, collars and breastplates while the
  untextured flesh and the cloth beneath kept drawing, which reads as a fighter made of
  floating arms. Reverted; `src/arena.ts` says so. Two smaller lessons from the same
  episode: a diffuse map **multiplies** `albedoColor` rather than replacing it, so wiring one
  onto a palette that already carries the right colours darkens the whole scene to about a
  third and looks like a lighting bug; and Blender computes tangent space only for tris and
  quads, so `plate()`'s n-gons make the exporter print "Tangent space can only be computed
  for tris/quads, aborting" per piece, **succeed**, and ship a file with no TANGENT.
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
- **A green test can assert nothing, and that is the worst defect this directory
  produces**, because it is invisible by construction. The only way to know a test is not
  that is to mutate the thing it is about and watch it go red. Doing so has already rewritten
  four assertions here that were satisfied by their own setup, and caught a `handover` test
  that passed against a deliberately broken cursor inverse -- the aiming envelope is
  asymmetric (azimuth runs -1.15 to +1.30), so the correct inverse and the plausible one that
  divides by a single half-range **agree exactly for a positive azimuth**. Sample both sides
  of centre. Every jump assertion in `tests/handover.test.mjs` now comes in a pair with its
  unseeded control beside it.
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
- **A pause mid-stride still slides.** `Controls.pause()` stops the control loop, so the
  keyframed torso keeps the linear velocity `steer` last gave it and the fighter drifts
  behind the curtain. True since the hero, and `R` from a decided bout is a second door
  onto it.
- **A screen inferred from a state machine changes when the state machine does, and nobody
  wrote that transition.** `showCurtain(show: boolean)` derived which curtain you were
  looking at from `state.phase === "select"`, so a *pause* was the setup screen with two
  blocks hidden by a class. The moment anything moved the phase -- and the sixty-second bout
  cap moved it, on its own, under a fight somebody was still having -- the pause silently
  became the character pickers over a live arena, with the only button on offer wired to
  dispose both fighters. The resume branch was `phase === "fight"`, so from there the key
  was dead for the rest of the session. Two bugs, one report ("pause doesn't un-pause, the
  game is gone"), and one cause. A screen is now an argument (`showScreen`), the rule is
  `pauseAction` in `bout.ts` with a test, and **a key that pauses must never also be the key
  that abandons.**
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
- **This tree is mixed, on Windows, with `core.autocrlf` false and no `.gitattributes`.** Git
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

  **Which file is which, measured rather than assumed.** Most of `src/` is LF, but **six
  files are pure CRLF in `HEAD`** and always have been:

  | CRLF | LF | Mixed |
  | --- | --- | --- |
  | `src/arena.ts`, `src/combat.ts`, `src/physics.ts`, `src/rig.ts`, `src/scoring.ts`, `scripts/fetch-polyhaven.mjs` | everything else in `src/`, `tests/`, `scripts/`, `asset-src/` | `src/style.css` |

  `src/style.css` is genuinely mixed -- 468 CR against 492 LF -- and has been since before
  any of this. A session that "tidied" its bare-LF lines turned a 126-line addition into a
  150/24 diff and had to be undone.

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
  false` and a `.gitattributes` that pins only a handful of files, so **each file's real
  endings are whatever is committed** and they are not uniform: `src/scoring.ts` and
  `src/combat.ts` are CRLF, `src/config.ts` and every test file are LF, and `src/style.css`
  is genuinely mixed. Count bytes in Python (`data.count(b"\r\n")` against
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

## House rules

Six, and each one was paid for.

- **A policy plays with the controller a person plays with.** `Mind.decide` returns an
  `Intent`, which is a type alias for the human's own `InputState`. Nothing may reach past
  it to set a joint angle, place a blade, or ask for a pose the solver would refuse a
  person. An AI that could pose the arm directly would be a different game's AI.
- **Cosmetics never carry authority.** `src/figure.ts` and anything in the authored asset
  own no collision and decide no hit.
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

## Where the design lives

`docs/design.md` is the map: what each subsystem is, and the decisions that belong to no
single file. `docs/measurements.md` is every number that has been taken, the harness that
took it, and the list of what is still owed -- all of which is a judgement about how the
game feels and needs somebody to play it.

Everything else is written beside the code it decides. `src/config.ts` is the whole tuning
surface, and it is deliberately mutable: the page exposes `window.__sword`, so
`__sword.config.arm.stiffness = 1600` takes effect on the next frame. Tune from the console
first, then write the number back into the file. Motor ceilings and damping are set on
native solver objects at construction, so those need `__sword.left.applyTuning()` to push
them across.

`src/scoring.ts` is the balance rule -- what counts as a cut, a thrust, or a clang -- kept
pure and free of Babylon so it can be argued with in `tests/scoring.test.mjs` rather than
only by swinging. Changes to how the game rewards a blow belong there, with a test.

Two commands beyond the usual, both slow and both deliberately outside `npm test`:

```powershell
npm run measure        # bouts, headless, about 90 s -- prints the policy table
npm run asset:verify   # checks the committed warrior.glb still fits the rig
```
