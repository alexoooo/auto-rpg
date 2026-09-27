# Release 2's questions

2026-09-26. The measurements that must come before session 07's choices
(`docs/plans/2026-09-25-skill-ceiling-07-body-release-2.md`), on main at 44b016d1 plus this
session's commits. It answers the questions of the headroom audit's proposals
(`docs/analysis/2026-09-26-headroom.md` section 6) so each choice reaches the owner with its table.
**Nothing shipped was changed**: no body was removed and no default moved. Every counterfactual is a
harness override, named with its run.

**Status after continuation** (the original session ended at 17:18; only the brawler run remains open):

| item | status | reading | recommendation |
| --- | --- | --- | --- |
| 6, waist lean | answered | 1200 raw is the knee: 45 % fewer stone falls, re-falls 15 to 28 % → 9 to 10 %, and the naive balance holds | 1200, behind an eye gate; not shipped |
| 5(b), x1.1 walker | answered | The walker cannot choose its range. Its 0.80 hold jams its strokes | accept; consider hold 0.88 |
| 2(b), fists and whip in their family | complete: naive 768; whip expert 16; fists expert 32 | They lose under equal naive minds. The expert wins with both, slowly | accept as weak builds |
| 13(a), stability and recovery | partial: 3 of 4 runs; expert against brawler running | Recovery pays only for the expert on the skeleton. Stability's high end pays nothing in completed runs | look at the skeleton's floor time, then stability's reach |
| 16, size on mace and maul | complete: 64 bouts each | size pays on both under the expert; smaller bodies spend much longer down | retain the measured size law; defaults unchanged |
| 17, survive-cut | answered | The rest guard survives the cut on five humans (97.5 to 100 %) | accept; report "passes at rest" |
| 4(a), human arm energy | answered (table) | 1/4 to 1/10 of stone's momentum, mostly speed | rate sensitivity dominates the normal stroke; defaults unchanged |

Harnesses, as in the audit:

- **"Bout runner"**: the Node bout runner (`tests/harness/bout-runner.mjs`) through the research
  runner (`runJobs`, one Havok arena per worker realm), research `PROTOCOL` (150 s cap, supported
  locomotion), corner-swapped seed pairs.
- **"Torso bench"**, **"headless arena"**, **"impact bench"**, **"drill runner"**: the Node benches
  of those names, named again beside each table.

A counterfactual constant is set by `research/overrides.mjs`: a run names it in its manifest
(`manifest.overrides`), so it is part of the identity `runJobs` checks on resume, and the worker
sets it around each job and puts it back after.

## 1. Item 6: the waist lean ceiling

### Why the shipped value is not its own doc table's

`TORSO_WAIST.leanTorque` is `onBody(600)`, 1852 N.m. Its doc comment's table picks 1500, and at
1500 it records 600 as stuck. The two do not disagree about the same waist. Git history shows the
table and the value belong to different mechanisms:

| commit | date | what it did to the lean ceiling |
| --- | --- | --- |
| `07e3b2d7` | 2026-09-04 | The torso slot. The table in the doc comment was taken on the waist of the day: a serial linkage with position motors. 600 N.m was stuck (458 steps), 900 reached its stop, and 1500 was picked. |
| `4df36d45` | 2026-09-20 | The owner's "wobblying progress". The waist became a direct pitch-and-yaw joint driven by a velocity servo, and lean/twist went from 1500/900 to 600/360. The line comment above the value is that commit's: head tilt while walking and aiming was 9.63 deg at 250/150, 1.59 at 400/240 and 0.42 at 600/360, and 1500/900 "absorbs a 20 Ns shove almost completely". **"600/360 provides movement headroom while retaining finite impact response."** |
| `562f8b22` | 2026-09-24 | Stone's body took its own density (x3.086). The value was wrapped in `onBody()` along with every torque that moves the body, so 600 became 1852 N.m and the ratio of torque to trunk stayed the owner's. |

So the doc table is void for the joint that ships: it measured a linkage that no longer exists. The
value that ships is the owner's choice of 2026-09-20, and it was made for feel: small head tilt,
and a trunk that still gives to a blow. The torso bench below shows that 1852 N.m is not stuck on
the current waist. The comment and the table have not been reconciled since then, which is why the
audit read it as a ceiling without a table.

### The sweep

The lean ceiling was set per run through the override `waist.leanTorque`, at eight levels. A level
is the number written inside `onBody()`: 600 ships, 1500 is the doc table's pick. The twist ceiling
(360) was held. `research/release2-waist.mjs` runs and reports every table below, and each
table names its harness.

**Falls.** Bout runner through `research/fall-loop-worker.mjs`, 150 s cap, the same seeds at every
level. The groups:

- `stone`: a round robin of five naive minds on the stone default, 400 bouts a level.
- `wheel` and `plated`: the brawler and the duelist on that body, 400 bouts a level.
- `idle`: an idle stone default against a `golem-brawler`, the audit's chest-high press, 64 bouts a
  level; the idle side's falls.

A re-fall is a fall within 2 s of standing up again.

| lean (raw / N·m) | stone falls/min | re-fall | wheel falls/min | re-fall | plated falls/min | re-fall | idle under a press, falls/min | down % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 300 / 926 | 2.45 | 27.0 % | 5.62 | 39.5 % | 2.65 | 21.7 % | 4.70 | 23.2 |
| 450 / 1389 | 1.62 | 23.5 % | 4.21 | 33.1 % | 2.15 | 22.7 % | 3.26 | 15.3 |
| **600 / 1852 (ships)** | **1.31** | **14.9 %** | **3.01** | **28.3 %** | **2.22** | **15.5 %** | **5.70** | **27.6** |
| 800 / 2469 | 1.00 | 12.9 % | 1.49 | 20.0 % | 1.99 | 14.1 % | 2.72 | 13.2 |
| 1000 / 3086 | 0.81 | 13.7 % | 1.14 | 14.0 % | 1.38 | 12.3 % | 1.56 | 9.0 |
| 1200 / 3704 | 0.72 | 9.0 % | 1.21 | 9.7 % | 1.36 | 9.6 % | 0.54 | 2.8 |
| 1500 / 4630 | 0.74 | 7.9 % | 0.98 | 6.1 % | 1.26 | 7.1 % | 0.00 | 0.0 |
| 2000 / 6173 | 0.61 | 9.3 % | 0.60 | 7.0 % | 0.94 | 8.6 % | 0.00 | 0.0 |

The multileg is flat at 0.09 to 0.21 falls a minute at every level: it does not fall on its waist.

Paired against the shipped level on the same seeds (per bout, both sides, ± 95 % over 200 side-swap
blocks; 32 for idle), falls a minute a side:

| level | stone | wheel | plated | idle under a press |
| --- | --- | --- | --- | --- |
| 800 | −0.10 ± 0.26 | −1.32 ± 0.40 | −0.30 ± 0.19 | −1.44 ± 0.13 |
| 1000 | −0.31 ± 0.26 | −1.77 ± 0.43 | −0.60 ± 0.24 | −2.29 ± 0.13 |
| 1200 | −0.35 ± 0.24 | −1.70 ± 0.61 | −0.62 ± 0.22 | −2.92 ± 0.23 |
| 1500 | −0.30 ± 0.25 | −2.13 ± 0.61 | −0.72 ± 0.25 | −3.25 ± 0.16 |
| 2000 | −0.34 ± 0.26 | −2.59 ± 0.61 | −0.96 ± 0.26 | −3.25 ± 0.16 |

- **The stone default's gain is all in by 1000**: about 40 % fewer falls. The wheel and the plated body
  go on gaining to 2000.
- **Re-falls halve by 1200** on all three bodies: 15 to 28 % of falls at 600, and 9 to 10 % at 1200.
- **An idle stone under a chest-high press stops falling at 1500.** The idle rate is noisy at 64
  bouts (600 reads higher than 450), but the paired column is monotone from 800.

**The naive minds' balance.** Bout runner, the `stone` group: each mind's share of its bouts against
the other four (mirrors excluded, 128 bouts a mind, ± about 8.5 points), and falls a body a bout in
the two mirrors that fall most:

| lean | walker | duelist | brawler | champion | miser | brawler mirror falls | stone mirror falls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 300 | 57.0 | 21.1 | 40.6 | 58.6 | 72.7 | 4.66 | 1.23 |
| 450 | 57.0 | 25.4 | 41.0 | 56.3 | 70.3 | 3.94 | 0.87 |
| **600** | **58.6** | **28.1** | **35.2** | **50.0** | **78.1** | **4.41** | **0.96** |
| 800 | 50.0 | 21.1 | 34.0 | 57.4 | 87.5 | 3.06 | 0.71 |
| 1000 | 51.6 | 22.7 | 47.7 | 54.7 | 73.4 | 2.47 | 0.57 |
| 1200 | 59.4 | 24.2 | 35.9 | 53.9 | 76.6 | 2.31 | 0.52 |
| 1500 | 61.7 | 16.4 | 40.6 | 51.6 | 79.7 | 1.69 | 0.38 |
| 2000 | 57.0 | 18.8 | 44.5 | 55.5 | 74.2 | 1.06 | 0.25 |

The order of the five minds does not move. The duelist loses 12 points at 1500, about two
standard errors, and 4 at 1200, which is within the noise. The brawler mirror, the cell the owner
watches for re-falls, goes from 4.41 falls a body a bout to 2.31 at 1200 and 1.69 at 1500. The
head-to-head matrices at each level are in the run's `report.md`.

**The torso bench** (Node torso bench, `head.ram`, the doc table's own instrument, read at the lean
mark), the plain trunk:

| lean | arrival s | overshoot rad | lag mm | stuck steps | shove bob mm |
| --- | ---: | ---: | ---: | ---: | ---: |
| 300 | 0.625 | 0.0214 | 42.1 | 0 | 74.8 |
| 450 | 0.517 | 0.0121 | 28.0 | 0 | 50.7 |
| **600** | **0.517** | **0.0078** | **17.8** | **0** | **44.0** |
| 800 | 0.517 | 0.0050 | 10.6 | 0 | 47.4 |
| 1000 | 0.517 | 0.0042 | 9.0 | 0 | 49.3 |
| 1200 | 0.517 | 0.0040 | 8.7 | 0 | 50.1 |
| 1500 | 0.517 | 0.0040 | 8.3 | 0 | 50.8 |
| 2000 | 0.517 | 0.0040 | 7.8 | 0 | 51.1 |

Nothing is stuck at any level on the direct joint, 600 included. The lag halves between 600 and
1000 and is flat after it. The plated trunk reads the same to within 2 mm.

**The chest force that folds the waist** (Node headless arena, an idle body, a 3 s horizontal
press at the trunk core, bisected; the waist folds when the trunk tilts past 0.2 rad, and it then
goes to its stop at about 0.62 rad):

| lean | default holds / folds, N | plated holds / folds, N |
| --- | ---: | ---: |
| 300 | 3516 / 3594 | 3203 / 3281 |
| 600 | 6875 / 6953 | 6250 / 6328 |
| 1000 | 11328 / 11406 | 10313 / 10391 |
| 1200 | 13594 / 13672 | 12344 / 12422 |
| 1500 | 16953 / 17031 | 15313 / 15391 |
| 2000 | 22578 / 22656 | 20469 / 20547 |

The fold force is proportional to the ceiling, 3.7 N per N·m: the press folds the waist, not the
legs.

**The tipping line** (Node headless arena: the weakest shove impulse that fells the body, median /
10th percentile, N·s, in four states; the shove bisection at 0.95 and 1.05 of it stood and fell at
every level). It does not move with the lean on the stone default or the plated body: 115 standing
still at every level, 123 to 126 walking, 133 to 139 in a stroke. The maul is the exception:

| lean | maul, stroke | maul, stroke while stepping |
| --- | --- | --- |
| 300 | 89 / 82 | 134 / 116 |
| 600 | 120 / 104 | 151 / 122 |
| 800 | 119 / 111 | 125 / 75 |
| 1200 | 119 / 112 | 119 / 69 |
| 1500 | 121 / 113 | 119 / 68 |

**Stroke stray** (Node headless arena: one stroke at the air from a settled guard on an assembled
body, the striking hand's peak distance from its anchor, mm). On the stone default and the plated
body it does not move: 69 to 71 mm in the drive and 54 in the follow at every level, and the tip
peaks at 19 to 21 m/s. The maul again is the exception:

| lean | maul drive stray | follow stray | tip peak m/s |
| --- | ---: | ---: | ---: |
| 300 | 105.8 | 23.2 | 11.2 |
| 600 | 160.9 | 90.8 | 19.0 |
| 800 | 207.6 | 148.3 | 19.1 |
| 1000 | 218.0 | 157.1 | 18.5 |
| 1200–2000 | 219 | 156 | 18.6 |

- **The maul pays for a stiff waist.** Its two-handed stroke leans the trunk, and a trunk that no
  longer gives passes that to the arms (stray up by 58 mm) and to the feet (the stroke-while-stepping
  tipping line's 10th percentile falls from 122 to 69 N·s). Both settle at 1000.
- **In a bout the maul still falls less.** So the maul was played on its own: the brawler and the
  duelist on the stone maul, 100 bouts a level, at three levels (bout runner, as above):

  | lean | maul falls/min | re-fall | down % | paired against 600, a side |
  | --- | ---: | ---: | ---: | --- |
  | 600 | 4.75 | 29.9 % | 22.7 | |
  | 1200 | 2.97 | 23.6 % | 13.4 | −1.03 ± 0.60 |
  | 1500 | 2.76 | 27.6 % | 12.3 | −1.31 ± 0.63 |

  The maul falls about 40 % less at 1200. Its re-fall share barely moves, at 24 to 30 %. It is
  the body that falls most in this sweep, at any level.

### What the numbers say

- **Past 1000 the waist is not what is failing.** Nothing on the torso bench moves after 1000, and
  the stone default's falls are all in by then.
- **The re-fall rate the owner asked about keeps falling to 1200**, and a pressed idle body stops
  falling at 1500.
- **No level ends re-falls.** A floor of 6 to 10 % remains at 1500 and 2000, and on the maul
  24 to 30 %. The waist is not the whole cause, so the rest is for the recovery rule (item 13(a),
  section 4).
- **The cost is feel, not fighting.** The owner chose 600 on 2026-09-20 for a trunk that "retains a
  finite impact response"; the ratio of torque to trunk has been kept since, so 1500 today is the
  1500 the owner judged to absorb "a 20 Ns shove almost completely". The shove bob on the bench
  barely moves (44 to 51 mm), so what changes is how far the *trunk* gives to a blow, and that is an
  eye question.

**Options for the owner.**

- (a) **1200** (`onBody(1200)`, 3704 N·m). This is the knee.
  - Stone falls: −45 % pooled (paired per bout, −0.35 ± 0.24 a minute).
  - Wheel falls: −60 %.
  - Re-falls: 9 to 10 % on the stone default, the wheel and the plated body. The maul stays near 24 %.
  - A pressed idle body: 0.54 falls a minute.
  - The brawler mirror: 2.31 falls a bout, from 4.41.
  - The maul: −1.03 ± 0.60 falls a minute a side, but its stroke strays 58 mm further from its anchor.
  - The duelist's share moves by noise alone.
- (b) **1500**, the doc table's value: the lowest re-falls (6 to 8 %) and no falls under a press. It
  costs the duelist about 12 points of share, and it is the lean the owner turned down for
  feel (with twist at 900 then).
- (c) **1000**: all of the stone default's gain, with less stiffness, but 12 to 14 % re-falls and an
  idle body that still falls 1.56 times a minute under a press.
- (d) **Keep 600**, and write the direct joint's table into the doc comment in place of the linkage's.

**Recommended: (a) 1200, not shipped, behind an eye gate.** The owner should watch a blow land on
the trunk at 1200 against 600 before choosing, because that is the property 600 was chosen for. On
any choice, the doc comment's table should be replaced with this one: the linkage it measured no
longer exists.

Compute: 8 levels × 1664 bouts on 9 lanes, 11:05 to 14:37 (about 32 lane-hours); the benches, one
realm, 14:37 to 14:43; the maul bouts, 300 on one lane, 14:45 to 15:39.

## 2. Item 5(b): why the x1.1 walker's strokes land worse

**Answer.** They do not land worse than a walker's strokes usually land. The x1 walker's strokes
land better against a taller body, and the cause is the walker's own range and aim, not size
physics:

- The walker stops at 0.80 of its reach and holds its blade pointed at the other body's shoulder.
  At that range the pointed blade already lies on the other body's head. In the walker cells, 37 to
  81 % of strokes begin with that contact already made.
- Against a body of its own height or shorter, the blade lies against the head and the plate, and
  the stroke jams there. The tip never gets closer than 0.65 m to the mark and passes 0.48 m above it.
- Against a taller body, the blade points up at the higher shoulder and lies along the side of the
  head. The chamber draws it outboard and up, and that draw is a slicing cut.

Harness: bout runner through `research/release2-strokes.mjs` and `research/stroke-worker.mjs`. A
stroke is the walker's own edge, where its `swinging` goes from -1 to 0, read on the call. Each
contact is filed to the striker's stroke in progress, or to the 0.25 s after it. Stone default,
96 bouts a cell (48 corner-swapped seed pairs). A is the first-named build.

**The size cell again, with its controls.** Damage is damage dealt per bout.

| cell | A | B | A wins | A dmg/bout | B dmg/bout | A's strokes that first met B's held item | B's that met A's | A's scored in the chamber alone | B's |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| x1.1 v x1 | x1.1 walker | x1 walker | 32 / 96 | 2.06 | 3.95 | 34.0 % | 3.5 % | 16.9 % | 29.9 % |
| x1 mirror | x1 walker | x1 walker | 47 / 96 | 2.20 | 2.41 | 36.0 % | 36.0 % | 8.1 % | 8.5 % |
| x1.1 mirror | x1.1 walker | x1.1 walker | 42 / 96 | 2.70 | 3.26 | 54.9 % | 47.5 % | 11.2 % | 10.2 % |
| x0.9 v x1 | x0.9 walker | x1 walker | 49 / 96 | 5.09 | 5.92 | 15.6 % | 6.3 % | 10.3 % | 7.4 % |

The rerun reproduces the audit. The x1.1 walker wins 33 % (the audit had 32 %) and deals 2.06
against 3.95 (the audit had 2.28 against 4.47). Both stroke 54 times a minute.

The x1.1 walker's 2.06 is what a walker deals in any mirror, 2.2 to 3.3. The outlier is the x1
walker's 3.95. Of that, 1.66 a bout comes from strokes that scored in the chamber alone, against
0.93 for the bigger body. Its strokes almost never first meet the taller body's plate (3.5 %),
where the bigger body's meet the smaller one's 34 % of the time, the mirror's rate.

The scoring contacts show the same split. The x1 walker cuts at a closing speed of 4.8 m/s and
0.169 a blow (median). The x1.1 walker cuts at 3.0 m/s and 0.103 a blow.

**The counterfactual: the other body never strokes.** Here the other side is the walker with its
clock held at zero (`golem-walker:pointer` in the stroke worker). It walks in to its hold and points
at the mark exactly as a walker does between strokes, and never swings. So each stroke meets only
the other body's rest. Bout runner, 64 bouts a cell (32 pairs):

| striker | against a pointing | wins | dmg/bout | strokes already touching at start | scored at all | tip's closest to the mark | tip over the mark there |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| x1 walker | x1 | 6 / 64 | 0.01 | 100 % | 0.1 % | 0.65 m | +0.48 m |
| x1.1 walker | x1 | 60 / 64 | 0.16 | 68 % | 5.2 % | 0.70 m | +0.48 m |
| x1 walker | x1.1 | 64 / 64 | 3.40 | 100 % | 80.5 % | 0.39 m | 0.00 m |

- **A walker cannot hurt a same-size body that only points at it.** Every stroke starts with the
  blade on the other head, and 99.9 % score nothing. The wins at the cap go to the higher bar,
  which is how 60 wins carry 0.16 of damage.
- **Against a taller pointing body, the x1 walker kills it in about 50 s.** 80.5 % of its strokes
  score, all of them in the chamber. Every one is the same cut: edge 0.68, 3.5 m/s, 0.091 of the bar,
  on the head.
- The pointer cells are nearly deterministic, and the quartiles collapse. The walker's only dice
  are its clock's phase, so these 64 bouts are a handful of distinct fights. They are a mechanism
  reading, not a rate.

In the walker-against-walker cells, the damage both sides deal comes from each stroke knocking the
other's jammed blade loose. The x1 walker also gets the free chamber cut when the other body is
taller.

**The second counterfactual: take the jam away.** `WALKER.holdFraction` was set to 0.88 for these
runs only, through the override `walker.holdFraction`. The walker then stops far enough out that
its pointed blade does not rest on the other body. The shipped value is 0.80, and the strike gate
stays at 0.92. Bout runner, 64 bouts a cell:

| cell | hold | A wins | A dmg/bout | B dmg/bout | A's strokes scoring after the chamber | B's | A's commit closing m/s | B's | A's tip peak m/s | B's |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |
| x1.1 v x1 | 0.80 | 32 / 96 | 2.06 | 3.95 | 18.6 % | 15.1 % | 3.4 | 5.5 | 16.5 | 12.9 |
| x1.1 v x1 | 0.88 | 20 / 64 | 5.76 | 7.79 | 78.9 % | 87.2 % | 4.8 | 6.3 | 14.4 | 17.9 |
| x1 mirror | 0.80 | 47 / 96 | 2.20 | 2.41 | 10.9 % | 13.1 % | 3.8 | 3.9 | 14.9 | 14.7 |
| x1 mirror | 0.88 | 32 / 64 | 5.02 | 5.60 | 81.7 % | 87.2 % | 5.6 | 5.7 | 16.0 | 16.7 |
| x0.9 v x1 | 0.88 | 29 / 64 | 5.58 | 7.63 | 74.9 % | 87.1 % | 5.8 | 4.6 | 14.7 | 14.5 |
| x1.1 walker v x1 pointer | 0.88 | 64 / 64 | 9.90 | 0 | 100 % | -- | 5.5 | -- | 17.8 | -- |
| x1 walker v x1 pointer | 0.88 | 64 / 64 | 10.32 | 0 | 100 % | -- | 5.6 | -- | 20.1 | -- |

- **The jam is the walker's range.** At 0.88, 75 to 87 % of strokes score after the chamber,
  where 11 to 19 % did at 0.80. Damage per bout more than doubles in every cell. A walker kills a body
  that only points at it, of either size.
- **The size result survives it.** The x1.1 walker still wins 20 of 64 (31 %), the audit's
  figure. So the jam explains why a walker's strokes mostly do nothing, and why the x1 walker's
  chamber cut is free against a taller body. It does not explain why the bigger body loses.
- **What is left is range, and the walker has no footwork to choose it.** Each walker walks in to
  its own hold and never backs off. So the shorter body closes to its range, and the longer body
  fights there too. These readings are at hold 0.88, where strokes land; at 0.80 the jam hides
  them.
  - At the stroke's start the x1.1 walker stands at 0.76 of its reach and the x1 walker at 0.80 of
    its own.
  - The longer sweep meets the target early. The x1.1 walker's scoring contact comes 0.40 s into
    the commit, against 0.55 s for the x1. That is before its tip is up to speed: it closes at
    4.8 m/s against 6.3.
  - The x0.9 v x1 cell shows the same thing the other way round. There the x1 body is the longer
    one: it stands at 0.75, lands at 0.40 s and closes at 4.6 m/s. The x0.9 body stands at 0.80,
    lands at 0.53 s and closes at 5.8 m/s.

**The third counterfactual: give the bigger arm its clock back.** The size law turns a larger arm
more slowly: rates go as 1 / s (`SIZE_LAW_POWER` in `src/golem/attributes.ts`, the owner's
biological law of 2026-09-25). So the x1.1 body was also played with arm speed x1.1, in the cell
`size-armspeed` (bout runner, 64 bouts at each hold):

| hold | x1.1 + arm speed x1.1 wins | its dmg/bout | x1's | its tip peak m/s | x1's | its commit at s | x1's |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 0.80 | 12 / 64 | 1.96 | 5.09 | 15.8 | 13.0 | 0.57 | 0.55 |
| 0.88 | 18 / 64 | 6.14 | 7.58 | 13.7 | 16.0 | 0.40 | 0.53 |

Arm speed does not help. At 0.88 the x1.1 tip is no faster, and it still lands at 0.40 s. The
arm's clock is not what the bigger walker is short of.

**The answer, in one line.** A bigger walker loses because the walker cannot choose its range: it
fights where the shorter body stops, and a longer stroke lands there early and slow. The walker's
0.80 hold also jams most of every walker's strokes against the other body's rest, and that adds a
free chamber cut for the shorter body against a taller one. The expert, which chooses its range,
is paid by size: 84 % in the audit's orderings.

**Options for the owner.**

- (a) **Accept.** The walker is a naive rung without footwork, and size is not a handicap for it.
  Use the duelist or the expert when size is the variable.
- (b) **Move the walker's hold out of contact (0.88).** Strokes then land, and damage per bout more
  than doubles. This changes the naive ladder's middle rung, so the ladder and the idle-dummy gate
  would be re-measured. It does not change the size result.
- (c) **Give the walker a range rule by reach**: hold at a fraction of the *shorter* reach, or back
  off to its own hold. That is footwork, which the walker omits on purpose (`src/golem/walker.ts`
  header).

**Recommended: (a), and consider (b) on its own merits.** The walker's jam is a defect of the naive
rung whatever size does: a walker that cannot hurt a same-size body that only points at it
(0.01 a bout) is a weaker rung than the ladder assumes. (b) is the smallest repair, but it is a
change to the ladder, so the owner decides.

Compute: 480 + 192 + 320 + 128 bouts, on one lane beside the waist sweep: 11:22 to 13:25 of wall time, about 2.1 lane-hours.

## 3. Item 2(b): skeleton-fists and skeleton-whip against their own family

**Answer.** Against their own family they lose as clearly as they do against stone. With equal
naive minds, each loses to every other skeleton build 88 to 100 % of the time. With the expert
on them, they still win. The expert on skeleton-whip beats the skeleton duelist on each of the
other four builds. So both bodies have headroom, and neither is a dead end. But they are the two
weakest builds of the family, not a family that happens to lose to stone.

Harness: bout runner through `research/headroom.mjs --exp family`, research `PROTOCOL`, corner-swapped
seed pairs. A is the subject (fists or whip) in a naive cell, where both bodies play the same mind.
In an expert cell, A is the expert's body, and the other body plays the skeleton duelist.

**Equal naive minds**, 48 bouts a cell, the subject's share with its 95 % interval, and the mean bar
margin (the subject's bar minus the other's at the end):

| subject | against | walker share | margin | skeleton duelist share | margin |
| --- | --- | ---: | ---: | ---: | ---: |
| skeleton-fists | skeleton-warrior | 0.0 % | −0.82 | 0.0 % | −0.83 |
| skeleton-fists | skeleton-mace | 0.0 % | −0.62 | 0.0 % | −0.89 |
| skeleton-fists | skeleton-dual-blades | 2.1 % [0, 6] | −0.85 | 0.0 % | −0.93 |
| skeleton-fists | skeleton-maul | 7.3 % [3, 12] | −0.11 | 0.0 % | −0.29 |
| skeleton-whip | skeleton-warrior | 0.0 % | −0.88 | 0.0 % | −0.66 |
| skeleton-whip | skeleton-mace | 0.0 % | −0.68 | 0.0 % | −0.79 |
| skeleton-whip | skeleton-dual-blades | 0.0 % | −0.94 | 0.0 % | −0.90 |
| skeleton-whip | skeleton-maul | 12.5 % [4, 23] | −0.14 | 0.0 % | −0.42 |

Only against the maul are the bouts close: the margin is −0.11 to −0.42, and the bouts run to
about 100 s.

**The expert on each side**, 2 bouts a cell (one corner-swapped pair). The expert's share, its
margin, and the bout's length:

| expert on | against the skeleton duelist on | expert's share | margin | bout s |
| --- | --- | ---: | ---: | ---: |
| skeleton-whip | skeleton-warrior | 2 / 2 | 0.46 | 88.0 |
| skeleton-whip | skeleton-mace | 2 / 2 | 0.60 | 84.2 |
| skeleton-whip | skeleton-dual-blades | 2 / 2 | 0.23 | 102.2 |
| skeleton-whip | skeleton-maul | 2 / 2 | 0.33 | 99.3 |
| skeleton-warrior | skeleton-whip | 2 / 2 | 1.00 | 10.2 |
| skeleton-mace | skeleton-whip | 2 / 2 | 1.00 | 8.5 |
| skeleton-dual-blades | skeleton-whip | 2 / 2 | 1.00 | 5.9 |
| skeleton-maul | skeleton-whip | 2 / 2 | 1.00 | 44.1 |

**Skeleton-fists expert continuation complete:** 32/32 bouts, two swapped seed pairs per cell,
no failures. One physically identical duplicate was removed from a copy of the historical data;
17 historical rows plus 15 resumed rows remain. The original files are untouched. A historical
warrior-versus-fists replay exactly reproduced seeds, verdict, duration and vitality.
Compact evidence: `research/results/2026-09-26-skeleton-fists-family.json`.

| expert on | against skeleton duelist on | expert wins | margin | bout s |
|---|---|---:|---:|---:|
| skeleton-fists | skeleton-warrior | 4 / 4 | 0.556 | 83.2 |
| skeleton-fists | skeleton-mace | 4 / 4 | 0.595 | 83.0 |
| skeleton-fists | skeleton-dual-blades | 4 / 4 | 0.417 | 92.2 |
| skeleton-fists | skeleton-maul | 4 / 4 | 0.400 | 96.0 |
| skeleton-warrior | skeleton-fists | 4 / 4 | 0.947 | 8.6 |
| skeleton-mace | skeleton-fists | 4 / 4 | 1.000 | 7.1 |
| skeleton-dual-blades | skeleton-fists | 4 / 4 | 0.988 | 4.7 |
| skeleton-maul | skeleton-fists | 4 / 4 | 0.931 | 56.5 |

Fists show the same qualitative result as the whip: the expert can win with the weak build,
but takes much longer and retains less vitality. These are mechanism screens, not precise balance
estimates: only two independent seed pairs per cell. An all-win bootstrap interval degenerates
at this sample size and should not be read as population certainty. No body/default choice changes.
The continuation took 999 s on three lanes.

- **The expert wins with the whip, and slowly.** It needs 84 to 102 s and keeps 0.23 to 0.60 of its
  bar. The expert on any other build kills the whip's duelist in 6 to 44 s without being touched.
- **Two bouts a cell is a mechanism reading.** A 2 / 2 has a 95 % interval down to about 16 %. The
  pattern is the same in all eight cells, and that is what carries the reading.

**Options for the owner** (the audit's): (a) accept them as the family's weak builds, and say so on
the picker; (c) raise the skeletal chain's delivered energy. The impact bench in section 7 bears on
(c): the skeletal blade and mace deliver about as much as the stone ones, and the skeletal fist's
blow is a shove. (b), re-measuring them against their own family, was done here, and it does not
rescue them.

**Recommended: (a)**, unless the owner wants every build viable in the naive ladder. The expert
shows that the headroom is real. A naive mind cannot use a whip or fists against a blade, in any
family.

Compute: 768 naive bouts on 2 lanes, 14:37 to 16:07 (3 lane-hours); the whip's 16 expert bouts on
3 lanes, about 40 minutes (2 lane-hours); the fists expert cells about 1.5 hours on 1 to 4 lanes, unfinished.

## 4. Item 13(a): stability and recovery where bodies fall

**Answer.** Neither attribute pays where bodies fall most, except recovery for the expert on the
skeleton. Low stability costs a brawler, but high stability buys it nothing. The skeleton falls 10
to 15 times a minute and spends half of every bout on the floor, whatever either attribute is set
to.

Harness: bout runner through `research/headroom.mjs --exp attributes`, research `PROTOCOL`,
corner-swapped seed pairs. A is the body with the attribute at the named end of its range. B is the
same build at x1, played by the same mind unless a cell names another. Falls and time down are read
from the rows' own sides by `research/release2-attr-falls.mjs`.

| body, minds | cell | bouts | A share | A falls/min | B falls/min | A down % | B down % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| skeleton-warrior, expert mirror | control | 16 | 50.0 | 14.4 | 15.5 | 59.7 | 64.5 |
| | stability 0.5 | 16 | 68.8 | 15.6 | 13.7 | 63.3 | 60.2 |
| | stability 2 | 16 | 62.5 | 11.6 | 15.3 | 54.3 | 65.1 |
| | recovery 0.5 | 16 | 31.3 | 10.3 | 13.2 | 75.4 | 59.6 |
| | recovery 1.25 | 16 | 81.3 | 15.2 | 16.8 | 55.8 | 69.7 |
| skeleton-warrior, skeleton duelist mirror | control | 64 | 46.9 | 10.0 | 9.9 | 49.7 | 49.5 |
| | stability 0.5 | 64 | 40.6 | 12.0 | 10.0 | 58.1 | 49.1 |
| | stability 2 | 64 | 53.1 | 8.9 | 9.5 | 44.4 | 46.6 |
| | recovery 0.5 | 64 | 43.8 | 7.1 | 9.9 | 64.7 | 49.4 |
| | recovery 1.25 | 64 | 51.6 | 10.2 | 9.7 | 42.9 | 48.4 |
| stone default, brawler mirror | control | 64 | 54.7 | 2.8 | 2.9 | 13.8 | 14.0 |
| | stability 0.5 | 64 | 25.0 | 4.2 | 3.3 | 20.0 | 14.9 |
| | stability 2 | 64 | 39.1 | 3.5 | 3.3 | 16.9 | 15.2 |
| | recovery 0.5 | 64 | 42.2 | 2.1 | 2.3 | 17.1 | 11.1 |
| | recovery 1.25 | 64 | 34.4 | 3.5 | 3.1 | 14.9 | 14.9 |

**The expert against the brawler, where bodies fall: running.** The historical directory had no
completed bouts. Its validated continuation is `research/runs/release2-continuation/attr-expert-v-brawler`,
80 bouts on four lanes, started after the maul study completed.

A share has a 95 % interval of about ± 12 points at 64 bouts, and about ± 25 at 16.

- **The skeleton lives on the floor.** It falls 10 to 15 times a minute, and it is down for half of
  every bout in every cell, the controls included. The attributes move that by less than the gap
  between the two x1 sides.
- **Recovery is the one that pays, and only for the expert on the skeleton**: 31 to 81 % across its
  range. That is outside the noise at 16 bouts, and it is the audit's finding again. The expert
  uses the time a faster rise gives it, and the duelist does not (44 to 52 %).
  - Recovery does what it says: at 0.5 the body is down 65 to 75 % of the time, at 1.25 43 to 56 %.
  - It even falls *less* at 0.5, because a body on the floor has fewer chances to fall.
- **Stability does not pay at its top end.** At 2 it moves the skeleton's falls by 10 to 20 % and
  the brawler's not at all: 3.5 falls a minute against 3.3. A brawler at 0.5 loses (25 %), so the
  attribute's *low* end is a real handicap. Its high end is not a real benefit.
- **Why stability buys nothing: its own doc comment already says it.** `stability` in
  `src/golem/attributes.ts` multiplies the impulse ledger's stagger and fall lines, and nothing
  else. That doc comment records "in the duel it barely matters any more", and that the skeleton's
  falls "are its stance's". This section agrees, now with the expert and the brawler as well. The
  waist sweep in section 1 adds a lever it does not reach: the lean ceiling moves every stone
  body's falls, and stability does not scale it. That the brawler's falls go through the waist is
  an inference from section 1, not a measurement made here.

**Options for the owner.**

- (a) **Accept**: recovery is an expert's attribute, and stability is a floor, not a ceiling.
- (b) **Make stability reach what fells a body**: scale the waist's lean ceiling, or the shove's
  share that the legs take, with it, and not only the balance line. Section 1's table is the "before"
  for that.
- (c) **Look at the skeleton's floor time first.** A body that is down half of every bout is a
  locomotion question before it is an attribute one.

**Recommended: (c), then (b).** The skeleton's 50 % down is the largest number in this section.
If stability then reaches the waist, the brawler would read it, which is what section 1 shows the
waist doing.

Compute: 80 expert bouts on 4 lanes, 14:37 to 16:06; 320 + 320 naive bouts on 3 lanes, 16:07 to
17:00. The expert-against-brawler cells were not run.

## 5. Item 16: size with the expert on the mace and the maul

**Both complete.** Node bout runner, research PROTOCOL, expert c8/h1 mirror,
8 corner-swapped seed pairs per cell. A has the named size, B stays at 1. The mace continuation
finished 64/64 bouts with no failures: 44 historical rows plus 20 new rows, 889 s on four lanes.
No duplicate job IDs were present. A historical mace cell replay exactly reproduced seeds,
verdict, duration and vitality. Evidence: `research/results/2026-09-26-mace-size-expert.json`.

| A size | A score %, pair-bootstrap interval | bar margin | A / B falls per minute | A / B down % |
|---|---|---:|---:|---:|
| 1 (control) | 62.5 [37.5, 81.3] | 0.122 | 0.42 / 1.48 | 1.3 / 7.4 |
| 0.8 | 0.0 [0.0, 0.0] | -0.720 | 13.32 / 0.15 | 54.5 / 0.8 |
| 0.9 | 12.5 [0.0, 25.0] | -0.490 | 9.32 / 0.14 | 40.6 / 0.7 |
| 1.1 | 93.8 [81.3, 100.0] | 0.377 | 0.00 / 6.17 | 0.0 / 28.0 |

The x1 mirror is not exactly 50 % at this sample size. Pairing each size with that control on
shared seeds gives score changes of -62.5 points [-81.3, -37.5] at 0.8, -50.0 [-75.0, -25.0]
at 0.9, and +31.3 [12.5, 43.8] at 1.1. Corresponding margin changes are -0.841 [-0.967, -0.720],
-0.612 [-0.781, -0.441], and +0.256 [0.173, 0.339] bars. Size clearly pays on the stone mace
under this expert. The small body spends much more of the bout down; these data do not isolate
reach, momentum and balance as causes. An all-loss bootstrap interval is not population certainty.
No shipped body/default changes follow automatically.

**Maul.** The continuation finished 64/64 without failures: 34 unique historical rows plus 30 new
rows, 2232 s on four lanes. Its historical replay also matched seeds, verdict, duration and vitality.
Evidence: `research/results/2026-09-26-maul-size-expert.json`.

| A size | A score %, pair-bootstrap interval | bar margin | A / B falls per minute | A / B down % |
|---|---|---:|---:|---:|
| 1 (control) | 50.0 [18.8, 81.3] | -0.016 | 5.42 / 4.61 | 26.2 / 21.5 |
| 0.8 | 18.8 [0.0, 43.8] | -0.195 | 14.61 / 1.51 | 56.8 / 7.6 |
| 0.9 | 6.3 [0.0, 18.8] | -0.237 | 10.12 / 2.28 | 43.2 / 11.0 |
| 1.1 | 87.5 [68.8, 100.0] | 0.237 | 1.43 / 9.49 | 7.6 / 44.2 |

Paired against the size-1 control, scores change by -31.3 points [-62.5, -6.3] at 0.8,
-43.8 [-68.8, -18.8] at 0.9 and +37.5 [12.5, 68.8] at 1.1. Margin changes are
-0.179 [-0.296, -0.071], -0.221 [-0.363, -0.067] and +0.253 [0.097, 0.407] bars.
Thus size pays on the maul as well as the mace. These eight-pair samples do not establish that
0.8 is better than 0.9: both are worse than the control, and the endpoints are not a fitted curve.
The smaller bodies' floor time again accompanies the disadvantage without isolating its cause.

Original worktree data remain untouched; the copies add only an explicit empty flags field to
legacy manifests, with schedule/build/protocol validation intact. No body/default was retuned.

Reproduce the completed mace summary and fall table:

    node research/headroom.mjs --exp attributes --summary --out research/runs/release2-continuation/size-mace-expert
    node research/release2-attr-falls.mjs research/runs/release2-continuation/size-mace-expert

Use `size-maul-expert` in those same commands for the completed maul study.

## 6. Item 17: why survive-cut is void on five human bodies

**Answer.** The drill is not broken on the humans. It has nothing to measure there. The drill admits
a start only if the reference's cut wounds the *idle* subject by 0.03 of its bar. Since arms are
built at guard (2026-09-25), the idle human's rest guard meets the cut first, and the cut does not
wound. So the start is void, correctly: no mind can save a body the cut would not hurt.

The trace says what the cut meets first. Drill runner (`runDrill`, exact forks), the audit's own 40
starts a body against the stone default (`seed("drills", "survive-cut", body, "default", i)`), the
control rung alone with a trace, through `research/release2-survive-cut.mjs`:

| subject | void (wound rule) | cut first met the held item | the arm | the body | nothing | idle wound, median | arm blows landed | their damage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| human-warrior | 39 / 40 | 40 | 0 | 0 | 0 | 0.000 | 1 | 0.13 |
| human-mace | 40 / 40 | 39 | 0 | 0 | 1 | 0.000 | 0 | 0 |
| human-unarmed | 40 / 40 | 0 | 40 | 0 | 0 | 0.002 | 23 | 9.56 |
| human-dual-swords | 40 / 40 | 26 | 14 | 0 | 0 | 0.001 | 29 | 9.52 |
| human-whip | 40 / 40 | 40 | 0 | 0 | 0 | 0.000 | 0 | 0 |
| human-maul | 5 / 40 | 0 | 13 | 27 | 0 | 0.059 | 13 | 4.10 |
| default (stone) | 22 / 40 | 35 | 0 | 5 | 0 | 0.020 | 15 | 4.89 |

- **The shield and the held weapon.** On human-warrior, -mace and -whip, the cut meets the item at
  rest on every start. Where it reaches the core after that, it arrives at 3 to 4 m/s and scores
  nothing.
- **The bare arm.** On human-unarmed, and on 14 dual-swords starts, the forearm takes the cut. The
  arm takes real damage (9.5 over 40 starts), but an arm's weight in the bar is small, so the bar
  loses 0.002. The bar is the drill's measure, and the bar does not see an arm being cut.
- **The maul is the exception.** Its two-handed rest guard is low, so the cut reaches the body on
  27 starts, and the drill plays.
- **The stone default voids 22 of 40 for the same reason.** Its plate at rest stops the cut on the
  middle and low lines (2 of 14 and 2 of 12 admitted); the high line is always admitted.

**The narrow fix: an arrival admission.** `runDrill` takes `admission`: `"wound"` (the default and
the drill's own rule) or `"arrival"`. Arrival admits every start on which the cut touched the
subject during the control -- its body, its arms or what it holds. A start the rest guard stops is
then scored, and the idle rung passes it. The default is unchanged, and arrival is refused on any
drill but survive-cut. `research/drills.mjs --admission arrival` carries it into the manifest.
`a_cut_a_rest_guard_stops_is_void_by_wound_and_scored_by_arrival` in `tests/drills.test.mjs` pins
it on two of the audit's starts: one the warrior's guard stops (void by wound, scored by arrival,
idle passes) and one the cut misses entirely (void either way). Mutation check: admitting every
start turns it red. Counting the subject's own contacts instead of the cut's survives, because no
start in the fixture has the idle subject touching anything; that is a known blind spot.

**The re-take.** Drill runner through the research runner, 40 starts a body against the stone
default, the audit's seeds, arrival admission, the audit's rungs less the two expert variants
(`expert-persist@c8,h1` and `expert@c4,h1`), plus `humanoid-duelist` on the humans. Pass rate, and
the paired difference from idle, points ± 95 %:

| subject | scored | idle | walker | golem duelist | humanoid duelist | expert | expert − idle |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| human-warrior | 40 | 97.5 | 97.5 | 60.0 | 100.0 | 100.0 | +2.5 ± 4.9 |
| human-mace | 39 | 100.0 | 97.4 | 82.1 | 100.0 | 100.0 | 0.0 ± 0.0 |
| human-unarmed | 40 | 100.0 | 75.0 | 62.5 | 77.5 | 95.0 | −5.0 ± 6.8 |
| human-dual-swords | 40 | 100.0 | 97.5 | 67.5 | 97.5 | 100.0 | 0.0 ± 0.0 |
| human-whip | 40 | 100.0 | 95.0 | 87.5 | 100.0 | 100.0 | 0.0 ± 0.0 |
| human-maul | 40 | 12.5 | 10.0 | 52.5 | 22.5 | 72.5 | +60.0 ± 15.4 |
| default (stone) | 40 | 55.0 | 32.5 | 45.0 | -- | 82.5 | +27.5 ± 19.8 |
| default, wound rule (audit) | 18 | 0.0 | 11.1 | 50.0 | -- | 83.3 | +83.3 |

- **On the five humans the rest guard survives the reference cut on 97.5 to 100 % of starts.** The
  expert adds nothing, because there is nothing to add. The golem duelist *loses* 13 to 38 points:
  it moves the guard out of the way.
- **The maul, whose rest guard does not stop the cut, is where the drill works under either rule.**
  Idle passes 12.5 %, and the expert gains 60 points on it.
- **So the human drill headroom has no survive-cut term, and that is a property of the bodies, not
  a gap in the instrument.** The audit's human headroom stands on punish-miss and get-inside, which
  is correct.
- **On the stone default, arrival changes what the drill asks.** Under the wound rule the drill asks
  "can a mind save a body the cut would wound", and the expert gains 83 points over idle on the 18
  starts where the question exists. Under arrival it asks "does a mind survive a cut", and more than
  half of those starts are the rest guard's. So arrival dilutes the gap to 27.5 points and should
  not replace the wound rule as the headroom figure.

**Options for the owner.**

- (a) **Accept, and report "passes at rest" rather than "void".** Keep the wound rule as the drill's
  figure. Where a body voids most starts, add the arrival reading beside it, to show *why*: the rest
  guard survives.
- (b) **A harder reference cut for the humans**: one aimed around the guard (at the far side or
  below the shield). That is a new drill, not a repair, and it is the only way to get a survive-cut
  term on a shielded human.
- (c) **Weigh the arm in the drill's wound**: the unarmed human's arm takes 9.56 of damage over 40
  starts and its bar loses 0.002. That is a question about the bar's weights, which are shipped
  balance, not about the drill.

**Recommended: (a).** It needs nothing but this session's opt-in admission, which is committed with
its test. (c) is a finding for the bar, not for the drill: an unarmed human's arm can be cut to
pieces without the bar noticing.

Compute: the diagnosis, 280 control-only starts in one realm; the re-take, 280
starts on one lane, 13:39 to 14:39 (60 minutes).

## 7. Item 4(a): what the human arm delivers against the stone arm

A table only. `TORQUES` in `src/golem/humanoid/arm.ts` is unchanged.

Harness: the Node impact bench (`tests/harness/impact-bench.mjs`, bench stand, real Havok), shipped
attributes (`x1`). Each module plays its own stroke (the script `runStrokeBench` plays) into a free,
gravity-free sphere hung at the stroke's mark. The sphere's velocity change is read at separation.
Delivered momentum is M·dv and delivered energy is ½·M·dv². The chain's effective mass at the tip
is the bench's tap, at guard, along the edge. The chains are the stone arm (`wrist`), the human arm
(`anatomical`) and the skeleton's (`skeletal`). Sphere of 90 kg, a body's order of mass:

| item | chain | tip peak m/s | closing m/s | contact substeps | momentum N·s | energy J | energy into 20 kg, J | tap effective mass, kg |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| blade | wrist (stone) | 17.6 | 11.4 | 9 | 33.3 | 6.2 | 31.7 | 0.70 |
| blade | anatomical (human) | 11.2 | 7.5 | 2 | 7.7 | 0.3 | 1.5 | 0.68 |
| blade | skeletal | 16.8 | 11.8 | 8 | 44.7 | 11.1 | 62.1 | 0.70 |
| mace | wrist (stone) | 31.8 | 26.7 | 2 | 107.9 | 64.7 | 215.6 | 1.98 |
| mace | anatomical (human) | 9.2 | 5.1 | 2 | 10.8 | 0.7 | 4.7 | 1.08 |
| mace | skeletal | 20.8 | 16.2 | 2 | 63.4 | 22.3 | 74.3 | 1.98 |
| fist | wrist (stone) | 8.3 | 5.4 | 30 | 245.9 | 335.8 | 335.6 | 2.07 |
| fist | anatomical (human) | 3.1 | 2.4 | 12 | 28.4 | 4.5 | 12.3 | 1.61 |
| fist | skeletal | 5.1 | 2.4 | 24 | 285.1 | 451.4 | 341.4 | 1.41 |

- **The human arm delivers a quarter to a tenth of the stone arm's momentum, and a twentieth to a
  ninetieth of its energy.** Blade: 0.23 of the momentum and 0.05 of the energy. Mace: 0.10 and
  0.011. Fist: 0.12 and 0.013.
- **On the blade the deficit is speed, not mass.** The effective mass at the tip is the same, 0.68
  against 0.70 kg. The human blade closes at 7.5 m/s against 11.4, and its contact lasts 2 substeps
  against 9. The stone arm drives through the contact; the human's glances off.
- **The human mace is a lighter item** (the striking body is 1.80 kg against 2.92), and closes at
  5.1 m/s against 26.7. That is most of the 90 to 1 in energy.
- **The fist rows are shoves, not blows.** Their contacts last 12 to 30 substeps, and the energy
  delivered grows with the sphere's mass. That is the arm pushing through the contact, not an
  impact. Read them as a push, not a strike.
- The audit's commitment-bench tip peak (12.6 m/s human against 31.5 stone) is the same gap, read on
  a different instrument.

**Rate, torque and velocity-clamp sensitivity now measured.** A 36-cell continuation
holds geometry, mass and the 8 rad/s clamp fixed, varies the existing `armSpeed` attribute
(0.5, 1, 1.5), and independently scales motor ceilings (0.5, 1, 2, 4) in both impact-bench passes.
At normal rate, doubling torque barely changes blade/mace free-stroke peak speed (11.22 to
11.18 / 9.16 to 9.03 m/s). Raising rate alone to 1.5 raises them to 12.84 / 13.42 m/s.
This argues against a torque-only speed repair on this stroke, not for a shipped rate increase.
Raising the velocity clamp from 8 to 16/32 rad/s leaves blade and fist unchanged at normal
rate/torque and changes mace peak by less than 0.00005 m/s. Higher-rate strokes also respond to
torque; the settled-stroke result does not itself justify shipping a rate change.
See `2026-09-26-human-arm-limits.md` for the table, invalid impact placements and limits.

**Options for the owner** (the audit's, with this table): (a) raise the human arm's delivery, with
a before/after table on these rows. This is the "before" half. First find which of `TORQUES`, the
8 rad/s clamp and `RATES` binds. (b) Accept the human as the slow family.

**Recommended: (a) only after the binding limit is found**, and with the house rule's table; this
session measured and changed nothing. Compute: one realm, under 5 minutes.

## Compute

One machine, up to 10 lanes of this work beside another agent's 6. Wall clock is 2026-09-26.

| item | runs | lane-hours, about |
| --- | --- | ---: |
| 6, waist | 13,312 bouts on 9 lanes (11:05 to 14:37), 300 maul bouts on 1 lane, the benches | 33 |
| 5(b), strokes | 1,120 bouts on 1 lane (11:22 to 13:25) | 2.1 |
| 17, survive-cut | 280 diagnosis starts, 280 re-take starts on 1 lane (13:39 to 14:39) | 1.3 |
| 2(b), family | 768 naive bouts on 2 lanes, 16 whip expert bouts on 3, fists expert unfinished | 6.5 |
| 13(a), attributes | 80 expert and 640 naive bouts | 9 |
| 16, size | two expert runs, unfinished | 10 |
| 4(a), impact | the impact bench, one realm | 0.1 |

## Process notes

- **`research/headroom.mjs` takes no run lock.** `lockRun` in `research/runner.mjs` exists, but
  this entry point does not call it. Two runners can therefore write to one run directory at once.
  - That happened twice here: this session started a queued cell early on free lanes, and the
    queue later reached the same cell (`family-fists-expert` from about 17:00, `size-maul-expert`
    at 17:18).
  - An attempt to stop the duplicate runner was refused by the permission system, and nothing was
    done around it. Both runners were stopped at the wind-down, on the coordinator's instruction.
  - Before either directory is summarised or resumed, check `results.jsonl` for duplicate ids.
- **The drill admission's mutation check has a blind spot.** See section 6: no fixture start has
  the idle subject touching anything, so counting the wrong side's contacts is not caught.
