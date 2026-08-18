# Fight 01 -- the dead columns, and the dead code that came with them

**Status:** ready. Depends on nothing. Independent of session 02, so either may go
first.

Embodied session 10 deleted `CombatModel::Legacy` and arranged the cut so that **no pin
moved**: it kept the frozen identity words and it kept the hashed legacy columns, on the
argument that a deletion which moves `EMBODIED_CORPUS_DIGEST` has reached the embodied
model and is therefore not a deletion of the legacy one. That was the right trade for
that session and it left a debt, which this session pays.

The debt has a precise shape. `World::articulated_state_digest` writes

```rust
h.write_u64(self.legacy_core_hash());
```

so the **legacy core stream sits inside every surviving digest**, and that stream reads
columns a jointed body never writes.

## What is provably dead, and the evidence for each

Three groups, and they are not equally dead. This session deletes the first group
outright, deletes the second after a one-command proof, and **keeps the third**, which is
the part a careless reading of "delete the legacy columns" would get wrong.

### Group one: dead by construction

- **The projectile columns.** `shot_alive`, `shot_pos`, `shot_vel`, `shot_range`,
  `shot_mass`, `shot_power`, `shot_faction`, `shot_owner`, and `shot_free`. Grep finds
  **zero** reads of `self.shot_alive[` outside `world/hash.rs`, and
  `crates/sim/src/world/mod.rs` already asserts `world.shot_alive.is_empty()`. An
  articulated arrow publishes on `ARTICULATED_PROJECTILE` and lives in the
  `articulated_projectile_*` columns instead. The hash block writes a length word and
  then nothing, every tick, of every fight.
- **`World::command`, the legacy submitted column.** It is set to `Command::HOLD` in
  `set_body` and in `world/articulated.rs`, and its only non-trivial reader is
  `world/movement.rs`'s `apply_movement`, which the compiler already reports as never
  used. Nothing can write it: the legacy grammar is gone and `submit` went with it.
- **`Replay::entries`, the legacy command record stream.** `validate_envelope` refuses
  any envelope whose command schema is not `LEGACY_COMMAND_SCHEMA` while that vector is
  non-empty, and **no surviving scenario writes that schema**, so the section is
  unwritable as well as unread. Embodied session 10 left it in place deliberately so that
  the wire format would move once rather than twice; this is that once.

### Group two: dead behind a fallback, so prove it first

- **`hp`, `max_hp` and `legacy_hp_frac`.** `World::health_of` reads the anatomy first and
  falls through to `self.hp[i]` only when there is no anatomy row:

  ```rust
  fn health_of(&self, i: usize) -> Fx {
      match (self.anatomy_spec(i), self.wounds.get(i)) {
          (Some(spec), Some(state)) => state.health(spec),
          _ => self.hp[i],
      }
  }
  ```

  Every embodied body has an anatomy row, because `validate_rows` ties every loadout slot
  to an equipment row and `Scenario::fingerprint` runs that check before it hashes. So the
  fallback should be unreachable -- **and "should be" is not a measurement.** Make it one
  before deleting anything:

  ```rust
  // crates/sim/src/world/mod.rs, inside health_of, for the length of this session only
  _ => { debug_assert!(false, "a surviving body reached the legacy hp fallback"); self.hp[i] }
  ```

  Then run `cargo test`, `cargo test -p sim --features cartesian-recoil` and
  `cargo run --release -p lab -- embodied --seeds 400 --mirrored`. If the assertion never
  fires, the column is dead and goes; if it fires, **stop and record which fixture reached
  it** -- that is a body with no anatomy row in a model that is supposed to require one,
  which is a bigger finding than this session.

  `legacy_hp_frac` has exactly one production caller, in the fractional-health branch of
  `set_stats`, and two tests written directly against it. All four go together.

### Group three: alive, and deleting them would weaken the fingerprint

Named here because they read as legacy and are not:

- **`facing`.** `world/articulated.rs` seeds the body yaw from it. It is live state.
- **`loadout` and `slot`.** `World::action_of` reads both to resolve which action a hand
  is using, and the observation and the combat-spec lookup go through that.
- **`limb`.** A spawn-time constant that nothing evolves, published in `UnitView`. It is
  a candidate for a later session and **not for this one**: removing a column that is
  merely constant, rather than absent, buys one word of hash and costs a public type
  change, and this session already owns two pin moves.

Write the reasoning down at the hash site rather than in a commit message. A future
reader looking at `facing` in the state stream should find the sentence that says why it
survived a session that deleted its neighbours.

## The thirty dead-code warnings

`cargo build --release` reports thirty `never used` / `never read` warnings and the great
majority are legacy remains. They are cruft in the exact sense the owner named, and they
go in this session because they are the same subtraction:

```text
crates/sim/src/combat/actuator.rs:646     bill_fatigue
crates/sim/src/combat/contact.rs:1402     collect_contacts
crates/sim/src/combat/limb.rs:210         reachable_hand
crates/sim/src/combat/resolution.rs:487   resolve_group
crates/sim/src/combat/resolution.rs:702   allocate_weighted
crates/sim/src/combat/resolution.rs:954   ContactTimeBasis::AbsoluteTick
crates/sim/src/combat/resolution.rs:1843  serialize_contact_corpus
crates/sim/src/hand.rs:319                multiple methods
crates/sim/src/rules.rs:39,52             REGEN_DELAY, REGEN_PER_TICK
crates/sim/src/rules.rs:309               graze_floor
crates/sim/src/rules.rs:753,813           SHOT_RELEASE_TICKS, SWAP_MAX_TICKS
crates/sim/src/rules.rs:890,897,904,955   GUARD_REACH, WINDUP_REACH, PARRY_RECOVERY, PARRY_MIN_SPIN
crates/sim/src/rules.rs:960,963           MIN_STRIKE_REACH, MIN_BLOCK_REACH
crates/sim/src/world/mod.rs:311,488,510,525,539  event and impact fields, sort_prop_impacts
crates/sim/src/world/mod.rs:2169          health_fraction_of, dead_zone, stowed_of, swap_ticks, arm
crates/sim/src/world/movement.rs:25       apply_movement, dungeon_slow_at
crates/sim/src/world/navigation.rs:39     nav_arm, reachable_point, nav_goal_point, nav_step
crates/sim/src/world/props.rs:126         door_shut
crates/lab/src/tactical_mechanics.rs:1193 collect_indexed_cases_with
```

**Two of these are not simply deletions and must be decided rather than swept.**

- `crates/sim/src/world/navigation.rs`'s four unused methods are the *reader side* of the
  navigation flow field, which is refreshed every tick. **This sentence used to continue
  "and still hashed", and that was wrong** -- corrected in place on 2026-08-18 by the
  session that acted on it, because the claim is what the decision turns on.
  `crates/sim/src/world/mod.rs` documented the exclusion deliberately, on `Nav`: *"Not
  hashed. A derivation of the floor plan and the objectives, both of which are."* So
  deleting the field could not move a pin, and the choice between the two options below
  was not the trade the paragraph thought it was. Deleting the readers makes the writer's
  cost unaccounted for, so: either delete the flow field with them, or keep them and add
  `#[allow(dead_code)]` **with a comment naming what would use it** -- the commands
  reference already records that a standing order is an input no body can perceive, and
  this is the other end of that sentence. **The session deleted it**, along with
  `refresh_nav`, the `nav`/`nav_seeds`/`nav_queue` columns, the `EPILOGUE` row, `door_shut`
  and the eight tests that drove the readers; no pin moved, in either feature
  configuration. Two tests in that file were not deletions:
  `the_flow_field_reaches_every_open_tile_and_only_those` was about `Dungeon::distances`
  and never needed a `World`, so it moved to `dungeon.rs` under a name that says so, and
  `a_door_opens_inside_the_tick_loop` in `props.rs` was converted -- it steered by
  `nav_step` and now leans east, which is the heading the route answered anyway, keeping
  the claim that a door opens inside `World::step`.
  `orders` and `objectives` stayed, hash writes and all. The capability lost -- ordered
  movement, which nothing implements for the surviving model -- is written down at
  `World::set_order`, in `docs/reference/commands.md` and in
  `docs/design/navigation-visibility.md`, naming what a future session would have to
  build.
- `REGEN_DELAY` and `REGEN_PER_TICK` are a game rule, not scaffolding. Regeneration on an
  anatomy body is healing a wound, which is a mechanic nothing implements. Delete the
  constants and say in `rules.rs` that the mechanic left with the legacy health column, so
  the next person to want it knows it was removed rather than forgotten. Done, beside
  `REGEN_BUDGET`, which survives them: `World::regen_left` is written to
  `max_hp * REGEN_BUDGET` at spawn and read only by the state hash, so it is a hashed
  spawn-time constant rather than a column that is always zero -- and it stays, because it
  is in the state stream and this session's pins were already re-recorded.

**A third needed deciding and the list did not flag it.** `ContactTimeBasis::AbsoluteTick`
is *not* dead: `ExactKinematics::time_basis` constructs it, inside an `impl` that is
`#[cfg(feature = "cartesian-recoil")]`, so it is live production code under that feature
and merely unconstructed in the default build. An ungated default-build test reads it too,
so a `cfg` on the variant would not compile. It carries
`#[cfg_attr(not(feature = "cartesian-recoil"), allow(dead_code))]` and a comment naming
the feature that constructs it, and that is the only `allow(dead_code)` this session
added.

**The rest split three ways and the split was the work.** Genuinely unreferenced ->
deleted (`reachable_hand`, `REGEN_DELAY`, `REGEN_PER_TICK`, `PARRY_RECOVERY`,
`PARRY_MIN_SPIN`, `MIN_STRIKE_REACH`, `MIN_BLOCK_REACH`, `graze_floor`,
`health_fraction_of`, `swap_ticks`, and the chains that only they reached). Reachable only
from a `#[cfg(test)]` caller -> read the *test* rather than the function: a `Vec`-returning
wrapper whose `_into` sibling is what production calls (`resolve_group`,
`allocate_weighted`, `bill_fatigue`, `collect_indexed_cases_with`) had its test converted
onto the shipped signature and was then deleted, which strictly widens what the suite
covers; a genuine harness that holds no rule of its own (`collect_contacts`,
`serialize_contact_corpus`) was marked `#[cfg(test)]` so it stops shipping and stops
warning, with its tests kept.

The end state is `cargo build --release` with **zero warnings**, and that is checkable in
one line, which is why it is worth reaching rather than approaching.

## Hash expectations

**This section said "two pins move and this session owns both", and it was wrong
by three.** Corrected in place on 2026-08-18 by the session it was written for,
because the mistake it made is the one the repository keeps making and the
correction is worth more than the prediction was.

**Five pins move**, and the rule that generates the list is one sentence: *every pin
taken over `World::state_digest` folds `legacy_core_hash`*, because
`World::articulated_state_digest` opens with `h.write_u64(self.legacy_core_hash())`.
There is no state-digest pin this session can leave still.

| pin | why it moves |
|---|---|
| `EMBODIED_CORPUS_DIGEST` | folds `World::state_digest` over 32 trials |
| `EMBODIED_GOLDEN_DIGEST` | `World::state_digest` of an embodied fixture in `crates/sim`'s own suite |
| `ARTICULATED_COMMAND_HASH` | `crates/web` reads `world.state_digest().value` of an unstepped fixture |
| `EXACT_TRAJECTORY_STATE_DIGEST` | `exact_diagnostics.rs` folds three `state_digest()` calls into it |
| `LIFTED_COULOMB_SOLVER_DIGEST` | its `state_words` folds one into every `LiftedReceipt` |

Each has a `cartesian-recoil` variant, and the last three are **paired native/wasm
target-agreement guards**: measure natively in both configurations first, write the
numbers down, and only then edit a wasm mirror. A one-sided move is a portability
failure and not a number to choose. The two exact digests are behind
`#[cfg(feature = "cartesian-recoil")]` at `crates/sim/src/lib.rs`, so **a default
`cargo test` is structurally incapable of seeing them move** -- which is how this
section came to name them as unrelated.

**Nothing else may move.** In particular:

- `ARTICULATED_STREAM_DIGEST` is the *published* pose, region, event, projectile and
  stance bytes. No legacy column is in it, and it is the one digest-shaped pin here
  that is genuinely a publication rather than a state fold. If it moves, a
  publication changed and this session did something it did not intend.
- `COMBAT_GEOMETRY_HASH`, `CONTACT_BEHAVIOR_DIGEST` and `LEARNED_INFERENCE_DIGEST`
  are unrelated streams.
- The four embodied scenario fingerprints and the `articulated-duel-v1` fingerprint are
  `Scenario::fingerprint`, which reads no world state at all.

## The proof that the fight did not change

A state-hash re-record is the one kind of move where the number itself proves nothing, so
the claim has to be carried by something else. **The fight must be byte-identical and only
the digest column may move.**

Before the change:

```powershell
cargo run --release -p lab -- embodied --seeds 400 --mirrored       > before-duel.txt
cargo run --release -p lab -- embodied --seeds 400 --mirrored --slope > before-slope.txt
```

After it, run the same two and diff. Every line except `seed 0`'s digest must be
identical: `outcomes`, `clock`, `sides`, `fights`, `health`, `contacts`, `blocked`,
`guard`, `blows` and `commands`. A moved win count means a moved fight, and a moved fight
means a column that was not dead.

Add the claim as a test rather than leaving it in a transcript, since the transcript is
gone the moment the session closes:

```rust
// crates/sim/tests/determinism.rs
#[test]
fn deleting_the_legacy_columns_left_the_wounds_where_they_were() { /* ... */ }
```

driving one fixture for 600 ticks and asserting the per-region integrity and wound
fractions of both bodies -- the quantities the deleted columns *would* have shadowed --
against values recorded before the change.

## Verification

```powershell
cargo test
cargo test -p sim --features cartesian-recoil
cargo test -p lab --features cartesian-recoil
cargo build --release                                  # zero warnings
cargo run --release -p lab -- embodied --corpus-digest
cargo run --release -p lab -- verify --seeds 200
cargo run --release -p lab -- verify --slope --seeds 50
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
node --test "client/test/*.test.mjs"
```

`lab verify` matters more than usual here: it is run/re-run/replay agreement,
and this session changes the replay format by removing `Replay::entries`. A codec that
still round-trips is the whole claim.

## Acceptance

1. `cargo build --release` reports zero warnings.
2. The two state-hash pins are re-recorded in both their copies, both feature
   configurations, and in the golden registry, with the commit message naming them.
3. No other pin moved.
4. The two `lab embodied` reports differ from their pre-change captures in the digest
   column and nowhere else.
5. `crates/sim/src/world/hash.rs` explains, in place, why `facing`, `loadout`, `slot` and
   `limb` survived a session that deleted their neighbours.
