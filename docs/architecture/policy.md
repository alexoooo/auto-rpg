# Policy architecture

**Purpose:** Describe the current observation-to-command policy seams and their implementations.
**Status:** current
**Canonical source:** [`crates/policy/src/lib.rs`](../../crates/policy/src/lib.rs), [`Observation`](../../crates/sim/src/obs.rs), and [`Command`](../../crates/sim/src/command.rs)
**Update when:** The `Policy` or `ArticulatedPolicy` trait, observation contract, command shape, policy registry, or run harness changes.

## The complete policy seam

There are two seams, one per `CombatModel`, and each has one required
operation:

```rust
fn decide(&mut self, obs: &Observation) -> Command;                          // Policy
fn decide(&mut self, obs: &ArticulatedObservation) -> ArticulatedCommandV1;  // ArticulatedPolicy
```

The legacy half is described immediately below; the non-legacy half has its own
section. This heading used to cover only the first of them, which was complete
while a body was a disc with one blade angle and is not now.

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

The two traits are separate rather than one trait over a `SubmittedCommand`
enum. The model is chosen once by the `Scenario` and never mixes inside a
world, so a mismatch is static information; `World::submit` and
`World::submit_articulated_v1` already refuse the wrong model at the boundary,
and a second refusal one layer up would buy nothing.

There is no non-legacy `TeamPolicy`. `TeamPolicy` routes on the observation's
faction, and `ArticulatedObservation` has no faction column -- "the other side"
appears only as already-selected `opponents`. Per-side routing belongs to
whoever drives the run.

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

> **Proposed by v2 — not current:** This note used to cover the articulated
> observation and action seam as well. That landed in v2-16 and is described
> above. What remains proposed is the versioned policy envelope and learned
> policies. One `lab` experiment now drives an `ArticulatedPolicy` — `lab
> articulated` runs `ScriptedArticulatedPolicy` over `Scenario::articulated_duel`,
> landed by v2-17's first checkpoint — but no `PolicyKind` names an articulated
> policy and no browser path drives one. `run_articulated` still has no caller
> outside tests, and deliberately: that command needs per-tick contact
> resolutions, cap hits and energy-ledger columns which `RunResult` does not
> carry, so it drives its own copy of the decision loop, pinned against the
> runner by an equivalence test rather than by sharing code.
> See the [v2 overview](../plans/v2-00-overview.md).

## Source anchors

- Trait, team dispatch, and policy registry: [`Policy`](../../crates/policy/src/lib.rs#L82)
- Non-legacy seam: [`ArticulatedPolicy`](../../crates/policy/src/lib.rs#L178)
- Headless decision loops: [`crates/policy/src/runner.rs`](../../crates/policy/src/runner.rs)
- Subject-scoped inputs: [`crates/sim/src/obs.rs`](../../crates/sim/src/obs.rs)
- `Command`, the single `LimbCommand`, `Order`, and `Objective`: [`crates/sim/src/command.rs`](../../crates/sim/src/command.rs)
- Submission and scheduling: [`World::submit`](../../crates/sim/src/world.rs)
