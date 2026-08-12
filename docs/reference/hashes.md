# Hashes and replay integrity

**Purpose:** Specify current hash ownership, replay integrity behavior, and golden-hash registry.
**Status:** current
**Canonical source:** [`World::state_hash`](../../crates/sim/src/world.rs#L3998), [`Scenario::fingerprint`](../../crates/sim/src/scenario.rs#L452), and pinned constants in tests.
**Update when:** A hash byte stream, replay integrity check, golden fixture, pin value, or re-record procedure changes.

<!-- DOC_CONTRACT: hash-domains -->
## Hash primitive and current domains

`Hash64` is 64-bit FNV-1a with fixed constants. Multi-byte integers are written
little-endian and booleans are written as `0` or `1`. The current streams have no
schema version or explicit domain prefix. Therefore a hash is meaningful only with
the function and fixture that produced it; it is not a serialized replay identifier.

### `Scenario::fingerprint`

The current scenario stream writes, in order:

1. scenario name bytes, without a length prefix;
2. dungeon columns, rows, and `Dungeon::fingerprint`;
3. `max_ticks`;
4. portal presence and, when present, raw fixed-point `x` and `y`;
5. unit count; and
6. for each unit in order: body kind, faction index, stats, and raw spawn `x`/`y`.

Torch placement is deliberately omitted because it is presentation-only.

`UnitSpec::loadout` is also omitted, accidentally. Two scenarios differing only by
loadout currently fingerprint alike, and `Replay::is_intact` cannot detect that
edit. This is a known defect scheduled for v2-10, not a compatibility guarantee.

### `World::state_hash`

`World::state_hash` alone owns the live-state byte order. It currently writes:

1. seed, tick, arena dimensions, and dungeon fingerprint;
2. when doors exist, door count and each pressure value;
3. both faction orders, then both objectives;
4. allocated entity-slot count and every slot, including dead slots: liveness,
   generation, position, facing, health, velocity, complete hand state, loadout,
   selected slot, stats, body kind, cached radius/mass/max health, decision and combat
   clocks, regeneration and damage accounting, and persistent command; and
5. allocated projectile-slot count unconditionally, then every projectile slot's
   liveness, position, velocity, remaining range, mass, power, faction, and owner.

Events, pending-decision and navigation caches, tick scratch, and entity/projectile
free-list bookkeeping are not separate inputs. This list identifies ownership; it
does not replace the executable write order. Any changed write, omission, or order in
`World::state_hash` is a hash-stream change.

<!-- DOC_CONTRACT: replay-integrity -->
## Current replay integrity

`Replay` is an unversioned in-memory Rust structure. It clones the full scenario and
stores the scenario fingerprint captured at construction. `Replay::is_intact`
recomputes that fingerprint, but `play` does not require callers to invoke the check.
There is no codec, magic value, schema version, decoder, validation pass, or durable
compatibility policy.

The recorder appends timestamped commands, orders, and objectives. Playback trusts
their vector order, creates a fresh `World`, applies due orders, then due objectives,
checks the requested stopping tick, applies due commands, and steps. It never invokes
a policy. Final live-versus-playback equality is asserted by callers using
`World::state_hash`; `Replay::play` does not store or validate an expected final hash.

<!-- DOC_CONTRACT: golden-registry -->
## Golden registry

These are the current named pins:

| Pin | Current value | Ownership | Re-record rule |
|---|---:|---|---|
| `LAB_HASH` | `0xfe31370e141ef531` | [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs#L10750) and [`tools/wasm_check.js`](../../tools/wasm_check.js#L37) | Not re-pinnable. It names its scenario and policy; investigate a move. |
| `GOLDEN_STATE_HASH` | `0xbe85089325550cf2` | [`crates/sim/tests/determinism.rs`](../../crates/sim/tests/determinism.rs#L353) | `cargo test -p sim --test determinism -- --nocapture golden` |
| `ROOM_HASH` | `0x98441a18db7a95ca` | [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs#L10809) and [`tools/wasm_check.js`](../../tools/wasm_check.js#L44) | `cargo test -p web -- --ignored --nocapture print_the_golden_hashes` |
| `BATTLE_HASH` | `0x9aafe4bd54560586` | [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs#L10815) and [`tools/wasm_check.js`](../../tools/wasm_check.js#L50) | Same browser-golden command; update both owners. |
| `SWAP_HASH` | `0xf948f5486ee90191` | [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs#L10831) and [`tools/wasm_check.js`](../../tools/wasm_check.js#L61) | Same browser-golden command; update both owners. |
| `BOW_HASH` | `0x4a1157735d305e9f` | [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs#L10836) and [`tools/wasm_check.js`](../../tools/wasm_check.js#L70) | Same browser-golden command; update both owners. |

The browser pins are deliberately duplicated across native Rust tests and the wasm
checker. If both copies fail after an intentional behavior change, the fixture moved;
if only wasm differs, target portability is broken.

The root README previously displayed `0x00b48ceb21081d1d` as “the state hash” for a
run. No current constant or named fixture pins that value. It is historical evidence,
not a current golden and not a value to re-record.

An earlier route implementation recorded `ROOM_HASH` as `0xadae95f2b6b46499` after
ordered feet began following the first route direction. The current scripted room
fixture has since moved for intentional behavior changes and is pinned in the table
above. The older number is retained only to explain the historical route correction;
it is not an alternate accepted golden.

### Mechanics pins added by the v2 sessions

The six pins above are legacy gameplay fixtures and must not move in any v2 session.
The mechanics sessions have added eight more, and v2-ui-08 a ninth. Seven of them obey a
different rule: each
pins a purpose-built contract rather than a fight, so the session that owns that
contract may move its pin — but only by predicting the move in writing first and
explaining it afterwards. These are as easy to break by accident as the legacy six, and
a fresh session that does not know they exist is the likeliest way to break one. The
eighth, the legacy feature prefix, is the opposite of a movable pin: it exists to refuse
a move, and it belongs to nobody to re-record. The ninth,
`LEARNED_INFERENCE_DIGEST`, is a third kind again: it pins **agreement between two
targets** rather than a fixture or a contract, so a move that is not explained by one of
its five owning changes is not a number to re-record but a portability failure, and the
row says what to do about it.

**A shield dimension moves four of them at once**, which is worth knowing before
touching one: the spec-table digest and the fixture fingerprint because the table is in
both streams, `ARTICULATED_COMMAND_HASH` because the shield pose is derived at spawn and
hashed, and `ARTICULATED_STREAM_DIGEST` because the plate's extents are published words.
v2-20 predicted all four from their fixtures before running and all four moved.

| Pin | Current value | Ownership | Re-record rule |
|---|---:|---|---|
| `COMBAT_GEOMETRY_HASH` | `0x9d15344883cf6e9c` | [`crates/fx/src/geom3.rs`](../../crates/fx/src/geom3.rs#L1322) and [`tools/wasm_check.js`](../../tools/wasm_check.js#L79) | Introduced by v2-12. Moved once, by v2-14 checkpoint A adding the continuous sweeps, from `0x56fb8704002a1a61`. A further move needs a new geometry row and must be predicted. |
| `ARTICULATED_COMMAND_HASH` | `0xd1da6a40df0480b2` | [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs#L8868) and [`tools/wasm_check.js`](../../tools/wasm_check.js#L78) | The unstepped `ArticulatedV1` command probe. Moved three times: by v2-14 checkpoint C appending the global `cap_hits:u32` (`0x584d711e492950e7` → `0x010411d521a376d7`); by v2-15 appending one 61-byte anatomy row per allocated slot after it (→ `0x6e61a92ec96ac3a6`); and by v2-20 shrinking the shield's `half_width` and `half_height` to a quarter each. The fixture is unstepped, so every row is the construction row — which is exactly why an *equipment* edit reaches it rather than being filtered out: `initialize_articulated_pose` derives the shield pose at spawn and the digest writes its three extents per slot. **Any spec-table edit touching a shield dimension moves this pin by construction** and must predict it. |
| `CONTACT_BEHAVIOR_DIGEST` | `0x587b0259e877105a` | [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs#L11229) and [`tools/wasm_check.js`](../../tools/wasm_check.js#L569) | 3,548 behavioral corpus bytes owned by v2-14 checkpoint B. Moved once, by v2-15, and by exactly one byte: case 6's body became five coincident regional volumes, so its fact names the region it chose and the byte went `0xff` → Head's `0`. The geometry and the length are unchanged; previously `0xfe6ce41ec023c1e5`. `wasm_check.js` rebuilds every byte itself rather than trusting the export, so a one-sided failure still diagnoses target disagreement. |
| `ARTICULATED_STREAM_DIGEST` | `0xf7d3a9c73aa59981` | [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs#L10674) and [`tools/wasm_check.js`](../../tools/wasm_check.js#L859) | FNV-1a-64 over the published pose, combat-event and region words of a twenty-tick scripted articulated fight, prefix `ARPG-STREAM-V1` (the region words since v2-ui-06; see the end of this row); the script is written out in [`articulated-abi.md`](articulated-abi.md#portable-stream-digest). Introduced by v2-16, native and wasm agreeing. **Not a fight golden and not `ARTICULATED_HASH`:** it pins the bytes the page reads rather than the state the world reached, which is a property a hand-rolled ABI can get wrong on its own — a moved word offset, a sign extension, a narrowed `u64`. Owned by whoever owns the row layouts, and a layout change moves it and must say so. A move *without* a layout change is a simulation change and should have moved a fight golden too. Unlike `CONTACT_BEHAVIOR_DIGEST`, `wasm_check.js` pins the number rather than rebuilding the bytes, because the stream is a simulation run and not a documented table and its script cannot be driven from JavaScript; the reference says so where the script is written out. Moved twice, both by v2-17 checkpoint B, and both are simulation moves with no layout change — the exception the sentence above anticipates: no *fight* golden exists for the articulated world yet, so the corpora in [`articulated-mechanical-gate.md`](articulated-mechanical-gate.md) carry that half of the pair. From `0x4372a94d89fc9155`, when the contact projector stopped re-deriving an unmoved hand through an inexact joint inverse and tick 5 of the script gained a second resolved row; then from `0x27b2aa50bb4e7a67`, when a held segment's one point velocity moved from the hand to the blade's centre of mass. The second move leaves the row shape untouched — the same ticks carry the same counts — so it is values and not rows, which is what distinguishes it from a layout change even though both move this one number. **A `crates/policy` change cannot move this pin, and one predicted it would.** The fixture is driven by `stream_digest_command` in `crates/web/src/lib.rs` — one hand-written command per body, submitted once on tick zero and then chased toward — and it never calls `articulated_script.rs`. So the scripted, windmill and closing-attack policies are all invisible here: when the off arm stopped moving on 2026-08-10 and all three `ARPG-SCRIPT-V1` command streams moved, this number did not, native and wasm agreeing on the unchanged value. What reaches it is `crates/sim`, the row layouts, and the fixture itself. Moved a third time by v2-20, from `0x6f879c13430adfc1`, when the shield's `half_width` and `half_height` went to a quarter each — and by **two** routes at once, both predicted from the fixture before the run. The plate's extents are published *words* in the pose row (`POSE_SHIELD_HALF_WIDTH`, `POSE_SHIELD_HALF_HEIGHT`, copied off `spec::shield()` through `derive_shield_pose`), so tick zero's bytes move before the fixture has stepped; and a smaller plate then changes what the twenty-tick clinch resolves, so the event half moves too. Still not a layout change: the stride, the word offsets and the per-tick row counts are all where they were. **Moved a fourth time by v2-ui-06, from `0x54c0762b3dfb7a05`, and this one *is* the layout change the three before it were not** — predicted in writing in `v2-ui-06` before the run and budgeted alone for that reason. A third section went on the wire, the five swept region capsules per body, and the digest's rule is every published word of every publication. It moved by **extension**: the region length, drop count and words are appended after the event words, so the pose-and-event prefix of all twenty ticks is byte-identical to what v2-16 pinned and the per-tick row counts are unchanged with ten region rows added to each. `FRAME_LAYOUT_VERSION`, `POSE_LAYOUT_VERSION` and `COMBAT_EVENT_LAYOUT_VERSION` are all unmoved — a section was added, no row was touched — and nothing in `crates/sim` changed, which is why no fight golden moved with it. Native and wasm agreed on the new value on the first run. |
| contact format corpus | `0x1adfa9e01e36edf9` | [`crates/sim/src/combat/resolution.rs`](../../crates/sim/src/combat/resolution.rs#L1538) | 591 hand-authored serialization bytes owned by v2-14 checkpoint B. Native only, and unpaired on purpose: it pins a byte grammar rather than a behaviour. |
| combat spec-table digest | `0x78e5b57ae0c6bbd6` | [`crates/sim/src/combat/spec.rs`](../../crates/sim/src/combat/spec.rs#L847) and [`crates/sim/src/combat/arena.rs`](../../crates/sim/src/combat/arena.rs#L496) | The two anatomy rows, three equipment rows and two unit rows of `CombatSpecTableV1::fixtures()`, written through `rows_into`. Introduced by v2-15 and **listed here since v2-20**, which is the session that first moved it — the registry had no row for it and the fixture edit found that out. Moved once, from `0xf518cd244980f2d4`, by the shield's `half_width` and `half_height` going to a quarter each. Native only. Re-pinnable by the session that edits a fixture row, and only with the edit stated: it is a *values* pin, and its byte widths are asserted beside it so a re-record cannot quietly hide a format change. **Asserted in two places since v2-ui-04**, and the second one is not a duplicate: `the_shipped_fixture_digest_is_unmoved_by_a_runtime_table` builds several runtime tables through `Scenario::duel_from` *first* and only then recomputes this number, which is what makes "a second constructor beside `fixtures()` is invisible to the digests" a measurement rather than an argument. A session that re-records the pin beside the fixture and not here has not finished. |
| `articulated-duel-v1` fingerprint | `0x068d05fcada1027b` | [`crates/sim/src/scenario.rs`](../../crates/sim/src/scenario.rs#L708) and [`crates/sim/src/combat/arena.rs`](../../crates/sim/src/combat/arena.rs#L497) | `Scenario::fingerprint` of the articulated gate fixture, which covers the immutable spec table. **Listed since v2-20** for the same reason as the row above. Moved once, from `0x2a6cc9678c08730d`, by that session's shield edit; the mirrored variant `lab articulated` prints moved with it, to `0x6dbf62f0b336050b`. The fixture's *name* is frozen and this number is not — but any corpus, replay integrity check or evidence artifact naming `articulated-duel-v1` is a claim about the fingerprint it was recorded against, so a move invalidates recorded evidence rather than merely renumbering it. Carries the same second assertion, and for the same reason. A runtime duel is named `configured-duel-v1`, and **the name is the whole of the distinction** — `the_shipped_arrangement_is_expressible` shows a described duel equals the fixture in every other field, so `a_configured_duel_is_never_the_pinned_fixture` asserts both halves: the fingerprint differs as constructed, and writing the pinned name back onto the public `Scenario::name` field reproduces this number exactly. Treat that as a convention a caller can undo rather than as an invariant the type enforces. |
| `LEARNED_INFERENCE_DIGEST` | `0xbdba8d64d340ce32` | [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs#L10721) and [`tools/wasm_check.js`](../../tools/wasm_check.js#L2156) | FNV-1a-64 over the **logit words** `checkpoints/v2-probe.ckpt` produces on `learn_core`'s fixed observation corpus, prefix `ARPG-LEARNED-V1`; the corpus, the byte order and the caveat are on [`crates/learn-core/src/digest.rs`](../../crates/learn-core/src/digest.rs). Created by v2-ui-08 and **the only pin here whose subject is a portability claim rather than a fixture**: `model.rs` chose a rectified linear over `tanh` so that no libm call enters the forward pass, and then recorded that this was "only a *claim* about hosts other than this one, because this repository has no second host to check it on". wasm32 is the second host and both agreed on the first run. Logits and not argmaxes deliberately — five bytes would agree right up to the moment a divergence crossed a decision boundary, which is the moment it stops being catchable early. **Owned by whoever changes `ModelShape`, the feature layout, the action layout or the forward pass, and — fifth, because the digest is taken over the checkpoint `load_checkpoint` *installed* rather than an embedded one, which is deliberate and is what puts the fetch, the staging buffer and the decoder inside the pin — by whoever changes `Checkpoint::from_bytes`, which the four-item list left off — a session editing the decoder reads that list, finds nothing of its own on it, and does not predict the move; and by nobody else.** The three contracts are in the digest stream, so a layout bump moves it loudly. A move *without* one of those five is not a re-record: it is a portability failure, and v2-ui-08 named the fallback in advance — quantise inference to `Fx`, which changes behaviour and must be re-scored on `learn-probe evaluate`'s 400 held-out seeds against **88.922** -- the mean return the shipped checkpoint scored there, recorded here because `checkpoints/*.log` is in `.gitignore` and a clean clone has only the `.ckpt`, so `cargo run --release -p lab -- learn-probe evaluate --checkpoint checkpoints/v2-probe.ckpt` is the way to see the table again. The corpus cannot move underneath it: it is synthetic, drawn from `fx::Rng`, and no simulation output reaches it, which is what makes a move mean one of exactly two things. **The caveat is part of the pin.** It holds for the repository's baseline targets — MSVC x86-64 with no `target-cpu`, `target-feature` or fast-math anywhere in the profile, and the wasm MVP — because neither has an FMA instruction, which is what closes contraction. Building native with `-C target-cpu=native` on a host that has FMA re-opens it: a fused multiply-add rounds once where `Model::forward`'s loop rounds twice. That build is outside the guarantee, and it is a real hole rather than a footnote, because nothing in the repository would notice until this number failed. |
| legacy feature prefix | `0x811fa73c27591214` and `0x95b0799736913997` | [`crates/sim/src/world.rs`](../../crates/sim/src/world.rs#L10449) | Feature indices `0..450` of every observation in a scripted 600-tick skirmish, and the state hash the resulting commands produce. Introduced by v2-16 and **recorded on the tree immediately before** the articulated block was appended, which is what makes it evidence rather than a snapshot of the new behaviour. Native only. Not re-pinnable by an append: a session that moves it has renumbered a frozen column, which is the thing it exists to refuse. |

One `ARTICULATED_HASH` for a scripted fight is planned by v2-17 and deliberately does
not exist yet. No earlier session may create it. The legacy feature prefix above is
not that pin and does not anticipate it: it fingerprints the *legacy* half of the
vector and a Legacy-world fight, and its whole purpose is to stay still while the
articulated half grows.

> **Pending, not current:** v2-10 plans separate, versioned scenario, state, and
> replay hash domains plus a validated replay codec. None of those guarantees exists
> in the current streams above.

## Source anchors

- FNV-1a implementation and byte order: [`Hash64`](../../crates/fx/src/hash.rs#L9)
- Scenario stream and current omission: [`Scenario::fingerprint`](../../crates/sim/src/scenario.rs#L452)
- Live state stream: [`World::state_hash`](../../crates/sim/src/world.rs#L3998)
- In-memory replay and integrity check: [`Replay`](../../crates/sim/src/replay.rs#L64)
- Replay playback order: [`Replay::play_until`](../../crates/sim/src/replay.rs#L152)
