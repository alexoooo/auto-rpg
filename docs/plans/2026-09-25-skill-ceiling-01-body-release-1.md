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

The analysis doc measures 240, 180 and 120 Hz on the Node harness: arm tracking, stroke stray, jiggle,
contact detection against part widths, stability and locomotion, a bout-level comparison, and cost.
It also lists every place that assumed 240 Hz. This session:

- Sets `CONFIG.world.physicsHz` to the recommended rate.
- Makes every literal the audit found read the rate or seconds, so that a later change is one
  number.
- Re-tunes whatever the analysis names as moved. Each re-tuned constant gets its table in its doc
  comment, per the house rule on motor ceilings.
- If 120 Hz misses contacts on fast tips, takes the design-around the analysis recommends, in the
  owner's order of preference:
  - a minimum width for any part that can be struck, set from the tip travel per substep at peak
    speed;
  - bodies and strokes that do not produce such speeds;
  - a speed cap, as a last resort. A cap is a rule where physics was, so it gets written up under
    "Chosen on the owner's behalf" with the failure that forced it.
- Reads the physics share of a frame on the dungeon's frame meter (`src/dungeon/frame-meter.ts`) at
  the old and new rates, on this host. The owner reads the laptop at the eye gate.

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
