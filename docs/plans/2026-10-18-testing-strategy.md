# Testing stable contracts and useful capabilities

Protect code quality and the gameplay we intend to support while allowing Minds, skills and
controllers to change. A useful test identifies a broken contract or an observable failure.
Keeping an old implementation's incidental behaviour is not a goal.

This is a migration plan alongside the [AI experiments plan](2026-10-18-ai-experiments.md).
The current commands and gates in `AGENTS.md` remain in force until their replacements land.
This document changes no test selection or acceptance criteria by itself.

## What checks protect

Separate checks by purpose before separating them by runtime:

| Purpose | What it establishes | When it matters |
|---|---|---|
| Software contracts | Commands are validated, limits enforced, state isolated, lifecycle correct and replay reproducible. | A small routine code gate, with focused checks for the changed boundary. |
| Supported gameplay | An agreed capability works through the real game path and leaves the body able to continue. | Relevant checks during development; the agreed set blocks promotion or release. |
| Experimental quality | A candidate's capability, fighting strength or cost under stated conditions. | Explicit evaluation when making that claim or choosing a new default. |
| Source policy | Required boundaries, provenance and other repository rules hold. | Separately named checks, so a policy failure is distinct from broken gameplay. |

The routine gate includes type checking and a small whole-path smoke check; build and page-start
checks cover the browser path when relevant. Keep useful unit tests for rules and algorithms.
Expensive research sweeps are not routine correctness checks. Experimental controllers can fail
their objectives without making the shared framework incorrect.

Choose a small set of supported gameplay promises with the owner. Each names its conditions and
observable outcome: for example, reaching a destination, stopping and acting again, or striking
an actual target and returning to usable control. An unfinished goal remains visibly unmet;
passing software checks does not make it supported. An accepted promise cannot become optional
merely because a change breaks it.

The frozen stand-up evaluator, pin, cases and agreed criteria remain unchanged. Its integrity
checks and candidate acceptance are separate questions; neither implies current-game capability.

## How tests stay general

- **Test the contract.** Check inputs, outputs and observable consequences. Assert internal
  phases or data layout only when those are themselves the contract. Use exact equality for
  exact rules and same-configuration replay. Judge physical outcomes with meaningful units and
  limits from the promised task, rather than the last run's trajectory or step count.
- **Exercise the real path.** Physical capability checks use normal construction, commands,
  actuation and world stepping. Fixtures may isolate a task; constraints and assists are
  explicit. Score outcomes independently of a controller's completion flag. Pure logic tests
  can use small synthetic inputs without claiming physical capability.
- **Share scenarios across implementations.** Parameterize bodies, equipment and controllers
  through their public configuration. Keep scoring independent of their identity. Test more
  than one meaningful case where generality is claimed; use distinct implementations to check
  a shared interface. Avoid copied fixtures and per-controller exceptions in the evaluator.
- **Keep fixtures valid.** Generate current-code physical scenarios on their stated body and
  engine. Raw saved worlds require matching configuration; reject incompatible snapshots.
  Historical replay belongs in its frozen environment. Updating a body does not silently update
  the expected result or make an invalid fixture evidence of a regression.
- **Check the checks.** For an important contract or promise, introduce a representative defect
  and verify the check detects it for the right reason. Use small seeded sequences for state,
  command and lifecycle invariants where helpful. A second implementation and a negative case
  are stronger evidence than a test that repeats the implementation's formula.

Hand-authored algorithms and tuned parameters are valid implementation choices. Tests must not
force special cases into shared code for a particular fixture, model, opponent or seed. Reuse
the existing runner and environments; add abstractions only when concrete checks need them.

## Comparisons and failures

Compare candidate controllers under matching scenarios, bodies, physics, permissions and
assists. Keep absolute supported-gameplay requirements alongside baseline comparisons. Report
results against individual opponents and use fresh cases when confirming an improvement.
Run broader evaluations when promoting a candidate, rather than requalifying it after every edit.

When a check fails, identify whether it exposes a contract violation, a lost supported capability,
an unmet experimental goal, an invalid fixture or a broken test. Fix the responsible part.
Retire redundant or implementation-specific assertions while preserving the requirement they
were meant to protect. Timeouts and invalid runs are failed or inconclusive checks.

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
