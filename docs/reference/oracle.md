# The oracle

The readings of the oracle (`research/oracle.mjs`): for one side of an arena bout, how it does when
at every half second it tries a handful of orders in forks of the true world and takes the best,
beside the same bout under its tactics alone. The oracle is an instrument, not a mind: it holds the
true world, which no mind may, so what it reports is the ceiling of the space it searched and of
nothing wider, and every figure names its responses, its period and its horizon.

## The search

One-step lookahead over the side's own tactics (`seekFoe`). At each decision, every 0.5 s, each of
seven responses (`responsesAt`, `research/rollouts.mjs`) is held for 0.5 s in a fork of the bout,
the side then handed back to its tactics, and the fork valued 2 s after the decision.

| Response | The orders held |
|---|---|
| `own` | none: the side's own tactics |
| `attack` | stand, face the foe, attack where its head is at the decision |
| `hold` | stand, face the foe |
| `close` | walk at the foe |
| `back` | walk from the foe, facing it |
| `left`, `right` | walk to the body's own left or right, facing the foe |

A fork's value to the side (`valueOf`) is its bar less its foe's, a point more with its foe out of
the fight and a point less out itself. The choice is the greatest, the first of equals
(`chooseResponse`), and `own` is first, so a response is taken only when it beats the tactics'
own.

A fork is a load: the oracle saves its bout at the decision (`Duel.save`), and a worker's bout of
the same recipe is put there (`Duel.load`) and played on under the response (`rollout`).
`--replay` forks by playing the bout again from its recipe and tape instead; the two make the same
choices ([Cost](#cost)). Every fork's poses at the decision must be the bout's, by their digest, or
the oracle throws.

- **Clairvoyant**: each response is played in one fork of the true world, which plays the other
  side's exact future.
- **Blind** (`--blind n`): each response in n forks, each nudged by an impulse at both bodies'
  roots (`--nudge`, 0.5 N s, in a level direction drawn for the decision and the fork), valued by
  their mean.

## The tables

Harness: Node, the core world (`src/core/world.ts`), Rapier, 120 Hz. The nine matchups at a gap of
4 m, the oracle playing each side in turn, each bout to its verdict or the 120 s cap; forks by a
load. The rows are in git history; each matchup is fought once, so every figure is a count of 18
sides and not a rate.

```powershell
node research/oracle.mjs --all --side both --workers 14 --out research/runs/oracle-cap
node research/oracle.mjs --all --side both --blind 4 --workers 14 --out research/runs/oracle-blind
node research/oracle.mjs --all --side both --balance 25,25 --workers 14 --out research/runs/oracle-balance
```

"With balance" is clairvoyant, both sides at 25 % ([assist](assist.md)); the others at each
character's 0 %. A bout's value is its end to the side, as a fork's is.

| | Clairvoyant | Blind | With balance |
|---|---|---|---|
| The oracle's bout ends better, worse, the same, by its value | 8, 5, 5 | 9, 5, 4 | 10, 6, 2 |
| Mean value at the end | 0.584 | 0.464 | 0.679 |
| Of the 9 sides that lose under their tactics: won, lost, the same bout | 6, 2, 1 | 6, 2, 1 | 6, 3, 0 |
| Of the 9 that win: won, lost | 8, 1 | 7, 2 | 9, 0 |
| Decisions, and those that left the tactics | 794, 58 (7.3 %) | 662, 65 (9.8 %) | 2714, 223 (8.2 %) |
| `hold`, `left`, `close`, `back`, `right`, `attack` | 20, 11, 10, 9, 7, 1 | 15, 16, 11, 13, 8, 2 | 77, 57, 36, 26, 20, 7 |
| The oracle's 18 bouts end by a fall, a wound, at the cap | 17, 1, 0 | 14, 4, 0 | 5, 6, 7 |
| The tactics' 9 bouts | 7, 2, 0 | 7, 2, 0 | 3, 5, 1 |

- **With no balance the ceiling is on not falling.** Clairvoyant, the 6 bouts turned from a loss to
  a win all end with the foe fallen, and 17 of 18 end by a fall. What the oracle finds is "do not
  fall, and be standing when the other does", not fencing skill.
- **Little of that ceiling is knowing the exact future.** Blind, it still turns 6 of the 9 lost
  bouts, 5 of them the clairvoyant search's, at a mean value of 0.464 beside 0.584; what it gives
  up is on the winning side.
- **The blind search knows the other side's future to a few centimetres.** In three of the
  tactics' bouts (103 decisions, 412 nudged forks beside the true fork under `own`;
  `node research/oracle-spread.mjs --left <model> --right <model>`), no nudged fork ends in the
  true fork's poses, the furthest centre of mass stands a median of 5, 5 and 1 cm from the true
  fork's 2 s on, and 22 forks put other bodies out of the fight. It does not say what a mind that
  must guess the other's intent would keep.
- **With balance a gain is seldom a fall, and it is mostly time.** The 6 turned bouts end by a
  wound in 2, by the foe's fall in 2 and at the cap ahead on bars in 2; 3 more are carried to the
  cap and lost there. The oracle's bouts last 75 s on average where the tactics' last 43 s. A
  search that values 2 s on finds how not to be hit, not how to end a bout.
- **`attack` is almost never taken** (1 of 794, 2 of 662, 7 of 2714): within reach the tactics
  already attack the head, and a strike ordered where the head stood seldom beats them.
- **Its promise is 2 s long.** The mean believed gain a decision (the best response's value less
  `own`'s) is under a tenth everywhere, and a bout can still end worse: clairvoyant in 5 of 18.
- **The cap matters.** At 30 s the clairvoyant oracle ended better in 9 of 18 sides, three decided
  on bars at the cap; at 120 s those three end by a fall at 57.4, 50.6 and 40.6 s, one of them worse
  than under its tactics.

Not shown: a rate (run `--gap` at several gaps), anything of a mind (no fork hides what the other
side will do), a wider search (no strike or guard is named, nothing planned past one period), and a
blind search with balance.

## Cost

A fork by a load costs the steps it plays out; a fork by replay costs the bout up to it as well,
so a bout's cost by replay grows with the square of its length. One bout both ways (the Warrior
against the Rogue, from the left, cap 30 s, 43 decisions, 301 forks, 14 workers;
`--left workshop-fighter --right workshop-rogue --seconds 30`, with `--replay` and without) prints
one row and one tape:

| A fork | The forks' steps | Wall, s |
|---|---:|---:|
| by replay | 447 681 | 112 |
| by a load | 68 421 | 27 |

The tables above, each on 14 workers:

| Table | Forks | Their steps | Wall, s |
|---|---:|---:|---:|
| Clairvoyant | 5558 | 1 260 892 | 232 |
| Blind, 4 forks | 18 536 | 4 196 035 | 677 |
| With balance | 18 998 | 4 489 802 | 776 |

A save of the Warrior against the Rogue at step 1200 is 338 620 bytes of the engine's snapshot and
30 565 bytes of state (`v8.serialize`). On one quiet thread (Node, Rapier, 120 Hz; the mean of 200)
taking it is 0.8 ms, loading it 0.7 ms and copying it to a worker (`structuredClone`) 0.5 ms,
beside 1.4 ms for a step of that bout.

## Watching one

`--out` writes each oracle bout's recipe and tape, and prints the link that plays it: the matchup,
gap, cap and any balance in the query, the tape in the fragment (`#tape=`,
`src/arena/matchup.ts`). The arena plays a link with a tape by itself, with " · replay" at its
clock. All 54 links of the three tables, read as the page reads them (`readMatchup`, `readGap`,
`readCap`, `readBalance`, `readTape`) and played in Node, end as the oracle's rows say.

The clairvoyant bout that turns on one decision: the Rogue against the skeleton, from the right,
holds still for half a second at 11.5 s and wins a bout it lost
(`?play=arena&matchup=crypt-skeleton,workshop-rogue` for the tactics alone):

```
?play=arena&matchup=crypt-skeleton,workshop-rogue&gap=4&cap=120#tape=%5B%7B%22step%22%3A1380%2C%22side%22%3A%22right%22%2C%22orders%22%3A%7B%22move%22%3Anull%2C%22face%22%3A%7B%22x%22%3A-0.9642353269925225%2C%22z%22%3A-0.26504760738332134%7D%2C%22attack%22%3Anull%7D%7D%2C%7B%22step%22%3A1440%2C%22side%22%3A%22right%22%2C%22orders%22%3Anull%7D%5D
```

**In a browser the link plays the oracle's bout.** On the built page (Chrome 154, a hidden tab
stepped by hand) this link with `&cap=30` was Node's bout at every step: 1494 steps to the skeleton
fallen at 12.45 s, both bodies' poses the same to the bit ([real-functions.md](real-functions.md),
In Chrome). On the engine's own `Math.sin` and its kin the same link was Node's bout through step
240 and another by step 480, ending at 11.75 s.
