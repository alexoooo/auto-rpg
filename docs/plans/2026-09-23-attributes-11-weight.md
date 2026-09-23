# Attributes 11 -- weight

Weight scales density at fixed geometry: every body part gets heavier and nothing gets bigger. It
follows the per-stat protocol in `-00-overview.md`. Size (session 12) multiplies mass by size cubed
on top of this, so final mass is `weight × size^3`.

## The knob

Masses today are fixed when the config loads: `kg()` × `SHIPPED_MASS_SCALE` (0.162) in
`src/golem/config.ts`, both private. So weight cannot go through `kg()`. It is applied at part
construction instead:

- **Physics mass.** Every body part's `mass` passed to the rig part builders
  (`boxPart`/`capsulePart` in `src/rig.ts`, called from each module's builder with its table's
  mass) is multiplied by the stat. One helper,
  `partMass(ctx, kg) = kg × attribute(ctx, "weight")`, is used at every call site.
  - Grep for every `mass:` passed to a part builder. A missed one is a body with one part left at
    the old density, and nothing will report it.
- **Everything that reads a mass without asking the solver must agree:**
  - `definition.massKg` is fixed on the definition, and `golemUpperMassKg(setup)` reads it. It
    feeds `carry()`, and so the stability divisor. Scale it where the golem computes it, from the
    setup's weight.
  - The biped's `ownMassKg`.
  - `impactMassKg` on each striker, which feeds `cutEnergyJ` / `scoreHit`.
  - `swingInertia` (`rodInertia`) in capabilities, which retimes strokes through
    `strokeInertiaScale`. `STROKE_INERTIA.ref` stays pinned to the default arm, so a heavier arm
    reads a longer stroke. That is the intended physical consequence, and the sweep shows it.
  - The wrist's cast masses (`carryRatio`).
  - `Combat` reads `partMassKg` from the solver, so it follows the physics mass by itself.

  An assertion must hold: at every level, each part's solver mass equals its table mass × weight.
  Test it on the assembled default golem, part by part.
- **Equipment is not scaled.** The blade's 1.30 kg, the mace, the maul, the plate and the whip
  carry their own masses, because items get their own stats. So weight changes the arm-to-blade
  ratio, which is exactly the wrist-weld mass ratio that once produced the jiggle (memory
  `jiggle-is-a-mass-ratio-bug`). The bench must look for it at both ends.
- **Forces are not rescaled.** A heavier arm is slower at the same force, and a heavier body is
  steadier against the same shove. That trade is the stat.

## Bench (Node harness)

- `runGolemBench(...).massKg` at 0.75, 1.0, 1.25 and 1.5. It must equal the default × the level,
  apart from the equipment's share.
- The stroke bench at each level: arrival time, peak tip speed, stray and lag. A heavy arm arrives
  later.
- The wrist at rest with the blade at both ends: a rest-pose ripple in a sweep, not a jump (the
  AGENTS.md wobble trap). The jiggle must not come back.
- The shove threshold at each level. It must rise with weight on the biped, through `carry`.
- Impact energy of a standard blow. It must rise with weight at a fixed speed, through the reduced
  mass.

## Sweep

Run the protocol levels. The columns: win rate and d, damage dealt, damage taken, knockdowns, and
bout length. Heavier bodies hit harder, are slower and are steadier, and the per-mind split shows
which style that suits.

## Done when

- Weight is `live` with a measured range.
- The solver-mass assertion holds on every part.
- The jiggle is absent at both ends.
- The tables are recorded, and the fingerprint reads all `same` at 1.00.
