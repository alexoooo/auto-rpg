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
`docs/measurements.md:1780-1782` records it as the fix that came out of the last exhaustive
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

- `actionsFor` (`scripts/train-lookahead.mjs:50-52`) omits `punch` for sword/axe/bow cells, so
  the look-ahead schedule trains 220 keys while the runtime asks for up to 250;
- `research-rollout-worker.mjs:18-21` is a third, hand-inlined copy that tests
  `hand.weapon === "sword"` for thrust instead of `hasPoint`, and an **exclusion list**
  `!["empty","bow","shield","buckler"].includes(hand.weapon)` for cut instead of `isStriking`.

That third copy is the one that decodes NEAT and DAgger rollouts **during training**, so a
network is currently trained under one legality mask and deployed under another. Unify all
three or this session leaves the disagreement one layer deeper than it found it.

### `supportedOptions` is not in `options.ts`, and the output layout has no owner

`supportedOptions` is `src/learning/meta.ts:18-28` with fourteen call sites across seven files.
Separately, the `[5 movement][7 action][1 persistence]` layout is re-derived independently in
**six** places -- `meta.ts:70,84,86-87,90-91,94`, `deployment.ts:66,71-73`,
`research-rollout-worker.mjs:23,25`, `train-neat-qd.mjs:39`, `checkpoint.ts:37,201`,
`tests/tournament-executor.test.mjs:32`. The one named table, `META_OUTPUT_NAMES`
(`meta.ts:14`), has **zero production readers**. `meta.ts:90-91` decides which half of the
vector to index from a hardcoded list of movement-name string literals.

Widening 13 to 26 without first collapsing these is six independent chances to get an offset
wrong. Collapse them to one exported table with named offsets before touching any width.

### Look-ahead costs twenty times more, and the plan prices it as bookkeeping

"Records the expanded exact cell count instead of retaining the old 220-cell assertion" is the
plan's whole treatment. Measured two ways independently -- the coordinator expanding the real
schedule, and a recon pass deriving legality per cell from `supportedOptions` and `hands.ts` --
the answers agree at 21x and 22.5x:

| quantity | today | tactic v2 | factor |
| --- | ---: | ---: | ---: |
| schedule tasks per split | 220 | ~4,650--4,950 | ~21--22x |
| groups (`3 x train + validation`) | 880 | ~18,600--19,800 | ~21--22x |
| minimum solver steps (`groups * 48`) | 42,240 | ~893,000--950,000 | ~21--22x |
| beam nodes per replan, worst cell | 1,075 | ~20,600 | ~19x |
| `TacticalModel.cells` calibrated keys | 220 | ~4,950 | ~22x |

`exactLookaheadNodeBudget` is exactly `43P` for `P >= 6` (`src/learning/lookahead.ts:36-42`),
the beam saturates immediately at `width=6`, and so there is no pruning relief -- the whole
increase is linear in the tuple count. `requireCalibration` runs once per tuple per replan
(`:109`).

There is a statistical cost riding on the compute one: `fitTacticalModel` fits **per cell**, so
22x the cells on a fixed budget is 22x fewer rows each, and `train-lookahead.mjs:70` throws if
any single cell collects none. Session 20 derives ceilings from these numbers and session 21
spends them. **Implement the full enumeration, measure the real cost, and record it in
`docs/measurements.md`** -- do not quietly narrow the enumeration to keep the number small. If
the measured ceiling is unaffordable, that is session 20's decision to make with a number in
hand, and the fallback worth naming for it is keying the tactical model on
`(movement, action, target)` while effector and stance ride along unmodelled.

No literal `220` exists anywhere in the tree. The assertions that actually break are
`tests/lookahead.test.mjs:37,41,46,61` and the exact-budget throw at `lookahead.ts:62-63`.
`tests/lookahead.test.mjs:46` runs a real Havok trace per centipede task, 10 today at 493 ms;
that becomes 90 tasks and roughly 4.4 s.

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

## Sequence: three commits, not one

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
  `featureVersion` is 2 against a v4 runtime, which is why `npm run ai:options` is **red today
  and was red before this plan set started**; the handoff's "all 12 frozen parity rows matched"
  line is wrong.
- **`engagement-baseline-v1.json`** (124 KB): the existing controllers already fail the
  predeclared gates -- specialists at opportunity-attack **0.2282** and meta at **0.2031**
  against a 0.65 gate. Session 18 cites 0.2282 as a live premise, so it must reach
  `docs/measurements.md` before the file goes. It is already at `measurements.md:1746`.
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

## Frozen vocabulary

In `src/options.ts#L8-L16`, add:

~~~typescript
export const TACTIC_VERSION = 2;
export const EFFECTOR_NAMES = Object.freeze(["primary", "secondary", "natural"] as const);
export const TARGET_NAMES = Object.freeze(["vital", "high", "low", "threat"] as const);
export const STANCE_NAMES = Object.freeze([
  "action-default", "upright", "compact", "extended", "slip-left", "slip-right",
] as const);
export interface TacticDecision {
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
3. Change `combatOption`/`handActionOption` at `src/options.ts#L115-L294` to take an exact
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
- Mirrors swap primary/secondary effectors only when the mirrored body definition actually
  swaps anatomical sides; they always swap `slip-left/right`. Pin this with asymmetric
  weapons rather than assuming names.
- Behaviour records count effectors, targets and stances so a controller that emits varied
  action names while using one arm, one aim and one pose is visible to the tournament.

## Tests and adversarial proof

Add exact tests across `tests/options.test.mjs`, `tests/minds.test.mjs`,
`tests/artifact.test.mjs`, `tests/dagger.test.mjs`, `tests/ppo.test.mjs`,
`tests/lookahead.test.mjs` and `tests/tournament-executor.test.mjs`:

- `a_dual_wielder_executes_the_effector_the_decision_named`;
- `an_illegal_action_effector_target_tuple_is_masked_not_repaired`;
- `a_requested_high_or_low_target_reaches_that_body_region_without_fallback`;
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
