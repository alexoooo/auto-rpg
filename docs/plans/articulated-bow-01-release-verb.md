# Articulated bow 01 -- a release verb in the command

**Status:** **completed 2026-08-16.** See the closing note at the foot of this file.
Step 1 of five. See
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

## Completed, 2026-08-16

**Encoding chosen: (1), a per-arm `ReleaseRequest::{Keep, Loose}` beside the grips.**
The body-level flag was rejected on the ground the plan gave -- `GripBinding::Both` is a
binding rather than a body state, and a one-handed thrown weapon is the obvious second
consumer that a body flag could not express. `Loose` rather than `Release` because
`GripRequest::Release` already means "drop what you are holding", and two verbs both
called release is a trap rather than a symmetry.

`ARTICULATED_PAYLOAD_BYTES` went 51 -> 53 and `SUBMITTED_COMMAND_LAYOUT_VERSION` 1 -> 2.
The edge lives in `ReleaseRequest::looses(previous, current)` rather than being left for
step 3 to invent; its own comment records why, which is that a consumer testing
`current == Loose` "empties a quiver in under two seconds".

The non-canonical-padding claim is carried by the existing
`unknown_tags_noncanonical_padding_and_ranges_are_distinct` extended to the new width,
rather than by a second parallel test under the name this plan proposed.

### Pins: four moved, and this plan's "nothing else may move at all" was wrong

The prediction section above was written from the overview's hazard analysis, which is
about the *projectile store*. Reading it off the fixtures instead found that three
digests hash the submitted command's payload **and its declared width**, so four numbers
move rather than one. All four were predicted in writing before the gate and all four
landed:

| pin | from | to |
|---|---|---|
| `ARTICULATED_COMMAND_HASH`, default law | `0xd1da6a40df0480b2` | `0x28dca7e757a1ba3f` |
| `ARTICULATED_COMMAND_HASH`, exact law | `0x5fcaba34556b2737` | `0x8d92c50f3a16ebce` |
| `EXACT_TRAJECTORY_STATE_DIGEST` | `0x83051e8c6b4ef20f` | `0x88e6ea929b8d4305` |
| `LIFTED_COULOMB_SOLVER_DIGEST` | `0x83cd7bb2b73aeb9e` | `0x8dc443385973a5c8` |

Unmoved, as predicted: `ARTICULATED_STREAM_DIGEST`, `LEARNED_INFERENCE_DIGEST`,
`CONTACT_BEHAVIOR_DIGEST`, `COMBAT_GEOMETRY_HASH`, the combat spec-table digest, the
`articulated-duel-v1` fingerprint, the contact format corpus, the legacy feature prefix,
and all six legacy goldens.

**This is the first correct pin prediction in five sessions**, and the difference was
method rather than luck: the four preceding sessions each predicted from the subsystem
being edited and were wrong every time, while this one traced each digest to the line
that writes the width.

### Three things finished after the session that wrote the code

It stopped mid-repair, so these were completed separately and are recorded here rather
than folded in silently.

- **The tree did not compile on the default law.** Two temporary probes,
  `zz_probe_synthetic_diff` and `zz_probe_artifact_digests`, were left behind in
  `crates/lab/src/strong_strike.rs`. Both were scaffolding for finding the new expected
  values, both were `#[ignore]`d, and both called `cartesian-recoil`-gated helpers
  without being gated themselves. Removed.
- **`ordinal_31_tick_46_pair_aabb_names_the_first_difference` carried the old receipts.**
  Its expected artifact is a fixed ASCII byte snapshot, and four hex fields inside it
  move with the payload width: the three command receipts, which hash the declared
  width, and `state_value`, which is `state_digest()` writing `payload_bytes()`. The
  artifact is otherwise byte-identical -- 11,321 bytes and 74 lines on both sides -- and
  `requested == stored == replay` still holds on every row, which is what the control
  exists to assert. Re-recorded with that reasoning beside it.
- **The registry listed pre-move values for two of the four.** `EXACT_TRAJECTORY_STATE_DIGEST`
  and `LIFTED_COULOMB_SOLVER_DIGEST` were re-recorded in both code owners but left at
  their old numbers in `docs/reference/hashes.md`; each now carries its new value and
  the reason it moved. Fourteen anchors across `hashes.md`,
  `0004-purpose-built-simulation-kernel.md` and `combat.md` drifted from the line
  insertions and were recomputed against source.

### Gate results

| gate | result |
|---|---|
| `cargo test --workspace --no-fail-fast` | exit 0 |
| `cargo test --workspace --features cartesian-recoil --no-fail-fast` | exit 0 (748 sim, 154 lab, 130 web) |
| `cargo build --release --target wasm32-unknown-unknown -p web` | exit 0 |
| `node --test tools/wasm_check.js` | 30/30, native == wasm |
| `node --test client/test/wasm-memory.test.mjs` | 5 pass, 1 skipped, exit 0 |
| `node --test client/test/render-contract.test.mjs` | 83/83 |
| `node --test client/test/studio-shell.test.mjs` | 23/23 |
| `node --test client/test/worker-protocol.test.mjs` | 64/64 |
| `npx tsc --noEmit` | exit 0 |
| `node tools/check_docs.js` | passed |
| `node tools/check_deps.js` | passed |
| `git diff --check` | clean |

The `wasm-memory` warning this plan carried did not fire: a wider command did not move
the warm set, and the counts set during the crush session held unchanged.

## What step 2 inherits

A submitted verb nothing reads. Step 2 adds a `Bow` row to `shipped_row` in
`crates/sim/src/combat/arena.rs` -- **not** to `CombatSpecTableV1::fixtures()`, which
would move four pins at once -- and draws on the `Both` grip path that combat-arms 01
made expressible. Do not write step 3's session file until step 2 has been measured; the
overview is explicit that steps 3 and 4 carry a decision that step 2's numbers should
inform.
