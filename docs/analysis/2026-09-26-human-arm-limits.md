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

## Checks and next experiment

Explicit tone/rate 1 reproduces the original full impact record exactly. Tests distinguish the
free and contact passes, check rate sensitivity and reject invalid configurations and overlap
energy. The fixed contact regression catches accidentally applying tone only in the free pass.

The remaining question is the 8 rad/s velocity clamp. Isolate that in a harness counterfactual
with rates and torques held, and measure saturation during the stroke before selecting any
body-release change. Raising an already-clamped output would also raise sub-limit commands and
would not isolate the clamp. Owner choices and the before/after gate still apply to shipped tuning.

Validation: 1083/1083 tests, `npm run check` and `npm run build` pass. Four deliberate mutations
were caught: losing tone in either pass, losing the rate attribute, and reporting overlap energy.
