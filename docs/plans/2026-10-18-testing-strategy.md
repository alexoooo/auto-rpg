# Testing stable contracts and useful capabilities

Protect code quality and the gameplay we intend to support while allowing Minds, skills and
controllers to change. A useful test identifies a broken contract or an observable failure.

This is a migration plan alongside the [AI experiments plan](2026-10-18-ai-experiments.md).
The current commands and gates in `AGENTS.md` remain in force until their replacements land.
This document changes no test selection or acceptance criteria by itself.

## What checks protect

Separate checks by purpose before separating them by runtime:

| Purpose | What it establishes | When it matters |
|---|---|---|
| Software contracts | Validation, physical limits, state isolation, lifecycle and action replay. | Small routine gate and focused checks for changed contracts. |
| Supported gameplay | Agreed outcomes through the real game path, including continued control. | Relevant development checks; the agreed set blocks promotion or release. |
| Experimental quality | Capability, fighting strength or cost under stated conditions. | Explicit evaluation of a claim or a new default. |
| Source policy | Required boundaries, provenance and other repository rules. | Separately named checks. |

The routine gate includes type checking and a small whole-path smoke check; build and page-start
checks cover the browser path when relevant. Keep useful unit tests for rules and algorithms.
The software smoke check exercises sensing, commands, physics and observations. Wounding both
opponents or staying upright through a particular bout are gameplay promises, checked separately.
Experimental failure does not imply broken infrastructure; research sweeps are separate from
the routine gate. These groups are selection and reporting labels in the existing runner.

Choose a small set of supported gameplay promises with the owner. Each names its supported
configurations, conditions and observable outcome: for example, reaching a destination, stopping
and acting again. Apply the same scoring to every implementation claiming that capability.
Unsupported configurations are outside that claim, never successful trials. An unfinished goal
remains visibly unmet; an accepted promise cannot become optional merely because a change breaks it.

The frozen stand-up evaluator, pin, cases and agreed criteria remain unchanged. Its integrity
checks and candidate acceptance are separate questions; neither implies current-game capability.

## How tests stay general

- **Test the contract.** Check inputs, outputs and observable consequences. Assert internal
  phases or data layout only when those are themselves the contract. Use exact equality for
  exact rules and simulation replay from matching initial state and recorded applied inputs.
  Replay must work with the participating Minds disabled. CPU and GPU policies can decide
  differently on another run; test decision repeatability only for an implementation that
  explicitly promises it. Judge physical outcomes with meaningful units and limits from the
  promised task, rather than the last run's trajectory or step count.
- **Exercise the real path.** Physical capability checks use normal construction, commands,
  actuation and world stepping. Fixtures may isolate a task; constraints and assists are
  explicit. Score outcomes independently of a controller's completion flag. Pure logic tests
  can use small synthetic inputs without claiming physical capability.
- **Share scenarios across implementations.** Parameterize bodies, equipment and controllers
  through public configuration. Reuse task setup and scoring between tests and experiments.
  Exercise meaningful variations where generality is claimed and distinct implementations at
  shared interfaces. Avoid copied fixtures and per-controller exceptions in the evaluator.
- **Keep fixtures valid.** Generate current-code physical scenarios on their stated body and
  engine. Raw saved worlds require matching configuration; reject incompatible snapshots.
  Historical replay belongs in its frozen environment. Updating a body does not silently update
  the expected result or make an invalid fixture evidence of a regression.
- **Check the checks.** When adding an important check, use a negative case or representative
  defect to verify it detects the intended failure. Use small seeded sequences for lifecycle
  and state invariants where helpful. Keep this verification inside ordinary tests.

Hand-authored algorithms and tuned parameters are valid implementation choices. Tests must not
force special cases into shared code for a particular fixture, model, opponent or seed. Reuse
ordinary scenario functions and existing environments; extract shared code when concrete uses
need it. Keep expectations independent of the algorithm being checked.

## Comparisons and failures

Compare candidate controllers under matching scenarios, bodies, physics, permissions and
assists. Keep absolute supported-gameplay requirements alongside baseline comparisons. Report
results against individual opponents and use fresh cases when confirming an improvement.
Run broader evaluations when promoting a candidate, rather than requalifying it after every edit.
A scenario seed identifies conditions; reproducing AI decisions is not assumed. Use repeated
trials when evaluating candidates whose decision-making varies.

When a check fails, identify whether it exposes a contract violation, a lost supported capability,
an unmet experimental goal, an invalid fixture or a broken test. Fix the responsible part.
Retire redundant or implementation-specific assertions while preserving the requirement they
were meant to protect. Timeouts and invalid runs are failed or inconclusive checks.

A failing physical check reports the recipe and seed, code and engine identity, recorded applied
inputs, failed condition and observed result with the expected value or limit. Provide a
single-case replay through the same simulation path so diagnosis does not require rerunning
policy inference or a research sweep.

Do not relax thresholds, select easier seeds, add hidden assistance, regenerate expected results
or skip a failing promise merely to get green. A change to supported scope is an explicit owner
decision. Reports distinguish software correctness, supported gameplay and experimental results;
a passing group cannot hide failures or untested claims in another.

## Order of work

1. Review the existing checks and recent costly failures. Identify the contract or promise each
   protects, its proper group and any duplicate or obsolete assertion. Agree the initial gameplay
   promises without inventing new capability thresholds or weakening existing acceptance.
2. Migrate one area at a time. Reuse fixtures, replace brittle assertions and demonstrate detection
   of the relevant defect. Keep failures visible; do not delete whole groups to shorten the run.
3. Update `scripts/test.mjs`, `.github/workflows/pages.yml` and `AGENTS.md` together as each new
   selection rule lands. Keep local and CI meanings consistent and preserve the frozen evaluator.
   Move the lasting rules into `AGENTS.md` and `docs/architecture.md`, then remove this plan.
