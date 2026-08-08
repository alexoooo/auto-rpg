# v2-10 — make replay identity and hash domains explicit

**Goal:** repair current scenario identity, add a durable fail-closed replay codec,
and establish separate legacy/articulated hash domains before articulated state.

**Depends on:** Track 1. It does not depend on the visual track.

**Golden expectation:** all six legacy state hashes remain byte-identical. Scenario
fingerprints for scenarios containing loadouts intentionally change; no state golden
is re-pinned.

Read `docs/reference/determinism.md` before editing.

## Scenario identity

At `Scenario::fingerprint` in `crates/sim/src/scenario.rs`, hash both loadout slots in
stable slot order, including item discriminant and all construction-relevant item
parameters. Add `CombatModel { Legacy, Articulated }` to `Scenario`; every existing
constructor explicitly writes `Legacy`. Include combat model in the new replay
scenario identity while preserving legacy `World::state_hash` bytes.

Future immutable body/anatomy/equipment/grip definitions must implement one canonical
`fingerprint_into` and be called here; `v2-12`/`v2-15` extend the codec before their
types become constructible.

## Persisted envelope

Add `crates/sim/src/codec.rs` and extend `crates/sim/src/replay.rs` at `pub struct
Replay`:

```rust
pub const REPLAY_CODEC_VERSION: u16 = 1;
pub struct ReplayEnvelope {
    pub command_schema: u16,
    pub hash_domain: HashDomain,
    pub scenario_fingerprint: u64,
    pub seed: u64,
    pub tick_limit: u32,
    pub replay: Replay,
}
pub enum ReplayDecodeError { /* closed, field-specific errors */ }
```

The codec is dependency-free, little-endian, and begins `ARPG`, codec version,
command schema, hash domain/schema, total payload length, scenario fingerprint, seed,
tick limit, then length-prefixed scenario/command/order/objective records. Exact
field order and maximum lengths live in `docs/reference/replay-codec.md`.

Decode rejects unknown versions/discriminants, overflow, excessive counts, invalid
entity generations, non-monotonic tick order, records after the tick limit, command
model mismatch, fingerprint mismatch, and trailing bytes before constructing a
`World`. Existing in-memory fixtures remain supported through `Replay`; there were no
persisted legacy files, so unknown older envelopes are explicitly rejected rather
than guessed.

## Hash domains

Add `crates/sim/src/hash_domain.rs`:

```rust
pub enum HashDomain { LegacyV1, ArticulatedV1 }
pub struct StateDigest { pub domain: HashDomain, pub schema: u16, pub value: u64 }
```

`World::state_hash()` remains the exact existing legacy byte writer and is valid only
for `Legacy`. `World::state_digest()` returns the domain alongside its digest.
LegacyV1 adds no tag or neutral articulated bytes. ArticulatedV1 begins with ASCII
`ARPG-STATE`, schema `1`, `CombatModel`, submitted-command schema, then every
authoritative/cached articulated column in the order documented by
`docs/reference/hash-domains.md`. Cross-domain replay/wasm comparisons return a domain
error, not an ordinary hash mismatch.

Each later articulated state type supplies `hash_articulated_into`; its phase adds a
test that mutating each field changes ArticulatedV1 while LegacyV1 stays unchanged.

## Tests and verification

```text
scenario_fingerprints_distinguish_loadouts
legacy_state_hash_bytes_are_unchanged
replay_codec_round_trips_every_legacy_record
replay_decoder_rejects_bad_lengths_discriminants_order_and_trailing_data
replay_decoder_rejects_a_command_model_mismatch
cross_domain_digest_comparisons_are_rejected
```

```powershell
cargo test -p sim
cargo test
cargo run --release -p lab -- hash
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
git diff --check
```
