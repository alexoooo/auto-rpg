# Unassisted combat locomotion

The published `assets/core/stance-envelope.json` is a parent-axis Rapier reference,
measured in GUARD with the character's balance allowance and empty hand/club variants.
Its generic harness label does not establish the coordinate engine's capability at
balance zero. `Body.envelope` still supplies this reference table; an optional shared
locomotion `turnLimit` can impose a lower heading-speed ceiling. It never increases
the table's speed or turn allowance. This correction does not establish a complete
replacement envelope across bodies, equipment, assistance or contact conditions.

## Half-turn battery

`research/combat-locomotion.mjs`'s `combatTurn` runs an unpinned Warrior with empty
hands in GUARD on the Node core stand, rapier-coordinate, 120 Hz, symmetric actuation,
balance 0. The shared locomotion skill receives a forward walk after one second;
the requested heading turns half round at the specified rate, either immediately
or after an established walk. It then walks three seconds and stops for two.
There are no opponents, imposed impulses, installed poses, recovery policies or
external support. The body uses ordinary sourced muscles and unchanged stance tuning.

`combat-locomotion-probes.json` retains the 72-job manifest and whole physical
results, measured on the tree of the commit that last changed it. The uncapped calibration deliberately gives locomotion no
reference envelope, allowing the specified turn rate to reach the body. The ceiling
comparison uses that same path with `turnLimit: 2`. Every cell can be reproduced by
passing its recorded config to `combatTurn`; runs use separate worker threads with
one sequential loop in each.

| Walk speed (m/s) | Requested rate (rad/s) | Falls / four ways (left/right, delay 0/3 s) |
|---:|---:|---:|
| 0.18 | 1 / 2 / 4 | 0 / 0 / 0 |
| 0.25 | 1 / 2 / 4 | 0 / 0 / 0 |
| 0.50 | 1 / 2 / 4 | 0 / 0 / 0 |

Every one of the 72 cells stays upright and settles to the standing phase, with every
assist meter zero: the 36 initial cells, the 24 at rates 2/4, both directions, delays
0.3/0.6 s, and the twelve 4 rad/s requests under the 2 rad/s ceiling. A step lands
facing the heading only as far as the bearing foot's hip lets the pelvis turn over it
(`landingHeading`, `src/core/control/support.ts`), so a turn faster than that is taken
step by step. Without that rule, three left turns at 4 rad/s begun as the walk set off
fell, one at each speed.

The ceiling is an optional policy setting, plain immutable config applied to ordinary
skills as well, leaving policy and physical execution separate. Abrupt lateral or
backward changes, collisions with a grounded opponent and return from a planted fold
require separate checks; no complete turn-speed envelope or strength change is claimed.

`tests/core-combat-locomotion.test.mjs` repeats the three cells that fell, with and
without the ceiling. A real Arena approach checks the actual heading change on both
assignments and forks to a fresh world with identical whole state and pose traces.


## Arena ablation

`combat-turn-development.json` retains the complete 96-bout matched comparison,
with frozen source identity and separate group ratings. Node Arena Duel,
rapier-coordinate, 120 Hz, Warrior fists, balance 0/0, continuing recovery and 60 s
caps. Each setting uses eight mirrored recipes per opponent: development indices
8-15 against Point/Brawler and reused held-out-family indices 100-107 against
Classic. Reused recipes are development evidence, not a fresh promotion sample.
Both profiles use Scrapper's low combat and additional spacing 0.10 m.

| Opponent | Turn ceiling | Wins/draws/losses / 16 | Driven/received driven HP per second | Candidate/opponent falls | Low driven blows |
|---|---|---:|---:|---:|---:|
| Classic | Reference envelope | 15/0/1 | 0.003239 / 0.000091 | 5/15 | 9 |
| Classic | 2 rad/s | 15/0/1 | 0.003013 / 0.000086 | 3/15 | 6 |
| Point | Reference envelope | 15/1/0 | 0.005597 / 0.000053 | 0/0 | 0 |
| Point | 2 rad/s | 16/0/0 | 0.003945 / 0.000037 | 0/0 | 0 |
| Brawler | Reference envelope | 16/0/0 | 0.018593 / 0.010031 | 0/0 | 0 |
| Brawler | 2 rad/s | 15/0/1 | 0.020586 / 0.010205 | 0/0 | 0 |

The capped candidate records fewer Classic falls and about 11% more outgoing
Brawler damage, but less Point damage. Each profile wins 46 of the 48 bouts, with
one draw in the reference profile. Every outcome is at the cap. This small matched
comparison supports testing the ceiling as a stability setting; it proves neither
universal fall safety nor stronger finishing. The standalone startup failures do
not identify which Arena falls the setting prevents.
