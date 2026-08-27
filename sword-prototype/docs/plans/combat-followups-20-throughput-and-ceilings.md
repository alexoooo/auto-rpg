# Session 20 -- measure throughput, derive every ceiling, freeze the contract

> **Current entry state, 2026-08-26.** The defects this file originally assigned to the start
> of session 20 are now closed, but no throughput schedule has been measured.
>
> - **The ceiling this session derives is a count of *updates* per direction, with steps as
>   a derived column.** A step budget is not a learning budget for three of the four:
>   The old PPO runner could not spend one at all (5,508 consumed against 800,000 requested),
>   and NEAT-QD and DAgger scale by `--generations` and `--iterations` while `--solver-steps` only lengthens
>   the bouts inside a fixed number of updates. Only look-ahead turns steps into fitted rows.
>   Deriving a step ceiling and handing it to sessions 21 and 22 schedules a quantity that
>   does not move three of the four directions.
> - **PPO now has the outer loop that measurement needs.** Repeated
>   collect/update/validation jobs spend the declared ceiling and publish resumable ledger rows.
>   The old four-bout/twenty-second figure is historical and says nothing about current throughput.
> - **`--rung` does not exist anywhere in the tree**, and sessions 21 and 22 both require it
>   ("resolve these from the frozen contract via `--rung 2`, never from the command line").
>   This session or 21 must own building it.
> - **The digest/preflight mechanism is implemented.** All four runners use the same canonical
>   config spelling and refuse a missing or stale contract digest before their first worker or
>   collector call. The frozen surface deliberately says pre-throughput and contains no invented
>   ceiling or cadence; this session extends it only after taking the measurements below.
> - **Worth bracketing early.** The null control runs 120 bouts of 3.52 s in 16.3 s of wall
>   clock -- about 26x real time on one thread, one unbracketed reading, bench harness. If
>   NEAT's rate is within a factor of two of that, the 86- and 125-hour extrapolations in
>   `docs/measurements.md` are out by roughly an order of magnitude. They are already
>   suspect: they came from a 0.0017 % smoke.

## Outcome

Replace the extrapolated schedule with a measured one. Establish steady-state throughput for
all four directions at their intended worker counts, convert the declared wall-clock windows
into per-direction step ceilings and checkpoint cadences, then freeze the compute-contract
digest and the ledger row schema.

**Entry gate:** session 18b's formal human gate-feasibility verdict exists. The brief positive
play note in `docs/measurements.md` is useful qualitative evidence and is not that verdict. Until
18b is complete, do not run the throughput windows or any research rung. Software-only preflight,
resume and parallelism work may land ahead of the measurement; no ceiling may.

This is the real preflight. Its predecessor froze a budget and audited the machinery around
it; this one measures the machine and derives the budget from what it finds.

## What the old estimates were worth

`docs/measurements.md` extrapolates roughly 86 hours for one NEAT seed and 125 hours for one
DAgger seed. Those come from a **30,720-step** NEAT smoke and a **19,200-step** DAgger smoke:
0.0017 % and 0.0011 % of the old 1.8 B budget, extrapolated about 58,600x and 93,800x, with
warm-up, validation overhead and worker contention all outside the sample. The handoff already
labels them scheduling hints. Treat them as the null hypothesis to be replaced, not a baseline
to be refined.

PPO has no current estimate at all: its only number came from the retired fixed four-bout runner.
Measure it first, including the worker/seed parallelism shape, because the outer loop is new and
its utilisation cannot be inferred from the single-core probe.

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

Then answer PPO's scheduling question across both available axes: **how does one seed scale with
its supported worker counts, and how do several seeds coexist?** Measure a single-worker control,
the candidate within-seed worker counts, and three concurrent seeds at the best justified count.
Report total throughput, per-worker efficiency and host utilisation for each. Session 22 uses the
best measured topology; neither one worker nor one process is privileged in advance.

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

## Complete the freeze

The canonical digest, balance-config provenance and early refusal already exist. Finish rather
than replace that foundation:

1. Extend the compute-contract digest over the measured schedule as well as the exact frozen surface: feature v4 column names
   and normalization, the mirror tables, tactic v2 vocabulary, legal masks, threat selection,
   the ledger row schema, and the derived ceilings, cadences and plateau arguments.
2. Extend the existing `npm run ai:preflight` checks to the derived ceilings and cadences. Keep
   its current early-refusal tests and all-runner wiring intact.
3. Confirm the existing balance-config digest remains provenance rather than part of the frozen
   learned-interface digest, and that every final report carries both identities.
4. Fold the durable conclusions from `session15-workers8-smoke/`, `session16-final-workers8/`
   and `session18-minimum/` into `docs/measurements.md` as prose and tables, then delete all
   three directories. Stale-version refusal is tested with synthetic headers; the repository
   does not keep old runnable payloads to prove that they are old.

## Tests and adversarial proof

- `tests/preflight.test.mjs` already pins missing/stale refusal, surface drift and balance-config
  separation. Add the measured schedule to those existing mutation proofs.
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
- `npm run ai:preflight` still refuses on any contract mismatch before solver work, now including
  the measured schedule rather than only the pre-throughput surface.
- The three retained smoke directories are gone and their conclusions survive as prose.
- The superseded 86/125-hour extrapolations are marked superseded where they appear.
- `npm test`, `npm run check` and `npm run build` pass.
