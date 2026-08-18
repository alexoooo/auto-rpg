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

## Two things that are not free, and the session should say so before it starts

**The trained checkpoint dies with the legacy feature slice.** `LEARN_V2_FEATURE_COUNT`
reads a layout built on legacy observations, and `checkpoints/v2-probe.ckpt` is frozen
against it. Session 09 deliberately deferred widening that input; this session cannot
defer anything, because the columns underneath it are being deleted. The choice is
explicit and belongs at the top of the session: **retrain on an embodied slice, or
retire the learning probe with the model it was trained on.** Neither is wrong;
picking silently is.

**`Scenario::fingerprint` currently writes a combat-model identity word.** With one
model it can keep writing a constant or stop writing one. Stopping is simpler and
changes every fixture fingerprint, which invalidates recorded replays -- acceptable
under [the compatibility
waiver](embodied-00-overview.md#backwards-compatibility-is-not-a-constraint-here), and
worth doing in the same session rather than leaving a word that exists to distinguish
one thing from nothing.

## Acceptance

1. Session 09's embodied pins exist and have held across at least one unrelated
   change, so they are known to be live rather than merely recorded.
2. `cargo test`, the wasm gate, `check_docs`, `check_deps` and the client tests all
   green -- **including the client tests**, which the 2026-08-17 verification pass
   omitted and which caught a real regression the moment they were run.
3. The line count goes down substantially and nothing in `crates/sim` still matches
   on a model.
