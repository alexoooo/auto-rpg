# Solver representation contract screen

The reference body retains impulse joints. The pinned Rapier package exposes directional
bounds on both joint sets, but multibody joints lack the accumulated motor-effort read and
generic local-frame setters used by the adapter. The joint-shape screen below also finds
unimplemented two-axis motion and incompatible three-axis limit coordinates. These screens
reject a drop-in switch; they do not rank solvers on whole-body contact performance.

Harness: Node 24.19, core `World.step`, Rapier `0.21.0-auto-rpg.2`, 120 Hz, no gravity,
contacts or assists. Two coincident bodies form one aligned x-axis hinge; the parent is fixed.
The rotor has mass 1 kg and x inertia 0.02 kg m². Bounds are 0.12/0.24 N m, target velocity
is ±1000 rad/s (saturating), and limits are ±0.6 rad. These are analytical test inputs, not
anatomical estimates. After one driven step, the bounds become zero for 12 steps, then the
drive resumes for 119 steps. The four cases are fixed probes, not a seeded population.

| Representation | Direction | First speed, rad/s | Speed after coast, rad/s | Final angle, rad |
|---|---:|---:|---:|---:|
| Impulse | − | −0.05000000 | −0.05000100 | −0.60000163 |
| Impulse | + | 0.10000002 | 0.10000143 | 0.60000001 |
| Multibody | − | −0.04591269 | −0.02976221 | −0.60000001 |
| Multibody | + | 0.09182537 | 0.05952442 | 0.60000001 |

Impulse-joint motor effort equals the first-step angular-momentum change within 1e-8 N m s.
Its zero-cap coast reports zero motor impulse, with relative velocity drift below 0.0001
(the regression's float32 tolerance). Multibody effort is unavailable, not inferred from net
momentum. Its native `MultibodyJoint.default_damping` sets angular damping to 0.1; the
JavaScript binding does not expose the damping vector. The observed coast includes an initial
speed increase followed by decay, so this record does not equate each speed change to that
damping term or claim a quantified causal decomposition. Both representations press both
limits, and all four physics/controller checkpoint replays are exact.

Required bindings checked: `jointSetLimits`, `jointConfigureMotor`,
`jointSetMotorForceBounds`, `jointMotorStepImpulse`, `jointSetLocalFrame1`, and
`jointSetLocalFrame2`. The last three are missing on `RawMultibodyJointSet`. These findings
refer to the pinned package, not every Rapier version. The research probe uses raw joint
construction on a core world; it does not expose multibodies as a supported game engine.

[Complete inputs and traces](solver-contract.json) omit runtime timings. Archived source hash:
`5cfe0ee20085a83082bb7a86368ecc38f008fcfb5d0316769d61309743aa857a`.

```powershell
node research/control-foundation.mjs --suite solver --actuation directional --workers 2
node --test tests/research-solvers.test.mjs
```

Arbitrary anatomical frames, closed-loop effective mass, falling, loaded contacts, release
and browser cost remain required before adopting multibodies. Filling missing bindings alone
would not prove those capabilities. Keep numerical damping explicit and separate from anatomy.

## Anatomical joint-shape compatibility

Harness: Node core `World.step`, 120 Hz, Rapier `0.21.0-auto-rpg.6`, adapter 7,
corrected angular-limit and per-point-friction profile, no gravity, contacts or assistance.
Each case runs in its own Node process because a native panic can poison its WASM realm.
These are mechanical diagnostic fixtures, not anatomical performance measurements.

Two coincident, identically oriented bodies each have mass 1 kg and isotropic inertia
0.02 kg m squared. The parent is fixed. A generic joint locks all translations and frees
either X/Y or X/Y/Z rotation. X/Y limits are +/-0.4 rad; Z is locked in the two-axis case,
or limited to +/-0.02 rad in the three-axis case. All free motors have symmetric 10 N m
ceilings and velocity feedback with infinite damping. Three one-second stages command
X at +/-2 rad/s, then Y at +/-2 rad/s, then zero speed on every free axis. All four X/Y
sign combinations are tested for the three-axis case. Native multibody damping remains at
its default; this does not compare passive damping or infer effort from net momentum.

Angles are read from the current relative quaternion with the core's `anglesOf`, exactly
the coordinate convention of anatomical limits. The binding's configured limit endpoints
are also read back. Results and current bodies' joint freedoms are in
[solver-joint-shapes.json](solver-joint-shapes.json).

| Representation | Free angular axes | Result |
|---|---|---|
| Corrected impulse | X/Y | Steps and replays; locked Z stays within 1e-6 rad |
| Multibody | X/Y | First step traps with `RuntimeError: unreachable` |
| Corrected impulse | X/Y/Z | All four sign cases replay; measured Z reaches +/-0.020000 rad |
| Multibody | X/Y/Z | All four sign cases replay; measured Z reaches +/-0.082136 rad despite its +/-0.02 rad endpoints |

Source inspection at pinned upstream commit `b716d375efc0201003f0cd9ef7168eee0b62c177`,
`src/dynamics/joint/multibody_joint/multibody_joint.rs`, explains both findings:

- `MultibodyJoint::integrate`, `jacobian` and `jacobian_mul_coordinates` contain unimplemented
  two-free-angular-DOF branches. Every current body has two-DOF ankle joints.
- The three-DOF branch updates `joint_rot` by composed angular displacement while separately
  accumulating each angular velocity component into `coords`. `velocity_constraints` uses
  those accumulated coordinates for its internal limits. Successive rotations need not have
  the same coordinates as their current quaternion. The tested Z excursion persists during
  the final zero-speed stage; it is not merely a transient overshoot.

The optional coordinate-gradient correction applies to impulse and generic **external** limit
rows; it does not change these internal multibody coordinates. The result does not say that
all reduced-coordinate engines have this limitation, or that a hybrid tree with external
constraints cannot work. It says the pinned implementation does not represent the current
anatomical joint contract unchanged. Changing that implementation would require its own
coordinate, effort, contact, closed-loop and replay validation before performance comparisons.

The measured decision is to retain impulse joints for this foundation. Do not change ankle
anatomy, silently remove limits, or infer that extra JavaScript methods alone make a faithful
multibody body possible. The larger multibody comparison remains an explicit engine-extension
experiment, not a dependency for independent policies or the current support/combat work.

```powershell
node research/control-foundation-joint-shapes.mjs multibody 2
node research/control-foundation-joint-shapes.mjs multibody 3 1 -1
node --test tests/research-joint-shapes.test.mjs
```
