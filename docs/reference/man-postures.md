# Man: the support postures with a fitted palm, a bare foot and a passive toe

Whether Man's contact anatomy (`docs/reference/man-anatomy.md`) turns the support postures and the
transfer the Warrior cannot hold into ones it can: the posture audit's statics on three envelopes,
and the installed holds and the all-fours to half-kneel transfer on the core's world with the
boot and the bare foot. Body `workshop-fighter`, its own mass properties on every envelope (a
shape carries no mass), nothing in its hands, no assist (balance 0 %). The passive toe on the
solver is its own record ([man-passive-toes.md](man-passive-toes.md)).

## The statics on three envelopes

```
node research/man-postures.mjs --workers 30
```

The posture audit's instrument A ([postures.md](postures.md#three-instruments)): Node, the joints'
kinematics and the body's dynamics, no world step; Rapier `adapter-9` (sha256 `1bb36b24…`) for
the colliders' overlap, parent-axis limits; as built, the bearing solve's box friction (the cone's
verdict is in the run's records). At commit `2a111961` with the working changes of the plan's A1:
63 rows, a seed posture each and 8 random seeds where it holds nothing, 1500 evaluations a search,
2250 s on 30 workers. The records and drawings are in `research/runs/postures/envelopes.json`.

- **`boot`**: today's contacts: the foot a box fitted to the boot, the hand the empty hand's
  capsule.
- **`barefoot`**: the bare foot, toes and all, as one rigid hull at the toes' rest (`rigidFoot`),
  and the open hand's hull (`palm`) (`envelopeSpec` in `research/core-posture-trials.mjs`). The
  sole is the foot hull's corners on the ground, `ball` and `toes` its corners ahead of the
  hinge, the hand the palm patch's outline. At the fit scale the boot's box is 141 mm wide and
  287 mm long, the bare foot 99 mm and 265 mm.
- **`toe`**: as `barefoot` with the foot cut at the ball (`foot`) and the toes (`toes`) posed about
  `mtp` by one more angle each, within ±π/2 (`TOE`). The toes have no mass: theirs stays in the
  foot. What the ground pushes on them passes to the foot, and the push's moment about the hinge
  is the spring's, 25 N m/rad from rest (`SOURCES["falisse-2022-toes"]`), within 0.5 N m
  (`TOE_ON`, 0.02 rad), with a stop's reaction at a stop. The front touches (`ball`, `instep`,
  `toes`) are the lowest of the cut foot's front corners and the toes' corners, either side of
  the middle. A toe is searched only where the row bears on that foot's front; elsewhere it rests.
  The toes are not colliders, so a toe through the other leg counts as no overlap.

Each row is searched on each envelope from its seed posture (on `toe` also with the toes bent up,
`TOES_BENT`), then from random seeds where none holds; a row an envelope still holds nothing of is
searched again from each other envelope's held witness, kept as it is, its toes at rest (marked
with that envelope's name). The search holds the wrist's deviation and the forearm's turn at the
reference (`HELD`), so the palm lies on the ground as far as the wrist's flexion and the shoulder
put it. Statics are one-sided: a held row is a witness; none found is not none.

The table gives each row's verdict and, where held, the least share and the support margin; the
toes' angles on `toe` (negative bent up) with the ground's moment about the hinge. `*` in the
run's console table, `(envelope)` here: held from that envelope's witness.

| row | route | boot | barefoot | toe | toes, rad (ground's moment) |
|---|---|---|---|---|---|
| stand | control | held 0.02, 91 mm | held 0.02, 52 mm | held 0.03, 28 mm | left 0.00 (0 N m); right 0.00 (0 N m) |
| fours | control | held 0.09, 285 mm | held 0.14, 440 mm | held 0.14, 458 mm | left 0.02 (0 N m); right 0.02 (0 N m) |
| fours, hands light | S | unbalanced | unbalanced | unbalanced | - |
| kneel | S | held 0.04, 158 mm | held (boot) 0.04, 100 mm | unbalanced | - |
| kneel, left knee light | S | unbalanced | unbalanced | unbalanced | - |
| fours, left knee light | K | held 0.20, 195 mm | held 0.47, 121 mm | held 0.95, 44 mm | left 0.00 (0 N m); right 0.17 (4 N m) |
| half kneel, hands | K | held (barefoot) 0.12, 335 mm | held 0.14, 511 mm | held (barefoot) 0.14, 514 mm | left 0.00 (0 N m); right 0.00 (0 N m) |
| half kneel, hands light | K | none found | unbalanced | none found | - |
| half kneel | K | held 0.07, 22 mm | held 0.42, 18 mm | held 0.21, 22 mm | left 0.00 (0 N m); right -1.23 (-31 N m) |
| half kneel, knee light | K | held 0.15, 45 mm | held 0.47, 23 mm | held 0.19, 18 mm | left 0.00 (0 N m); right -1.23 (-31 N m) |
| half kneel, one leg | K | unbalanced | unbalanced | unbalanced | - |
| kneel on toes | Q | held 0.06, 139 mm | held (boot) 0.07, 119 mm | held (boot) 0.46, 58 mm | left -0.46 (-11 N m); right -0.46 (-11 N m) |
| kneel on toes, knees light | Q | unbalanced | unbalanced | unbalanced | - |
| squat on toes @ 0.45 m | Q | held 0.13, 43 mm | held (boot) 0.14, 9 mm | unbalanced | - |
| squat on toes @ 0.50 m | Q | held 0.34, 0 mm | held 0.41, 0 mm | too weak | - |
| squat on toes @ 0.55 m | Q | held 0.13, 1 mm | held 0.33, 0 mm | held 0.31, 25 mm | left -0.63 (-15 N m); right -0.63 (-15 N m) |
| squat on toes @ 0.60 m | Q | held 0.09, 17 mm | held 0.10, 1 mm | held 0.12, 9 mm | left -0.73 (-18 N m); right -0.73 (-18 N m) |
| squat on toes @ 0.70 m | Q | held 0.28, 32 mm | held 0.33, 1 mm | held 0.34, 5 mm | left -0.80 (-21 N m); right -0.80 (-21 N m) |
| squat on toes @ 0.80 m | Q | held 0.29, 18 mm | held 0.36, 10 mm | held 0.60, 12 mm | left -0.02 (-1 N m); right -0.02 (-1 N m) |
| squat @ 0.45 m | Q | held 0.59, 18 mm | unbalanced | unbalanced | - |
| squat @ 0.50 m | Q | held 0.42, 36 mm | unbalanced | unbalanced | - |
| squat @ 0.55 m | Q | held 0.92, 17 mm | unbalanced | unbalanced | - |
| squat @ 0.60 m | Q | held 0.45, 39 mm | held 0.67, 1 mm | held 0.19, 57 mm | left 0.00 (0 N m); right 0.00 (0 N m) |
| squat @ 0.70 m | Q | held 0.13, 108 mm | held 0.15, 49 mm | held 0.81, 29 mm | left 0.00 (0 N m); right 0.00 (0 N m) |
| squat @ 0.80 m | Q | held 0.07, 118 mm | held 0.06, 28 mm | held 0.10, 26 mm | left 0.00 (0 N m); right 0.00 (0 N m) |
| fours on toes, knees light | B | held 0.25, 277 mm | held 0.47, 354 mm | held 0.38, 434 mm | left 0.15 (3 N m); right 0.15 (3 N m) |
| hands and toes | B | held 0.04, 489 mm | held 0.16, 491 mm | held 0.14, 409 mm | left -0.30 (-8 N m); right -0.30 (-8 N m) |
| hands and feet | B | held 0.01, 521 mm | held 0.30, 106 mm | held 0.15, 519 mm | left 0.00 (0 N m); right 0.00 (0 N m) |
| hands and feet, hands light | B | held 0.60, 3 mm | unbalanced | unbalanced | - |
| squat, hands @ 0.50 m | B | held 0.01, 527 mm | held 0.03, 352 mm | held 0.03, 326 mm | left 0.00 (0 N m); right 0.00 (0 N m) |
| squat, hands @ 0.60 m | B | none found | none found | none found | - |
| squat, hands @ 0.70 m | B | none found | none found | none found | - |
| squat, hands @ 0.80 m | B | none found | none found | none found | - |
| squat, hands light @ 0.50 m | B | unbalanced | unbalanced | unbalanced | - |
| squat, hands light @ 0.60 m | B | none found | none found | none found | - |
| squat, hands light @ 0.70 m | B | none found | none found | none found | - |
| squat, hands light @ 0.80 m | B | none found | none found | none found | - |
| hands and toes, left foot light | B | held 0.40, 213 mm | held 0.40, 157 mm | held 0.42, 349 mm | left 0.00 (0 N m); right -0.34 (-9 N m) |
| hands and toes, left hand light | B | held 0.51, 200 mm | held 0.60, 118 mm | held 0.62, 99 mm | left -0.70 (-17 N m); right -0.22 (-5 N m) |
| squat on toes, hands @ 0.30 m | B | held 0.34, 349 mm | held 0.46, 187 mm | held 0.31, 390 mm | left -0.15 (-4 N m); right -0.15 (-4 N m) |
| squat on toes, hands @ 0.35 m | B | held 0.10, 324 mm | held 0.31, 160 mm | held 0.33, 442 mm | left -0.14 (-3 N m); right -0.14 (-3 N m) |
| squat on toes, hands @ 0.40 m | B | held 0.17, 288 mm | held 0.18, 164 mm | held 0.11, 182 mm | left -0.29 (-8 N m); right -0.29 (-8 N m) |
| squat on toes, hands @ 0.45 m | B | held 0.14, 169 mm | held 0.10, 269 mm | held 0.19, 568 mm | left -0.45 (-12 N m); right -0.45 (-12 N m) |
| squat on toes, hands @ 0.50 m | B | held 0.06, 455 mm | held 0.09, 350 mm | held 0.13, 465 mm | left -0.27 (-7 N m); right -0.27 (-7 N m) |
| squat on toes, hands light @ 0.30 m | B | unbalanced | unbalanced | unbalanced | - |
| squat on toes, hands light @ 0.35 m | B | unbalanced | unbalanced | unbalanced | - |
| squat on toes, hands light @ 0.40 m | B | held 0.31, 2 mm | unbalanced (boot) | too weak (boot) | - |
| squat on toes, hands light @ 0.45 m | B | held 0.69, 0 mm | unbalanced | unbalanced (boot) | - |
| squat on toes, hands light @ 0.50 m | B | unbalanced | unbalanced | unbalanced | - |
| kneel on toes, left knee light | K | held 0.71, 5 mm | unbalanced (boot) | unbalanced (boot) | - |
| kneel on toes, left leg light | K | held 0.66, 4 mm | held (boot) 0.70, 0 mm | unbalanced (boot) | - |
| half kneel on toes | K | held 0.06, 17 mm | held 0.42, 18 mm | held 0.21, 22 mm | left 0.00 (0 N m); right -1.23 (-31 N m) |
| half kneel on toes, knee light | K | held 0.22, 32 mm | held 0.47, 23 mm | held 0.19, 18 mm | left 0.00 (0 N m); right -1.23 (-31 N m) |
| lunge @ 0.60 m | K | held 0.20, 29 mm | held 0.25, 5 mm | held 0.35, 13 mm | left 0.00 (0 N m); right -1.08 (-28 N m) |
| lunge @ 0.70 m | K | held 0.30, 90 mm | held 0.10, 5 mm | held 0.73, 21 mm | left 0.00 (0 N m); right 0.60 (14 N m) |
| lunge @ 0.80 m | K | held 0.25, 113 mm | held 0.28, 26 mm | held 0.43, 33 mm | left 0.00 (0 N m); right -0.57 (-15 N m) |
| half kneel on toes, hands | K | held 0.34, 130 mm | held 0.14, 511 mm | held (barefoot) 0.14, 514 mm | left 0.00 (0 N m); right 0.00 (0 N m) |
| lunge, hands @ 0.40 m | K | held 0.23, 419 mm | held (boot) 0.20, 464 mm | held (boot) 0.26, 386 mm | left 0.00 (0 N m); right -0.14 (-4 N m) |
| lunge, hands @ 0.50 m | K | held 0.15, 507 mm | held 0.10, 507 mm | held 0.24, 480 mm | left 0.00 (0 N m); right -0.45 (-11 N m) |
| lunge, hands @ 0.60 m | K | none found | none found | none found | - |
| lunge, hands light @ 0.40 m | K | unbalanced | none found | none found | - |
| lunge, hands light @ 0.50 m | K | unbalanced | unbalanced | unbalanced | - |
| lunge, hands light @ 0.60 m | K | none found | none found | none found | - |

### What the statics say

- **No row the boot fails holds on the toe.** `kneel on toes, knees light` is unbalanced on all
  three, by 0.17 m on the boot, 0.06 m bare and 0.30 m on the toe. `half kneel, hands` holds on all
  three; the boot's witness is the bare foot's, put back on the boot (0.12), which corrects the
  audit's none found. `half kneel, hands light` holds on none.
- **The bare foot loses what stands on the foot's size.** The flat squat from 0.45 to 0.55 m and
  `hands and feet, hands light` hold on the boot and on neither bare envelope, and the half kneel
  asks three to six times the boot's share bare: the boot's box is a wider, longer base.
- **The toe loses the kneel and the low squats on the toes.** `kneel`, `squat on toes` at 0.45
  and 0.50 m and the two one-sided light kneels on the toes hold on the boot and not on the toe, and
  `kneel on toes` asks 0.46 of its strength to the boot's 0.06. A loaded toe gives way at 25 N m
  a radian: under 387 N on each ball it turns until the moment balances, and the body has to
  stand where that leaves the ball.
- **The palm buys the statics nothing.** Every row bearing on the hands that holds on the boot
  holds bare, most at a higher share (`hands and feet` 0.01 to 0.30), a few lower (`half kneel on
  toes, hands` 0.34 to 0.14); the rows lost bare are those with the hands light, standing on the
  feet alone.
- The toe's spring and stops are prototype values (`man-anatomy.md`); a toe that stiffens as it
  bends, as a foot's does, is not what was measured.
