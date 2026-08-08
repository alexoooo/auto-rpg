# Policy architecture

**Purpose:** Describe the current observation-to-command policy seam and its implementations.
**Status:** current
**Canonical source:** [`crates/policy/src/lib.rs`](../../crates/policy/src/lib.rs), [`Observation`](../../crates/sim/src/obs.rs), and [`Command`](../../crates/sim/src/command.rs)
**Update when:** The `Policy` trait, observation contract, command shape, policy registry, or run harness changes.

## The complete policy seam

The current trait has one required operation:

```rust
fn decide(&mut self, obs: &Observation) -> Command;
```

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

> **Proposed by v2 — not current:** The v2 policy plans introduce articulated
> observations/actions, a versioned policy envelope, and learned policies.
> They do not change the description above until those types replace the
> current `Observation -> Command` seam. See the
> [v2 overview](../plans/v2-00-overview.md).

## Source anchors

- Trait, team dispatch, and policy registry: [`Policy`](../../crates/policy/src/lib.rs#L44)
- Headless decision loop: [`crates/policy/src/runner.rs`](../../crates/policy/src/runner.rs)
- Subject-scoped inputs: [`crates/sim/src/obs.rs`](../../crates/sim/src/obs.rs)
- `Command`, the single `LimbCommand`, `Order`, and `Objective`: [`crates/sim/src/command.rs`](../../crates/sim/src/command.rs)
- Submission and scheduling: [`World::submit`](../../crates/sim/src/world.rs)
