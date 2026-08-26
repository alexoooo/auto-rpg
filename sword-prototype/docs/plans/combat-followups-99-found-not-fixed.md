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

### 1. All five tournament safety flags are hardcoded `true`

`scripts/tournament-executor.mjs:49-50` is the sole producer of the `safety` object and writes
`{finiteAnatomical: true, capabilities: true, postVerdict: true, stuckActions: true, lifecycle: true}`
unconditionally. The aggregate fold at `src/learning/tournament.ts:274-277` is a conjunction seeded
all-`true`, so it cannot answer anything else. The five `if (!safety.X) failures.push(...)` branches
in `assessTournamentCandidate` are therefore **dead in production**, reachable only from test
literals.

`docs/design.md:325` documents the five as a registration requirement -- *"and five safety flags --
finite/anatomical commands, capability masking, no post-verdict action, no stuck action, and
lifecycle"* -- with nothing behind them. No separate harness computes them and is merely unwired;
there is no producer at all.

**Why it matters more than a missing check.** A tournament report that says "capability failure:
none" when nothing examined capability is worse than one that stays silent, because a reader cannot
tell a passed check from an absent one. Sessions 23--25 promote a champion on this verdict.

**Why not fixed.** Computing five real safety properties is a session of work, not a fix: each needs
a definition, a place in the bout loop to observe it, and a test that watches it go false on a body
that genuinely fails. `scripts/measure.mjs:221,364-370` has an `onVerdict` / `postVerdictFrames`
mechanism that `tests/integration.test.mjs:98` already uses for a post-verdict lifecycle assertion,
so one of the five has a head start; the other four do not.

**Cost to close.** One session. Natural home is session 23, which already lists *"common cells,
mirrors, controls, safety evidence"* as a verification item
(`combat-followups-23-held-out-ai-tournament.md:51`) without wiring any computation.

### 2. `decisionsPerSecond` in the tournament report is systematically under-reported

**Closed 2026-08-25, and the entry had found the smaller of two defects.** See the Closed
section at the bottom.

`scripts/evaluate-ai.mjs:76` sums the per-decision counts across **all** raw rows, including the
three controls. The controls contribute exactly zero, because `mindFactoryForTournament` returns
`() => control` for them (`scripts/tournament-executor.mjs:35`) and discards the `onDecision`
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

`tacticTargets("bite")` offers only `vital` (`src/options.ts:398`), so the target head has one legal
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
and three fitness/novelty functions in `meta.ts`. `behaviourRecord` and its three writers in
`options.ts` are in the same state, kept explicitly because session 18's `BoutRecorder` is built on
them (`src/options.ts:1079-1089`).

**Why not fixed.** Deleting them is only correct if session 18 lands without them. The note beside
each already says "if that session lands without them, they go", which is the right trigger.

### 10. Roughly 114 code-span file references name a file that does not exist

Measured at `ab52947` over every `.ts`, `.mjs`, `.js` and `.md` file in the prototype outside
`node_modules`, `dist`, `.deps-stage`, `public` and the gitignored `.review`, resolving each
reference against the whole tree by path suffix: **1,520 code-span file references, 114 stale, 20 of
them in live source and durable docs.** Only 67 carry a line anchor at all, and none of those points
past the end of its file -- so the failure mode is not drifting line numbers, it is references to
scripts session 17 stage A deleted (`evaluate-options.mjs` 19 times, `promotion.ts` 15,
`checkpoint.ts` 13, `training-evaluator.mjs` 12, `promotion-evaluator.mjs` 11, `train-meta.mjs` 9).

**The design problem is not the count.** Most of the 114 are *correct*: `src/learning/evaluation.ts:5-7`
and `src/options.ts:1082-1084` name deleted scripts in order to say they were deleted, and a checker
that demands they resolve would force falsifying accurate history. A handful are genuinely wrong
live pointers -- `kinds.ts` at `src/mind.ts:10` and `src/weapon.ts:26`, `sword.ts` at
`src/main.ts:670` and `docs/design.md:579`, `DESIGN.md` at `src/options.ts:357`. Separating the two
is the work.

**What is already known about the fix.** `tools/check_docs.js` **does** walk
`sword-prototype/docs/**`, verified by probe. It catches a missing file and an out-of-range line;
it checks that a named symbol sits within four lines of the anchor **only when the link text is the
backticked symbol**; and it separately requires the anchor to point at the start of a declaration,
a comment block, or the file. Prose link text gets no symbol check. So the conversion that puts an
anchor under a real check is a Markdown link whose text is the backticked symbol and whose href is
the source path with an `#L` line fragment, aimed at a declaration. Written out here as prose rather
than as an example, because `tools/check_docs.js` reads examples too -- the first draft of this
paragraph spelled the recipe as a real link and the checker refused it for naming a missing file,
which is the most direct evidence available that the check is live on this directory.

That covers Markdown. It does nothing for the 602 code-span references inside source comments, which
cannot be Markdown links and would need a prototype-side test.

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

### 14. Two of the four algorithms have heads they cannot move, and nothing in the record says so

`lookaheadMind` hardcodes `UNLEARNED_STANCE` and has no stance head at all, so a look-ahead candidate
prints the exact signature of a collapsed head -- free on every decision, one option chosen, modal
share 1.0 -- by design. PPO's persistence is likewise the constant `0.4`, and `lookaheadMind` has no
persistence window at all: its re-decision condition carries no clock term, yet it reports
`UNLEARNED_PERSISTENCE` on every label.

Separately, **a centipede consumes no posture.** `src/bodies/centipede.ts` publishes crouch, trunk
lean and trunk twist as zero and never reads `input.posture`, so on the three centipede cells -- 6 of
26 tournament jobs -- the stance head reports a free choice on every decision while all six names are
behaviourally identical. `applyTacticStance`'s own note records that during any committing action
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

---

## Closed

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
