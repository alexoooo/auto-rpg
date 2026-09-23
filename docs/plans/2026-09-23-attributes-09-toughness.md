# Attributes 09 -- toughness

Toughness scales each part's health. It follows the per-stat protocol in `-00-overview.md`.

## The knob

- **One place.** `Golem.register` in `src/golem/golem.ts` sets:
  - `health` = `part.health × GOLEM_ASSEMBLY.healthScale × worn`;
  - `maxHealth` = `part.health × healthScale`.

  Multiply both by the stat, and change nothing anywhere else.
- **What follows on its own:**
  - **The breaking point.** `severs()` in `src/scoring.ts` reads
    `CONFIG.combat.severMargin × maxHealth` (0.5 today), so a tougher part takes proportionally
    more beyond zero before it comes off.
  - **Ruin and limp.** These trigger at zero health, the same fraction at every setting.
  - **The bar.** `scaleVitality` normalises the weights to `vitalityTotal` (5.4), so a uniform
    multiplier leaves the bar's shape alone. A fight lasts longer, and where a blow lands matters
    exactly as much as it did.
  - **Wear.** `worn` is a fraction, so a worn part at x1.5 toughness is still worn in the same
    proportion.
- **Equipment is unaffected.** It is never wounded, and its `vitalityWeight` is 0.

## Bench

This one is arithmetic more than physics. A scripted fixture delivers standard blows to one part:
- count the blows to ruin it and the blows to break it off, at 0.75, 1.0, 1.25 and 1.5;
- both counts must scale with the multiplier, to within one blow;
- a whole-body case: the same sequence of blows empties the bar at x1.0 and leaves it at the
  expected fraction at x1.5.

## Sweep

Run the protocol levels. Expect the largest effect of any stat so far, because toughness is
damage-agnostic. The columns to read:
- bout length, which should rise at both ends;
- severs per bout;
- endings: at high toughness more bouts may reach the cap. Report draws explicitly, and check the
  harness cap clears the overtime ramp (memory `harness-cap-must-clear-the-ramp`).

## Done when

Toughness is `live` with a measured range, the blows-to-ruin table shows the multiplier, the
tables are recorded, and the fingerprint reads all `same` at 1.00.
