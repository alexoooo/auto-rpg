# Motor effort accumulation precision

Why the whole-step motor effort accumulator (`jointMotorStepImpulse`) and its binding are `f64`
(package `.7`, [vendor record](rapier-vendor.md)): summing many single-precision substeps in single
precision gave a measurable error with every row at its cap. Impulses, warmstarting, motor bounds
and integration keep their precision; the accumulator is an observation, never a solver input.

## Isolated reproduction

Node core World, Rapier SIMD `.6`, 120 Hz, no gravity, contacts or assists: a fixed parent and a
centred 1 kg rotor (isotropic inertia `0.02 kg m²`) on a revolute joint, a `1e6 rad/s` target
saturating a symmetric `149.3 N m` motor for one step. Only the native solver iterations vary;
internal PGS iterations stay two.

| Native substeps | Reported torque, N m | Last impulse × substeps / step, N m |
|---|---:|---:|
| 16 | 149.3000078201294 | 149.3000078201294 |
| 32 | 149.3000364303589 | 149.3000078201294 |
| 64 | 149.29996490478516 | 149.3000078201294 |
| 128 | 149.2999792098999 | 149.3000078201294 |
| 256 | 149.30025100708008 | 149.3000078201294 |
| 512 | 149.29967880249023 | 149.3000078201294 |

The last column's offset from the cap is the single-precision impulse itself; the middle column's
larger, nonmonotonic error is the ledger's rounding. `tests/core-rapier-effort.test.mjs` repeats all
six counts both ways and requires exact equality with the last saturated impulse times the count;
on `.6` it fails at 32 substeps, negative velocity. The native test
`step_motor_impulse_preserves_precision_across_substeps` checks the same on a real rotor.

## Anatomical comparison

`node research/rapier-effort-precision.mjs --reference .tools/effort-v6-reference/package` (an
unpacked `.6` archive): both packages run the installed posture task (Node core World, 120 Hz, the
Warrior, directional actuation, corrected limits, per-point friction, empty hands, no assists; a
`0.01 s` response, `10 rad/s` cap, full activation). All-fours, half-kneel and squat each run 10 s
at 16, 32, 64, 128 and 256 iterations, every pose, velocity, joint reading and contact hashed every
step (effort excluded), with a restore at step 240 replayed exactly through step 1200.

Every physical trace is identical across `.6` and `.7`, and all 30 runs replay
([records](effort-precision.json)):

| Native substeps | All-fours peak drift, m | Half-kneel peak drift, m | Squat peak drift, m |
|---|---:|---:|---:|
| 16 | 0.015455 | 0.127072 | 1.679042 |
| 32 | 0.007326 | 0.072480 | 1.675590 |
| 64 | 0.004856 | 0.050105 | 1.679545 |
| 128 | 0.002640 | 0.027462 | 1.655413 |
| 256 | 0.001598 | 0.018194 | 1.691928 |

All-fours passes at every count; half-kneel only at 256, where its reported peak torque excess drops
from `0.00027705237458519605` to `0.000010679394861767832 N m`, under the `0.0001 N m` tolerance,
its drift unchanged at `0.018194014667082065 m`; squat fails at every count. The higher counts are
experiments, not defaults. The built page's all-fours trial at 16 iterations matches Node's outcome
and digest, effort included: `ffd709214323c5d270e4c6c135c0af3447567014f91213f55d10bfad9fdfe7cc`.
