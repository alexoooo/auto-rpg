# Fight 05 -- `CombatModel::Articulated` is deleted

**Status:** ready once session 04 has landed and **not before**. Blocks 06 and 07.

Embodied session 10 deleted `CombatModel::Legacy` and moved no pin. This is the same
subtraction against the other one, and it is larger: the articulated seam is reached by
39 files, and about 10,100 lines of it are `crates/lab` research harness alone.

**The precondition is session 04, and it is not a formality.** The retired `embodied-10`
plan listed `articulated_tactics.rs` for deletion "once `embodied_script.rs` covers what
they were driving", never checked the condition, and would have deleted the only code in
this repository that aims. Sessions 02 through 04 are what make the condition true. If
they recorded `revise`, this session does not run.

## Scope this plan understated, surveyed before it opened

Measured on 2026-08-18 by a read-only survey and re-verified against source, because a
deletion that discovers its own scope halfway through is a deletion that gets abandoned
halfway through. Six items, none of which the prose below anticipated.

- **`Scenario::duel_from` is itself an articulated constructor.** `crates/sim/src/combat/arena.rs`
  hard-writes `combat_model: CombatModel::Articulated` into `configured-duel-v1`, and about
  eighty call sites in fourteen files depend on it -- including the `#/arena` install path
  and `crates/sim/src/world/testkit.rs`. This plan names it only as the thing the three lab
  harnesses drive. It is the single largest unscoped item and it has to be reseated or twinned
  before anything else compiles.
- **`Scenario::embodied_duel` is built *from* `Scenario::articulated_duel`**, in
  `crates/sim/src/scenario.rs`: it clones it and overwrites the name and the model word.
  `embodied_slope`, `knolls` and `ledge` chain off `embodied_duel` in turn. Inline it, and
  **prove `0x1a1e8e74eecd55d5` is byte-unchanged before touching anything else** -- that
  fingerprint is folded into `EMBODIED_CORPUS_DIGEST`, and that function's own doc comment
  already records an earlier plan getting this exact fingerprint wrong.
- **`CombatModel` has eight predicates, not six.** `has_swing_plane` and `has_jointed_arms`
  are missing from the list above.
- **There is a second `identity_word` write site**, in `crates/sim/src/codec.rs`, on the
  decode side. It must agree with `Scenario::fingerprint` byte for byte, and the scenario
  file's own comment records that the two diverged once already.
- **`crates/learn` and `crates/lab/src/learn_probe.rs` are articulated end to end**, not
  just `LearnedArticulatedPolicy`. `crates/learn/src/probe.rs` builds `articulated_duel` and
  `mirrored_articulated_duel` fixtures, scores against three articulated *script* baselines,
  and drives `policy::run_articulated`. `lab learn-probe train|evaluate` and four `crates/learn`
  integration tests go with them. An adapter on the learned policy fixes none of that, and
  this plan owes the decision.
- **`crates/policy/src/runner.rs` has no embodied twin.** `run_articulated` is the only run
  loop in the file; `RunConfig` and `RunResult` survive because `crates/web` uses them.

Two smaller corrections to numbers quoted above: `strong_strike.rs` is 6,460 lines rather
than 6,453, and `ArticulatedPolicyKind::ALL` has seven entries rather than six -- which
matters because `client/src/arena/picker.ts` refuses an out-of-range code with the sentence
*"not one of the six articulated policy codes"* and a client test asserts that wording.
The realistic `crates/lab` reduction is about 13,700 lines of 15,881, which is closer to
six sevenths than to the two thirds claimed below.

## What goes

### The model itself

`CombatModel` collapses to nothing. With one body model left, the eight predicates --
`has_articulated_columns`, `uses_contact_solver`, `identity_word`, `has_stance`,
`has_swing_plane`, `has_jointed_arms`, `command_frame`, `command_grammar` -- are eight
matches that can only answer one way, and
`CommandGrammar` and `CommandFrame` go with them. **This is the payoff of the whole
topic**: those enums were built exhaustive so a new model would be a compile error at
every decision point, and with one model that machinery is pure weight.

`Scenario::fingerprint` keeps writing its identity word. The word is frozen, not
computed: an embodied scenario writes `3` and must keep writing `3`, or every fixture
fingerprint moves and four registry rows with them. Delete the enum, keep the constant,
and say at the write site that the number is a wire value rather than a discriminant.

### The policies

- `crates/policy/src/articulated_script.rs` (2,058 lines) and
  `articulated_tactics.rs` (2,403 -- it was 1,803 when this line was written, and
  sessions 03 and 04 added the footwork parameterisation and its bounding tests).
- The `ArticulatedPolicy` trait, `ArticulatedPolicyKind`, and the seven-entry registry.
- `neutral_articulated_command` and `crates/policy/src/runner.rs`'s articulated path.

**`StrikePlanner` moves rather than dies.** Session 02 deliberately left it in
`articulated_tactics.rs` and wrapped it, so that the port was additive and the arena's
existing fight did not change. Now the wrapper is the only caller: move the planner and
its helpers into `crates/policy/src/embodied_tactics.rs`, delete the world-frame command
builders that have no caller left, and keep the file's header argument about why a
frame-free planner may be shared when a bearing-writing script may not.

**`ArmRoles` is in the file being deleted and `embodied_script.rs` uses it.** It is
re-exported from `lib.rs` today, which hides the dependency. Move it into
`crates/policy/src/lib.rs` beside the traits, where it belongs: it answers which hand
holds the weapon, which is a fact about a body rather than about a script.

### The lab harnesses, and this is the expensive decision

```text
crates/lab/src/strong_strike.rs        6,453 lines
crates/lab/src/tactical_mechanics.rs   2,591
crates/lab/src/strike_corpus.rs        1,024
```

All three drive `Scenario::duel_from` and submit through `submit_articulated_v1`. **They
do not fail loudly when the model goes** -- `submit_articulated_v1` refuses a world whose
grammar is not articulated, the harness counts a refusal, and the command exits 0 having
measured nothing. A worktree experiment during embodied session 10 produced exactly that:
495,000 refusals, zero contact ticks against a baseline of 1,799, and a clean exit. **A
harness that exits 0 while measuring nothing is worse than one that is deleted**, so
neither leaving them nor half-porting them is available.

The recommendation is **delete all three**, on these grounds: the smart-ai topic that
owns them is paused with no active production mechanics session, their durable
conclusions are already in `docs/performance/smart-ai-*.md`, and they measure a policy and
a fixture that will not exist. Deleting them takes `crates/lab` down by roughly two
thirds.

Four documents name them as canonical sources and **must be repaired in the same commit**,
or `check_docs.js` fails and, worse, a reader is sent to a file that is not there:

| document | current canonical source |
|---|---|
| `docs/performance/smart-ai-actuator-calibration.md` | `strike_corpus.rs` |
| `docs/performance/smart-ai-contact-energy.md` | `strike_corpus.rs` |
| `docs/performance/smart-ai-matched-tactical.md` | `tactical_mechanics.rs` and `strong_strike.rs` |
| `docs/performance/smart-ai-tactical-policy.md` | `articulated_tactics.rs` |

Each becomes `**Canonical source:** this record`, with a sentence naming the harness that
produced it, the commit it was last run at, and the fact that it is not re-runnable on
this tree. A measurement whose apparatus is gone is history, and history that says so is
worth more than a broken link.

### The two exact-law pins, which are the hazard

`crates/sim/src/exact_diagnostics.rs` builds `Scenario::duel_from(&config)` and submits
articulated commands, and it is where `EXACT_TRAJECTORY_STATE_DIGEST` and
`LIFTED_COULOMB_SOLVER_DIGEST` come from. Both are **paired between Rust and
`tools/wasm_check.js`**, so they are target-agreement guards and not fixture goldens.

**Port the fixture; do not delete the guards.** The exact laws live inside the contact
solver, which the embodied model uses unchanged, so the property they protect survives the
model that happened to exercise it. Rebuild the diagnostic on an embodied fixture, submit
through `submit_embodied_v1`, and **re-record both digests in all three of their
registered copies** -- `crates/web/src/lib.rs`, `tools/wasm_check.js`, and the golden
registry row.

This is the one place in the topic where a pin moves for a reason that is not a bug, so
state it in the commit message in the registry's own terms: *the digest's fixture was
ported from a deleted model; the grammar, the bounds and the named classes are unchanged.*
If either digest moves **differently on native and on wasm**, that is a portability
failure and not a re-record, and the session stops.

### The browser

`#/arena` is the articulated consumer. It writes a configuration, runs a Worker of its
own, and drives `TacticalArticulatedPolicy::controlled_robust_strike`. It moves to
`EmbodiedPolicyKind`, and the fighter it opens on is the one sessions 02 through 04 built.
Nineteen exports were removed from `crates/web` when Legacy went; expect a similar count
here, and expect `client/src/runtime/arena-config.ts` and `client/src/arena/picker.ts` to
follow. **Run the client suites.** They caught a real regression the last time a model was
deleted and they were omitted from the verification pass that shipped it.

### The learned policy

`learn_core::LearnedArticulatedPolicy` implements `ArticulatedPolicy`. It gets the same
adapter session 02 wrote for the planner -- an `EmbodiedPolicy` wrapper that converts the
command into the torso frame -- and **not** a retirement. The reason is that
`LEARNED_INFERENCE_DIGEST` is a target-agreement pin over `ModelShape`, the feature
layout, the action layout and the forward pass; none of those is a combat model, so the
digest must **not** move here. If it does, the reseat touched the forward pass and is
wrong.

`write_features` and `write_features_v2` take `&ArticulatedObservation` and build their own
41 and 59 columns from named fields. They are untouched by this session. The trained
checkpoint is a separate question and the answer is *keep it*: it decodes the same shape.

### The rest

- `Scenario::articulated_duel` and the `articulated-duel-v1` fingerprint. The pin is
  **deleted rather than moved**, and joins the retired table in
  [the golden registry](../reference/hashes.md#golden-registry) with its last value and a
  note that it is not re-derivable under the surviving model.
- `SubmittedCommand::Articulated`, `submit_articulated_v1`, `SubmitArticulatedOutcome`,
  and the codec branch that reads them.
- Whatever `cargo build --release` reports as newly dead once the above is out. Session 01
  brought the tree to zero warnings; this session leaves it there.

## Hash expectations

**This table predicted a no-move for two pins whose fixtures this session deletes, and
the prediction was wrong.** Corrected in place on 2026-08-18 by a survey run before the
session opened, because the registry's own re-record rule asks a session to predict its
moves *in writing first* -- and a prediction that is discovered to be wrong halfway
through a twelve-thousand-line deletion is not a prediction, it is a surprise. The two
rows are marked below. The correction is worth more than the original table was: it is
the third time in this repository that a plan has named `ARTICULATED_COMMAND_HASH` as a
payload pin and been caught by the state-digest fold, and the first time it has been
caught before the edit rather than after.

| pin | expectation |
|---|---|
| `EMBODIED_CORPUS_DIGEST` | **must not move.** A deletion that reaches it has reached the embodied model. Revert; do not re-record. |
| `EMBODIED_GOLDEN_DIGEST` | must not move, same argument |
| the four embodied fingerprints | must not move |
| `CONTACT_BEHAVIOR_DIGEST` | must not move; it is a payload width and a behavioural corpus, not a model choice |
| `ARTICULATED_STREAM_DIGEST` | **moves, and this row used to say it must not.** Its fixture is `stream_digest_scenario` in [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs), which is `Scenario::articulated_duel` renamed and respawned. Reseat it to `Embodied` and `has_jointed_arms` turns true, so a body presents seven swept volumes instead of five, `REGIONS_PER_BODY` goes 5 -> 7 and the region section of all twenty ticks is rewritten in place. That is a **layout** move by the registry row's own three-way vocabulary, not an extension and not a values move, and `REGION_LAYOUT_VERSION` is the field that says so. Predict both values, native first, in both feature configurations, before touching a wasm mirror |
| `ARTICULATED_COMMAND_HASH` | **moves.** This row used to be grouped with the one above and the grouping was wrong twice over. It is `world.state_digest().value` of an unstepped fixture, so it folds `legacy_core_hash` like every state-digest pin; session 01 moved it. It moves *here* for a second and independent reason the row did not have: its fixture is `init_articulated_test`, which is also `Scenario::articulated_duel`, so the deletion reaches it through the fixture as well as through the stream |
| `COMBAT_GEOMETRY_HASH` | must not move |
| `LEARNED_INFERENCE_DIGEST` | must not move; a move means the reseat touched the forward pass. **And it is reachable from the files being deleted, which the plan did not say.** `crates/learn-core/src/model.rs` imports `CYCLE_TICKS`, `EIGHTH_TURN`, `TACTICAL_INTENT_COUNT`, `StrikePlanner`, `TacticalContextV1` and `TacticalIntentV1` from `policy` in **non-test** code, and builds a feature column as `(obs.tick % CYCLE_TICKS) * 65_536 / CYCLE_TICKS`. Those constants and that intent ordering are inside the digest's owned set and must survive byte-identically |
| `articulated-duel-v1` fingerprint | **deleted**, with its fixture |
| `EXACT_TRAJECTORY_STATE_DIGEST` | **moves**, fixture ported, re-recorded in three copies |
| `LIFTED_COULOMB_SOLVER_DIGEST` | **moves**, same |

The first row is the session's own check and is the same one embodied session 10 passed:
if the embodied corpus digest agrees to the byte after twelve thousand lines come out,
the cut was in the right place.

## Verification

```powershell
cargo test
cargo test -p sim --features cartesian-recoil
cargo test -p lab --features cartesian-recoil
cargo build --release                                  # still zero warnings
cargo run --release -p lab -- embodied --corpus-digest
cargo run --release -p lab -- embodied --seeds 400 --mirrored --policy tactical
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node --test tools/wasm_check.js
node tools/check_docs.js
node tools/check_deps.js
node --test tools/check_deps.test.js
node --test "client/test/*.test.mjs"
```

Both wasm builds, because only the feature build carries the two digests that moved.

## Acceptance

1. `CombatModel`, `CommandGrammar` and `CommandFrame` do not exist. Nothing in the
   workspace matches on a body model.
2. `EMBODIED_CORPUS_DIGEST` agrees to the byte, both feature configurations.
3. The two exact-law digests moved by the same amount on native and on wasm, and are
   re-recorded in all three copies each.
4. Four performance documents no longer name a deleted file as their canonical source.
5. `#/arena` runs an embodied fight and the client suites are green.
6. The line count is down by at least ten thousand, and the commit message says which
   pins moved and why.
