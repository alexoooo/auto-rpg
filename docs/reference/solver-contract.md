# Solver representation contract screen

The reference body retains impulse joints. The pinned Rapier package exposes directional
bounds on both joint sets, but multibody joints lack the accumulated motor-effort read and
generic local-frame setters used by the adapter. This screen rejects a drop-in switch; it
does not rank the solvers on whole-body contact performance.

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
