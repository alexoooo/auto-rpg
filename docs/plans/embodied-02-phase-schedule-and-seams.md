# Embodied 02 -- the phase schedule becomes data, and three seams get an owner

**Status:** complete. Landed 2026-08-17. No pin moved.

Second and last refactor. No behaviour change and no moved pin. Where
[session 01](embodied-01-world-module-split.md) decided *where code lives*, this
one decided *what session 03 has to edit to add a third body model* -- and the
honest answer before it was "twenty-eight `combat_model` sites, and you find out
which ones you missed from a golden hash."

## 1. The schedule

`step_with_arm_rates` was a two-armed `match` whose arms were straight-line call
sequences, interleaved with about thirty `#[cfg(test)] if self.phase_trace_enabled { ... }`
blocks naming each call in a string literal beside it. Two facts followed from
that shape and both were costs:

- the name and the call were written twice and nothing checked they agreed;
- a third model was a third arm, which is a third place to forget `press_doors`.

**And the second cost was not hypothetical.** Four phases were running with no
trace entry of their own: `resolve_dungeon_prop_swings` rode under `legacy
swings`, and `loose_articulated_projectiles` and `resolve_articulated_projectiles`
rode with `resolve_contact` under a single `contact`. A trace that names eleven of
twelve phases is not proof of an ordering.

Both arms are now one table per model plus one loop, at
[`Phase`](../../crates/sim/src/world/mod.rs#L1194):

```rust
type Phase = (&'static str, fn(&mut World, ArmRates));

const PROLOGUE: &[Phase] = &[
    ("clear events",     |w, _| w.events.clear()),
    ("expire decisions", |w, _| w.expire_unanswered_decisions()),
];
const LEGACY_PHASES: &[Phase] = &[ ("regenerate", |w, _| w.regenerate()), /* ... */ ];
const ARTICULATED_PHASES: &[Phase] = &[
    /* ... */
    ("arms", |w, r| w.drive_articulated_arms(r.bearing_max_speed_raw, r.bearing_accel_raw)),
    /* ... */
];
const EPILOGUE: &[Phase] = &[ /* increment tick, pending, navigation */ ];
```

driven by

```rust
let model = self.combat_model;
for &(name, body) in PROLOGUE.iter().chain(model_phases(model)).chain(EPILOGUE) {
    #[cfg(test)]
    if self.phase_trace_enabled { self.phase_trace.push(name); }
    body(self, rates);
}
```

The prologue and epilogue are shared rather than copied into each model's table,
which is the same defect one layer up: three copies of "clear events, expire
decisions" is three places to forget it. `model` is read into a local before the
loop so the iterator borrows only `&'static` slices and each body is free to take
`&mut self`.

`ArmRates` is threaded as a parameter rather than stashed on `World` for the
duration of a step, because a scratch column is authoritative state that then has
to be hashed or argued out of the hash, and a parameter is neither.

**This is determinism-safe and it is worth saying why rather than assuming it.**
The tables are `const` slices iterated front to back. No pointer is hashed, no
map is iterated, and the resulting call order is fixed at compile time. The rule
the determinism contract protects -- no unstable iteration into authoritative
state -- is not in contact with a `&'static [T]`.

## 2. The model seam

`CombatModel` gained three predicates and one companion enum, at
[`CombatModel::has_articulated_columns`](../../crates/sim/src/scenario.rs#L56):

```rust
impl CombatModel {
    pub(crate) const fn has_articulated_columns(self) -> bool { ... }
    pub(crate) const fn uses_contact_solver(self) -> bool { ... }
    pub(crate) const fn command_grammar(self) -> CommandGrammar { ... }
}
```

Each is written as an **exhaustive match rather than a comparison**, which is the
half that does the work: adding `Embodied` in session 03 is a compile error at
exactly three places, and the compiler asks the three questions instead of a
golden hash asking them later.

Fifteen guards were routed through them:

| predicate | sites |
|---|---|
| `has_articulated_columns` | the spec-table lookup and the `exact_owners` reservation in `try_new`, the column pushes and pose initialisation in `spawn_validated`, and the three articulated readers in `query.rs` |
| `uses_contact_solver` | the `ContactRuntime` allocation in `try_new` |
| `command_grammar` | `submit`, `face_legacy`, `set_loadout`, `set_body`, and both `submit_articulated_*` entry points |

`uses_contact_solver` and `has_articulated_columns` agree today and are still two
functions, deliberately: they are different questions, and flattening them is how
a model with a pose but no contact phase would start indexing a `ContactRuntime`
that is `None`.

Three sites were **not** converted, each for a stated reason. `try_spawn`'s
per-model spawn validation and `state_digest`'s hash-block selection are already
exhaustive `match`es, so a third variant is a compile error there too and a
predicate would only hide which arm was missing. `generate_dungeon_props` was the
one question none of the three predicates answers -- dressing is part of the
legacy dungeon feature set -- and it was rewritten from `!= Legacy` into an
exhaustive match so that it also fails to compile rather than silently answering
for a model nobody considered.

## 3. The limb-geometry seam

Where a hand is used to be answered in three places: `hand_position` and
`inverse_hand` in `actuator.rs`, and the arm's *collision volume* built
independently in `geometry.rs` as a capsule from `actuator::shoulder` to the
hand. The two agreed by inspection.

[`crates/sim/src/combat/limb.rs`](../../crates/sim/src/combat/limb.rs#L66) now owns
all three, moved verbatim and re-exported from `actuator` so no caller changed,
plus one new function:

```rust
pub(crate) fn arm_polyline(
    anatomy: &BodyAnatomySpec, yaw: Angle, limb: usize, hand: Vec3,
) -> ArmPolyline;
```

[`body_region_volumes`](../../crates/sim/src/combat/geometry.rs#L199) calls it and
takes the first and last points, which is what it computed by hand before.
`ArmPolyline` is a type rather than a tuple precisely so that
[session 07](embodied-07-elbow-and-forearm.md) adds a point and every consumer
follows without an edit of its own.

**The defect this seam exposes is recorded and not fixed.** `limb.rs`'s module
header writes it down: [`hand_position`](../../crates/sim/src/combat/limb.rs#L71)
places the hand at `physical_reach` in the horizontal plane and then *overwrites*
`hand.z` with `standing_height * height`, so the actual shoulder-to-hand distance
is `sqrt(reach^2 + dz^2)` and is not bounded by `arm_length` at all. The reachable
set is a cylinder shell rather than a sphere. That is a mechanics hole, not a
drawing problem, and closing it is session 07's first job; fixing it here would
move `ARTICULATED_STREAM_DIGEST` and every articulated corpus in a session whose
contract is that nothing moves.

`a_raised_arm_at_full_reach_is_longer_than_the_arm` asserts the hole so that the
session which closes it has a test to invert rather than a paragraph to find, and
its failure message says so.

## Tests, and what each was shown failing on

- `the_phase_table_and_the_phase_trace_cannot_disagree` -- drives both models and
  asserts the recorded sequence equals the table mapped to its names, twice, so a
  second tick has to append an identical run. **Shown failing two ways**: making
  the loop push a constant instead of `name`, and deleting the trace push from the
  loop body. Adding a no-op table row leaves it green and turns the two literal
  tests red instead, which is the division of labour intended -- the literals pin
  the schedule, this pins the mechanism.
- `the_legacy_phase_trace_is_unchanged` and
  `articulated_contact_runs_after_geometry_and_before_doors` -- the literals, now
  naming every phase rather than eleven of twelve. **Shown failing** by transposing
  `separate` with `drive_limbs` and `grips` with `arms`.
- `a_legacy_world_answers_no_to_every_articulated_column_predicate` and
  `an_articulated_world_answers_yes_to_every_articulated_column_predicate` -- both
  assert the predicate against a **built world**'s column lengths rather than
  against the enum, because `assert!(!Legacy.has_articulated_columns())` restates
  the function body. Each also asserts the world is non-empty, so neither can pass
  vacuously.
- `an_arm_polyline_starts_at_the_shoulder_and_ends_at_the_hand`
- `an_arm_polyline_reproduces_the_region_volume_it_replaced` -- the load-bearing
  one. It compares `body_region_volumes`' **output** against the pre-split
  expression written out longhand, over both shipped anatomies at five yaws, four
  bearings, three heights and three reaches. **Shown failing** by moving the
  polyline's shoulder one raw unit in `z`.

The first draft of that last test compared `arm.shoulder()` against `shoulder(..)`
-- which is what `arm_polyline` calls, so it restated the body and would have
passed whatever either did. It is recorded here because it is the exact shape
`AGENTS.md` warns about, and it survived until the failure demonstration was
attempted.

## Verification, as run

```powershell
cargo test                                                      # 1162 passed, 0 failed
cargo run --release -p lab -- hash                               # 0xfe31370e141ef531
cargo run --release -p lab -- verify --seeds 200
cargo run --release -p lab -- duel   --seeds 400
cargo run --release -p lab -- articulated --seeds 400 --mirrored
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js                                  # 32 passed, 0 failed
node tools/check_docs.js
```

## Hash expectation, and what happened

**Nothing moved.** `LAB_HASH` answers `0xfe31370e141ef531`; `duel --seeds 400`
answers 238/162 at 59.5% over a 1414-tick mean; `articulated --seeds 400
--mirrored` answers the same fixture pair `0x068d05fcada1027b` /
`0x6dbf62f0b336050b`, the same 285/299 split, the same 1,761,481 resolutions and
the same 337 severances as before either refactor.

One thing that *did* move and is not a hash: **inserting the predicates into
`scenario.rs` shifted every `#L` anchor below line 32 by 51**, and inserting the
phase tables moved `World::step`. `check_docs.js` caught seven stale scenario
anchors and three stale `step` anchors, which is the rot detector doing its job
and the reason to run it after moving code rather than only after writing prose.
