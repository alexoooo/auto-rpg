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

## Lying still

Harness: Node 24.19, the core world (`src/core/world.ts`), Rapier, 120 Hz. Read on the first
tree whose bodies lie still once they are down (`lie`, `rising.md#lying`).

A bout that ends by a fall ends on the step its loser is first down, and on that step the
loser's mind hands its body to `lie`, where it used to drive it once more. So such a bout is the
same to the bit up to the step before its verdict, has the same verdict at the same step, and
differs in the poses of that one step. A bout that ends another way is the same throughout.

The digests `research/bout-trace.mjs` reads from here on, on this machine:

- the Warrior against the Rogue at 4 m: 2563 steps, the left side winning by the right's fall at
  21.358 s, 14 wounding blows and 2 clashes, `6f7ded18dd73c7f8`;
- skeleton against skeleton at 4 m: 1981 steps, the left side winning by the right's fall at
  16.508 s, no blow, `489780706aad98b9`.

With a mind that hands its body to nobody on both sides (`--mind '{"kind":"fighter","subs":[]}'`)
both give the digests of the section above. Played a step short of the verdict (`node
research/bout-trace.mjs workshop-fighter workshop-rogue 21.349`, and `crypt-skeleton
crypt-skeleton 16.499`), the game's mind and that one give the same digests: `76fd792f95855fef`
over 2562 steps and `35fa4058e1f57862` over 1980.

## A blow has two sides

Harness: Node 24.19, the core world (`src/core/world.ts`), Rapier, 120 Hz, each side's balance
its character's (0 %). Read on the first tree whose blows have no striker: any two segments of the
two sides that meet closing have met in a blow, and the two surfaces share its energy by their
compliance ([wounds.md](wounds.md#shares)). Before it a blow was a hand, with what it holds,
landing on a body, and whatever it landed on took the whole of it.

```powershell
node research/bout-baseline.mjs --gaps 3,4,5 --workers 14 --floors 1,5
```

The same 27 bouts as the standing table.

| Left | Right | Gap, m | Winner | Ending | Seconds | Blows | Wounding | Clashes | Left bar | Right bar |
|---|---|---|---|---|---|---|---|---|---|---|
| workshop-fighter | workshop-fighter | 3 | right | severed | 11.83 | 1 | 1 | 0 | 0.86 | 1.00 |
| workshop-fighter | workshop-rogue | 3 | left | severed | 13.54 | 3 | 3 | 1 | 1.00 | 0.79 |
| workshop-fighter | crypt-skeleton | 3 | left | fallen | 10.09 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-rogue | workshop-fighter | 3 | right | fallen | 24.01 | 10 | 10 | 2 | 0.97 | 1.00 |
| workshop-rogue | workshop-rogue | 3 | left | fallen | 10.82 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-rogue | crypt-skeleton | 3 | right | fallen | 10.00 | 2 | 2 | 0 | 0.94 | 1.00 |
| crypt-skeleton | workshop-fighter | 3 | right | severed | 9.55 | 1 | 1 | 0 | 0.85 | 1.00 |
| crypt-skeleton | workshop-rogue | 3 | left | fallen | 10.78 | 1 | 1 | 0 | 1.00 | 1.00 |
| crypt-skeleton | crypt-skeleton | 3 | right | fallen | 14.91 | 7 | 7 | 0 | 1.00 | 0.99 |
| workshop-fighter | workshop-fighter | 4 | right | severed | 20.07 | 6 | 6 | 0 | 0.86 | 1.00 |
| workshop-fighter | workshop-rogue | 4 | left | fallen | 21.36 | 14 | 14 | 1 | 0.99 | 0.85 |
| workshop-fighter | crypt-skeleton | 4 | left | severed | 10.22 | 2 | 2 | 0 | 1.00 | 0.87 |
| workshop-rogue | workshop-fighter | 4 | right | fallen | 13.10 | 2 | 2 | 3 | 0.85 | 1.00 |
| workshop-rogue | workshop-rogue | 4 | right | fallen | 20.23 | 3 | 3 | 1 | 1.00 | 1.00 |
| workshop-rogue | crypt-skeleton | 4 | right | fallen | 16.74 | 5 | 5 | 1 | 0.92 | 0.97 |
| crypt-skeleton | workshop-fighter | 4 | right | fallen | 11.88 | 4 | 4 | 0 | 0.96 | 1.00 |
| crypt-skeleton | workshop-rogue | 4 | left | fallen | 12.34 | 0 | 0 | 0 | 1.00 | 1.00 |
| crypt-skeleton | crypt-skeleton | 4 | left | fallen | 16.51 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-fighter | workshop-fighter | 5 | right | fallen | 12.32 | 17 | 17 | 1 | 0.96 | 0.94 |
| workshop-fighter | workshop-rogue | 5 | left | severed | 9.61 | 1 | 1 | 0 | 1.00 | 0.81 |
| workshop-fighter | crypt-skeleton | 5 | left | fatal | 11.80 | 2 | 2 | 0 | 1.00 | 0.92 |
| workshop-rogue | workshop-fighter | 5 | right | fatal | 9.59 | 1 | 1 | 0 | 0.89 | 1.00 |
| workshop-rogue | workshop-rogue | 5 | right | fallen | 13.35 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-rogue | crypt-skeleton | 5 | left | fallen | 14.32 | 2 | 2 | 0 | 0.99 | 1.00 |
| crypt-skeleton | workshop-fighter | 5 | right | fallen | 12.57 | 2 | 2 | 0 | 1.00 | 0.97 |
| crypt-skeleton | workshop-rogue | 5 | right | fallen | 17.10 | 0 | 0 | 0 | 1.00 | 1.00 |
| crypt-skeleton | crypt-skeleton | 5 | left | fallen | 18.78 | 1 | 1 | 0 | 0.99 | 1.00 |

| | Down read from the body | A blow has two sides |
|---|---|---|
| Bouts by ending | fatal 2, fallen 19, severed 6 | fatal 2, fallen 19, severed 6 |
| Bout time, s | 377 | 377 |
| Falls a minute | 3.02 (19 falls) | 3.02 (19 falls) |
| Wounding blows a minute | 10.3 | 13.8 |
| Clashes | 64 | 10 |
| Ended before any wounding blow | 7 of 27 | 6 of 27 |

Every winner, ending and second is as it was: a wound moves no body until it decides the bout,
and no bout is decided otherwise or at another step. What changed is the count. A clash was a
hand's body meeting a hand's body, read once from each, so the 64 were 32 meetings; a touch is
now read once, and it is a clash only where both surfaces are items. A club that meets the hand
under another club is a blow, on the hand; a club caught on a bare left hand, and an arm or a
leg that meets the other body, are blows where they were nothing. Two bars moved, each by 0.01.

**What the blows cost**, the same command over five gaps: 45 bouts
(`--gaps 3,3.5,4,4.5,5`). A row is a matchup's five bouts, a mean a bout: the hit points the
blows took from the two sides together; of them, those a side lost to a blow its own bare hand
was in (own), and those lost where neither surface was a hand's or an item's (jostled); hands
emptied by a blow they were in (ruined), and taken off by one (off).

| Left | Right | Endings | Seconds | Blows | HP taken | Own | Jostled | Ruined | Off |
|---|---|---|---|---|---|---|---|---|---|
| workshop-fighter | workshop-fighter | fallen 3, severed 2 | 15.4 | 7.0 | 0.992 | 0.016 | 0.000 | 0.00 | 0.00 |
| workshop-fighter | workshop-rogue | severed 4, fallen 1 | 12.4 | 4.2 | 0.704 | 0.002 | 0.000 | 0.00 | 0.00 |
| workshop-fighter | crypt-skeleton | fatal 3, fallen 1, severed 1 | 10.6 | 1.4 | 0.481 | 0.000 | 0.000 | 0.00 | 0.00 |
| workshop-rogue | workshop-fighter | fallen 4, fatal 1 | 14.2 | 4.0 | 0.386 | 0.010 | 0.000 | 0.00 | 0.00 |
| workshop-rogue | workshop-rogue | fallen 5 | 14.7 | 0.8 | 0.007 | 0.000 | 0.000 | 0.00 | 0.00 |
| workshop-rogue | crypt-skeleton | fallen 5 | 12.9 | 2.8 | 0.262 | 0.083 | 0.000 | 0.40 | 0.40 |
| crypt-skeleton | workshop-fighter | fallen 4, severed 1 | 16.7 | 6.4 | 0.869 | 0.096 | 0.000 | 0.20 | 0.20 |
| crypt-skeleton | workshop-rogue | fallen 5 | 12.9 | 0.8 | 0.015 | 0.003 | 0.000 | 0.00 | 0.00 |
| crypt-skeleton | crypt-skeleton | fallen 5 | 16.9 | 4.0 | 0.052 | 0.000 | 0.000 | 0.00 | 0.00 |
| every matchup, 45 bouts | | fallen 33, severed 8, fatal 4 | 14.1 | 3.5 | 0.419 | 0.023 | 0.000 | 0.07 | 0.07 |

With the club in every right hand, a bout's blows take 0.42 HP and 0.023 of it is a bare hand's
in a blow it was in: a left hand that punched, or met a club. Three such hands in 45 bouts were
emptied and taken off. Nothing was jostled: no blow here had neither a hand nor a club in it.
Over the 45: 633 s of bout time, 3.13 falls a minute, 14.9 wounding blows a minute, and 12 bouts
ended before any wounding blow.

Where no blunt blow takes a part off (`--never-off`: the sever margin out of reach), the same 45:

| | A part comes off | No part comes off |
|---|---|---|
| Bouts by ending | fallen 33, severed 8, fatal 4 | fallen 32, fatal 13 |
| Bout time, s | 633 | 627 |
| Falls a minute | 3.13 (33 falls) | 3.06 (32 falls) |
| HP a bout the blows took | 0.419 | 0.436 |
| Of it, a bare hand's in a blow it was in | 0.023 | 0.027 |
| Hands emptied by such a blow, a bout | 0.07 | 0.07 |

No bout ends by a part coming off, and 13 end by a fatal wound where 4 did. The same three hands
are emptied, and stay on.

**Bare hands** (`--held empty`, the same 45 bouts with nothing in either right hand):

| Left | Right | Endings | Seconds | Blows | HP taken | Own | Jostled | Ruined | Off |
|---|---|---|---|---|---|---|---|---|---|
| workshop-fighter | workshop-fighter | fallen 5 | 2.9 | 0.0 | 0.000 | 0.000 | 0.000 | 0.00 | 0.00 |
| workshop-fighter | workshop-rogue | fallen 5 | 13.5 | 111.2 | 0.247 | 0.066 | 0.102 | 0.20 | 0.00 |
| workshop-fighter | crypt-skeleton | fallen 5 | 13.0 | 63.6 | 0.231 | 0.026 | 0.186 | 0.00 | 0.00 |
| workshop-rogue | workshop-fighter | fallen 5 | 2.9 | 0.0 | 0.000 | 0.000 | 0.000 | 0.00 | 0.00 |
| workshop-rogue | workshop-rogue | fallen 5 | 22.2 | 410.8 | 0.178 | 0.022 | 0.142 | 0.00 | 0.00 |
| workshop-rogue | crypt-skeleton | fallen 5 | 20.1 | 131.2 | 0.318 | 0.052 | 0.225 | 0.00 | 0.00 |
| crypt-skeleton | workshop-fighter | fallen 5 | 2.9 | 0.0 | 0.000 | 0.000 | 0.000 | 0.00 | 0.00 |
| crypt-skeleton | workshop-rogue | fallen 5 | 18.6 | 118.2 | 0.187 | 0.021 | 0.151 | 0.00 | 0.00 |
| crypt-skeleton | crypt-skeleton | fallen 5 | 20.6 | 38.0 | 0.147 | 0.025 | 0.108 | 0.00 | 0.00 |
| every matchup, 45 bouts | | fallen 45 | 13.0 | 97.0 | 0.145 | 0.024 | 0.102 | 0.02 | 0.00 |

- **Every bare-handed bout ends by a fall**, and its blows take 0.15 HP of the 10 to 12 the two
  sides have: the hardest of 4365 blows is 22 J, and nine in ten are under 0.3 J. Fists as they
  are thrown today decide nothing.
- **Most of what is lost is jostled**: 0.102 of the 0.145 HP is from blows with neither a hand
  nor an item in them, which is two bodies that have walked into each other. A side's bare hand
  in a blow costs it 0.024.
- **One hand was emptied by a blow it was in** in 45 bouts, and none came off: `--never-off`
  gives the same 45 rows.
- **The Warrior with an empty right hand, on the right, falls at 2.9 s** in all 15 of its bouts,
  before any touch: it turns from its heading by a quarter turn as it sets off. On the left, and
  on either side with the club, it walks. It is a defect of the walk and not of the blows, and
  those 15 bouts say nothing of them.

**A floor.** What the blows under 1 J and under 5 J were, read from the blows that landed and
not played again: a bout that a fall or the clock decided is the same bout under a floor, less
those blows.

| Held | Blows | HP taken | Under 1 J: blows | HP | Of all HP, % | Under 5 J: blows | HP | Of all HP, % |
|---|---|---|---|---|---|---|---|---|
| the club, 27 bouts | 97 | 9.185 | 44 | 0.047 | 0.5 | 65 | 0.429 | 4.7 |
| the club, 45 bouts | 175 | 18.841 | 75 | 0.075 | 0.4 | 112 | 0.692 | 3.7 |
| nothing, 45 bouts | 4365 | 6.542 | 4165 | 1.477 | 22.6 | 4327 | 3.932 | 60.1 |

With clubs a floor of 1 J drops four blows in ten and half a per cent of the hit points. Bare
handed it drops 95 % of the blows and 23 % of the hit points; a floor of 5 J would drop 60 %,
most of what a fist does today. A blow's energy with clubs, over the 45 bouts: half under 1.5 J,
three quarters under 13.5 J, nine tenths under 64.6 J, the most 131.8 J.

**In the crypt** (`node research/crypt-blows.mjs`, and `--companions 2`: Node, a crypt run with
no visuals, Rapier, 120 Hz, seeds 1 to 4, the hero exploring to the run's end or 120 s). What met
in each blow, and the blows in which one side was already out of the fight, which is a body on
the floor whose pool has not ended:

| The hero | What met | Blows | Most J | HP taken | With a side out of the fight: blows | HP | Of it, from a side still in the fight |
|---|---|---|---|---|---|---|---|
| alone | an item on a body | 32 | 73.2 | 1.265 | 26 | 0.589 | 0.027 |
| alone | an item on a bare hand | 2 | 3.4 | 0.024 | 0 | 0.000 | 0.000 |
| alone | a bare hand on a body | 14 | 2.7 | 0.035 | 14 | 0.035 | 0.018 |
| alone | two bodies, no hand or item | 52 | 7.7 | 0.281 | 52 | 0.281 | 0.098 |
| alone | an item on an item | 1 | 22.0 | 0.000 | 0 | 0.000 | 0.000 |
| with two | an item on a body | 32 | 73.2 | 1.185 | 25 | 0.719 | 0.003 |
| with two | an item on a bare hand | 7 | 2.2 | 0.016 | 6 | 0.000 | 0.000 |
| with two | a bare hand on a body | 9 | 2.1 | 0.035 | 9 | 0.035 | 0.008 |
| with two | two bodies, no hand or item | 348 | 20.6 | 0.957 | 348 | 0.957 | 0.119 |
| with two | an item on an item | 3 | 0.1 | 0.000 | 3 | 0.000 | 0.000 |

Every one of the 400 blows between two bodies with no hand or item in them had a side already
on the floor: a body that walks over a fallen one, or a limp one settling against it. They cost
the sides still in the fight 0.10 to 0.12 HP over four runs. Four runs a row, and a rule changes
a fight's course: counts, and no rates.

The digests `research/bout-trace.mjs` reads are those of the section above, the poses being the
same: the Warrior against the Rogue at 4 m, 2563 steps, the left side winning by the right's fall
at 21.358 s, `6f7ded18dd73c7f8`, now with 14 wounding blows and 1 clash; skeleton against
skeleton at 4 m, 1981 steps, `489780706aad98b9`, no blow.

## A hit point is 100 J

Harness: Node 24.19, the core world (`src/core/world.ts`), Rapier, 120 Hz, each side's balance
its character's (0 %). Read on the first tree whose unit is 100 J of blunt blow a hit point
([wounds.md](wounds.md#unit)); every section above is at 138.26 J, the Warrior's strongest club
blow. The bodies' hit points are as they were, so each holds 28 % fewer joules.

```powershell
node research/bout-baseline.mjs --gaps 3,4,5 --workers 14 --floors 1,5
```

The same 27 bouts, and the same again at the unit that was (`--unit 138.26`), on one tree: its
rows are the section above's.

| Left | Right | Gap, m | Winner | Ending | Seconds | Blows | Wounding | Clashes | Left bar | Right bar |
|---|---|---|---|---|---|---|---|---|---|---|
| workshop-fighter | workshop-fighter | 3 | right | severed | 11.83 | 1 | 1 | 0 | 0.81 | 1.00 |
| workshop-fighter | workshop-rogue | 3 | left | severed | 13.54 | 3 | 3 | 1 | 1.00 | 0.71 |
| workshop-fighter | crypt-skeleton | 3 | left | fallen | 10.09 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-rogue | workshop-fighter | 3 | right | fallen | 24.01 | 10 | 10 | 2 | 0.95 | 0.99 |
| workshop-rogue | workshop-rogue | 3 | left | fallen | 10.82 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-rogue | crypt-skeleton | 3 | right | fallen | 10.00 | 2 | 2 | 0 | 0.93 | 1.00 |
| crypt-skeleton | workshop-fighter | 3 | right | severed | 9.55 | 1 | 1 | 0 | 0.79 | 1.00 |
| crypt-skeleton | workshop-rogue | 3 | left | fallen | 10.78 | 1 | 1 | 0 | 1.00 | 1.00 |
| crypt-skeleton | crypt-skeleton | 3 | right | fallen | 14.91 | 7 | 7 | 0 | 1.00 | 0.98 |
| workshop-fighter | workshop-fighter | 4 | right | severed | 20.07 | 6 | 6 | 0 | 0.80 | 1.00 |
| workshop-fighter | workshop-rogue | 4 | left | fallen | 21.36 | 14 | 14 | 1 | 0.99 | 0.79 |
| workshop-fighter | crypt-skeleton | 4 | left | severed | 10.22 | 2 | 2 | 0 | 1.00 | 0.82 |
| workshop-rogue | workshop-fighter | 4 | right | fallen | 13.10 | 2 | 2 | 3 | 0.80 | 1.00 |
| workshop-rogue | workshop-rogue | 4 | right | fallen | 20.23 | 3 | 3 | 1 | 1.00 | 1.00 |
| workshop-rogue | crypt-skeleton | 4 | right | fallen | 16.74 | 5 | 5 | 1 | 0.89 | 0.96 |
| crypt-skeleton | workshop-fighter | 4 | right | fallen | 11.88 | 4 | 4 | 0 | 0.94 | 1.00 |
| crypt-skeleton | workshop-rogue | 4 | left | fallen | 12.34 | 0 | 0 | 0 | 1.00 | 1.00 |
| crypt-skeleton | crypt-skeleton | 4 | left | fallen | 16.51 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-fighter | workshop-fighter | 5 | right | fallen | 12.32 | 15 | 15 | 1 | 0.95 | 0.87 |
| workshop-fighter | workshop-rogue | 5 | left | severed | 9.61 | 1 | 1 | 0 | 1.00 | 0.74 |
| workshop-fighter | crypt-skeleton | 5 | left | severed | 11.80 | 2 | 2 | 0 | 1.00 | 0.89 |
| workshop-rogue | workshop-fighter | 5 | right | severed | 9.59 | 1 | 1 | 0 | 0.85 | 1.00 |
| workshop-rogue | workshop-rogue | 5 | right | fallen | 13.35 | 0 | 0 | 0 | 1.00 | 1.00 |
| workshop-rogue | crypt-skeleton | 5 | left | fallen | 14.32 | 2 | 2 | 0 | 0.99 | 1.00 |
| crypt-skeleton | workshop-fighter | 5 | right | fallen | 12.57 | 2 | 2 | 0 | 1.00 | 0.96 |
| crypt-skeleton | workshop-rogue | 5 | right | fallen | 17.10 | 0 | 0 | 0 | 1.00 | 1.00 |
| crypt-skeleton | crypt-skeleton | 5 | left | fallen | 18.78 | 1 | 1 | 0 | 0.98 | 1.00 |

| | 138.26 J a hit point | 100 J |
|---|---|---|
| Bouts by ending | fatal 2, fallen 19, severed 6 | fallen 19, severed 8 |
| Bout time, s | 377 | 377 |
| Falls a minute | 3.02 (19 falls) | 3.02 (19 falls) |
| Wounding blows a minute | 13.8 (87 blows) | 13.5 (85 blows) |
| Clashes | 10 | 10 |
| Ended before any wounding blow | 6 of 27 | 6 of 27 |
| HP a bout the blows took | 0.340 | 0.470 |

Every winner and second is as it was. The two bouts a fatal wound ended are ended at the same
step by the head coming off: the blow that emptied it goes half its hit points past empty now.
Two blows fewer landed, in the Warriors' bout at 5 m: the right's left upper arm comes off at
10.19 s, with the forearm and the hand, and an arm that is off meets nothing after. The bars are
lower: a blow is worth 1.38 times what it was. Under a floor of 1 J are 42 of the 95 blows and
0.5 % of the hit points taken, and under 5 J 63 and 4.7 %, as before.

**Over five gaps**, 45 bouts (`--gaps 3,3.5,4,4.5,5`), a row a matchup's five bouts and a mean a
bout, as in the section above:

| Left | Right | Endings at 138.26 J | At 100 J | Seconds at 138.26 J | At 100 J | HP taken at 138.26 J | At 100 J |
|---|---|---|---|---|---|---|---|
| workshop-fighter | workshop-fighter | fallen 3, severed 2 | severed 2, fallen 2, fatal 1 | 15.4 | 12.1 | 0.992 | 1.098 |
| workshop-fighter | workshop-rogue | severed 4, fallen 1 | severed 4, fallen 1 | 12.4 | 12.4 | 0.704 | 0.974 |
| workshop-fighter | crypt-skeleton | fatal 3, fallen 1, severed 1 | severed 4, fallen 1 | 10.6 | 10.6 | 0.481 | 0.665 |
| workshop-rogue | workshop-fighter | fallen 4, fatal 1 | fallen 4, severed 1 | 14.2 | 14.2 | 0.386 | 0.534 |
| workshop-rogue | workshop-rogue | fallen 5 | fallen 5 | 14.7 | 14.7 | 0.007 | 0.010 |
| workshop-rogue | crypt-skeleton | fallen 5 | fallen 5 | 12.9 | 12.9 | 0.262 | 0.362 |
| crypt-skeleton | workshop-fighter | fallen 4, severed 1 | fallen 3, severed 1, fatal 1 | 16.7 | 13.7 | 0.869 | 1.155 |
| crypt-skeleton | workshop-rogue | fallen 5 | fallen 5 | 12.9 | 12.9 | 0.015 | 0.021 |
| crypt-skeleton | crypt-skeleton | fallen 5 | fallen 5 | 16.9 | 16.9 | 0.052 | 0.072 |
| every matchup, 45 bouts | | fallen 33, severed 8, fatal 4 | fallen 31, severed 12, fatal 2 | 14.1 | 13.4 | 0.419 | 0.543 |

Two of the 45 are other bouts, both at 3.5 m, and each is a long bout a wound now ends:

- **The Warriors**: the right won by the left's fall at 29.15 s, and wins by a fatal wound at
  12.89 s.
- **The skeleton against the Warrior**: the skeleton won by the Warrior's fall at 45.67 s, and
  the Warrior wins by a fatal wound at 30.65 s.

The other 43 have the winner and the second they had, four of them ended by a head coming off
where a fatal wound ended them. Over the 45: 601 s of bout time where there were 633, 3.09 falls
a minute (31 falls), 14.9 wounding blows a minute (149 blows, and 18 clashes in each), 12 bouts
ended before any wounding blow; a bare hand in a blow costs its side 0.032 HP a bout where it
cost 0.023, and the same three hands are emptied and come off. With no part coming off
(`--never-off`) the 45 end at the same seconds, 601 s in all: fallen 31 and fatal 14, each of
the 12 a part's coming off ended being ended by a fatal wound.

**Bare hands** (`--held empty`), the same 45: every bout is the bout it was, by a fall at the
same second. The blows take 0.200 HP a bout where they took 0.145, 0.140 of it jostled and 0.032
a side's own bare hand's. The one hand a blow of its own emptied comes off now, in a bout of the
Warrior against the Rogue, and 18 blows fewer land (4347).

**A floor** (`--floors 1,5`), read from the blows that landed as in the section above:

| Held | Blows | HP taken | Under 1 J: blows | HP | Of all HP, % | Under 5 J: blows | HP | Of all HP, % |
|---|---|---|---|---|---|---|---|---|
| the club, 27 bouts | 95 | 12.699 | 42 | 0.064 | 0.5 | 63 | 0.593 | 4.7 |
| the club, 45 bouts | 167 | 24.450 | 73 | 0.104 | 0.4 | 108 | 0.921 | 3.8 |
| nothing, 45 bouts | 4347 | 8.992 | 4148 | 2.036 | 22.6 | 4309 | 5.384 | 59.9 |

The shares are within 0.2 of a per cent of those at 138.26 J: a floor is in joules, and all but
a few of the blows are the same blows.

The digests `research/bout-trace.mjs` reads are those of [Lying still](#lying-still), the poses
being the same: the Warrior against the Rogue at 4 m, 2563 steps, `6f7ded18dd73c7f8`, 14 wounding
blows and 1 clash, its bars now 0.992 and 0.791; skeleton against skeleton, 1981 steps,
`489780706aad98b9`, no blow.

**In the crypt** (`node research/crypt-blows.mjs`, and `--companions 2`, as in the section
above), where a wound ends a monster and so changes the run's course: these are other runs, and
counts, not rates.

| The hero | What met | Blows | Most J | HP taken | With a side out of the fight: blows | HP | Of it, from a side still in the fight |
|---|---|---|---|---|---|---|---|
| alone | an item on a body | 15 | 73.2 | 1.711 | 12 | 1.334 | 0.000 |
| alone | a bare hand on a body | 4 | 2.7 | 0.028 | 4 | 0.028 | 0.014 |
| alone | two bodies, no hand or item | 39 | 7.7 | 0.286 | 39 | 0.286 | 0.112 |
| with two | an item on a body | 61 | 73.2 | 1.584 | 54 | 1.251 | 0.000 |
| with two | an item on a bare hand | 5 | 0.1 | 0.001 | 5 | 0.001 | 0.000 |
| with two | a bare hand on a body | 16 | 11.6 | 0.184 | 16 | 0.184 | 0.000 |
| with two | two bodies, no hand or item | 149 | 7.7 | 0.504 | 149 | 0.504 | 0.054 |
| with two | an item on an item | 12 | 0.0 | 0.000 | 12 | 0.000 | 0.000 |

Every one of the 188 blows between two bodies with no hand or item in them has a side already on
the floor, as before, and they cost the sides still in the fight 0.11 and 0.05 HP over four runs.
The hero alone is dead in all four runs, by 14 s, 40 s, 57 s and 66 s; with two beside it, it is
playing at 120 s in all four.
