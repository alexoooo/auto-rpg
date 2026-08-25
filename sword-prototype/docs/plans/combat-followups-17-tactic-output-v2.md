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
`supportedOptions` in `src/learning/meta.ts` adds `recover` **unconditionally** and adds
`cover` only when a hand is attached, and `handActionOption` carries a dedicated
handless `recover` branch (`src/options.ts:585-599`). That separation is not an accident:
`docs/measurements.md:1801-1803` records it as the fix that came out of the last exhaustive
look-ahead run -- *"its first full attempt exposed a hand-only recovery path in Centipede;
after capability-neutral recovery and hand-required cover were separated..."*.

Under this plan's rule a centipede, and any fighter that has lost both arms, has an **empty**
legal set, and `maskedArgmax` throws `"action has no supported tactic"`
(`src/learning/recurrent-network.ts:74`).
`a_learned_policy_can_repeat_one_completed_option_and_goes_inert_after_last_hand_loss` in
`tests/learning.test.mjs` pins the current behaviour. Named rather than anchored: the line range
here was already pointing two tests short of it before an import moved it again.

**`recover` stays legal with no hand at all.** It is the one action whose effector may be
absent; give it the `natural` effector or an explicit no-effector case, and keep `cover`
hand-required. Capability-neutral recovery is the invariant, not a special case.

### There are three divergent legality tables, and the training one is not the deployed one

The plan replaces `supportedOptions`. There are two more:

- `actionsFor`, then a `startsWith` chain in `scripts/train-lookahead.mjs`, omits `punch` for
  sword/axe/bow cells, so the look-ahead schedule trains 220 keys while the runtime asks for up
  to 250. **Closed by stage C1**: the bow row was the runtime's to fix and stage B fixed it; the
  sword and axe rows were the schedule's, and `LOADOUT_TACTICS` in `scripts/train-lookahead.mjs`
  now trains 240 keys per split;
- `neatLabeler` in `research-rollout-worker.mjs` is a third, hand-inlined copy that tests
  `hand.weapon === "sword"` for thrust instead of `hasPoint`, and an **exclusion list**
  `!["empty","bow","shield","buckler"].includes(hand.weapon)` for cut instead of `isStriking`.
  It reads `deployableActions` now (`scripts/research-rollout-worker.mjs:54-62`).

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

`exactLookaheadNodeBudget` is exactly `43P` for `P >= 6`, the beam saturates immediately at
`width=6`, and so there is no pruning relief -- the whole increase is linear in the tuple count.
The calibration check runs once per tuple per replan, now as `calibratedPlannedTactics` rather
than a throw.

**Superseded by stage C2c, which measured the stance out of the key.** The tactic-v2 column above
assumed all five fields would be enumerated. What landed enumerates four: **775** tasks a split,
**3,100** groups, **148,800** minimum solver steps and **3,440** nodes per replan on
`sword+empty` -- **3.23x**, not ~19x. The projection stays as the record of what the plan priced;
"Stage C2c, as landed" below and `docs/measurements.md` carry the measurement that declined the
other 6x.

There is a statistical cost riding on the compute one: `fitTacticalModel` fits **per cell**, so
20x the cells on a fixed budget is 20x fewer rows each, and `collectTacticalBudget` throws if
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
`lookahead_respects_the_exact_depth_width_and_node_budget` (74 nodes) -- plus `boundedLookahead`'s
own exact-budget throw. Named rather than anchored by line, because every one of these
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

  **Superseded 2026-08-25: `driving` no longer exists in `options.ts` and the anchor is struck
  rather than re-pointed.** `grep driving src/options.ts` returns nothing; the type split landed
  and the field went with it. `action-primitives.ts:140` was not moved by stage C2b and is left
  as it is.
- **`natural_bite_never_aliases_a_human_hand` cannot be satisfied in `options.ts` alone.** The
  centipede publishes `NO_HANDS = Object.freeze({})` (`src/bodies/centipede.ts:23,238`) yet is
  driven entirely through `input.primary.thrust` (`:254`) and `input.primary.guard` (`:263`).
  The alias is the creature's whole control surface. It also exists at `centipede.ts:36`
  (`BiteStrike.hand = "primary"`), `:334-335` (`crawlerMind`), and `options.ts:933`
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
  Both call sites (`options.ts:679`, `policies.ts:1272`) pass none. Worse, `arrowCrossing`
  (`:504-514`) and `approachToScratch` (`:254-262`) both assume the archer aimed over by
  exactly `actionArrowLift`, so changing the aimed target changes the **defender's** crossing
  prediction too.
- **`combatOption` has a live non-test consumer the plan does not list.**
  `forcedOptionEvaluationMind` (`src/learning/evaluation.ts:99-118`) calls it with *movement*
  names, which `handActionOption` refuses (`options.ts:533`), and string-matches the exact
  refusal prefix `option "<name>" requires ` at `:135`. Any new refusal wording breaks it.
  Two tests pin that message (`tests/learning.test.mjs:147,151`).
- **`handActionOption` is not purely a wrapper.** The bite skill (`options.ts:567-584`) and the
  handless-recover branch (`:270-282`) exist only there. Deleting `combatOption` is not a pure
  move for those two.
- **`combatOption` has a latent bug worth killing on the way past.** Its guard is `knownOption`
  over `TACTIC_NAMES` (12 names) while its error message prints `OPTION_NAMES` (8). Verified by
  construction: `combatOption("bite")` and `combatOption("hold")` both construct, and `bite`
  then silently no-ops because `decide` has no bite branch and `done` falls through to
  `age >= 0.18`.
- **PPO needs four new heads, not three.** It had no persistence output at all --
  `deployment.ts` hardcoded `persistence: 0.4`, and `RecurrentPolicyWeights` carried exactly
  `movement`, `action` and `value`. Three different persistence semantics exist today: NEAT
  decodes and rescales to `[0.10,0.80]`, DAgger predicts it, PPO invents `0.4`. Also `ppo.ts`
  divided reported entropy by a **hardcoded head count of 2**; adding heads without changing it
  inflates entropy silently and no test pins the divisor.

  **Superseded 2026-08-25, and the anchors are struck rather than re-pointed** -- the lines they
  named do not exist any more, so a number would be a fresh-looking pointer at nothing. Stage
  C2b gave PPO its five categorical heads (`RecurrentPolicyWeights` now extends
  `Record<RecurrentHeadName, DenseLayer>`, `recurrent-network.ts:31-38`) and fixed the divisor
  to `rows.length * PPO_POLICY_HEADS.length` (`ppo.ts:319`). **"No test pins the divisor" is now
  false in two ways**: `ppo_updates_policy_weights_value_head_and_reports_clipping_and_entropy`
  pins its value on a fixture whose five heads have deliberately unequal supports, and
  `the_reported_entropy_is_a_mean_over_rows_as_well_as_over_heads` pins the `rows.length` half
  separately. The fourth head -- persistence -- was deliberately **not** added: it is a
  continuous action with its own log-probability in the ratio, and `UNLEARNED_PERSISTENCE`
  (`meta.ts:28`) is the shared constant that stands in until somebody means it.
- **Nobody can write the DAgger labels.** The expert is `tacticalTeacher`
  (`src/learning/tactical-teacher.ts:295-340`), it returned only `{movement, action,
  persistence}`, and it never named a hand or an aim height. Teaching it to label
  effector/target/stance is unstated work, and bumping `TACTICAL_TEACHER_VERSION` (`:24`)
  invalidates every checked-in row -- correct, but say so.

  **Superseded 2026-08-25.** Stage C2b did that work: the teacher answers all six fields,
  `TACTICAL_TEACHER_VERSION` is 2, and `validateDaggerRow` refuses a stale row by a sentence
  naming both numbers. The remediation pass after it found the effector rule was still wrong for
  `cover` -- `tacticEffectors(view, action)[0]` is a hand-order preference, not a preference
  about hands -- and gave `cover` and `recover` a real one in `coveringEffector`. That rides on
  the same version bump, because the last teacher any run outside the working tree ever used is
  version 1.
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
  The model to copy is `tests/tournament-executor.test.mjs:106-135`, which already does exactly
  the requested thing for the *feature* header. Note `tests/artifact.test.mjs` does not exist.
- **`behaviourRecord` does not feed the tournament gates.** `MIN_ACTION_SHARE` and
  `MIN_DIVERSE_ACTIONS` read `actionCounts`, produced at `scripts/research-havok.mjs:29,33`
  keyed by `label.action` only. Effector/target/stance counting is two disjoint pieces of work,
  and the behaviour-record half runs through consumers this session deletes. Also
  `_engagement` and friends are defined **non-writable** (`options.ts:906`), so new
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
  `selectValidationChampion` lives at `quality-diversity.ts:93`. It also carries two more stale
  literals of exactly the kind session 16 found: `:74` and `:118` hardcode `trainerProtocol 3`
  and the `128x80x24 / 8 workers` protocol shape. **Delete it with its tests.**
- **A grep-and-delete trap.** `selectValidationChampion` exists twice with different signatures:
  `promotion.ts:90` (dying) and `quality-diversity.ts:93` (live, called by
  `train-neat-qd.mjs:87`). Likewise `ATTACK_OPTION_NAMES` (`options.ts:16`) is live and matches
  a naive `OPTION_NAMES` grep.
- **Deleting `networkMetaMind` kills the browser's learned HUD readout.** `src/main.ts:1021`
  gates on `mind.name === "learned-meta"`, set only at `meta.ts` (**superseded 2026-08-25: the
  anchor is struck, not re-pointed -- `networkMetaMind` is deleted and `grep learned-meta
  src/learning/meta.ts` returns nothing; the only surviving mention is the note at
  `src/main.ts:1018` recording why the gate went**), and `src/hud.ts:230-232`
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
  including `tests/death.test.mjs:315` `the_learned_policy_stops_on_the_bout_verdict`, the only
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
  `tests/learning.test.mjs` read this file and would have **hard-failed with ENOENT**, not merely
  lost coverage (**superseded 2026-08-25: the anchor is struck, not re-pointed -- that suite reads
  no file at all now, `grep readFile tests/learning.test.mjs` returns nothing, and the fixture is
  synthetic as the last sentence of this bullet asked for**); `promotion.ts:115` names that test in a comment. Its second half -- that the
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
  legal slot is between `options.ts:711` and the `boundIntent` return at `:741`.

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
3. **One schedule.** `LOADOUT_TACTICS` trains `punch` on `sword+empty` and `axe+empty`, which
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
  bouts on the null control. `calibratedPlannedTactics` in `src/learning/lookahead.ts` now filters
  the pair set to cells the model holds a calibration for and refuses by name only when nothing
  survives, which also stops an armless body throwing `lookahead has no supported tactic cells`
  mid-bout -- it goes inert there, as `researchLabelMind` already did. Tested on bodies with a
  hand taken off, and both halves watched fail first.
- **The schedule/mask test was described as what stops the two coming apart.** It cannot be: 48
  solver steps on intact bodies is what it runs, and that is all a per-loadout row can be checked
  against. Corrected on `LOADOUT_TACTICS` and in `docs/measurements.md`.
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

## Stage C2b, as landed -- 2026-08-25

**The four trainers produce and consume the 26-output contract.** 502 tests before, **521**
after the stage and **524** after the remediation pass of 2026-08-25; `npx tsc --noEmit` and
`npm run build` clean; the `duelist-swinger` null control identical
to the digit for the fifth stage running -- 66/120 = 55.0 %, 3.52 (1.42-8.98), damage 176.17, 10
severs, 1496/1670 scoring contacts. Everything below is in `docs/measurements.md` under
"Session 17 Stage C2b", with the label histogram, the bite table, the entropy pair and a
**25-row** mutation table -- M1 to M23 plus M3b and M4b, which is 25 rows and was called 24 in
both places it was counted. The remediation pass of 2026-08-25 adds seven more; that section
carries the running total.

1. **The teacher decides the whole tactic.** `tacticalTeacher` answers six fields. The effector
   is parsed out of the `hand:${hand}:${weapon}` opportunity row it already chose, or -- for
   `cover` and `recover`, which have no row -- taken from `tacticEffectors` by which hand holds
   the better guard. **That second half read "the first legal effector" and was a defect rather
   than a preference**, corrected on 2026-08-25: `tacticEffectors` returns hands in `HANDS`
   order whatever they hold, so every cover went to the primary on every body, and no schedule
   change could have moved one. `coveringEffector` ranks a shield or buckler before a sword,
   axe or club, before a bare hand, with `HANDS` order as the tie-break. The aim varies
   only where stage B measured it works: `cover` -> `threat`, `thrust` -> three branches,
   `cut`/`punch`/`shoot`/`bite`/`recover` -> `vital` with the measurement written beside each.
   The stance is `slip-left`/`slip-right` under threat by which side the threat is on, `compact`
   when crowded, `action-default` otherwise; `extended` is never emitted and the reason is on
   the function.
2. **`TACTICAL_TEACHER_VERSION` is compared and is 2.** It had three writers and no reader:
   `validateDaggerRow` checked it for being a non-negative integer beside the seed and the step
   counters, so a row from the three-field teacher was indistinguishable from one from the
   six-field teacher. It is refused by a sentence naming both numbers now. The 143 checked-in
   rows were read: `featureVersion` 3 against 4, `teacherVersion` 1 against 2, three-key labels.
3. **DAgger carries five heads.** `DaggerLabel` is six fields, `DaggerModel` is five
   `LinearHead`s, `trainDaggerModel` takes one label table per head and the teacher version, and
   `daggerClassificationMetrics` reports a macro-F1 for each. `classify` refuses a head whose
   matrix does not match its label list **by name** -- it used to score `NaN`, lose every `>` and
   fall through the reduce to `labels[0]`, which is `cover`. The stratum key stayed
   `unitCell\0movement\0action`, measured rather than argued: **47** strata across the 13-cell
   2400-step run, 1-3 distinct `(effector, target, stance)` triples inside one, mean 1.38. (The
   48 this said is the 9600-step, 418-decision run; the 2400-step run the sentence names has 47.
   The triple figures hold for both, and both were re-measured after the cover fix and did not
   move.)
4. **PPO has three new categorical heads and no persistence head.** Persistence is a continuous
   action and would be a different algorithm; the artifact records `producedOutputs` 25 against
   `contractOutputs` 26. The entropy divisor is derived from `PPO_POLICY_HEADS.length` -- it was
   the literal `2`, and on a real run it reported 3.05 where the largest mean per-head entropy a
   row can carry is **1.3969** -- `(ln5 + ln6 + ln2 + ln3 + ln6) / 5` over the reachable *masks*,
   which is what entropy accumulates over. (1.566 was the same sum over the five full tables and
   is the looser bound; the conclusion holds either way.) `PpoPolicyBoundary`'s value target is `valueTarget`, because
   `target` now names a head. `finiteLayer` checks each head against the runtime name table
   instead of against itself, which is what `tests/ppo.test.mjs`'s own six-row action head had
   been hiding behind since the file was written.
5. **The decoder seam moved as one piece.** `deployment.ts`'s NEAT branch and `neatLabeler` both
   take `selectDeployableTactic`, which grew its fourth field. Moving one alone was tried first
   and turns the parity test red. PPO uses `recurrentTactic` instead -- conditional masks in
   contract order, legal by construction -- on both the deployment side and the trajectory
   collector, with the picker as the only difference. NEAT-QD's genome width already tracked
   `META_OUTPUT_LAYOUT.width` and now has a test that decodes one. The QD descriptor did not move
   and the arithmetic is on `QualityDescriptor`.

Four things this stage found that the brief did not say:

- **The teacher cannot emit `thrust`, so the three-branch aim rule it asks for is unreachable
  from `tacticalTeacher`.** The action rule is
  `weapon === "bow" ? "shoot" : weapon === "empty" ? "punch" : "cut"`; a sword hand always
  answers `cut`. Making it reachable means turning every sword cut into a thrust, which is a
  change to what the teacher does rather than to where it aims, and was not taken. The rule is
  kept and exported so a test drives it directly, with the unreachability recorded on the
  function.
- **The teacher could label a tuple no body can execute, and the exhaustive sweep found it.** On
  `sword` in the primary and `bow` in the secondary, `attackOpportunity` publishes a viable sword
  row and `tacticEffectors("cut")` answers `[]` -- the bow welds the trailing hand -- so the old
  rule labelled `cut+primary` and `composeTactic` refused it one call later. No `RESEARCH_STRATA`
  row carries that loadout. 3,152 cells swept; one defect.
- **There is no second copy of the tuple legality rule at the seam, and that is deliberate.**
  `researchLabelMind` refuses an action outside `deployableActions` because that mask is stricter
  than the executor; it does not re-check the tuple, because `handActionOption` already refuses
  it through `unsupportedTactic` -- the same tables `deployableTactics` is built from -- and more
  usefully. That also keeps `"as-measured"` reachable, which is what leaves look-ahead's traces
  on the aim they were calibrated at.
- **The gate reached two lines in stage C2c's files.** `collectTacticalTrace` names
  `asMeasured(chooseEffector(view, action))` explicitly -- exactly the default that was removed,
  so no trace moved -- and `deployedResearchMind`'s decision hook narrowed to the three fields
  look-ahead supplies rather than widening `lookaheadMind`'s, because function parameters are
  contravariant. Neither changes a number.

Still Stage C2c's: `src/learning/lookahead.ts`, `src/learning/tactical-model.ts` and
`scripts/train-lookahead.mjs`'s schedule, which carry a measured ~19x compute cost -- **which
C2c then measured down to 3.23x by leaving the stance out of the key; see the section below.**
Still owed and not this stage's: **behaviour records counting effectors, targets and stances**,
which the C2a note listed beside the trainers and this stage's brief did not ask for.

## Stage C2c, as landed -- 2026-08-25

**The look-ahead cell key is `movement+action+effector+target`, and the stance is deliberately
not in it.** 524 tests before, **528** after; `npx tsc --noEmit` and `npm run build` clean; the
`duelist-swinger` null control identical to the digit for the sixth stage running -- 66/120 =
55.0 %, 3.52 (1.42-8.98), damage 176.17, 10 severs, 1496/1670 scoring contacts. Every figure
below, its harness, an 18-row mutation table and a per-test list of what each test does **not**
catch are in `docs/measurements.md` under "Session 17 Stage C2c".

**The ~19x this plan priced was measured and declined; the real cost is 3.23x.** The table above
projected 4,650--4,950 tasks a split. What landed is **775**, because the stance was measured out
of the key rather than enumerated into it:

| quantity | this plan's projection | landed |
| --- | ---: | ---: |
| schedule tasks per split | ~4,650--4,950 | **775** |
| groups (`3 x train + validation`) | ~18,600--19,800 | **3,100** |
| minimum solver steps | ~893,000--950,000 | **148,800** |
| nodes per replan, `sword+empty` | ~20,600 | **3,440** |
| ms per replan, `sword+empty` | not projected | **4.28** (26.35 with the stance) |

1. **The stance was measured, not assumed.** Nine `(cell, movement, action, effector, target)`
   tuples, six stances each, three seeds each, 4,800 solver steps a bout on real Havok bodies.
   At a **fixed** budget, six stance-keyed cells against one stance-free cell scored on the same
   held-out rows come to `signedReachError` 0.0081 against 0.0099, `contactBrier` 0.1387 against
   0.1390 and `vitalityDeltaError` 0.0241 against 0.0230 -- the last being stance-keying *worse*.
   Every gap is under 0.8 % of the 0.25 limit each column is refused at, and the whole stance
   effect on the vitality column is smaller than the cost of fitting from one seed instead of
   two. The harness has a control that must read zero and does: a centipede's six stances come
   back **byte-identical**, because `Centipede.update` never reads `input.posture`.
2. **The stance moves the fight and not these five columns**, which is a statement about
   `TACTICAL_STATE_COLUMNS`. Same runs: `hold+cover+primary+threat` dealt **182 damage over three
   bouts** under `slip-right` and 751 over three under `upright`, and `extended` survived the full
   4,800-step window where `action-default` was dead by roughly 1,500. **Both figures are sums of
   three bouts and this said "a bout"** -- corrected 2026-08-25; `.review/c2c/stance.mjs`
   accumulates across its three seeds before printing. Re-asked at six seeds the spread survives
   (4.6x on totals, 4.7x on medians, `slip-right` robustly worst) and the specific pair does not:
   the best stance is `upright` on three seeds, `action-default` on two and `compact` on one, and
   **one stance's own spread across seeds is larger than the spread between stances**
   (`action-default` 41.9 to 313.3, `slip-left` 2.6 to 214.3). Whoever gives the tactical model a
   column that can see a posture gets to ask this question again; the measurement is written down
   so it can be re-run rather than re-derived, and at more than three bouts a cell.
3. **The effector and the aim were asked the same question and answered differently**, which is
   what keeps them in the key. Six families, same harness: keying is worth 0.0025 / 0.0072 /
   -0.0011 -- **24x the stance's Brier gain**, and it is the Brier that matters, because every
   cell that fell out of calibration at every budget measured fell out on the Brier and none on
   the other two. `punch` on `empty+empty` carries it: 0.1665 keyed against 0.2013 pooled.
4. **A replan is affordable at 3.23x and not at 19x.** 4.2759 ms for `sword+empty` (80 cells,
   3,440 nodes) against 1.3244 at 25 cells **in the same bracketed run**, at roughly 750-825
   expanded nodes per millisecond across every count from 430 to 20,640 -- so `43 x cells / 800`
   is a usable ceiling for session 20, to about ten per cent. (This said "a flat 780-825" and
   quoted HEAD's 1.3031, which is from a separate process with no recorded harness output; the
   host's run-to-run drift on an identical variant is 6.4 %, so a cross-run comparison of two
   builds says nothing at that resolution.) A real 45-second bout replans **151** times, 3.36 a simulated second,
   which is 646 ms and 21.6 % of that bout's 2.99 s of wall clock. With the stance it would be
   3,979 ms -- more than the whole bout costs -- and a single 26.35 ms replan **exceeds a 16.7 ms
   frame on its own**, 3.36 times a second per fighter. Both are bench figures; the page has
   taken none.
5. **"How many cells survive calibration" was 100 % and meant nothing.** At the minimum budget
   every cell carries one row, a one-row cell fits itself exactly in all three columns, and the
   train and validation bouts are **bit-identical** for the first 0.2 s -- the split seeds differ
   but 48 solver steps is not long enough for two fighters to diverge. The shipped
   `session18-minimum` artifact reports 0/0/0 for all 220 of its keys, so
   `LOOKAHEAD_CALIBRATION_LIMITS` has never refused anything in a shipped run. Real survival:
   99.6 % at 3 rows a key, 98.6 % at 6, **85.0 % at 15**. The quality curve says the cliff is
   between 8 and 15 held-out rows, so the budget worth asking for is 60 rows a cell --
   **4,464,000 solver steps**, about 17 minutes in one process.
6. **The exact node budget is kept, enforced and now pinned on both sides of the beam
   saturation.** `[1, 2, 3, 5, 6, 7, 16, 80] -> [8, 74, 120, 210, 258, 301, 688, 3440]`; only
   from six up is it `43P`, and a test that checked only counts at or above six would have passed
   for `43P` as well.

Four things this stage found that the brief did not say:

- **The widening costs exactly one body state in twenty-eight, and it is a `bow+empty` that loses
  its bow hand.** Enumerated exhaustively -- seven loadouts, every combination of lost hands --
  twenty-six states keep every tuple the schedule trained. On that one, every trained cell names
  the primary (a bow welds the other hand), the free hand after the severance is the secondary,
  and `calibratedPlannedTactics` filters all six of the mask's tuples out, so `lookaheadMind`
  refuses by name. **HEAD "kept" 2 of 3 actions there by planning them on a hand the model had
  never seen** and letting `chooseEffector` execute them on the other arm -- the silent
  redirection tactic v2 exists to remove. Session 20 has to decide what a tournament entry does
  when that refusal fires; severance is routine, at 10 in 120 null-control bouts.
  **And the gain half, added 2026-08-25:** HEAD's redirection was not confined to the bow. On the
  minus-primary state it ran a primary-hand model against the secondary arm on **all six**
  humanoid loadouts -- `cover` and `recover` everywhere, plus `punch` on `empty+empty` -- and on
  **five of the six** C2c refuses the redirection *and* keeps a searchable capability, because
  the schedule spends budget on the secondary tuples of every loadout but the bow's. So the
  ledger is one state of twenty-eight losing its search against five of six loadouts stopping.
- **The trainer cannot spend a long budget as few long jobs.** At 480 solver steps a job the run
  dies with `lookahead schedule chose unsupported warrior/axe+empty tactic
  hold+punch+secondary+high`: the fighter loses its empty hand mid-window. **1 of 775 tasks on
  seed 310013, 0 of 775 on each of the other two fit seeds.** This said "the widening did not
  cause it -- HEAD's action-level guard throws at the same budget", and **that is false**,
  corrected 2026-08-25 by sweep: the dying cell's aim is `+high`, which the widening added, and
  the HEAD-equivalent replay at the measured shoulder line dies 0 of 5 movements on all three fit
  seeds. What is true is that the guard is no more *sensitive* -- on `axe+empty` the only empty
  hand is the secondary, so `punch` leaves the action mask and every `punch|...` leaves the tuple
  mask in the same instant. `collectTacticalBudget` already loops, so what session 20 needs
  is a per-job cap, not a new mechanism.
- **The capability signature had to widen with the key, and an action set cannot see a lost
  effector.** A `sword+shield` that loses its shield hand still offers `cover`, `cut`, `thrust`
  and `recover` to the name while four of its fourteen tuples have gone.
  `a_lost_effector_is_a_capability_change_even_when_every_action_survives` is the test; without
  the widening the plan stays committed until the skill finishes on its own.
- **`"as-measured"` has left the look-ahead path entirely.** Stage B kept every look-ahead trace
  on the measured shoulder line because a model keyed on `(movement, action)` could not honestly
  claim an aim; the schedule now enumerates the aim, so the trace is taken at the aim the planner
  will name. `asMeasured` keeps `scriptedMetaMind` and `randomMetaMind` as readers. The stage C2b
  note that called this "what keeps stage C2c's look-ahead unwidened" is superseded rather than
  wrong -- it was true for the stage it described.

Housekeeping this stage did, none of it changing a number: `UNLEARNED_PERSISTENCE` moved from
`deployment.ts` to `meta.ts` (importing it back into `lookahead.ts` would have been a cycle, which
is why the literal `0.4` was spelled twice) and `UNLEARNED_STANCE` joined it;
`DeployedDecisionLabel` widened from three fields to `DaggerLabel`'s six, which is the promise its
own note made; `TACTICAL_MODEL_VERSION` went 1 to 2 because the key grammar is part of that
contract; `tests/tournament-executor.test.mjs`'s lookahead fixture stopped spelling the model
version as a literal, and its dead `SeededRng` import went with the edit.

The remediation pass of 2026-08-25 then **deleted `DeployedDecisionLabel`**: once look-ahead had
widened it was `DaggerLabel` spelled twice with zero importers, so the assignment it existed to
guard could not fail and its contravariance argument was vacuous. The argument moved onto
`deployedResearchMind`'s own docstring. That pass also unified
`tacticalStateFromPublishedView` into `lookahead.ts`'s `tacticalStateFromView` -- two verbatim
copies of one rule, agreeing on 1,449 real published states, kept apart only by an import
obstacle this stage removed -- and fixed a real attribution defect in
`scripts/research-havok.mjs` that this stage made reachable. `docs/measurements.md` carries all
three.

Still owed and not this stage's: **behaviour records counting effectors, targets and stances**,
which the C2a note listed beside the trainers; and a **page** reading of the replan cost, which
only a person at a visible browser can take.

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
3. Change `combatOption`/`handActionOption` at `src/options.ts#L116-L307` to take an exact
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
  names. Do not extend the obsolete standalone checkpoint format. **Landed in C2a.**
- NEAT-QD and the old learned-meta network use all 26 ordered outputs. **Landed in C2b**; the
  learned-meta network was deleted in session 17 and does not exist to widen.
- DAgger rows add exact `effector`, `target` and `stance` labels; its model gains categorical
  heads and reports macro-F1/recall for all three. **Landed in C2b**, with the teacher version
  compared for the first time so the two label shapes can never mix.
- PPO gains effector, target and stance policy heads, sampling/log-probability/entropy terms
  and full recurrent gradients for all three. **Landed in C2b, five heads and not six**:
  persistence stays the shared 0.4 constant, because a learned persistence is a continuous
  action with a different log-probability in the ratio. The artifact records 25 of 26.
- Look-ahead enumerates only legal `(movement, action, effector, target, stance)` tuples and records
  the expanded exact cell count instead of retaining the old 220-cell assertion. **Still owed;
  it is stage C2c's and carries a measured ~19x compute cost.** C2b touched one line of
  `collectTacticalTrace` -- naming the tuple `researchLabelMind` used to default to -- and moved
  no trace.
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
  action names while using one arm, one aim and one pose is visible to the tournament. **Still
  owed after C2b.** It is worth more now than when it was written: the C2b histogram showed the
  *teacher* using one arm for every humanoid decision -- 84 % of them after the cover fix, all of
  them before it -- so a tournament reading only action names
  would not see the difference between a controller that has learned an effector head and one
  that has learned the loadout.

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
