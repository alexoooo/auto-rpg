# Sword prototype -- remaining combat follow-ups

## Outcome

Correct and freeze the policy boundary, find out whether the engagement gates are reachable by
anything at all, then spend compute in rungs that report progress hourly and can be abandoned
in a day. Do not freeze the game in order to finish a search.

The simulator, four research implementations and the tournament machinery exist. Three things
are still wrong, and only the first was known when this plan set was written.

1. The policy boundary mixes camera state into combat commands, learned controllers cannot
   choose an acting hand, aim region or body stance, and no policy can observe an arrow in
   flight. Sessions 15--17 correct it, and every one of those corrections improves the
   hand-written specialists and the human game on the day it lands.
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
| [15](combat-followups-15-host-command-boundary.md) | remove camera zoom from policy commands without changing camera behaviour | current implementation |
| [16](combat-followups-16-policy-perception-v4.md) | publish projectile/vector/morphology observations and freeze feature v4 | 15 |
| [17](combat-followups-17-tactic-output-v2.md) | make acting hand and bounded body stance explicit policy outputs | 16 |
| [18](combat-followups-18-human-gate-feasibility.md) | measure a person on the promotion instrument; settle the open feel questions | 17 |
| [19](combat-followups-19-run-legibility.md) | checkpoint ledger, gate table per row, plateau rule, watchable champion-so-far | 17 |
| [20](combat-followups-20-throughput-and-ceilings.md) | measure real throughput for all four directions and derive every ceiling | 18, 19 |
| [21](combat-followups-21-research-ladder.md) | one seed per direction under a one-day ceiling, then advance or kill each | 20 |
| [22](combat-followups-22-scaled-runs.md) | remaining seeds and declared ablations for surviving directions only | 21 |
| [23](combat-followups-23-held-out-ai-tournament.md) | freeze one selection per surviving direction and execute the test matrix once | 22 |
| [24](combat-followups-24-promoted-ai-integration.md) | integrate one passing artifact, or record the negative result | 23 |
| [25](combat-followups-25-integration-and-playtest.md) | full lifecycle gate, confirming playtest and durable close-out | 24 |

Sessions 15--17 are sequential because each changes the contract the next audits. Sessions 18
and 19 both depend on 17 and are independent of each other -- 18 is a person at a keyboard and
19 is instrumentation -- so run them in whichever order suits the day. Session 20 needs both.
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

## Progress log

This section is the living record of the implementation pass. One entry per session as it
lands, written when it lands rather than at the end. A session with a caveat records the
caveat here, not only in its own plan file.

Baseline taken before any of this work, from `sword-prototype/`, commit `a095877`:
`npm test` 454 passed, `npm run check` clean.

| session | state | landed |
| --- | --- | --- |
| 15 host command boundary | **landed** | `f789ea4`, 459 tests |
| 16 policy perception v4 | **landed** | `d44fc3e`, 484 tests |
| 17 tactic output v2 | stages A and B landed, C to come | stage A: 484 -> **474**; stage B: 474 -> **488** |
| 18 human gate feasibility | not started | -- |
| 19 run legibility | not started | -- |
| 20 throughput and ceilings | not started | -- |
| 21 research ladder | not started | -- |
| 22 scaled runs | not started | -- |
| 23 held-out tournament | not started | -- |
| 24 promoted integration | not started | -- |
| 25 integration and playtest | not started | -- |

### Session 17 Stage A, as landed

484 tests before, **474** after: nine of the ten deleted tests were the standalone checkpoint
codec and the `promotion.ts` gate, both of which went with the code they tested, and the tenth
read a deleted fixture. Six tests that ride behaviour still shipping moved from
`networkMetaMind` onto `researchLabelMind`, including the only test that the host revokes a
*learned* mind's authority at the verdict edge. `npm run check` and `npm run build` clean.

Three things the plan's own corrections section did not have, all found while doing it:

- **`behaviourRecord` and its three recorders now have zero non-test callers.** Both
  construction sites were files this stage deletes. They are kept because session 18's
  `BoutRecorder` is built on exactly them and is the named reader; the note beside them in
  `src/options.ts` says so, and session 18's plan has been corrected in place.
- **`fitnessComponents`, `noveltyDescriptor` and `noveltyScore` went dark too**, and unlike the
  four `evaluation.ts` constants the plan listed, these carry decisions the tests state as
  sentences. `tournament.ts` re-expresses each in its own terms rather than importing them, so
  they are kept with the situation written down rather than deleted on an unverified equivalence.
- **The HUD panel was already dark, and deleting the name gate was still right.**
  `metaDiagnostic` already returns null for a mind with nothing to publish, so the
  `mind.name === "learned-meta"` test was strictly narrower than the capability test standing
  right behind it. Deleting it, and giving `researchLabelMind` a `diagnostic()`, is the fix.

  **Corrected 2026-08-24.** This bullet, and the amendment in
  [session 17's plan](combat-followups-17-tactic-output-v2.md), justified that change with a
  panel that "would otherwise have gone dark". It was dark before the change and it is dark
  after: `main.ts`'s `mindFor` builds minds only through `policyMind` and `splitMind`, the five
  `POLICIES` entries are `idle`, `swinger`, `duelist`, `archer` and `crawler`, and
  `typeof mind.diagnostic === "undefined"` for every one of them -- measured, not read off the
  code. `learnedMetaMind` had no constructor in `src/` at all; both of its callers were headless
  CLIs this stage deleted, so no page has ever lit this panel. The recon pass that reported
  otherwise was taken on its word, which is the part worth writing down. The readout becomes
  reachable when session 19 builds the page-side deployment path and a page-constructible mind
  publishes a diagnostic -- see finding 8 below, which says that path does not exist yet.

`ai:evaluate` became test-split-only rather than absorbing the corpus runner, and refuses
`--split train`, `--split validation` and `--write-engagement-baseline` by name. Real-solver
paired parity, the fresh-Havok bracket discipline, the `--calibrate` procedure and the
`duelist-club` / `idle-control` corpus cells are **lost coverage**, listed with what they used
to prove in `docs/measurements.md` under "Session 17 Stage A".

### Session 17 Stage B, as landed

474 tests before, **488** after; `npm run check` and `npm run build` clean. The execution layer
now names an exact effector, an exact target and a bounded stance; the output contract is still
thirteen wide, which is Stage C's to widen. (It read **483** until the adversarial review; the
five added tests are the person-driven centipede, two on the button mapping, and two in
`options` -- the threat coupling and the stance on a natural effector.)

**Both controls held.** `--only duelist-swinger --bouts 120` is identical to the digit before
and after -- 66/120, 3.52 s, 176.17 damage, the same final-blow histogram -- which is the
signal that nothing leaked into the four primitives `policies.ts` shares with the option layer.
The real control is the 1,200-sample `scriptedMetaMind` parity sweep, which stayed at zero
changed fields with the archer's hold/release/edge counts exact. Both are written up in
`docs/measurements.md` under "Session 17 Stage B".

Five things worth carrying forward, three of them corrections this section made before the
review and one of them a bug it shipped:

- **A person driving a centipede could not bite, and that was reachable from the page.** The
  natural channel landed with a writer on the policy side and none on the host side:
  `Controls.state.natural` was initialised and never assigned again, and `splitMind` took
  `natural` from the policy. The setup screen offers "you" for either side whatever the unit.
  Fixed by `applyButtonPose` in `src/buttons.ts`, which writes one press onto the acting hand
  and the natural striker together -- one vocabulary, no branch on the unit -- and by
  `splitMind` taking the person's natural, because the buttons follow the buttons rather than
  `ownership`. `a_person_driving_a_centipede_bites_and_slows_from_the_same_two_buttons`.
- **The plan's target measurement could not be taken, and the reason is structural.** It asked
  for `vital` and `high` to be tried on the scripted policies and reported. No bout in the tree
  goes through the option layer with a scripted controller except `scriptedMetaMind`, whose
  only gate is the parity sweep -- so a named region is a test failure, not a win rate. The
  execution layer carries a fifth aim, `"as-measured"`, outside `TARGET_NAMES` and unnameable
  by any learned output. Moving the scripted policies onto a real region is a balance change
  owed a bout: session 18 at a keyboard, or session 23 at the tournament.
- **A named target decides where a *point* goes, and not where a stroke lands.** This section
  said the three regions "land on the head, the torso and the pelvis" without naming an action.
  Measured per action: it holds for `thrust` (head share 0.09 -> 0.48 for `high`, low share
  0.12 -> 0.82 for `low`) and is directionally right for `shoot` on a two-to-four-contact
  sample. It does **not** hold for `cut` or `punch`: a cut aimed `high` takes a 0.045 head share
  against the measured aim's 0.071, *lower*, because a stroke's aim seeds only the centre of an
  arc that sweeps far wider than the gap between two named heights. Four tables and the reason
  are in `docs/measurements.md`. **Owed a bout and flagged for session 23**: making a cut's
  `high` reach a head means lifting the stroke envelope, which is a balance change.
- **`punch` was being advertised on bodies that cannot punch, and closing it closed one row of
  thirteen.** A two-handed weapon welds the other arm to the haft and `Fighter.update` ignores
  its half of the command, so a bow body's punch was posed and discarded. One legality rule now
  serves the mask and the executor. This section said that closed "one of the three divergent
  legality tables"; measured against `actionsFor` over every `RESEARCH_STRATA` cell, it closed
  the **`bow+empty` row on both units** and left `sword+empty` and `axe+empty` diverging, which
  is four of thirteen cells against six before. Stage C owns the rest, and
  `research-rollout-worker.mjs` is still a third, non-equivalent copy.
- **`TARGET_SPAN_FRACTION = 0.75` rests on anatomy, not on the bout beside it.** This section
  said half the span "does not move the contacted-limb distribution at all". It moves it a great
  deal -- at 0.50 a `thrust` aimed `low` takes a 0.71 low share against 0.118 -- and what fails
  at 0.50 is a contact-count floor. The test's verdict is also non-monotonic across the constant
  (fails at 0.50, 0.55, 0.65, 0.85; passes elsewhere between 0.60 and 1.00), so it chooses
  nothing. The anatomical band that puts `high` on a head and `low` in a pelvis is 0.567-0.928 on
  both humanoid bodies, and 0.75 is its midpoint. Corrected in `docs/measurements.md`.

### Session 17, before it lands: what the plan got wrong

Recorded before the implementation rather than after it, because two of these would have been
invisible once the code was green.

Session 17 is the largest in the set -- a new output contract *and* the demolition of an entire
parallel learning stack -- so it was reconnoitred by three read-only passes and every
load-bearing claim was then re-verified by the coordinator directly. The plan is amended at
`c41d01a`; the sequence is now **three commits, not one**.

**The plan would have re-introduced a defect a previous session already fixed.** Its legal-tuple
table requires `cover` and `recover` to name "either selected attached hand". But
`supportedOptions` adds `recover` *unconditionally* and `cover` only when a hand is attached,
and that separation is not incidental -- `docs/measurements.md:1801-1803` records it as the fix
that came out of the last exhaustive look-ahead run, which *"exposed a hand-only recovery path
in Centipede"*. Under the plan as written a centipede, and any fighter that has lost both arms,
has an empty legal set and `maskedArgmax` throws. Capability-neutral recovery is now written
down as an invariant rather than left to be rediscovered a third time.

**A 21x compute multiplier was priced as bookkeeping.** The plan's entire treatment of look-ahead
is that it "records the expanded exact cell count instead of retaining the old 220-cell
assertion". Measured two ways independently -- the coordinator expanding the real schedule, a
recon pass deriving legality per cell from the code -- the two answers agree at 21x and 22.5x:

| quantity | today | tactic v2 | factor |
| --- | ---: | ---: | ---: |
| schedule tasks per split | 220 | ~4,650--4,950 | ~21--22x |
| minimum solver steps | 42,240 | ~893,000--950,000 | ~21--22x |
| beam nodes per replan, worst cell | 1,075 | ~20,600 | ~19x |

The beam saturates immediately at width 6, so there is no pruning relief and the whole increase
is linear in the tuple count. There is a statistical cost riding on the compute one: the
tactical model fits *per cell*, so 22x the cells on a fixed budget is 22x fewer rows each.
**Session 20 derives ceilings from these numbers and session 21 spends them**, so this is
exactly the "frozen number nobody measured" this plan set was rewritten to prevent -- arriving
three sessions before the one that would have inherited it silently.

**And a balance decision wearing a naming decision's clothes.** Body regions can be built
honestly from published facts: `vitalHeight` is 1.28 m and `crownHeight` 1.765 m. But every
scripted attack today aims at the opponent's *shoulder*, 1.42 m, and at 1.62 m on entry --
both **above** the published vital. So mapping `vital` to `vitalHeight` drops every scripted aim
by 14 cm and moves every matchup. Session 16 moved the duelist 14 points with a *perception*
change; this is a motor change, which is the bigger lever. The scripted target is therefore
chosen by measurement on the control matchups and the number reported, not picked for tidiness.

That is also why the sequence changed. The deletions go **first**, so tactic v2 is never
propagated into code that is about to die; then the execution-layer change that can move the
balance lands **alone**, so it can be measured against a control without contract churn mixed
in; then the 26-output contract, which carries no balance risk because no learned policy is
deployed.

Smaller, all verified: `Controls.driving` does not exist, so "keep the human mouse choice as
host-owned `Controls.driving`" is a type split rather than a rename, and it breaks the exact
seven-key command assertions in six test files. **Corrected by Stage B as landed, above: it is
a rename after all.** The two meanings are already separate in practice -- `Fighter` never
reads the field, `splitMind` deliberately ignores the policy's copy, and both surviving combat
readers want "which hand is acting", which is also what a person's mouse hand means. One field,
renamed to `actingHand` and widened to `HandName | null` for a body whose striker is not a
hand; the host/policy difference is a *narrowing* in `Controls.state`'s type rather than a
second field. The six key-set assertions did move, which is what they are for. PPO needs **four** new heads, not three -- it
has no persistence output at all and `deployment.ts:62` hardcodes `0.4` -- and its reported
entropy is divided by a hardcoded head count of 2 that no test pins. The DAgger expert returns
only `{movement, action, persistence}` and cannot label an effector or an aim height, so
teaching it is unstated work. There is no output mirror to extend, and the plan's effector-mirror
rule contradicts a documented invariant that says in as many words that primary and secondary
*"are not sides"*. The centipede publishes no hands at all yet is driven entirely through the
primary hand's `thrust` and `guard`, so the bite alias is the creature's whole control surface
rather than a cosmetic placeholder.

Three legality tables exist, not one, and **the table used during training is not the table used
at deployment** -- `research-rollout-worker.mjs` carries a third, hand-inlined copy that tests
`weapon === "sword"` for thrust and an exclusion list for cut. A network is currently trained
under one mask and deployed under another.

Deletions that were not safe as specified: `ai:evaluate` is built on the module being deleted;
`promotion-evaluator.mjs` exports `intentNumbers` to a surviving test whose import failure would
take all thirteen tests in its file down with it; `src/learning/promotion.ts` is orphaned by the
session and the plan never mentions it; deleting `networkMetaMind` silently removes the
browser's only window into what a learned controller is thinking, in the session immediately
before the one that puts a person at that keyboard; and `selectValidationChampion` exists twice
with different signatures, one live.

### Findings from the implementation pass that change the plan

Recorded as they were found, with the evidence. A plan that survives contact unchanged was
not specific enough to be wrong; these are the places this one was.

1. **"At least twenty-four rows" is not reachable by choosing `N`.** Session 19 sets the
   cadence with `--checkpoint-every-jobs N` and session 21 accepts a rung only if it produced
   twenty-four rows. At the granularity each runner actually checkpoints at, the *whole run*
   offers fewer units than that: look-ahead 880 (`train-lookahead.mjs#L81`), NEAT-QD 80
   generations (`train-neat-qd.mjs#L18`), DAgger **5** iterations (`collect-dagger.mjs#L17`),
   PPO **2** arms -- `equalBudgetPpoArms` returns exactly `["random", "dagger"]`
   (`src/learning/ppo.ts#L96-L100`). No `N` divides five into twenty-four.
   **Consequence:** the unit of work is re-cut before the cadence is chosen. DAgger checkpoints
   at the eight shards inside `collect()` (`collect-dagger.mjs#L49`), PPO at the boundary loop
   inside `collectPpoTrajectory` (`train-ppo.mjs#L84-L102`). Both are already index-addressed,
   so the job-index cadence rule survives intact. The requirement was always legibility, not
   the number twenty-four; the number is what legibility costs at a one-hour spacing.
2. **PPO spends twice its stated budget.** `equalBudgetPpoArms` assigns the full `solverSteps`
   to *both* arms (`ppo.ts#L98-L99`), and `tests/ppo.test.mjs#L45-L47` pins that deliberately.
   Every ceiling derived for PPO in session 20 is therefore a per-arm ceiling and the run costs
   2x. PPO is also the only direction with no exact-budget assertion, so it under-spends as
   well; the ledger's `stepsConsumed` is the only honest figure.
3. **Validation worst-cell exists in one direction of four.** NEAT-QD computes it for real
   (`research-rollout-worker.mjs#L51`). PPO writes `macro: reward, worstCell: reward` -- the
   same scalar (`train-ppo.mjs#L149`). DAgger has only `validationLoss`, and look-ahead only a
   summed calibration error; both are **lower-is-better**, which inverts the sign of the
   plateau rule's "improved by at least `--plateau-epsilon`".
   **Consequence:** the plateau rule is declared over a per-direction *objective* with its
   direction of improvement stated, not over a quantity named `worstCell` that means four
   different things.
4. **There is no gate table anywhere, and no runner can currently compute one.**
   `assessTournamentCandidate` (`tournament.ts#L197-L221`) emits `string[]` failures carrying
   the threshold and **no achieved value and no margin**. It consumes `TournamentCell`, a shape
   no research runner produces. (This finding named a second assessor, `assessPromotion` at
   `promotion.ts#L110-L133`, with the same defect. Session 17 stage A deleted `promotion.ts`
   with the controller it judged, so there is now one assessor rather than two -- which removes
   the second gate but not the finding: the surviving one still reports no margin.)
   `firstAttackSeconds` is recorded by the tracker and returned by `runResearchBout`, then
   **discarded** by `research-rollout-worker.mjs#L38-L45`; `symmetricTimeCapRate` is computed
   nowhere; the specialist gap needs a control run no runner performs; and `train-ppo.mjs` and
   `train-lookahead.mjs` never read `result.engagement` at all. The signed-margin gate table is
   net-new plumbing in three directions, not a formatting change.
5. **Look-ahead has no resume, no state file and no coherent mid-run checkpoint.**
   `--stop-after-jobs` exists only in `train-ppo.mjs#L155`; the handoff's claim that it and
   `--resume` are general is wrong. Worse, a look-ahead `TacticalModel` first exists only after
   a complete train sweep (`train-lookahead.mjs#L90`) and is uncalibrated until the validation
   sweep (`#L95`), so a champion-so-far at row *k* is a computation the run does not otherwise
   perform -- and one `LOOKAHEAD_CALIBRATION_LIMITS` would likely refuse at deploy time.
6. **`configDigest` is two incompatible formats.** NEAT-QD and DAgger use 16 hex characters of
   SHA-256 (`train-neat-qd.mjs#L33`, `collect-dagger.mjs#L28`); PPO and look-ahead use 8 hex
   characters of FNV-1a (`train-ppo.mjs#L165`, `train-lookahead.mjs#L100`). The artifact
   validator only requires a non-empty string (`artifact.ts#L100`). Preflight normalizes this
   before it can compare anything.
7. **A SHA-256 contract digest cannot live in `src/learning/`.** That tree is browser-imported
   by the Vite app, `node:crypto` is unavailable there and `crypto.subtle` is async;
   `artifact.ts#L70` already says so. The contract digest either uses the existing synchronous
   FNV-1a `artifactChecksum` or lives script-side only.
8. **There is no page-side deployment path.** Session 19 asks that a champion-so-far be
   "loadable into the page through the existing deployment path". `src/learning/deployment.ts`
   has exactly two importers, both Node-side; `src/main.ts` contains no occurrence of
   `artifact`. This is a new feature, and session 19 owns it.
9. **`src/learning/research.ts` and `src/learning/jobs.ts` are dead relative to the research
   path.** Neither is imported by any of the four runners; `RESEARCH_SOLVER_STEP_BUDGET`,
   `ABLATION_SOLVER_STEP_BUDGET` and `RESEARCH_SEEDS` have no consumers at all. A ledger built
   on those types would not be the thing the runners use.
10. **`AGENTS.md` has no research section to update** -- zero occurrences of `research`,
    `learning` or `checkpoint` in 572 lines. Sessions 19 and 20 create one rather than editing
    one. (`docs/design.md` does exist, at 990 lines; a reconnaissance pass claimed otherwise
    and was wrong.)

Findings that change session 18 specifically:

11. **The baseline the human is to be compared against was produced by two attack detectors at
    once.** `scripts/evaluate-options.mjs` called `recordBehaviourSample` (the *labelled* path)
    and, three lines later, `recordIntentAttack` (the *label-free* path) on the same
    `behaviourRecord`, in the same `onSample`, against one shared `_engagement`.
    `EngagementTracker.attack` (`engagement.ts#L137`) returns early when an opportunity has
    already been attacked, so it is first-writer-wins and the two silently blend.
    `scripts/training-evaluator.mjs` did the same.
    **Consequence:** the frozen 0.2282 and 0.2031 rows are a *mixture*, and a human -- who has
    no labels at all -- cannot reproduce a mixture. The honest comparison is label-free on both
    sides, so session 18 re-takes the specialist controls with the labelled path switched off
    and reports the mixture rows as superseded rather than as its control.
    **Anchors dropped 2026-08-24:** this finding cited `evaluate-options.mjs#L175`/`#L178` and
    `training-evaluator.mjs#L24-L25`, and session 17 stage A deleted both files. The finding
    survives them, because what it is about is the *mixture already frozen into the baseline
    rows session 18 must beat*, and those rows outlived their producer. The two call sites are
    described rather than linked because there is nothing left to link to.
12. **The two attack paths disagree in four measurable ways**, so the planned test
    `a_label_free_mind_and_a_labelled_mind_agree_on_attack_intent_for_the_same_commands` fails
    as written and must be scoped: `opportunitiesForAction` requires `striker === "sword"` for
    `thrust` (`engagement.ts#L79`) where the inline matcher falls through to `true`
    (`options.ts#L509`); `research-havok.mjs#L36` credits only `[0]`, the first matching row,
    where `options.ts#L510` credits every match, which systematically depresses dual-wield
    opportunity conversion; the labelled paths fire on an option-change edge while the
    label-free path fires on a button edge at 240 Hz; and only the label-free path counts a
    *guard release* as an attack (`options.ts#L493`), which inflates the numerator of
    opportunity-attack and deflates attack-contact for a defensive player.
13. **The page's clock is wall-clock derived and the bench's is synthetic.**
    `src/main.ts#L936` takes `dt = min(engine.getDeltaTime()/1000, CONFIG.world.maxFrameSeconds)`
    with the cap at `1/20` (`config.ts#L38`) and feeds it to `combat.advance(dt)` (`#L946`);
    the bench advances by an exact `1/60` (`measure.mjs#L348`). The control step is `1/240` in
    both, so every *duration* accumulator is harness-identical -- but `attack`/`contact` window
    arithmetic reads `view.clock`, so under frame drops the page's clock runs fast against
    simulated motion and the 0.75 s opportunity window closes early. This is a named mechanism
    for a page-to-bench gate offset, and it means **frame rate is recorded beside every human
    row** or the row cannot be interpreted.
14. **`onSample` does not emit the shape session 18 says it does.** `runBout` emits
    `{ left, right, dt, clock }` where `left`/`right` are `Combatant`s (`measure.mjs#L283`);
    `{ view, dt, clock }` is `runResearchBout`'s hook re-projection one layer up
    (`research-havok.mjs#L55-L56`). The recorder takes the per-fighter `{ view, dt, clock }` --
    that is what makes it side-agnostic and page-drivable -- and the bench call sites adapt.
15. **The page never sees an `Intent`, and a wrapper is not enough.** `Fighter.update` calls
    `this.mind.decide` internally and keeps the result (`fighter.ts#L1381`); every bench
    evaluator captures intent by wrapping the mind. The page's construction site is `mindFor`
    (`main.ts#L314-L317`), but `fighter.mind` is **reassigned at runtime by takeover**
    (`main.ts#L601`, `#L619`), so a wrapper installed once is discarded the first time anybody
    takes a body over -- which is exactly what a human sitting does. `handOver` (`#L560`) must
    re-wrap. This is the largest hidden cost in the page-side plumbing.
16. **Contacts must come from `Combat`'s `onReport`, not from the page's blood drain.**
    `main.ts#L461-L475` drains reports by timestamp and breaks on `report.at <= seen`, which
    cannot separate two contacts stamped in one frame; `measure.mjs#L315-L339` drains by log
    identity instead and documents why. `Combat`'s third constructor argument
    (`combat.ts#L216`, fired at `#L303` and `#L345`) is the only lossless page-side source and
    is the one the bench already uses.
17. **`src/learning/engagement.ts` imports its two window constants from `tournament.ts`**
    (`#L3`), which imports `artifact.ts` and `research-matrix.ts`. A DOM-free recorder that
    imports `engagement.ts` therefore drags the artifact/checksum graph into the page bundle.
    Move `OPPORTUNITY_WINDOW_SECONDS` and `STALL_WINDOW_SECONDS` down into `engagement.ts` and
    re-export them from `tournament.ts`.
18. **Two gate derivations already disagree on the case a bad human bout produces.**
    `tournament.ts#L241-L245` maps a never-attacked cell to `+Infinity`; `evaluate-ai.mjs`'s
    `quantile` helper returned `null` for the same cell. The shared formatter session 18
    introduces must fix one meaning for "never attacked" and both callers must adopt it.
    **Half of this disagreement was deleted 2026-08-24 rather than resolved**: session 17 stage
    A cut the train/validation engagement summary out of `evaluate-ai.mjs`, and the helper that
    returned `null` went with it. `tournament.ts`'s `+Infinity` is the only surviving
    derivation, so session 18 now *chooses* a meaning rather than reconciling two -- and it
    should still choose deliberately, because `+Infinity` for "this fighter never attacked" is a
    convenient sort key and a terrible thing to put in a report a person reads.
    Related: `scripts/promotion-evaluator.mjs` evaluated **no** engagement threshold at all --
    it was a win-rate, option-diversity, motif and safety gate, over `promotion.ts`'s
    thresholds. Session 18's brief was wrong to name it as a gate-table site; both files are
    now deleted, which settles it in the same direction for a different reason.

### Session 15, as landed

`f789ea4`. 454 tests before, **459** after; `check` and `build` clean.

Adversarial review ran the change rather than reading it, and the two highest-risk claims came
back clean under machine verification rather than inspection: the camera arithmetic was replayed
across **88,800 slew samples** against the verbatim pre-change expression with **zero
mismatches** (NaN and infinite notch counts included), and both framing products were shown to
left-associate to exactly what they replaced. The two frozen corpora were leaf-diffed on both
sides: **zero added lines, zero changed leaf values**, 189 removed leaves and every one a `zoom`
key.

Four defects the review found, all fixed before the commit:

- `docs/measurements.md` said "all 20 intent fields" in three places while the artifact it cites
  had been edited to 19. The sentences are left standing -- twenty is what was measured on the
  day -- with a superseding note beside them. Editing evidence and silently editing the sentence
  that describes it is the failure this plan set is about.
- `complete()` in `tests/options.test.mjs` had been silently weakened. Its `zoom` bounds check
  was what made it notice a command growing or losing a field; deleting `zoom` left it blind to
  shape. It states the key set outright now, and the check was proven to bite by putting
  `zoom: 1` back into `freshIntent` -- four runtime failures **and** a `tsc` error.
- `src/camera.ts` claimed a unification across "the two places that frame a shot". There is one;
  the other is a test building synthetic viewpoints for a visibility question, which does not
  frame anything. The comment says so now.
- `orbitFraming` allocated a fresh `{distance, height}` per rendered frame. It writes into a
  caller-owned record, like `cameraGoal` beside it.

Two findings worth carrying forward, neither a session-15 defect:

- **`src/main.ts` has no test coverage and cannot get any** while it touches the DOM at module
  scope and imports without extensions. Any claim about the host loop is currently
  unfalsifiable -- which is why the plan's own forced-failure step did nothing until the
  arithmetic moved to `camera.ts`. **Session 18's recorder must live outside `main.ts`** or it
  inherits the same property, and session 18 exists precisely to make the page produce a number
  somebody will believe.
- `npm run ai:options` already throws against its checked-in baseline **at its default seed**,
  and did so before this work: the corpus carries `featureVersion: 2` / `featureCount: 50`
  against a runtime at v3 and 66 columns. Session 14 left it stale. Session 16 moves the
  runtime to v4 and session 17 deletes the command outright, so it is not repaired here.

  **Corrected 2026-08-24, and the error was this finding's own.** The last sentence of this
  bullet used to say the handoff's "last verified state" line claiming `ai:options` passed was
  wrong. It was not wrong, and this finding conflated two invocations to reach that. The
  evaluator compared its whole document against the baseline only when the two base seeds
  matched; the baseline's is 20260827 and so is the default, but the handoff ran
  `--seed 20260824`, which skipped the comparison, never reached the stale version stamp and
  exited 0. Session 17 then propagated the conflation into the handoff, `docs/measurements.md`
  and session 17's own plan, replacing a true line in the durable record with a false one. All
  four are corrected; "Session 17 Stage A" in `docs/measurements.md` states both invocations.
  A stale artifact makes a command *capable* of being red -- it does not make every invocation
  of it red, and the seed was on the command line the whole time.

### Session 16, as landed

`d44fc3e`. 459 tests before, **484** after. Feature v4, 66 columns to 99.

The session was **green at 474 tests with two severe defects in it**, and adversarial review
found both. That is the entry worth reading here.

- **`ToRef` is not allocation-free at the Havok boundary.** `getLinearVelocityToRef` reads
  `HP_Body_GetLinearVelocity(id)[1]` and the emscripten glue mints a fresh array whatever
  destination you hand it: 216 B per linear read, 184 per angular,
  `getObjectCenterWorldToRef` genuinely free at 0.1 -- which is exactly why the pattern looked
  proven. Publishing a velocity per hand took a bare-handed fighter from **0 boundary reads per
  `observe` to 8**. Now 4, and 6 for sword-and-fist.
  **The plan demanded a steady-state allocation assertion and the session shipped without one.**
  The test that existed asserted object *identity* across steps -- which passes, because the
  pooling is correct, and which cannot see a leak anywhere else. A green test measuring the
  wrong quantity is the failure this plan set was rewritten to stop repeating, and it happened
  here on the first session that could produce one.
- **The threat reconciliation moved scripted motor targeting on 30 % of steps in a sword mirror
  and 49 % bare-handed, unmeasured.** `closing` was the wrong quantity for a rotating blade --
  instantaneous radial component at the vitals, where a stroke is mostly tangential when
  sampled, so a hand over 1.5 m/s read as *not closing* on 46--51 % of samples and ranking fell
  through to a tiebreak neither replaced copy had.

Measured, `--only duelist-swinger --bouts 120`, one rule per run, **both endpoints independently
re-run by the coordinator**:

| rule | duelist | bout s | duelist damage |
| --- | ---: | ---: | ---: |
| `f789ea4`, before session 16 | 49/120 = 40.8 % | 4.11 | 164.8 |
| session 16 as first written | 34/120 = 28.3 % | 3.73 | 166.2 |
| session 16 as landed | 66/120 = **55.0 %** | 3.52 | 176.2 |

**Session 16 as first written cost the duelist 12.5 points and nobody measured it.** The landed
rule is +14.2 on where this started, against roughly 4.6 points of standard deviation at
n=120. Nothing was tuned; the only edits were to what the rule measures. Shields against the
archer are the control and did not move, so the arrow tier is where it was.

**This is a real balance movement arriving as a side effect of a perception change, and it is
owed a person at the keyboard.** It is recorded here rather than buried because the duelist is
the matchup a human plays against, and a 14-point swing in it is a judgement about how the game
feels that no bench can settle. Session 18 is where that gets played.
