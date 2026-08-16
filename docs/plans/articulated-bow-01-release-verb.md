# Articulated bow 01 -- a release verb in the command

**Status:** planned, not started. Step 1 of five. See
[the overview](articulated-bow-00-overview.md), which carries the hazard analysis this
file assumes.

**This session ships no arrow.** It makes "loose" expressible in the articulated
command, and nothing consumes it yet. Keeping that apart from the projectile is the
point: a layout change and a new mechanic land in one commit only if nobody minds not
being able to tell which of them moved a number.

## What has to change, and what must not

`ArticulatedCommandV1` in `crates/sim/src/command.rs` is
`{move_dir, body_yaw, intent, arms, grips}`. Its payload is **fully packed** at
`ARTICULATED_PAYLOAD_BYTES`, and non-canonical padding is refused rather than ignored --
so there is no spare bit and the verb costs a byte and a layout version.

Change together, or the codec accepts a command the world cannot read:

- `ARTICULATED_PAYLOAD_BYTES` and `SUBMITTED_COMMAND_LAYOUT_VERSION` in
  `crates/sim/src/command.rs`;
- `validate_articulated`, which must refuse an out-of-range verb **by name**, on the
  same discipline the height/reach/effort bounds already use;
- both 55-byte fixtures -- one in `crates/sim/src/command.rs` and one in
  `crates/web/src/lib.rs` -- which are hand-written and must be rewritten *together*;
- the replay codec's articulated arm in `crates/sim/src/codec.rs`, including its
  round-trip test;
- `docs/reference/articulated-command-v1.md`, in the same commit.

## The shape of the verb

A release is an **edge**, not a level. The legacy bow already models it that way: the
shot is spawned on the exact `Windup -> Strike` transition, not while `Strike` holds.
Copy that, because a level would fire once per tick for as long as it is held, and the
first thing anyone would write to fix that is an edge detector in the world.

Two candidate encodings, and the choice belongs in this file before it is coded:

1. **A verb beside the grips**, one value per arm, `{Keep, Loose}`. Symmetric with
   `GripRequest`, which is already per-arm and already `{Keep, Release, EquipSlot}`.
   Note the collision: `GripRequest::Release` already means "drop what you are holding".
   A second verb whose name is also a release is a trap for the next reader; name it
   `Loose` and say why beside it.
2. **A single body-level flag.** Cheaper, and a two-handed bow is held by both arms
   anyway, so per-arm expressiveness may be a distinction the mechanic never uses.

**Recommendation: (1), per-arm.** `GripBinding::Both` is a *binding*, not a body state,
and one-handed thrown weapons are the obvious second consumer. But this is a contract
that is expensive to widen later, so make the call deliberately and record the loser.

## What this session must not do

- **No `Bow` row in `CombatSpecTableV1::fixtures()`.** That is step 2, and it belongs in
  `shipped_row` in `crates/sim/src/combat/arena.rs` rather than in `fixtures()` -- the
  overview explains that adding a fixture row moves four pins at once.
- **No projectile store.** Step 3, and it must be hashed in the articulated block only.
- **No `ContactKind` variant.** Step 4, and it is a design decision with its own writing.
- A submitted-but-unconsumed verb is the whole deliverable.

## Tests

- `a_loose_verb_round_trips_through_the_replay_codec` -- write, read, compare the typed
  value rather than the bytes.
- `a_non_canonical_articulated_payload_is_still_refused` -- the existing rule, at the new
  width. Show it failing by widening the payload without widening the refusal.
- `an_out_of_range_release_verb_is_refused_by_name` -- the refusal discipline; assert the
  sentence, not a boolean.
- `a_held_release_looses_once_rather_than_every_tick` -- the edge, asserted at the
  command layer even though nothing consumes it yet. This is the test that stops step 3
  from inheriting a level.
- The existing 55-byte fixture tests must be **rewritten, not re-recorded**: they are
  hand-written byte arrays, and a fixture edited to match a mistake passes trivially.

Break each on purpose before believing it.

## Pins

**Predicted: `ARTICULATED_COMMAND_HASH`, and it is a layout move rather than a values
move.** The digest is taken against an unstepped world over a hand-written command
payload, and the payload's width is changing.

**Read that off the fixture before running the gate.** This topic's sibling has now
predicted pin movement wrongly four times in a row, every time by reasoning about the
subsystem instead of about what the fixture actually contains. Confirm that the command
digest's fixture really does encode a payload of the changed width, and say so in
writing first.

`ARTICULATED_STREAM_DIGEST` should **not** move: its fixture submits
`stream_digest_command` and never encodes a release. If it moves, the verb reached the
published rows, which is step 5's business and not this session's.

**Nothing else may move at all**, and the overview names the six legacy pins that a
careless projectile touch would take with it -- none of which this session goes near,
because it adds no shot record. `LEARNED_INFERENCE_DIGEST` must not move: the action
vocabulary is frozen and a new command verb is not a new action head.

Verify by diffing wide hash literals against `HEAD` rather than by trusting the suite.

### Prediction, written before the gate ran -- and the section above is wrong

**"Nothing else may move at all" is false, and reading it off the fixtures rather than
off the subsystem is what found that.** The paragraph above was written from the
overview's hazard analysis, which is about the *projectile store* and the legacy pins it
would drag in. It missed that three separate digests hash the submitted-command payload
**and its declared width**.

Four numbers are predicted to move, and each was traced to the line that moves it:

| number | why, exactly |
|---|---|
| `ARTICULATED_COMMAND_HASH` `0xd1da6a40df0480b2` | `World::state_digest` writes `command.payload_bytes()` for every stored command. The fixture stores one, so 51 bytes become 53 in the stream. |
| the unregistered exact-law command witness `0x5fcaba34556b2737` | the same assertion under `cartesian-recoil`, same route. |
| `EXACT_TRAJECTORY_STATE_DIGEST` `0x83051e8c6b4ef20f` | feature-only, and it moves by **three** independent routes: it writes `ARTICULATED_PAYLOAD_BYTES as u16` *explicitly*, then `payload_bytes()`, and it also folds in `state_digest()` values that have themselves moved. |
| `LIFTED_COULOMB_SOLVER_DIGEST` `0x83cd7bb2b73aeb9e` | feature-only, same explicit width word and the same payload bytes, through `command_receipt`. `raw_lifted_command_receipt` is pinned inside it and moves with it. |

`crates/lab/src/strong_strike.rs`'s `source_41_receipt` hashes the same width word, but
its three receipts are compared to *each other* rather than to a literal, so they move
together and stay equal. That is a consistency check surviving a layout move, not a pin.

Predicted **not** to move, with the reason each is out of reach:

- `ARTICULATED_STREAM_DIGEST` -- it is FNV over published pose, event and region *words*.
  Its fixture does submit commands, but the digest never reads one; a release verb is not
  a published word until step 5.
- All six legacy pins. A Legacy world's `state_digest` is `legacy_core_hash()` alone, and
  the articulated command block is written only on the Articulated arm.
- The combat spec-table digest and the `articulated-duel-v1` fingerprint -- no spec row
  is touched.
- `LEARNED_INFERENCE_DIGEST`, `CONTACT_BEHAVIOR_DIGEST`, `COMBAT_GEOMETRY_HASH`, the
  contact format corpus, and the legacy feature prefix.

## Verification

```powershell
cargo test
cargo test --workspace --features cartesian-recoil
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node --test client/test/wasm-memory.test.mjs
npx tsc --noEmit
node tools/check_docs.js
git diff --check
```

`wasm-memory` is on that list deliberately: a wider submitted command changes what the
arena recorder holds per tick, and this repository has just spent a session discovering
that its warm-set fixtures re-measure whenever an allocation pattern moves. Trace the
per-round page counts rather than raising the warm count until it goes green.
