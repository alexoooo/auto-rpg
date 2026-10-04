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
