# Session 10 -- league v2: train and rate on random viable pairs

**Status (2026-09-09): planned. Needs 04, 06.**

## Outcome

A league whose main trains partly on random viable pairs rather than only in a mirror, is rated
on both pools every snapshot, and picks its snapshots on the random-pairs rating; with
`golem-fencer` beside `golem-driver` as an anchor, and the 2x2 cell the style set left unfitted
as one of its arms. The mind that clears this session's bar ships and takes the screen's
default from the fencer; the one that does not is reported with its curve.

## Frozen choices

- **Random viable pairs are the training distribution, in part.** The record's held-out split
  says the shipped mind is a mirrored-fight specialist and the class table says the body is
  worth three times the mind on the pool the game draws. A share of the main's bouts are
  `mirror: false` pairings through Session 01's `viablePair`; the mirror keeps the rest, because
  the mirror is where the identity that made self-play work still holds.
- **Rated on both, selected on one.** Every snapshot is rated mirrored and on random viable pairs
  from the same seed; the pool admits and the ship step selects on the random-pairs rating.
  The two are printed side by side so a specialist is visible the day it appears.
- **Two anchors, no new bot.** `golem-driver` and `golem-fencer` are the hand-coded minds that
  top the random-pairs table; each at share 1 beside the pool. The owner's condition on new
  bots stands and Session 07 is where it would be met.
- **The owed 2x2 is fitted.** The record's claim about what the anchor bought rests on three
  cells of four; arm d below is the fourth -- mirrored only, anchored, with the entropy the
  league ran at -- so the claim can finally be made or withdrawn.
- **The bar is the fencer on random viable pairs.** d 0.2 on the paired bar margin at 600 bouts
  is the gap the record could not find between any two minds on that pool; a mind that clears it
  is the first learned mind that beats the best hand-coded one where the game is played.

## Implement

1. `../../scripts/train-ppo.mjs`: `collectRollouts` takes `mirrorShare` (1 today); the rest of the
   bouts are scheduled with `mirror: false` over pairs `viablePair` accepts, both corners, the
   opponent the same policy or the league member the share table names. `ratePolicy` takes
   `pools: ["mirror", "random"]` and returns `differences` per pool; the rating row carries both.
2. `../../scripts/league.mjs`: `--share-random 1` beside `--share-self`, `--share-pool`,
   `--share-exploiter` and `--share-anchor`; `--anchor` takes a list, `golem-driver,golem-fencer`;
   `--select random|mirror` for the pool's admission and `--ship`; the snapshot row carries
   both ratings; `shippedIteration` reads the selected one.
3. `../../scripts/rate-snapshots.mjs` and `../../scripts/probe-snapshots.mjs`: `--pools` for both,
   one row a pool a snapshot, `pool.mirror` in the row, which Session 02's page already keys on.
4. Tests in `../../tests/league.test.mjs`: the share table with a random share sums as the others
   do; a random-share pairing is never a mirror and is always viable; `--select` picks the
   snapshot the named pool ranks first on a fixture where the two pools disagree; two anchors
   appear in `byOpponent`. In `../../tests/ppo.test.mjs`: `ratePolicy` on two pools returns two
   difference tables from disjoint bout sets.
5. The manifest, docs/sweeps/learn-10-league.json: four arms, seed 20260915, `--from` the shipped
   league's main, viable pool, 9 workers an arm on a 32-thread host minus Session 05's shards,
   Session 06's winning table and Session 09's winning head if any, 100 iterations or the night:

   | arm | mirror share | anchors | tests |
   | --- | --- | --- | --- |
   | a | 1 | driver | the shipped league on the viable pool, the control |
   | b | 0.5 | driver | random pairs in training |
   | c | 0.5 | driver, fencer | random pairs and the second anchor |
   | d | 1 | driver, entropy 0.003 | the style set's unfitted 2x2 cell |

6. Ship: the arm that clears the bar is resumed for one iteration with `--evaluate 1 --final-bouts
   600 --out src/golem/policy-weights.ts`, as the record shipped the current one; the screen's
   default in `../../src/units.ts` moves to `golem-policy` in the same commit, with the table
   that says why; `../../src/golem/reward.ts`'s shipped values move to the winning table with the
   arm named beside each.

## Human gate

None. The mechanical bar: the paired bar margin over `golem-fencer` on random viable pairs at
600 bouts, seed 20260906, is at least d 0.2, and the same mind does not lose to `golem-driver`
mirrored by more than one standard error. Anything short of that ships nothing and the screen's
default stays.

## Verification

```powershell
npm run check
node --test tests/league.test.mjs tests/ppo.test.mjs tests/docs.test.mjs
node scripts/league.mjs --iterations 1 --bouts 16 --workers 8 --share-random 1 --anchor golem-driver,golem-fencer --select random --evaluate 0 --seed 20260915 --dir tournaments/league-smoke
npm test
npm run build
git diff --check -- .
```

## What remains

Whether the mind that wins on random viable pairs is any good on the pairs the set refused to
train on is Session 12's whole-pool table. A mind for each class -- a maul mind, a blade mind --
selected by the body, is the selector idea over learned minds and is a set of its own.
