# Carried-endpoint fallback, 2026-09-26

The proposal diagnostic found that relaxing an anatomical hand's orientation could preserve its
palm target while moving the carried tip far away. The baseline is
`2026-09-26-effector-proposal-geometry.md`. The correction is confined to explicit experimental
task commands. Motor ceilings, ordinary aiming, other chains and shipped defaults are unchanged.

After the ordinary pose solve, an unsatisfied task can now try a position-only solve of the
**carried endpoint**, including the terminal offset in its Jacobian. Each candidate step must
reduce endpoint error and keep the palm inside its declared envelope; joint coordinates remain
clamped to anatomical stops. A bounded line search rejects steps that violate either condition.
The solver tries the preceding commanded pose and the ordinary pose solution, accepting only
an endpoint improvement. It never reads physical lag or writes a body transform. The carried
offset is captured and restored with the rest of the task state.

This is a bounded local solve, not a proof that every reachable target will be found. Infeasible
orientations may be relaxed, impossible positions remain unreachable, and some original proposal
cells do not improve. The first prototype improved geometry while introducing unstable commanded
poses; the physical-following test rejected it, and it was reverted before this constrained solve.

## Same diagnostic, before and after

Harness and 18 cells are exactly the stationary Node/Havok proposal bench used for the baseline.
The table gives final request-to-command distance in millimetres. Primary/secondary carry the
same terminal; no cell deals damage.

| Terminal | Hand | Sweep before → after | Point before → after | Soft before → after |
|---|---|---:|---:|---:|
| blade | primary | 868.7 → 868.7 | 888.2 → 184.6 | 888.2 → 222.3 |
| blade | secondary | 1323.5 → 626.3 | 1198.1 → 208.7 | 647.2 → 265.5 |
| fist | primary | 266.8 → 266.8 | 92.5 → 34.8 | 92.4 → 78.0 |
| fist | secondary | 409.2 → 409.2 | 229.7 → 163.5 | 91.8 → 91.8 |
| mace | primary | 750.4 → 750.4 | 749.6 → 171.1 | 749.6 → 210.7 |
| mace | secondary | 1144.7 → 596.3 | 1013.4 → 198.4 | 531.4 → 203.5 |

Physical-to-commanded endpoint error is below 3.3 mm in all final cells, including the soft
primary sword and mace cells that previously had large following errors. This statement is about
the final hold, not the motion's transient peak. The new compact record is
`research/results/2026-09-26-effector-endpoint-fallback.json`; the old record remains intact.

These results support repairing the fallback, not enabling the channel or claiming improved
combat headroom. The earlier paired screen used the old fallback and remains historical evidence.
The proposal family still needs attainable geometry before another full-length search.

## Checks

- The original 45 command-null bouts are bit-identical with effector off and on but unwritten.
- Reachable task poses on both hands and all three terminals still pass the physical bench;
  speed, force, envelope limits, impossible targets and exact forks remain covered.
- New kinematic tests distinguish the carried endpoint from the palm, test monotonically
  improving steps within a restrictive envelope, and exercise an attempted joint-stop violation.
- Five mutations are caught: omitted terminal offset, ignored palm boundary, omitted production
  fallback, missing restored offset and ignored joint stops.
- All 1,076 tests, typecheck, production build and line-ending checks pass.
