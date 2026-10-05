# Limit models in the posture audit

The posture audit uses the selected engine's limit model. `rapier` retains parent-axis reactions;
`rapier-coordinate` uses the measured-angle rate Jacobian's transpose. A coordinate reaction
can load several actuator axes at one joint. The corrected programme therefore includes every
muscle channel and every available stop, including channels that move no ground contact.
Those channels cannot be solved independently by subtracting a diagonal stop torque.

`postureStopDirections` computes generalized force directions from `ratesToRef`. On static,
kinematically consistent poses this is the virtual-work dual of coordinate rate. The independent
world-coordinate reading agrees within 2.815e-8 over asymmetric human joint poses, including
both two- and three-freedom joints. The fixture accepts 1e-7 to accommodate the posed-node and
reduced-coordinate arithmetic difference; the largest cross-axis term is 1.21218.

A small programme with an otherwise unsupported three-axis joint receives an applied load
`10 * [1, -0.3466876125, -0.1023245128]` N m at its upper stop. The corrected model supports it
with zero muscle effort and a -10 N m coordinate reaction. A diagonal stop falsely leaves a
muscle share of 3.466876 when each muscle is capped at 1 N m. Moving inside the range requires
a share of 10 again. This is an algebraic equilibrium check, not a human strength estimate.
Replacing the corrected directions with diagonal directions fails both focused tests.

Audit records include engine name, artifact revision and `limitModel`. In corrected records,
`stops.torque` is the signed coordinate reaction; its contributions to actuator axes are that
value times the corresponding direction row. It is not the magnitude of the spatial moment.

## Development witnesses and engine holds

Harness: Node 24.19, statics using the core kinematics and dynamics, no world step, Warrior
with empty hands and no assistance. Both profiles use Rapier 0.21.0-auto-rpg.5 / adapter 6.
Each row starts from development seed 0 with 300 search evaluations and the existing box
friction model. These are feasible witnesses, not certified optima or a distributional claim.
[Complete records](posture-limit-models.json) retain angles, reactions, contacts and outcomes.

The physical hold places each profile's own witness on the engine, 0.5 mm above its support,
then runs five seconds at 120 Hz with the game solver. It uses the audit's `side` velocity
motors capped at one anatomical peak on the statically loaded side (the weaker side where
unloaded). It does not use the whole-body controller or demonstrate reaching that posture.
The unchanged hold gate is 20 mm maximum segment displacement from the installed pose.

| Posture | Reference static share | Corrected static share | Reference hold drift | Corrected hold drift |
|---|---:|---:|---:|---:|
| Fours | 0.122 | 0.122 | 50.6 mm | 49.3 mm |
| Half kneel, knee light | 0.200 | 0.232 | 1,643.8 mm | 146.3 mm |
| Squat, centre at 0.5 m | 0.644 | 0.644 | 1,356.3 mm | 1,324.7 mm |

All six searches find geometrically admissible, balanced witnesses below full muscle strength.
All six engine holds miss the displacement gate. Fours retains hand/shank contacts in both
profiles; the corrected half kneel retains feet/right-shank contacts but also leans the trunk
on the left thigh. A lower static share does not establish dynamic hold or a recovery route.
The comparison changes both the engine and its searched witness and motor-side selection;
the drift differences cannot be attributed to limit directions alone.

Reproduce the six searches and holds:

```powershell
node research/posture-limits.mjs --workers 3 --out research/runs/posture-limits
```

The wrapper's three rows, 300 evaluations, seed 0, five-second hold and 1x peak ceiling are
development measurement inputs. The broad posture audit also reports its engine profile:

```powershell
$env:CORE_ENGINE = 'rapier-coordinate'
node research/core-posture.mjs --workers 3 --rows 'fours;half kneel, knee light' --variants built
```

The broader legacy tables in [postures](postures.md) describe parent-axis limits and are not
corrected-profile evidence. The full regression run passes 806 tests, zero failures and two
existing TODOs; type checking and the production build pass. General recovery remains open.
