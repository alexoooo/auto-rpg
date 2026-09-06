# Session 04 -- the tournament harness

**Status (2026-09-06): implemented; the human gate is open.** Everything under *Implement*
landed: `scripts/bout-runner.mjs` holds `runBout`, the arena builder, `seedFor` and the side
record, moved without a line changing, and the measure's golem section printed the same tables
before and after; `scripts/tournament.mjs` and `scripts/tournament-worker.mjs`, `npm run
tournament`, `tournaments/` gitignored; `tests/tournament.test.mjs` runs two workers over four
bouts twice under one seed and gets the same rows; the baseline is in `docs/measurements.md`.
One departure from the frozen choices, recorded here rather than quietly: each worker still
holds one arena and runs its bouts one after another, but every bout gets a **fresh Havok
module** through `freshHavok`, because a module keeps allocator and solver history across a
disposed world (Session 11 of the sword work measured it flipping a winner) and a row that
depended on which worker ran it would not reproduce under its seed. The reach band of a build
class is the armed hand's published reach, not the body's, because a capped primary publishes
the cap's length on the body while the secondary does the fighting. The owner's verdict on the
reference pool goes here.

## Outcome

`npm run tournament` runs seeded golem-versus-golem bouts across all hardware threads, over random
and reference builds, and prints a rating per policy and per policy-by-build-class, with the
structural metrics beside each. Every later session is measured on it.

## Frozen choices

- **One Havok realm per worker, sequential inside.** `worker_threads`, one worker per hardware
  thread by default, each holding one arena and running its jobs one after another. The bout
  runner and arena builder leave `scripts/measure.mjs` for a module both scripts import, and the
  measure's own output is checked unchanged by rerunning its golem section.
- **A job is plain data.** Left setup, right setup, left policy, right policy, seed; run
  side-swapped. Results are appended as JSON lines under a gitignored `tournaments/` directory;
  what is committed is the summary in `docs/measurements.md`.
- **Builds are sampled, and a reference pool is fixed.** The seeded generator from Session 03
  over the legal assemblies, plus about a dozen named builds (the default, a mace, a maul, a whip,
  a fist pair, a ram head with capped arms, a wheel, a multileg, and so on) so a rating has a
  stable floor to stand on.
- **Ratings are Elo, per policy and per policy-by-build-class**, where a build class is the
  primary terminal crossed with a reach band. Pool and bracket structure, never best-of-N.
- **Structural metrics travel with every result**: damage, contacts, severs, lead changes,
  winner's remaining health, time inside one's own inner radius, bout length. They are the
  measures that earned the owner's first yes and the ones a rating is checked against.

## Implement

1. The bout runner module, and `scripts/measure.mjs` importing it.
2. The tournament script and its worker, the `tournament` entry in `package.json`, the
   gitignore line.
3. A Node test that runs two workers over two bouts each, produces rating rows, and reproduces the
   same JSON lines under the same seed.
4. A first full run of `golem-duelist` against itself over random builds, recorded in
   `docs/measurements.md` as the baseline every later policy is read against.

## Human gate

None beyond the owner reading the baseline table and saying whether the reference pool is the
right dozen.

## Verification

```powershell
npm run check
npm run measure -- --only golem --bouts 8
npm run tournament -- --bouts 16 --workers 4
npm test
npm run build
git diff --check -- .
```
