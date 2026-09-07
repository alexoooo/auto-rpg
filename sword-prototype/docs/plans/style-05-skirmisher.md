# Session 05 -- `golem-skirmisher`

**Status (2026-09-07): implemented; the human gate is open.** The style, its registration, the
five tests, the nine sweep rows and the two league runs are in the Session 05 entry of
`../measurements.md`. Three of the plan's own numbers came back other than it expected and are
recorded rather than worked around. `patience` is 2.0 and not the planned 2.5, adopted at 2.8
standard errors with every structural column agreeing -- the first constant this set has moved
off a sweep. Four of the five predicted signatures do not hold: the style's mark is `stall s`
and not `outside s`, because a retreat that ends the moment the gap clears their point never
goes far. And `retreatSeconds` is a constant this style never reads, because the gap ends every
retreat before the clock does; its two cells reproduce the default row to the digit and are
reported as unexercised rather than as flat.

Two findings from the league belong in front of the gate as much as the verdict does. Out-reached,
the style spends 8.04 s of a bout inside their point with nothing landing either way, against
three for the fencer and the form -- one branch of the director, named as a defect and not fixed
here, because fixing it means giving the shorter arm a different plan rather than moving a
number. And on `sword/long` at equal reach both v3 styles lose to the fencer at 3.7 standard
errors, which is a reading about the executor rather than either style.

## Outcome

A style that stays outside their reach, comes in with one committed cut on their recover, and
goes out again: the hit-and-run direction.

## Frozen choices

- A director over Session 04's executor, in src/golem/styles/skirmisher.ts, registered as the
  others. Its rules, in terms of the reading:
  - stand-off 1.12 of their reach, 0.2 m outside a mirror opponent's point;
  - between exchanges, `circle` while their phase is idle and `hold` during their chamber;
  - their recover: `cut`, the only way in, reachable from out here through `cutReachMetres`;
  - patience 2.5 s: `cut`;
  - every exchange ends: `retreat` at once, until the gap exceeds their reach plus slack;
  - their commit inside their reach: `void`;
  - `feint` on 0.10 of chambers, to draw a commit;
  - the longer arm: `strike` when their closing rate exceeds `stopHitClosing` (the stop-hit);
  - the shorter arm, for which a stand-off outside their reach is meaningless: `retreat` and
    `cut` alternate, with `wait` on their recover;
  - no parry.
- **Draws are counted honestly.** On the 60 s cap a skirmisher that lands little and takes
  nothing draws, and a draw is half a point. The row is what it is; the mid-band and short-reach
  bodies draw under every mind anyway.

## Implement

1. The style file, its table and its registration; the override prefix `skirmisher.`.
2. Tests in `../../tests/golem-mind.test.mjs`: on the fixture the skirmisher never opens an
   exchange against an idle opponent inside 2.5 s; `cut` is chosen within one step of a read
   recover; after the exchange the next option is `retreat` and stays so until the gap opens.
   One real short bout.
3. Runs, `--bouts 512 --mirror --cross --random 40 --cap 60 --seed 20260906`:
   `standOffFraction` {1.06, 1.12, 1.20}, patience {2.0, 2.5, 3.5}, `feintFraction` {0, 0.10,
   0.25}, `retreatSeconds` {0.8, 1.2, 1.8}; then the league row against every shipped mind on
   the mirrored pool and one random-pairs run. Expected signature: the lowest clinch of any
   mind, the highest retreat-outside seconds, fewer strokes than the fencer, the highest damage
   a stroke and committed fraction.
4. The entry in `../measurements.md`; a paragraph in `../design.md`; README.

## Human gate

The owner watches it on three random matchups: does it read as hit-and-run rather than as
running. Verdict into this file's status line.

## Verification

```powershell
npm run check
node --test tests/golem-mind.test.mjs tests/minds.test.mjs tests/units.test.mjs
npm run tournament -- --bouts 64 --mirror --policies golem-fencer,golem-skirmisher
npm test
npm run build
git diff --check -- .
```

## What remains

A skirmisher on a maul is a maul that circles and rams, because a paired grip is offered no cut
from outside; the file says so rather than pretending, and the league row by build class shows it.
