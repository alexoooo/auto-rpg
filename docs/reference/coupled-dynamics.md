# Acceleration with shared equipment

`build/coupled-dynamics.ts` extends the existing floating-tree dynamics with six coordinates per
separate item. The tree retains its root/joint mass coupling, gravity and velocity-dependent
bias. Each item adds its world inertia, mass, gravity and gyroscopic moment exactly once.
Active grips constrain the combined system; release changes the next `update`. External
forces and moments are explicit inputs. The model applies no forces and changes no motor.

For mass matrix `M = L L'`, the model whitens forces with `L^-1` and acceleration with `L'`.
Constraint rows `J` become `J L^-T`. Their orthonormal row basis projects out forbidden
acceleration, while their targets include the relative centripetal/angular drift at each
constraint point. The relative rank tolerance is 1e-10 against the largest original whitened
row length, a numerical setting shared with the impact model. The shared `constraintBasis`
pivots on the strongest remaining row before normalization; two projection passes reduce roundoff.
Native captured-frame rounding exposes why pivoting matters: processing the mechanical loop's
rows in supplied order admitted a tenth constraint and produced a nonfinite acceleration.
Pivoting restores rank nine and agreement with the independently formulated impact model.

Real solver states retain small relative-velocity errors, so redundant acceleration targets
need not agree exactly. The particular acceleration fits all normalized whitened rows by
least squares. It does not privilege callback order. The report exposes coordinate count,
constraint count, independent rank and maximum residual in the supplied constraint rows;
a small controller residual alone is not proof of physical feasibility.

Attachments use one common world point, the mean of their actual anchors. Using separate
anchor positions makes common rigid rotation produce relative point velocity when the solver
leaves a small gap. In a moving closed loop that falsely removes free-body freedoms. Common-point
rows preserve the rigid assembly's six motions. This also corrects the impact model; the
[contact-mass measurements](constraint-mass.md) are repeated with that convention.

## Checks

`impulseResponse` uses the same mass and constraint basis with homogeneous targets to return
velocity change from linear/angular impulses. `pointVelocity` evaluates that generalized
velocity at a world point. `projectVelocity` assembles every body's measured linear and angular
momentum, including separate items, and maps it through this impulse response. This is the
mass-metric closest admissible motion; it never applies an impulse to physics. Every installed
row is stationary in this query, including caller-supplied rows. Acceleration targets are
deliberately excluded. Pose and attachment membership must still match the last `update`.

The velocity-projection regression uses the mechanical loop below on package `.6`, adapter 7,
at 120 Hz, with distinct deliberately incompatible body impulses. It checks preservation of
total linear/angular momentum within 1e-9, energy against an independent principal-frame
calculation within 1e-10 J, idempotence, joint/grip compatibility, detached results and unchanged
physical saves. Initial energy is 0.7646515023 J; projected energies are 0.2774078220 J with
both grips, 0.5177196390 J with left released, 0.2892601431 J with right released and
0.6665564020 J with both released. This is energy removed by a diagnostic projection, not
measured engine dissipation. A nonzero acceleration target also verifies that impulse response
does not inherit acceleration units. The [linked contact fixture](contact-step.md#linked-supports-and-velocity-consistency)
demonstrates why compatible initial velocities matter for local contact prediction.

Harness: Node core world, Rapier `0.21.0-auto-rpg.3`, adapter 4. No assists. The anatomical
comparison uses gravity and all three bodies with a right-hand wooden club, both floating and
with an explicitly declared fixed pelvis. The same asymmetric channel torques are applied to
the model with compound equipment and to the model with a separate item and one grip. Generalized
and point accelerations agree within 1e-6 times (1 + reference magnitude). Releasing the item
restores its free-fall acceleration. This compares representations, not standing control.

The mechanical loop has two 1 kg holders with isotropic inertia 0.001 kg m², centres
(-0.1, 1, 0) and (0.1, 1.2, 0) m, joined by a spherical joint at (0, 1.1, 0). A wooden club
at (0, 0.9, 0) has rigid grips at item y=0.1 and 0.3 m. Holder colliders are narrow capsules;
there is no ground or gravity. A force (4, 8, 10) N acts at (0.05, 1.4, 0.08) m, with internal
joint torque (0.4, -0.3, 0.2) N m. Read velocity after three steps at 3840 Hz, divided by the
elapsed time, before appreciable pose change. The gate is component error below 2% of predicted
acceleration magnitude. At 100-times smaller force and torque, the fully closed loop's x
acceleration is 0.018733 against 0.019969 predicted and narrowly fails that norm-scaled gate.
A zero-load branch reads only -0.0000299 m/s² on x, so startup correction alone does not explain
the discrepancy. The exact low-load solver error remains unresolved; this record does not claim
uniform accuracy across load scales.

| Released | Constraint rank | Predicted point acceleration, m/s² | Measured, m/s² |
|---|---:|---|---|
| None | 9 | (1.996856, 1.461910, 5.327239) | (1.936408, 1.432057, 5.327248) |
| Left | 6 | (-3.943952, -0.508972, 7.276031) | (-3.946598, -0.511765, 7.276014) |
| Right | 6 | (2.982066, 1.117813, 4.524128) | (2.975029, 1.110845, 4.524163) |
| Both | 0 | (-16.392856, 8.271116, 20.676427) | (-16.392336, 8.271067, 20.676283) |

The tree already eliminates the spherical joint's three translation constraints, hence the rank
differs from maximal-coordinate impact mass. All force branches replay exactly. With no joint
torque the point response also agrees with the separately implemented impact-mobility matrix.

The moving test starts all three bodies with spin (2, 3, 4) rad/s and compatible centre velocities.
After eight startup steps at 480 Hz, it integrates model accelerations in twenty four-step
windows and compares changes in all three bodies' COM velocities and spins. Median relative
error is 0.0086971; maximum is 0.0143669. The declared median gate is 0.05. Maximum constraint
acceleration residual is 0.0047840 (the fixture gate is 0.02); it is reported rather than hidden
by treating redundant equations as exact. Both impact and acceleration models retain six free
motions throughout. Reversing every grip row reproduces predictions within 1e-8 on the same
scaled-entry criterion. These are single-rate checks, not a cross-rate conclusion.

Deleting item gyroscopic bias raises median error to 0.49011 and fails. Restoring separate-anchor
point rows fails the six-freedom assertion. Keeping arbitrary first-arriving acceleration targets
instead of fitting redundant rows gives a residual of 1.2824 at the first moving reading.

```powershell
node --test tests/core-coupled-dynamics.test.mjs tests/core-constrained-mass.test.mjs
```

This is an allocating diagnostic model, not the reference controller's per-step implementation.
Joint stops, measured contact reactions and solver position stabilization are not implicit.
An experiment must declare fixed bodies; a fixed pin supplies external reaction. Whole-body
control must still choose compatible tasks, admissible contact forces and bounded actuator
effort. Moving anatomical two-hand capture, support transitions and gameplay remain separate gates.

## Explicit motion rows and reaction loads

`coupledDynamics.update(motionRows)` optionally adds controller-supplied velocity constraints
to the model after equipment and fixture pins. An update copies their geometry; omitting them
on the next update removes them. It installs nothing in the engine. Normal-only rows allow
tangential motion; sticking requires additional rows and a separately justified contact mode.

`reactions(torque, loads)` returns each row's multiplier and equivalent body forces/moments.
It uses the same mass-whitened projection as `solve`. For redundant rows it chooses the
minimum norm of their normalized contributions, using the already factored row Gram matrix.
That is one force distribution; it is not proof that all possible distributions violate or
satisfy a friction cone. Signs follow the supplied row directions. An upward normal row can
report a negative multiplier when holding contact would require tension. Nothing clamps that
diagnostic into a plausible-looking support force.

Tests use the mechanical two-body/shared-item fixture above. Adding the reported reactions to
the unconstrained model reproduces every constrained acceleration coordinate within
`1e-8 * (1 + abs(predicted))`, including asymmetric external forces, torques, the shared grip
loop and successive releases. Returned force arrays cannot mutate the model.

Two normal-only supports on the two 1 kg centres bear 19.6133 N in total under gravity.
Applying 1 N horizontally to each produces 1 m/s2 tangential acceleration: the model has not
welded the supports. Applying 20 N upward to each makes the assumed supports require tension.
Duplicating the support rows does not duplicate the total reaction. Removing them restores
free-fall acceleration. These are model checks; the existing force/torque and moving-loop tests
remain the model's comparisons with actual physics. Contact selection and friction feasibility
still belong to a controller, and are not established by this API.

The reaction-force sign mutation fails the equivalence test. The twelve development pinned-bar
trials retain identical outcomes and physical digests, including exact replay, in
`research/runs/control-foundation/pinned-bar-reaction-model`; archived source content SHA256
`d753deac77a30e52c44fb5b40cf6eb80826a5e0b76904a8b7c49ca030a02ebc0`.
On the same Windows/Node 24.19 stand with one quiet worker, their mean step costs range from
1.871 to 1.997 ms, p95 from 2.091 to 2.500 ms, and p99 from 2.490 to 3.486 ms.
The preceding pinned-bar run ranged from 1.813 to 1.952 ms mean, 2.011 to 2.405 ms p95,
and 2.351 to 2.943 ms p99. These single-run ranges include the extra diagnostic model setup;
they are not a speedup or a statistical performance bound. The game controller does not use
this allocating model.
