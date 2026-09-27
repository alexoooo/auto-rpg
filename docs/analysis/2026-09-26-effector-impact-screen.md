# Forced task-trajectory impact screen

2026-09-26. `research/effector-impact-screen.mjs`, Node/Havok bout runner, supported equal human
bodies, seed pair 11/22, subject in the left corner, initial separation 1.5 m. Each trial builds
a fresh world and reaches the same 0.75 s shadow-policy warmup through ordinary commands. It then
plays one forced expert `Program` for 1 s. No search, body transforms, joint edits or tuning changes.
All 38 plans on each body share an identical warmup pose hash.

There are two legacy controls (duelist and cut-mid) plus sweep/point targets crossed with duration
0.15/0.3/0.6 s, mark height -0.35/0/+0.35 m and extension 0.75/0.95 of published hand reach.
The remaining trajectory parameters, including speed/force 1, stay at their shared defaults.
Three weapons make 114 trials. Primary-hand reports supply the body-contact energy and damage;
blocks are counted separately. Six default sweep/point cells exactly reproduce the earlier fork
probe's warmup hashes and body-energy maxima.

**No tested plan caused a wound.** Both legacy controls and all target variants have zero
pre/post-armour primary-body damage in this sampled state.

| Weapon | Strongest target by body energy | Energy J | Closing m/s | Existing damage floor J | Cut-mid control energy J |
|---|---|---:|---:|---:|---:|
| blade | sweep, 0.3 s, -0.35 m, extension 0.95 | 3.307 | 3.521 | 10.62 | 0 |
| mace | point, 0.3 s, 0 m, extension 0.95 | 0.814 | 1.336 | 29.67 | 14.550 |
| fist | point, 0.6 s, -0.35 m, extension 0.95 | 0.439 | 0.548 | 29.67 | 8.298 |

The blade variant improves energy over its current opening targets, but still does not clear
the floor. It is not a damaging candidate to promote into an expensive headroom campaign. Mace
and fist controls deliver more energy than any tested task variant here, while also scoring zero.
This is one seed pair, one corner and one warmed engagement. It does not exclude a better path,
orientation, chamber or engagement state. The grid changes only duration, height and extension;
it does not test roll, tilt, a larger sweep or a timed chamber. High extension may also request
an endpoint the anatomical envelope cannot reach. No default or expert proposal list changes.

Evidence: `research/results/2026-09-26-effector-impact-screen.json`. Tests compare a real altered
trajectory with its legacy control, require identical warmup states, observe changed
physical contact energy and verify restored flags. Three deliberate defects are caught: no plan
application, ignored aim height and wrong-hand reporting.

Validation: 1089/1089 tests, `npm run check` and `npm run build` pass.
