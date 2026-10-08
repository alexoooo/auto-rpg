# Man's hands on the punch

Whether Man's fitted hands ([Man's contact anatomy](man-anatomy.md)) change the Warrior's punch:
the spec's capsule hand against the palm hull (open) and the fist hull (closed), with the fist's
`strike` on its surface. `research/man-punch.mjs` runs it; `research/man-hands.mjs` (`handsSpec`)
gives the hulls, the grip keeping its capsule and the feet the boot. The cells are in
`man-punch.json.gz` beside this record.

**Harness.** Node, the unpinned core stand (`punchStand`, `research/punch-calibration.mjs`),
workshop-fighter, empty hands, balance 0, engine `rapier-coordinate`
(`rapier/adapter-9/sha256:1bb36b24…/coordinate-limits`), source fingerprint `7df7479d…`. The
compliant pad, normal only, the planted executor of the force battery's punch cell
(`attack-force.mjs`: 5 m/s contact speed, 0.12 s, elbow 0.5, matched feedback, 8 s).

**Cells.** 768: two geometries; two executions; both hands; straight and cross; both actuation
laws; 120, 480, 960 and 1920 Hz; six target placements (0.55, 0.60, 0.65 m ahead at 1.55 and
1.63 m). One placement is one sample of a deterministic run, so the placements stand in for
repeats. The executions:

- **fist**: `PLANTED_PUNCH_EXECUTION`, which closes the hand for its cycle and aims `strike`;
- **open**: no execution, the game's own bare-hand blow, which leaves the hand open and aims the
  knuckles. No game controller closes a hand.

A cell is measured when it has three clean force trials and does not fall; the tables average
the measured cells' trials. The battery's acceptance adds the bound and return checks
(`forceSummary`). Under symmetric actuation the directional anatomical bound fails on both
geometries alike (capsule 71 and hull 56 of the closed-fist cells, about 87 of each open set),
a property of that actuation law under this protocol, not of the hand.

## Closed fist

| rate | geometry | measured | impulse N s (sd over cells) | effective mass kg | free-joint mass kg | 2 ms peak N | contact from aim mm |
|---|---|---|---|---|---|---|---|
| 120 | capsule | 35/48 | 5.78 (1.26) | 1.16 | 0.88 | - | 30 |
| 120 | hull | 32/48 | 7.79 (2.03) | 1.62 | 1.12 | - | 43 |
| 480 | capsule | 46/48 | 3.66 (1.03) | 0.76 | 0.77 | - | 14 |
| 480 | hull | 46/48 | 5.40 (1.02) | 1.15 | 1.05 | - | 44 |
| 960 | capsule | 42/48 | 3.51 (0.83) | 0.73 | 0.73 | 264 | 13 |
| 960 | hull | 48/48 | 5.00 (0.89) | 1.07 | 1.05 | 302 | 45 |
| 1920 | capsule | 43/48 | 3.54 (0.66) | 0.74 | 0.72 | 261 | 14 |
| 1920 | hull | 45/48 | 4.67 (0.74) | 1.00 | 1.02 | 289 | 44 |

Effective mass is impulse over the last 10 cm's speed; free-joint mass is the hand chain's mass
along the contact normal at the contact point (`contactMass`). The 2 ms peak needs a step under
2 ms.

Paired on the same cell, both measured, the hull's impulse less the capsule's:

| rate | pairs | difference N s (sd) | Cohen's d | ratio |
|---|---|---|---|---|
| 120 | 24 | 2.36 (1.25) | 1.89 | 1.45 |
| 480 | 44 | 1.73 (0.90) | 1.92 | 1.58 |
| 960 | 42 | 1.54 (0.85) | 1.81 | 1.55 |
| 1920 | 42 | 1.14 (0.61) | 1.88 | 1.34 |

At 1920 Hz the hull is ahead in every hand, family and law: 4.35 to 4.97 N s against the
capsule's 3.14 to 4.01.

**Where it lands.** In the hand's frame at 1920 Hz (mm; along the hand from the wrist, across it,
and dorsal positive):

| geometry | along | across, toward the little finger | dorsal | spread (sd) across, along |
|---|---|---|---|---|
| capsule | 132 | 3 to 4 | 23 | 5, 3 |
| hull | 122 | 21 | -1 to -3 | 20, 10 |

The middle knuckle is at 111 along and 23 dorsal on both. The capsule lands on its rounded end,
21 mm past the knuckle, where a closed hand has no surface. The hull lands on the flat of the
folded ring and middle fingers, about 2 cm toward the little finger and 2.5 cm palmar of the
knuckle line, the same on both hands, and the spot wanders by twice the capsule's spread. The
executor presents the fist's lower face, not its index and middle knuckles; the capsule's round
end hid that.

**Convergence.** The capsule's impulse is settled from 960 Hz (3.51, 3.54). The hull's falls by
about 7 % for each doubling of the rate (5.40, 5.00, 4.67), so its value at 1920 Hz is not yet
its limit. The paired difference holds at every rate, with d near 1.9. At the game's 120 Hz both
read high, the hull's by more (7.79 against 5.78).

## Open hand, the game's blow

| rate | geometry | measured | impulse N s (sd) | effective mass kg | free-joint mass kg | contact from knuckles mm |
|---|---|---|---|---|---|---|
| 120 | capsule | 48/48 | 4.40 (0.94) | 0.91 | 0.29 | 82 |
| 120 | hull | 48/48 | 5.20 (1.31) | 1.07 | 0.47 | 81 |
| 960 | capsule | 48/48 | 4.05 (0.98) | 0.90 | 0.28 | 89 |
| 960 | hull | 48/48 | 4.23 (1.18) | 0.95 | 0.40 | 89 |
| 1920 | capsule | 48/48 | 4.25 (1.31) | 0.94 | 0.28 | 91 |
| 1920 | hull | 48/48 | 4.10 (1.25) | 0.92 | 0.39 | 91 |

Paired, the hull less the capsule: 0.81 N s at 120 Hz (d 0.77), 0.19 at 960 (d 0.15), -0.15 at
1920 (d -0.10). The open hand strikes with its fingertips on either geometry: the capsule's end
at 197 mm along the hand, the palm hull's fingers at 190 mm and 37 mm toward the little finger.
The palm changes the game's blow only at 120 Hz, and by less than the spread between cells.

## What it says

- The fist hull puts the closed hand's blow on a surface a fist has, and it carries more of the
  arm: about two fifths more free-joint mass at the contact and a third more impulse at 1920 Hz,
  in every cell kind.
- The executor lands the fist on its lower face and with a wandering spot. That is a control
  matter, now visible because the hull no longer rounds it off.
- The palm does not change the open-hand blow at fine rates. Today's game blows land on the
  fingertips, open, while the renderer draws a fist (`src/render/strike-hands.ts`); with the
  palm hull those fingers are straight.
