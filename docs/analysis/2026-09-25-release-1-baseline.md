# Body release 1: the baseline

This is skill ceiling 01's Measure section (`docs/plans/2026-09-25-skill-ceiling-01-body-release-1.md`). It records:

- the body fingerprint before and after;
- the probe-mind control row;
- the idle-dummy matrix.

Release 1 is main at cb1bd38. It carries:

- physics and control at 120 Hz, with `solverTuningHz` 240;
- contacts read on arrival;
- the size law, with force s² and torque s³, over a size range of x0.8 to x1.1;
- the staged rise;
- arms built at guard;
- the side-mirror gate.

"Before" is b828288, the last commit before the release's code landed. It has 240 Hz physics and
control, contacts read once settled, the old size law, and no staged rise. Between the two there
are 47 commits.

The instruments were committed on top of cb1bd38, and every bout figure here comes from that tree:

- ebd8fc3 adds the readable body readout;
- cd800eb adds the traced research bouts and the baseline reader.

Neither commit touches a body. The test that pins this is
`a traced bout is the bout untraced, and its trajectory is the side mirror's` in
`tests/research-physical.test.mjs`. So the bodies measured are release 1's.

The bout figures below are the release's baseline. They are **not** compared with the figures
before it as a regression, because every body moved and so did the rules the bouts are scored by.

## 1. The body fingerprint

**Harness.** The body fingerprint in `tests/harness/body-fingerprint.mjs`:

- Node;
- `NullEngine` with real Havok;
- 55 sections: effector and torso benches, walks, heads and short bouts.

Each tree was run in its own worktree. The raw digests are in `research/runs/sc01-baseline/`, which
is gitignored:

- `fp-before-b828288.json`;
- `fp-after-cb1bd38.json`.

**All 55 of 55 sections moved.** This is expected, and it says nothing more than that. A change of
physics rate changes every solver step, so every digest of motion moves with it. A digest can say
*that* a body moved, but not *what* moved.

### The readable readout

`research/body-readout.mjs` (ebd8fc3) exists to say what moved.

**Harness.** Node body readout:

- `createBout` with supported locomotion, `NullEngine` and real Havok;
- idle against the default, seeds 1 and 2;
- read one frame in.

For each of the 23 bodies it reads:

- solver mass by part class, and the fall line;
- the published view: reach, crown height, collision radius, mass, arm rate and soak;
- the carrier's ceilings;
- each module's envelope: axis ranges and rates, reach, swing inertia, and drive scales.

The 23 bodies are every playable build at x1, the default at size x0.8 and x1.1, and the giant
(every live attribute row at its maximum). The readout also reads the attribute rows,
`SIZE_LAW_POWER` and the world's rates.

The readout imports only relatively, so it ran unchanged on b828288, copied into that commit's
worktree. The two readouts and their diff (`--against`) are also in `research/runs/sc01-baseline/`:

- `readout-before-b828288.json`;
- `readout-after-cb1bd38.json`;
- `readout-diff.txt`.

**152 leaves differ. At x1, apart from the fall line, no build-time number of any body moved.** The
differences group as follows.

| What | Before | After |
| --- | --- | --- |
| `CONFIG.world` physics / control | 240 / 240 Hz | 120 / 120 Hz |
| `CONFIG.combat.contactReading` | settled | arrival |
| `SIZE_LAW_POWER` force / torque | s³ / s⁴ | s² / s³ |
| `SIZE_LAW_POWER` frequency / duration / angular acceleration | s^-0.5 / s^0.5 / s^-1 | s^-1 / s^1 / s^-2 |
| `SIZE_LAW_POWER` speed / acceleration | s^0.5 / -- | s^0 / s^-1 |
| `SIZE_LAW_POWER` fall clock (new) | -- | duration s^0.5, speed s^0.5, impulse s^3.5 (replacing `impulse`) |
| Size attribute maximum | x1.25 | x1.1 |

**Size x0.8.** The drive clock now runs at s^-1 instead of s^-0.5, so every rate rises by 1.118:

- carrier speeds, head, torso and wrist rates, and arm rate: 11.71 -> 13.09;
- carrier accelerations and yaw acceleration: x1.25;
- wrist torque scale: 0.4096 -> 0.512 (s³ against s⁴).

**Size x1.1.** The same law, the other way:

- rates x0.9535;
- carrier speed 3.36 -> 3.20 m/s;
- wrist torque scale 1.464 -> 1.331.

**The giant** (all-max) is a smaller body, because the size ceiling came down from x1.25 to x1.1:

| Reading | Before | After |
| --- | --- | --- |
| Crown height | 2.625 m | 2.31 m |
| Mass | 949.0 kg | 648.0 kg |
| Reach | 2.10 m | 1.94 m |
| Carrier top speed | 5.37 m/s | 4.80 m/s |
| Blade swing inertia | 11.31 | 7.12 |
| Wrist torque scale | 4.88 | 2.66 |
| Arm rate | 18.08 | 17.01 |

**The fall line** (`fallAtNs`, `censusOf` in `tests/harness/mass-census.mjs`) is the geometry of the
first frame times the supported mass, so it reads where the arms and legs hang. Two changes move it:

- 548d0c5 builds the arms at guard;
- cae7a55 hangs the skeleton's legs under its centre of mass.

It moved for every body:

| Bodies | Change |
| --- | --- |
| Stone builds | about +2 to +5 % (default 113.8 -> 117.1 N s; wheel -4.5 %, whip -1.0 %) |
| Human builds | +10 to +20 % (the human warrior 36.3 -> 43.6) |
| Skeleton builds | the warrior 4.73 -> 10.39; the dual blades 7.03 -> 9.43 |
| Skeleton mace and maul | from 0 (a body standing with its centre of mass on the edge of its base) to 8.16 and 4.32 |

**Research fingerprints** (`research/fingerprint.mjs`, the source hash a run's manifest carries):

| Tree | Hash |
| --- | --- |
| b828288 | 68b90a8af34a |
| cd800eb, with the instruments | 0c9caa7b3361 |

## 2. The probe-mind control row

**Command.**

```
node research/stat-sweep.mjs --stat size --levels 1 --pairs 192 --trace --workers 8
```

**Harness.** Node research runner:

- `research/runner.mjs` over `tests/harness/bout-runner.mjs`;
- supported locomotion, a fresh Havok per bout;
- the research `PROTOCOL`, cap 150 s;
- the default build against the default build.

**The run.**

- The four probe minds: golem-champion, golem-miser, golem-brawler and golem-duelist.
- 192 blocks, each played from both sides: 384 bouts.
- Seed 20260923; research fingerprint 0c9caa7b3361.
- Every bout is traced (`trajectoryTracer` in `research/side-mirror.mjs`).
- Read with `node research/release-baseline.mjs --control ...`.

**372 distinct trajectories in 384 bouts.** The repeats are in two places:

- the brawler mirror, 14 distinct of 24;
- the miser mirror, 22 of 24.

Every mixed pairing played 48 distinct bouts of 48.

**The endings.**

- Every bout ended on exhaustion, and none reached the cap.
- Median bout 17.3 s; 90th percentile 47.5 s; longest 92.7 s.
- 9 of 384 were drawn.

The clustered interval takes the ten unordered mind pairings as clusters and puts a t interval on
their means, with 9 degrees of freedom. The naive interval is taken over bouts.

| Figure (release 1, x1 against x1) | Naive 95 % (384 bouts) | Clustered 95 % (10 pairings) |
| --- | ---: | ---: |
| The modified corner's win share, % (a null: both corners are x1) | 46.7 +- 4.9 | 45.6 +- 5.9 |
| Damage dealt to a body, a bout | 7.24 +- 0.19 | 7.21 +- 0.83 |
| Falls, a body a bout | 0.56 +- 0.11 | 0.67 +- 0.86 |
| Falls, a body a minute | 1.30 +- 0.18 | 1.37 +- 0.82 |
| Bout length, s | 22.9 +- 1.9 | 24.4 +- 13.3 |
| Decided, % | 97.7 +- 1.5 | 96.3 +- 8.5 |
| Past the 60 s overtime mark, % | 7.8 +- 2.7 | 10.6 +- 17.5 |

**The win share is a null, and it reads as one.** The sweep's "modified" corner keeps its mind and
its seed across a block's side swap, and here it is the same x1 default body as the other corner.
Both intervals include 50.

**The clustered intervals are several times wider than the naive ones for falls, bout length and
the overtime share.** The pairings differ in kind, not in noise: one pairing, the brawler mirror,
holds most of the falls and most of the long bouts.

By unordered pairing:

- "First's score" is the first-named mind's win share, with a draw counted as a half.
- In a mirror, the figure is the modified corner's share, which is a null.

| Pairing | Bouts | Distinct | First's score % | Damage / body | Falls / body | Mean s | Median s | Decided % |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| brawler ~ brawler | 24 | 14 | 50.0 | 6.53 | 4.02 | 70.8 | 77.1 | 100.0 |
| brawler ~ champion | 48 | 48 | 47.9 | 8.74 | 0.59 | 20.2 | 19.9 | 100.0 |
| brawler ~ duelist | 48 | 48 | 58.3 | 8.40 | 0.56 | 24.5 | 20.2 | 100.0 |
| brawler ~ miser | 48 | 48 | 4.2 | 5.24 | 0.70 | 37.7 | 34.1 | 100.0 |
| champion ~ champion | 24 | 24 | 25.0 | 7.12 | 0.04 | 21.9 | 26.3 | 100.0 |
| champion ~ duelist | 48 | 48 | 81.3 | 7.71 | 0.03 | 17.1 | 18.9 | 100.0 |
| champion ~ miser | 48 | 48 | 20.8 | 6.77 | 0.17 | 10.3 | 7.8 | 100.0 |
| duelist ~ duelist | 24 | 24 | 45.8 | 8.66 | 0.08 | 23.8 | 19.4 | 100.0 |
| duelist ~ miser | 48 | 48 | 16.7 | 6.86 | 0.21 | 11.8 | 9.6 | 100.0 |
| miser ~ miser | 24 | 22 | 43.8 | 6.10 | 0.27 | 6.0 | 6.1 | 62.5 |

Each mind's share over its 144 bouts against the other three (same run, a draw a half):

| Mind | Share |
| --- | ---: |
| golem-miser | 86.1 % |
| golem-champion | 51.4 % |
| golem-brawler | 36.8 % |
| golem-duelist | 25.7 % |

**On release 1 the miser leads the probe set by a wide margin**, and it beats every other mind at
least 79 % of the time. The duelist, the top rung of the naive ladder, is last.

**The champion mirror** gives its modified corner 6 of 24 (25.0 %). A single mirror's band at
n = 24 is +-20 points, so this sits just outside it. It is one pairing of ten, and the pooled null
above includes 50.

**The brawler mirror** is the long, falling pairing:

- 4.02 falls a body a bout;
- a median bout of 77.1 s, so most of its bouts run past the overtime mark;
- only 14 distinct bouts of its 24.

**The miser mirror** is short (6.0 s) and is drawn in 9 of its 24 bouts.

## 3. The idle-dummy matrix

This matrix is recorded, not gated. Session 05 gates it with the expert.

**What is measured.** Every attacker plays against an idle dummy of every family.

- An outright win is one before `CONFIG.bout.overtimeSeconds`, which is 60 s.
- Past that point the clock drains both bars at one rate, so a win after 60 s is the drain's rather
  than the attacker's.
- A block is one seed pair, played once from each side.

**Harness.** Node research runner:

- `research/runner.mjs` over `research/census-worker.mjs`;
- supported locomotion, a fresh Havok per bout;
- the research `PROTOCOL`, cap 150 s;
- seed 20260923;
- research fingerprint 0c9caa7b3361, with every bout traced.

**The mind.** Every attacker is played by its family's naive mind, `FAMILY_POLICY` in
`src/golem/family.ts` (`--naive`):

| Family | Mind |
| --- | --- |
| Stone, including the giant | golem-duelist, the top rung of the naive ladder |
| Skeleton | skeleton-duelist |
| Human | humanoid-duelist |

**This is a change for the stone and giant rows.** They used to rotate through the four probe minds.
It is not a change for the skeleton and human rows, so the seven cells carried in from physical
contact are read as they always were.

### The four canonical bodies

The four bodies are:

- stone, the default;
- skeleton, the skeleton warrior;
- human, the human warrior;
- giant, the default with every live attribute row at its maximum.

**Command.**

```
node research/idle-dummy.mjs --attackers stone,skeleton,human,giant --naive --trace --blocks 12 --workers 8
```

**The run.** 12 blocks a cell, so 24 bouts a cell and 384 bouts in all. **Every cell played 24
distinct trajectories of 24.**

Each cell reads:

- outright win share, with the share including drained wins in brackets;
- the median time of an outright win.

| Attacker \ idle dummy | stone | skeleton | human | giant |
| --- | ---: | ---: | ---: | ---: |
| stone (golem-duelist) | 100 % (100) / 21.1 s | 100 % (100) / 14.4 s | 96 % (100) / 37.7 s | 79 % (100) / 41.2 s |
| skeleton (skeleton-duelist) | **0 %** (100) / -- | 29 % (100) / 54.4 s | **0 %** (100) / -- | **0 %** (100) / -- |
| human (humanoid-duelist) | **0 %** (4) / -- | **0 %** (13) / -- | **0 %** (0) / -- | **0 %** (67) / -- |
| giant (golem-duelist) | 100 % (100) / 18.3 s | 100 % (100) / 14.3 s | 100 % (100) / 25.8 s | 75 % (100) / 40.4 s |

No bout in the matrix reached the cap.

**The seven cells carried in are all still at zero outright wins, and no other cell is:**

- the skeleton against stone, human and giant;
- the human against every body.

What the attacker did in each cell (same run, a mean over its 24 bouts):

| Attacker > dummy | Damage dealt | Attacker's falls | Dummy's falls |
| --- | ---: | ---: | ---: |
| stone > stone / skeleton / human / giant | 8.80 / 2.87 / 10.16 / 19.78 | 0.00 / 0.00 / 0.04 / 3.88 | 0.04 / 3.83 / 3.17 / 0.04 |
| skeleton > stone / skeleton / human / giant | 4.76 / 2.59 / 3.03 / 6.01 | 19.79 / 3.96 / 18.50 / 22.96 | 0.04 / 4.13 / 0.00 / 0.04 |
| human > stone / skeleton / human / giant | 0.00 / 0.00 / 0.00 / 0.05 | 0.00 / 0.00 / 0.00 / 0.63 | 0.00 / 1.67 / 0.00 / 0.00 |
| giant > stone / skeleton / human / giant | 10.91 / 2.95 / 10.02 / 20.85 | 0.08 / 0.08 / 0.17 / 0.04 | 2.67 / 3.75 / 6.83 / 0.29 |

**The two families at zero are at zero for different reasons.**

- **The skeleton lands blows but spends the bout on the floor.** Against any dummy but its own
  family it falls 18 to 23 times a bout. It deals 3 to 6 damage and wins every bout, but only on the
  drain, at a median of 93 to 103 s. Against another skeleton it falls four times, and wins
  outright in 7 of its 24 bouts.
- **The human lands nothing.** Its humanoid-duelist deals no damage at all to a stone, skeleton or
  human dummy in any of its 72 bouts, and 0.05 in total against the giant.
  - Every one of its bouts runs to the drain.
  - Its drained wins came where nobody had damaged anybody, or after a scratch: 16 of 24 against the
    giant, 3 against the skeleton and 1 against stone. The other stone and human bouts were drawn.
  - Its 21 losses to an idle skeleton are the drain's arithmetic between two body plans, because
    neither side dealt any damage in that cell.

**The stone and giant rows** now win every bout, and outright in 75 to 100 % of them. The last
matrix, at 567350a, had these rows under the four probe minds and at 240 Hz. So this row's rise
belongs to the new mind and the new release together, and is not read as a change of either.

### The other seventeen playable builds

The remaining builds are every other entry of `PLAYABLE_BUILDS` in `src/golem/roster.ts`:

- the eleven named stone builds;
- three human builds;
- three skeleton builds.

Each is played by its family's naive mind against the same four dummies.

**Command.**

```
node research/idle-dummy.mjs --attackers <the 17> --naive --trace --blocks 4 --workers 8
```

`--attackers roster` would list all 21 bodies.

**The run.** 4 blocks a cell, so 8 bouts a cell and 544 bouts in all; the harness and seed are as
above.

- **Every cell played 8 distinct trajectories of 8.**
- **No bout reached the cap.**

The question is whether a win is reachable, so a cell of 8 is enough to show that it is. A zero in
8 bouts is weaker evidence than a zero in 24.

Each cell reads:

- outright win share, with the share including drained wins in brackets;
- the median time of an outright win.

| Attacker (mind) \ idle dummy | stone | skeleton | human | giant |
| --- | ---: | ---: | ---: | ---: |
| two-blades (golem-duelist) | 100 % (100) / 18.6 s | 100 % (100) / 15.4 s | 100 % (100) / 33.8 s | 100 % (100) / 44.4 s |
| mace (golem-duelist) | 88 % (100) / 40.2 s | 100 % (100) / 20.7 s | **0 %** (100) / -- | 13 % (100) / 59.4 s |
| maul (golem-duelist) | **0 %** (100) / -- | **0 %** (75) / -- | **0 %** (100) / -- | **0 %** (100) / -- |
| whip (golem-duelist) | **0 %** (100) / -- | **0 %** (100) / -- | **0 %** (100) / -- | **0 %** (100) / -- |
| fists (golem-duelist) | **0 %** (100) / -- | **0 %** (75) / -- | **0 %** (25) / -- | **0 %** (100) / -- |
| ram-capped (golem-duelist) | **0 %** (63) / -- | **0 %** (0) / -- | **0 %** (25) / -- | **0 %** (100) / -- |
| ram-blade (golem-duelist) | 100 % (100) / 27.6 s | 100 % (100) / 14.5 s | 100 % (100) / 39.6 s | 88 % (100) / 50.0 s |
| wheel (golem-duelist) | 100 % (100) / 23.2 s | 100 % (100) / 22.7 s | 100 % (100) / 34.4 s | 100 % (100) / 42.5 s |
| multileg (golem-duelist) | 100 % (100) / 12.9 s | 100 % (100) / 13.6 s | 100 % (100) / 41.6 s | 100 % (100) / 23.6 s |
| plated (golem-duelist) | 100 % (100) / 17.5 s | 100 % (100) / 21.1 s | 100 % (100) / 32.8 s | 100 % (100) / 43.6 s |
| pitch-blade (golem-duelist) | 88 % (100) / 36.5 s | 13 % (100) / 52.5 s | **0 %** (100) / -- | 50 % (100) / 58.5 s |
| human-dual-swords (humanoid-duelist) | **0 %** (0) / -- | **0 %** (0) / -- | **0 %** (0) / -- | **0 %** (25) / -- |
| human-unarmed (humanoid-duelist) | **0 %** (0) / -- | **0 %** (0) / -- | **0 %** (0) / -- | **0 %** (0) / -- |
| human-maul (humanoid-duelist) | **0 %** (13) / -- | **0 %** (0) / -- | **0 %** (0) / -- | **0 %** (75) / -- |
| skeleton-mace (skeleton-duelist) | **0 %** (100) / -- | 75 % (100) / 36.1 s | **0 %** (100) / -- | **0 %** (100) / -- |
| skeleton-dual-blades (skeleton-duelist) | **0 %** (100) / -- | 38 % (100) / 53.9 s | **0 %** (100) / -- | **0 %** (100) / -- |
| skeleton-maul (skeleton-duelist) | **0 %** (100) / -- | **0 %** (100) / -- | **0 %** (100) / -- | **0 %** (100) / -- |

**40 of these 68 cells are at zero outright wins.** With the seven canonical cells, that makes 47 of
84.

They fall into three groups.

**Stone builds whose weapon is not a blade the duelist can finish with.**

- The maul, the whip, the fists and the capped ram win nothing outright against any dummy: 16 cells.
- The mace wins nothing against the human, and the pitch blade wins nothing against the human either.

Every stone build that carries a sword wins outright against every dummy, with one exception: the
pitch blade. Those builds are two-blades, ram-blade, wheel, multileg, plated and the default.

What the losing builds did (mean damage dealt a bout, against stone / skeleton / human / giant; same
run):

| Build | Damage dealt | Notes |
| --- | --- | --- |
| maul | 5.22 / 0.50 / 0.83 / 11.77 | |
| whip | 2.05 / 0.78 / 0.71 / 1.81 | |
| fists | 4.47 / 2.33 / 1.61 / 4.00 | falls 16.0 times a bout against the giant |
| ram-capped | 0.15 / 0.02 / 0.53 / 0.40 | falls 17.6 times a bout against the giant |
| any sword build | about 10.5 / 2.9 / 10 / 20 | |

The duelist is the naive ladder's top rung, and it is a sword mind. These rows say that on release 1
nothing naive finishes with a blunt weapon, a lash or a ram. They do not say that the bodies cannot.

**Every human build.** All 12 cells are at zero, and the humans deal at most 0.54 damage a bout in
any of them:

- the dual swords deal 0.00 to 0.04;
- the maul deals 0.00 to 0.54;
- the unarmed human deals 0.00 to 0.03, and falls 10.3 and 17.5 times a bout against stone and the
  giant.

This is the human warrior's picture from the canonical matrix: humanoid-duelist lands nothing on an
idle body.

**Every skeleton build against stone, human and giant.**

- The mace and the dual blades win outright only against the skeleton: 6 and 3 of 8.
- The skeleton maul never wins outright.
- All three fall 14 to 27 times a bout against stone, human and giant, as the skeleton warrior does.

## Where the runs are

All runs are under `research/runs/sc01-baseline/`, which is gitignored. The readings are reproduced
with:

```
node research/release-baseline.mjs --control <dir>
node research/release-baseline.mjs --idle <dir>
```

| Directory | What | Bouts |
| --- | --- | ---: |
| `control/` | The control row | 384 |
| `idle-canonical/` | The four canonical bodies | 384 |
| `idle-roster/` | The seventeen other playable builds | 544 |

**A note for the eye gate.** The plan's eye gate asks for "a size x0.8 against a size x1.25". The
size ceiling on this release is x1.1 (`attributes.size.max`, in the readout diff), so the largest
size a body can take is x1.1.
