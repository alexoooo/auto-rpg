# Solver representation contract screen

Why the body stays on Rapier's impulse joints rather than its multibody (reduced-coordinate)
joints: on the pinned package, multibody joints lack the effort reading and frame setters the
adapter needs, cannot run a two-axis joint, and let a three-axis joint pass its limits. These
screens reject a drop-in switch; they do not rank the two on whole-body contact.

## Effort and bindings

Node 24.19, core `World.step`, Rapier `0.21.0-auto-rpg.2`, 120 Hz, no gravity, contacts or assists.
Two coincident bodies on an aligned x-axis hinge, the parent fixed; rotor 1 kg, x inertia
0.02 kg m²; bounds 0.12/0.24 N m, target ±1000 rad/s (saturating), limits ±0.6 rad. One driven step,
12 steps with zero bounds, then 119 driven steps.

| Representation | Direction | First speed, rad/s | Speed after coast, rad/s | Final angle, rad |
|---|---:|---:|---:|---:|
| Impulse | − | −0.05000000 | −0.05000100 | −0.60000163 |
| Impulse | + | 0.10000002 | 0.10000143 | 0.60000001 |
| Multibody | − | −0.04591269 | −0.02976221 | −0.60000001 |
| Multibody | + | 0.09182537 | 0.05952442 | 0.60000001 |

- Impulse-joint effort equals the first step's angular-momentum change within 1e-8 N m s; its coast
  reports zero impulse, drifting below 0.0001.
- Multibody effort is unavailable. Native `MultibodyJoint.default_damping` sets angular damping 0.1,
  which the binding does not expose; the coast's speed rises, then decays, and is not decomposed.
- Both press both limits; all four checkpoints replay.
- Of the bindings the adapter needs (`jointSetLimits`, `jointConfigureMotor`,
  `jointSetMotorForceBounds`, `jointMotorStepImpulse`, `jointSetLocalFrame1`, `jointSetLocalFrame2`),
  the last three are missing on `RawMultibodyJointSet`.

[Inputs and traces](solver-contract.json); source hash
`5cfe0ee20085a83082bb7a86368ecc38f008fcfb5d0316769d61309743aa857a`.

```powershell
node research/control-foundation.mjs --suite solver --actuation directional --workers 2
node --test tests/research-solvers.test.mjs   # @2a1b29ac
```

## Anatomical joint-shape compatibility

Node core `World.step`, 120 Hz, Rapier `0.21.0-auto-rpg.6`, adapter 7, corrected limits and
per-point friction, no gravity, contacts or assistance; each case in its own process, since a native
panic can poison its WASM realm. Two coincident 1 kg bodies, isotropic inertia 0.02 kg m², the parent
fixed; a generic joint locks translation and frees X/Y or X/Y/Z rotation, X/Y limits ±0.4 rad, Z
locked or limited to ±0.02 rad. Free motors have 10 N m ceilings and velocity feedback; three
one-second stages command X at ±2 rad/s, then Y, then zero, in all four sign combinations. Angles
are read with the core's `anglesOf`, the anatomical limits' convention
([solver-joint-shapes.json](solver-joint-shapes.json)).

| Representation | Free angular axes | Result |
|---|---|---|
| Corrected impulse | X/Y | Steps and replays; locked Z stays within 1e-6 rad |
| Multibody | X/Y | First step traps with `RuntimeError: unreachable` |
| Corrected impulse | X/Y/Z | All four sign cases replay; measured Z reaches +/-0.020000 rad |
| Multibody | X/Y/Z | All four sign cases replay; measured Z reaches +/-0.082136 rad despite its +/-0.02 rad endpoints |

The pinned source (`b716d375efc0201003f0cd9ef7168eee0b62c177`,
`src/dynamics/joint/multibody_joint/multibody_joint.rs`) explains both:

- `MultibodyJoint::integrate`, `jacobian` and `jacobian_mul_coordinates` leave the two-free-angular
  branch unimplemented, and every body has two-freedom ankles.
- The three-freedom branch turns `joint_rot` by composed displacement while accumulating each
  angular velocity component into `coords`, which `velocity_constraints` uses for its limits;
  successive rotations need not have their quaternion's coordinates. The Z excursion persists
  through the zero-speed stage.

The coordinate-gradient limit correction ([joint limits](joint-limits.md)) applies to impulse and
external limit rows, not these internal coordinates. This says the pinned implementation does not
represent the anatomical joint contract unchanged, not that every reduced-coordinate engine fails.

```powershell
node research/control-foundation-joint-shapes.mjs multibody 2
node research/control-foundation-joint-shapes.mjs multibody 3 1 -1
node --test tests/research-joint-shapes.test.mjs   # @2a1b29ac
```
