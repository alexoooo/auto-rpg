# The AI testbed's layout: the toolkit below, entrants above

## Why

The owner wants one systematic layout for AI implementations, so that an agent iterates on one AI
(the Skeleton, a configuration of the Option framework) without touching the common core.

- **The core depends on every entrant.** The entrants sit in `src/core/entrants/`, and the core's
  list of minds (`src/core/mind/kinds.ts`) imports each; the catalog, mind creation, enlistment,
  the models and every task reach it.
- **An entrant cannot build on another's code.** A preset and a controller's parts live in that
  controller's file, and part kinds are one flat map, so a second entrant on Option Mind's parts
  collides on their kinds: the Skeleton copied the whole package (about 2,400 lines, its kinds
  renamed `skeleton-*`) and has gone stale.
- **The Option framework is one entrant's package**, and its objective and percepts are fixed
  tables: a new percept or valuation edits the framework.
- **`src/core/mind/` is 115 files of about eight layers**; the review beside it found dead
  modules, duplicated helpers, two broken research scripts, misleading names, world builders in
  screen folders and an import cycle through the command registry.

The rule: **the toolkit offers mechanisms; an entrant is what you pick.** Each AI is one folder of
presets and its own parts, importing only the core; the core imports no entrant; names cannot
collide; the gate shows an entrant's change touched nothing else.

## The layout

```
src/core/                the platform and toolkit: no preset, no entrant
  parts/                 the part framework: parts, fields, the lookup, the catalog (catalogOf), the entrant manifest
  mind/ intent/ navigation/ perception/ tactics/ recovery/ skills/ control/ option/ reptile/ command/ …
  toolkit.ts             the toolkit's minds, role lists and commanders; the catalog the core's own tasks use
src/entrants/
  index.ts               the list of entrants (imports and one array literal)
  game.ts                the game's catalog (catalogOf(toolkit, entrants)), its lookups, each model's default mind
  <name>/index.ts        one AI's manifest, its other files beside it
assets/entrants/<name>/  its data
tests/entrant-<name>.test.mjs  its tests
src/worlds/              the headless world builders: the bout, the Crypt run, the Lab's scenarios, the falls
```

Imports run one way: screens → evaluation → worlds → entrants → core.

- **An entrant is a manifest**: `name` (its folder), `minds` (kinds of mind of its own, most have
  none), `parts` (its parts of any role) and `presets` (each a label, a config, the models it
  fits); a Commander of its own waits for an entrant that has one.
- **Scoped kinds**: every kind an entrant registers is `<entrant>:<kind>`; a toolkit kind has no
  `:` (`/` already splits tournament and ratings ids).
- **Preset ids are global and unique**, today's kept (`option`, `duellist`, `vanguard-warrior`).
- **A tree stays in one entrant**: a preset's tree names toolkit kinds and its own entrant's; the
  editor offers the toolkit's parts and the tree's entrant's.
- **Pickable means a preset**: `MINDS` holds presets only; a toolkit controller's defaults are
  built by the contract tests, not offered.
- **The boundary test**: the core imports nothing outside it; an entrant imports the core, its own
  folder and its own data, never another entrant, a world, the evaluation or a screen; only the
  list and the game's catalog import every entrant. The exact arithmetic, float32, world-matrix and
  mind rules hold over `src/entrants/` as over the core.

**An agent on one AI** works in its folder, data and tests; `node scripts/entrant-check.mjs` names
the change that entrant's; a case's code identity (`caseCoder`) re-plays only its rows, and the
fingerprint moves only its cases. What is not yet a role is a toolkit change: one commit opening
the extension point, read on the fingerprint across every entrant. A part two entrants want moves
into the toolkit; nothing is copied.

## Steps

Each step is a commit that passes `npm run check`, `npm test`, `npm run build` where browser code
changes, and the line-ending gate. A step marked neutral moves no fingerprint case
(`scripts/fingerprint.mjs --compare` against the commit before). Each step updates the documents it
makes wrong. A file move re-keys the saved rows that reach it (`caseCoder` hashes paths), so
nothing is evaluated between steps 2 and 8 unless a decision needs it.

1. **Small cleanups** (neutral).
   - The modules nothing imports go: `build/articulated-mass.ts`, `control/contact-motion.ts`,
     `control/recovery-features.ts`, `spec/provenance.ts`, `tasks/navigation.ts`; so do the exports
     nothing reads (`TRUNK_SEGMENTS`, `EXERTIONS`, `quadraticSolver`, `groundPoint`,
     `guardCanReach`, `PUNCH_FEATURES`, `footingByEnd`, `validateDungeonVisuals`,
     `balanceAddress`, `SKELETON_UNSHOWN`, `noteOf`, `noteFaults`); an export only its own file
     reads is no longer exported.
   - One copy of each helper, each sum in its order: dot and cross from `spec/vec.ts`;
     `otherSide` beside `Side`; a segment by name (`segmentOf`); one `median`.
   - Research imports what exists: `research/competencies.mjs` reads `allParts`;
     `research/stand-controller/phased-rise.ts` reads `OwnBody` from `src/core/mind/mind.ts`. A
     test holds every named import from `research/` and `scripts/` into `src/` to an export that
     exists (research broke silently twice; `tsc` reads only `src`).
2. **The catalog is a value; the game's list is above the core** (neutral).
   - `src/core/parts/`: `parts.ts`, `fields.ts`, `lookup.ts`, and `catalog.ts`'s mechanism as
     `catalogOf(toolkit, entrants)`, whose lookups are closures over the lists it is given; a kind
     two role lists share is refused.
   - The core takes a catalog by name: mind creation (`createMind`, `builtAngles`, `hostedMind`),
     enlistment (`Enlistment.catalog`); `src/core/models.ts` holds bodies only (a model's default
     mind and `modelRefusal` move up); the core's tasks use the toolkit's catalog.
   - `src/core/toolkit.ts`: the toolkit's minds (`mind/kinds.ts`, its list), role lists and
     commanders. The command registry no longer imports its own contract: `kindOnly` and the
     contract's types leave `commander.ts`.
   - `src/entrants/index.ts` lists today's entrants where they are; `src/entrants/game.ts` builds
     the game's catalog, exports its lookups under today's names, `modelRefusal`, and each model's
     default mind by preset id, which the Arena's matchup compares by id.
   - The build identity's cuts, the swap hooks and `entrant-check`'s registries read the new paths.
3. **The Option framework into the toolkit** (neutral). `src/core/option/` holds the option
   contract, the choosers, the situation reader, the percepts, worth, the position value and
   predictions, the standard option kinds, `optionTactics` and the Option controller (kind
   `option`), its defaults the smallest that works: the valued chooser, the standard options,
   walk, guard and the game's rise, no strike. Option Mind's folder holds its preset: the punch,
   the stomp, their actions, its config as today.
4. **Entrants are manifests in `src/entrants/`** (neutral).
   - The manifest, scoped kinds and the catalog's refusals; `Controller.presets`,
     `Controller.parts` and `ownerOf` go.
   - Each entrant moves to `src/entrants/<name>/`: Vanguard (`vanguard:mind`, its parts, its three
     presets), Option Mind (`option`), the Skeleton (as it is, until step 5), Bare (`bare:mind`);
     the fighter presets that derive one from another (`classic`, `puncher`, `counter`,
     `behaviours`, `duellist`) in `src/entrants/classic/`, the mechanism data they build on
     (`FIGHTING`, `MOVE`, `BLADE_FIGHTER`, `STAND_UP`) staying in the toolkit; `crawl` in
     `src/entrants/crawl/` on the toolkit's quadruped.
   - The drill opponent (a mind playing beats over another) becomes a toolkit mind; its five
     presets are the evaluation's own opponents (`src/evaluation/drill-opponents.ts`, from
     `classic` and `puncher`), which the fingerprint plays by their ids.
   - The boundary test holds the entrant rules, each with a planted control (an entrant importing
     another; one importing a screen); the mind contract plants the catalog's refusals (an
     unscoped kind, a preset id twice, a tree of two entrants). `entrant-check`, the evaluation
     comparison's ownership and the case identity's own code read an entrant by its folder.
   - The swap fixture is an entrant from outside `src/` (`swap:*`): the control that an entrant
     needs no edit of the core.
   - The architecture's Adding a Mind becomes Adding an entrant; `AGENTS.md`'s competing minds and
     the README's map follow.
5. **The Skeleton is a preset; the fork goes** (moves the Skeleton's cases only). Its folder holds
   one preset on the toolkit's Option controller: the low front kick and its action, the support
   fold, the game's rise, the Skeleton's model; no punch, its body having no punch record. Its
   guard and its blade test go with their data: no reading shows the guard earns its place
   ([record](../reference/option-skeleton-combat.md): 8 of 16 applied everywhere, the further
   search rejected). Its test reads the shared predictor (lying down costs something before a foe
   that cannot strike). Check: the fingerprint moves only the Skeleton's cases, each by the shared
   model it gains (blows by any limb, a second standing's worth, the ward); the Arena offers each
   preset to its body and a Crypt run plays.
6. **The objective, percepts and option kinds are parts** (neutral). Roles `percept` and
   `prediction`, read by config only where an option kind or objective asks, each named in its
   `uses`; the situation's own percepts stay its vocabulary, which the chooser's cues read. The
   objective (the position value's role) prices an option's model (duration, payoff, exit), combat's
   few terms its toolkit implementation, its memory kept in its chooser's. Each option kind is given
   the body's materials and builds what it needs (footwork its gaits, the cover its covers); the
   walk, the strikes and the rise stay the mind's, which its situation and its default step read.
   The swap fixture holds a stub objective reading a stub percept and prediction.
7. **The core's mind, control and skills in folders** (neutral).
   - `mind/` keeps the body's seam with a mind (mind, host, hosted, direct, minds, controller,
     sub-mind, senses, object-senses, equipment-port, body-actions, actions, motion, held-body,
     sheets, kit) and the registry of mind kinds.
   - `intent/`: intent, orders, movement, travel, action-aim, action-window, conditions, targets,
     cover-hand. `navigation/`: the navigator, navigations, route search, crowd, clear-step,
     sensed bounds, held clearance. `perception/`: openings, hull entry, threat, and `downed/`
     (placing against a downed foe). `recovery/`: `ground/`, `rise/`, lie, the sub-minds.
   - `tactics/`: the tactics, its part and planners, action, stand and script tactics, the
     behaviours, ordered, the action producer and config, the fighter and its kind.
   - `skills/` takes the executor, locomotion and aim roles, aims and profile, in `framework/`,
     `locomotion/`, `guard/` and `strikes/`; `strikes.ts` named for what it holds
     (`held-strike.ts`).
   - `control/`: the whole-body tasks in `control/whole-body/` (`core/tasks/` holds the control
     foundation's scenarios); `Pose` in `spec/pose.ts`; `support.ts`'s body-wide sums in
     `read-motion.ts`, beside the read view they read; the network with the learner in
     `core/learning/`.
   - The boundary test holds the layers (`LAYERS`) with today's imports up them listed
     (`UP_STACK`, 30, each by the change that removes it): the layering plan's step 1.
   - Then each layer's config with its layer (the layering plan's step 6): the skills'
     (`ActionConfig`, `ExecutorEntry`) in `skills/`, the tactics' and `FighterConfig` in
     `tactics/`, `mind/config.ts` keeping the toolkit's mechanism data; the body layer from a kit
     (`fighterSkills` as `kitSkills`, `fighterBody` as `kitBody`). Check: `UP_STACK` loses the
     config entries.
8. **The world builders in `src/worlds/`** (neutral). The bout (`duel`, `room`, `levels`, the end
   rule), the Crypt run (`map`, `run`, `level`, `encounters`; its look stays in `dungeon/`), the
   Lab's scenarios, ground starts and actor, the falls; the mind link beside the game's catalog.
   The boundary test holds exact arithmetic by folder (`src/core`, `src/entrants`, `src/worlds`)
   in place of the builders' reach, and the order: no world imports the evaluation, and neither
   imports a screen.

## Done when

The core imports no entrant; every pickable AI is a folder in `src/entrants/` with no copied code;
an objective, a percept or an option kind is replaced from an entrant's folder without editing the
core; an entrant's change passes `entrant-check` as its own; `src/core/mind/` holds the body's seam
with a mind.
