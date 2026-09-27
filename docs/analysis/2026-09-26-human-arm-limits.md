# Human arm: rate and torque sensitivity

Session 07 question 4(a), 2026-09-26. No shipped tuning changed.

Harness: `node research/human-arm-limits.mjs`, the Node/Havok impact bench on a fixed stand,
awake bodies, the module's standard stroke after a 1.5 s guard. Each cell runs sequentially:
an unobstructed pass locates its peak, then a second pass hangs a gravity-free 90 kg sphere at
that mark. `tone` scales motor ceilings in both passes; `armSpeed` changes command rates through
the existing attribute. Neither changes geometry, mass, joint stops or the 8 rad/s velocity clamp.
The complete 36 cells are in `research/results/2026-09-26-human-arm-limits.json`.

## Free-stroke speed

Peak tip speed in the stroke/follow window, m/s. These are settled-start strokes, not running-cycle
peaks or combat measurements. The sphere has not been created in this pass.

| Terminal | Rate attribute | Tone 0.5 | Tone 1 | Tone 2 | Tone 4 |
|---|---:|---:|---:|---:|---:|
| blade | 0.5 | 5.37 | 6.87 | 7.06 | 7.93 |
| blade | 1 | 8.24 | 11.22 | 11.18 | 12.09 |
| blade | 1.5 | 8.90 | 12.84 | 13.88 | 15.13 |
| mace | 1 | 3.94 | 9.16 | 9.03 | 10.32 |
| mace | 1.5 | 6.12 | 13.42 | 14.48 | 13.56 |
| fist | 1 | 3.25 | 3.08 | 3.25 | 4.05 |
| fist | 1.5 | 4.42 | 4.46 | 5.43 | 5.54 |

At normal rate, doubling torque changes blade speed by -0.3 % and mace speed by -1.4 %.
Increasing rate alone to 1.5 raises them by 14.5 % and 46.6 %. Halving torque reduces their
speed, and at the higher rate additional torque can help. The limits interact; this does not
identify one universal bottleneck. It does argue against raising torque alone as the first
repair for the normal-rate speed deficit on this stroke.

## Impact interpretation

The baseline blade/mace/fist momentum is 7.65 / 10.82 / 28.45 N s, reproducing the earlier
question table. At twice torque and normal rate, blade/mace momentum becomes 15.33 / 12.46 N s,
despite almost unchanged free speed. Motor ceilings affect contact as well as the approach.

Each cell places its sphere from its own trajectory. These are not common-target hit-rate
comparisons. Overlap rows are rejected, not counted as impacts; misses also have null momentum
and energy. Free-pass speed remains available even when the second pass misses. Fist contacts
remain pushes, so their momentum is not evidence of a faster blow. No combat/headroom conclusion
follows from this table.

## Checks and velocity-clamp continuation

Explicit tone/rate 1 reproduces the original full impact record exactly. Tests distinguish the
free and contact passes, check rate sensitivity and reject invalid configurations and overlap
energy. The fixed contact regression catches accidentally applying tone only in the free pass.

The velocity clamp is now isolated in `node research/human-arm-limits.mjs --clamp`: 144 cells,
three rate levels, four torque levels, and ceilings of 4, 8, 16 and 32 rad/s. The ceiling is
extracted into `HUMAN_ARM_DRIVE.velocityLimit`, still 8 by default; the bench temporarily overrides
it and restores it after each pass. This clamps the original velocity demand at a different bound;
it does not multiply commands that were already below the bound.

| Terminal, rate 1 / tone 1 | Clamp 4 peak m/s | Clamp 8 | Clamp 16 | Clamp 32 |
|---|---:|---:|---:|---:|
| blade | 10.69649 | 11.21523 | 11.21523 | 11.21523 |
| mace | 9.03251 | 9.15738 | 9.15734 | 9.15734 |
| fist | 2.76875 | 3.07894 | 3.07894 | 3.07894 |

At normal rate and force the blade/fist records are exactly unchanged above 8; mace speed changes
by less than 0.00005 m/s. The clamp is not a useful speed lever on these normal-rate strokes.
At rate 1.5, increasing it to 16 raises mace speed by 0.03 to 0.13 m/s depending on tone; it can
matter elsewhere. This is an intervention result, not a count of saturated motor substeps.

The measured normal-rate bottleneck is chiefly command-rate sensitivity, with torque helping when
rate is higher. A rate increase still needs a combat/accuracy comparison and the owner's body
choice; these settled strokes do not justify shipping one. All defaults remain unchanged.
The full clamp record is `research/results/2026-09-26-human-arm-clamp.json`.

Default-preservation checks: all 36 original impact cells, six six-second human bout records and
trajectory fingerprints, and all 45 command-null bouts are identical. Three further mutations are
caught: ignoring the configurable clamp, scaling the whole command, and dropping the second-pass
clamp override.

Validation: 1083/1083 tests, `npm run check` and `npm run build` pass. Four deliberate mutations
were caught: losing tone in either pass, losing the rate attribute, and reporting overlap energy.

After the clamp continuation: 1086/1086 tests, check and build pass; shipped ceilings, rates and
forces remain unchanged. The run-lock increment before it passed 1085 tests and check/build.
