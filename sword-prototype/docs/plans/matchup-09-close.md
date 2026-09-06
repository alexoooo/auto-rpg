# Session 09 -- the durable record

**Status (2026-09-05): planned. Needs 08.**

## Outcome

Everything a reader needs is in `docs/design.md` and `docs/measurements.md`; the matchup screen's
policy picker offers every mind this set built; and this plan set is left in place with its gates
listed, exactly as the golem set was.

## Implement

1. The policy picker offers duelist, fencer, planner, champion and neural; the default is whichever
   leads the final tournament table, named with its seed.
2. `docs/design.md`: impulse scoring, mace, maul, whip, fist, the matchup screen, the AI
   architecture (executor, planner, champion tables, neural contender) and what each reads.
3. `docs/measurements.md`: the final tournament table, policy by build class, with the structural
   measures; replan cost; the tuning and training runs.
4. `docs/deleted-paths.md` regenerated in a second commit if any file was deleted along the way.
5. The overview's status line updated, and the owner gates listed in it, all open.

## Human gate

The set's one gate, from the overview: the owner randomises a dozen matchups and says whether it
reads as high-level fighting.

## Verification

```powershell
npm run check
npm test
npm run build
git diff --check -- .
node ../tools/check_docs.js
```
