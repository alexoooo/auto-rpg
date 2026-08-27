# Sword prototype -- remaining combat follow-ups

## Outcome

Correct and freeze the policy boundary, find out whether the engagement gates are reachable by
anything at all, then spend compute in rungs that report progress hourly and can be abandoned
in a day. Do not freeze the game in order to finish a search.

The simulator, four research implementations and the tournament machinery exist. Three things
are still wrong, and only the first was known when this plan set was written.

1. **Corrected.** The policy boundary mixed camera state into combat commands, learned
   controllers could not choose an acting hand, aim region or body stance, and no policy could
   observe an arrow in flight. Sessions 15--17 landed and their plan files are deleted; what
   they measured is in `docs/measurements.md` and what they decided is in `docs/design.md`.
2. **Instrument corrected; human reading still owed.** The promotion gates were frozen before
   the instrument had ever been pointed at a person. Session 18a landed one shared label-free
   `BoutRecorder`, and the guided page flow now owns the declared human/control schedule,
   autosave and report. Opportunity-attack 0.65 still has never been shown reachable by a
   controller *or* a player; the 18b sitting finds out before compute begins.
3. **Run foundation corrected; measurements still owed.** Session 19 gave PPO a repeated
   collect/update/validation outer loop and gave all four directions the same indexed
   ledger/resume/finalization lifecycle. The pre-throughput half of session 20 has also landed:
   one canonical config digest, a shared contract surface and a preflight refusal before solver
   work. The human gate verdict and the measured throughput, parallelism, ceilings and cadences
   still precede any research rung.

## What the compute phase must not repeat

The kernel that preceded this prototype was not slow because it was hand-written. It was slow
because its cost of change was frozen around machinery that could prove a run reproducible and
could never say whether the fight was good. The first draft of sessions 18--22 reproduced that
three ways. Each replacement below is a standing rule for this plan set, not a one-time edit.

- **A frozen number nobody measured.** 1,800,000,000 solver steps was an accept criterion --
  `every full report says exactly 1,800,000,000 consumed` -- not a measurement. Its supporting
  evidence was a 30,720-step NEAT smoke and a 19,200-step DAgger smoke: 0.0017 % and 0.0011 %
  of the budget, extrapolated roughly 58,600x and 93,800x. A run that had learned everything it
  was going to learn at 200 M steps would still have had to burn 1.6 B more to produce an
  acceptable report.
  **Replacement:** a step budget is a *ceiling*. The accept criterion is a declared plateau
  rule read off a checkpoint ledger, and the report carries the curve that justifies the stop.
  **Session 19 retired the number from the tree**: the unused
  `RESEARCH_SOLVER_STEP_BUDGET` and both `fullBudgetCompleted` report fields are gone, and the
  runners now report a declared ceiling plus the ledger-derived stop.
- **A search that outranked the game.** The protected-surface rule forbade changing `POLICIES`,
  normalization, threat selection or any runtime balance constant for the duration, and
  invalidated every in-progress run if one moved. Against the measured half of the old schedule
  -- NEAT 3x86 h plus 26 h of ablations, DAgger 3x125 h, about 659 hours of continuous
  eight-worker compute -- that froze the whole remaining feel agenda in `docs/measurements.md`
  for more than a month, with PPO and look-ahead still unmeasured on top of it.
  **Replacement:** the game outranks the run. Balance and content changes stay legal at all
  times. Every run records the config digest it ran under; a change ends the rung in flight,
  which is then finished or discarded on purpose. A rung is sized so discarding one costs a day.
- **No falsification branch.** The only terminal was "if no candidate passes, add research."
  Correct as anti-fudging discipline, fatal as the sole exit: a plan whose failure mode is
  "spend more" cannot be wrong.
  **Replacement:** session 18 tests the gates against a person before any compute, and session
  21 has an explicit kill branch. If no direction advances from the first rung, the next
  session is an interface or gate session, not a bigger run.

Two further standing rules follow from those.

- **A long run must be legible while it runs.** No research command may go longer than one hour
  without appending a ledger row stating, in gate terms, what it has and has not found. "No new
  champion" is a row with margins beside it, not silence.
- **The ledger observes; it never participates.** Checkpoint cadence is a job-index quantity
  derived from measured throughput, never a wall-clock trigger, so byte-identical resume and
  the plateau rule both stay deterministic. Wall time is a reported column, not a control input.

## Remaining sessions

| session | remaining result | depends on |
| --- | --- | --- |
| [18a](combat-followups-18a-engagement-instrument.md) **complete** | shared page/bench engagement recorder, gate table and specialist bench command | 17, 19 |
| [18b](combat-followups-18-human-gate-feasibility.md) | measure a person on the promotion instrument; settle the open feel questions | 18a |
| [19](combat-followups-19-run-legibility.md) **complete** | checkpoint ledger, gate table per row, plateau rule, watchable champion-so-far | 17 |
| [20](combat-followups-20-throughput-and-ceilings.md) | finish the human-blocked throughput/parallelism measurements and derive every ceiling | 18b, 19 |
| [21](combat-followups-21-research-ladder.md) | one seed per direction under a one-day ceiling, then advance or kill each | 20 |
| [22](combat-followups-22-scaled-runs.md) | remaining seeds and declared ablations for surviving directions only | 21 |
| [23](combat-followups-23-held-out-ai-tournament.md) | freeze one selection per surviving direction and execute the test matrix once | 22 |
| [24](combat-followups-24-promoted-ai-integration.md) | integrate one passing artifact, or record the negative result | 23 |
| [25](combat-followups-25-integration-and-playtest.md) | full lifecycle gate, confirming playtest and durable close-out | 24 |

**Sessions 19 and 18a have landed, so 18b is the only session left before the compute phase.**
The page and bench now share the versioned recorder and gate table; 18b is the person using that
instrument, taking the first readings and settling the predeclared feasibility questions. Session
Its software preflight foundation is already present, but session 20 remains blocked on that
human verdict before it measures throughput or freezes any schedule.
Session 22 needs 21's verdict. Session 23 does not begin until every surviving direction has a
complete report and artifact.

## Contract that session 20 must freeze

- Combat commands contain locomotion, posture and two hands; camera zoom is host-only.
- Learned input is feature v4, with exact column names, normalization, mirror mapping and
  threat-selection grammar pinned by a digest.
- Learned output is tactic v2:
  `movement + hand action + effector + target + stance + persistence`.
- An action/effector/target tuple is selected jointly from a legal mask. There is no silent
  fallback from a requested primary hand to the secondary or from a requested low/high target
  to the skill's old hard-coded aim.
- The full view contains every live, unspent projectile without allocations after warm-up. The
  learned vector receives the most imminent opponent threat, selected factually from melee
  tips, fists, natural attacks and arrows.
- Observations remain perfect world state: no opponent intent, solver object, policy state or
  test label; also no invented vision cone, occlusion or sensor noise.
- The checkpoint-ledger row schema, the plateau rule, and the per-direction ceilings measured
  in session 20.
- Old feature/action artifacts, reports and resume files are removed. A minimal current codec
  rejects synthetic stale headers before any solver step; it does not parse or migrate them.

## Budgets are derived, not declared

Nothing in this plan set names a step count in advance. Session 20 measures throughput for all
four directions -- **including PPO, which is the only one with no estimate at all and which the
runner deliberately restricts to `--workers 1`** -- and converts a declared wall-clock window
into a per-direction, per-seed step ceiling.

The declared windows are:

- **Ladder rung (session 21): at most 24 hours per direction per seed.** Sized so one overnight
  run either advances a direction or kills it, and so a balance change costs at most one day of
  discarded work.
- **Scaled run (session 22): at most 3x the rung-1 plateau step count for that direction**, and
  never more than 72 hours per seed. A direction that plateaued early does not earn a longer
  second run because a sibling direction needed one.
- **Ablations (session 22): 10 % of that direction's scaled ceiling.** Unchanged in spirit from
  the old 180 M figure, but now proportional to something measured.

A run stops at the plateau or the ceiling, whichever comes first, and its report says which. A
run that hit the ceiling still climbing is a *result* -- it is the evidence that buys a larger
window, and it is the only thing that may buy one.

**That was not expressible before session 19.** The historical probe recorded in
`docs/measurements.md` asked the old PPO runner for 800,000 solver steps and received 5,508,
because it ran exactly four bouts. Session 19 replaced that fixed four-bout path with a repeated
outer loop and made plateau/ceiling stops legal in every runner. Session 20 therefore derives a
count of learning updates per direction, with solver steps as an observed derived column; the old
5,508-step result remains evidence about the retired runner, not a current throughput estimate.

## Thresholds

The engagement thresholds are unchanged from the frozen set and remain feasibility gates, not
positive fitness: opportunity-to-attack rate >= 0.65; attack-to-damaging-contact rate >= 0.20;
near-range stall share <= 0.15; first-attack p90 <= 6 s; symmetric time-cap rate <= 0.10;
worst-cell specialist gap <= 0.15; at least three permitted non-recover actions each >= 8 %;
every safety flag passing.

They are unchanged **pending session 18**, which is the first time the instrument that produces
them will be pointed at a person. If a competent human playing the same cells cannot clear a
gate, that gate is mis-specified and is corrected there, with its evidence, before any compute
is spent chasing it. A gate may not be moved after a research run has been seen.

Do not lower a gate to fit a run, replace a rung with a smoke, select on test, or advertise a
promoted controller that did not pass.

## Protected surfaces

Scoped and time-boxed, replacing the old indefinite freeze.

- **Always frozen once session 20 lands:** feature v4 columns and normalization, tactic v2
  vocabulary, the mirror tables, legal masks, threat selection, the ledger row schema and the
  compute-contract digest. These define what a result *means*; changing one makes runs
  incomparable rather than merely stale.
- **Never frozen:** runtime balance constants, `POLICIES` records, specialist behaviour, arena
  content, assets, and anything else a person can feel. Change them whenever the game needs it.
- **The reconciliation:** every run records the balance-config digest it ran under alongside the
  compute-contract digest. A balance change does not invalidate a *finished* run; it annotates
  it. A rung in flight when a balance change lands is either finished under the old digest and
  labelled, or discarded -- an explicit recorded choice made in the moment, costing at most the
  rung's one-day ceiling.

Every landed session runs from `sword-prototype/`:

~~~powershell
npm test
npm run check
npm run build
~~~

Session 25 deletes this remaining plan set and handoff only after all results are folded into
durable documentation.

## Historical findings sessions 19 and the pre-throughput foundation closed

Measured during the pass that closed sessions 15--17 and the owner follow-ups. Each is one to
three lines with a pointer rather than a restatement; the evidence is in `docs/measurements.md`
unless another file is named.

- **The old PPO runner could not spend a learning budget.** Four bouts and two updates consumed
  about 5,508 steps against 800,000 requested. Session 19 added the repeated
  collect/update/validation outer loop.
- **The four runners had four lifecycle shapes.** Session 19 generalized the useful pieces into
  indexed state, append-only ledgers, resumable publication and terminal finalization for NEAT-QD,
  DAgger, PPO and look-ahead. PPO and look-ahead now honor `--run-id`; look-ahead also owns its
  default run directory and outputs instead of requiring ad hoc output flags.
- **The old config digest had two incompatible spellings.** The pre-throughput foundation now
  computes one canonical contract digest and one canonical balance-config digest and requires all
  four runners to preflight them before their first worker or collector call. Measured schedules
  are deliberately absent from that surface until this session takes them.
- **A SHA-256 contract digest cannot live in `src/learning/`**: `node:crypto` is unavailable in
  the page and `crypto.subtle` is async. `src/learning/artifact.ts` records why.
- **The gate table has holes no runner can fill.** `firstAttackSeconds` is recorded and discarded
  in `research-rollout-worker.mjs`; `symmetricTimeCapRate` is computed only in the tournament;
  the specialist gap needs a control run no runner performs; PPO and look-ahead never read
  `result.engagement`.
- **A look-ahead budget that leaves cells unfitted is a narrower controller, not a cheaper one**,
  and nothing in the run record says which cells went.
- **Two commands the later sessions invoke still do not exist**: `--rung` and
  `--verify-promoted`. Session 20 owns freezing the schedule that `--rung` will resolve; session
  23 or 24 owns promoted-artifact verification.
- **The prototype's own session numbering collides with this plan set's.** `docs/measurements.md`
  already has headings for "Session 18", "Session 19" and "Session 27" that are owner follow-ups,
  not these sessions. Say which numbering a new heading uses before writing one.

## Status

Sessions 15, 16 and 17 landed, plus seven follow-up commits; their plan files are deleted under
this repository's rule that durable results belong in an architecture, design, reference or
performance document rather than in a plan. `npm test` is **678 passed**, `npm run check` clean,
and the null control is unmoved at 66/120 = 55.0 %, 176.17 damage, 10 severs, 1496/1670 scoring
contacts at seed 20260823.

Sessions 18a and 19 are complete. Session 18b's player-facing acquisition flow is implemented,
but the human sitting and its verdicts have not happened. Session 20's pre-throughput software
foundation is implemented; its throughput/parallelism measurements, derived schedules and every
research rung in sessions 21 through 25 remain unstarted.

Findings that were measured and deliberately left alone live in
[Found but not fixed](combat-followups-99-found-not-fixed.md), one entry each with its evidence,
the reason it was not closed, and what closing it would cost. It is a register, not a backlog:
several of its entries are decisions rather than debts and say so. Anything discovered mid-session
that is real but out of scope belongs there rather than in a report nobody re-reads.
