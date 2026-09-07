# Session 07 -- `golem-brawler`

**Status (2026-09-06): planned. Needs 04.**

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
