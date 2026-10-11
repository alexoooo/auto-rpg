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
