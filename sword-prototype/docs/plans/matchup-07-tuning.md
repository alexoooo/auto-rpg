# Session 07 -- parameter tuning, `golem-champion`

**Status (2026-09-05): planned. Needs 06.**

## Outcome

The fencer's and the planner's numbers are tuned by evolutionary search, per build class and
once generally, against a frozen league on the tournament harness, and the champions are checked
in as small tables a policy reads for its own build class.

## Frozen choices

- **(1+λ) evolution strategy over the numeric vector**, fitness the Elo against a frozen league:
  the duelist, the default fencer, the planner, and every previous champion, over the reference
  pool and random builds. A champion league rather than pure self-play, so the search cannot
  cycle.
- **Per build class, with a general vector as fallback.** A champion table is keyed by the class
  from Session 04, carries the run seed and date, and is refused by version. `golem-champion` is
  the fencer's executor with the planner, reading the table for its own class.
- **Long runs are the session's own work** (owner's decision, 2026-09-05): overnight-scale on
  the 32 threads, raw logs gitignored, tables and a `docs/measurements.md` entry committed.
  Roughly 20 bouts a second across the host, about 70,000 an hour -- **measured in Session 04 at
  5.5 bouts a second on 16 workers, about 20,000 an hour**; the budget below is a quarter of
  what this line first said.
- **The owner's judgement gate still applies.** A champion that rates higher and reads worse on
  the structural measures is reported, not shipped.

## Implement

1. The tuning script, reusing the tournament harness and a champion-table writer. Session 05
   left the two hooks it needs: `runJobs` takes `overrides`, a table of fencer constants the
   worker assigns over `GOLEM_TACTICS_V2` before its first bout, and `--cross --mirror` rates
   two minds on one body, which is the only pool a fitness can be read from (random pairs of
   bodies rated the fencer with every feature off within noise of every feature on).
2. The champion table module and the `golem-champion` registration.
3. Tests: one seeded generation on two workers produces a table; the policy loads it and runs a
   real headless bout; a version mismatch is refused by name.
4. The long run, and its table in `docs/measurements.md` beside the structural measures.

## Human gate

The owner watches the champion against the planner on random matchups. Verdict into this file's
status line, with the structural measures beside it.

## Verification

```powershell
npm run check
node --test tests/golem-mind.test.mjs
npm run tournament -- --bouts 64 --policies golem-planner,golem-champion
npm test
npm run build
git diff --check -- .
```
