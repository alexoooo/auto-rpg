# Session 01: body release 1

## Goal

Four changes to the body, landed together because each one re-baselines every measurement and they
should be paid for once:

1. physics at the rate chosen by `docs/analysis/2026-09-25-physics-rate.md`;
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

This session therefore takes the cost in this order, measuring after each step and stopping when
the owner's laptop holds the fights wanted:

1. **Run control on a slower clock than the solver.** Motor targets would be refreshed every
   second or third substep and held between refreshes, with the solver kept at 240. That leaves
   contacts and feet as they are. Watch for the trap in `AGENTS.md` where a keyframed anchor
   coasted between refreshes. Measure it with the arm and locomotion benches and a bout row, as
   the analysis did for the rate.
2. **180 Hz**, if more is needed. Fix the tests that assume 240 so they read the rate. Retune the
   head-ram's lunge and the biped and skeleton feet. Make every per-step literal the analysis lists
   read the rate or seconds.
3. **120 Hz** only as a retuning project of its own:
   - the arm filter (`CHAIN_REACH.targetResponse` 40 to 20 gives back most of the arm);
   - the legs, not yet diagnosed;
   - the human arm;
   - a re-measure of the mind rankings.

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

`docs/analysis/2026-09-25-physics-rate.md`.
