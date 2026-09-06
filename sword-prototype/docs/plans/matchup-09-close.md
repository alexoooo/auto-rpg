# Session 09 -- the durable record

**Status (2026-09-06): implemented; the human gate is open.** The final table, policy by
build class on both pools with the structural measures, and the pointer table to every
number of the set are the Session 09 entry of `../measurements.md`; the matchup screen's
default policy is the fencer, which led that table over random pairs of bodies, named with
its seed in `../../src/bout.ts`, and the picker offers all five golem minds; `../design.md`
carries a section per session from 03 on and the weapons of 01 and 02 under the golem's own
sections; no file was deleted in this set, so `../deleted-paths.md` stands as it was; the
overview's status line is updated and its gates are listed there, all open. Verdict: awaiting
the owner.

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
