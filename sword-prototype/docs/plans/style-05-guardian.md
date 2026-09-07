# Session 05 -- `golem-guardian`

**Status (2026-09-06): planned. Needs 03.**

## Outcome

A style that meets their blade with its plate or spare blade, ripostes into their recover, and
shoves when they come inside: the defensive direction, and the first golem that blocks on purpose.

## Frozen choices

- A director over Session 03's executor, in src/golem/styles/guardian.ts, registered as the
  others. Its rules:
  - stand-off 1.00; `hold` with the ordinary cover between exchanges;
  - their chamber: `parry`, pre-positioned from the chamber read and refined every step through
    the commit;
  - their recover: `strike`, the quick riposte with no step;
  - the gap at or inside the inner radius plus 0.15 of my reach: `shove`;
  - patience 3.0 s: `cut`;
  - `chamberAbort` on;
  - no spare cover (a lost spare, a paired grip): `duck` when their tip is above my shoulder,
    else `void`, in place of `parry`;
  - two blades: the spare blade parries at `parryBite` 0.5 and the riposte is the other hand, the
    executor's hand alternation carried over from v2.
- **Intercept or wall is Session 02's number.** If the plate arrives inside about 0.10 s the
  parry is the true intercept; if slower, the parry is a wall placed at the intercept from the
  chamber read and held through the commit. This file's status line records which shipped.

## Implement

1. The style file, its table and its registration; the override prefix `guardian.`.
2. Tests in `../../tests/golem-mind.test.mjs`: on the fixture with a scripted incoming tip the
   spare hand's command tracks the intercept for the whole commit and releases
   `readRecoverSeconds` after; `strike` is chosen on the first step of their recover; `shove`
   fires inside the near radius; with no spare cover a high incoming tip yields `duck` and a low
   one `void`. One
   real short bout.
3. Runs, `--bouts 512 --mirror --cross --random 40 --cap 60 --seed 20260906`: `parryHorizon`
   {0.25, 0.35, 0.50}, `parryMargin` {0.10, 0.15, 0.25}, the riposte as `strike` against `cut`,
   `shoveLean` {0.5, 0.7, 0.9}; the league row, mirrored and random. Expected signature: the
   highest catches and blocks of any mind, the lowest damage taken, strokes moderate, and on the
   opponent's rows the highest caught fraction.
4. The entry in `../measurements.md`; a paragraph in `../design.md`; README.

## Human gate

The owner watches it on three random matchups: does the plate visibly meet the blade, and does
the riposte follow it. Verdict into this file's status line.

## Verification

```powershell
npm run check
node --test tests/golem-mind.test.mjs tests/minds.test.mjs tests/units.test.mjs
npm run tournament -- --bouts 64 --mirror --policies golem-fencer,golem-guardian
npm test
npm run build
git diff --check -- .
```

## What remains

How fast a plate wears under Session 01's booking when a mind puts it in the way on purpose is
this session's number to report; Session 01's "what remains" names where a durability change
would go.
