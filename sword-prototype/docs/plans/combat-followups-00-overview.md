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
2. The promotion gates were frozen against an instrument that has never been pointed at a
   person, and there is no shared recorder to point: `behaviourRecord`'s only two callers were
   headless evaluators and session 17 deleted both, the research path hand-rolls its own
   `EngagementTracker`, and the render loop in `src/main.ts` builds nothing. Opportunity-attack
   0.65 has never been shown reachable by a controller *or* a player. Session 18 finds out
   first.
3. The compute phase as first drafted repeated the failure this directory exists to escape.
   Sessions 19--22 replace it.

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
| [20](combat-followups-20-throughput-and-ceilings.md) | measure real throughput for all four directions and derive every ceiling | 18, 19 |
| [21](combat-followups-21-research-ladder.md) | one seed per direction under a one-day ceiling, then advance or kill each | 20 |
| [22](combat-followups-22-scaled-runs.md) | remaining seeds and declared ablations for surviving directions only | 21 |
| [23](combat-followups-23-held-out-ai-tournament.md) | freeze one selection per surviving direction and execute the test matrix once | 22 |
| [24](combat-followups-24-promoted-ai-integration.md) | integrate one passing artifact, or record the negative result | 23 |
| [25](combat-followups-25-integration-and-playtest.md) | full lifecycle gate, confirming playtest and durable close-out | 24 |

**Sessions 19 and 18a have landed, so 18b is the only session left before the compute phase.**
The page and bench now share the versioned recorder and gate table; 18b is the person using that
instrument, taking the first readings and settling the predeclared feasibility questions. Session
20 still needs that human verdict as well as session 19's run lifecycle.
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

**None of this is expressible today, and session 19 is what makes it so.** Measured 2026-08-26
and recorded in `docs/measurements.md`: a step budget is not a learning budget for three of the
four directions, and PPO cannot spend one at all -- asked for 800,000 solver steps it consumed
5,508, because it runs exactly four bouts and a bout ends when somebody dies. A 24-hour PPO rung
completes in about twenty seconds. NEAT-QD and DAgger scale by `--generations` and `--iterations`
rather than by steps. And a plateau rule is currently illegal in both of those, which throw
unless `consumedSolverSteps === solverSteps` exactly. **The ceiling session 20 derives is a count
of updates per direction, with steps as a derived column.**

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

## What sessions 19 and 20 inherit

Measured during the pass that closed sessions 15--17 and the owner follow-ups. Each is one to
three lines with a pointer rather than a restatement; the evidence is in `docs/measurements.md`
unless another file is named.

- **PPO cannot spend a step budget, and does two gradient updates whatever it is asked for.**
  Four bouts an invocation, ~5,508 steps against 800,000 requested. It needs an outer loop --
  iterations of collect-then-update -- before any ceiling, plateau or curve means anything. **No
  session in this set owns building it**; it belongs at the front of 19.
- **Two runners already keep most of a ledger row.** `train-neat-qd.mjs` pushes a per-generation
  row carrying `validationWorstCellScore` and `archiveCoverage` and flushes every five
  generations; `collect-dagger.mjs` pushes one per iteration. Session 19 generalises a working
  cadence; it does not invent a schema. PPO alone has no mid-run persistence, and
  `train-lookahead.mjs` has no state file at all.
- **No runner emits progress.** All four write once, after the run returns.
- **A plateau rule is illegal in two runners** until the exact-budget throws in
  `train-neat-qd.mjs` and `collect-dagger.mjs` are removed or made conditional.
- **`configDigest` is two incompatible formats** -- 16-hex SHA-256 in NEAT-QD and DAgger, 8-hex
  FNV-1a in PPO and look-ahead. Session 20 freezes a contract digest and preflight compares it.
- **A SHA-256 contract digest cannot live in `src/learning/`**: `node:crypto` is unavailable in
  the page and `crypto.subtle` is async. `src/learning/artifact.ts` records why.
- **The gate table has holes no runner can fill.** `firstAttackSeconds` is recorded and discarded
  in `research-rollout-worker.mjs`; `symmetricTimeCapRate` is computed only in the tournament;
  the specialist gap needs a control run no runner performs; PPO and look-ahead never read
  `result.engagement`.
- **A look-ahead budget that leaves cells unfitted is a narrower controller, not a cheaper one**,
  and nothing in the run record says which cells went.
- **Three commands the later sessions invoke do not exist**: `--rung` (nothing), `--run-id` (PPO
  and look-ahead ignore it), and `--verify-promoted` (sessions 24 and 25 both call it). Each
  needs an owner.
- **The prototype's own session numbering collides with this plan set's.** `docs/measurements.md`
  already has headings for "Session 18", "Session 19" and "Session 27" that are owner follow-ups,
  not these sessions. Say which numbering a new heading uses before writing one.

## Status

Sessions 15, 16 and 17 landed, plus seven follow-up commits; their plan files are deleted under
this repository's rule that durable results belong in an architecture, design, reference or
performance document rather than in a plan. `npm test` is **652 passed**, `npm run check` clean,
and the null control is unmoved at 66/120 = 55.0 %, 176.17 damage, 10 severs, 1496/1670 scoring
contacts at seed 20260823.

Sessions 18a and 19 are complete. Session 18b and sessions 20 through 25 have not started.

Findings that were measured and deliberately left alone live in
[Found but not fixed](combat-followups-99-found-not-fixed.md), one entry each with its evidence,
the reason it was not closed, and what closing it would cost. It is a register, not a backlog:
several of its entries are decisions rather than debts and say so. Anything discovered mid-session
that is real but out of scope belongs there rather than in a report nobody re-reads.
