# v2-ui-04 — a duel you can describe, without moving the duel that is pinned

**Goal:** build a two-fighter scenario from a runtime configuration — anatomy, per-hand
equipment, and the dimensions that matter — reachable from `lab trace` and proved not to
disturb the fixture the goldens measure.

**Depends on:** nothing in this series. No browser changes.

**Golden expectation:** **no pin moves**, and the session proves it rather than
asserting it.

## Why a new constructor and not a parameter on the old one

The combat spec-table digest `0x78e5b57ae0c6bbd6`
([`crates/sim/src/combat/spec.rs:787`](../../../crates/sim/src/combat/spec.rs#L787)) and
the `articulated-duel-v1` fingerprint `0x068d05fcada1027b`
([`crates/sim/src/scenario.rs:701`](../../../crates/sim/src/scenario.rs#L701)) both hash
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
([`crates/web/src/lib.rs:1503`](../../../crates/web/src/lib.rs#L1503)) attaches
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
