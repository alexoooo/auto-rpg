# Embodied 08 -- one hand human, one hand AI

**Status:** proposed. Depends on [05](embodied-05-torso-relative-command.md).

A human drives the main hand and navigation; a policy drives the off hand. Both
halves arrive as one submitted command, because the submission boundary is the whole
of the contract and a privileged human channel would be a second authority.

## Why this needs a seam at all

The pieces are already there: `EmbodiedCommandV1` carries independent left and right
`ArmTarget`, grip and release, and
[`ArticulatedPolicy`](../../crates/policy/src/lib.rs#L198) returns a whole command.
What is missing is the join, and it cannot live inside `sim`, because validation is
**atomic on purpose**: a range or missing-equipment failure "replaces the *entire*
request with one neutral command; no valid arm or grip field leaks through". A
half-command has no meaning at that boundary and must never reach it.

So composition happens strictly before submission, in `crates/policy`, and what
crosses into `sim` is one complete command that a replay records as one.

## The shape

```rust
/// Which parts of a command a source is entitled to fill.
pub struct CommandAuthority { pub navigation: bool, pub arms: [bool; 2] }

/// Fills the fields it owns and leaves the rest alone.
pub trait PartialArticulatedSource {
    fn authority(&self) -> CommandAuthority;
    fn contribute(&mut self, obs: &ArticulatedObservation, into: &mut EmbodiedCommandV1);
}

/// Composes sources into one command. Panic-free and total.
pub struct ComposedController { sources: Vec<Box<dyn PartialArticulatedSource>> }
```

`ComposedController` starts from the neutral command -- the same neutral command the
world substitutes for a silent slot, so an unclaimed field is unclaimed rather than
zero -- and applies each source in a fixed order.

**Overlapping authority is refused, by name, at construction.** Two sources both
claiming `arms[1]`, or none claiming `navigation`, is a configuration error and
`ComposedController::new` returns the refusal rather than printing it and exiting, so
a test can assert the sentence. This repository has shipped ten instances of a control
that accepted an input it could not act on and said nothing; the refusal path that no
test can name is how the last pair of them stayed green.

An `ArticulatedPolicy` becomes a source through one adapter that runs the whole policy
and copies out only the fields its authority covers. The policy still sees the whole
observation and still returns a whole command -- narrowing what it *sees* would make
the off hand blind to the fight, and narrowing what it *returns* would need a second
trait for no gain.

## Human input is a source like any other

The browser is one more `PartialArticulatedSource` whose `contribute` reads the input
state the page already collects: WASD into `move_dir`, which
[session 05](embodied-05-torso-relative-command.md) made body-relative so the client
needs no yaw of its own, and pointer state into the main arm's bearing, height, reach
and effort.

The recorded command is the composed one. A replay of a mixed fight therefore
reproduces it exactly without needing either the human or the policy, which is the
property [ADR 0002](../decisions/0002-record-commands-in-replays.md) exists for.

## Tests

- `a_composed_command_takes_each_field_from_the_source_that_owns_it`
- `an_unclaimed_field_holds_its_neutral_value_rather_than_zero`
- `two_sources_claiming_one_arm_are_refused_by_name_at_construction`
- `a_composed_controller_with_no_navigation_source_is_refused_by_name`
- `a_policy_adapter_contributes_only_the_arm_its_authority_names`
- `a_replay_of_a_composed_fight_needs_neither_the_human_nor_the_policy`
- `composition_order_does_not_depend_on_the_order_sources_were_added` -- authority is
  disjoint by construction, so it cannot; assert it rather than assume it.

## Verification

```powershell
cargo test
cargo test -p policy
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
```

## Hash expectation

**Nothing moves.** This session adds no `sim` state, no command field and no phase.
`crates/policy` sits outside the portability promise, and the one pin a policy change
has ever been predicted to move -- `ARTICULATED_STREAM_DIGEST` -- is driven by
`stream_digest_command` in `crates/web/src/lib.rs`, which never reaches a policy at
all. The `lab duel --seeds 400` win rates are the regression surface that does apply,
and the existing single-source policies must produce byte-identical commands after
being wrapped in an adapter that claims everything.
