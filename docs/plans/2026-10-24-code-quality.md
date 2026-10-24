# Executor and recovery code cleanup

## Why

Two rules, not yet written down, cover most of the problems found in review:

- **An expected refusal is a returned value; a throw is a defect.** Today several catch-alls turn
  any error, engine faults and configuration faults included, into an ordinary outcome: a
  whole-route rise, an invalid episode, a rejected start, a flat scene.
- **A flag fixed for a caller is set when it builds, not passed at every call.** Today calls such
  as `step(…, dt, false, true)` and `threatOf(view, WARD, PREDICTION, true, true)` read nothing
  where they are made and swap silently.

Beside them: a point-only target resolver copied into seven parameter lists, Vanguard's ten
positional punch arguments, defaults that construct or are never used, and a ground-positioning
family written in minifier style.

The cleanup preserves valid-input behavior, physical arithmetic, tuning, presets and saved-state
contracts. Step 2 changes error paths on purpose and lands apart from the refactors.

## Steps with checks

Each step starts from one recorded source snapshot and keeps the paused, uncommitted Vanguard
work out of its commits. Shared toolkit changes and Vanguard-only changes land separately; a
shared migration includes only the Vanguard adaptation it needs to build, named in its message.

Every code change runs `npm run check` and `npm test`; a change under `src/arena/`, `src/dungeon/`
or `src/render/` also runs `npm run build`. A refactor reads
[the fingerprint](../../scripts/fingerprint.mjs) before and after, `--only` the cases that reach
the changed code (`--experimental` for experimental parts), and confirms they reach it; a bounded
recipe replay is added only where no case does. No tournament or rating. Same arithmetic, same
traversal order, nothing new allocated on a step's path.

### 1. Write the two rules

**Solution:** Two bullets in the Code section of [AGENTS.md](../../AGENTS.md):

- **An expected refusal is a returned value.** A throw is a defect: no catch decides what the
  game does from one. A catch at a reporting boundary (a fault shown as a sentence, a failed
  asset load) keeps the error's message and catches only what it reports.
- **A flag fixed for a caller is set when it builds.** Construction takes it, named; a call passes
  only what changes from call to call. No bare boolean positionals.

**Checks:** The document gates.

### 2. Return the expected refusals and let the rest through

Each item lands as its own commit, naming the error path it changes. Valid runs' fingerprint
cases are unchanged.

- **Supported entry.** [stepUp](../../src/core/mind/ground/step-up.ts)'s `join` catches every
  throw from `beginSupported` ([stagedRise](../../src/core/mind/rise/staged.ts)) as "supports do
  not bear". `beginSupported` returns `false` for that refusal (supports not all bearing, or no
  trunk clearance) and `join` falls back on `false`; the `try` goes. Its other checks stay throws
  and now reach the caller. Delete its `posture` and `hold` parameters, their checks and the
  state they set (`supportedPosture`, `holdSupported`): their callers were recovery controllers
  removed in `415480c6`, and nothing else, the [Recovery plan](2026-10-23-recovery.md) included,
  reads them. `stepUp`'s `from` slices at `findIndex(…)`, so a join stage the recipe lacks gives
  `-1` and joins silently at the last stage: it throws instead.
- **Ground starts.** [groundPlacement](../../src/lab/ground-starts.ts) has one physical refusal,
  no clear start in five draws: it returns `null` for it. `fallStart`
  ([fall.ts](../../src/evaluation/fall.ts)) passes the `null` on;
  [the rising evaluation](../../src/evaluation/rising.ts) records `rejected start` from it, and
  its two catches go, so a configuration fault fails the run. `buildFall` and the
  [Lab](../../src/lab/ground-scenario.ts), which need a start, throw the refusal's message.
- **Task episodes.** [createEnvironment](../../src/core/tasks/environment.ts)'s `result` and
  `step` turn every throw into an invalid episode. An invalid simulation already arrives through
  the task's `evaluate().invalid` and the finiteness checks, and no task throws in `act`,
  `evaluate` or `observe` for a physical reason: delete both catches.
- **Environment texture.** [The arena scene](../../src/arena/scene.ts) and
  [the crypt's lighting](../../src/dungeon/lighting.ts) catch around `new HDRCubeTexture(…)`,
  which loads asynchronously, so a missing file never reaches the catch (and the file is
  tracked): delete the catches and their comment.
- **Arena previews.** [The arena's setup](../../src/arena/main.ts) has two editor catches that
  also cover a preview's `setCharacter`: one awaits it, hiding a failed load; one starts it with
  `void` and no `.catch`, leaking the rejection. Each catch covers only the editor's `read()`;
  each preview reports its failure as the others there do ("Preview unavailable").
- **Part lookup.** [partOr](../../src/core/mind/action-config.ts) is a reporting boundary, but
  says "no <role> of kind X" for every `parts.of` failure: it reports the error's own message.

**Checks:** The gate and the build. Each changed path read once with its refusal and with a fault
forced by hand (not kept as a test): the refusal takes the fallback, the fault reaches the caller.

### 3. Make the target resolver required

**Issue:** The point-only resolver `target.kind === "point" ? target.at : null` is copied seven
times as a default: in [straightPunchExecutor](../../src/core/skills/straight-punch.ts),
[kickExecutor](../../src/core/skills/kick.ts), [bladeExecutor](../../src/core/skills/blade.ts),
[combinationExecutor](../../src/core/skills/combination.ts),
[wholeBodyExecutor](../../src/core/skills/whole-body-strike.ts), and as `settings.resolve ?? …` in
[pathExecutor](../../src/core/skills/combat.ts) and [recipeExecutor](../../src/core/skills/strike.ts).
Its type is written out four times and declared locally twice. Every part passes a resolver; only
the built-in kits use the default (`pathParts`' path and kick executors, the recipe kit in
[skills.ts](../../src/core/skills/skills.ts)).

**Solution:** A `TargetResolver` type and one exported point-only resolver beside `TargetRef` in
[action.ts](../../src/core/skills/action.ts). The resolver becomes a required argument (a required
setting for the path and recipe executors); the built-in kits pass the point-only resolver by
name; the inline types and both local `Resolve`s use `TargetResolver`. `straightPunchExecutor`'s
trailing `requireArmAim` becomes a named option.

**Checks:** Action, equipment and swap contracts pass; fingerprint cases of the seven executors
and of Vanguard's pre-arm aim check are unchanged.

### 4. Pass Vanguard's punch its configuration

**Issue:** [committedAim](../../src/core/entrants/vanguard/committed-aim.ts) takes ten positional
arguments, four of them booleans. Its [factory](../../src/core/entrants/vanguard/punch-part.ts)
unpacks the configuration into them, builds the low resolver inside the call, and wraps the result
in the low-only gate.

**Solution:** `committedAim` takes the `VanguardPunchConfig` and the part's resolver, and reads
`low`, `lowOnly`, `predict`, `anchorAtDrive`, `overlapReturn` and `returnHold` by name. The low
resolver and the low-only gate move inside it, using
[lowAim](../../src/core/entrants/vanguard/low-guard.ts). The factory is one call.

**Checks:** Presets, edited-mind links, serialized fields, action ownership and complete-state
forks are unchanged. The Vanguard early-loss, standing-return and equipment checks pass;
fingerprint cases cover preparation, commitment and release.

### 5. Move construction out of parameter lists and drop dead parameters

**Solution:** Each takes an optional value and resolves the effective one in a named local at the
top of the body; an explicit value, an empty registry included, wins.

- [learnedRun](../../src/core/skills/learned-run.ts) picks haste-dependent settings from `policy`
  in a default: name that rule.
- [standUp](../../src/core/mind/ground/stand-up.ts) builds its registry in a default: call
  `techniquesOf` in the body.
- [stepUp](../../src/core/mind/ground/step-up.ts)'s `tuning` default indexes `STEP_UP` through an
  unchecked `as HumanoidModel`: a checked lookup that refuses a model without tuning.
- [commandMind](../../src/core/body.ts)'s `dt` defaults to the nominal rate; its one caller passes
  the world's: required.
- Defaults no caller uses: `mirrored`'s `s` ([joints.ts](../../src/core/human/joints.ts)),
  `contacts.read`'s `released` and `freeAll`
  ([contact-tracking.ts](../../src/core/control/contact-tracking.ts); its `supportBand` default is
  read, its caller's band being optional), `partyCommander`'s `config`
  ([party.ts](../../src/core/command/party.ts)): deleted, or the parameter required.
  `driveFighter`'s `around` stays: the Lab's actor passes it through a controller's `drive`.

**Checks:** Swap contracts still select a supplied part; locomotion and recovery fingerprint cases
are unchanged.

### 6. Set fixed flags at construction

**Solution:**

- [effectorTracker](../../src/core/control/effector-tracker.ts): `seedActual` is fixed for each
  tracker (ground fight and reptile on, the motor off) and moves to construction. `fromActual`
  varies per call in the motor and stays.
- [threatOf](../../src/core/mind/threat.ts): its `counts`, `prediction`, `body` and `hold` are
  exactly the modes [cover](../../src/core/mind/behaviours/cover.ts) switches on. One frozen
  reading per mode, exported beside `THREAT` and `WARD`, replaces them; cover, evade and the
  situation reading pass a reading by name.
- `loadRapier` and `createRapierPhysics` ([rapier.ts](../../src/core/engine/rapier.ts)) take one
  named solver profile in place of two booleans; [engines.ts](../../src/core/engine/engines.ts)
  keeps its four profiles.
- [observeBody](../../src/core/observation.ts)'s three trailing optionals become one options
  object (built once, at setup).

`lowGuard`'s flags are left to the paused Vanguard work changing that file.

**Checks:** Engine revisions unchanged; fingerprint cases reaching the tracker (ground fight,
reptile) and cover unchanged; the step-cost test passes.

### 7. Rewrite ground positioning readably

**Issue:** [groundPosition](../../src/core/mind/ground-position.ts),
[groundNear](../../src/core/mind/ground-near.ts), [groundWide](../../src/core/mind/ground-wide.ts)
and [sensed-bounds.ts](../../src/core/mind/sensed-bounds.ts) are written in minifier style, with
abbreviated names and geometry, selection and transitions in single expressions. `phase` is a
plain `string`; `stage` unions are walked by `if` chains. `GROUND_NEAR` and `groundWide`'s
`GROUND_COMBAT` repeat the same approach cells; `groundWide` writes the heading rotation out four
times; `lower` sits in both tables with no reader (the ground intent's `lower`, removed in
`ef94828a`, was its last).

**Solution:**

- First, alone: formatting only (spacing, quotes, one statement a line), by a formatter or by
  hand. Nothing else changes; the fingerprint shows it.
- Then name the quiet-motion check, highest-surface selection, admissible hand choice and approach
  calculations; type `phase` as a union and switch on `stage` with a `never` default; one table
  for the shared approach cells, each mode keeping its own geometry; one named heading rotation.
  All changing memory stays in the existing `state` objects.
- Delete `lower`, and correct [the reference's policy settings](../reference/ground-combat.md#policy-settings):
  the depth is the action's own `lower` and the fold's `COMBAT_FOLD`
  ([support-fold.ts](../../src/core/skills/support-fold.ts)).
- Preserve selection ties, missing-segment behavior, deadlines, transition timing and the order in
  which targets and physical readings are evaluated.

**Checks:** Fingerprint cases with a downed foe, plus bounded near and wide replays through
admission, withdrawal and return, a blocked route and a moving target where no case reaches them;
poses, physics and saved state exactly equal. Read the final code for clear control flow.

## Done when

- AGENTS.md holds the two rules, and the addressed code keeps them: refusals are returned, no
  catch decides behavior, and flags fixed for a caller are set at construction.
- No resolver, configuration-dependent construction or unchecked lookup sits in a parameter list;
  no addressed parameter is unused.
- Vanguard's punch reads its configuration by name.
- Ground positioning reads as named calculations around a typed state machine, with one copy of
  its shared tuning.
- Valid-input behavior passes the scoped exact comparisons and the gate; error-path changes are
  named in their commits; documents made wrong are corrected; the document links and line-ending
  gate pass.
