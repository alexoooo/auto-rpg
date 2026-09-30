# Working on Auto-RPG

This repository is the game: physically simulated, AI-driven melee in the browser, on Babylon.js 9
and Rapier. Bodies of jointed segments, driven by muscles, fight in an Arena and a generated
Crypt. `README.md` says what the game is and how to play it; `docs/architecture.md` says how it is
built; `docs/roadmap.md` says where it is going. This file is the rules for working here.

## Commands

```powershell
npm ci        # not `install`: the exact lockfile
npm run dev   # http://localhost:5180, strictPort
npm run check # tsc --noEmit
npm test      # node --test tests/*.test.mjs
npm run build # check, then vite build
```

Run `npm test`, `npm run check` and `npm run build` before landing a change, and commit each
landable change as it lands. Do not leave a development server running. Port 5180 may be the
owner's server: do not restart or kill it; if you need your own, use `npm run preview` on another
port and kill it by PID when done.

**Pages.** Every page is named in `vite.config.ts`'s `rollupOptions.input`; a page missing there
works in dev and is absent from `dist`.

- `/` (`index.html`, `src/app.ts`): the main menu; the arena at `?play=arena`
  (`&matchup=left,right` opens a bout, `src/arena/`); the crypt at `?play=dungeon`
  (`src/dungeon/`); the lab at `?play=lab` (`&scenario=` runs one, `src/core-lab/scenarios.ts`).
  Each screen is a `<template>` mounted once per page load; changing screen is a navigation.
- `/character-lab.html`: the character workshop viewer.
- `/physics-bench.html`: the physics bake-off's cases on MuJoCo and Rapier (`src/physics-bench/`,
  `research/physics-bakeoff/`).

## The core (`src/core/`)

Bodies, muscles, motor control, skills, minds and the rules of a fight live in `src/core/`. The
screens build on it; it never imports them.

- **The core reaches only itself**, `@babylonjs/core`, its engine's package and JSON under
  `assets/`. `tests/core-boundary.test.mjs` walks the transitive imports and holds the engine's
  package to its module in `src/core/engine/` (`engine.ts` is the contract, `engines.ts` the list).
- **Every number in a spec says where it came from.** It is a `Quantity`
  (`src/core/spec/quantity.ts`) read from an entry of `SOURCES` (`src/core/sources.ts`: a paper,
  an asset, a measurement -- a sweep's table among them -- or the owner's decision) or derived
  from other quantities by a named rule. A rule's code writes no factor; a factor is an input with
  a source.
  `specProvenanceFaults` (`tests/fixtures/spec.mjs`) enforces this. A record in a file that has
  since been deleted is written `path@<commit>`. A spec never spreads another family's spec.
- **Tuning is immutable.** An experiment passes an override in; nothing mutates a global.
- **One world step** owns physics, control, combat and the clock, at 120 Hz: `World.step`
  (`src/core/world.ts`). Pages, tests and research all call it; a page advances by real time with
  `World.advance`. The scene has no physics of its own (the core's engine is not Babylon's
  plugin), so `scene.render()` never advances the world, and a test never steps by rendering.
- **Solver conditioning is not anatomy.** An iteration count, inertia floor or damping term that
  exists for the solver is named as such (`SOLVER` in `src/core/engine/rapier.ts`) and kept out of
  the body's numbers.
- **No strength is raised for feel.** A muscle's strength and speed come from their source; a
  change to one carries its measured before/after table.
- **A mind drives a body only through its command.** `Mind.decide` returns an `Intent`, which the
  body's skills carry out (`driveBy`, `src/core/mind/mind.ts`); nothing reaches past it to pose a
  joint, and camera state never reaches a mind. A person gives orders; a body's own mind carries
  them out while it defends itself.
- **Cosmetics never carry authority**: nothing decorative collides or decides a hit. The visible
  room is not the collision arena; `validateRoomPlacements` (`src/arena-room.ts`) refuses a solid
  cosmetic within reach that names no collider, or names one the arena lacks.

## Babylon and Rapier

- **Side-effect imports are load-bearing.** The tree-shaken build omits prototype patches, so an
  "unused" import removed here compiles and breaks at runtime, sometimes silently: the shadow,
  depth-renderer and post-process imports in `src/arena.ts` and `src/render/post.ts`, the shader
  imports in `src/forge-style.ts`, `Culling/ray.js` for `scene.pick`, the glTF loader imports.
  When a feature works in the playground and not here, suspect this first.
- **Read world transforms from `mesh.position` and `mesh.rotationQuaternion`.** `getWorldMatrix()`
  caches per render id and reading it stamps the id, so the first reader in a frame freezes every
  later one. The core may not use `getWorldMatrix()`, `absolutePosition` or
  `absoluteRotationQuaternion` (the boundary test enforces it). From a console, call
  `computeWorldMatrix(true)` on every node you read.
- **Turn a vector with `applyRotationQuaternionToRef`**, never `rotateByQuaternionToRef`, which goes
  through a float32 matrix: enough noise to ruin a differenced Jacobian. The boundary test refuses it
  in the core.
- **A controller of a fast chain asks for the motion under way** (`bias` in `bodyDynamics`,
  `src/core/build/dynamics.ts`, gyroscopic torque included), or a fast forearm throws the hand it
  holds.
- **A joint's angles are the ones its limit reads** (`jointAngles`, `src/core/build/joint-state.ts`).
  A range or a goal means nothing unless read that way; press a limit before trusting a reading.
- **Bodies never sleep**: a sleeping body reads a perfect zero. `tests/core-engine.test.mjs` holds
  the engine to it.
- **Build a jointed body in the pose its joints demand.** A joint that disagrees at construction is
  cleared by flinging the body.
- **An engine's linear velocity is the centre of mass's**, not the node's.
- **Zero self-contacts proves only that no pair was admitted**, not that there is clearance; measure
  clearance geometrically. Adjacent capsules overlap at their joints by construction.
- **Materials belong to the scene.** A body part disposes with `dispose(false, false)`; a skin owns
  only its own materials.
- **Use pointer events.** Babylon cancels `pointerdown`, which suppresses every compatibility mouse
  event of that gesture. Button state is a level: read `event.buttons`, since release events are
  not guaranteed.

## Checking in a browser

- **A hidden tab does not render**: no WebGL paint, no `requestAnimationFrame`, `scene.pick`
  misses. Check `document.visibilityState`. From a background tab, step the world by hand and call
  `scene.render()` yourself.
- **Look at it before probing it.** `Material.isReady(mesh)` is false outside a render pass;
  `scene.materials` is incomplete (reach a material through `mesh.material`); after a hot reload
  the old scene lingers, so navigate rather than reload.

## Node and tests

- **Node imports `src/` directly.** Relative imports in anything a test loads carry the `.ts`
  extension, and TypeScript parameter properties are forbidden there (Node strips types only).
- **The headless stand** (`tests/harness/core-stand.mjs`): `coreStand(spec)` builds one body on a
  ground in a world of its own; `createWorld(scene, await freshEngine())` makes a bare world.
  `CORE_ENGINE=<name> npm test` runs the stand on another engine.
- **A green test can assert nothing.** Mutate the subject and watch it go red. Assert whole
  records, sample both sides of an asymmetric range, and choose a fixture that can show the defect.
- **Test the whole path, not its two ends.** A fixture may simplify the world but not describe one
  that cannot exist.
- **Test navigation on several seeds**; one generated map proves little.
- **Parallel runs need worker threads**, one sequential loop in each.
- **Under CPU load a dropped test count is a timeout**, not a regression; re-run on a quiet machine.

## Measurement

- **Name the harness in every figure** (Node stand or page, engine, rate). Page and Node readings
  of the same code have differed.
- **Say whether a peak was driven or struck**, and exclude startup and the time after a contact.
- **Before calling a difference between two physics rates physical**, read the faster rate at the
  slower one's spacing.
- **Believe the stand over the fight**: a flung weapon improves every bout column while the arm
  has stopped following its command.
- **Counts over a bout are not scale-free.** Prefer a rate or more bouts; never pin a
  distributional claim to one seed.

## Code

- **Comments say what the code is**, and why where that is not obvious, in the present tense. Never
  in a comment: work sessions, plan stages, commit hashes, dates of change, what the code used to
  do, or code and engines that no longer exist. The story of a change goes in its commit message.
  `tests/comments.test.mjs` refuses the common markers.
- **A tuned constant's comment says what it does and where its value came from**: a `SOURCES` entry
  or a record under `docs/reference/`. The sweep table lives in the record, not the code.
- **Name the construct, not a line number.**
- **Switch on a union with a `never` default**; a ternary chain with a default branch silently
  substitutes.
- **A module that owns a rule exports its predicate**; a caller's private copy drifts.
- **A copy that names its fields drops the ones added later.**
- **A published field needs a reader**, or a named reader that is coming, written down.
- **A screen is an explicit argument, never inferred from a state machine.** Pause freezes the
  world, not the camera, and opens nothing but its own panel.
- **Two watchers on one body: set a flag in the callback and act on it at the next control step.**
- **Recovery cannot require the support state it exists to restore.**

## Documents

- `README.md`: the game, for people. `AGENTS.md`: this file.
- `docs/architecture.md`: how the game is built, in the present tense.
- `docs/roadmap.md`: the direction and the open items.
- `docs/plans/`: only plans being carried out, each directly implementable (exact files,
  constructs, tests, commands), split into chunks that land green. A plan is deleted when it
  lands; code and comments never cite a plan.
- `docs/reference/`: records that code and `SOURCES` cite: sweep tables, measurements, reference
  data.
- `docs/art/`: how the art is made and rebuilt: `crypt.md`, `characters.md`, `skeleton.md`.

A document that is wrong is corrected or deleted, not annotated.

## Line endings

This clone has `core.autocrlf = true` and the repository has no `.gitattributes`, so the working
copy is not the committed file. Gate a commit on `git diff --numstat` equalling
`git diff --ignore-cr-at-eol --numstat`; a file where they differ has had its endings rewritten.
