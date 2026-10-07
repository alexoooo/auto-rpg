# Autonomous Arena combat baseline

Harness: Node Arena Duel, vendored Rapier adapter 8, symmetric actuation, 120 Hz, two Warriors,
empty hands, balance 0% on both sides, ordinary arena solids/damage, autonomous minds with no
orders, a 30 s cap and a 60 s recovery allowance. The gameplay controller source is the
`d459c60e` baseline. The probe uses two workers, one sequential queue each. Sampling contact,
phase, gap and blow statistics excludes the first 5 s; final health and cycle counters include
the whole bout. Phase time names the active host/sub-mind rather than a stale strike report.

```powershell
node research/arena-combat-probe.mjs docs/reference/arena-combat-baseline.json
```

[Raw cases](arena-combat-baseline.json). `handPressureSeconds` counts steps with any positive
hand-to-opponent contact impulse, including contact with an arm or guard. It is a pressure
proxy, not a grappling classifier or useful-attack score. `outgoingHandDamage` sums the opposite
surface's official damage when the first surface is this body's hand/item, without attributing
a striker or requiring a commanded attack. It includes incidental contacts. Raw `energy` is
the shared closing-contact energy, not energy supplied solely by the hand. No struck speed
peaks or claimed driven velocity measurements appear in this record.

| Controllers L / R | Initial gap m | Mean head gap m after startup | Hand pressure seconds L / R | Verified returns L / R | Final health L / R |
| --- | ---: | ---: | ---: | ---: | ---: |
| Point right / Point right | 4 | 0.616 | 20.23 / 20.29 | 24 / 19 | 98.71% / 98.85% |
| Point alternating / Point alternating | 4 | 0.572 | 22.94 / 23.11 | 38 / 33 | 98.61% / 98.61% |
| Point alternating / Point alternating | 1.2 | 0.636 | 17.82 / 17.78 | 21 / 19 | 99.08% / 99.20% |
| Point alternating / Point alternating | 2.4 | 0.601 | 20.20 / 20.18 | 25 / 24 | 98.49% / 98.70% |
| Point alternating / Classic | 4 | 1.166 | 6.71 / 5.24 | 1 / none | 95.06% / 83.44% |
| Classic / Classic | 4 | 1.614 | 3.88 / 4.78 | none / none | 98.32% / 98.20% |

The four Point self-play cases have no falls, prolonged hand pressure and little health loss.
They all end on time. The mixed and Classic cases have one fall on each side and continue
under the long recovery rule. Winning that mixed time verdict is not evidence of clean attacks:
the Point controller never enters an outbound swing in its measured interval. The observed
health loss includes incidental contact and falls.

The code inspection supports the following working diagnosis: a single head-directed straight
stroke, a broad reach window, motion frozen during preparation, a chamber that can be crowded,
and early return on new touch can repeatedly cycle through low-value contact. The measured
cases demonstrate the outcome, not an ablation proving each cause. The earlier
[moving-opponent benchmark](arena-engagement.md) tests walking/guarding opponents who never
attack, so its useful-return gains establish a narrower capability than effective autonomous
combat. These six fixed cases are diagnostic regressions, not a distributional win-rate claim.

The next controller plan (`docs/plans/2026-10-06-arena-combat.md@a144de7f`) prioritized crowd
escape, proven attack primitives, openings/initiative, defense and active-opponent promotion
gates. Its larger win/damage goals were proposals awaiting implementation and measurement.
