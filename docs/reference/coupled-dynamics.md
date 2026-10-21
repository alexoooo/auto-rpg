# Acceleration with shared equipment

What `build/coupled-dynamics.ts` models and how it was checked against Rapier. It extends the
floating-tree dynamics with six coordinates per separate item, constrained by the active grips; its
relative rank tolerance is a numeric setting recorded here. It applies no forces and changes no
motor; it allocates, and the game's controller does not use it.

## The model

- The tree keeps its root/joint mass coupling, gravity and velocity bias; each item adds its world
  inertia, mass, gravity and gyroscopic moment once. External forces and moments are inputs; a
  release changes the next `update`. A fixed pin must be declared and supplies external reaction.
- With `M = L L'`, forces are whitened by `L^-1` and accelerations by `L'`; constraint rows `J`
  become `J L^-T`, whose orthonormal basis projects out forbidden acceleration. Targets include the
  relative centripetal and angular drift at each constraint point.
- **Rank tolerance**: 1e-10, relative to the largest original whitened row length, a numeric
  setting shared with the [impact model](constraint-mass.md). `constraintBasis` pivots on the
  strongest remaining row and projects twice: in supplied order, captured-frame rounding admitted
  a tenth row in the mechanical loop and a nonfinite acceleration.
- Redundant targets from real solver states need not agree, so the particular acceleration fits all
  normalized rows by least squares, in no favoured order. The report gives coordinate and
  constraint counts, rank and the largest residual.
- Attachments use one world point, the mean of their anchors: separate anchors make common rigid
  rotation look like relative motion when the solver leaves a gap, which falsely removes freedoms
  in a moving loop.

### Velocity and impulse

`impulseResponse` gives the velocity change from impulses, with homogeneous targets; `pointVelocity`
evaluates it at a point. `projectVelocity` maps every body's measured momentum (items included)
through it: the mass-metric closest admissible motion, applied to nothing. Every installed row,
caller-supplied ones included, is stationary in it; acceleration targets are excluded. The
[linked contact fixture](contact-step.md#linked-supports-and-velocity-consistency) shows why
local contact prediction needs it.

### Explicit motion rows and reactions

`coupledDynamics.update(motionRows)` adds controller-supplied velocity constraints after equipment
and pins, copied at the update and gone at the next without them; nothing is installed in the
engine. Normal-only rows leave tangential motion free. `reactions(torque, loads)` returns each row's
multiplier and equivalent body forces, the minimum-norm distribution for redundant rows through the
factored Gram matrix. Signs follow the rows: an upward normal row reports a negative multiplier when
holding would need tension, and nothing clamps it.

## Measurement

`node --test tests/core-coupled-dynamics.test.mjs tests/core-constrained-mass.test.mjs`. No assists.

**Representations.** Node core world, Rapier `0.21.0-auto-rpg.3`, adapter 4: with gravity, all three
bodies holding a right-hand club, floating and with a declared fixed pelvis, the model with compound
equipment and the one with a separate item and grip agree in generalized and point accelerations
within 1e-6 × (1 + magnitude); releasing the item restores its free fall.

**Mechanical loop.** Two 1 kg holders (isotropic inertia 0.001 kg m², centres (-0.1, 1, 0) and
(0.1, 1.2, 0) m) joined by a spherical joint at (0, 1.1, 0); a wooden club at (0, 0.9, 0) gripped at
item y = 0.1 and 0.3 m; narrow capsule colliders, no ground or gravity. A force (4, 8, 10) N at
(0.05, 1.4, 0.08) m with internal joint torque (0.4, -0.3, 0.2) N m; velocity read after three
steps at 3840 Hz over the elapsed time. Gate: each component within 2 % of the predicted magnitude.

| Released | Constraint rank | Predicted point acceleration, m/s² | Measured, m/s² |
|---|---:|---|---|
| None | 9 | (1.996856, 1.461910, 5.327239) | (1.936408, 1.432057, 5.327248) |
| Left | 6 | (-3.943952, -0.508972, 7.276031) | (-3.946598, -0.511765, 7.276014) |
| Right | 6 | (2.982066, 1.117813, 4.524128) | (2.975029, 1.110845, 4.524163) |
| Both | 0 | (-16.392856, 8.271116, 20.676427) | (-16.392336, 8.271067, 20.676283) |

- The tree already removes the spherical joint's three translations, so the rank is three below
  the impact model's. Every branch replays; with no joint torque the point response matches the
  impact-mobility matrix.
- At a hundredth of the force and torque, the closed loop's x acceleration reads 0.018733 against
  0.019969 and narrowly fails the gate; a zero-load branch reads only -0.0000299 m/s², so startup
  correction does not explain it. Accuracy across load scales is not claimed.

**Moving loop.** All three bodies spinning (2, 3, 4) rad/s with compatible centre velocities, at
480 Hz after eight startup steps, model accelerations integrated over twenty four-step windows:
median relative error 0.0086971 (gate 0.05), maximum 0.0143669; largest constraint residual
0.0047840 (gate 0.02). Six free motions hold throughout; reversing every grip row agrees within 1e-8.

**Velocity projection** (package `.6`, adapter 7, 120 Hz, deliberately incompatible impulses):
momentum kept within 1e-9, energy within 1e-10 J of a principal-frame calculation, idempotent.
From 0.7646515023 J, projected energies are 0.2774078220 J (both grips), 0.5177196390 (left
released), 0.2892601431 (right released) and 0.6665564020 (both released): energy removed by a
diagnostic projection, not engine dissipation.

**Reactions.** Adding the reported reactions to the unconstrained model reproduces every constrained
coordinate within `1e-8 * (1 + abs(predicted))`. Two normal-only supports under the 1 kg centres
bear 19.6133 N; 1 N sideways on each gives 1 m/s² tangentially; 20 N up on each makes them need
tension; duplicated rows do not duplicate the reaction. The twelve development pinned-bar trials
keep their outcomes and digests (`research/runs/control-foundation/pinned-bar-reaction-model`,
source SHA256 `d753deac77a30e52c44fb5b40cf6eb80826a5e0b76904a8b7c49ca030a02ebc0`).

## Tried and not kept

- Without item gyroscopic bias: median moving error 0.49011.
- Separate-anchor point rows: fail the six-freedom check.
- First-arriving acceleration targets in place of the fit: residual 1.2824 at the first moving
  reading.
