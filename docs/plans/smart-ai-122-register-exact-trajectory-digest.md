# Smart AI 122 -- register the exact trajectory state digest

**Status:** planned and unblocked by Smart127's ordinary body-wall receipt. No digest
value has been measured or registered. The value remains deliberately `TBD`; execute
this registration from the reviewed Smart127 fixture rather than the stopped
Smart121 east-wall premise.

This session closes Smart36's missing feature-only portability pin. It does not move
an existing pin or make exact diagnostics part of the frame, replay or publication
ABI.

## A -- one authoritative grammar

In the Smart121 shared diagnostic module, add:

```rust
#[cfg(feature = "cartesian-recoil")]
pub fn exact_trajectory_state_digest() -> u64;
```

The function reruns the exact Smart121 stored-command fixture. It must first prove
live/rerun/replay equality and every required wall/remainder/release witness, then
hash the replayed stream. It exposes only `u64`; exact owner and remainder types stay
crate-private.

Hash with `fx::Hash64` in this literal order:

```text
"ARPG-EXACT-TRAJECTORY-V1"
u16 grammar version = 1
u64 scenario fingerprint
u64 seed = 0
u32 recorded tick count

per tick, ascending:
  u32 tick
  u32 submitted-command count
  per stored command, entity order:
    u32 entity index, u32 generation, u16 schema, u16 payload length, payload bytes
  u8 state digest domain, u16 state digest schema, u64 state digest value
  u32 contact cap hits
  first exact refusal: u8 presence, then outer cause/phase/detail/key words
  u32 resolution count
  each resolution in production order:
    group ordinal, alpha
    complete ContactKey identities/slots/kind, region, TOI
    point, normal, velocity A/B as signed raw XYZ
    impulse A/B as signed raw XYZ
    energy before/after/dissipated
    cut, thrust, pressure, deflected, severed
  u32 exact external row count
  each row: entity identity, lane, reason, i128 signed numerator LE,
            i128 denominator LE

final u32 accepted-group count
final u8 momentum-remainder, position-remainder, wall and release witnesses
```

The articulated state digest already owns anatomy, grips and exact owner words; the
explicit resolution and external rows make the evidence grammar independently
reviewable. Do not hash scratch capacities, pointers, wall time or diagnostics that
do not affect the named first refusal.

Add tests proving that changing one stored command byte, owner remainder, external
reason, selected impulse or refusal code changes the digest. A second identical run
must not change it.

## B -- feature-only web boundary and paired pin

In [`crates/web/src/lib.rs`](../../crates/web/src/lib.rs), cache the diagnostic once
per module and add only under `cartesian-recoil`:

```rust
pub extern "C" fn exact_trajectory_state_digest_lo() -> u32;
pub extern "C" fn exact_trajectory_state_digest_hi() -> u32;
```

Add the native paired assertion constant there, initially as a temporary printed
value rather than a guessed pin. Extend [`tools/wasm_check.js`](../../tools/wasm_check.js)
so `ARPG_CARTESIAN_RECOIL=1` requires the two exports, compares them with the same
constant, calls twice and proves no second-call memory growth. Default mode must
prove the feature-only exports are absent. Add the agreed row to
[`docs/reference/hashes.md`](../reference/hashes.md#golden-registry) only after both
targets answer the same value.

The registered owner set is exactly Rust, JavaScript and the golden registry. The
re-record path is a planned change to exact owner grammar, exact lifecycle rows,
resolution grammar or this fixture, followed by native live/rerun/replay and fresh
wasm agreement. A disagreement is a portability failure, not a number to choose.

## Verification

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test -p sim --features cartesian-recoil exact_trajectory_state_digest -- --nocapture
cargo test -p web --features cartesian-recoil exact_trajectory_state_digest -- --nocapture
cargo test
cargo test --workspace --features cartesian-recoil
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
$env:ARPG_CARTESIAN_RECOIL='1'
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

Record both values, artifact paths, byte lengths, full SHA-256, memory pages before/
first/second call and test logs. Expected existing pin moves are zero.
