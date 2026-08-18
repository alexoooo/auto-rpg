# Policy architecture

**Purpose:** Describe the current observation-to-command policy seams and their implementations.
**Status:** current
**Canonical source:** [`crates/policy/src/lib.rs`](../../crates/policy/src/lib.rs), [`Observation`](../../crates/sim/src/obs.rs), and [`Command`](../../crates/sim/src/command.rs)
**Update when:** The `Policy`, `ArticulatedPolicy` or `EmbodiedPolicy` trait, observation contract, command shape, policy registry, or run harness changes.

## The complete policy seam

There are three seams, one per `CombatModel`, and each has one required
operation:

```rust
fn decide(&mut self, obs: &Observation) -> Command;                          // Policy
fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1;  // ArticulatedPolicy
fn decide(&mut self, obs: &ArticulatedObservation) -> EmbodiedCommandV1;     // EmbodiedPolicy
```

The legacy half is described immediately below; the other two share a section.
This heading used to cover only the first of them, which was complete while a
body was a disc with one blade angle and is not now.

`reset` is optional policy lifecycle behavior, and the run harness calls it
before every run. A policy may keep its own memory, but it receives neither
`&World` nor a mutation capability. All authoritative effects return through a
`Command` submitted by the driver.

`TeamPolicy` dispatches the same trait by the observation's faction, allowing
different hero and monster implementations without changing the simulation.
`PolicyKind` is the external registry for `Utility`, `Duelist`, `Idle`, and
`Random`; its integer codes are append-only because saved configuration and the
wasm boundary use them.

## Observation to command

`World::observe` produces a deterministic observation for one subject. It
contains exact self and standing-input information plus bounded, noisy contact
information. Policies operate on those perceived values. `Observation` can
also write a fixed-width feature vector whose shape is guarded by
`FEATURE_LAYOUT_VERSION`; the current shipped policies make their decisions
directly from Rust fields rather than consuming a learned model through that
feature buffer.

The current `Command` has four parts:

- `move_dir`: desired movement, with magnitude clamped by the simulation;
- `intent`: hold, attack a generational entity id, or flee;
- `limb`: exactly one `LimbCommand`; and
- `slot`: a request to select one loadout slot.

The singular limb is important current behavior. `LimbCommand` carries an
absolute `angle`, a guard `reach`, and a `strike` choice. A guard-role hand
reads angle and reach; a strike-role hand reads angle and strike. There is no
second limb command and no per-joint articulated action in the current seam.
The selected command persists until the subject's next decision tick.

Faction `Order` and `Objective` are not policy outputs. The host sets them on
`World`, and the resulting standing values reach each observation for policy
interpretation.

## Run harness ownership

`policy::run` resets the policy, constructs a `World`, applies initial orders,
and repeats the decision loop followed by `World::step`. It optionally records
the submitted commands and orders into a `Replay`, counts selected events, and
returns outcome metrics and the final `World::state_hash`. `lab` uses this
harness for experiments. The browser follows the same observation/decision/
submission shape around its render loop, but owns its host timing separately.

The determinism boundary is intentionally below the policy. A current
fixed-point policy can be reproducible, but `World` remains portable even if a
future policy uses target-dependent floating-point inference because replay
stores the command it chose.

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

`ComposedController` -- the session-08 controller that merges a human hand and an
AI hand into one submission -- keeps its inherent `decide` and `reset` as the
implementation, and the trait impl forwards to them. A caller holding one by
value should not have to import a trait to drive it; the trait exists so a
*driver* can hold either it or a scripted embodied policy behind one
`Box<dyn EmbodiedPolicy>`, which is a different need and arrived a session
later.

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

- Trait, team dispatch, and policy registry: [`Policy`](../../crates/policy/src/lib.rs#L108)
- Non-legacy seam: [`ArticulatedPolicy`](../../crates/policy/src/lib.rs#L204)
- The embodied seam: [`EmbodiedPolicy`](../../crates/policy/src/lib.rs#L304)
- The non-legacy seam's registry: [`ArticulatedPolicyKind`](../../crates/policy/src/lib.rs#L437)
- Headless decision loops: [`crates/policy/src/runner.rs`](../../crates/policy/src/runner.rs)
- Subject-scoped inputs: [`crates/sim/src/obs.rs`](../../crates/sim/src/obs.rs)
- `Command`, the single `LimbCommand`, `Order`, and `Objective`: [`crates/sim/src/command.rs`](../../crates/sim/src/command.rs)
- Submission and scheduling: [`World::submit`](../../crates/sim/src/world/mod.rs)
