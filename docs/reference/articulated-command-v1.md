# Articulated submitted command version 1

**Purpose:** Define the typed command, validation outcome, replay bytes, and wasm action buffer of the 53-byte core payload -- the first fifty-three bytes of every command the surviving model accepts.
**Status:** current
**Canonical source:** This contract plus `crates/sim/src/command.rs`, `crates/sim/src/world/mod.rs`, `crates/sim/src/codec.rs`, and `crates/web/src/lib.rs`.
**Update when:** A core input field, range, discriminant, fallback, or byte offset changes.

**This document is named for a combat model that no longer exists and is still
current, which is worth one paragraph before anything else.** The articulated model
was deleted; its 53-byte payload was not. `ARTICULATED_PAYLOAD_BYTES` is `53`, three
pinned digests are taken over it, and every command the surviving model accepts opens
with these exact fifty-three bytes before a swing plane per arm continues to 57 -- see
[`embodied-command-v1.md`](embodied-command-v1.md#the-embodied-submission-contract).
So the scalar rules, the byte table and the packed result word below are **live
contracts**; what is retired is the *second submission path* that used to carry them
on its own, and each section that describes one says so in place. Renaming the width
constant would move three pins to buy a word, which is why it is frozen.

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
| combat model, on the wire | Legacy `0`, Articulated `1`, Embodied `2` |
| submitted-command record tag | Legacy `0`, Articulated `1`, Embodied `2` |
| `LimbSlot` | LeftArm `0`, RightArm `1` |
| `GripRequest` | Keep `0`, Release `1`, EquipSlot `2` |
| `ReleaseRequest` | Keep `0`, Loose `1` |
| `Intent` | Hold `0`, Attack `1`, Flee `2` |

**The first two rows are wire numberings and no longer enums.** Both models they
numbered are deleted and both numbering schemes are frozen: the surviving `2` is a
constant in `crates/sim`, and `0` and `1` are refused *by their own numbers* rather
than forgotten, so a saved replay can be told apart from a corrupt one. The four rows
below them are live Rust enums.

An `ArmTarget` is bearing `Angle`, height `CombatHeight`, reach `Fx`, effort `Fx` in
that order. The core command is move x/y, body yaw, intent, left arm, right arm,
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
but is not actuated; the off hand is mirrored by the exact rule in
[Articulated actuators](articulated-actuators.md#grip-transactions-and-shield-pose).

## Canonical 53-byte articulated payload

The replay and wasm layouts share this payload, and it is the prefix of the 57-byte
one every command now carries. It was 51 bytes through layout
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

## Command-schema-2 replay records, retired

**Nothing can write one and nothing will decode one.** Command schema `2` reaches the
decoder's header check, which knows the number, and then fails the envelope's schema
tuple -- the only accepted combination is `(3, EmbodiedV1, 1)`, and the surviving
records are 70 bytes rather than 66. The grammar is kept here because a file carrying
it still exists somewhere and a reader has to be able to say *which* retired format it
is holding.

Each record started with tick `u32`, subject index `u32`, subject generation `u32`,
then a record tag `u8`.

- tag `0` was followed by the 25-byte legacy command payload from
  `replay-codec-v1.md`, for 38 bytes total;
- tag `1` was followed by the 53-byte payload above, for 66 bytes total.

`read_submitted_command` refuses both tags **by number** rather than reading a record
at the wrong width and desynchronising every record after it -- which is the failure
mode a forked width produces at a reader that hard-codes the other one, and it has
happened here once already. Schema `2` was `1` before the release verb landed;
`ARTICULATED_COMMAND_SCHEMA_RESERVED` is still asserted equal to
`SUBMITTED_COMMAND_LAYOUT_VERSION` at compile time, so the retired pair cannot drift
apart in the record of what they were. Schema `1` is refused as unknown and schema `0`
-- the 37-byte untagged legacy stream -- is refused by the header check before a byte
of any command section is read.

## Fifty-seven-byte wasm action buffer

**The buffer and its four exports are gone; the packed result word below is live and
is the reason this section is.** Every rule here is now applied at the 61-byte buffer
in [`embodied-command-v1.md`](embodied-command-v1.md#sixty-one-byte-wasm-action-buffer),
which is this shape four bytes wider.

The wasm input buffer was:

| Buffer offset | Width | Field |
|---:|---:|---|
| 0 | 2 | submitted-command layout version `2` |
| 2 | 1 | record tag `1` |
| 3 | 1 | reserved, must be zero |
| 4 | 53 | core payload |

The boundary owned a fixed `[u8; 57]` scratch array and four exports --
`submitted_command_ptr`, `submitted_command_len`, `submitted_command_layout_version`
and `submit_articulated` -- all four deleted together, and `tools/wasm_check.js`
asserts their absence by name. **Keeping the scratch without the submission was
considered and refused**: it would have left a buffer a page could fill and nothing
could act on, which is the shape of refusal this repository has already paid for
twice.

The handshake is unchanged at the wider buffer: the host obtains a fresh view, writes
it, drops the view, then calls submit. Submit first copies every byte into a local
value, verifies layout/tag/reserved-byte/canonical payload, and only then mutates
`World`. Unknown layout, a tag from a retired grammar, or noncanonical bytes fail
before mutation. Pointer and length are transport facts, never Rust struct size or
alignment.

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
`state_digest_domain`, and `state_digest_schema`, plus the narrow `init_embodied_test`
fixture. They let
`tools/wasm_check.js` prove that the same
submitted bytes produce the same typed digest natively and under wasm, and
`ARTICULATED_COMMAND_HASH` is taken over that fixture. **There were two fixtures and
now there is one**: a model refusal has two directions, each needed a world of the
other grammar, and with one grammar left there is no wrong model to offer. Both
refusal tests went with the second fixture.

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
failure for a resolved subject replaces the *entire* request with one
neutral command; no valid arm or grip field leaks through. **The wrong-model arm has
no producer left and keeps its number**, because it is a wire failure code the browser
maps onto a published reason byte -- see [refusals, by
name](embodied-command-v1.md#refusals-by-name).

Raw numeric range failures occur before a typed command can exist. The browser
boundary therefore uses a narrow fallback companion
that accepts only the rejected `CommandField`, repeats the subject check,
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

The `Stored` arm of the submission outcome returns the exact command stored, whether
original or fallback. A replay recorder records only that returned command. Rejection
reason is optional diagnostics and is neither replay input nor authoritative state.

## The command block in the state hash

After the domain prefix in
[Hash domains V1](hash-domains-v1.md#primitive-and-typed-comparison), write allocated slot count
`u32`, then for every slot in ascending index: presence `u8`; when present, the
record tag and canonical payload. **The tag is a frozen literal now** -- it was `1`
for an articulated world and `2` for an embodied one, read off the world's model, and
with one model left it is the constant `2`. Five pinned digests were recorded over that
byte, so it is not a value to derive again. Dead allocated slots retain their last
stored command and presence, matching
the shared core's dead-slot coverage. Every payload byte participates even when the
current actuator ignores it.
