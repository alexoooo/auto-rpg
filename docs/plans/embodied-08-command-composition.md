# Embodied 08 -- one hand human, one hand AI

**Status:** complete. Landed 2026-08-17. No pin moved.

A human drives the main hand and navigation; a policy drives the off hand. Both
halves arrive as one submitted command, because the submission boundary is the whole
of the contract and a privileged human channel would be a second authority.

## Why this needs a seam at all

The pieces were already there: `EmbodiedCommandV1` carries independent left and right
`ArmTarget`, grip and release, and
[`ArticulatedPolicy`](../../crates/policy/src/lib.rs#L202) returns a whole command.
What was missing is the join, and it cannot live inside `sim`, because validation is
**atomic on purpose**: a range or missing-equipment failure "replaces the *entire*
request with one neutral command; no valid arm or grip field leaks through". A
half-command has no meaning at that boundary and must never reach it.

So composition happens strictly before submission, in
[`crates/policy/src/composition.rs`](../../crates/policy/src/composition.rs#L21), and
what crosses into `sim` is one complete command that a replay records as one.

## The shape

```rust
pub struct CommandAuthority { pub navigation: bool, pub arms: [bool; 2] }

pub trait PartialEmbodiedSource {
    fn authority(&self) -> CommandAuthority;
    fn contribute(&mut self, obs: &ArticulatedObservation, into: &mut EmbodiedCommandV1);
    fn reset(&mut self) {}
}

pub struct ComposedController { sources: Vec<Box<dyn PartialEmbodiedSource>> }
```

Navigation is **one flag rather than three**, because `move_dir`, `body_yaw` and
`intent` are a single decision -- where the body is going and what it is going there
for. Splitting them would let two sources disagree about a fact with one answer.

`ComposedController::decide` starts from the neutral command -- the same one the world
substitutes for a silent slot -- so a field nobody wrote is *unclaimed* rather than
zero, and applies each source in a fixed order.

**Overlapping and missing authority are refused, by name, at construction**, which is
the only place the answer is knowable without running a fight. `ComposedController::new`
returns a `CompositionError` rather than printing it and exiting, and the error carries
its own sentence, so a test can assert the words. This repository has shipped ten
instances of a control that accepted an input it could not act on and said nothing;
the refusal path that no test can name is how the last pair of them stayed green.

The checks are ordered so the *first* thing wrong is the thing reported, which is the
same rule submission validation already follows.

An `ArticulatedPolicy` becomes a source through `PolicySource`, one adapter that runs
the whole policy and copies out only the fields its authority covers. The policy still
sees the whole observation and still returns a whole command -- narrowing what it
*sees* would make the off hand blind to the fight, and narrowing what it *returns*
would need a second trait for no gain.

## Human input is a source like any other

The browser is one more `PartialEmbodiedSource` whose `contribute` reads the input
state the page already collects: WASD into `move_dir`, which
[session 05](embodied-05-torso-relative-command.md) made body-relative so the client
needs no yaw of its own, and pointer state into the main arm's bearing, height, reach
and effort. `crates/policy/tests/composition.rs` carries a stand-in for exactly that,
and it is a stand-in rather than a mock: it is a source that is **not** a policy and
does not exist at playback time, which is the property the replay test turns on.

## Tests

In `crates/policy/src/composition.rs`:

- `a_composed_command_takes_each_field_from_the_source_that_owns_it`
- `an_unclaimed_field_holds_its_neutral_value_rather_than_zero`
- `two_sources_claiming_one_arm_are_refused_by_name_at_construction` and
  `two_sources_claiming_navigation_are_refused_by_name_at_construction` -- each
  asserts the enum **and** the sentence
- `a_composed_controller_with_no_navigation_source_is_refused_by_name` and
  `a_composed_controller_with_an_undriven_arm_is_refused_by_name`
- `a_policy_adapter_contributes_only_the_arm_its_authority_names` -- asserts both
  halves: the arm it owns came from the policy, *and* the fields it does not own did
  not, including ones the policy filled in its own return value
- `a_source_claiming_everything_reproduces_its_policy_byte_for_byte`
- `composition_order_does_not_depend_on_the_order_sources_were_added` -- authority is
  disjoint by construction so it cannot; asserted rather than assumed, because a
  future `contribute` that read a field another source had written would break it
- `resetting_a_composed_controller_resets_every_source`

In `crates/policy/tests/composition.rs`:

- `a_replay_of_a_composed_fight_needs_neither_the_human_nor_the_policy` -- 240 ticks
  of a mixed fight recorded as `SubmittedCommand::Embodied`, then played back with
  nothing that decided anything in the room, and compared on the state digest *and*
  the published poses
- `the_two_hands_of_a_composed_fight_are_visibly_driven_by_different_things` -- the
  half that makes the test above mean something. If both hands did the same thing, a
  replay that dropped one of them would still reproduce it. This asserts the off hand
  held one bearing all fight while the main hand swept, and that the two differ.
- `a_controller_claiming_everything_drives_the_fight_its_policy_would_have`

**Shown failing.** Deleting the overlap check turns exactly the two "claimed twice"
tests red and leaves the other eight green. Recording only the policy's half -- what a
controller that composed *after* submission would be forced to do -- turns the replay
test red on "a composed fight did not reproduce from its own record".

## Verification, as run

```powershell
cargo test
cargo test -p policy
cargo run --release -p lab -- verify --seeds 200
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
```

## Hash expectation, and what happened

**Nothing moved.** This session adds no `sim` state, no command field and no phase.
`crates/policy` sits outside the portability promise, and the one pin a policy change
has ever been predicted to move -- `ARTICULATED_STREAM_DIGEST` -- is driven by
`stream_digest_command` in `crates/web/src/lib.rs`, which never reaches a policy at
all. The `lab duel --seeds 400` win rates are the regression surface that does apply,
and they answer 238/162 at 59.5% as they have since before session 01; no existing
policy was wrapped or edited, so the surface was not disturbed in the first place.
