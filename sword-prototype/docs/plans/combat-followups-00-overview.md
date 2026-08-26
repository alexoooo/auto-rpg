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
| 17 tactic output v2 | landed, all stages | `da025f2` `e4ac199` `c149e8c` `7597eb4` `3674e06` `caec629` `c7497af`, 532 tests |
| -- owner follow-ups | 3 of 4 landed | `4d461ea` `ab52947` `e601824`, 564 tests |
| -- research matrix | `sword+axe`, 15 cells | 45 strata, 90 jobs, digest `a011a028`, 565 tests |
| -- doc pointers | landed, gated | `81030fb`, 15 tests, 580 total |
| 18 human gate feasibility | not started | -- |
| 19 run legibility | not started | -- |
| 20 throughput and ceilings | not started | -- |
| 21 research ladder | not started | -- |
| 22 scaled runs | not started | -- |
| 23 held-out tournament | not started | -- |
| 24 promoted integration | not started | -- |
| 25 integration and playtest | not started | -- |

Findings that were measured and deliberately left alone live in
[Found but not fixed](combat-followups-99-found-not-fixed.md), one entry each with its evidence,
the reason it was not closed, and what closing it would cost. It is a register, not a backlog:
several of its entries are decisions rather than debts and say so. Anything discovered mid-session
that is real but out of scope belongs there rather than in a report nobody re-reads.

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
  - **Closed in session 18, and both halves of the paragraph above needed correcting.** The
    mechanism was right and the measurement of it was not: `high` and `as-measured` are 0.012
    cursor units apart on that fixture, so those two rows are the same stroke run twice over one
    bout of 22 contacts. Asked `high` against `low` over 40 seeded bouts, a cut separated
    beforehand too, 0.128 to 0.044. And the repair is *not* lifting the envelope, which was swept
    and moves every aim up together: narrowing is what separates regions. `NAMED_STROKE_SPAN`
    sweeps a named stroke half a region spacing either side of its aim and no further, taking
    `high` to 0.166 against `low`'s 0.019 -- 8.7x against 2.9x -- for about a fifth of the cut's
    damage rate. `docs/measurements.md`, "Session 18".
- **`punch` was being advertised on bodies that cannot punch, and closing it closed one loadout
  of seven.** A two-handed weapon welds the other arm to the haft and `Fighter.update` ignores
  its half of the command, so a bow body's punch was posed and discarded. One legality rule now
  serves the mask and the executor. This section said that closed "one of the three divergent
  legality tables"; measured against `actionsFor` over every `RESEARCH_STRATA` cell, stage B
  closed the **`bow+empty` row on both units** and left `sword+empty` and `axe+empty` diverging.
  **Corrected 2026-08-25 on both counts.** The unit was wrong: there are seven loadouts and
  thirteen cells -- six loadouts on each of two humanoid units plus the centipede's bite -- so
  `bow+empty` is one loadout of seven and two cells of thirteen, and "one row of thirteen"
  counted two things at once. And the remainder is closed: stage C1 fixed `sword+empty` and
  `axe+empty` from the schedule's side, where the off hand is genuinely free, and put
  `research-rollout-worker.mjs` and three further copies onto `deployableActions`. **What that
  agreement covers is intact bodies**, which is a limit of a per-loadout row rather than a gap
  in the table: severing a hand moves the mask off its own row, and the look-ahead answers that
  by searching only the cells it holds a calibration for.
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

**A twentyfold compute multiplier was priced as bookkeeping.** The plan's entire treatment of look-ahead
is that it "records the expanded exact cell count instead of retaining the old 220-cell
assertion". Measured two ways independently -- the coordinator expanding the real schedule, a
recon pass deriving legality per cell from the code -- the two answers agree at 21x and 22.5x
against the 220-task baseline they were taken on.

**The baseline moved on 2026-08-25 and this table is repriced against it.** Stage C1 added the
`punch` rows the runtime always offered, so the action-v1 schedule is 240 tasks a split and
46,080 minimum steps, not 220 and 42,240. The tactic-v2 projections are unchanged -- they were
derived from legality per cell, which always included those punches -- so only the "today"
column and the factor move, and the multiplier is nearer twenty than twenty-two:

| quantity | today | tactic v2 | factor |
| --- | ---: | ---: | ---: |
| schedule tasks per split | **240** | ~4,650--4,950 | **~19--21x** |
| minimum solver steps | **46,080** | ~893,000--950,000 | **~19--21x** |
| beam nodes per replan, worst cell | 1,075 | ~20,600 | ~19x |

**Superseded on 2026-08-25 by stage C2c, which measured the projection and paid a fifth of it.**
The tactic-v2 column enumerates all five fields. Stage C2c measured the stance to be worth under
0.8 % of the calibration limits at a fixed budget -- and worse than useless on one of the three
columns -- and left it out of the key, so what landed is **775** tasks a split, **148,800**
minimum solver steps and **3,440** nodes per replan: **3.23x**. The projection stays as the
record of what was priced; "Session 17, stage C2c as landed" below carries the measurement.

The worst-cell beam figure is unaffected: `lookaheadMind` plans over the runtime mask, which
already offered `punch` on `sword+empty`, so its 25 pairs and `43P = 1,075` nodes were never the
schedule's number.

The beam saturates immediately at width 6, so there is no pruning relief and the whole increase
is linear in the tuple count. There is a statistical cost riding on the compute one: the
tactical model fits *per cell*, so 20x the cells on a fixed budget is 20x fewer rows each.
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
has no persistence output at all and `meta.ts:28` hardcodes `0.4` -- and its reported
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

**Superseded 2026-08-25: seven copies, and the two named rewrites were not the defect.** Two more
turned up beyond the reconnaissance's three -- one inlined in `collectTacticalTrace` and two in
`train-ppo.mjs`, of which the one the trajectory collector reads had not even the `cover` delete
the others carried. All seven ask `deployableActions` now, so the train/deploy split is closed
rather than open. And the rewrites this paragraph indicts select the same sets as `hasPoint` and
`isStriking && !== "empty"` over every kind a hand can hold, swept across all 49 ordered weapon
pairs: they were worth deleting for the next kind, not for a disagreement they caused. Every real
disagreement was the two-handed holder rule, which none of the copies knew about.

Deletions that were not safe as specified: `ai:evaluate` is built on the module being deleted;
`promotion-evaluator.mjs` exports `intentNumbers` to a surviving test whose import failure would
take all thirteen tests in its file down with it; `src/learning/promotion.ts` is orphaned by the
session and the plan never mentions it; deleting `networkMetaMind` silently removes the
browser's only window into what a learned controller is thinking, in the session immediately
before the one that puts a person at that keyboard; and `selectValidationChampion` exists twice
with different signatures, one live.

### Session 17, stages A, B, C1 and C2a as landed

Split into four commits rather than one, so that the half which can move the balance lands
alone and can be measured against a control without contract churn mixed in -- and so that the
corrections the output widening needs first land before the widening rather than inside it.

**Stage A, `da025f2`** -- the superseded learning stack deleted: the standalone NEAT checkpoint
codec, a trainer that turned out to be dead on arrival, two evaluators, the corpus runner, the
promotion gate built on the old vocabulary, and three checked-in fixtures whose conclusions are
now in `docs/measurements.md`. 484 tests to 474: ten died with their fixtures, six moved onto a
research mind, three were added. +880 / -17,833. Behaviour-neutral by construction rather than
by sampling -- every behaviour-carrying diff is a comment, an identifier rename or a deletion.

**Stage B, `e4ac199`** -- one canonical skill replaces the option/wrapper pair; a request for a
hand executes on that hand or is refused by name; targets are body regions derived from
published heights; stance is bounded and applied after the action's safe base pose; natural
attacks get their own channel. 474 to 488 tests.

**Stage C1** -- the preparation the 26-output contract needs, with the contract left at 13:
`META_OUTPUT_LAYOUT` replaces five independent re-derivations of the output layout, the
rollout worker's legality table and a fifth inlined copy both ask `deployableActions`, and the
look-ahead schedule trains the `punch` the runtime always offered on `sword+empty` and
`axe+empty`. 488 to 491 tests. Two of the three jobs are behaviour-preserving; the third fixes
a live rollout abort on `bow+empty` and a look-ahead throw on the other two, both measured in
`docs/measurements.md`.

**Stage C2a** -- the width moves. `META_OUTPUT_LAYOUT` is 26 wide and names `effectorAt`,
`targetAt` and `stanceAt` beside the three it had; `readMetaOutput` answers five logit blocks and
a persistence; `META_OUTPUT_NAMES` names all 26 columns, which the finiteness refusal indexes
into. `selectDeployableTactic` chooses the `(action, effector, target)` tuple by the **sum of its
three logits over the legal tuples only**, masked in front of the comparison with no repair
behind it, and breaks a tie on action index then effector then target -- walked over the index
spaces rather than scanned off `deployableTactics`, whose enumeration order differs for the two
defensive actions. The artifact header gained `tacticVersion` and three name tables with an
explicit refusal beside the `featureVersion` one, because `fromBytes` rejects no unknown key and
a stale artifact arrives with the field simply absent. 495 to 501 tests, and 502 after the
remediation pass. The four research
trainers keep their learning halves for stage C2b; the trainer edits are that five inline copies
of the artifact header now spread `RESEARCH_ARTIFACT_CONTRACT`, which `trainPpo` writing an
artifact inside the suite made unavoidable, and that `train-neat-qd.mjs` and `collect-dagger.mjs`
put the output vocabulary into their `config` digest -- without it the digest is byte-identical
across the widening, so `--resume` reloads a stale-width population *and* two runs with identical
settings share a `runId` and overwrite each other's state and champion.

**Two things the stage brief got wrong, both recorded in `docs/measurements.md`.** It asked for a
proof that the legal tuple set is non-empty for a fighter that has lost both hands: it is not,
and deliberately so -- `supportedOptions` refuses a body with no attached hand and no natural
attack outright, so the deployment mask is empty while the executor's own rule still answers
`natural` for `recover`. `src/options.ts` and `tests/options.test.mjs` have recorded that since
stage B. It also named `deployment.ts`'s `values.slice(MOVEMENT_NAMES.length, -1)` as a site to
hunt; stage C1 had already removed it, and a sweep of every `slice(` in `src/`, `scripts/` and
`tests/` found no surviving end-relative read of an output vector.

**The null control did not move, which was the point.** The scripted policies never enter the
option layer -- `policies.ts` does not import `options.ts` -- so `duelist-swinger` is the proof
that nothing leaked into a shared primitive: 66/120 = 55.0 %, 3.52 s, 176.17 damage,
1496/1670 scoring contacts, identical to the digit before and after through all four stages,
re-run independently by the coordinator.

### What the two adversarial passes caught

Both stages were green before review. Both were concealing something.

**A person driving a centipede could not bite.** Giving natural attacks their own channel was
right -- the bite had been borrowing the primary hand's button on a body that publishes no
hands at all. But only the policy half was wired: `Controls.state.natural` was initialised once
and never written again, and `splitMind` then read the channel from the wrong side. Two broken
wires, not one. It is a command channel a policy can press and a person cannot, which is a
house-rule violation, and it landed one session before the session whose entire purpose is
putting a person at the keyboard. No test could see it, because `main.ts` touches the DOM at
module scope and Node cannot load it -- so the rule now lives in `buttons.ts`, where a test can
reach it.

**The target rule is not general, and the docs claimed it was.** Measured per action on the
contacted limb in real bouts:

| action | `high` head share | against the aim it replaced |
| --- | ---: | ---: |
| thrust | 0.484 | 0.090 |
| cut | 0.045 | 0.071 |
| punch | 0.121 | 0.200 |

A thrust obeys. A cut and a punch do not, and a cut is what the duelist uses most. The cause is
structural: those two share a stroke branch where the aim seeds only the **centre of an arc**
sweeping far wider than the gap between a named region and the aim it replaces, so naming a
region drops the whole arc rather than pointing it. Four per-action tables are published
instead of one general claim. Changing the stroke envelope to fix it would be a balance change,
which is precisely what this stage is not allowed to do, so it goes to session 23 as an open
question with numbers attached.

**Session 18 took it early and the table above is superseded**: the column it compares against is
the *same stroke*, 0.012 cursor units away, measured once. `high` against `low` -- the comparison
a rule is about -- is what moved, from 2.9x to 8.7x, and it moved by narrowing the arc rather
than by lifting it. See `docs/measurements.md`, "Session 18".

**And, twice in a row, a test that asserted the reachable quantity instead of the one it was
named for.** Stage A shipped a test called "goes inert" that checked 2 of 19 command leaves --
a fighter turning at 0.9, crouched, holding a button satisfies it. Stage B shipped one whose
message promised "no hand slot is written on the way" while reading three booleans; the suite
stayed green when the bite wrote a guard, a pointer and the off hand. This is the same failure
session 16 shipped and it has now recurred in two consecutive stages, which makes it a property
of how these tests get written rather than an accident. **The rule that catches it: assert the
whole record against a fresh one, not a sample of it.**

### Two claims this pass put into the durable record and had to take back

Recorded because the plan set's own rule is to supersede a wrong note rather than delete it.

**`npm run ai:options` was reported red, and the invocation named in the handoff was green.**
The runner compared its whole document against the checked-in baseline **only when the two base
seeds agreed**, and the handoff's `--seed 20260824` does not match the baseline's `20260827`,
so the comparison -- the only check the stale `featureVersion: 2` could trip -- was skipped and
the command exited 0. The twelve parity rows really did match. It is the *default* seed that
compares and throws. Two true statements about two different invocations, conflated into one
false one, which then propagated into `docs/measurements.md` and deleted a correct line on the
way.

**Deleting the learned meta-mind was said to kill the browser's HUD readout. The panel was
already dark.** No policy the page can build publishes a diagnostic -- `idle`, `swinger`,
`duelist`, `archer` and `crawler` all answer `undefined` -- and the deleted controller had no
constructor outside two headless CLIs. The name-based gate was wrong on its own terms and was
fixed on those terms; the readout becomes reachable when session 19 builds the page-side
deployment path.

### Findings from stages A and B that change later sessions

- **The training legality table was not the deployed one, and it took seven copies to close it.**
  There were five, not three, when stage C1 started -- the fourth in
  `research-rollout-worker.mjs` and a fifth inlined in `collectTacticalTrace` -- and the review
  of that stage found the sixth and seventh in `train-ppo.mjs`, the second of them using **bare
  `supportedOptions`** for the trajectory collector PPO actually learns from. All seven read
  `deployableActions`, or `supportedActionIndices` where an index set is wanted; the two extra
  are measured identical over 394 capability cells. The two rewrites this finding named --
  `weapon === "sword"` for thrust, an exclusion list for cut -- turn out to answer identically
  for every kind in `GRIPS`, swept over all 49 ordered weapon pairs. **Every real disagreement
  is the two-handed holder rule**, and inside `RESEARCH_STRATA` it is one loadout of seven --
  two of the thirteen cells -- `punch` on `bow+empty`, where the rollout labelled an action
  `researchLabelMind` then refused by name, aborting the bout.
- **All three loadout rows are closed, and the last two closed from the schedule's side.**
  Stage B fixed `bow+empty` in the runtime; `sword+empty` and `axe+empty` were the *schedule*
  being wrong, because that off hand is genuinely free. `lookaheadMind` threw
  `tactic "close+punch" has no calibrated model` on those two -- **pre-existing, verified at
  `da025f2`**, reproduced and then fixed in stage C1. The schedule is 240 tasks per split
  against 220, and its minimum budget 46,080 steps against 42,240. **Stage C2c superseded both
  at 3.23x rather than the twentyfold projected here**: 775 tasks a split and 148,800 minimum
  steps, with the stance measured out of the key.
- **Closing the rows did not close the crash, and sessions 20 and 21 need to know why.** A
  per-loadout schedule row cannot describe a mask that depends on live body state: the row keys
  on the loadout a body started with, the mask keys on what is still attached, and severing the
  bow hand of a `bow+empty` frees the welded empty hand so the mask offers `punch` against a row
  that says `cover, shoot, recover`. `lookaheadMind` threw again, on a body state that occurs 10
  times in 120 null-control bouts. The fix is not more rows -- there are more states than
  loadouts, and the tuple expansion multiplies both. `calibratedPlannedTactics` filters the search
  to cells the model holds a calibration for and refuses by name when none survives, which is
  the shape session 20's much larger and necessarily sparser cell table will need: a fitted model
  that misses cells is now a narrower search rather than a dead run.
- **`punch` was being advertised on a body that could never throw one.** A two-hander welds the
  trailing hand to the haft and the fighter excludes that hand's fist from the strikers list, so
  the punch was posed and could not connect. Closing it moves `randomMetaMind`'s action draw on
  `bow+empty` only; nothing pinned moves, because the research control opponent always holds
  `sword+empty`.
- **`extended` is a near-duplicate of the existing commit posture** (0.10/0.30/0.55 against
  0.12/0.30/0.68), so during a committing action the six-name stance head offers five
  distinguishable choices. Session 23 decides whether these constants earn their place; it
  should decide knowing that.

### Two decisions the owner made, and why they are decisions rather than defaults

Stage C2 is where the plan and the code disagree most, and two of its instructions could not be
followed as written. Both were put to the owner rather than guessed at, because both are the kind
of choice that is invisible once the code is green.

**The DAgger teacher will get a hand-authored aiming rule, not defaults.** The expert returns
`{movement, action, persistence}` and has no opinion about aim at all, so the three new heads had
to be filled with something. Filling them with constants was the cheap and honest option -- it
teaches exactly what the expert knows -- but it also guarantees that no DAgger-trained fighter can
ever aim, and the owner's objection is the right one: a contract whose outputs are wired to
constants is not a contract, it is three columns of zeroes. So the teacher gains real opinions.

Two facts make this much cheaper than it looked. **The checked-in DAgger rows are already dead**,
so bumping `TACTICAL_TEACHER_VERSION` invalidates nothing that is still alive -- the objection that
killed this option on paper does not survive contact with the tree. And **the effector label is
already computed and thrown away**: `attackOpportunity` returns rows keyed `hand:${hand}:${weapon}`
and the teacher already picks one, so which hand it attacks with costs nothing to recover. Only the
aim and the stance are genuinely new authorship.

> **Superseded, and the correction is the interesting half.** This paragraph first said there were
> *no* checked-in DAgger rows anywhere in the repository. That is false. There are **143**, in
> `asset-src/learning/research/session16-final-workers8/state.json`, git-tracked, in two iteration
> batches of 71 and 72, each a complete eight-column row with a three-field label. The conclusion
> survives because they carry `featureVersion: 3` against a runtime 4 and are refused before the
> teacher version is ever consulted -- but "there are none" and "the ones there are cannot load"
> are different sentences, and only the second one is true.
>
> **And the thing that correction turned up is worse than the error.** `TACTICAL_TEACHER_VERSION`
> **is never compared to anything.** It has exactly three readers -- two in `collect-dagger.mjs`,
> one in `research-rollout-worker.mjs` -- and all three *write* it: into a config object, into
> artifact provenance, into the row. `validateDaggerRow` checks it for being a non-negative safe
> integer and nothing else. So bumping the version refuses precisely zero rows. The only thing in
> the tree that catches a stale teacher is the resume config digest, and only incidentally, because
> the version happens to sit inside the blob being digested. A row collected under teacher 1 and a
> row collected under teacher 2 are indistinguishable to every consumer once the feature version
> matches. **C2b closes this**, because the whole point of authoring a real aiming rule is that
> rows labelled by the old teacher and the new one must never be mixed.

**And the authorship is constrained by stage B's own measurement, which is the point of having
measured it.** A label is only worth varying where the motor layer honours it. Stage B measured the
head share on the contacted limb per action: thrust moves 0.090 to 0.484 when the aim is named, cut
moves 0.071 to 0.045 and punch 0.200 to 0.121. So a teacher that varies its aim on cuts is teaching
a correlation the body will not produce -- noise wearing a label. The rule therefore varies aim
where aim works and holds it constant where it does not, **with the measured reason written beside
each branch**, and session 23 revisits it if the stroke envelope changes. **The envelope changed
in session 18 and the trigger has fired**: a cut aimed `high` now takes 0.166 head share against
`low`'s 0.019, so the evidence for the constant `vital` label is gone. The label is unchanged
anyway, because moving it moves the histogram every trainer consumes and that is owed its own
before-and-after; `tactical-teacher.ts` says so in place. The same caution applies
to `extended`, which stage B found to be a near-duplicate of the commit posture (0.10/0.30/0.55
against 0.12/0.30/0.68), so labelling it during a committing action teaches a near-no-op.

**A mirror does not swap the effector.** The plan says mirroring should swap primary and secondary;
`FEATURE_MIRROR_INDEX`'s note in `features.ts` says in as many words that the two "are not sides,
and a mirrored fighter still
leads with the same hand". The comment wins, and it wins for a reason that is checkable rather than
assertable, which is what makes this worth recording:

> `outboard` is the only field that names which physical side a hand is on. `mirrorBody` negates it
> inside the mirrored world while leaving the `primary`/`secondary` keys in place, and **no feature
> column carries it** -- the hand columns are weapon one-hot, lost, reach and tip speed, none of
> them positional. So the mirrored sample describes a genuine left-handed copy of the same fighter,
> not an invented one.

**Superseded 2026-08-25: the conclusion holds, the quoted argument is wrong in both of its
premises.** `outboard` is not the only field naming a hand's physical side -- it is *derived* from
the arm's geometry (`src/arm.ts`), so `shoulder.x` and `tip.x` name it too, which is why
`mirrorBody` negates all four together. And it is not true that no feature column carries a side:
`threat_bearing` and `threat_local_right` read +0.25 / -0.25 across two worlds differing only in
the x of the opponent's threatening hand, and `FEATURE_MIRROR_SIGN` has listed both as -1 since
feature v4. The test C2a wrote for the quoted claim
(`no_feature_column_carries_which_side_a_hand_is_on`) flipped `outboard` alone -- an impossible
body -- and stayed green when a hand column spelled `Math.sign(hand.shoulder.x)` was added.

The narrow statement is the one to keep, and it is the one the last clause above was reaching for:
**no column distinguishes which physical side a given hand *slot* is on**, because the hand columns
are all unsigned. So a mirror swapping `primary`/`secondary` would invent a distinction the network
cannot see, and `mirrorBody` keeping the slot keys while negating the geometry is what makes the
mirrored sample a genuine left-handed copy.
`no_hand_column_carries_which_physical_side_a_slot_is_on` is the replacement: it builds the same
fighter left-handed with `outboard`, `shoulder.x`, `tip.x` and `tipVelocity.x` negated together,
requires all 99 columns to match, and asserts the threat readings that do carry a side beside them.
The reason someone would swap -- that a mirror is only valid if the mirrored sample
describes a body that could exist -- is a real concern that simply does not bite here, and it would
bite immediately if any hand-**slot**-side field ever reached the vector.

The plan's original "**Pin this with asymmetric weapons rather than assuming names**" was retired
along with the premise and is **restored as still owed**: it is a mirror question, and nothing
mirrors an output label today, so it cannot be closed until an output mirror exists. What C2b can
do now is what the remediation pass began -- run the effector head's tests on a body whose two
hands hold different weapons (`sword+axe`) rather than two identical swords.

`slip-left` and `slip-right`, by contrast, **are** sides and would have to swap under any mirror
that ever carries stance. Nothing mirrors labels today, so no machinery is being added; the pair is
recorded beside `circle-left`/`circle-right` in `FEATURE_MIRROR_INDEX` so the next person does not
rediscover it.

**One question deliberately not asked, and parked instead.** The new tuple is an output but never an
input -- the feature vector carries `current_movement_*` and `current_action_*` and would, by the
same logic, want `current_effector_*`, `current_target_*` and `current_stance_*`. That is a
`featureVersion` bump, which invalidates every checked-in artifact and golden hash in the set. It is
a real gap and it is recorded as one, but it belongs with a deliberate feature-contract revision
rather than riding in on an output change.

### Session 17 stage C2, split in two

C2 was one commit in the plan. It is two, on the same argument that split the session in the first
place: the half that can be verified by construction should not be entangled with the half that
needs measurement.

- **C2a -- the contract width.** The layout table grows to 26, the artifact contract learns to
  refuse a stale-width model explicitly, every end-relative slice is routed through the table, and
  the (action, effector, target) tuple is selected jointly by summed logits, masked before the
  argmax and never repaired after. No trainer is touched. The null control must not move.
- **C2b -- the four trainers.** NEAT-QD, DAgger and its new teacher, PPO's four new heads. The
  look-ahead tuple enumeration became **C2c**, because its cost is the thing that had to be
  measured rather than assumed: the ~21x priced here was measured at **3.23x** once the stance
  was measured out of the key.

The hazard C2a exists to close is a silent one. `deployment.ts` decodes action logits with
`values.slice(MOVEMENT_NAMES.length, -1)` -- "everything but the last number". At 13 wide that is
correct. At 26 wide it swallows the effector, target and stance logits into the action argmax
without erroring, which is precisely the failure mode that a width refusal exists to prevent and
that a width refusal alone does not catch.

### Session 17, stage C2b as landed

The four research trainers moved onto the widened contract, and the DAgger teacher gained real
opinions about aim rather than three columns of constants. Look-ahead is deliberately not here --
it carries a projected ~19x compute cost and is stage C2c, which measured that projection down
to 3.23x.

**The number this stage is judged by is the label histogram, and the first version of it was a
flat zero.** Over 268 decisions at 2400 solver steps: effector `primary` 84.3 %, `natural` 15.7 %,
`secondary` **0.0 %**. The record's first explanation was that no research stratum puts a striking
weapon in the off hand. That was wrong for half the sample, and the way it was wrong is worth
keeping.

`secondary` was legal *for the action the teacher itself named* on **133 of 268 decisions**, 121 of
them covers. `tacticEffectors` returns hands in slot order regardless of what they hold, and
`accepts("cover")` answers true for every attached hand -- so a first-legal preference handed the
primary every cover on every humanoid body. **The remedy the record prescribed could not have
worked**: adding a reversed-loadout stratum moves the `cut` rows and leaves every `cover` on
`primary` forever, because the ordering never consults the weapon. `isHeldStriker` in `hands.ts`,
derived from the `GRIPS` table rather than a list of weapon names, now gives cover three tiers --
shield, then held weapon, then bare forearm. `secondary` is **13.8 %**, and the distinct-tuple count
goes 12 to 15.

**And then the label moved while the body did not.** Diffing the produced intent field by field, a
cover on `sword+shield` differs *only* in `intent.actingHand`: `handActionOption`'s cover branch
interposes the named hand **and** covers with the spare either way. So the effector label on a cover
is very nearly inert at the motor layer. That is recorded rather than smoothed over, and whether a
shield-hand cover should pose differently is a bout question for session 23.

**Three more places where a name promised more than the code delivered.** A centipede's bite was
measured over four seed pairs: 232 contacts, **172 left shin and 60 right shin, zero head, zero
torso**. Meanwhile `tacticTargets("bite")` offers only `vital`, and `handActionOption`'s bite branch
never reads `target` at all. Three separate facts, each defensible alone; together they mean the
target head is untrainable for a bite. And `thrust` is unreachable from the teacher entirely --
its action rule answers `cut` for any held weapon that is not a bow -- so the three-branch thrust
aim rule is written, exported and driven by its own test, but no rollout can reach it. Making it
reachable would turn every sword cut into a thrust, which is a change to what the teacher *does*.

### What the C2b review caught, and the arithmetic that failed with it

**The reported PPO entropy was above any achievable maximum.** A real training run read 3.0543
against a reachable bound of 1.3969. The divisor was the policy-head count spelled as a literal
`2`, and it went unnoticed for as long as it did because the only assertion on the reported value
anywhere in the tree was that it exceeded zero. It is now derived from the head table and pinned in
both directions; the same run reads 1.2217.

**The PPO trajectory collector had no guard at all.** Swapping its sampler for an argmax deletes
exploration from an on-policy algorithm and makes every stored probability 1, so the importance
ratio goes degenerate -- and the full 521-test suite stayed green. So did storing the full index
range in place of the conditional masks, which is precisely the property the docstring beside it
claims correctness for. NEAT had a seam guard; PPO's only end-to-end test compared a run against
itself.

**`72` was the nominal `3 x 4 x 6` reused as a count of legal tuples**, in four places. Measured:
the maximum `|deployableTactics|` on any body is **21**, the union over the whole body space is 33,
and over the thirteen research cells 24. One of those four places was the argument for leaving the
quality-diversity descriptor alone -- `125 x 72 = 9,000` cells against 10,240 genome-evaluations,
"sparser than one elite per cell". On the true figures it is 3,000 cells and **3.4 elites per cell**,
which is thin but is a tuning objection rather than a refusal. The decision stands and the
descriptor is unchanged, but the record now says plainly that the outcome-descriptor argument is
the **only** reason left standing, and the test that asserted the misleading arithmetic is deleted
rather than re-pointed.

**A fixture that published `facing: 0` hid two thirds of a rule.** The teacher's threat-side rule
rotates into the fighter's own frame, and at facing zero that expression is exactly `dx` -- so
replacing the whole body with `return dx;` left 268 tests green while moving `slip-right` from
41.8 % to 50.0 %. This is the trap `AGENTS.md` already records for `handover.test.mjs`: the correct
inverse and the plausible one agree on one side of centre.

**What held up.** The structural claims were checked hard and did not move: `recurrentTactic`'s
legality-by-construction over 2,533 tuples on the whole body space with none outside the legal set
and no empty mask; the PPO gradients under a finite-difference check at worst relative error
2.0e-7, with five distinct row counts *and* five distinct supported sets so an offset landing in a
neighbour could not hide; thirty malformed `DaggerModel`s each refused by a sentence naming the
head; and a byte-identical look-ahead trace digest proving C2c's files did not move.

### Session 17, stage C2c as landed

The look-ahead planner and its training schedule carry the tuple. The cell key is
`movement+action+effector+target`; **the stance is not in it, on measured evidence**, and that
decision is the whole difference between the ~19x this plan priced and the 3.23x it cost. 528
tests, `npx tsc --noEmit` and `npm run build` clean, null control identical for the sixth stage
running. Everything is in `sword-prototype/docs/measurements.md` under "Session 17 Stage C2c",
with four measurements, an 18-row mutation table and a per-test list of what each test does not
catch.

| quantity | this overview projected | landed |
| --- | ---: | ---: |
| schedule tasks per split | ~4,650--4,950 | **775** |
| minimum solver steps | ~893,000--950,000 | **148,800** |
| beam nodes per replan, worst cell | ~20,600 | **3,440** |
| ms per replan, worst cell | not projected | **4.28** (26.35 with the stance) |

**The twentyfold was real and was declined, not absorbed.** Enumerating the stance is exactly
6x on every row of that table, and what it buys was measured on real Havok bodies: at a fixed
budget, six stance-keyed cells against one stance-free cell score 0.0081 / 0.1387 / 0.0241
against 0.0099 / 0.1390 / 0.0230 on the three calibration columns -- every gap under 0.8 % of
the 0.25 limit each is refused at, and the vitality column *worse* with the stance in. The whole
stance effect on that column is smaller than the cost of fitting from one seed instead of two.
The same question asked of the effector and the aim answers differently -- 24x the Brier gain --
which is why those two are in the key and the stance is not.

**What session 20 inherits, in one place:**

- **`43 x cells` nodes a replan, at roughly 750-825 expanded nodes per millisecond** from 430
  nodes to 20,640. So milliseconds per replan is `43 x cells / 800` **to about ten per cent**, on
  this host, in the headless bench. (This read "a flat 780-825 ... to about five per cent" and the
  band excluded two of its own thirteen rows; two independent re-runs landed at 766-789 and
  732-778. Use the rule of thumb, not the band.) **No page reading exists** and one is owed.
- **3.36 replans a simulated second per planning fighter**, one every 71.5 solver steps, from a
  real 45-second bout. At 4.28 ms that is 21.6 % of that bout's wall clock; with the stance it
  would be more than the entire bout costs today, and a single replan would exceed a 16.7 ms
  frame on its own.
- **Calibration survival is not a quality measure at low row counts.** 100 % at the minimum
  budget is degenerate -- one row a cell fits itself exactly in all three columns, and at 48
  solver steps the train and validation bouts are bit-identical. The shipped
  `session18-minimum` artifact reports 0/0/0 for all 220 of its keys, so
  `LOOKAHEAD_CALIBRATION_LIMITS` has never refused anything in a shipped run. Real survival is
  99.6 % at 3 rows a key, 98.6 % at 6 and **85.0 % at 15**, and the quality cliff is between 8
  and 15 held-out rows. **60 rows a cell is 4,464,000 solver steps**, roughly 17 minutes in one
  process.
- **Only `contactBrier` ever refuses a cell.** Worst `signedReachError` observed 0.0618 and worst
  `vitalityDeltaError` 0.1037, against limits of 0.25.

  **Both bullets above are done and their percentages are superseded** -- session 19 repaired the
  columns and re-set the limits, `docs/measurements.md` "Session 19". The second one was the
  finding: `contactBrier` was the only column ever refusing because the other two *could not*, not
  because they were set loosely. `signedReachError` is a signed mean of residuals about a fitted
  mean and is identically zero in-sample (worst magnitude ever observed **5.489e-17**), and the
  raw Brier is 99.6 % irreducible outcome variance. Survival under the repaired gate is 100.0 /
  99.6 / **99.4** / **98.8 %** at the same four budgets -- unchanged at both shipped budgets and
  fourteen points *better* at 8x, on quantities that mean something, with **no body losing the
  ability to plan an approach at any budget**. (The remediation pass moved the last two figures
  again, from 93.5 and 91.1: a single scalar on the reach column could only trade `close`
  survival, so it is two numbers now -- 0.20 for the four movements a constant delta can
  describe and 0.35 for the one it cannot.) The degeneracy in the first bullet is
  now stated by the trainer rather than left to be rediscovered: `identicalCalibrationKeys` in the
  report, and a warning below `MIN_SPLIT_STEPS_PER_JOB`.
- **A long budget must be spent as many short jobs.** At 480 steps a job the trainer dies because
  a fighter loses a hand mid-window and the forced tuple leaves the runtime mask: **1 of 775 tasks
  on seed 310013, 0 of 775 on the other two fit seeds.** This said "pre-existing: the action-level
  guard throws at the same budget", and a sweep says otherwise -- the dying cell is
  `warrior/axe+empty hold+punch+secondary+high`, `+high` is an aim the widening added, and the
  HEAD-equivalent replay at the measured shoulder line dies **0 of 5** on all three fit seeds. So
  the widening *did* add one trainer failure mode. What is true is that the guard is not more
  sensitive: on `axe+empty` the action mask and the tuple mask lose `punch` in the same instant.
- **The stance is not in the beam because the model cannot see it, not because searching it is
  dear.** `TACTICAL_STATE_COLUMNS` is `reachMargin, facingError, threatAlignment,
  contactProbability, vitalityPotential` -- no posture, no crouch, no lean, no twist, though
  `BodyView` publishes the last three -- and the fitted model is a constant mean delta per cell
  that reads no state at all. Meanwhile stance moves realised damage several-fold -- 4.6x between
  the best and worst stance over six seeds, though *within* one stance the seed-to-seed spread is
  larger than that, so the only robust ranking is "`slip-right` is worst". **So "stance is
  not worth searching" is a fact about the current five columns and nothing else**, and the first
  session to give the tactical model a column that can see a posture inherits the question, not
  the answer. (The 6x cost of enumerating it is real and is the *second* reason.)
- **Engagement counts are only as good as the hand they were attributed to, and until 2026-08-25
  they were not.** `scripts/research-havok.mjs` opened every attack window on the first hand
  holding the right weapon rather than on the hand the label named, so on a two-fisted body the
  named hand's damaging contact was dropped and the other hand's was credited.
  `attacksInWindow` and `damagingContactsInWindow` feed the feasibility gate, the engagement floor
  and the frozen tournament row, so **any engagement row taken by a hand-naming labeler before
  that date is suspect** and none should be carried into a comparison. `docs/measurements.md`
  carries the measurement and the two tests that now hold it.
- **One body state in twenty-eight loses its whole search space** -- a `bow+empty` that loses its
  bow hand, whose every trained cell names the primary. **And the other half, which was missing:**
  HEAD silently executed a primary-hand model on the *other arm* on the minus-primary state of
  **all six** humanoid loadouts, and on **five of the six** C2c both refuses that redirection and
  keeps a searchable capability, because the schedule trains the secondary tuples. Severance runs
  at 10 in 120 null-control bouts, so a tournament will meet both halves.

Still owed and not this stage's: behaviour records counting effectors, targets and stances, and
a page-side reading of the replan cost.

### Four things the owner asked to be fixed, after session 17 closed

Session 17 ended with a list of places where the widened contract promised more than the code
delivered. The owner picked four and asked for the motor pair measured rather than argued. Two have
landed; the other two are named at the end of this section.

**The aim that points the cut, and the cover hand that means something** (`4d461ea`, 538 tests).
The stroke arc set the aim as the *centre* of a sweep running a fixed +/-0.50 vertically, so a named
`high` and a named `low` were the same stroke measured twice. `NAMED_STROKE_SPAN` makes a named
stroke sweep half a published region spacing; `"as-measured"` keeps the old +/-0.50 so parity is
preserved by construction rather than by hope. On the defensive side both skills covered with both
hands *identically*, because neither write knew which hand had been named -- `ACTION_TUNING.guardSpread`
now keeps the named hand on the covering line and steps the supporting hand outboard, and
`isHeldStriker` in `hands.ts`, derived from the `GRIPS` table rather than a list of weapon names,
gives cover three tiers: shield, then held weapon, then bare forearm.

**Six dead writes, and the sweep that could not see five of them.** A 230-cell command surface had
declared one write dead. Widening the same sweep to 408 cells found it *live* on 8 of them -- the
230 never built the loadout it fires on -- and turned up two more that really were dead. So the
count is six dead writes rather than five, and one of the original five was a false positive. This
is the third time in this effort that an exact sweep over the wrong space produced a confident wrong
answer, which is why every brief now has to state its coverage space before it states its result.

### A gate that measured nothing, and a limit that was a dial for one movement

`ab52947`, 550 tests. The look-ahead calibration gate is the thing that decides which trained
artifact becomes the champion. It was measuring its own arithmetic.

**In sample, two of its four columns are identically constant.** `signedReachError` is zero to
5.489e-17 across every group -- against a worst-group mean absolute error of 0.1617 m, which is the
quantity somebody reading the gate would think it reported. `contactBrier` in sample is *exactly*
`p(1-p)`, which is bounded above by 0.25, compared against a threshold of 0.25 with a strict `>`.
Out of sample the Brier correlated **0.9959** with the base-rate variance of the cell rather than
with anything the model got right. `calibrationScore` -- which picks the champion -- was 94 % that
quantity. Fixing it moved no champion at any budget, which is the honest version of the result: the
gate was not wrong about the winner, it simply was not the reason.

**`close` is the one movement a constant delta cannot represent, and the reason is not the one that
looks obvious.** The tempting story is that reach margin moves too much during an approach for a
constant to describe it. `disengage` moves reach margin just as much and is the **best**-fitting
movement of all five -- 0.0902 against `close`'s 0.2915. The cause is that `close` *terminates*: a
constant delta can describe a fighter still closing and cannot describe one that has arrived. Non-`close`
`reachError` maxes at 0.2259, so every scalar threshold between 0.23 and 0.40 refuses exactly zero
non-`close` keys -- it was never a calibration limit, it was a dial for one movement wearing a
general name. Split into `reachError: 0.20` with `approachReachError: 0.35` as an explicit
gross-failure ceiling, whole-gate survival goes **706/775 to 766/775** and no body loses its
approach planning at any budget.

**A fail-open guard documented as unreachable, and the arithmetic that hid it.** The `max(0, ...)`
clamp inside `contactRateError` fires on **497 of 2,325** real records, every one of them with
`p === q` exactly, at -8.3e-17. Without the clamp `sqrt` returns `NaN`, `NaN > 0.25` is false, and
the gate admits the row. It survived because it fires at the 8x budget *only* -- at the other three
the row counts make the arithmetic exact -- so a sweep that happened to sample the other budgets
would have reported the clamp as dead code with complete confidence.

**Six places the adversarial review was itself wrong**, and they are worth more than the confirmations.
The claim that a revert cost "0.003 % against a 1.393 % margin" conflated two different scores; the
revert actually changes no ranking at any budget. A "662 cases" figure was not reproducible -- the
re-measurement finds 976 over an enumeration range the review never stated. The stance figures were
taken under the limits this commit replaced; re-run under the new ones they hold in direction and
magnitude (warrior 0.73597 keyed against 0.73751 free; all nine, 0.63847 against 0.63967), which is
still "under a tenth of a percent", but the numbers on the record are now the ones from the tree as
it stands.

### The behaviour record names the tuple, and the claim it was given had to be cut in half

`actionCounts` counted `label.action` alone. It is replaced by `tacticCounts`, keyed on the whole
tuple in contract order, plus a free-choice map for the one head whose legality the body decides.
The diversity gate keeps its exact former meaning, computed from the action marginal.

**The claim the change was built on is true on 2 of 13 cells.** It was meant to separate "the policy
never varied its effector" from "the body only ever offered one hand". Measured over all 13 research
strata, sampling the legal-effector set at every physics sample of a real bout, `broot` identical to
`warrior` throughout:

| loadout | actions with two or more legal effectors | actions with exactly one |
| --- | --- | --- |
| `sword+empty` | cover, recover | cut, thrust, punch |
| `sword+shield`, `sword+buckler` | cover, recover | cut, thrust |
| `axe+empty` | cover, recover | cut, punch |
| `bow+empty` | **none** | cover, shoot, recover |
| `empty+empty` | cover, punch, recover | none |
| `natural:bite` | **none** | bite, recover |

**No loadout in the matrix gives an attacking action two legal effectors.** So the better a candidate
is at attacking, the less this record can say about its effector head -- the free-effector
denominator on eight of the thirteen cells is exactly "how often did it choose `cover`", and the
tournament's other gates reward the opposite. The overclaiming docstrings now carry that table. The
owner's answer is `sword+axe` in the strata, which is the only change that creates the evidence
rather than documenting its absence, and it lands next.

**Landed 2026-08-25, and the table above is superseded by the one in `docs/measurements.md` under
"Session 27".** With `sword+axe` in, the strata are 8 loadouts over 15 cells; `cut` names both hands
there and `thrust` only the sword one, so an attacking action has an effector choice on **4 of 15**
cells, 2 of them weapon-bearing. **The eight cover-or-recover-only cells are still eight** -- the
widening added two answerable cells rather than repairing any existing one -- so the sentence above
survives as "8 of 15" on the same eight bodies. The shares moved with the denominator: 20.1 % and
24.4 % on the fifteen cells against 23.4 % and 28.5 % on the thirteen, which is the third reading of
those two numbers and the reason they are not carried anywhere a program can read.

**Two shares that were quoted as facts about the matrix are not.** An adversarial pass measured 41 %
of decision mass in the choiceless cells and 73 % of free-effector decisions in `empty+empty`; the
remediation measured 23.4 % and 28.5 % on the same thirteen cells. Neither is wrong. Both are
readouts of the *policy* that was run, because the denominator is conditioned on the action the
policy just chose -- so the table above, which is policy-independent, is what the record carries, and
the shares are named with their harnesses or not at all.

**Half the new record was decorative and is gone.** `freeChoiceCounts.action` was identically equal
to the action marginal on every record any run can produce: a body with an attached hand has `cover`
and `recover` both legal, a handless body with a bite has `bite` and `recover`, and a body with
neither returns the empty set and never reaches the decision hook at all. Measured three ways -- 400
synthetic shapes, 39 real bouts over 1,771 decisions, and 78 bouts where it came out byte-identical.
A quantity that cannot come out any other way is the same defect this effort removed from the
calibration gate two commits earlier.

**And the theorem has a boundary that three sweeps missed, including mine.** There *is* a body that
decides with exactly one legal action: handless, with a natural attack whose key is not `bite`.
`supportedOptions` gates on `Object.keys(naturalAttacks).length` -- any natural attack means "can
decide" -- while `tacticEffectors` hardcodes the name `bite`, so such a body is offered `recover` and
nothing else. It is unbuildable today, because the only two writers of the field are
`NO_NATURAL_ATTACKS` and the centipede's `{bite}`, and the map was deleted on that ground with the
boundary written into the code. **The reason all three sweeps missed it is the same reason**: each
varied whether a natural attack was *present* and never what it was *called*. Mine was 288 bodies
over six weapon kinds; the real table has seven, and `club` was not in it.

**The reported statistic could name the option the head never freely chose.** `headUtilisation`
computed its modal over every decision while reporting a free-choice count as a bare sum. On a real
`warrior/sword+shield` bout with a policy that cuts seven of ten decisions with the sword hand and
covers the other three with the shield hand, it printed `modal=primary, share=0.719` about a head
that chose `secondary` on **all twenty-seven decisions where it had a choice**. Not a less useful
number -- the opposite conclusion. Every field now names its denominator and `freeModal` /
`freeModalShare` sit beside the old pair.

**Three seams had no test that could fail**, each deleted outright with the full suite green: the
free-choice merge in `candidateFromRawRows`, which is the only production aggregation of the
statistic and whose removal makes every candidate report "the body never offered a second option"
for a whole tournament; the executor's row construction; and the modal ordering, which reported the
*least*-used option without complaint because every fixture marginal was a two-way tie or a
singleton. `MIN_ACTION_SHARE` was pinned only to `[0, 0.286]` and is now bounded from both sides at
`(0.04, 0.09]`, and the `recover` exclusion is load-bearing in a test for the first time.

**Three comments named things that did not exist**, and the corrections went in both directions. Two
cited tests that were never written or had been renamed. The third claimed `asMeasured` was used by
three training scripts; none of them calls it. But the pass that caught it was itself wrong twice --
`train-lookahead.mjs` does contain the literal, in a comment saying it left that path, and
`research-rollout-worker.mjs` **does** wire the decision hook on both its NEAT and DAgger paths, so
it writes these maps on every training bout and discards them. The conclusion survived both
corrections; the evidence under it was replaced twice.

### A check for the pointers, and an item that was not about what it said

`81030fb`, 580 tests. The item on the list was "doc anchors under a real check". Measured, this
prototype has **1,830 code-span file references and 206 line anchors, 197 of them in
`docs/plans/`** -- a directory AGENTS.md says is deleted wholesale in the commit that finishes the
topic. The durable surface had nine. So the item was almost entirely about *file references*, and
the anchors it names live in the one place worth counting rather than gating.

**The register is derived, not curated.** A reference passes if it resolves in the tree, the repo
root or `node_modules`, or if it names a path `git log --no-renames --diff-filter=D` says was
deleted and that does not exist now. That explained **112 of 143** stale references with no
allowlist, and nobody can add a line to make a test green: an entry not in the deletion log fails.
`--no-renames` is load-bearing -- rename detection reports 49 paths against 56 and loses the old
names that are exactly what a stale reference cites. The separation is the whole design problem,
because most stale references are *correct*: `src/learning/evaluation.ts:5-7` names deleted scripts
in order to say they were deleted, and a checker demanding they resolve would force falsifying
accurate history.

**Three pointers were wrong, and the residue after the mechanical rules was exactly those three.**
No file named kinds.ts has ever existed anywhere in this repository's history -- `git log --all` has
no row for it, and it is written here without backticks because the gate refuses a code span naming
a file that never existed, which is this design's one real cost. The kinds are in `hands.ts`, which
`weapon.ts` re-exports ten lines under a comment naming the other file, while `mind.ts` made the
same claim about the same file under two names three lines apart. `TARGET_SPAN_FRACTION`'s argument
is in `measurements.md`, not `DESIGN.md`. The two `sword.ts`
references were re-pointed at `weapon.ts` by hand, because the register passes them -- that file
really was deleted -- and **cannot tell "deleted" from "go and read it"**. That limit is written into
`deleted-paths.md` rather than left implicit, along with the one a step further out: a reference to
the *wrong existing* file resolves and is invisible to any check of this shape, which is how
`DESIGN.md` survived.

**Two rules from the repository root were rejected with their numbers.** `tools/check_docs.js`
requires an anchor to land on a declaration; **149 of 254** resolving anchors here land
mid-statement and almost all are correct, because this prototype points at the line that does the
thing rather than at the `export` above it. And a symbol-proximity heuristic -- does the identifier
the prose names sit within four lines? -- was rejected as an assertion after it called
`tournament.ts:232` stale: that comment names `lookaheadMind` and anchors its *call*, which is
right. It is reported, never gated, and no pinned number derives from it.

**The gate cannot see a line-shifting edit above an anchor, and this change proved it.** Adding one
comment line to `src/main.ts` rotted three plan anchors by one and the suite stayed green, because a
shift of one moves neither `lineOutOfRange` nor `noSuchFile`. Every source edit here is line-neutral
and the limit is in the test's header. Three controls demonstrate the limits rather than asserting
them: the line shift, the `sword.ts` reference, and a reference to a wrong-but-existing file all stay
green on purpose.

**Six corrections the work produced, each measured.** Line counts were `split(/\r?\n/)` pieces,
lenient by exactly one -- no live anchor sat there, so the mutation that would have caught it found
nothing to catch, and a composed mutation was needed to show the fix is load-bearing. Two records
booked as out-of-range were continuations whose carrier was guessed wrong; the guess is wrong **nine
times of seventeen** and seven are silent, one of them against a 6,107-line carrier that absorbs any
line number a plan will ever write, so the field is renamed to what it measures. The register's own
`sort -u` was locale-dependent against a JS `.sort()`. `RESOLVE_SKIP` was unenforced on the
exact-path branch it claimed to guard. **166 durable references resolve only inside the gitignored
`.review/`**, so a clean checkout cannot verify any of them -- excused by shape and share, with the
premise asked of `git check-ignore` rather than of `.gitignore`'s text. And a proposed rule of mine,
that a bare `:nnn` continuation naming a `.md` carrier must be a wrong guess, was **falsified**:
`combat-followups-16-policy-perception-v4.md:226` writes `#L84` against `docs/design.md` correctly.

**The sixth exact sweep over the wrong space in this effort, and the fourth that was mine.** The
frame 206 / 197 / 9 was handed down as measured fact without its grammar. It reproduces over the
seven scanned extensions with a **two-spelling** grammar; under the four spellings the gate actually
parses, the same tree has 258, and the tree that ships the sentence has 290 -- because this change's
own new prose adds durable anchors. Every count now names its grammar and its extension set and is
taken at the state that commits. An adversarial pass placed the narrowness in the extension set
rather than the grammar, and that correction was itself corrected by measurement.

### The one still owed

- **PPO learns its persistence.** Twenty-five of twenty-six outputs are learned; the twenty-sixth is
  the constant `0.4`. It needs a continuous-action head with a different log-probability in the
  ratio, which is a change to the update rather than to the contract.

And one number from the earlier list was already wrong. The doc-anchor item was recorded as
"~35 stale colon-form anchors". Measured over every `.ts`, `.mjs`, `.js` and `.md` file in the
prototype outside `node_modules`, `dist`, `asset-src` and the gitignored `.review`: there are
**1,520 code-span file references, of which 114 name a file that does not exist**. Only 67 carry a
line anchor at all, and none of those points past the end of its file -- so the failure mode is not
drifting line numbers, it is references to files that session 17 stage A **deleted**
(`evaluate-options.mjs` 19 times, `promotion.ts` 15, `checkpoint.ts` 13, `training-evaluator.mjs` 12,
`promotion-evaluator.mjs` 11, `train-meta.mjs` 9, counting every spelling of each path as one file).
Twenty of the 114 sit in live source and
durable docs rather than in dated plan records, including five in one comment block in
`src/learning/evaluation.ts` -- and those are the ones that mislead a reader today. The rest are in
`docs/measurements.md` and `docs/plans/`, where a reference to a script that has since been deleted
is a correct record of how a measurement was taken and must not be rewritten to pretend otherwise.
That distinction is the actual design problem in the item, and it is not the one the original note
described.

The count is measured at `ab52947` and deliberately not re-run against this paragraph, which is
itself several more of them: naming a deleted script inside backticks is how a record says which
script took a measurement, and a checker that cannot tell that from a live reference will spend the
rest of its life being argued with.

> **Superseded within the hour, by the failure mode the paragraph above it names.** The figures
> first published here were 1,511 references and 123 stale. They came from a resolver that tried a
> **fixed list of seven directories** -- the prototype root, `src`, `src/learning`, `scripts`,
> `tests`, `tests/fixtures`, `docs` -- and `src/bodies/` was not one of them, so every reference to
> `centipede.ts` was counted as naming a missing file. Re-measured with a resolver that walks the
> whole tree and matches by path suffix, at the same commit: **1,520 code-span references, 114
> stale, 20 of them in live source and durable docs.** The conclusion is unchanged and every
> named-file count above moves by one or two. What changed is who made the mistake: this is the
> fourth exact-sweep-over-the-wrong-space in this effort and the first one that was mine, in the
> very paragraph arguing that every sweep must state its coverage space. The rule is not that
> other people's sweeps need the discipline.

### Findings from the implementation pass that change the plan

Recorded as they were found, with the evidence. A plan that survives contact unchanged was
not specific enough to be wrong; these are the places this one was.

1. **"At least twenty-four rows" is not reachable by choosing `N`.** Session 19 sets the
   cadence with `--checkpoint-every-jobs N` and session 21 accepts a rung only if it produced
   twenty-four rows. At the granularity each runner actually checkpoints at, the *whole run*
   offers fewer units than that: look-ahead **3,100** (`train-lookahead.mjs#L364`), NEAT-QD 80
   generations (`train-neat-qd.mjs#L20`), DAgger **5** iterations (`collect-dagger.mjs#L18`),
   PPO **2** arms -- `equalBudgetPpoArms` returns exactly `["random", "dagger"]`
   (`src/learning/ppo.ts#L256-L260`). No `N` divides five into twenty-four.
   **Consequence:** the unit of work is re-cut before the cadence is chosen. DAgger checkpoints
   at the eight shards inside `collect()` (`collect-dagger.mjs#L64`), PPO at the boundary loop
   inside `collectPpoTrajectory` (`train-ppo.mjs#L125-L162`). Both are already index-addressed,
   so the job-index cadence rule survives intact. The requirement was always legibility, not
   the number twenty-four; the number is what legibility costs at a one-hour spacing.
2. **PPO spends twice its stated budget.** `equalBudgetPpoArms` assigns the full `solverSteps`
   to *both* arms (`ppo.ts#L258-L259`), and `tests/ppo.test.mjs#L115-L117` pins that deliberately.
   Every ceiling derived for PPO in session 20 is therefore a per-arm ceiling and the run costs
   2x. PPO is also the only direction with no exact-budget assertion, so it under-spends as
   well; the ledger's `stepsConsumed` is the only honest figure.
3. **Validation worst-cell exists in one direction of four.** NEAT-QD computes it for real
   (`research-rollout-worker.mjs#L87`). PPO writes `macro: reward, worstCell: reward` -- the
   same scalar (`train-ppo.mjs#L238`). DAgger has only `validationLoss`, and look-ahead only a
   summed calibration **severity** -- each column as a fraction of its deployed limit
   (`train-lookahead.mjs#L295-L297`), which since session 19 is what `calibrationScore` sums
   rather than three raw quantities in three units; both are **lower-is-better**, which inverts the
   sign of the plateau rule's "improved by at least `--plateau-epsilon`".
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
   **discarded** by `research-rollout-worker.mjs#L74-L81`; `symmetricTimeCapRate` is computed
   nowhere; the specialist gap needs a control run no runner performs; and `train-ppo.mjs` and
   `train-lookahead.mjs` never read `result.engagement` at all. The signed-margin gate table is
   net-new plumbing in three directions, not a formatting change.
5. **Look-ahead has no resume, no state file and no coherent mid-run checkpoint.**
   `--stop-after-jobs` exists only in `train-ppo.mjs#L244`; the handoff's claim that it and
   `--resume` are general is wrong. Worse, a look-ahead `TacticalModel` first exists only after
   a complete train sweep (`train-lookahead.mjs#L373`) and is uncalibrated until the validation
   sweep (`train-lookahead.mjs#L378`), so a champion-so-far at row *k* is a computation the run does not otherwise
   perform -- and one `LOOKAHEAD_CALIBRATION_LIMITS` would likely refuse at deploy time.
   **Updated 2026-08-25:** it would no longer refuse outright. `lookaheadMind` now searches the
   cells it holds a calibration for and refuses only when a body has none, so a partial model is
   a narrower search rather than a dead deployment. That makes a champion-so-far *runnable*, and
   makes it correspondingly easier to ship one that is quietly planning over three tactics --
   whatever session 19 builds should report the pair count it actually searched.
6. **`configDigest` is two incompatible formats.** NEAT-QD and DAgger use 16 hex characters of
   SHA-256 (`train-neat-qd.mjs#L50`, `collect-dagger.mjs#L36`); PPO and look-ahead use 8 hex
   characters of FNV-1a (`train-ppo.mjs#L254`, `train-lookahead.mjs#L388-L389`). The artifact
   validator only requires a non-empty string (`artifact.ts#L165`). Preflight normalizes this
   before it can compare anything.
7. **A SHA-256 contract digest cannot live in `src/learning/`.** That tree is browser-imported
   by the Vite app, `node:crypto` is unavailable there and `crypto.subtle` is async;
   `artifact.ts#L110` already says so. The contract digest either uses the existing synchronous
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
    `EngagementTracker.attack` (`engagement.ts#L179`) returns early when an opportunity has
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
    as written and must be scoped: `opportunityForAction` requires `striker === "sword"` for
    `thrust` (`engagement.ts#L118-L123`) where the inline matcher falls through to `true`
    (`options.ts#L1157`); `research-havok.mjs#L46` credits exactly one row -- **the hand the label
    named** -- where `options.ts#L1158` credits every viable match, which systematically depresses
    dual-wield opportunity conversion; the labelled paths fire on an option-change edge while the
    label-free path fires on a button edge at 240 Hz; and only the label-free path counts a
    *guard release* as an attack (`options.ts#L1141`), which inflates the numerator of
    opportunity-attack and deflates attack-contact for a defensive player.
    **Corrected 2026-08-25.** This read "credits only `[0]`, the first matching row", which was
    an accurate description of a **defect**: the filter did not read the hand, so `[0]` was the
    *primary* fist on 98 of 98 viable punch samples on `warrior/empty+empty`, whichever hand the
    label named, and the named hand's damaging contact was dropped. The disagreement with
    `options.ts` survives the fix and is now a real difference of intent -- one path knows which
    effector was chosen and the other does not -- rather than an arbitrary first-row pick.
    `docs/measurements.md` carries the measurement.
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
    (`research-havok.mjs#L65-L66`). The recorder takes the per-fighter `{ view, dt, clock }` --
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
