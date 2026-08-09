# Hashes and replay integrity

**Purpose:** Specify current hash ownership, replay integrity behavior, and golden-hash registry.
**Status:** current
**Canonical source:** [`World::state_hash`](../../crates/sim/src/world.rs#L2967), [`Scenario::fingerprint`](../../crates/sim/src/scenario.rs#L386), and pinned constants in tests.
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
| `LAB_HASH` | `0xfe31370e141ef531` | [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs#L4438) and [`tools/wasm_check.js`](../../tools/wasm_check.js#L37) | Not re-pinnable. It names its scenario and policy; investigate a move. |
| `GOLDEN_STATE_HASH` | `0xbe85089325550cf2` | [`crates/sim/tests/determinism.rs`](../../crates/sim/tests/determinism.rs#L353) | `cargo test -p sim --test determinism -- --nocapture golden` |
| `ROOM_HASH` | `0x98441a18db7a95ca` | [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs#L4497) and [`tools/wasm_check.js`](../../tools/wasm_check.js#L44) | `cargo test -p web -- --ignored --nocapture print_the_golden_hashes` |
| `BATTLE_HASH` | `0x9aafe4bd54560586` | [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs#L4503) and [`tools/wasm_check.js`](../../tools/wasm_check.js#L50) | Same browser-golden command; update both owners. |
| `SWAP_HASH` | `0xf948f5486ee90191` | [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs#L4519) and [`tools/wasm_check.js`](../../tools/wasm_check.js#L61) | Same browser-golden command; update both owners. |
| `BOW_HASH` | `0x4a1157735d305e9f` | [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs#L4524) and [`tools/wasm_check.js`](../../tools/wasm_check.js#L70) | Same browser-golden command; update both owners. |

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

> **Pending, not current:** v2-10 plans separate, versioned scenario, state, and
> replay hash domains plus a validated replay codec. None of those guarantees exists
> in the current streams above.

## Source anchors

- FNV-1a implementation and byte order: [`Hash64`](../../crates/fx/src/hash.rs#L9)
- Scenario stream and current omission: [`Scenario::fingerprint`](../../crates/sim/src/scenario.rs#L386)
- Live state stream: [`World::state_hash`](../../crates/sim/src/world.rs#L2967)
- In-memory replay and integrity check: [`Replay`](../../crates/sim/src/replay.rs#L57)
- Replay playback order: [`Replay::play_until`](../../crates/sim/src/replay.rs#L137)
