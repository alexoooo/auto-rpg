# V2 learning probe held-out corpus

**Purpose:** Record the measured comparison v2-19's `expand` / `revise` / `stop` decision was made on.
**Status:** current
**Canonical source:** this record, `crates/lab/src/learn_probe.rs`, and the checkpoint it names
**Update when:** The probe is retrained, the corpus changes, or a condition is added or removed.

**Host:** MSVC x86-64 Windows 11, 20 logical cores. **Date:** 2026-08-11.

Reproduce with:

```powershell
cargo run --release -p lab -- learn-probe train --spec v2-probe
cargo run --release -p lab -- learn-probe evaluate --checkpoint checkpoints/v2-probe.ckpt
```

**The first command does not reproduce the checkpoint below.** It is capped on wall
clock rather than on generations, so a faster or busier host stops somewhere else.
That is why `checkpoints/v2-probe.ckpt` is committed: it is the artifact the decision
is recorded against, and it cannot be regenerated from its own command line.

## The checkpoint

`sha256 7a05fc8c76ad47858ac69f770d595fa556b1bfb81dbf7d62ced831e751e26b6c`, 15,580
bytes.

| setting | value |
|---|---|
| generations requested | 120 |
| generations run | **52 — the 45-minute budget stopped it** |
| wall clock | 2,733.1 s |
| population / elite | 32 / 8 |
| sigma | 0.08, fixed, no step-size adaptation |
| master seed | 20260811 |
| training seeds | 0..6, mirrored: 12 trials per candidate |
| fight length | the fixture's own 3,600 ticks |
| opponent | the frozen composed script |
| best training return | 113.048 |

The champion, generation by generation, at every point it moved:

| generation | 0 | 2 | 5 | 10 | 14 | 15 | 25 | 32 | 33..51 |
|---|---|---|---|---|---|---|---|---|---|
| best | 87.667 | 92.273 | 96.441 | 100.585 | 106.242 | 106.402 | 110.291 | **113.048** | unchanged |

**113.048 is a training return and nothing below is comparable with it.** It is a
mean over twelve trials on six seeds the optimizer selected on; every number in the
tables below is a mean over four hundred trials on two hundred seeds it never saw.
Quoting the two in one sentence is the specific error this paragraph exists to
prevent — the honest held-out figure for the same checkpoint is **88.922**, twenty-four
points lower, and that gap is what a training return is *for*.

**Budget-stopped, and not demonstrably converged.** The champion did not move for the
final twenty generations, which is a plateau and not a proof: an elitist `(mu + lambda)`
strategy at a fixed sigma with no step-size adaptation plateaus for long stretches and
then jumps, and this run was cut at 43% of the generations it was asked for. A
successor's cheapest single action is to finish it.

## Held-out corpus

Two hundred seeds in two orientations, `1000000..1000200`, four hundred trials. The
training seeds this checkpoint records are `0..6`; `HELD_OUT_SEED_BASE` is 1,000,000
and `held_out_seeds_are_disjoint_from_training` is what keeps the gap true when
somebody widens the training set. Fixture `0x068d05fcada1027b` canonical,
`0x6dbf62f0b336050b` mirrored.

Five conditions, all on the heroes, all on the same trials:

- **constant** — a network of zeros. Argmax ties to the lowest index in every head, so
  it is the fixed command *advance, weapon LOW, straight down the line, chamber, guard
  LOW*. **An arbitrary constant, not a principled floor:** which constant it is falls
  out of the order of the entries in each action head, and that order is append-only
  but otherwise arbitrary. A reader who takes this row for a null model will draw a
  conclusion from it that it cannot support.
- **composed**, **attack-moves**, **windmill** — the three scripts, exactly as
  `lab articulated --policy` runs them.
- **learned** — the checkpoint above.

### Against the frozen composed script

| condition | mean | s.e. | bootstrap 95% CI | kills | on points | lost | tick-limit | mean ticks |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| constant | 76.844 | 0.314 | [76.312, 77.510] | 1 | 399 | 0 | 99.8% | 3599 |
| composed | 59.871 | 1.671 | [56.747, 63.227] | 10 | 272 | 118 | 97.5% | 3567 |
| attack-moves | 75.127 | 1.030 | [73.074, 77.272] | 9 | 377 | 14 | 97.8% | 3561 |
| windmill | 84.606 | 1.038 | [82.644, 86.834] | 15 | 385 | 0 | 96.2% | 3543 |
| **learned** | **88.922** | 1.419 | [86.287, 91.962] | **30** | 370 | 0 | **92.5%** | 3480 |

`learned − windmill`: **+4.316 paired, +5.1%**, paired bootstrap 95% CI
[+0.998, +7.945]. The 5% bar is +4.230: the point estimate clears it, the interval's
lower bound does not.

### Against the same script started at a per-run phase

`learn::PhaseShiftedScript` adds one constant tick offset per run, drawn from the run
seed over the script's whole 2,160-tick period, before delegating. It exists because
`ScriptedArticulatedPolicy`'s phase is `tick % 360` and its guard is
`(tick + 45) / 90 % 3`, and features 1 and 2 of the probe's input slice are the cosine
and sine of that phase — so a policy that learns the opponent's timetable and a policy
that learns to fight produce the same mean return.

| condition | mean | s.e. | bootstrap 95% CI | kills | on points | lost | tick-limit | mean ticks |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| constant | 76.699 | 0.418 | [75.966, 77.595] | 2 | 398 | 0 | 99.5% | 3597 |
| composed | 63.639 | 1.269 | [61.162, 66.097] | 4 | 322 | 74 | 99.0% | 3589 |
| attack-moves | 70.769 | 1.117 | [68.597, 72.963] | 6 | 359 | 35 | 98.5% | 3570 |
| windmill | 84.193 | 1.153 | [81.965, 86.498] | 18 | 382 | 0 | 95.5% | 3520 |
| **learned** | **87.797** | 1.376 | [85.147, 90.590] | **28** | 372 | 0 | **93.0%** | 3492 |

`learned − windmill`: **+3.604 paired, +4.3%**, paired bootstrap 95% CI
[+0.095, +6.970]. The 5% bar is +4.210: not cleared.

### Did the phase cost anything? No.

Two verdict lines reading PASS and FAIL invite one sentence — *the edge is a clock
reading* — and it is not what these numbers say. An edge of +5.1% and an edge of +4.3%
against a bar of 5.0% produce opposite verdicts and differ by 0.7 points, which is
nothing beside either interval. The test that answers it is the difference of the
differences, paired trial by trial:

> **phase costs +0.712 of the edge over windmill, paired bootstrap 95% CI
> [−4.209, +5.350].**

The interval contains zero and is seven times wider than the point estimate.
Randomising the opponent's phase did not measurably take anything away, even though
features 1 and 2 of the probe's input slice are the cosine and sine of exactly the
phase that was randomised. **No clock-reading claim is earned in either direction**,
and the two verdicts differ because of where the bar sits.

The control is worth keeping regardless: it cost one wrapper, and it is the only thing
standing between this corpus and a finding invented out of a threshold.

### Contacts, both opponents

Weapon/shield is "defended contacts"; on this fixture the plate is the **Fighter's**,
so the column counts the Brute's club stopped by the candidate's guard. Frozen
opponent above the line, phase-randomised below.

| condition | w/w | w/shield | w/body | head | torso | lArm | rArm | legs | LOW | MID | HIGH | severances |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| constant | 1,285 | 45,119 | 612,557 | **0** | 37,978 | 201,581 | 88,131 | 284,867 | 481,003 | 66,167 | 65,387 | 57 |
| composed | 37,373 | 248,242 | 823,868 | **0** | 201,404 | 294,292 | 256,119 | 72,053 | 218,600 | 370,500 | 234,768 | 33 |
| attack-moves | 75,885 | 269,269 | 899,971 | **0** | 219,361 | 302,258 | 302,418 | 75,934 | 232,891 | 410,640 | 256,440 | 41 |
| windmill | 36,819 | 164,785 | 739,639 | **0** | 166,028 | 304,417 | 197,499 | 71,695 | 242,626 | 240,867 | 256,146 | 83 |
| learned | 35,695 | 142,645 | 834,185 | **0** | 291,530 | 319,705 | 204,036 | 18,914 | 87,261 | 671,331 | 75,593 | 80 |
| constant | 2,131 | 43,167 | 709,333 | **0** | 63,785 | 195,520 | 135,784 | 314,244 | 529,692 | 94,519 | 85,122 | 58 |
| composed | 22,409 | 203,785 | 618,863 | **0** | 152,700 | 245,428 | 164,137 | 56,598 | 155,070 | 295,172 | 168,621 | 22 |
| attack-moves | 21,668 | 223,872 | 808,426 | **0** | 196,853 | 314,635 | 225,806 | 71,132 | 202,453 | 390,554 | 215,419 | 29 |
| windmill | 31,125 | 143,061 | 761,987 | **0** | 168,892 | 258,988 | 260,209 | 73,898 | 248,022 | 240,428 | 273,537 | 66 |
| learned | 21,619 | 127,974 | 833,088 | **0** | 282,586 | 290,208 | 243,037 | 17,257 | 88,922 | 658,279 | 85,887 | 77 |

**Every column pools both fighters.** A weapon/body row is credited to the region it
landed in and the height its *attacker* commanded, and both bodies attack, so
"834,185 weapon/body" is not "the learned policy landed more blows" — the Brute's
club is in the same number. The height columns are still readable because the Brute
runs a script that cycles the three heights evenly, which the windmill row shows: its
242,626 / 240,867 / 256,146 is the even split of two such fighters. Against that,
**the learned row's 87,261 / 671,331 / 75,593 can only be a Fighter welded to MID.**
Separating the directions is a column `Mechanics` does not carry and a successor
measuring an aiming policy will need.

### Safety, replays and cost

| | frozen | phase-randomised |
|---|---:|---:|
| refused submissions | 0 | 0 |
| ticks the contact solver refused | 0 | 0 |
| worst raw energy excess | 0 | 0 |
| contact cap hits | 100,406 | 81,333 |
| replays recorded and replayed exactly | 400/400 | 400/400 |
| inference | 2.93 us per decision over 116,021 | 3.07 us over 116,413 |

**The inference row is the one line here that does not reproduce, and it is not about
the network.** It is a wall clock divided by a decision count. A re-run of the same
command against the same checkpoint on a busy machine returned every other figure
identically — both tables, both verdicts, both bootstrap intervals, the 81,333 cap hits,
400/400 replays — while that row read **14.27 microseconds a decision**, a 3.1x move
with nothing about the model changed. Across recorded runs the same weights have read
**2.93, 3.01, 3.07, 3.41, 4.58 and 14.27** microseconds a decision. What it measures is
the host's load under twenty-way contention. Do not quote it beside a pinned figure, and
do not compare it with the wasm inference number in
[what recording costs](../reference/articulated-abi.md#what-recording-costs), which is a
single pinned thread with a trailing control.

The zero excess is only evidence beside the zero refusals; `World::resolve_contact`
clears the rows a violation would appear in, so read alone the first number is a
tautology. Both are zero. Every held-out learned run was recorded as the ordinary
replay envelope and replayed with no model in the room — `Replay::play` consults no
policy of any kind, and `recorded_learned_replays_do_not_load_the_model` is the
value-level assertion.

Whole evaluation: 216.6 s wall, 4,000 fights plus 800 replays, 20 threads.

## The head column is unreachable, and that is two facts

Zero head contacts in all ten rows. **It means "unreachable", not "the policy chose
otherwise"**, and the two directions it pools are empty for different reasons.
`no_attack_in_the_vocabulary_can_be_credited_to_a_head` in `crates/learn` is the
arithmetic; this is what it says.

- **The Fighter cannot reach the Brute's head at all.** A commanded hand sits at
  `standing_height * height`, `HIGH` is 3/4, and a Fighter stands 1.8 — so the highest
  hand the vocabulary can name is z 1.35. A held blade is horizontal from it:
  `segment_pose` puts the tip at the hilt plus the length rotated in XY only. The
  Brute's head is a sphere of radius 1/4 at z 1.9, so with the sword's 1/25 radius it
  admits a blade axis only from z 1.61 up. **The gap is 0.26 world units** and no
  bearing, reach, posture or footwork closes it.
- **The Brute can touch a Fighter's head and is never credited with it.** The Brute
  stands 2.0, so its `HIGH` club axis is z 1.50, and a Fighter's head sphere (radius
  1/5 at z 1.7) plus the club's 3/50 admits contact within 0.166 horizontally. But
  `contact.rs` picks one region per weapon/body fact by `(time of impact, medial
  distance, region index)` and **the earliest impact wins outright**. At the same
  height the Fighter's torso capsule — axis top z 1.50, radius 7/20 — admits contact
  within 0.401 horizontally, so it is always struck first and always takes the row.

A premise worth correcting because it was wrong in the note that prompted this check:
the Fighter's head band is **1.50..1.90**, not 1.60..1.80. `body_region_volumes`
builds the head as a degenerate capsule, `lower == upper == centre_z`, so
`AnatomyRegionSpec::half_height` is **dead for the head region** and the collider is a
sphere of `radius` about `centre_z`. Reading `centre_z +/- half_height` gives
1.60..1.80 and is a different body.

Not fixed here, and deliberately: a fourth height above `HIGH`, a blade that is not
horizontal, or a region-targeting action head are each their own session's argument.
What this record buys is that nobody reads the zero as a decision.

## What the numbers say that the verdict lines do not

- **The learned policy is the best of the five conditions on both boards**, by
  4.3 points against the windmill and 12 to 29 against everything else, and it **never
  loses** — 0 of 400 in both. It doubles the settled kills, 30 against 15 frozen and
  28 against 18 randomised.
- **A constant beats two of the three scripts.** 76.844 against the composed script's
  59.871 and attack-moves' 75.127. The composed script — the one v2-19 named as *the*
  baseline — loses 118 of 400 to a mirror of itself. A 5% bar over it is a bar a
  network of zeros clears by fifteen percent, which is why the bar this record is
  written against is the best non-learned condition instead.
- **The tick-limit rate moves in the direction v2-17 needs and nowhere near far
  enough.** 96.2% to 92.5%. v2-17's gate wants under ten percent. A learned policy
  bought 3.7 of the roughly 86 points that gate is short, which is the clearest
  statement available of how little room a policy has to express itself inside this
  physics.
- **The learned policy is a near-constant.** It commands MID about eighty percent of
  the time where every script cycles all three heights, and its legs column collapses
  to 18,914 from the windmill's 71,695. What it appears to have learned is *one*
  posture-and-height combination better than the zeroed network's, not a policy that
  reads the threat and answers it — which is the specific thing v2-19 gave it an edge
  to do, and the reason the `revise` arm names the action and observation design.
