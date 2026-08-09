# Replay codec version 2 combat-spec extension

**Purpose:** Freeze the persisted scenario-owned combat definitions introduced by `v2-12` without changing codec V1.
**Status:** current
**Canonical source:** `crates/sim/src/codec.rs`, mirrored here.
**Update when:** A combat spec field, bound, presence rule, or codec-V2 byte changes.

## Compatibility rule

Codec V1 is frozen by [Replay codec V1](replay-codec-v1.md#integer-and-size-rules)
and has no reserved combat-spec tail. `v2-12` therefore introduces
`REPLAY_CODEC_VERSION = 2`; it does not reinterpret or append bytes to version 1.
The 40-byte envelope header is unchanged except header offset 4 contains version
`2`. Command schemas, hash-domain tuple rules, and command/order/objective stream
records retain their V1 meanings.

A version-1 Legacy envelope remains accepted and compares its recorded fingerprint
with ScenarioV1. A version-1 Articulated envelope is rejected as
`MissingCombatSpecs`: V1 cannot carry the immutable authority required to construct
an articulated world, and the decoder never synthesizes it from a registry. Version
2 accepts Legacy with no combat-spec extension and Articulated only with the
complete extension below.

The codec limits add:

| Constant | Value |
|---|---:|
| `MAX_ANATOMY_SPECS` | 64 |
| `MAX_EQUIPMENT_SPECS` | 128 |
| `MAX_ARTICULATED_ENTITIES` | 64 |
| `BODY_ANATOMY_SPEC_V1_BYTES` | 195 |
| `SEGMENT_EQUIPMENT_SPEC_V1_BYTES` | 40 |
| `SHIELD_EQUIPMENT_SPEC_V1_BYTES` | 44 |

They remain inside V1's scenario and envelope byte ceilings.

V2-14 adds `ReplayField::ContactGeometryEnvelope`. A structurally complete
Articulated scenario whose arena/anatomy/equipment reach can leave fx's accepted
±256 point envelope returns `InvalidField(ContactGeometryEnvelope)` from decode and
the matching validation error from encode/play. This check runs after complete
extension dimensions/references/grips, before recomputing the scenario fingerprint,
and before any `World` or final output vector. It maps to
`ContactCapacityError::GeometryEnvelope` at direct `World::try_new`/`try_spawn`.

The inherited `MAX_SCENARIO_UNITS=4_096` remains exact for Legacy. For an
Articulated ScenarioV2, the already-read combat-model tag makes unit count 65 an
exact `LimitExceeded(ScenarioUnits)` before any unit row, combat extension, final
allocation, or `World` construction. Encode/play validation returns the matching
`ReplayValidationError` first. This model-specific ceiling is the contact solver's
authoritative capacity, not merely a browser publication limit.

## Scenario extension grammar

The V2 scenario record is the complete V1 scenario record through the final torch,
followed immediately by one combat-spec presence byte:

```text
0    no more scenario bytes
1    CombatSpecTableV1, followed by articulated unit bindings
```

Any other value is `UnknownPresence`. Legacy requires `0`; Articulated requires
`1`. Presence `1` writes:

```text
combat spec schema u16 = 1
anatomy count u16
anatomy records in strictly ascending ID order
equipment count u16
equipment records in strictly ascending ID order
unit binding count u16 = the preceding V1 unit count
one articulated-unit record per scenario unit, in unit vector order
```

Each `BodyAnatomySpec` is exactly 195 bytes in declaration order from
[Combat specs](combat-specs.md#types-and-discriminants): ID/schema, five body
dimension `Fx` values, five 13-byte region rows, one 17-byte surface, five
integrity maxima, blood maximum, then five 13-byte armor rows. A region is tag
`u8`, centre/half-height/radius raw `i32`. A surface is four raw `i32` values then
material `u8`; armor is three raw `i32` values then material `u8`.

Each equipment record begins:

```text
id u16, schema u16, ActionKind u8, mass i32, balance i32,
geometry tag u8
```

Geometry tag `0` appends segment length and radius `i32`; tag `1` appends shield
half-width, half-height, and thickness `i32`. Next is `GripBinding`: Left `0`,
Right `1`, Both `2`, followed by the 17-byte surface in its declaration order.
Thus the total sizes are 40 and 44 bytes.

An articulated-unit record is:

```text
anatomy ID u16
slot 0 presence u8, then equipment ID u16 when present
slot 1 presence u8, then equipment ID u16 when present
```

Presence is exactly zero or one. Decoding validates all raw structure and bounds,
then table ID order/uniqueness, then dimension invariants, then unit references,
then ActionKind/loadout agreement, then grip conflicts. No `Scenario`, `Replay`, or
`World` is constructed before the whole extension passes.

## Scenario fingerprint version

Legacy scenarios continue to use the exact ScenarioV1 fingerprint bytes. An
Articulated scenario uses ScenarioV2:

```text
ASCII ARPG-SCENARIO, u16 schema 2,
the ScenarioV1 fields after its schema word,
combat-spec presence 1 and the exact extension bytes above
```

`Scenario::fingerprint` dispatches on `CombatModel`; it does not move any Legacy
fingerprint a second time. The codec-V2 header fingerprint for Articulated must
equal ScenarioV2. Changing any immutable definition, ID, option, or unit binding
therefore changes scenario identity.
