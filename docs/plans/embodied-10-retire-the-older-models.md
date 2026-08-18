# Embodied 10 -- deleting the two models that got us here

**Status:** proposed, and scheduled rather than optional. Depends on
[09](embodied-09-observation-and-policy.md). The owner decided on 2026-08-17 that
`Legacy` and `Articulated` both go and that dead weight is not to be carried; what
this session owns is the *order*, because the two older models are currently the only
things in the tree that can drive a fight or measure one.

## The rule this session exists to obey

**The replacement measurement must be pinned and holding before the old one is
deleted.** Every other session in this set states which pins it expects to move and
treats a surprise as a bug. This one deletes most of the registry, so it cannot use
the registry as its own check -- it has to bring its own, and session 09 is where that
comes from: an embodied corpus, a scripted embodied policy, and the high-ground
measurement.

Delete first and there is nothing left to be wrong against. That is the whole reason
this is session 10 and not session 03.

## What goes

- `crates/sim/src/world/legacy.rs` entire, and the `LEGACY_PHASES` row of the phase
  table.
- `CombatModel` itself. With one model the six predicates
  ([`has_articulated_columns`, `uses_contact_solver`, `identity_word`, `has_stance`,
  `command_frame`, `command_grammar`](../../crates/sim/src/scenario.rs)) collapse to
  constants, and so do `CommandFrame` and `CommandGrammar`. **This is the payoff.**
  Those enums were built exhaustive so that a third model was a compile error at every
  decision point; with one model left they are six matches that can only answer one
  way, which is the definition of the weight this session removes.
- The legacy command grammar, `SubmittedCommand`'s first two arms, and the codec
  branches that read them.
- The legacy policies -- `minds.rs`, `duelist.rs`, `swing.rs`, `utility.rs` -- and the
  articulated ones, `articulated_script.rs` and `articulated_tactics.rs`, once
  `embodied_script.rs` covers what they were driving.
- Every Legacy- and Articulated-only golden pin, and the fixtures behind them.
- `sim::Observation`, `LEGACY_FEATURE_COUNT` and every feature index below 450. The
  vector stops being a legacy prefix with two blocks appended and becomes one block.
- **Five of `lab`'s ten subcommands.** `bench`, `verify`, `hash`, `duel` and `evolve`
  are all Legacy-only, and `verify` is the one that hurts: it is the run/re-run/replay
  agreement, which is a property of the *codec* rather than of the legacy model and
  has to survive the model it was written against. Session 09 owes its embodied
  replacement, and this session deletes the old one only once that is pinned and
  holding.
- The legacy `Policy` trait and `TeamPolicy` with the four policies that implement
  them. `TeamPolicy`'s per-side routing goes with them; the articulated seam already
  routes by side in the driver, which is the shape that survives.

## Two things that are not free, and the session should say so before it starts

**The trained checkpoint was going to die with the legacy feature slice, and it does
not.** This plan said `LEARN_V2_FEATURE_COUNT` reads a layout built on legacy
observations and that the choice was retrain or retire. **That was wrong, and the
survey that found it is worth keeping**: `learn_core::write_features` and
`write_features_v2` take an `&ArticulatedObservation` and build their own 41 and 59
columns from named fields. They never touch `sim::FEATURE_COUNT`, the 450-column
legacy prefix, or `sim::Observation` at all -- `model.rs`'s own header says so:
*"The 954-element vector is not the input, and that is the main decision."*

An embodied body produces an `ArticulatedObservation` like an articulated one does:
`CombatModel::has_articulated_columns` answers true for both. So the checkpoint keeps
its input across this deletion, `LEARNED_INFERENCE_DIGEST` keeps its synthetic corpus,
and there is no retrain bill.

What *does* die is `sim::Observation`, the legacy 450-column vector and every feature
index below 450 -- none of which the probe reads. The one thing to fix is an assertion:
`assert_eq!(sim::FEATURE_COUNT, 954)` in `learn-core/src/model.rs`, a documentation
cross-check beside the weight-count arithmetic.

**The correction matters more than the saving.** A session that had believed this plan
would have opened by deleting a checkpoint it did not need to delete, and would have
had the plan's own authority for doing it.

**`Scenario::fingerprint` currently writes a combat-model identity word.** With one
model it can keep writing a constant or stop writing one. Stopping is simpler and
changes every fixture fingerprint, which invalidates recorded replays -- acceptable
under [the compatibility
waiver](embodied-00-overview.md#backwards-compatibility-is-not-a-constraint-here), and
worth doing in the same session rather than leaving a word that exists to distinguish
one thing from nothing.

## What survives, measured rather than assumed

Two things a session opening this plan would reasonably expect to lose, and does
not. Both were checked on 2026-08-18 before the session started, because the cost
of assuming either way is a day.

**The browser frame survives Legacy.** `FRAME` looks like the legacy publication --
its unit rows carry `limb_angle_raw`, `action_kind` and `slot0_action`, and `init`
opens a legacy dungeon -- but `Sim::write_frame` reads `World::order`,
`World::view` and `alive_count`, none of which is model-keyed. `init_articulated`
and `init_embodied` publish a frame through the same writer. So `#/game` keeps its
renderer and this session changes which model `init` opens rather than deleting the
section it draws from.

**`Sim::descend` already routes through the model-aware builder**, which is what
`init_embodied` exercised: a descending hero carries an articulated row, and handing
that row to a plain Legacy `Scenario::dungeon` is a construction `World::new`
refuses. The generated floor is not legacy-only.

**The blast radius, counted.** `world/legacy.rs` is 3,263 lines; the four legacy
policies are 5,817 (`duelist` 2,348, `utility` 1,783, `minds` 852, `swing` 634) with
`genome.rs`'s 163 behind them; the two articulated policies are 3,816. That is
roughly 13k lines of outright deletion before `obs.rs` loses its 450-column prefix
and `lab/src/main.rs` loses five of its ten subcommands.

**`lab evolve` goes with the thing it evolves.** It evolves `UtilityWeights` through
`PolicySpec`, and the embodied script is not a genome. Porting evolution to a policy
with no weights would be inventing a subject for it; deleting it with `utility.rs` is
the honest call, and it should be made explicitly rather than by omission.

## The names outlive the models, and that is the trap

With `Articulated` deleted, `ArticulatedObservation`, `ArticulatedPolicy`,
`articulated_command`, `submit_articulated_v1`, `articulated_state_digest`,
`ArticulatedPose` and the `articulated-abi.md` reference all name a model that no
longer exists while describing the only one that does. Every one of them is the
*general* thing -- a three-dimensional body's observation, pose, command column and
publication -- wearing the name of the first model to have one.

Renaming them is the cheap half of this session and the half most likely to be
skipped, because nothing breaks if it is. What breaks later is a reader who finds
`ArticulatedObservation` in a repository with no articulated model and reasonably
concludes it is dead code. Rename in the same session as the deletion or the two facts
stop being connected.

The ABI reference is the exception worth arguing about rather than assuming: its
sections are wire contracts whose names appear in `abi.generated.ts`, in
`tools/wasm_check.js` and in the client. Renaming those is a layout-version move for
no behavioural gain, and the honest answer may be to keep the wire names and rename
only the Rust.

## Acceptance

1. Session 09's embodied pins exist and have held across at least one unrelated
   change, so they are known to be live rather than merely recorded.
2. `cargo test`, the wasm gate, `check_docs`, `check_deps` and the client tests all
   green -- **including the client tests**, which the 2026-08-17 verification pass
   omitted and which caught a real regression the moment they were run.
3. The line count goes down substantially and nothing in `crates/sim` still matches
   on a model.
