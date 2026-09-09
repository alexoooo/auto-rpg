# Session 12 -- close

**Status (2026-09-09): planned. Needs 11.**

## Outcome

The durable record of the set, the final tables on both pools and on the whole pool, the
screen's default settled, the gates listed with their verdicts, and the set deleted in the commit
that finishes the topic, as the house rule says.

## Frozen choices

- **Three tables, not one.** Every mind that ships plus every mind the set fitted, on the
  mirrored viable pool, on random viable pairs, and on the whole 52-build pool at both pairings
  through `--terminals all` -- the last so the record can say what training on viable pairs
  cost on the pairs it refused, which is the question Session 01's frozen choice leaves open.
- **The record says what did not work in the same voice as what did.** Every arm of Sessions 06
  to 10 goes into `../measurements.md` with its seed, its manifest, its d and its penalty share,
  including the ones that missed the bar; the predictions Session 07 wrote in advance are
  counted against the table.
- **Nothing is promoted on a gap smaller than its interval.** The screen's default is whatever
  Session 10 or 11 shipped under the bar, or the fencer.

## Implement

1. The tournaments: fourteen-plus minds, every pair, 4,096 bouts a pool, `--random 40`, seed
   20260906, cap 60 s, three pools; `structural` columns beside the points; into
   `../measurements.md` as the set's final entry with a pointer table of every session's numbers
   and seeds, as the style set's close-out has.
2. `../design.md`: a section per thing that now exists -- the viability predicate and where every
   pool draws through it; the curve page and its readers; `golem-snapshot` and the readout; the
   sweep runner and its manifest; the sharded fit and its equality test; the reward rows and
   their shipped values; any surface or head change that shipped, with its version; the league's
   random-pairs share and its two anchors -- each with what it is and not what it measured.
3. The owed list, named rather than re-run: what each session's "What remains" left, gathered
   and deduplicated, at the end of the measurements entry.
4. `git rm docs/plans/learn-*.md` in the commit that lands the record; `../deleted-paths.md`
   regenerated in a second commit, as the convention says.
5. The root `AGENTS.md` and `../../AGENTS.md`: the traps this set found, if any, in the voice of
   the ones already there; the new pages and scripts in the command lists.

## Human gate

None; the record only. The set's eye gates were Sessions 01, 02, 03, 07 and 11 and their verdicts
are in those files' status lines until the files are deleted, and in the overview's gate table,
which the close-out copies into `../measurements.md` before the deletion.

## Verification

```powershell
npm run check
node --test tests/docs.test.mjs
npm run tournament -- --bouts 4096 --mirror --random 40 --seed 20260906 --pairs viable
npm run tournament -- --bouts 4096 --random 40 --seed 20260906 --pairs viable
npm run tournament -- --bouts 4096 --random 40 --seed 20260906 --terminals all
npm test
npm run build
git diff --check -- .
node ../tools/check_docs.js
```

## What remains

Whatever the owed list says. The next set, if there is one, starts from that list and from the
owner's eye on Session 11's gate, not from this file.
