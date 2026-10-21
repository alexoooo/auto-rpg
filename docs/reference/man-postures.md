# Man: the support postures with a fitted palm, a bare foot and a passive toe

Whether Man's contact anatomy ([man-anatomy.md](man-anatomy.md)) turns the support postures the
Warrior cannot hold into ones it can: the posture audit's statics on three envelopes
(`research/man-postures.mjs`), and the installed holds and the all-fours to half-kneel transfer on
the core's world (`research/man-posture-starts.mjs` builds the starts). Body `workshop-fighter`,
its own mass properties on every envelope, empty hands, balance 0 %. The passive toe on the solver
is [man-passive-toes.md](man-passive-toes.md).

## The statics on three envelopes

```
node research/man-postures.mjs --workers 30
```

The audit's instrument A ([postures.md](postures.md#three-instruments)): Node, no world step;
Rapier `adapter-9` (sha256 `1bb36b24…`) for overlap, parent-axis limits, the bearing solve's box
friction. At `b43619f6`: 63 rows, a seed posture each and 8 random seeds where it holds nothing,
1500 evaluations a search, 2250 s on 30 workers. Records and drawings:
`research/runs/postures/envelopes.json`.

- **`boot`**: the foot a box fitted to the boot (141 mm wide, 287 mm long at the fit scale), the
  hand the empty hand's capsule.
- **`barefoot`**: the bare foot as one rigid hull at the toes' rest (`rigidFoot`, 99 by 265 mm)
  and the open hand's hull (`palm`) (`envelopeSpec` in `research/core-posture-trials.mjs`). The
  sole is the hull's corners on the ground, `ball` and `toes` its corners ahead of the hinge, the
  hand the palm patch's outline.
- **`toe`**: `barefoot` cut at the ball (`foot`), the massless toes (`toes`) posed about `mtp` by
  one angle within ±π/2 (`TOE`). The ground's push on the toes passes to the foot; its moment about
  the hinge is the spring's, 25 N m/rad from rest (`SOURCES["falisse-2022-toes"]`), within 0.5 N m
  (`TOE_ON`, 0.02 rad), with a stop's reaction at a stop. A toe is searched only where the row
  bears on that foot's front. Toes are not colliders.

Each row is searched on each envelope from its seed posture (on `toe` also with the toes bent up,
`TOES_BENT`), then from random seeds; a row still holding nothing is searched from each other
envelope's held witness, toes at rest, marked `(envelope)`. The search holds the wrist's deviation
and the forearm's turn at the reference (`HELD`), so the palm lies as the wrist's flexion and the
shoulder put it. A held row is a witness; none found is not none.

Each cell: verdict, least share and support margin; the last column, the toes' angles on `toe`
(negative bent up) with the ground's moment about the hinge. The rows where the envelopes differ,
and the ones the findings name:

| row | route | boot | barefoot | toe | toes, rad (ground's moment) |
|---|---|---|---|---|---|
| stand | control | held 0.02, 91 mm | held 0.02, 52 mm | held 0.03, 28 mm | left 0.00 (0 N m); right 0.00 (0 N m) |
| fours | control | held 0.09, 285 mm | held 0.14, 440 mm | held 0.14, 458 mm | left 0.02 (0 N m); right 0.02 (0 N m) |
| kneel | S | held 0.04, 158 mm | held (boot) 0.04, 100 mm | unbalanced | - |
| fours, left knee light | K | held 0.20, 195 mm | held 0.47, 121 mm | held 0.95, 44 mm | left 0.00 (0 N m); right 0.17 (4 N m) |
| half kneel, hands | K | held (barefoot) 0.12, 335 mm | held 0.14, 511 mm | held (barefoot) 0.14, 514 mm | left 0.00 (0 N m); right 0.00 (0 N m) |
| half kneel | K | held 0.07, 22 mm | held 0.42, 18 mm | held 0.21, 22 mm | left 0.00 (0 N m); right -1.23 (-31 N m) |
| half kneel, knee light | K | held 0.15, 45 mm | held 0.47, 23 mm | held 0.19, 18 mm | left 0.00 (0 N m); right -1.23 (-31 N m) |
| kneel on toes | Q | held 0.06, 139 mm | held (boot) 0.07, 119 mm | held (boot) 0.46, 58 mm | left -0.46 (-11 N m); right -0.46 (-11 N m) |
| squat on toes @ 0.45 m | Q | held 0.13, 43 mm | held (boot) 0.14, 9 mm | unbalanced | - |
| squat on toes @ 0.50 m | Q | held 0.34, 0 mm | held 0.41, 0 mm | too weak | - |
| squat @ 0.45 m | Q | held 0.59, 18 mm | unbalanced | unbalanced | - |
| squat @ 0.50 m | Q | held 0.42, 36 mm | unbalanced | unbalanced | - |
| squat @ 0.55 m | Q | held 0.92, 17 mm | unbalanced | unbalanced | - |
| hands and feet | B | held 0.01, 521 mm | held 0.30, 106 mm | held 0.15, 519 mm | left 0.00 (0 N m); right 0.00 (0 N m) |
| hands and feet, hands light | B | held 0.60, 3 mm | unbalanced | unbalanced | - |
| squat on toes, hands light @ 0.40 m | B | held 0.31, 2 mm | unbalanced (boot) | too weak (boot) | - |
| squat on toes, hands light @ 0.45 m | B | held 0.69, 0 mm | unbalanced | unbalanced (boot) | - |
| kneel on toes, left knee light | K | held 0.71, 5 mm | unbalanced (boot) | unbalanced (boot) | - |
| kneel on toes, left leg light | K | held 0.66, 4 mm | held (boot) 0.70, 0 mm | unbalanced (boot) | - |
| half kneel on toes | K | held 0.06, 17 mm | held 0.42, 18 mm | held 0.21, 22 mm | left 0.00 (0 N m); right -1.23 (-31 N m) |
| half kneel on toes, hands | K | held 0.34, 130 mm | held 0.14, 511 mm | held (barefoot) 0.14, 514 mm | left 0.00 (0 N m); right 0.00 (0 N m) |

Held on all three, not shown: `squat on toes` at 0.55 to 0.80 m and `squat` at 0.60 to 0.80 m
(shares 0.06 to 0.81), `fours on toes, knees light`, `hands and toes` and its one-sided light rows,
`squat, hands @ 0.50 m`, `squat on toes, hands` at 0.30 to 0.50 m, `half kneel on toes, knee
light`, `lunge` at 0.60 to 0.80 m and `lunge, hands` at 0.40 and 0.50 m (shares 0.01 to 0.73).
The toes bend up to -1.23 rad where a front foot bears (ground's moment to -31 N m). Every row's cells are in
`docs/reference/man-postures.md@ecea5407`.

Held on no envelope (unbalanced or none found on each): `fours, hands light`, `kneel, left knee
light`, `half kneel, hands light`, `half kneel, one leg`, `kneel on toes, knees light`, `squat,
hands` at 0.60 to 0.80 m, `squat, hands light` at 0.50 to 0.80 m, `squat on toes, hands light` at
0.30, 0.35 and 0.50 m, `lunge, hands @ 0.60 m`, and `lunge, hands light` at 0.40 to 0.60 m.

- **No row the boot fails holds on the toe.** `kneel on toes, knees light` is unbalanced by 0.17 m
  on the boot, 0.06 m bare and 0.30 m on the toe. `half kneel, hands` holds on all three; the boot's
  witness is the bare foot's put back on the boot (0.12), which corrects the audit's none found.
- **The bare foot loses what stands on the foot's size.** The flat squat at 0.45 to 0.55 m and
  `hands and feet, hands light` hold only on the boot, and the half kneel asks three to six times
  the boot's share bare: the boot's box is a wider, longer base.
- **The toe loses the kneel and the low squats on the toes.** `kneel`, `squat on toes` at 0.45 and
  0.50 m and the two one-sided light kneels on the toes hold on the boot and not on the toe, and
  `kneel on toes` asks 0.46 against the boot's 0.06: at 25 N m a radian under 387 N on each ball,
  the toe turns until the moment balances, and the body must stand where that leaves the ball.
- **The palm buys the statics nothing.** Every hand-bearing row the boot holds also holds bare,
  most at a higher share (`hands and feet` 0.01 to 0.30), a few lower (`half kneel on toes, hands`
  0.34 to 0.14); the rows lost bare are those standing on the feet alone.
- The toe's spring and stops are prototype values (`man-anatomy.md`); a toe that stiffens as it
  bends was not measured.

## The holds and the transfer on the world

```
node research/control-foundation.mjs --suite posture-hold --envelope boot|barefoot --out <dir>
node research/native-posture-control.mjs --posture fours|half-kneel|squat --envelope boot|barefoot
node research/native-posture-control.mjs --transfer --envelope boot|barefoot
```

Node, the core's `World` at 120 Hz, vendored Rapier `adapter-9`, at `2f46395d`. Directional
actuation at the muscles' peaks (speed 10, activation 1), no assist, empty hands.

- **Starts.** The boot keeps the installed starts (`assets/research/posture-holds.json`: the
  coordinate-limit witnesses of `fours`, `half kneel, knee light` and `squat @ 0.50 m`; shares
  0.122, 0.232, 0.644, margins 367, 85, 9 mm). The bare foot starts from this record's barefoot
  witnesses of the same rows ([man-postures.json](man-postures.json)), built within 4e-8 m of the
  statics' posture: shares 0.136, 0.475, 0.674, margins 440, 23, 1 mm; its squat is at 0.60 m,
  since no barefoot squat at 0.50 m holds. The difference is the foot's: the boot's starts put on
  the bare foot ask 0.121 (`fours`) and 0.462 (the half kneel), and the 0.50 m squat cannot balance.
- **Direct.** The posture-hold suite's direct controller at servo 0.1, 0.03 and 0.01 s, 10 s
  watched from a 2 s checkpoint, on `rapier` (parent-axis limits); held is final drift under 20 mm
  with exact replay.
- **Native.** Offline rollouts (`nativePostureControl`: response 0.1 s, 3 iterations a step, servo
  0.01 s, the actuator controller) on `rapier-coordinate-coulomb`. A hold is 10 s under 20 mm. The
  transfer is 2 s at `fours`, 6 s of smoothstep to `half-kneel`, 10 s there; held if the body
  never stands more than 20 mm from its reference.
- **Hands.** Each step, each hand's pushing ground manifolds: points within 1 mm of the ground,
  their widest spread and the push, averaged over the steps the hand bears.

### Direct

| envelope | posture | servo, s | held | peak drift, mm | final drift, mm | peak angle error, rad |
|---|---|---|---|---|---|---|
| boot | fours | 0.1 | no | 55.7 | 55.7 | 0.114 |
| boot | fours | 0.03 | no | 22.8 | 22.8 | 0.041 |
| boot | fours | 0.01 | yes | 14.9 | 14.9 | 0.016 |
| boot | half kneel | 0.1 | no | 213.6 | 213.6 | 0.095 |
| boot | half kneel | 0.03 | no | 69.7 | 69.7 | 0.028 |
| boot | half kneel | 0.01 | no | 106.0 | 106.0 | 0.011 |
| boot | squat | 0.1 / 0.03 / 0.01 | no | 1657.7 to 1683.5 | 1324.4 to 1338.4 | 0.465 to 1.526 |
| barefoot | fours | 0.1 | no | 32.0 | 32.0 | 0.140 |
| barefoot | fours | 0.03 | no | 21.9 | 13.1 | 0.254 |
| barefoot | fours | 0.01 | yes | 9.0 | 8.8 | 0.325 |
| barefoot | half kneel | 0.1 / 0.03 / 0.01 | no | 1439.6 to 1503.7 | 1227.1 to 1322.6 | 0.778 to 1.243 |
| barefoot | squat | 0.1 | no | 1819.7 | 1360.7 | 0.233 |
| barefoot | squat | 0.03 | no | 140.2 | 125.5 | 0.046 |
| barefoot | squat | 0.01 | no | 119.8 | 60.1 | 0.034 |

Every run replays exactly; no muscle exceeds its bound by more than 2e-5 N m.

### Native

| envelope | run | held | peak drift, mm | final drift, mm | peak from reference, mm | peak effort, N m |
|---|---|---|---|---|---|---|
| boot | fours | yes | 10.3 | 9.7 | 10.3 | 68 |
| boot | half kneel | yes | 5.6 | 5.6 | 5.6 | 176 |
| boot | squat | no | 1109.2 | 738.9 | 1109.2 | 188 |
| boot | transfer | no | 1633.3 | 1545.6 | 1306.0 | 232 |
| barefoot | fours | yes | 10.4 | 10.3 | 10.4 | 77 |
| barefoot | half kneel | no | 1196.6 | 882.6 | 1196.6 | 259 |
| barefoot | squat | no | 1340.8 | 835.0 | 1340.8 | 198 |
| barefoot | transfer | no | 1567.8 | 1545.2 | 1178.2 | 198 |

The barefoot half kneel holds about 2 s and falls.

### The hands

| envelope | run | steps bearing, left/right | points, left/right | spread, mm, left/right | push, N, left/right |
|---|---|---|---|---|---|
| boot (capsule) | native fours | 1199/1199 | 2.96/2.96 | 147/147 | 115/121 |
| barefoot (palm) | native fours | 1200/1200 | 4.00/3.99 | 154/148 | 174/221 |
| boot (capsule) | native transfer | 539/556 | 2.42/2.40 | 65/62 | 98/127 |
| barefoot (palm) | native transfer | 510/553 | 3.85/3.50 | 112/84 | 159/222 |

The palm bears on about four points to the capsule's three (whose 147 mm in `fours` is its two
ends, a hand's length), and keeps its spread in the transfer as the hands turn.

### What the holds say

- On all fours the envelopes are alike: both hold under the native rollouts and the direct
  controller's tightest servo, the bare foot with less direct drift.
- The barefoot half kneel falls under both controllers, where the boot's holds natively and drifts
  70 to 214 mm directly; its start asks twice the boot's share at a quarter of its margin.
- The squat falls on both natively; directly the barefoot squat at 0.60 m drifts 120 to 140 mm and
  the boot's at 0.50 m falls.
- The transfer fails on both, the bare foot no nearer its reference.
