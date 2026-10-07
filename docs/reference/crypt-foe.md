# The crypt's foe, as sensed

The crypt hands each body its plan as orders with its target as the foe (`Orders.foe`), and the
body's mind finds its point on the foe as it senses it (`aimedOrders`): a fighter the foe's high
mark, the reptile the nearest point of its surface. Before, the run gave a fighter its target's
head as the target's body had last read it (`body.physical.head`), and computed the reptile's
point itself. A body's own reading is taken in its own step hook, so a fighter enlisted before its
target aimed at the head a step old and one enlisted after it at this step's; the senses read every
body at once, before every mind. The reptile's point is the same computation, moved.

## Measured

`node research/crypt-blows.mjs --seeds <1-32> --seconds 120 --companions 2`: Node, a crypt run with
no visuals, `rapier-coordinate`, 120 Hz; the hero exploring with two Warriors, to the run's end or
120 s. Before is `8c22d103`; after is the same tree with the foe ordered by id. 32 seeds each,
paired by seed.

| | Hero dead | Seconds run | Blows | Median blows a run | HP taken | Of it, by a body out of the fight |
|---|---|---|---|---|---|---|
| Before | 10 of 32 | 3465 | 5213 | 41.5 | 28.70 | 12.90 |
| After | 10 of 32 | 3344 | 2493 | 29.5 | 22.60 | 11.27 |

Paired by seed, 16 runs land fewer blows after and 12 more (4 the same); the HP taken by bodies
still in the fight falls in 15 and rises in 12. A run diverges from its pair within seconds, and
the blow totals are carried by a few long grinds on a fallen body (seed 26: 1059 then 419; seed 31:
542 then 1; seed 3: 449 then 546). The hero dies in as many runs. The change is a correction of
which step a fighter aims by, with no outcome measured to move.
