# Session 05 -- hand-coded tactics v2, `golem-fencer`

**Status (2026-09-05): planned. Needs 02 and 04.**

## Outcome

A second scripted golem mind that reads the opponent's stroke, times its own against it, uses its
reach advantage or closes through its reach deficit, picks its target, feints, combines two
weapons, and rams with the whole body. Every feature is a constant with a tournament row.

## Frozen choices

- **v1 stays as the baseline.** The new mind is a new file beside `src/golem/tactics.ts`, started
  as a copy, registered as `golem-fencer` in `POLICIES` in `src/mind.ts` and in `GOLEM_POLICIES`
  in `src/units.ts`. `golem-duelist` keeps fighting in every tournament so a gain is a gain against
  something that did not move.
- **Every feature can be switched off** by its constant, and ships only with the tournament row
  that says what it is worth, per build class where the classes disagree.
- **Still no opponent capabilities.** Their phase is inferred from tip speed and the gap rate the
  mind already keeps: rising toward a peak is a chamber, the peak is a commit, falling is a
  recover. A few low-passed rates are the whole of the mind's memory of the world.

## The features

1. Reading their stroke: the phase estimate above.
2. Counter-timing: strike into their recover window; hold or void during their commit; stop-hit
   when they close on a longer reach.
3. Reach asymmetry: the longer arm holds the stand-off and stop-hits; the shorter arm closes
   during their recover and stays inside once in.
4. Target selection: the reachable part with the lowest published health fraction, else the
   shoulder column.
5. The ram exchange from Session 01, chosen by matchup: arms capped, or the opponent recovering
   inside ram reach.
6. A feint: chamber, hold, withdraw a seeded fraction of the time, strike into what it drew.
7. A two-weapon combination: the secondary armed hand strikes on the primary's follow-through.
8. The stroke shapes from Session 02, and a guard distance chosen by their weapon kind.

## Implement

1. The v2 file, the registration, the constants table with its sweep rows.
2. `tests/golem-mind.test.mjs`: phase classification, counter timing and target choice on
   synthetic views built with `publishedFixture` from `tests/fixtures/view.mjs`; one real bout
   "the fencer beats the duelist over N seeds" only if the tournament says so.
3. A tournament run per feature, and the summary in `docs/measurements.md`.

## Human gate

The owner watches the fencer against the duelist on three random matchups and against itself on
two. Does it look like it is reading the other fighter. Verdict into this file's status line.

## Verification

```powershell
npm run check
node --test tests/golem-mind.test.mjs tests/minds.test.mjs
npm run tournament -- --bouts 64 --policies golem-duelist,golem-fencer
npm test
npm run build
git diff --check -- .
```
