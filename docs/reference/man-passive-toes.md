# Man: the passive toe on the game's solver

Whether a toe on a passive hinge, as Man's anatomy proposes (`docs/reference/man-anatomy.md`),
behaves on the core's Rapier world as the spring it is meant to be. Measured by
`node research/man-toe-solver.mjs` on the Node stand, at commit `2a111961` with the working
changes of the plan's A1 and A2: the core's Rapier world (`createRapierPhysics`, coordinate limits,
box friction, `SOLVER`'s 16 iterations and 2 PGS passes; vendored revision `adapter-9`), the
arena's ground, the Warrior's left foot.

## The fixture

- **Foot**: the cut foot's hull (`man-contact-geometry.json`, at `FIT_SCALE`) carrying half the
  Warrior's mass less the toes (39.36 kg). The load sits at the spec's ankle centre. The foot is
  free to translate and not to turn: the rest of the body and the ankle's muscles hold its turn.
  Its weight ramps from none to full over 1 s, then holds for 3 s.
- **Toes**: the toes' hull and their share of the foot's mass by volume (0.145 kg). They hang on a
  hinge at `mtp`, range ±π/2 (`SOURCES["opensim-gait2392-mtp"]`), with a ForceBased position motor
  at rest 0, 25 N m/rad and 2 N m s/rad (`SOURCES["falisse-2022-toes"]`). The motor's ceiling is
  10⁶ N m: Rapier reads it in single precision, where `Number.MAX_VALUE` is infinite.
- **Load cases**, built with the toes at rest, turned with the foot, and clear of the ground:
  - `flat`;
  - `flat, toes lifted`, a 2 N m moment between toes and foot lifting the toes clear: the spring's
    control, whose prediction needs no contact reading;
  - `heel raised`, the foot turned 0.5 rad heel-up about the hinge;
  - `kneel on toes`, the foot turned 1.45 rad, 0.12 rad short of the bound.
- **Configurations**:
  - 120 Hz with `SOLVER`;
  - 480 Hz, read at 120 Hz's spacing;
  - 120 Hz with four times the iterations;
  - the toes on a fixed joint;
  - one rigid foot (`rigidFoot`'s hull, the foot's whole mass);
  - 120 Hz with the toes' mass and moments ×10 and ×100, their weight kept. This is a test of the
    cause, solver conditioning, not anatomy.

A first fixture carried the load on a leg body whose turn was held, joined to the foot by the
ankle's velocity motor. In it the foot crept along the ground at up to 8 mm/s, the rigid foot as
much as the cut one. A loaded foot holding its own turn does not creep (0.000 mm/s at 120 and 480
Hz), so the creep was the fixture's. Its numbers are not used.

**Readings**, every 1/120 s over the hold, averaged over the last second:

- the toe's angle;
- the moment of the ground's normal pushes on the toes about the hinge, with their weight and any
  applied moment, giving the static prediction rest + moment / stiffness;
- the spring's torque as Rapier reports it (`jointMotorStepImpulse` / dt), beside what its law
  gives at that angle and speed;
- the toes' load;
- the deepest solver point of any piece below the ground;
- the angle's peak-to-peak;
- the hinge's separation;
- the energy's rise over the hold (motion, height, the spring);
- the foot's creep over the last second.

Friction is not in the moment. Rapier's default profile applies friction over the patch with a
twist, not per point, so its tangent impulses do not give a moment without the solver's own
construction.

## Results

| case | configuration | toe, rad | predicted, rad | ground's moment, N m | spring as read, N m | spring by its law, N m | toe load, N | deepest, mm | peak-to-peak, rad | separation, mm | energy rise, J | spring energy, J | creep, mm/s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| flat | 120 Hz | 0.010 | 0.002 | 0.04 | -0.04 | -0.17 | 0 | 0.0 | 0.0000 | 0.000 | 0.0000 | 0.001 | 0.00 |
| flat | 480 Hz | 0.003 | 0.002 | 0.04 | -0.04 | -0.06 | 0 | 0.0 | 0.0000 | 0.000 | 0.0000 | 0.000 | 0.00 |
| flat | 120 Hz, 4x iterations | 0.003 | 0.002 | 0.04 | -0.04 | -0.06 | 0 | 0.0 | 0.0000 | 0.000 | 0.0000 | 0.000 | 0.00 |
| flat | toe locked | - | - | - | - | - | 0 | 0.0 | - | 0.000 | 0.0000 | - | 0.00 |
| flat | rigid foot | - | - | - | - | - | - | 0.0 | - | - | 0.0000 | - | 0.00 |
| flat | toes x10, 120 Hz | 0.002 | 0.002 | 0.04 | -0.04 | -0.05 | 0 | 0.0 | 0.0000 | 0.000 | 0.0000 | 0.000 | 0.00 |
| flat | toes x100, 120 Hz | 0.000 | 0.001 | 0.04 | -0.01 | -0.01 | 55 | 0.0 | 0.0001 | 0.001 | 0.0000 | 0.000 | 0.00 |
| flat, toes lifted | 120 Hz | -0.070 | -0.078 | -1.96 | 1.96 | 1.83 | 0 | 0.0 | 0.0000 | 0.000 | 0.0000 | 0.062 | 0.00 |
| flat, toes lifted | 480 Hz | -0.077 | -0.078 | -1.96 | 1.96 | 1.93 | 0 | 0.0 | 0.0000 | 0.000 | 0.0000 | 0.074 | 0.00 |
| flat, toes lifted | 120 Hz, 4x iterations | -0.077 | -0.078 | -1.96 | 1.96 | 1.93 | 0 | 0.0 | 0.0000 | 0.000 | 0.0000 | 0.074 | 0.00 |
| flat, toes lifted | toe locked | - | - | - | - | - | 0 | 0.0 | - | 0.000 | 0.0000 | - | 0.00 |
| flat, toes lifted | rigid foot | - | - | - | - | - | - | 0.0 | - | - | 0.0000 | - | 0.00 |
| flat, toes lifted | toes x10, 120 Hz | -0.078 | -0.078 | -1.96 | 1.96 | 1.95 | 0 | 0.0 | 0.0000 | 0.000 | 0.0000 | 0.076 | 0.00 |
| flat, toes lifted | toes x100, 120 Hz | -0.078 | -0.078 | -1.96 | 1.96 | 1.96 | 0 | 0.0 | 0.0000 | 0.000 | 0.0000 | 0.077 | 0.00 |
| heel raised | 120 Hz | -0.669 | -0.018 ✗ | -0.45 | 1.11 | 11.02 | 132 | 2.6 | 0.0273 ✗ | 0.111 | 0.2698 ✗ | 5.602 | 0.00 |
| heel raised | 480 Hz | -0.448 | -0.305 ✗ | -7.62 | 6.94 | 11.46 | 145 | 4.6 | 0.0000 | 0.001 | 0.0000 | 2.506 | 0.03 |
| heel raised | 120 Hz, 4x iterations | -0.448 | -0.305 ✗ | -7.63 | 6.94 | 11.46 | 145 | 4.6 | 0.0000 | 0.001 | 0.0001 | 2.503 | 0.03 |
| heel raised | toe locked | - | - | - | - | - | 387 | 9.2 | - | 0.067 | 0.0000 | - | 3.00 |
| heel raised | rigid foot | - | - | - | - | - | - | 0.0 | - | - | 0.0000 | - | 0.00 |
| heel raised | toes x10, 120 Hz | -0.464 | -0.233 ✗ | -5.84 | 8.00 | 11.01 | 387 | 3.1 | 0.0464 ✗ | 0.033 | 0.1735 ✗ | 2.691 | 4.81 |
| heel raised | toes x100, 120 Hz | -0.478 | -0.181 ✗ | -4.52 | 11.93 | 11.98 | 388 | 0.4 | 0.0001 | 0.005 | 0.0017 | 2.861 | 0.11 |
| kneel on toes | 120 Hz | 1.577 | 0.083 ✗ | 2.08 | 1.29 | -33.89 | 386 | 14.3 | 0.0551 ✗ | 0.587 | 2.5256 ✗ | 31.097 | 53.89 |
| kneel on toes | 480 Hz | 1.224 | 0.791 ✗ | 19.77 | -17.99 | -31.72 | 387 | 11.7 | 0.1335 ✗ | 0.009 | 0.8508 ✗ | 18.741 | 10.68 |
| kneel on toes | 120 Hz, 4x iterations | 1.225 | 0.782 ✗ | 19.56 | -17.95 | -31.72 | 387 | 11.8 | 0.1418 ✗ | 0.009 | 0.9570 ✗ | 18.765 | 11.03 |
| kneel on toes | toe locked | - | - | - | - | - | 471 | 4.7 | - | 0.218 | 0.0000 | - | 1.62 |
| kneel on toes | rigid foot | - | - | - | - | - | - | 0.1 | - | - | 0.0000 | - | 0.00 |
| kneel on toes | toes x10, 120 Hz | -0.597 | -0.521 ✗ | -13.02 | 12.88 | 14.81 | 387 | 1.1 | 0.0262 ✗ | 0.012 | 0.1108 ✗ | 4.455 | 10.75 |
| kneel on toes | toes x100, 120 Hz | -0.359 | -0.355 | -8.88 | 8.92 | 8.93 | 387 | 0.2 | 0.0276 ✗ | 0.000 | 0.0000 | 1.607 | 1.28 |

✗ marks a declared bar missed. The bars: separation ≤ 1 mm; within 0.05 rad of the prediction;
peak-to-peak ≤ 0.01 rad; energy rise ≤ 1 % of the spring's energy.

## Findings

- **Off the ground the toe is the spring.** In `flat, toes lifted` the angle is within 0.008 rad of
  the prediction at 120 Hz and within 0.001 rad at 480 Hz. Its reported torque equals the applied
  moment. A bare probe (fixed foot, a known torque) gives θ = τ/k exactly at 120 and 480 Hz.
- **Loaded through the toes, it is not.** Every loaded case misses the declared acceptance at 120
  Hz and at 480 Hz:
  - The solver delivers 10 % (heel raised, 120 Hz) to 60 % (480 Hz, or 4× iterations, which
    agree) of the torque the spring's law gives at the angle it holds.
  - The toes sink 2.6 to 14 mm into the ground.
  - In the kneel the toes buckle under, plantarflexed to the bound at 120 Hz, against a
    dorsiflexed hold once conditioned. They chatter there (0.05 to 0.14 rad peak-to-peak), gain
    energy and creep up to 54 mm/s.
- **The cause is the mass ratio.** A 0.145 kg body carries a 39 kg body's load into the ground.
  The toes on a fixed joint sink 9 mm and creep 3 mm/s as well. The same toes conditioned to
  ×100 their mass and moments, weight unchanged, give the spring's law to 0.4 %, sink 0.4 mm, and
  meet the kneel's prediction. Even so, the kneel is not steady (0.028 rad peak-to-peak). ×10
  is not enough.
- **The rigid foot is clean** on every reading: no depth beyond 0.1 mm, no creep, no energy gained.
- The heel-raised prediction misses even conditioned. There the ball of the foot and the toes'
  pad both bear, and friction between them carries a moment the normal-only reading leaves out.
  The spring's own check (as read 11.93, law 11.98 N m) is the faithful one there.

**Verdict for Gate A, item 2**:

- The passive toe does not meet its acceptance at 120 Hz.
- The locked toe has the same mass-ratio fault.
- The rigid foot meets every bar that applies to it.

By the plan's rule, phase B builds Man without a toe joint unless the toe's conditioning
becomes a measured `SOLVER` entry. That would be an inertia floor of about a hundred times the
toes' own, and it still leaves the kneel unsteady.
