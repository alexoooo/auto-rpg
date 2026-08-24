# Session 19 -- make a long run legible while it runs

## Outcome

No research command may run longer than one hour without saying, in gate terms, what it has
and has not found. Add a checkpoint ledger, a deterministic plateau stopping rule, and a
champion-so-far artifact that can be loaded into the arena and fought by hand mid-run.

Today a run is a black box until it terminates. `src/learning/checkpoint.ts` serializes a
network; it is not a periodic checkpointer. There is no elapsed-time or interval hook anywhere
in `src/learning/`. `--resume` and `--stop-after-jobs` let a run be stopped and continued;
neither tells anybody anything. This session fixes that for all four directions at once,
before any of them is authorized to spend real time.

## The ledger

Each run owns one append-only `ledger.jsonl` beside its artifact and resume state. One row per
checkpoint, written atomically, never rewritten. A row is a fact about a run, not a summary of
it; the report is assembled from the rows at the end.

Every row carries:

- `row`, `jobIndex`, `stepsConsumed`, `wallSeconds`, `stepsPerSecond` since the previous row;
- `configDigest` and `contractDigest` as they stood at the start of the run;
- validation macro and **validation worst-cell**, plus the best worst-cell seen so far and the
  row index at which it was last improved;
- the complete gate table: for each frozen threshold, the achieved value and the **signed
  margin**, never a bare pass/fail;
- a direction-specific block -- NEAT archive coverage, species count and mutation totals;
  DAgger iteration, rows aggregated and macro-F1 per head; PPO reward components and the five
  head entropies; look-ahead cells fitted and calibration error;
- `championDigest` for the artifact written alongside this row, and `improvedSinceRow`;
- one `summary` string, the same line printed to stdout, ending in either the new best
  worst-cell or the words that mean the opposite.

A row is written whether or not anything improved. **"No new champion" is a row.** That is the
requirement, not a nicety: a stall that produces silence is indistinguishable from a hang, and
six hours of either look identical from outside.

## Cadence without nondeterminism

The cadence is a **job-index quantity**, never a wall-clock trigger. `--checkpoint-every-jobs
N` decides when a row is written; session 20 chooses N per direction from measured throughput
so the observed spacing lands at or under one hour. `wallSeconds` is a reported column.

This is the whole reason the ledger is safe. A wall-clock trigger would make checkpoint
boundaries depend on machine load, which would make resume boundaries depend on machine load,
which would break byte-identical resume and make the plateau rule irreproducible. The ledger
observes; it never participates.

For the same reason the ledger's validation evaluations must draw from the run's existing
deterministic validation schedule. If a checkpoint needs an evaluation the run would not
otherwise perform, that evaluation is seeded from `(runSeed, jobIndex)` and consumes no RNG
draw the search itself would have used.

## The plateau rule

Declared before the run, recorded in the report, computed from the ledger alone:

> Stop when the best validation worst-cell has not improved by at least `--plateau-epsilon`
> (default 0.01) across the last `--plateau-rows` rows (default 6), or when the step ceiling is
> reached, whichever comes first.

Six rows at a one-hour cadence is roughly a six-hour flat stretch before a run gives up, which
is conservative for a search with restarts and long enough to survive a plateau that a species
event later escapes. Both values are run arguments so a direction can declare different ones
with a reason.

The report states which condition stopped the run in one of exactly two phrases -- `stopped:
plateau` or `stopped: ceiling` -- and carries the ledger that justifies it. **A run that hit
the ceiling still climbing is a result**, and the only evidence that may buy a larger window.

## Champion-so-far

At every row, write `champion-so-far.artifact` atomically beside the ledger: a complete,
reloadable `ResearchArtifact` under the current contract, not a pointer into resume state.

Make it loadable into the page through the existing deployment path, selectable from the debug
surface, so a run in progress can be fought by hand at any point without stopping it. A
controller you can fight for two minutes says things no ledger row does, and it is the closest
thing this plan has to the loop the whole prototype was built around.

The champion-so-far is never a promotion candidate and never enters a tournament. It is
labelled as an in-progress artifact in its own header, and the loader refuses to register it as
a policy.

## Watching a run

Add `npm run ai:watch -- --run <dir>`: read the ledger, print the last row's gate table with
signed margins, the best-so-far, rows since improvement, elapsed, and observed steps/second.
With `--follow`, reprint on each new row. It reads; it never writes and never attaches to the
running process.

## Tests and adversarial proof

- `tests/ledger.test.mjs`:
  `checkpointing_does_not_change_the_search` -- run a short job schedule with checkpointing on
  and off and require byte-identical artifact, resume and report. This is the load-bearing
  test; make it fail once by drawing a single RNG value inside the checkpoint path.
  `a_row_is_written_when_nothing_improved`; make the writer skip unchanged rows and watch it
  fail.
  `every_gate_row_carries_a_signed_margin` -- feed a row that misses one gate by 0.001 and
  require the margin, not a rounded pass.
  `a_truncated_final_row_is_ignored_and_the_run_resumes_from_the_last_complete_row` --
  simulate a kill mid-write.
- `tests/plateau.test.mjs`:
  `the_same_ledger_always_produces_the_same_stop_decision`;
  `an_improvement_of_exactly_epsilon_resets_the_counter`;
  `a_ceiling_stop_and_a_plateau_stop_are_distinguishable_in_the_report`.
- `tests/deployment.test.mjs`:
  `a_champion_so_far_artifact_reloads_and_refuses_policy_registration`.

Then set the cadence to a wall-clock timer in a fixture and watch
`checkpointing_does_not_change_the_search` fail on a loaded machine. That failure is the
argument for the job-index design and belongs in the trap list in `AGENTS.md`.

## Accept

- All four directions emit a ledger under one schema; the row schema is frozen by session 20.
- A run left alone for a day produces at least twenty-four rows, and a stalled run produces
  them too.
- Checkpointing on and off are byte-identical for artifact, resume and report.
- The plateau decision is reproducible from a ledger file with no other input.
- `npm run ai:watch` prints the current gate table with signed margins.
- A champion-so-far can be loaded into the visible arena and fought while its run continues.
- Update the research sections of `docs/design.md` and `AGENTS.md`; record the ledger row
  schema in `docs/measurements.md` as the contract that later tables refer to.
- `npm test`, `npm run check` and `npm run build` pass.
