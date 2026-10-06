# Combat strike trajectories

The shared combat skill asks ordinary hand goals, supported stance and sourced muscle commands.
It changes no body strength, damage rule or assist ceiling. Tactical actions name a hand, an
observed world target and a trajectory family. Initial scope: Warrior empty hands.

## Trajectory settings

`ATTACK_PATH` contains experimental search cells: chamber 0.22 s, swing 0.12 s, return 0.32 s,
contact velocity 5 m/s, windup 0.12 m, cross offset 0.05 m, follow-through 0.04 s, thoracic
rotation 0.2 rad clamped to the actual joint limits. The chamber and return gates ask point
error below 0.05 m and body-relative speed below 0.6 m/s for 0.05 s. Preparation times out at
0.8 s and return at 1.2 s. Startup waits 2 s. The timing cell is retained from the physical
sweep below; it does not establish competitive strength.

Hook and downward actions currently select a chamber for a straight outbound segment. Curved
and multi-segment paths remain research work; these labels do not establish an arc repertoire.

Terminal velocity uses the shared quintic Hermite path. Its continuation beyond the endpoint
is linear, so the IK finite differences preserve the requested contact rate. A segment identity
starts each new path; moving targets within a segment retain its original start and clock.
The actual point position and velocity, rather than the interpolation clock alone, admit launch
and verify return. A new external contact interrupts the stroke. Sustained pressure is recorded
separately in the autonomous combat evaluator.

## Initial timing sweep

Node unpinned core stand, rapier-coordinate, 120 Hz, symmetric muscles, Warrior empty right
hand, balance 0. Twelve cells run against a fixed obstruction and the same point in empty space
for 8 s each. The target is (0.15, 1.63, 0.65) m. Peaks are driven forward velocity relative
to own COM, sampled during the swing before contact. Contact columns use the preceding sample.
These are commanded point trajectories, not measured muscle work.

| Family | Swing (s) | Terminal ask (m/s) | Min. contact forward speed (m/s) | Verified returns hit/miss | Failures hit/miss | Falls hit/miss |
|---|---:|---:|---:|---:|---:|---:|
| straight | 0.12 | 3 | 3.439 | 7/7 | 0/0 | 0/0 |
| straight | 0.12 | 5 | 4.604 | 7/7 | 0/0 | 0/0 |
| straight | 0.15 | 3 | 3.951 | 7/7 | 0/0 | 0/0 |
| straight | 0.15 | 5 | 4.393 | 7/7 | 0/0 | 0/0 |
| straight | 0.18 | 3 | 3.163 | 7/7 | 0/0 | 0/0 |
| straight | 0.18 | 5 | 4.244 | 7/6 | 0/0 | 0/0 |
| cross | 0.12 | 3 | -0.173 | 7/7 | 0/0 | 0/0 |
| cross | 0.12 | 5 | 4.679 | 7/7 | 0/0 | 0/0 |
| cross | 0.15 | 3 | 4.421 | 7/7 | 0/0 | 0/0 |
| cross | 0.15 | 5 | 4.308 | 7/6 | 0/0 | 0/0 |
| cross | 0.18 | 3 | 3.558 | 7/6 | 0/0 | 0/0 |
| cross | 0.18 | 5 | 3.833 | 6/7 | 0/0 | 0/0 |

The retained initial cell is 0.12 s and 5 m/s: both straight and cross avoid the weak
late contacts of the slower cells, while preserving repeated returns and balance on the miss.
A separate left-hand straight probe returns seven times in 8 s with zero failures/falls and
4.62?4.78 m/s forward contact speed. Neither this table nor the fixed obstruction measures
autonomous target damage or competence against an attacking opponent.

## Tactical settings

`COMBAT` contains these tactical search cells: range band and arm reserve 0.08 m, braking horizon 0.5 s,
target prediction 0.12 s, pressure threshold and escape duration 0.6 s, fallback/lateral
pace 0.2 m/s, three observed blocks before a lateral escape, launch settle hold 0.08 s and COM launch speed below 0.35 m/s. They permit
experiments through immutable config overrides; competitive selection remains pending.

## Autonomous prototype

Node Arena Duel, rapier-coordinate, 120 Hz, Warrior empty hands, balance 0/0, continuing
recovery, 30 s cap. Six diagnostics are stored in `combat-prototype-bouts.json`. At 4 m,
prototype self-play gives 19/20 driven contacts, all intercepted by hands/forearms, 0.127/0.130 hp
driven damage, no falls and 1.2 s longest pressure-only runs. Against Point the prototype
produces 25 and 19 driven contacts in the two assignments versus Point's 4 and 1. It wins
both at the cap; this is two fixtures, not a rating or a decisive combat result. Against
Classic the assignments split cap wins. Opening selection and stronger target contact remain
required; more hand contacts alone do not satisfy promotion.

## Opening selection

`OPENINGS` ranks collider-derived head, upper-trunk and middle-trunk surfaces. Linear/spin
prediction is 0.12 s. Blocked lanes cost 2, working-range error costs 2 per metre, and the
hand-radius margin is half its sourced radius. Surface priorities are 0, 0.2 and 0.4 respectively.
A repeated blocked surface adds 1 to the rank. Surface samples use elevations of -0.5, 0 and 0.5 radii. These are development search cells. The selector sees sensed poses, shapes and velocities;
it receives no wounds, orders or opposing controller phase. Curved lanes, explicit sense-age
compensation and general low support remain work to measure.


The six 30 s Node Arena diagnostics in `combat-openings-bouts.json` use rapier-coordinate,
120 Hz, empty Warriors, balance 0/0 and continuing recovery. At 4 m, self-play produces
16/19 driven blows (15/19 blocks), 0.079/0.084 hp driven damage and no falls. At 1.2 m it
produces 14/16 driven blows, mostly blocks. Both Point assignments end with a Combat cap
win, while Classic assignments split. These fixtures demonstrate contact response and
initiative, with mixed damage changes from the head-only prototype. They do not establish
competitive promotion. The head-only variant remains reproducible through `targeting: "head"`.


Built-browser inspection uses the selectable Combat mode on two empty-handed Warriors,
rapier-coordinate at the shared 120 Hz world rate, balance 0/0, continuing recovery. The
visible HUD advances through approach, chamber and return, and Tactical view displays both
physical bodies. The check reaches 14 s of the bout and verifies the recipe choices. It is
performed alongside the full Node suite and establishes no frame-time budget. The owned
preview server and tab are stopped after inspection.
