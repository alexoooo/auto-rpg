# Session 07 -- `golem-brawler`

**Status (2026-09-07): implemented; the human gate is open. The style reads; the sweep does not.**
The style, its registration, the six tests, the ten sweep rows, the three confirmation rows on a
held-out seed and the two league runs are in the Session 07 entry of `../measurements.md`.

**Two of this file's five predicted signatures hold, and they are the two about range.** In the
mirrored league of nine minds the brawler spends 31.6 % of the bout inside its own inner radius,
against 19.3 % for the next mind and 8.6 % for the last, and clinches 0.77 s a bout, the lowest of
the nine. It does *not* throw the most strokes (1.42 a second, sixth), take the most severs (0.13,
tied third) or deal the lowest damage a stroke (0.87, third highest). It is third of nine mirrored
and, once the reach draw is standardised out, sixth of nine on random pairs.

**Not one swept constant moved the bar.** Nine rows differenced bout by bout against the row
beside them, the largest 1.7 standard errors; the two that were this session's own questions --
the sever-hunter and the walk-in-by-default last line -- were asked again on seed 20260907 and
`targetByHealth` changed sign. `strikeBite` is *inert* at this style's own range rather than
merely un-tuned: the anchor axis saturates at `reachMax + overhang * (1 - bite)` metres, which for
0.66, 0.80 and 0.90 alike is inside the strike band, and a test pins it. This file's gloss of that
row -- "the arm stays drawn" at 0.80 -- has the direction backwards; a larger bite asks the anchor
for more.

**Three of this file's rules were already in the executor and one could not be spoken.**
`comboFraction` has been 1.0 for every mind since v2 and is already skipped for a paired grip; a
paired shove is already both channels; `crowdedSeconds` is a v1 reflex `tactics-v3.ts` does not
read. "Thrust at the head when the head is the weakest slot" needed a new capability row,
`thrustByHealth` -- and then needed a second fix, because a thrust's mark was built in a branch
that never looked at the chosen slot, so the first draft could be swept on and off over 512 bouts
and produce a byte-identical log.

**The result this file did not predict is the paired maul.** On random pairs the brawler takes
0.795 points and +0.574 on the bar over 22 bouts with a paired grip, and 22.7 % of those bouts end
on the 60 s cap against about 80 % everywhere else. A paired grip is offered no parry, no cut and
no combination stroke; every other style in the set spends that bout circling. What it refuses is
`sword/mid`, the mid-band blade, at −0.264 ± 0.038 -- which this file's "What remains" hoped the
shove would rescue.

**The column to watch at the gate is blows a stroke**: 6.05 mirrored, the highest of the nine.
Session 01's rule means those are different parts rather than the same part twice, and damage a
stroke is above the fencer's, so it is not the raking the rule was written against -- but it is
the number that could read as the flailing the owner complained about.

## Outcome

A style that gets inside and stays there, shoving, ramming, striking short with both hands and
hunting the weakest part: the inside direction, and the only mind that closes on purpose.

## Frozen choices

- A director over Session 04's executor, in src/golem/styles/brawler.ts, registered as the
  others. Its rules:
  - `standOffFraction` 0 and a low `holdFraction`, so the hold floors at the inner radius plus
    slack; the executor's crowding withdrawal is never chosen (`crowdedSeconds` high in the
    style's table, and the director never names `withdraw` or `retreat`);
  - `close` until the gap is at or inside the inner radius plus slack;
  - then alternate `strike` with `strikeBite` 0.8 (the arm stays drawn) and the spare hand's
    bash through `comboFraction` 1;
  - `thrust` at the head when inside and the head is the weakest reachable slot;
  - `shove` whenever the gap is at or inside the inner radius;
  - `ram` on their recover for a ram head;
  - `targetByHealth` on with `targetMargin` 0: the sever-hunter, since loot is the parts bin;
  - `void` on their commit only when *outside* their reach; inside, keep coming;
  - a paired grip: `shove` is the maul extended on both channels, no combo.
- **Raking is reported, not hidden.** The brawler is the style most exposed to what remains of
  raking after Session 01: a drawn short stroke that touches several parts is what the owner
  called flailing. It ships only if its damage a stroke is not below the fencer's baseline by
  more than the one-claim rule accounts for, and the blows-per-stroke column is in its table.

## Implement

1. The style file, its table and its registration; the override prefix `brawler.`.
2. Tests in `../../tests/golem-mind.test.mjs`: the director never names `withdraw` or `retreat`;
   inside the near radius it names `shove` or `strike`; the acting hand's reach on an inside
   strike is drawn in; the mark is the least-health slot. One real short bout on the default
   build and on the `ram-capped` and `maul` reference builds of `../../scripts/tournament.mjs`.
3. Runs, `--bouts 512 --mirror --cross --random 40 --cap 60 --seed 20260906`: `strikeBite`
   {0.66, 0.8, 0.9}, `shoveSeconds` {0.25, 0.35, 0.5}, `targetMargin` {0, 0.15},
   `comboChamberSeconds` {0.06, 0.10}; the league row, mirrored and random. Expected signature:
   inside-inner 10 to 30 %, clinch low despite the proximity because exchanges fill it, the most
   strokes a bout, the most severs, the lowest damage a stroke.
4. The entry in `../measurements.md`; a paragraph in `../design.md`; README.

## Human gate

The owner watches it on three random matchups: does it read as a grappler pushing in, not as two
bodies in each other's face. Verdict into this file's status line.

## Verification

```powershell
npm run check
node --test tests/golem-mind.test.mjs tests/minds.test.mjs tests/units.test.mjs
npm run tournament -- --bouts 64 --mirror --policies golem-fencer,golem-brawler
npm test
npm run build
git diff --check -- .
```

## What remains

The bodies that cannot finish each other -- mid-band blades and maces, the short unarmed ones --
drew every row of the matchup set; the shove and the sever-hunter are the only levers this set
has on them, and the league table reports them as their own class rather than folding them into
the mean.
