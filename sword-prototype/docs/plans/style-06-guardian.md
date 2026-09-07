# Session 06 -- `golem-guardian`

**Status (2026-09-07): implemented; the human gate is open. A wall shipped, not an intercept.**
The style, its registration, the six tests, the ten sweep rows, the two confirmation rows on a
held-out seed, the two switch rows re-asked of the shipped table and the two league runs are in
the Session 06 entry of `../measurements.md`.

**The plan's open question is answered and the answer came from the executor rather than from
Session 02's bench.** `solveIntercept` reads their published `tipVelocity` and refuses a tip that
is not closing on my guard shell, and an arm drawing back to chamber has a tip going the wrong
way by construction -- so before a stroke starts there is no crossing to solve *in principle*,
whatever the plate's arrival time is. `wallOnChamber` is a new row on the executor's table, off
by default so the two older styles and the four v2 minds are byte-identical without it; with it
on, the spare hand is placed on the bearing from my socket to their tip at the shell radius and
`Intercept` carries a `wall` flag so the two kinds are distinguishable in a test and in a log.

**The capability is free rather than good, and that is this session's headline.** With the row on,
132 of the guardian's 235 parries go out during a chamber instead of 14. On the bar it is
+0.0037 ± 0.0058 in favour of switching it *off* against the shipped table and +0.0046 ± 0.0081
against the plan's -- two runs, two tables, the same six tenths of a standard error and the same
sign. It books four more blows a bout on a hand slot and takes 0.7 more damage, because a hand on
a bearing leaves the body where it was and the `duck` and `void` it displaces do not.

**`ripostesQuick` ships off, against this file's own frozen choice.** +0.0281 on seed 20260906 and
+0.0259 on a held-out 20260907, 3.6 standard errors combined, with a harder stroke, a higher
committed fraction, more blocks, less damage taken and less clinch agreeing on both seeds. The
argument for the quick stroke was arithmetically right and rested on a window this file measured
as 0.40 s: their recover runs 0.30 s and `GOLEM_TACTICS.cooldown` holds them 0.30 more, so it is
0.60, and a committed sword cut is on the mark 0.43 s from the ask.

**All four signatures this file predicted in advance fail.** Of eight minds on the mirrored pool
the guardian is seventh on `blocks` and seventh on `catches`, fourth lowest on damage taken, and
*lowest* on the caught fraction of its opponents' strokes -- the one of the four that is a rate
rather than a count and so cannot be blamed on its quieter bout. It covers earlier and more often
than any mind in the league and is hit through the cover. It is also the worst mind in the league
when out-reached (−0.160 standardised) and, having no rule that branches on `longer` at all,
near the worst at using a longer arm. What it owns is the owner's own complaint: clinch 1.04 s a
bout mirrored and 1.39 s on random pairs, lowest in the league both times.

## Outcome

A style that meets their blade with its plate or spare blade, ripostes into their recover, and
shoves when they come inside: the defensive direction, and the first golem that blocks on purpose.

## Frozen choices

- A director over Session 04's executor, in src/golem/styles/guardian.ts, registered as the
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

The plate never wears (Session 01), so what this session reports instead is how much of what
was thrown at the guardian its plate stopped, and whether the plate's stone mass is what keeps
the parry from arriving in time; a lighter plate is a build variant for the owner to call, not a
number this session moves.
