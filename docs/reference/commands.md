# Commands and standing inputs

**Purpose:** Specify the current authoritative input vocabulary at the policy and host boundaries.
**Status:** current
**Canonical source:** [`Command`](../../crates/sim/src/command.rs#L325) and the adjacent input enums in the same module.
**Update when:** `Observation` feature layout, `Command`, `LimbCommand`, actions, loadouts, standing inputs, or their encoded discriminants change.

<!-- DOC_CONTRACT: policy-observation -->
## Policy input: `Observation`

`World::observe` returns one subject's perceived input. The structured Rust fields
are the primary current policy interface. `Observation::write_features` projects
the same boundary into a fixed `Fx` vector for a future learned policy. No current
shipped policy consumes that vector.

The current `FEATURE_LAYOUT_VERSION` is `12` and `FEATURE_COUNT` is `922`.
Values are approximately normalized to `-1..=1`; absent contact slots are zero.
The ordered layout is:

| Block | Width | Ordered contents |
|---|---:|---|
| self | 40 | health fraction, attack readiness, radius, action length, minimum strike range, decision rate, action arc, velocity x/y, traction ratio, recoil drift; limb direction x/y, spin, reach; 5-way `Swing` one-hot; phase time, armed flag, brace fraction; held and stowed 8-way action one-hots; swap time |
| order | 7 | 5-way `Order` one-hot, then normalized/relative direction x/y |
| enemies | 198 | six contact slots, 33 values each, nearest first |
| allies | 198 | six contact slots, 33 values each, nearest first; excludes self |
| walls | 4 | normalized clearance in the stored cardinal order |
| navigation | 3 | route direction x/y and normalized route distance |
| articulated | 472 | the subject's own joints, then six opponent rows |

The first six blocks are `LEGACY_FEATURE_COUNT = 450` values wide and are frozen:
version 12 appended the articulated block whole and moved nothing below index 450.
The articulated block is blank -- 472 zeroes -- in every Legacy world, so the vector
has one width whichever combat model a scenario picked. Its contents, frame, and
normalization are owned by
[`articulated-abi.md`](articulated-abi.md#appended-feature-block) and are not repeated
here.

Each 33-value contact slot is ordered as: normalized offset x/y, normalized
distance, health fraction, radius, action length, facing x/y, limb direction x/y,
limb spin, limb reach, minimum strike range, threat, frailty, velocity x/y,
knockback taken, knockback dealt, relative heft, action arc, 4-way action-role
one-hot, 5-way `Swing` one-hot, phase time, and declared attack line x/y.

Angles are represented as direction pairs rather than wrapped scalars. Action,
role, phase, and order categories are one-hot blocks rather than ordinal values.
Changing any width, order, normalization, or meaning requires a layout-version
bump and invalidates weights trained against the earlier layout.

This section supersedes the former
`DESIGN.md#what-the-agent-can-see-layout-versions-7-through-9` entry; the intervening
layouts remain history rather than the current ABI.

<!-- DOC_CONTRACT: submitted-command -->
## Policy output: `Command`

`Command` is the entire output of a policy or manual driver for one entity. It has
exactly four fields:

| Field | Current type | Contract |
|---|---|---|
| `move_dir` | `Vec2` | Desired direction and effort; the simulation clamps magnitude above one. |
| `intent` | `Intent` | Targeting/reporting intent. It does not itself cause damage. |
| `limb` | `LimbCommand` | The command for exactly one current limb. |
| `slot` | `u8` | Requested loadout slot; invalid or currently unavailable requests are ignored. |

A submitted command persists until another command is accepted for that entity.
`Command::HOLD` uses zero movement, `Intent::Hold`, slot zero, and
`LimbCommand::TUCKED`.

`Intent` has these current variants and state-hash discriminants:

| Variant | Discriminant | Payload |
|---|---:|---|
| `Hold` | 0 | none |
| `Attack` | 1 | generational `EntityId` |
| `Flee` | 2 | none |

## The single `LimbCommand`

There is one `LimbCommand`, not a left/right pair. It has:

- `angle: Angle` — an absolute world bearing;
- `reach: Fx` — desired normalized extension for a guard role, clamped to
  `0..=1`; and
- `strike: Strike` — attack choice for a strike role.

A guard role reads `angle` and `reach` and ignores `strike`. Strike and shoot
roles read `angle` and `strike` and ignore `reach`; attack extension is
phase-owned. A shoot role runs the attack phase machine but emits a projectile
instead of exposing a blade segment. A move role does not use the limb fields for
an attack or guard. Irrespective of which role currently reads them, all three
fields are part of the command's state-hash encoding.

`Strike` discriminants are append-only because the feature layout and command hash
use them:

| Variant | Discriminant | Meaning |
|---|---:|---|
| `None` | 0 | Hold/guard; also re-arms an attack. |
| `Nearest` | 1 | Choose the shortest windup from current blade position. |
| `Widdershins` | 2 | Wind up counter-clockwise, cut clockwise. |
| `Sunwise` | 3 | Wind up clockwise, cut counter-clockwise. |

<!-- DOC_CONTRACT: action-loadout-registry -->
## Actions and loadouts

`ActionKind` is an append-only mechanics registry. Its codes cross the wasm
boundary, occupy the feature layout, and enter state hashing:

| Action | Code | Current role | Playable |
|---|---:|---|---|
| `Punch` | 0 | `Strike` | yes |
| `Knife` | 1 | `Strike` | yes |
| `Sword` | 2 | `Strike` | yes |
| `Club` | 3 | `Strike` | yes |
| `Shield` | 4 | `Guard` | yes |
| `Run` | 5 | `Move` | yes |
| `Bow` | 6 | `Shoot` | yes |
| `Shortsword` | 7 | `Strike` | yes |

The current role discriminants are `Strike = 0`, `Guard = 1`, `Move = 2`, and
`Shoot = 3`. `ActionSpec` supplies `role`, `length`, `mass`, `balance`, guard
`arc`, `windup`, `recovery`, `ready`, and `move_bonus`. Exact numeric tuning is
owned by the `ACTIONS` table rather than repeated here.

`Loadout` has exactly two addressable slots: a required primary and an optional
secondary. `Loadout::SLOTS` is `2`; the hash/wasm sentinel for an empty secondary
is `255`. Slot lookup outside `0..2` returns `None` rather than clamping. Slot 1
may be emptied, while slot 0 may not: every fighter must have a primary action.

The `Command.slot` field is a request, not proof of what is held. `World` accepts
a change only when the requested slot exists, differs from the selected slot,
and the limb is in `Swing::Guard`. The selected slot changes as the swap begins;
`Swing::Swap` then makes the incoming action inactive for its ready duration.

<!-- DOC_CONTRACT: standing-inputs -->
## Host standing inputs

An `Order` is faction-wide and reaches observations exactly. It is not a per-unit
policy output. Current variants and append-only discriminants are:

| Variant | Discriminant | Payload |
|---|---:|---|
| `Hold` | 0 | none |
| `Advance` | 1 | heading `Vec2` |
| `Regroup` | 2 | none |
| `Focus` | 3 | generational `EntityId` |
| `Goto` | 4 | world-space destination `Vec2` |

An `Objective` is a separate faction-wide routing input:

| Variant | Discriminant | Meaning |
|---|---:|---|
| `None` | 0 | Build no route. |
| `Order` | 1 | Route toward a compatible standing order. |
| `Hunt` | 2 | Route toward living enemies. |

Orders and objectives are set and recorded independently. At replay playback, due
orders are applied before due objectives because `Objective::Order` reads the
standing order. See [Hashes and replay integrity](hashes.md).

Rust structure size, alignment, and enum memory layout are not stable command or
replay formats. The only current byte contract involving these types is the explicit
hash stream owned by their `hash_into` methods and `World::state_hash`.

> **Pending, not current:** v2-11 plans an articulated command vocabulary. Until
> that code lands, the one-limb shapes and discriminants above are authoritative.

## Source anchors

- Structured observation and current feature layout: [`Observation`](../../crates/sim/src/obs.rs#L582), [`FEATURE_LAYOUT_VERSION`](../../crates/sim/src/obs.rs#L966), [`Observation::write_features`](../../crates/sim/src/obs.rs#L1160)
- Subject-scoped articulated observation: [`ArticulatedObservation`](../../crates/sim/src/obs.rs#L431), [`World::observe_articulated`](../../crates/sim/src/world.rs#L1879)
- Strike variants and discriminants: [`Strike`](../../crates/sim/src/command.rs#L208)
- Current limb shape: [`LimbCommand`](../../crates/sim/src/command.rs#L277)
- Current policy output: [`Command`](../../crates/sim/src/command.rs#L325)
- Intent variants: [`Intent`](../../crates/sim/src/command.rs#L423)
- Action roles and append-only registry: [`Role`](../../crates/sim/src/action.rs#L28), [`ActionKind`](../../crates/sim/src/action.rs#L116)
- Two-slot loadout contract: [`Loadout`](../../crates/sim/src/loadout.rs#L18)
- Faction orders and encoding: [`Order`](../../crates/sim/src/command.rs#L447)
- Routing objectives: [`Objective`](../../crates/sim/src/command.rs#L554)
