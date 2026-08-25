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
   person, and there is no shared recorder to point: `behaviourRecord` is built only by two
   headless evaluators, the research path hand-rolls its own `EngagementTracker`, and the
   render loop in `src/main.ts` builds nothing. Opportunity-attack 0.65 has never been shown
   reachable by a controller *or* a player. Session 18 finds out first.
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
| 17 tactic output v2 | in progress, stage A of 3 | plan corrected `c41d01a` |
| 18 human gate feasibility | not started | -- |
| 19 run legibility | not started | -- |
| 20 throughput and ceilings | not started | -- |
| 21 research ladder | not started | -- |
| 22 scaled runs | not started | -- |
| 23 held-out tournament | not started | -- |
| 24 promoted integration | not started | -- |
| 25 integration and playtest | not started | -- |

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
and that separation is not incidental -- `docs/measurements.md:1780-1782` records it as the fix
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
seven-key command assertions in six test files. PPO needs **four** new heads, not three -- it
has no persistence output at all and `deployment.ts:61` hardcodes `0.4` -- and its reported
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
   `assessTournamentCandidate` (`tournament.ts#L197-L221`) and `assessPromotion`
   (`promotion.ts#L110-L133`) emit `string[]` failures carrying the threshold and **no achieved
   value and no margin**. They consume `TournamentCell`, a shape no research runner produces.
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
    once.** `scripts/evaluate-options.mjs#L175` calls `recordBehaviourSample` (the *labelled*
    path) and `#L178` calls `recordIntentAttack` (the *label-free* path) on the same
    `behaviourRecord`, in the same `onSample`, against one shared `_engagement`.
    `EngagementTracker.attack` (`engagement.ts#L137`) returns early when an opportunity has
    already been attacked, so it is first-writer-wins and the two silently blend.
    `scripts/training-evaluator.mjs#L24-L25` does the same.
    **Consequence:** the frozen 0.2282 and 0.2031 rows are a *mixture*, and a human -- who has
    no labels at all -- cannot reproduce a mixture. The honest comparison is label-free on both
    sides, so session 18 re-takes the specialist controls with the labelled path switched off
    and reports the mixture rows as superseded rather than as its control.
12. **The two attack paths disagree in four measurable ways**, so the planned test
    `a_label_free_mind_and_a_labelled_mind_agree_on_attack_intent_for_the_same_commands` fails
    as written and must be scoped: `opportunitiesForAction` requires `striker === "sword"` for
    `thrust` (`engagement.ts#L79`) where the inline matcher falls through to `true`
    (`options.ts#L481`); `research-havok.mjs#L36` credits only `[0]`, the first matching row,
    where `options.ts#L482` credits every match, which systematically depresses dual-wield
    opportunity conversion; the labelled paths fire on an option-change edge while the
    label-free path fires on a button edge at 240 Hz; and only the label-free path counts a
    *guard release* as an attack (`options.ts#L466`), which inflates the numerator of
    opportunity-attack and deflates attack-contact for a defensive player.
13. **The page's clock is wall-clock derived and the bench's is synthetic.**
    `src/main.ts#L936` takes `dt = min(engine.getDeltaTime()/1000, CONFIG.world.maxFrameSeconds)`
    with the cap at `1/20` (`config.ts#L38`) and feeds it to `combat.advance(dt)` (`#L946`);
    the bench advances by an exact `1/60` (`measure.mjs#L351`). The control step is `1/240` in
    both, so every *duration* accumulator is harness-identical -- but `attack`/`contact` window
    arithmetic reads `view.clock`, so under frame drops the page's clock runs fast against
    simulated motion and the 0.75 s opportunity window closes early. This is a named mechanism
    for a page-to-bench gate offset, and it means **frame rate is recorded beside every human
    row** or the row cannot be interpreted.
14. **`onSample` does not emit the shape session 18 says it does.** `runBout` emits
    `{ left, right, dt, clock }` where `left`/`right` are `Combatant`s (`measure.mjs#L286`);
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
    cannot separate two contacts stamped in one frame; `measure.mjs#L318-L342` drains by log
    identity instead and documents why. `Combat`'s third constructor argument
    (`combat.ts#L216`, fired at `#L303` and `#L345`) is the only lossless page-side source and
    is the one the bench already uses.
17. **`src/learning/engagement.ts` imports its two window constants from `tournament.ts`**
    (`#L3`), which imports `artifact.ts` and `research-matrix.ts`. A DOM-free recorder that
    imports `engagement.ts` therefore drags the artifact/checksum graph into the page bundle.
    Move `OPPORTUNITY_WINDOW_SECONDS` and `STALL_WINDOW_SECONDS` down into `engagement.ts` and
    re-export them from `tournament.ts`.
18. **Two gate derivations already disagree on the case a bad human bout produces.**
    `tournament.ts#L241-L245` maps a never-attacked cell to `+Infinity`; `evaluate-ai.mjs#L17-L20`
    returns `null` for the same cell. The shared formatter session 18 introduces must fix one
    meaning for "never attacked" and both callers must adopt it.
    Related: `scripts/promotion-evaluator.mjs` evaluates **no** engagement threshold at all --
    it is a win-rate, option-diversity, motif and safety gate (`promotion.ts#L3-L6`). Session
    18's brief was wrong to name it as a gate-table site.

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
- `npm run ai:options` already throws against its checked-in baseline, and did so before this
  work: the corpus carries `featureVersion: 2` / `featureCount: 50` against a runtime at v3 and
  66 columns. Session 14 left it stale. Session 16 moves the runtime to v4 and session 17
  deletes the command outright, so it is not repaired here -- but the handoff's "last verified
  state" line claiming `ai:options` passed is wrong and should not be trusted.

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
