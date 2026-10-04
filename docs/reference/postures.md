# Postures

Which postures between knees and hands and standing the Warrior can hold still, by its muscles,
on the ground, with nothing moving; and where it cannot, which stop or muscle closes the way.
No controller is in it: the readings say what the body allows, not what a riser does. The
staged rise's route on from `fours` ([rising.md](rising.md#the-step)) and any change to the body
rest on them.

Body `workshop-fighter`, nothing in its hands, no assist (balance 0 %).

```
node research/core-posture.mjs --workers 22
```

The runner and its trials are `research/core-posture.mjs` and `research/core-posture-trials.mjs`;
the records and a side and a front drawing of every answer go to `research/runs/postures/`.
The run read here: 29 rows, 8 random seeds where a seed posture holds nothing, 1500 evaluations
a search, 2452 s on 22 workers.

## Three instruments

- **A, the statics.** Node, the joints' kinematics and the body's dynamics
  (`src/core/build/dynamics.ts`), no world step. A posture is written into the segments' nodes
  and put onto its contacts; its equilibrium is a linear programme over the ground's forces
  (each point pushes, does not pull, within friction), each freedom's torque within `s` times
  the peak of the side that pulls, and each stop's torque free where the freedom is pressed into
  its stop. The **share** is the least `s`: the least part of its strength that holds the
  posture, best case over the ground's forces. A search over the posture (pitch, roll where a
  row is not symmetric, the free freedoms as fractions of their ranges) finds the least share.
- **B, the stand hold.** Node, the core world (`src/core/world.ts`), Rapier, the arena's solids.
  The engine's body is put in A's posture 0.5 mm up and released, each joint's motor driving to
  its angle with a ceiling of `k` times the peak of the side A loads (**by side**), or by the
  muscle driver's own pose drive at `k` (**by the driver**); `k` is bisected for the least that
  keeps the body still for 3 s. On two solvers: the **reference** (480 Hz, 256 iterations of 4
  PGS passes) and the **game's** (120 Hz, the core's 16 of 2, `SOLVER` in
  `src/core/engine/rapier.ts`).
- **C, the handover.** The same world on the game's solver; the body put in a row's posture,
  then given to the game's own stance (`createBody`, `body.drive`, a stance goal on both feet at
  the standing height) for 6 s.

The evidence is one-sided. A held row is a witness: a posture and its forces, checkable alone.
A row not held is **none found**, which is not none.

## The rows

A row names what is on the ground (`touch`) and what of it bears load (`bear`). A waypoint has
them equal; a row with a support **light** touches it and puts no load on it: the moment that
support leaves the ground or lands. The contacts:

| contact | segment | its points on the ground |
|---|---|---|
| `sole` | foot | the box's four bottom corners |
| `ball` | foot | its two bottom front corners |
| `instep` | foot | its two top front corners |
| `knee` | thigh, shank | the capsule ends at the knee, a radius under each, the lower |
| `hand` | hand | the capsule's two ends, a radius under each, either |

| route | rows, in order |
|---|---|
| controls | `stand` (soles); `fours` (knees, insteps, hands) |
| S, sit back | `fours, hands light`; `kneel` (knees, insteps); `kneel, left knee light` |
| K, half kneel | `fours, left knee light`; `half kneel, hands` (right knee and ball, left sole, hands); `half kneel, hands light`; `half kneel`; `half kneel, knee light`; `half kneel, one leg` (the left sole alone, the right foot touching) |
| Q, squat | `kneel on toes` (knees, balls); `kneel on toes, knees light`; `squat on toes` (balls) and `squat` (soles), each at six heights of the centre of mass |
| B, bear | `fours on toes, knees light` (balls and hands bear); `hands and toes`; `hands and feet` (soles, hands); `hands and feet, hands light` |

**The variants** strip a stop to 3 rad (short of the half turn the angle is read within), as an
override passed to the search, never a change to the spec: the knee's flexion (`knee`), the
ankle's dorsiflexion (`ankle`), the hip's flexion (`hip`), the lumbar spine's flexion
(`lumbar`), and all four (`all`). A stripped answer's angles say how far the joint went. The
Warrior's stops, from the anatomical zero (`src/core/human/tables/range-of-motion.ts`, passive
ranges by goniometer, Moromizato 2016, but the lumbar spine's, Pearcy 1985): knee flexion 2.57
rad (147.1°), ankle dorsiflexion 0.39 (22.3°), hip flexion 2.21 (126.7°), hip abduction 0.56
(32.1°), lumbar flexion 0.89 (51°).

## The columns

- **verdict**: `held` (the declared points within 1 mm of the ground, no overlap over 5 mm,
  balanced, share at most 1); `unbalanced` (no ground forces balance the body: its centre is
  outside what bears); `too weak` (balanced, share over 1); `none found` (the search met no
  posture on the contacts without an overlap).
- **share**: the least `s`. **binds**: the freedoms at `s`. **stops bearing**: torque each stop
  carries, N m. **margin**: how far the centre of mass stands inside the bearing points'
  outline, m; negative, how far outside. A row held at zero margin is a balance, not a rest.
  **centre**: the centre of mass's height. **forces**: what each contact carries, N (the body
  weighs 775 N). **seeds agree**: of the seeds searched, how many found the least share within
  0.02 (1/1: the hand-written seed found it and no global search ran).
- **friction**: the box is the inscribed pyramid (0.354, the bearing solve's own); the cone is
  the rulebook's 0.5. A posture held under the box holds under the cone; a row that flips is
  marked.
- **a path**: the postures between two consecutive rows on one ground, interpolated, put back
  on the contacts and solved at 15 samples. **greatest share** and **where** (0 to 1 along it);
  **first lost**: where a sample first fails, its distance off the ground and the overlap and
  pair that refused it.
- **the stand hold**: least `k` that keeps every segment within twice the drift of a control
  held at ten times its strength (and at least the bar, 2 cm); `fell` if the control itself falls
  (drift over five bars), `none` if no `k` up to the most tried keeps it, each with its drift and
  its worst channel. **creep**: the control's drift. **touched**: segments on the ground at the
  end. **leant on**: pairs of the body's own segments the solver pushed apart, a support the
  statics do not credit.
- **the handover**: **stood** is not down for its last 2 s and more, and its centre within 5 cm of
  the height its stance asks; **up after**: when it was up; **fastest segment**: at the end.

## The readings

### As built (friction: the bearing solve's box)

| row | route | verdict | share | binds | stops bearing, N m | margin, m | centre, m | forces, N | seeds agree |
|---|---|---|---|---|---|---|---|---|---|
| stand | control | held | 0.02 | shoulder.left abduction, shoulder.left internal rotation, elbow.left flexion, wrist.left pronation, ... | ankle.left dorsiflexion -50; ankle.right dorsiflexion -50 | 0.09 | 0.99 | sole.left 387; sole.right 387 | 1/1 |
| fours | control | held | 0.04 | neck flexion, hip.left flexion, knee.left flexion, hip.right flexion, ... | thoracic flexion 6 | 0.38 | 0.38 | knee.left 211; knee.right 211; toes.left 31; toes.right 31; hand.left 145; hand.right 145 | 1/1 |
| fours, hands light | S | unbalanced | - | - | - | -0.02 | 0.34 | - | 9/9 |
| kneel | S | held | 0.03 | hip.left flexion, hip.left internal rotation, knee.left flexion, hip.right flexion, ... | - | 0.00 | 0.61 | knee.left 387; knee.right 387; toes.left 0; toes.right 0 | 1/1 |
| kneel, left knee light | S | held | 0.70 | lumbar flexion | hip.right internal rotation -58; knee.right flexion -37 | 0.00 | 0.40 | knee.right 740; toes.right 35 | 1/9 |
| fours, left knee light | K | held | 0.35 | thoracic lateral flexion right, thoracic rotation right, shoulder.right flexion, hip.right internal rotation | lumbar rotation right 21; ankle.right dorsiflexion -18 | 0.16 | 0.33 | knee.right 118; toes.right 237; hand.left 247; hand.right 173 | 1/1 |
| half kneel, hands | K | none found | 0.19 | thoracic flexion, thoracic rotation right, lumbar flexion, lumbar lateral flexion right, ... | thoracic flexion -33; thoracic rotation right -39; lumbar flexion -61; shoulder.left flexion -33; hip.left flexion -63; hip.left abduction -50; ankle.left dorsiflexion -31; ankle.left inversion -16; wrist.right flexion -8; hip.right abduction -26; hip.right internal rotation -56; knee.right flexion -40; ankle.right dorsiflexion -9 | 0.28 | 0.34 | knee.right 462; toes.right 0; sole.left 98; hand.left 105; hand.right 109 | 1/9 |
| half kneel, hands light | K | none found | - | - | - | -0.09 | 0.34 | - | 9/9 |
| half kneel | K | held | 0.07 | lumbar lateral flexion right, hip.left flexion, hip.left abduction, knee.left flexion, ... | ankle.left dorsiflexion -11 | 0.02 | 0.62 | knee.right 602; toes.right 4; sole.left 169 | 1/1 |
| half kneel, knee light | K | held | 0.15 | hip.left flexion, hip.left abduction, knee.left flexion, hip.right flexion | ankle.left dorsiflexion -40; knee.right flexion -182; ankle.right dorsiflexion -38 | 0.04 | 0.56 | toes.right 521; sole.left 254 | 1/1 |
| half kneel, one leg | K | unbalanced | - | - | - | -0.16 | 0.53 | - | 8/9 |
| kneel on toes | Q | held | 0.03 | shoulder.left abduction, elbow.left flexion, shoulder.right abduction, elbow.right flexion | knee.left flexion -75; knee.right flexion -87 | 0.14 | 0.51 | knee.left 185; knee.right 267; ball.left 154; ball.right 169 | 1/1 |
| kneel on toes, knees light | Q | unbalanced | - | - | - | -0.18 | 0.53 | - | 9/9 |
| squat on toes @ 0.45 m | Q | held | 0.47 | hip.left flexion, hip.left internal rotation, hip.right flexion, hip.right internal rotation | knee.left flexion -166; knee.right flexion -166; lumbar flexion 102 | 0.00 | 0.45 | ball.left 387; ball.right 387 | 1/1 |
| squat on toes @ 0.50 m | Q | held | 0.92 | lumbar flexion | knee.left flexion -166; knee.right flexion -166 | 0.03 | 0.50 | ball.left 387; ball.right 387 | 1/1 |
| squat on toes @ 0.55 m | Q | held | 0.13 | hip.left flexion, hip.left internal rotation, hip.right flexion, hip.right internal rotation | knee.left flexion -141; ankle.left inversion -7; knee.right flexion -141; ankle.right inversion -7; thoracic flexion -27; lumbar flexion -11 | 0.00 | 0.55 | ball.left 387; ball.right 387 | 1/1 |
| squat on toes @ 0.60 m | Q | held | 0.07 | shoulder.left abduction, shoulder.right abduction | knee.left flexion -135; ankle.left inversion -10; knee.right flexion -135; ankle.right inversion -10; thoracic flexion -13 | 0.02 | 0.60 | ball.left 387; ball.right 387 | 1/1 |
| squat on toes @ 0.70 m | Q | held | 0.28 | hip.left internal rotation, knee.left flexion, ankle.left inversion, hip.right internal rotation, ... | ankle.left dorsiflexion -54; ankle.right dorsiflexion -54 | 0.03 | 0.70 | ball.left 387; ball.right 387 | 1/1 |
| squat on toes @ 0.80 m | Q | held | 0.29 | hip.left internal rotation, knee.left flexion, hip.right internal rotation, knee.right flexion | - | 0.02 | 0.80 | ball.left 387; ball.right 387 | 1/1 |
| squat @ 0.45 m | Q | held | 0.70 | ankle.left dorsiflexion, ankle.left inversion, ankle.right dorsiflexion, ankle.right inversion | hip.left abduction -43; hip.left internal rotation -72; hip.right abduction -43; hip.right internal rotation -72; thoracic flexion -21 | 0.01 | 0.45 | sole.left 387; sole.right 387 | 1/1 |
| squat @ 0.50 m | Q | held | 0.64 | ankle.left dorsiflexion, ankle.left inversion, ankle.right dorsiflexion, ankle.right inversion | hip.left abduction -93; hip.left internal rotation -36; hip.right abduction -93; hip.right internal rotation -36; thoracic flexion -28 | 0.01 | 0.50 | sole.left 387; sole.right 387 | 1/1 |
| squat @ 0.55 m | Q | held | 0.86 | hip.left internal rotation, ankle.left dorsiflexion, hip.right internal rotation, ankle.right dorsiflexion | hip.left abduction -30; hip.right abduction -30; lumbar flexion -26 | 0.01 | 0.55 | sole.left 387; sole.right 387 | 1/1 |
| squat @ 0.60 m | Q | held | 0.45 | lumbar flexion, hip.left internal rotation, ankle.left dorsiflexion, ankle.left inversion, ... | hip.left abduction -141; hip.right abduction -141 | 0.04 | 0.60 | sole.left 387; sole.right 387 | 1/1 |
| squat @ 0.70 m | Q | held | 0.13 | hip.left flexion, knee.left flexion, ankle.left inversion, hip.right flexion, ... | hip.left abduction -152; hip.right abduction -152; thoracic flexion -21; lumbar flexion -66 | 0.10 | 0.70 | sole.left 387; sole.right 387 | 1/1 |
| squat @ 0.80 m | Q | held | 0.08 | lumbar flexion, knee.left flexion, ankle.left inversion, knee.right flexion, ... | hip.left abduction -177; ankle.left dorsiflexion -6; hip.right abduction -177; ankle.right dorsiflexion -6 | 0.12 | 0.80 | sole.left 387; sole.right 387 | 1/1 |
| fours on toes, knees light | B | held | 0.26 | lumbar flexion, shoulder.left abduction, shoulder.right abduction | elbow.left flexion -49; elbow.right flexion -49 | 0.38 | 0.22 | ball.left 106; ball.right 106; hand.left 282; hand.right 282 | 1/1 |
| hands and toes | B | held | 0.06 | lumbar flexion, hip.left internal rotation, hip.right internal rotation | thoracic flexion 9; ankle.left dorsiflexion -42; ankle.left inversion -16; ankle.right dorsiflexion -42; ankle.right inversion -16 | 0.46 | 0.51 | ball.left 197; ball.right 197; hand.left 190; hand.right 190 | 1/1 |
| hands and feet | B | held | 0.01 | lumbar flexion, elbow.left flexion, wrist.left radial deviation, wrist.left pronation, ... | wrist.left flexion 6; ankle.left dorsiflexion -9; ankle.left inversion -19; wrist.right flexion 6; ankle.right dorsiflexion -9; ankle.right inversion -19 | 0.54 | 0.50 | sole.left 182; sole.right 182; hand.left 205; hand.right 205 | 1/1 |
| hands and feet, hands light | B | held | 0.55 | lumbar flexion | hip.left abduction -88; hip.left internal rotation 299; knee.left flexion 174; ankle.left inversion -34; hip.right abduction -88; hip.right internal rotation 299; knee.right flexion 174; ankle.right inversion -34; thoracic flexion -15 | 0.00 | 0.53 | sole.left 387; sole.right 387 | 1/9 |

### A stop stripped (to 3 rad)

| row | variant | verdict | share | built share | the stripped channels, from their own zero, rad | binds |
|---|---|---|---|---|---|---|
| stand | ankle | held | 0.03 | 0.02 | ankle.left dorsiflexion 0.19; ankle.right dorsiflexion 0.19 | shoulder.left abduction, shoulder.left internal rotation, elbow.left flexion, knee.left flexion, ... |
| stand | all | held | 0.01 | 0.02 | lumbar flexion 0.29; hip.left flexion -0.31; knee.left flexion -0.04; ankle.left dorsiflexion 0.01; hip.right flexion -0.31; knee.right flexion -0.04; ankle.right dorsiflexion 0.01 | lumbar flexion |
| fours | ankle | held | 0.04 | 0.04 | ankle.left dorsiflexion 1.20; ankle.right dorsiflexion 1.20 | lumbar flexion, shoulder.left flexion, shoulder.left internal rotation, elbow.left flexion, ... |
| fours | all | held | 0.04 | 0.04 | lumbar flexion 0.03; hip.left flexion 1.67; knee.left flexion 2.14; ankle.left dorsiflexion 0.39; hip.right flexion 1.67; knee.right flexion 2.14; ankle.right dorsiflexion 0.39 | neck flexion, shoulder.left internal rotation, hip.left flexion, knee.left flexion, ... |
| fours, hands light | knee | held | 0.68 | - | knee.left flexion 2.81; knee.right flexion 2.81 | lumbar flexion |
| fours, hands light | ankle | unbalanced | - | - | ankle.left dorsiflexion 0.40; ankle.right dorsiflexion 0.40 | - |
| fours, hands light | hip | unbalanced | - | - | hip.left flexion 2.07; hip.right flexion 2.07 | - |
| fours, hands light | lumbar | unbalanced | - | - | lumbar flexion 0.09 | - |
| fours, hands light | all | held | 0.67 | - | lumbar flexion -0.28; hip.left flexion 2.09; knee.left flexion 2.79; ankle.left dorsiflexion 0.40; hip.right flexion 2.09; knee.right flexion 2.79; ankle.right dorsiflexion 0.40 | lumbar flexion |
| kneel | ankle | held | 0.03 | 0.03 | ankle.left dorsiflexion 0.39; ankle.right dorsiflexion 0.39 | hip.left flexion, hip.left internal rotation, knee.left flexion, hip.right flexion, ... |
| kneel | all | held | 0.02 | 0.03 | lumbar flexion 0.15; hip.left flexion -0.12; knee.left flexion 1.98; ankle.left dorsiflexion 0.40; hip.right flexion -0.12; knee.right flexion 1.98; ankle.right dorsiflexion 0.40 | hip.left flexion, hip.left abduction, knee.left flexion, hip.right flexion, ... |
| kneel, left knee light | knee | held | 0.35 | 0.70 | knee.left flexion 1.45; knee.right flexion 2.55 | lumbar flexion |
| kneel, left knee light | ankle | held | 0.23 | 0.70 | ankle.left dorsiflexion 0.38; ankle.right dorsiflexion 0.36 | lumbar flexion |
| kneel, left knee light | all | held | 0.35 | 0.70 | lumbar flexion -0.17; hip.left flexion 0.21; knee.left flexion 1.46; ankle.left dorsiflexion 0.81; hip.right flexion 1.29; knee.right flexion 2.52; ankle.right dorsiflexion 0.09 | lumbar rotation right |
| fours, left knee light | ankle | held | 0.28 | 0.35 | ankle.left dorsiflexion 1.63; ankle.right dorsiflexion 0.60 | wrist.left radial deviation, shoulder.right internal rotation, wrist.right flexion, hip.right flexion |
| fours, left knee light | all | held | 0.32 | 0.35 | lumbar flexion 0.59; hip.left flexion 1.01; knee.left flexion 0.96; ankle.left dorsiflexion 1.61; hip.right flexion 1.14; knee.right flexion 1.06; ankle.right dorsiflexion 1.64 | thoracic rotation right, shoulder.left flexion, ankle.right inversion |
| half kneel, hands | knee | held | 0.08 | 0.19 | knee.left flexion 1.86; knee.right flexion 2.84 | neck flexion, lumbar lateral flexion right, lumbar rotation right, shoulder.left flexion, ... |
| half kneel, hands | ankle | held | 0.06 | 0.19 | ankle.left dorsiflexion 1.55; ankle.right dorsiflexion 0.25 | neck flexion, shoulder.left flexion, ankle.left dorsiflexion, shoulder.right flexion, ... |
| half kneel, hands | hip | held | 0.10 | 0.19 | hip.left flexion 1.36; hip.right flexion 1.11 | neck flexion, lumbar rotation right, shoulder.left flexion, shoulder.left internal rotation, ... |
| half kneel, hands | lumbar | held | 0.10 | 0.19 | lumbar flexion 0.03 | neck flexion, shoulder.right flexion, shoulder.right internal rotation, elbow.right flexion |
| half kneel, hands | all | held | 0.07 | 0.19 | lumbar flexion -0.03; hip.left flexion 1.76; knee.left flexion 2.41; ankle.left dorsiflexion 1.54; hip.right flexion 1.85; knee.right flexion 2.80; ankle.right dorsiflexion 0.28 | thoracic rotation right, lumbar flexion, lumbar lateral flexion right, shoulder.left flexion, ... |
| half kneel, hands light | knee | held | 0.68 | - | knee.left flexion 1.83; knee.right flexion 2.79 | lumbar flexion |
| half kneel, hands light | ankle | too weak | 1.05 | - | ankle.left dorsiflexion 1.55; ankle.right dorsiflexion -0.67 | hip.right internal rotation |
| half kneel, hands light | hip | unbalanced | - | - | hip.left flexion 1.70; hip.right flexion 1.26 | - |
| half kneel, hands light | lumbar | unbalanced | - | - | lumbar flexion 0.20 | - |
| half kneel, hands light | all | held | 0.68 | - | lumbar flexion -0.20; hip.left flexion 1.84; knee.left flexion 2.47; ankle.left dorsiflexion 1.55; hip.right flexion 2.00; knee.right flexion 2.74; ankle.right dorsiflexion 1.38 | lumbar flexion, hip.right flexion |
| half kneel | ankle | held | 0.07 | 0.07 | ankle.left dorsiflexion 0.39; ankle.right dorsiflexion 0.39 | lumbar lateral flexion right, hip.left abduction, knee.left flexion, ankle.left dorsiflexion, ... |
| half kneel | all | held | 0.07 | 0.07 | lumbar flexion -0.06; hip.left flexion 1.65; knee.left flexion 1.84; ankle.left dorsiflexion 0.39; hip.right flexion 0.24; knee.right flexion 2.04; ankle.right dorsiflexion 0.39 | lumbar lateral flexion right, hip.left abduction, knee.left flexion, ankle.left dorsiflexion, ... |
| half kneel, knee light | knee | held | 0.33 | 0.15 | knee.left flexion 1.97; knee.right flexion 1.94 | lumbar lateral flexion right, hip.left flexion, knee.left flexion, knee.right flexion |
| half kneel, knee light | ankle | held | 0.17 | 0.15 | ankle.left dorsiflexion 0.28; ankle.right dorsiflexion 0.77 | hip.left flexion, knee.left flexion, ankle.left dorsiflexion, hip.right flexion, ... |
| half kneel, knee light | all | held | 0.30 | 0.15 | lumbar flexion 0.13; hip.left flexion 1.58; knee.left flexion 2.14; ankle.left dorsiflexion 0.62; hip.right flexion 0.33; knee.right flexion 2.04; ankle.right dorsiflexion 1.40 | hip.left flexion, knee.left flexion, hip.right internal rotation, ankle.right dorsiflexion |
| half kneel, one leg | knee | unbalanced | - | - | knee.left flexion 2.07; knee.right flexion 2.57 | - |
| half kneel, one leg | ankle | held | 0.24 | - | ankle.left dorsiflexion 0.98; ankle.right dorsiflexion 1.40 | lumbar lateral flexion right, hip.left abduction, shoulder.right internal rotation |
| half kneel, one leg | hip | unbalanced | - | - | hip.left flexion 1.88; hip.right flexion 0.88 | - |
| half kneel, one leg | lumbar | unbalanced | - | - | lumbar flexion 0.41 | - |
| half kneel, one leg | all | held | 0.72 | - | lumbar flexion 0.44; hip.left flexion 1.64; knee.left flexion 2.57; ankle.left dorsiflexion 1.11; hip.right flexion 0.84; knee.right flexion 2.65; ankle.right dorsiflexion 0.38 | knee.left flexion, ankle.left dorsiflexion, ankle.left inversion |
| kneel on toes | knee | held | 0.03 | 0.03 | knee.left flexion 2.02; knee.right flexion 2.02 | hip.left abduction, knee.left flexion, ankle.left dorsiflexion, hip.right abduction, ... |
| kneel on toes | ankle | held | 0.03 | 0.03 | ankle.left dorsiflexion 0.40; ankle.right dorsiflexion 0.40 | hip.left flexion, hip.left internal rotation, hip.right flexion, hip.right internal rotation |
| kneel on toes | all | held | 0.03 | 0.03 | lumbar flexion -0.04; hip.left flexion 0.09; knee.left flexion 2.06; ankle.left dorsiflexion 0.74; hip.right flexion 0.09; knee.right flexion 2.06; ankle.right dorsiflexion 0.74 | hip.left abduction, knee.left flexion, hip.right abduction, knee.right flexion |
| kneel on toes, knees light | knee | unbalanced | - | - | knee.left flexion 2.71; knee.right flexion 2.71 | - |
| kneel on toes, knees light | ankle | held | 0.22 | - | ankle.left dorsiflexion 1.15; ankle.right dorsiflexion 1.15 | hip.left abduction, ankle.left dorsiflexion, hip.right abduction, ankle.right dorsiflexion |
| kneel on toes, knees light | hip | unbalanced | - | - | hip.left flexion -0.27; hip.right flexion -0.27 | - |
| kneel on toes, knees light | lumbar | unbalanced | - | - | lumbar flexion 0.62 | - |
| kneel on toes, knees light | all | held | 0.35 | - | lumbar flexion 0.01; hip.left flexion 0.80; knee.left flexion 2.75; ankle.left dorsiflexion 1.24; hip.right flexion 0.80; knee.right flexion 2.75; ankle.right dorsiflexion 1.24 | knee.left flexion, ankle.left dorsiflexion, knee.right flexion, ankle.right dorsiflexion |
| squat on toes @ 0.45 m | knee | held | 0.59 | 0.47 | knee.left flexion 2.59; knee.right flexion 2.59 | hip.left internal rotation, knee.left flexion, ankle.left dorsiflexion, hip.right internal rotation, ... |
| squat on toes @ 0.45 m | lumbar | held | 0.39 | 0.47 | lumbar flexion -0.28 | hip.left flexion, hip.left internal rotation, hip.right flexion, hip.right internal rotation |
| squat on toes @ 0.45 m | all | held | 0.37 | 0.47 | lumbar flexion -0.16; hip.left flexion 0.99; knee.left flexion 2.78; ankle.left dorsiflexion 1.28; hip.right flexion 0.99; knee.right flexion 2.78; ankle.right dorsiflexion 1.28 | knee.left flexion, ankle.left dorsiflexion, ankle.left inversion, knee.right flexion, ... |
| squat on toes @ 0.50 m | knee | held | 0.26 | 0.92 | knee.left flexion 2.80; knee.right flexion 2.80 | lumbar flexion, knee.left flexion, ankle.left inversion, knee.right flexion, ... |
| squat on toes @ 0.50 m | all | held | 0.32 | 0.92 | lumbar flexion 0.19; hip.left flexion 1.73; knee.left flexion 2.82; ankle.left dorsiflexion 0.31; hip.right flexion 1.73; knee.right flexion 2.82; ankle.right dorsiflexion 0.31 | knee.left flexion, ankle.left dorsiflexion, knee.right flexion, ankle.right dorsiflexion |
| squat on toes @ 0.55 m | knee | held | 0.26 | 0.13 | knee.left flexion 2.71; knee.right flexion 2.71 | lumbar flexion, knee.left flexion, ankle.left dorsiflexion, knee.right flexion, ... |
| squat on toes @ 0.55 m | lumbar | held | 0.10 | 0.13 | lumbar flexion 1.42 | shoulder.left flexion, shoulder.right flexion |
| squat on toes @ 0.55 m | all | held | 0.27 | 0.13 | lumbar flexion 0.19; hip.left flexion 1.71; knee.left flexion 2.76; ankle.left dorsiflexion 0.01; hip.right flexion 1.71; knee.right flexion 2.76; ankle.right dorsiflexion 0.01 | knee.left flexion, ankle.left inversion, knee.right flexion, ankle.right inversion |
| squat on toes @ 0.60 m | knee | held | 0.25 | 0.07 | knee.left flexion 2.54; knee.right flexion 2.54 | lumbar flexion, knee.left flexion, knee.right flexion |
| squat on toes @ 0.60 m | all | held | 0.25 | 0.07 | lumbar flexion 0.28; hip.left flexion 1.45; knee.left flexion 2.53; ankle.left dorsiflexion -0.16; hip.right flexion 1.45; knee.right flexion 2.53; ankle.right dorsiflexion -0.16 | lumbar flexion, knee.left flexion, ankle.left dorsiflexion, knee.right flexion, ... |
| squat on toes @ 0.70 m | ankle | held | 0.23 | 0.28 | ankle.left dorsiflexion -0.22; ankle.right dorsiflexion -0.22 | lumbar flexion, knee.left flexion, ankle.left dorsiflexion, knee.right flexion, ... |
| squat on toes @ 0.70 m | all | held | 0.26 | 0.28 | lumbar flexion -0.06; hip.left flexion 1.68; knee.left flexion 2.34; ankle.left dorsiflexion -0.01; hip.right flexion 1.68; knee.right flexion 2.34; ankle.right dorsiflexion -0.01 | hip.left internal rotation, knee.left flexion, ankle.left dorsiflexion, ankle.left inversion, ... |
| squat @ 0.55 m | lumbar | held | 0.25 | 0.86 | lumbar flexion 1.64 | ankle.left dorsiflexion, ankle.left inversion, ankle.right dorsiflexion, ankle.right inversion |
| squat @ 0.55 m | all | held | 0.22 | 0.86 | lumbar flexion 0.27; hip.left flexion 1.19; knee.left flexion 2.19; ankle.left dorsiflexion 0.89; hip.right flexion 1.19; knee.right flexion 2.19; ankle.right dorsiflexion 0.89 | lumbar flexion, knee.left flexion, knee.right flexion |
| squat @ 0.70 m | lumbar | held | 0.31 | 0.13 | lumbar flexion 0.28 | lumbar flexion, hip.left internal rotation, ankle.left dorsiflexion, ankle.left inversion, ... |
| squat @ 0.70 m | all | held | 0.16 | 0.13 | lumbar flexion 0.18; hip.left flexion 1.16; knee.left flexion 1.82; ankle.left dorsiflexion 0.65; hip.right flexion 1.16; knee.right flexion 1.82; ankle.right dorsiflexion 0.65 | lumbar flexion, knee.left flexion, ankle.left dorsiflexion, knee.right flexion, ... |
| squat @ 0.80 m | ankle | held | 0.07 | 0.08 | ankle.left dorsiflexion 0.41; ankle.right dorsiflexion 0.41 | lumbar flexion, knee.left flexion, ankle.left dorsiflexion, knee.right flexion, ... |
| squat @ 0.80 m | all | held | 0.08 | 0.08 | lumbar flexion -0.03; hip.left flexion 0.99; knee.left flexion 1.36; ankle.left dorsiflexion 0.39; hip.right flexion 0.99; knee.right flexion 1.36; ankle.right dorsiflexion 0.39 | lumbar flexion, knee.left flexion, ankle.left inversion, knee.right flexion, ... |
| fours on toes, knees light | ankle | held | 0.16 | 0.26 | ankle.left dorsiflexion 1.37; ankle.right dorsiflexion 1.37 | lumbar flexion, shoulder.left flexion, elbow.left flexion, wrist.left pronation, ... |
| fours on toes, knees light | all | held | 0.17 | 0.26 | lumbar flexion 0.70; hip.left flexion 1.20; knee.left flexion 1.38; ankle.left dorsiflexion 1.39; hip.right flexion 1.20; knee.right flexion 1.38; ankle.right dorsiflexion 1.39 | wrist.left pronation, hip.left internal rotation, ankle.left dorsiflexion, ankle.left inversion, ... |
| hands and toes | ankle | held | 0.11 | 0.06 | ankle.left dorsiflexion 0.04; ankle.right dorsiflexion 0.04 | lumbar flexion, shoulder.left flexion, ankle.left dorsiflexion, shoulder.right flexion, ... |
| hands and toes | all | held | 0.05 | 0.06 | lumbar flexion 1.10; hip.left flexion 0.74; knee.left flexion 0.26; ankle.left dorsiflexion -0.45; hip.right flexion 0.74; knee.right flexion 0.26; ankle.right dorsiflexion -0.45 | shoulder.left abduction, shoulder.left internal rotation, wrist.left radial deviation, hip.left flexion, ... |
| hands and feet | ankle | held | 0.01 | 0.01 | ankle.left dorsiflexion 0.93; ankle.right dorsiflexion 0.93 | neck flexion, lumbar flexion, hip.left flexion, hip.right flexion |
| hands and feet | all | held | 0.04 | 0.01 | lumbar flexion 0.80; hip.left flexion 0.97; knee.left flexion 0.02; ankle.left dorsiflexion 0.39; hip.right flexion 0.97; knee.right flexion 0.02; ankle.right dorsiflexion 0.39 | lumbar flexion, hip.left internal rotation, ankle.left dorsiflexion, hip.right internal rotation, ... |
| hands and feet, hands light | knee | held | 0.55 | 0.55 | knee.left flexion -0.04; knee.right flexion -0.04 | lumbar flexion |
| hands and feet, hands light | all | held | 0.55 | 0.55 | lumbar flexion 0.56; hip.left flexion 1.54; knee.left flexion -0.04; ankle.left dorsiflexion -0.03; hip.right flexion 1.54; knee.right flexion -0.04; ankle.right dorsiflexion -0.03 | lumbar flexion |

### Paths on one ground (the two ends' answers as built, 15 postures between)

| from | to | verdict | greatest share | where | first lost: where, off m, overlap m |
|---|---|---|---|---|---|
| fours | fours, left knee light | lost | 0.32 | 0.38 | 0.25, 0, 0.0056 (thigh.left, thigh.right) |
| kneel | kneel, left knee light | lost | - | 0.06 | 0.06, 0, 0.0097 (thigh.left, thigh.right) |
| half kneel | half kneel, knee light | held | 0.31 | 0.81 | - |
| squat on toes @ 0.45 m | squat on toes @ 0.50 m | lost | 1.07 | 0.31 | 0.94, 0.0002, 0.0051 (foot.left, foot.right) |
| squat on toes @ 0.50 m | squat on toes @ 0.55 m | lost | 0.92 | 0.00 | 0.06, 0, 0.0076 (foot.left, foot.right) |
| squat on toes @ 0.55 m | squat on toes @ 0.60 m | lost | - | 0.06 | 0.38, 0, 0.0174 (hand.left, thigh.left) |
| squat on toes @ 0.60 m | squat on toes @ 0.70 m | unbalanced | - | 0.31 | - |
| squat on toes @ 0.70 m | squat on toes @ 0.80 m | held | 0.32 | 0.13 | - |
| squat @ 0.45 m | squat @ 0.50 m | held | 0.70 | 0.00 | - |
| squat @ 0.50 m | squat @ 0.55 m | held | 0.86 | 1.00 | - |
| squat @ 0.55 m | squat @ 0.60 m | lost | 0.86 | 0.00 | 0.06, 0, 0.0055 (middleTrunk, thigh.right) |
| squat @ 0.60 m | squat @ 0.70 m | lost | 0.50 | 0.88 | 0.25, 0, 0.0574 (hand.left, shank.left) |
| squat @ 0.70 m | squat @ 0.80 m | lost | 0.50 | 0.06 | 0.31, 0, 0.0055 (lowerTrunk, hand.right) |
| hands and feet | hands and feet, hands light | lost | - | 0.50 | 0.38, 0.0002, 0.0102 (middleTrunk, thigh.left) |

### Friction: the box against the cone

| row | box | cone | flips |
|---|---|---|---|
| stand | held 0.02 | held 0.02 |  |
| fours | held 0.04 | held 0.03 |  |
| fours, hands light | unbalanced - | unbalanced - |  |
| kneel | held 0.03 | held 0.03 |  |
| kneel, left knee light | held 0.70 | held 0.36 |  |
| fours, left knee light | held 0.35 | held 0.34 |  |
| half kneel, hands | none found 0.19 | held 0.10 | yes |
| half kneel, hands light | none found - | unbalanced - |  |
| half kneel | held 0.07 | held 0.07 |  |
| half kneel, knee light | held 0.15 | held 0.14 |  |
| half kneel, one leg | unbalanced - | unbalanced - |  |
| kneel on toes | held 0.03 | held 0.03 |  |
| kneel on toes, knees light | unbalanced - | unbalanced - |  |
| squat on toes @ 0.45 m | held 0.47 | held 0.45 |  |
| squat on toes @ 0.50 m | held 0.92 | held 0.44 |  |
| squat on toes @ 0.55 m | held 0.13 | held 0.12 |  |
| squat on toes @ 0.60 m | held 0.07 | held 0.06 |  |
| squat on toes @ 0.70 m | held 0.28 | held 0.21 |  |
| squat on toes @ 0.80 m | held 0.29 | held 0.29 |  |
| squat @ 0.45 m | held 0.70 | held 0.45 |  |
| squat @ 0.50 m | held 0.64 | held 0.43 |  |
| squat @ 0.55 m | held 0.86 | held 0.52 |  |
| squat @ 0.60 m | held 0.45 | held 0.45 |  |
| squat @ 0.70 m | held 0.13 | held 0.13 |  |
| squat @ 0.80 m | held 0.08 | held 0.06 |  |
| fours on toes, knees light | held 0.26 | held 0.16 |  |
| hands and toes | held 0.06 | held 0.01 |  |
| hands and feet | held 0.01 | held 0.00 |  |
| hands and feet, hands light | held 0.55 | held 0.55 |  |

### The stand hold (Node, core world (src/core/world.ts), Rapier, at the solver named)

Least `k` that keeps each segment within twice the strong control's drift (and at least the bar) of where it was put; `none` if even the most tried does not, `fell` if the strong control itself falls, each with its drift and worst channel.

On the reference solver (480 Hz, 256 iterations of 4 passes) and the game's (120 Hz, the core's iterations).

| row | variant | statics share | by side, reference | by the driver, reference | by side, game | creep at 10x, m (reference) | touched | leant on |
|---|---|---|---|---|---|---|---|---|
| stand | built | 0.02 | 0.05 | 0.04 | 0.04 | 0.0533 | foot.left, foot.right | hand.left on upperTrunk, hand.right on upperTrunk, middleTrunk on upperArm.left, middleTrunk on upperArm.right |
| fours | built | 0.04 | 0.05 | 0.04 | 0.05 | 0.0018 | foot.left, foot.right, hand.left, hand.right, shank.left, shank.right | thigh.left on thigh.right |
| kneel | built | 0.03 | fell (1.6154 m, wrist.left flexion) | fell (1.6154 m, wrist.left flexion) | 0.09 | 1.6154 | hand.left, hand.right, thigh.left, thigh.right | - |
| kneel, left knee light | built | 0.70 | fell (1.0335 m, elbow.left flexion) | fell (1.0335 m, elbow.left flexion) | fell (0.9689 m, elbow.left flexion) | 1.0335 | hand.left, head, thigh.right | - |
| fours, left knee light | built | 0.35 | 0.20 | 0.20 | 0.21 | 0.0022 | hand.left, hand.right, shank.left, shank.right | middleTrunk on thigh.left |
| half kneel | built | 0.07 | 0.69 | 0.43 | fell (0.1316 m, knee.right flexion) | 0.0136 | foot.left, shank.right | - |
| half kneel, knee light | built | 0.15 | 0.15 | 0.14 | 0.15 | 0.0071 | foot.left, foot.right, shank.right | - |
| kneel on toes | built | 0.03 | 0.04 | 0.04 | 0.04 | 0.0027 | foot.left, foot.right, shank.left, shank.right | middleTrunk on upperArm.left, middleTrunk on upperArm.right |
| squat on toes @ 0.45 m | built | 0.47 | 0.50 | 0.49 | fell (0.1565 m, ankle.left dorsiflexion) | 0.0062 | foot.left, foot.right | foot.left on foot.right, thigh.left on thigh.right |
| squat on toes @ 0.50 m | built | 0.92 | 0.95 | 0.94 | fell (0.2642 m, ankle.left inversion) | 0.0495 | foot.left, foot.right | foot.left on foot.right |
| squat on toes @ 0.55 m | built | 0.13 | fell (1.7468 m, wrist.left flexion) | fell (1.7468 m, wrist.left flexion) | fell (0.1405 m, ankle.left dorsiflexion) | 1.7468 | hand.left, hand.right, head, shank.left, shank.right, thigh.left, thigh.right | - |
| squat on toes @ 0.60 m | built | 0.07 | fell (1.5884 m, neck flexion) | fell (1.5884 m, neck flexion) | fell (1.5924 m, shoulder.left flexion) | 1.5884 | head, shank.left, shank.right, thigh.left, thigh.right | - |
| squat on toes @ 0.70 m | built | 0.28 | fell (1.6846 m, neck flexion) | fell (1.6846 m, neck flexion) | fell (1.6821 m, neck flexion) | 1.6846 | head, lowerTrunk | - |
| squat on toes @ 0.80 m | built | 0.29 | fell (1.8465 m, neck flexion) | fell (1.8465 m, neck flexion) | fell (1.9547 m, elbow.right flexion) | 1.8465 | hand.left, hand.right, head | middleTrunk on upperArm.left, middleTrunk on upperArm.right |
| squat @ 0.45 m | built | 0.70 | fell (0.8767 m, lumbar flexion) | fell (0.8767 m, lumbar flexion) | fell (0.9127 m, lumbar flexion) | 0.8767 | foot.left, foot.right, lowerTrunk, middleTrunk | - |
| squat @ 0.50 m | built | 0.64 | fell (1.3526 m, hip.left internal rotation) | fell (1.3526 m, hip.left internal rotation) | fell (1.3748 m, shoulder.left flexion) | 1.3526 | lowerTrunk, middleTrunk | thigh.left on thigh.right |
| squat @ 0.55 m | built | 0.86 | none (0.0977 m, lumbar flexion) | none (0.1645 m, lumbar flexion) | fell (1.7505 m, thoracic flexion) | 0.0466 | foot.left, foot.right | middleTrunk on thigh.left, middleTrunk on thigh.right |
| squat @ 0.60 m | built | 0.45 | fell (0.4661 m, thoracic flexion) | fell (0.4661 m, thoracic flexion) | fell (1.462 m, neck flexion) | 0.4661 | foot.left, foot.right | - |
| squat @ 0.70 m | built | 0.13 | 0.13 | 0.13 | fell (1.7802 m, wrist.right pronation) | 0.0162 | foot.left, foot.right | hand.left on hand.right, middleTrunk on thigh.left, middleTrunk on thigh.right |
| squat @ 0.80 m | built | 0.08 | 0.11 | 0.11 | fell (1.9216 m, shoulder.left flexion) | 0.0176 | foot.left, foot.right | middleTrunk on upperArm.left, middleTrunk on upperArm.right |
| fours on toes, knees light | built | 0.26 | 0.08 | 0.09 | 0.05 | 0.0011 | hand.left, hand.right, head, shank.left, shank.right | - |
| hands and toes | built | 0.06 | 0.30 | 0.28 | 0.22 | 0.0073 | foot.left, foot.right, hand.left, hand.right | - |
| hands and feet | built | 0.01 | 0.14 | 0.14 | 0.08 | 0.0028 | foot.left, foot.right, hand.left, hand.right | - |
| hands and feet, hands light | built | 0.55 | 0.27 | 0.35 | fell (0.3523 m, elbow.right flexion) | 0.0138 | foot.left, foot.right, hand.left, hand.right | middleTrunk on thigh.left, middleTrunk on thigh.right |
| fours, hands light | knee | 0.68 | 0.01 | - | - | 0.0019 | foot.left, foot.right, hand.left, hand.right, thigh.left, thigh.right | lowerTrunk on shank.left, lowerTrunk on shank.right, middleTrunk on thigh.left, middleTrunk on thigh.right |
| kneel, left knee light | knee | 0.35 | 0.37 | - | - | 0.0053 | foot.right, shank.left, shank.right | - |
| half kneel, hands | knee | 0.08 | 0.05 | - | - | 0.0009 | foot.left, foot.right, hand.left, hand.right, thigh.right | foot.right on lowerTrunk, middleTrunk on thigh.left, middleTrunk on thigh.right |
| half kneel, hands light | knee | 0.68 | 0.12 | - | - | 0.0017 | foot.left, foot.right, hand.right, shank.right, thigh.right | middleTrunk on thigh.left, middleTrunk on thigh.right |
| half kneel, knee light | knee | 0.33 | 0.36 | - | - | 0.0164 | foot.left, foot.right, shank.right | - |
| kneel on toes | knee | 0.03 | fell (1.4626 m, shoulder.left abduction) | - | - | 1.4626 | lowerTrunk, upperTrunk | middleTrunk on upperArm.left, middleTrunk on upperArm.right |
| squat on toes @ 0.45 m | knee | 0.59 | 0.61 | - | - | 0.024 | foot.left, foot.right | foot.left on foot.right, thigh.left on thigh.right |
| squat on toes @ 0.50 m | knee | 0.26 | fell (0.4345 m, knee.left flexion) | - | - | 0.4345 | foot.left, foot.right | - |
| squat on toes @ 0.55 m | knee | 0.26 | 0.18 | - | - | 0.0098 | foot.left, foot.right | foot.left on thigh.left, foot.right on thigh.right, middleTrunk on thigh.left, middleTrunk on thigh.right |
| squat on toes @ 0.60 m | knee | 0.25 | fell (0.4181 m, ankle.left inversion) | - | - | 0.4181 | foot.left, foot.right | - |
| hands and feet, hands light | knee | 0.55 | 0.28 | - | - | 0.0098 | foot.left, foot.right, hand.left, hand.right | middleTrunk on thigh.left, middleTrunk on thigh.right |
| stand | ankle | 0.03 | 0.06 | - | - | 0.0218 | foot.left, foot.right | middleTrunk on upperArm.left, middleTrunk on upperArm.right |
| fours | ankle | 0.04 | 0.05 | - | - | 0.002 | hand.left, hand.right, shank.left, shank.right | - |
| kneel | ankle | 0.03 | fell (1.6156 m, wrist.left flexion) | - | - | 1.6156 | hand.left, hand.right, thigh.left, thigh.right | - |
| kneel, left knee light | ankle | 0.23 | 0.25 | - | - | 0.0077 | foot.right, shank.left, shank.right | - |
| fours, left knee light | ankle | 0.28 | 0.18 | - | - | 0.0021 | foot.left, forearm.left, forearm.right, hand.left, shank.left, shank.right | - |
| half kneel, hands | ankle | 0.06 | 0.07 | - | - | 0.0028 | foot.left, foot.right, hand.left, hand.right, shank.left, shank.right | - |
| half kneel | ankle | 0.07 | 0.38 | - | - | 0.0135 | foot.left, shank.right | - |
| half kneel, knee light | ankle | 0.17 | 0.17 | - | - | 0.0076 | foot.left, foot.right, shank.right | - |
| half kneel, one leg | ankle | 0.24 | 0.34 | - | - | 0.0624 | foot.left, foot.right | - |
| kneel on toes | ankle | 0.03 | 0.04 | - | - | 0.0018 | foot.left, foot.right, shank.left, shank.right | hand.right on thigh.right, middleTrunk on upperArm.left, middleTrunk on upperArm.right |
| kneel on toes, knees light | ankle | 0.22 | 0.23 | - | - | 0.0298 | foot.left, foot.right, shank.left, shank.right | - |
| squat on toes @ 0.70 m | ankle | 0.23 | fell (1.6224 m, lumbar flexion) | - | - | 1.6224 | foot.left, foot.right, head, lowerTrunk, upperTrunk | - |
| squat @ 0.80 m | ankle | 0.07 | 0.10 | - | - | 0.0098 | foot.left, foot.right | - |
| fours on toes, knees light | ankle | 0.16 | 0.11 | - | - | 0.0031 | hand.left, hand.right, shank.left, shank.right | - |
| hands and toes | ankle | 0.11 | none (0.0214 m, lumbar flexion) | - | - | 0.0039 | foot.left, foot.right, hand.left, hand.right | middleTrunk on thigh.left, middleTrunk on thigh.right |
| hands and feet | ankle | 0.01 | 0.04 | - | - | 0.0038 | foot.left, foot.right, hand.left, hand.right | - |
| half kneel, hands | hip | 0.10 | 0.35 | - | - | 0.0026 | foot.left, foot.right, hand.left, hand.right, shank.right | middleTrunk on thigh.right |
| half kneel, hands | lumbar | 0.10 | 0.11 | - | - | 0.0023 | foot.left, foot.right, hand.left, hand.right, shank.right | - |
| squat on toes @ 0.45 m | lumbar | 0.39 | 0.40 | - | - | 0.0098 | foot.left, foot.right | foot.left on foot.right, middleTrunk on upperArm.left, middleTrunk on upperArm.right |
| squat on toes @ 0.55 m | lumbar | 0.10 | 0.09 | - | - | 0.0358 | foot.left, foot.right | - |
| squat @ 0.55 m | lumbar | 0.25 | 0.54 | - | - | 0.0524 | foot.left, foot.right | - |
| squat @ 0.70 m | lumbar | 0.31 | 0.66 | - | - | 0.0353 | foot.left, foot.right | - |
| stand | all | 0.01 | 0.05 | - | - | 0.0234 | foot.left, foot.right | - |
| fours | all | 0.04 | 0.05 | - | - | 0.0019 | foot.left, foot.right, hand.left, hand.right, shank.left, shank.right | thigh.left on thigh.right |
| fours, hands light | all | 0.67 | 0.01 | - | - | 0.0016 | foot.left, foot.right, hand.left, hand.right, shank.left, shank.right, thigh.left, thigh.right | middleTrunk on thigh.left, middleTrunk on thigh.right |
| kneel | all | 0.02 | fell (1.6388 m, wrist.left pronation) | - | - | 1.6388 | hand.left, hand.right, thigh.left, thigh.right | - |
| kneel, left knee light | all | 0.35 | 0.36 | - | - | 0.0051 | foot.right, shank.left, shank.right | - |
| fours, left knee light | all | 0.32 | 0.07 | - | - | 0.0009 | forearm.left, forearm.right, hand.right, head, shank.left, shank.right | - |
| half kneel, hands | all | 0.07 | 0.07 | - | - | 0.0014 | foot.left, foot.right, hand.left, hand.right, shank.left, thigh.right | - |
| half kneel, hands light | all | 0.68 | 0.11 | - | - | 0.001 | foot.left, foot.right, hand.left, hand.right, shank.left, thigh.right | middleTrunk on thigh.right |
| half kneel | all | 0.07 | 0.38 | - | - | 0.0135 | foot.left, shank.right | - |
| half kneel, knee light | all | 0.30 | 0.19 | - | - | 0.0054 | foot.left, foot.right, shank.right | - |
| half kneel, one leg | all | 0.72 | 0.51 | - | - | 0.0648 | foot.left, shank.right | middleTrunk on thigh.left |
| kneel on toes | all | 0.03 | fell (1.5116 m, lumbar flexion) | - | - | 1.5116 | hand.left, hand.right, lowerTrunk, thigh.left, thigh.right, upperTrunk | - |
| kneel on toes, knees light | all | 0.35 | 0.43 | - | - | 0.0424 | foot.left, foot.right, thigh.left, thigh.right | - |
| squat on toes @ 0.45 m | all | 0.37 | 0.23 | - | - | 0.0292 | foot.left, foot.right, thigh.left, thigh.right | foot.left on foot.right, foot.left on lowerTrunk, foot.right on lowerTrunk |
| squat on toes @ 0.50 m | all | 0.32 | 1.20 | - | - | 0.012 | foot.left, foot.right | foot.left on lowerTrunk, foot.left on thigh.left, foot.right on lowerTrunk, foot.right on thigh.right, middleTrunk on thigh.left, middleTrunk on thigh.right |
| squat on toes @ 0.55 m | all | 0.27 | 0.20 | - | - | 0.0308 | foot.left, foot.right | foot.left on thigh.left, foot.right on thigh.right, middleTrunk on thigh.left, middleTrunk on thigh.right |
| squat on toes @ 0.60 m | all | 0.25 | fell (0.1113 m, ankle.left inversion) | - | - | 0.1113 | foot.left, foot.right | - |
| squat on toes @ 0.70 m | all | 0.26 | fell (1.0626 m, wrist.left radial deviation) | - | - | 1.0626 | foot.left, foot.right, hand.left, hand.right | - |
| squat @ 0.55 m | all | 0.22 | 0.26 | - | - | 0.0162 | foot.left, foot.right | - |
| squat @ 0.70 m | all | 0.16 | 0.19 | - | - | 0.0086 | foot.left, foot.right | - |
| squat @ 0.80 m | all | 0.08 | 0.11 | - | - | 0.0177 | foot.left, foot.right | middleTrunk on upperArm.left, middleTrunk on upperArm.right |
| fours on toes, knees light | all | 0.17 | 0.04 | - | - | 0.0016 | hand.left, hand.right, head, shank.left, shank.right | middleTrunk on thigh.left, middleTrunk on thigh.right |
| hands and toes | all | 0.05 | 0.99 | - | - | 0.0039 | foot.left, foot.right, hand.left, hand.right | middleTrunk on thigh.left, middleTrunk on thigh.right |
| hands and feet | all | 0.04 | 0.14 | - | - | 0.0028 | foot.left, foot.right, hand.left, hand.right | - |
| hands and feet, hands light | all | 0.55 | 0.28 | - | - | 0.0098 | foot.left, foot.right, hand.left, hand.right | middleTrunk on thigh.left, middleTrunk on thigh.right |

### The handover (the game's body and stance, on its solver: 120 Hz, the core's iterations)

Stood: not down for its last 2 s and more, and its centre of mass within 5 cm of the height its stance asks.

| row | centre put, m | stood | up after, s | centre at the end, m | asked, m | fastest segment at the end, m/s |
|---|---|---|---|---|---|---|
| stand | 0.99 | yes | 0 | 0.98 | 0.98 | 0.00 |
| fours | 0.38 | no | - | 0.25 | 0.98 | 12.68 |
| kneel | 0.61 | no | - | 0.22 | 0.98 | 7.50 |
| kneel, left knee light | 0.40 | no | - | 0.25 | 0.98 | 8.85 |
| fours, left knee light | 0.33 | no | - | 0.25 | 0.98 | 4.07 |
| half kneel | 0.62 | no | - | 0.21 | 0.98 | 6.71 |
| half kneel, knee light | 0.56 | no | - | 0.31 | 0.98 | 7.76 |
| kneel on toes | 0.51 | no | - | 0.23 | 0.98 | 8.46 |
| squat on toes @ 0.45 m | 0.45 | no | - | 0.21 | 0.98 | 9.35 |
| squat on toes @ 0.50 m | 0.50 | no | - | 0.17 | 0.98 | 10.43 |
| squat on toes @ 0.55 m | 0.55 | no | - | 0.27 | 0.98 | 4.44 |
| squat on toes @ 0.60 m | 0.60 | no | - | 0.29 | 0.98 | 8.46 |
| squat on toes @ 0.70 m | 0.70 | no | - | 0.20 | 0.98 | 9.12 |
| squat on toes @ 0.80 m | 0.80 | yes | 0 | 0.98 | 0.98 | 0.00 |
| squat @ 0.45 m | 0.45 | no | - | 0.28 | 0.98 | 9.39 |
| squat @ 0.50 m | 0.50 | no | - | 0.21 | 0.98 | 5.07 |
| squat @ 0.55 m | 0.55 | no | - | 0.20 | 0.98 | 7.30 |
| squat @ 0.60 m | 0.60 | no | - | 0.19 | 0.98 | 11.82 |
| squat @ 0.70 m | 0.70 | no | 0.08 | 0.92 | 0.98 | 0.03 |
| squat @ 0.80 m | 0.80 | yes | 0 | 0.97 | 0.98 | 0.00 |
| fours on toes, knees light | 0.22 | no | - | 0.31 | 0.98 | 11.04 |
| hands and toes | 0.51 | no | - | 0.20 | 0.98 | 6.07 |
| hands and feet | 0.50 | no | - | 0.21 | 0.98 | 6.33 |
| hands and feet, hands light | 0.53 | no | - | 0.19 | 0.98 | 8.09 |

## The verdict, by route

As built, every waypoint is held but the moments a support leaves the ground, and four of those
are closed. The controls come out as stated: `stand` and `fours` held at 0.02 and 0.04, and the
engine holds both at 0.04 to 0.05 on either solver.

- **S, sitting back, is closed by the knee's stop at its first step.** `fours, hands light` is
  unbalanced by 2 cm: the knees on their stop (2.57 rad) and the centre of mass 2 cm ahead of
  what the shins and insteps bear. With the knee's stop stripped it is held at 0.68,
  the knees at 2.81 rad (161°); stripping the ankle, the hip or the lumbar spine leaves it
  unbalanced. Past it, `kneel` is held at 0.03 at zero margin and `kneel, left knee light` at 0.70
  at 1 mm (one seed of nine): balances, which the engine topples even held at ten times.
- **K, the half kneel, is closed twice: lifting the hands, and rising onto the front foot.**
  `fours, left knee light` is held at 0.35 (the engine, 0.20). `half kneel, hands` under the box:
  the best try has the front hip (2.21 rad) and the lumbar spine (0.89) at their stops together and
  still puts the front thigh 98 mm into the trunk, which is none found; under the cone it is held
  at 0.10 with the foot further out, and with any one of the four stops stripped it is held under
  the box at 0.06 to 0.10. `half kneel, hands light` is none found as built (its best misses by
  9.6 cm), unbalanced by 3.3 cm under the cone, and held only with the rear knee's stop stripped
  (2.79 rad, 0.68, zero margin). The upright `half kneel` is held at 0.07 and `half kneel, knee
  light` at 0.15, and the path between them at 0.31 at most; the engine holds them (0.69 by side,
  0.43 by the driver; 0.15). `half kneel, one leg` is unbalanced by 16 cm, not too weak: no
  posture within the ranges puts the centre over the front sole. With the ankle's stop stripped
  it is held at 0.24, the front ankle at 0.98 rad (56°) and the rear at 1.40.
- **Q, the squat, is closed where the knees leave the ground; every squat is held.** `kneel on
  toes` is held at 0.03 (the engine, 0.04). `kneel on toes, knees light` is unbalanced by 18 cm;
  with the ankle's stop stripped it is held at 0.22, each ankle at 1.15 rad (66°). The foot is
  one box: a body on its balls asks of its ankle what a person's toes give. `squat on toes` is
  held at all six heights (0.07 to 0.92), at margins of 0 to 3 cm; the engine holds 0.45 and 0.50
  m (0.50, 0.95), and 0.55 to 0.80 m topple even held at ten times. `squat` on the soles is held
  at all six heights, with the hips spread to their abduction stop (0.56 rad) and the ankles at
  theirs: shares 0.08 to 0.86, margins 0.7 to 1.2 cm at 0.45 to 0.55 m, 4 cm at 0.60, 10 to 12 cm
  at 0.70 and 0.80. The reference engine holds 0.70 and 0.80 m (0.13 and 0.11), 0.55 m at no
  share tried (10 cm of drift), and the rest topple held at ten times. The game's stance stands
  the body up from a squat at 0.80 m, on its soles or its toes; from 0.70 m on its soles it rises
  to 0.92 m (6 cm short); from lower it falls.
- **B, the bear, is held at every row as built.** `fours on toes, knees light` 0.26 (the engine,
  0.08), `hands and toes` 0.06 (0.30), `hands and feet` 0.01 (0.14), `hands and feet, hands
  light` 0.55 at zero margin and one seed of nine (the reference engine, 0.27): a straight-legged
  fold, the knees at -0.04 rad and the hips at 1.54, the hands touching. The path from `hands
  and feet` to it is lost on a 10 mm overlap of the trunk and a thigh halfway. Nothing here joins
  `fours` to `fours on toes` (the toes tucked), or the fold to standing.

**The earlier reckonings, read.** That a foot planted between the hands needs the hip's flexion
and the lumbar spine's at their stops together: so under the box, where it still overlaps, and
not under the cone. That standing on one leg from a half kneel is a matter of the knee's
strength: it is a matter of balance, and of the ankle's range. That a squat on flat feet asks
more dorsiflexion than the ankle has: no, the squat is held at every height read, wide.

**Least shares sit on edges.** The least share is often found at the edge of the support (a
squat at 0.45 m with 7 mm of margin), and the engine topples those postures even held at ten
times: every `fell` cell of the reference solver is a row at a margin under 4 cm. A held row says a
posture exists at that share; it does not say one with room to spare does, nor at what share.

## The game's solver

On the game's solver the stand hold's control, held at ten times its strength, falls on every
squat and on the half kneel, where the reference solver keeps the 0.70 and 0.80 m squats and the
half kneel at under 0.7 of it. Such a cell says nothing of `k` there: the solver, not the body,
has given way. A stiff hold of a posture standing on the ground, by Rapier's iteration counts
(Node, core world, Rapier; every joint's motor driving to its angle at 5000 N m, released 0.5 mm
up; the most any segment has moved, m, and the worst joint's error at 2 s, rad):

| Hz | iterations x PGS passes | drift at 0.25 / 1 / 2 s | worst joint, rad |
|---|---|---|---|
| 120 | 16 x 2 (the game's) | 0.035 / 0.316 / 0.965 | 0.119 |
| 120 | 64 x 2 | 0.009 / 0.032 / 0.030 | 0.026 |
| 120 | 16 x 8 | 0.011 / 0.045 / 0.034 | 0.026 |
| 120 | 256 x 4 | 0.010 / 0.024 / 0.022 | 0.002 |
| 480 | 16 x 2 | 0.009 / 0.031 / 0.030 | 0.026 |
| 480 | 256 x 4 (the reference) | 0.006 / 0.019 / 0.021 | 0.0004 |

On the game's iterations the standing body falls; four times the iterations of either kind, or
four times the rate, keep it within 3 cm. The game's `SOLVER` was taken from the bake-off's bar,
a human held against a 1920 Hz reference; a body bearing its weight on its own stops and motors
is not that case. The game's muscles are joint motors, so what holds a riser's loaded posture
on the game is the same solve.

## What it cannot say

- **Momentum.** A rise passes through what it cannot hold still; every reading here is static.
- **A moving joint's strength.** A muscle shortening gives less than its peak, so a rise wants
  a share well under 1.
- **A sliding contact**, or a contact that is not on the row's list.
- **Whether a controller finds the best ground forces.** The share is the best case; B's `k`
  against it is how much more a stiff hold asks.
- **A path between its samples**, or between two rows on different grounds: the lift-offs are
  read as single rows, the ways from one ground to the next (a hand set down, the toes tucked, a
  foot stepped forward) not at all.
- **Edges.** See above: a least share is not a posture with a margin.
- **None found is not none**: a search over 1500 evaluations from 8 seeds.
- **Solver dependence**: B's `fell` cells on the game's solver.

## What would change the verdict

Candidates, none made, each to be read in its source before any change, with its before/after:

1. **A toe joint.** The foot is one box, so on its balls the ankle does the toes' work: Q's
   knees leave the ground at 1.15 rad of the ankle. A metatarsophalangeal
   joint with its passive range: Nawoczenski DA, Baumhauer JF, Umberger BR (1999), Relationship
   between clinical measurements and motion of the first metatarsophalangeal joint during gait,
   J Bone Joint Surg, not yet read.
2. **The ankle's dorsiflexion bearing weight.** The stop is a passive range by goniometer
   (Moromizato 2016); the front foot on one leg asks 0.98 rad. A range read bearing weight: the
   weight-bearing lunge (Bennell K et al. 1998, Aust J Physiother 44(3):175-180) and the
   heels-down squat (Hemmerich A et al. 2006, Hip, knee, and ankle kinematics of high range of
   motion activities of daily living, J Orthop Res 24(4):770-781), not yet read.
3. **The knee folded on the calf.** Sitting back asks 2.81 rad of the knee, past the 2.57 of a
   passive range; in a person the thigh rests on the calf and the soft tissue bears there, which
   the body's jointed segments, never colliding, cannot. A range read kneeling (Hemmerich 2006),
   or a contact between thigh and shank.
4. **Not the body: the solver's iterations** (`SOLVER`). Solver conditioning, named and measured
   as such: the riser's loaded postures read again at four times the iterations, with the step's
   cost.
