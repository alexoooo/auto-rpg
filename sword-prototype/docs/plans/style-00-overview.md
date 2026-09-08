# Style -- live roadmap

> **2026-09-08 status: Sessions 00 to 12 implemented; their human gates are open, and
> nothing is accepted.**
> Sixteen files, one per landable session. Sessions 13 to 15 are unimplemented and every gate,
> Sessions 00's to 12's included, is open. Every session ends at a human gate that
> the owner records in that session's status line; an agent may not write "accepted" there.
> **Sessions 11 to 15 were rewritten on 2026-09-07** against the owner's four-step programme --
> decisive bouts, a continuous command surface, PPO in self-play, then a checkpoint league -- and
> the set's remaining human gate moved with it to Session 14, at their instruction: the current
> fighting is too poor for variations of it to be judged, so nothing is put in front of them
> until there is at least one non-trivial mind to look at.
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
| [11](style-11-decisive.md) | make a bout decidable: the lever measured by effect size per bout, not by taste | 10 |
| [12](style-12-command-surface.md) | the continuous command surface at 12 Hz, and an executor that can be interrupted | 11 |
| [13](style-13-dense-reward-and-ppo.md) | the dense reward and PPO in self-play over that surface | 12 |
| [14](style-14-league.md) | league self-play: a main agent, a pool of past checkpoints, two exploiters | 13 |
| [15](style-15-close.md) | durable record, final table, the screen's default, gates listed | 14 |

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

Sessions 11 to 15 name no gates of their own. The set's one gate is Session 14's, and it is the
only thing put in front of the owner between here and there; every session before it answers to a
mechanical bar it states in advance. That is the owner's instruction of 2026-09-07 and not a
convenience: judging variations of a fight nobody can read is not a question a person can answer.

| session | the owner is asked | verdict |
| --- | --- | --- |
| 00 | whether the fencer's baseline row reads as the flail they saw | open; the row is in the Session 00 entry of `../measurements.md` |
| 01 | whether a blow that lands reads as one blow, whether a blade stopped by a plate reads as a block, and whether bouts now run too long | open; the two re-taken baselines are in the Session 01 entry of `../measurements.md` |
| 02 | whether a stroke near the reference speed exists inside the arm's budget | open; the grid and the parry are in the Session 02 entry of `../measurements.md`, and the answer turned out to be that speed was never the constraint -- the shipped cut misses by 0.63 m |
| 03 | whether every blow's worth reads as its weight, and whether a maul against a blade is a fight | open; the anchoring, the prediction table, the class table and what the model cost the bout are in the Session 03 entry of `../measurements.md`, and the entry puts the 60 s cap in front of the gate for the second time |
| 04 | whether a cut reads as a cut and a circle reads as intent | open; the option census, the seventeen sweep rows and the two checks that came back negative are in the Session 04 entry of `../measurements.md`, and the entry puts the 60 s cap in front of the gate for the third time |
| 05 | whether the skirmisher reads as hit-and-run rather than as running | open; the nine sweep rows, the two league runs and the first constant this set has moved off a sweep (`patience` 2.0) are in the Session 05 entry of `../measurements.md`. The style is level with the fencer head to head and ahead of it on random pairs at 2.7 standard errors once both are standardised over the reach bands, and it converts a reach advantage better than any mind that ships. Four of the five signatures the plan predicted do not hold, one branch spends 8 s a bout inside their point doing nothing when out-reached, and the 60 s cap is in front of the gate for the fourth time |
| 06 | whether the plate visibly meets the blade and the riposte follows it | open; a wall shipped and not an intercept, because there is no crossing to solve before a stroke starts. The ten sweep rows, the two confirmation rows on a held-out seed, the two switch rows re-asked of the shipped table and the two league runs are in the Session 06 entry of `../measurements.md`. `wallOnChamber` puts 132 of the style's 235 parries out during a chamber against 14 without it and is worth nothing on the bar, twice measured; `ripostesQuick` ships off against this set's own frozen choice at 3.6 standard errors over two seeds, the second constant a sweep has moved; all four predicted signatures fail, including the one that is a rate; and the 60 s cap is in front of the gate for the fifth time |
| 07 | whether the brawler reads as a grappler pushing in | open; the ten sweep rows, the three confirmation rows on a held-out seed and the two league runs are in the Session 07 entry of `../measurements.md`. The style reads -- 31.6 % of the mirrored league inside its own inner radius against 19.3 % for the next mind, the lowest clinch of the nine at 0.77 s, and five of fifteen options ever named -- and is third of nine mirrored and sixth standardised on random pairs. Two of the plan's five signatures hold. **Not one swept constant moved the bar**, nine rows paired, and `targetByHealth` changed sign on the held-out seed; `strikeBite` is inert because the anchor axis saturates inside the strike band; `thrustByHealth` needed a second fix because a thrust's mark never read its slot, and until then could be swept on and off over 512 bouts for a byte-identical log. The paired maul is the result nobody predicted: +0.574 on the bar and 22.7 % capped against 80 % everywhere else. Blows a stroke is the highest of the nine at 6.05, and the 60 s cap is in front of the gate for the sixth time |
| 08 | whether the league table agrees with what they see | open; the two leagues, the two-part corpus of 1,149,249 labelled decisions and the option-by-option reward table are in the Session 08 entry of `../measurements.md`. The league's finding is about bodies rather than minds: three of eleven build classes can finish a bout -- a long maul decides 94.2 %, a long mace 58.8 %, a long blade 7.1 % -- and eight decide none, so 78 % of the mirrored league ends on the cap and the 60 s cap is in front of the gate for the seventh time. Only `golem-brawler` (+0.0270 +- 0.0052) and `golem-duelist` (-0.0263 +- 0.0057) are away from zero on the bar; the seven between span 0.024. **A style is worth six times as much on the body that can kill**: on a long maul the nine run 0.622 to 0.411 and the brawler's bar is +0.1553 +- 0.0209. A long blade still throws 113 strokes a bout at 0.51 damage each. The log telescopes to 1e-9 once the reward columns are `Float64`; a recorded side takes 253 decisions a bout, not the 80 the plan estimated, at sigma 0.0105 bar a decision, not 0.05 to 0.1; and on matched bodies those rewards are very nearly independent |
| 09 | whether a mind that picks minds looks like one mind | open; the parametrised model, the 742,012-window corpus, the hundred-cell selector table and the two confirmations on a held-out seed are in the Session 09 entry of `../measurements.md`. The selector is first of five on random pairs and beats the best style by +0.0284 +- 0.0068 paired, which is four standard errors of a lead and 0.0016 under the 0.03 the gate asks for; on mirrored it is third and 0.0394 +- 0.0094 behind the brawler, because a mirrored bout is always one of the ten diagonal cells and eight of those fall back to the marginal winner. The tactician is second on random pairs, fourth mirrored, gets the most damage out of a stroke of anything in the run and walks eleven idle metres a bout doing it, and replans in 0.19 ms against a 5 ms budget. **The my-phase segment of both models' state has been a constant since the duel model was first fitted** -- 742,012 windows here and 291,669 there, `free` in every one -- because a window can only open at a settled sample; two thirds of the search's states can never hold a cell. Every contender's median bout is still the 60 s cap, in front of the gate for the eighth time |
| 10 | whether the learner behaves differently from its corpus, and better | open, and not asked: the machinery is in and green and the artifact is zeros. The fit was stopped fifteen minutes into three hours because the objective it would have been fitted against is flat -- Session 08's league decides 903 of 4,096 bouts and rates nine minds within noise of one half. The value gradient, the paired-difference confirmation and a semi-Markov chain test that separates "the fit is wrong" from "the arena has nothing to learn" are what the session leaves behind. See the Session 10 entry of `../design.md` |
| 11 | nothing; the bar is the effect size per bout and the session states it in advance | open, and not asked: `GOLEM_ASSEMBLY.healthScale` 0.25 -> 0.15 and `GOLEM_ASSEMBLY.vitalityTotal` 3.6 -> 5.4, both with their sweep tables in `../../src/golem/config.ts`. On the widest real gap between two minds -- `golem-brawler` against `golem-duelist` -- d on the paired bar margin goes 0.163 to 0.235, decided 25 % to 36 %, the winner's own bar 0.567 to 0.448, and the best hand-coded mind stops losing its head-to-head against the worst, 0.491 to 0.529. The best d in the sweep was refused because dismemberment disappears above about 7: at 10.8 one per cent of decided bouts end with a part off, against 75 % today. Two hypotheses were wrong and are written down -- moving the bar off the legs *lowers* the effect size, and a style against its own noise is the wrong gap to select on. The league was re-run at both settings over all twelve minds through `--override body.<row>`: mirrored, 1,544 of 4,096 bouts decide against 913 and the points spread goes 0.093 to 0.176; on random pairs, 1,806 against 970 and 0.060 to 0.098. The ordering holds -- Spearman's rho 0.67 and 0.80, same mind first and last on both pools -- and the only mind moving by more than two standard errors is `golem-learner`, whose table is still zeros. See the Session 11 entry of `../measurements.md` |
| 12 | nothing; the bar is that a hand-coded mind transcribed onto the continuous surface is not worse than the one it was transcribed from | open, and not asked: the bar is answered. `golem-driver` is `golem-form` written as nine numbers and three gates, and the paired margin over it is **-0.0069 +- 0.0811** on random pairs (d -0.013, points 0.504) and **-0.0218 +- 0.0262** mirrored (d -0.125), both containing zero and both smaller in size than the d 0.089 that the fencer and form separate by -- a gap that changes sign between the two pools. A swing of 1.0 reproduces v3's committed cut for 142 frames on seven channels, and getting there found four defects invisible in a bout: an inexact arc mix, the arc half chosen from the clock rather than the stance, a mark read one step before the ask that wrote it, and two of v3's range gates missing from the mind. All twelve refusal counters are zero over 1,418 s of fighting. The driver is asked 14.52 times a second against form's 5.20 and takes back **41.7 % of its strokes against form's 23.5 %**, because v3 can only abandon a chamber and v4 can abandon a commit; over both pools that is free, and on a long one-handed mace -- the one body with a spare hand and a stroke worth 1.21 damage -- it costs -0.174 +- 0.134, d -0.600. Four of the nine numbers are ever moved. See the Session 12 entry of `../measurements.md` |
| 13 | nothing; the bar is that the policy beats a uniform command by Session 11's effect size and its reward curve rises | open, and not asked |
| 14 | the set's one gate above: a dozen random matchups, and whether the golems now behave in a way they can name | open |
| 15 | nothing; the record only | open, and not asked |

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
