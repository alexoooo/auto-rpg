# Embodied 09 -- what a fighter perceives about a body it now has

**Status:** proposed. Depends on [07](embodied-07-elbow-and-forearm.md) and
[08](embodied-08-command-composition.md).

Give the observation the state the previous six sessions added, write a scripted
embodied policy that can drive it, and decide -- with a measurement, not in advance --
whether the learning probe follows.

## The feature block

`ArticulatedObservation` gains an embodied block, appended after the articulated one,
never interleaved. Per self:

```text
ground_z relative to the opponent's, hip yaw relative to torso yaw, twist as a
fraction of the budget, pelvis height, step_left as a fraction of its duration,
and per arm: elbow position relative to the shoulder, and reach headroom -- how
much of the annulus is left before the clamp bites
```

and the same, narrower, per perceived opponent: their relative ground height, their
twist fraction, and whether they are mid-step. Fixed width, zeros for absent
opponents, on the rule the articulated block already follows: a vector whose width
depends on how much the observer perceives makes "how much do I perceive" something
the network has to infer from the shape of its own input.

**Reach headroom rather than raw reach is the one non-obvious column and it is the
point of the block.** After [session 07](embodied-07-elbow-and-forearm.md) an arm can
be commanded to a pose it cannot hold. A fighter that can see how much extension it
has left can choose between stepping in and reaching further; one that sees only the
current reach cannot tell a comfortable guard from a locked-out one.

Opponent twist is the perception that makes [session 06](embodied-06-stance.md) a
tactic rather than a constraint: a body wound to its limit must step before it can
swing back, and that is the opening.

## Hash expectation, stated before the edit

`FEATURE_LAYOUT_VERSION` at
[`obs.rs#L966`](../../crates/sim/src/obs.rs#L966) goes **12 to 13**, and
`FEATURE_COUNT` at [`obs.rs#L855`](../../crates/sim/src/obs.rs#L855) grows by the
embodied width. That version exists to be bumped and its doc comment says why: the
layout is the contract a trained network is frozen against.

**The `legacy feature prefix` pin must not move, and it is the guard rather than a
casualty.** It fingerprints feature indices `0..450` of a scripted 600-tick Legacy
skirmish plus the state hash the resulting commands produce, and its whole purpose is
to stay still while later blocks grow. Appending after the articulated block leaves
it untouched. A move there means a frozen column was renumbered, which is the one
thing that pin exists to refuse, and the session stops.

**`LEARNED_INFERENCE_DIGEST` moves only if `LEARN_V2_FEATURE_COUNT` widens, and this
session should probably not widen it.** The shipped checkpoint reads the v2 slice; an
embodied fight can be driven by the scripted policy while the learned one keeps its
existing input. Deferring is the cheaper and more honest order, because widening the
network's input costs a retrain and a re-score before anyone knows whether the new
columns carry signal.

If a later session does widen it, the move is *owned* -- the registry names the
feature layout as one of the five things that owns that pin -- and it is not a
portability failure. It owes a re-score against **88.922**, the mean return the
shipped checkpoint scored on `learn-probe evaluate`'s 400 held-out seeds, obtained
with:

```powershell
cargo run --release -p lab -- learn-probe evaluate --checkpoint checkpoints/v2-probe.ckpt
```

## The scripted policy

`crates/policy/src/embodied_script.rs`, a sibling of `articulated_script.rs` rather
than a mode of it, because the two read bearings in different frames and a shared file
would make the frame a runtime question. It must be able to express, at minimum:
close and strike, hold a guard while circling, step deliberately to unwind a
saturated twist, and use elevation -- take the high ground and strike down from it.

The last one is the acceptance criterion for [session
04](embodied-04-terrain-and-elevation.md) having been worth doing, and it is measured
rather than asserted: on a sculpted corpus, a policy that seeks the high ground must
beat the same policy with that term disabled.

## Tests and measurements

- `the_legacy_feature_prefix_is_unmoved_by_the_embodied_block`
- `an_embodied_observation_has_a_fixed_width_whatever_it_perceives`
- `reach_headroom_falls_to_zero_exactly_where_the_annulus_clamp_bites`
- `an_opponent_mid_step_is_visible_as_mid_step`
- `a_feature_vector_written_twice_from_one_world_is_identical`
- `the_high_ground_term_wins_more_duels_than_it_loses` -- 400 mirrored seeds on a
  sculpted corpus, reported with its range across several pinned processes rather
  than a best-of, and bracketed `control -> subject -> control` inside each round.
  `lab bench` numbers swing 2-3x run to run on a hybrid-core laptop and best-of-N
  cannot tell a migrated process from a clean one.

## Verification

```powershell
cargo test
cargo run --release -p lab -- hash
cargo run --release -p lab -- verify      --seeds 200
cargo run --release -p lab -- duel        --seeds 400
cargo run --release -p lab -- articulated --seeds 400 --mirrored
cargo build --release --target wasm32-unknown-unknown -p web
node --test tools/wasm_check.js
node tools/check_docs.js
```

## What closes the topic

The plan set is deleted in the commit that finishes it, and what survives goes to
durable documents rather than staying here as a ledger:

- `docs/reference/embodied-command-v1.md`, `embodied-actuators.md` and the embodied
  sections of the ABI reference are the contracts;
- the terrain rules amend
  [navigation and visibility](../design/navigation-visibility.md#the-floor-plan);
- the stance and elbow constants, with their sweeps, go to
  `docs/performance/` beside the articulated gate evidence;
- the argument for a third model rather than a third repository, and the measurement
  that `world.rs` was the only oversized production file, belong in
  [ADR 0004](../decisions/0004-purpose-built-simulation-kernel.md) as an amendment --
  it is the document that owns why this kernel is purpose-built, and a third body
  model in the same kernel is the strongest evidence for that choice it has yet had.
