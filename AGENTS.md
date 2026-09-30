# Operational notes

This repository **is the game**: physically simulated, AI-driven melee between bodies built by
the core (`src/core/`) -- the Warrior and the Rogue, humans measured from their workshop models,
and the crypt's skeleton -- in the browser, on Babylon.js 9 and Rapier. Beside `src/` are the
tests and the headless stand (`tests/`), the core's research scripts and the physics bake-off
(`research/`), asset-export scripts (`scripts/`), design notes (`docs/`) and the GitHub Pages
deploy (`.github/workflows/pages.yml`).

**Where the project is going:** Arena, Ladder and a Diablo-like Dungeon; equipment; many
morphologies; layered AI, on a clean, physically based core, humans first
([the core foundation](docs/plans/2026-09-28-core-foundation.md), argued in
[the foundation audit](docs/analysis/2026-09-28-foundation-audit.md)). The old game -- the stone
golem, its minds, walking and scoring, the module bench, the art proof and Havok -- was deleted on
2026-09-30 ([the plan](docs/plans/2026-09-30-old-path-removal.md)); commit 77a0cd77 holds it.
Plans are indexed in [docs/plans/README.md](docs/plans/README.md), which also says which commit
holds a deleted document.

**Rules below are short on purpose.** Each cites an entry in [docs/history.md](docs/history.md)
(`H01`-`H76`) that holds the incident, the numbers and how it was found. Read the entry before
arguing with a rule. Many entries name code, and an engine, that have since been deleted; the
lesson stands.

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
  `?matchup=left,right` link opens a bout directly, `src/arena/`), the crypt at `?play=dungeon`
  and the lab at `?play=lab` (its scenario menu; `&scenario=` runs one,
  `src/core-lab/scenarios.ts`). Each screen is a `<template>` mounted once per page load;
  changing screen is a navigation.
- `/dungeon.html` forwards to `./?play=dungeon`, and `/core-lab.html` to `./?play=lab`.
- `/character-lab.html` is the character workshop viewer; `/physics-bench.html` runs the
  bake-off's cases on MuJoCo and Rapier in the page (`src/physics-bench/`).

**Headless: `tests/harness/`.** `core-stand.mjs` is the core's stand: one spec, built by
`buildBody` (`src/core/build/`) and nothing else, on a ground, in a world of its own
(`freshEngine`, `coreStand`); `CORE_ENGINE=<name> npm test` runs it on another engine.
`scene.mjs` is a `NullEngine` scene for tests that need meshes and no physics.

## The core (`src/core/`)

Body, muscle, locomotion, minds and rules live in `src/core/`; the pages (`src/arena/`,
`src/dungeon/`, `src/core-lab/`) build on it. It has these rules:

- **It reaches nothing but itself, `@babylonjs/core`, its engine's package, JSON under
  `assets/`, and the files its `TAKEN` list names with a reason**, whose own imports are held to
  the same rule. The pages import the core, never the reverse. `tests/core-boundary.test.mjs`
  walks the transitive imports, and holds each engine's package to its module in
  `src/core/engine/` (the seam: `engine.ts`'s contract, `engines.ts`'s list).
- **Every number in a spec says where it came from.** It is a `Quantity`
  (`src/core/spec/quantity.ts`): read from an entry of `SOURCES` (`src/core/sources.ts`: a paper,
  the owner's decision, an asset, a measurement or a sweep's table), or derived from other
  quantities by a named rule. A rule's code writes no factor; a factor is an input with a source.
  `specProvenanceFaults` (`tests/fixtures/spec.mjs`) holds every spec to this; a record since
  deleted is named with the commit that holds it (`path@commit`). A spec never spreads another
  family's spec; families share code, not values.
- **Tuning is immutable.** An experiment passes an override in; nothing mutates a global.
- **One world step** owns physics, control, combat and the clock, at 120 Hz (`PHYSICS_HZ`). The
  pages, the stand and the research all call it: `World.step` (`src/core/world.ts`), whose hooks
  replace scene observers; a page advances by real time with `World.advance`, which caps the steps
  a frame may take. A core world turns off the scene's own stepping, so `scene.render()` never
  advances it. Never test by calling `scene.render()` in a loop. (H06, H07, H13)
- **Solver conditioning is not anatomy.** An iteration count, inertia floor or damping term that
  exists for the solver is named as such (`SOLVER` in `src/core/engine/rapier.ts`), measured, and
  kept out of the body's numbers.

## Babylon and the engine

- **Side-effect imports are load-bearing.** The tree-shaken build omits prototype patches, so an
  "unused" import removed here compiles, passes `tsc` and breaks at runtime -- sometimes silently.
  Known members: the shadow, depth-renderer and post-process imports at the top of `src/arena.ts`
  and `src/forge-post.ts`; the shader imports in `src/forge-style.ts`; `Culling/ray.js` for
  `scene.pick`; the glTF loader imports; and, should particles return,
  `Particles/particleSystemComponent` (without it they emit nothing, and no error). When a feature
  works in the playground and not here, suspect this first.
  (H02, H17, H18, H21)
- **Read world transforms from `mesh.position` and `mesh.rotationQuaternion`.** `getWorldMatrix()`
  caches per render id and reading it stamps the id, so the first reader in a frame freezes every
  later one. `src/core/` must not use `getWorldMatrix()`, `absolutePosition` or
  `absoluteRotationQuaternion`; `tests/core-boundary.test.mjs` enforces it. From a console,
  `computeWorldMatrix(true)` every node you read. (H24)
- **Turn a vector with `applyRotationQuaternionToRef`, never `rotateByQuaternionToRef`**, which
  goes through a float32 `Matrix` (1e-8 m of noise, enough to ruin a differenced Jacobian);
  `tests/core-boundary.test.mjs` refuses the float32 path in `src/core/`. (H75)
- **A controller of a fast chain must ask for the motion under way** (`BodyDynamics.bias`), or a
  fast forearm throws the hand it holds. Rapier keeps a free body's angular momentum, so the bias
  carries each segment's gyroscopic torque, `w x I w` (`src/core/build/dynamics.ts`). (H74)
- **A joint's angles are the ones its limit reads.** Rapier's generic joint measures each angle on
  the joint's own axes, fixed in the parent (`jointAngles`, `src/core/build/joint-state.ts`); a
  range and a goal mean nothing unless read that way. Press a limit before trusting a reading of
  it. (H76)
- **Bodies never sleep**: a sleeping body reads a perfect zero. The engine contract says so and
  `tests/core-engine.test.mjs` holds the engine to it. (H08)
- **Build a jointed body in the pose its joints demand.** A joint that disagrees at construction
  is cleared by flinging the body. A driven limb that is not within a few millimetres of its own
  anchor is stuck on something, not badly posed. (H09, H12)
- **An engine's linear velocity is the centre of mass's**, not the node's. (H49)
- **A layer that forbids a pair also hides the evidence.** Zero self-contacts proves no pair was
  admitted, not that there is clearance; measure clearance geometrically. General self-collision is
  not a fix either: adjacent capsules overlap at their joints by construction. (H55, H57)
- **Observers are removed asynchronously**; a lifecycle census counts active observers. (H53)
- **A body part never disposes materials**: `dispose(false, false)`. The scene owns the palette;
  the human skins own only their own materials. `surface()` in `src/surface.ts` attaches a map only
  once it decodes, so a failed texture leaves a drawn mesh. (H19, H59)
- **Babylon cancels `pointerdown`**, which suppresses every compatibility mouse event of that
  gesture. Use pointer events. DOM controls over the canvas stop `pointerdown`/`pointermove`, let
  `pointerup` through, and blur on click. (H14, H15)
- **Button state is a level: read `event.buttons`.** Release edges are not guaranteed to arrive
  (`pointercancel`, release outside the window, hidden tab). Keep edges for one-shot actions. (H16)

## Browser checks

- **A hidden tab does not render**: no WebGL paint, no `requestAnimationFrame`, `scene.pick`
  misses. Check `document.visibilityState`, and `engine.frameId` frozen across a wait. A visual
  check from a background tab is possible by stepping by hand -- on the arena,
  `__arena.world.step()` -- and calling `scene.render()` yourself. (H03, H22)
- **Look at it before probing it.** `Material.isReady(mesh)` is false outside a render pass;
  `scene.materials` is incomplete (reach materials through `mesh.material`); after HMR the old
  scene lingers, so navigate rather than reload. (H20)
- **The dev server:** port 5180 is `strictPort`. Backgrounding it with `&` dies with the shell
  call; killing `npx` leaves `vite` running, so kill by PID (`netstat -ano | findstr ":5180"`).
  The owner's server on 5180 is not yours: do not restart it. (H04, H05)
- **After a mutation battery, verify what the dev server serves**
  (`await fetch("/src/core/world.ts").then(r => r.text())`) and re-touch stale modules; Vite can
  keep serving the mutated text. (H40)

## Node

- **The recipe:** a `NullEngine`, a `Scene`, and a core world on it
  (`createWorld(scene, await freshEngine())`); `core-stand.mjs` does this. Rapier's compat build
  carries its wasm inline, so Node and the browser load it alike.
- **Node imports `src/` directly.** Relative imports in anything a test loads carry `.ts`
  extensions, and TypeScript parameter properties are forbidden there (strip-only mode). Page-only
  modules may omit extensions. (H34)
- **Parallel runs need worker threads**, one sequential loop in each; count the shards a sweep
  actually ran before trusting it.

## Measurement

- **Name the harness in every figure.** Page and Node readings of identical code have differed by
  9 % on a transient, and why was never established. (H60)
- **A peak that does not say whether the striker was driven or struck means nothing**; exclude
  startup and the time after a contact. (H26)
- **Prefer an exclusion that times itself** over a fixed step count, and before calling a
  difference between two physics rates physical, read the faster rate at the slower one's spacing.
  (H66)
- **Test wobble with a sweep, not a jump.** A teleported target carries no momentum. (H23)
- **Instrument the call, not a side effect with a second cause.** (H51)
- **Believe the stand over the fight.** A flung weapon improves every bout column while the arm has
  stopped following its command. (H64)
- **A conclusion is void once its reference is corrected**, even if its number was right; keep the
  argument, not the digit. (H63)
- **Counts over a bout are not scale-free.** Prefer a rate, more bouts, or the verdict's ending;
  never pin a distributional claim to one seed. (H65)

## Tests

- **A green test can assert nothing.** Mutate the subject and watch it go red. Sample both sides of
  an asymmetric range; assert whole records, not a few leaves; choose a fixture that can exhibit
  the defect (take a real publication and make one stated edit). (H27)
- **Test the whole path, not its two ends**, and check a physical model's inputs reach it before
  declaring it failed. (H68)
- **A fixture may simplify the world but not describe one that cannot exist**, and a scripted
  mind's fallback behaviour is part of the fixture. (H36, H69)
- **Under CPU load a dropped test count is a timeout, not a regression.** Re-run on a quiet machine.

## Code shape

- **Switch on a union with a `never` default.** A ternary chain with a default branch silently
  substitutes. (H10)
- **A module that owns a rule exports its early-out predicate**; a caller's private copy of the rule
  drifts. (H42)
- **A copy that names its fields drops the ones added later.** (H68)
- **A published field needs a reader** -- or a named reader that is coming, written down. (H38, H44)
- **A comment about a code path is a hypothesis until the path is executed.** (H58)
- **Name the construct, not a line number**, in prose and comments.
- **A screen is an explicit argument, never inferred from a state machine.** In the arena, setup
  owns `#curtain`, pause owns `#pause-menu`, the verdict bar is `#bout-end`; a key that pauses
  never leaves for setup. (H30)
- **Pause freezes the world, not the camera, and grants no UI permission.** Camera orbit and zoom
  stay live; pause opens nothing but its own panel. (H29, H31, H32)
- **Two watchers on one body: set a flag in the callback and promote it next control step.** (H47)
- **A bout ends on a pool's ending or a fall**; which segments are vital is data (the spec's
  `wounds`, `src/core/rules/pool.ts`). (H52)
- **Test navigation on several seeds.** (H67)

## Line endings

This clone gets `core.autocrlf = true` from Git for Windows' system config; the repository has no
`.gitattributes`. The working copy is not the committed file, so check what is committed, not what
is on disk. Gate a commit on `git diff --numstat` equalling `git diff --ignore-cr-at-eol --numstat`;
a file where they differ has had its endings rewritten. H41 has a script that lists committed files
containing a CR.

## House rules

Each one was paid for; the full text is in [docs/history.md](docs/history.md).

- **A mind drives a body only through its command.** `Mind.decide` returns an `Intent`, which the
  body's skills carry out (`driveBy`, `src/core/mind/mind.ts`); nothing reaches past it to pose a
  joint. Camera state never reaches a mind.
- **A person commands and does not puppet.** In the crypt a person's orders reach the party only
  through the run's plan (`DungeonCommands`); each member's own mind carries them out while it
  defends itself.
- **Cosmetics never carry authority**: nothing decorative collides or decides a hit.
- **The visible room is not the collision arena.** `validateRoomPlacements` in
  `src/arena-room.ts` refuses a solid cosmetic that names no collider; do not bypass it.
- **No strength is raised for feel.** A muscle's strength and speed come from their source; a
  change to one carries its measured before/after table.
- **Every measurement names its harness.**
- **Commit each landable change as it lands.**
- **Recovery cannot require the support state it exists to restore.**

## Where the design lives

The argument for a number is its source (`SOURCES`) and the doc comment beside it, with the table
that chose it. `docs/` holds what belongs to no one file: plans in `docs/plans/`, dated analyses
in `docs/analysis/`, standing notes on assets and pages (`docs/workshop-fighter-integration.md`,
`docs/rogue-archer.md`, `docs/dungeon-reference.md`, `docs/character-lab/`) and the history behind
this file. A plan or analysis that is finished or superseded is deleted, not kept; what cites it
names the commit that still has it.

The rules of a fight -- what a blow's energy is worth, and what a wound takes -- are
`src/core/rules/`, the rulebooks in `rulebook.ts`, kept free of the page so they can be argued with
in `tests/core-rules.test.mjs` and `tests/core-blows.test.mjs`.
