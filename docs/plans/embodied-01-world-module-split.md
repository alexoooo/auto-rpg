# Embodied 01 -- `world.rs` becomes a module tree

**Status:** proposed.

Pure move. No expression changes, no visibility changes, no behaviour. The whole of
the session's value is that sessions 03 through 09 stop editing a 20,470-line file,
and the whole of its risk control is that a move is provable in a way a rewrite is
not.

## The measurement this session is sized from

Taken 2026-08-17. `crates/sim/src/world.rs` is 20,470 lines. Its first
`#[cfg(test)] mod tests` opens at
[`world.rs#L7930`](../../crates/sim/src/world.rs#L7930) and a second,
`articulated_projectile_tests`, at
[`world.rs#L20201`](../../crates/sim/src/world.rs#L20201). So the file is about 7.9k
lines of production `World` followed by 12,541 lines of tests, and the tests for the
arm driver sit roughly nine thousand lines from the arm driver.

Both numbers matter and they pull in the same direction: the production split is what
sessions 03 onward need, and the test split is what makes reviewing those sessions
possible at all.

## Why no field changes visibility

`struct World` at [`world.rs#L188`](../../crates/sim/src/world.rs#L188) has about
ninety private columns and every one of them stays private. In Rust a private item is
visible to the module that defines it **and to all of that module's descendants**, so
if `struct World` stays in `world/mod.rs` and the `impl World` blocks move into
children of `world`, the children read `self.arms`, `self.vel` and `self.contact`
exactly as they do now.

The alternative -- `pub(crate)` on the columns -- would grant `codec.rs`, `replay.rs`
and `obs.rs` write access to authoritative state that they currently reach only
through methods, which is a real loss of a real boundary in exchange for nothing.
**If a field has to change visibility to make the split compile, the split is in the
wrong place.** Move the function instead.

## Module tree

```text
crates/sim/src/world/
    mod.rs            struct World, its columns, construction, spawn, step
    query.rs          read-only accessors, observe, observe_articulated, poses
    hash.rs           state_hash, state_digest
    legacy.rs         the Legacy phase bodies
    movement.rs       apply_movement, apply_articulated_movement, separate
    navigation.rs     refresh_pending, refresh_nav, nav_step
    articulated.rs    yaw, grips, arms, geometry, anatomy, reap
    projectile.rs     the articulated projectile lifecycle
    contact_phase.rs  retain/record/resolve/stage/commit/clamp/build
    props.rs          press_doors, dungeon prop swings
```

`mod.rs` keeps `step` and `step_with_arm_rates`
([`world.rs#L3009`](../../crates/sim/src/world.rs#L3009) and
[`world.rs#L3033`](../../crates/sim/src/world.rs#L3033)) because the phase order is
the file's thesis and a reader should meet it first. Session 02 turns that body into
data; this session does not touch it.

Function homes, by their current anchors:

| destination | moves |
|---|---|
| `query.rs` | `observe` [L2025](../../crates/sim/src/world.rs#L2025), `observe_articulated` [L2186](../../crates/sim/src/world.rs#L2186), `articulated_pose` [L2528](../../crates/sim/src/world.rs#L2528), `articulated_poses` [L2602](../../crates/sim/src/world.rs#L2602), `shots` [L4866](../../crates/sim/src/world.rs#L4866) |
| `hash.rs` | `state_hash` [L4900](../../crates/sim/src/world.rs#L4900), `state_digest` [L5116](../../crates/sim/src/world.rs#L5116) |
| `legacy.rs` | `regenerate` [L3164](../../crates/sim/src/world.rs#L3164), `drive_limbs` [L3261](../../crates/sim/src/world.rs#L3261), `resolve_parries` [L3497](../../crates/sim/src/world.rs#L3497), `resolve_swings` [L3595](../../crates/sim/src/world.rs#L3595), `resolve_shots` [L3865](../../crates/sim/src/world.rs#L3865), `apply_impulses` [L4132](../../crates/sim/src/world.rs#L4132), `apply_recoil` [L4191](../../crates/sim/src/world.rs#L4191), `reap_dead` [L4268](../../crates/sim/src/world.rs#L4268), `reap_shot` [L3399](../../crates/sim/src/world.rs#L3399) |
| `movement.rs` | `apply_movement` [L3222](../../crates/sim/src/world.rs#L3222), `separate` [L3407](../../crates/sim/src/world.rs#L3407), `apply_articulated_movement` [L4904](../../crates/sim/src/world.rs#L4904) |
| `navigation.rs` | `expire_unanswered_decisions` [L3136](../../crates/sim/src/world.rs#L3136), `refresh_pending` [L4414](../../crates/sim/src/world.rs#L4414), `refresh_nav` [L4433](../../crates/sim/src/world.rs#L4433), `nav_step` [L4659](../../crates/sim/src/world.rs#L4659) |
| `articulated.rs` | `drive_body_yaw` [L4922](../../crates/sim/src/world.rs#L4922), `initialize_articulated_pose` [L5276](../../crates/sim/src/world.rs#L5276), `settle_anatomy` [L5311](../../crates/sim/src/world.rs#L5311), `reap_dead_articulated` [L5347](../../crates/sim/src/world.rs#L5347), `anatomy_spec` [L5367](../../crates/sim/src/world.rs#L5367), `derive_shield_pose` [L5397](../../crates/sim/src/world.rs#L5397), `apply_articulated_grips` [L5625](../../crates/sim/src/world.rs#L5625), `drive_articulated_arms` [L5674](../../crates/sim/src/world.rs#L5674), `derive_articulated_geometry` [L5876](../../crates/sim/src/world.rs#L5876) |
| `projectile.rs` | the `articulated_projectile_*` group and `loose_articulated_projectiles` [L5818](../../crates/sim/src/world.rs#L5818), `resolve_articulated_projectiles` [L5850](../../crates/sim/src/world.rs#L5850) |
| `contact_phase.rs` | `retain_contact_entry` [L5887](../../crates/sim/src/world.rs#L5887), `record_contact_locomotion` [L5920](../../crates/sim/src/world.rs#L5920), `resolve_contact` [L5952](../../crates/sim/src/world.rs#L5952), `stage_exact_contact` [L6227](../../crates/sim/src/world.rs#L6227), `commit_exact_contact` [L6312](../../crates/sim/src/world.rs#L6312), `commit_contact` [L6432](../../crates/sim/src/world.rs#L6432), `clamp_contact_entry` [L6668](../../crates/sim/src/world.rs#L6668), `build_contact_colliders` [L6764](../../crates/sim/src/world.rs#L6764), `contact_body_sweep` [L6940](../../crates/sim/src/world.rs#L6940), and the recoil-energy group headed by [`record_recoil_external`](../../crates/sim/src/world.rs#L5545) |
| `props.rs` | `press_doors` [L4302](../../crates/sim/src/world.rs#L4302), `resolve_dungeon_prop_swings` [L3805](../../crates/sim/src/world.rs#L3805) |

Tests move with the code they cover, into a `#[cfg(test)] mod tests` at the foot of
the module that now owns the subject. `articulated_projectile_tests` becomes
`projectile.rs`'s test module under its existing name. A test whose subject spans two
modules stays with the phase it asserts about, not the phase it sets up.

## Two hazards, both already recorded in this repository

**`cargo fmt` is not available to make this tidy.** The tree is deliberately not
rustfmt-clean and running it produces an enormous unrelated diff. Move blocks
verbatim, keep the hand formatting, and let the indentation stay as it was.

**Prose writes down line numbers, and every one of them is about to move.**
`docs/reference/hashes.md` alone carries `world.rs#L4900`, `world.rs#L15481` and
`world.rs#L12005`-shaped anchors, and `docs/architecture/simulation.md` is required
by `tools/check_docs.js` to hold a `#L` anchor whose window contains `pub fn step (`.
That checker is a rot detector: it verifies the anchor's *claim*, so a stale one
fails rather than passing quietly. Run it, and expect to fix anchors in
`hashes.md`, `simulation.md`, `replay-hashing.md`, `articulated-actuators.md`,
`contact-solver.md` and `combat-geometry.md`.

## Tests

Add to `crates/sim/tests/`:

- `the_split_preserves_every_legacy_phase_and_its_order`
- `the_split_preserves_every_articulated_phase_and_its_order`

Both drive the existing `#[cfg(test)]` phase trace -- `phase_trace_enabled` and
`phase_trace` at [`world.rs#L279`](../../crates/sim/src/world.rs#L279) -- over one
`Legacy` and one `Articulated` scenario and assert the recorded `&'static str`
sequence equals a literal written out in the test. The trace exists precisely so an
ordering can be proved rather than argued from the reading order of a `match`, and
this is the session it was waiting for.

**Show them failing before believing them.** Swap two adjacent phase calls in
`step_with_arm_rates`, watch both go red, and put the calls back. A phase-trace test
whose literal was copied out of a passing run asserts nothing.

## Verification

```powershell
cargo test
cargo run --release -p lab -- hash
cargo run --release -p lab -- verify --seeds 200
cargo run --release -p lab -- duel   --seeds 400
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
```

## Hash expectation

**Nothing moves.** `LAB_HASH`, `GOLDEN_STATE_HASH`, `ROOM_HASH`, `BATTLE_HASH`,
`SWAP_HASH`, `BOW_HASH`, `COMBAT_GEOMETRY_HASH`, `ARTICULATED_COMMAND_HASH`,
`CONTACT_BEHAVIOR_DIGEST`, `ARTICULATED_STREAM_DIGEST`, the contact format corpus,
the combat spec-table digest, the `articulated-duel-v1` fingerprint,
`LEARNED_INFERENCE_DIGEST`, `EXACT_TRAJECTORY_STATE_DIGEST`,
`LIFTED_COULOMB_SOLVER_DIGEST` and the legacy feature prefix all answer exactly what
they answer today, and `lab duel --seeds 400` returns its current win rates.

A move is not a number to re-record. It is a failed move, and the session reverts and
finds which expression changed.
