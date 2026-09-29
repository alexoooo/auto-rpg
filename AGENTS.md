# Operational notes

This repository **is the game**: physically simulated, AI-driven melee between bodies assembled
from modules -- stone golems, skeletons and humans, including the realistic workshop human -- in
the browser, on Babylon.js 9 and Havok. Beside `src/` are the tests and headless harness
(`tests/`), the policy league and research scripts (`research/`), asset-export scripts
(`scripts/`), design notes (`docs/`) and the GitHub Pages deploy (`.github/workflows/pages.yml`).

**Where the project is going:** Arena, Ladder and a Diablo-like Dungeon; equipment; many
morphologies; layered AI. The work now is [the core foundation](docs/plans/2026-09-28-core-foundation.md):
a clean, physically based core beside the old game, humans first, argued in
[the foundation audit](docs/analysis/2026-09-28-foundation-audit.md). Plans are indexed in
[docs/plans/README.md](docs/plans/README.md), which also says which commit holds a deleted document.

**Rules below are short on purpose.** Each cites an entry in [docs/history.md](docs/history.md)
(`H01`-`H73`) that holds the incident, the numbers and how it was found. Read the entry before
arguing with a rule. History entries may name code that has since been deleted; the lesson stands.

## Commands

```powershell
npm ci        # not `install` -- exact lockfile, identical on every machine
npm run dev   # http://localhost:5180, strictPort
npm run check # tsc --noEmit
npm test      # node --test tests/*.test.mjs
npm run build # check, then vite build
npm run preview
```

Run `npm test`, `npm run check` and `npm run build` before landing a change. Do not leave a
development server running.

**Pages.** Every page must be named in `vite.config.ts`'s `rollupOptions.input`; Vite's default is
`index.html` alone, so a page missing there works in dev and is absent from `dist`.

- `/` (`index.html`, entry `src/app.ts`) is the game: main menu, the arena at `?play=arena` (a
  `?matchup=` link opens it directly) and the dungeon at `?play=dungeon`. Each screen is a
  `<template>` mounted once per page load; changing screen is a navigation.
- `/dungeon.html` forwards to `./?play=dungeon`.
- `/bench.html` is the module bench: one module on a stand, or an effector in each socket.
- `/art-proof.html` is the golem art proof; `/character-lab.html` is the character workshop viewer.

**Headless harness: `tests/harness/`.** `bout-runner.mjs` exports `freshHavok`, `createBout` and
`runBout`; tests and `research/` run bouts through it. `golem-headless-arena.mjs` is the physics
arena without fighters; `golem-bench.mjs` and `golem-torso-bench.mjs` are the module benches
(both also run directly under `node`). `core-stand.mjs` is the core's stand: one spec, built by
`buildBody` (`src/core/build/`) and nothing else, on a ground.

## The core (`src/core/`) and the old path

New body, muscle, locomotion and rules work goes into `src/core/`, built beside the old game
([the plan](docs/plans/2026-09-28-core-foundation.md)). Everything else under `src/` is the
**old path**: it stays playable (stone and skeleton until they are ported), it is fixed only when
it blocks play, and it is not extended. `src/core/` has these rules:

- **It imports nothing from `src/golem/`, `src/config.ts` or the old minds.** Engine glue with no
  body knowledge (`src/physics.ts`, and what it takes of `src/body-inertia.ts`,
  `src/golem/effective-mass.ts`, `src/tipping.ts`, `src/fork/`) is moved or re-exported through
  `src/core/` when it is taken. `tests/core-boundary.test.mjs` walks the transitive imports: the
  core reaches itself, `@babylonjs/*`, JSON under `assets/`, and the files its `TAKEN` list
  names with a reason, whose own imports are held to the same rule. `src/physics.ts` cannot be
  taken while it imports `src/config.ts`.
- **Every number in a spec says where it came from.** It is a `Quantity`
  (`src/core/spec/quantity.ts`): read from an entry of `SOURCES` (`src/core/sources.ts`: a paper,
  the owner's decision, an asset, a measurement or a sweep's table), or derived from other
  quantities by a named rule. A rule's code writes no factor; a factor is an input with a source.
  `specProvenanceFaults` (`tests/fixtures/spec.mjs`) holds every spec to this. A spec never
  spreads another family's spec; families share code, not values.
- **Tuning is immutable.** An experiment passes an override in; nothing mutates a global.
- **One world step** owns physics, control, combat and the clock. The page, the harness and the
  research runners all call it.
- **Solver conditioning is not anatomy.** An inertia floor or damping term that exists for the
  solver is named as such, measured, and kept out of the body's numbers.
- **The legacy human** (`humanBiped`, `humanTorso`, `humanHead` in `src/golem/humanoid/body.ts`,
  labelled "legacy" on the bench) is not the Warrior or the Rogue; only `workshopBody(model)`
  fights. Take no human reading from it.

## Babylon and Havok

- **Enable physics before creating any body.** `buildArena` brings up Havok right after the
  `Scene`; creating a body first fails with `No Physics Engine available`. (H01)
- **Side-effect imports are load-bearing.** The tree-shaken build omits prototype patches, so an
  "unused" import removed here compiles, passes `tsc` and breaks at runtime -- sometimes silently.
  Known members: `Physics/joinedPhysicsEngineComponent.js` in `src/physics.ts`; the shadow,
  depth-renderer and post-process imports at the top of `src/arena.ts`; `Culling/ray.js` for
  `scene.pick`; `Rendering/outlineRenderer.js`; `Rendering/edgesRenderer.js` for `PhysicsViewer`
  (throws a bare string); `Particles/particleSystemComponent` (particles emit nothing, no error).
  When a feature works in the playground and not here, suspect this first. (H02, H17, H18, H21)
- **The solver never sees a variable timestep.** Advance with `scene._advancePhysicsEngineStep(ms)`,
  whose fixed sub-step accumulator is set by `PhysicsEngine.setSubTimeStep` (milliseconds).
  `PhysicsEngine._step` ignores the sub-step; do not conclude from it that the accumulator is a
  no-op. Never test by calling `scene.render()` in a tight loop. (H06, H13)
- **Control runs on the physics clock**, from `scene.onBeforePhysicsObservable`, before every
  solver sub-step. `BuiltModule.step` in `src/golem/module.ts` is called from there on every page.
  Physics and control both run at 120 Hz (`CONFIG.world.physicsHz`, `controlHz`). (H07)
- **Read world transforms from `mesh.position` and `mesh.rotationQuaternion`.** `getWorldMatrix()`
  caches per render id and reading it stamps the id, so the first reader in a frame freezes every
  later one. Code under `src/golem/`, `src/bench/` and `src/core/` must not use `getWorldMatrix()`,
  `absolutePosition` or `absoluteRotationQuaternion`; `tests/golem-bench.test.mjs` enforces it.
  From a console, `computeWorldMatrix(true)` every node you read. (H24)
- **A velocity motor lags by steps, not seconds; a saturated one is exact.** Driving a chain, it
  builds its impulse over several steps, which at 120 Hz is the servo's own time scale; the core's
  servo gives torque sources. Havok also brakes any body whose centre moves under ~0.12 m/s at
  ~0.3 m/s^2, so a servo stops a little short. (H73)
- **Force a body awake before a rest measurement** (`setActivationControl(body, 1)`); a sleeping
  body reads a perfect zero. (H08)
- **Build a welded body in the frame its weld demands.** A weld that disagrees at construction is
  cleared by flinging the body. A driven limb that is not within a few millimetres of its own
  anchor is stuck on something, not badly posed. (H09, H12)
- **Collision filters go on leaf shapes.** A `PhysicsShapeContainer`'s mask does nothing and reads
  back garbage. Use `writeCollisionFilter` for compounds and `collisionFilterIsExact` to check;
  tests read every golem part's filter back. (H45)
- **A layer that forbids a pair also hides the evidence.** Zero self-contacts proves no pair was
  admitted, not that there is clearance; measure clearance geometrically. General self-collision is
  not a fix either: adjacent capsules overlap at their joints by construction. (H55, H57)
- **Havok units are not the textbook ones.** `inertia` in mass properties is per kilogram;
  `getLinearVelocityToRef` is the centre of mass's velocity, while `getObjectCenterWorld` is the
  node position. `src/body-inertia.ts` does it right. (H49)
- **Velocity reads allocate** (about 200 B per call despite `ToRef`). Budget plugin boundary reads:
  read once per sub-step and derive every consumer from it (`refreshRoot` in
  `src/golem/locomotion/biped.ts`). (H50)
- **`setTargetTransform` does not teleport a dynamic body.** Write the node and set
  `body.disablePreStep = false` for one solver step, lowering it before the code that raises it
  runs. (H46)
- **Observers are removed asynchronously**, and Havok's private constraint-to-body map is never
  pruned. A lifecycle census counts active observers and balances real plugin ids. (H53, H54)
- **A body part never disposes materials**: `dispose(false, false)`. The scene owns the palette;
  the human skins own only their own materials. `surface()` in `src/surface.ts` attaches a map only
  once it decodes, so a failed texture leaves a drawn mesh. (H19, H59)
- **Babylon cancels `pointerdown`**, which suppresses every compatibility mouse event of that
  gesture. Use pointer events. DOM controls over the arena stop `pointerdown`/`pointermove`, let
  `pointerup` through, and blur on click. (H14, H15)
- **Button state is a level: read `event.buttons`.** Release edges are not guaranteed to arrive
  (`pointercancel`, release outside the window, hidden tab). Keep edges for one-shot actions. (H16)

## Browser checks

- **A hidden tab does not render**: no WebGL paint, no `requestAnimationFrame`, `scene.pick`
  misses. Check `document.visibilityState`, and `engine.frameId` frozen across a wait. A visual
  check from a background tab is possible by stepping by hand
  (`scene._renderId += 1; scene._advancePhysicsEngineStep(1000/60)`) and calling `scene.render()`
  yourself. (H03, H22)
- **Look at it before probing it.** `Material.isReady(mesh)` is false outside a render pass;
  `scene.materials` is incomplete (reach materials through `mesh.material`); after HMR the old
  scene lingers, so navigate rather than reload. Nothing exposes `src/golem/config.ts` to the
  console: change it in the file, then navigate. (H20)
- **The dev server:** port 5180 is `strictPort`. Backgrounding it with `&` dies with the shell
  call; killing `npx` leaves `vite` running, so kill by PID (`netstat -ano | findstr ":5180"`).
  The owner's server on 5180 is not yours: do not restart it. (H04, H05)
- **After a mutation battery, verify what the dev server serves**
  (`await fetch("/src/golem/golem.ts").then(r => r.text())`) and re-touch stale modules; Vite can
  keep serving the mutated text. (H40)

## Node and the headless harness

- **The recipe:** `NullEngine`, `Scene`, `attachPhysics(scene, havok)`, with Havok built from bytes
  (`HavokPhysics({ wasmBinary: await readFile(".../HavokPhysics.wasm") })`). Step with
  `scene._advancePhysicsEngineStep(1000 / 60)` and `scene._renderId += 1` per frame. The `?url`
  wasm import lives in `arena.ts` because Node rejects it. (H25)
- **Node imports `src/` directly.** Relative imports in anything a test loads carry `.ts`
  extensions, and TypeScript parameter properties are forbidden there (strip-only mode). Page-only
  modules (`main.ts`, `input.ts`, `hud.ts`) may omit extensions. (H34)
- **One Havok arena per worker realm.** Havok's wasm state is realm-global; parallel bouts need
  worker threads with a sequential loop in each (`runJobs` in `research/runner.mjs`). Never
  `Promise.all` two bouts in one realm.
- **A golem bout in the harness passes `locomotionMode: "supported"`**; the pair step throws
  without it. (H61)
- **A harness cap is its caller's.** `bout.capSeconds` (600) is the page's; `runBout` falls back to
  it only when no `maxSeconds` is passed. (H33)

## Measurement

- **Name the harness in every figure.** Page and Node readings of identical code have differed by
  9 % on a transient, and why was never established. (H60)
- **Tip-speed readings need their exclusion windows** (`BENCH_READOUT`): startup, a quarter second
  after any contact, and the stroke window for lag and stray readings. A peak that does not say
  whether the blade was driven or struck means nothing. (H26)
- **Prefer an exclusion that times itself** over a fixed step count, and before calling a
  difference between two physics rates physical, read the faster rate at the slower one's spacing.
  (H66)
- **Test wobble with a sweep, not a jump.** A teleported target carries no momentum. (H23)
- **Instrument the call, not a side effect with a second cause.** (H51)
- **Believe the bench over the fight.** A flung blade improves every bout column while the arm has
  stopped following its command; watch `stroke stray`. (H64)
- **On a low-axis chain the anchor's rate limit shapes a move, not its force ceiling**, and a hand
  rate is several times the tip rate. (H56)
- **Size a force off the arm, not off a mass scale.** `TERMINAL_BLADE.mass` is deliberately outside
  `kg()`; stone bodies are on `bodyKg()`. (H62)
- **A conclusion is void once its reference is corrected**, even if its number was right; keep the
  argument, not the digit. (H63)
- **Counts over a bout are not scale-free.** Prefer a rate, more bouts, or `result.ending`; never pin
  a distributional claim to one seed. (H65)

## Tests

- **A green test can assert nothing.** Mutate the subject and watch it go red. Sample both sides of
  an asymmetric range; assert whole records (`assert.deepEqual(command, freshIntent())`), not a few
  leaves; choose a fixture that can exhibit the defect (take a real publication and make one stated
  edit, as `fixtureOf` does). (H27)
- **Test the whole path, not its two ends**, and check a physical model's inputs reach it before
  declaring it failed. (H68)
- **A fixture may simplify the world but not describe one that cannot exist**, and a scripted
  mind's fallback behaviour is part of the fixture. (H36, H69)
- **Views built by hand or taken from a real bout go through `tests/fixtures/view.mjs`**
  (`assertCompleteView`, `publishedFixture`); add a new view field to its field lists too. Do not
  `structuredClone` a view: Babylon vectors lose `.x`. (H35)
- **A helper that rebuilds geometry from `CONFIG` is pinned to one kind**; make it take the kind. (H11)
- **`Combat.log` keeps 24 entries.** Accumulate totals from `lastHit` per step. (H39)
- **Under CPU load a dropped test count is a timeout, not a regression.** Re-run on a quiet machine.

## Code shape

- **Switch on a union with a `never` default.** A ternary chain with a default branch silently
  substitutes. (H10)
- **A module that owns a rule exports its early-out predicate**; a caller's private copy of the rule
  drifts. (H42)
- **A copy that names its fields drops the ones added later.** (H68)
- **A view field needs a reader** -- or a named reader that is coming, written down. (H38, H44)
- **A comment about a code path is a hypothesis until the path is executed.** (H58)
- **Name the construct, not a line number**, in prose and comments.
- **A screen is an explicit argument, never inferred from a state machine.** Setup owns
  `#curtain`, pause owns `#pause-menu`, the verdict bar is `#bout-end`; a key that pauses never
  leaves for setup. (H30)
- **Pause freezes authority, not the camera, and grants no UI permission.** `pauseHost` disables
  physics before pausing controls; camera orbit, pan and zoom stay live; pause opens nothing but
  `#pause-menu`. (H29, H31, H32)
- **Two watchers on one body: set a flag in the callback and promote it next control step.** (H47)
- **`velocityAt` is right for a blade and wrong for a projectile**; score a projectile from its
  cached free-flight velocity. (H48)
- **`rollForStroke` takes `bothEdges`**; a single-bitted weapon must pass `cutsBothWays`. (H43)
- **A bout ends on a fatal part or an empty vitality bar**; which parts are fatal is data
  (`GolemPart.fatal`). (H52)
- **Do not close a feedback loop around the arm's achieved pose**; it winds up. Hold constants
  chosen from a sweep. (H37)
- **Locomotion lessons:** the carrier's gait is an ellipse, so test navigation on several seeds;
  shifting a stance by turning legs about the hip makes unequal legs; a pushed body leans, then
  steps; a pair resolver must count a body giving way. (H67, H70, H71, H72)

## Line endings

This clone gets `core.autocrlf = true` from Git for Windows' system config; the repository has no
`.gitattributes`. The working copy is not the committed file, so check what is committed, not what
is on disk. Gate a commit on `git diff --numstat` equalling `git diff --ignore-cr-at-eol --numstat`;
a file where they differ has had its endings rewritten. H41 has a script that lists committed files
containing a CR.

## House rules

Each one was paid for; the full text is in [docs/history.md](docs/history.md).

- **A mind drives a body only through its command.** `Mind.decide` returns an `Intent` (a
  `CommandMind` returns a `BodyCommand`); nothing reaches past it to pose a joint. Camera state
  never reaches a mind (`a_combat_intent_contains_no_camera_state`).
- **A person commands and does not puppet.** A person hands a body `Orders` (`src/orders.ts`); its
  own mind carries them out while defending itself. The bench puppet (`src/bench/`) is a test
  instrument. The seam is `GolemDriver.step` in `src/golem/golem-control.ts`.
- **Cosmetics never carry authority**: nothing decorative collides or decides a hit.
- **The visible room is not the collision arena.** `validateRoomPlacements` in
  `src/arena-room.ts` refuses a solid cosmetic that names no collider; do not bypass it.
- **No motor ceiling is raised for feel without a measured before/after table beside the number.**
  Ceilings live in `src/golem/config.ts` and `TORQUES` in `src/golem/humanoid/arm.ts`.
  `CHAIN_REACH`'s yaw, shoulder and elbow torques and `HEAD_NECK.pitchTorque` lack their table
  today.
- **Every measurement names its harness.**
- **Commit each landable change as it lands.**
- **A change to shared execution-layer code gets a bout either side of it, including the null
  control.** The leak paths are what `src/policies.ts` imports from `src/action-primitives.ts` and
  the orders seam in `GolemDriver.step`.
- **Recovery cannot require the support state it exists to restore.**
- **One worker realm runs one Havok arena at a time.**

## Where the design lives

The argument for a constant is its doc comment, with the table that chose it: `src/config.ts` for
the arena and `src/golem/config.ts` for body tables. `docs/` holds what belongs to no one file:
plans in `docs/plans/`, dated analyses in `docs/analysis/`, standing notes on assets and
pages (`docs/workshop-fighter-integration.md`, `docs/rogue-archer.md`,
`docs/dungeon-reference.md`, `docs/character-lab/`) and the history behind this file. A plan or
analysis that is finished or superseded is deleted, not kept; what cites it names the commit
that still has it.

`src/config.ts` is deliberately mutable: the arena exposes it as `window.__sword.config`, so tune
from the console, then write the number back with its table. `src/golem/config.ts` is not exposed.
Motor ceilings in body tables are those of a body on its feet; `MotorTone` scales them by
`GROUNDED_TONE` (`src/golem/golem.ts`) while the body is down, and climbs back to full as it rises.

`ACTION_TUNING` in `src/action-primitives.ts` is deliberately frozen and that file may not import
`config.ts` (`action_primitives_have_no_mutable_config_backdoor`): a rule a console can move is a
rule an artifact can be trained against.

`src/scoring.ts` is the balance rule -- what counts as a cut, a thrust or a clang -- kept pure and
free of Babylon so it can be argued with in `tests/scoring.test.mjs`.
