# Articulated submitted command version 1

**Purpose:** Define the typed command, validation outcome, replay bytes, and wasm action buffer for the first articulated combat model.
**Status:** current
**Canonical source:** This contract plus `crates/sim/src/command.rs`, `crates/sim/src/world/mod.rs`, `crates/sim/src/codec.rs`, and `crates/web/src/lib.rs`.
**Update when:** An articulated input field, range, discriminant, fallback, or byte offset changes.

<!-- DOC_CONTRACT: articulated-command-v1 -->
## Coordinate and scalar rules

`move_dir` is a world-space planar vector. `body_yaw` and both arm bearings are
absolute world bearings: raw angle zero is +x and increasing raw values turn
counter-clockwise toward +y. `CombatHeight`, reach, and effort are continuous raw
16.16 values in `[0, 65_536]`; they are not physics bins.

`CombatHeight::LOW`, `MID`, and `HIGH` are raw 16,384, 32,768, and 49,152. The
constructor accepts every raw value in the closed range and rejects all others.
Scripted policy vocabulary may choose the constants without narrowing the command
boundary.

A valid movement vector has each raw component in `[-65_536, 65_536]` and
`x*x + y*y <= 4_294_967_296`, evaluated exactly in signed `i64`. Each arm reach and
effort is independently within `[0, 65_536]`. Angles accept every `u16` value.

The shortest signed turn from current raw angle `c` to target `t` is the signed
`i16` interpretation of `t.wrapping_sub(c)`, in `[-32_768, 32_767]`. Negative is
clockwise, so an exact half turn (`-32_768`) always chooses clockwise.

## Discriminants and typed shape

| Type | Discriminants |
|---|---|
| `CombatModel` | Legacy `0`, Articulated `1` |
| `SubmittedCommand` | Legacy `0`, Articulated `1` |
| `LimbSlot` | LeftArm `0`, RightArm `1` |
| `GripRequest` | Keep `0`, Release `1`, EquipSlot `2` |
| `ReleaseRequest` | Keep `0`, Loose `1` |
| `Intent` | Hold `0`, Attack `1`, Flee `2` |

An `ArmTarget` is bearing `Angle`, height `CombatHeight`, reach `Fx`, effort `Fx` in
that order. `ArticulatedCommandV1` is move x/y, body yaw, intent, left arm, right arm,
left grip, right grip, left release, right release. Array position—not a redundant
encoded limb byte—identifies the arm.

`ReleaseRequest` is **not** a second grip release. `GripRequest::Release` drops what
the hand holds; `ReleaseRequest::Loose` asks a drawn weapon to let its missile go, and
the two sit two fields apart, so they are named apart. `Loose` is the word the frame
ABI's `EVENT_LOOSE` has always used for it.

**It is a level, and the mechanic it feeds is an edge.** A command says what the arm
asks for on that tick, and a policy that asks forever asks on every tick.
`ReleaseRequest::looses(previous, current)` is the transition, and it is the only form
a consumer may read; reading the level fires once per tick for as long as it is held.
Nothing consumes the verb yet — it is submitted, hashed and replayed, and no world
acts on it.

Grip requests mean desired binding transition, not proof of current equipment.
`EquipSlot` accepts only slot `0` or populated slot `1`. Both arms may request the
same populated slot; immutable `GripBinding` in v2-12 decides whether that request is
physically compatible. `Keep` and `Release` are structurally valid before persistent
grip state lands in v2-13.

For a valid `GripBinding::Both` transaction, both arms request the same slot. The
right-arm target is authoritative and the left target remains encoded and hashed
but is not actuated; v2-13 mirrors the off hand by the exact rule in
[Articulated actuators](articulated-actuators.md#grip-transactions-and-shield-pose).

## Canonical 53-byte articulated payload

The replay and wasm layouts share this payload. It was 51 bytes through layout
version `1`; layout `2` appends the two release verbs at offsets 51 and 52 and moves
nothing above them.

| Payload offset | Width | Field |
|---:|---:|---|
| 0 | 4 | move x raw `i32` |
| 4 | 4 | move y raw `i32` |
| 8 | 2 | body yaw raw `u16` |
| 10 | 1 | intent tag |
| 11 | 4 | intent target entity index |
| 15 | 4 | intent target entity generation |
| 19 | 2 | left bearing raw |
| 21 | 4 | left height raw |
| 25 | 4 | left reach raw |
| 29 | 4 | left effort raw |
| 33 | 2 | right bearing raw |
| 35 | 4 | right height raw |
| 39 | 4 | right reach raw |
| 43 | 4 | right effort raw |
| 47 | 1 | left grip tag |
| 48 | 1 | left grip slot payload |
| 49 | 1 | right grip tag |
| 50 | 1 | right grip slot payload |
| 51 | 1 | left release verb |
| 52 | 1 | right release verb |

Hold and Flee require zero target index and generation. Attack retains the exact
submitted generational identity; a target that later fails to resolve is ordinary
total simulation behavior. Keep and Release require a zero slot payload. EquipSlot
requires its requested slot byte. A release verb is `0` or `1`; any other value is
refused by arm and value, exactly as an unknown grip tag is. Noncanonical ignored
payloads are rejected.

## Command-schema-2 replay records

Each record starts with tick `u32`, subject index `u32`, subject generation `u32`,
then SubmittedCommand tag `u8`.

- tag `0` is followed by the 25-byte legacy command payload from
  `replay-codec-v1.md`, for 38 bytes total;
- tag `1` is followed by the 53-byte articulated payload above, for 66 bytes total.

The envelope tuple permits tag `1` only because the articulated command schema is
paired with an Articulated scenario. That schema is `2` since the release verb landed
and was `1` before it; `ARTICULATED_COMMAND_SCHEMA_RESERVED` is asserted equal to
`SUBMITTED_COMMAND_LAYOUT_VERSION` at compile time, so the two cannot drift. Schema
`1` is retired and is now refused as unknown. The tag-0 grammar is specified so the
SubmittedCommand layout is complete, but an articulated-schema replay containing it is
a model mismatch. Schema 0 remains the 37-byte untagged legacy record and is never
reinterpreted as this format.

## Fifty-seven-byte wasm action buffer

The wasm input buffer is:

| Buffer offset | Width | Field |
|---:|---:|---|
| 0 | 2 | submitted-command layout version `2` |
| 2 | 1 | SubmittedCommand tag `1` |
| 3 | 1 | reserved, must be zero |
| 4 | 53 | articulated payload |

The boundary owns a fixed `[u8; 57]` scratch array and exports:

```text
submitted_command_ptr() -> u32
submitted_command_len() -> u32                 // 57
submitted_command_layout_version() -> u32      // 2
submit_articulated(entity_index: u32, entity_generation: u32) -> u32
```

The host obtains a fresh 57-byte view, writes it, drops the view, then calls submit.
Submit first copies all 57 bytes into a local value, verifies
layout/tag/reserved-byte/canonical payload, and only then mutates `World`. Unknown
layout, legacy tag, or noncanonical bytes fail before mutation. Pointer and length
are transport facts, never Rust struct size or alignment.

The submit result word is packed as:

```text
bits  0..7   outcome: not stored 0, stored original 1, stored fallback 2
bits  8..15  reason: none 0, unknown layout 1, wrong model 2, stale entity 3,
                         out of range 4, missing equipment 5
bits 16..23  detail: CommandField code for out-of-range; LimbSlot for missing item;
                         otherwise 0
bits 24..31  requested slot for missing equipment; otherwise 0
```

`CommandField` detail codes are MoveX `0`, MoveY `1`, MoveMagnitude `2`, LeftHeight
`3`, LeftReach `4`, LeftEffort `5`, RightHeight `6`, RightReach `7`, and RightEffort
`8`. Unknown-layout detail is zero because the attempted `u16` remains in the copied
buffer and diagnostics may report it directly. All unused detail bytes are zero.

The wasm boundary also exports `state_digest_lo`, `state_digest_hi`,
`state_digest_domain`, and `state_digest_schema`, plus the narrow
`init_articulated_test` fixture. They let `tools/wasm_check.js` prove that the same
submitted bytes produce the same typed digest natively and under wasm before the
representative articulated room lands. Existing legacy hash exports and `init`
retain their meanings.

## Atomic validation, fallback, and recording

Validation order is normative:

1. layout version at the byte boundary;
2. subject world model;
3. live subject index plus generation;
4. movement x, movement y, then squared magnitude;
5. left height, reach, effort;
6. right height, reach, effort;
7. left grip slot, then right grip slot;
8. left release verb, then right release verb.

Steps 7 and 8 are structural rather than numeric: a grip tag or a release verb this
build does not know is refused before any range check, which is why an unknown release
byte cannot be reported as an out-of-range field.

The first failure chooses the diagnostic. Unknown layout, wrong model, and stale
subject return `NotStored` and mutate/record nothing. A range or missing-equipment
failure for a resolved articulated subject replaces the *entire* request with one
neutral command; no valid arm or grip field leaks through.

Raw numeric range failures occur before a typed command can exist. The browser
boundary therefore uses `World::submit_articulated_fallback_v1`, a narrow companion
that accepts only the rejected `CommandField`, repeats model and subject checks,
and returns the same stored neutral command a typed range rejection returns. It is
not a second command grammar and cannot store an arbitrary caller-supplied value.

The neutral command is exactly:

```text
move                         (0, 0)
body yaw                     current authoritative facing/yaw
intent                       Hold, zero target payload
left and right bearing       current authoritative facing/yaw
left and right height        MID (raw 32,768)
left and right reach/effort  raw 0
left and right grip          Keep
left and right release       Keep
```

A neutral command holds rather than looses. That is the command a slot falls back to
when nobody has submitted one, so a `Loose` there would fire on behalf of every silent
policy.

`SubmitArticulatedOutcome::Stored` returns the exact command stored, whether original
or fallback. A replay recorder records only that returned command. Rejection reason
is optional diagnostics and is neither replay input nor authoritative state.

## Articulated state-hash block

After the ArticulatedV1 prefix in
[Hash domains V1](hash-domains-v1.md#primitive-and-typed-comparison), write allocated slot count
`u32`, then for every slot in ascending index: presence `u8`; when present, the
SubmittedCommand tag and canonical payload. The stored articulated command is always
tag `1`. Dead allocated slots retain their last stored command and presence, matching
the legacy core's dead-slot coverage. Every payload byte participates even when the
current actuator ignores it.
