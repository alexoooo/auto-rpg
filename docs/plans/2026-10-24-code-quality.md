# Executor and recovery code cleanup

## Why

Make the six reviewed problems explicit: duplicated target resolution in parameter lists,
Vanguard's positional behavior flags, policy-dependent locomotion defaults, registry construction
in a default argument, compressed ground-positioning logic, and recovery that catches every
exception as a physical refusal.

The cleanup preserves valid-input behavior, physical arithmetic, tuning, presets and saved-state
contracts. Expected inability to start a supported rise becomes an ordinary result; invalid
configuration and unexpected errors remain failures. This error-handling change lands separately
from the refactors that claim identical behavior.

## Steps with checks

Each step starts from one recorded source snapshot and keeps unrelated, paused Vanguard work out
of its commits. Implementation checks use that same baseline; a changed baseline is read again.
Shared toolkit changes and Vanguard-only changes land separately. A shared API migration includes
only the Vanguard caller adaptation needed to keep it building and names that adapter in its
commit; the Vanguard API cleanup is its own change.

For each code change, run `npm run check`, `npm test` and `npm run build`. A behavior-preserving
refactor also reads [the fingerprint](../../scripts/fingerprint.mjs) before and after, scoped to
the affected callers. Confirm those cases reach the changed paths; use a bounded recipe replay
where the existing fingerprint does not exercise one. Compare poses, physics and whole saved
state, investigating every difference. These checks establish preservation, not playing strength;
no tournament or rating campaign is needed. Keep the same arithmetic and traversal order, and
add no allocations to a step's hot path for presentation alone.

### 1. Give the five executors one target-resolution contract

**Issue:** [straightPunchExecutor](../../src/core/skills/straight-punch.ts),
[kickExecutor](../../src/core/skills/kick.ts), [bladeExecutor](../../src/core/skills/blade.ts),
[combinationExecutor](../../src/core/skills/combination.ts) and
[wholeBodyExecutor](../../src/core/skills/whole-body-strike.ts) repeat the same point-target rule
inside their parameter lists. Several repeat its full callback type too.

**Solution:** Give target resolution a named `TargetResolver` type and a named point-only
implementation beside `TargetRef` in [action.ts](../../src/core/skills/action.ts). The five
executors reuse them. Resolve defaults during construction in the function body. Keep point
coordinates, body-target refusal and supplied resolver precedence unchanged.

Then give execution dependencies and flags named options at each executor's call sites. In
particular, replace the trailing positional `requireArmAim` boolean with a named property; give
the blade's target and contact-direction resolvers distinct property names. Keep each executor's
physical settings separate from these dependencies. Update all callers, including direct research
callers, and remove unused signatures rather than retaining an unneeded compatibility layer.

**Checks:** Existing action, equipment and swap contracts still pass. Scoped fingerprints cover
the five executor families and Vanguard's pre-arm aim check. Verify omitted and explicitly
supplied resolvers, including the point-only fallback that the shared kick kit uses. New exports
have real importers; callback dependencies stay outside mutable bout state.

### 2. Make Vanguard's punch policy readable at the call site

**Issue:** [committedAim](../../src/core/entrants/vanguard/committed-aim.ts) takes ten positional
arguments, including four boolean switches and a return duration. Its
[factory](../../src/core/entrants/vanguard/punch-part.ts) embeds conditional target-selection logic
in that call and adds another readiness wrapper around the result.

**Solution:** Build on step 1's resolver contract. Replace the behavior-argument tail with one
named options object for low support, prediction, anchoring and return ownership. Use explicit
properties from the existing configuration. Give low-target selection and the low-only readiness
gate named implementations, keeping the target rule owned by
[lowAim](../../src/core/entrants/vanguard/low-guard.ts). The factory reads as dependency assembly;
the executor owns the stroke and return lifecycle.

**Checks:** Preset configuration, edited-mind links, action ownership and complete-state forks
remain unchanged. Use the existing Vanguard early-loss, standing-return and equipment checks,
plus fingerprints that exercise preparation, commitment and release. Keep the current serialized
field names and their meanings; this step changes the internal API.

### 3. Move construction decisions into the function bodies

**Issues:** [learnedRun](../../src/core/skills/learned-run.ts) chooses and constructs haste-dependent
settings in a default argument. [standUp](../../src/core/mind/ground/stand-up.ts) constructs its
technique registry in another default argument.

**Solution:** Let the signatures accept optional supplied settings or registry. At the start of
each body, select the effective value with a named local. Name the learned-run settings rule;
reuse the existing `techniquesOf` factory for stand-up. Preserve defaulting only for omission or
`undefined`, and preserve explicit overrides, including an explicitly supplied empty registry.
Construct each dependency once. These functions need no new construction framework.

**Checks:** Read default and explicit-override paths, with and without a run policy and with
derived and supplied technique registries. Existing part-swap contracts continue to select the
supplied implementation. Fingerprints preserve ordinary locomotion and recovery behavior; no
default value, validation requirement or registry lookup is silently removed.

### 4. Distinguish supported-entry refusal from unexpected failure

**Issue:** [stepUp](../../src/core/mind/ground/step-up.ts) catches every exception from
`beginSupported` and falls back to the whole route. The entry implementation in
[stagedRise](../../src/core/mind/rise/staged.ts) can also reject invalid options, recipes and joint
postures, so those failures can be hidden by the same catch.

**Solution:** Add an explicit supported-entry attempt result, such as `started` or `unavailable`
with a physical refusal reason. The module owning entry validates its inputs and checks actual
support and trunk clearance in one place. `stepUp` falls back only on the expected unavailable
result. Invalid inputs and unexpected exceptions propagate. Share the validation and entry code
with any strict `beginSupported` callers that still need it; avoid separate, drifting checks or
catching exceptions to classify them by message.

**Checks:** Add one fast regression for the caller's supported, physically unavailable and
unexpected-error paths. Assert that refusal leaves the attempted entry's state intact, that
only refusal selects the fallback, and that unexpected errors reach the caller. The fixture
must actually reach the join. Valid recovery cases preserve their pose, physics and state;
the intentional error-propagation difference is recorded separately. Coordinate with the
[Recovery plan](2026-10-23-recovery.md) without changing its routes or physical targets.

### 5. Give ground positioning readable calculations and transitions

**Issue:** [groundPosition](../../src/core/mind/ground-position.ts) and
[groundNear](../../src/core/mind/ground-near.ts) compress motion checks, target selection,
geometry and state transitions into long statements with abbreviated local names.

**Solution:** Expand the statements and give the quiet-motion check, highest-surface selection,
admissible hand choice and approach calculations clear names. Keep policy decisions and state
updates visible in the state machine. Extract helpers only where they own a coherent calculation;
keep all changing memory in the existing `state` object. Use exhaustive handling for stage or
mode unions. Preserve selection ties, missing-segment behavior, deadlines, transition timing,
and the order in which targets and physical readings are evaluated.

**Checks:** Compare bounded near and wide ground-approach replays through admission, withdrawal
and return, including a blocked route and a moving target. Confirm the fixtures enter those
paths. Poses, physics and saved state match the baseline exactly. Read the final code for clear
control flow as well as passing checks; formatting alone does not resolve mixed responsibilities.

## Done when

- All six findings have their proposed ownership and API boundaries, with no target-selection
  rule or configuration-dependent construction embedded in the addressed parameter lists.
- Executor dependencies and Vanguard behavior choices are named at their call sites; preset
  data and saved-state contracts keep their meanings.
- Expected supported-entry refusal is observable without swallowing invalid inputs or unexpected
  errors, with the whole caller path covered by a fast regression.
- Valid-input behavior passes the scoped exact comparisons and the required repository gate;
  the deliberate error-handling change is identified explicitly.
- Each change lands independently with its checks, any architectural documentation made wrong
  is corrected, and the document links and line-ending gate pass.
