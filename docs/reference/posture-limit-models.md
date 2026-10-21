# Limit models in the posture audit

How the posture audit reads joint stops under each engine's limit model, and the three development
witnesses and engine holds `research/posture-limits.mjs` compares. `rapier` keeps parent-axis
reactions; `rapier-coordinate` uses the transpose of the measured-angle rate Jacobian. The
witnesses are the installed starts of [posture hold](posture-hold.md).

## Stop directions

`postureStopDirections` computes generalized force directions from `ratesToRef`: on a static,
kinematically consistent pose, the virtual-work dual of the coordinate rate. A coordinate reaction
can load several actuator axes of one joint, so the corrected programme carries every muscle channel
and every stop, including channels that move no ground contact; they cannot be solved apart by
subtracting a diagonal stop torque.

- An independent world-coordinate reading agrees within 2.815e-8 over asymmetric two- and
  three-freedom poses; the fixture accepts 1e-7. The largest cross-axis term is 1.21218.
- A three-axis joint loaded `10 * [1, -0.3466876125, -0.1023245128]` N m at its upper stop is held
  with zero muscle effort and a -10 N m coordinate reaction. A diagonal stop leaves a muscle share
  of 3.466876 (muscles capped at 1 N m); off the stop the share is 10. Diagonal directions fail
  both focused tests.

Records carry engine, artifact revision and `limitModel`. In corrected records `stops.torque` is
the signed coordinate reaction; times a direction row it gives that actuator axis's part. It is
not the spatial moment's magnitude.

## Development witnesses and engine holds

Harness: Node 24.19 statics (core kinematics and dynamics, no world step), Warrior, empty hands,
no assistance, Rapier 0.21.0-auto-rpg.5 / adapter 6 on both profiles. Each row: development seed
0, 300 search evaluations, box friction. The hold places each profile's own witness 0.5 mm above
its support and runs 5 s at 120 Hz on the game's solver, with the audit's `side` velocity motors
capped at one anatomical peak on the statically loaded side; the gate is 20 mm largest segment
displacement. [Complete records](posture-limit-models.json).

| Posture | Reference static share | Corrected static share | Reference hold drift | Corrected hold drift |
|---|---:|---:|---:|---:|
| Fours | 0.122 | 0.122 | 50.6 mm | 49.3 mm |
| Half kneel, knee light | 0.200 | 0.232 | 1,643.8 mm | 146.3 mm |
| Squat, centre at 0.5 m | 0.644 | 0.644 | 1,356.3 mm | 1,324.7 mm |

All six witnesses are admissible and balanced below full strength; all six holds miss the gate.
Fours keeps hand and shank contacts on both; the corrected half kneel keeps feet and right shank
but leans the trunk on the left thigh. Engine, witness and motor side all change between columns,
so the drift difference is not the limit directions' alone.

```powershell
node research/posture-limits.mjs --workers 3 --out research/runs/posture-limits
$env:CORE_ENGINE = 'rapier-coordinate'
node research/core-posture.mjs --workers 3 --rows 'fours;half kneel, knee light' --variants built
```

The broad tables in [postures](postures.md) are parent-axis readings, not corrected-profile ones.
