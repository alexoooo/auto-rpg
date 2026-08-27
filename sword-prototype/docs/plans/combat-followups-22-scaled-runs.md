# Session 22 -- scale out only what survived the ladder

> **Corrections, 2026-08-26.** Measured against the tree at `86b74c8`.
>
> - **The look-ahead schedule key has four names, not five.** Stage C2c measured the stance
>   out of it: `lookaheadTacticCellSchedule` enumerates `cell x movement x (action, effector,
>   target)` and the stance is left at `UNLEARNED_STANCE`. The phrase "the exact compatible
>   `(movement, action, effector, target, stance)` count" names one head the key does not
>   carry.
> - **Six policy-head entropy diagnostics, not five.**
> - **The DAgger report lists macro-F1 for five heads and omits the dwell.**
>   `DAGGER_HEAD_NAMES` is five and the selection loss adds the persistence term separately;
>   say what the sixth head is scored on.
> - **Session 19 closed the execution gaps this draft inherited.** Every runner now owns
>   ledger/resume/finalization and PPO has a repeated outer loop. Session 20 still owes the
>   measured update ceilings and parallel topology; none is inferred here.

## Entry gate

At least one direction advanced in session 21 under its four declared criteria. Killed
directions are not run here. If nothing advanced, this session does not exist and the named
diagnosis session from session 21 runs instead.

## Outcome

For each surviving direction, complete the remaining two seeds -- and, for NEAT-QD only, the
three declared ablations -- under ceilings derived from that direction's own rung-1 plateau.
Produce one validation-selected artifact per direction for session 23.

## Ceilings

From session 20's arithmetic and session 21's result, per surviving direction:

- **Ceiling** = the lesser of 3x that direction's rung-1 plateau update count and 72 hours at its
  measured rate. Solver steps remain an observed derived column. A direction that plateaued at
  four hours does not get a three-day window
  because a sibling needed one.
- **Cadence and plateau arguments** carry over from the rung unchanged, so rung-1 and scaled
  ledgers are directly comparable.
- **Ablations** run at 10 % of that direction's scaled ceiling.

Every run resolves these from the frozen contract via `--rung 2`, never from the command line.
A run stops at plateau or ceiling and its report names which, exactly as in the ladder.

## Balance changes during a scaled run

A scaled run can occupy three days, so this will happen. The game outranks the run.

Make the change. Then choose, in the moment, and record the choice with its reason:

- **Finish under the old digest and label it.** Valid when the change cannot plausibly affect
  the gates being measured. The report carries the superseded balance-config digest and says so
  in one line, and session 23 treats it as a run under a different game.
- **Discard and restart the rung.** Valid when it can. Costs at most the ceiling.

What is never valid is holding the change until the runs finish. That is the failure this plan
set was rewritten to remove, and a three-day run is exactly long enough for it to feel
reasonable.

Seeds within a direction must share one balance-config digest. A direction whose three seeds
ran under two different games has no seed variance to report, only confusion.

## Per-direction requirements

Everything below is retained from the original per-algorithm sessions; only the budget and stop
condition changed.

### NEAT-QD

Seeds 310019 and 310031, plus ablations `without-curriculum`, `without-qd` and
`fixed-species-threshold` at seed 310013.

- Each report names validation macro, worst-cell, archive coverage, species history and the
  selected champion. Selection is worst-cell first and **never reads test**.
- Reports name effector, target and stance diversity as well as movement and action diversity;
  a controller that emits varied action names while using one arm, one aim and one pose must be
  visible.
- A worker-count and completed-checkpoint resume check reproduces bytes on a small duplicate
  probe before the full artifacts land.
- The ablations are reported whether or not they flatter the full configuration.

### DAgger

Seeds 310019 and 310031.

- Every iteration retains learner-visited state provenance, teacher engagement evidence,
  train/validation separation, movement/action/effector/target/stance macro-F1, attack,
  effector and target recall, and the clone-only comparison.
- The selected iteration is validation-only and its artifact reloads under the frozen contract.
- A small `--workers 1` against `--workers 8` duplicate remains byte-identical before the
  reports land.

### Recurrent PPO

Seeds 310019 and 310031, both initialization arms per seed, equal budget across arms.

- League: all completed DAgger artifacts from this session and the ladder. For the second and
  third seed, also pass earlier frozen PPO champions so the runner retains the last four
  available PPO validation champions. Never pass a smoke or champion-so-far artifact.
- Schedule per session 20's measured within-seed and across-seed parallelism answer.
- The report prints every reward component, all six policy-head entropy diagnostics,
  optimizer and clipping diagnostics, recurrent gradient norms, and validation macro and
  worst-cell values.
- Validation alone selects the arm. No test row exists.
- An interrupted arm-boundary run reproduces the uninterrupted artifact, resume and report
  bytes.

### Bounded look-ahead

Seeds 310019 and 310031.

- The schedule covers all 15 body/loadout cells and the exact compatible
  `(movement, action, effector, target)` count measured by preflight. Look-ahead has no stance
  head and declares that absence explicitly rather than imitating a collapsed learned head. The
  obsolete
  action-v1 cell count is gone -- 220 before session 17 stage C1, 240 after it trained the
  `punch` the runtime already offered on `sword+empty` and `axe+empty`, and **280** since
  `sword+axe` joined the strata. Read the tuple count from
  `lookaheadTacticCellSchedule` rather than from either: it is 945 a split now against 775
  before the loadout, and the two columns do not scale together, because `sword+axe` is an
  ordinary row in the action count and the widest row in the tuple count.
- Every cell has train and validation calibration rows; no failed cell silently borrows another
  body's model.
- The artifact reloads and its runtime mind refuses each absent or over-threshold cell **by
  name**.
- Report signed reach error, contact Brier score, vitality-delta error, decisions per second
  and the engagement gates per seed.
- Validation error selects the artifact. Do not choose the fastest model or inspect test rows.

## Watch, and play

Same as the ladder, and more important here because the runs are longer: `npm run ai:watch`
per run, and the champion-so-far fought by hand at least once per seed. A three-day run that
nobody looked at is a three-day run nobody can defend.

## Accept

- Only surviving directions ran. Each has three seeds under one balance-config digest, or a
  recorded reason why not.
- Every run's report names `stopped: plateau` or `stopped: ceiling` and carries its ledger.
- Every per-direction requirement above is satisfied and recorded.
- Run time, observed throughput, per-seed validation results, ablations and failure cells are
  folded into `docs/measurements.md`, naming the harness. An unsuccessful artifact is not
  described as a candidate that passed.
- No gate or threshold moved. Any balance change carries its recorded finish-or-discard choice.
- `npm test`, `npm run check` and `npm run build` pass.
