# Signal -- live roadmap

> **2026-09-11 status: five files written, nothing implemented, every gate open.**
> One file per landable session. The set was written the day the learn set closed, on a diagnosis
> of why that set shipped nothing. **No session in this set trains a policy**: every bar is stated
> on weights already on disk, and the whole set is well under a day of host time. Its deliverable
> is a priced decision about the next phase, not a mind. The learn set's durable record is
> `../design.md` and `../measurements.md`, and `../deleted-paths.md` lists its thirteen files.

## Why this plan exists

The learn set landed thirteen sessions in full and shipped nothing: no weights, no reward
coefficient, no executor row, no default moved. Every infrastructure bar was met -- the sharded
fit equals the single thread to 6e-14, an iteration fell from 109 s to 27.6 s, the sweep runner
clears 3.46x -- and every bar that asked a learned mind to beat a designed one was missed.
Session 11 then spent 400 iterations and 5h22m establishing that more of the same buys nothing:
3 of 25 columns move past two sigma over the last hundred iterations, and all three are the
policy's own spread.

The diagnosis taken 2026-09-11, before any code moved, found four defects. Three are in code and
one is in arithmetic, and **every one of them can be measured without a single training
iteration**:

- **The abort gate compounds, so the mind the fit trains almost never completes a stroke.** In
  `plan()` in `../../src/golem/tactics-v4.ts` the test is `striking && command.abort >= 0.5`
  against the *held* command, and the command refreshes at each 12 Hz ask. A stroke is
  `chamberSeconds` (0.22 to 0.40) plus `max(commitSeconds, strokeSeconds + followSeconds)` (0.22 to
  0.29) -- **0.44 to 0.69 s, five to eight asks** -- so a stroke must survive that many independent
  draws, `(1-p)^k`. At a uniform policy `p = 0.5` and `k = 7` gives 0.8 %, and Session 07 of the
  learn set measured 99.2 % of strokes started aborted; at the fit's 88 % it gives `p = 0.30` on
  six. To finish nine strokes in ten the policy needs an
  abort logit near -4, and `entropyGrad` in `../../src/golem/policy.ts` adds `-logit * p * (1-p)`
  per gate per sample with a fixed coefficient, so the entropy bonus pulls every gate logit toward
  a coin flip by the same mechanism that pushes `logSigma` up. The shipped table's gate logits at
  the mean observation are commit +0.062, abort -0.191, parry +0.066 -- all three within 0.2 of the
  knife edge. **And training draws the gate while every rating in this record reads it greedily**,
  so the policy the optimiser improves and the policy the bar measures are different policies.
- **Seven observation columns are divided by a ten-thousandth, and their weights were never
  fitted.** `normalise` in `../../src/golem/policy.ts` divides by `sqrt(variance + 1e-8)` and
  clamps to +-5, and the shipped table in `../../src/golem/policy-weights.ts` -- accumulated over
  11,390,700 mirrored observations -- has exactly zero variance on `bias`, `reachEdge`,
  `myWeapon:buckler`, `theirWeapon:buckler`, `myHealth:locomotion`, `theirHealth:locomotion` and
  `interceptWall`. The divisor is 1e-4, so `reachEdge` saturates at a reach gap of 0.25 mm. A
  column that is identically zero takes no gradient, so those first-layer weight columns are still
  at their initialisation: Glorot rms 0.07821, shipped layer-1 rms 0.07846. At +-5 the six
  non-bias dead columns contribute a pre-activation rms of 0.963 against the live columns' 0.627.
  **On random viable pairs more than half the shipped mind's first hidden layer is unfitted noise
  that flips sign with the reach order; on the mirror it is exactly zero.**
- **In a mirrored bout the only reward with a non-zero mean pays for standing still.** Both
  corners are collected, so `dealt - taken` telescopes to zero in aggregate and `win * outcome`
  cancels; what is left of `GOLEM_REWARD` is `-0.004*clinchSeconds - 0.004*idleMetres`, and both
  are minimised by standing outside reach and holding still. In the league-long log the `idle` row
  grew 0.00324 to 0.04562 and is 84 % of the penalty share at iteration 400. Everything that run
  measured is that policy executed: stall 2.57 to 6.27 s, outside-reach 5.29 to 9.16 s, decided
  0.683 to 0.550, and against a body driven by `idle` the dummy's remaining health *rose* 0.613 to
  0.791 (t +7.67) while maul damage peaked at 37.6 at iteration 24 and fell to 9.3 (t -9.35).
- **The ruler was never the one the criterion named.** `ratePolicy` in
  `../../scripts/train-ppo.mjs` differences bout by bout against `uniform` and `golem-driver`
  only; `ratePaired` in `../../scripts/sweep.mjs` pairs against the control arm. **`golem-fencer`
  has never existed as a paired column on any rating path in this tree**, so the learn set's
  declared criterion was never measurable for the mind it was declared against. Session 11
  compounded it by calling `ratePaired` with one arm, which disables the paired column by
  construction, so every headline number in the final table is the unpaired `barD` -- a mean over
  52 heterogeneous builds with a per-bout standard deviation of 0.605 of a bar, on a pool where
  the body is worth 2.98x the mind.

**And one honest negative, established before this set was written.** The rate files under
league-long already carry a *paired* `golem-driver` column for all 29 rating points, and re-read
on it the 400-iteration run has a slope of +0.0105 per 100 iterations at **t 1.12** on random
pairs (t -1.65 over the second half). Pairing does not rescue Session 11. The failure is real and
not an artifact; what pairing buys is every bar this project states from here, at `sem` 0.0259 on
300 paired bouts against 0.0568 unpaired on 600 -- about 4.8x in bouts.

**What the diagnosis got wrong, recorded because it cost a session.** The first reading was that
the mind is blind to its own range. It is not: `pilotFeatures` in `../../src/golem/pilot.ts`
writes `gapOverStrike`, `gapBeyondStrike` and `iReach` from `reading.strike`, which `plan()`
computes off the *acting hand's* reach, and `hold` carries the realised stand-off in metres. What
the mind cannot see is the *level* of its own reach, because `myReach` and `reachEdge` take the
body's primary. The real defect is a control inversion -- to act on `gapBeyondStrike` the policy
must emit `standOff = wanted / theirReach`, dividing two observed columns -- and that is
third-order against a policy that finishes one stroke in eight. The observation session drafted
for it is cut.

## Live session order

| session | outcome | after |
| --- | --- | --- |
| [00](signal-00-overview.md) | this file | -- |
| [01](signal-01-owed-gates.md) | the learn set's five owed verdicts, asked in one sitting, and the owner's eye on whether the mind finishes its strokes | -- |
| [02](signal-02-paired-column.md) | `golem-fencer` as a paired column on every rating path, and the refusals and defaults that would have caught three of the last set's confounds | -- |
| [03](signal-03-dead-columns.md) | a variance floor, and the shipped mind re-rated three ways without touching a weight | 02 |
| [04](signal-04-abort-gate.md) | `latchAbort`, the drawn-against-greedy gap, and the priced menu the set exists to produce | 02, 03 |

01 and 02 touch disjoint files and may run in parallel. 03 follows 02 because its bar is stated on
02's column. 04 follows 03 because the dead columns change what the gate measurement is measuring.

## Frozen choices for this set

1. **No session trains a policy.** Every bar is stated on weights already on disk. The most
   expensive failure available to a successor of the learn set is a night that reproduces "nothing
   moved", and this set is built so that it cannot buy one.
2. **A bar is stated on a paired column against a designed mind, or it is not stated.** Cohen's d
   on the bout-by-bout difference, same builds, same seeds. `barD` -- an arm's own margin
   standardised by a per-bout spread of 0.605 -- stays printed, stays labelled, and appears in no
   bar in this set. The learn set declared this criterion and never once measured it against
   `golem-fencer`; Session 02 makes it true before Session 03 states one.
3. **Versioned by addition, and nothing shipped moves.** `POLICY_VERSION`, `PILOT_FEATURE_NAMES`,
   `PILOT_FEATURE_NAMES_V2`, `COMMAND_AXES` and every candidate row of `GOLEM_TACTICS_V4` stay
   where they are. `latchAbort` ships **off**: Session 04 measures it, it does not adopt it.
4. **`../../src/golem/policy-weights.ts` is not touched at all.** Session 03 fixes the *reader*:
   a column whose fitted variance is dead normalises to zero, which is provably what the fit saw
   on every one of its 11,390,700 rows. So no number in `../measurements.md` moves, and the change
   differs only on inputs the fit never saw -- which is the whole of the defect.
5. **The screen's default stays `golem-fencer`.** Nothing in this set can ship a mind, because
   nothing in this set fits one.
6. **Seeds do not move.** Rating stays 20260906, the seed every bar in the record is stated at. No
   new fit seed is reserved because there is no fit.
7. **`boutSplit`'s rounding does not change.** Changing it would move the bout schedule of every
   run in the record; Session 02 adds a refusal beside it instead.
8. **Two experiments are named and deliberately not run**: `--opponent idle` and the
   gradient-signal probe. Both are one evening each, both are priced in Session 04's table, and
   both are the owner's call rather than this set's.

## Conventions for this plan set

- A session's status line is the only line an agent edits in another session's file, and only to
  record a landed dependency. Human-gate verdicts are written by the owner.
- No line anchors in these files. Name the construct.
- **A file that does not exist yet is named without a code span.** `../../tests/docs.test.mjs`
  pins the count of backticked paths under `docs/plans/` that resolve nowhere, and that pin is
  zero. Files under `tournaments/` are named bare for the same reason: the directory is gitignored.
- Every session runs `npm run check`, `npm test`, `npm run build` and `git diff --check` from
  inside `sword-prototype/` before landing, plus the root docs checker when it touches a Markdown
  link, and leaves no dev server running.
- A session that deletes a file regenerates `../deleted-paths.md` in a second commit.
- Durable results go to `../design.md` (what it is) and `../measurements.md` (what was measured, in
  which harness, with which seed). These files are not a second authority.
- ASCII in code and in these files: `--`, `+-`, `->`. Line endings LF, as `../design.md` and
  `../measurements.md` are.

## Human gates

The learn set recorded twelve gates and asked none of them. Five are still live, and this set's
first session asks all five in one sitting at the owner's instruction of 2026-09-11 -- before any
new work, because an eye on a mind that completes one stroke in eight is direct evidence for or
against the first finding above. Sessions 02, 03 and 04 answer to mechanical bars stated in their
own files before any data exists.

| session | the owner is asked | verdict |
| --- | --- | --- |
| 01 | the learn set's five owed gates, and whether the mind finishes the strokes it starts | open |
| 02 | nothing; the bar is that pairing tightens the interval on the same bouts | open, and not asked |
| 03 | nothing; the bar is d 0.10 from a change that touches no weight | open, and not asked |
| 04 | which of the two priced experiments, if either, the next phase runs | open |

## What must not move

- `../../src/golem/policy-weights.ts`'s weight arrays, its `logSigma` and its header's provenance.
  Session 03 regenerates its variance array alone.
- `../../src/units.ts`'s screened default and the two rows of `GOLEM_ASSEMBLY` the style set
  landed.
- `../../tests/ppo.test.mjs`'s refusal tests, the sharded-equality tests at 1e-9 and the
  byte-identical rerun of the tournament; and the telescoping test in
  `../../tests/reward.test.mjs`.
- `boutSplit`'s rounding, and `extendNormalisation`'s composition arithmetic. Session 03 changes
  where a variance is written, not how one is accumulated.
- The seeds the record was taken on: pools 20260906, the shipped league 20260914, the learn set's
  sweeps 20260915 and 20260916.
