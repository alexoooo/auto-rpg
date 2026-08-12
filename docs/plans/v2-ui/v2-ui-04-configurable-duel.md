# v2-ui-04 — a duel you can describe, without moving the duel that is pinned

**Goal:** build a two-fighter scenario from a runtime configuration — anatomy, per-hand
equipment, and the dimensions that matter — reachable from `lab trace` and proved not to
disturb the fixture the goldens measure.

**Depends on:** nothing in this series. No browser changes.

**Golden expectation:** **no pin moves**, and the session proves it rather than
asserting it.

## Why a new constructor and not a parameter on the old one

The combat spec-table digest `0x78e5b57ae0c6bbd6`
([`crates/sim/src/combat/spec.rs:847`](../../../crates/sim/src/combat/spec.rs#L847)) and
the `articulated-duel-v1` fingerprint `0x068d05fcada1027b`
([`crates/sim/src/scenario.rs:708`](../../../crates/sim/src/scenario.rs#L708)) both hash
`CombatSpecTableV1::fixtures()` through `write_combat_specs`. The registry's warning is
blunt: *a shield dimension moves four of them at once.*

`fixtures()` is a **function that builds a fresh `Vec` on every call** from five row
constructors. It is not a registry, not a `static`, and nothing can register into it. So
a second constructor beside it is invisible to both digests — provided the shared
machinery underneath is not touched.

The complete invariant, and it belongs in a comment beside the new code:

> Do not edit `fighter_anatomy`, `brute_anatomy`, `sword`, `shield`, `club`,
> `fixtures`, `articulated_duel`, `COMBAT_SPEC_SCHEMA_V1`, `write_anatomy`,
> `write_equipment`, `write_unit`, `write_combat_specs`, `write_surface`, `write_armor`,
> `ScenarioByteSink`, `scenario_v1_fields_into` or `action_definition_bytes`.

## The shape

New module `crates/sim/src/combat/arena.rs`, exported through `crates/sim/src/lib.rs`:

```rust
pub struct DuelFighterV1 {
    pub anatomy: AnatomyChoice,           // Fighter | Brute -- clones the shipped row
    pub hands: [Option<HandItemV1>; 2],   // 0 = LeftArm, 1 = RightArm
    pub spawn: Vec2,
}

pub struct HandItemV1 {
    pub action: ActionKind,               // Sword | Shield | Club
    pub mass: Fx,
    pub balance: Fx,
    pub geometry: EquipmentGeometry,
}

pub struct DuelConfigV1 { pub fighters: [DuelFighterV1; 2], pub max_ticks: u32 }

impl Scenario {
    pub fn duel_from(config: &DuelConfigV1) -> Result<Scenario, CombatSpecError>;
}
```

**Named `duel_from`, not `arena_duel`.** `Scenario::arena()` already means the playable
extent (`scenario.rs:171`), and a second sense of "arena" in the same `impl` block is
the kind of collision the house style section exists to prevent.

**Every knob the studio wants is already a field.** Shield half-width and half-height
are `EquipmentGeometry::Shield`; weapon length and radius are
`EquipmentGeometry::Segment`; mass and balance are `EquipmentSpec`. No new field, so no
change to `write_equipment`, so no change to `SEGMENT_EQUIPMENT_SPEC_V1_BYTES` or
`SHIELD_EQUIPMENT_SPEC_V1_BYTES`, so nothing the digests read has moved.

There is precedent for building an articulated scenario at runtime: `dungeon_scenario`
([`crates/web/src/lib.rs:2178`](../../../crates/web/src/lib.rs#L2178)) attaches
`fixtures()` and rewrites unit loadouts. This goes one level further and builds the
table too.

## Three constraints that are reachable from a dropdown

All are enforced by `validate_rows` (`spec.rs:219`) and all will be hit by a user
before they are hit by a test.

**Ids must be strictly ascending** (`strict_ids`, `spec.rs:249`). Two fighters holding
"a sword" of different lengths are two *distinct equipment rows*; one row cannot be
shared with different dimensions. The builder therefore emits up to four equipment rows
and up to two anatomy rows, numbered `1..N` in a fixed, documented order — and that
order is part of the arena fingerprint, so it must be deterministic, not
insertion-order-by-accident.

**`binding` picks the hand, not the slot index** (`resolved_equipment`, `spec.rs:318`).
This is the mechanism that makes "sword in the left hand" expressible at all — the
shipped `sword()` binds `Right`. The builder sets `binding` from the hand index.
`validate_bindings` (`spec.rs:302`) then refuses two items on the same hand, two
shields, or `GripBinding::Both` alongside anything.

**`item.action` must equal `loadout.slot(n)`** for the same `n`, or
`CombatSpecError::LoadoutMismatch`. So the `Loadout` is *derived* from the hands and
never chosen independently.

## Both hands empty cannot be built, and that is not a bug to fix here

`Loadout.primary` is `ActionKind`, not `Option<ActionKind>`
([`crates/sim/src/loadout.rs:18`](../../../crates/sim/src/loadout.rs#L18)), so
`slot(0)` is always `Some` and `validate_rows` refuses `(None, Some(_))`.

Consequences, both of which must be encoded rather than discovered:

- A fighter with **no** equipment is not constructible. `duel_from` returns a distinct
  error for it and the picker refuses it with that sentence.
- A fighter with **one** item must carry it in slot 0; which hand it lands in is then
  decided by `binding`.

Making `primary` optional would change `action_definition_bytes` and
`scenario_v1_fields_into` and therefore move **every scenario fingerprint in the
repository**, including `articulated-duel-v1`. Do not, and say why here so the next
session does not rediscover it as a good idea.

One genuinely untested path this opens: a **shield in slot 0**
(`Loadout::single(ActionKind::Shield)`). Every existing construction uses
`Loadout::pair(Sword, Shield)`, and `action_definition_bytes` writes
`spec.role.discriminant()`, so a `Role::Guard` primary is legal but unexercised. It
needs a test.

## `lab trace`

The flags land here, before any browser code, so every configuration is reproducible
from a command line and a fight can be compared against the same fight run through the
browser later:

```text
--fighter-a fighter|brute      --fighter-b fighter|brute
--a-left  sword|shield|club|empty   --a-right ...   (and the same for b)
--a-shield-half-width R --a-shield-half-height R
--a-weapon-length R --a-weapon-mass R              (and the same for b)
```

Dimensions accepted as decimals and converted once, at the boundary, to `Fx`. Print the
resulting arena fingerprint in the trace header so a recorded fight names the
configuration it came from. Note the existing help-text defect while here:
`--policy attack-moves` is advertised at `main.rs:99` but `script_from` accepts only
`composed` and `windmill`, so it exits 2 — the third script is reached by the separate
`--attack-moves` flag.

## Verification

```powershell
cargo test
cargo test -p sim
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_deps.js
node tools/check_docs.js
cargo run --release -p lab -- hash
```

The tests that make this session's claim, and without which it is only an assertion:

- `the_shipped_fixture_digest_is_unmoved_by_a_runtime_table` — build several
  `DuelConfigV1`s, then recompute `CombatSpecTableV1::fixtures()`'s digest **and**
  `articulated_duel().fingerprint()` and assert both pinned values. This is the whole
  point of the session and it must fail loudly if someone later edits a shipped row.
- `two_fighters_may_hold_differently_sized_swords` — proves the strictly-ascending id
  rule is handled rather than worked around.
- `a_fighter_with_no_equipment_is_refused_by_name` — the specific error, not any error.
- `a_shield_in_the_primary_slot_validates` — the untested `Role::Guard` path.
- Every `CombatSpecError` variant reachable from a knob has a test that produces it.
- `the_arena_fingerprint_is_stable_for_a_configuration` — same config, same number, so
  a recorded fight can be identified.

## Decision

Record `pass`, `revise` or `stop`. State the two pinned values as unmoved, with the
command that printed them.

## How v2-ui-04 closed

**`pass`.** Both pinned values are unmoved, and they are unmoved by measurement rather
than by assertion: `the_shipped_fixture_digest_is_unmoved_by_a_runtime_table` builds
three `DuelConfigV1`s and fingerprints each of them *before* it recomputes either
number.

```text
cargo test -p sim -- --nocapture the_shipped_fixture_digest
  after 3 runtime tables:
    combat spec-table digest        0x78e5b57ae0c6bbd6
    articulated-duel-v1 fingerprint 0x068d05fcada1027b

cargo run --release -p lab -- hash
  state hash 0xfe31370e141ef531
```

`cargo test` (whole workspace), `node --test tools/wasm_check.js` against a freshly
built `wasm32-unknown-unknown` artifact (21/21), `node tools/check_deps.js` and
`node tools/check_docs.js` are all green. No other pin was touched, and none of the
functions the invariant names was edited.

**A no-flag `lab trace` writes the same file it wrote before this session**, checked as
a SHA-256 of `web/fight.json` across the change
(`4372307db1202b2cb98d14205cb46aa0cdc373276c5d3caf0e806cefd9636fb6`, seed 3), which is
what keeps `a_traced_run_is_the_run_the_gate_measured` a claim about the shipped path.
The switch is the flag list itself (`DUEL_KEYS`): give none of the fourteen and the
fixture runs, give any one and the scenario becomes `configured-duel-v1`. That is
deliberately not "always go through the builder", because
`DuelConfigV1::shipped()` reproduces the fixture's table and unit rows exactly and the
only difference would have been the scenario name — the hardest kind of drift to
notice.

### Four things the plan did not anticipate

**The plan's own line anchors were stale** and so were the golden registry's:
`spec.rs:787` and `scenario.rs:701` both land inside the surrounding comments. Fixed in
both places, and both pins now name their *second* assertion site in
`crates/sim/src/combat/arena.rs` as well.

**`CombatSpecError` needed two new variants, not one.** `NoEquipment` is the one the
plan predicted. `UnknownAction` is the one it did not: a `HandItemV1` carries no
`SurfaceSpec`, because a surface is a measured material rather than a dimension, so it
is copied from the shipped row for the item's `ActionKind` — and five of the eight
actions have no shipped row. Refusing them keeps the mapping total; falling back to
"whichever row looks nearest" would have given a `Bow` a sword's edge factor, which is
`dungeon_scenario`'s "inventing combat geometry nobody measured" in a new place. Both
variants are `Copy`-safe, neither is hashed, and every `match` on `CombatSpecError`
outside `spec.rs` already had a wildcard arm.

**The carrying-slot order is a decision and not a packing.** Filling slots in hand
order is the obvious rule and it is wrong: it gives every sword-and-board fighter a
plate as its `Loadout::primary`, which is what `World::spawn` puts in hand and what
`action_of` reads, and it makes the shipped fixture's own arrangement —
`Loadout::pair(Sword, Shield)`, carried `[sword, shield]` — unreachable from the
picker. The rule landed is: a `Role::Guard` item yields slot zero to anything that is
not a guard, otherwise the left hand goes first. Under it, and under the id order
(A then B, carrying slot 0 then 1, `1..N`), describing the shipped arrangement produces
`CombatSpecTableV1::fixtures()` row for row, id for id and binding for binding — and
`a_described_duel_that_moved_nothing_is_the_fixture_fight` shows it runs the identical
fight, state digest included. That equality is the strongest evidence available that
the runtime builder and the shipped rows describe the same thing, and it is also why
the scenario has to be renamed: without a different name it would be the pin.

**A shield in slot zero is reached the ordinary way, not only by the test.** The rule
above sends a guard to slot zero exactly when it is the only thing carried, so
`Loadout::single(ActionKind::Shield)` and its `Role::Guard` primary are what a fighter
with one plate and one empty hand gets. `a_shield_in_the_primary_slot_validates` builds
a `World` from it as well as fingerprinting it.

### What an adversarial review found afterwards, and what it changed

The session landed green and it was still wrong in nine places. Six of them were the
same mistake in different clothes: **a request the picker could not honour was
answered with silence.** The other three were prose claiming more than the code did.
No pin moved for any of it — `0x78e5b57ae0c6bbd6`, `0x068d05fcada1027b`,
`0xfe31370e141ef531`, `ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH` and `BOW_HASH` are all
where the session left them, and a no-flag `lab trace --seed 3` still writes
`4372307db1202b2cb98d14205cb46aa0cdc373276c5d3caf0e806cefd9636fb6`.

**A picker key with no value was read as a key nobody typed.** `Args::parse` demotes
`--key` to a bare flag whenever the next token is missing or starts with `--`, and
`duel_config_from` looked for pairs only. `lab trace --a-weapon-length --seed 3` ran
the *fixture* and printed `0x068d05fcada1027b` — the pin's own number — under a header
the operator was reading as their configuration. `--a-left --a-right club` was worse:
the surviving half renamed the scenario, so the output looked configured while a key
had vanished without trace. Both now exit 2 naming the key. The check is
`args.flag(key)` over `DUEL_KEYS`, which works precisely because none of the fourteen
is legitimately a flag.

**A dimension aimed at an item the fighter is not carrying was a no-op that still
renamed the scenario.** `--b-shield-half-width 0.5` could never do anything — the Brute
carries a club — yet it produced `configured-duel-v1` at a fresh fingerprint running
the fixture's fight tick for tick. The geometry loop now counts what it edited and
refuses a key that edited nothing, in the same voice `--policy duellist` is refused in.

**Both refusals are returned rather than printed-and-exited**, unlike `Args::choice`'s,
so `a_picker_key_that_cannot_be_honoured_refuses_the_run` can assert the sentence. A
refusal path that no test can name is how these two got shipped.

**`--mirrored` wrote `"fingerprint":null` into every recorded file.** That was
defensible while a trace could only ever record the fixture or its reflection — "the
only use a reader has for this field is deciding whether it is looking at the pin" —
and this session killed the premise. A mirrored configured run printed
`0xdb9c347e9446fbe9` to the terminal and `null` to the file, and the file is the
artifact that outlives the terminal. The header now always carries the scenario's own
number; `mirrored` is a separate field and still says a reflection happened.
`fingerprint` stays `string | null` on the reader's side, so
`client/src/fight/trace.ts` and `TRACE_SCHEMA` (`arpg-fight-trace-3`) are untouched.

**`Args::decimal` was lossy in two ways the doc did not admit.** `Fx::from_ratio`
truncates at one raw unit, so `0.95` and `0.950001` are the same spec row and the same
arena fingerprint (`0.9500123` is the first string above `0.95` that is not) — a sweep
stepping below 1.5e-5 runs one fight repeatedly and nothing downstream can say so.
And anything under the floor became `Fx::ZERO`: `--a-weapon-length 0.000000001` bought
a **zero-length blade**, which `validate_equipment` accepts (it refuses only
`raw() < 0`) and which then loses a full fight. `validate_equipment` governs the
shipped rows and sits upstream of a pinned digest, so the refusal went into the layer
that reads a person's typing instead. `two_decimals_inside_one_raw_unit_are_the_same_dimension`
pins the floor. The old comment's "four orders of magnitude below `Fx::EPSILON`" was
also off by one — the tenth fractional place is 1e-10 and `Fx::EPSILON` is 1/65536, so
it is five.

**`duel_from` promised a `Result` for a field it does not check.** `validate_construction`
is the table's gate and not the whole gate: `World::try_new` runs
`check_contact_envelope` against `CONTACT_COORDINATE_LIMIT` (256), and `spawn` is the
one `pub` field with no bound of its own. A spawn at x=300 was accepted, fingerprinted,
and then panicked `World::new` with `Contact(GeometryEnvelope)` — and the next session
hands this type browser input. The error set is deliberately unchanged, because a
concurrent session is mapping `CombatSpecError` onto wasm failure codes and a new
variant would land in its wildcard arm unnoticed. Instead the split is written down in
`arena.rs` and in `docs/reference/combat-specs.md`, both saying plainly that a caller
opens the result with `World::try_new` and never `World::new`, and
`an_out_of_envelope_spawn_is_refused_by_try_new_and_not_by_duel_from` gates it.

**"Cannot be the pin" is a convention, not an invariant.** `Scenario.name` is a
`pub String` and `the_shipped_arrangement_is_expressible` proves the name is the *only*
differing byte, so two field writes alias `0x068d05fcada1027b` exactly.
`a_configured_duel_is_never_the_pinned_fixture` now asserts that second half itself,
and both `arena.rs` and the reference say the constructor names a scenario while
nothing afterwards defends the name. `Scenario` was not restructured: a private field
and a constructor, on the type every scenario in the repository builds as a struct
literal, is a much larger change than the mistake it would prevent.

**Two accuracy gaps closed.** `GripBinding::Both` is unreachable from `DuelConfigV1` —
the binding comes from a hand index with two values — while `resolved_equipment`,
`grip_valid_for_arm` and `validate_equipment` all keep live `Both` arms for
hand-written rows; neither `arena.rs` nor the reference said so, and now both do. And
`the_shipped_arrangement_is_expressible` claimed "row for row, id for id, binding for
binding — everything except the name" while comparing the spec table and a five-column
per-unit tuple, leaving `stats`, `dungeon`, `portal`, `torches`, `max_ticks` and
`combat_model` unchecked. **The test was widened rather than the comment narrowed**,
because all six were already equal and because substituting the one field and getting
whole-`Scenario` equality is exactly the measurement the paragraph above needs.

One thing deliberately not fixed: `--a-weapon-mass` edits segment-geometry items only,
so it does not move a shield's mass. That is the documented meaning of "weapon" here
and a shield key for it would be a new knob rather than a defect.
