# Session 01: body release 1

## Goal

Four changes to the body, landed together because each one re-baselines every measurement and they
should be paid for once:

1. a control clock separate from the solver, and physics at the rate the two physics-rate
   analyses support;
2. the biological size law;
3. arms built at guard, so no bout opens with a free clash;
4. a side-mirror gate, so no comparison is ever decided by which side a body stood on.

The fingerprint at the end is **body release 1**. Every later session measures against it.

## 1. Physics rate

`docs/analysis/2026-09-25-physics-rate.md` measured 240, 180 and 120 Hz on the Node harness. What it
found:

- **Tunnelling is not the problem.** Havok caught a 10 mm blade and a 22 mm whip segment at every
  speed up to 90 m/s at 120 Hz, so no minimum part width is needed.
- **The drives are the problem.** Every servo gain and motor ceiling was tuned per substep at 240.
  At 120 the arms overshoot, the biped's and skeleton's feet slip 6x and 15x, bouts are 38 %
  shorter, and 44 of 970 tests are red. At 180, bout-level results are within the noise of a 250 Hz
  control and 23 tests are red. About 13 of those are pinned to 240 or to one exact trajectory; the
  real misses are the head-ram's lunge and foot slip.
- **Control costs twice what Havok does.** At 240 Hz it is 92 against 46 ms per simulated second
  (Node bout runner), so the control loop is the larger cost.

A second study, `docs/analysis/2026-09-25-physics-rate-2.md`, asked whether 120 Hz is a retune or
a limit. **It is a retune**, and most of it is one setting:

- **The cause.** Babylon tells Havok to expect exactly the step it takes, and Havok sets the
  stiffness of every motor, joint and contact from that expected step. So 120 Hz halved everything's
  stiffness. `CONFIG.world.solverTuningHz` (landed, 240) holds the expected step at 1/240
  whatever the real step is. That puts the feet, the human arm, contact and lift back on 240's
  numbers, and at the attribute extremes too.
- **The margin.** Every arm drive has 4-16x of gain above what ships before it goes unstable at 120.
- **What is left at 120:**
  - stone and skeleton stroke stray is 1.3-1.6x;
  - the whip's peak is unsettled;
  - retuned 120 fights run 26 % longer with 25 % less damage per second. That was shown to be
    physical, not the minds or their rate.
- **The control clock.** `CONFIG.world.controlHz` (landed, 240) has the mind decide every
  `physicsHz / controlHz` substeps and re-applies the held command in between. At 240 physics,
  control at 120, 80 and 60 Hz leaves bouts statistically unchanged and costs 0.89x, 0.81x and
  0.80x. At 120 physics with 120 control it costs 0.55x (Node bout runner). Publishing the view is
  3.5x the mind's decision, and the locomotion setup costs as much as the servos. Those two are
  the next cost targets. The 0.35 s severs once seen with 60 Hz control on 120 Hz physics were one seed-independent
  opening under the unlanded exact servo filter. On main none occur
  (`docs/analysis/2026-09-25-rate-control-clock.md`).

The follow-up studies, all Node, each with its own analysis dated 2026-09-25:

- **Tempo** (`rate-tempo.md`, `rate-contact-reading.md`). Blades arrive just as fast at 120. The
  gap was the contact reading: `Combat` scored from the state after the solver step that found the
  contact, which depends on the step length. `CONFIG.combat.contactReading: "arrival"` (landed,
  off) reads speed, point, edge and both effective masses before the step, and guards the billed
  speed. At `arrivalReadFraction` 0.56 it keeps the settled 240 fight's length and is
  rate-invariant on the mace, maul, whip and fist mirrors. It closes about two thirds of the
  default mirror's gap. It is a balance change at 240: miser +37.5, duelist -22.9 points. The
  servo-gain alternative was rejected, because it closes the gap by flinging the blade (cover
  overshoot 188 to 345 mm).
- **Early severs** (`rate-control-clock.md`). They came from the unlanded exact-servo experiment, and
  were one opening counted 24 times. Main shows none. 60 Hz control is not ruled out at 120.
  **Every bout of a mind pairing plays the same opening whatever its seeds**, so every
  comparison clusters by pairing.
- **Whip** (`rate-whip.md`). Not peak-limited at 120 (n = 400 a rate). Its lower score was the
  mispricing the arrival reading fixes. Only the fast attribute extremes lose 8-12 % of lash peak.
  The whip build loses about 99 % of its bouts at both rates, so it is a dead-end candidate for
  session 05 whatever the rate.
- **Tests** (`rate-tests.md`). 23 of the 30 reds were the tests and are rate-honest now. 7 are
  real at 120:
  - arm stray and arrival (4, one of them the whip's single-trial peak);
  - stroke cut speed (1);
  - no foot down while walking and strafing (2).
- **Falls** (`rate-falls.md`). The brawler falls 1.5x as often at 120. In close contact its centre of
  mass rides to the rear edge of its soles (-34 mm against -3). It is Havok's contact under the
  held ideal step, not our code, and the excess is not significant once clustered. A real ledger
  error was fixed on the way: a held push was added after the righting, not against it.

**Release 120 landed on 2026-09-25**, on the owner's word ("turn on arrival reading", "go ahead
with the 120hz change (and associated tuning)", and a falls retune):

- **Defaults.** `physicsHz` and `controlHz` are 120, `solverTuningHz` stays 240, and
  `contactReading` is "arrival".
- **Arm servos** (`docs/analysis/2026-09-25-release-120.md`). `JointServo.track` aimed at the
  target of the step it was in, a lead of one step, which doubled at 120: every parry arrived early
  and overshot. The lead, the gain and the arm's command filter are now held per second at
  `solverTuningHz`, so 240 is bit-identical. The wrist blade parry overshoot went from +77.8 to
  -2.9 mm, paired against 240 (Node golem bench). No motor ceiling moved.
- **Arrival fraction per striker kind.** `club` and `empty` bill at 0.62 and every other kind at
  0.56. Every mirror's length is inside its clustered interval of settled 240 (Node research
  runner, 192 paired bouts each).
- **Falls and the rise** (`docs/analysis/2026-09-25-falls-and-rise.md`). The rise is staged: gather
  the feet, squat, extend with the trunk last. It is judged on its most centred stance, and is not
  cancelled by a body lying beside it. The skeleton's legs moved under its weight
  (`SKELETON_BIPED.hipAhead` 0.09), and `LOCOMOTION_BIPED.targetRate` went from 10.5 to 11.5. Falls
  per minute roughly halved (stone 2.51 to 1.37, skeleton 17.19 to 9.30), and falls during a rise
  went from 126 to 0 on stone and from 3310 to 87 on the skeleton (Node research runner, 192 bouts
  a group).
- **The size law** (part 2 below, `docs/analysis/2026-09-25-size-law.md`) landed in the same merge.
- **Tests.** The residual reds were the tests themselves and are rate-honest now, each mutated to
  show it bites. The one real residual was the strafe: nothing ever wrote the ankle's roll, so a
  stance sole rolled onto its leading edge and stood past the plant band at every handover at 120.
  `bipedAnkleRoll` levels it (42 to 0 of 959 airborne substeps, Node locomotion bench).

What is still open is on the owner's list in `2026-09-25-skill-ceiling-00-overview.md`: the eye
gates, and the skeleton at about 9 falls a minute against a proposed band of 3 to 5.

**Three parts:**

1. **Rate-invariant constants.** Every drive constant is stated in continuous time, in seconds and
   per-second gains, and converted by the step. Every per-step literal the first analysis listed
   reads the rate. Tests pinned to 240, or to one exact trajectory, are made rate-honest. After
   this, the physics rate is one config value.
2. **The control rate**, now a config value. What is left is choosing its default from the
   cost table and the eye gate, and making the view publication cheaper, since that is where the
   control cost now sits.
3. **The physics rate.** It is 120 if the follow-ups close the tempo gap or the owner accepts it,
   and if nothing turns out *limited* rather than detuned. Otherwise it is 180 or 240. A limited
   subsystem is named, along with what it would cost the game.

Separately, `targetResponse` 20 is better than what ships even at 240. Cover overshoot falls from
188 to 1 mm and cut stray from 38 to 17 mm, for 25 % less peak blade speed. Give it its own bout
sweep here, whatever rate is chosen. Each re-tuned constant gets its table in its doc comment, per
the house rule on motor ceilings.

A cap on spin (about 100 rad/s) is optional insurance: past about 40 m/s at the tip, a spinning part
hands over less momentum on a hit. Normal swings peak at 18 to 24 m/s, so only a blade that has been
struck gets there.

Read the physics share of a frame on the dungeon's frame meter (`src/dungeon/frame-meter.ts`) at
each step, on this host. The owner reads the laptop at the eye gate. The Node figures leave out
rendering, so they do not settle what the laptop will do.

## 2. The biological size law

In `SIZE_LAW_POWER` (`src/golem/attributes.ts`), force moves from s³ to s² and torque from s⁴ to s³.
The laws that follow from those two are then re-derived. Speed, duration, frequency and impulse
were derived under dynamic similarity, so each is re-stated under the new pair with its argument
in the doc comment. Mass stays s³ and inertia s⁵. A larger body becomes relatively weaker and
slower for its mass, which is the trade-off the owner asked for.

- Re-run the size bench (`.review/size-bench.mjs arm`, or its successor checked in under
  `research/`) at x0.75 to x1.5. Stroke stray, pitch-hinge arrival and biped foot slip decide the
  new `min` and `max`. Under the old law the floor was the arm (x0.8) and the ceiling was the whip,
  the maul and foot slip (x1.25). Both are expected to move.
- The human stays fixed at x1 (`FAMILY_FIXED_ATTRIBUTES`).
- Re-run the size row of `research/stat-sweep.mjs` with the probe minds. It is no longer a
  statement about skill, only a check that the stat still does something. What size is worth
  against skill is session 05's question.

## 3. Arms built at guard

**Done 2026-09-25** (`docs/analysis/2026-09-25-arms-at-guard.md`). Every arm is built at the pose its
rest command holds (`restCursor` in `src/golem/effectors/chains/arm-core.ts`). An idle stone tip
peaks at 0.10 m/s in the first 0.6 s, against 12.8. The first contact in a stone mirror moved from
0.117 s, before any mind acted, to 0.217-0.283 s, after the bodies close. `settleSeconds` is now
refused, because a settle runs no control and lets the arms droop. The trailing maul chain is not
yet built at its grip. Paired bouts moved nothing outside their intervals (Node research runner,
384 bouts a tree).

Fighters are built with both arms hanging and swept to guard, so both blades meet and score at
t = 0.067 s. `settleSeconds` in `tests/harness/bout-runner.mjs` only partly cures it: a first blow
still lands 0.05 s after scoring opens. Build each arm's links already at the guard pose, following
the header rule in `AGENTS.md` about welds that disagree at construction. Then check:

- peak driven tip speed in the first 0.6 s of a fighter standing still, against today's
  77 m/s snap;
- damage in the first 0.5 s of every probe-mind mirror, against today's table (0.45 to 0.89 of a
  bar per side);
- a first contact at no earlier than the time the two bodies can physically close.

## 4. The side-mirror gate

**Done 2026-09-25** (`docs/analysis/2026-09-25-side-mirror.md`). `research/side-mirror.mjs` is the
full-n row and `tests/side-mirror.test.mjs` the suite's. The band comes from distinct trajectories:
the brawler's 128 bouts are 20, and the guardian's are one. On c563e66, 13 of 14 mirrors pass at 128
bouts (Node research runner). The guardian fails, 128 of 128 to the left, because its seed first acts
after its 2.15 s mirror is over, and it is listed in `SIDE_DECIDED`, which both comparison scripts
refuse. The v4 mirrors pass on this tree (reaper 48.8, driver 55.5, miser 59.7), and the 15 % and
64 % below are not reproduced. The miser passes twice at 128 but fails pooled over 186 distinct
bouts (59.4 +- 7.2). Its cause and the guardian's are a seed-independent opening decided by float
rounding between two symmetric slots: the exactly mirrored world hands each lean to the other side.
There is no arena or body bias: 49.8 +- 2.8 % left, pooled. `research/league.mjs --mirror` reads the
same verdict.

Every mind in the probe set and every naive-ladder mind plays its own mirror, 128 bouts, with scores
split by side. A side that differs from 50 % by more than the 95 % band fails. The v4 mirrors are
known to fail (`golem-reaper` 15 %, `golem-driver` 64 %, from their circling path). They are not
fixed here, because v4 leaves in session 09. They are listed as failing so that nothing measures
against them.

The gate becomes a test at a smaller n that runs in the suite, and a research-harness row at full n.

## Measure

- The body fingerprint before and after, with its diff.
- The probe-mind control row of `research/stat-sweep.mjs` (x1 against x1), 384 bouts: win share,
  damage, falls, bout length, decided fraction. It is recorded as release 1's baseline and never
  compared with the old figures as a regression.
- The idle-dummy matrix, as recorded, not gated. Session 05 gates it with the expert.

**Result, 2026-09-25** (`docs/analysis/2026-09-25-release-1-baseline.md`). Release 1 is cb1bd38,
measured with the instruments in ebd8fc3 and cd800eb.

- **Fingerprint.** All 55 body-fingerprint sections moved, as a change of rate must. The readable
  readout (`research/body-readout.mjs`) shows what moved:
  - no x1 body's build-time number, except the fall line;
  - the size law's rates and torques at x0.8 and x1.1;
  - the giant, from 949 kg and 2.63 m to 648 kg and 2.31 m.
- **Control row** (Node research runner, 384 bouts, 372 distinct trajectories):
  - damage 7.21 +- 0.83 a body a bout;
  - falls 0.67 +- 0.86;
  - bout 24.4 +- 13.3 s;
  - decided 96.3 +- 8.5 % (clustered by the ten pairings);
  - the x1-against-x1 win share, a null, 45.6 +- 5.9 %;
  - the miser takes 86 % of its bouts against the other three.
- **Idle matrix** (same runner, naive family minds). The seven carried cells are all still at zero:
  the skeleton against stone, human and giant, and the human against everything. Among the other
  seventeen builds, a further 40 cells of 68 are at zero:
  - every human build;
  - every skeleton build against stone, human and giant, and the skeleton maul against a skeleton
    too;
  - the maul, whip, fists and capped-ram stone builds against every dummy.

## Eye gate

The owner watches, on the dev server:

- stone default against stone default;
- the all-max giant against x1;
- the human and the skeleton each against stone;
- a size x0.8 against a size x1.25.

What to look for: blades that still read as fast and solid at the new rate; nothing passing through
anything; the opening, with no clash before the bodies close; and the size trade-off, with the big
one slower and the small one quicker.

## Depends on

`docs/analysis/2026-09-25-physics-rate.md`, and `docs/analysis/2026-09-25-physics-rate-2.md`, and its
follow-up studies.
