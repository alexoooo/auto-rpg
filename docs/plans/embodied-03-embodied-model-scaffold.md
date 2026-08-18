# Embodied 03 -- the third model, with no behaviour of its own

**Status:** complete. Landed 2026-08-17. No existing pin moved; one new pin
recorded.

`CombatModel::Embodied = 2`, an `EmbodiedCommandV1` payload, an `EmbodiedV1` hash
domain, and an `embodied-duel-v1` scenario. At the end of this session an embodied
fight is an articulated fight, tick for tick, and that equality is the session's own
regression test. Every later session changes it deliberately.

## The plan's hash argument was wrong, and the corrected one is stronger

This plan said: *"`Scenario::fingerprint` does not write the combat model, so a new
enum variant is invisible to it."* **It does write it.**
`Scenario::try_fingerprint` has always written a `u16` identity word -- `1` for
Legacy, `2` for Articulated -- immediately after the `ARPG-SCENARIO` domain and
before every other field.

The correct argument reaches the same conclusion by a better route: **every shipped
fixture keeps the word it already wrote.** A third variant adds a third value that
only a scenario asking for `Embodied` can produce, so no existing fingerprint can
move. That is a property of the *values*, not of the field's absence, and it is
worth having stated correctly because the next session to add a model will look
here first.

The correction had a second consequence, and it is the sharper one. The replay
codec **recomputes** that fingerprint from decoded bytes, and its copy of the match
read `if combat_model == Legacy { 1 } else { 2 }` -- so an embodied replay decoded
to a fingerprint its own scenario did not have, and the round-trip test said so
immediately. The number now comes from one place,
[`CombatModel::identity_word`](../../crates/sim/src/scenario.rs#L99), and its doc
comment carries the reason.

**The two numbering schemes must not be collapsed.** Wire discriminants are 0/1/2
(`CombatModel as u8`, written into the scenario record) and identity words are
1/2/3. `self as u16` would have been shorter and would have silently renumbered a
frozen identity.

## Why a separate command payload rather than a wider articulated one

`ARTICULATED_PAYLOAD_BYTES` is read by `ARTICULATED_COMMAND_HASH`,
`EXACT_TRAJECTORY_STATE_DIGEST` and `LIFTED_COULOMB_SOLVER_DIGEST` -- three pins
that have already moved together twice, once for the release verb and once for the
projectile store. Sessions 06 and 07 add fields. If they add them to the articulated
payload they move all three pins plus two wasm mirrors, in a session whose subject
is a knee-high stance model.

So [`EmbodiedCommandV1`](../../crates/sim/src/command.rs#L136) owns
`EMBODIED_PAYLOAD_BYTES`, `EMBODIED_COMMAND_LAYOUT_VERSION`, its own
`SubmittedCommand` tag `2` and its own envelope schema `3`.

**What it does *not* own is a second copy of the byte grammar.** The plan proposed
duplication; the implementation extracted instead. `write_payload`, `read_payload`
and `validate_payload_structure` are now free functions that both contracts call,
because the fork is about **width and ownership rather than arithmetic**: session
07 appended a swing plane after byte 52 and every offset below stayed exactly where it
is. Two copies would have been two places for a field offset to drift, and the drift
would be invisible until a pinned digest moved on one side only.

The struct is `EmbodiedCommandV1 { articulated: ArticulatedCommandV1 }` -- named
rather than flattened, so the fields sessions 06 and 07 add sit *beside* the frozen
grammar instead of inside a copy of it.

## One in-memory economy, stated rather than hidden

An embodied command is stored in the **same `World` column** an articulated one is.
That is deliberate. What sessions 06 and 07 need forked is the wire contract -- the
payload width, the record tag, the envelope schema -- because that is the half pins
are taken over. The in-memory command is the same six fields and the phases that
read it are the same phases, so a second column today would be a second copy of one
value.

The session that adds the first embodied-only field is the session that splits it,
and it cannot forget to: the field will have nowhere to live.

`EMBODIED_PHASES` is likewise an **alias** of `ARTICULATED_PHASES` rather than a
copy of its fourteen rows, because a duplicate table would recreate exactly the
hazard [session 02](embodied-02-phase-schedule-and-seams.md) removed -- a second
place to forget `press_doors`. Session 05 replaces the alias with a table when the
first phase actually diverges.

The `state_digest` grammar is shared the same way, through
`World::articulated_state_digest(model, payload_tag)`. Exactly two bytes differ
between the two models' digests and both are tags rather than state: the model byte
in the prefix, and the per-slot byte saying which payload contract each stored
command arrived under.

## What landed

| file | change |
|---|---|
| `crates/sim/src/scenario.rs` | `CombatModel::Embodied`, `CommandGrammar::Embodied`, `CombatModel::identity_word`, `Scenario::embodied_duel` |
| `crates/sim/src/command.rs` | `EmbodiedCommandV1`, `EMBODIED_PAYLOAD_BYTES`, `EMBODIED_COMMAND_LAYOUT_VERSION`, `SubmitEmbodiedOutcome`, `SubmittedCommand::Embodied`, and the extracted shared payload grammar |
| `crates/sim/src/hash_domain.rs` | `HashDomain::EmbodiedV1 = 2` |
| `crates/sim/src/codec.rs` | `EMBODIED_COMMAND_SCHEMA = 3`, record tag `2`, the schema/domain/model tuple arm, and a schema-aware `read_submitted_command` |
| `crates/sim/src/replay.rs` | playback submits an embodied record through `submit_embodied_v1` |
| `crates/sim/src/world/mod.rs` | `submit_embodied_v1`, `submit_embodied_fallback_v1`, `EMBODIED_PHASES` |
| `crates/sim/src/world/hash.rs` | `state_digest`'s third arm over a shared grammar |
| `crates/sim/src/combat/spec.rs` | construction validation accepts the third model |

**`read_submitted_command` takes the envelope's declared schema** rather than
inferring the contract from the tag byte it is about to read. A reader that trusted
the tag would read the wrong number of bytes the day the two widths diverge, which
is two sessions away.

## Tests

- `an_embodied_duel_equals_the_articulated_duel_it_was_copied_from` -- 600 ticks of
  an identical varying script through both submission paths, comparing **published
  poses at every tick**. Not the final digest: a final-digest comparison passes for
  two runs that diverged and reconverged, and the two digests cannot agree anyway.
  **Shown failing** by nudging the stored embodied `body_yaw` one raw unit -- it
  reports divergence at tick 0.
- `an_embodied_digest_is_not_an_articulated_one_even_on_an_identical_fight`
- `an_embodied_payload_is_the_articulated_payload_byte_for_byte`, over a fixture
  whose every field is distinct and asymmetric
- `an_embodied_payload_round_trips_through_its_own_reader`
- `both_payload_contracts_refuse_the_same_malformed_release_byte`
- `an_embodied_envelope_round_trips_through_its_own_schema`
- `an_embodied_schema_replay_refuses_an_articulated_tag`, and its twin
  `an_articulated_schema_replay_refuses_an_embodied_tag`
- `an_embodied_scenario_refuses_an_articulated_header` -- refused at **encode**,
  one step earlier than the decoder would catch it
- `an_articulated_world_refuses_submit_embodied_by_name`, and its twin
- `an_embodied_world_refuses_every_legacy_mutator`
- `the_embodied_fixture_fingerprints_apart_from_the_articulated_one` -- asserts
  *both* halves separately, so it would fail if either the name or the model word
  were absent from the identity
- `embodied_duel_v1_has_the_frozen_identity_and_the_articulated_arrangement`

## Verification, as run

```powershell
cargo test                                                      # 1175 passed, 0 failed
cargo run --release -p lab -- hash                               # 0xfe31370e141ef531
cargo run --release -p lab -- verify --seeds 200
cargo run --release -p lab -- articulated --seeds 400 --mirrored
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
```

## Hash expectation, and what happened

**No existing pin moved.** `LAB_HASH` answers `0xfe31370e141ef531`; `duel --seeds
400` answers 238/162 at 59.5%; `articulated --seeds 400 --mirrored` answers the same
fixture pair, the same 285/299 split, the same 1,761,481 resolutions and the same
337 severances.

**One new pin is recorded**: `embodied-duel-v1` fingerprints
`0x1a1e8e74eecd55d5`, and its registry row states that it differs from
`articulated-duel-v1` by the name bytes and the model word -- both of them, which
the test asserts separately.

## A near miss worth recording

Extracting `state_digest`'s articulated arm into a shared function **truncated
`hash.rs`**, silently deleting its fourteen-test module. Every remaining test
passed. The only thing that caught it was comparing the workspace test *count*
against the previous session's -- 1148 where 1162 was expected -- which is why that
number is written into every one of these session files rather than a bare "green".
