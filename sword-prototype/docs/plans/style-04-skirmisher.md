# Session 04 -- `golem-skirmisher`

**Status (2026-09-06): planned. Needs 03.**

## Outcome

A style that stays outside their reach, comes in with one committed cut on their recover, and
goes out again: the hit-and-run direction.

## Frozen choices

- A director over Session 03's executor, in src/golem/styles/skirmisher.ts, registered as the
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
