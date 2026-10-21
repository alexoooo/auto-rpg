# Man: the passive toe on the game's solver

Whether a toe on a passive hinge, as [Man's anatomy](man-anatomy.md) proposes, behaves on the
core's Rapier world as the spring it is meant to be. It does not under load, so the humans keep a
rigid foot. `research/man-toe-solver.mjs` reads it and holds its acceptance to the bars below.

## The fixture

Node stand, commit `2a111961` with the contact-model plan's working changes
(`docs/plans/2026-10-07-man-contact-model.md@d9ad04d3`): `createRapierPhysics`, coordinate limits,
patch friction, `SOLVER`'s 16 iterations and 2 PGS passes, vendored `adapter-9`; the arena's
ground; the Warrior's left foot.

- **Foot**: the cut foot's hull (`man-contact-geometry.json` at `FIT_SCALE`) carrying half the
  Warrior's mass less the toes (39.36 kg) at the spec's ankle centre, free to translate and not to
  turn. Its weight ramps in over 1 s, then holds 3 s.
- **Toes**: their hull and volume share of mass (0.145 kg) on a hinge at `mtp`, range ±π/2
  (`SOURCES["opensim-gait2392-mtp"]`), a ForceBased position motor at rest 0, 25 N m/rad and
  2 N m s/rad (`SOURCES["falisse-2022-toes"]`), ceiling 10⁶ N m (Rapier reads it in single
  precision, where `Number.MAX_VALUE` is infinite).
- **Cases**: `flat`; `flat, toes lifted` (a 2 N m moment lifts the toes clear: the spring's
  control); `heel raised` (the foot turned 0.5 rad heel-up about the hinge); `kneel on toes`
  (turned 1.45 rad, 0.12 rad short of the bound).
- **Configurations**: 120 Hz with `SOLVER`; 480 Hz read at 120 Hz's spacing; 120 Hz with four times
  the iterations; the toes on a fixed joint; one rigid foot (`rigidFoot`, the foot's whole mass);
  the toes' mass and moments ×10 and ×100 with their weight kept, a test of the cause.

Readings every 1/120 s, averaged over the hold's last second: the toe's angle; the static
prediction, rest + (ground's normal moment about the hinge, weight and applied moment) / stiffness;
the spring's torque as Rapier reports it (`jointMotorStepImpulse` / dt) and as its law gives it;
the deepest solver point below ground; peak-to-peak angle; the hinge's separation; the energy's rise
over the hold; the foot's creep. Patch friction has no per-point tangent impulses, so friction is
not in the moment.

**Acceptance**: separation ≤ 1 mm; within 0.05 rad of the prediction; peak-to-peak ≤ 0.01 rad;
energy rise ≤ 1 % of the spring's energy.

## Results

✗ marks a bar missed. `flat` meets every bar in every configuration (toe within 0.008 rad of its
prediction, nothing sinks or creeps).

| case | configuration | toe, rad | predicted, rad | spring as read, N m | spring by its law, N m | deepest, mm | peak-to-peak, rad | separation, mm | energy rise, J | spring energy, J | creep, mm/s |
|---|---|---|---|---|---|---|---|---|---|---|---|
| flat, toes lifted | 120 Hz | -0.070 | -0.078 | 1.96 | 1.83 | 0.0 | 0.0000 | 0.000 | 0.0000 | 0.062 | 0.00 |
| flat, toes lifted | 480 Hz | -0.077 | -0.078 | 1.96 | 1.93 | 0.0 | 0.0000 | 0.000 | 0.0000 | 0.074 | 0.00 |
| heel raised | 120 Hz | -0.669 | -0.018 ✗ | 1.11 | 11.02 | 2.6 | 0.0273 ✗ | 0.111 | 0.2698 ✗ | 5.602 | 0.00 |
| heel raised | 480 Hz | -0.448 | -0.305 ✗ | 6.94 | 11.46 | 4.6 | 0.0000 | 0.001 | 0.0000 | 2.506 | 0.03 |
| heel raised | 120 Hz, 4x iterations | -0.448 | -0.305 ✗ | 6.94 | 11.46 | 4.6 | 0.0000 | 0.001 | 0.0001 | 2.503 | 0.03 |
| heel raised | toe locked | - | - | - | - | 9.2 | - | 0.067 | 0.0000 | - | 3.00 |
| heel raised | rigid foot | - | - | - | - | 0.0 | - | - | 0.0000 | - | 0.00 |
| heel raised | toes x10, 120 Hz | -0.464 | -0.233 ✗ | 8.00 | 11.01 | 3.1 | 0.0464 ✗ | 0.033 | 0.1735 ✗ | 2.691 | 4.81 |
| heel raised | toes x100, 120 Hz | -0.478 | -0.181 ✗ | 11.93 | 11.98 | 0.4 | 0.0001 | 0.005 | 0.0017 | 2.861 | 0.11 |
| kneel on toes | 120 Hz | 1.577 | 0.083 ✗ | 1.29 | -33.89 | 14.3 | 0.0551 ✗ | 0.587 | 2.5256 ✗ | 31.097 | 53.89 |
| kneel on toes | 480 Hz | 1.224 | 0.791 ✗ | -17.99 | -31.72 | 11.7 | 0.1335 ✗ | 0.009 | 0.8508 ✗ | 18.741 | 10.68 |
| kneel on toes | 120 Hz, 4x iterations | 1.225 | 0.782 ✗ | -17.95 | -31.72 | 11.8 | 0.1418 ✗ | 0.009 | 0.9570 ✗ | 18.765 | 11.03 |
| kneel on toes | toe locked | - | - | - | - | 4.7 | - | 0.218 | 0.0000 | - | 1.62 |
| kneel on toes | rigid foot | - | - | - | - | 0.1 | - | - | 0.0000 | - | 0.00 |
| kneel on toes | toes x10, 120 Hz | -0.597 | -0.521 ✗ | 12.88 | 14.81 | 1.1 | 0.0262 ✗ | 0.012 | 0.1108 ✗ | 4.455 | 10.75 |
| kneel on toes | toes x100, 120 Hz | -0.359 | -0.355 | 8.92 | 8.93 | 0.2 | 0.0276 ✗ | 0.000 | 0.0000 | 1.607 | 1.28 |

- **Off the ground the toe is the spring**: within 0.008 rad of the prediction at 120 Hz and 0.001
  at 480 Hz, its torque the applied moment. A fixed foot with a known torque gives θ = τ/k exactly.
- **Loaded through the toes it is not**, at 120 or 480 Hz: the solver delivers 10 % (heel raised,
  120 Hz) to 60 % (480 Hz or 4× iterations, which agree) of the law's torque; the toes sink 2.6 to
  14 mm; in the kneel they buckle under to the bound at 120 Hz, chatter (0.05 to 0.14 rad), gain
  energy and creep up to 54 mm/s.
- **The cause is the mass ratio**: 0.145 kg carries a 39 kg load into the ground. Locked toes sink
  9 mm and creep 3 mm/s too. At ×100 mass and moments the spring's law holds to 0.4 % and the toes
  sink 0.4 mm, yet the kneel still swings 0.028 rad; ×10 is not enough.
- **The rigid foot is clean** on every reading.
- The heel-raised prediction misses even conditioned: ball and pad both bear, and friction between
  them carries a moment the normal-only reading leaves out; the spring's own check (11.93 against
  11.98 N m) is the faithful one there.

So the passive toe and the locked toe both miss at 120 Hz, and Man is built without a toe joint;
conditioning would need an inertia floor about a hundred times the toes' own as a measured `SOLVER`
entry, and still leaves the kneel unsteady.

## Tried and not kept

- A leg body carrying the load through the ankle's velocity motor: the foot crept up to 8 mm/s,
  rigid or cut. A loaded foot holding its own turn does not creep, so that creep was the fixture's.
