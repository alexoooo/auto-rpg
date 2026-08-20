# Embodied submitted command version 2

**Purpose:** Define the embodied submission contract — payload bytes, coordinate frame, validation order, refusals by name, and wire identities — for the embodied combat model.
**Status:** current
**Canonical source:** This contract plus `crates/sim/src/command.rs`, `crates/sim/src/world/mod.rs`, `crates/sim/src/codec.rs`, `crates/sim/src/scenario.rs`, and `crates/web/src/lib.rs`.
**Update when:** An embodied input field, range, discriminant, refusal, byte offset, wire identity, or coordinate frame changes.

<!-- DOC_CONTRACT: embodied-command-v1 -->
## The embodied submission contract

The embodied command is **the only command grammar there is**. Its layout version is
`EMBODIED_COMMAND_LAYOUT_VERSION = 2`, and its payload is
`EMBODIED_PAYLOAD_BYTES = 57` bytes.

The **first fifty-three of those bytes are the older core payload** —
`ARTICULATED_PAYLOAD_BYTES` — and the two contracts diverge after byte 52, where a
`swing_plane` angle per arm continues. The wider command holds the core as one named
field rather than a flattened copy of its six, and both widths write that prefix
through the same private `write_payload`, so the shared-prefix claim is true by
construction rather than by two structs happening to agree.
`the_two_payload_contracts_share_a_prefix_and_diverge_after_byte_52` asserts it over a
fixture whose every field is distinct and asymmetric, so a writer that filled one
contract from the other's offsets could not pass by accident. It replaced
`an_embodied_payload_is_the_articulated_payload_byte_for_byte`, whose own doc comment
said it was the claim the swing-plane session would end on purpose.

**Both widths survive the deletion of the model the narrower one was named for**, and
the pair of names is deliberate: `ARTICULATED_PAYLOAD_BYTES` (53) beside
`EMBODIED_PAYLOAD_BYTES` (57) is the only surviving record of why there are two widths
at all, and three pinned digests read the narrower one. Renaming either would be a wire
change dressed as tidying — see [why the payload is
forked](#why-the-payload-is-forked).

Identical bytes were already not identical meanings before the widths parted — see
[the coordinate frame](#the-coordinate-frame-is-torso-relative).

## Why the payload is forked

**`ARTICULATED_PAYLOAD_BYTES` is a pinned width and not a leftover name.** It is
read by three digests in the [golden registry](hashes.md#golden-registry), which is why
it survived the model it is named for and why it must go on doing so:
`ARTICULATED_COMMAND_HASH`, which writes `payload_bytes()` for every stored command;
`EXACT_TRAJECTORY_STATE_DIGEST`, which writes the width as an explicit `u16` *and*
the payload bytes *and* folds in state digests that moved for the first reason; and
`LIFTED_COULOMB_SOLVER_DIGEST`, which reaches it through the same width word and the
same `payload_bytes()` in its command receipt.

Those three have already moved together twice, and the first of the two was exactly
this: a session appended one field — a `ReleaseRequest` per arm — to that payload,
taking it from 51 bytes to 53. All three pins and their wasm mirrors had to be
predicted in writing, re-recorded, and re-measured on both targets, in a session
whose subject was a bow.

**The swing-plane session is what the fork was for, and it has landed.** A
`swing_plane` angle per
arm was appended after byte 52, `EMBODIED_PAYLOAD_BYTES` went 53 → 57, and the
embodied layout version went 1 → 2. Not one of those three pins moved, and neither did
their wasm mirrors: the widening was a change to one width constant in a session about
elbows. The stance never reached the payload at all — the legs are derived
state, so they cost a hash column and no wire byte.

That is the whole of what the fork buys, and it is worth stating plainly, because it
is the only thing that justified a second contract during the sessions when its bytes
were identical to the first's.

**One thing the fork did not do by itself, and it is worth knowing which.** The
replay decoder read *both* schemas at `ARTICULATED_PAYLOAD_BYTES`, which was correct
only while the widths agreed. When the embodied payload grew, the writer emitted 57
bytes per record and that reader consumed 53, desynchronising everything after the
command stream — it surfaced as `LimitExceeded(OrderRecords)`, the order count being
read out of the middle of a payload, rather than as a wrong field. A forked width is
not self-enforcing at a reader that hard-codes the other one; the reader now derives
its width from the declared `command_schema`.

## Canonical 57-byte embodied payload

The replay and wasm layouts share this payload. Every offset is where `write_payload`
puts it. Scalars are little-endian.

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
| 53 | 2 | left swing plane raw `u16` |
| 55 | 2 | right swing plane raw `u16` |

Scalar ranges, the typed shape behind these bytes, and the shortest-turn rule are the
core payload's for offsets 0–52 and are not restated here: see [coordinate and
scalar rules](articulated-command-v1.md#coordinate-and-scalar-rules). Hold and Flee
require a zero target index and generation; Attack retains the exact submitted
generational identity. Keep and Release require a zero slot payload, EquipSlot
requires its requested slot byte, and a release verb is `0` or `1`. Noncanonical
ignored payloads are rejected.

**The swing plane has no structural check, and that is a decision rather than an
omission.** A structural check exists for a byte with illegal values — an intent tag,
a grip tag, a release verb. A raw `Angle` has none: all 65,536 bit patterns are legal
bearings, so there is nothing to refuse and a range invented here would refuse a plane
the actuator can hold. `no_swing_plane_is_structurally_illegal` asserts the acceptance
rather than leaving "no rule" and "a rule nobody wrote" looking the same from the call
site.

**Do not read offsets 0–52 beside the [53-byte
table](articulated-command-v1.md#canonical-53-byte-articulated-payload), find them
identical, and conclude the two are the same contract.** They agree on every shared
offset and disagree on which constant owns them, on how many follow, and on what two
of the fields mean.

## The coordinate frame is torso-relative

**There is one command frame and it is the torso's.** A predicate on the combat model
used to choose between an absolute world frame and this one, and it went with the
second model; what is left is not a default but the whole of the contract. The
distinction is still worth writing down, because every recording, corpus and trace
made before 2026-08-19 was made under the other frame and the bytes are identical:

- **`arms[..].bearing` is measured from the torso.** A zero bearing holds the arm
  directly ahead at every yaw. `World::world_arm_target` adds the body's yaw on the
  way in.
- **`move_dir` is read in the body frame.** `+x` is forward and `+y` is body-left, so
  `W` is `(1, 0)` at every yaw and a client no longer needs to know which way a body
  faces in order to drive it. `World::world_move_dir` rotates by yaw, giving
  `(x*cos - y*sin, x*sin + y*cos)`.
- **`body_yaw` is unchanged.** It is the torso's own world yaw under both models; a
  torso measured relative to itself would say nothing.

The conversion happens **once, on the way in**, at exactly two call sites: the arm
driver reads only the converted targets and never `command.arms`, and the movement
phase converts before clamping. The stored `ArmState` keeps a world bearing under
both models, because that is what the geometry, the contact phase and the pose
publication all read; storing a relative angle would make the published hand depend
on a yaw that every reader had to re-apply.

**Not one byte moved for any of this.** The frame change kept every offset, the
53-byte width it then had, layout version `1`, the record tag and the envelope
schema. Two of these fields changed meaning completely and nothing on the wire said
so — which is why the byte table above is not, by itself, the contract, and why a
reader who diffs the two tables and stops there gets the wrong answer. The swing
plane, by contrast, moved the width and the layout version together; that is the
difference between a frame change and a wire change, and it is the point the [closing
section](#a-wire-change-announces-itself-and-a-frame-change-does-not) returns to.

The older contract's absoluteness was a deliberate choice with a cost this one
declines to pay: **turning the body does not carry the sword**, so footwork and swing
are two independent subsystems that share a shoulder. A torso frame couples them. Turning
the hips swings the weapon, reaching across the body costs bearing travel the torso
could have supplied for free, and a body that must turn to bring its weapon round is
a body whose stance can constrain its attack. Neither reading is the better one: an
absolute bearing is stable under yaw, a relative one is stable under the body.

## Validation order and atomicity

At the byte boundary, the wasm `submit_embodied` export checks in this order:

1. envelope — layout version `2`, kind byte `2`, reserved byte zero;
2. live subject index plus generation;
3. payload structure: the
   intent tag and its canonical zero target, then each grip tag and slot, then each
   release verb;
4. raw numeric ranges, through the payload reader.

**A model check used to sit at step 2, ahead of the structure check**, and the
argument for that ordering is worth keeping even though there is nothing left to
check: a module that cannot act on a command at all owes that answer even when the
bytes it was handed are also malformed, because a refusal naming the bytes sends a host
looking for an encoder bug it does not have. The general rule — refuse on the coarsest
true reason first — is what the ordering above still applies.

Inside the world, the submission repeats the subject check and
then validates the core: movement x, movement y, then squared magnitude;
left height, reach, effort; right height, reach, effort. Grip resolution — whether the
requested slot is one this fighter actually carries — is last, and answers
`CommandReject::MissingEquipment { arm, slot }`.

The structure and range checks are ordered rather than merged for the reason the core
contract gives: a grip tag or a release verb this build does not know is structural and is
refused before any range check, which is why an unknown release byte cannot be
reported as an out-of-range field.

**The first failure chooses the diagnostic.** Unknown layout, wrong model, and a stale
subject answer `NotStored` and mutate nothing. A range or missing-equipment failure
for a resolved embodied subject replaces the *entire* request with one neutral
command: no valid arm, grip, or release field from the rejected request leaks
through. Atomicity is the property, not partial acceptance, because a command half
applied is a fight nobody can reproduce from the recorded bytes.

Raw range failures happen before a typed command can exist at all, so the byte
boundary uses a narrow fallback companion that accepts
only the rejected `CommandField`, repeats the subject check, and stores
the same neutral command a typed range rejection stores. It is not a second command
grammar and cannot store an arbitrary caller-supplied value.

The neutral command is the world's own neutral core widened to the full payload:
zero movement, body yaw and both arm bearings at the current authoritative yaw, Hold
with a zero target payload, MID height, zero reach and effort, Keep grips, Keep
releases, and **both swing planes at `Angle::ZERO`**. A neutral command holds rather
than looses, for the reason [the core contract
gives](articulated-command-v1.md#atomic-validation-fallback-and-recording): it is what
a slot falls back to when nobody has submitted anything, so a `Loose` there would fire
on behalf of every silent policy. The neutral plane is chosen on the same argument
from the other direction: zero is the plane `limb::elbow_point` defaults to, so a
refusal parks the elbow where it already was instead of swinging the arm to a plane
nobody asked for.

The `Stored` arm of the submission outcome returns the exact command stored, original
or fallback. A replay recorder records only that returned command; the rejection
reason is optional diagnostics and is neither replay input nor authoritative state.

## Wire identities

| Where | Value |
|---|---|
| `SubmittedCommand` record tag | `2` |
| Replay envelope `command_schema` | `3` |
| Replay envelope hash-domain byte | `2`, `HashDomain::EmbodiedV1` |
| Replay envelope hash schema | `1` |
| Scenario record combat-model byte | `2` |
| Scenario fingerprint identity word | `3` |
| Embodied command layout version | `2` |
| wasm envelope kind byte | `2` |

`SubmittedCommand::Embodied` is record tag `2`, appended after Legacy `0` and
Articulated `1` and never renumbered. A record is tick `u32`, subject index `u32`,
subject generation `u32`, tag `2`, then the 57-byte payload — 70 bytes, against the
articulated record's 66.

`EMBODIED_COMMAND_SCHEMA = 3` is the envelope's declared command schema. It is a third
value rather than a reuse of the articulated `2` because an envelope has to say how
wide its command records are before anything reads one — and **the two widths have now
diverged, so the schema is the only thing that can answer it.** Schemas `0`, `1`, and
`2` keep their meanings exactly. `read_submitted_command` derives the record width
from the declared schema rather than from `ARTICULATED_PAYLOAD_BYTES`, which is what
it did while the widths agreed and which desynchronised the stream the moment they did
not.

The codec checks `(command_schema, hash_domain, hash_schema)` as one
tuple, on both the encode and the decode side, and **exactly one combination is
accepted**: `(3, EmbodiedV1, 1)`. Anything else is `CommandModelMismatch`.

**Three columns where there were four, and the fourth did not shrink — it stopped
existing.** The model column read a scenario in memory and never a wire byte, so with
one model a tuple could not disagree with itself about it. The two retired *header*
combinations — `(0, LegacyV1, 1)` and `(2, ArticulatedV1, 1)` — are still refused by
their own numbers rather than forgotten: schema `0` fails the decoder's header check
with `UnknownCommandSchema(0)` before a byte of a command section is read, schema `2`
reaches the tuple and fails it there, and an envelope assembled in memory with either
hash domain fails the tuple one step before it can become a file.

`HashDomain::EmbodiedV1` is domain byte `2` and a domain of its own rather than a
wider `ArticulatedV1`, so comparing an embodied digest against an articulated one is
a type-level mismatch rather than two numbers that happen to differ — see [hash
domains V1](hash-domains-v1.md#primitive-and-typed-comparison). **All three domain
bytes are still declared and all three are still accepted by the header reader**,
because a domain byte is a wire value that outlives its model; what refuses a retired
one is the tuple.

The record tag is checked against the declared schema rather than believed: the
reader derives the expected tag from the schema, because a reader that trusted the
tag would silently read the wrong number of bytes out of a mislabelled envelope. A
tag that is a known variant but the wrong one answers `CommandModelMismatch`; an
unknown byte answers `UnknownDiscriminant` on `SubmittedCommandKind`.

### Two numbering schemes over one model, and they are frozen constants now

The combat model reached the wire twice, under two different numberings, and they were
never interchangeable:

| Member | Wire discriminant | Fingerprint identity word |
|---|---:|---:|
| Legacy | 0 | 1 |
| Articulated | 1 | 2 |
| Embodied | 2 | 3 |

The **wire discriminant** is the first byte of a scenario record, the
model byte in the state-digest prefix, and the payload tag the state digest writes
beside each stored command. An embodied world writes `2` in all three places, and it is
now `SCENARIO_MODEL_TAG`, `STATE_DIGEST_MODEL_TAG` and `STATE_DIGEST_PAYLOAD_TAG` —
three literals rather than one enum cast.

The **identity word** is a `u16` written into the scenario identity, and it is `3`. It
is now `SCENARIO_IDENTITY_WORD`.

**Both are literals rather than derivations, and the table above is why that is not
tidying-up debt.** `3` is not `2 + 1` and it is not the model's discriminant plus one:
the two schemes were always offset by one *by coincidence of ordering*, and the
function that used to answer the identity word existed precisely so nothing would
write `self as u16` and silently renumber a frozen identity. For the length of one
session there were two copies of that function, the codec's answered `2` for every
non-legacy model, and an embodied replay decoded to a fingerprint its own scenario did
not have. With one model left, a constant is the shape that cannot drift — and
renumbering either constant to "match" the other would repeat the exact defect the
function was written to prevent.

The rows for the two retired models are kept because a reader holding an old replay,
an old corpus or an old fingerprint needs to know which byte named which model.

`Scenario::embodied_duel` is the shipped fixture. It was built *from*
`articulated_duel`, so it differed by exactly two things and both belong in the
identity: the name bytes and the model word. That constructor has since been deleted
and this one inlined; the fingerprint did not move, which is the whole of what
"inlined" is claiming. It is pinned in the [golden
registry](hashes.md#golden-registry), and any corpus or evidence artifact naming
`embodied-duel-v1` is a claim about the fingerprint it was recorded against.

## Refusals, by name

A control that cannot honour a request refuses it **by name** and *returns* the
refusal, so a test can assert the sentence rather than read a log for it.

**This section carried an eight-row table and every row of it named a function that no
longer exists.** All eight were about a request arriving at a world of the wrong
grammar: an embodied command offered to a legacy or articulated world, an articulated
command offered to an embodied one, and the four legacy mutators — `World::submit`,
`face_legacy`, `set_loadout` and `set_body` — refusing an embodied world by gating on
`CommandGrammar::Legacy`. **With one grammar left there is no wrong world to arrive
at**, so the table is not a table of refusals that changed answers; it is a table of
questions nobody can ask.

Three things survive it and each is worth more than the rows were.

**`CommandReject::WrongModel` is still declared and is deliberately unproducible.** It
is a *wire* failure code: the browser boundary maps it onto a published submission
reason byte, so deleting the variant would renumber a shipped contract in order to
remove an arm no caller can reach. A page that saved a refusal, a worker that logged
one, another build's decoder — any of them can still be holding the number. This is
the same rule the replay codec states for a retired command schema, and it is why
`ARENA_POLICY_UNAVAILABLE` and `ARENA_NO_CHECKPOINT` keep their numbers on the far
side of the same wall.

**The ordering rule survives the check it ordered.** Each submission tested the
subject world's grammar *before* resolving the entity, so a wrong-model refusal never
depended on whether the handle happened to be live. Generalised: **refuse on the
coarsest true reason first**, because a caller told "stale entity" when the real answer
is "this module cannot act on your bytes at all" goes looking for the wrong bug. The
byte boundary still applies it — see [validation order](#validation-order-and-atomicity).

**The shape of the guard survives too, and it is the part most likely to be
re-litigated.** The four legacy mutators asked about the *command surface* — a
`CommandGrammar` test — rather than about the body, and that was chosen over an
`== Articulated` comparison precisely because a third model would have had to be
pattern-matched into one call site at a time. The predicate is gone with the models,
but the lesson is not: when a second body model returns, the guard belongs on what a
world will *accept*, not on what it is made of.

At the wasm boundary the refusal reasons are unchanged: wrong model is reason `2`,
stale entity `3`, unknown layout `1`. The bit
packing, the outcome codes, and the `CommandField` detail codes are the ones the
53-byte contract specified — see [its action
buffer](articulated-command-v1.md#fifty-seven-byte-wasm-action-buffer) — because there
was never a second grammar for the packed word, only a second width for the payload.

## Sixty-one-byte wasm action buffer

`EMBODIED_COMMAND_BYTES` is `4 + EMBODIED_PAYLOAD_BYTES`, derived from the embodied
width where the older buffer was derived from `ARTICULATED_PAYLOAD_BYTES`. They
were **61 and 57**; they were both 57 while both payloads were 53, and reading one
constant twice would have given that coincidence the force of a rule. **That is what
made the narrower buffer deletable without touching this one**, and the narrower one
is what went: the three `submitted_command_*` accessors and `submit_articulated` are
gone, and `tools/wasm_check.js` asserts their absence by name.

| Buffer offset | Width | Field |
|---:|---:|---|
| 0 | 2 | embodied command layout version `2` |
| 2 | 1 | `SubmittedCommand` tag `2` |
| 3 | 1 | reserved, must be zero |
| 4 | 57 | embodied payload |

```text
embodied_command_ptr() -> u32
embodied_command_len() -> u32                 // 61
embodied_command_layout_version() -> u32      // 2
submit_embodied(entity_index: u32, entity_generation: u32) -> u32
```

An arena also reuses this exact scratch and validator through
`arena_stage_input(faction_code)`. Staging copies the whole envelope, changes no
authoritative world state, and stamps the accepted command with the world's current
tick. Only faction codes `0` (Heroes) and `1` (Monsters) are legal, and only a side
whose arena control byte is Human accepts the command. Reason `30`
(`ARENA_INPUT_REFUSED`) distinguishes an unknown faction (detail `1`), a valid
policy-controlled side (detail `2`), and no installed arena (detail `3`). The named
Rust constants are the authority for those detail bytes.

The host source reads staged navigation and the configured primary arm on every
authoritative tick and holds one frame for fewer than six ticks. At age six it
contributes nothing, so composition's observation-relative neutral command replaces
stale host input. The primary arm is the only strike hand, otherwise the right hand;
its target, grip, release and swing plane come from the staged command. The opposite
arm remains policy-driven at the body's exact decision period, including its swing
plane. Every command that composition produces still travels through `World::submit`;
replay therefore records the stored whole command, not the host's partial request.

The buffer was a second fixed thread-local array rather than a second reader of the
narrower one, because one shared buffer would have to be as wide as whichever
payload grew last — and the whole point of the second width is that the two grow
apart, which they did. The array never moves and never grows linear memory, so a
host view kept over it is never detached. Submit copies all 61 bytes into a local
value before it validates anything, and mutates `World` only after the copy has
passed.

`embodied_command_layout_version()` answers `2` and `submitted_command_layout_version()`
answered `2` beside it — **for unrelated reasons, and the coincidence is worth keeping
now that only one side of it is left.** The narrower envelope reached layout 2 when a
release verb widened its payload to 53; this one reached layout 2 when the swing plane
widened its own to 57. Two envelopes, two histories, four bytes apart, each moving
when its own contract did — which is why a host must never read either number off the
other, and why this paragraph outlives the export it is half about.

## A wire change announces itself and a frame change does not

The swing plane moved `EMBODIED_PAYLOAD_BYTES` from 53 to 57 and
`EMBODIED_COMMAND_LAYOUT_VERSION` from 1 to 2, and every mirror of both — the wasm
buffer, `tools/wasm_check.js`, the record width in the replay codec — moved with them.
It touched `ARTICULATED_PAYLOAD_BYTES` not at all, so `ARTICULATED_COMMAND_HASH`,
`EXACT_TRAJECTORY_STATE_DIGEST` and `LIFTED_COULOMB_SOLVER_DIGEST` did not move.

Set that against what the torso frame did: it changed the meaning of eight payload
bytes and moved none of them. **A wire change announces itself and a frame change does
not** — which is why the frame is written down here, at the top of the contract,
rather than left to be inferred from a byte table that cannot express it.

## Two columns, and where the split fell

A command's six core fields are stored in the `World` column the 53-byte payload
always used: the submission writes the core to `World::command_core`, and the state
digest wrote a payload tag beside each entry to say which model it came from — `2` for
embodied, `1` for articulated. That tag is now the frozen literal
`STATE_DIGEST_PAYLOAD_TAG`, for the reason every retired wire value here is frozen:
five pinned digests were recorded over the byte it writes.

The swing plane could not go there, so it did not: it lands in
`World::elbow_plane`, a column of `[ElbowPlaneState; 2]` that was allocated behind a
model predicate exactly as `World::stance` was. This is the split the earlier text here
predicted — *the session that
adds the first embodied-only field is the session that splits the column, and it
cannot forget to: the field will have nowhere else to live.* It had nowhere else to
live. The predicates are gone with the second model and every column is allocated
unconditionally now; **the ordering they produced is not a free choice**, because the
pinned digests were recorded against it.

`ElbowPlaneState` keeps `commanded` beside `held`. The submission writes only
`commanded`, because a stored command is re-read every tick until a new decision
replaces it; the arms phase chases `held` toward it by at most
`ELBOW_PLANE_MAX_SPEED_RAW` raw units a tick, shortest way round. That rate is
`ARM_BEARING_MAX_SPEED_RAW` — an elbow may not swing about the arm's own axis faster
than the shoulder swings the whole arm — and it is a bound rather than a bill: the
work an arm does about its own axis is not modelled, so charging it to fatigue or
effort would be inventing a cost. The bound is **required and not polish**: a
commanded plane that jumped half a turn in one tick would sweep the forearm across the
body inside that tick and hand the contact solver a closing energy no arm can produce.

Both halves reach the `EmbodiedV1` digest and neither reaches the shared core hash,
because the column is written in the tail at the end of the state stream, after every
byte the 53-byte grammar writes, where `ground_z` and the stance already are.
**The guard that put them there is gone and the ordering is now load-bearing on its
own**: `legacy_core_hash` is folded by every state-digest pin in the repository, so a
column that reached it would move five pins for a reason nobody predicted — and would
move them in the same direction a real change does, which is the shape that survives
review. `every_embodied_only_column_moves_its_own_digest_and_not_the_legacy_core`
perturbs every field of every one of those columns and watches the embodied digest
move while the core hash stands still. It replaced
`an_embodied_only_column_cannot_move_an_articulated_digest`, and is deliberately not
that test renamed: half of the old one compared against a digest and a model that no
longer exist, and the old one perturbed a single stance word where this one sweeps them
all — it would have passed with four of the five stance words missing from the stream.
