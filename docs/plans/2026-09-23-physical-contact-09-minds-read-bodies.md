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

## Input from session 05

- **The human's pace roughly halved.** Its arm is light, so at the median contact what arrives
  behind its blade is 0.74 of what the blade used to declare. At one price across bodies, its
  sword's summed damage on the same contacts is x0.51 (Node harness, offline re-score).
  - Against an idle human over 15 s it wounds nothing on three of four seed pairs.
  - The wound test moved from seeds 42/77 to 44/79.
  - It still wounds on 76 % of the edge contacts that wounded before, so its stroke is intact.
    The cell is still a stand-off problem and still this session's.
- **In a bout it deals 0.06 damage a body, against 0.10** (the x1 mirror, Node harness, research
  runner, cap 150 s, 192 blocks). Its contacts held at 303.5 a bout, and every bout still runs to
  the drain.

## What landed, 2026-09-24

Every figure is in `docs/analysis/2026-09-23-attribute-measurements.md` "Physical contact 09: minds
read what the attributes do", with its harness, and the bout-level readings are taken with session
08's last commit in "Re-measured at 567350a". Two commits, ec9b8b2 and adfa2b4. What differs from
the plan above:

- **`BodyView` publishes `massKg`, `stabilityImpulseNs`, `armRate` and `soak`**, all read off the
  built body. `labObservation` takes them as version 3; `neuralFeatures` does not, and its version
  did not move.
- **`strokeTimeScale` takes the slower of the arm's rate and its load against its torque.** At x1 it
  is the old rule to the bit. The x2-weight mace peaks at 19.8 m/s, against 14.8 under the old
  stretch and 18.3 at x1; the inertia-only mutation turns the stroke-bench test red. The duelist (v1)
  does not time strokes by the arm.
- **The stand-off is the shorter arm's**, and a body at 1.5 times the other's published mass presses
  to push range. v4 (the miser) keeps its searched stand-off.
- **The human against an idle dummy is still at zero outright wins.** The stand-off was half of it:
  with the drain it now wears down stone, the skeleton and the giant. The other half is its stroke:
  its blade arrives flat (edge lead 0.28 on the stroke bench, 0.24 to 0.36 in a bout), because the
  human arm's roll is a quarter turn from the stroke table's, and it holds at the very end of its
  reach. Turning the roll to -1.57 leads with the edge (0.90) but misses by 0.40 m. Neither is a
  stand-off matter, and both are in session 10's list.
- **The stroke bench's capability builder had lost the full-orientation branch** and drove the human
  arm at roll 0; it is one builder with the golem's now (adfa2b4), and the bench reads the edge lead.
