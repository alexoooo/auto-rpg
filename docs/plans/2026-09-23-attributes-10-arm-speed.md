# Attributes 10 -- arm speed

Arm speed scales how fast the arm chains move to their commanded targets. It follows the per-stat
protocol in `-00-overview.md`. The owner expects arm speed to come from item stats eventually, so
the fold over sources stays open.

## The knob

The arm-chain rate limits, all read from their tables:

- **`CHAIN_REACH.anchorRate`**, 5. `buildArmCore` reads `R.anchorRate` every step, so the builder
  hands it a per-build table, `{ ...R, anchorRate: R.anchorRate × s }`, rather than writing the
  shared one. The same goes for the skeletal reach built on `SKELETAL_REACH`.
- **The wrist**: `CHAIN_WRIST.rollRate` and `bendRate`, both 2.5.
- **The pitch chain**: `CHAIN_PITCH.targetRate`, 10. `pitchChain` binds its table internally, so
  first refactor it to take the table as an argument, and commit that on its own with an
  all-`same` fingerprint.
- **The human arm** (`src/golem/humanoid/arm.ts`): the literal `RATES = [3,3,4,4,5,5,4]` and
  `clamp(target, -8, 8)`. Scale `RATES` per build; the clamp is a bound on the command, not a rate.

**Out of scope: the torso's twist and lean and the neck.** They are the torso's and the head's, and
arm speed is about the arms. **Force ceilings are not scaled either.** Above about 3,900 N the
force ceiling changes nothing on these chains (AGENTS.md); the rate is what shapes a move.

The envelope's published `rate` axis (`buildArmCore`) follows automatically. **No mind reads it
today**, and stroke timing comes from `GOLEM_TACTICS.chamberSeconds` and `commitSeconds`, tuned at
rate 5. So a faster arm runs the same stroke clock. The sweep measures what that leaves on the
table, and teaching minds to use the published rate is later work.

## The upper bound is the design problem

**A flung blade is fast, and fast is not the same as good at fighting.** At rate 18 the driven
anchor sat 217 mm from where it was sent and a tip peaked at 75.5 m/s. Every bout-level number
improves monotonically past the point where the arm stops following its command, so **the bench
sets the ceiling, not the sweep.**

Bench, on the Node harness, with `runStrokeBench` in `tests/harness/golem-bench.mjs`:
- **Levels.** 0.75, 1.0, 1.25, 1.5, 2.0 and 2.5, on the wrist chain with the blade, mace, maul and
  plate, and on the skeletal and human arms.
- **Columns.**
  - peak driven tip speed;
  - arrival time at the mark;
  - **peak anchor stray**. `tests/golem-bench.test.mjs` refuses a cut that strays more than
    50 mm from its own anchor;
  - lag;
  - the maul's grip stray.
- **Exclusion windows.** The startup (0.6 s) and stroke (0.5 s) windows apply as always.
- **The ceiling.** The UI's `max` is the highest level where every combination stays under the
  50 mm stray.

## Sweep

Run the protocol levels up to the bench's ceiling and no further. Read the per-mind split: a mind
whose strokes are timed may gain less than one that thrusts on contact. Also report
**contacts per bout** and the **real-blow share**, the two columns that improve even when the arm
is being flung.

## Done when

- Arm speed is `live`, with its ceiling set by stroke stray.
- The pitch chain takes its table as an argument.
- The tables are recorded.
- The fingerprint reads all `same` at 1.00.
