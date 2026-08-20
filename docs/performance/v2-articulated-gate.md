# V2 articulated mechanical gate evidence

**Purpose:** Preserve the measured result, rejected explanations, and open mechanics ledger from the articulated gate attempt.
**Status:** current
**Canonical source:** this record. `lab articulated` and the gate contract in [`articulated-mechanical-gate.md`](../reference/articulated-mechanical-gate.md) were the other two; the command is deleted and the contract is retired as history, so this record is now the only live copy of what was measured.
**Update when:** The articulated fixture, policies, mechanics, gate thresholds, or corpus is changed or remeasured.

**Host:** MSVC x86-64 Windows. **Date:** 2026-08-10, with the shield/guard
follow-up measured later that day.

The gate attempt landed its scripted policies, `lab articulated`, the
solver-rejection diagnostic, the projector correction, and centre-of-mass sampling
for held segments. It stopped before the worker fixtures, evidence artifact, visible
review, or final pin. **The gate did not pass and `ARTICULATED_HASH` does not exist.**

**It cannot be resumed, and that is settled rather than pending.** The articulated
model, its fixture, its scripted policies and `lab articulated` were all deleted on
2026-08-19; there is no fight left for the missing stages to be about, and
`ARTICULATED_HASH` is a name that can never be given a value. The gate contract is
retired as history. **This record is what survives, and it is the part worth having**:
a measured failure with its rejected explanations attached is evidence about the
mechanics, and the mechanics -- the contact solver, the projector correction,
centre-of-mass sampling -- outlived the model that exercised them. The live gate record
for the model that ships is
[`embodied-tactical-policy.md`](embodied-tactical-policy.md).

Smart117 later recorded two semantically identical visible runs of the fixed
`Robust Strike (controlled)` feature preset. That is useful visual/semantic evidence
for one mechanics-selected attack, not the worker artifact, blinded 15-clip review,
foreground frame-time measurement or generalized Tactical corpus this gate requires.
It therefore corrects any broad claim that no articulated strike has visible evidence
without changing this gate's failed result.

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

### The clock criterion is met, 2026-08-15

`articulated --seeds 100 --mirrored` (200 trials), before and after Smart134 doubled
`ARM_BEARING_MAX_SPEED_RAW`/`ARM_BEARING_ACCEL_RAW`:

| script | reached the clock, old pair | reached the clock, doubled | severances | Brute end health |
|---|---:|---:|---:|---:|
| composed | 98.0% | 98.0% | 16 -> 76 | 0.928 -> 0.727 |
| composed + closing footwork | 95.5% | **85.5%** | 20 -> 144 | 0.843 -> 0.499 |
| windmill | 97.0% | **3.5%** | 31 -> 471 | 0.694 -> 0.013 |

**The windmill control clears "fewer than 10% reach the clock" outright**, which no
configuration in this document had ever done. This is the paired half of
`ARTICULATED_STREAM_DIGEST`'s sixth move; see its
[registry row](../reference/hashes.md#golden-registry).

Three things this does **not** license. It is one criterion of four, and the other
three are unretested here -- cap hits are 2,545 for the windmill and 7,885 for
composed, nowhere near the zero the old table demanded, and that criterion was already
recorded as unreachable. It is **one-sided**: the Fighter ends every doubled variant
above `0.959` and takes 193 kills to nil, so what passes the clock is an execution
rather than the exchange a representative gate wants. And the criterion is met by the
*control*, not by the composed script, which converts almost none of the same increase
-- it commands `effort: Fx::ZERO` on eight of twelve phases and arrives inside the
other four, so it spends 68.6% of its ticks with a bearing step of exactly zero. The
mechanism and the measured phase-length response are in the
[tactical policy record](smart-ai-tactical-policy.md). The gate criteria still need the
amendment this document's findings call for before any of this becomes a pass.

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

   **Superseded 2026-08-15, and the second clause is now false.** Splitting blade-tip
   travel into the arm's own contribution and the body's translation (mean raw/tick,
   Fighter) shows the arm term leading wherever the arm is actually driven: windmill
   `2,864` arm against `1,581` body at the old ceiling, `4,733` against `2,621` at the
   doubled one. The claim only ever described the *composed* script's arm, which is
   idle two thirds of the time -- a statement about the script, not about the ceiling.
   The two are separate channels, and the body term barely responds to slew at all
   (`615` to `774` planted). As a delta the old claim was roughly right at the old
   ceiling -- restoring the feet bought about as much whole-fight tip speed as
   doubling the ceiling -- but even then the doubling was worth twice as much damage
   (Brute end health `-0.212` against `-0.108`). The two effects are super-additive,
   each roughly twice as large in the other's presence, which is the cross term in
   `(v_body + v_arm)^2` behaving as it should.
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

### A swung club cannot wound, and that is an identity, 2026-08-16

Measured after two interventions each moved its own mechanism and left the outcome
unchanged: session 02 halved the club's effective inertia (Brute health 0.4989 ->
0.5271) and session 03 gave it a policy that aims off the plate (weapon/shield share
9.68% -> 8.70%). **The Brute recorded zero kills in all six configurations, and the
Fighter's end health never left 0.9885-0.9985 under any pairing.**

The cause is structural rather than statistical. `channels` in
`crates/sim/src/combat/resolution.rs` scales the transverse component by the **weapon's
own** `edge_factor`, and `club()` in `crates/sim/src/combat/spec.rs` carries
`edge_factor: Fx::ZERO` against the sword's `Fx::ONE`. A swing is transverse motion, so
a club's whole allocated share becomes `pressure` -- and `pressure` reaches no anatomy:
`ContactProjector` bills `incoming = cut_raw + thrust_raw`, and the string does not
appear in `crates/sim/src/anatomy.rs` at all. The club's only wounding channel is axial,
at `point_factor` one half.

**So neither arm authority nor the shield was ever the Brute's binding constraint**, and
the deficit ranking that named them is wrong at its head. Both experiments were
delivering more transverse club energy into a channel multiplied by zero.

The answer is *not* to make a wooden club cut. It is that blunt force has no
representation: the model already separates integrity loss from bleeding through
`cut_share`, so "damage without a bleeding wound" is an established shape that crushing
fits exactly. The shipped rule and its coefficients are
`Material::crush_factor` in `crates/sim/src/combat/spec.rs`, with the formula in
[contact solver](../reference/contact-solver.md) and the wound split in
[anatomy and health](../reference/anatomy-health.md#armor-and-wound-transfer); the
session that landed it also recorded the sword-side trap, which is that a blade's
`pressure` is identically `CONTACT_ENERGY_FLOOR`, so billing crush on the share rather
than on what the edge and point declined would have been a larger change to the sword
than to the club.

#### Resolved the same day: the club can wound, and the fight changed

`Material::crush_factor` bills the energy the edge and the point declined -- `Wood`
three quarters, `Steel` seven eighths, `Flesh` zero -- and `incoming` becomes
`cut + thrust + crush`. Billing it on the *declined* remainder rather than on the share
is what keeps the energy floor a floor and leaves a blade exactly unchanged.

On `lab articulated --seeds 100 --mirrored --attack-moves --b-two-handed on`, against
the session-04 baseline of Fighter `0.9907` / Brute `0.5009` / 0 Brute kills / 13.0%
decided / 137 severances:

| | before | after |
|---|---:|---:|
| Fighter end health | 0.9907 | **0.8575** |
| Brute end health | 0.5009 | 0.5281 |
| Brute kills | **0** | **2** |
| Fighter kills | -- | 20 |
| Fighter wins | 200/200 | **191/200** |
| decided by a body | 13.0% | 11.0% |
| severances | 137 | 116 |

Both predeclared bar conditions are met: the Brute-kills column stops being zero, and
the Fighter's end health leaves the `0.9885-0.9985` band it had never left in any
measured configuration. The Brute wins nine trials, which is the first time it has won
any. Under the plain composed script the effect is larger still -- 6 Brute kills
against 1 Fighter kill, both bodies ending near `0.76`.

Neither number was tuned against: the coefficients come from the stiffness argument in
`Material::crush_factor` and were fixed before the corpus was run.

Note the two counts that went **down**: severances `137 -> 116` and body decisions
`13.0% -> 11.0%`. That is not a regression hiding in a win. Crush costs integrity and
opens no bleeding wound -- `cut_share` scales the wound by the cut fraction, and a
club's cut is structurally zero -- so a club now removes a body's structure without
starting its bleed clock, and both fighters spend longer alive while taking real damage.
The legacy surface is unmoved at `59.5%` on `duel --seeds 400`.

Two corrections to numbers quoted elsewhere, both established in the same measurement:

- **"Roughly 35x short" is a speed ratio, and the damage law consumes `v^2`.** In the
  quantity actually billed the gap is nearer 1,200x, and the flat 144-raw floor is
  subtracted *after* the squaring -- so below about 0.07 units/tick of closure the
  damage is exactly zero rather than merely small. That threshold shape, not a smooth
  shortfall, is why the model is bimodal between a windmill deciding 96.5% and
  `attack-moves` deciding 8.5%.
- **The gap is stale as well as mis-stated.** It was recorded on 2026-08-10 and nobody
  re-measured it after the 2026-08-15 slew doubling. By mean blade-tip speed the ratio
  is now roughly 20x for the windmill and 29x for the composed script.

The windmill/composed split itself is an **arrival** result, not an aim result: the
composed arm is commanded at full effort in four of twelve phases and its bearing step
is exactly zero on 68.6% of ticks, against the windmill's full reach and full effort
every tick. Widening the commanded arc and avoiding the plate were both tested and both
failed to move the outcome, which is the signature this reading predicts.

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
- The portable stream digest used a large fixed stack buffer. The retained exact
  work later moved to heap-owned scratch and measured a 422,384-byte active feature
  call chain; the warning remains historical provenance for any future publication
  capacity increase.
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

## Recommendation at the failed gate

The recommendation at this stop was to measure the arm slew ceiling first, because it
bounds what the downstream calibration
knobs can express. Then choose whether to repair closing velocity or revise the
representative roster scale, re-derive the per-episode energy floor, and amend the gate
criteria before recording fixtures. The current browser arena is the visual tool for
checking each hypothesis; the deleted development-only trace page is not a gate.

The exact-contact successor has since retained and registered its feature-only
trajectory/lifecycle and lifted-Coulomb mechanics. That supersedes the missing-response
part of this order, not the failed representative corpus or its invalid thresholds.
Ordinary matched Tactical evidence has since stopped structurally. Smart130 localized
the earliest controlled-arm solver-count difference to tick 46, where the reference
first rejected segment/body scan pair reports `budget` and held's public rejected-pair diagnostic is
absent; this is neither a contact-cap hit nor a causal mechanics result. Smart131 then
found the earlier bounded-path distinction: reference entered two region rows while
held exited `pair_aabb_disjoint` with none. Smart132 then localized the pair-control
difference to the A-side ordinal-0 segment-hilt start-point X operand. The next work
is only that frozen operand's
[construction provenance](smart-ai-matched-tactical.md#frozen-ordinal-31-tick-46-pair-aabb-control-transcript).
A revised full gate still needs declared criteria, its own artifacts and visible review
before `ARTICULATED_HASH` can exist.
