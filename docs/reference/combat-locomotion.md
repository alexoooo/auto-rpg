# Unassisted combat locomotion

How fast an unassisted Warrior can turn as it walks, and the optional heading-speed ceiling
`turnLimit` (`StanceWalkConfig`, `src/core/mind/config.ts`; `src/core/skills/locomotion.ts`).
`assets/core/stance-envelope.json` (`Body.envelope`) is a parent-axis Rapier table read in GUARD
with the character's balance; it says nothing of the coordinate engine at balance 0. `turnLimit`
can only lower that table's turn allowance, never raise it.

## Half-turn battery

`combatTurn` (`research/combat-locomotion.mjs`): unpinned Warrior, empty hands, GUARD, Node core
stand, rapier-coordinate, 120 Hz, symmetric actuation, balance 0, no opponent, impulse, installed
pose or recovery policy. A forward walk starts after 1 s; the asked heading turns half round at the
given rate, at once or after an established walk; then 3 s of walking and 2 s stopped. The
uncapped calibration gives locomotion no envelope so the asked rate reaches the body; the ceiling
cells use `turnLimit: 2`. `combat-locomotion-probes.json` holds the 72 configs and results; each
replays through `combatTurn`.

| Walk speed (m/s) | Asked rate (rad/s) | Falls / four ways (left/right, delay 0/3 s) |
|---:|---:|---:|
| 0.18 | 1 / 2 / 4 | 0 / 0 / 0 |
| 0.25 | 1 / 2 / 4 | 0 / 0 / 0 |
| 0.50 | 1 / 2 / 4 | 0 / 0 / 0 |

All 72 cells (also rates 2/4 at delays 0.3/0.6 s, and 4 rad/s under the 2 rad/s ceiling) stay up
and settle standing with every assist meter at zero. A step lands facing the heading only as far
as the bearing hip lets the pelvis turn over it (`landingHeading`, `src/core/control/support.ts`),
so a faster turn is taken step by step. Without that rule three left turns at 4 rad/s begun as the
walk set off fell, one at each speed; `tests/core-combat-locomotion.test.mjs` repeats those cells.

## Arena ablation

`combat-turn-development.json`: 96 bouts, Node Arena Duel, rapier-coordinate, 120 Hz, Warrior
fists, balance 0/0, continuing recovery, 60 s cap; eight mirrored recipes per opponent
(development 8–15 against Point and Brawler, reused held-out 100–107 against Classic). Both
profiles are Scrapper with extra spacing 0.10 m.

| Opponent | Turn ceiling | W/D/L / 16 | Driven / received HP per s | Own/opponent falls |
|---|---|---:|---:|---:|
| Classic | envelope | 15/0/1 | 0.003239 / 0.000091 | 5/15 |
| Classic | 2 rad/s | 15/0/1 | 0.003013 / 0.000086 | 3/15 |
| Point | envelope | 15/1/0 | 0.005597 / 0.000053 | 0/0 |
| Point | 2 rad/s | 16/0/0 | 0.003945 / 0.000037 | 0/0 |
| Brawler | envelope | 16/0/0 | 0.018593 / 0.010031 | 0/0 |
| Brawler | 2 rad/s | 15/0/1 | 0.020586 / 0.010205 | 0/0 |

Every outcome is at the cap. The ceiling gives fewer Classic falls and about 11 % more Brawler
damage, but less Point damage; each profile wins 46 of 48. It supports the ceiling as a stability
setting, not as stronger play.
