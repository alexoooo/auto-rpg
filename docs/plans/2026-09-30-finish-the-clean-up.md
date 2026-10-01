# Finish the clean-up: the rest of the code reads like the core

Status: chunks 0 to 5 and 6c have landed. Surveyed at 144961d4.

The clean-up after the old path left these. The crypt generator and the character workshop are
dense one-liners. `stanceControl` and the crypt page's `boot()` are each one long closure. About
165 exports have no importer. Some unions fall through to a default. Tuned constants on the
screens, and a few in the core, name no source. There are also a handful of small faults.

This plan fixes them without changing what the game does. Every chunk but the ones marked
otherwise leaves the fingerprint (chunk 0) bit-identical.

**Not in this plan:** the structure of the minds and skills (`src/core/mind/`,
`src/core/skills/`). That is [the minds set](2026-09-30-minds-00-design.md)'s. This plan touches
those files only to:
- drop an `export` (chunk 4);
- correct a comment or cite a source (chunk 6).

**Beside the minds set.** The two are carried out together, in this order:
1. minds 01 (landed), then chunk 0, which hashes with its trace (`traceOf`, `tests/harness/trace.mjs`);
2. chunks 1 to 5 and 6c: the small faults and the guards, so that the minds' code meets the
   guards as it is written;
3. minds 02 to 04;
4. chunk 11, then minds 05: the stance is split before the assist goes into it;
5. minds 06 to 08;
6. the rest (6a, 6b, 6d, 7 to 10, 12), whenever the minds set waits on the owner.

No commit carries work of both. A minds commit changes the fingerprint where it means to change
how a bout plays, and says so; a commit of this plan does not.

## Rules for every chunk

- **Gates.** Each chunk is one or more commits. Each commit runs, from the repository root:

  ```powershell
  npm run check && npm test && npm run build && node scripts/fingerprint.mjs > $env:TEMP\fp-after.txt
  ```

  Every line `fp-after.txt` shares with the output at the parent commit must be equal, unless
  the chunk says otherwise. A commit that adds a fingerprint line (chunks 7.3, 7.7 and 8.1)
  adds it before the change it guards, in a commit of its own.
- **Line endings.** `git diff --cached --numstat` equals `git diff --cached --ignore-cr-at-eol
  --numstat`.
- **Tests.**
  - No test fails and three are todo, before and after every commit. The count moves with the
    minds set's commits, so a chunk that adds or removes tests says by how many.
  - A new guard test also gets a control: the guard fed a real bad case, which it must refuse.
- **Code.** Comments follow AGENTS.md's "Code" section. A switch over a union ends in
  `default: { const never: never = x; throw new Error(...) }`, as in `src/render/body-shapes.ts`.
- **No servers left running.** A browser check uses `npm run preview -- --port 5183
  --strictPort` and kills the server by its PID (`netstat -ano | findstr :5183`). Never touch
  5180.

## Chunk 0: a fingerprint, committed

**`scripts/fingerprint.mjs` (new).** It prints one line per case, each line a SHA-256 prefix,
on the Node world (Rapier, 120 Hz). It reads no clock and no `Math.random`.

**A pose hash** here is `traceOf`'s digest (`tests/harness/trace.mjs`): every segment's
`node.position` and `rotationQuaternion`, taken after every step of the case and not only at
its end. A change that two bodies recover from within the case still changes the line.

- **Arena.** For each of `workshop-fighter v workshop-rogue`, `crypt-skeleton v
  workshop-fighter` and `workshop-rogue v crypt-skeleton`:
  - `buildBout({ left, right, capSeconds: 30 })` (`research/bout.mjs`), stepped to its verdict
    with a trace of both sides' bodies;
  - print the verdict, both `pool.bar()`s, `blows.length` and the pose hash;
  - then step 2 s more, the trace still taken, and print the pose hash again. (A bout that ends
    by a fall goes on moving, and so does the stance under it.)
- **Crypt fights.**
  - Seeds 1 and 2. Run `new DungeonRun(scene, { seed, engine, visuals: false, layout })` for
    12 s, where `layout` places the start 4 m from the first spawn on open floor (`walkable`
    and `clearSegment` from `src/dungeon/map.ts`; try 16 headings).
  - Print `status`, `blows.length` and the pose hash of every actor's body.
- **The lab.** For `workshop-fighter` and `workshop-rogue`, each on `coreStand(humanSpec(model),
  { ground: true })`:
  - `startRun(built, world, trackOf(TRACKS.circle.pieces))` for 10 s (as
    `tests/lab-run.test.mjs` builds it). Print the pose hash.
  - `startRoutine(built, world)` for 20 s at 120 Hz. Print the routine's `strikes.length`
    and the pose hash.
- **Crypt generation.**
  - Hash `JSON.stringify(generateCryptDungeon(seed))`, with `map.floor` turned into an array,
    over seeds 0-99 and 2124530852.
  - Hash `generateLevel(seed)` over seeds 0-19.
- **Sight.** For seeds 1-8, take `map = generateCryptDungeon(seed).map` and
  `findPath(map, map.start, map.exit, 0.35)` (`src/dungeon/map.ts`).
  - Start with an empty `explored` and `memory`.
  - Walk the path, reading every 0.5 m: the path's own points are two to seven, too few to
    see past a pillar. At each point `p`, call `visible = reveal(map, p, explored)`, then
    `revealScenery(map, p, visible, explored, memory)`.
  - Hash the sorted `memory` after each call.
  - What it holds, by mutation: the `.35` corner samples, the 12-cell reach and whether the
    enclosed-gap rule runs at all. It does not hold that rule's 4-cell bound: over seeds 1-300
    no walk meets an enclosed gap of 3 to 5 cells, and `tests/crypt-detail.test.mjs` fills a
    gap of one cell only. Chunk 7 step 6 adds the test before it names the number.

The header says what the script is for: a structural change must leave its output unchanged.
It is not a test, because a deliberate behaviour change changes it.

**Commit:** `A fingerprint of fights, runs and generated levels, for structural changes`.

## Chunk 1: small faults

Do this as one commit, or one commit per bullet.

- **`.gitignore`:** delete the "Legacy Rust build output" comment and `/target/`. Nothing
  builds Rust here, and `target/` is gone.
- **`character-lab.html`, the `#speed` `<select>`:** the options read `· speed` twice. Make
  them `&frac14; speed` and `&frac12; speed`.
- **`research/core-routine-battery.mjs`:**
  - `--models crypt-skeleton` crashes in `workshopEnvelope` (`PRINTED[model]`,
    `src/core/human/envelope.ts`), because the script calls `humanSpec(model)`.
  - Call `modelSpec(model)` from `src/core/human/spec.ts` instead. Refuse a `--models` entry
    that is not in `BODY_MODELS`, by name.
  - Run it with `--models crypt-skeleton` for one trial to see it start.
- **Roadmap-style comments:**
  - `src/lab/scenarios.ts`, the `LAB_HELD` doc: drop "The core has no two-handed grip yet."
    Add "A two-handed grip" to `docs/roadmap.md`'s "Body and motor control" list.
  - `tests/crypt-core.test.mjs`, the comment before `assert.equal(enemy.alive, false, ...)`:
    replace it with what ends the fight today (a fall or an emptied pool).
- **Stale shield comments.** A clash is a hand meeting a hand (`src/core/rules/blows.ts`).
  Correct these to say what plays and why:
  - `src/audio/cues.ts`: "A clash (two weapons meeting) plays the shield's knock."
  - `src/audio/game-audio.ts`: "A held shield is damped by its grip and the body behind it".
- **Two writers of the arena's hardware scaling level:** the 1920 x 1080 cap in
  `src/arena/forge-style.ts`, and `1 / min(devicePixelRatio, 1.5)` in `src/arena/main.ts`.
  - `loadForgeStyle`'s call runs later and wins. Delete `src/arena/main.ts`'s
    `setHardwareScalingLevel` call.
  - Check the arena in the browser at the same window size before and after. The fingerprint
    does not cover rendering.

- **The bench's two `median`s stay two.**
  - `src/physics-bench/main.ts`'s local `median` averages the two middle values.
  - `src/physics-bench/math.ts`'s `median` is `percentile(xs, 50)`.
  - They differ on even lengths, and the bench's figures use both, so merging them would
    change figures. Rename the page's to `midMean`, with a one-line comment saying what it
    is, so the two read as different things.

## Chunk 2: one DOM helper

The private helpers return null for a missing element and fail later. `need()` (`src/dom.ts`)
throws on a missing id. Replace each helper with `need()`:

- `const $ = (id) => document.getElementById(id)!` in `src/lab/main.ts`, `blow-scenario.ts`,
  `routine-scenario.ts`, `run-scenario.ts` and `stance-scenario.ts`;
- `$` in `src/physics-bench/main.ts`;
- `el` in `src/character-lab/main.ts`.

Where a caller casts the result (`as HTMLSelectElement`), keep the cast at the call:
`need<HTMLSelectElement>("speed")` if `need` is generic, otherwise a cast.

**Check in the browser:** each lab scenario, `physics-bench.html` and `character-lab.html`
open with no console error.

## Chunk 3: unions with a `never` default, and the unused sounds

- **`src/audio/game-audio.ts`.**
  - Export `type Sound = SoundKind | "air" | "fire" | "drip" | "debris"`.
  - `private buffer(kind: string)` becomes `buffer(kind: Sound)`. Its switch's `default: value
    = 0` becomes the `never` default.
  - The duration ternary in `play` (`kind === "metal" ? .22 : kind === "debris" ? .4 : .26`)
    becomes a `Record<Sound, number>`.
- **Unused sounds.**
  - `SoundKind` (`src/audio/cues.ts`) drops `"metal"` and `"stone"`. Only
    `tests/audio.test.mjs` produces them.
  - Delete their synthesis cases and durations.
  - Move those tests onto `"bone"`, `"body"` and `"shield"`, keeping what each asserts.
- **`src/render/surface.ts` `attachMap`:** the `if` ladder over `TextureChannel` becomes a
  switch with `case "orm"` and the `never` default.
- **`src/arena/room.ts`.** The role's type is `RoomPlacement["role"]`; name it
  `type RoomRole = RoomPlacement["role"]`. Then make each of these a switch, or a
  `Record<RoomRole, ...>` where every case is a value:
  - `roomSource`'s `if` ladder over `role`, which ends in a bare `else` (debris);
  - the `axis === "x" ? toX : axis === "y" ? toY : toZ` chain;
  - the material ternary `group.role === "wall" ? ... : group.role === "banner" ? ... :
    materials.timber`, where beam, rack and debris all become timber.
- **A model's sound:** `struck?.model === "crypt-skeleton" ? "bone" : "body"` in
  `src/arena/main.ts` and `src/dungeon/main.ts`.
  - Export `SURFACE_SOUND: Readonly<Record<BodyModel, SoundKind>>` from `src/audio/cues.ts`.
  - Both read it as `struck ? SURFACE_SOUND[struck.model] : "body"`, so that a missing
    `struck` sounds as it does today.
  - The model tests in `src/render/dress.ts` and `src/lab/main.ts` choose a skin, not a
    sound, and stay.
- **`src/dungeon/main.ts`.** The status is the inline union on `DungeonRun`. Export
  `type RunStatus = "playing" | "won" | "dead"` from `src/dungeon/run.ts`, and type
  `DungeonRun.status` with it.
  - Add `pauseTitle(status: RunStatus, party: number): string` as a switch with the `never`
    default.
  - Add `usesReferenceLook(scenario: DungeonScenario): boolean`, also a switch: `generated`
    is false; `reference` and `random-crypt` are true.
  - Add `scenarioOf(text: string): DungeonScenario`, which throws on an unknown value.
  - Replace these with the new functions:
    - the ternary at the pause title;
    - `reference = selectedScenario !== "generated"`, and the two `scenario.value !==
      "generated"` tests in `chooseScenario`;
    - the `as DungeonScenario` cast.

The crypt's own unions (`cryptFurniture`, `CryptWeathering`) are chunk 7.

**Fingerprint:** identical. Audio is not in it.
**Tests:** `tests/audio.test.mjs` keeps its count.

## Chunk 4: no export without an importer, and a guard

**Delete:**
- `v3` in `src/physics-bench/math.ts`;
- the re-export `export { ATTACK_METRES }` in `src/dungeon/run.ts`;
- `export { companionSpawn } from "./party-placement.ts"` in `src/dungeon/run.ts`, with
  `tests/dungeon-party.test.mjs`'s import of it pointed at `src/dungeon/party-placement.ts`
  in the same commit;
- `export type { Fist }` in `src/lab/routine.ts`.

**Drop `export`** from the 163 symbols used only inside their own module. The full list, by
module, is in the survey below ("Exports used only in their own module"). After this, a
comment that cites one of these names still names a real construct.

**Keep** the exports used only by `tests/`, `research/` or `scripts/`. A test reading a
module's table is a real reader.

**`tests/exports.test.mjs` (new).**
- **Program.** One `ts.createProgram` over `src/**/*.ts`, `tests/**/*.mjs`, `research/**/*.mjs`,
  `scripts/**/*.mjs` and `vite.config.ts`. Compiler options: `allowJs`,
  `allowImportingTsExtensions`, `moduleResolution: Bundler`, `noEmit`, `types: []`.
- **Marking.** Walk every source file and mark `checker.getAliasedSymbol(...)` (or the symbol
  itself) for:
  - each `ImportSpecifier`, and each `ExportSpecifier` that has a `moduleSpecifier`;
  - the property of a namespace access (`import * as X`, then `X.name`);
  - each `BindingElement` of an object pattern over an `await import(...)` or a
    `Promise.all([import(...)])`, through `getTypeAtLocation` of the pattern;
  - a property read on a dynamic import's module in a `.then` callback, as in
    `import("./rapier.ts").then((m) => m.loadRapier())` (`src/core/engine/engines.ts`, the
    only reader of `loadRapier`): any property access whose object's type is a module's
    namespace;
  - the qualifier of an `ImportTypeNode`.
- **The assertion.** Unused means a module's `checker.getExportsOfModule` minus the marked
  set. Assert `deepEqual(unused, [])`. If a real exception turns up, add an `ALLOWED` list of
  `"path name"` strings, each with its reason.
- **Controls.**
  1. A virtual `CompilerHost` fixture with one file per import shape above (the `.then` shape
     included), plus one export nobody imports. Assert that exactly that one export is
     reported.
  2. Overlay the host's `readFile` on the real tree so `src/dom.ts` gains `export const
     probe = 1`. Assert that `probe` is reported.
- **Time.** It runs in about 5 s. A `findReferences` pass is too slow for a test; do not use
  one.

**Tests:** +1 file (330 or more tests).

## Chunk 5: the world-matrix guard, by type

`tests/core-boundary.test.mjs` bans `getWorldMatrix(`, `.absolutePosition`,
`.absoluteRotationQuaternion` and `computeWorldMatrix(` by regex. It misses Babylon calls that
read the same cached matrix:
- `getAbsolutePosition`/`ToRef` and `getDirection`/`ToRef`;
- the `forward`, `up` and `right` getters;
- `getAbsolutePivotPoint`/`ToRef`, `absoluteScaling` and `worldMatrixFromCache`;
- `getPositionInCameraSpace` and `getDistanceToCamera`.

A regex on `.right` would catch the core's own `hand.right`.

- **Add a checker test** beside the regex. In the same program shape as chunk 4, but over
  `src/core/**` only, flag any property access or call with a name in that list whose
  symbol is declared on `@babylonjs/core`'s `Node`, `TransformNode` or `AbstractMesh`.
  `getWorldMatrix` and `worldMatrixFromCache` are declared on `Node` (`node.d.ts`), the rest
  in `transformNode.pure.d.ts`.
- **Keep the float32 ban** (`rotateByQuaternionToRef`) as it is.
- **Control:** an overlaid `src/core/world.ts` reading `node.forward` and calling
  `getAbsolutePosition()` is refused for both. `hand.right` on a plain record is not.
- The core uses none of these today, so the guard is green at once.

## Chunk 6: every tuned constant names its source

**Scheme.** There are no new `Quantity`s on the screens: cosmetics carry no authority, and
nothing would read them.
- **Core control, skill and mind constants:** cite a section of `docs/reference/`, as
  `stance-tuning.ts` already does.
- **Screen look and sound:** cite one record, `docs/reference/look.md` (new), with one section
  per area. Each section lists the constants with their values, and whose choice they are. A
  value the owner has not confirmed is written "kept as found; the owner to confirm", as the
  `skeleton-placeholders` source is.
- **Screen game rules** (they decide outcomes, so they are not look): cite
  `docs/reference/play.md` (new).
- **Numerics:** a solver iteration cap, a tolerance or a floor is named, with "a numeric
  setting" or "solver conditioning" in its comment, as `LEG_DAMPING` is.
- **Void measurements.** Where a measurement was made on Havok, or on the deleted path, the
  record says the value is set rather than measured. That applies to `WAKE_METRES`'s e029c1e7,
  and to `SET_UPON` and `AIM_COSINE`'s c4c71cb8. The measurements to make go on the roadmap.
  Measuring is not this plan.

**6a. The core.** Comments and records only. These values do not change.

| Constant | File | Cite |
|---|---|---|
| `STANCE_LOWER` 0.03 m | `src/core/skills/locomotion.ts` | `stance-tuning.md#stance-height` (new section): every table in the record was measured 3 cm under. |
| `FALLEN` 0.25 m | same | `stance-tuning.md#fallen` (new): the batteries' fall bar. |
| `TURN_LEAD` 1 s | same | `human-and-strikes.md#turn-lead` (new): set, with its argument; a sweep goes on the roadmap. |
| `PLACING.near` 0.02 m | same | `human-and-strikes.md#placing` (new). The comment's "Provisional, until..." goes, and the record says it is set. |
| `APPROACH.seconds`, `.reach` | `src/core/skills/strike.ts` | `human-and-strikes.md#approach` (extend it beyond `pace`). |
| `ATTACK_METRES` 1.8 m | `src/core/mind/fighter.ts` | `human-and-strikes.md#attack-distance` (new): the club blow's 1.05 m `distance` (`assets/core/strikes.json`) plus about one step; set. |
| the inline 0.08 dead band | `src/core/mind/fighter.ts` | A comment on that line saying what it is. It stays inline: the mind's code does not change in this plan. |
| `GUARD` | `src/core/skills/guard.ts` | `human-and-strikes.md#guard` (new). Say that `REPERTOIRE` was searched from it, so changing it voids the recipes. |
| `CONTACT_FRICTION` 0.5 | `src/core/engine/engine.ts` | A `SOURCES` entry for Rapier's documented default friction, plus `stance-tuning.md`. |
| `IK_*` | `src/core/control/kinematics.ts` | The numerics say "a numeric setting". `IK_POSTURE_PULL` and `IK_TURN` shape the arm's path: cite `human-and-strikes.md#ik` (new), set. |
| inline floors, tolerances, iteration caps | `gait.ts`, `stance.ts`, `rigid.ts` (64 Jacobi sweeps) | One line each: a numeric setting. |

**6b. The screens.**
- **Hoist** the inline look numbers into named module-scope records, keeping the values and
  the order of every expression that uses them:
  - `ARENA_LIGHT` (`buildArena`, `src/arena/scene.ts`);
  - `GRADE` (`postPipeline`, `src/render/post.ts`);
  - `FORGE_FIRE` (`dressForgeRoom`, `src/arena/forge-room.ts`);
  - `MIX` (`src/audio/game-audio.ts`);
  - `CAMERA` (`src/dungeon/camera.ts`).
- **Cite `look.md#<area>`** from each of those, and from `DUNGEON_LOOK`, `REFERENCE_LIGHT`,
  `FOG_LOOK`, `STONE_LOOK`, `CUT_AWAY`, `MASONRY`, `DRESSING`, `PAINT`/`ATLAS`,
  `CRYPT_ROOM_LOOK`, `BASE` (`src/render/materials.ts`), the tints in `body-shapes.ts`, and
  `BONE`/`RUNE`/`EYE` in `skeleton-skin.ts`.
- **What `look.md` records:**
  - `BASE`'s dungeon floor and wall are "the owner's choice of two candidates each".
  - `CAMERA_PITCH` is π/6, while its comment says the concept art looks down at 40-45°.
    Record both and correct the comment. The owner chooses the pitch (roadmap).
- **Cite `play.md#<rule>`** from:
  - `GAP_METRES` and `CAP_SECONDS` (`src/arena/duel.ts`);
  - `SIGHT_METRES`, `WAKE_METRES`, `SET_UPON`, `AIM_COSINE`, `TRAIL_METRES`, `STALL` and
    `FOOTPRINT_METRES` (`src/dungeon/run.ts`);
  - `run.ts`'s inline alert, perception, replan and arrival numbers, hoisted into `RUN_TIMING`
    and `ARRIVAL`;
  - `LEVEL` (`src/dungeon/level.ts`);
  - `party-placement.ts`.
- **What `play.md` records:**
  - `STALL` cites the 0.2 m/s envelope (`assets/core/stance-envelope.json`), and
    `FOOTPRINT_METRES` the 0.46 m shoulders.
  - `LEVEL.clearance` 0.65 is the widest body plus a margin. Write the sum, and use
    `LEVEL.clearance` where `crypt-room.ts` and `crypt-dungeon.ts` repeat `.65` (chunk 7).
- **Audio:**
  - `cues.ts`'s 60 J reference energy and 0.035 floor go to `look.md#sound`, marked set. A
    measurement from headless bouts goes on the roadmap.
  - The coalescing windows and the 12-voice cap are numeric settings.

**6c. A guard, `tests/constants.test.mjs` (new). Land it first in chunk 6, before 6a and 6b.**
- **Scope:** every module-scope `const` in `src/core`, `src/arena`, `src/dungeon`, `src/render`
  and `src/audio` whose initializer is a numeric literal other than 0, 1, 2, -1 and 0.5, or an
  object or array literal holding one, directly or nested.
- **Excluded:**
  - function initializers (arrows and function expressions);
  - records whose every number comes from a `sourced()` or `derive()` call;
  - unit definitions (`CONVERSIONS` in `src/core/spec/quantity.ts`) and index tables.
  Each exclusion is a named rule in the test, not a list of names.
- **Rule:** its doc comment must cite one of:
  - a `docs/reference/*.md#anchor` or `docs/art/*.md#anchor` that exists, whose section names
    the constant in backticks;
  - a `SOURCES` key;
  - "numeric setting" or "solver conditioning".
- **Code:** the reading is `tunedConstants`, `sourceFault` and `ledgerFaults`
  (`tests/fixtures/constants.mjs`), over the comment on a constant's own statement; a section's
  text is `recordSection` (`tests/fixtures/spec.mjs`), which `recordExists` reads too.
- **`NOT_YET`.** As landed, 93 constants are in scope and 13 pass; the other 80 are named in the
  test's `NOT_YET` list (`"path NAME"`).
  - The test also fails when a `NOT_YET` entry passes or no longer exists, so the list only
    shrinks.
  - 6a, 6b, 6d and chunk 7 each remove what they source. The end of chunk 7 asserts the list
    is empty.
- **Controls:** each must go red:
  - an uncited constant;
  - a citation of a missing anchor;
  - a section that does not name the constant;
  - a `NOT_YET` entry that now passes.
- **What it cannot see:** literals inside functions, and a record that names a value without
  supporting it. Hoisting closes the first; review is the only check on the second.

**6d. The rest of `NOT_YET`** outside the crypt files. The survey missed these; the scan
finds them all.
- **Paper tables** (`PRINTED` in each `src/core/human/tables/*` file, `SEGMENT_DENSITY`,
  `ANDERSON_TABLE_3`, `FREY_*`, `COHORTS`) cite their `SOURCES` key.
- **Numerics:**
  - `HULL_TOLERANCE`, `UNREACHABLE`, `PREVIEW_STEPS`, `START`, both `CATCH_UP_SECONDS`, and
    `FOG_SAMPLE` and `VISUAL_CHUNK`: "a numeric setting".
  - `SKIN_TOP`: read it first, then cite a source or say "a numeric setting".
- **Look** (`look.md`): `ORBIT`, `ROOM`, `ROOM_GROUPS`, `ARENA_POSTS`, the `dressing.ts`
  constants, `FOG`, `WALL_HEIGHT`, `TILE`, `DOOR_LEAF`, `SCONCE`, `WOOD`, and
  `REFERENCE_CAMERA` and `REFERENCE_TORCHES` (`src/dungeon/reference.ts`). Some of these are
  already recorded in `docs/art/crypt.md`: cite that record's section instead.

**Fingerprint:** identical. Only hoisting touches code, and it keeps every expression.

## Chunk 7: the crypt generator

Files: `src/dungeon/crypt-room.ts`, `crypt-archetypes.ts`, `crypt-weathering.ts`,
`crypt-kit.ts`, `crypt-dungeon.ts`, `scenery-visibility.ts` and `reference-look.ts`.

Generation is seeded from `mulberry32` alone, so the fingerprint's generation and sight lines
are the guard. Three things break them:
- reassociating a float expression;
- reordering the art stream's `art()` draws, several of which happen only when a condition
  passes;
- changing the insertion order of `dressCryptMap`'s `solid` map. A later `solid.set` replaces
  a cell's normal but keeps its place in the map.

One commit per bullet:

1. **Delete `generateCryptRoom`** (`crypt-room.ts`). Only `tests/crypt-room.test.mjs` uses it.
   - Its no-archetype paths keep these alive, and they go with it:
     - the `.48` niche odds;
     - the `!archetypes ||` damp filter;
     - the tomb-placing `else` in the furniture;
     - the `'rootbound'` default in `CryptWeathering`;
     - `dressReference`'s single-room `bounds` branches when given a plan.
   - `CryptRoomPlan.archetypes` becomes required.
   - Move the kit assertions to `tests/crypt-kit.test.mjs`. Port the "doors open, no physics
     bodies" test to `generateCryptDungeon`.
   - **The triangle budget.** The test's `<= 130000` is a single room's budget; the dungeon's
     maximum over seeds 0-99 is 415,986.
     - Port it as `<= 420000`, measured, with that measurement in `docs/art/crypt.md`.
     - Put "the crypt's triangle budget is the owner's to set" on the roadmap.
   - Correct `docs/art/crypt.md`, which calls `generateCryptRoom` "kept as a test fixture".
   - **Tests.** The count changes. `crypt-room`'s tests go, the kit test moves, and the doors
     and budget tests are ported. State the before and after counts in the commit.
2. **`crypt-archetypes.ts`.**
   - `cryptFurniture`'s `switch (type.kind)` gets the `never` default.
   - Each kind's arrangement (`add('rack', -2.7, -3.5)` and the like) becomes a named
     function per kind, `(variant, shift, room, add) => void`. The offsets depend on
     `shift`, `type.variant` and `room.max.z - room.centre.z`, and the obstacle ids on the
     order of the `add` calls, so each function keeps its calls in today's order. Name the
     offsets in it, and cite `look.md#crypt-rooms`.
   - Drop `export` from `CRYPT_SIGHT` if chunk 4 has not already.
3. **`crypt-weathering.ts`.**
   - The soil and strength ternaries over `kind` become `Record<CryptRoomKind, { soil, strength
     }>` in `CRYPT_ROOM_LOOK`.
   - Guard rooms and chapels, which today fall to the default, get that default's value
     written out. So the shader string is unchanged.
   - Add to the fingerprint a hash of `new CryptWeathering(material, plan).getCustomCode(
     "fragment")` under a `NullEngine`, for seeds 1-3, in the commit before this one.
4. **`crypt-dungeon.ts`.**
   - Name the layout numbers (44, 12, 20, 15, 3, 2) in a `CRYPT_LAYOUT` record.
   - Add `shuffle`, `carveRoom` and `carveCorridor` helpers that keep the draw order.
   - Use `LEVEL.clearance` where `.65` is a clearance (a radius handed to `walkable`,
     `clearSegment` or `findPath`). Read each `.65` before replacing it.
   - The 300-character `throw` becomes a named error with a short message.
   - `archetypes[id].kind === "chapel" ? 5 : 5 + pick(3)` becomes a lookup over the kind, with
     the `never` default.
5. **Split `dressCryptMap`** into `pavement`, `wallFaces`, `niches`, `walls`, `roomExtras` and
   `torches`, called in today's order on one shared draw stream.
   - Name the odds (`.58`, `.30`, `.63`, `.4`, `.18`, `.55`, `.78`, `.15`, `.75`, `.85`, and
     the roots' `.65`) in `CRYPT_ODDS`. Name the torch spacing and flame offset (the other
     `.65`s, and `2.05` and `1.4`) in `CRYPT_TORCH`.
   - Name the art stream's salt `0x63727970` (`ART_SALT`) in one place.
   - Rename the file `crypt-plan.ts` if its contents are then the plan. Rewrite the importers
     with a script that rewrites relative imports.
6. **The small files.**
   - `scenery-visibility.ts`: name the 12-cell radius, the `.35` corner samples and the
     4-cell gap. The flood fill reads with named neighbours.
   - First, in a commit of its own: a test in `tests/crypt-detail.test.mjs` that an enclosed
     gap of 4 cells is filled and one of 5 is not (the fingerprint cannot show the bound).
     Mutate the bound to 3 and to 5 and watch it go red. **Tests:** +1.
   - `crypt-kit.ts`: write the group-by on its own lines.
7. **`reference-look.ts`.**
   - Export a pure `cutawayCondition(...)`, which builds today's 600-character expression from
     named parts. Add its string to the fingerprint in the commit before.
   - Add a `frontTorch` predicate. Name the chamber bounds (`15.45/3.55/13.45/4.55`) once, as
     `REFERENCE_CHAMBER`.
   - `CryptDamp`'s default centres are written once.
   - `quality === "high" ? 2048 : 1024` becomes a switch on `ReferenceQuality`.
   - **Check in the browser:** `?play=dungeon` in each scenario (generated, reference,
     random-crypt), pausing, cut-away, torches. Compare screenshots before and after, at the
     same seed and camera.

At the end of chunk 7, chunk 6's `NOT_YET` list is empty.

## Chunk 8: the character workshop

1. **`scripts/character-lab/validation.mjs`.**
   - Name `skinRegions`' numbers (`.055 * handScale`, `.115`, `/ .1209`, `.72`, `1.02`, `.07`)
     with their sources in `docs/art/characters.md`.
   - Write `surfaceIndex`'s `keys()` triple loop out.
   - `scripts/character-lab/contact.mjs`'s `gripGap` re-implements `gripDistances`: it calls
     `gripDistances` instead.
   - **Guard.** Before the change, write a hash of `skinRegions`, `contactPatch`,
     `gripDistances`, `wristAreaRatio` and `forearmExpansion`, at frames 0, 10 and 20 of each
     catalogue clip, into `fingerprint.mjs` behind `--character`. It loads the `.glb`s under
     a `NullEngine`.
   - The existing character tests take about 3 minutes. Run them once at the end.
2. **`src/character-lab/main.ts`.**
   - Name the staging numbers (about 40 lighting and camera literals) and cite
     `look.md#workshop`.
   - Build `loadouts` from `CHARACTERS` (`catalog.ts`), not by naming `fighter` and `rogue`.
   - The unions get switches:
     - `current === 'fighter' ? '01 / 02' : '02 / 02'`;
     - the weapon-hand test;
     - `visiblePart`'s `if` chain in `catalog.ts`.
   - Break the lines over 200 characters.
   - **Guard:** `scripts/character-lab/browser-check.mjs` against the preview on 5183.

## Chunk 9: the crypt and character tests read like the rest

Rewrite `tests/crypt-room.test.mjs` (or its successor `crypt-kit`), `crypt-dungeon`,
`crypt-detail`, `character-lab` and `character-motion`. Use:
- names a reader can follow;
- one assertion per claim, with a message saying the claim;
- whole records where a test reads one.

After each file's rewrite, mutate the subject it guards and watch it go red. Name the mutation
in the commit message.

The character tests read `getAbsolutePosition` and `absoluteRotationQuaternion`, which go
through the cached world matrix. Make sure `computeWorldMatrix(true)` runs on each node they
read before the read.

**Tests:** the count may change. Say by how much, and why, in the commit.

## Chunk 10: the crypt page's `boot()`

`src/dungeon/main.ts`, `boot()`, is 285 lines. Split it into named functions over one
`DungeonPage` record. The record holds:
- `engine`, `audio`, `hover`, `meter`, `meterElement`, `meterParent`, `diagnostics`, `probe`,
  and `abort` with its `signal`;
- the lets `boot()` shares today:
  - `scene`, `run`, `camera`, `lighting`, `referenceLook` and `drawn`;
  - `route`, `routeSignature`, `lastUi` and `soundTorches`;
  - `paused`, `zoom`, `seed`, `cryptPlan`, `reference` and the selections;
  - `held`, `hoverPointer` and `launching`;
- `party`, the `Party` that `wireParty` returns. `buildRun` calls `partyRows()` through it,
  so `createPage` leaves it null and `boot` sets it before the first `launch`.

The helpers `setPaused`, `framing`, `toggleHelp`, `undraw` and `sampleKeys` become module
functions taking `page`.

The functions:

| Function | Today |
|---|---|
| `createPage(physicsEngine, skeletonArt): DungeonPage` | engines, page state, audio, probe, meter, abort |
| `teardownRun(page)` | the repeated core: `hover.dispose(); hoverPointer = null; referenceLook?.dispose(); referenceLook = null; lighting?.dispose(); lighting = null; undraw(); run?.dispose(); run = null; scene?.dispose(); scene = null;`, in that order |
| `cameraFor(page)` | the camera parameters in `rebuild` |
| `buildRun(page, seed): Promise<void>` | `rebuild` |
| `launch(page, seed)` | `launch` |
| `wireControls(page)` | the mode, start and help controls |
| `wireParty(page): Party` | the party HUD; returns `{ partyRows, partyStatus, selectMember }` |
| `wireKeys(page, party)` | the keyboard, blur and visibility handling |
| `wirePointer(page, party)` | pointer, wheel, resize |
| `frame(page, party)` | the render loop's body |
| `refreshHud(page, party)`, `drawRoutes(page)` | the HUD refresh and route lines inside it |
| `disposePage(page)` | dispose, `pagehide`, hot reload |

**The teardown.** The three call sites keep what differs:
- the rebuild: `audio.reset(); soundTorches = [];` before, and `route = null; routeSignature =
  "";` after;
- the launch: `audio.setActive(false)` before;
- the dispose: `audio.dispose(); abort.abort(); engine.stopRenderLoop();` before, and
  `engine.dispose()` after.

**Constraints.**
- `bootDungeon` keeps its exact spelling and signature: `tests/app.test.mjs` matches
  `export function bootDungeon(): Promise<void>`.
- No line at column 0 may call `boot\w*(`.
- `rebuild`'s azimuth assignment reads `azimuthQuery` without the normalising that the
  module-level read does. Keep it as it is: that is a behaviour question, not this plan's.

**Check in the browser:** `?play=dungeon`. In each of the three scenarios:
- start, retry, new run;
- pause by Esc, Space and blur, and the won and dead titles;
- the party rows and digit selection;
- WASD and click orders, route lines, hover and wheel zoom;
- the `__dungeon` getters.

Also force a build error to see the notice and start panel.

## Chunk 11: `stanceControl`

`stanceControl(built, tuning)` (`src/core/control/stance.ts`) is a 670-line closure that
returns `{ owned, reading, carry, bear, read, command }`. The fingerprint is the guard: the
arena, the crypt and the lab all stand on it. Also run `tests/core-stance.test.mjs`,
`core-stance-envelope`, `lab-stance`, `core-skills` and `core-body` at every commit.

**The shape.** What the closure holds is three kinds of thing, and each gets a record of its
own. The division is by what a later step reads, so that the stance's memory is one plain
object a save can take whole:
- **`Stance`**: what the functions are handed (`s`). It holds what the body and the tuning fix
  when the stance is made, and the two records below:
  - `built`, the resolved tuning (`ResolvedStance`), `pelvis`, `segments`, `total`, `feet`
    and `rest`, all `readonly`;
  - `state: StanceState` and `scratch: StanceScratch`.
- **`StanceState`**: what a step writes and a later step, or a reader between steps, reads.
  Plain data only: numbers, strings, plain objects, arrays, typed arrays, `Vector3`,
  `Quaternion`; no segment, joint, body or function.
  - the lets: `stride`, `striding`, `owned` and `last`;
  - `pace`, `step`, `plan`, `reading`, `aim`, `held` and `tasks`;
  - `feet`: each foot's `FootMemory` (below).
- **`StanceScratch`**: what a call writes before it reads. `shares`, `missed`, `idScratch`,
  and the vectors and turns (`path`, `along`, `sole`, `v`, `spin`, `target`, `error`,
  `inverse`, `pelvisSpin`, `turn`, `p`, `hipAt`, `ankleAt`, `kneeAt`, `shank`,
  `footTurn`, `level`, `whole`, `wholeAxis`).
- **A foot's memory.** `FootState` (`support.ts`) holds a segment and a chain, so it cannot be
  state. The two of its fields that outlive a step move to `readonly memory: FootMemory`, a
  plain record `{ channels: number[]; rolled: boolean }`, which the stance's state lists
  (`state.feet[k] === feet[k].memory`). Every reader of `foot.channels` and `foot.rolled`
  reads `foot.memory`. The rest stays where it is:
  - `flat` is set once, as the foot is made, and becomes `readonly`;
  - `corners`, `middle`, `toe`, `edge`, `edgeAxis` and `heel` are read afresh
    (`readSupport`) before a step reads them. The reading's `soles` are the feet's `middle`s,
    the same two vectors, and are in the state through the reading.
- **The functions.** Each section becomes a module-level `fn(s, ...)`.
- **The returned object** calls those functions, and stays exactly as it is.

One commit per bullet, the fingerprint identical after each:

1. **Move the pure helpers first.**
   - `legJacobian` and `pointOf` capture nothing and go to module level.
     - `pointOf`'s parameter type is `(typeof tasks)[number]`, a type taken from a local.
       Name it `FootTask` first.
   - `resolveStance(tuning): ResolvedStance` goes to `stance-tuning.ts`. Keep `=== undefined`
     for `bend`, `spare` and `recovery`, where null means "off", and `??` for the rest.
   - `footStatesOf(built)` and `restWidth(feet)` go to `support.ts`.
   - `supportOf` becomes `readSupport(feet, stance, out)` in `support.ts`. It is the same
     construct, renamed because it writes into `out`.
2. **Introduce `Stance`, `StanceState`, `StanceScratch` and `FootMemory`**, built once in
   `stanceControl`. These named local functions take `s`:
   - `leverOf`, `paceToward` and `ownStep` (to `gait.ts`);
   - `planAcross`, `heightLimits`, `rollFeet`, `shiftWeight`, `pelvisTurn` and `swingFoot`.
3. **Split `command`** into:
   - `bindChannels(s, muscles)`;
   - `chooseStep(s, goal): SwingGoal | null`;
   - `bearerOf(goal, phase, swing)`, so as not to collide with `support.ts`'s `bearingOf`;
   - `advancePlan(s, goal, stance, swing, bearer, pendulum, dt)`;
   - `aimRoot(s, ...)` and `holdStance(s, stance, e)`.
4. **Split `carry` and `bear`** into `stance-dynamics.ts` (new):
   - `solveLeg(s, foot, task, muscles, p0): Leg`;
   - `rootRows(R, legs)`;
   - `heldFreedoms(s, legs, inLeg, dynamics, work, P, w0)`;
   - `rootAim(s, R, P, w0)`;
   - `limitToSoles(s, legs, P, w0, p0)`;
   - `boundSwing(s, foot, task, muscles, accel, root)`;
   - `groundWrench(R, root, accel, n)`;
   - `legTorques(s, muscles, bearing)`.

   `carry` and `bear` stay, as the returned object's methods, and call these in today's
   order. `bear` keeps its own sharing of the ground's wrench among the soles, between
   `groundWrench` and `legTorques`.

**Hazards.** Each one changes bits if missed.

- **Order within a step is semantic.**
  - `planAcross`, `heightLimits` and `rollFeet` read `phase` before `shiftWeight` turns it to
    "swing". `swingFoot` runs after.
  - `heightLimits` reads the `reading.place` that `planAcross` has just written.
  - `ownStep` pivots on the previous step's `place`.
  - `pendulum` is read from `r.y` before the plan advances.
- **`owned` is reassigned** in `command`. Every function reads it through `s.state.owned`,
  never from a copy. The same holds for `stride`, `striding` and `last`.
- **`striding` is `pace` itself** while a walk's step is under way (`striding = pace`), and
  `reading.own` is `step.swing`: one object in two slots. Keep each assignment an assignment
  of the object, never of a copy.
- **Shared scratch values.**
  - `error` and `inverse` serve both `pelvisTurn` and `swingFoot`.
  - `heightLimits` changes `ankleAt` in place.
  - `idScratch.at` is reused across `pointOf`, the root centre and `soleMiddleToRef`.
  - Keep each scratch value's sharing exactly. Do not give one function a fresh copy unless
    every read and write moves with it.
- **Shadowed names.**
  - The local `across` hides `gait.ts`'s `across`.
  - `p` in `legJacobian` hides the scratch `p`.
  - `target` and `lift` in `carry`, and `inverse` in `bear`, hide closure values.
  - Rename each on extraction. Never point one at the outer value.
- **Arithmetic.**
  - Keep every sum left to right as written.
  - Keep the integration: `u` first, then `r += u * dt` through `u.scale(dt)`.
  - Keep the `n * n * (...) - 2 * n * u` forms, `Math.hypot`, `e * e`, and the `reduce` loops
    in channel order.
- **`gravity()`** reads `built.physics` on every call. Keep it a call.

When the split is done, `docs/architecture.md`'s motor-control section names the new files.

## Chunk 12: records that can be reproduced

No record under `docs/reference/` gives the command that made its table.
- **For each table:**
  - Find the commit that wrote it (`git log -S "<a figure in the table>" -- docs/
    research/`).
  - Recover the script, its flags and its harness (Node stand or page, engine, rate) from that
    commit's message and the script's defaults at that commit.
  - Write the command under the table. Example:
    `node research/core-stance-sweep.mjs --variants <json>`, Node stand, Rapier, 120 Hz.
- **Where the command cannot be recovered,** write what is known (the script, the harness)
  and that the flags were not recorded.
- **Where the table was measured on an engine that is gone,** the value it supports goes to
  "set" (chunk 6's rule).
- **Files:** `stance-tuning.md`, `lab.md`, `human-and-strikes.md`, `servo-and-muscle.md`,
  `body-and-engine.md` and `human-strike-reference.md`.
- **Where a record already names its script and harness,** add only the flags.

## Decisions the owner makes (the plan does not wait on them)

- **Flames during pause.** The arena's and the crypt's flames keep flickering while paused.
  Their `onBeforeRenderObservable` advances the time, and both pages render while paused.
  - **If the owner wants them still:** pass each page's `paused` into `dressForgeRoom`
    (`src/arena/forge-room.ts`) and `lightDungeon` (`src/dungeon/lighting.ts`) as a `() =>
    boolean`, and add nothing to the time while it is true.
  - Also remove the arena's observer on dispose; today it is never removed.
- **The crypt's triangle budget** (chunk 7.1).
- **The crypt camera's pitch** (chunk 6b).
- **Every value marked "kept as found; the owner to confirm"** in `look.md` and `play.md`.

## Survey: exports used only in their own module (chunk 4)

- **app-route:** `PLAY_PARAM`.
- **arena:**
  - duel: `GAP_METRES`, `Duelist`, `DuelOptions`;
  - forge-assets: `prepareTemplate`, `ASSET_ROOT`;
  - orbit: `OrbitPoint`;
  - room: `VisualColliderPair`, `RoomPlacement`, `RoomGroup`, `ShadowRegistry`,
    `ROOM_WALL_COLLIDERS`, `ArenaSolid`, `ArenaColliders`, `CosmeticRoom`, `ArenaWorld`;
  - scene: `Arena`.
- **core:**
  - body: `BodyDriver`, `HandGoal`, `restCommand`, `BodyOptions`;
  - build/build-body: `Placement`;
  - build/dynamics: `RootDynamics`, `BodyMotion`;
  - build/rigid: `Tensor`, `heldBy`;
  - control:
    - contact-wrench: `SoleWrench`;
    - kinematics: `ReachFreedom`;
    - servo: `ServoFeed`;
    - stance-envelope: `GaitTable`;
  - engine:
    - engines: `ENGINES`, `EngineName`;
    - rapier: `Rapier`, `SOLVER`, `RapierBody`, `RapierJoint`, `RapierPhysics`;
  - human:
    - envelope: `WorkshopEnvelope`;
    - grip: `inHand`;
    - joints: `Strength`, `Speed`;
    - model: `TYPICAL_MAN_STATURE`, `TYPICAL_MAN_MASS`;
    - muscle: `REGION`;
    - rig: `fromBlender`;
    - spec: `figureSpec`;
  - math/linalg: `solveSymmetric`, `dampedSolve`;
  - mind/fighter: `Heading`;
  - muscle/driver: `MuscleChannel`, `MuscleSide`;
  - rules:
    - blows: `STRIKERS`;
    - pool: `Blow`;
    - rulebook: `Mode`, `Mechanism`, `RulebookOverride`;
  - skills:
    - locomotion: `stanceLegs`, `StanceLegs`, `Locomotion`;
    - strike: `StrikePhase`, `StrikeCommand`, `StrikeSkill`;
    - strikes: `StrikePush`, `Recipe`;
  - sources: `Source`;
  - spec:
    - hull: `Hull`, `HULL_TOLERANCE`;
    - provenance: `SpecInventory`;
    - quantity: `Value`, `Unit`, `Derived`, `Provenance`;
  - world: `StepHook`, `WorldOptions`.
- **dungeon:**
  - commands: `ControlMode`;
  - crypt-archetypes: `CRYPT_SIGHT`;
  - decals: `DecalKind`;
  - dressing: `MURAL_FLOOR`, `DressingTable`, `DECAL_LAYERS`, `FloorDecal`;
  - fog-plugin: `FOG_LOOK`, `StoneRole`;
  - fog: `WallQuad`;
  - level: `layRooms`, `BlockRect`, `Heading`, `RoomLink`, `LevelMetrics`, `Level`;
  - light-proxy: `PROXY_ANCHOR`;
  - lighting: `lightRange`, `DungeonLightProfile`;
  - look-probe: `FrameCost`;
  - masonry: `facePoint`, `hash01`, `SideFace`, `BlockEnd`, `Block`, `Corner`;
  - run: `DungeonRunOptions`;
  - stone: `StoneChoice`, `StoneSurface`;
  - world: `DungeonSolid`.
- **lab:**
  - blow: `attackOnce`;
  - camera: `TURN_SECONDS`, `LabCameraRig`;
  - club-blow: `ClubBlowWatch`;
  - fist: `FingerFist`, `PalmDirection`, `PalmFrame`;
  - history: `History`;
  - lab-scenario: `ScenarioContext`;
  - player: `Stage`, `Recording`;
  - routine: `routineMind`, `ROUTINE_METRES`, `POST_BEYOND`, `ROUTINE_GAIT`, `Leg`,
    `RoutineMind`, `StrikeReading`, `Routine`;
  - run-mode: `RunSession`, `AIM_AHEAD`, `TrackMind`;
  - scenarios: `ScenarioInfo`, `LabRate`;
  - stance-mode: `ordersMind`, `StanceOrders`, `StanceSession`, `restOrders`;
  - track: `TrackPoint`.
- **physics-bench:**
  - cases: `controlStep`, `humanPlacement`, `FootResult`, `ARM_GUARD`, `ELBOW_TO`,
    `SWING_SECONDS`, `SWING_AT`, `ARM_SECONDS`, `ArmResult`, `StepTimes`, `Stat`,
    `ScalingOptions`, `HumanResult`;
  - chosen: `FEET`;
  - control: `SERVO_T`, `ControlJoint`;
  - engines/mujoco: `mujocoXml`, `MUJOCO_DEFAULTS`;
  - engines/rapier: `Rapier`, `RAPIER_DEFAULTS`;
  - math: `norm`;
  - model: `lowestOf`, `Segment`, `Dof`, `FIGHTER`.
- **render:**
  - dress: `SHAPES_TINT`;
  - materials: `buildTexturedSurfaces`, `TangentBasis`, `TexturedSurfaceName`;
  - skeleton-skin: `SkeletonPiece`.

Before dropping a name, check it again with chunk 4's guard: the list was taken at 144961d4.
