# When a body's down is read

Every body answers whether it is down (`Body.down`) with what its mind read at its look, the
step's first reading, before physics moves it. A humanoid caches it there (`state.down`,
`src/core/body.ts`); the reptile keeps it with its state too (its host's `look`, which its
`QuadrupedView` reads), and its body answers with that, so a fork or a load answers alike. Before,
the reptile's body read its down rule afresh whenever it was asked, so a fight that asked after
the physics step saw the reptile down a step before its own mind did, and a step before it would
have seen a humanoid in the same pose down.

## Measured

`node research/reptile-down.mjs@6d565300 --shard <i> --of 12`: Node, core world, `rapier-coordinate`,
120 Hz; the Arena with the reptile (`crawl`) on the left against the Warrior under each humanoid
controller, bare-handed and with a club, and against a reptile, at gaps of 2 to 4 m by 0.25 m,
60 s each: 99 bouts. Before is `b7edb00f`; after is the same tree with the reptile's body
answering from its view. Paired by recipe.

| | Bouts | The reptile down | Verdict a step later | Otherwise identical |
|---|---|---|---|---|
| Before and after | 99 | 46 in both | 46 | 53 |

In every bout where the reptile went down it went down in both trees, the bout ended by its fall
one step later than before, and the winner and the ending are the same; the other 53 bouts are the
same to the step. The reptile never went down against a reptile. The Kicker's rows equal the
Scrapper's: it kicked the reptile in none of them.

## What touches the ground

A fight reads a body that stands down when a segment but its feet and hands is within 3 cm of
its lowest point (`DownSpec` `touch`, `fallen` in `src/core/control/ground.ts`), whatever height
its mind asks: a crouch or a fold on its hands is not a fall, and a knee, a seat or a back on the
ground is. Its mind reads its own body by the height bar under the height it asks (`down`).

`touch-probe` (Node, core world, Rapier, 120 Hz): the Warrior against the Rogue under each preset
against itself (Options, Classic, Puncher, Counter-puncher, Scrapper, Behaviours), empty-handed and
with clubs, 30 s or to a verdict, 15 s to rise; at every step of each body, the least clearance of
a segment but the feet and hands over the body's lowest point, binned by how far its centre of
mass is under its standing height.

| Under standing, m | Body-steps | Least clearance, m | Under 2 / 3 / 5 cm |
|---|---|---|---|
| 0.0-0.1 | 77073 | 0.065 | 0 / 0 / 0 |
| 0.1-0.2 | 400 | 0.065 | 0 / 0 / 0 |
| 0.2-0.3 | 620 | 0.065 | 0 / 0 / 0 |
| 0.3-0.4 | 366 | 0.066 | 0 / 0 / 0 |
| 0.4-0.5 | 22 | 0.071 | 0 / 0 / 0 |
| 0.5-0.6 | 11 | 0.069 | 0 / 0 / 0 |
| 0.6-0.7 | 107 | 0.000 | 103 / 103 / 104 |
| 0.7-0.8 | 115 | 0.000 | 115 / 115 / 115 |

Up to 0.6 m under standing, which takes in the Scrapper's downward strike and its fold onto its
hands (asked 0.5 m lower), no other part came within 6.5 cm of the ground; a body further down
lay on it in 218 of 222 steps, the other four falling. The bar, 3 cm, is about half the least
clearance kept standing.
