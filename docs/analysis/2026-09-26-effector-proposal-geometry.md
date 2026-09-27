# Task proposals: requested geometry and motor following

Harness: `research/effector-proposal-bench.mjs`, Node/Havok bout runner, supported human bodies,
awake arm parts, idle opponent four metres away. One second at rest, a 0.6-second proposal,
then its final endpoint held for 2.4 seconds. Both arms carry the named terminal. There is no
damage in any of the 18 cells. This is a stationary diagnostic, not the paired combat screen.

The requested target, the arm's commanded endpoint, and the physical endpoint are different
measurements. Their final distances in millimetres are:

| Terminal | Hand | Proposal | Request to command | Command to physical |
|---|---|---|---:|---:|
| blade | primary | sweep | 868.7 | 1.9 |
| blade | primary | point | 888.2 | 2.5 |
| blade | primary | soft | 888.2 | 301.1 |
| blade | secondary | sweep | 1323.5 | 0.9 |
| blade | secondary | point | 1198.1 | 0.6 |
| blade | secondary | soft | 647.2 | 1.3 |
| fist | primary | sweep | 266.8 | 0.4 |
| fist | primary | point | 92.5 | 0.2 |
| fist | primary | soft | 92.4 | 1.0 |
| fist | secondary | sweep | 409.2 | 0.3 |
| fist | secondary | point | 229.7 | 0.2 |
| fist | secondary | soft | 91.8 | 0.2 |
| mace | primary | sweep | 750.4 | 2.0 |
| mace | primary | point | 749.6 | 51.9 |
| mace | primary | soft | 749.6 | 878.9 |
| mace | secondary | sweep | 1144.7 | 0.9 |
| mace | secondary | point | 1013.4 | 0.6 |
| mace | secondary | soft | 531.4 | 1.4 |

The blade's full-effort primary point follows its commanded geometry within 2.5 mm, while that
geometry misses the request by 888 mm. Turning force to zero leaves the request-to-command
distance within 0.02 mm but increases physical following error to 2.331 m. Stronger motors cannot
repair that request mapping. Some reduced-effort cells also have large physical following errors;
the table does not claim geometry is their only problem.

The source explains a limitation the original reachable-pose bench did not exercise:
`anatomicalChain.commandTarget` subtracts the terminal offset along the **requested orientation**
to obtain a palm point. `solve` clamps that palm point, then can relax orientation to keep the palm
reachable. After that relaxation, the carried terminal's endpoint moves with the changed hand
orientation. The current fallback prioritizes the palm, not the requested business end. The old
analysis's statement that position takes priority must be read with this limitation. These samples
do not prove each requested pose is attainable, nor that this is the only reason the sword expert
selected no targets. They establish a gap to fix before another long search.

Next: account for the carried endpoint when relaxing orientation, retaining joint stops and the
published palm envelope. Then compare reachable proposal families and repeat the bounded paired
screen before paying for full-length headroom. Do not tune motor ceilings from these numbers.

Reproduce with `node research/effector-proposal-bench.mjs`. The compact record, including endpoints
and source hashes, is `research/results/2026-09-26-effector-proposal-bench.json`. The diagnostic's
test separates geometry from physical response using the zero-effort control. Three mutations
are caught: using physical error as geometry, substituting commanded for actual, and ignoring
the force control. No shipped behavior changes in this diagnostic.
The full suite passes 1,074 tests; typecheck, production build and line-ending checks pass.
