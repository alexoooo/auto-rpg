# Policy architecture

**Purpose:** Describe the current observation-to-command policy seams and their implementations.
**Status:** current
**Canonical source:** [`crates/policy/src/lib.rs`](../../crates/policy/src/lib.rs), [`Observation`](../../crates/sim/src/obs.rs), and [`Command`](../../crates/sim/src/command.rs)
**Update when:** The `ArticulatedPolicy` or `EmbodiedPolicy` trait, observation contract, command shape, policy registry, or run harness changes.

## The complete policy seam

There are two seams, one per surviving `CombatModel`, and each has one required
operation:

```rust
fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1;  // ArticulatedPolicy
fn decide(&mut self, obs: &ArticulatedObservation) -> EmbodiedCommandV1;     // EmbodiedPolicy
```

**There were three.** `CombatModel::Legacy`'s seam was
`fn decide(&Observation) -> Command`, and embodied session 10 deleted it with the
model. What is worth carrying forward is the general sentence rather than the
signature: everything downstream of this crate -- a neural policy, an evolved
controller, a scripted test dummy, a human's mouse -- is the same one method, and
the simulation cannot tell them apart and does not try to. The crate's module
header argues why these are separate traits rather than one trait over an enum
payload, and why the seams therefore do not compose.

`reset` is optional policy lifecycle behaviour and the run harness calls it
before every run. A policy may keep its own memory, but it receives neither
`&World` nor a mutation capability; every authoritative effect returns through a
submitted command. **Nothing currently asserts that a caller who forgets `reset`
is caught** -- the test that did belonged to the deleted seam, and the gap is
recorded in the crate header rather than only here.

There is no team wrapper that runs one policy per side. The legacy seam had one,
`TeamPolicy`, which dispatched on `Observation::faction` -- and the reason it has
no successor is a property of the *observation* rather than an omission:
`ArticulatedObservation` is subject-scoped and has no faction column, so "the
other side" appears in it only as `opponents`, already selected. Per-side routing
therefore belongs to whoever drives the run, which does know both factions.
[`ArticulatedPolicy`](../../crates/policy/src/lib.rs#L208) carries that argument
in full, beside the doctest pair showing that no policy can be handed a `&World`.

## Observation to command

`World::observe_articulated` produces a deterministic subject-scoped observation:
exact proprioception, and bounded noisy information about everything else.
Policies operate on those perceived values. What an embodied policy may see, and
why it arrives as fractions rather than as world units, is
[below](#what-an-embodied-policy-is-allowed-to-see-and-why-it-arrives-as-fractions).

An `ArticulatedCommandV1` is a movement vector, a torso yaw, an intent, and per
arm a bearing, a height, a reach, an effort, a grip request and a release
request. An `EmbodiedCommandV1` is that plus a swing plane per arm, and its
movement vector and arm bearings are read **relative to the torso** rather than
absolutely -- the same byte offsets meaning different things, which
[the embodied command contract](../reference/embodied-command-v1.md) owns.

The legacy `Command` was four parts: a movement vector, an intent, exactly one
`LimbCommand` carrying an absolute angle and a guard reach and a strike choice,
and a loadout slot. **The singular limb is why that seam could not simply be
widened.** A body that is a disc with one blade angle is asked where to stand,
where a jointed opponent is a set of swept volumes and two blades and the
question is which of them to put steel into. Different observation, different
command, different entry into `World`.

Faction `Order` and `Objective` are not policy outputs and, on a surviving model,
are not policy *inputs* either. The host still sets them on `World` and they
still reach the state hash, but neither surviving observation carries an order or
navigation column, so nothing perceives them.
[Navigation and visibility](../design/navigation-visibility.md) owns that finding
and what it cost the browser.

## Run harness ownership

`policy::run_articulated` resets the policy, constructs a `World`, applies
initial orders, and repeats the decision loop followed by `World::step`. It
optionally records the submitted commands into a `Replay`, and returns outcome
metrics and the final `World::state_hash`. **What it records is what the world
*stored*, not what the policy offered** -- a refused submission stores the
neutral command atomically and returns the reason beside it, and recording the
offered command would replay a different fight the day validation moved by a raw
unit.

`policy::run` was the legacy loop and is gone. Three claims went with it that
nothing in this crate now makes, and they are listed in the crate's module header
rather than left implicit, because a deleted test leaves no trace.

**There is no weight search in this repository any more.** The genome surface --
`PolicySpec`, `MAX_GENOME_LEN`, and `lab evolve` above them -- optimised the
*named weights of a hand-authored policy*, and the embodied script has none, so
porting the search would have meant inventing a subject for it.
[Learning status](learning.md) carries that argument and the loss.

The determinism boundary is intentionally below the policy. A fixed-point policy
can be reproducible, but `World` remains portable even if a future policy uses
target-dependent floating-point inference, because a replay stores the command it
chose.

## The non-legacy seam

`ArticulatedPolicy` is the same shape over the subject-scoped types:
`World::observe_articulated` in, `ArticulatedCommandV1` out, and no `&World`
parameter. A `compile_fail` doctest on the trait fences that, because a unit
test can only show that one policy did not read hidden state while the
signature shows that none can. On the stable toolchain rustdoc does not enforce
a pinned error code, so the fence is paired with a compiling twin that differs
only by the `&World` parameter.

The three traits are separate rather than one trait over a `SubmittedCommand`
enum. The model is chosen once by the `Scenario` and never mixes inside a
world, so a mismatch is static information; `World::submit`,
`World::submit_articulated_v1` and `World::submit_embodied_v1` already refuse
the wrong model at the boundary, and a second refusal one layer up would buy
nothing.

There is no non-legacy `TeamPolicy`. `TeamPolicy` routes on the observation's
faction, and `ArticulatedObservation` has no faction column -- "the other side"
appears only as already-selected `opponents`. Per-side routing belongs to
whoever drives the run.

`EmbodiedPolicy` is the third of the three and differs from `ArticulatedPolicy`
in exactly one place: it returns an `EmbodiedCommandV1`. That is not a
formality. An embodied command carries a swing plane the articulated payload has
no offsets for, so a policy typed to return the articulated command could not
command an elbow, and an adapter between the two would have to invent a plane --
which is inventing state rather than converting it.

It takes an `ArticulatedObservation` because that is what an embodied body
produces: `CombatModel::has_articulated_columns` answers true for both models,
so perception is shared even where the command is not. The name is a wart that
outlives its model and the session that retires `Articulated` is the one that
gets to fix it.

### What an embodied policy is allowed to see, and why it arrives as fractions

`ArticulatedObservation` carries an `ObservedStance`, and each `ObservedOpponent`
carries a narrower `ObservedOpponentStance`. Both are blank on a Legacy or
Articulated world, on the rule the articulated block already sets: one struct and
one vector width whichever model a scenario picked.

The subject's own values are the hips relative to the torso, the twist as a signed
fraction of the stance budget, the pelvis as a fraction of standing pelvis height,
the step as a fraction of its own duration, and per arm the elbow relative to that
arm's shoulder plus how much of the reach annulus is left before the clamp bites.
A perceived opponent gets two of those: their twist fraction and whether they are
mid-step.

**The fractions are the boundary and not a convenience.** `STANCE_TWIST_LIMIT_RAW`,
`STANCE_STEP_TICKS` and `PELVIS_HEIGHT_RAW` live in `crates/sim`'s actuator module
and are deliberately not re-exported from `sim`, so a policy cannot reach them.
That makes a raw twist an uninterpretable number on the far side of the seam --
the divisor is the half that carries the meaning, and it is the half that stays
in. Publishing the ratio is therefore the only shape of this fact that crosses the
boundary at all, and the same argument puts the elbow relative to its own shoulder
over arm length, since no shoulder is published anywhere. It is the argument
`Contact::min_strike_range` already makes about deriving and handing over rather
than leaving to be reconstructed, taken to the case where reconstruction is not
merely wasteful but impossible.

**Reach headroom is the column the seam gained rather than a rescaling of one it
had.** An embodied arm can be commanded to a pose it cannot hold, and the clamp in
front of the integrator silently takes the difference. A policy that reads only
where its hand is cannot tell a comfortable guard from a locked-out one; one that
reads how much extension is left can choose between stepping in and reaching
further. Zero means the arm is against its own outer bound.

**Opponent stance is exact and carries no perception noise**, unlike the geometry
in the same row. A twist is the angle between two halves of one silhouette, and a
body's bearing is already exact for exactly that reason; mid-step is categorical
like a severed region. The concession is deliberate: a saturated twist is meant to
be an opening, and an opening whose cost is paid by the body that is wound up is
the right shape for it. What a dim fighter reads wrong stays what it always read
wrong -- where the body is.

`ComposedController` -- the session-08 controller that merges a human hand and an
AI hand into one submission -- keeps its inherent `decide` and `reset` as the
implementation, and the trait impl forwards to them. A caller holding one by
value should not have to import a trait to drive it; the trait exists so a
*driver* can hold either it or a scripted embodied policy behind one
`Box<dyn EmbodiedPolicy>`, which is a different need and arrived a session
later.

### The scripted embodied policy, and the one term that exists to be measured

`crates/policy/src/embodied_script.rs` is the first policy typed to the embodied
seam. It is a **sibling of `articulated_script.rs` and not a mode of it**, and the
reason is the frame: `ArmTarget::bearing` and `move_dir` are world quantities in
that file and torso-relative ones here. A single file with a frame flag would make
"which frame is this bearing" a runtime question in the one place where the wrong
answer produces a fighter swinging at the map's north, and nothing at the boundary
would refuse the command. The frame is also a simplification, and both show up in
the file: a guard arc centred on the body is a clamp with no yaw in it, a step that
brings the feet under the shoulders is `(1, 0)`, and the same tactical situation at
two different yaws is the *same command* in every relative column.

It expresses four things, because those four are the session's acceptance
criteria: close and strike; hold a guard while circling; step to unwind a
saturated twist; and use elevation. Each has a named test that goes red when its
term is deleted.

Two columns of the observation block are load-bearing in it. **Reach headroom
decides between stepping in and reaching further**: an arm at its outer bound has
no extension left, so asking for more buys a clamp and the distance has to come out
of the feet instead. **The opponent's stance is read twice** -- their twist chooses
which way to circle, because a body wound to its limit cannot follow you around to
the side it is wound away from, and their mid-step flag chooses when, because a
body whose feet are committed cannot answer. Every read of the block is gated on
its `present` flag, which is the whole of the degradation onto a model with no
legs: a blank block's zeros mean "locked out" and "settled" read straight, and an
ungated policy would step in on every tick of every articulated fight.

**The swing plane is used rather than left neutral, per arm.** The weapon arm keeps
the neutral plane, which puts the elbow below the shoulder-to-hand line and the
forearm under the blade rather than leading it into the target; the guard arm folds
its elbow a quarter turn toward the body's centre line, so the forearm lies across
the line the guard covers instead of hanging under it. Since session 07 the forearm
is a swept collider, so where the elbow hangs is what it can intercept. Both are
chosen on the model rather than on a corpus, because there is no embodied corpus
yet.

**The elevation term reads the body's own floor and never an opponent's, and that
is a correction rather than a simplification.** The obvious design is
`foe.body_position.z - obs.body_position.z`, and the perception model rules it out:
`observed_opponent` displaces a perceived body rigidly, that displacement has a z
term, and the duel fixture's fighters carry 0.9 and 1.2 world units of noise against
a sculpted fixture whose entire relief from the flat to the summit is 0.75. A
per-tick reading of the difference of two floors is a reading of the noise, and
filtering it would need a deadband wider than the hill. The subject's own
`body_position.z` is exact, so the term is built from it: a body that has climbed a
terrace strikes one notch lower and closes at half speed, and a body that has lost a
height step turns its circle the other way. It is a hill climb with one bit of
state and no terrain query, which is all an observation can support -- there is no
height field in one and there should not be.

That is the policy's only memory, and it is the reason `reset` has work to do.
Everything else is a pure function of one observation, which is what
`scripted_embodied_command` exposes: a test that wants to know what the script says
at tick 137 does not have to build a policy and drive a world.

**The term is switchable, and switching it off is the point.** The next session
measures the policy against itself with the elevation term disabled on a sculpted
corpus, so the switch is a constructor parameter rather than a build flag or a
global: two builds of one library that differ by a `static` cannot be bracketed
`control -> subject -> control` inside one round, and this repository accepts no
other comparison for a number that moves 2-3x run to run. The term exists **to be
measured, not asserted** -- nothing in the code claims the high ground wins, and a
measurement that comes back flat is a result.

The property that makes that measurement mean anything is that the term is
*provably inert on level ground*: no drift is set until the floor has fallen a
height step and no climb is counted until it has risen a terrace, neither of which
happens on a dungeon whose every tile is level.
`the_two_configurations_agree_on_flat_ground` drives both configurations over
`Scenario::embodied_duel` and compares state digests, and
`the_two_configurations_diverge_on_a_hill` does the same over
`Scenario::embodied_slope` and requires that they differ. Without the first, a
difference measured on the hill would be partly a difference the flat corpus would
show too; without the second, there would be nothing to measure.

## The non-legacy registry, and the one code it cannot build

`ArticulatedPolicyKind` is the non-legacy seam's registry and a sibling of
`PolicyKind` rather than an extension of it, because the two seams share no code
space: `2` is `Idle` on one and `windmill` on the other, and a page whose whole
subject is watching the same fight go differently when a dropdown moves cannot
afford that collision. Codes are append-only for `PolicyKind`'s reason -- they
are what a saved configuration or a URL carries. The five are `neutral`,
`composed`, `windmill`, `attack-moves`, and a fifth naming a frozen network; the
integers are frozen beside the browser's configuration buffer in the non-legacy
stream reference.

**`ArticulatedPolicyKind::build` answers `None` for that fifth code,
permanently.** It is a contract rather than a gap, and it is worth stating
because v2-ui-08 put a trained network behind `web.wasm` and did not change this:
the fighter runs in a browser and is still not built from `crates/policy`. Two
reasons, and the second outlives the first:

- `crates/policy` is audited by `tools/check_deps.js` -- which since a review of
  v2-ui-08 walks every workspace member rather than a named core -- and must not
  gain a float dependency. The floating point lives in `crates/learn-core`,
  which depends on `policy` -- so the arrow already points the wrong way for
  this function to construct one.
- A trained fighter is not a kind. It is a kind **plus a checkpoint**, and
  nothing in a registry keyed by an integer has anywhere to put fifteen
  kilobytes of weights. A global for one would put a host asset inside a library
  that has no host.

So the dispatch belongs to whoever holds the checkpoint: `crates/web`'s
`build_articulated_policy`, which reads the network `load_checkpoint` installed,
and `crates/lab`'s `--checkpoint` flag natively. An `Option` and not a fallback
to `Neutral`, because a caller that asked for the evolved network and silently
got a body standing still would be watching a fight it would reasonably describe
wrongly.

## The embodied registry, and why its `build` cannot fail

`EmbodiedPolicyKind` is the third registry and a sibling of the other two rather
than an extension of either, on `ArticulatedPolicyKind`'s own argument: the three
seams share no code space, so `2` names `idle`, `windmill` and `scripted-level`
depending on which registry is being read, and a collision between them is a page
showing a different fight when a dropdown moves. Codes are append-only for the same
reason. The three are `neutral`, `scripted` and `scripted-level`, the last being
the scripted policy with its elevation term switched off -- a registry entry rather
than a test-only constructor because it is what the next session measures against,
and that comparison has to be runnable from a command line.

**`EmbodiedPolicyKind::build` returns a policy and not an `Option`, which is where
it deliberately differs from its sibling.** `ArticulatedPolicyKind` answers `None`
for its learned code because a trained fighter is a kind *plus fifteen kilobytes of
weights* and nothing keyed by an integer has anywhere to put a checkpoint. Nothing
here is a checkpoint: session 09 measured the learning boundary and deferred
widening the network's input, so an embodied learned code would be a promise made
before the session that owes it exists. `ComposedController` is not a kind either,
for the same argument's shape rather than its subject -- it is a set of sources, one
of which is a human hand, and an integer has nowhere to put a person.

## Frozen networks are current, and where the float stops

`crates/learn-core` holds a compact 41-feature slice, a 41x64x18 perceptron, a
five-head action table and a checkpoint codec; `crates/learn` holds the
population that trains one. Both may use floating point, which nothing under
`fx`, `sim` or the deterministic parts of `policy` may, and the licence has one
condition: **nothing they compute reaches authoritative state.** What crosses is
five head indices from an argmax, assembled by `learn_core::compose` into an
`ArticulatedCommandV1` out of a fixed table of `Fx` constants.
`LearnedActionV1` is a separate type for exactly that reason and
`World::submit_articulated_v1` cannot be handed one.

The dependency arrow is the rest of the architecture. `learn-core` may see `fx`,
`sim` and `policy`; none of the three may see it, and
`the_learned_policy_is_unreachable_from_sim` says so by asking **Cargo** for the
resolved graph. It read the manifests as text until a review of v2-ui-08 got
three ordinary spellings past it -- no spaces, a trailing slash, and
`learn.workspace = true` -- which matters because that session's own finding is
that the compiler never enforced this arrow, leaving the test as the whole of
it. `crates/web` depends on `learn-core` and must never depend on `crates/learn`,
which uses `std::thread::scope` and a wall clock and belongs in no `cdylib`.

`LEARNED_INFERENCE_DIGEST` is what keeps the crossing honest between targets:
`Model::forward` is a rectified linear precisely so that no libm call enters the
inference path, and until v2-ui-08 that portability argument had no second host
to be checked on. It is registered in
[`hashes.md`](../reference/hashes.md#golden-registry) with the
`-C target-cpu=native` caveat that bounds it.

`policy::run_articulated` is `run`'s sibling, not a branch inside it, because
`run` is on the path of the pinned lab hashes. Three things differ:

- It records what the world **stored**, not what the policy offered.
  `submit_articulated_v1` answers `Stored { command, rejection }`, and a range
  or equipment failure atomically stores the neutral command instead. Replays
  persist final submitted commands, so the stored one is what a
  `Replay::record_submitted` row carries -- not the offered one, which is
  never written down.
- `RunResult::rejected` and `RunResult::first_rejection` report refusals.
  Without them a run whose every command was replaced looks exactly like a run
  by a policy that is not very good.
- The swordplay counters stay at zero, because the non-legacy branch of
  `World::step` emits only `Event::Death`. Damage travels as contact
  resolution rows.

`World::outcome` is model-agnostic and is reachable here, because
`reap_dead_articulated` clears `alive` when the anatomy says dead. It is not
reachable in the shipped `Scenario::articulated_duel` on any timescale that
scenario runs at: measured at v2-16, sixty seconds of continuous contact takes
the Brute from 1.000 health to 0.948 and leaves the Fighter untouched, which is
a damage model still being built rather than a broken loop. A run that reaches
`max_ticks` is scored on points by `World::timeout` exactly as a legacy one is.

## Human commands use the same boundary

The browser may ask a person rather than a Rust policy for the hero's next command.
This is a change of command source, not a second authority channel: the host still
submits `Command`, and `World` cannot tell whether a policy, a replay, or live input
produced it. Direct control deliberately asks for a movement direction, an attack
line, and a cut; swing phases and recovery remain simulation rules rather than
pointer-controlled pose.

Submitting every tick also advances the world's decision deadline every tick, so the
browser owns the cadence for whichever half of the hero is still policy-controlled.
A recorder for browser fights must capture those host submissions; the current lab
runner only records decisions made through its pending-policy loop. This supersedes
the former `DESIGN.md#the-one-exception-taking-the-controls` discussion while keeping
its warning about replay completeness.

The articulated observation/action seam, registry, configured duel, and learned
browser policy are current. The decision-loop ownership is intentionally split:
`run_articulated` remains exercised directly only by tests; `lab articulated` needs
per-tick resolutions, cap hits, and energy-ledger columns that `RunResult` does not
carry, so its loop is pinned to the runner by an equivalence test; and the browser
needs two independently selected policies, while `run_articulated` installs one
policy kind on both sides. A future shared versioned policy envelope is still a
proposal, not an omitted part of the current seam.

## Source anchors

- The articulated seam: [`ArticulatedPolicy`](../../crates/policy/src/lib.rs#L208)
- The embodied seam: [`EmbodiedPolicy`](../../crates/policy/src/lib.rs#L260)
- The non-legacy seam's registry: [`ArticulatedPolicyKind`](../../crates/policy/src/lib.rs#L303)
- The embodied seam's registry: [`EmbodiedPolicyKind`](../../crates/policy/src/lib.rs#L454)
- The scripted embodied policy: [`crates/policy/src/embodied_script.rs`](../../crates/policy/src/embodied_script.rs)
- Headless decision loops: [`crates/policy/src/runner.rs`](../../crates/policy/src/runner.rs)
- Subject-scoped inputs: [`crates/sim/src/obs.rs`](../../crates/sim/src/obs.rs)
- The command grammars, `Order` and `Objective`: [`crates/sim/src/command.rs`](../../crates/sim/src/command.rs)
- Submission and scheduling: [`World::submit_embodied_v1`](../../crates/sim/src/world/mod.rs)
