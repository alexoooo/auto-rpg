# Style -- live roadmap

> **2026-09-06 status: Sessions 00, 01 and 02 implemented; their human gates are open, and
> nothing is accepted.**
> Thirteen files, one per landable session. Sessions 03 to 12 are unimplemented and every gate,
> Sessions 00's, 01's and 02's included, is open. Every session ends at a human gate that
> the owner records in that session's status line; an agent may not write "accepted" there.
> The golem set and the matchup set that came before this one were deleted at the owner's
> request on 2026-09-06, every one of their sessions having landed; their durable record is
> `../design.md` and `../measurements.md`, and `../deleted-paths.md` lists their files.

## Why this plan exists

The matchup set left five golem minds and a harness, and the owner watched the fights:

> overall it's pretty good; I think the biggest issue is AI quality; please proceed with more
> AI work -- consider different manually coded AI, it doesn't have to be one, you can have more
> than one to explore different directions; it would be cool if something using ML or planning
> can outperform the hard-coded AI, because I think there's a large amount of room for
> improvement; mostly the golems get into each other's face and flail around, but there are
> some good hits here and there -- it would be cool if they actually behaved in a non-trivial
> way.

And earlier, on what the mind should be allowed: "free control of both arms, to block and push
and attack whichever way it can -- limited only by the physics and the intelligence of the
policy." Two decisions taken on 2026-09-06 when this set was planned: **contact rules may
change** alongside the minds, and **overnight harness runs are allowed**.

What the code and the logs say the flail is, read before any code moved:

- **One distance.** In `../../src/golem/tactics.ts` the hold is the larger of 0.78 of my reach,
  the inner radius plus slack, and 1.00 of their reach; the strike range is the hold plus one
  slack. In a mirror both stand at exactly their opponent's reach with a 0.107 m strike band,
  so every commit is taken from one distance. `standOffFraction` was swept on damage a bout,
  which rewards frequency.
- **A strafe that means nothing.** The strafe is ±0.55 every step in every stance, its sign
  flipping on a free 1.3 to 2.6 s timer that never reads the opponent. That is the drift.
- **The mark is crossed at the start of the arc.** The stroke runs the swing from a chamber of
  0.05 to a follow-through of 0.94, so the commanded point crosses the mark 7 ms into a 150 ms
  stroke while the arm is still accelerating. Contact speeds sit at 5.6 to 9.1 m/s against a
  reference of 11: a blade blow scores about 0.7 of a 2.3 ceiling, a stroke rakes 4.3 blows on
  the 0.09 s per-part cooldown, and a bout books 150 to 250 contacts at 0.35 to 0.5 damage each.
- **An exchange is open-loop.** Chamber 0.22 s, commit 0.22 s, recover 0.30 s, cooldown 0.30 s;
  nothing reads or aborts it, and a director is asked only between exchanges, every 0.167 s.
- **Nothing blocks.** `parriedBy` in `../../src/golem/golem.ts` returns null; a plate is a module
  that takes the wound. There is no defensive act with a success or a failure anywhere.
- **The learned minds hit a noise wall, not a ceiling.** One scalar a bout at σ 0.032 for 384
  bouts; the record names the fix, per-exchange credit and self-play, and the per-bout
  behaviour record is computed every bout and discarded by the tournament worker.

## Live session order

| session | outcome | after |
| --- | --- | --- |
| [00](style-00-overview.md) | this file; the instruments that see a stroke; the set's baseline table | -- |
| [01](style-01-contact-rules.md) | one claim per part per stroke; the plate blocks, is never wounded and never wears; a blow on a held weapon booked as a block | 00 |
| [02](style-02-stroke-bench.md) | tip speed at the mark on the bench, per weapon kind; committed stroke shapes; the parry's arrival time | 01 |
| [03](style-03-energy-scoring.md) | every blow scored from the energy the struck part absorbs, through its mechanism; the Warrior's pins re-derived | 02 |
| [04](style-04-executor-and-form.md) | the third executor with fifteen options and event asks; `golem-form` | 03 |
| [05](style-05-skirmisher.md) | `golem-skirmisher`: out of reach, in on their recover, out again | 04 |
| [06](style-06-guardian.md) | `golem-guardian`: parry, riposte, shove | 04 |
| [07](style-07-brawler.md) | `golem-brawler`: inside, shoving, hunting the weakest part | 04 |
| [08](style-08-league-and-decision-log.md) | the league table of nine minds; the per-decision reward log | 05, 06, 07 |
| [09](style-09-selector-and-tactician.md) | two table-fitted minds: `golem-selector`, `golem-tactician` | 08 |
| [10](style-10-learner.md) | `golem-learner`: fitted Q-iteration on the decision log | 08 |
| [11](style-11-overnight.md) | the overnight: learner rounds, the selector refitted, sweeps at scale | 09, 10 |
| [12](style-12-close.md) | durable record, final table, the screen's default, gates listed | 11 |

Sessions 05, 06 and 07 depend only on 04 and may run in parallel. Sessions 09 and 10 depend only
on 08 and may run in parallel.

## Frozen choices for this set

1. **Carried over from the matchup set.** A golem sees of its opponent only what `BodyView`
   publishes; opponent capabilities stay withheld. The mind reads capabilities and the view,
   never module ids. The mind commands positions and reach inside the envelope through
   `writeAim` in `../../src/golem/tactics.ts` and nothing else; no scripted stroke returns to
   the body. Every constant ships with a tournament row or it does not ship. Every learned
   artifact is a versioned table with its run seed and date, refused by version on load. One
   Havok arena per JS realm; parallelism is `worker_threads`. Golem-versus-golem is the cell.
2. **v2 does not move.** `golem-fencer`, `golem-planner`, `golem-champion` and `golem-neural`
   keep fighting in every run, unchanged. The new executor is a new file beside
   `../../src/golem/tactics-v2.ts` with its own option vocabulary, because the neural layout,
   the duel-model tables and the champion rows are all keyed to v2's eight options and would
   be refused on load if those grew.
3. **A style is a director, not a fork of the executor.** All tactical reasoning is in the
   director; the executor owns an exchange once started and has no reflexes of its own. The
   option vocabulary is fifteen (owner, 2026-09-06: thrust and duck added to the thirteen); a
   style session may add an option only together with a rule that names it and a tournament
   row, and the close-out reports how many of the fifteen each style ever named.
4. **Sweeps select on points a bout with the structural columns beside them, never on damage a
   bout alone.** At 512 mirrored bouts σ is about 0.021 points a bout; a row inside two σ is
   reported as noise.
5. **The learned minds of this set are directors over the new executor**, trained on the
   per-decision log, confirmed on a held-out seed with common random numbers against the best
   style, the fencer and the champion on both pools, and shipped with the number whichever way
   it goes.
6. **Structural measures, then the owner's eye.** The band the owner approved (stand-off, blows
   per stroke, lead changes, winner's bar, time inside one's own inner radius) plus this set's
   columns (damage per stroke, contact speed at the scoring blow, catches, clinch, idle travel).
   A mind that rates higher and reads worse is reported, not made the default.
7. **Stop rule.** A session gets at most two correction sessions before its status line records
   the stop.
8. **A blow is worth the energy that arrives.** Owner, 2026-09-06, on the fist, the mace and the
   maul: not a cap, "physically or intuitively based". Session 03 scores every blow from the
   kinetic energy the struck part absorbs, through the striker's mechanism, with one anchored
   constant per mechanism; no cap, power, ramp or per-weapon scale is ever added to a score row
   again, and a weapon that is still too strong afterwards is answered in the body, in a row of
   its own. The Warrior's pinned scoring numbers may move (owner, 2026-09-06).
9. **The plate is an indestructible damage sink.** Owner, 2026-09-06: a golem takes no damage
   when its shield is hit, and the shield has unlimited life. It keeps its mass, because the
   physics is what makes it block. Session 01 books it through the block path a Warrior's shield
   already uses; the guardian of Session 06 is the style that uses it on purpose.

## Conventions for this plan set

- A session's status line is the only line an agent edits in another session's file, and only to
  record a landed dependency. Human-gate verdicts are written by the owner.
- No line anchors in these files. Name the construct.
- **A file that does not exist yet is named without a code span.** `../../tests/docs.test.mjs`
  pins the count of backticked paths under `docs/plans/` that resolve nowhere, and that pin is
  zero; a session that creates the file may put the backticks on afterwards.
- Every session runs `npm run check`, `npm test`, `npm run build` and `git diff --check` from
  inside `sword-prototype/` before landing, plus the root docs checker when it touches a Markdown
  link, and leaves no dev server running.
- A session that deletes a file regenerates `../deleted-paths.md` in a second commit.
- Durable results go to `../design.md` (what it is) and `../measurements.md` (what was measured,
  in which harness, with which seed). These files are not a second authority.
- Long headless runs are part of the work: the dev host has 32 hardware threads and runs about
  20,000 bouts an hour; overnight runs are allowed (owner's decision, 2026-09-06). Raw logs are
  gitignored under `tournaments/`; summaries and tables are committed.

## Human gates

Each session names its own gate. The set as a whole has one: the owner opens the matchup screen,
randomises both sides a dozen times, watches each fight, and says whether the golems now behave in
a way they can name. Until that is written into this file by the owner, the status line above
stays as it is.

| session | the owner is asked | verdict |
| --- | --- | --- |
| 00 | whether the fencer's baseline row reads as the flail they saw | open; the row is in the Session 00 entry of `../measurements.md` |
| 01 | whether a blow that lands reads as one blow, whether a blade stopped by a plate reads as a block, and whether bouts now run too long | open; the two re-taken baselines are in the Session 01 entry of `../measurements.md` |
| 02 | whether a stroke near the reference speed exists inside the arm's budget | open; the grid and the parry are in the Session 02 entry of `../measurements.md`, and the answer turned out to be that speed was never the constraint -- the shipped cut misses by 0.63 m |
| 03 | whether every blow's worth reads as its weight, and whether a maul against a blade is a fight | open |
| 04 | whether a cut reads as a cut and a circle reads as intent | open |
| 05 | whether the skirmisher reads as hit-and-run rather than as running | open |
| 06 | whether the plate visibly meets the blade and the riposte follows it | open |
| 07 | whether the brawler reads as a grappler pushing in | open |
| 08 | whether the league table agrees with what they see | open |
| 09 | whether a mind that picks minds looks like one mind | open |
| 10 | whether the learner behaves differently from its corpus, and better | open |
| 11 | the learned-versus-hand-coded reading at scale | open |
| 12 | the set's one gate above | open |

## Session 00's own work: the instruments that see a stroke

**Implemented 2026-09-06; the human gate below is open.** The numbers are in the Session 00 entry
of `../measurements.md`: a stroke lands 6.6 to 7.2 blows, 58 % of strokes score on a hand slot,
the `blocks` column is zero on all 4,096 sides of both baselines, and the committed column reads
as movement rather than as arrival, for a reason the entry measures rather than asserts.

Besides writing these thirteen files, Session 00 lands the columns the rest of the set selects on.

- `../../scripts/tournament-worker.mjs`, in the job runner: pass `onEvent` to `runBout`; per
  side a stroke counter, where reports on one `effectorId` closer than 0.25 s (Session 12b's
  rule) are one stroke, keeping per stroke the blows, the damage, and the scoring blow (the
  largest damage) with its speed, kind and key. The scoring blow's key is classified by its slot
  segment, the rule `slotHealth` in `../../src/golem/tactics-v2.ts` already uses: `primary` or
  `secondary` is **caught** (it landed on a hand slot), anything else is clean. In `onSample`,
  keep the trunk lean, the closing ground speed and the time of the last contact.
- New per-side row fields, added without a `TOURNAMENT_VERSION` bump as the `arm` column was:
  `strokes`, `blows` (per stroke), `strokeDamage`, `scoringSpeed`, `caughtFraction` (of my
  strokes), `catches` (their strokes my hand slots stopped), `committedFraction` (the scoring
  blow with lean at or above 0.15 or closing at or above 0.3 m/s), `clinchSeconds` (inside their
  reach plus slack with no contact by either side for 0.75 s), `idleTravelMetres` (tangential
  travel in quiet samples), and four lifted from the behaviour record's engagement block that the
  worker computes and discards today: `tangentialTravelMetres`, `radialClosingMetres`,
  `nearRangeStallSeconds`, `retreatOutsideReachSeconds`. Under a new `--behaviour` flag the whole
  enumerable behaviour record rides on the row.
- `../../scripts/tournament.mjs`: `structural` gains means that skip `undefined`, so `--read` of
  an older file still summarises; `formatSummary` gets a second column block: strokes, blows,
  damage a stroke, speed at the blow, caught fraction, catches, committed fraction, clinch
  seconds, idle metres.
- Tests in `../../tests/tournament.test.mjs`: the synthetic row fixture and the finite-column
  list gain the names; the byte-identical rerun assertion stands because every column is a
  function of the same events and samples. New: a scripted event list (three blows 0.09 s apart
  on one effector, one 0.4 s later on the other) counts two strokes, picks the scoring blow,
  files a plate key as caught and a trunk key as clean.
- Run: the baseline of all five minds, `--bouts 1024 --mirror --random 40 --cap 60 --seed
  20260906` and the same over random pairs; the table into `../measurements.md` as the set's
  baseline, taken before Session 01 changes a rule.
- Gate: the owner reads the fencer's row against what they saw: about one stroke a second at
  about three damage, contact speed about 7, committed near zero, idle travel tens of metres,
  clinch a few seconds.

```powershell
npm run check
node --test tests/tournament.test.mjs tests/docs.test.mjs
npm run tournament -- --bouts 64 --mirror --policies golem-fencer
npm test
npm run build
git diff --check -- .
```
