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

## What goes

### The model itself

`CombatModel` collapses to nothing. With one body model left, the six predicates --
`has_articulated_columns`, `uses_contact_solver`, `identity_word`, `has_stance`,
`command_frame`, `command_grammar` -- are six matches that can only answer one way, and
`CommandGrammar` and `CommandFrame` go with them. **This is the payoff of the whole
topic**: those enums were built exhaustive so a new model would be a compile error at
every decision point, and with one model that machinery is pure weight.

`Scenario::fingerprint` keeps writing its identity word. The word is frozen, not
computed: an embodied scenario writes `3` and must keep writing `3`, or every fixture
fingerprint moves and four registry rows with them. Delete the enum, keep the constant,
and say at the write site that the number is a wire value rather than a discriminant.

### The policies

- `crates/policy/src/articulated_script.rs` (2,058 lines) and
  `articulated_tactics.rs` (1,803).
- The `ArticulatedPolicy` trait, `ArticulatedPolicyKind`, and the six-entry registry.
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

| pin | expectation |
|---|---|
| `EMBODIED_CORPUS_DIGEST` | **must not move.** A deletion that reaches it has reached the embodied model. Revert; do not re-record. |
| `EMBODIED_GOLDEN_DIGEST` | must not move, same argument |
| the four embodied fingerprints | must not move |
| `ARTICULATED_STREAM_DIGEST`, `CONTACT_BEHAVIOR_DIGEST` | must not move; they are published bytes and payload widths, not model choices |
| `ARTICULATED_COMMAND_HASH` | **this row used to be grouped with the two above and the grouping was wrong.** It is `world.state_digest().value` of an unstepped fixture, so it folds `legacy_core_hash` like every state-digest pin; session 01 moved it. Whether it moves here depends on whether this session's deletion reaches that stream, which is a question to answer rather than assume |
| `COMBAT_GEOMETRY_HASH` | must not move |
| `LEARNED_INFERENCE_DIGEST` | must not move; a move means the reseat touched the forward pass |
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
