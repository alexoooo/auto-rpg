# Postures

Which postures between hands and knees and standing the Warrior can hold still by its muscles on
the ground, and where it cannot, which stop or muscle closes the way: what the body allows, with no
controller in it. The staged rise's route on from `fours` ([rising.md](rising.md#the-step)) and
changes to the body rest on it. `research/core-posture.mjs` and `research/core-posture-trials.mjs`
produce the tables; records and drawings go to `research/runs/postures/`.

Body `workshop-fighter`, empty hands, balance 0 %, parent-axis limit model; the corrected profile is
remeasured in [limit models](posture-limit-models.md). The run read here: 29 rows, 8 random seeds
where a seed posture holds nothing, 1500 evaluations a search, 2452 s on 22 workers. The tables keep
the columns and rows the verdict reads; every cell is in `docs/reference/postures.md@b43619f6`.

```
node research/core-posture.mjs --workers 22
```

## Three instruments

- **A, the statics.** Node, the joints' kinematics and the body's dynamics
  (`src/core/build/dynamics.ts`), no world step. A posture is written into the segments' nodes and
  put onto its contacts; its equilibrium is a linear programme over the ground's forces (each point
  pushes, within friction), each freedom's torque within `s` times the peak of the side that pulls,
  and each stop's torque free where the freedom is pressed into its stop. The **share** is the
  least `s`, best case over the ground's forces. A search over the posture (pitch, roll where the
  row is not symmetric, the free freedoms as fractions of their ranges) finds the least share.
- **B, the stand hold.** Node, the core world, Rapier, the arena's solids. The body is put in A's
  posture 0.5 mm up and released, each joint's motor driving to its angle with a ceiling of `k`
  times the peak of the side A loads (**by side**), or by the muscle driver's own pose drive at `k`
  (**by the driver**); `k` is bisected for the least that keeps the body still for 3 s. On two
  solvers: the **reference** (480 Hz, 256 iterations of 4 PGS passes) and the **game's** (120 Hz,
  the core's 16 of 2, `SOLVER` in `src/core/engine/rapier.ts`).
- **C, the handover.** The game's solver; the body put in a row's posture, then given to the game's
  stance (`createBody`, `body.drive`, a stance goal on both feet at standing height) for 6 s.

The evidence is one-sided: a held row is a witness, checkable alone; a row not held is **none
found**, which is not none.

## The rows

A row names what is on the ground (`touch`) and what bears load (`bear`). A row with a support
**light** touches it and puts no load on it: the moment that support leaves the ground or lands.

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

**Variants** strip a stop to 3 rad, as an override passed to the search, never a spec change: knee
flexion (`knee`), ankle dorsiflexion (`ankle`), hip flexion (`hip`), lumbar flexion (`lumbar`), and
all four (`all`). The Warrior's stops, from the anatomical zero
(`src/core/human/tables/range-of-motion.ts`; passive ranges by goniometer, Moromizato 2016, the
lumbar spine's Pearcy 1985): knee flexion 2.57 rad (147.1°), ankle dorsiflexion 0.39 (22.3°), hip
flexion 2.21 (126.7°), hip abduction 0.56 (32.1°), lumbar flexion 0.89 (51°).

## The columns

- **verdict**: `held` (declared points within 1 mm of the ground, no overlap over 5 mm, balanced,
  share at most 1), `unbalanced` (the centre outside what bears), `too weak` (share over 1),
  `none found` (no posture on the contacts without an overlap).
- **stops bearing**: each stop's torque, N m. **margin**: the centre of mass inside the bearing
  outline, m (negative: outside); zero margin is a balance, not a rest. **centre**: its height (the
  body weighs 775 N). **seeds agree**: seeds finding the least share within 0.02.
- **friction**: the box is the inscribed pyramid (0.354, the bearing solve's); the cone is the
  rulebook's 0.5.
- **stand hold**: least `k` keeping every segment within twice the drift of a control held at ten
  times strength (at least 2 cm); `fell` if the control falls, `none` if no `k` tried holds.
  **creep**: the control's drift. **Handover**: **stood** is not down for its last 2 s and more,
  the centre within 5 cm of the stance's height.

## The readings

### As built (friction: the bearing solve's box)

| row | route | verdict | share | stops bearing, N m | margin, m | centre, m | seeds agree |
|---|---|---|---|---|---|---|---|
| stand | control | held | 0.02 | ankle dorsiflexion -50 each | 0.09 | 0.99 | 1/1 |
| fours | control | held | 0.04 | thoracic flexion 6 | 0.38 | 0.38 | 1/1 |
| fours, hands light | S | unbalanced | - | - | -0.02 | 0.34 | 9/9 |
| kneel | S | held | 0.03 | - | 0.00 | 0.61 | 1/1 |
| kneel, left knee light | S | held | 0.70 | hip.right internal rotation -58; knee.right flexion -37 | 0.00 | 0.40 | 1/9 |
| fours, left knee light | K | held | 0.35 | lumbar rotation right 21; ankle.right dorsiflexion -18 | 0.16 | 0.33 | 1/1 |
| half kneel, hands | K | none found | 0.19 | thoracic, lumbar, front hip, ankles and more (13 stops) | 0.28 | 0.34 | 1/9 |
| half kneel, hands light | K | none found | - | - | -0.09 | 0.34 | 9/9 |
| half kneel | K | held | 0.07 | ankle.left dorsiflexion -11 | 0.02 | 0.62 | 1/1 |
| half kneel, knee light | K | held | 0.15 | ankle.left dorsiflexion -40; knee.right flexion -182; ankle.right dorsiflexion -38 | 0.04 | 0.56 | 1/1 |
| half kneel, one leg | K | unbalanced | - | - | -0.16 | 0.53 | 8/9 |
| kneel on toes | Q | held | 0.03 | knee flexion -75, -87 | 0.14 | 0.51 | 1/1 |
| kneel on toes, knees light | Q | unbalanced | - | - | -0.18 | 0.53 | 9/9 |
| squat on toes @ 0.45 m | Q | held | 0.47 | knee flexion -166 each; lumbar flexion 102 | 0.00 | 0.45 | 1/1 |
| squat on toes @ 0.50 m | Q | held | 0.92 | knee flexion -166 each | 0.03 | 0.50 | 1/1 |
| squat on toes @ 0.55 m | Q | held | 0.13 | knee flexion -141 each; ankle inversion -7 each; thoracic -27; lumbar -11 | 0.00 | 0.55 | 1/1 |
| squat on toes @ 0.60 m | Q | held | 0.07 | knee flexion -135 each; ankle inversion -10 each; thoracic -13 | 0.02 | 0.60 | 1/1 |
| squat on toes @ 0.70 m | Q | held | 0.28 | ankle dorsiflexion -54 each | 0.03 | 0.70 | 1/1 |
| squat on toes @ 0.80 m | Q | held | 0.29 | - | 0.02 | 0.80 | 1/1 |
| squat @ 0.45 m | Q | held | 0.70 | hip abduction -43, internal rotation -72 each; thoracic -21 | 0.01 | 0.45 | 1/1 |
| squat @ 0.50 m | Q | held | 0.64 | hip abduction -93, internal rotation -36 each; thoracic -28 | 0.01 | 0.50 | 1/1 |
| squat @ 0.55 m | Q | held | 0.86 | hip abduction -30 each; lumbar -26 | 0.01 | 0.55 | 1/1 |
| squat @ 0.60 m | Q | held | 0.45 | hip abduction -141 each | 0.04 | 0.60 | 1/1 |
| squat @ 0.70 m | Q | held | 0.13 | hip abduction -152 each; thoracic -21; lumbar -66 | 0.10 | 0.70 | 1/1 |
| squat @ 0.80 m | Q | held | 0.08 | hip abduction -177 each; ankle dorsiflexion -6 each | 0.12 | 0.80 | 1/1 |
| fours on toes, knees light | B | held | 0.26 | elbow flexion -49 each | 0.38 | 0.22 | 1/1 |
| hands and toes | B | held | 0.06 | thoracic 9; ankle dorsiflexion -42, inversion -16 each | 0.46 | 0.51 | 1/1 |
| hands and feet | B | held | 0.01 | wrist flexion 6, ankle dorsiflexion -9, inversion -19 each | 0.54 | 0.50 | 1/1 |
| hands and feet, hands light | B | held | 0.55 | hip internal rotation 299, knee flexion 174 each, and more | 0.00 | 0.53 | 1/9 |

### A stop stripped (to 3 rad)

Share where held; a blank variant is not in the run's table. Stripping changes no share by more than
0.03 on `stand`, `fours`, `kneel`, `half kneel`, `kneel on toes`, `squat @ 0.80 m`, `hands and feet`
and `hands and feet, hands light`, not shown.

| row | built | knee | ankle | hip | lumbar | all |
|---|---|---|---|---|---|---|
| fours, hands light | unbalanced | 0.68 | unbalanced | unbalanced | unbalanced | 0.67 |
| kneel, left knee light | 0.70 | 0.35 | 0.23 | | | 0.35 |
| fours, left knee light | 0.35 | | 0.28 | | | 0.32 |
| half kneel, hands | none found | 0.08 | 0.06 | 0.10 | 0.10 | 0.07 |
| half kneel, hands light | none found | 0.68 | too weak (1.05) | unbalanced | unbalanced | 0.68 |
| half kneel, knee light | 0.15 | 0.33 | 0.17 | | | 0.30 |
| half kneel, one leg | unbalanced | unbalanced | 0.24 | unbalanced | unbalanced | 0.72 |
| kneel on toes, knees light | unbalanced | unbalanced | 0.22 | unbalanced | unbalanced | 0.35 |
| squat on toes @ 0.45 m | 0.47 | 0.59 | | | 0.39 | 0.37 |
| squat on toes @ 0.50 m | 0.92 | 0.26 | | | | 0.32 |
| squat on toes @ 0.55 m | 0.13 | 0.26 | | | 0.10 | 0.27 |
| squat on toes @ 0.60 m | 0.07 | 0.25 | | | | 0.25 |
| squat on toes @ 0.70 m | 0.28 | | 0.23 | | | 0.26 |
| squat @ 0.55 m | 0.86 | | | | 0.25 | 0.22 |
| squat @ 0.70 m | 0.13 | | | | 0.31 | 0.16 |
| fours on toes, knees light | 0.26 | | 0.16 | | | 0.17 |
| hands and toes | 0.06 | | 0.11 | | | 0.05 |

### Paths on one ground (the two ends' answers as built, 15 postures between)

Four paths hold: `half kneel` to `half kneel, knee light` (greatest share 0.31), `squat on toes`
0.70 to 0.80 m (0.32), and `squat` 0.45 to 0.50 m (0.70) and 0.50 to 0.55 m (0.86). `squat on
toes` 0.60 to 0.70 m passes through an unbalanced posture. The rest are lost on a self-overlap of
5 to 57 mm: `fours` to `fours, left knee light` and `kneel` to `kneel, left knee light` on the
thighs, the low `squat on toes` steps on the feet or a hand and thigh, the `squat` steps from
0.55 m up on the trunk, a hand and a thigh or shank, and `hands and feet` to its light-handed fold
on the trunk and a thigh, halfway.

### Friction: the box against the cone

One row flips: `half kneel, hands`, none found under the box (0.19), held at 0.10 under the cone;
`half kneel, hands light` goes from none found to unbalanced. Every other row keeps its verdict,
and the cone's share is within 0.07 of the box's except:

| row | box | cone |
|---|---|---|
| kneel, left knee light | 0.70 | 0.36 |
| squat on toes @ 0.50 m | 0.92 | 0.44 |
| squat @ 0.45 m | 0.70 | 0.45 |
| squat @ 0.50 m | 0.64 | 0.43 |
| squat @ 0.55 m | 0.86 | 0.52 |
| fours on toes, knees light | 0.26 | 0.16 |

### The stand hold (Node, core world, Rapier, at the solver named)

As built; `fell` and `none` give the drift, m. The stripped variants' holds are in the run's records.

| row | statics share | by side, reference | by the driver, reference | by side, game | creep at 10x, m (reference) |
|---|---|---|---|---|---|
| stand | 0.02 | 0.05 | 0.04 | 0.04 | 0.0533 |
| fours | 0.04 | 0.05 | 0.04 | 0.05 | 0.0018 |
| kneel | 0.03 | fell (1.62) | fell (1.62) | 0.09 | 1.6154 |
| kneel, left knee light | 0.70 | fell (1.03) | fell (1.03) | fell (0.97) | 1.0335 |
| fours, left knee light | 0.35 | 0.20 | 0.20 | 0.21 | 0.0022 |
| half kneel | 0.07 | 0.69 | 0.43 | fell (0.13) | 0.0136 |
| half kneel, knee light | 0.15 | 0.15 | 0.14 | 0.15 | 0.0071 |
| kneel on toes | 0.03 | 0.04 | 0.04 | 0.04 | 0.0027 |
| squat on toes @ 0.45 m | 0.47 | 0.50 | 0.49 | fell (0.16) | 0.0062 |
| squat on toes @ 0.50 m | 0.92 | 0.95 | 0.94 | fell (0.26) | 0.0495 |
| squat on toes @ 0.55 m | 0.13 | fell (1.75) | fell (1.75) | fell (0.14) | 1.7468 |
| squat on toes @ 0.60 m | 0.07 | fell (1.59) | fell (1.59) | fell (1.59) | 1.5884 |
| squat on toes @ 0.70 m | 0.28 | fell (1.68) | fell (1.68) | fell (1.68) | 1.6846 |
| squat on toes @ 0.80 m | 0.29 | fell (1.85) | fell (1.85) | fell (1.95) | 1.8465 |
| squat @ 0.45 m | 0.70 | fell (0.88) | fell (0.88) | fell (0.91) | 0.8767 |
| squat @ 0.50 m | 0.64 | fell (1.35) | fell (1.35) | fell (1.37) | 1.3526 |
| squat @ 0.55 m | 0.86 | none (0.10) | none (0.16) | fell (1.75) | 0.0466 |
| squat @ 0.60 m | 0.45 | fell (0.47) | fell (0.47) | fell (1.46) | 0.4661 |
| squat @ 0.70 m | 0.13 | 0.13 | 0.13 | fell (1.78) | 0.0162 |
| squat @ 0.80 m | 0.08 | 0.11 | 0.11 | fell (1.92) | 0.0176 |
| fours on toes, knees light | 0.26 | 0.08 | 0.09 | 0.05 | 0.0011 |
| hands and toes | 0.06 | 0.30 | 0.28 | 0.22 | 0.0073 |
| hands and feet | 0.01 | 0.14 | 0.14 | 0.08 | 0.0028 |
| hands and feet, hands light | 0.55 | 0.27 | 0.35 | fell (0.35) | 0.0138 |

### The handover (the game's body and stance, on its solver)

Three rows stand: `stand`, `squat on toes @ 0.80 m` and `squat @ 0.80 m` (centre at the end 0.98,
0.98 and 0.97 m against 0.98 asked). `squat @ 0.70 m` rises to 0.92 m, 6 cm short. Every other row
ends down, its centre at 0.17 to 0.31 m and its fastest segment at 4.07 to 12.68 m/s.

## The verdict, by route

As built, every waypoint is held but the moments a support leaves the ground, and four of those are
closed. The controls come out as stated: `stand` and `fours` held at 0.02 and 0.04, and the engine
holds both at 0.04 to 0.05 on either solver.

- **S, sitting back, is closed by the knee's stop at its first step.** `fours, hands light` is
  unbalanced by 2 cm: the knees on their stop (2.57 rad) and the centre 2 cm ahead of what the
  shins and insteps bear. With the knee's stop stripped it is held at 0.68, the knees at 2.81 rad
  (161°); stripping the ankle, hip or lumbar spine leaves it unbalanced. Past it, `kneel` (0.03)
  and `kneel, left knee light` (0.70, one seed of nine) are held at zero margin: balances, which the
  engine topples even held at ten times.
- **K, the half kneel, is closed twice: lifting the hands, and rising onto the front foot.**
  `fours, left knee light` is held at 0.35 (the engine, 0.20). `half kneel, hands` under the box:
  the best try has the front hip (2.21 rad) and the lumbar spine (0.89) at their stops together and
  still puts the front thigh 98 mm into the trunk; under the cone it is held at 0.10 with the foot
  further out, and with any one of the four stops stripped at 0.06 to 0.10. As built under the box
  it is held at 0.12 from a start these seeds did not reach: the bare foot's witness
  ([man-postures.md](man-postures.md)). `half kneel, hands light` is none found as built (its best
  misses by 9.6 cm), unbalanced by 3.3 cm under the cone, and held only with the rear knee's stop
  stripped (2.79 rad, 0.68, zero margin). The upright `half kneel` (0.07) and `half kneel, knee
  light` (0.15) are held, the path between them at 0.31 at most, and the engine holds them (0.69 by
  side, 0.43 by the driver; 0.15). `half kneel, one leg` is unbalanced by 16 cm, not too weak: no
  posture within the ranges puts the centre over the front sole. With the ankle's stop stripped it
  is held at 0.24, the front ankle at 0.98 rad (56°) and the rear at 1.40.
- **Q, the squat, is closed where the knees leave the ground; every squat is held.** `kneel on
  toes` is held at 0.03 (the engine, 0.04). `kneel on toes, knees light` is unbalanced by 18 cm;
  with the ankle's stop stripped it is held at 0.22, each ankle at 1.15 rad (66°): the foot is one
  box, so on its balls the ankle does the toes' work. `squat on toes` is held at all six heights
  (0.07 to 0.92, margins 0 to 3 cm); the engine holds 0.45 and 0.50 m, and topples 0.55 to 0.80 m
  even held at ten times. `squat` on the soles is held at all six heights, the hips spread to their
  abduction stop (0.56 rad) and the ankles at theirs: shares 0.08 to 0.86, margins 0.7 to 1.2 cm
  at 0.45 to 0.55 m, 4 cm at 0.60, 10 to 12 cm at 0.70 and 0.80. The reference engine holds 0.70
  and 0.80 m, and topples the rest held at ten times, 0.55 m at no share tried. The game's stance
  stands the body up from a squat at 0.80 m; from 0.70 m on its soles it rises 6 cm short.
- **B, the bear, is held at every row as built.** `fours on toes, knees light` 0.26 (the engine,
  0.08), `hands and toes` 0.06 (0.30), `hands and feet` 0.01 (0.14), `hands and feet, hands light`
  0.55 at zero margin and one seed of nine (0.27): a straight-legged fold, the knees at -0.04 rad
  and the hips at 1.54. The path from `hands and feet` to it is lost on a 10 mm trunk-thigh overlap
  halfway. Nothing here joins `fours` to `fours on toes` (the toes tucked), or the fold to standing.

Standing on one leg from a half kneel is a matter of balance and the ankle's range, not the knee's
strength; a flat-footed squat does not ask more dorsiflexion than the ankle has.

**Least shares sit on edges.** The least share is often at the edge of the support, and the engine
topples those postures even held at ten times: every `fell` cell of the reference solver is a row
at a margin under 4 cm. A held row says a posture exists at that share, not that one with room to
spare does.

## The game's solver

On the game's solver the stand hold's control, at ten times its strength, falls on every squat and
on the half kneel, so those cells say nothing of `k`: the solver has given way. A stiff hold of a
standing posture by Rapier's iteration counts (Node, core world, Rapier; every joint's motor driving
to its angle at 5000 N m, released 0.5 mm up; largest segment drift, m, and worst joint error at
2 s, rad):

| Hz | iterations x PGS passes | drift at 0.25 / 1 / 2 s | worst joint, rad |
|---|---|---|---|
| 120 | 16 x 2 (the game's) | 0.035 / 0.316 / 0.965 | 0.119 |
| 120 | 64 x 2 | 0.009 / 0.032 / 0.030 | 0.026 |
| 120 | 16 x 8 | 0.011 / 0.045 / 0.034 | 0.026 |
| 120 | 256 x 4 | 0.010 / 0.024 / 0.022 | 0.002 |
| 480 | 16 x 2 | 0.009 / 0.031 / 0.030 | 0.026 |
| 480 | 256 x 4 (the reference) | 0.006 / 0.019 / 0.021 | 0.0004 |

On the game's iterations the standing body falls; four times the iterations of either kind, or four
times the rate, keep it within 3 cm. `SOLVER` was set against the bake-off's bar (a human held
against a 1920 Hz reference), not a body bearing its weight on its own stops and motors; the game's
muscles are joint motors, so a riser's loaded posture is held by the same solve.

## What it cannot say

Momentum (every reading is static); a moving joint's strength (a shortening muscle gives less than
its peak); sliding contacts or contacts off the row's list; whether a controller finds the best
ground forces; a path between its samples or between two grounds (a hand set down, toes tucked, a
foot stepped); a posture with margin rather than the least share; anything beyond 1500 evaluations
from 8 seeds.

## What the verdict turns on

- **No toe joint.** On its balls the ankle does the toes' work; Q's knees leave the ground at 1.15
  rad of ankle. A passive metatarsophalangeal range: Nawoczenski, Baumhauer, Umberger 1999, J Bone
  Joint Surg; the passive toe is tried in [Man's postures](man-postures.md).
- **The ankle's dorsiflexion bearing weight.** The stop is a passive goniometer range (Moromizato
  2016); one leg's front foot asks 0.98 rad. Weight-bearing ranges: the lunge (Bennell et al. 1998,
  Aust J Physiother 44(3):175-180), the heels-down squat (Hemmerich et al. 2006, J Orthop Res
  24(4):770-781).
- **The knee folded on the calf.** Sitting back asks 2.81 rad, past the passive 2.57; a person's
  thigh rests on the calf, which jointed segments that never collide cannot do.
- **The solver's iterations** (`SOLVER`), conditioning rather than the body.
