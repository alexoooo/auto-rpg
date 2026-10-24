# Executor and recovery code cleanup

## Why

Four kinds of code problem make defects easy to write and hard to see:

- **Swallowed errors.** A catch-all turns an engine fault or a configuration error into an
  ordinary outcome (a whole-route rise, an invalid episode, a rejected start, a flat scene).
- **Logic in parameter lists.** Defaults that construct, choose or depend on earlier parameters,
  and parameters that no caller passes.
- **Positional flags.** Calls such as `f(…, dt, true, true)` that read nothing at the call site and
  swap silently.
- **Compressed modules.** The ground-positioning family is written in minifier style, with
  untyped stage labels, duplicated tuning and per-call rebuilding of the foe's shapes.

The cleanup preserves valid-input behavior, physical arithmetic, tuning, presets and saved-state
contracts. Steps 1 and 2 change error paths on purpose: an expected refusal becomes an ordinary
result, and every other error reaches its caller. They land apart from the refactors that claim
identical behavior.

## Steps with checks

Each step starts from one recorded source snapshot and keeps the paused, uncommitted Vanguard
work out of its commits. Shared toolkit changes and Vanguard-only changes land separately. A
shared API migration includes only the Vanguard caller adaptation it needs to build, and names it
in its commit message.

Every code change runs `npm run check` and `npm test`; a change under `src/arena/`, `src/dungeon/`
or `src/render/` also runs `npm run build`. A behavior-preserving refactor reads
[the fingerprint](../../scripts/fingerprint.mjs) before and after (`--only` the cases that reach
the changed code, `--experimental` where the code is an experimental part's), and confirms that
those cases reach the changed path. A bounded recipe replay is added only where no fingerprint
case does. These checks establish preservation, not playing strength: no tournament or rating.
Keep the same arithmetic and traversal order, and allocate nothing new on a step's path.

### 1. Make supported entry a result, not an exception

**Issues:** [stepUp](../../src/core/mind/ground/step-up.ts)'s `join` wraps
`beginSupported()` in a bare `catch` and falls back to the whole route. Validation inside
[stagedRise](../../src/core/mind/rise/staged.ts) never fires there (no posture or `hold` is
passed, and `stageFaults` already checked the limbs), so the catch hides only what it should not:
engine faults from `contactsOf` and the "first stage is a bear" recipe check. Separately, `from`
in `stepUp` cuts the recipe with `slice(findIndex(…))`; a join stage the recipe lacks gives `-1`
and joins silently at the last stage.

**Solution:**

- The supported entry's one physical refusal (supports not all bearing, or no trunk clearance)
  becomes a returned result, `started` or `unavailable` with its reason; `join` falls back only on
  `unavailable`. No `try` remains.
- Whether a recipe can be entered supported is fixed when the rise is built: a recipe whose first
  stage is not a bearing stage is refused at construction, through `stageFaults`'s path.
- `from` refuses a join stage the recipe does not name.
- `beginSupported`'s `posture` and `hold` parameters, and the state they set
  (`supportedPosture`, `holdSupported`), have no caller outside frozen research snapshots: delete
  them with their checks, unless the [Recovery plan](2026-10-23-recovery.md) names its reader.

**Checks:** One fast regression through `join`: a fixture that reaches it on bearing supports
starts supported; one that reaches it with a support lifted selects the whole route and leaves no
partial supported state. Construction refuses a recipe without its join stage. Valid recovery
fingerprint cases are unchanged; the commit names the error-path change. Routes and physical
targets of the Recovery plan are untouched.

### 2. Let the other swallowed errors reach their callers

**Issues and solutions:**

- [createEnvironment](../../src/core/tasks/environment.ts)'s `result` and `step` turn any throw,
  a task's `TypeError` included, into an invalid episode, losing the stack. An invalid simulation
  has its own reason ([control foundation](../reference/control-foundation.md)): the task's
  `evaluate().invalid`, the finiteness checks, and the engine's own fault. Find what a solver
  blow-up actually throws, catch only that, and let everything else propagate.
- [Rising evaluation](../../src/evaluation/rising.ts) records every throw from `fallStart` and
  the placement as `rejected start`, configuration faults included. Validate the job before
  building it, so that a bad job fails the run and only a physically refused placement is a
  rejected start.
- [The arena scene](../../src/arena/scene.ts) and [the crypt's lighting](../../src/dungeon/lighting.ts)
  wrap `new HDRCubeTexture(…)` in a catch that a missing file never reaches (the load is
  asynchronous, and the file is tracked). Delete the catch and its comment; a load failure is
  handled through the texture's error callback if at all.
- [The arena's setup](../../src/arena/main.ts): the attribute editor's catch also covers an
  awaited `setCharacter`, hiding a failed preview; give the preview its own failure path, as the
  others there report "Preview unavailable". A `void …setCharacter(…)` without `.catch` leaks an
  unhandled rejection; give it the same handler.
- [partOr](../../src/core/mind/action-config.ts) reports every `parts.of` failure as "no <role> of
  kind X", also for a kind that exists in the wrong role or a broken registry. Pass the error's
  own message through.

**Checks:** The gate and the build. Read each changed path once with a fault forced by hand (not
kept as a test) to see it reach the caller. Valid runs' fingerprint cases are unchanged.

### 3. Give the executors one target-resolution contract

**Issue:** The point-only resolver `target.kind === "point" ? target.at : null` is copied seven
times: as parameter defaults in [straightPunchExecutor](../../src/core/skills/straight-punch.ts),
[kickExecutor](../../src/core/skills/kick.ts), [bladeExecutor](../../src/core/skills/blade.ts),
[combinationExecutor](../../src/core/skills/combination.ts) and
[wholeBodyExecutor](../../src/core/skills/whole-body-strike.ts), and as `settings.resolve ?? …` in
[combat.ts](../../src/core/skills/combat.ts) and [strike.ts](../../src/core/skills/strike.ts). Its
callback type is written out four times and declared locally twice (`blade.ts`,
`committed-aim.ts`).

**Solution:** A named `TargetResolver` type and a named point-only resolver beside `TargetRef` in
[action.ts](../../src/core/skills/action.ts); all seven users and both local types reuse them.
Defaults are resolved in the function body. Execution dependencies (resolvers, `requireArmAim`)
go in a named options argument at each executor's call sites, separate from the physical
settings; the blade's target and contact-direction resolvers get distinct names; `combat.ts` and
`strike.ts` move `resolve` out of their settings into the same options. Update every caller,
research ones included; no compatibility layer.

**Checks:** Action, equipment and swap contracts pass. Fingerprint cases cover the seven
families and Vanguard's pre-arm aim check, with omitted and supplied resolvers, including the
shared kick kit's point-only fallback. New exports have importers; no callback enters bout state.

### 4. Make Vanguard's punch policy readable at the call site

**Issue:** [committedAim](../../src/core/entrants/vanguard/committed-aim.ts) takes ten positional
arguments, four of them booleans, and calls `straightPunchExecutor(…, follow, true)`. Its
[factory](../../src/core/entrants/vanguard/punch-part.ts) builds a conditional resolver inside the
call and wraps the result in another readiness gate.

**Solution:** On step 3's contract, one named options object for low support, prediction,
anchoring and return ownership, read from the existing configuration. Low-target selection and
the low-only readiness gate get named implementations; the target rule stays owned by
[lowAim](../../src/core/entrants/vanguard/low-guard.ts). The factory assembles dependencies; the
executor owns the stroke and return.

**Checks:** Preset configuration, edited-mind links, action ownership and complete-state forks
are unchanged; serialized field names keep their meanings. The Vanguard early-loss,
standing-return and equipment checks pass; fingerprint cases cover preparation, commitment and
release.

### 5. Move construction out of parameter lists and drop dead parameters

**Issues and solutions:** Each takes an optional value and resolves the effective one in a named
local at the top of the body; defaulting applies only to omission, and an explicit value, an
empty registry included, wins.

- [learnedRun](../../src/core/skills/learned-run.ts) picks haste-dependent settings from `policy`
  in a default: name that rule.
- [standUp](../../src/core/mind/ground/stand-up.ts) builds its registry in a default: call
  `techniquesOf` in the body.
- [stepUp](../../src/core/mind/ground/step-up.ts)'s `tuning` default indexes `STEP_UP` through an
  unchecked `as HumanoidModel` cast: a checked lookup that refuses a model without tuning.
- [commandMind](../../src/core/body.ts)'s `dt` defaults to the nominal rate; its one caller passes
  the world's. Make it required.
- Defaults no caller uses: `driveFighter`'s `around` ([fighter.ts](../../src/core/mind/fighter.ts)),
  `mirrored`'s `s` ([joints.ts](../../src/core/human/joints.ts), a local), `contacts.read`'s
  allocating defaults ([contact-tracking.ts](../../src/core/control/contact-tracking.ts)) and
  `partyCommander`'s `config` ([party.ts](../../src/core/command/party.ts)). Delete them or make
  the parameter required.

**Checks:** Default and explicit paths read once each, with and without a run policy and with
derived and supplied registries; swap contracts still select the supplied part. Fingerprint cases
for locomotion and recovery are unchanged.

### 6. Name the flags at their call sites

**Issue:** Adjacent boolean or optional positionals that read nothing where they are passed:

- `EffectorTracker.step(…, dt, fromActual, seedActual)`
  ([effector-tracker.ts](../../src/core/control/effector-tracker.ts)), called `true, true` and
  `false, true`;
- `loadRapier` and `createRapierPhysics`'s `coordinateAngularLimits, pointContactFriction`
  ([rapier.ts](../../src/core/engine/rapier.ts), [engines.ts](../../src/core/engine/engines.ts)),
  where a swapped pair changes the solver;
- `observeBody(…, equipment?, down?, contactPatches)` ([observation.ts](../../src/core/observation.ts)),
  called with `undefined, undefined, true`;
- `threatOf(view, counts?, prediction?, body, hold)` ([threat.ts](../../src/core/mind/threat.ts)),
  called `…, PREDICTION, true, true`.

**Solution:** Named options. The engine's two flags become one solver-profile object. On a step's
path (the tracker, the threat reading) a call site passes a frozen module constant, or the
function splits into named variants; no options literal is built per step. `lowGuard`'s flags
are left to the paused Vanguard work that is changing that file.

**Checks:** The engine list keeps its four profiles and their revisions. Fingerprint cases that
reach the tracker (ground fight, reptile) and cover are unchanged; the step-cost test passes.

### 7. Give ground positioning readable calculations and transitions

**Issue:** [groundPosition](../../src/core/mind/ground-position.ts),
[groundNear](../../src/core/mind/ground-near.ts) and [groundWide](../../src/core/mind/ground-wide.ts)
compress motion checks, target selection, geometry and state transitions into long statements
with abbreviated names. Their `phase` labels are plain `string`; their `stage` unions are walked
by `if` chains. `GROUND_NEAR` and `groundWide`'s `GROUND_COMBAT` repeat the same approach cells;
the heading rotation is written out four times in `groundWide`; `lower` is published in both
tables and read by neither. [sensed-bounds.ts](../../src/core/mind/sensed-bounds.ts) is written
the same way, and each `sensedFootClearance` or `clearFootTranslation` call rebuilds every foe
collider's world points, several times a decision.

**Solution:**

- Expand the statements and name the quiet-motion check, highest-surface selection, admissible
  hand choice and approach calculations; keep policy decisions and state updates visible in the
  state machine, with all changing memory in the existing `state` objects.
- Type `phase` as a union and handle `stage` exhaustively with a `never` default.
- One table for the shared approach cells, each mode keeping its own geometry; one named heading
  rotation. Delete `lower`, and correct
  [the reference's policy settings](../reference/ground-combat.md#policy-settings) to name where
  the lowering depth comes from.
- Preserve selection ties, missing-segment behavior, deadlines, transition timing and the order
  in which targets and physical readings are evaluated.
- Separately, as a speed rewrite: build the foe's world shapes once per decision and pass them to
  the probes, with the same per-point arithmetic.

**Checks:** Fingerprint cases with a downed foe, plus bounded near and wide replays through
admission, withdrawal and return, a blocked route and a moving target where no case reaches
them; poses, physics and saved state exactly equal. The speed rewrite lands with its time read
before and after ([step cost](../reference/step-cost.md)). Read the final code for clear control
flow; formatting alone does not resolve mixed responsibilities.

## Done when

- No catch in the addressed code reclassifies an error it did not expect: supported entry
  returns its refusal, and engine faults, configuration faults and programming errors reach their
  callers. The deliberate error-path changes are named in their commits.
- No target-selection rule, configuration-dependent construction or unchecked lookup sits in a
  parameter list; no addressed parameter is unused.
- Executor dependencies, Vanguard behavior choices, solver profiles and tracker, observation and
  threat flags are named at their call sites, with nothing new allocated per step.
- The ground-positioning family reads as named calculations around a typed state machine, with
  one copy of its shared tuning and its foe shapes built once per decision.
- Valid-input behavior passes the scoped exact comparisons and the gate; preset data and
  saved-state contracts keep their meanings.
- Each change lands on its own with its checks; documents it makes wrong are corrected; the
  document links and the line-ending gate pass.
