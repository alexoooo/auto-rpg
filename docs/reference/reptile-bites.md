# Bounded tooth contact

The qualification harnesses are `research/contact-layer.mjs` (Node two-sphere stand,
zero gravity) and `research/reptile-bite.mjs` (Node core stand, grounded reptile), on
rapier-coordinate. Balance is zero on both sides. The game rate is 120 Hz; the fine
reference is 960 Hz, sampled at the 120 Hz spacing.

The search cells are stiffness 250, 500, 1000 and 2000 N/m, with damping ratios .25,
.5 and 1. They are authored game material estimates. The contact layer and rigid
backstop allow at most 8 mm of compression, the physical tooth height. Damping is
`2 * ratio * sqrt(stiffness * reducedMass)`. Anatomy, muscle strength and speed,
balance, HP and point pricing stay fixed.

Reaction work uses each solver substep's normal impulse divided by its duration,
times the change of the actual solver-anchor gap. Compression adds work;
unloading subtracts it. Static pressure adds none. A contact episode groups the
teeth meeting the same opposing physical segment, and prices its nonnegative net
work once at physical release. These episodes belong to the world and survive
replacement of combat observers and save/load. Colliders stay unchanged.

## Normal-contact kernel

`node research/contact-layer.mjs` drives a 1 kg point sphere of radius .05 m
into a fixed sphere at .2 m/s in the Node two-sphere stand, zero gravity, on
rapier-coordinate. The 960 Hz run is read at the 120 Hz spacing. Energy is signed
reaction work after compression and unloading; the initial kinetic energy is .02 J.

| Stiffness, N/m | Damping ratio | Work at 120 Hz, J | Work at 960 Hz, J | Difference, % | Peak compression at 120 Hz, mm |
| --- | --- | --- | --- | --- | --- |
| 250 | 0.25 | 0.014464 | 0.015082 | 4.10 | 7.952 |
| 250 | 0.5 | 0.018364 | 0.018464 | 0.54 | 6.350 |
| 250 | 1 | 0.019552 | 0.019715 | 0.83 | 3.913 |
| 500 | 0.25 | 0.015307 | 0.015362 | 0.35 | 5.996 |
| 500 | 0.5 | 0.018417 | 0.018554 | 0.74 | 4.337 |
| 500 | 1 | 0.019518 | 0.019743 | 1.14 | 2.560 |
| 1000 | 0.25 | 0.015448 | 0.015520 | 0.47 | 4.143 |
| 1000 | 0.5 | 0.018484 | 0.018671 | 1.00 | 2.915 |
| 1000 | 1 | 0.019472 | 0.019777 | 1.54 | 1.597 |
| 2000 | 0.25 | 0.015610 | 0.015706 | 0.61 | 2.840 |
| 2000 | 0.5 | 0.018565 | 0.018815 | 1.33 | 1.929 |
| 2000 | 1 | 0.019408 | 0.019816 | 2.06 | 0.930 |

All twelve cells pass the 10% rate gate. The separate 20 N stationary-pressure
witness reaches the 8 mm backstop and adds less than 10 microujoules over its final
.2 s. Elastic unloading returns stored work; side and reverse directions admit
no material work. Free-pair momentum error stays below 1e-6 m/s.

## Repeated driven work and material selection

`node research/reptile-bite.mjs --materials` runs three muscle-driven closing
strokes against a fixed grounded Reptile and three against a free grounded
Reptile held by its standing mind, for each cell. This is the Node core stand,
rapier-coordinate, 120 Hz, balance zero on both sides. It records actual net
closing-stroke reaction work after unloading and requires physical opening and release between strokes. The median is over
the six released cycles. All cells complete all six with no fall and no failed
return. No muscle torque ceiling or unloaded speed changes.

Each cell also runs autonomous Node arena mirror bouts at gaps 1.5, 2, 3 and
4 m, for at most 60 s, rapier-coordinate at 120 Hz and balance zero on both
sides. A cell passes only if every gap has five verified damaging cycles per
side or an earlier injury verdict, at least .05 HP combined deliberate bite
damage, and no fall. Numbers below are left/right verified damaging cycles;
`injury` records a fatal or severed verdict, and `fall` rejects the cell.

| Stiffness, N/m | Damping ratio | Fixed work, J (three cycles) | Free work, J (three cycles) | Median, J | Cycles at 1.5 / 2 / 3 / 4 m | All gaps |
| --- | --- | --- | --- | --- | --- | --- |
| 250 | 0.25 | 0.059319, 0.058114, 0.055374 | 0.053624, 0.042982, 0.035105 | 0.054499 | 11/8; 6/2; 6/10; 3/6 | Fail |
| 250 | 0.5 | 0.066831, 0.066539, 0.065820 | 0.064185, 0.049086, 0.052226 | 0.065002 | 4/7; 3/7; 11/5; 1/3 | Fail |
| 250 | 1 | 0.074196, 0.087455, 0.000000 | 0.064974, 0.045856, 0.047482 | 0.056228 | 9/7 injury; 3/3 injury; 2/6; 6/7 | Fail |
| 500 | 0.25 | 0.063976, 0.066570, 0.057710 | 0.056213, 0.035206, 0.041074 | 0.056961 | 9/10; 10/5; 4/7; 6/4 | Fail |
| 500 | 0.5 | 0.070739, 0.064704, 0.068264 | 0.066005, 0.048661, 0.054157 | 0.065355 | 5/6; 5/5; 7/2; 3/6 | Fail |
| 500 | 1 | 0.075948, 0.068129, 0.076656 | 0.062800, 0.049235, 0.047725 | 0.065464 | 5/6; 4/7; 3/8; 6/7 | Fail |
| 1000 | 0.25 | 0.060482, 0.064075, 0.057114 | 0.052567, 0.045807, 0.043799 | 0.054840 | 4/11; 3/3; 5/9; 7/13 fall | Fail |
| 1000 | 0.5 | 0.065767, 0.059238, 0.061277 | 0.062664, 0.046583, 0.048603 | 0.060258 | 13/10; 4/4; 4/2; 5/6 | Fail |
| 1000 | 1 | 0.067957, 0.058357, 0.068448 | 0.059205, 0.046730, 0.048685 | 0.058781 | 6/6; 1/7 fall; 10/11 injury; 10/8 injury | Fail |
| 2000 | 0.25 | 0.057738, 0.056634, 0.054594 | 0.049849, 0.045354, 0.043411 | 0.052221 | 6/7; 15/10; 8/6; 13/13 | Pass |
| 2000 | 0.5 | 0.061593, 0.057167, 0.057382 | 0.061480, 0.050200, 0.048905 | 0.057274 | 8/9; 4/3; 9/7; 6/9 | Fail |
| 2000 | 1 | 0.061498, 0.055560, 0.061614 | 0.061267, 0.050146, 0.052330 | 0.058414 | 6/9 injury; 2/1; 3/4 injury; 2/2 | Fail |

The selected cell is **2000 N/m, damping ratio .25, depth 8 mm**. It is the
only cell that passes every kernel, repeated-stroke and mirror gate. Selection
maximizes the median measured repeated driven work among passing cells; ties
prefer higher stiffness, then lower damping ratio. A higher controlled-stand
work reading alone does not qualify a material for autonomous combat.

## Autonomous mirror result

The default asset and controller reproduce the selected cell in the main source
tree. Each row is the Node arena, rapier-coordinate at 120 Hz, 60 seconds, zero
balance on both sides. Every launch has four loaded paws; no assist participates.
Damage is actual point-priced HP taken, apportioned by positive work during
actual jaw closing in Swing, with subsequent unloading subtracted. Approach
bumps and positive preparation or Return work receive no deliberate-bite credit.

| Starting gap, m | Verified damaging cycles, left/right | Combined deliberate bite damage, HP | Peak normal compression, mm | Falls |
| --- | --- | --- | --- | --- |
| 1.5 | 6/7 | 0.075535 | 5.064 | 0 |
| 2 | 15/10 | 0.150713 | 6.131 | 0 |
| 3 | 8/6 | 0.085300 | 4.310 | 0 |
| 4 | 13/13 | 0.160825 | 4.662 | 0 |

These bouts end on the clock; other cells produce injury verdicts but fail the
full gap battery. The covered witnesses establish repeated Reptile mirror bites,
not arbitrary opponents, poses or obstacles. The unchanged standing, travel and
eight-pose recovery locks cover behavior outside this bite battery.

## Physical regression witnesses

`tests/core-reptile.test.mjs` includes a jaw-stop witness: an otherwise unchanged
Reptile has a .3 rad minimum jaw angle and is constructed at .65 rad. Its actual
joint limit prevents the commanded closed pose without an external target or
contact, so the missed stroke must withdraw within the .12 s snap plus .12 s
follow-through. Substituting the preparation timeout makes this test fail.
A moving-paw request checks that another placement does not begin while the
jaw prepares, and physical preparation steps retain the sensed material point
until its finite deadline. Their removed-control mutations fail. A startup
mouth inside a foreign collider supplies no fresh bite; disabling that guard
admits a target and fails its witness.

`tests/core-contact-layer.test.mjs` covers signed loading/unloading work, static
pressure, point direction, the depth backstop and fine-rate comparison.
`tests/core-contact-episodes.test.mjs` covers simultaneous teeth, opposing tooth
sets, combat observer replacement, weak unintended wall contact and snapshots
while loaded, including angular unloading through a restored native layer.
`tests/reptile-recipe.test.mjs` preserves immutable material and bite overrides
through recipe save/load and rejects invalid settings.
