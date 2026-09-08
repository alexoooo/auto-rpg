# Session 12 -- the continuous command surface, and an executor that can be interrupted

**Status (2026-09-08): landed.** `../../src/golem/tactics-v4.ts` takes a vector -- nine clamped
numbers and three gates -- asked at 12 Hz plus v3's three events, and `../../src/golem/styles/driver.ts`
is `golem-form` transcribed onto it and registered as `golem-driver`. The gate's bar is answered on
both pools: the paired margin over the style it was transcribed from is **-0.0069 +- 0.0811** on
random pairs (d -0.013, points 0.504 +- 0.048) and **-0.0218 +- 0.0262** mirrored (d -0.125), each
containing zero and each smaller than the d 0.089 that separates the fencer from form -- a gap that
changes sign between the two pools. The transcription is held by a test that compares both
executors command for command through a whole exchange: **142 frames, seven channels, exact**. It
found four defects, none of them visible in a bout -- an arc mix that was inexact at swing 1.0, the
arc half selected from the clock rather than from the stance, the mark and the aim computed one
step *before* the ask that wrote them, and two of v3's range gates missing from the mind (a ram's
stand-off, and the point offered from a weapon with no point). All twelve refusal counters read
zero over 1,418 s of fighting on 52 bodies. The one behavioural difference the columns can see is
the abort: the driver is asked 14.52 times a second against form's 5.20, because v3's executor owns
an exchange once it starts, and it takes back **41.7 % of its strokes against form's 23.5 %** --
free over both pools, and worth -0.174 +- 0.134 (d -0.600) on a long one-handed mace, the one body
with a spare hand and a stroke worth 1.21 damage. Four of the nine numbers are ever moved: this
mind never marks off the trunk axis and commits at swing 1.000 in 1,452 of 1,452 gates. See the
Session 12 entry of `../measurements.md`.

## Outcome

A fourth executor whose command is a vector rather than a name. A mind asked at 12 Hz and on
events writes stand-off, strafe, lean, a target point and a reach fraction as numbers, and gates
the exchange with three discrete decisions -- commit, abort, parry. `driveStroke` survives as a
parameterised primitive underneath, so the arc a body swings is still the one Session 02 measured
on the bench; what changes is that a mind can decide, mid-arc, to stop swinging it.

This is the session that makes feints, distance management and stop-hits *representable* rather
than hand-scripted, which is the owner's condition for behaviour that can be named.

## Why this and not more options

The third executor names fifteen options and the fifteen are a partition: choosing `cut` chooses
a stand-off, a lean, a target and a reach all at once, at values a table froze. Every style in the
set is therefore a different way of picking among the same fifteen frozen bundles, and the
distance a mind holds is a constant in a table rather than a thing it decides. A learned policy
over fifteen names cannot express "half a step closer than last time" because no option means
that. Session 10's flat league is what that costs, measured.

## Frozen choices

- **v3 does not move.** `../../src/golem/tactics-v3.ts` and the four styles over it keep fighting
  in every run unchanged, and stay the named baseline. The new executor is
  `../../src/golem/tactics-v4.ts`, for the reason v3 was a new file: the style tables, the style model
  and the learner's layout are all keyed to fifteen options and would be refused on load.
- **The rate is 12 Hz, and the number is measured rather than preferred.** Three timescales in
  the body converge on about twenty asks a second and none of them supports more: the phase read
  is low-passed at `readSeconds` 0.05, a plate crosses its own guard shell in about 0.05 s at
  `CHAIN_REACH.anchorRate` 5 m/s, and the commit phase is 0.22 s long. Twelve is inside all three
  with room, and it is the owner's choice among the rates that are inside them. Event asks are
  kept beside the cadence, unchanged from v3: their read phase changing, my exchange ending, a
  parry releasing.
- **The command, nine numbers and three gates.** Continuous, each clamped to its own range and
  each already a thing `writeAim` in `../../src/golem/tactics.ts` consumes:
  `standOff` (fraction of their reach), `strafe`, `lean`, `advance`, `target` (a point on their
  body, as a height fraction and a lateral fraction, resolved against the published view rather
  than against a module id), `reach` (fraction of the arm's usable reach), `swing`, and the
  stroke's `bite`. The gates are `commit`, `abort`, `parry`, read as three independent
  probabilities and sampled or thresholded by the mind, not by the executor.
- **The executor owns physics, not tactics.** It refuses a command outside the envelope by
  clamping and counting the refusal, it runs the arc `driveStroke` was measured driving, and it
  has no reflexes: every rule v3 kept in the director stays in the director. An abort at any
  point in chamber or commit is legal and costs the half cooldown v3's `chamberAbort` costs.
- **A hand-coded mind over the new surface ships in this session**, `golem-driver`, which is
  Session 04's `golem-form` re-expressed as numbers. It exists to answer one question before any
  learning is attempted: can the continuous surface reproduce a style that already works. If it
  cannot, the surface is wrong and no policy fitted to it will be right.

## Implement

1. `../../src/golem/tactics-v4.ts`: `StyleCommand`, `golemDriven(seed, T, pilot)`, the clamping and the
   refusal counters, `driveStroke` re-entered from a parameterised shape, the abort path.
2. `../../src/golem/pilot.ts`: `Pilot = (reading, view) => StyleCommand`, the 12 Hz cadence and the
   event asks, and `PILOT_FEATURES_VERSION` over `StyleReading`.
3. `../../src/golem/styles/driver.ts` and its registration, as every style registers.
4. Tests in `../../tests/tactics-v4.test.mjs`: every command inside the envelope over a synthetic bout;
   an abort mid-chamber and mid-commit leaves the arm in a legal pose and charges the cooldown;
   the ask cadence is 12 Hz plus the events and not one ask more; a stroke driven at `bite` 1.0
   reproduces v3's arc to the digit; determinism under a seed.
5. The driver against `golem-form` and the fencer, 1,024 mirrored and 1,024 random bouts on the
   post-Session-11 settings, with the structural columns.

## Human gate

None. The owner's gate for this programme is at the end, once there is a mind worth watching;
what this session owes is the mechanical answer that the driver is not worse than the style it
was transcribed from.

## Verification

```powershell
npm run check
node --test tests/tactics-v4.test.mjs tests/golem-mind.test.mjs
npm run tournament -- --bouts 64 --policies golem-driver,golem-form
npm test
npm run build
git diff --check -- .
```

## What remains

The policy that emits these numbers is Session 13. Whether v2 and v3 can be retired once
everything is re-based on v4 is a question for the close-out and is not answered here.
