# Session 11 -- close-out

**Status (2026-09-06): planned. Needs 10.**

## Outcome

The durable record of the set: the final table of every mind, the matchup screen's default, the
design sections, the README, and this set's gates listed in the overview, all open.

## Frozen choices

- **The final table** is every mind -- duelist, fencer, planner, champion, neural, form,
  skirmisher, guardian, brawler, selector, tactician, learner -- on seed 20260906, mirrored and
  over random pairs, by policy and by build class, with every structural column of the set.
- **The screen's default** is the random-pairs leader whose columns are inside the band, named
  with its seed in `../../src/bout.ts`; the picker offers all twelve.
- **Nothing here is a new measurement.** If a number is missing, the session that owed it is
  named, not re-run.

## Implement

1. The final table into `../measurements.md`, with a pointer table to every number the set
   produced and the seed of each.
2. `../design.md`: the instruments that see a stroke; one claim per stroke; the third executor
   and why the second did not move; four styles and their signatures; the decision log and what
   a reward is; the selector; the tactician; the learner. Each section was begun by its session;
   this one reads them together and fixes what they contradict.
3. `../../README.md`: the policy and mind sentences.
4. `style-00-overview.md`: the status blockquote and the gates table.
5. The memory note for this repository: the set is implemented, gates open.
6. If any file was deleted in the set, `../deleted-paths.md` regenerated in a second commit.

## Human gate

The set's one gate: the owner opens the matchup screen, randomises both sides a dozen times,
watches each fight, and says whether the golems now behave in a way they can name. Verdict into
`style-00-overview.md` by the owner.

## Verification

```powershell
npm run check
npm test
npm run build
git diff --check -- .
node ../tools/check_docs.js
```

## What remains

Whether `../../src/golem/tactics-v2.ts` can be retired once the planner, champion and neural are
re-based on the third executor is recorded here as a question, not done.
