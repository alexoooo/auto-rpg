# The side-mirror gate

Skill ceiling 01, part 4 (`docs/plans/2026-09-25-skill-ceiling-01-body-release-1.md`). Every
probe-set mind, every naive-ladder mind, the v4 minds and the other named golem minds play their own
mirror, and the left side's share is read against a fair coin's band.

The tree is c563e66, the main that carries session 03, at 120 Hz physics and control. Unless a
figure says otherwise, it comes from the Node research runner (`research/runner.mjs` over
`tests/harness/bout-runner.mjs`, supported locomotion, the research `PROTOCOL`, cap 150 s, the
default build on both sides). No earlier mirror figure is carried over.

## What was built

- **`research/side-mirror.mjs`** is the gate and its full-n script. By default it runs 64 seed
  pairs a mind. Each pair is played `[a, b]` and then `[b, a]`, which makes 128 bouts, and the mind
  seeded `a` plays once on each side. Each side's mind is seeded from its own seed, `seeds[0]` on the
  left and `seeds[1]` on the right, which is the split `createBout` makes. The script writes
  `results.jsonl`, `mirror.json` and `mirror.md` into its run directory.
- **`research/side-mirror-worker.mjs`** plays one bout. As the bout runs, it hashes both bodies:
  every limb's position and health, and both bars, every sixth frame. It keeps a prefix hash at
  0.5, 1, 2, 4, 8, 16, 32 and 64 s.
- **The verdict** is `sideVerdict`.
  - Bouts with equal trajectory hashes are one bout. The left share, the band
    (`1.96 * sqrt(0.25 / n)`) and the verdict are all taken over the distinct bouts, and a draw
    scores a half.
  - A mirror fails when its share is further from 50 % than the band.
  - A mirror that decides no bout passes, because a side has nothing to decide there.
  - A mirror with exactly one distinct decisive bout fails, because only the side decides it.
- **`SIDE_DECIDED`** lists the minds that failed. `research/stat-sweep.mjs` refuses to compare any
  listed mind, and so does `research/league.mjs` (except for its own mirror).
- **`research/league.mjs --mirror`** already read a left share against a band, but it did not fit
  this gate:
  - it runs asymmetric body pairs across weapon classes;
  - it hashes no trajectory;
  - its band counted bouts, not distinct bouts.

  So the league's mirror row now reads `sideVerdict` over distinct outcomes, and there is one gate.
  `a_mirror_s_band_counts_each_distinct_bout_once` in `tests/league.test.mjs` pins that.

## The table

64 seed pairs a mind, played both ways round, run seed 20260925. Left % and the band are over
distinct trajectories. "Left % all" counts every bout. The block columns count blocks where:

- the same side won both halves (**side**);
- the same seed won both halves (**seed**);
- one half was drawn (**drawn**).

| Mind | Roles | Distinct | Left % | Band +- | Verdict | Left % all | L / R / draw | Blocks side / seed / drawn | Mean s |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| idle | ladder | 1 | 50.0 | 98.0 | pass (decides nothing) | 50.0 | 0 / 0 / 128 | 0 / 0 / 64 | 120.0 |
| golem-walker | ladder | 99 | 52.5 | 9.8 | pass | 58.2 | 65 / 44 / 19 | 12 / 41 / 11 | 92.6 |
| golem-duelist | probe, ladder | 128 | 45.3 | 8.7 | pass | 45.3 | 58 / 70 / 0 | 28 / 36 / 0 | 20.6 |
| golem-champion | probe | 128 | 52.0 | 8.7 | pass | 52.0 | 66 / 61 / 1 | 24 / 39 / 1 | 18.6 |
| golem-brawler | probe | 20 | 45.0 | 21.9 | pass | 42.2 | 54 / 74 / 0 | 40 / 24 / 0 | 72.4 |
| golem-miser | probe, v4 | 88 | 59.7 | 10.4 | pass (fails pooled, below) | 63.3 | 67 / 33 / 28 | 26 / 17 / 21 | 6.0 |
| golem-reaper | v4 | 128 | 48.8 | 8.7 | pass | 48.8 | 62 / 65 / 1 | 33 / 30 / 1 | 12.4 |
| golem-driver | v4 | 128 | 55.5 | 8.7 | pass | 55.5 | 71 / 57 / 0 | 23 / 41 / 0 | 17.2 |
| golem-fencer | named | 128 | 48.0 | 8.7 | pass | 48.0 | 61 / 66 / 1 | 25 / 38 / 1 | 24.7 |
| golem-planner | named | 128 | 43.4 | 8.7 | pass | 43.4 | 55 / 72 / 1 | 31 / 32 / 1 | 15.8 |
| golem-form | named | 128 | 50.0 | 8.7 | pass | 50.0 | 64 / 64 / 0 | 20 / 44 / 0 | 27.0 |
| golem-skirmisher | named | 128 | 47.7 | 8.7 | pass | 47.7 | 61 / 67 / 0 | 21 / 43 / 0 | 28.9 |
| **golem-guardian** | named | 1 | 100.0 | 98.0 | **fail** | 100.0 | 128 / 0 / 0 | 64 / 0 / 0 | 2.1 |
| golem-tactician | named | 1 | 50.0 | 98.0 | pass (decides nothing) | 50.0 | 0 / 0 / 128 | 0 / 0 / 64 | 120.0 |

The same run on 3b6c0a1, the tree before session 03 (13 minds, without the walker), is bit-identical:
all 1664 trajectories agree.

### Distinct openings

This table counts distinct trajectories up to each bout second. A bout that ended sooner counts
whole. The last column counts distinct outcomes (winner, length, both bars).

| Mind | 0.5 s | 1 s | 2 s | 4 s | 8 s | 16 s | 32 s | 64 s | end | outcomes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| idle | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| golem-walker | 26 | 87 | 99 | 99 | 99 | 99 | 99 | 99 | 99 | 84 |
| golem-duelist | 11 | 45 | 118 | 128 | 128 | 128 | 128 | 128 | 128 | 128 |
| golem-champion | 8 | 36 | 118 | 128 | 128 | 128 | 128 | 128 | 128 | 128 |
| golem-brawler | 1 | 16 | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 20 |
| golem-miser | 1 | 1 | 21 | 52 | 88 | 88 | 88 | 88 | 88 | 87 |
| golem-reaper | 9 | 9 | 83 | 115 | 128 | 128 | 128 | 128 | 128 | 128 |
| golem-driver | 1 | 6 | 117 | 128 | 128 | 128 | 128 | 128 | 128 | 128 |
| golem-fencer | 21 | 76 | 128 | 128 | 128 | 128 | 128 | 128 | 128 | 128 |
| golem-planner | 10 | 65 | 125 | 128 | 128 | 128 | 128 | 128 | 128 | 128 |
| golem-form | 1 | 3 | 91 | 127 | 128 | 128 | 128 | 128 | 128 | 128 |
| golem-skirmisher | 1 | 1 | 19 | 77 | 126 | 128 | 128 | 128 | 128 | 128 |
| golem-guardian | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| golem-tactician | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

Four minds collapse to fewer distinct bouts than they played, and their bands come from the distinct
count:

- **Brawler.** 128 bouts are 20 distinct ones, and its band is 21.9 points, not 8.7.
- **Walker.** 99 trajectories give 84 outcomes. Sixteen walker bouts drained both bars to empty at
  120 s, which is one outcome from different paths. Its share over every bout (58.2 %) would fail an
  8.7-point band. Over distinct bouts it is 52.5 % and passes.
- **Miser.** 88 trajectories give 87 outcomes: two bouts ended in the same double exhaustion at
  6.08 s.
- **Guardian, idle and tactician** are one bout each.

## Replication, and the miser pooled

On fresh seeds (run seed 20260926), the three mirrors nearest their bands were run again.

| Mind | Distinct | Left % | Band +- | Verdict | Pooled distinct (two runs) | Pooled left % | Pooled band +- | Pooled |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| golem-miser | 98 | 59.2 | 9.9 | pass | 186 | 59.4 | 7.2 | **fail** |
| golem-walker | 99 | 55.1 | 9.8 | pass | 198 | 53.8 | 7.0 | pass |
| golem-driver | 128 | 47.7 | 8.7 | pass | 256 | 51.6 | 6.1 | pass |

The miser passes the 128-bout gate twice, and each time by less than a point. Its lean is real:
two independent sets agree on it within half a point, and pooled over 186 distinct bouts it fails.
The cause is below. It is **not** added to `SIDE_DECIDED`, because that would remove a probe mind
from `research/stat-sweep.mjs`. That is the coordinator's call, and it is listed under "Left open".

## Causes

### No arena or body bias

- Pooled over the eleven minds whose seeds reach their bouts (every mind except idle, guardian and
  tactician), the left share over distinct bouts is **49.84 %** of 1231, with a band of +-2.79.
  Over the 1194 decided bouts it is 49.83 %.
- If one side of the arena or body favoured a side, it would show there, and it does not.
- The only side-dependent code under `src/` is the collision layer table in `src/physics.ts`, and
  that table is symmetric.

### The guardian: the mind's seed does not reach its bout

The guardian director's seed first acts when its patience runs out. That is `T.patience` of 3.0 s,
scaled by 0.8 to 1.2, so no sooner than 2.4 s. The mirror is over at 2.15 s. The seeds therefore
reach nothing, and 128 bouts are one deterministic bout, which the left wins.

What decides that one bout is float rounding between two bodies that are symmetric up to it. A
scratch copy of the bout runner (not committed) swapped the pieces of the world one at a time (Node
bout runner, seeds [11, 29]):

| World | Winner | Seconds |
| --- | --- | ---: |
| as shipped | left | 2.150 |
| pair stepped right first | left | 2.150 (identical) |
| right body built first | right | 6.78 |
| positions swapped (the left body at the far end) | left | 37.4 |
| positions, build order and step order all swapped | right | 2.150 (the same numbers) |

The order in which the pair is stepped changes nothing. The build order and the position each
change the bout, and not in one direction. Swapping all three gives the exact mirror image, so the
bout is decided by the slot a body occupies, with no side label involved. This is the mind's
asymmetry, a seed that arrives after the bout is over, exposed by an exactly symmetric world. It is
reported and not fixed.

### The miser: a seed-independent opening, and the same tie-break

Every miser bout plays the same first second: one distinct trajectory at 0.5 s and at 1 s. That
opening is not level. At 1 s the left body's bar reads 0.8194 and the right's 0.7976 (Node bout
runner, seeds [661911526, 1168512129], the first block).

The mirrored world (positions, build order and step order swapped) was run on all 128 miser jobs of
the c563e66 run (Node bout runner, scratch copy):

| World | Distinct | Left % | Band +- | L / R / draw | Bars at 1 s, left / right |
| --- | ---: | ---: | ---: | ---: | --- |
| as shipped | 88 | 59.7 | 10.4 | 67 / 33 / 28 | 0.8194 / 0.7976 |
| mirrored | 87 | 40.2 | 10.5 | 33 / 67 / 28 | 0.7976 / 0.8194 |

The opening mirrors exactly, and the win counts mirror exactly. Bout by bout, the mirror is not
exact: 48 of the 128 keep the shipped winner, where an exact mirror would keep only the 28 draws.
Individual bouts diverge after the opening, as a chaotic system does. So the miser's 59 % is the slot's tie-break in
its shared opening. It is carried into a bout that lasts 6 s on average, which is too short to wash
the opening out.

The skirmisher and the form also share their first second (one and three trajectories at 1 s), but
their bouts run 27 to 29 s, and they read 47.7 % and 50.0 %. The mind contributes that its opening is
seed-independent, and the world contributes the rounding. Neither a body nor the arena favours a
side (above).

Neither is fixed here. The fix is to make the seeds reach the opening, with a seeded spawn jitter or
settle. That changes every recorded number, and `2026-09-25-rate-control-clock.md` ("Left open")
already names it as the owner's call. Until then, a comparison that plays each pairing both ways
round cancels the slot. Both `research/stat-sweep.mjs` and the league's side-swap blocks do that.

### v4

The plan expected the v4 mirrors to fail, at 15 % for the reaper and 64 % for the driver. On this
tree they pass:

- reaper 48.8 +- 8.7;
- driver 55.5 +- 8.7, and 47.7 on fresh seeds;
- miser 59.7 +- 10.4, which passes at 128 bouts and fails pooled (above).

The earlier figures came from an older tree and are not reproduced. No v4 mind is listed as failing
at 128 bouts.

### The degenerate passes

- **Idle** decides nothing: 128 draws at 120.0 s.
- **Tactician** also decides nothing, and deals **zero** damage on either side in all 128 bouts.
  Its mirror passes only because it never fights, so it is not a mirror anything should be measured
  against.

## The suite test

`tests/side-mirror.test.mjs` runs in about 60 s. It was timed at 59.9 s on this box while another
agent's drills ran on it.

It has three arithmetic tests on fixtures:

- block structure and seeding;
- pass and fail at the band's edges, on both sides, at 128;
- the distinct-bout collapse. Sixteen distinct bouts at 68.8 % pass, but the same shares counted
  as 128 bouts fail. One decisive bout played 128 times fails, and one drawn bout passes.

It has two tests on real bouts (Node bout runner, research `PROTOCOL`, played one after another in
the test's realm):

- **The champion's mirror at 2 seed pairs**: four distinct trajectories, and a pass. A band of
  49 points catches only a mirror that the side decides outright. The full-n gate is the research
  row.
- **The control**: the miser at 3 seed pairs, with its left side reacting a quarter of a second
  late (it decides every 30th control step and holds that command). It must fail the gate toward
  the late side, 6 of 6 against a 40-point band. The late side is the left, so the control has to
  beat the miser's own lean. On these seeds the late left lost all eight bouts of four blocks.
- Clearing the `thrust` buttons on one side was tried first and is no handicap: the duelist does
  not strike through them. Its mirror played the same sixteen bouts, winners and lengths.
- **The listed minds**: every `SIDE_DECIDED` mind still fails its 1-block mirror. Each side's mind
  is built from its own side's seed, recorded on those bouts. No probe or ladder mind is listed, and
  both comparison scripts still call `refuseSideDecided` in their `main`. That last check reads the
  source text.

### Mutations

Each mutation was applied alone, and the named test was run and then restored.

| Mutation | Result |
| --- | --- |
| `mirrorJobs` gives both sides one seed | red: block structure |
| the second half does not swap the seeds | red: block structure |
| no distinct collapse (`boutIdentity` is the job id) | red: distinct bouts |
| the band taken over bouts, not distinct bouts | red: distinct bouts |
| the one-distinct-bout rule removed | red: distinct bouts, and the listed-mind test (the guardian passes) |
| the worker seeds the right side from `seeds[0]` | red: listed-mind test (the recorded seeds) |
| the guardian taken off `SIDE_DECIDED` | red: listed-mind test |
| `refuseSideDecided` call removed from `stat-sweep.mjs`, and separately from `league.mjs` | red: listed-mind test |
| the league's mirror counted over every bout | red: `a_mirror_s_band_counts_each_distinct_bout_once` |
| the late control not late | red: the unhandicapped miser fails toward the left, not the late side |
| the right body spawned turned 1.2 rad (`tests/harness/bout-runner.mjs`) | red: the champion's fair mirror, left 0 of 4 |
| the right body spawned turned 0.6 rad | red, but only through the control's distinct count (4, not 6); the champion's 4 bouts did not catch it |

The last row looked like the limit of the suite test, so the full-n row was run with the same
mutation: the champion, 64 seed pairs, run seed 20260925 (Node research runner). The result was
**48.8 +- 8.7 over 128 distinct bouts, a pass**. A 0.6 rad turn at spawn does not decide the
champion's mirror, even at full n. Why was not measured: the champion re-faces its opponent, but when
it finishes doing so was not recorded. The suite's four bouts missed nothing there that the full row
catches. At 1.2 rad the turned right body won all four
bouts, and the suite's fair mirror caught it.

## Left open

- **The miser** leans 59 % left, which is the slot's tie-break in its shared opening. It passes the
  gate at 128 bouts twice and fails pooled at 186 distinct bouts. Whether to list it in
  `SIDE_DECIDED` (and so take it out of the probe set) is the coordinator's call. Comparisons that
  play both ways round are not affected by it.
- **Seed-independent openings** are behind both the guardian and the miser. The cure is a seeded
  spawn jitter or settle, and it is the owner's call (`2026-09-25-rate-control-clock.md`).
- **The tactician** never fights its own mirror. Its pass is empty.
