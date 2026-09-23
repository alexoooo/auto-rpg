# Attributes 06 -- stability

Stability scales how large a shove it takes to stagger a body or knock it down. It follows the
per-stat protocol in `-00-overview.md`.

## The knob

**The thresholds today.** A body staggers at `SUPPORTED_LOCOMOTION_V1.STAGGER_SPECIFIC_IMPULSE_MPS`
(0.006) × `capacity` and falls at `FALL_SPECIFIC_IMPULSE_MPS` (0.014) × `capacity`. `capacity` is
`braceCapacityMultiplier × gaitStabilityScale`: stone 1.5, skeleton 2.0, wheel 1.0, multileg 2.6.
These are in `stepSupportedLocomotionState` in `src/supported-locomotion-state.ts`, and the same
product is recomputed in:
- `recoveryHitInterrupted`;
- the port's `diagnostic()` (`staggerAtMps`, `fallAtMps`) in
  `src/supported-locomotion-production.ts`.

**Specific impulse is impulse over supported mass**, so a heavier body is already steadier.
Stability scales the threshold, not the mass. Weight (session 11) and size (session 12) will move
the divisor on their own.

**Do not route the stat through brace.** The state machine throws when brace is below 1, so a
stability stat below 1 on the wheel (brace 1.0) would throw. Add a separate per-body factor,
`stabilityScale`, next to brace in the authority the module publishes, and multiply it into
`capacity` in **every** place the product is formed. Search for all of them. A place that forms
the product without it is a stat that staggers on one rule and recovers on another.

**Wheel and multileg have no `carry`.** Their divisor is their own mass, which ignores the upper
body. That is true today and is not this session's to fix, but the table must note it, because a
stability sweep on those bodies reads a different quantity.

## Bench (Node harness)

- **Shove threshold.** Use `runGolemLocomotion` with the bench shove (`BENCH_SHOVE` in
  `tests/harness/golem-torso-bench.mjs` shows the pattern). Shove at rising impulse until the body
  staggers, then until it falls, at 0.75, 1.0, 1.25 and 1.5. Both thresholds must move with the
  multiplier.
- **Nothing staggers standing still.** At the lowest level, a body at rest and a body walking must
  not stagger from their own gait. If the lowest level breaks this, the range stops above it.

## Sweep

- **Add knockdown counts and time-down per side** to the sweep row. Session 02 left that for this
  session.
- **Run the protocol levels.**
- **Read the skeleton separately.** Its knockdowns are the ones that last, and skeleton 09 already
  measured it down 56.9 % of the time against the blade at brace 2.0. Sweep it with `--build`, as
  its own table. On stone a knockdown is short, so the stat may read small there, and that is a
  finding.

## Done when

- Stability is `live`, with a measured range.
- Every place that forms the capacity product includes the factor.
- The tables are recorded, and the fingerprint reads all `same` at 1.00.
