# The oracle

The readings of the oracle (`research/oracle.mjs`): for one side of an arena bout, how it does
when at every half second it tries a handful of orders in forks of the true world and takes the
best, beside the same bout under its tactics alone.

The oracle is an instrument, not a mind. It holds the true world, which no mind may, and its
forks play the other side's future. What it reports is the ceiling of the space it searched and
of nothing wider, so every figure of it names its responses, its period and its horizon.

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
on, and what a table reads is whether its whole bout ends better.

A fork is a load: the oracle saves its bout at the decision (`Duel.save`), and a worker's bout
of the same recipe is put there (`Duel.load`) and played on under the response (`rollout`).
`--replay` forks the other way, the bout played again from its recipe and its tape to the
decision's step; the two are one fork and make the same choices (Cost). Every fork's poses at
the decision must be the bout's, by their digest, or the oracle throws.

Clairvoyant, each response is played in one fork of the true world, so the fork plays the other
side's exact future. Blind (`--blind n`), each response is played in n forks, each nudged at the
fork by an impulse at both bodies' roots (`--nudge`, 0.5 N s, in a level direction drawn for the
decision and the fork), and the response's value is their mean.

## The tables

Harness: Node, the core world (`src/core/world.ts`), Rapier, 120 Hz. The nine matchups at a gap
of 4 m, each side in turn, each bout to its verdict or the arena's cap of 120 s; forks by a load.

"Side" is the side the oracle plays. "Tactics" is the bout with nobody ordered, the same row for
both sides of a matchup; "Value" is the bout's end to the side, as a fork's is. "Believed gain a
decision" is the mean over the bout's decisions of the best response's value less `own`'s.
"Their steps" are the forks' steps, and a row's wall time is with the other 17 bouts under way.

### Clairvoyant

Every character at its own balance, which is 0 %.

```powershell
node research/oracle.mjs --all --side both --workers 14 --out research/runs/oracle-cap
```

| Left | Right | Side | Tactics: winner | Ending | Seconds | Bars | Value | Oracle: winner | Ending | Seconds | Bars | Value | Decisions | Left its tactics, % | own | attack | hold | close | back | left | right | Believed gain a decision | Rollouts | Their steps | Wall, s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| workshop-fighter | workshop-fighter | left | right | severed | 20.07 | 0.864 / 1.000 | -1.136 | left | fallen | 57.42 | 0.950 / 0.815 | 1.135 | 115 | 5 | 109 | 0 | 4 | 1 | 0 | 1 | 0 | 0.036 | 805 | 187335 | 222 |
| workshop-fighter | workshop-fighter | right | right | severed | 20.07 | 0.864 / 1.000 | 1.136 | right | fallen | 11.85 | 0.950 / 1.000 | 1.050 | 24 | 4 | 23 | 0 | 0 | 1 | 0 | 0 | 0 | 0.042 | 168 | 37801 | 116 |
| workshop-fighter | workshop-rogue | left | left | fallen | 21.23 | 0.994 / 0.849 | 1.146 | left | fallen | 21.30 | 0.997 / 0.849 | 1.149 | 43 | 7 | 40 | 0 | 0 | 1 | 1 | 1 | 0 | 0.000 | 301 | 68421 | 163 |
| workshop-fighter | workshop-rogue | right | left | fallen | 21.23 | 0.994 / 0.849 | -1.146 | right | fallen | 50.61 | 0.918 / 1.000 | 1.082 | 102 | 6 | 96 | 1 | 3 | 0 | 1 | 1 | 0 | 0.012 | 714 | 166883 | 215 |
| workshop-fighter | crypt-skeleton | left | left | severed | 10.22 | 0.999 / 0.870 | 1.129 | left | severed | 10.22 | 0.999 / 0.870 | 1.129 | 21 | 0 | 21 | 0 | 0 | 0 | 0 | 0 | 0 | 0.000 | 147 | 32466 | 101 |
| workshop-fighter | crypt-skeleton | right | left | severed | 10.22 | 0.999 / 0.870 | -1.129 | right | fallen | 20.53 | 1.000 / 0.967 | 0.967 | 42 | 10 | 38 | 0 | 0 | 0 | 2 | 2 | 0 | 0.026 | 294 | 65011 | 161 |
| workshop-rogue | workshop-fighter | left | right | fallen | 13.04 | 0.852 / 1.000 | -1.148 | right | fallen | 14.04 | 1.000 / 0.984 | -0.984 | 29 | 10 | 26 | 0 | 1 | 1 | 0 | 1 | 0 | 0.005 | 203 | 44723 | 133 |
| workshop-rogue | workshop-fighter | right | right | fallen | 13.04 | 0.852 / 1.000 | 1.148 | right | fallen | 13.04 | 0.852 / 1.000 | 1.148 | 27 | 0 | 27 | 0 | 0 | 0 | 0 | 0 | 0 | 0.000 | 189 | 41266 | 128 |
| workshop-rogue | workshop-rogue | left | right | fallen | 19.99 | 1.000 / 0.997 | -0.997 | left | fallen | 28.37 | 1.000 / 0.997 | 1.003 | 57 | 9 | 52 | 0 | 1 | 3 | 0 | 0 | 1 | 0.019 | 399 | 93065 | 182 |
| workshop-rogue | workshop-rogue | right | right | fallen | 19.99 | 1.000 / 0.997 | 0.997 | left | fallen | 27.06 | 0.966 / 1.000 | -0.966 | 55 | 4 | 53 | 0 | 1 | 1 | 0 | 0 | 0 | 0.018 | 385 | 88370 | 180 |
| workshop-rogue | crypt-skeleton | left | right | fallen | 16.67 | 0.917 / 0.971 | -1.054 | left | fallen | 12.43 | 0.995 / 1.000 | 0.995 | 25 | 12 | 22 | 0 | 1 | 0 | 1 | 1 | 0 | 0.003 | 175 | 39276 | 122 |
| workshop-rogue | crypt-skeleton | right | right | fallen | 16.67 | 0.917 / 0.971 | 1.054 | right | fallen | 16.38 | 0.917 / 0.965 | 1.048 | 33 | 12 | 29 | 0 | 0 | 0 | 0 | 2 | 2 | 0.030 | 231 | 52534 | 145 |
| crypt-skeleton | workshop-fighter | left | right | fallen | 11.73 | 0.962 / 1.000 | -1.038 | right | fallen | 40.58 | 0.752 / 1.000 | -1.248 | 82 | 21 | 65 | 0 | 8 | 1 | 3 | 2 | 3 | 0.039 | 574 | 127365 | 203 |
| crypt-skeleton | workshop-fighter | right | right | fallen | 11.73 | 0.962 / 1.000 | 1.038 | right | fallen | 11.21 | 1.000 / 0.994 | 0.994 | 23 | 13 | 20 | 0 | 0 | 1 | 1 | 0 | 1 | 0.042 | 161 | 34799 | 114 |
| crypt-skeleton | workshop-rogue | left | left | fallen | 12.28 | 1.000 / 1.000 | 1.000 | left | fallen | 12.28 | 1.000 / 1.000 | 1.000 | 25 | 0 | 25 | 0 | 0 | 0 | 0 | 0 | 0 | 0.000 | 175 | 38693 | 123 |
| crypt-skeleton | workshop-rogue | right | left | fallen | 12.28 | 1.000 / 1.000 | -1.000 | right | fallen | 12.45 | 1.000 / 1.000 | 1.000 | 25 | 4 | 24 | 0 | 1 | 0 | 0 | 0 | 0 | 0.080 | 175 | 38803 | 123 |
| crypt-skeleton | crypt-skeleton | left | left | fallen | 16.23 | 1.000 / 1.000 | 1.000 | left | fallen | 16.23 | 1.000 / 1.000 | 1.000 | 33 | 0 | 33 | 0 | 0 | 0 | 0 | 0 | 0 | 0.000 | 231 | 52007 | 145 |
| crypt-skeleton | crypt-skeleton | right | left | fallen | 16.23 | 1.000 / 1.000 | -1.000 | left | fallen | 16.23 | 1.000 / 1.000 | -1.000 | 33 | 0 | 33 | 0 | 0 | 0 | 0 | 0 | 0 | 0.000 | 231 | 52074 | 145 |

### Blind

The same, each response in four nudged forks.

```powershell
node research/oracle.mjs --all --side both --blind 4 --workers 14 --out research/runs/oracle-blind
```

| Left | Right | Side | Tactics: winner | Ending | Seconds | Bars | Value | Oracle: winner | Ending | Seconds | Bars | Value | Decisions | Left its tactics, % | own | attack | hold | close | back | left | right | Believed gain a decision | Rollouts | Their steps | Wall, s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| workshop-fighter | workshop-fighter | left | right | severed | 20.07 | 0.864 / 1.000 | -1.136 | left | fatal | 18.44 | 1.000 / 0.900 | 1.100 | 37 | 14 | 32 | 0 | 1 | 1 | 1 | 1 | 1 | 0.014 | 1036 | 241412 | 550 |
| workshop-fighter | workshop-fighter | right | right | severed | 20.07 | 0.864 / 1.000 | 1.136 | left | fallen | 13.52 | 0.950 / 1.000 | -0.950 | 28 | 14 | 24 | 1 | 2 | 0 | 0 | 0 | 1 | 0.089 | 784 | 167519 | 477 |
| workshop-fighter | workshop-rogue | left | left | fallen | 21.23 | 0.994 / 0.849 | 1.146 | left | fatal | 13.08 | 1.000 / 0.779 | 1.221 | 27 | 4 | 26 | 0 | 0 | 0 | 0 | 1 | 0 | 0.000 | 756 | 172658 | 467 |
| workshop-fighter | workshop-rogue | right | left | fallen | 21.23 | 0.994 / 0.849 | -1.146 | right | fallen | 13.63 | 1.000 / 1.000 | 1.000 | 28 | 21 | 22 | 0 | 2 | 0 | 1 | 3 | 0 | 0.013 | 784 | 173245 | 477 |
| workshop-fighter | crypt-skeleton | left | left | severed | 10.22 | 0.999 / 0.870 | 1.129 | left | severed | 10.22 | 0.999 / 0.870 | 1.129 | 21 | 0 | 21 | 0 | 0 | 0 | 0 | 0 | 0 | 0.000 | 588 | 129864 | 370 |
| workshop-fighter | crypt-skeleton | right | left | severed | 10.22 | 0.999 / 0.870 | -1.129 | right | fallen | 32.93 | 1.000 / 0.837 | 0.837 | 66 | 18 | 54 | 0 | 1 | 1 | 4 | 4 | 2 | 0.020 | 1848 | 419499 | 657 |
| workshop-rogue | workshop-fighter | left | right | fallen | 13.04 | 0.852 / 1.000 | -1.148 | left | fallen | 20.83 | 0.885 / 1.000 | 0.885 | 42 | 17 | 35 | 0 | 2 | 0 | 1 | 3 | 1 | 0.062 | 1176 | 269044 | 583 |
| workshop-rogue | workshop-fighter | right | right | fallen | 13.04 | 0.852 / 1.000 | 1.148 | right | fallen | 13.07 | 0.852 / 1.000 | 1.148 | 27 | 4 | 26 | 0 | 0 | 0 | 1 | 0 | 0 | 0.000 | 756 | 161164 | 470 |
| workshop-rogue | workshop-rogue | left | right | fallen | 19.99 | 1.000 / 0.997 | -0.997 | left | fallen | 37.10 | 1.000 / 1.000 | 1.000 | 75 | 12 | 66 | 0 | 4 | 4 | 1 | 0 | 0 | 0.010 | 2100 | 482826 | 667 |
| workshop-rogue | workshop-rogue | right | right | fallen | 19.99 | 1.000 / 0.997 | 0.997 | right | fallen | 26.81 | 0.953 / 1.000 | 1.047 | 54 | 9 | 49 | 0 | 1 | 1 | 1 | 2 | 0 | 0.024 | 1512 | 350574 | 635 |
| workshop-rogue | crypt-skeleton | left | right | fallen | 16.67 | 0.917 / 0.971 | -1.054 | right | fallen | 22.88 | 0.917 / 0.964 | -1.046 | 46 | 4 | 44 | 1 | 1 | 0 | 0 | 0 | 0 | 0.005 | 1288 | 295844 | 604 |
| workshop-rogue | crypt-skeleton | right | right | fallen | 16.67 | 0.917 / 0.971 | 1.054 | right | fallen | 16.12 | 0.917 / 0.954 | 1.037 | 33 | 6 | 31 | 0 | 1 | 0 | 0 | 0 | 1 | 0.000 | 924 | 206656 | 528 |
| crypt-skeleton | workshop-fighter | left | right | fallen | 11.73 | 0.962 / 1.000 | -1.038 | right | fatal | 10.04 | 0.922 / 1.000 | -1.078 | 21 | 19 | 17 | 0 | 0 | 2 | 1 | 0 | 1 | 0.037 | 588 | 132918 | 380 |
| crypt-skeleton | workshop-fighter | right | right | fallen | 11.73 | 0.962 / 1.000 | 1.038 | right | fallen | 11.14 | 1.000 / 0.994 | 0.994 | 23 | 9 | 21 | 0 | 0 | 0 | 1 | 0 | 1 | 0.008 | 644 | 139428 | 419 |
| crypt-skeleton | workshop-rogue | left | left | fallen | 12.28 | 1.000 / 1.000 | 1.000 | left | fallen | 12.28 | 1.000 / 1.000 | 1.000 | 25 | 0 | 25 | 0 | 0 | 0 | 0 | 0 | 0 | 0.000 | 700 | 153800 | 451 |
| crypt-skeleton | workshop-rogue | right | left | fallen | 12.28 | 1.000 / 1.000 | -1.000 | right | fallen | 11.82 | 1.000 / 0.976 | 0.976 | 24 | 13 | 21 | 0 | 0 | 1 | 0 | 2 | 0 | 0.041 | 672 | 149925 | 437 |
| crypt-skeleton | crypt-skeleton | left | left | fallen | 16.23 | 1.000 / 1.000 | 1.000 | right | fallen | 26.00 | 1.000 / 0.946 | -0.946 | 52 | 4 | 50 | 0 | 0 | 1 | 1 | 0 | 0 | 0.010 | 1456 | 339119 | 630 |
| crypt-skeleton | crypt-skeleton | right | left | fallen | 16.23 | 1.000 / 1.000 | -1.000 | left | fallen | 16.23 | 1.000 / 1.000 | -1.000 | 33 | 0 | 33 | 0 | 0 | 0 | 0 | 0 | 0 | 0.000 | 924 | 210540 | 529 |

### With balance

Clairvoyant, both sides at a balance of 25 %, a ceiling of a quarter of the body's weight and
0.065 of its weight times a metre (`docs/reference/assist.md`).

```powershell
node research/oracle.mjs --all --side both --balance 25,25 --workers 14 --out research/runs/oracle-balance
```

| Left | Right | Side | Tactics: winner | Ending | Seconds | Bars | Value | Oracle: winner | Ending | Seconds | Bars | Value | Decisions | Left its tactics, % | own | attack | hold | close | back | left | right | Believed gain a decision | Rollouts | Their steps | Wall, s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| workshop-fighter | workshop-fighter | left | right | severed | 31.84 | 0.577 / 0.814 | -1.238 | left | severed | 18.99 | 1.000 / 0.741 | 1.259 | 38 | 5 | 36 | 0 | 0 | 0 | 0 | 2 | 0 | 0.002 | 266 | 62036 | 183 |
| workshop-fighter | workshop-fighter | right | right | severed | 31.84 | 0.577 / 0.814 | 1.238 | right | fatal | 24.70 | 0.795 / 0.892 | 1.096 | 50 | 14 | 43 | 0 | 2 | 0 | 1 | 2 | 2 | 0.026 | 350 | 79372 | 237 |
| workshop-fighter | workshop-rogue | left | left | severed | 17.60 | 0.973 / 0.570 | 1.404 | left | fatal | 40.74 | 0.991 / 0.661 | 1.330 | 82 | 13 | 71 | 0 | 3 | 1 | 1 | 4 | 2 | 0.000 | 574 | 134982 | 353 |
| workshop-fighter | workshop-rogue | right | left | severed | 17.60 | 0.973 / 0.570 | -1.404 | left | time | 120.00 | 0.931 / 0.923 | -0.008 | 240 | 13 | 208 | 1 | 10 | 3 | 2 | 12 | 4 | 0.038 | 1680 | 395602 | 749 |
| workshop-fighter | crypt-skeleton | left | left | fatal | 35.00 | 0.982 / 0.594 | 1.388 | left | fatal | 44.72 | 0.994 / 0.791 | 1.203 | 90 | 4 | 86 | 1 | 2 | 0 | 0 | 1 | 0 | 0.000 | 630 | 148368 | 376 |
| workshop-fighter | crypt-skeleton | right | left | fatal | 35.00 | 0.982 / 0.594 | -1.388 | right | fallen | 30.34 | 0.999 / 0.865 | 0.866 | 61 | 21 | 48 | 0 | 4 | 4 | 2 | 3 | 0 | 0.022 | 427 | 98158 | 285 |
| workshop-rogue | workshop-fighter | left | right | fatal | 8.46 | 0.914 / 1.000 | -1.086 | right | time | 120.00 | 0.752 / 0.992 | -0.240 | 240 | 16 | 201 | 0 | 12 | 12 | 2 | 9 | 4 | 0.030 | 1680 | 393569 | 749 |
| workshop-rogue | workshop-fighter | right | right | fatal | 8.46 | 0.914 / 1.000 | 1.086 | right | fatal | 8.46 | 0.914 / 1.000 | 1.086 | 17 | 0 | 17 | 0 | 0 | 0 | 0 | 0 | 0 | 0.000 | 119 | 26875 | 83 |
| workshop-rogue | workshop-rogue | left | left | fallen | 23.98 | 1.000 / 1.000 | 1.000 | left | fallen | 23.98 | 1.000 / 1.000 | 1.000 | 48 | 0 | 48 | 0 | 0 | 0 | 0 | 0 | 0 | 0.000 | 336 | 78069 | 230 |
| workshop-rogue | workshop-rogue | right | left | fallen | 23.98 | 1.000 / 1.000 | -1.000 | right | time | 120.00 | 0.894 / 1.000 | 0.106 | 240 | 1 | 237 | 1 | 2 | 0 | 0 | 0 | 0 | 0.004 | 1680 | 400418 | 749 |
| workshop-rogue | crypt-skeleton | left | right | time | 120.00 | 0.857 / 0.990 | -0.132 | left | fallen | 116.41 | 0.976 / 0.937 | 1.039 | 233 | 7 | 217 | 2 | 3 | 1 | 5 | 5 | 0 | 0.005 | 1631 | 390509 | 738 |
| workshop-rogue | crypt-skeleton | right | right | time | 120.00 | 0.857 / 0.990 | 0.132 | right | fallen | 61.97 | 0.958 / 0.997 | 1.039 | 124 | 4 | 119 | 0 | 4 | 1 | 0 | 0 | 0 | 0.008 | 868 | 205603 | 468 |
| crypt-skeleton | workshop-fighter | left | right | fatal | 47.41 | 0.548 / 0.939 | -1.391 | right | time | 120.00 | 0.843 / 0.852 | -0.009 | 240 | 14 | 207 | 1 | 6 | 8 | 5 | 12 | 1 | 0.038 | 1680 | 392932 | 749 |
| crypt-skeleton | workshop-fighter | right | right | fatal | 47.41 | 0.548 / 0.939 | 1.391 | right | fallen | 29.61 | 0.857 / 0.943 | 1.086 | 60 | 2 | 59 | 0 | 0 | 0 | 0 | 0 | 1 | 0.000 | 420 | 96960 | 281 |
| crypt-skeleton | workshop-rogue | left | left | fallen | 71.37 | 0.971 / 0.900 | 1.071 | left | time | 120.00 | 0.977 / 0.891 | 0.085 | 240 | 6 | 226 | 0 | 6 | 1 | 1 | 3 | 3 | 0.000 | 1680 | 400007 | 749 |
| crypt-skeleton | workshop-rogue | right | left | fallen | 71.37 | 0.971 / 0.900 | -1.071 | right | fatal | 115.44 | 0.776 / 1.000 | 1.224 | 231 | 4 | 221 | 0 | 9 | 1 | 0 | 0 | 0 | 0.005 | 1617 | 384985 | 735 |
| crypt-skeleton | crypt-skeleton | left | left | fallen | 31.44 | 0.974 / 0.990 | 0.983 | left | time | 120.00 | 0.958 / 0.940 | 0.018 | 240 | 10 | 217 | 0 | 11 | 2 | 6 | 3 | 1 | 0.001 | 1680 | 400677 | 749 |
| crypt-skeleton | crypt-skeleton | right | left | fallen | 31.44 | 0.974 / 0.990 | -0.983 | right | time | 120.00 | 0.957 / 0.991 | 0.035 | 240 | 4 | 230 | 1 | 3 | 2 | 1 | 1 | 2 | 0.000 | 1680 | 400680 | 749 |

## What they show

Each matchup was fought once at one gap, so every figure here is a count of 18 sides and not a
rate. The tactics' values sum to nothing, as one bout read from both sides must.

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

- **With no balance the ceiling is on not falling.** Clairvoyant, the 6 bouts turned from a loss
  to a win all end with the foe fallen, and 17 of the oracle's 18 bouts end by a fall; none
  reaches the cap. With no balance a bout is mostly decided by who falls
  (`docs/reference/assist.md`: 80 of 99 bouts at 0 points), so what the oracle found is "do not
  fall, and be standing when the other does", and none of it is fencing skill.
- **Little of that ceiling is knowing the exact future.** Blind, the oracle still turns 6 of the
  9 lost bouts, 5 of them the bouts the clairvoyant search turns, and its mean value is 0.464
  beside 0.584. What it gives up is on the winning side: it loses 2 bouts its tactics win where
  the clairvoyant search loses 1.
- **How blind the blind search is** is its nudge, which is a dial. In three of the tactics'
  bouts (the Warrior against the Rogue, the Rogue against the Warrior, a skeleton against a
  skeleton: 103 decisions, 412 forks nudged as the blind search nudges them, each beside the
  true fork under `own`; `node research/oracle-spread.mjs --left <model> --right <model>`) no
  nudged fork ends in the true fork's poses, where with `--nudge 0` all do. The furthest centre
  of mass stands a median of 5, 5 and 1 cm from the true fork's 2 s on, and 22 of the 412
  forks, in 9 of the 103 decisions, put other bodies out of the fight than the true fork does.
  So the blind search knows the other side's future to a few centimetres, and its table says
  the search does not need that future to the bit. It does not say what a mind that must guess
  the other's intent would keep.
- **With balance a gain is seldom a fall, and it is mostly time.** At 25 % the 6 bouts
  turned from a loss to a win end by a wound in 2 (a severed head at 19.0 s, a fatal wound at
  115.4 s), by the foe's fall in 2 and at the cap ahead on bars in 2, by 0.106 and 0.035 of a
  bar. The other 3 are carried to the cap and lost there, two of them by under a hundredth of a
  bar, where the tactics lost them by a wound inside 48 s. Of the 9 sides that win under their
  tactics none loses, and 6 end with less: 2 win only at the cap, and 4 win by a wound or a
  fall with less of a margin in bars. The oracle's bouts last 75 s on average where the
  tactics' last 43 s, and 7 of 18 reach the cap where 1 of the tactics' 9 does. A search that
  values 2 s on finds how not to be hit, and not how to end a bout.
- **It leaves its tactics rarely**: in 7 to 10 % of decisions, mostly to stand still or to walk
  to its left. One clairvoyant bout turns on a single decision: the Rogue against the skeleton,
  from the right, holds still for half a second at 11.5 s and wins a bout it lost (Watching one).
- **`attack` is almost never taken**: 1 of 794 decisions clairvoyant, 2 of 662 blind, 7 of 2714
  with balance. Within reach the tactics already attack the head, and a strike ordered at where
  the head stood seldom beats them. The search cannot say whether a strike aimed or timed
  otherwise would.
- **Its promise is 2 s long.** The mean believed gain a decision is under a tenth everywhere. A
  decision's value is never under `own`'s, and the bout can still end worse: clairvoyant it does
  in 5 of 18, and in one of them (the Rogue against a Rogue, from the right) the oracle loses a
  bout its tactics win. With balance the gains believed over a bout sum to as much as 9 points
  (0.038 a decision over 240 decisions, twice), in bouts that end a hundredth of a bar behind
  at the cap.
- **The cap matters to the reading.** At a cap of 30 s the clairvoyant oracle's bout ended
  better in 9 of 18 sides and three of its bouts were decided on bars at the cap. At the arena's
  120 s those three end by a fall at 57.4, 50.6 and 40.6 s, two won and one lost, and the one
  lost (the skeleton against the Warrior, from the left) ends worse than under its tactics where
  at 30 s it stood better.

## What they do not show

- **A rate.** For one, run `--gap` at several gaps and say how many bouts stand behind it.
- **Anything of a mind.** A clairvoyant fork plays the other side's exact future and a blind one
  plays it to a few centimetres; no fork hides what the other side will do.
- **A wider search.** A response is held one period and nothing is planned beyond it; the
  responses name no strike and no guard; the horizon is 2 s, which with balance is short of
  what ends a bout.
- **A blind search with balance**, or a wider nudge.

## Cost

A fork by a load costs the steps it plays out; a fork by replay costs the bout up to it as
well, so a bout's cost by replay grows with the square of its length. One bout both ways (the
Warrior against the Rogue, from the left, at a cap of 30 s; 43 decisions, 301 forks; 14 workers;
`--left workshop-fighter --right workshop-rogue --seconds 30`, with `--replay` and without):

| A fork | The forks' steps | Wall, s |
|---|---|---|
| by replay | 447 681 | 112 |
| by a load | 68 421 | 27 |

The two runs print one row and one tape: the oracle by a load makes the choices the oracle by
replay makes.

The tables above, each on 14 workers with the 18 bouts' decisions sharing them:

| Table | Forks | Their steps | Wall, s |
|---|---|---|---|
| Clairvoyant | 5558 | 1 260 892 | 232 |
| Blind, 4 forks | 18 536 | 4 196 035 | 677 |
| With balance | 18 998 | 4 489 802 | 776 |

By replay the clairvoyant table at a cap of 30 s was 4725 forks of 7 004 751 steps in 907 s.

A save of the Warrior against the Rogue at step 1200 is 338 620 bytes of the engine's snapshot
and 30 565 bytes of state as `v8.serialize` writes it. On one quiet thread (Node, Rapier, 120
Hz; the mean of 200, read three times) taking it is 0.8 ms, loading it 0.7 ms and copying it to
a worker's thread (`structuredClone`) 0.5 ms, beside 1.4 ms for a step of that bout. The save is
taken once a decision; a fork by a load costs a copy and a load, under a step's time, before its
first step.

## Watching one

`--out` writes each oracle bout's recipe and tape, and prints the link that plays it: the
matchup, the gap, the cap and any balance in the query, the tape in the fragment (`#tape=`,
`src/arena/matchup.ts`). The arena plays a link with a tape by itself, with " · replay" at its
clock. All 54 links of the three tables, read as the page reads them (`readMatchup`, `readGap`,
`readCap`, `readBalance`, `readTape`) and played in Node, end as the oracle's rows say.

The bout that turns on one decision, the Rogue on the right, beside the same matchup with no
tape (`?play=arena&matchup=crypt-skeleton,workshop-rogue`):

```
?play=arena&matchup=crypt-skeleton,workshop-rogue&gap=4&cap=120#tape=%5B%7B%22step%22%3A1380%2C%22side%22%3A%22right%22%2C%22orders%22%3A%7B%22move%22%3Anull%2C%22face%22%3A%7B%22x%22%3A-0.9642353269925225%2C%22z%22%3A-0.26504760738332134%7D%2C%22attack%22%3Anull%7D%7D%2C%7B%22step%22%3A1440%2C%22side%22%3A%22right%22%2C%22orders%22%3Anull%7D%5D
```

**In a browser the link plays the oracle's bout.** On the built page (Chrome 154, a hidden tab
stepped by hand) this bout's link with `&cap=30`, which ends long before either cap, was read
for its matchup, gap, cap and tape, nobody was at the keys, and the bout was Node's at every
step: 1494 steps to the skeleton fallen at 12.45 s, the poses of both bodies the same to the bit
throughout ([real-functions.md](real-functions.md), In Chrome). That holds because the core
computes with functions of its own. An engine's `Math.sin` and its kin are its own to the last
bit, and on them the same link was Node's bout through step 240 and another by step 480, ending
at 11.75 s.
