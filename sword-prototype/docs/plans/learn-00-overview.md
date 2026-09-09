# Learn -- live roadmap

> **2026-09-09 status: thirteen files written, nothing implemented, every gate open.**
> One file per landable session. The set was written the day the style set closed, on the
> owner's verdict of its shipped mind and their brief for what comes next. Sessions 01 to 03 are
> the visibility the owner asked for first; 04 and 05 are the compute; 06 to 11 are the learning
> ideas, each written as paired arms with a bar stated before the data; 12 is the close. The style
> set's durable record is `../design.md` and `../measurements.md`, and `../deleted-paths.md`
> lists its sixteen files.

## Why this plan exists

The style set shipped `golem-policy`, a 71 -> 256 -> 256 -> 12 head fitted by PPO in a league of
its own past selves, and the owner watched it: "kinda-but-not-really working". It shows basic
behaviour, and mostly it stays just out of reach or hugs rather than fighting. Their brief, taken
2026-09-09, in the order they gave it:

> only look at viable matchups, including the Random setup in the UI -- no time on layouts that
> can't kill; first, progress visibility: a learning graph against benchmark opponents, mirrored
> body or random viable, and a way to watch the AI policy in the UI, or at least snapshots of it;
> then a variety of new AI ideas focused on learning methods -- reward shaping including tick above
> zero and paying for the closing metre, custom bots only if specifically helpful, whether the
> low-level action options are actually good for what they are supposed to do, more and different
> training, curricula on start distance and opponent type, different network or algorithm; and
> compute -- several experiments at once, the fit sharded across worker threads, more bouts an
> iteration.

What the code and the record say today, read before any code moved:

- **The reward pays nothing for the two habits the owner named.** `../../src/engagement.ts` has
  counted `nearRangeStallSeconds` and `retreatOutsideReachSeconds` since before the style set,
  `../../scripts/tournament.mjs` prints both, and `RewardTable` in `../../src/golem/reward.ts`
  holds `win`, `clinch`, `idle` and `tick`, with `tick` at zero. The shipped fit holds 6.4 s of
  stall and 3.2 s outside reach a bout against the fencer's 1.7 and 1.1, and finishes 35 % of its
  bouts where the fencer finishes 52 %.
- **Four of seven weapon classes cannot decide a mirrored bout.** Mirrored, the decided fraction
  is maul 97 %, mace 78 %, blade 41 %, plate 2 %, fist 2 %, whip 0 %, unarmed 0 %; on random
  pairs the same classes run 88 / 62 / 40 / 21 / 24 / 33 / 19 %. Thirteen of the fifty-two
  reference builds decide nothing at any vitality total. `poolFor` in
  `../../scripts/train-ppo.mjs` can cut the training pool by armed terminal, but the rating, the
  probes, the league and the screen's Random button all draw from the whole pool, and no
  predicate for "this pair can end" exists in `../../src/`.
- **The shipped mind is a mirrored-fight specialist.** Fifth of fourteen on the mirrored
  held-out pool at +0.0379 +- 0.0215 of bar, thirteenth on random pairs at -0.0218 +- 0.0418;
  `golem-driver` is third on random pairs and `golem-fencer` second. The body is worth about
  three times the mind on random pairs.
- **The fit is four fifths of an iteration and runs on one thread.** A 30-worker
  `../../scripts/train-ppo.mjs` iteration is about 109 s: 23 s of collection and 86 s of fit,
  about 2,500 sample-passes a second in JavaScript. Four 7-worker runs at once cost 155 s an
  iteration each, 2.6 times the throughput. A league arm at 9 workers is 315-365 s an iteration
  without exploiters and 620-698 s with. `backwardFrom` in `../../src/golem/neural-net.ts` adds
  a sample's gradient into the caller's array, which is the seam a sharded fit needs.
- **The curve exists only as text.** `../../scripts/train-ppo.mjs` and `../../scripts/league.mjs`
  write JSONL rows per iteration and a checkpoint every iteration; `../../scripts/rate-snapshots.mjs`
  and `../../scripts/probe-snapshots.mjs` write curve rows with `--out`. Nothing draws them.
  Nothing in `../../src/` loads a checkpoint at runtime: `golemPolicyMind` in
  `../../src/golem/golem-policies.ts` hard-wires the shipped table, and the only seam is
  `golemPolicy(seed, table)` in `../../src/golem/policy.ts` behind `checkPolicyWeights`.
- **The zero of the action space is out of the fight.** `standOff` is a multiple of their reach in
  [0, 2], a stroke opens inside 0.92 of a reach, and a saturated `advance` buys 0.56 m through
  `closeGain` 1.8. The entropy bonus's gradient on `logSigma` is exactly one an axis whatever the
  state, so at 0.003 the spread drifts up (t +33) and at 0.0003 down (t -22).

## Live session order

| session | outcome | after |
| --- | --- | --- |
| [00](learn-00-overview.md) | this file | -- |
| [01](learn-01-viable-matchups.md) | a viability predicate in `src/`; the trainer, the rating, the probes, the league and the screen's Random button all draw through it | 00 |
| [02](learn-02-curve-page.md) | a third page that draws the learning curve of any run, several runs overlaid, every series labelled with its pool | 01 |
| [03](learn-03-watch-a-snapshot.md) | `golem-snapshot`: any checkpoint or league snapshot plays in the arena; a readout of what it is asking for | 01 |
| [04](learn-04-sweep-runner.md) | one script that runs N arms at once with a shared seed, restarts the dead, and rates them all on one pool | 01 |
| [05](learn-05-sharded-fit.md) | the PPO fit sharded over K worker threads, identical to the single thread to 1e-9 | 04 |
| [06](learn-06-reward-shaping.md) | pay the closing metre, charge the stall and the retreat; five arms | 01, 04 |
| [07](learn-07-action-surface.md) | is each command axis buying what it claims; the probe, and the surface changes it earns | 01 |
| [08](learn-08-curriculum.md) | start distance, opponent schedule, class schedule; four arms | 01, 04 |
| [09](learn-09-network-and-algorithm.md) | history in the observation, discrete axes, state-dependent spread, entropy control; paired arms | 04, 07 |
| [10](learn-10-league-v2.md) | train and rate on random viable pairs; the fencer as an anchor; the 2x2 the style set owes | 04, 06 |
| [11](learn-11-long-run.md) | one long run of the winning configuration at the throughput 04 and 05 bought | 05, 10 |
| [12](learn-12-close.md) | final tables on both pools, the durable record, the set deleted | 11 |

Sessions 02 and 03 depend only on 01 and may run in parallel. Sessions 04 and 05 depend on
nothing in 02 or 03 and may run beside them. Sessions 06, 07 and 08 depend only on 01 and 04 and
may run in parallel; each is a night of arms through 04's runner.

## Frozen choices for this set

1. **Viable pairs only** (owner, 2026-09-09). A bout on a pair that cannot end is amplified
   critic noise in a rollout and half a point by construction in a rating. Session 01 defines
   the predicate once, in `../../src/`, and every pool -- training, rating, probe, league, the
   screen's Random -- draws through it. The whole pool stays reachable behind an explicit flag
   for the close-out's tables and nothing else.
2. **The criterion is Cohen's d on the paired bar margin** against a designed mind, on the same
   pool and seed, never a mind against its own noise. Slopes are read over at least ten
   iterations and quoted with their t. Two of roughly twenty-four slopes are past two sigma when
   nothing is happening; the record says so.
3. **Every experiment is a pair of arms.** Same seed, same starting checkpoint, same pool, one
   thing different, run at once through Session 04's runner and rated on one pool afterwards.
   An arm's rating is only comparable to another rating on the same pool, and the curve page
   labels every series with its pool for that reason.
4. **The random-pairs pool is the one that matters** (the record's finding, not this set's
   choice): it is the pool the screen draws and the one the shipped mind comes thirteenth on.
   Learning sessions are scored on random viable pairs against `golem-driver` and `golem-fencer`;
   the mirrored rating is kept beside it so the two can be told apart.
5. **v2 and v3 do not move, and neither do the hand-coded minds.** They are the baseline the
   learned minds are measured against, and a baseline that moves with the thing it measures is
   not one. No new hand-coded mind is written unless Session 07's probe finds a hole only a bot
   can fill, which is the owner's condition.
6. **The artifact contract holds.** `POLICY_VERSION`, `PILOT_FEATURES_VERSION` and the reward
   table's shipped values move only in the session whose file says so, with the bump, and the
   shipped table is refused by version on load as it is today. A session that changes the
   surface keeps the previous version loadable until the close-out says otherwise.
7. **The screen's default stays `golem-fencer`** until a learned mind beats it on random viable
   pairs by d 0.2 at 600 bouts, which is Session 10's bar.
8. **Overnight runs checkpoint every iteration and expect to die.** Two V8 fatals in the same
   frame are on the record; Session 04's runner restarts a dead arm from its last checkpoint,
   and Session 04 persists the Adam moments so a resumed arm is the same run.
9. **Sample cost is the binding constraint, then wall clock.** Session 04 pays off the first
   night (2.6x for four answers); Session 05 pays off every night after (a 3-4x fit). Neither is
   allowed to change a number: 05's test is equality with the single thread.

## Conventions for this plan set

- A session's status line is the only line an agent edits in another session's file, and only to
  record a landed dependency. Human-gate verdicts are written by the owner.
- No line anchors in these files. Name the construct.
- **A file that does not exist yet is named without a code span.** `../../tests/docs.test.mjs`
  pins the count of backticked paths under `docs/plans/` that resolve nowhere, and that pin is
  zero; a session that creates the file may put the backticks on afterwards. Files under
  `tournaments/` are named bare for the same reason: the directory is gitignored.
- Every session runs `npm run check`, `npm test`, `npm run build` and `git diff --check` from
  inside `sword-prototype/` before landing, plus the root docs checker when it touches a Markdown
  link, and leaves no dev server running.
- A session that deletes a file regenerates `../deleted-paths.md` in a second commit.
- Durable results go to `../design.md` (what it is) and `../measurements.md` (what was measured,
  in which harness, with which seed). These files are not a second authority.
- Long headless runs are part of the work: the dev host has 32 hardware threads and runs about
  20,000 bouts an hour; overnight runs are allowed (owner's decision, 2026-09-06). Raw logs are
  gitignored under `tournaments/`; summaries and tables are committed.
- ASCII in code and in these files: `--`, `+-`, `->`. Line endings LF, as `../design.md` and
  `../measurements.md` are.

## Human gates

The set has three gates for the owner's eye and they are all in the first three sessions,
because those are the sessions that give the eye something to look at: the viable-pair Random
button, the curve page, and a snapshot playing with its command readout. Sessions 04 to 11 answer
to mechanical bars stated in their own files before any data exists; a session that misses its
bar reports the miss with the curve and says so. Session 12 has no gate.

| session | the owner is asked | verdict |
| --- | --- | --- |
| 01 | whether a dozen presses of Random now give a dozen fights that can end | open |
| 02 | whether the page shows the curve that shipped the current mind, with the three arms overlaid, and reads at a glance | open |
| 03 | whether watching iterations 8, 40 and 93 of the shipped league on one matchup lets them say what changed | open |
| 04 | nothing; the bar is throughput | open, and not asked |
| 05 | nothing; the bar is equality and speed | open, and not asked |
| 06 | nothing; the bar is d 0.2 and half the stall | open, and not asked |
| 07 | which of the probe's findings go into Session 09's arms | open |
| 08 | nothing; the bar is the iteration count to a fixed rating | open, and not asked |
| 09 | nothing; the bar is Session 06's | open, and not asked |
| 10 | nothing; the bar is d 0.2 over the fencer on random viable pairs at 600 bouts | open, and not asked |
| 11 | a dozen random viable matchups of the shipped mind: does it fight | open |
| 12 | nothing; the record only | open, and not asked |

## What must not move

- `../../src/golem/policy-weights.ts` and the two rows of `GOLEM_ASSEMBLY` Session 11 of the
  style set landed, until a session ships a mind under Session 10's bar.
- `../../tests/ppo.test.mjs`'s refusal tests, the byte-identical rerun of the tournament, and the
  telescoping test in `../../tests/reward.test.mjs`, which every reward row added in Session 06
  must keep.
- The eval seed derivation in `ratePolicy` and the seeds the record was taken on: pools on
  20260906, the league on 20260914. New runs use 20260915 and say so.
