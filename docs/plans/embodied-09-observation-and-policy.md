# Embodied 09 -- what a fighter perceives about a body it now has

**Status:** done. Depended on [07](embodied-07-elbow-and-forearm.md) and
[08](embodied-08-command-composition.md).

Everything below landed, and the last of it -- the corpus, the embodied verify, the pin
and the elevation measurement -- is recorded in
[docs/performance/embodied-corpus-and-high-ground.md](../performance/embodied-corpus-and-high-ground.md).
**The high-ground measurement came out against the term** and the plan's acceptance
criterion for [session 04](embodied-04-terrain-and-elevation.md) is therefore not met:
759 seeking wins against 839 over 1,600 mirrored, side-swapped trials, a margin of -80
and -5.00 percentage points. The bullet at the end of this file carries the full
reading, including which of the term and the criterion the evidence indicts.

Give the observation the state the previous six sessions added, write a scripted
embodied policy that can drive it, and decide -- with a measurement, not in advance --
whether the learning probe follows.

## The feature block

`ArticulatedObservation` gains an embodied block, appended after the articulated one,
never interleaved. Per self:

```text
present, hip yaw relative to torso yaw as cosine and sine, twist as a signed
fraction of the budget, pelvis as a fraction of standing pelvis height,
step_left as a fraction of its duration, and per arm: elbow position relative
to the shoulder over arm_length, and reach headroom -- how much of the annulus
is left before the clamp bites
```

and the same, narrower, per perceived opponent: present, their twist fraction, and
whether they are mid-step. Fixed width, zeros for absent opponents, on the rule the
articulated block already follows: a vector whose width depends on how much the
observer perceives makes "how much do I perceive" something the network has to infer
from the shape of its own input.

**Each half carries its own `present`, and an all-zero row is not enough on its own.**
The articulated block's rule is that a blank row is zeros and nothing else, which
works there because no live body writes an all-zero row. Here one can: a body squared,
level and standing still has zero twist, zero hip offset and no step running, so
"nothing to report" and "nothing is happening" would be the same bytes. Angles going
in as cosine and sine has the same shape of reason -- a zero raw angle and an absent
body would otherwise agree in the one column that mattered.

**Reach headroom rather than raw reach is the one non-obvious column and it is the
point of the block.** After [session 07](embodied-07-elbow-and-forearm.md) an arm can
be commanded to a pose it cannot hold. A fighter that can see how much extension it
has left can choose between stepping in and reaching further; one that sees only the
current reach cannot tell a comfortable guard from a locked-out one. It needs a
`reach_headroom` beside `reachable_extent` in `limb.rs`, answering how much of the
annulus is left at the height the arm is actually holding -- measured from the
realised height and not the asked-for one, for the reason `reachable_extent` is
written in the order it is.

**Elevation is not two of these columns after all, and correcting that is worth more
than the columns would have been.** `World::observe_articulated` builds the body
origin as `Vec3::new(me.x, me.y, Fx::ZERO)` while `World::articulated_pose` uses
`self.ground_z[i]` -- the observation and the pose disagree about where a body is.
Adding "ground_z relative to the opponent's" as a column would have papered over that:
every *other* spatial column in the articulated block -- opponent capsules, weapon
endpoints, hand positions -- would still have been flattened onto z = 0, so a fighter
on a hill would have read the height difference in one column and seen a level
opponent in twenty. Fixing the origin gives all of them their height and makes the
relative ground fall out of the positions that were always supposed to carry it.

It is free today and will not be free later: every shipped scenario is flat, so
`ground_z` is zero and not one existing column moves. The moment the sculpted corpus
below exists, this correction has to already have happened.

Opponent twist is the perception that makes [session 06](embodied-06-stance.md) a
tactic rather than a constraint: a body wound to its limit must step before it can
swing back, and that is the opening.

**Appending is a cost decision here rather than a rule**, and it is the one seam in
this plan where [the compatibility
waiver](embodied-00-overview.md#backwards-compatibility-is-not-a-constraint-here)
argues *for* the conservative shape: the trained checkpoint is frozen against this
layout, so renumbering a column it reads buys a nicer vector at the price of a retrain
and a re-score. Everywhere else in these sessions, interleave and bump the version.

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

Its first half is *structurally* immune -- the probe sizes its buffer at
`FEATURE_COUNT` but folds only `..LEGACY_FEATURE_COUNT` -- so what an append can
actually reach is the second half, the state hash. That probe drives a Legacy
`Scenario::skirmish` through a stand-in policy which is a pure function of the
observation, so a changed observation *field* lands there even when no feature index
moves. The pin is therefore a live guard on this session and not a formality.

**Two layout tests fail by construction and are owed an edit rather than a
re-record.** `articulated_features_have_one_documented_width` pins the triple
`(450, 472, 922)` and the version `12`; and
`every_articulated_feature_lands_on_its_documented_index` collects moved columns over
`LEGACY_FEATURE_COUNT..FEATURE_COUNT`, so every articulated row in its table starts
failing the moment the vector grows past the articulated block. Narrowing that range
to the articulated block is the fix, and the narrowing is the assertion: an
articulated perturbation that reached an embodied column would then be caught rather
than absorbed.

**`LEARNED_INFERENCE_DIGEST` cannot move here, and the reason is stronger than the
plan first claimed.** It is not merely that this session declines to widen
`LEARN_V2_FEATURE_COUNT`: the learning crate never reads the 922-element vector at
all. `learn_core::write_features` takes an `ArticulatedObservation` and writes its
own 41 columns from named fields, `write_features_v2` appends 18 more to that, and
the digest is taken over the v1 slice on a synthetic corpus that starts from
`ArticulatedObservation::BLANK` and never touches a simulation. A field appended to
the observation is invisible to all three unless somebody deliberately reads it.
`model.rs`'s own header says so: *"The 922-element vector is not the input, and that
is the main decision."*

The shipped checkpoint therefore keeps its input while an embodied fight is driven by
the scripted policy, and deferring is the cheaper and more honest order, because
widening the network's input costs a retrain and a re-score before anyone knows
whether the new columns carry signal.

One assertion does break and it is a documentation cross-check rather than a pin:
`assert_eq!(sim::FEATURE_COUNT, 922)` in `learn-core/src/model.rs`, beside the
weight-count arithmetic that explains where 60,242 comes from.

If a later session does widen it, the move is *owned* -- the registry names the
feature layout as one of the five things that owns that pin -- and it is not a
portability failure. It owes a re-score against **88.922**, the mean return the
shipped checkpoint scored on `learn-probe evaluate`'s 400 held-out seeds, obtained
with:

```powershell
cargo run --release -p lab -- learn-probe evaluate --checkpoint checkpoints/v2-probe.ckpt
```

## Three things the survey found that this plan did not know -- all now done

**The observation had no elevation at all.** `World::observe_articulated` built the
body origin as `Vec3::new(me.x, me.y, Fx::ZERO)` while `World::articulated_pose` used
`self.ground_z[i]`. The first draft of this section said to append a ground-height
column and leave the origin alone; the section above it, written later, says why that
was the wrong call, and the origin was corrected instead. **The two paragraphs
contradicted each other for a day and the implementing session had to notice**, which
is the argument for retiring a superseded paragraph rather than leaving it beside its
replacement.

**No policy seam returned an embodied command.** `ArticulatedPolicy` returns
`ArticulatedCommandV1`, and session 08's `ComposedController::decide` was an *inherent*
method rather than a trait impl, so there was nothing to implement. `EmbodiedPolicy`
now sits beside `ArticulatedPolicy` with `ComposedController` implementing it. Session
10 deletes the articulated one and the wart in the observation's name with it.

**There was no sculpted `Scenario` anywhere.** `Dungeon::from_tiles_and_heights` was
called only from its own tests, and `sculpted` is derived from the heights rather than
passed -- an all-zero height vector *is* flat, digests as flat and routes as flat.
`Scenario::embodied_slope` is that fixture, and the derivation is what makes
`ROOM_HASH`, `BATTLE_HASH`, `SWAP_HASH`, `BOW_HASH`, `LAB_HASH` and
`GOLDEN_STATE_HASH` unreachable from it: the digest's `if sculpted` short circuit means
a flat dungeon never hashes a height.

## This session owes session 10 more than its own text asks for

[Session 10](embodied-10-retire-the-older-models.md) will not delete a measurement
until its replacement is pinned and holding, and the survey makes the size of that debt
concrete: **`bench`, `verify`, `hash`, `duel` and `evolve` are all Legacy-only**, and
`lab articulated` is the only subcommand that drives a three-dimensional body. Nothing
in `crates/lab` mentions `Scenario::embodied_duel` at all, and no wasm export opens an
embodied world -- `crates/web` reaches one only from `#[cfg(test)]`.

So this session also delivers, as the replacement rather than as extras -- **all four
landed**:

- a `lab embodied` subcommand mirroring `lab articulated`'s corpus and report. It runs
  N seeds by two orientations on either embodied fixture, takes an `EmbodiedPolicyKind`
  per side on `articulated`'s own `--hero-policy`/`--monster-policy` vocabulary, and
  prints through the *same* summariser -- one function, two callers, so a column cannot
  drift apart from the corpus it is meant to be read beside;
- an embodied `verify` -- run, re-run, replay, all three agreeing -- because that is
  the property `lab verify` holds for Legacy and nothing holds for Embodied. 200 seeds
  of `embodied-duel-v1` and 50 of `embodied-slope-v1` pass. It is fanned out where the
  Legacy arm is serial, because an embodied fixture is 3,600 ticks of two articulated
  bodies in contact and 200 seeds is 600 fights;
- one embodied golden pin, `EMBODIED_CORPUS_DIGEST = 0x14882fb0e0f851e5`, recorded here
  so that session 10 has something to be wrong against. Its registry row says in those
  words what it is for, and says that a session which only retires another model may
  not re-record it; and
- an `init_embodied` export, so the browser can open the model it is going to be the
  only one of.

**One thing was found rather than delivered, and it is owed to `crates/policy`.**
`script_digest` keeps only `SubmittedCommand::Articulated` and accounts for the arm it
drops as `Legacy`, which "cannot occur". `Embodied` occurs on every record of every
embodied run, so the function counts zero records and returns the empty-stream constant
`0x89b684347e2caedd` -- the same number for the script, the control, and a matchup with
a different policy on each side. Three `crates/lab` tests were written against it and
all three went red on their first run, which is the only reason it was seen. `lab`
folds its own stream under `ARPG-EMBODIED-SCRIPT-V1` in the meantime; the repair to the
shared function belongs to a session allowed to touch `crates/policy`.

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
- `the_high_ground_term_wins_more_duels_than_it_loses` -- **it does not**, and the
  criterion turned out to be a poor proxy for the question it stood in for. The
  measurement, its two corrections and its result are written up in
  [the evidence record](../performance/embodied-corpus-and-high-ground.md); what
  belongs here is what the plan got wrong.

  **The bracketing this plan originally asked for was wrong, and so was the
  correction.** It first said to bracket `control -> subject -> control` and report a
  range across pinned processes, which is the protocol for a wall-clock number that
  swings two to three times run to run. A win rate over a fixed seed set does not swing:
  it is a pure function of the two policies and the fixture. But *deterministic* is not
  *significant*. Nothing varies between runs; the **sample** varies, because four
  hundred seeds are four hundred fights out of the space of all of them. The control
  that was actually needed is a split-half over the seeds, and it is not the one either
  version of this plan named.

  **The corpus needed two more controls the plan did not name**, both on the mirror's
  own argument. The mirror controls the arena; nothing in it controls the *bodies*, so
  a single side assignment measures a Fighter-against-Brute matchup alongside the term
  -- fixed by running both assignments and pooling. And a fixture whose high ground
  sits between the two spawns cannot measure seeking at all, because closing *is*
  climbing there: `embodied_slope` reported both sides spending 55% of every fight off
  the flat whether they meant to or not, and moving the high ground off the approach
  (`embodied_knolls`) took the margin from -80 to -14.

  **The criterion itself is the deeper mistake.** "A policy that seeks the high ground
  must beat the same policy with that term disabled" fails identically whether height is
  worthless or the policy is simply bad at seeking it, so it cannot answer the question
  session 04 needed answering. `embodied_ledge` asks that one directly -- one body
  spawned high, one low, the same policy on both -- and the answer is that height is
  worth about three percentage points once the side of the room is controlled for. The
  mechanic is sound and the term captures almost none of it.

  **And the control on that measurement changed its answer by an order of magnitude.**
  Raw, the plateau wins 41 points. On flat ground with the same spawns the western body
  wins 38, because every body spawns facing due east and only one of them faces the
  other. Elevation is the remaining three.

## Verification

```powershell
cargo test
cargo run --release -p lab -- hash
cargo run --release -p lab -- verify      --seeds 200
cargo run --release -p lab -- verify      --embodied --seeds 200
cargo run --release -p lab -- duel        --seeds 400
cargo run --release -p lab -- articulated --seeds 400 --mirrored
cargo run --release -p lab -- embodied    --seeds 400 --mirrored
cargo run --release -p lab -- embodied    --corpus-digest
cargo run --release -p lab -- embodied    --high-ground
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
  `docs/performance/` beside the articulated gate evidence -- the corpus, the pin and
  the high-ground result are already there, in
  [embodied-corpus-and-high-ground.md](../performance/embodied-corpus-and-high-ground.md),
  and that document survives the deletion of this one;
- the argument for a third model rather than a third repository, and the measurement
  that `world.rs` was the only oversized production file, belong in
  [ADR 0004](../decisions/0004-purpose-built-simulation-kernel.md) as an amendment --
  it is the document that owns why this kernel is purpose-built, and a third body
  model in the same kernel is the strongest evidence for that choice it has yet had.
