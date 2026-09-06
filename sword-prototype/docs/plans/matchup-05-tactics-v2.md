# Session 05 -- hand-coded tactics v2, `golem-fencer`

**Status (2026-09-06): implemented; the human gate is open.** `src/golem/tactics-v2.ts` is
`golem-fencer`, registered in `src/golem/golem-policies.ts`, `src/mind.ts` and `src/units.ts`;
eight tests on synthetic views in `tests/golem-mind.test.mjs`; `--override`, `--cross` and
`--mirror` in `scripts/tournament.mjs` with their tests. Three departures from what is written
below, each recorded in the Session 05 entry of `docs/measurements.md`: the file imports the
duelist's helpers rather than copying them, so the envelope rule has one home; the phase is read
from the arm's *extension* and not from tip speed, because a golem's point runs at 5-20 m/s in
every stance; and the tournament row per feature is a `--mirror` row, one build on both sides,
because over random pairs of bodies the body decides the bout before either mind has acted. What
it says: 527 of 1024 mirrored bouts to the duelist's 497, 121 to 73 on long blades, a coin on
the heavy weapons, and 271 to 241 over random pairs; target selection by health lost bouts and
ships off. The real-bout test "the fencer beats the duelist over N seeds" is **withheld**: on
the default build the fencer is 9 to 11, and the blade wins live on the drawn bodies. The owner
has not watched it.

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
