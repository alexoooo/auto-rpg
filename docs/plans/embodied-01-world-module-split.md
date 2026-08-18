# Embodied 01 -- `world.rs` becomes a module tree

**Status:** complete. Landed 2026-08-17. No pin moved.

Pure move. No expression changes, no field visibility changes, no behaviour. The
whole of the session's value is that sessions 03 through 09 stop editing a
20,470-line file, and the whole of its risk control is that a move is provable in a
way a rewrite is not.

## The measurement this session was sized from

Taken 2026-08-17, before the move. `crates/sim/src/world.rs` was 20,470 lines. Its
first `#[cfg(test)] mod tests` opened at line 7930 and a second,
`articulated_projectile_tests`, at 20201. So the file was about 7.9k lines of
production `World` followed by 12,541 lines of tests, and the tests for the arm
driver sat roughly nine thousand lines from the arm driver.

Both numbers mattered and they pulled in the same direction: the production split
is what sessions 03 onward need, and the test split is what makes reviewing those
sessions possible at all.

## Why no field changed visibility

`struct World` at [`world/mod.rs#L143`](../../crates/sim/src/world/mod.rs#L143) has
about ninety private columns and **every one of them is still private**. In Rust a
private item is visible to the module that defines it *and to all of that module's
descendants*, so with `struct World` in `world/mod.rs` and the `impl World` blocks
in children of `world`, the children read `self.arms`, `self.vel` and `self.contact`
exactly as they did.

The alternative -- `pub(crate)` on the columns -- would have granted `codec.rs`,
`replay.rs` and `obs.rs` write access to authoritative state that they reach only
through methods, which is a real loss of a real boundary in exchange for nothing.
**If a field has to change visibility to make the split compile, the split is in the
wrong place.** Move the function instead.

Thirty-nine **methods** did gain `pub(super)`, and that is a different thing.
`pub(super)` inside `world` means "visible in `world` and its descendants", which is
exactly the reach these had as private items of one file -- so nothing outside
`world` can see anything it could not see before. The list was not guessed: it is
every `E0624` the first build of the tree reported, which is also why it is worth
reading. It is the tick's own interface, and session 02's phase table is built from
it.

## Module tree

```text
crates/sim/src/world/
    mod.rs            2753  struct World, its columns, construction, submission, step
    query.rs          3174  read-only accessors, observe, observe_articulated, poses
    hash.rs           1043  state_hash, state_digest, legacy_core_hash
    legacy.rs         3263  the Legacy phase bodies and combat scalars
    movement.rs        764  apply_movement, apply_articulated_movement, separate
    navigation.rs      802  refresh_pending, refresh_nav, nav_step, the decision clock
    articulated.rs    1819  yaw, grips, arms, shield pose, anatomy
    projectile.rs      424  the articulated projectile lifecycle
    contact_phase.rs  5855  retain/record/resolve/stage/commit/clamp/build
    props.rs           294  press_doors, dungeon prop swings
    testkit.rs         458  #[cfg(test)] fixtures shared by more than one module
```

The dividing rule, stated once because every later session will apply it:
**`mod.rs` owns the state and the phase order; a sibling owns a transformation of
that state.** So the value types the columns are made of -- `ContactRuntime`,
`TickEntry`, `Blow`, `Pierce`, `Impulse`, `Nav`, `DoorState` -- stayed with the
struct, while `ContactProjector`, which is a borrow held for the length of one call,
went to `contact_phase.rs` with its caller.

`mod.rs` keeps `step` and `step_with_arm_rates` because the phase order is the
file's thesis and a reader should meet it first. Session 02 turns that body into
data; this session did not touch it.

Tests moved with the code they cover, into a `#[cfg(test)] mod tests` at the foot of
the module that now owns the subject. `articulated_projectile_tests` became
`projectile.rs`'s second test module under its existing name. `testkit.rs` exists
because a fixture used by tests in two destinations has to live somewhere both can
see; a fixture used by one destination stayed there.

## How the move was made, and how it was checked

The split was mechanical rather than retyped. A brace-matching splitter cut the file
into 610 units -- top-level items, `impl World` members, `mod tests` members -- each
carrying its own doc comment and attribute run, with a coverage assertion that every
non-blank line belonged to exactly one unit. The emitter then copied units verbatim
into their destination and re-checked that the multiset of non-blank lines out
equalled the multiset in, modulo the two deliberate edits: the four columns of
indent `testkit` lost by rising a nesting level, and the `pub(super)` prefixes.

That is the property worth keeping in mind when reading the diff: **no line of
`world.rs` was retyped**, so the only hand-written text in the whole session is the
eleven module headers and the `use` lines the emitter generated.

## Two hazards, both already recorded in this repository

**`cargo fmt` is not available to make this tidy.** The tree is deliberately not
rustfmt-clean and running it produces an enormous unrelated diff. Blocks moved
verbatim and the hand formatting survived.

**Prose writes down line numbers, and every one of them moved.** All 82 `#Lnnn`
anchors were retargeted from the unit map rather than by searching for a line of
text, so an anchor that named a symbol still names it and an anchor into a line the
split did not carry would have been reported rather than silently landing nearby.
`tools/check_docs.js` itself carried two `crates/sim/src/world.rs` paths in
`requireSymbolAnchor` calls and they now name `world/mod.rs` and `world/hash.rs`.

Two anchors in `smart-ai-133` turned out to have been **stale before the split** --
they named `build_contact_colliders` and `build_exact_contact_trajectories` at lines
inside neither -- and were corrected rather than translated.

## The proof, and where it actually lives

The plan called for `the_split_preserves_every_legacy_phase_and_its_order` and
`the_split_preserves_every_articulated_phase_and_its_order` in `crates/sim/tests/`.
**They cannot go there, and the reason is the session's own thesis:**
`phase_trace_enabled` and `phase_trace` are private columns of `World`, and keeping
them private is exactly what this split preserves. An integration test outside the
crate would need them `pub(crate)`, which the rule above forbids.

The proof already existed in-crate and needed no duplicate. `the_legacy_phase_trace_is_unchanged`
and `articulated_contact_runs_after_geometry_and_before_doors` each drive the
`#[cfg(test)]` trace over their model and assert the recorded `&'static str`
sequence against a literal. Both moved into
[`world/mod.rs`](../../crates/sim/src/world/mod.rs#L1715) beside
`step_with_arm_rates`, which is the code they are about.

**Shown failing before being believed.** Swapping `separate` with `drive_limbs` in
the Legacy arm and `grips` with `arms` in the Articulated arm turned both red, each
naming the transposed pair in its diff; the swap was reverted and both went green
again. A phase-trace literal copied out of a passing run asserts nothing.

Four phases still run untraced -- `resolve_dungeon_prop_swings`,
`loose_articulated_projectiles`, `resolve_contact` and
`resolve_articulated_projectiles` -- because the trace names are hand-written beside
the calls rather than read off a schedule. That is the defect
[session 02](embodied-02-phase-schedule-and-seams.md) exists to remove, and it is
why session 02 owns the trace literals changing.

## The break the default build could not see

`cargo test` was green and stayed green, and the split had nonetheless broken
`cargo test -p sim --features cartesian-recoil` in five separate ways. Every one of
them was invisible without the feature:

- `ExactArmCommit` and `ExactCommitRow` went to `contact_phase.rs`, and they are the
  shape of a `World` column that only exists under the feature -- so `struct World`
  could not see its own field's type. They are back in `mod.rs`, where the rule above
  says they always belonged.
- pruning `actuator.rs`'s now-unused `Vec2` and `mul_div` imports was safe on the
  default build and wrong under the feature, whose bodies are the only readers.
- five more methods and two free functions cross a module boundary only under the
  feature, so only the feature build could name them: `clamp_to_arena`,
  `exact_owner_for_grips`, `initial_exact_owner`,
  `prepare_zero_response_grip_transition`, `release_severed_grips`,
  `hash_exact_owners` and `scale_contact_vector`.
- `testkit`'s `Smart60Entry` rose a nesting level with `pub(super)` on the struct and
  not on its fields, which only a feature-gated reader touches.

**The lesson is the one `AGENTS.md` already gives about `wasm_check.js`, in a second
place: a gate that was not run is not a gate.** `cargo test` alone cannot see a
`#[cfg(feature)]` body, and this repository has a feature whose bodies are a third of
`world/`. `cargo test -p sim --features cartesian-recoil` and
`cargo build --release -p lab --features cartesian-recoil` belong in the checklist for
any structural change, and they are in the verification block below now.

Session 03 owed the same build two more arms -- `HashDomain::EmbodiedV1` in
`exact_diagnostics.rs` and in `lab`'s `hash_domain_name` -- found the same way.

## Verification, as run

```powershell
cargo test                                                     # 1156 passed, 0 failed
cargo test -p sim --features cartesian-recoil                   # 783 passed, 0 failed
cargo build --release -p lab --features cartesian-recoil
cargo run --release -p lab -- hash                              # 0xfe31370e141ef531
cargo run --release -p lab -- verify --seeds 200
cargo run --release -p lab -- duel   --seeds 400
cargo run --release -p lab -- articulated --seeds 400 --mirrored
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js                                 # 32 passed, 0 failed
node tools/check_docs.js
```

`cargo test` reported **1156 passed** both before and after, which is the count that
says no test was lost in a 12,541-line test move rather than quietly dropped on the
floor.

## Hash expectation, and what happened

**Nothing moved, as predicted.** `LAB_HASH` answers `0xfe31370e141ef531`;
`verify --seeds 200` reports "identical on re-run and exact on replay"; `duel --seeds
400` reports the same 238/162, 59.5%, 1414-tick mean and 0.3033 ending health;
`articulated --seeds 400 --mirrored` reports the same fixture pair
`0x068d05fcada1027b` / `0x6dbf62f0b336050b`, the same 285/299 split, the same
1,761,481 resolutions and the same 337 severances. The in-crate goldens --
`GOLDEN_STATE_HASH`, `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH`, `BOW_HASH`,
`COMBAT_GEOMETRY_HASH`, `ARTICULATED_COMMAND_HASH`, `CONTACT_BEHAVIOR_DIGEST`,
`ARTICULATED_STREAM_DIGEST`, the contact format corpus, the combat spec-table
digest, `LEARNED_INFERENCE_DIGEST`, `EXACT_TRAJECTORY_STATE_DIGEST`,
`LIFTED_COULOMB_SOLVER_DIGEST` and the legacy feature prefix -- are asserted by
`cargo test` and `wasm_check.js`, both green.

A move would not have been a number to re-record. It would have been a failed move,
and the session would have reverted and found which expression changed.
