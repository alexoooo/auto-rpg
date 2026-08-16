# Combat arms 04 -- a guard arm that moves freely

**Status:** **completed 2026-08-16.** See the closing note at the foot of this file.
Independent of sessions 01-03. See [the overview](combat-arms-00-overview.md).

**This session reopens a decision the project already measured and settled, so it must
answer that measurement rather than ignore it.** Read
`crates/policy/src/articulated_script.rs`'s argument for `off_hand`, and
`docs/reference/articulated-mechanical-gate.md`'s guard sections, before writing code.

## The contract is already free; the weld is policy

`bearing` is **never validated**. `validate_articulated` in
`crates/sim/src/command.rs` bounds height, reach and effort and never touches it, and
`docs/reference/articulated-command-v1.md` says angles accept every `u16` value.
`CombatHeight` is likewise a continuous channel with three named constants, not three
bins -- `combat_height_accepts_every_in_range_raw_value_without_quantizing` pins that.

The actual constraint is `off_hand` in `crates/policy/src/articulated_script.rs`,
applied **last and unconditionally**, which overwrites the twelve-phase table's guard
clause on any shielded body with `bearing: body_yaw`, `reach: 3/4`, `effort: 1/2`, and
only `height` live on a clock.

## Why it is welded, and why that must be answered

`derive_shield_pose` in `crates/sim/src/world.rs` takes the plate's **centre from the
hand** and its **normal from body yaw**. A free bearing therefore walks the plate's
position away from its facing. That was measured over 2.86 million shield samples: the
incoherence ran the full 0-180 degrees with a **median of 32 degrees and 1.84% of ticks
edge-on**; welding the bearing to yaw collapses it to a fixed 23.96 degrees for a
Fighter.

So freeing the bearing in policy alone does not restore a shield arm -- it restores a
plate that intercepts somewhere its facing disagrees with. **Do both halves.**

## The change

1. **Policy.** Give the guard arm its bearing back within a bounded arc, tracking the
   threat rather than the body. `assess_threat` in
   `crates/policy/src/articulated_tactics.rs` already extrapolates the opponent's
   weapon segments and finds a crossing tick; `can_cover` already predicts where the
   guard could be. The bearing is the column those two were always missing.
2. **Sim.** Make the shield normal follow the holding arm.
   `docs/reference/articulated-actuators.md` currently states that the arm target
   cannot add an orbit offset to the normal -- **amend that contract first, in the same
   commit**, then change `derive_shield_pose`.

Doing 1 without 2 is a policy change that re-widens a measured defect; doing 2 without
1 changes a normal nothing varies. They are one session for that reason.

## Three copies of the weld, and one has no guard

- `crates/policy/src/articulated_script.rs` -- `off_hand`, the original.
- `crates/learn-core/src/model.rs` -- a **duplicate** `off_hand` with the same
  signature; its own comment argues the duplication and names the trap.
  `the_action_table_is_the_scripts_own_vocabulary` is the test that catches drift
  between them, and it is why the learned action vocabulary must be checked before
  editing either.
- `crates/policy/src/articulated_tactics.rs` -- the intercept feasibility model
  **assumes** the plate sits at `body_position + forward * arm_length * GUARD_REACH`.
  That assumption becomes wrong the moment bearing is free, and **nothing guards it
  today**. Add the guard as part of this session: a test that the predicted plate
  position agrees with `derive_shield_pose` for a non-zero guard bearing.

Also re-check `an_empty_off_hand_does_not_lengthen_the_arm_it_hangs_from`: the guard
arm's own capsule runs shoulder to hand, so a swinging guard changes what the **arm**
intercepts, not only what the plate does.

## Tests

- `a_freed_guard_bearing_moves_the_plate_the_solver_sweeps` -- the mechanical claim:
  two identical worlds differing only in commanded guard bearing produce different
  `WeaponShield` outcomes.
- `the_shield_normal_follows_the_arm_that_holds_it` -- bounded from both sides: at zero
  offset it equals body yaw exactly, and at a non-zero bearing it equals the arm, not
  something in between.
- `the_intercept_model_agrees_with_the_derived_plate_at_a_nonzero_guard_bearing` -- the
  missing guard named above.
- `a_bodiless_guard_arc_is_clamped_rather_than_wrapped` -- the bounded arc, both ends.

## Verification

```powershell
cargo test
cargo test --workspace --features cartesian-recoil
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
git diff --check
```

**Predicted pin movement: `ARTICULATED_COMMAND_HASH` and `ARTICULATED_STREAM_DIGEST`,
both paired native and wasm.** The first moves because `initialize_articulated_pose`
derives the shield pose at spawn and the command digest is taken against an
**unstepped** world, so the plate's extents and normal are construction rows. The
second moves because the plate's half-extents are published words in the pose row.
Predict both in writing before running the gate and re-record each in **both** owners.

`LEARNED_INFERENCE_DIGEST` must **not** move: this session changes a guard bearing, not
the model shape, the feature layout, the action layout or the forward pass. If it
moves, the `learn-core` duplicate of `off_hand` was edited in a way that changed the
action vocabulary -- stop and reconsider, because that is a re-score, not a re-record.

Re-measure the guard corpus in `docs/reference/articulated-mechanical-gate.md`: the
weapon/shield share of resolutions, and the plate-coherence distribution whose median
of 32 degrees is the number this session is answering. Record the new distribution
beside the old one rather than replacing it.

## Completed, 2026-08-16

**Both halves landed, sim first.** `derive_shield_pose` takes the plate's normal from
the carrying arm's bearing; `articulated_script::off_hand` tracks the threat inside
`GUARD_ARC`, an eighth turn either side of the commanded yaw, clamped and never
wrapped, falling back to the yaw exactly when nothing is visible. The actuator
contract was amended in the same change, including its frozen test vector, which read
"at yaw quarter-turn ... regardless of its arm bearing" and now reads the other way
round.

### The pin prediction in this file was wrong, and for the same reason session 02's was

**Predicted here: `ARTICULATED_COMMAND_HASH` and `ARTICULATED_STREAM_DIGEST` both move.
Measured: neither moved, and nothing else did.** Both were predicted *not* to move in
writing before the gate ran, off the fixtures rather than off the subsystem:

- `ARTICULATED_COMMAND_HASH` is taken against an **unstepped** world, and
  `initialize_articulated_pose` tucks every arm at `Angle::ZERO`. The only shielded
  body in the fixture is the Fighter, which spawns at yaw zero. So the construction
  normal is `Vec3::X` under both the old rule and the new one --
  `articulated_spawn_initializes_yaw_arms_grips_and_shield_exactly` asserts exactly
  that and never went red.
- `ARTICULATED_STREAM_DIGEST`'s fixture states its own answer:
  `drive_stream_digest_script`'s comment is *"Both bearings are zero, and that is the
  fixture's whole trick"* -- body yaw and both arm bearings are commanded to
  `Angle::ZERO` for the whole run, so the published normal is `(1,0,0)` either way.

That is two consecutive sessions where this topic's plan predicted a move that could
not happen. The rule the overview now carries -- read a pin prediction off the fixture,
not off the subsystem -- earned its second confirmation here.

Verified by diffing every wide hash literal against `HEAD` rather than by trusting the
suite: `docs/reference/hashes.md` 39 identical, `crates/web/src/lib.rs` 28,
`tools/wasm_check.js` 22, `crates/sim/src/combat/arena.rs` 7,
`crates/sim/src/world.rs` 6, `crates/sim/src/combat/spec.rs` 2. `hashes.md`'s diff is
anchor drift alone. `LEARNED_INFERENCE_DIGEST` is untouched **by construction**: the
`learn-core` duplicate of `off_hand` keeps its weld, because those four columns are the
frozen learned action vocabulary and the shipped checkpoint was scored against a guard
that held the body's facing. Freeing it there is a re-score, not a re-record, and its
doc comment now says so instead of citing a sim rule that no longer exists.

### Three fixtures moved, none of them a pin

- **`CLINCH_CAP_TICK` 85 -> 88, and the drive changed.** The clinch fixture swept
  *both* arms an eighth turn either side of the body bearing. That was a position input
  while the normal ignored the arm; afterwards it also spins the plate's facing every
  four ticks -- a shield waved like a fan -- and the drive then never exhausts the group
  ordinal at all, measured out to 2048 ticks. The sweep is now the weapon arm's alone,
  which is what it was always for, and the cap returns three ticks later. Mirrored in
  `client/test/wasm-memory.test.mjs`. **This is a judgement call worth revisiting:** the
  alternative was to accept that the shipped drive no longer covers the cap path.
- **The intentional `EnergyNumerator` refusal moved back onto seed 5's windmill**, and
  off seed 14's composed. Smart134 had moved it the other way; seed 5 now pins both
  halves directly, which is the shape Smart102 left it in. Seed 14 is kept as a second
  ordinary case.
- **The learned duel in `tools/wasm_check.js` is decided at 259 rather than exhausted
  at 300**, and `the_index_survives_a_death`'s windmill seed-3 fight at 947 rather than
  2,620, with the survivor on `64_240`. Cross-checked natively: `lab trace --policy
  windmill --seed 3` reports "947 ticks, a body decided it / HeroesWin, hero 0.9802
  monster 0.0000, 917 contacts, 2 severances", and 0.9802 is exactly 64_240/65_536. The
  `articulated-duel-v1` fingerprint `0x068d05fcada1027b` is unchanged.

### Three more fixtures under the exact law, and one open gap

The `cartesian-recoil` build ends these fights on a body where the default law runs the
clock. All three are pinned per law rather than loosened to an inequality, because a
fight that stopped in its opening ticks would satisfy `< limit` and is exactly the
degenerate case each test exists to catch; a lower bound is asserted on both laws
beside the per-law pin.

- `a_zeroed_network_is_a_fighter_and_not_a_statue` (`crates/learn`): 600 -> **148**.
  This needed a **pass-through `cartesian-recoil` feature on `crates/learn`**, because
  `--workspace --features cartesian-recoil` builds that crate's tests against the exact
  `sim` while `cfg(feature = ...)` reads false inside it, so the test had no way to name
  which law it was measuring. The feature adds no API and is off by default;
  `check_deps` passes unchanged.
- `a_scripted_arena_fight_in_wasm_matches_the_same_fight_in_lab`: 300 -> **229**, and
  `pose_len` 2 -> **1**, because `pose_len` counts *live* bodies and one died. The
  arena-equals-lab equality above it did not move on either law, which is what says the
  two spellings of the loop still agree.

**The open gap: the exact build lost its multi-group clinch coverage.**
`contact_group_ordinals_restart_and_advance_within_each_tick` was merged from a
compatibility half and a feature-only half on 2026-08-15, and `saw_several` was earned
on both paths. Freeing the shield normal removed the exact law's two-group tick from
this drive. **It is the normal that removed it, not the drive** -- measured: the
original both-arm sweep fails it under the exact law too, and widening the window from
128 to 384 publications does not recover it. The ordering invariants are still asserted
on both laws; `saw_several` is now claimed only on the default. That is a recorded loss
belonging to the opt-in feature, not a solved problem, and it wants a drive that
produces two exact groups.

### Plate coherence, before and after

Both older distributions are kept in the gate reference; neither was deleted. The new
statement is a closed form rather than a histogram: `normal` and `hand - shoulder` are
one rotation of one reach vector, so the angle between them is **exactly zero at every
bearing and every tick**, including the 17.4% of ticks where the contact commit writes
the hand directly, because the derivation then reads the achieved bearing too.

| | welded (measured) | static off hand (measured) | free, following the arm |
|---|---|---|---|
| Median angle, normal vs hand offset from body origin | 32 deg | 24 deg mode, quartiles 23/27 | n/a -- see below |
| Ticks at 90 deg or worse | 1.84% | 0.85% | **0, by construction** |
| Angle, normal vs `hand - shoulder` | unbounded | unbounded | **exactly 0** |
| Residual vs body origin | -- | -- | the shoulder offset, 0.2500 world units for a Fighter, invariant in bearing |

**The 2.86M-sample histogram was not re-run**, and that is a deliberate choice rather
than an omission: the quantity it sampled is now identically zero, and a histogram of
zeros is weaker evidence than a two-sided test. The residual against the body origin is
measured instead, and pinned as invariant in the bearing.

### Corpus

`--seeds 100 --mirrored --hero-policy attack-moves --monster-policy attack-moves
--b-two-handed on`, against session 02's row:

| | welded guard | free guard |
|---|---:|---:|
| Fighter end health | 0.9885 | 0.9907 |
| Brute end health | 0.5271 | 0.5009 |
| Severances | 110 | **137** |
| Decided by a body | 8.5% | **13.0%** |
| Fighter wins | 200/200 | 200/200 |
| Weapon/shield share | 20.78% | 20.24% |

It **reversed session 02's decisiveness loss** -- body decisions 8.5% to 13.0%,
severances 110 to 137 -- and did not move who wins. `duel --seeds 400` is 59.5%,
unchanged, as the legacy surface has no articulated plate.

**Three constraints have now been lifted across sessions 02, 03 and 04 -- arm
authority, plate avoidance, guard coherence -- and the Fighter still takes 200/200.**
What remains untested is closure energy per blow.

### Gate results

| gate | result |
|---|---|
| `cargo test --workspace --no-fail-fast` | exit 0 |
| `cargo test --workspace --features cartesian-recoil --no-fail-fast` | exit 0 |
| `cargo build --release --target wasm32-unknown-unknown -p web` | exit 0 |
| `node --test tools/wasm_check.js` | 30/30, native == wasm |
| `node --test client/test/wasm-memory.test.mjs` | 5 pass, 1 skipped |
| `node --test client/test/studio-shell.test.mjs` | 23/23 |
| `npx tsc --noEmit` | exit 0 |
| `node tools/check_docs.js` | passed |
| `git diff --check` | clean |
| `cargo run --release -p lab -- duel --seeds 400` | 59.5%, unchanged |
