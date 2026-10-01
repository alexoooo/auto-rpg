# The oracle

The first reading of the oracle (`research/oracle.mjs`): for one side of an arena bout, how it
does when at every half second it tries a handful of orders in forks of the true world and takes
the best, beside the same bout under its tactics alone.

The oracle is an instrument, not a mind. It holds the true world, which no mind may, and its
forks play the other side's exact future. What it reports is the ceiling of the space it
searched and of nothing wider, so every figure of it names its responses, its period and its
horizon.

## The search

One-step lookahead over the side's own tactics (`seekFoe`). At each decision, every 0.5 s of the
bout, each of seven responses (`responsesAt`, `research/rollouts.mjs`) is held for 0.5 s in a
fork of the bout and the side is then handed back to its tactics; the fork is valued 2 s after
the decision.

| Response | The orders held |
|---|---|
| `own` | none: the side's own tactics |
| `attack` | stand, face the foe, attack where its head is at the decision |
| `hold` | stand, face the foe |
| `close` | walk at the foe |
| `back` | walk from the foe, facing it |
| `left`, `right` | walk to the body's own left or right, facing the foe |

A fork's value to the side (`valueOf`) is its bar less its foe's, a point more with its foe out
of the fight and a point less out itself. The choice is the greatest, the first of equals
(`chooseResponse`), and `own` is first: a response is taken only when it beats the tactics'
own. So at each decision the oracle does at least as well as its tactics by its own value 2 s
on, and what the table reads is whether its whole bout ends better.

A fork is the bout played again from its recipe and its tape to the decision's step, and on
under the response (`rollout`). Every fork's poses at the decision must be the bout's, by their
digest, or the oracle throws.

## The first table

Harness: Node, the core world (`src/core/world.ts`), Rapier, 120 Hz. The nine matchups at a gap
of 4 m, each side in turn, each bout to its verdict or a cap of 30 s; every character at its own
balance, which is 0 points. Clairvoyant: each response in one fork of the true world.

```powershell
node research/oracle.mjs --all --side both --workers 14 --out research/runs/oracle
```

"Side" is the side the oracle plays. "Tactics" is the bout with nobody ordered, the same row for
both sides of a matchup; "Value" is the bout's end to the side, as a fork's is. "Believed gain a
decision" is the mean over the bout's decisions of the best response's value less `own`'s.

| Left | Right | Side | Tactics: winner | Ending | Seconds | Bars | Value | Oracle: winner | Ending | Seconds | Bars | Value | Decisions | Left its tactics, % | own | attack | hold | close | back | left | right | Believed gain a decision | Rollouts | Their steps | Wall, s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| workshop-fighter | workshop-fighter | left | right | severed | 20.07 | 0.864 / 1.000 | -1.136 | left | time | 30.00 | 0.950 / 0.815 | 0.135 | 60 | 5 | 57 | 0 | 2 | 0 | 0 | 1 | 0 | 0.017 | 420 | 840486 | 892 |
| workshop-fighter | workshop-fighter | right | right | severed | 20.07 | 0.864 / 1.000 | 1.136 | right | fallen | 11.85 | 0.950 / 1.000 | 1.050 | 24 | 4 | 23 | 0 | 0 | 1 | 0 | 0 | 0 | 0.042 | 168 | 153721 | 328 |
| workshop-fighter | workshop-rogue | left | left | fallen | 21.23 | 0.994 / 0.849 | 1.146 | left | fallen | 21.30 | 0.997 / 0.849 | 1.149 | 43 | 7 | 40 | 0 | 0 | 1 | 1 | 1 | 0 | 0.000 | 301 | 447681 | 662 |
| workshop-fighter | workshop-rogue | right | left | fallen | 21.23 | 0.994 / 0.849 | -1.146 | right | time | 30.00 | 0.990 / 1.000 | 0.010 | 60 | 5 | 57 | 0 | 1 | 0 | 1 | 1 | 0 | 0.003 | 420 | 841264 | 896 |
| workshop-fighter | crypt-skeleton | left | left | severed | 10.22 | 0.999 / 0.870 | 1.129 | left | severed | 10.22 | 0.999 / 0.870 | 1.129 | 21 | 0 | 21 | 0 | 0 | 0 | 0 | 0 | 0 | 0.000 | 147 | 120666 | 264 |
| workshop-fighter | crypt-skeleton | right | left | severed | 10.22 | 0.999 / 0.870 | -1.129 | right | fallen | 20.53 | 1.000 / 0.967 | 0.967 | 42 | 10 | 38 | 0 | 0 | 0 | 2 | 2 | 0 | 0.026 | 294 | 426631 | 651 |
| workshop-rogue | workshop-fighter | left | right | fallen | 13.04 | 0.852 / 1.000 | -1.148 | right | fallen | 14.04 | 1.000 / 0.984 | -0.984 | 29 | 10 | 26 | 0 | 1 | 1 | 0 | 1 | 0 | 0.005 | 203 | 215243 | 434 |
| workshop-rogue | workshop-fighter | right | right | fallen | 13.04 | 0.852 / 1.000 | 1.148 | right | fallen | 13.04 | 0.852 / 1.000 | 1.148 | 27 | 0 | 27 | 0 | 0 | 0 | 0 | 0 | 0 | 0.000 | 189 | 188686 | 398 |
| workshop-rogue | workshop-rogue | left | right | fallen | 19.99 | 1.000 / 0.997 | -0.997 | left | fallen | 28.37 | 1.000 / 0.997 | 1.003 | 57 | 9 | 52 | 0 | 1 | 3 | 0 | 0 | 1 | 0.019 | 399 | 763385 | 866 |
| workshop-rogue | workshop-rogue | right | right | fallen | 19.99 | 1.000 / 0.997 | 0.997 | left | fallen | 27.06 | 0.966 / 1.000 | -0.966 | 55 | 4 | 53 | 0 | 1 | 1 | 0 | 0 | 0 | 0.018 | 385 | 712070 | 840 |
| workshop-rogue | crypt-skeleton | left | right | fallen | 16.67 | 0.917 / 0.971 | -1.054 | left | fallen | 12.43 | 0.995 / 1.000 | 0.995 | 25 | 12 | 22 | 0 | 1 | 0 | 1 | 1 | 0 | 0.003 | 175 | 165276 | 362 |
| workshop-rogue | crypt-skeleton | right | right | fallen | 16.67 | 0.917 / 0.971 | 1.054 | right | fallen | 16.38 | 0.917 / 0.965 | 1.048 | 33 | 12 | 29 | 0 | 0 | 0 | 0 | 2 | 2 | 0.030 | 231 | 274294 | 512 |
| crypt-skeleton | workshop-fighter | left | right | fallen | 11.73 | 0.962 / 1.000 | -1.038 | right | time | 30.00 | 0.827 / 1.000 | -0.173 | 60 | 22 | 47 | 0 | 6 | 1 | 2 | 1 | 3 | 0.036 | 420 | 837192 | 897 |
| crypt-skeleton | workshop-fighter | right | right | fallen | 11.73 | 0.962 / 1.000 | 1.038 | right | fallen | 11.21 | 1.000 / 0.994 | 0.994 | 23 | 13 | 20 | 0 | 0 | 1 | 1 | 0 | 1 | 0.042 | 161 | 141059 | 321 |
| crypt-skeleton | workshop-rogue | left | left | fallen | 12.28 | 1.000 / 1.000 | 1.000 | left | fallen | 12.28 | 1.000 / 1.000 | 1.000 | 25 | 0 | 25 | 0 | 0 | 0 | 0 | 0 | 0 | 0.000 | 175 | 164693 | 367 |
| crypt-skeleton | workshop-rogue | right | left | fallen | 12.28 | 1.000 / 1.000 | -1.000 | right | fallen | 12.45 | 1.000 / 1.000 | 1.000 | 25 | 4 | 24 | 0 | 1 | 0 | 0 | 0 | 0 | 0.080 | 175 | 164803 | 368 |
| crypt-skeleton | crypt-skeleton | left | left | fallen | 16.23 | 1.000 / 1.000 | 1.000 | left | fallen | 16.23 | 1.000 / 1.000 | 1.000 | 33 | 0 | 33 | 0 | 0 | 0 | 0 | 0 | 0 | 0.000 | 231 | 273767 | 515 |
| crypt-skeleton | crypt-skeleton | right | left | fallen | 16.23 | 1.000 / 1.000 | -1.000 | left | fallen | 16.23 | 1.000 / 1.000 | -1.000 | 33 | 0 | 33 | 0 | 0 | 0 | 0 | 0 | 0 | 0.000 | 231 | 273834 | 518 |

## What it shows

- **A count, not a rate.** Each matchup was fought once at one gap, so the claim the table
  carries is of 18 sides: the oracle's bout ended better than the tactics' own by its value in 9,
  worse in 4 and the same in 5. One of the 9 and one of the 4 are by under a hundredth of a bar.
  The tactics' values sum to nothing, as one bout read from both sides must; the oracle's mean is
  0.528.
- **By verdict**: of the 9 sides that lose under their tactics, the oracle's bout is won in 6,
  lost with more of its bar or later in 2, and the same bout in 1 (the skeleton against a
  skeleton, where no response beat `own` in 33 decisions). Of the 9 that win, 4 fight the same
  bout, 4 win one that ends within a tenth of the tactics' value, and 1 loses.
- **It leaves its tactics rarely.** 48 of 675 decisions took a response over `own`: 7 %. `hold`
  14 times, `left` 10, `close` 9, `back` 8, `right` 7. One bout turns on a single decision:
  the Rogue against the skeleton, from the right, holds still for half a second at 11.5 s and
  wins a bout it lost.
- **`attack` was never taken**: 0 of 675. Within reach the tactics already attack the head, and
  a strike ordered at where the head stood never beat them. The search cannot say whether a
  strike aimed or timed otherwise would.
- **The wins are falls.** The 6 bouts turned from a loss to a win end with the foe fallen (4) or
  at the cap ahead on bars (2); none ends by a wound. Of the oracle's 18 bouts, 14 end by a
  fall, 3 at the cap and 1 by a severed head; the tactics' 9 end by a fall (7) or a severed head
  (2). With no balance a bout is mostly decided by who falls (`docs/reference/assist.md`, the
  even table: 80 of 99 bouts at 0 points), so what the oracle found here is "do not fall, and be
  standing when the other does", and none of it is yet fencing skill.
- **Its promise is 2 s long.** The mean believed gain a decision is under a tenth everywhere;
  times a bout's decisions it comes to about a point or two in 9 of the 12 bouts where it is
  anything, the size of a fall avoided or caused inside the horizon. A decision's value is never
  under `own`'s, and the bout can still end worse: it does in 4 of 18, and in one of them (the
  Rogue against a Rogue, from the right) the oracle loses a bout its tactics win.

## What it does not show

- **A rate.** For one, run `--gap` at several gaps and say how many bouts stand behind it.
- **The arena's cap.** The tactics' bouts all end inside 30 s, so their rows are the arena's.
  Three of the oracle's reach the 30 s cap and are decided on bars there; at the arena's 120 s
  they would go on.
- **Anything of a mind.** Every fork plays the other side's exact future. `--blind n` plays each
  response in n forks, each nudged at both roots, and takes the mean; the gap between that table
  and this one is how much of the ceiling is knowing the future. It is not yet read: it costs n
  times the forks.
- **Bouts with balance.** `--balance 5,5` takes most falls out of a bout and makes it long
  (`docs/reference/assist.md`), which is where an oracle's gain would have to be something other
  than a fall. Not yet read either: a fork by replay costs the whole bout up to it, and a long
  bout's cost grows with the square of its length.
- **A wider search.** A response is held one period and nothing is planned beyond it; the
  responses name no strike and no guard.

Both unread tables' paths run (3 s bouts, both sides, `--blind 2` and `--balance 5,5`).

## Cost

By replay, read by the run: 4725 forks of 7 004 751 steps in all, 907 s on 14 workers with the
18 bouts' decisions sharing them, so 1.81 ms a step a busy worker. A bout that reaches 30 s is 60
decisions, 420 forks and about 840 000 steps; one that ends at 12 s is 25 decisions and about
165 000. Each row's wall time is with the other 17 bouts under way.

## Watching one

`--out` writes each oracle bout's recipe and tape, and prints the link that plays it: the
matchup, the gap and the cap in the query, the tape in the fragment (`#tape=`,
`src/arena/matchup.ts`). The arena plays a link with a tape by itself, with " · replay" at its
clock. All 18 links of this table, read as the page reads them (`readMatchup`, `readGap`,
`readCap`, `readTape`) and played in Node, end as the oracle's rows say.

The bout that turns on one decision, the Rogue on the right, beside the same matchup with no
tape (`?play=arena&matchup=crypt-skeleton,workshop-rogue`):

```
?play=arena&matchup=crypt-skeleton,workshop-rogue&gap=4&cap=30#tape=%5B%7B%22step%22%3A1380%2C%22side%22%3A%22right%22%2C%22orders%22%3A%7B%22move%22%3Anull%2C%22face%22%3A%7B%22x%22%3A-0.9642353269925225%2C%22z%22%3A-0.26504760738332134%7D%2C%22attack%22%3Anull%7D%7D%2C%7B%22step%22%3A1440%2C%22side%22%3A%22right%22%2C%22orders%22%3Anull%7D%5D
```

**In a browser the link plays, and its bout is not Node's.** On the built page (Chrome 154, a
hidden tab stepped by hand) the link's matchup, gap, cap and tape are read, nobody is at the
keys, and the clock ends " · replay". The bout is Node's to the bit through step 240 and has
parted from it by step 480. The engines' arithmetic differs: over 20 000 arguments each,
Chrome's `Math.sin`, `cos`, `tan`, `asin`, `acos`, `atan2`, `exp`, `sinh` and `cosh` differ from
Node 24.19's in their last bits, where `**`, `hypot` and `sqrt` agree, and a bout amplifies a
bit; whether that is the whole of the difference is not yet shown. In Chrome the linked bout
ends at 11.75 s, the skeleton fallen; in Node at 12.45 s, the same way, and that the winner
agrees is chance. So a tape made in Node shows the oracle's bout in Node alone, until the core's
arithmetic is the same in every engine.
