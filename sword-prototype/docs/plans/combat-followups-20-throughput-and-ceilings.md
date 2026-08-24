# Session 20 -- measure throughput, derive every ceiling, freeze the contract

## Outcome

Replace the extrapolated schedule with a measured one. Establish steady-state throughput for
all four directions at their intended worker counts, convert the declared wall-clock windows
into per-direction step ceilings and checkpoint cadences, then freeze the compute-contract
digest and the ledger row schema.

This is the real preflight. Its predecessor froze a budget and audited the machinery around
it; this one measures the machine and derives the budget from what it finds.

## What the old estimates were worth

`docs/measurements.md` extrapolates roughly 86 hours for one NEAT seed and 125 hours for one
DAgger seed. Those come from a **30,720-step** NEAT smoke and a **19,200-step** DAgger smoke:
0.0017 % and 0.0011 % of the old 1.8 B budget, extrapolated about 58,600x and 93,800x, with
warm-up, validation overhead and worker contention all outside the sample. The handoff already
labels them scheduling hints. Treat them as the null hypothesis to be replaced, not a baseline
to be refined.

PPO has no estimate at all, and it is the direction most likely to dominate the schedule: the
runner deliberately refuses `--workers` greater than 1. Measure it first.

## Measure

For each direction, run a **fixed wall-clock window** -- 30 minutes is enough once warm-up is
excluded -- at the worker count that direction will actually use, on an otherwise idle machine,
with nothing else running in the browser or the editor.

Bracket every reading: **control, subject, control**. Run the same short reference schedule
before and after each measurement window and report the spread between the two controls
alongside the subject. A subject reading whose brackets disagree by more than the difference
being claimed is not a reading, and the window is repeated rather than averaged.

Record for each direction:

- steady-state solver steps per second, excluding a declared warm-up prefix that is stated as a
  step count and shown to be excluded;
- the warm-up cost itself, so a short rung is not credited with steady-state throughput;
- validation and checkpoint overhead as a percentage of wall time, measured by differencing a
  window with checkpointing on against one with it off -- the same pair session 19's
  byte-identity test already builds;
- machine utilisation: threads busy, and for `--workers 8` the per-worker efficiency against
  the `--workers 1` rate.

Then answer the scheduling question that only PPO raises: **at `--workers 1`, how much of the
host is idle, and can three PPO seeds run concurrently without disturbing each other's
throughput?** Measure one seed alone, then three concurrently, and report both. If three
concurrent single-worker runs cost less than three sequential ones, session 22's PPO schedule
changes shape, and that is worth knowing before it is written down.

## Derive

Convert the declared windows from the overview into concrete arguments, and record the
arithmetic beside the result so anybody can check it:

- **Ceiling** = steady-state steps/second x window x (1 - overhead), per direction, per seed.
  The ladder window is 24 hours; the scaled window is the lesser of 3x the rung-1 plateau step
  count and 72 hours.
- **Cadence** `--checkpoint-every-jobs N`, chosen per direction so the observed row spacing
  lands at or under one hour at the measured rate. State the expected spacing in minutes and
  the number of rows a full rung will produce; if a 24-hour rung would produce fewer than
  twenty-four rows, N is wrong.
- **Plateau arguments** per direction, if any direction has a reason to depart from six rows
  and 0.01. A departure carries its reason in the same table.

Write all of it into `docs/measurements.md` as one dated throughput table naming its harness,
its host and its bracket spreads. This table is what future scheduling decisions cite; the
86/125-hour figures are superseded and should be marked as such where they appear.

## Freeze

1. Compute the compute-contract digest over the exact frozen surface: feature v4 column names
   and normalization, the mirror tables, tactic v2 vocabulary, legal masks, threat selection,
   the ledger row schema, and the derived ceilings, cadences and plateau arguments.
2. Add `npm run ai:preflight`. It validates that digest, the feature/tactic versions, the
   ledger schema, the artifact codec and every declared threshold, and **refuses a missing or
   mismatched digest before solver step one**. Every research command takes the digest as a
   required argument and calls the same check. Sessions 24 and 25 already invoke this command.
3. Record the balance-config digest mechanism from the overview: every run stamps the config
   digest it started under into its ledger header and its report.
4. Fold the durable conclusions from `session15-workers8-smoke/`, `session16-final-workers8/`
   and `session18-minimum/` into `docs/measurements.md` as prose and tables, then delete all
   three directories. Stale-version refusal is tested with synthetic headers; the repository
   does not keep old runnable payloads to prove that they are old.

## Tests and adversarial proof

- `tests/preflight.test.mjs`:
  `a_missing_or_mismatched_contract_digest_refuses_before_the_first_solver_step`;
  `a_changed_ledger_row_schema_changes_the_digest`;
  `a_changed_balance_constant_does_not_change_the_contract_digest_but_is_recorded`.
- `tests/ceilings.test.mjs`:
  `a_derived_ceiling_is_reproduced_from_its_recorded_rate_window_and_overhead` -- the
  arithmetic is checked, not trusted.

Point the preflight at a digest computed over feature v3 and watch it refuse. Then remove one
column name from the digest input and confirm the digest still changes; a digest that only
covers versions and not contents would let a renormalized column pass as the same contract.

## Accept

- One dated throughput table covers all four directions with bracketed readings, warm-up
  excluded and stated, and checkpoint overhead measured rather than assumed.
- PPO has a measured rate and a concurrency answer.
- Every ceiling, cadence and plateau argument in sessions 21 and 22 is derived from that table,
  with its arithmetic shown.
- `npm run ai:preflight` exists and refuses on any contract mismatch before solver work.
- The three retained smoke directories are gone and their conclusions survive as prose.
- The superseded 86/125-hour extrapolations are marked superseded where they appear.
- `npm test`, `npm run check` and `npm run build` pass.
