# Session 17 -- explicit effector and learned body stance

## Outcome

Replace the ambiguous action-v1 output with tactic v2. A learned controller chooses movement,
hand action, the exact effector that performs it, the body/threat region it targets, a bounded
whole-body stance and persistence. Low-level options continue to generate safe arm
trajectories; the network does not receive joint or solver authority.

This closes three fundamental gaps before compute: dual wielders can deliberately use either
hand, attacks can choose high/centre/low rather than replaying one fixed aim, and
crouch/lean/twist become learned tactical choices rather than fixed animation tied only to
the hand action.

## Corrections to this plan, verified against the code

Three reconnaissance passes and the coordinator checked every claim below against the tree.
Four of this plan's assumptions are wrong in ways that change the work, one of them would
re-introduce a defect a previous session already fixed, and one unpriced cost multiplies a
research direction by twenty.

### The legal-tuple table makes a handless body illegal, and that was a fixed bug

`cover`/`recover` are specified here as needing "either selected attached hand". Today
`supportedOptions` adds `recover` **unconditionally** (`src/learning/meta.ts:20`) and adds
`cover` only when a hand is attached (`:21`), and `handActionOption` carries a dedicated
handless `recover` branch (`src/options.ts:270-282`). That separation is not an accident:
`docs/measurements.md:1801-1803` records it as the fix that came out of the last exhaustive
look-ahead run -- *"its first full attempt exposed a hand-only recovery path in Centipede;
after capability-neutral recovery and hand-required cover were separated..."*.

Under this plan's rule a centipede, and any fighter that has lost both arms, has an **empty**
legal set, and `maskedArgmax` throws `"action has no supported tactic"`
(`src/learning/recurrent-network.ts:51`). `tests/learning.test.mjs:169-172` pins the current
behaviour for all three meta minds.

**`recover` stays legal with no hand at all.** It is the one action whose effector may be
absent; give it the `natural` effector or an explicit no-effector case, and keep `cover`
hand-required. Capability-neutral recovery is the invariant, not a special case.

### There are three divergent legality tables, and the training one is not the deployed one

The plan replaces `supportedOptions`. There are two more:

- `actionsFor`, then a `startsWith` chain in `scripts/train-lookahead.mjs`, omits `punch` for
  sword/axe/bow cells, so the look-ahead schedule trains 220 keys while the runtime asks for up
  to 250. **Closed by stage C1**: the bow row was the runtime's to fix and stage B fixed it; the
  sword and axe rows were the schedule's, and `LOADOUT_ACTIONS` (`scripts/train-lookahead.mjs:94-107`)
  now trains 240 keys per split;
- `neatLabeler` in `research-rollout-worker.mjs` is a third, hand-inlined copy that tests
  `hand.weapon === "sword"` for thrust instead of `hasPoint`, and an **exclusion list**
  `!["empty","bow","shield","buckler"].includes(hand.weapon)` for cut instead of `isStriking`.
  It reads `deployableActions` now (`scripts/research-rollout-worker.mjs:42-50`).

That third copy is the one that decodes NEAT and DAgger rollouts **during training**, so a
network is currently trained under one legality mask and deployed under another. Unify all
three or this session leaves the disagreement one layer deeper than it found it.

**Stage C1 unified it, and the two rewrites named above were not the defect.** Swept over all
49 ordered weapon pairs, `weapon === "sword"` and `hasPoint` agree for every kind in `GRIPS`,
and so do the exclusion list and `isStriking && !== "empty"`. Every one of the twelve
disagreeing pairs is a **two-handed** one, which neither rewrite knows about. There was a
fifth copy as well, inlined in `collectTacticalTrace`. `docs/measurements.md` has both tables.

**There were seven, and stage C1's review found the last two.** `train-ppo.mjs` held a sixth in
`loadLeagueArtifacts` and a seventh in `collectPpoTrajectory` -- the latter on bare
`supportedOptions`, which is the mask PPO's own trajectory collector learns under while
`deployment.ts` deploys under `deployableActions`. Both read `supportedActionIndices` now;
measured identical over 394 capability cells.

### `supportedOptions` is not in `options.ts`, and the output layout has no owner

`supportedOptions` is in `src/learning/meta.ts` with fourteen call sites across seven files.
Separately, the `[5 movement][7 action][1 persistence]` layout is re-derived independently in
**six** places -- `meta.ts` inside `networkMetaMind`, `deployment.ts`'s NEAT branch,
`neatLabeler` in `research-rollout-worker.mjs`, the genome seeding in `train-neat-qd.mjs`,
`checkpoint.ts`, and the artifact fixture in `tests/tournament-executor.test.mjs`. The one named
table, `META_OUTPUT_NAMES`, has **zero production readers**, and `networkMetaMind` decides which
half of the vector to index from a hardcoded list of movement-name string literals. (Line
anchors dropped 2026-08-25: stage A deleted two of these files outright and stage C1 rewrote the
rest, so every number here pointed somewhere else. `META_OUTPUT_LAYOUT` is the one table now.)

Widening 13 to 26 without first collapsing these is six independent chances to get an offset
wrong. Collapse them to one exported table with named offsets before touching any width.

**Stage C1 collapsed them onto `META_OUTPUT_LAYOUT`.** The count of *live* sites was five, not
six -- `meta.ts`'s own uses went with `networkMetaMind` in stage A and `checkpoint.ts` was
deleted there too. The one that mattered was neither a count nor a name: `deployment.ts` read
the action half as `values.slice(MOVEMENT_NAMES.length, -1)`, which means "everything except
the last number" and folds three new logit blocks into the action argmax the moment the
contract widens.

### Look-ahead costs twenty times more, and the plan prices it as bookkeeping

"Records the expanded exact cell count instead of retaining the old 220-cell assertion" is the
plan's whole treatment. Measured two ways independently -- the coordinator expanding the real
schedule, and a recon pass deriving legality per cell from `supportedOptions` and `hands.ts` --
the answers agree at 21x and 22.5x against the 220-task baseline they were taken on.

**Repriced 2026-08-25, because the baseline moved under it.** Stage C1 added the two `punch`
rows the runtime always offered, so today is 240 tasks a split, 960 groups and 46,080 minimum
steps. The tactic-v2 column does not move -- it was derived from legality per cell, which always
included those punches -- so the factors drop by about a tenth and the multiplier is nearer
twenty than twenty-two:

| quantity | today | tactic v2 | factor |
| --- | ---: | ---: | ---: |
| schedule tasks per split | **240** | ~4,650--4,950 | **~19--21x** |
| groups (`3 x train + validation`) | **960** | ~18,600--19,800 | **~19--21x** |
| minimum solver steps (`groups * 48`) | **46,080** | ~893,000--950,000 | **~19--21x** |
| beam nodes per replan, worst cell | 1,075 | ~20,600 | ~19x |
| `TacticalModel.cells` calibrated keys | **240** | ~4,950 | **~21x** |

The beam row is the one that did *not* move, and the reason is worth keeping: `lookaheadMind`
plans over the runtime mask rather than the schedule, and the runtime always offered five
actions on `sword+empty`, so its 25 pairs and 1,075 nodes were never a schedule figure.

`exactLookaheadNodeBudget` is exactly `43P` for `P >= 6` (`src/learning/lookahead.ts:67-73`),
the beam saturates immediately at `width=6`, and so there is no pruning relief -- the whole
increase is linear in the tuple count. The calibration check runs once per tuple per replan, now
as `calibratedTacticPairs` rather than a throw.

There is a statistical cost riding on the compute one: `fitTacticalModel` fits **per cell**, so
20x the cells on a fixed budget is 20x fewer rows each, and `train-lookahead.mjs:125` throws if
any single cell collects none. Session 20 derives ceilings from these numbers and session 21
spends them. **Implement the full enumeration, measure the real cost, and record it in
`docs/measurements.md`** -- do not quietly narrow the enumeration to keep the number small. If
the measured ceiling is unaffordable, that is session 20's decision to make with a number in
hand, and the fallback worth naming for it is keying the tactical model on
`(movement, action, target)` while effector and stance ride along unmodelled.

**A sparse cell table is no longer a dead run**, which changes what "unaffordable" means here.
`lookaheadMind` used to demand a calibrated cell for every pair it could name and throw
otherwise; it now searches the cells it has and refuses only when it has none for this body. So
session 20 can choose a budget that leaves cells unfitted and get a narrower search rather than
an aborted tournament -- and must say so deliberately, because the same filter makes an
under-spent budget silent.

No literal `220` exists anywhere in the tree. The assertions that actually break are in
`tests/lookahead.test.mjs` -- `the_training_schedule_covers_every_body_loadout_and_only_compatible_natural_attacks`
(thirteen cells, and the centipede's `MOVEMENT_NAMES.length * 2` tasks),
`every_scheduled_centipede_tactic_runs_a_complete_havok_trace_window` (ten tasks) and
`lookahead_respects_the_exact_depth_width_and_node_budget` (74 nodes) -- plus the exact-budget
throw at `lookahead.ts:93-94`. Named rather than anchored by line, because every one of these
anchors was already stale: this file's own +67 lines and stage C1's insertions moved them, and a
line number in a plan is a fact with no test.
`every_scheduled_centipede_tactic_runs_a_complete_havok_trace_window` runs a real Havok trace per
centipede task, 10 today at 292 ms; that becomes 90 tasks and roughly 2.6 s.

### Smaller corrections, each verified

- **`Controls.driving` does not exist.** `Controls.state` is annotated *as an* `Intent`
  (`src/input.ts:104`, rationale at `src/mind.ts:69,556-557`), so the mouse hand *is*
  `Intent.driving`. This is not a rename but a type split, and it breaks `humanMind`'s
  structural type plus the exact seven-key command assertions in six test files
  (`tests/options.test.mjs:81-83`, `integration.test.mjs:141`, `handover.test.mjs:283`,
  `arena.test.mjs:121`, `minds.test.mjs:312`, `ai-evaluation.test.mjs:53`).
  The rename is also **smaller than the plan implies**: `Fighter` never reads `driving` at all,
  and `splitMind` already ignores `theirs.driving` deliberately (`src/mind.ts:637-643`). Only
  two sites read it for combat execution -- `action-primitives.ts:140` and `options.ts:385` --
  and one genuinely carries both meanings, `mind.ts:879` in `handover`.
- **`natural_bite_never_aliases_a_human_hand` cannot be satisfied in `options.ts` alone.** The
  centipede publishes `NO_HANDS = Object.freeze({})` (`src/bodies/centipede.ts:23,238`) yet is
  driven entirely through `input.primary.thrust` (`:254`) and `input.primary.guard` (`:263`).
  The alias is the creature's whole control surface. It also exists at `centipede.ts:36`
  (`BiteStrike.hand = "primary"`), `:334-335` (`crawlerMind`), and `options.ts:461`
  (`recordIntentAttack`). `Intent` needs a natural channel and `actingHand: HandName | null`.
- **Body regions do not exist, but can be built from published facts.** `BodyView` publishes
  `vitalHeight` (torso centre, 1.28 m) and `crownHeight` (1.765 m) (`src/mind.ts:339-340`,
  filled at `fighter.ts:1602-1603` and `centipede.ts:224-225`), so `vital`/`high`/`low` are
  body-relative and survive unlike bodies without a magic constant.
  **But an honest `vital` is not behaviour-neutral.** Every scripted attack today aims at
  `opponent.shoulder.y` = 1.42 m, and at `shoulder.y + 0.20` = 1.62 m on entry
  (`options.ts:106,143`) -- both **above** the published vital. Mapping `vital -> vitalHeight`
  drops every scripted aim by 14 cm and moves every matchup. See "What must be measured".
- **Ballistic lift has no seam to compose with a target.** `actionArcherAim`
  (`action-primitives.ts:98-103`) computes its own `y` internally and takes no target argument.
  Both call sites (`options.ts:190`, `policies.ts:1272`) pass none. Worse, `arrowCrossing`
  (`:504-514`) and `approachToScratch` (`:254-262`) both assume the archer aimed over by
  exactly `actionArrowLift`, so changing the aimed target changes the **defender's** crossing
  prediction too.
- **`combatOption` has a live non-test consumer the plan does not list.**
  `forcedOptionEvaluationMind` (`src/learning/evaluation.ts:99-118`) calls it with *movement*
  names, which `handActionOption` refuses (`options.ts:258`), and string-matches the exact
  refusal prefix `option "<name>" requires ` at `:105`. Any new refusal wording breaks it.
  Two tests pin that message (`tests/learning.test.mjs:147,151`).
- **`handActionOption` is not purely a wrapper.** The bite skill (`options.ts:259-269`) and the
  handless-recover branch (`:270-282`) exist only there. Deleting `combatOption` is not a pure
  move for those two.
- **`combatOption` has a latent bug worth killing on the way past.** Its guard is `knownOption`
  over `TACTIC_NAMES` (12 names) while its error message prints `OPTION_NAMES` (8). Verified by
  construction: `combatOption("bite")` and `combatOption("hold")` both construct, and `bite`
  then silently no-ops because `decide` has no bite branch and `done` falls through to
  `age >= 0.18`.
- **PPO needs four new heads, not three.** It has no persistence output at all --
  `deployment.ts:61` hardcodes `persistence: 0.4`, and `RecurrentPolicyWeights` carries exactly
  `movement`, `action` and `value` (`recurrent-network.ts:10-19`, checked `:89-91`). Three
  different persistence semantics exist today: NEAT decodes and rescales to `[0.10,0.80]`,
  DAgger predicts it, PPO invents `0.4`. Also `ppo.ts:256` divides reported entropy by a
  **hardcoded head count of 2**; adding heads without changing it inflates entropy silently and
  no test pins the divisor.
- **Nobody can write the DAgger labels.** The expert is `tacticalTeacher`
  (`src/learning/tactical-teacher.ts:11-39`), it returns only `{movement, action, persistence}`,
  and it never names a hand or an aim height. Teaching it to label effector/target/stance is
  unstated work, and bumping `TACTICAL_TEACHER_VERSION` (`:5`) invalidates every checked-in row
  -- correct, but say so.
- **There is no output mirror to extend, and the plan contradicts a documented invariant.**
  `FEATURE_MIRROR_*` are input-side only and swap exactly one pair, `circle-left/right`.
  `features.ts:88-96` states outright that primary/secondary *"are not sides, and a mirrored
  fighter still leads with the same hand"*. No network is ever run on a mirrored fixture today.
  Building an effector mirror means overturning that decision in writing, not extending a table.
- **`ResearchArtifact` will not refuse a stale artifact just because the contract grew.**
  `fromBytes` spreads whatever it decoded with no unknown-key rejection
  (`src/learning/artifact.ts:109-112,124`), so the refusal must be an explicit check beside
  `:87`. The contract literal is also duplicated inline in **five** producers plus a test
  fixture, none of which import `RESEARCH_ARTIFACT_CONTRACT`.
  The model to copy is `tests/tournament-executor.test.mjs:83-112`, which already does exactly
  the requested thing for the *feature* header. Note `tests/artifact.test.mjs` does not exist.
- **`behaviourRecord` does not feed the tournament gates.** `MIN_ACTION_SHARE` and
  `MIN_DIVERSE_ACTIONS` read `actionCounts`, produced at `scripts/research-havok.mjs:29,33`
  keyed by `label.action` only. Effector/target/stance counting is two disjoint pieces of work,
  and the behaviour-record half runs through consumers this session deletes. Also
  `_engagement` and friends are defined **non-writable** (`options.ts:426-430`), so new
  counters cannot be assigned onto an existing record.

## Sequence: three commits, not one -- and stage C then split again

The plan puts the deletions last. Do them **first**, and split the rest in two. The reason is
not tidiness:

1. **Stage A -- delete the superseded stack.** Everything in "Delete superseded learning paths"
   below, plus the orphans it creates (next section). Doing this first means tactic v2 is never
   propagated into code that is about to die: `evaluate-options.mjs`, `training-evaluator.mjs`,
   `promotion-evaluator.mjs`, `train-meta*.mjs` and `checkpoint.ts` all consume the action
   vocabulary, and all of them are going. Ends green, commits alone.
2. **Stage B -- exact effector, target and stance in the execution layer**, with the 13-output
   contract left alone. `handActionOption` takes an exact effector and target; scripted
   policies name theirs; the natural channel lands; stance applies. **This is the stage that
   can move the balance, and isolating it is the point** -- it gets measured on its own,
   against a control, before any contract churn is mixed in. Ends green, commits alone.
3. **Stage C -- the 26-output contract.** Artifact, deployment, the four trainers, mirrors,
   behaviour records. No balance risk: no learned policy is deployed. Ends green, commits alone.

Stage B and Stage C cannot be merged into one commit and cannot be split further: a contract
bump with trainers still emitting 13 outputs is red, and an execution layer that takes an exact
effector while deployment still names none is dishonest.

**Corrected 2026-08-25: stage C did split, along a seam this text missed.** Everything the
widening *needs first* -- one output-layout table, one legality table, one look-ahead schedule
-- is behaviour-preserving or bug-fixing and can land while the contract is still 13 wide. That
is **stage C1**, below. The claim above is true only of the widening itself, which stays whole
as stage C2. The reason to split is the reason stage B was split from stage A: a contract bump
landing beside three unrelated corrections is a diff where nobody can say which change caused
what.

## Deletions that are not safe as specified

Each verified; each needs a decision, not a sweep.

- **`ai:evaluate` is built on `evaluate-options.mjs`.** `scripts/evaluate-ai.mjs:26` does
  `await import("./evaluate-options.mjs")` for every split except `test`. Deleting the module
  breaks `--split train|validation` and `--write-engagement-baseline` outright. Fold the corpus
  runner into `evaluate-ai.mjs` or state that `ai:evaluate` becomes test-split-only.
- **`promotion-evaluator.mjs` exports `intentNumbers` to a surviving test.**
  `tests/ai-evaluation.test.mjs:12` imports it; the import failure kills **all thirteen tests in
  that file**, twelve of which are about engagement, block debouncing, tournament assessment and
  novelty. `intentNumbers` is the only implementation of "every numeric leaf of an `Intent`"
  outside `INTENT_FIELDS`, and that test is the cross-check between the two -- it is what caught
  the `zoom` regression. Rehome it beside `INTENT_FIELDS` in `src/learning/evaluation.ts`.
- **`src/learning/promotion.ts` becomes orphaned and the plan never mentions it.** Its only
  non-test consumer is `promotion-evaluator.mjs`, and it is the last `OPTION_NAMES` consumer in
  `src/` (`:2,119,141-144`), so step 1 cannot complete without a verdict on it. Its concepts are
  already superseded -- `MAX_SPECIALIST_GAP` is redeclared at `tournament.ts:11` and a different
  `selectValidationChampion` lives at `quality-diversity.ts:52`. It also carries two more stale
  literals of exactly the kind session 16 found: `:74` and `:118` hardcode `trainerProtocol 3`
  and the `128x80x24 / 8 workers` protocol shape. **Delete it with its tests.**
- **A grep-and-delete trap.** `selectValidationChampion` exists twice with different signatures:
  `promotion.ts:90` (dying) and `quality-diversity.ts:52` (live, called by
  `train-neat-qd.mjs:87`). Likewise `ATTACK_OPTION_NAMES` (`options.ts:16`) is live and matches
  a naive `OPTION_NAMES` grep.
- **Deleting `networkMetaMind` kills the browser's learned HUD readout.** `src/main.ts:1021`
  gates on `mind.name === "learned-meta"`, set only at `meta.ts:107`, and `src/hud.ts:230-232`
  renders `MetaDiagnostic.topLogits` and `persistenceRemaining`. No research mind sets that name
  or exposes `diagnostic()`. Re-point the HUD at `researchLabelMind`, or the page loses its only
  window into what a learned controller is thinking -- in the session immediately before the one
  that puts a person at the keyboard.

  **Superseded 2026-08-24: there was nothing to kill.** This amendment was written on a recon
  pass's word and asserted a live readout that did not exist. The page builds minds only through
  `policyMind` and `splitMind`; the five `POLICIES` entries are `idle`, `swinger`, `duelist`,
  `archer` and `crawler`, and every one answers `typeof mind.diagnostic === "undefined"`.
  `learnedMetaMind` had no constructor in `src/`, only in two headless CLIs that this session
  deletes. The panel has never lit in the page. The name gate was wrong independently -- it was
  narrower than the `metaDiagnostic` null test behind it -- and deleting it is still the right
  change, for that reason and not this one. `researchLabelMind` gets a `diagnostic()` so the
  readout exists when something can reach it, which is session 19's page-side deployment path
  (overview finding 8).
- **`networkMetaMind` is also the vehicle for six tests of behaviour that still ships**,
  including `tests/death.test.mjs:303` `the_learned_policy_stops_on_the_bout_verdict`, the only
  test that the host revokes a learned mind's authority at the verdict edge. Move them onto a
  research mind; do not let them go.
- **`supportedOptions` and `randomMetaMind` must survive `meta.ts`'s demolition** -- both are on
  the live four-direction path.
- **Four `src/learning/evaluation.ts` exports go dark:** `PARITY_LIMITS`, `PARITY_CALIBRATION`
  (whose key `observedLegacyRepeatMax` is pinned by `tests/options.test.mjs:487`),
  `SYNTHETIC_FIELD_LIMITS`, `SHOT_PARITY_LIMITS`. Give each an owner or delete it.
- **`--write-engagement-baseline` survives its artifact.** `evaluate-ai.mjs:49-51` writes
  `engagement-baseline-v1.json`; deleting the file while keeping the flag leaves a switch that
  regenerates a deleted artifact.
- **`docs/design.md:106-145` and `README.md:130-141` become false.** Both say the checkpoint
  loader, option diagnostic and five-loadout evaluator "remain available for the next
  experiment". After this session none of the three exists.

### What `evaluate-options.mjs` knows that nothing else does

The plan says to move "unique current specialist/tactic assertions" into focused tests. These
are the ones with no other home, and the first four are the ones worth the hour:

1. **Real-solver twelve-row paired parity** at `PARITY_LIMITS {damage:0, seconds:0,
   actionRate:0}` with a legacy-repeat control proving the zero limits are achievable rather
   than vacuous (`:263-298,325-329`). Every surviving test is fixture-only.
2. **The unscored warm-up and fresh-Havok-per-bout discipline** (`:167-178`) -- the encoding of
   the session-11 finding that a shared Havok module flips winners after disposal
   (`docs/measurements.md:1441-1444`).
3. **The `--calibrate` discrete gate** (`:310`), the procedure that produced
   `PARITY_CALIBRATION`. `evaluation.ts` keeps the result, not the way to regenerate it.
4. **Synthetic shot parity** between `policyMind("archer")` and `scriptedMetaMind("archer")`
   (`:118-130,324`). `tests/options.test.mjs:246-249` runs only the meta archer and never
   compares.
5. Block-credit attribution -- a block report belongs to the striker's stream but describes the
   defender's action (`:212-228`); duplicated only in `training-evaluator.mjs`, also dying.
6. The corpus cells `duelist-club` and `idle-control`, which `RESEARCH_STRATA` does not cover.

### What the three fixtures must leave behind

- **`baseline-v1.json`** (308 KB): the scripted specialists and `scriptedMetaMind` are
  byte-identical fighters -- twelve paired rows matching winner, ending, damage, duration and
  every ordered intent field, on both mirror sides, with an exact legacy-repeat control. Its
  `featureVersion` is 2 against a v4 runtime, which is why `npm run ai:options` is **red at its
  default seed today and was red before this plan set started**.
  **Corrected 2026-08-24:** this bullet used to end "the handoff's 'all 12 frozen parity rows
  matched' line is wrong". It is not wrong, and that sentence made the same conflation as the
  overview's session-15 finding it was taken from. The evaluator compared against the baseline
  only when the base seeds matched, so the handoff's `--seed 20260824` skipped the comparison
  and exited 0 while the default 20260827 threw. Two invocations, two answers. Also, the
  handoff's words were "all 12 frozen **legacy/meta** parity rows matched".
- **`engagement-baseline-v1.json`** (124 KB): the existing controllers already fail the
  predeclared gates -- specialists at opportunity-attack **0.2282** and meta at **0.2031**
  against a 0.65 gate. Session 18 cites 0.2282 as a live premise, so it must reach
  `docs/measurements.md` before the file goes. It is already at `measurements.md:1768`.
- **`unpromoted-v1.json`** (5 KB): three default NEAT runs, champion by validation ordering,
  then **0.000** held-out win score against 0.4167 scripted; 88 % of decisions were
  `disengage`; seven named gate failures. Its `commands` block records
  `npm run ai:train` and `npm run ai:evaluate --checkpoint` as the reproduction method -- both
  of which this session deletes, so transcribe them with a note that they no longer exist or
  the negative result loses its method.
  `tests/learning.test.mjs:394` reads this file and will **hard-fail with ENOENT**, not merely
  lose coverage; `promotion.ts:115` names that test in a comment. Its second half -- that the
  ordering rule still reproduces the recorded champion at a version this build runs -- is real
  coverage and must survive as a synthetic fixture.
- **`train-meta.mjs` was already dead on arrival**, and that belongs in the durable record
  rather than vanishing: it writes `optionNames: OPTION_NAMES` (8 names) while
  `checkpoint.ts:37` requires `[...MOVEMENT_NAMES, ...HAND_ACTION_NAMES]` (12), so every
  checkpoint it produced was refused by its own codec. It also seeds genomes with 9 outputs
  where `networkMetaMind` requires 13.

## What must be measured

Session 16 shipped green at 474 tests with two severe defects, and its perception change moved
the duelist by 14 points with nobody measuring it. Stage B is a **motor** change, which is the
bigger lever. So:

- **Take `--only duelist-swinger --bouts 120` before and after Stage B**, the established
  control, with `shields vs archer` as the null. Record both endpoints in
  `docs/measurements.md` and in the overview's progress log, whichever way they move.
- **The scripted policies' target is chosen by that measurement, not for tidiness.** Naming
  `vital` moves every scripted aim down 14 cm from today's shoulder-height aim; naming `high`
  lands near today's entry aim of 1.62 m. Try both, report both, and say which was chosen and
  why. A number nobody measured is the exact failure this plan set was rewritten to prevent.
- **The high/low test asserts on the contacted limb, not on the intent.** `HitReport` carries
  `key` (`src/combat.ts:70-90`) and the limb keys are `head`, `torso`, `pelvis`,
  `upperArm`/`forearm`/`hand`, `offUpperArm`/`offForearm`/`offHand`, `thigh{L,R}`, `shin{L,R}`
  (`src/fighter.ts:967,978,998,1044,1062,1075`). An aim change that does not move the contact
  distribution is cosmetic, and only the report can tell the difference. Asserting on
  `intent.pointerY` would be session 16's mistake repeated: a green test measuring the
  reachable quantity instead of the one that matters.
- **Record the measured look-ahead cost** -- schedule length, minimum budget, nodes per replan
  -- in `docs/measurements.md`, so sessions 20 and 21 inherit a number rather than a surprise.
- **`extended` is a near-duplicate of the existing `commit` posture.** Plan: crouch 0.10, lean
  +0.30, twist 0.55 toward the acting hand. Existing `commit`
  (`src/action-primitives.ts:138-141`): crouch 0.12, lean 0.30, twist 0.68 x `outboard`. For any
  committing action `extended` is within a hair of `action-default`, so the six-name stance head
  offers five distinguishable choices during a commit. Session 23 decides whether these
  constants are useful; it should decide knowing this.
- **The adversarial step on `extended` as written proves the clamp, not the constant.**
  `boundIntent` clamps `trunkTwist` to +/-1 (`action-primitives.ts:574-587`), so pushing
  `extended` past one is caught by the clamp. The test must assert the **exact** posture value,
  and a stance applied *before* `applyActionPosture` is silently erased at `:128` -- the only
  legal slot is between `options.ts:217` and the `boundIntent` return at `:240`.

## Stage B, as landed -- 2026-08-25

474 tests before, **488** after; `npm run check` and `npm run build` clean. The null control
(`--only duelist-swinger --bouts 120`) is identical to the digit before and after, and the
`scriptedMetaMind` parity sweep stayed at zero changed fields. Both are in
`docs/measurements.md` under "Session 17 Stage B", with the contacted-limb table the target
rule was chosen on.

Five things this plan asked for that the code answered differently, each with its evidence:

- **The target question has no bout, so the scripted callers keep the line they were measured
  at.** "Try `vital` and `high`, report both, say which was chosen" assumes a matchup that goes
  through the option layer. There is none: `npm run measure`'s three matchups are built from
  `policyMind`, which never imports `options.ts`, and the only scripted option-layer consumer
  is `scriptedMetaMind`, whose sole gate is a zero-delta parity sweep against the specialists
  it replaces. Any named region moves it off parity by construction, so the "measurement" would
  have been a test failure rather than a win rate. The execution layer therefore carries a
  fifth aim, `"as-measured"`, deliberately outside `TARGET_NAMES` and unreachable from any
  learned output; moving the scripted policies onto a real region is a balance change owed a
  bout, which is session 18 or 23.
- **`Controls.driving` is a rename and not a type split, as the coordinator's correction said
  -- and the narrowing goes in the type, not in a second field.** `Controls.state` is declared
  `Intent & { actingHand: HandName }`, which is the whole of the host/policy difference: a
  cursor is always on a hand, a policy's jaws are not. `splitMind` refuses a command that names
  no acting hand by name rather than picking one.
- **The span fraction is an anatomical band, and the bout beside it does not choose a value.**
  The plan asked only that `high` and `low` be derived from `vitalHeight` and `crownHeight`.
  This entry said half the span "does not move the contact distribution at all", which the same
  harness contradicts: at 0.50 a `thrust` aimed `low` takes a 0.71 low share against the
  measured aim's 0.118. What fails at 0.50 is a contact-count floor, and the region test's
  verdict is non-monotonic across the constant. What chooses 0.75 is that `high` must land on a
  head capsule and `low` inside a pelvis, which is satisfied for 0.567-0.928 on both a warrior
  and a broot; 0.75 is the midpoint. Corrected table and sweep in `docs/measurements.md`; the
  constant is `TARGET_SPAN_FRACTION` and carries the argument in place.
- **The target rule holds for a point and not for a stroke, which this plan did not ask about
  and the landing note overstated.** Measured per action on the contacted limb: `thrust` obeys a
  named region, `shoot` does directionally on too small a sample, and `cut` and `punch` do not
  -- a cut aimed `high` takes a lower head share than the aim it replaces. A stroke's aim seeds
  the centre of an arc that sweeps wider than the gap between two named heights, and
  `aimHeight` adds the `+0.20` entry lift only to `"as-measured"`. Lifting the stroke envelope
  for a high-aimed cut is a balance change and is **owed a bout in session 23**.
- **The ballistic lift did have a seam, and the two defender-side functions never needed one.**
  `actionArcherAim` gained an `aimedY` whose default reproduces today's aim exactly, and the
  lift is added on top of it -- "the existing lift applied after target selection", literally.
  `arrowCrossing` and `approachToScratch` extrapolate the shaft's published facts under
  gravity and never read `actionArrowLift`, so a defender follows a re-aimed shot without being
  told; what is aim-dependent is the worked *example* in `approachToScratch`'s note, and that
  is recorded on `actionArcherAim` in place.
- **One advertised action was a lie and closing it moved a mask.** `punch` was offered on any
  body with an empty hand, including the trailing hand of a two-hander -- which `Fighter.update`
  sends to a grip point and otherwise ignores, so the punch was posed and discarded.
  `tacticEffectors` is now the single legality rule, `supportedOptions` asks it, and `punch`
  is no longer offered on a bow or club body. `actionsFor` in `scripts/train-lookahead.mjs`
  never offered it there either, so **the `bow+empty` row** of that table closed from the runtime
  side. This entry said the *table* closed; measured cell by cell it is one loadout of seven --
  `sword+empty` and `axe+empty` still offer a runtime `punch` the schedule never trains, on both
  humanoid units, exactly as this plan's own text says (`actionsFor` omits `punch` for sword, axe
  and bow). Four cells diverge now against six at `da025f2`. Closing the remaining two is Stage
  C's; `research-rollout-worker.mjs` still carries the third table. **Both closed in stage C1,
  below.** ("One row of thirteen" was two units of measure and is corrected throughout: there are
  seven loadouts and thirteen cells, so `bow+empty` is one loadout and two cells.)

Left for Stage C, deliberately: the 26-output contract, the four trainers, mirrors, behaviour
records, and `Striking.hand` -- the last surviving `"primary"` alias, which feeds
`CombatReportEvent.hand` and from there `BehaviourRecord.contacts`, a `Record<HandName, number>`
that Stage C widens. **And with them, one thing that is not new but is now
written down: `lookaheadMind` plans over the runtime mask and calls `requireCalibration` on
every pair, so on `warrior/sword+empty` and `warrior/axe+empty` it asks for a `close+punch` cell
the schedule never trained and throws.** Verified pre-existing on a worktree at `da025f2`, where
`bow+empty` throws as well; Stage B removed that third cell and left the other two. No shipped
artifact reaches it -- the only checked-in lookahead champion is feature v3 against a v4 runtime
and is refused at decode -- but a freshly trained v4 lookahead artifact run through
`scripts/tournament-executor.mjs` hits it on the first replan for those cells.
`deployableTactics` exists and is tested but has no production reader
until an argmax is taken over it, so look-ahead cell counts and the ~19-21x enumeration cost are
untouched and remain sessions 20 and 21's to measure.

**`TacticDecision` below is Stage C's shape and was not landed.** Stage B declared it and
nothing read it -- no production caller, no test -- for a whole session, which is four other
exports' worth of "a coming reader" all at once. It is deleted; `TacticExecution` (effector,
target, stance) is what `handActionOption` takes, and Stage C's decision is that plus a movement
name and a persistence. Declare it when something fills one in. `unsupportedTactic` and
`applyTacticStance` are module-private for the same reason: nothing outside `options.ts` called
either.

## Stage C1, as landed -- 2026-08-25

**The output contract is still 13 wide.** This is the preparation that makes widening it
legible: three jobs, all behaviour-preserving or bug-fixing, so that when the width does move a
reviewer can tell which change caused what. 488 tests before, **491** after; `npm run check`
and `npm run build` clean; the `duelist-swinger` null control identical to the digit.

1. **One output table.** `META_OUTPUT_LAYOUT` in `src/learning/meta.ts` names `movementAt`,
   `actionAt`, `persistenceAt` and `width`, and the five sites that re-derived them read it.
   The hazard was the `-1`, not the width -- `values.slice(MOVEMENT_NAMES.length, -1)` means
   "everything except the last number", which silently swallows the effector, target and stance
   heads into the action argmax the moment they exist. The persistence rescale was a third copy
   of the same contract and is now `decodeMetaPersistence`, whose `0.35` is deliberately not
   spelled `(MAX - MIN) / 2` because in doubles those are different numbers.
2. **One legality table.** `research-rollout-worker.mjs` asks `deployableActions`, and so does
   the fifth copy this pass found inlined in `collectTacticalTrace`. The two rewrites this plan
   named are per-kind equivalent today over all 49 ordered weapon pairs; every real
   disagreement is the two-handed holder rule, and inside `RESEARCH_STRATA` it is exactly one
   loadout of seven -- `punch` on `bow+empty`, which is two of the thirteen cells. That row was
   a **live abort**: the rollout mask labelled `punch`, `researchLabelMind` refused it by name
   one call later, and the bout died.
3. **One schedule.** `LOADOUT_ACTIONS` trains `punch` on `sword+empty` and `axe+empty`, which
   the runtime always offered and this schedule never did -- so `lookaheadMind` threw
   `tactic "close+punch" has no calibrated model` on the first replan for those two cells.
   240 tasks per split against 220, 960 groups against 880, 46,080 minimum solver steps against
   42,240. **Session 20's tuple expansion supersedes those by roughly twentyfold**; they are the
   current figures, not a ceiling.

Two things this stage found that the plan did not say:

- **`club` is the loadout this plan's own reasoning points at and no harness builds.** It is
  two-handed, it strikes, it has no point -- and no `RESEARCH_STRATA` row carries one, so its
  disagreements are synthetic. `docs/measurements.md` records them anyway, because a club
  loadout added later fails exactly as the bow does.
- **Stage B created the `bow+empty` abort rather than inheriting it.** Before `da025f2` the
  deployment mask offered `punch` on a bow too, so the two masks agreed on a lie and nothing
  threw. Narrowing one of two copies is how a redundant guard becomes a refusal.

### Stage C1, corrected on review -- 2026-08-25

Four things the numbered list above got wrong, each fixed in the same pass that found it. 491
tests before, **495** after.

- **It was not one legality rule; it was five of seven.** `train-ppo.mjs` held a sixth --
  `supportedOptions` plus the `cover` delete, character for character -- and a seventh in
  `collectPpoTrajectory` using **bare `supportedOptions` without the delete**, which is the mask
  PPO's trajectory collector trains under while `deployment.ts` deploys under
  `deployableActions`. Both read `supportedActionIndices` now. Identical in all 394 probed
  capability cells and the delete fires in none of them, measured; the reason to unify anyway is
  that a redundant guard present in one copy and absent from the other is how the first five
  drifted apart unseen. The commit message's "one legality rule" is in the log and cannot be
  changed, so it is corrected here and in `docs/measurements.md`.
- **The `close+punch` crash class was not closed, because it is not a schedule problem.** Adding
  the two rows fixed intact bodies. A schedule row keys on the loadout a body *started* with and
  the runtime mask keys on what is still attached, so severing the bow hand of a `bow+empty`
  drops the two-handed weld, frees the empty hand, and puts `punch` in a mask whose row says
  `cover, shoot, recover` -- and `lookaheadMind` threw again. Severance is routine: 10 in 120
  bouts on the null control. `calibratedTacticPairs` in `src/learning/lookahead.ts` now filters
  the pair set to cells the model holds a calibration for and refuses by name only when nothing
  survives, which also stops an armless body throwing `lookahead has no supported tactic pairs`
  mid-bout -- it goes inert there, as `researchLabelMind` already did. Tested on bodies with a
  hand taken off, and both halves watched fail first.
- **The schedule/mask test was described as what stops the two coming apart.** It cannot be: 48
  solver steps on intact bodies is what it runs, and that is all a per-loadout row can be checked
  against. Corrected on `LOADOUT_ACTIONS` and in `docs/measurements.md`.
- **"One row of thirteen" counted two things at once**, here and in four other places. Seven
  loadouts, thirteen cells.

Still Stage C's, unchanged: the 26-output contract, the four trainers, mirrors, behaviour
records, and `Striking.hand`.

## Stage C2a, as landed -- 2026-08-25

**The output contract is 26 wide.** The four research trainers are untouched and are C2b's; this
stage is the contract, the rule that makes the wider tuple legal by construction, and the
artifact header that refuses an artifact trained against the narrower one. 495 tests before,
**501** after the stage and **502** after the remediation pass below; `npx tsc --noEmit` and
`npm run build` clean; the `duelist-swinger` null control
identical to the digit for the fourth stage running -- 66/120 = 55.0 %, 3.52 (1.42-8.98), damage
176.17, 10 severs, 1496/1670 scoring contacts. Everything below is in `docs/measurements.md`
under "Session 17 Stage C2a".

1. **One table, six offsets.** `META_OUTPUT_LAYOUT` is `movementAt` 0, `actionAt` 5,
   `effectorAt` 12, `targetAt` 15, `stanceAt` 19, `persistenceAt` 25, `width` 26, accumulated
   from the five frozen tables rather than written out. `readMetaOutput` answers five logit
   blocks and a persistence; `META_OUTPUT_NAMES` names all 26 columns and they are distinct,
   which is checked because the finiteness refusal indexes into that table by column.
   `decodeMetaPersistence` did not move.
2. **Joint legal tuple selection.** `selectDeployableTactic` takes the largest
   `action + effector + target` logit sum over `deployableTactics(view)`, masked in front of the
   comparison and never repaired after it. Tie-break: lower action index, then effector, then
   target -- walked over the index spaces, because `deployableTactics`' own enumeration order is
   *not* that order (`tacticTargets("cover")` is `["threat", "vital"]`, indices 3 then 0).
3. **The artifact header refuses the output vocabulary.** `tacticVersion` plus the three new
   name tables, making five in the header, with the version comparison written out beside the
   `featureVersion` one -- `fromBytes` rejects no unknown key, so a thirteen-output artifact
   arrives with the field absent rather than wrong. Five inline producer copies now spread
   `RESEARCH_ARTIFACT_CONTRACT`; this line said "plus the test fixture" and **no test fixture was
   converted** -- `ai-contract.test.mjs` keeps a deliberately synthetic header and
   `tournament-executor.test.mjs`'s `staleContract` spells all seven fields out on purpose.
   Both version comparisons are `!==` and both interpolate the refused value through
   `JSON.stringify`, which the remediation pass added: `!=` accepted `"tacticVersion": "2"` as a
   string, and the bare interpolation reported it as `tactic version 2 does not match runtime 2`.

Four things this plan and the stage brief got wrong, each with the evidence:

- **"Prove the legal tuple set is non-empty for a fighter that has lost both hands" cannot be
  done, and this plan already says why.** `supportedOptions` (`src/learning/meta.ts`) refuses a
  body with no attached hand *and* no natural attack outright, so `deployableTactics` is empty
  for an armless *warrior* -- while `tacticEffectors(view, "recover")` still answers `natural`
  and `handActionOption` still enters it. The mask is the stricter of the two, which is the safe
  direction, and `src/options.ts`'s note on `tacticEffectors` plus
  `an_illegal_action_effector_target_tuple_is_masked_not_repaired` have recorded it since stage
  B. What *is* provable, and is proved whole, is the **centipede**: three legal tuples, and
  deleting the `recover` exception removes two of them.
- **The `values.slice(MOVEMENT_NAMES.length, -1)` hunt found nothing, because stage C1 had
  already closed it.** A sweep of every `slice(` in `src/`, `scripts/` and `tests/` -- plus
  `at(-1)`, `length - 1` and `slice(-` -- turns up no surviving end-relative read of an output
  vector. The only live hazard the widening had to fix was `readMetaOutput`'s own action slice,
  whose upper bound moved from `persistenceAt` to `effectorAt`.
- **"Do not touch `scripts/train-*.mjs`" and "unify every contract copy" are in conflict, and
  the second wins.** `trainPpo` writes a `ResearchArtifact` inside `tests/ppo.test.mjs`, so a
  producer keeping its own four-field header literal is a red gate rather than an untidy one.
  The edit in each of the four trainers is the literal replaced by the shared constant and
  nothing else; ~~the `config` digest objects in `collect-dagger.mjs` and `train-neat-qd.mjs`
  restate the same four fields and were left alone, because adding the output vocabulary there
  moves every default `runId`.~~ **Reversed 2026-08-25: that was a resume landmine and it is data
  loss.** With no output vocabulary in the digest the config text is byte-identical across the
  widening, so `--resume` reloads a 13-output population and dies inside a worker one bout later,
  and -- worse -- `configDigest` *is* the default `runId`, so a pre- and post-widening run with
  identical settings write to the same directory and overwrite each other's `state.json`,
  `champion.artifact` and `report.json`. Both objects now carry `TACTIC_VERSION` and the three
  new name tables. Default `runId`s move, which is the point; nothing checked in is affected,
  because all three runs in `asset-src/learning/research/` were named explicitly and are already
  refused at feature version 3 against runtime 4. `train-ppo.mjs` and `train-lookahead.mjs` are
  deliberately untouched: their digests carry no vocabulary of either kind, key no directory and
  gate no resume.
- **`selectDeployableTactic` has no production reader, and wiring one would be worse.** The
  obvious reader is `deployment.ts`'s NEAT branch -- and wiring it alone puts a joint tuple
  argmax on the deployment side of a seam whose training side, `neatLabeler`, still takes a bare
  action argmax. That is the divergence stage C1 spent its budget closing. Both halves move
  together in C2b. **The guard named there could not see it, and now can.** Corrected
  2026-08-25: `the_training_decoder_and_the_deployment_decoder_answer_the_same_label` wrote the
  three new logit blocks as zeros, which makes the joint sum degenerate to the action logit and
  the two decoders agree by construction -- wiring `selectDeployableTactic` into `deployment.ts`
  alone left all 501 tests green. The blocks now carry numbers the joint rule and the bare argmax
  disagree on, and the divergence is asserted in the test so the fixture's discriminating power
  is checked rather than assumed.

Still Stage C2b's, unchanged: the four trainers' *learning* halves, behaviour records, and
`Striking.hand`. Their `config` digests moved above, which is a correctness fix rather than the
start of that work.

## Frozen vocabulary

In `src/options.ts#L8-L16`, add:

~~~typescript
export const TACTIC_VERSION = 2;
export const EFFECTOR_NAMES = Object.freeze(["primary", "secondary", "natural"] as const);
export const TARGET_NAMES = Object.freeze(["vital", "high", "low", "threat"] as const);
export const STANCE_NAMES = Object.freeze([
  "action-default", "upright", "compact", "extended", "slip-left", "slip-right",
] as const);
export interface TacticDecision {  // NOT landed by Stage B -- see above
  movement: MovementName;
  action: HandActionName;
  effector: EffectorName;
  target: TargetName;
  stance: StanceName;
  persistence: number;
}
~~~

The output contract is exactly 26 values: 5 movement logits, 7 action logits, 3 effector
logits, 4 target logits, 6 stance logits and 1 persistence value. Pin the ordered names;
never infer offsets from object-key iteration.

## Joint capability selection

1. Replace `supportedOptions(view)` with a legal-decision surface that exposes movement,
   stance and **action/effector/target tuples**. Legal tuples are:

   - `cut`: an attached selected hand holding a non-empty striking weapon, aimed at
     `vital`, `high` or `low`;
   - `thrust`: an attached selected hand holding a pointed weapon, aimed at `vital`, `high`
     or `low`;
   - `punch`: an attached selected empty hand, aimed at `vital` or `high`;
   - `shoot`: the selected bow hand, aimed at `vital`, `high` or `low` with the existing
     ballistic lift applied after target selection;
   - `cover`/`recover`: either selected attached hand, aimed at `threat` or `vital`;
   - `bite`: `natural` only, with a published bite capability, aimed at `vital`.

2. Select the best legal action/effector/target tuple by the sum of its three logits, with
   frozen action-then-effector-then-target tie-breaking. Do not take independent argmaxes and
   repair an illegal tuple afterward.
3. Change `combatOption`/`handActionOption` at `src/options.ts#L116-L295` to take an exact
   effector and target. A learned request for primary/high must either execute on
   primary/high or be refused by name; it may not silently fall back to secondary or centre.
   Scripted policies may use separately named `chooseEffector` and `chooseTarget` helpers
   before constructing their exact option.
4. Rename the combat meaning of `Intent.driving` to `actingHand`. Keep the human mouse choice
   as host-owned `Controls.driving` and make `splitMind` translate it explicitly. Do not keep
   one field with two meanings. Natural actions carry `actingHand: null` or a dedicated
   discriminated action target; choose one representation and make illegal states
   unrepresentable rather than using `primary` as a bite placeholder.

## Bounded learned stance

Add `applyTacticStance` after the action skill establishes its safe base posture:

- `action-default`: exact current action posture;
- `upright`: zero crouch/lean/twist;
- `compact`: crouch 0.55, lean -0.20, neutral twist;
- `extended`: crouch 0.10, lean +0.30, twist 0.55 toward the selected hand;
- `slip-left` / `slip-right`: crouch 0.25, lean -0.10, twist -0.65 / +0.65.

All numbers are normalized `PostureIntent` values and remain bounded again by `boundIntent`.
Natural actions use body-relative left/right. Record these constants with their initial
rationale in `docs/design.md`; session 23's held-out result, not this implementation session,
decides whether they are useful.

## Update every research path

- Replace the `ResearchArtifact` contract with tactic version, effector, target and stance
  names. Do not extend the obsolete standalone checkpoint format.
- NEAT-QD and the old learned-meta network use all 26 ordered outputs.
- DAgger rows add exact `effector`, `target` and `stance` labels; its model gains categorical
  heads and reports macro-F1/recall for all three.
- PPO gains effector, target and stance policy heads, sampling/log-probability/entropy terms
  and full recurrent gradients for all three.
- Look-ahead enumerates only legal `(movement, action, effector, target, stance)` tuples and records
  the expanded exact cell count instead of retaining the old 220-cell assertion.
- ~~Mirrors swap primary/secondary effectors only when the mirrored body definition actually
  swaps anatomical sides; they always swap `slip-left/right`.~~ **Settled in stage C2a; the
  conclusion holds and the reason recorded for it was wrong. Superseded 2026-08-25.**

  A mirror does **not** swap effector or target -- that has not moved. What C2a wrote underneath
  it has: it said `HandView.outboard` is the only field naming which physical side a hand is on,
  and that **no feature column carries a side**. Both are false, and the second is contradicted
  by a table two declarations away from the note asserting it. `outboard` is *derived* from the
  arm's geometry (`src/arm.ts`), so `shoulder.x` and `tip.x` say it too -- which is why
  `mirrorBody` negates all four together, and why C2a's fixture, which flipped `outboard` alone,
  described a body that cannot exist. And two columns do carry a side: two worlds differing only
  in the x of the opponent's threatening hand give `threat_bearing` +0.25 / -0.25 and
  `threat_local_right` +0.25 / -0.25, both already marked -1 in `FEATURE_MIRROR_SIGN`. A hand
  column spelled `Math.sign(hand.shoulder.x)` left `no_feature_column_carries_which_side_a_hand_is_on`
  green, which is what a test named for a claim it cannot check looks like.

  The narrow statement that is true, can fail, and carries the decision: **no column
  distinguishes which physical side a given hand *slot* is on.** The hand columns are a weapon
  one-hot, `lost`, `reach` and `tip_speed`, all unsigned. So swapping `primary`/`secondary`
  under a mirror would invent a distinction the network cannot see, and `mirrorBody` keeping the
  slot keys while negating the geometry is what makes a mirrored sample a genuine left-handed
  copy of the same fighter. The side-carrying columns describe the *threat's* bearing rather
  than slot handedness, and `FEATURE_MIRROR_SIGN` already handles them.
  `no_hand_column_carries_which_physical_side_a_slot_is_on` is the replacement, and it goes red
  under exactly the mutation the old one survived.

  **"Pin this with asymmetric weapons rather than assuming names" is restored as still owed.**
  It was struck through resting on the false premise above, and the work it asks for is a mirror
  question: nothing mirrors an output *label* today, so effector behaviour under a mirror cannot
  be pinned until an output mirror exists. What C2b can pin now, and what the remediation pass
  started, is the effector head on a body whose two hands hold **different** weapons:
  `the_learned_tuple_is_the_best_legal_sum_of_action_effector_and_target_logits` runs its
  two-effector case on `sword+axe` -- `cut` legal in both hands, `thrust` in only one -- rather
  than on two identical swords, which is the fixture that cannot tell "the effector head decided"
  apart from "the loadout decided".

  `slip-left`/`slip-right` **are** sides and would swap under any mirror that
  ever carries stance; nothing mirrors an output label today, so the pair is recorded beside
  `circle-left`/`circle-right` on `FEATURE_MIRROR_INDEX` and no machinery was added.
- Behaviour records count effectors, targets and stances so a controller that emits varied
  action names while using one arm, one aim and one pose is visible to the tournament.

## Tests and adversarial proof

Add exact tests across `tests/options.test.mjs`, `tests/minds.test.mjs`,
`tests/artifact.test.mjs`, `tests/dagger.test.mjs`, `tests/ppo.test.mjs`,
`tests/lookahead.test.mjs` and `tests/tournament-executor.test.mjs`:

- `a_dual_wielder_executes_the_effector_the_decision_named`;
- `an_illegal_action_effector_target_tuple_is_masked_not_repaired`;
- `a_thrust_at_a_named_high_or_low_target_reaches_that_body_region`;
- `a_lost_selected_hand_forces_a_new_decision_before_execution`;
- `natural_bite_never_aliases_a_human_hand`;
- `each_stance_reaches_its_exact_bounded_posture`;
- `tactic_v2_mirror_swaps_asymmetric_effectors_and_slip_direction`;
- `every_algorithm_round_trips_the_same_26_output_contract`;
- `a_synthetic_stale_action_header_is_refused_before_solver_work`.

Force independent action/effector/target argmax in the test fixture and watch the
illegal-tuple test fail. Force every target through the old shoulder aim and watch the
high/low test fail. Make `extended` exceed one and watch the exact-posture test fail rather
than merely checking finiteness.

## Accept

- Diagnostics and artifacts name the complete six-part decision.
- A two-sword learned controller can choose either sword; a shield/sword controller cannot
  have its requested sword action silently executed by the shield hand.
- Learned stance changes are visible in behaviour records and remain inside the same physical
  posture envelope available to a person.
- No v3, action-v1 or standalone learned-checkpoint implementation remains. Synthetic stale
  headers fail before solver step one.
- `npm test`, `npm run check` and `npm run build` pass.

## Delete superseded learning paths

Do this in the same session; tactic v2 must not sit beside a second action vocabulary or
trainer:

1. Delete `OPTION_NAMES`, its “compatibility vocabulary” comment and every consumer. Use
   `MOVEMENT_NAMES`, `HAND_ACTION_NAMES` or the complete tactic-v2 tables according to the
   question being asked.
2. Move the actual arm-skill implementation into one canonical `handActionOption`. Delete the
   old `combatOption` plus the wrapper variables named `legacy`; do not implement tactic v2
   by wrapping action v1.
3. Delete `src/learning/checkpoint.ts`, `scripts/train-meta.mjs`,
   `scripts/train-meta-worker.mjs`, `scripts/training-evaluator.mjs` and
   `scripts/promotion-evaluator.mjs`. Remove `ai:train` from `package.json`, the checkpoint
   branch from `evaluate-options.mjs`, learned-checkpoint reporting from `measure.mjs`, and
   `learnedMetaMind`/old `networkMetaMind` when their only remaining callers are deleted.
   NEAT-QD continues through the current `ResearchArtifact` deployment path only.
4. Delete `scripts/evaluate-options.mjs` and the `ai:options` package command after moving any
   unique current specialist/tactic assertions into focused tests or session 18's preflight.
   Do not keep parity with a superseded executor as a product gate.
5. Fold the durable conclusions from `baseline-v1.json`, `engagement-baseline-v1.json` and
   `unpromoted-v1.json` into `docs/measurements.md`, then delete those files and their exact
   fixture tests. Preserve current specialist policies (`swinger`, `duelist`, `archer`) as
   opponents; rename evaluator/report labels from `legacy` to `specialist`.

The acceptance audit is semantic, not a blind ban on words: browser “compatibility mouse
events” and NEAT `compatibilityDistance` are current concepts. Every other surviving
`legacy`, `OPTION_NAMES`, `learned-v1`, `baseline-v1` or old-checkpoint match needs an explicit
current owner or deletion.
