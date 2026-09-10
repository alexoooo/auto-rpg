# Session 06 -- reward shaping: pay the closing metre, charge the stall and the retreat

**Status (2026-09-10): landed. The four rows, the flags, the tests, the manifest and the ratings
are in; the bar was not cleared by any arm and has not been moved.** Five arms ran from the
shipped league's `main` at 175 minutes of wall clock, reaching 28 or 29 of the 60 iterations asked
for. On random viable pairs at `main` the best margin movement is arm b's d +0.091 against a bar of
0.2, and the best behaviour movement is arm d's 0.98 of the control's `nearRangeStallSeconds` plus
`retreatOutsideReachSeconds` against a bar of 0.5; all four non-control arms clear the third clause
and none clears the first two. The finding the run did produce is in `../measurements.md`: the
retreat outside reach is 0.2 s a bout in a mirror and 3.2 to 4.7 s on random pairs, so mirrored
self-play almost never generates the quantity the owner's eye complained about, and a charge on it
comes to 0.007 of the return. `GOLEM_REWARD` still ships all four rows at zero.

## Outcome

`RewardTable` gains the rows for the two behaviours the owner's eye picked out and the record
left unpriced, plus the clock and the closing metre the owner named, and five arms of the shipped
league run at once through Session 04's runner to say which of them moves the mind and by how
much. The style set's owed causal test -- `tick` above zero, or the closing metre paid, against
the shipped table -- is arms b and c.

## Frozen choices

- **The columns already print; the rows are new.** `nearRangeStallSeconds`,
  `retreatOutsideReachSeconds` and `radialClosingMetres` come from `EngagementTracker` in
  `../../src/engagement.ts` and ride the tournament row; strokes started and blows are counted in
  `../../scripts/tournament-worker.mjs`. A row is a coefficient on a quantity that is already
  measured, so a table can be audited against the row it was meant to move.
- **Tables are flags, applied in the main thread.** `mergeRollouts` prices the raw packs; the
  worker records quantities and never the reward, so the same rollout could be re-priced. The
  new rows therefore need new pack columns only for the four raw quantities and nothing else.
- **The identity is kept and stated.** The mirrored return telescopes to the bar margin plus the
  win term plus the charges; every new row is symmetric between the sides in a mirror and the
  penalty share reports each row separately, so the record's finding -- the only part of a
  mirrored reward that averages is the part that charges for engaging -- can be re-read per row.
  `closing` is the first row that *pays* for engaging in the symmetric part, which is what makes
  it the interesting arm.
- **Scored where it matters.** Arms are rated on random viable pairs against `golem-driver` and
  `golem-fencer`, paired, with the stall and outside seconds and the decided fraction beside the
  bar margin, and the mirrored rating beside that. The bar is on both the margin and the
  behaviour, because the record's league bought margin and made fights longer.
- **The shipped table does not move here.** `--out` still refuses a fit under any table but
  `GOLEM_REWARD`; a winning arm changes the shipped constants in Session 10 or 11 with the run
  that chose them beside it.

## Implement

1. `../../src/golem/reward.ts`: `RewardTable` gains `closing` (bar per metre of radial closing,
   positive), `stall` (bar per second of near-range stall), `outside` (bar per second outside
   reach with no viable attack), `swing` (bar per stroke started that lands no blow), all
   shipped at zero; `RewardWindow` gains `closingMetres`, `stallSeconds`, `outsideSeconds`,
   `emptyStrokes`; `stepReward` charges and pays them:

   ```ts
   const shaped = table.closing * w.closingMetres
     - table.stall * w.stallSeconds - table.outside * w.outsideSeconds
     - table.swing * w.emptyStrokes;
   ```

   `BARE_REWARD` stays all-zero. The doc comment records the arm that chose each value once
   one has, and until then says "zero; Session 06 of the learn set".
2. `../../scripts/tournament-worker.mjs`: `pilotMind`'s per-ask sample hook records the four
   quantities since the previous ask -- the tracker's deltas for the three engagement columns
   and a stroke that ended with `blows === 0` for the fourth -- into the pack beside `clinch`
   and `idle`; `mergeRollouts` in `../../scripts/train-ppo.mjs` reads them and refuses a pack
   that lacks a column by name; `episodeReturns` reports the share per row, and the iteration
   row prints `penaltyShare` as an object keyed by row.
3. Flags: `--closing --stall --outside --swing` on `../../scripts/train-ppo.mjs` and on
   `../../scripts/league.mjs` (Session 04 gave it the first four), echoed in the header and in the
   module's provenance line.
4. Tests in `../../tests/reward.test.mjs`: the telescoping test still holds with every new row at
   zero; each row sums over a hand-built window to its coefficient times the quantity; the
   symmetric part of a mirrored pair with `closing` set is positive when both close and zero
   when neither does. In `../../tests/ppo.test.mjs`: `mergeRollouts` prices a pack with the new
   columns and refuses one without.
5. The manifest, docs/sweeps/learn-06-reward.json for Session 04's runner: script `league`,
   `--from` the shipped league's main, seed 20260915, viable pool, 9 workers an arm at 3 arms
   or 7 at 4, `--entropy 0.0003`, 60 iterations or the night, whichever ends first:

   | arm | table | tests |
   | --- | --- | --- |
   | a | shipped | the control |
   | b | `tick` 0.004 | the clock alone, the style set's owed run |
   | c | `closing` 0.02 | the closing metre paid, the owner's ask |
   | d | `stall` 0.004, `outside` 0.004 | the two behaviours charged |
   | e | c + d | both |

   Two nights if five arms at six workers is too slow; a is in both nights.
6. After: `rate-snapshots` on every arm every 8 iterations, on random viable pairs and mirrored,
   300 bouts a point; the stall, outside and decided columns from the same bouts; the table into
   `../measurements.md` with d and the penalty share per row.

## Human gate

None. The mechanical bar: an arm beats arm a by d 0.2 on the paired bar margin against
`golem-driver` on random viable pairs at its final snapshot, *and* halves arm a's
`nearRangeStallSeconds` plus `retreatOutsideReachSeconds` a bout, *and* does not lose to arm a
mirrored by more than one standard error. An arm that clears the first and not the second is
the record's league again and is reported as such.

## Verification

```powershell
npm run check
node --test tests/reward.test.mjs tests/ppo.test.mjs tests/league.test.mjs tests/docs.test.mjs
node scripts/train-ppo.mjs --iterations 1 --bouts 8 --workers 8 --closing 0.02 --stall 0.004 --evaluate 0 --seed 20260915
npm test
npm run build
git diff --check -- .
```

## What remains

A reward on the *opponent's* stall (paying for making them stall) is a different kind of term and
is not here. Whether the winning table transfers to a run from scratch is Session 08's arm a.
