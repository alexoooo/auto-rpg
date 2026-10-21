# The crypt's foe, as sensed

The crypt hands each body its plan as orders with its target as the foe (`Orders.foe`), and the
body's mind finds its point on the foe as it senses it (`aimedOrders`): a fighter the foe's high
mark, the reptile the nearest point of its surface. The senses read every body at once, before
every mind, so every fighter aims by the same step whatever order the bodies were enlisted in.

## Measurement

`node research/crypt-blows.mjs --seeds <1-32> --seconds 120 --companions 2`: Node, a crypt run with
no visuals, `rapier-coordinate`, 120 Hz; the hero exploring with two Warriors, to the run's end or
120 s, 32 seeds paired by seed. The aim by the foe is against `8c22d103`, where the run gave a
fighter its target's head as that body last read it (`body.physical.head`), in its own step hook,
so a fighter enlisted before its target aimed by a step-old head.

| | Hero dead | Seconds run | Blows | Median blows a run | HP taken | Of it, by a body out of the fight |
|---|---|---|---|---|---|---|
| The last-read head (`8c22d103`) | 10 of 32 | 3465 | 5213 | 41.5 | 28.70 | 12.90 |
| The sensed foe | 10 of 32 | 3344 | 2493 | 29.5 | 22.60 | 11.27 |

Paired by seed, 16 runs land fewer blows with the sensed foe and 12 more (4 the same); the HP taken
by bodies still in the fight falls in 15 and rises in 12. A run diverges from its pair within
seconds, and the blow totals are carried by a few long grinds on a fallen body (seed 26: 1059 and
419; seed 31: 542 and 1; seed 3: 449 and 546). The hero dies in as many runs: the change corrects
which step a fighter aims by, with no outcome shown to move.
