# Physical contact 09: minds read what the attributes do

## Why

Minds see size only indirectly: through reach, heights, collision radius and `swingInertia`. They
never see movement, turning, stability, recovery, armour, toughness or arm speed.

What they do see, they sometimes misread. `strokeInertiaScale` stretches a stroke by the square root
of swing inertia over a reference, and a x1.25 stone arm is timed 38 % slower while the arm itself is
about 12 % slower. The all-max giant is timed about 70 % slower, and its x1.5 arm speed is thrown
away.

The owner's rule: minds should know the attributes, as the physical quantities they produce, so that
item-sourced armour or arm speed later reach a mind with no change.

## Changes

1. **Publish on `BodyView`, self and opponent:**
   - `massKg`, the whole-body mass;
   - `stabilityImpulseNs`, the fall impulse from session 08's capacity;
   - `armRate`, the tip speed the primary arm can carry, from the arm's rate limits and the
     arm-speed attribute;
   - `soak`, the damage a unit of arriving energy does to the core, after armour and toughness.

   All are derived from the built body, never read from the attribute record.

   Grow the fixture lists in `tests/fixtures/view.mjs` and the hand-written views together.
2. **Stroke timing from the arm.**
   - Replace `strokeInertiaScale`'s inertia-only stretch with the arm's own time scale:
     - its rate limits, times the arm-speed attribute;
     - its torque against its swing inertia, which is what size and weight change.
   - Keep the floor that no load makes a stroke quicker than the benched shape.
   - Measure the new timing on the stroke bench at x1, x1.25 and `max`.
3. **Stand-off and closing from relative mass.**
   - A body that heavily outweighs the other closes to push or lift range.
   - A lighter one keeps off.
   - One shared helper, played either side.
4. **Research feature lists.** If `labObservation` (`src/golem/lab-policy.ts`) or `neuralFeatures`
   (`src/golem/neural-features.ts`) take the new fields, bump their versions. Their trained artifacts
   stay on the old versions.

## Measure

- The giant preset against x1 (192 blocks).
- x1 against x1 either side, with the fingerprint diff.
- Mutation-check the stroke timing: go back to the inertia-only stretch and the stroke-bench test
  goes red.

## Inputs from session 01

- **The human cannot defeat an idle dummy outright.** In the idle matrix it wins 0 % before the
  overtime drain against every family, and 13 % to 100 % with the drain. The cause is its stand-off,
  not its stroke. Against an idle stone it holds about 1.6 m off the core, its tip comes no nearer
  than 0.47 m, and it deals 0 damage in 40 s. The anatomical blade itself peaks at 11.2 m/s and
  moves 0.99 kg plastically on the impact bench. Stand-off from the body's own reach is this
  session's subject, so this cell is its to close.
- **The skeleton cannot defeat an idle giant outright** (0 % before the drain, 100 % with it).
