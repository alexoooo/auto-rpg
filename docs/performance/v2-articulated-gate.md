# V2 articulated mechanical gate evidence

**Purpose:** Preserve the measured result, rejected explanations, and open mechanics ledger from the articulated gate attempt.
**Status:** current
**Canonical source:** this record, [`lab articulated`](../../crates/lab/src/main.rs), and the exact future gate contract in [`articulated-mechanical-gate.md`](../reference/articulated-mechanical-gate.md)
**Update when:** The articulated fixture, policies, mechanics, gate thresholds, or corpus is changed or remeasured.

**Host:** MSVC x86-64 Windows. **Date:** 2026-08-10, with the shield/guard
follow-up measured later that day.

The gate attempt landed its scripted policies, `lab articulated`, the
solver-rejection diagnostic, the projector correction, and centre-of-mass sampling
for held segments. It stopped before the worker fixtures, evidence artifact, visible
review, or final pin. **The gate did not pass and `ARTICULATED_HASH` does not exist.**

Reproduce the current corpora with:

```powershell
cargo run --release -p lab -- articulated --seeds 400 --mirrored
cargo run --release -p lab -- articulated --seeds 400 --mirrored --policy windmill
cargo run --release -p lab -- articulated --seeds 400 --mirrored --attack-moves
```

## Measured outcome

The final pre-guard corpus contained 800 trials per condition:

| intended criterion | measured result |
|---|---|
| fewer than 10% of trials reach the clock | **99.0%** composed, 97.5% windmill, 98.9% closing |
| contact-cap hits equal zero | **51,664** composed |
| composed efficiency at least 6/5 of windmill | composed decided **8** of 800; windmill decided **20** |
| side advantage at most 20 of 400 | 1; this passed but the threshold has little statistical margin |

A weapon/body contact closed at a median of roughly **113 raw** against the legacy
`IMPACT_THRESHOLD` of **3,932**. The centre-of-mass correction improved the scale
from roughly 59x short to roughly 35x short, but the model still could not end a
representative fight. The later smaller shield reduced blocking and slightly reduced
Brute end health; it did not change that upstream energy limit. The exact current
shield and guard corpus is retained in the
[mechanical reference](../reference/articulated-mechanical-gate.md#correction-v2-20-the-guard-has-a-height-and-the-plate-it-holds-is-small).

## Findings that constrain a successor

1. Per-contact-point velocities are not the missing energy source. The ledger's
   `closure_energy` is built over collider rows and does not read the contact point;
   the prototype left the maximum blow byte-identical and dissipated less.
2. Uniformly rescaling regional health can force outcomes without creating exchanges.
   The measured window ran from no finish to a 31-tick decapitation and never made the
   Fighter take damage. Do not repeat that prototype unchanged.
3. The first stationary-swordsman result was a script artifact: the composed attack
   phases command zero foot movement, while a walking body contributes more closing
   energy than an arm at its present slew ceiling.
4. The solver silently rejected **188,654 ticks**, 6.5% of one corpus, before alpha
   zero was restored as the identity for the world projector. Rejection rolled back
   the whole contact phase. Current corpora report zero rejections.
5. `CONTACT_ENERGY_FLOOR = 144` is billed per fact per tick even though it came from
   a legacy per-swing floor. It measured as a 19.8x over-charge, but sweeping it from
   144 to zero multiplied grazes without materially moving region-taking blows. Its
   form is wrong and it is not the binding constraint.
6. Sampling a held blade at its centre of mass was the only tested change that moved
   region-taking blows in the right shape: 39 to 109 while contact opportunities fell
   26%. It was correct and insufficient.
7. A sample maximum is not a stable tuning statistic. Across five revisions the
   largest-blow ratio read 2.5x, 1.4x, 1.7x, 1.4x, and 3.2x without a calibration
   constant changing. Use mean end health or counts above a fixed bar.

## Open ledger

These are investigation inputs, not authorized changes. A successor plan must choose
and test one rather than inheriting all of them silently.

### Mechanics

- Re-derive `CONTACT_ENERGY_FLOOR` at the granularity billed after the energy scale
  settles. Charging once per contact episode measured at 1.54x the current effect:
  real, but nowhere near sufficient alone.
- Revisit regional maxima only after the physics scale changes; the earlier rescale
  was measured against a model with almost no real blows.
- Measure the arm slew ceiling. `ARM_BEARING_MAX_SPEED_RAW * stat_factor` is 546
  raw/tick for the Fighter and is the largest unexamined upstream lever.
- A body collider carries one velocity for all five regions. An arm swung into a
  blade contributes nothing to closure speed.
- Shield centre comes from the hand while shield normal comes from body yaw. Contact
  can displace the hand faster than the actuator recovers, leaving a measured 0.85%
  tail past ninety degrees even after the static off-arm change narrowed the spread.
- Arm `reach` constrains the horizontal component only. A Fighter shoulder at z 1.4
  can command a LOW hand at z 0.45 before horizontal extension, producing a diagonal
  shoulder-to-hand capsule about 1.47x the nominal arm length.

The former static-shield-height item is resolved. The off arm now has a guard-height
column, the plate is one quarter by one quarter, and a half-step guard lead reaches
six of the nine attack/guard height pairs. The other three remain unreachable under
equal-period clocks; per-run phase randomisation belongs to the evaluation harness.

### Gate hygiene

- `contact_cap_hits == 0` is unreachable as posed and became less reachable as
  contact improved. Replace it with a justified workload-relative criterion.
- The original side-advantage bound is about 1.5 standard deviations wide; a
  symmetric simulation can fail it roughly one run in seven. Amend it before rerun.
- `maxEnergyExcessRaw` cannot establish soundness alone because the solver deletes a
  rejected group's rows. Always report solver-rejected ticks beside it.

### Engineering debt exposed by the attempt

- Pose classification still lacks the effort measurement needed to distinguish
  holding a shield from holding it up.
- The portable stream digest uses a large fixed stack buffer. Move it off the stack
  before increasing publication capacity again.
- The dependency audit's directory exclusion deserves the same adversarial fixture
  discipline as the documentation audit; source-text guards fail open.

## Trace-viewer corrections

The diagnostic viewer paid for several measurement mistakes before its production
successor landed in `#/arena`:

- energy rings must plot the per-contact dissipated share (`cut + thrust + pressure`),
  not the whole group's `before` ledger; on seed 3 those readings said 8 contacts over
  the floor rather than 578;
- the plan projection uses a right-handed y-up frame so anatomical left stays left;
- the health readout names faction aggregate health and separately shows region
  integrity;
- tip-speed display is world-space while the legacy impact threshold is tested
  body-relative, so the comparison is disclosed rather than presented as exact.

Numeric checks found no doubled/dropped body origin, region-arm endpoints agreed at
zero raw over the trace, reconstructed shield corners agreed with fixed-point geometry
within 2.6 raw, presence flags matched collider construction, and each frame carried
the same tick's contacts and health.

## Recommended order

First measure the arm slew ceiling, because it bounds what the downstream calibration
knobs can express. Then choose whether to repair closing velocity or revise the
representative roster scale, re-derive the per-episode energy floor, and amend the gate
criteria before recording fixtures. The current browser arena is the visual tool for
checking each hypothesis; the deleted development-only trace page is not a gate.
