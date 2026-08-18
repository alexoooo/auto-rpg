# Fight 06 -- the names

**Status:** ready once session 05 has landed. Blocks 07.

With one body model left, half the type names in `crates/sim` still qualify themselves
against models that no longer exist. `ArticulatedObservation` is *the* observation.
`submit_embodied_v1` is *the* submission. A qualifier that distinguishes nothing is
noise, and the qualifiers here are worse than noise because they name two retired models
and invite a reader to look for a third thing that never existed.

This session is mechanical, and its whole risk is that a mechanical session touching
dozens of files can move a byte without anybody noticing. **If any pin moves, the
rename changed a byte stream and is reverted rather than re-recorded.**

## The line this session does not cross

**Every published ABI name is frozen.** `ARTICULATED_POSE`, `ARTICULATED_REGION`,
`ARTICULATED_PROJECTILE`, `COMBAT_EVENT`, `EMBODIED_STANCE`, their layout versions, their
strides, their column indices, and the four reference documents named after them.

The reason is `AGENTS.md`'s own: the frame ABI is a handshake across five files, one of
which is byte-compared by `tools/check_abi.js` against a generator, and **a partial mirror
update is not green even if one side still draws.** Renaming a wire section buys a nicer
identifier and risks a half-mirror, and this repository has shipped three separate
architecture guards that passed while broken because they matched text rather than the
thing being judged.

What the ABI reference gains instead is one paragraph: the `ARTICULATED_` prefix names a
*section of the publication*, not a combat model, and it is historical in the same way a
file format's magic bytes are historical. That sentence costs nothing and stops the next
reader from filing the same question.

Internal Rust names carry no such contract. The compiler checks every one of them, so
they are free.

## The renames

In `crates/sim`:

| from | to |
|---|---|
| `ArticulatedObservation` | `Observation` |
| `ArticulatedCommandV1` | `CommandV1` |
| `ArticulatedPose` | `Pose` |
| `ArticulatedProjectileView` | `ProjectileView` |
| `ArticulatedUnitSpecV1` | `UnitSpecV1` |
| `ArticulatedPayloadError` | `PayloadError` |
| `MAX_ARTICULATED_OPPONENTS` | `MAX_OPPONENTS` |
| `MAX_ARTICULATED_ENTITIES` | `MAX_ENTITIES` |
| `World::observe_articulated` | `World::observe` |
| `World::articulated_pose` / `articulated_poses` | `World::pose` / `World::poses` |
| `World::articulated_projectiles` | `World::projectiles` |
| `World::submit_embodied_v1` | `World::submit` |
| `World::submit_embodied_fallback_v1` | `World::submit_fallback` |
| `World::articulated_state_digest` | `World::state_digest_of` |
| `SubmitEmbodiedOutcome` | `SubmitOutcome` |

In `crates/policy`:

| from | to |
|---|---|
| `EmbodiedPolicy` | `Policy` |
| `EmbodiedPolicyKind` | `PolicyKind` |
| `TacticalEmbodiedPolicy` | `TacticalPolicy` |
| `ScriptedEmbodiedPolicy` | `ScriptedPolicy` |
| `NeutralEmbodiedPolicy` | `NeutralPolicy` |
| `neutral_embodied_command` | `neutral_command` |
| `embodied_script.rs` | `script.rs` |
| `embodied_tactics.rs` | `tactics.rs` |

**Two constants keep their names and the reason is the wire.** `ARTICULATED_PAYLOAD_BYTES`
is 53 and `EMBODIED_PAYLOAD_BYTES` is 57; the first is the width three pinned digests are
taken over and the second is the width the swing plane appended. Renaming either would
make a registry row and a doc paragraph disagree with the source about which number is
which, and the two names are the only surviving record of *why* there are two widths.
They stay, with the sentence.

**`EmbodiedCommandV1` keeps its `Embodied`, or it does not, and this is a decision to
make rather than to default.** It is `{ articulated: CommandV1, swing_plane: [Angle; 2] }`
after the renames above, which reads as a struct containing a differently-named copy of
itself. The recommendation is to **flatten it into `CommandV1`** and delete the wrapper:
the two exist only because the payload widths had to grow apart, and a flattened struct
whose `payload_bytes` writes exactly the same 57 bytes changes no wire at all.

The check that says the flattening was byte-neutral is already written and already
pinned: `EMBODIED_COMMAND_BYTES` is asserted in `tools/wasm_check.js`, and
`ARTICULATED_COMMAND_HASH` carries the stored command's `payload_bytes()`. Neither
may move.

**But `ARTICULATED_COMMAND_HASH` is not "taken over the payload", which is what
this paragraph used to say.** It is `world.state_digest().value` of an unstepped
fixture, and the payload is one contributor among many -- so it also folds
`legacy_core_hash`, and session 01 moved it for exactly that reason. It is still
the right check for a byte-neutral flattening, because a fixture that does not step
cannot move it any other way; it is the wrong pin to *describe* as a payload pin,
since the next reader who has to predict a move will predict the wrong set.

## The naming vocabulary, stated once

The `EmbodiedPolicyKind` names -- `neutral`, `scripted`, `scripted-level`, `tactical` --
are **not renamed**, because a registry name is what a saved configuration, a URL and a
report headline carry, and the enum's own doc comment says the vocabulary is append-only.
`scripted-level` in particular describes a control that will outlive whatever the shipped
fighter is called.

## Hash expectations

**Nothing moves.** Every pin, every digest, every fingerprint, both feature
configurations, both targets.

This is the strongest hash expectation in the topic and it is also the easiest to verify,
which is what makes the session safe despite its size: run the full gate before and after
and compare. A rename that moves a number touched a byte stream, and the only way that
happens is that a `#[derive(Hash)]`, a `hash_into`, a payload writer or an ABI constant was
caught up in a find-and-replace. Revert and redo the affected file by hand.

## Verification

```powershell
cargo test
cargo test -p sim --features cartesian-recoil
cargo test -p lab --features cartesian-recoil
cargo build --release                                  # still zero warnings
cargo run --release -p lab -- embodied --corpus-digest
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
cargo build --release --target wasm32-unknown-unknown -p web --features cartesian-recoil
node --test tools/wasm_check.js
npm run check:abi
node tools/check_docs.js
node --test "client/test/*.test.mjs"
```

`npm run check:abi` is on this list and is not on the others: it byte-compares the
generated TypeScript against its generator, and it is the one gate that fails if a
published name moved when this session said it would not.

## Acceptance

1. No public name in `crates/sim` or `crates/policy` qualifies itself against a combat
   model, except the two payload-width constants, which say why in place.
2. Every published ABI name, layout version, stride and column index is unchanged, and
   `npm run check:abi` is green without regenerating.
3. Every pin in the golden registry is unmoved, on both targets and in both feature
   configurations.
4. `docs/reference/articulated-abi.md` explains that its prefix names a section rather
   than a model.
