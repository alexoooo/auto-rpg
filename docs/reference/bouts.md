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
