# Smart AI 122 -- register the exact trajectory state digest

**Status:** complete. Native and wasm integration verification passed, and both
targets answered
`EXACT_TRAJECTORY_STATE_DIGEST = 0x83051e8c6b4ef20f`, measured from the retained
ordinary north-wall replay rather than the rejected east-wall premise recorded in
the performance log.

This session closes the remaining feature-only trajectory portability pin. It does
not move an existing pin or make exact diagnostics part of the frame, replay or
publication ABI.

## A -- one authoritative grammar

Refactor the existing
`ordinary_exact_trajectory_crosses_a_wall_and_replays_every_authoritative_word`
fixture into a crate-private feature-gated diagnostic runner, then add:

```rust
#[cfg(feature = "cartesian-recoil")]
pub fn exact_trajectory_state_digest() -> u64;
```

The function reruns that exact stored-command fixture. It must first prove
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
  u32 post-step tick; its commands carry the preceding submitted tick
  u32 submitted-command count
  per stored command, entity order:
    u32 entity index, u32 generation, u16 schema, u8 kind, u8 reserved,
    u16 payload length, payload bytes
  u8 state digest domain, u16 state digest schema, u64 state digest value
  u32 contact cap hits
  first exact refusal: u8 presence, then u8 cause, u8 phase, u32 refusing tick,
                       u8 key presence, then key words
  first lifted group reject: u8 presence, then u8 detail
  u32 resolution count
  each resolution in production order:
    u8 group ordinal, u32 alpha
    complete ContactKey: u32+u32 identities, u8 slots/kind, u8 region, u32 TOI
    point, normal, velocity A/B as signed raw i32 XYZ
    impulse A/B as signed raw i32 XYZ
    u64 energy before/after/dissipated
    u64 cut, thrust, pressure, deflected, u8 severed
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

Tests prove that changing one stored command byte, a real retained owner remainder,
an external reason, a selected impulse or each refusal word changes the digest. A
second identical run does not change it. The first-refusal type has no detail field;
V1 therefore writes the lifted group-reject detail as a separately tagged section
rather than inventing a zero word.

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

The verified feature artifact at
`target/wasm32-unknown-unknown/release/web.wasm` was 1,012,971 bytes with SHA-256
`8C8546CD60DADA2F5F8948A01288900DA267E69886DD0CA8A0B395669ECCA472`. Its diagnostic
warm-up/first/second page receipt was `29/165/165`; the second read neither grew
memory nor detached an installed pose view. The default artifact was 655,770 bytes,
SHA-256 `190B95523B666D69D023FCEBD32D271AE44318EB103AAD46CF020F7BBE452DD0`,
and exported neither half. Focused sim and web tests, both workspaces, and both direct
`wasm_check.js` modes passed; each wasm run reported 29/29 passing. The default was
rebuilt and checked again last, leaving the shipped artifact on disk. Expected
existing pin moves were zero and none moved.
