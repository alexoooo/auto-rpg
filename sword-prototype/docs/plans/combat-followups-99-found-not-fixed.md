# Found but not fixed

A register of defects and gaps that were **measured** during the combat follow-ups and deliberately
left alone. Everything here has evidence attached and a stated reason it was not closed on the spot.

This exists because the alternative is worse. A finding that turns up mid-task has three fates: fix
it now and quietly widen the job, mention it once in a report nobody re-reads, or write it down
where the next person will look. Only the third survives a week. **An entry here is not a promise to
fix.** Several of these are decisions rather than debts, and say so.

## How to read an entry

Each one carries: what is wrong, the evidence, why it was not fixed, and what closing it would cost.
Where a measurement is quoted, the harness and the coverage space are named -- a number without
those is the failure mode this directory has hit four times, and every one of those four was exact
over the wrong space rather than sloppy.

When an entry is closed, move it to **Closed** at the bottom with the commit, rather than deleting
it. The reason a thing was left alone is worth as much as the fix.

---

## Open

### 2. `decisionsPerSecond` in the tournament report is systematically under-reported

**Closed 2026-08-25, and the entry had found the smaller of two defects.** See the Closed
section at the bottom.

`scripts/evaluate-ai.mjs:88` sums the per-decision counts across **all** raw rows, including the
three controls. The controls contribute exactly zero, because `mindFactoryForTournament` returns
`() => control` for them (`scripts/tournament-executor.mjs:36`) and discards the `onDecision`
callback the harness passes -- so `randomMetaMind`, `scriptedMetaMind` and `policyMind` never
report a decision. With three controls and *N* candidates the throughput figure is low by a factor
of `(3 + N) / N`.

**Why not fixed.** It is a one-line fix, but it changes a reported number, and the right fix depends
on an unsettled question: whether controls *should* record their decisions at all. They cannot
today, because none of the three control minds accepts a decision hook. Making them record is the
useful version -- it gives every learned candidate a scripted baseline to be compared against on the
same axis -- and it is a larger change than the arithmetic.

**Cost to close.** One line for the arithmetic. Half a session for the useful version.

### 3. The DAgger teacher can never emit a `thrust`

`src/learning/tactical-teacher.ts:319` is the whole action rule:

```
const action: HandActionName = weapon === "bow" ? "shoot" : weapon === "empty" ? "punch" : "cut";
```

Any held weapon that is not a bow answers `cut`. So the three-branch thrust aiming rule written in
stage C2b is authored, exported and driven by its own test, and **no rollout can reach it.**

**Why not fixed.** Making it reachable is not a bug fix, it is a change to what the teacher *does* --
every sword cut would become a thrust unless a real choice rule is authored between them, and
authoring that rule is a combat-design decision with a balance consequence that has not been
measured.

**Cost to close.** A measured choice rule plus a before-and-after on the null control. Belongs with
whatever session next revisits the teacher.

### 4. A bite's target head is untrainable, in three independent ways

`tacticTargets("bite")` offers only `vital` (`src/options.ts:458`), so the target head has one legal
option on a biting body and the mask leaves nothing to choose. `handActionOption`'s bite branch
never reads `target` at all. And the aim would not matter if it did: a centipede's bite measured
over four seed pairs produced **232 contacts -- 172 left shin, 60 right shin, zero head, zero
torso.**

Each of the three is defensible alone. Together they mean a learned target head cannot be trained,
evaluated or falsified on a bite.

**Why not fixed.** Giving a bite a real aim means giving the natural-attack channel a stroke
envelope it does not have. That is body work, not contract work.

**Coverage space of the measurement.** One unit (`centipede`), four seed pairs, the shipped bite
envelope. It says nothing about any other natural attack, because there is no other natural attack.

### 5. The teacher labels every `cut` with a constant `vital`

The justification on record was a stage B measurement showing that a named aim moved a cut's head
share only 0.071 to 0.045 -- so varying the label would teach a correlation the body would not
produce. **That measurement was superseded**: it compared each named region against `"as-measured"`,
whose cursor sits a median 0.0127 from `high`, so it was one stroke measured twice. Since `4d461ea`
gave named strokes a real span, a named cut separates by roughly 8.7x.

So the constant label now rests on a reason that no longer holds. The label may still be the right
one -- nobody has measured whether a varying cut aim helps -- but the argument recorded beside it is
void.

**Why not fixed.** It is a teacher-behaviour change and needs its own before-and-after, same as
item 3.

### 6. The option layer has no per-weapon guard placement

Measured before `4d461ea`, option-driven, 24 bouts per loadout against `swinger`: `sword+shield`
took **294.7** damage, `sword+buckler` **176.1**, `sword+sword` **202.8**. A shield is the best
guard in the game and produced the worst outcome -- the ordering is not merely off, it is inverted.

The cause found at the time was that a guard was placed identically regardless of what the hand held.
`4d461ea` addressed one half of that (the supporting hand now steps outboard off the line the leader
holds, via `ACTION_TUNING.guardSpread`), but **the loadout comparison has not been re-run since**,
so the current ordering is unknown.

**Why not fixed.** Guard placement per weapon is a combat-design job with real balance consequences,
and it needs the re-measurement first to know how much of the gap `4d461ea` already closed.

**First step is cheap:** re-run the three loadouts at 24 bouts and put the numbers here.

### 7. The tactic tuple is an output but never an input

The feature vector carries `current_movement_*` and `current_action_*`. By the same logic it wants
`current_effector_*`, `current_target_*` and `current_stance_*` -- a controller that cannot perceive
the stance it is holding cannot learn to hold one deliberately.

**Why not fixed.** It is a `featureVersion` bump, which invalidates every checked-in artifact and
every pinned golden in the set. That belongs to a deliberate feature-contract revision, not to an
output change riding in beside it.

### 8. The quality-diversity descriptor is thin, and the argument that kept it is now the only one

The descriptor was left alone partly on the arithmetic `125 x 72 = 9,000` cells against 10,240
genome-evaluations -- "sparser than one elite per cell". That `72` was the nominal `3 x 4 x 6`
reused as a count of legal tuples. Measured: the maximum `|deployableTactics|` on any body is **21**,
the union over the whole body space is 33, and over the thirteen research cells 24. On the true
figures it is 3,000 cells and **3.4 elites per cell** -- thin, but a tuning objection rather than a
refusal.

**The decision stands and the descriptor is unchanged.** What changed is that the outcome-descriptor
argument is now the *only* reason left holding it up, and the record should say so rather than
letting a retired arithmetic argument look like support.

### 9. Nineteen exports went live-to-test-only in session 17 and are still there

`src/learning/evaluation.ts:1-14` carries the one note about it. Eight of the nineteen are in that
file; the rest are `initialPopulation` in `genome.ts`, both of `jobs.ts`, `Network` in `network.ts`,
and three fitness/novelty functions in `meta.ts`.

**Session 18a closed the adjacent four-function question.** `behaviourRecord` and its three writers
in `options.ts` now have one production owner, `BoutRecorder`, shared by the page and bench. They
are no longer part of this test-only export count.

**Why not fixed.** The nineteen remaining exports still have no production owner; removing them is
a separate cleanup whose callers and test value have to be audited together.

### 10. Roughly 114 code-span file references name a file that does not exist

**Closed 2026-08-25, and the entry's own numbers were wrong in both directions.** See the Closed
section at the bottom, and the durable record in `docs/measurements.md`.

### 11. The research matrix contains no loadout where an attacking action has two legal effectors

Measured over all 13 research strata, sampling the legal-effector set per action at every physics
sample of a real bout (39 bouts, mirror 0, split `train`, seed 310013):

| loadout | actions with two or more legal effectors | actions with exactly one |
| --- | --- | --- |
| `sword+empty` | cover, recover | cut, thrust, punch |
| `sword+shield`, `sword+buckler` | cover, recover | cut, thrust |
| `axe+empty` | cover, recover | cut, punch |
| `bow+empty` | **none** | cover, shoot, recover |
| `empty+empty` | cover, punch, recover | none |
| `natural:bite` | **none** | bite, recover |

`broot` is identical to `warrior`. **Only `cover` and `recover` ever have an effector choice on a
weapon-bearing body.** So the question "did this candidate's effector head learn anything?" is
answerable on **2 of 13 cells, and both are the weaponless ones**. 41 % of pooled decision mass comes
from the three cells where the head can never have a choice, and 73 % of the free-effector decisions
come from the two `empty+empty` cells.

The perverse consequence: **the better a candidate is at attacking, the less the record can say
about its effector head**, because the free-effector denominator on 8 of 13 cells is exactly "how
often did it choose `cover` or `recover`" -- and the tournament's other gates reward the opposite.
Under an attack-heavy policy 11 of 13 cells fall below the sample size needed to call a
100 %-modal head collapsed; under a defensive one all but bow and centipede clear it.

**The fix that creates the evidence rather than documenting its absence is a two-striker loadout.**
`docs/measurements.md` already identifies `sword+axe` as the loadout where "the effector head
decided" is separable from "the loadout decided", and already uses it for exactly that in a unit
test. The tournament matrix simply does not contain it.

**Decided: add it, now.** The cost is real -- +2 cells (13 to 15), +12 jobs (about +15 % tournament
wall clock), a new `LOADOUTS` row and `LOADOUT_TACTICS` row, a moved curriculum digest, a moved
look-ahead preflight tuple count, and session 22 plan text that pins "all 13 body/loadout cells" and
"240" -- and it is paid before any compute is spent rather than after, which is the whole reason to
decide it now. Spending a 24-hour training window on a contract whose effector head cannot be tested
on an armed body is the more expensive mistake.

**Status: landed 2026-08-25.** `HUMANOID_RESEARCH_LOADOUTS` carries the decision and its cost;
`an_attacking_action_names_two_hands_on_exactly_one_armed_research_loadout` in
`tests/ai-tournament.test.mjs` is what stops the row being removed by accident.

**Two things the decision note above got wrong, both found by measuring rather than by reading.**

- **`thrust` reaches one hand on `sword+axe`, not two.** `isHeldStriker` accepts an axe and
  `hasPoint` refuses it, so `cut` names both hands and `thrust` names only the sword one. That is
  better than the note assumed rather than worse: an action that names the hand beside an action
  that cannot is exactly what separates "the effector head decided" from "the loadout decided",
  and it is why `sword+axe` rather than `sword+sword`.
- **The count of cover-or-recover-only cells did not fall.** Re-measured with the row in
  (`.review/sa27/cells.mjs`, 45 bouts, all 15 cells x 3 opponents, mirror 0, seed 310013, 1200
  solver steps each, 2058 decisions), an attacking action has two legal effectors on **4 of 15**
  cells against 2 of 13 before -- but the same eight cells are still cover-or-recover-only and the
  same three are still structurally zero. The widening *added* two answerable cells; it did not
  repair any existing one, and "8 of 15" rather than "8 of 13" is the whole of the difference on
  that line.

The cost, re-derived rather than taken from the estimate above (`.review/sa27/schedule.mjs`):
+2 cells, +12 tournament jobs, `lookaheadTacticCellSchedule` 775 tasks a split to **945** and its
minimum budget 148,800 solver steps to **181,440** -- 22 %, not the ~15 % the cell count predicts,
because `sword+axe` is the widest row in the table at 17 tuples. `curriculumDigest` moved
`f9d5c046` to `a011a028`, and the `deployableTactics` union over the research cells 24 to 27.

### 12. There is no control baseline for the effector, target or stance heads, and the schema forbids one

The three tournament controls produce empty behaviour records, because `mindFactoryForTournament`
returns `() => control` and discards the decision hook. Wiring it is not a plumbing change: both meta
controls hand `handActionOption` an `asMeasured(...)` execution whose target is `"as-measured"`,
deliberately outside `TARGET_NAMES`, so **100 % of their keys would be refused by the row validator**
-- measured, 675 decisions for `scripted-meta-control` and 1,346 for `random-meta-control`, every one
of them.

**And the baseline would be a known constant even if it were recorded.** The controls have no
effector head; they call `chooseEffector(view, action, "primary")`, which returns `primary` whenever
`primary` is legal -- and per item 11 `primary` is legal for every free-effector action on every
cell. So on free decisions both controls are 100 % `primary` with probability 1, by construction.

**What that costs the conclusion.** A free-choice denominator answers "could the body have done
otherwise?". The question session 23 actually needs is "would any policy have done otherwise, and did
it help?" -- and that needs an **ablation arm**: the same artifact with the head clamped to
`chooseEffector`, run as a fourth controller. Without it, "the effector head is 100 % primary on 120
free decisions" cannot distinguish a dead head from one that rediscovered `chooseEffector`'s hand
search.

**Decided: build it into session 23.** The plan now carries it under *Freeze* as a per-candidate
ablation binding, with the reason written beside it and an explicit note that the arm is not a gate
-- it decides what may be *written* about why a candidate won, not which candidate is promoted.
Manifest schema grows a binding per candidate; the job list grows by one controller's worth of rows.

### 13. A sample-size floor exists for the sentence session 23 wants to write, and nothing states it

To call a head "collapsed" when all *n* of its free choices picked the same option -- rejecting "it
picks the other option at least 10 % of the time" at 95 % -- needs `0.9^n <= 0.05`, so **n >= 29**.
This gates nothing about a candidate; it gates whether a sentence about the candidate may be
written, and it bites: measured, 11 of 13 cells fall below it for an attack-heavy candidate.

**Landed** into session 23's *Decide* list beside the head-utilisation reader, together with the two
readings that would otherwise be wrong (a look-ahead candidate has no stance head; PPO's persistence
is a constant) and an instruction to name the cells where the question was unanswerable rather than
folding them into a pooled share.

### 14. The stance head is the last one the record cannot tell from an absent head

`lookaheadMind` hardcodes `UNLEARNED_STANCE` and has no stance head at all, so a look-ahead candidate
prints the exact signature of a collapsed head -- free on every decision, one option chosen, modal
share 1.0 -- by design. `lookaheadMind` has no persistence window at all either: its re-decision
condition carries no clock term, yet it reports `UNLEARNED_PERSISTENCE` on every label.

**PPO's half of this is closed and the entry's real point survived it.** PPO's persistence was the
constant `0.4` when this was written and is a learned categorical over `PERSISTENCE_SECONDS` now, so
one of the two algorithms named here moved.

**The dwell half of this entry is closed too, and the third case with it.** The record carried no
persistence head at all -- `headUtilisation` read the five-name joint tuple key and the dwell is not
one of its fields -- so a PPO candidate whose persistence head settled on a single bin printed
byte-for-byte what one sweeping the whole grid printed, for every algorithm including the two that
learn it. `src/learning/persistence.ts` is the fix: `PersistenceCounts` is a **marginal** over the
eight bins carried beside the joint map, the way `freeChoiceCounts.effector` is, and it is two maps
rather than one. `bins` is every decision by dwell bin; `freeBins` is the subset where the controller
could have named a different dwell, from a `persistenceOptions` a mind declares at the site that
produces its dwell (`PersistenceHead`). So `{chosen: 1, freeChoiceDecisions: 0}` reads
"constant by construction" and `{chosen: 1, freeChoiceDecisions: n}` reads "a head that had the whole
grid and used one bin of it", and a reader needs neither the algorithm name nor its source to tell
them apart. `a_collapsed_dwell_head_and_a_head_that_does_not_exist_are_different_records` and
`a_real_bout_records_the_dwell_every_decision_asked_for` are the readers;
`every_deployed_algorithm_declares_whether_it_has_stance_and_dwell_heads` pins the declarations, which is
what a declaration needs and a measurement would not.

**The tuple was not widened, and entry 17's first bullet is why.** Adding the dwell to `TacticTuple`
multiplies a joint key already measured at 555 occupied cells of 2,520 by eight. `UtilisationHead` is
`keyof TacticTuple | "persistence"` for exactly that reason, and the schema change is the row record
plus its two validators -- `validateTacticRecord` in TypeScript and the row builder in
`scripts/tournament-executor.mjs`, which gets no static check at all (entry 15).

**The stance half is closed too.** `StanceHead` declares the choice width beside
`PersistenceHead`: the three learned controllers declare six and look-ahead declares one. The
research producer records the chosen-stance marginal only in `tacticCounts` and its free subset in
`freeChoiceCounts.stance`, so a one-option learned collapse and a missing head no longer print the
same row.

Separately, **a centipede consumes no posture.** `src/bodies/centipede.ts` publishes crouch, trunk
lean and trunk twist as zero and never reads `input.posture`, so on the three centipede cells -- 6 of
26 tournament jobs -- the producer narrows the controller's declaration to one and records no free
stance choice. `applyTacticStance`'s own note records that during any committing action
`extended` is a near-duplicate of the commit posture, so it is five distinguishable names elsewhere,
not six.

### 15. `scripts/` and `tests/` have no static check at all

`tsconfig.json`'s `include` is `["src", "vite.config.ts"]`, and everything under `scripts/` and
`tests/` is `.mjs`. So `npm run check` covers `src/` only -- for a change spanning ten files, five of
them were outside it. Widening `include` would not help on its own, because these are JavaScript;
covering them means `allowJs` plus `checkJs` plus whatever that turns red.

Worth knowing when a report says "`tsc` clean": it means half the harness compiled, not that it was
checked.

### 16. What the null control does and does not prove

`npm run measure -- --only duelist-swinger --bouts 120` is cited throughout this effort as the guard
that nothing leaked into a shared primitive, and for changes to the execution layer it earns that.
**For a change that only adds exports it is structurally incapable of moving**: `scripts/measure.mjs`
imports nothing from `research-havok.mjs`, `learning/tournament.ts` or `learning/meta.ts`, and
`duelist-swinger` runs `policyMind`, which never enters a `CombatOption`.

So it is a regression check that passed, not evidence the change is safe. A guard that passes is not
evidence until somebody has made it fail on purpose -- and the discipline this repo already applies
to tests applies to its controls.

### 17. Smaller things, each with its measurement

- **The joint map is too sparse for joint questions.** Measured over 39-job sweeps: 555 occupied keys
  of 2,520 at 2.39 counts each, 34 % of them singletons (uniform policy); 427 keys at 2.48, 46 %
  singletons (attack-heavy). Per row it is 21 to 65 distinct keys over about 27 decisions. The
  marginals carry the signal; the joint structure is a table of ones and twos. That is not an
  argument to key it differently -- the marginals are what was missing -- but the joint-versus-marginal
  argument in the docstring should not be read as a claim that joint questions are now answerable.
- **Rows-file IO roughly doubles.** The per-row record grows 16 to 39 times (77-89 bytes to
  1,201-3,449). `executeNextTournamentRows`' `onRow` rewrites and renames the whole array after every
  row, so total write volume for a 4-candidate run lands near 280 MB.
- **`mergeTournamentRows` revalidates every previously merged row**, so a 130-row resume is O(N^2)
  validations and each is now more expensive -- two `tacticMarginal` passes per row, each parsing
  every key. Estimated ~2M `parseTacticCountKey` calls for a full run, which is negligible, but it
  was estimated rather than measured.
- **A DAgger artifact can name a target outside `TARGET_NAMES`.** `predictDagger` returns
  `head.labels[...]` -- strings decoded from artifact bytes -- and `validateDaggerRow` checks only
  that the label fields are truthy, never that they are in the frozen tables, while
  `handActionOption`'s `knownAim` accepts `"as-measured"`. A hand-built artifact could therefore
  drive an unparseable key into a row. Narrow, pre-existing, and refused at the first
  `mergeTournamentRows`, which is the intended behaviour.

### 18. The boundary progress reward does not telescope, and the persistence head can farm it

`tacticalBoundaryReward` in `src/learning/ppo.ts` is
`terminal * 4 + (endVitalityPotential - startVitalityPotential) + clamp(nearRangeProgress, +-0.2)`.
The vitality term telescopes across boundaries -- consecutive boundaries share an endpoint, so a
whole bout sums to its total vitality change however it was cut up. **The progress term is clipped
per boundary and therefore does not.** Cutting a bout into more boundaries clips less of the same
closure, so more boundaries accrue more progress reward, and the number of boundaries is now a thing
a learned head decides.

**Measured.** Coverage: the persistence forced to each of the eight bins of `PERSISTENCE_SECONDS`,
every one of the 90 jobs of `researchMatrix("train", 310013)`, 1200 solver steps each, an untrained
randomly-initialised recurrent policy with a per-head RNG, the league opponent
`indexedLeagueOpponent` picks per index (`.review/persist/sweep.mjs`; `docs/measurements.md` carries
the table and the story of the first, invalid, version of this measurement). Clipped progress per
bout is **1.054** at the 0.10 bin against **0.336** at the 0.80 bin, while the *unclipped* sum moves
only 152.9 to 127.6 over the same 90 bouts. So the clip is doing it, and the gap is **0.72 of reward
a bout** to minimal persistence -- against a terminal reward whose whole magnitude is 4.

**The mechanism is boundary count, and it is checkable rather than asserted.** Clipped progress per
bout divided by boundaries per bout is 0.0221 to 0.0263 across all eight bins -- flat to within
9 % -- so the term really is "about 0.025 per boundary, however many there are". The requested bin
controls boundary count steeply in the lower half and barely in the upper, which is why the raw
sums are not monotone in the bin and an earlier version of this entry read them as though they were.

**It is not the discounting defect and is independent of it.** The flat-gamma bias -- a 34.7 %
spread in what a terminal is worth, decided by dwell -- is closed by making `generalizedAdvantages`
discount by elapsed time. An earlier version of this entry said the two were "partly cancelling"
and that fixing one **unmasks** the other. That is a claim about interaction and the measurement
does not support it: the progress bias is a property of the reward function and is present, at the
same size, with either discount. The two are also not the same size. The terminal spread is worth
at most `4 * 0.2289 * (34 / 90) = 0.35` a bout and about 0.23 at the median bin, because only 18-34
of 90 bouts reach a terminal at all -- roughly **3x smaller** than the progress term, not "the same
order". And its *sign* follows the terminal's: wins against losses run 14/20, 3/15, 11/13, 9/10,
9/16, 8/14, 8/12 and 10/13 across the bins, net-negative in every one, so on this coverage space a
flat gamma penalises long dwell rather than rewarding it.

**Why not fixed.** Every candidate repair changes the reward function every existing PPO artifact
was trained under, and each has its own argument: clip the progress over the *bout* rather than the
boundary (needs a per-bout accumulator the boundary record does not have); scale the clip by the
boundary's duration (couples reward to the thing being learned, which is how a shaping term becomes
a dwell incentive of the opposite sign); or drop the clip and rely on the telescoping (which is what
the clip was added to prevent -- `telescoping_progress_cannot_be_farmed_by_crossing_one_range_boundary_repeatedly`
in `tests/ppo.test.mjs` is the test that would go red, and it is right).

**Cost to close.** One session, and it should be taken together with a training run: this is a
number about what a policy is paid, so the only honest verification is a trained head whose dwell
distribution is compared before and after, which no test in this tree can stand in for.

### 19. `valueEpsilon` was never re-derived against the horizon that changed under it

`ppoHeadUpdate`'s `valueEpsilon = 0.2` is an **absolute** clip on how far the value prediction may
move in one update. It was chosen against a flat per-boundary gamma whose effective horizon was
about 30 s of bout; the discount is per second now with a horizon of 40.3 s, so the return the value
head is asked to predict has changed both its scale and its meaning -- it is a time-discounted
return over unevenly spaced boundaries, where before it was a step-discounted one over even ones.

**Measured, on the tree that ships.** `|valueTarget - oldValue|` -- which is `|advantage|`, exactly
the distance the clip bounds -- over four `collectPpoTrajectory` runs at seed 310013, 1200 solver
steps each, jobs 0-3, untrained random initialisation: n = 73 boundaries, mean **0.292**, p50
**0.223**, p90 **0.626**, p99 **1.230**, max **1.308**. **53.4 %** of updates are already past the
0.2 clip. So the clip is not a rare guard on outliers, it is the common case, and it was the common
case before this change too.

**Why not fixed.** Re-deriving it means choosing a number against a distribution from a *trained*
policy, and the one above is untrained: an untrained value head predicts near zero, so almost the
whole advantage shows up as target movement. A number chosen from this distribution would be a
number about initialisation. The honest fix is a bracketed sweep during a real training run,
which is a compute decision rather than an edit.

**What is safe to say now.** The clip's behaviour is unchanged by this session -- it clipped a
majority of updates before and after -- so nothing here made it worse. It is written down because
"an absolute epsilon against a horizon that moved" is the kind of thing that goes unexamined
precisely because it did not break.

### 20. PPO cannot spend a step budget, and no session owns giving it one

**Closed by session 19.** PPO now repeats indexed collect/update/validation jobs until each arm's
declared ceiling or a fair-round plateau stop.

Asked for 400,000 solver steps an arm -- 800,000 across the two -- a `train-ppo.mjs`
invocation consumed **5,508**. `runResearchBout` clamps a bout to
`min(boutCapSeconds, limit/physicsHz)` with every stratum at 45 s against 240 Hz, so 10,800
steps is the ceiling on one bout; a bout ends when somebody dies, so a real one costs about
1,400; and `trainPpo` runs exactly four bouts, two arms by two splits. It also performs exactly
two gradient updates at any budget -- `ppoHeadUpdate` has one call site inside a two-element
loop and there is no `--iterations` flag.

**Why it matters.** Sessions 20, 21 and 22 derive a step ceiling, run a 24-hour rung and scale
to 72-hour seeds. A 24-hour PPO rung completes in about twenty seconds. More generally a step
budget is not a learning budget for three of the four directions: NEAT-QD and DAgger scale by
`--generations` and `--iterations`, and `--solver-steps` only lengthens the bouts inside a fixed
number of updates. Only look-ahead turns steps into fitted rows.

**Why not fixed.** Giving PPO an outer loop is a session's work, not an edit, and it changes
what every existing PPO artifact means. It is written into session 19's corrections as the thing
that must land before any ledger row is designed.

### 21. Two runners make a plateau rule illegal, and both still carry the retired 1.8 B

**Closed by session 19.** The exact-budget assertions, both report flags and the unused constant
were removed; the common ledger now distinguishes plateau from ceiling.

`train-neat-qd.mjs` and `collect-dagger.mjs` throw unless `consumedSolverSteps === solverSteps`
exactly. A plateau rule stops a run early by construction, so it cannot land in either without
removing or conditioning that assertion, and no session mentions it. Both also still report
`fullBudgetCompleted: solverSteps === 1_800_000_000`, and `src/learning/research.ts` still
declares `RESEARCH_SOLVER_STEP_BUDGET = 1_800_000_000` with no consumer -- the frozen accept
criterion this plan set's standing rules exist to abolish, alive in three places.

**Why not fixed.** It belongs with session 19's plateau rule; removing the assertion before the
rule that needs it removed would leave a runner that silently under-spends with nothing to say
so.

### 22. Three commands the plan set invokes do not exist, and none has an owner

**Partly closed by session 19.** PPO and look-ahead now honor `--run-id`; `--rung` and
`--verify-promoted` remain assigned to later sessions.

`--rung` appears nowhere in the tree and sessions 21 and 22 both require it. `--run-id` exists
in `train-neat-qd.mjs` and `collect-dagger.mjs` and **not** in `train-ppo.mjs` or
`train-lookahead.mjs`, which ignore it silently. `--verify-promoted` appears nowhere and
sessions 24 and 25 both invoke it as a verification step.

**Why it matters more than a missing flag.** Each is written into a plan as though it were a
command somebody could run, so the first session to reach it discovers the gap at the point of
use rather than at planning time. Assign each to 20, 21 or 23.

---

## Closed

### All five tournament safety flags were hardcoded `true`

Entry 1 was closed 2026-08-26. `tournamentSafetyObserver` now watches the command actually returned
to the body, the exact legal action/effector/target set, movement/action occupancy, the verdict edge
and a three-frame live tail. It finalizes only after `runBout` returns from its teardown path. The
executor refuses a row with missing, invented or non-boolean evidence instead of filling a default.
That lifecycle observation proves a complete run reached a successful return after teardown; it
does not count live resources. The integration lifecycle audit remains the owner of the no-leak
claim.

The stuck thresholds did not move: a bout must last at least five seconds, and an uninterrupted run
must occupy at least five seconds and 95% of the bout. The semantics are translated and strengthened:
the legacy controller selected one `OptionName`, while the factorized controller selects movement
and action together, and either head can now fail. No threshold was chosen from held-out results.
Focused tests drive every one of the five observations false, drive the missing-evidence refusal,
and take the observer through a real one-second NullEngine/Havok bout. Each false/refusal assertion
was watched fail with its own production guard removed before restoration.

### `decisionsPerSecond` was not under-reported, it was not a rate at all

Entry 2 above found that the numerator summed control rows that contribute zero decisions, and
put the error at a factor of `(3 + N) / N`. That was right and it was the smaller half. **The
denominator was `wallSeconds` -- the wall clock of the *reporting* invocation**, which parses two
JSON files and aggregates them and runs no bout: when `--run-next` executes bouts the process
exits before that line is ever reached. So the figure was inversely proportional to how fast the
reporting machine was and carried no term for how long the fights took, and re-reporting a
finished tournament on a faster machine "improved" the throughput of bouts that had already run.
Measured on a two-cell synthetic report: 0.024 s, 192 decisions, 7,900 "decisions/sec"; an
adversarial review measured 0.064 s and 66,682 on a real one -- two numbers an order of magnitude
apart off records containing the same fights.

Closed 2026-08-25 by deleting it. `boutSeconds` and `decisionsPerBoutSecond` replace it, summed
over the manifest's candidate rows on **both** sides of the ratio -- which closes the control
dilution entry 2 named at the same time -- and `row.seconds` is the bout's own simulated clock, so
the number is comparable across candidates and across machines. The unsettled question entry 2
raised, whether the controls should record their decisions at all, is untouched and still open:
this makes the rate honest about what it measures rather than widening what it measures.

### `TACTICAL_TEACHER_VERSION` was never compared to anything

Recorded during session 17 stage C2a: the constant had three readers and all three *wrote* it, so
bumping it refused exactly zero rows and a row labelled by teacher 1 was indistinguishable from one
labelled by teacher 2. Closed in stage C2b -- `validateDaggerRow` now compares it
(`src/learning/dagger.ts:68`) and `tests/dagger.test.mjs:382-391` watches the refusal fire.

### The stale-reference count was wrong in both directions, and three pointers were genuinely wrong

Entry 10 above put it at "1,520 code-span file references, 114 stale, 20 of them in live source and
durable docs", and said no anchor points past the end of its file. Re-measured 2026-08-25 at
`503bd0a` over a wider space -- `.tsx`, `.cjs` and `.jsx` added, the four anchor spellings parsed
instead of one, and code spans quoted inside code spans made visible: **1,887 references, 50 the
exact rule cannot verify -- 19 of them outside `docs/plans/`.**

**The 145 in the sentence above belongs to a different sweep and this entry gave it to the wrong
one.** It is the first sweep's count of file-ish references resolving nowhere out of 1,830, taken
with a resolver that searched `.review/` and `dist/`; `docs/measurements.md` carries the table that
keeps the three sweeps apart. That resolver is also why 146 durable references which exist only on
the machine that wrote them counted as resolving.

**On the anchors the entry was right, and this section said otherwise for an afternoon.** It read
"two anchors *do* point past the end of their file". They do not. Both were bare `:nnn`
continuations whose carrier the new checker had to guess and guessed wrong -- the guess is the
nearest preceding file name, and the prose meant a file named further up. `docs/measurements.md`
carries the two, with the file, the line and the true carrier. **No anchor in this tree names a
line past the end of its file**, which is what entry 10 said.

Closed by `tests/docs.test.mjs`, which gates the durable surface -- everything scanned except
`docs/plans/` -- and pins the plan surface from both sides rather than repairing anchors that are
deleted when the topic closes. `docs/deleted-paths.md` is the generated register that lets an
accurate reference to a deleted file pass without anybody hand-maintaining a list of excuses.

Three live pointers were genuinely wrong and are fixed: `kinds.ts` at `src/mind.ts:10` and
`src/weapon.ts:26`, which named a file that has never existed in this repository -- the kinds are in
`src/hands.ts`, and `src/weapon.ts` re-exports them from there ten lines below the comment that said
otherwise; and `DESIGN.md` at `src/options.ts:530`, whose `TARGET_SPAN_FRACTION` argument is in
`docs/measurements.md` and is not in the repository-root `DESIGN.md` at all. Two more were fixed that
no register of this shape can catch: `sword.ts` at `src/main.ts:670` and `docs/design.md:594` both
read "go and read it", and `src/sword.ts` really was deleted, so the register passes them forever.
`docs/deleted-paths.md` says so in place rather than hiding it.

The entry's line numbers had rotted too, which is the defect describing itself: it wrote
`docs/design.md:579` for a pointer at 594 and `src/options.ts:357` for one at 530.
