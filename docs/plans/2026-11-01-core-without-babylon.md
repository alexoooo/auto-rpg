# The core without Babylon

## Why

The owner's direction (2026-11-01): the simulation is not coupled to the graphics layer. Today the
core (`src/core/`) imports `@babylonjs/core` for three things, none of them drawing:

- **Vector maths**: `Vector3` and `Quaternion` in 96 of its files and in 4 of the entrants', held to
  the members read and found exact (`EXACT_BABYLON`, `tests/core-boundary.test.mjs`).
- **A pose holder**: each segment, item and task target is a `TransformNode` whose `position` and
  `rotationQuaternion` the engine writes after each step (`PhysicsWorld.addBody`,
  `src/core/engine/engine.ts`) and everything reads.
- **A container for the nodes**: `World.scene` (`createWorld(scene, engine)`, `src/core/world.ts`),
  so every headless run (the evaluation's bouts, the Crypt run and the falls, the world workers,
  the test stand, the fingerprint, research) builds a Babylon `NullEngine` and `Scene` that
  nothing draws.

Once the core is free of them:

- the world worker and the mind workers ([Minds in parallel](2026-11-01-parallel-minds.md)) load
  nothing of Babylon; a mind's mirror needs no scene either way, since a mind reads its body's
  poses through `ReadNode` (`src/core/read-body.ts`), plain fields;
- a Babylon upgrade cannot move a bout: the core's arithmetic is its own, read once;
- the renderer is the pages' choice alone, a question of `src/render/`, `src/arena/`,
  `src/dungeon/`, `src/lab/` and the other pages, never of the core or of recorded evidence.

Switching renderer is not part of this plan.

## Where it starts

At `89518e3c`:

| What imports Babylon | Files |
|---|---|
| `src/core/`: `Maths/math.vector.js` / `scene.js` / `Meshes/transformNode.js` | 96 / 9 / 7 (100 in all) |
| `src/entrants/`: maths | 4 |
| Pages (`src/render`, `arena`, `dungeon`, `lab`, `evaluation`, `worker` and the rest) | about 90 |
| `research/`: maths / `NullEngine` or `Scene` / calls `createWorld` | 288 / 42 / 34 |

- The core reads a node's `position` and `rotationQuaternion` only (161 reads), its `name` (9) and
  `dispose` (4). `rotationQuaternion` is nullable on a `TransformNode`, hence the `!` at most reads.
- Pages hang meshes on the core's own nodes where a world runs on the page: the Lab
  (`src/lab/`), the Control foundation (`src/control-foundation/tasks.ts`), the shapes and skins
  (`src/render/body-shapes.ts`, `skinned-art.ts`, `robot-skin.ts`, `skeleton-skin.ts`). Where the
  world is in a worker (the Arena, the crowd fight, the Crypt), the page draws a puppet
  (`puppetBody`, `src/render/puppet.ts`) it poses from what the worker sends.
- The Lab's history (`recordHistory`, `src/lab/history.ts`) shows a past frame by writing it into
  the simulated body's nodes.
- `Quaternion.RotationQuaternionFromAxis` (the built body's frames, `src/core/build/build-body.ts`;
  held items, `src/core/human/equipment.ts`) goes through Babylon's `Matrix`, which stores
  `Float32Array` (`PerformanceConfigurator.MatrixCurrentType`): the normalized axes are rounded to
  float32 before the quaternion is read from them.

## Steps

Each step is a refactor that claims no change of play: its check is `npm run check`, `npm test`,
`npm run build` and the fingerprint (`scripts/fingerprint.mjs --compare`) against a record written
once at the commit before step 1 and kept in `.tmp/core-without-babylon/` until the plan lands.
The steps run in one stretch, with no change of play landing between them, or the record is void.

1. **The core's own vector maths.** `src/core/math/vector.ts`: `Vector3` and `Quaternion` with plain
   number fields and the members the core and the entrants call (the `EXACT_BABYLON` list and the
   statics beside it: `Identity`, `Inverse`, `InverseToRef`, `RotationQuaternionFromAxis`, `Cross`,
   `CrossToRef`, `Dot`, `Distance`, `Up`, `UpReadOnly`, `Right`, `Forward`), each copied from
   `@babylonjs/core` 9.33.1 (`Maths/math.vector.pure.js`) operation for operation.
   `RotationQuaternionFromAxis` keeps the float32 rounding with `Math.fround` (in `EXACT_MATH`
   already); dropping it changes play and is not this plan's. The imports under `src/core/` and
   `src/entrants/` move to it, with the same names. Where `tsc` names a page handing a core vector
   to Babylon or the reverse, it converts by fields. A research script passing Babylon vectors in
   keeps working (the same members, the same arithmetic); one calling a Babylon-only member on a
   core vector is fixed when it is next run.
   Check: the fingerprint, every line as before.
2. **Every page draws a mirror.** A page with a world of its own draws each body through a puppet,
   each held item and task target through a node of its own, posed from the simulated poses
   before each render, as the worker pages already do; nothing on a page is parented to a core
   node. The Lab's history poses the mirror, never the simulated body. The core is unchanged.
   Check: the Lab's scenarios, the Control foundation, the character lab, the Arena, the crowd
   fight and the Crypt looked at in a browser, briefly, each drawing as before and the Lab's
   scrubbing showing past frames.
3. **Poses without nodes.** The core's `Pose` (`position: Vector3`, `rotation: Quaternion`, never
   null, and a name) replaces `TransformNode` in the engine's contract (`addBody(pose, …)`,
   `SegmentBody.pose`), the built body's segments (`segment.pose`), equipment items and the task targets
   (`src/core/tasks/defense.ts`, `swing-target.ts`); `ReadNode` (`src/core/read-body.ts`) stays
   the read side. `World` has no scene: `createWorld(engine, options)`. Every caller in `src/`,
   `tests/` (`tests/harness/core-stand.mjs`), `scripts/` and `research/` follows, by symbol
   rename where typed and a reviewed mechanical rewrite in research's `.mjs`; the headless
   builders (`src/evaluation/bout.ts`, `crypt.ts`, `fall.ts`, `src/worker/crypt-stage.ts`, the
   fingerprint) build no `NullEngine` or `Scene`.
   Check: the fingerprint, every line as before.
4. **The boundary closes.** `tests/core-boundary.test.mjs` refuses any `@babylonjs/*` import
   under `src/core/` and `src/entrants/`; `EXACT_BABYLON` and its probe go, and the exact-math
   walk's own probe shows `vector.ts` held like the rest of the core (a `Math.sin` written into it
   refused). The documents follow: AGENTS.md's core rules and the Babylon section's core-only
   ones, the architecture's opening and its turns, the roadmap's Framework item on headless
   scenes. Check: `npm test`; the documents' check.

## Done when

- No file under `src/core/` or `src/entrants/` imports `@babylonjs/*`, and the boundary test holds it.
- No headless run and no world worker builds a Babylon engine or scene.
- Every fingerprint line is as it was at the commit before step 1.
- Every page draws as before; the owner sees it.
