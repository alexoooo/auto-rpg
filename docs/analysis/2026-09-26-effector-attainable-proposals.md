# Attainable default arm proposals, 2026-09-26

The first proposal family asked a straight hand for full radial reach and swept deeply inward.
The endpoint fallback repair reduced the misses but did not make those requests attainable.
This continuation changes only the experimental proposal recipe shared by the offline expert
and browser preview. The original expert and shipped channel defaults remain unchanged.

The default requested endpoint now extends from 0.65 to 0.75 of the hand's published reach.
The hand tilts upward by 0.6 radians relative to the endpoint line. A sweep starts 0.55 radians
outboard and finishes on the opponent mark; the soft proposal reverses that arc at speed 0.6 and
force 0.5. The point proposal keeps the same bearing. Duration remains 0.6 seconds, bounded by
the search horizon. This preserves a real sweep without asking its endpoint to cross deeply
inside the anatomical carry boundary.

The search also mutates the end bearing and hand tilt. It may still propose unreachable poses;
the actuator's envelope and stops remain authoritative and the expert evaluates the resulting
physical motion. Older recorded plans without these new fields retain a symmetric sweep and no
tilt; mutating one fills finite values for the newly searchable fields.

## Stationary endpoint check

Harness: `research/effector-proposal-bench.mjs`, exactly the idle, separated, supported human
fixture used for the earlier geometry diagnostic. After one second at rest, the proposal runs
for 0.6 seconds and holds its endpoint for 2.4 seconds. The table is final **physical tip to
requested endpoint** distance in millimetres:

| Terminal | Hand | Sweep | Point | Soft |
|---|---|---:|---:|---:|
| blade | primary | 0.71 | 0.28 | 0.39 |
| blade | secondary | 0.76 | 0.91 | 1.25 |
| fist | primary | 0.33 | 0.17 | 0.30 |
| fist | secondary | 5.63 | 4.34 | 0.57 |
| mace | primary | 0.83 | 0.24 | 0.20 |
| mace | secondary | 0.97 | 0.99 | 0.94 |

All 18 final requested/commanded and requested/physical distances are below the 10 mm gate.
No cell deals damage. The compact record is
`research/results/2026-09-26-effector-attainable-proposals.json`, with source hashes and endpoints.
The earlier records remain separate. A passing final hold does not establish tracking throughout
the sweep, cutting edge quality, useful attack speed or combat headroom. The next screen must
measure selection and outcomes; the flag stays off.

## Verification

The physical gate covers all three defaults on both sockets with blade, fist and mace. Existing
tests retain exact physical forks, warm phase, declaration/hand-loss checks and original-expert
proposal/RNG equality. New assertions check the upward hand tilt, mutation ranges and older-plan
compatibility. Four deliberate breaks are caught: removing tilt, restoring the deep inward end,
restoring full radial extension and removing tilt exploration. All 1,077 tests, typecheck,
production build and line-ending checks pass. All 45 original command-null bouts remain identical
with effector enabled but unwritten.
