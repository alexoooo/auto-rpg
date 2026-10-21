# Man's hands on the punch

Whether Man's fitted hands ([Man's contact anatomy](man-anatomy.md)) change the Warrior's punch:
the spec's capsule hand against the palm hull (open) and the fist hull (closed), the fist's
`strike` on its surface. The fist hull puts the blow on a surface a fist has and carries more of
the arm; the palm hull leaves the open-hand blow unchanged at fine rates.

## Measurement

- Runner: `research/man-punch.mjs@d9ad04d3`, hulls from `research/man-hands.mjs@d9ad04d3`
  (`handsSpec`; the grip keeps its capsule, the feet the boot). Cells: `man-punch.json.gz`.
- Harness: Node, the unpinned core stand (`punchStand`, `research/punch-calibration.mjs`),
  workshop-fighter, empty hands, balance 0, `rapier-coordinate`
  (`rapier/adapter-9/sha256:1bb36b24…/coordinate-limits`), source fingerprint `7df7479d…`; the
  compliant pad, normal only; the planted punch cell of the force battery (`attack-force.mjs`:
  5 m/s, 0.12 s, elbow 0.5, matched feedback, 8 s).
- 768 cells: two geometries × two executions × both hands × straight and cross × both actuation
  laws × 120/480/960/1920 Hz × six placements (0.55/0.60/0.65 m ahead at 1.55 and 1.63 m), which
  stand in for repeats of a deterministic run.
- Executions: **fist**, `PLANTED_PUNCH_EXECUTION`, closes the hand and aims `strike`; **open**, the
  game's bare-hand blow, leaves the hand open and aims the knuckles.
- A cell counts when it has three clean force trials and does not fall. Under symmetric actuation
  the directional anatomical bound of `forceSummary` fails on both geometries alike (capsule 71,
  hull 56 of the closed-fist cells, about 87 of each open set): a property of that law, not the hand.

## Closed fist

| Rate (Hz) | Geometry | Measured | Impulse N s (sd) | Effective mass kg | Free-joint mass kg | 2 ms peak N | Contact from aim mm |
|---|---|---|---|---|---|---|---|
| 120 | capsule | 35/48 | 5.78 (1.26) | 1.16 | 0.88 | - | 30 |
| 120 | hull | 32/48 | 7.79 (2.03) | 1.62 | 1.12 | - | 43 |
| 480 | capsule | 46/48 | 3.66 (1.03) | 0.76 | 0.77 | - | 14 |
| 480 | hull | 46/48 | 5.40 (1.02) | 1.15 | 1.05 | - | 44 |
| 960 | capsule | 42/48 | 3.51 (0.83) | 0.73 | 0.73 | 264 | 13 |
| 960 | hull | 48/48 | 5.00 (0.89) | 1.07 | 1.05 | 302 | 45 |
| 1920 | capsule | 43/48 | 3.54 (0.66) | 0.74 | 0.72 | 261 | 14 |
| 1920 | hull | 45/48 | 4.67 (0.74) | 1.00 | 1.02 | 289 | 44 |

Effective mass is impulse over the last 10 cm's speed; free-joint mass is the hand chain's along
the contact normal (`contactMass`). Paired on the same cell, the hull's impulse less the capsule's
is 2.36, 1.73, 1.54 and 1.14 N s at 120 to 1920 Hz (Cohen's d 1.81–1.92, ratio 1.34–1.58); at
1920 Hz the hull leads in every hand, family and law (4.35–4.97 against 3.14–4.01 N s).

The capsule's impulse is settled from 960 Hz; the hull's falls about 7 % a doubling of the rate,
so 1920 Hz is not yet its limit. At the game's 120 Hz both read high, the hull more.

Where it lands, in the hand's frame at 1920 Hz (mm; along from the wrist, across toward the little
finger, dorsal positive); the middle knuckle is at 111 along, 23 dorsal:

| Geometry | Along | Across | Dorsal | Spread (sd) across, along |
|---|---|---|---|---|
| capsule | 132 | 3 to 4 | 23 | 5, 3 |
| hull | 122 | 21 | -1 to -3 | 20, 10 |

The capsule lands on its rounded end, 21 mm past the knuckle, where a closed hand has no surface.
The hull lands on the flat of the folded ring and middle fingers, about 2 cm toward the little
finger and 2.5 cm palmar of the knuckle line, and wanders twice as far: the executor presents the
fist's lower face, not its index and middle knuckles, a control matter the capsule's end hid.

## Open hand, the game's blow

| Rate (Hz) | Geometry | Measured | Impulse N s (sd) | Effective mass kg | Free-joint mass kg | Contact from knuckles mm |
|---|---|---|---|---|---|---|
| 120 | capsule | 48/48 | 4.40 (0.94) | 0.91 | 0.29 | 82 |
| 120 | hull | 48/48 | 5.20 (1.31) | 1.07 | 0.47 | 81 |
| 960 | capsule | 48/48 | 4.05 (0.98) | 0.90 | 0.28 | 89 |
| 960 | hull | 48/48 | 4.23 (1.18) | 0.95 | 0.40 | 89 |
| 1920 | capsule | 48/48 | 4.25 (1.31) | 0.94 | 0.28 | 91 |
| 1920 | hull | 48/48 | 4.10 (1.25) | 0.92 | 0.39 | 91 |

Paired, hull less capsule: 0.81 N s at 120 Hz (d 0.77), 0.19 at 960 (d 0.15), -0.15 at 1920
(d -0.10). The open hand strikes with its fingertips on either geometry (capsule end at 197 mm
along; palm hull's fingers at 190 mm, 37 mm toward the little finger), while the renderer draws a
fist (`src/render/strike-hands.ts`).
