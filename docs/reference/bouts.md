# How the arena's bouts end

The records the arena's bouts are measured against. Each section is one run, with its harness and
its command; a later run adds a section and leaves the earlier ones as they were read, since a
corrected reference voids the conclusions drawn from it.

A bout here is `playBout` (`research/bout.mjs`): two bodies built from a recipe
(`DuelRecipe`, `src/arena/duel.ts`) in a world of their own with the arena's solids, stepped
to the verdict. Nothing in a bout is random, so one recipe is one bout: the table's spread comes
from its matchups and starting gaps, not from seeds.

## Standing table

Harness: Node 24.19, the core world (`src/core/world.ts`), Rapier, 120 Hz. Read on the tree
that first held `research/bout-baseline.mjs`, the commit after `e01d7bc5`.

```powershell
node research/bout-baseline.mjs --gaps 3,4,5 --workers 14
```

Every ordered pair of the three bodies at gaps of 3, 4 and 5 m: 27 bouts. A blow is a striker (a
hand, with what it holds) landing on a body; a clash is striker on striker, and wounds neither.

| Left | Right | Gap, m | Winner | Ending | Seconds | Blows | Wounding | Clashes | Left bar | Right bar |
|---|---|---|---|---|---|---|---|---|---|---|
| workshop-fighter | workshop-fighter | 3 | right | fatal | 8.56 | 1 | 1 | 2 | 0.89 | 1.00 |
| workshop-fighter | workshop-rogue | 3 | left | fallen | 22.51 | 4 | 4 | 8 | 1.00 | 0.95 |
| workshop-fighter | crypt-skeleton | 3 | left | severed | 8.87 | 1 | 1 | 0 | 1.00 | 0.86 |
| workshop-rogue | workshop-fighter | 3 | left | fallen | 20.99 | 3 | 3 | 10 | 0.90 | 1.00 |
| workshop-rogue | workshop-rogue | 3 | left | fallen | 14.14 | 1 | 1 | 4 | 0.93 | 1.00 |
| workshop-rogue | crypt-skeleton | 3 | left | fallen | 9.95 | 3 | 3 | 5 | 0.81 | 1.00 |
| crypt-skeleton | workshop-fighter | 3 | right | severed | 9.69 | 1 | 1 | 0 | 0.84 | 1.00 |
| crypt-skeleton | workshop-rogue | 3 | left | fallen | 12.10 | 0 | 0 | 0 | 1.00 | 1.00 |
| crypt-skeleton | crypt-skeleton | 3 | right | fallen | 10.21 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-fighter | workshop-fighter | 4 | left | fallen | 7.97 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-fighter | workshop-rogue | 4 | right | fallen | 18.93 | 19 | 19 | 12 | 0.99 | 0.70 |
| workshop-fighter | crypt-skeleton | 4 | left | fallen | 11.28 | 4 | 4 | 6 | 0.98 | 0.96 |
| workshop-rogue | workshop-fighter | 4 | right | severed | 9.68 | 1 | 1 | 0 | 0.77 | 1.00 |
| workshop-rogue | workshop-rogue | 4 | right | fallen | 11.99 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-rogue | crypt-skeleton | 4 | left | fallen | 11.53 | 2 | 2 | 0 | 1.00 | 1.00 |
| crypt-skeleton | workshop-fighter | 4 | right | fallen | 10.68 | 2 | 2 | 0 | 1.00 | 0.99 |
| crypt-skeleton | workshop-rogue | 4 | right | fallen | 11.59 | 0 | 0 | 2 | 1.00 | 1.00 |
| crypt-skeleton | crypt-skeleton | 4 | right | fallen | 35.93 | 1 | 1 | 0 | 1.00 | 0.99 |
| workshop-fighter | workshop-fighter | 5 | left | fallen | 12.12 | 14 | 14 | 8 | 0.94 | 0.97 |
| workshop-fighter | workshop-rogue | 5 | left | severed | 9.61 | 1 | 1 | 0 | 1.00 | 0.85 |
| workshop-fighter | crypt-skeleton | 5 | left | severed | 11.78 | 3 | 3 | 0 | 0.99 | 0.87 |
| workshop-rogue | workshop-fighter | 5 | right | severed | 9.59 | 1 | 1 | 0 | 0.81 | 1.00 |
| workshop-rogue | workshop-rogue | 5 | right | fallen | 12.88 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-rogue | crypt-skeleton | 5 | right | fallen | 12.96 | 1 | 1 | 8 | 1.00 | 1.00 |
| crypt-skeleton | workshop-fighter | 5 | right | fallen | 12.57 | 2 | 2 | 0 | 1.00 | 0.97 |
| crypt-skeleton | workshop-rogue | 5 | right | fallen | 13.72 | 0 | 0 | 0 | 1.00 | 1.00 |
| crypt-skeleton | crypt-skeleton | 5 | left | fallen | 18.92 | 0 | 0 | 0 | 1.00 | 1.00 |

- Bouts by ending: fatal 1, fallen 20, severed 6.
- Bout time 361 s; falls a minute 3.33 (20 falls); wounding blows a minute 10.8.
- Ended before any wounding blow: 8 of 27.

Twenty of 27 bouts end by a fall, eight of them before any blow has wounded. A bout's count of
blows is not a rate: the totals above are over 361 s of bout time, and a claim about one matchup
needs more bouts than its three.

The Warrior against the Rogue at 4 m is the bout `research/bout-trace.mjs` plays by default:
2271 steps, the right side winning by the left's fall at 18.925 s, trace digest
`fd30dd8586076627` on this machine. The digest is every segment's pose at every step
(`traceOf`, `tests/harness/trace.mjs`); a change that should change nothing leaves it as it
was. On another Node or processor, read it before a change and compare after.

## With senses

Harness: Node 24.19, the core world (`src/core/world.ts`), Rapier, 120 Hz. Read on the commit
after `e10fad89`, the first whose bouts go through the senses (`createSenses`,
`src/core/mind/senses.ts`): every body is read before any mind steps, so both sides decide on
the same step, where the left side had aimed at the right as it was a step earlier; and each
side picks its own foe from what it sees (`seekFoe`). The delay is none.

```powershell
node research/bout-baseline.mjs --gaps 3,4,5 --workers 14
```

The same 27 bouts as the standing table.

| Left | Right | Gap, m | Winner | Ending | Seconds | Blows | Wounding | Clashes | Left bar | Right bar |
|---|---|---|---|---|---|---|---|---|---|---|
| workshop-fighter | workshop-fighter | 3 | right | severed | 11.83 | 1 | 1 | 0 | 0.86 | 1.00 |
| workshop-fighter | workshop-rogue | 3 | left | severed | 13.54 | 2 | 2 | 4 | 1.00 | 0.79 |
| workshop-fighter | crypt-skeleton | 3 | left | fallen | 10.01 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-rogue | workshop-fighter | 3 | right | fallen | 23.94 | 5 | 5 | 14 | 0.97 | 1.00 |
| workshop-rogue | workshop-rogue | 3 | left | fallen | 10.22 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-rogue | crypt-skeleton | 3 | right | fallen | 9.88 | 1 | 1 | 2 | 0.95 | 1.00 |
| crypt-skeleton | workshop-fighter | 3 | right | severed | 9.55 | 1 | 1 | 0 | 0.85 | 1.00 |
| crypt-skeleton | workshop-rogue | 3 | left | fallen | 10.69 | 0 | 0 | 2 | 1.00 | 1.00 |
| crypt-skeleton | crypt-skeleton | 3 | right | fallen | 14.68 | 7 | 7 | 0 | 1.00 | 0.99 |
| workshop-fighter | workshop-fighter | 4 | right | severed | 20.07 | 3 | 3 | 6 | 0.86 | 1.00 |
| workshop-fighter | workshop-rogue | 4 | left | fallen | 21.23 | 14 | 14 | 2 | 0.99 | 0.85 |
| workshop-fighter | crypt-skeleton | 4 | left | severed | 10.22 | 2 | 2 | 0 | 1.00 | 0.87 |
| workshop-rogue | workshop-fighter | 4 | right | fallen | 13.04 | 2 | 2 | 6 | 0.85 | 1.00 |
| workshop-rogue | workshop-rogue | 4 | right | fallen | 19.99 | 2 | 2 | 4 | 1.00 | 1.00 |
| workshop-rogue | crypt-skeleton | 4 | right | fallen | 16.67 | 5 | 5 | 2 | 0.92 | 0.97 |
| crypt-skeleton | workshop-fighter | 4 | right | fallen | 11.73 | 2 | 2 | 4 | 0.96 | 1.00 |
| crypt-skeleton | workshop-rogue | 4 | left | fallen | 12.28 | 0 | 0 | 0 | 1.00 | 1.00 |
| crypt-skeleton | crypt-skeleton | 4 | left | fallen | 16.23 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-fighter | workshop-fighter | 5 | right | fallen | 12.21 | 9 | 9 | 18 | 0.97 | 0.94 |
| workshop-fighter | workshop-rogue | 5 | left | severed | 9.61 | 1 | 1 | 0 | 1.00 | 0.81 |
| workshop-fighter | crypt-skeleton | 5 | left | fatal | 11.80 | 2 | 2 | 0 | 1.00 | 0.92 |
| workshop-rogue | workshop-fighter | 5 | right | fatal | 9.59 | 1 | 1 | 0 | 0.89 | 1.00 |
| workshop-rogue | workshop-rogue | 5 | right | fallen | 13.28 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-rogue | crypt-skeleton | 5 | left | fallen | 14.21 | 2 | 2 | 0 | 0.99 | 1.00 |
| crypt-skeleton | workshop-fighter | 5 | right | fallen | 12.52 | 2 | 2 | 0 | 1.00 | 0.97 |
| crypt-skeleton | workshop-rogue | 5 | right | fallen | 16.88 | 0 | 0 | 0 | 1.00 | 1.00 |
| crypt-skeleton | crypt-skeleton | 5 | left | fallen | 18.64 | 1 | 1 | 0 | 0.99 | 1.00 |

| | Standing table | With senses |
|---|---|---|
| Bouts by ending | fatal 1, fallen 20, severed 6 | fatal 2, fallen 19, severed 6 |
| Bout time, s | 361 | 375 |
| Falls a minute | 3.33 (20 falls) | 3.04 (19 falls) |
| Wounding blows a minute | 10.8 | 10.4 |
| Ended before any wounding blow | 8 of 27 | 7 of 27 |

Every bout is another bout: the left side sees a step sooner, and nothing in a bout damps a
difference that small. In the totals one bout went from a fall to a fatal wound and each rate
moved by under a tenth of itself: the reading of one step of sight at 27 bouts, recorded and not
explained.

The digests `research/bout-trace.mjs` reads from here on, on this machine:

- the Warrior against the Rogue at 4 m: 2547 steps, the left side winning by the right's fall at
  21.225 s, 14 wounding blows and 2 clashes, `3ab8855dc81d4dfa`;
- skeleton against skeleton at 4 m (`node research/bout-trace.mjs crypt-skeleton crypt-skeleton 60`):
  1947 steps, the left side winning by the right's fall at 16.225 s, no blow,
  `91dc2fa923804d70`.

## Down read from the body

Harness: Node 24.19, the core world (`src/core/world.ts`), Rapier, 120 Hz. Read on the first
tree whose bouts take a fall from the body's own reading (`BodyView.down`, `rising.md#down`): the
centre of mass over the body's lowest point, where it was over the soles' middles.

```powershell
node research/bout-baseline.mjs --gaps 3,4,5 --workers 14
```

The same 27 bouts as the standing table.

| Left | Right | Gap, m | Winner | Ending | Seconds | Blows | Wounding | Clashes | Left bar | Right bar |
|---|---|---|---|---|---|---|---|---|---|---|
| workshop-fighter | workshop-fighter | 3 | right | severed | 11.83 | 1 | 1 | 0 | 0.86 | 1.00 |
| workshop-fighter | workshop-rogue | 3 | left | severed | 13.54 | 2 | 2 | 4 | 1.00 | 0.79 |
| workshop-fighter | crypt-skeleton | 3 | left | fallen | 10.09 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-rogue | workshop-fighter | 3 | right | fallen | 24.01 | 5 | 5 | 14 | 0.97 | 1.00 |
| workshop-rogue | workshop-rogue | 3 | left | fallen | 10.82 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-rogue | crypt-skeleton | 3 | right | fallen | 10.00 | 1 | 1 | 2 | 0.95 | 1.00 |
| crypt-skeleton | workshop-fighter | 3 | right | severed | 9.55 | 1 | 1 | 0 | 0.85 | 1.00 |
| crypt-skeleton | workshop-rogue | 3 | left | fallen | 10.78 | 0 | 0 | 2 | 1.00 | 1.00 |
| crypt-skeleton | crypt-skeleton | 3 | right | fallen | 14.91 | 7 | 7 | 0 | 1.00 | 0.99 |
| workshop-fighter | workshop-fighter | 4 | right | severed | 20.07 | 3 | 3 | 6 | 0.86 | 1.00 |
| workshop-fighter | workshop-rogue | 4 | left | fallen | 21.36 | 14 | 14 | 2 | 0.99 | 0.85 |
| workshop-fighter | crypt-skeleton | 4 | left | severed | 10.22 | 2 | 2 | 0 | 1.00 | 0.87 |
| workshop-rogue | workshop-fighter | 4 | right | fallen | 13.10 | 2 | 2 | 6 | 0.85 | 1.00 |
| workshop-rogue | workshop-rogue | 4 | right | fallen | 20.23 | 2 | 2 | 4 | 1.00 | 1.00 |
| workshop-rogue | crypt-skeleton | 4 | right | fallen | 16.74 | 5 | 5 | 2 | 0.92 | 0.97 |
| crypt-skeleton | workshop-fighter | 4 | right | fallen | 11.88 | 2 | 2 | 4 | 0.96 | 1.00 |
| crypt-skeleton | workshop-rogue | 4 | left | fallen | 12.34 | 0 | 0 | 0 | 1.00 | 1.00 |
| crypt-skeleton | crypt-skeleton | 4 | left | fallen | 16.51 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-fighter | workshop-fighter | 5 | right | fallen | 12.32 | 9 | 9 | 18 | 0.97 | 0.94 |
| workshop-fighter | workshop-rogue | 5 | left | severed | 9.61 | 1 | 1 | 0 | 1.00 | 0.81 |
| workshop-fighter | crypt-skeleton | 5 | left | fatal | 11.80 | 2 | 2 | 0 | 1.00 | 0.92 |
| workshop-rogue | workshop-fighter | 5 | right | fatal | 9.59 | 1 | 1 | 0 | 0.89 | 1.00 |
| workshop-rogue | workshop-rogue | 5 | right | fallen | 13.35 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-rogue | crypt-skeleton | 5 | left | fallen | 14.32 | 2 | 2 | 0 | 0.99 | 1.00 |
| crypt-skeleton | workshop-fighter | 5 | right | fallen | 12.57 | 2 | 2 | 0 | 1.00 | 0.97 |
| crypt-skeleton | workshop-rogue | 5 | right | fallen | 17.10 | 0 | 0 | 0 | 1.00 | 1.00 |
| crypt-skeleton | crypt-skeleton | 5 | left | fallen | 18.78 | 1 | 1 | 0 | 0.99 | 1.00 |

- Bouts by ending: fatal 2, fallen 19, severed 6.
- Bout time 377 s; falls a minute 3.02 (19 falls); wounding blows a minute 10.3.
- Ended before any wounding blow: 7 of 27.

Every winner, ending, blow and bar is as it was with senses. The 19 bouts that end by a fall end
0.05 to 0.6 s later: a body's lowest point is never above its soles' middles, so its height
over that point is never the lesser, and its bar is passed no sooner. The other eight end at the
step they did.

The digests `research/bout-trace.mjs` reads from here on, on this machine:

- the Warrior against the Rogue at 4 m: 2563 steps, the left side winning by the right's fall at
  21.358 s, 14 wounding blows and 2 clashes, `4a4223d7a7cf67e8`;
- skeleton against skeleton at 4 m: 1981 steps, the left side winning by the right's fall at
  16.508 s, no blow, `356c4896aa6f3b7b`.

Played to the steps they used to end at (`node research/bout-trace.mjs workshop-fighter
workshop-rogue 21.224`, and `crypt-skeleton crypt-skeleton 16.224`), both give the digests above
this section: the bouts are the same to the bit until the old verdict.
