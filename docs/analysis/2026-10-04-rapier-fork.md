# Rapier, forked

**Question.** Is the core doing work, or doing without things, that Rapier could do for it? Do we
get more out of Rapier by building it ourselves?

**Answer.** Yes, for what the JavaScript binding hides. Rapier's solver already has much of what
the core needs, but the binding exposes only part of it. A fork of Rapier, kept as a patch
([2026-10-04-rapier-fork.patch](2026-10-04-rapier-fork.patch)) and built here, gives the core:

- a joint motor bounded separately each way;
- the impulse each joint row applied.

The fork, used as Rapier is used today, gives the same bouts to the bit. Using it to let the solver
choose which muscles pull removes the driver's known defect, but it moves every tuned behaviour:
it is a retuning, not a drop-in.

## Why a fork, and of what

Rapier 0.36.0 (Rust) and its JavaScript bindings 0.21.0 live in one repository
(`dimforge/rapier`, the bindings under `bindings/typescript`, tag `js-v0.21.0`). The patch changes
two layers:

- **The engine.** Rapier's solver clamps a motor's impulse to `[-max_impulse, max_impulse]`: one
  ceiling, both ways. A ceiling each way needs a second bound in `JointMotor` (`min_force`) carried
  through the solver's motor rows. That is six lines across `joint_constraint_helper.rs`,
  `generic_joint_constraint_builder.rs`, `joint_constraint_builder.rs` (2D) and
  `unit_multibody_joint.rs`. `set_motor_max_force` sets both bounds, so a caller that never sets
  them apart is unchanged.
- **The binding.** Rapier keeps each joint's impulses (a motor's, a limit's, a locked axis's), and
  the binding does not read them. The patch adds the reads, the motor-bounds setter, and the
  multibody joint's missing setters (limits, motor, motor bounds).

Rapier's motor impulse is the one applied to the joint's first body, the parent: a positive
impulse slows the child's rotation about the axis. A child's torque is therefore minus the
impulse, and a ceiling of `positive` toward the axis's positive sense and `negative` toward its
negative sense is the impulse range `[-positive, negative]`. The impulse kept is the last solver
substep's: `numSolverIterations` substeps of `timestep / numSolverIterations` each, so the torque
of the step is `-impulse * numSolverIterations / timestep`.

## Built from source, nothing moves

Harness: Node, core world (`src/core/world.ts`), Rapier, 120 Hz. Bouts were played by `playBout`
(`research/bout.mjs`) for 12 s or to their verdict. Each figure below names the Rapier package it
ran on.

| Package | Fighter v Rogue | Fighter v Fighter, gap 3 | Rogue v Skeleton, gap 3.5 |
|---|---|---|---|
| npm 0.21.0 | `c7bab8ed0472a94d` | `808101cb65a2061f` | `4229d525166a2bbb` |
| built from the tag | `c7bab8ed0472a94d` | `808101cb65a2061f` | `4229d525166a2bbb` |
| the fork, bounds equal | `c7bab8ed0472a94d` | `808101cb65a2061f` | `4229d525166a2bbb` |

The suite (`npm test`) gave 657 pass, 0 fail, 3 todo on each of the three. The built package's
WebAssembly is not byte-identical to npm's (another toolchain), but every bout and test is.

## The solver chooses the side

**The defect.** The muscle driver (`src/core/muscle/driver.ts`) chooses before the step which of a
freedom's two muscle groups pulls: the side its command pushes toward. Its motor's single ceiling
is that side's strength, whichever way the motor then pushes. A load that outweighs the change
asked is braked by the wrong muscles. `tests/core-muscle.test.mjs` holds this as two todos.

**The change.** With the fork the driver can give each side its own ceiling, and read back the
side that pulled:

```ts
// The engine's joint (src/core/engine/rapier.ts).
setMotorBounds(k, speed, negative, positive) {
  joints.jointConfigureMotorVelocity(handle, axes[k], speed, Infinity);
  joints.jointSetMotorForceBounds(handle, axes[k], -positive, negative);
},
motorTorque: (k) => -joints.jointMotorImpulse(handle, axes[k]) * raw.numSolverIterations / raw.timestep,

// The driver: before the step each side's ceiling, after it the torque the motor gave.
const positive = activation * driver.strength(i, 1), negative = activation * driver.strength(i, -1);
const along = c.dof.sign > 0;
c.joint.joint.setMotorBounds(c.index, speed, along ? negative : positive, along ? positive : negative);
// world.afterStep:
driver.pulled[i] = c.dof.sign * c.joint.joint.motorTorque(c.index);
```

`pulled` is step-to-step state like `ceiling`: a fork needs it, and `tests/core-fork.test.mjs`
shows it needed once it is sorted there and shown by the stand (`tests/harness/fork.mjs`).

**Results.** Same harness and packages as above.

- Both todos pass. The driver reads the torque its motor gave, signed by the side that pulled.
  A command lowering a weight is bounded by the muscles that brake it.
- Twelve other tests fail, eleven once `pulled` is sorted for forking:
  - getting up: five tests of `core-rise` and `research-rise`. The paths a riser takes change; one
    row reaches a stage it did not before, another stops at a different one.
  - the 25 % balance no longer holds the lab body through the shove that fells it without
    (`lab-actor`);
  - a felled Warrior under the game's mind never goes still (it moves to the watch's end, where it
    was still within 3 s);
  - the repertoire's club blow reads 1.117 at its place where its record says 1.193
    (`core-strike-skill`);
  - a placed blow at the lab target, and a club blow at a skeleton's head, land elsewhere;
  - the arena fork test's bout takes another course, and its control no longer shows
    `pool > attached` needed.
- The bouts change:

Each cell is the side that went down, how and when, and the blows landed.

| Bound against the push | Fighter v Rogue | Fighter v Fighter, gap 3 | Rogue v Skeleton, gap 3.5 |
|---|---|---|---|
| the side pushed toward (today's driver) | right falls, 10.4 s, 10 blows | none at 12 s, 5 blows | none at 12 s, 4 blows |
| the other side's muscles (physical) | right falls, 10.9 s, 3 blows | **right falls, 2.9 s, no blow** | left falls, 11.3 s, 1 blow |
| none | right falls, 10.9 s, 12 blows | right falls, 3.5 s, no blow | none at 12 s, 5 blows |
| the larger of the two | right is killed, 9.6 s, 6 blows | left falls, 9.8 s, 17 blows | left falls, 11.1 s, 2 blows |

The first row's digests equal the npm package's: the bounds and the readback change nothing by
themselves. **The whole difference is the bound against the push.**

It acts within the step. In the Warrior mirror up to its fall (`own` bounds, last substep), the
motor pulled with the side its command did not push toward in 0.1 % (left) and 0.2 % (right) of
channel-steps. That is too rare in the final substep to account for the fall. The bound matters
in the substeps before it.

The falls come with a weaker brake. The physical bound is the antagonists' strength at the
current speed. When it is below the commanded side's, the old driver braked harder than the
muscles could. With the larger of the two the mirror fights for 9.8 s. With the antagonists' own
strength, or none, the right-hand Warrior falls within 3.5 s.

That larger bound is not physical. Under it, the balance holds the shove but more of the get-up
tests fail (eleven of the seven affected files' 73 tests, against ten under the antagonists'
bounds).

The stance, the riser and the strikes were tuned under the old symmetric brake, and they rely on
it.

The mirror's fall matches the roadmap's known fall in side and time: the right-hand Warrior, before
any touch, at 2.9 s. That known fall has an empty right hand, under today's driver, and turns a
quarter turn as it sets off. Under the physical bound the Warrior falls the same way holding the
club. That the two share a cause is likely and not measured; the setting-off turn is where to look.

## What it means

- **Adopting the solver's side is a retuning**: the stance's holds and the riser's stages, against
  the bouts and the batteries, under the physical bound. It is the owner's to schedule.
- **A command is one activation for both sides**: the servo (`src/core/control/servo.ts`) asks
  for a torque as an activation and an infinite speed toward one sense. Under the old driver that
  meant one muscle group; under bounds each way the same activation drives the antagonists too.
  With a ceiling each way, a freedom could take two activations, agonist and antagonist. A body
  could then stiffen a joint by co-contraction, which nothing in the core can express today.
- **Where else Rapier could take over**, untried and so hypotheses:
  - Rapier's multibodies (reduced coordinates) compute a chain's mass matrix and its joint-space
    dynamics. The core computes these itself (`src/core/build/dynamics.ts`, the bias and gravity;
    `src/core/rules/contact-mass.ts`) and reads joint angles itself
    (`src/core/build/joint-state.ts`). The patch's multibody setters are what a trial needs.
  - Joint and contact reads made in batches, one call a step rather than one per row.
  - The reach's inverse kinematics is the least likely to move: Rapier has none of its own that
    fits.

## State of the work

The pinned source build and package are installed from `vendor/rapier`. Rebuilding in a new
work directory produces the same tarball bytes. Current-code stock/package parity, the three
bout recipes and the common task battery are recorded in
[the engine record](../reference/rapier-vendor.md); the earlier digests above belong to the
experiment's game revision. The plain bench package remains npm's.

Directional actuator bounds, accumulated world-step effort and control retuning remain the
next work of [the foundation phase](../plans/2026-10-04-control-foundation.md). The experimental
driver with last-substep `pulled` state is on branch `rapier-motor-bounds` in the sibling
`auto-rpg-rapier-lab` checkout. Its temporary `MOTOR_OPPOSITE` environment switch must not land.
