# Motor effort accumulation precision

Whole-step motor effort is a measurement of solver impulses. Summing many single-precision
substeps in single precision introduced a measurable error even when every motor row obeyed
its cap. The accumulator and its binding use `f64`; the constraint impulses, warmstarting,
motor bounds and physical integration retain their existing precision. The accumulator remains
an observation, never an input to constraint solving. Its serialized representation changes,
so the adapter revision changes with the package.

## Isolated reproduction

Harness: Node core World, Rapier SIMD `.6`, 120 Hz, gravity disabled, no contacts or assists.
A fixed parent and a centred 1 kg rotor with isotropic inertia `0.02 kg m²` are connected by
a revolute joint. A velocity target of `1e6 rad/s` saturates a symmetric `149.3 N m` motor
for one step. Only native solver iterations vary; internal PGS iterations remain two.

| Native substeps | Reported torque, N m | Last impulse × substeps / step, N m |
|---|---:|---:|
| 16 | 149.3000078201294 | 149.3000078201294 |
| 32 | 149.3000364303589 | 149.3000078201294 |
| 64 | 149.29996490478516 | 149.3000078201294 |
| 128 | 149.2999792098999 | 149.3000078201294 |
| 256 | 149.30025100708008 | 149.3000078201294 |
| 512 | 149.29967880249023 | 149.3000078201294 |

The small difference between the last column and the nominal cap comes from the existing
single-precision impulse calculation. The larger, nonmonotonic difference in the middle
column comes from repeated rounding in the ledger. Increasing the acceptance tolerance would
hide that measurement defect. Neither strength nor a torque cap changes to correct it.

`tests/core-rapier-effort.test.mjs` repeats all six counts in both directions and requires exact
equality of the accumulated impulse and the last saturated impulse times the count. It also
checks serialization. On `.6` it fails at 32 substeps, negative velocity. The native Rust test
`step_motor_impulse_preserves_precision_across_substeps` checks the same property on a real
rotor. Existing tests cover early target arrival, reset, CCD subdivisions and different island
iteration counts.

## Anatomical comparison protocol

```powershell
node research/rapier-effort-precision.mjs --reference .tools/effort-v6-reference/package
```

The reference argument names an unpacked `.6` archive. Both packages run the same installed
posture task: Node core World, 120 Hz, Warrior, directional actuation, corrected angular limits,
per-point friction, empty hands, no assists. The independent controller uses a `0.01 s`
response, `10 rad/s` velocity cap and full activation. All-fours, half-kneel and squat each
run for ten seconds at 16, 32, 64, 128 and 256 native iterations. Every segment pose, velocity,
joint reading and contact is hashed every step, excluding only the corrected effort reading.
Each run also restores step 240 and requires exact replay, including effort, through step 1200.

The high-iteration configurations are experiments, not new defaults. The installed-pose gate
does not establish the ability to enter or leave a pose, recover from a fall or control another
body or loadout. Timing under concurrent builds or tests is not a performance measurement.

## Results

The [complete records](effort-precision.json) contain all 15 matched cases. Every physical
trace is identical across `.6` and `.7`; all 30 runs replay exactly, including their own effort
readings. The observation hashes that include effort appropriately differ between packages.

| Native substeps | All-fours peak drift, m | Half-kneel peak drift, m | Squat peak drift, m |
|---|---:|---:|---:|
| 16 | 0.015455 | 0.127072 | 1.679042 |
| 32 | 0.007326 | 0.072480 | 1.675590 |
| 64 | 0.004856 | 0.050105 | 1.679545 |
| 128 | 0.002640 | 0.027462 | 1.655413 |
| 256 | 0.001598 | 0.018194 | 1.691928 |

All-fours passes at every count. Half-kneel passes only at 256: reported peak torque excess
drops from `0.00027705237458519605` to `0.000010679394861767832 N m`, below the existing
`0.0001 N m` tolerance, while its physical drift stays exactly `0.018194014667082065 m`.
Squat fails at every count. The result supports further work on support transfer and control;
it does not justify a sixteenfold increase of the default solver count.

The built Chrome viewer's all-fours trial at default 16 iterations matches Node's complete
outcome and observation digest, including effort, and replays:
`ffd709214323c5d270e4c6c135c0af3447567014f91213f55d10bfad9fdfe7cc`.
The initial body was visually inspected. The owned preview was stopped.

The common default-profile baseline has 138/138 equal physical records after excluding timing,
and all three stock-package arena bout records remain identical. Baseline manifest identities
and source hashes are included in the record. These are parity checks, not new capability passes.
