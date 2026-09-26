# The command surface

2026-09-26. Skill ceiling session 06, the command-surface half
(`docs/plans/2026-09-25-skill-ceiling-06-commander-and-command-surface.md`), on main at 44b016d1
plus this session's commits, with main's 4a33b10a merged in before the last. Every figure is Node
and headless, and each one names its harness:

- **"Bout runner"**: `research/headroom.mjs --exp channel` or `research/command-null.mjs` through the
  research runner (`runJobs`, one Havok arena per worker realm, 6 lanes), on the Node bout runner
  (`tests/harness/bout-runner.mjs`) under the research `PROTOCOL` (150 s cap, supported
  locomotion). Every channel cell is played as swapped seed pairs, and its figures are over whole
  pairs with a bootstrap interval over pairs.
- **"Locomotion bench"**: `research/stance-bench.mjs` and `research/step-bench.mjs`, one or two
  bodies in the Node headless arena (`tests/harness/golem-headless-arena.mjs`), read off the
  locomotion port and the limb meshes.
- **"Fork harness"**: `tests/expert-channels.test.mjs`, the expert's predicted end states against
  the live world (`tests/harness/fork.mjs`).

The tables are printed by `node research/command-surface-report.mjs`; the runs are under
`research/runs/headroom-channel-*` and `research/runs/command-null-*`.

## Summary

**Work in progress.** The session was wound down before the stance run finished; see section 7.

- **The surface is built.** It has `BodyCommand`, channels declared per module from shared kinds,
  and an `Intent` adapter. Two new footwork channels sit behind flags: the stance (width, lead foot
  and weight) and a step target with a timing. Each names its actuator and has a bench.
- **The null control holds.** With the channels off, and with them on but unwritten, 45 of 45
  bouts are bit-identical to the base by trajectory hash. That holds in all nine runs, including
  the one taken after main was merged.
- **The step channel does not raise headroom** (32 pairs, Node bout runner). First, `-step` lost to
  the ruler: 12.5 % on the stone, over 8 pairs. Diagnostic runs traced that loss to the proposal
  list, not to the channel. `-stepadd` keeps the ruler's list and adds the channel. It scored 40.6 %
  [28.1, 53.1] on the stone and 43.8 % [32.8, 54.7] on the skeleton.
- **The stance is not yet decided.** It is partial at 23 and 21 of 32 pairs: 41.3 % [26.1, 56.5]
  on the stone and 54.8 % [38.1, 71.4] on the skeleton.
- **Both flags stay off by default.**

## 1. What was built

**`BodyCommand`** (`src/body-command.ts`) is what a mind hands a body now. `Intent` is kept as an
input through one adapter, `intentToCommand`, applied once at the driver, so the duelist, the miser,
the needle and every other hand-written mind run unchanged as benchmarks. A command mind
(`CommandMind` in `src/mind.ts`) hands the body a command directly; the reference expert is one.

| channel kind | features | declared by | actuator (what carries it) | bench |
|---|---|---|---|---|
| effector | aim; orientation where the chain takes one | every effector socket with a chain | the chain's joint servos, toward the aim through its rate limit and at its torque ceilings | `tests/golem-bench.test.mjs` (unchanged) |
| trunk | lean, twist | the torso | the waist's lean and twist servos | unchanged |
| trunk | crouch | a biped's locomotion | the legs' hip, knee and ankle flexion, inside the height range | unchanged |
| stepping gait / rolling base | travel, turn | biped, multileg / wheel | the virtual carrier, inside its speed and yaw ceilings | unchanged |
| stepping gait / rolling base | **step** (flag `step`) | biped, multileg, wheel | the same carrier, sent toward the point at the speed that arrives on time, capped at its ceilings (`src/step-target.ts`) | `research/step-bench.mjs`, section 2 |
| stepping gait | **stance** (flag `stance`) | the biped (stone, human, skeleton tables) | the hip abduction and flexion, knee and ankle servos, placing each foot inside its joint stops (`bipedStanceFeet`) | `research/stance-bench.mjs`, section 2 |
| natural striker | thrust, guard (guard only without a striker) | the head | the neck servos: the ram's lunge and the guard tuck | unchanged |

- **Channels are declared per module from the shared kinds** (`ChannelDeclaration`, `declare`) and
  published once on `view.self.capabilities.channels`. A capped socket declares nothing. A planner
  reads the list, not a module id: the multileg and the wheel declare no stance, and a command's
  stance is ignored on them.
- **The authority rule.** Every feature names its actuator in its declaration, and nothing sets a
  pose. The stance moves feet with the motors inside their stops; the step asks the carrier for a
  velocity inside the ceilings a person's keys are inside.
- **Behind flags.** `CHANNEL_FLAGS` (`stance`, `step`), both off by default. With a flag off the
  feature is not declared and the body does not read it, whatever a command says.
- **Effectors are not yet in world task space.** The effector channel carries the chain's envelope
  coordinates (the old `HandIntent`: two cursor axes, reach, roll, bend), not a world target point,
  a speed and a stiffness. The expert and the ladder convert a world mark into those coordinates in
  the mind (`aimAt`, `pointAt`), every substep. Moving that conversion into the body would add no
  reach; a speed or stiffness level would, and it is left open (section 6).

## 2. The benches

### Stance

Locomotion bench (`research/stance-bench.mjs`), stone default, the stance held 1.5 s standing:
soles apart and staggered, m; the weakest fall impulse ahead / behind / left / right, N s; then
planted-sole slip at 0.35 and at full forward, mm/s, 1.5 s each. No cell went down. The same table
is the doc comment of `stanceWidth` in `src/golem/config.ts`.

| stance | apart | stagger | ahead | behind | left | right | slip 0.35 | slip 1 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| neutral | 0.380 | 0.000 | 167 | 115 | 238 | 247 | 628 | 374 |
| width +1 | 0.541 | 0.000 | 167 | 115 | 309 | 319 | 639 | 359 |
| width -1 | 0.219 | 0.000 | 167 | 115 | 169 | 179 | 639 | 361 |
| lead +1 | 0.380 | 0.299 | 232 | 186 | 239 | 238 | 657 | 433 |
| weight +1 (forward) | 0.380 | 0.000 | 110 | 172 | 238 | 248 | 812 | 425 |
| weight -1 (back) | 0.380 | 0.000 | 225 | 59 | 238 | 248 | 618 | 284 |

Every axis buys the direction it should and pays in the opposite one. The skeleton reads the same
shapes at a tenth of the impulse (weakest 10 N s neutral). The body follows it: the stance is solved
as foot placement with both legs at one hip height, the sole level along and across it, and every
joint inside its range (`tests/stance-channel.test.mjs`, on the stone, human and skeleton tables).

### Step target

Locomotion bench (`research/step-bench.mjs`), 1 s settle, then 3 s with the point; 0.6 and 1.5 m
at bearings 0, 90, 180 and -45 degrees, within 0.5 and 1.0 s. `keys` is the naive mind the channel
replaces: the unit vector to the point on forward and strafe until it is inside 50 mm.

| build | dist m | within s | step arrives s | step overshoot / miss mm | keys arrives s | keys overshoot / miss mm |
|---|---:|---:|---:|---|---:|---|
| default | 0.6 | 0.5 | 0.51 | 0 / 1 | 0.36 to 0.41 | 144 to 503 / 7 to 49 |
| default | 0.6 | 1.0 | 0.95 | 0 / 1 | (as above) | |
| default | 1.5 | 0.5 | 0.77 to 0.93 | 0 / 0 to 1 | 0.63 to 0.88 | 147 to 527 / 15 to 49 |
| default | 1.5 | 1.0 | 1.02 | 0 / 1 | (as above) | |
| skeleton-warrior | all | | as default | 0 / 0 to 1 | as default | 144 to 527 / 7 to 49 |
| wheel | 0.6 | 0.5, 1.0 | 0.48, 0.95 | 0 / 0 | 0.29 to 0.36 | 81 to 307 / 12 to 34 |
| wheel | 1.5 | 0.5, 1.0 | 0.64 to 0.85, 0.99 | 0 / 0 | 0.56 to 0.84 | 68 to 313 / 21 to 35 |
| multileg | 0.6 | 0.5 | 0.56 to 0.78 | 0 / 1 | 0.51 to 0.77 | 0 to 100 / 0 to 42 |
| multileg | 1.5 | either | 1.19 to 1.90 | 0 / 1 | 1.15 to 1.90 | 0 to 98 / 0 to 49 |

- A step inside the carrier's ceilings arrives within 0.05 s of its time. One outside them (1.5 m
  in 0.5 s, or anything far on the multileg's 1.4 m/s) arrives as soon as the ceiling allows, a few
  hundredths after the keys.
- It stops on the point. The keys overshoot by up to half a metre.
- Sole slip is lower on the step than on the keys in every cell but one (multileg, 1.5 m behind:
  455 against 453 mm/s). No cell fell.
- The executor divides each local axis by its own ceiling, so the velocity points at the target
  through the carrier's elliptical gait (the trap `AGENTS.md` records from the dungeon).
- The first version closed the last stretch exponentially (`distance / 0.25 s`) and arrived 0.14 to
  0.34 s late on every reachable cell; the braking profile replaced it.

## 3. The null control

Bout runner, `research/command-null.mjs`: 45 bouts over seven benchmark minds, five builds, the
ruler expert against the duelist on the stone default and the skeleton, and the duelist against the
persistence expert (20 s cap on the expert bouts). Each row's trajectory hash (every limb's
position, health and both bars, from the bytes of their doubles, every sixth frame and at the end:
`trajectoryTracer` in `research/side-mirror.mjs`), behaviour record, verdict, clock, both bars and,
for an expert, its decision labels were compared with the base run on 44b016d1.

| run | flags | identical to the base |
|---|---|---:|
| the seam (abc02af5) | none | 45 of 45 |
| the stance channel (d33126ad) | none | 45 of 45 |
| the stance channel (d33126ad) | stance | 45 of 45 |
| the step channel (1eb830ec) | none | 45 of 45 |
| the step channel (1eb830ec) | stance, step | 45 of 45 |
| the expert's channel proposals (336656c2) | none | 45 of 45 |
| the expert's channel proposals (336656c2) | stance, step | 45 of 45 |
| main merged, the diagnostics (781252fe) | none | 45 of 45 |
| main merged, the diagnostics (781252fe) | stance, step | 45 of 45 |

So with every channel off, and with every channel on and no mind writing it, a bout is the bout it
was, bit for bit, and the ruler is session 05's ruler. Each run took about two minutes on 6 lanes
(the last two about seven, on 2 lanes beside a channel run). The base is 44b016d1 rather than main's
4a33b10a: what main added since touches `src/dungeon/` and two comments in `src/golem/roster.ts` and
`src/golem/skeleton/presets.ts`, none of which an arena bout runs, and the merged rows match it.

## 4. The channel experiments

**The design.** Bout runner, `research/headroom.mjs --exp channel`, on session 05's footwork body
(the stone default) and the body with the most headroom there (`skeleton-warrior`, 1.72 bars).
Both corners are the same body, built with the channel's flag on, so the neutral side is the body
the null control measured.

- **head to head** (the verdict): the channel expert `expert-<channel>@c8,h1` against the ruler
  `expert@c8,h1`, which holds the channel at neutral. Session 05 found footwork pays only here: the
  ruler beat `-fb` 71.9 % [56.3, 84.4], and against the duelist strafing was worth nothing
  measurable.
- **headroom**: each expert against the body's own family duelist on the same seed pairs, and the
  paired difference.
- **against `-fb`** (the step run only): session 05's restricted control, the ruler with its strafe
  held at zero.
- 32 seed pairs a cell (64 bouts). A channel goes on by default only if headroom rises: the head to
  head share's interval clear of 50 %, with no loss against the duelist.

**What the expert does with each channel** (`tests/harness/expert.mjs`):

- `-step`: in the six slots a c8 search evaluates, stepin-cut (a step to 0.75 of the distance,
  then a cut), step-out (to 1.35 of it, covering), and a slip to either side (the line turned 0.6
  rad about them, then a cut) replace step-cut, back-off and cut-high, whose job the keys did. With
  a warm start in slot two, slip-r is the seventh and is not evaluated; the second round's jitter
  reaches both sides.
- `-stance`: every stroke, stand and step segment of a fresh proposal carries a stance, attacking
  (staggered, weight forward 0.5) or covering (wider by 0.5, staggered, weight forward 0.25), and
  the jitter moves all three numbers.
- `-stance-step`: both.

### The step target

Bout runner, `research/headroom.mjs --exp channel --channel step` and the diagnostic runs beside it
(`research/runs/headroom-channel-{step,step-fast,stepkeys-diag,step-vs-keys,stepadd}`). A's score
and bar margin over corner-swapped seed pairs, bootstrap 95 % interval over pairs.

The first run was stopped at 123 of its 256 bouts, 7 to 8 pairs a cell, because its head to head
was already decided on the stone and the remaining compute bought more by finding out why.

| A | B | body | pairs | A's score % | margin |
|---|---|---|---:|---|---|
| `expert-step` | ruler | default | 8 | 12.5 [0.0, 31.3] | -0.247 [-0.369, -0.086] |
| `expert-step` | ruler | skeleton-warrior | 7 | 42.9 [21.4, 64.3] | -0.066 [-0.234, 0.122] |
| `expert-step` | `expert-fb` | default | 8 | 43.8 [25.0, 62.5] | -0.020 [-0.211, 0.149] |
| `expert-step` | `expert-fb` | skeleton-warrior | 7 | 42.9 [21.4, 64.3] | -0.055 [-0.187, 0.072] |
| `expert-step` | duelist | default | 8 | 100.0 | 0.825 [0.784, 0.871] |
| ruler | duelist | default | 8 | 100.0 | 0.792 [0.685, 0.887] |
| `expert-step` | skeleton duelist | skeleton-warrior | 8 | 100.0 | 0.967 [0.950, 0.982] |
| ruler | skeleton duelist | skeleton-warrior | 7 | 100.0 | 0.987 [0.975, 0.997] |

Headroom against the duelist, paired over the same seed pairs: +0.033 bars [-0.063, 0.135] on the
stone and -0.018 [-0.035, -0.002] on the skeleton, with both sides at 100 %. So the step expert did
not raise headroom against the duelist, and it lost head to head to the ruler it was meant to beat,
on the stone clearly. Against `-fb`, which the ruler beats 71.9 % in session 05, it came out even.

**Why it lost.** Three things change at once in `-step`: the channel's executor, the speed of each
step (`within`), and which six plans a c8 search evaluates. The diagnostics separate them, on the
stone, 16 pairs each:

| A | B | pairs | A's score % | margin | what it isolates |
|---|---|---:|---|---|---|
| `expert-stepkeys` | ruler | 16 | 31.3 [15.6, 46.9] | -0.192 [-0.304, -0.070] | `-step`'s list, each step driven by the keys toward the same point: the list without the channel |
| `expert-step@w0.5` | ruler | 16 | 31.3 [18.8, 46.9] | -0.137 [-0.247, -0.027] | the channel at twice the speed |
| `expert-step` | `expert-stepkeys` | 16 | 59.4 [40.6, 78.1] | +0.048 [-0.093, 0.186] | the channel against the keys, on one list |

Paired on shared seeds against the ruler (8 to 16 pairs): `-step@w0.5` minus `-stepkeys` is 0.0
points [-18.8, 18.8], margin +0.055 [-0.110, 0.218]; `-step` minus `-step@w0.5` is -25.0 points
[-56.3, 6.3], margin -0.190 [-0.387, -0.020].

- **The list is what cost.** With no channel at all, the keys driving `-step`'s plans, the expert
  still loses to the ruler, by as much as the channel does at a fair speed. The ruler, in the same
  cells, spends 47 % of its decisions on the three plans `-step` replaced (step-cut 20.9, cut-high
  18.2, back-off 8.2 % on the stone; the report's last section). Those are the plans a c8 search
  finds best most often, and taking their slots away is a weaker search, whatever the new plans do.
- **A slow step costs on top.** `within` 0.5 s for the step out and the stroke's 0.25 s for the
  others were slower than the keys close the same ground; halving them recovered 25 points
  (paired, 8 pairs, interval touching zero).
- **The executor is not the loss.** At a fair speed the channel and the keys are level, and on the
  one list the channel is ahead, not significantly.

**`-stepadd`** tests the fix that follows: keep the ruler's head whole and put the channel only in
the two slots it chooses least (back-off and press, 10 % of its decisions), one slip a decision to
alternate sides, at `w0.5`.

| A | B | body | pairs | A's score % | margin | A stepping, % of frames |
|---|---|---|---:|---|---|---:|
| `expert-stepadd@w0.5` | ruler | default | 32 | 40.6 [28.1, 53.1] | -0.042 [-0.121, 0.043] | 12.0 |
| `expert-stepadd@w0.5` | ruler | skeleton-warrior | 32 | 43.8 [32.8, 54.7] | -0.091 [-0.207, 0.025] | 15.5 |

Against the same ruler on shared seeds (stone), `-stepadd` is 9.4 points [-12.5, 31.3] ahead of
`-stepkeys` over 16 pairs and 25.0 [-6.3, 56.3] ahead of the first `-step` over 8.

So the fix removed the loss and found no gain. With the ruler's head whole, the search picks the
step plans about as often as the ruler picks the two it replaced: step-out and the slips take 10.1 %
of `-stepadd`'s decisions on the stone and 13.2 % on the skeleton (step-out 6.5 and 8.4), against
the ruler's back-off and press at 8.1 and 12.3 % in the same bouts (jitters folded into their plan).
The rest of its choices are the ruler's own, in about the ruler's proportions. A mirror of equals is 50 %, and both bodies read below it, inside
the interval. **The step channel does not raise headroom at c8,h1 on either body.**

### The stance

**Partial: 182 of 256 bouts.** The run was stopped when the session was wound down. It resumes
from its `results.jsonl` (section 7). Bout runner, `research/headroom.mjs --exp channel --channel
stance --skip-ruler`.

| A | B | body | pairs | A's score % | margin |
|---|---|---|---:|---|---|
| `expert-stance` | ruler | default | 23 | 41.3 [26.1, 56.5] | -0.054 [-0.132, 0.025] |
| `expert-stance` | ruler | skeleton-warrior | 21 | 54.8 [38.1, 71.4] | +0.027 [-0.136, 0.184] |
| `expert-stance` | duelist | default | 23 | 100.0 | 0.776 [0.734, 0.811] |
| `expert-stance` | skeleton duelist | skeleton-warrior | 23 | 100.0 | 0.966 [0.946, 0.982] |

- **Headroom against the duelist.** This is paired with the ruler's cell from the step run. That
  cell has only 8 pairs on the stone and 7 on the skeleton, because the step run was stopped;
  `--ruler-only` exists to fill it. The difference is +0.007 bars [-0.072, 0.089] on the stone and
  -0.019 [-0.045, -0.000] on the skeleton, with both sides at 100 %.
- **What it did.** In its head-to-head bouts it held a stance for 73 to 77 % of frames. That stance
  was nearly all lead (|lead| 0.70 to 0.74), with weight forward about 0.35 and almost no width. It
  chose the ruler's plans in the ruler's proportions, as expected: the stance rides on every plan,
  so it does not change which plan is chosen. It fell about as often as the ruler did.

So far the stance is inside the interval on both bodies: below 50 % on the stone and above it on the
skeleton. It has not raised headroom against the duelist. On partial n this is not a verdict.

## 5. Default flags

`DEFAULT_CHANNEL_FLAGS` in `src/body-command.ts` stays `{ stance: false, step: false }`.

- **step: off.** At 32 pairs on both bodies no variant beats the ruler, and none raises headroom
  against the duelist.
- **stance: off, pending.** At partial n (23 and 21 pairs) it has not beaten the ruler on either
  body. On the stone the interval reaches up to 56.5 %, so it is not yet excluded.

Neither channel rose, so a `stance-step` run was not justified and was not made.

## 6. Compute

**Pricing.** A pilot of 50 bouts took 1118 s on 6 lanes. Measured per bout:

| bout | wall time |
|---|---|
| stone head to head | 150 to 230 s |
| skeleton head to head | about 300 s |
| expert against a duelist | 35 to 65 s |

A 32-pair channel run is 256 bouts, which prices at 1.8 to 2 h of wall time on 6 lanes. The budget
was about 12 h: one run per channel, plus diagnostics.

**Spent.** Lane-hours are summed bout wall times; each bout runs on one lane.

| run | bouts | wall | lane-hours |
|---|---:|---:|---:|
| `headroom-channel-step` (stopped) | 123 | 0.8 h | 4.6 |
| `step-fast`, `stepkeys-diag`, `step-vs-keys` (concurrent, 2 lanes each) | 96 | 0.3 h | 4.8 |
| `headroom-channel-stepadd` | 128 | 1.6 h | 9.3 |
| `headroom-channel-stance` (stopped, partial) | 182 | 1.35 h | 7.7 |
| `command-null-*` (9 runs of 45) | 405 | about 0.4 h | small |

In all, about 4.5 h of run wall time and 27 lane-hours. That was inside the 12 h. The remainder was
left unspent when the session was wound down.

## 7. Open

- **Finish the stance run.** 74 bouts are left. The command below resumes it by job id from its
  `results.jsonl`; the pair count must stay 32, or the schedule hash will not match. It takes about
  0.7 h on 6 lanes:
  `node research/headroom.mjs --exp channel --channel stance --skip-ruler --pairs 32 --lanes 6`
- **Fill the ruler's cell against the duelist to 32 pairs.** This cell is the headroom column's
  other half. It is 128 bouts, about 0.4 h:
  `node research/headroom.mjs --exp channel --channel ruler --flags step --ruler-only --pairs 32 --lanes 6`
  Its first 8 pairs repeat the step run's seeds, so they should reproduce those rows exactly. That
  is a determinism check for free.
- **Then re-read.** Run `node research/command-surface-report.mjs` and settle the stance's verdict:
  it goes on only if the head-to-head interval clears 50 % with no loss against the duelist.
- **Effectors in task space, with a speed and a stiffness.** Not built. The effector channel still
  carries envelope coordinates (section 1).
- **A page switch for the flags.** `CHANNEL_FLAGS` is reachable only from Node (`setChannelFlags`).
  The eye gate needs one.
- The step run was never completed at 32 pairs for plain `-step`. It is not needed for the verdict,
  because `-stepadd` supersedes it.

## Eye gate

The eye gate is deferred. None of these can be looked at on the page until the flags have a page
switch:

- **The stances.** Attack is staggered with weight forward; cover is wider. Each should read as a
  stance, not a split or a lean. Look at the stone, the human and the skeleton.
- **A step-target move.** It should read as a step that arrives and stops. It should not look like
  a slide, and it should not overshoot the way the keys do.
- **A bout of `expert-stepadd` against the ruler.** A fighter that steps out and slips should not
  look worse than one on the keys.
- **Regression.** With the flags off, nothing about any fight changed. The null control says so
  bit for bit.
