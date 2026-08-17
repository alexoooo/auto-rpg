# Embodied 03 -- the third model, with no behaviour of its own

**Status:** proposed. Depends on [02](embodied-02-phase-schedule-and-seams.md).

Add `CombatModel::Embodied = 2`, an `EmbodiedCommandV1` payload, an embodied
hash-domain block, and an `embodied-duel-v1` scenario. At the end of this session an
embodied fight is an articulated fight, tick for tick, and that equality is the
session's own regression test. Every later session changes it deliberately.

## Why a separate command payload rather than a wider articulated one

`ARTICULATED_PAYLOAD_BYTES` is read by `ARTICULATED_COMMAND_HASH`,
`EXACT_TRAJECTORY_STATE_DIGEST` and `LIFTED_COULOMB_SOLVER_DIGEST` -- three pins that
have already moved together twice, once for the release verb and once for the
projectile store, because `exact_diagnostics.rs` writes the width as a `u16` *and*
writes `payload_bytes()` for every stored command. Sessions 06 and 07 add fields.
If they add them to the articulated payload, they move all three pins plus the two
wasm mirrors, in a session whose subject is a knee-high stance model.

So `EmbodiedCommandV1` starts as a byte-for-byte copy of the 53-byte
[articulated payload](../reference/articulated-command-v1.md#canonical-53-byte-articulated-payload)
under `EMBODIED_COMMAND_LAYOUT_VERSION = 1`, with its own `SubmittedCommand` tag `2`,
its own `EMBODIED_PAYLOAD_BYTES`, and its own validation order. Duplication is the
point: it buys the later sessions a payload they can widen without touching a frozen
one, and the duplication is deleted if and when `Articulated` is retired.

## What lands

**`crates/sim/src/lib.rs`** -- `CombatModel::Embodied = 2`. The three predicates from
session 02 answer: `has_articulated_columns` true, `uses_contact_solver` true,
`command_grammar` `CommandGrammar::Embodied`.

**`crates/sim/src/command.rs`** -- `EmbodiedCommandV1`, structurally identical to
`ArticulatedCommandV1`, plus `SubmittedCommand::Embodied(EmbodiedCommandV1)` at tag
`2`. Same field order, same ranges, same neutral-command definition, same atomic
validation with the first failure choosing the diagnostic. Reuse the `ArmTarget`,
`GripRequest`, `ReleaseRequest` and `Intent` types rather than copying them; what is
being forked is the *payload contract*, not the vocabulary.

**`crates/sim/src/world.rs`** (now `world/mod.rs`) -- `EMBODIED_PHASES`, initially the
literal contents of `ARTICULATED_PHASES`. `MAX_EMBODIED_ENTITIES = 64`. The pose,
grip, authority, anatomy and contact columns are shared with `Articulated` and are
allocated for both, which the session-02 predicate already expresses.

**`crates/sim/src/codec.rs`** -- command schema `3`: tick, subject index, subject
generation, tag `2`, then the 53-byte embodied payload. Schemas 0, 1 and 2 keep their
meanings exactly; an embodied-schema replay containing tag `0` or `1` is a model
mismatch, on the rule the articulated schema already states.

**`crates/sim/src/world/hash.rs`** -- an `EmbodiedV1` block in `state_digest`,
mirroring the ArticulatedV1 suffix in
[hash domains](../reference/hash-domains-v1.md#primitive-and-typed-comparison): the
allocated slot count, then per slot the stored command's presence, tag and canonical
payload, then the pose and authority rows. A Legacy or Articulated world writes no
`EmbodiedV1` block at all, which is what keeps every existing digest byte-identical.

**`crates/sim/src/scenario.rs`** -- `Scenario::embodied_duel()`, name
`embodied-duel-v1`, the articulated fixture's dungeon, seed, units and spec table
under a new name. `Scenario::fingerprint` does not write the combat model, so this
is a new *name* producing a new fingerprint by the name bytes alone.

**`crates/web/src/lib.rs`** -- `submit_embodied`, `embodied_command_layout_version`,
and a `[u8; 57]`-shaped scratch of its own. The frame, pose, region, projectile and
combat-event publications are untouched; an embodied body publishes into the pose
rows exactly as an articulated one does, because it *is* one this session.

## The equality that is the whole test

`an_embodied_duel_equals_the_articulated_duel_it_was_copied_from`: run
`articulated-duel-v1` and `embodied-duel-v1` from the same seed for 600 ticks under
the same scripted commands, and assert every published pose field agrees at every
tick. Not the final digest -- the per-tick pose, on the rule replay playback already
follows, because a final-digest-only comparison passes for two runs that diverged and
reconverged.

The state digests will *not* agree, and must not: one carries an `EmbodiedV1` block
and one does not. Compare poses, not digests.

Also:

- `an_embodied_payload_is_the_articulated_payload_byte_for_byte`
- `an_embodied_schema_replay_refuses_an_articulated_tag`
- `an_articulated_world_refuses_submit_embodied_by_name` -- and returns the refusal
  rather than printing it, so the test can assert the sentence. A control that cannot
  honour a request refuses it by name; ten instances of the opposite have already
  shipped here.
- `a_legacy_world_writes_no_embodied_hash_block`

## Verification

```powershell
cargo test
cargo run --release -p lab -- hash
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
```

## Hash expectation

**Nothing moves.** `Scenario::fingerprint` writes name, dungeon, `max_ticks`, portal
and units and does not write the combat model, so the new variant is invisible to
every existing fixture's fingerprint. No existing world allocates an `EmbodiedV1`
block. `ARTICULATED_PAYLOAD_BYTES` is untouched, so the three digests that read it
are untouched.

`embodied-duel-v1`'s own fingerprint is a new number and is recorded in the registry
by this session, with the note that it differs from `articulated-duel-v1` by the
scenario name bytes and nothing else.

## Documentation owed

A new `docs/reference/embodied-command-v1.md` on the model of the articulated one,
and a registry row for `embodied-duel-v1`. Sessions 04 through 07 amend that
reference in place rather than each writing their own.
