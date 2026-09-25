# A contact reading taken at one instant

2026-09-25. This follows `2026-09-25-rate-tempo.md`, section 4, and `2026-09-25-rate-whip.md`,
section 7 and open items 1 and 2.

The opt-in reading `CONFIG.combat.contactReading: "arrival"` scored a contact from the striker's
velocity before the solver step that found it. It priced everything else from after the step:

- the centre of mass the lever was taken about;
- the edge, the blade and the tip;
- both effective masses.

Havok's point and normal belong to neither end. They come from the collision detection, which
runs before the step integrates. This change reads all of it at the step's start.

It also found a hole next to that one. The impossible-speed guard read the settled speed while the
reading billed the arrival. The guard now reads the speed that is billed.

**What is compared.** The protocol is the tempo study's 192-bout set: the Node research runner
(`research/stat-sweep.mjs --stat weight --levels 1 --pairs 96`), seed 20260923, PROBE_MINDS, stone
golems, supported locomotion and a 150 s cap. It is run on each named build's mirror.

- **s240**: physics at 240 Hz.
- **t120**: physics at 120 Hz, with Havok's ideal step held at 1/240 by `solverTuningHz`.
- **settled**: the default reading.
- **kNN**: the arrival reading at fraction NN/100.

The preload `.review/contact/hz.mjs` (not committed) sets the rate, the reading and the fraction
before any harness module reads them. A second preload, `.review/contact/probe.mjs`, logs every
resolved contact read three ways:

- as scored;
- at the step's start;
- with main's mixed reading.

It also re-scores each contact at a range of fractions. It runs its own `StepStart`, so it reads
without writing. With it loaded, the settled sets match the tempo study's `tempo-s240` and
`tempo-t120` in all 192 bouts each, and again after the guard change.

**Figures.**

- Every figure is from the Node research runner unless it says otherwise.
- Intervals are 95 %.
- "Clustered" means clustered by unordered mind pairing, which gives 10 clusters and a t on 9
  degrees of freedom. Every bout of a pairing opens the same way
  (`2026-09-25-rate-control-clock.md`), so the clustered interval is the honest one. It runs up to
  3.5 times the naive interval, and on a few rows it is narrower.
- **Paired** means the same bout id in both sets.

## Answer

- **Every quantity of an arrival reading is now read at the step's start.** That covers the
  velocity, the lever and centre of mass, the edge, the blade and the tip, and both effective
  masses.
  - The contact point lies on the striker's own collider in that pose: residual p90 0.7-1.3 mm on
    every striker but the plate (3.9 mm, its convex radius), against 12-71 mm after the step.
  - The whip's 60 mm weight, a sphere, has a lever of exactly 0.0 mm at both rates. It is priced
    at 0.415 kg at both, against a truth of 0.42 kg.
  - The mixed reading priced it at 0.353 kg at 240 and 0.244 kg at 120.
- **The cost is small.** Poses are copied from `mesh.position` and `mesh.rotationQuaternion`, with
  no plugin read and no allocation. That is 46 bodies per `Combat` on the default mirror, and 54 on
  a whip. It adds no plugin read beyond the two per striker per substep that main's arrival reading
  already made.
- **The guard was letting flung blades through.** A blade the solver had flung to 40-228 m/s in the
  step before was slowed by the step that found the contact. The guard therefore read under 40 m/s,
  and the reading billed the fling.
  - This is 0.07 % of contacts at 240 and 0.10 % at 120.
  - Those contacts carried almost a quarter of what the unguarded reading billed at 240.
  - They also caused the four 1.08 s bouts that the tempo study saw at t120.
- **The new fraction is 0.56.** It keeps the settled 240 fight's length: Δ ln s −0.022 ± 0.136
  (clustered ± 0.468). Δ ln s falls 0.048 per 0.01 of fraction and crosses zero at 0.554.
- **The reading is rate-invariant on four mirrors of five, and the two exceptions are in length
  only.** Paired t120 against
  s240 under the same reading:
  - Every build but default is within ±0.033 in ln s and ±0.02 damage/s. Settled leaves +0.045 to
    +0.246 there.
  - Default is +0.126 ± 0.115 (clustered ± 0.220), against settled's +0.345. Its damage/s is
    invariant (+0.018 ± 0.097).
  - Whip against default: the whip's blows per minute and damage per bout are invariant, and it
    prices its weight at 0.415 kg at both rates. The bout's length crosses, from +0.135 under
    settled to −0.104 ± 0.046 (clustered ± 0.078).
- **It is not free at 240, and the switch is the owner's call.** On the default mirror the miser
  gains 37.5 ± 13.0 points and the duelist loses 22.9 ± 13.5.
  - That is more than twice main's mixed reading at 0.60 (+15.6 and −14.6).
  - The cause is the edge. The miser's cuts arrive edge-on, and the contact step turns the edge
    8.4° on average, against about 5° for the other minds. The consistent reading prices the cut
    as it arrived.
  - On the other builds one fraction cannot keep every weapon's length, because the settled
    reading keeps a different share of each striker's arrival. Their fights run 6-15 % longer at
    0.56, and they bill 15-43 % less damage per second.
- **Open item 2 of the whip study is the contact mix, not the reading.** Bead contacts read 0.89 of
  their 240 effective mass at 120. The chain behind them is not lighter: at the bead's origin the
  ratio is 1.01-1.07.
  - Twice as many bead contacts are found 30 mm or more from the target at 120: 51.5 % against
    25.7 %.
  - A manifold found that early puts its closest point further round the capsule, toward the
    cap, where the lever is larger.
  - Reweighting to 240's distances recovers two thirds of the gap.

## 1. What is read, and when

`src/step-start.ts` is new. A `StepStart` subscribes to `scene.onBeforePhysicsObservable`, which
runs before every solver step on the physics clock. Before each step it samples:

- **each watched striker's linear and angular velocity.** That is two plugin reads, about 400 B by
  `AGENTS.md`'s figures, and exactly what main's arrival reading already did.
- **the pose of every body a reading may walk.** A pose is `mesh.position` and
  `mesh.rotationQuaternion`, which `syncTransform` wrote at the end of the previous step. It is
  seven floats into storage allocated once. There is no plugin read and no allocation, and it
  stamps no render id. The bodies are the connected components, through `rig.ts`'s joints, of the
  `Combat`'s own strikers and of the target it is attached to. That is the same walk
  `effectiveMassAt` makes, so a walk never leaves the set.

`Combat` reads a contact as follows:

- **The velocity** is `v + w × (p − c)`. `c` is the striker's centre of mass carried back to the
  step's start.
- **The edge, the blade and the tip** are carried back the same way, through the striker body's own
  change of pose over the step. That is exact because every `Striking` answer is fixed in its body.
  `Striking.centreOfMass` now states that contract, and every solid striker in `src` is a
  `RigidStrike`, which meets it.
- **Both effective masses.** `effectiveMassAt` in `src/body-inertia.ts` takes a `pose` option (a
  `PoseSource`). Every link and every joint frame is placed from it.
- **The impossible-speed guard** reads the whole arrival speed, before the fraction.
- **A trigger's contact point** is carried back through the striker. No trigger implementer exists
  in `src` today.

Projectiles keep their own cached arrival state. Under `"settled"`, `Combat` builds no `StepStart`,
adds no observer, and every quantity is read exactly as before.

**Cost.** Measured in the Node bout runner on a box running 16 other bout lanes, over 120 frames at
240 Hz. The time is per `Combat` per substep:

| mirror | poses | strikers | pose copy | velocity reads | one frame in all |
|---|---:|---:|---:|---:|---:|
| default | 46 | 2 | 12.3 µs | 6.8 µs | 10.0 ms |
| whip v default | 54 / 54 | 6 / 2 | 11.9 µs | 9.8 µs | 8.7 ms |
| maul | 44 | 1 | 8.3 µs | 3.5 µs | 6.7 ms |
| fists | 46 | 2 | 9.4 µs | 4.8 µs | 7.2 ms |

A frame is four substeps and a bout has two `Combat`s, so eight captures a frame. That is 0.09-0.17
ms of a 6.7-10 ms frame, or 1.4-2.0 %. The velocity reads were already in main's arrival reading,
and the pose copies alone are about 1 %. Readings under load vary by about half between runs; an
earlier run of the same script read 14-18 µs of pose copy against 8-13 ms frames.

## 2. The reading is of one instant

**The mechanism, on a free body.** A 1 kg sphere was driven obliquely into a free 20 kg capsule
through one real solver step, in the Node headless arena (`.review/contact/sphere.mjs`):

- Against the pre-step pose the lever is 0 mm at 240 and at 120. The event point lies exactly one
  radius from the centre, and the sphere prices at 1.000 kg.
- Against the post-step pose the lever is 43 mm at 240 and 87 mm at 120. The sphere prices at
  0.160 kg and 0.045 kg.

`a_sphere_is_priced_at_its_own_mass_whatever_the_step_length_under_an_arrival_reading` in
`tests/contact-reading.test.mjs` pins this at both rates.

**In bouts.** The table gives the median effective mass of the striker over all of its contacts.
The residual is the signed distance of the event point from the striker's collider, p50 / p90:

| striker | truth | step's start, 240 / 120 | after the step, 240 / 120 | \|residual\| at start, 240 (mm) | after (mm), 240 / 120 |
|---|---:|---:|---:|---:|---:|
| whip weight (sphere) | 0.42 kg | **0.415 / 0.415** | 0.353 / 0.244 | 0.2 / 0.7 | 7.1 / 24.1, 12.9 / 45.7 |
| whip beads | -- | 0.258 / 0.244 | 0.121 / 0.070 | 0.1 / 0.8 | 5.8 / 17.2, 11.5 / 47.8 |
| wrist blade | -- | 2.083 / 1.996 | 2.062 / 1.937 | 0.3 / 1.2 | 3.4 / 27.2, 9.4 / 71.0 |
| mace | -- | 5.919 / 5.795 | 5.901 / 5.746 | 0.1 / 0.9 | 4.5 / 15.3, 8.2 / 27.1 |
| maul | -- | 41.27 / 40.43 | 41.27 / 40.25 | 0.2 / 0.8 | 3.9 / 12.4, 7.2 / 21.1 |
| fist | -- | 4.397 (240) | 4.400 (240) | 0.2 / 0.7 | 5.3 / 17.4 (240) |
| plate | -- | 5.41 / 5.34 | 5.42 / 5.36 | 1.0 / 3.9 | 3.6 / 11.3, 5.6 / 19.6 |

Sets: the whip rows are from `whip-s240-settled` and `whip-t120-settled`, the blade and plate rows
from the default sets, and the others from their own builds' settled sets. The probe reads every
column from the same contacts.

- **The weight's truth** is the whip study's rigid-body figure from the Node golem bench:
  - 0.423 / 0.426 kg with the event point against the pre-step pose;
  - 0.419 / 0.415 kg with the point carried by the centre of mass's step.

  Its lever about its own centre is 0.0 mm at the median and at p90, at both rates.
- **Only light, fast, round strikers were mispriced much.** The mixed reading cost the weight 15 %
  at 240 and 41 % at 120, and the beads 53 % and 71 %. On everything else it cost 0-3 %.
- **The plate's residual at the start is about 1 mm,** and larger than the others'. The
  likeliest cause is the box's convex radius, since Havok rounds a box's corners and the probe
  measures against the sharp box. Its p50 holds at 1.0-1.3 mm in every set and at both rates,
  where a pose error would grow with the step.

The test that the reading stays consistent is
`an_arrival_reading_describes_the_step_s_start_whatever_the_solver_did_to_the_bodies_after_it`.
Between the pre-step sample and the callback it moves and turns every part of both golems. It then
asserts that every priced field of an arrival reading is unchanged:

- speed and closing speed;
- both effective masses;
- energy;
- edge, blade and tip;
- transfer.

Its control shows the move in a settled reading.

**Mutation check.** The battery is `.review/contact/mutate.mjs`, and 12 of 12 mutations turn the
file red:

- no pose for the effective masses;
- the centre of mass, the tip, the edge or the blade read where it is now;
- the rotation delta composed the wrong way round;
- poses never captured;
- joint frames or links placed where they are now;
- the target not tracked at attach;
- the guard reading the settled speed;
- the fraction not applied.

## 3. The guard

`CONFIG.combat.impossibleSpeed` (40 m/s) refuses a striker whose speed is the solver's rather than
a blow's. Main's arrival reading checked it against `velocityAt`, the speed after the step. The
step that finds a contact has usually just slowed the striker. So a blade flung before the step
came in under 40 m/s and was billed at its fraction of the fling.

These are the probe's counts over settled bouts, of contacts whose whole arrival speed exceeds
40 m/s:

| set | contacts | over 40 m/s | over 60 m/s | largest |
|---|---:|---:|---:|---:|
| default s240 | 48 617 | 35 | 23 | 220 m/s |
| default t120 | 65 471 | 68 | 40 | 229 m/s |
| whip s240 | 122 476 | 73 | 27 | 102 m/s |
| mace s240 | 127 841 | 36 | 15 | 124 m/s |
| fists s240 | 146 801 | 59 | 13 | 91 m/s |

- **The settled set's two 0.90 s bouts** end on a blade that arrived at 220 m/s and was read after
  the step at 37 m/s, just under the guard. Settled bills it at 10.5 and severs the pelvis.
- **Unguarded, the flings were most of the arrival reading's tail.**
  - At 0.54 the unguarded t120 set had four 1.08 s bouts at 122 damage/s. Each ended on one blade
    that arrived at 228 m/s and was read after the step at 36.6.
  - Main's mixed reading lets the same blow through. It caused the tempo study's four 1.08 s bouts
    in `tempo-t120a60` and `tempo-t120a55`: the same bout ids and the same length.
  - Across the unguarded sets, single blows billed up to 253.
- **Offline, the guard changes what 0.60 bills against settled.** Re-scored over the default s240
  set, 0.60 bills 1.35x the settled damage without the guard and 1.04x with it.

`an_arrival_reading_refuses_an_impossible_speed_on_the_speed_it_would_bill` pins this:

- a blade handed 60 m/s before the step and 2 m/s after it is refused under arrival;
- the same blade is scored under settled;
- a 36 m/s arrival is scored.

## 4. The fraction

The settled 240 fight's length was the anchor, as it was for 0.60. Each set is 192 bouts on the
default mirror, compared with 240 settled:

| 240 arrival | median s | pooled damage/s | Δ ln s | Δ bout damage/s |
|---|---:|---:|---:|---:|
| settled | 14.95 | 0.786 | -- | -- |
| 0.56 | 14.58 | 0.699 | −0.022 ± 0.136 (cl. ± 0.468) | −0.173 ± 0.197 (cl. ± 0.474) |
| 0.58 | 12.77 | 0.780 | −0.131 ± 0.129 (cl. ± 0.432) | −0.063 ± 0.189 (cl. ± 0.444) |
| 0.60 | 10.87 | 0.858 | −0.225 ± 0.127 (cl. ± 0.399) | +0.044 ± 0.188 (cl. ± 0.442) |
| 0.62 | 10.13 | 0.968 | −0.311 ± 0.121 (cl. ± 0.378) | +0.159 ± 0.188 (cl. ± 0.435) |

- **The slope places the fraction.** Δ ln s falls 0.048 per 0.01 and crosses zero at 0.554, so
  **0.56**.
  - A single set's clustered interval is about ±0.45 in ln s. That is ±0.09 in fraction, so no
    single set could choose it.
  - The four sets lie on one line within ±0.01.
- **Length and damage per second cannot both be kept.**
  - At 0.56 a bout ends on less damage in all: 13.7 at the median against 15.9 settled (means 13.9
    and 15.3). So pooled damage/s is 0.89x.
  - Pooled damage/s is kept at about 0.58, and the paired bout damage/s at about 0.59. There,
    fights are 12-16 % shorter.
  - For main's mixed reading the tempo study found the same split: 0.60 kept length at 1.15x the
    damage per second.
- **Why 0.56 is below 0.60.** Offline over the default s240 set, the consistent reading at 0.60
  bills 1.18x the mixed one on the same biting blade contacts, and almost all of that is the edge
  (section 6). The guard pulls the other way, by removing the flings.
- **Before the guard**, the same sweep put the crossing at 0.536
  (`research/runs/ng-cr-default-s240-k54` to `-k60`, not committed). Those sets are superseded.

## 5. Rate invariance

This compares t120 with s240 under the same reading, paired by bout:

| build | settled Δ ln s | settled Δ damage/s | 0.56 Δ ln s | 0.56 Δ damage/s |
|---|---:|---:|---:|---:|
| default | +0.345 ± 0.137 (cl. ± 0.263) | −0.408 ± 0.217 (cl. ± 0.426) | **+0.126 ± 0.115 (cl. ± 0.220)** | +0.018 ± 0.097 (cl. ± 0.123) |
| mace | +0.246 ± 0.056 (cl. ± 0.088) | −0.084 ± 0.021 (cl. ± 0.033) | −0.023 ± 0.034 (cl. ± 0.029) | +0.018 ± 0.012 (cl. ± 0.015) |
| maul | +0.093 ± 0.064 (cl. ± 0.082) | −0.029 ± 0.070 (cl. ± 0.076) | +0.033 ± 0.049 (cl. ± 0.061) | −0.019 ± 0.023 (cl. ± 0.031) |
| whip | +0.045 ± 0.038 (cl. ± 0.054) | −0.014 ± 0.012 (cl. ± 0.016) | +0.005 ± 0.026 (cl. ± 0.029) | −0.002 ± 0.007 (cl. ± 0.009) |
| fists | +0.064 ± 0.030 (cl. ± 0.045) | −0.023 ± 0.009 (cl. ± 0.016) | −0.026 ± 0.019 (cl. ± 0.026) | +0.012 ± 0.008 (cl. ± 0.011) |

- **Four builds of five are rate-invariant within their intervals**, where settled was not.
- **Default keeps a third of its gap in length, but not in damage/s.**
  - The residual +0.126 is outside the naive interval and inside the clustered one.
  - The t120 set also takes 0.71 more knockdowns a bout (± 0.58, clustered ± 1.71). A bout that
    runs longer at the same damage rate ends on more damage in all, so the extra length is not
    blows lost to the reading. What it is made of was not established here. The rise in
    knockdowns at 120 is the subject of the separate study "knockdowns rise at 120 Hz", and it is
    the first suspect.
- **The same reading at the old fraction and without the guard read −0.003 ± 0.139** (0.54, not
  committed). Part of that closeness was the flings: t120 had four 1.08 s bouts from them, and
  s240 two.

## 6. What it costs at 240

**Default mirror.** Score is 1 for a win and 0.5 for a draw, over each mind's 96 sides. The
difference is paired over the same slots.

| mind | settled | 0.56 | 0.56 − settled | main's 0.60 − settled (tempo) |
|---|---:|---:|---:|---:|
| brawler | 49.0 | 44.8 | −4.2 ± 12.3 | 0.0 ± 11.2 |
| champion | 58.3 | 47.9 | −10.4 ± 12.6 | −1.0 ± 10.8 |
| duelist | 52.1 | 29.2 | **−22.9 ± 13.5** | −14.6 ± 12.0 |
| miser | 40.6 | 78.1 | **+37.5 ± 13.0** | +15.6 ± 13.1 |

**Why the miser.** The logged default s240 blade contacts were re-scored at 0.60, with the flings
excluded. Each column below swaps one quantity from main's mixed reading to the step's start. The
figure is the total damage billed.

| attacking mind | mixed | + closing | + masses | + edge | + blade, tip | all at the start |
|---|---:|---:|---:|---:|---:|---:|
| brawler | 578 | 555 | 562 | 635 | 578 | 596 |
| champion | 667 | 645 | 696 | 730 | 667 | 737 |
| duelist | 686 | 664 | 716 | 764 | 686 | 774 |
| miser | 504 | 496 | 518 | **770** | 504 | **776** |

The same contacts, closing at 3 m/s or more:

| mind | mean \|edge\|, start | after the step | mean turn of the edge in the step | edge-on (\|edge\| ≥ 0.7), start / after |
|---|---:|---:|---:|---:|
| brawler | 0.749 | 0.733 | 5.1° | 71.4 % / 69.2 % |
| champion | 0.758 | 0.731 | 4.9° | 70.8 % / 66.5 % |
| duelist | 0.762 | 0.734 | 4.9° | 71.6 % / 67.7 % |
| miser | 0.807 | 0.717 | **8.4°** | **81.1 % / 59.0 %** |

**Reading the tables.**

- **The miser's cuts arrive edge-on more than anyone's**, and the step that finds them turns the
  blade the most.
- **Read after the step, it reads worst.** An edge read after the step describes the solver's
  answer to the cut, not the cut.
- **Nothing else moves the miser.** Its gain is the edge alone.
- **The miser stands closer than the others and strikes fully extended**
  (`src/golem/styles/miser.ts`). Why that makes its cuts arrive edge-on, and turn more in the step,
  was not traced. This reading pays for it where the settled one did not.

**The other builds.** The settled reading keeps a different share of each striker's arrival. The
table gives damage billed against settled, offline over each build's s240 settled set, guarded:

| build | striker | 0.55 | 0.60 |
|---|---|---:|---:|
| default | blade | 0.87 | 1.07 |
| default | plate | 0.59 | 0.79 |
| mace | mace | 0.80 | 1.00 |
| maul | maul | 0.54 | 0.68 |
| fists | fist | 0.52 | 0.74 |
| whip | beads | 2.59 | 3.33 |
| whip | weight | 1.88 | 2.90 |
| whip | all, plate included | 0.70 | 0.91 |

- **Heavy and blunt strikers keep more of their arrival through the step,** so one fraction bills
  them relatively less.
- **The whip's own strikers are the opposite.** Settled priced their mass at half or less
  (section 2), and it bills them very little: 456 and 158 biting contacts in 192 bouts.
- **Most of a whip build's damage is its plate's.** Its whole bill therefore goes down with the
  others.

At 240 against settled, one fraction set on the blade gives:

| build | Δ ln s | Δ bout damage/s | largest mind shift |
|---|---:|---:|---|
| mace | +0.128 ± 0.054 (cl. ± 0.100) | −0.056 ± 0.020 (cl. ± 0.040) | duelist +6.3 ± 11.9 |
| maul | +0.141 ± 0.068 (cl. ± 0.165) | −0.085 ± 0.046 (cl. ± 0.063) | duelist +15.6 ± 11.7, miser −14.6 ± 13.9 |
| whip | +0.059 ± 0.041 (cl. ± 0.076) | −0.021 ± 0.013 (cl. ± 0.027) | miser −17.7 ± 12.7 |
| fists | +0.098 ± 0.035 (cl. ± 0.057) | −0.052 ± 0.011 (cl. ± 0.026) | champion −12.5 ± 11.3, brawler +10.9 ± 12.7 |

The task ruled out per-weapon factors. These fights are 6-15 % longer at 0.56, and they are
already 65-105 s long at the median.

## 7. Open item 2: beads at 120

Whip mirror, settled sets, contacts closing at 2 m/s or more, all read at the step's start
(`.review/contact/beads.mjs`).

- **The weight** reads 0.415 kg at both rates, with a lever of 0.0 mm.
- **The beads** read 0.248 kg at 240 and 0.221 at 120, a ratio of 0.89.

The table bins the bead contacts. "At origin" is the effective mass along the same normal at the
bead's own origin, with the lever removed:

| bin | n 240 / 120 | 240 | 120 | 120/240 | at origin, 120/240 |
|---|---:|---:|---:|---:|---:|
| bead 4 / 5 / 6 / 7 | | | | 0.94 / 0.84 / 0.90 / 0.89 | 1.05 / 1.03 / 1.03 / 1.04 |
| axial < 0.3 | 8 400 / 7 960 | 0.287 | 0.288 | 1.01 | 1.01 |
| axial 0.3-0.6 | 8 610 / 8 295 | 0.338 | 0.348 | 1.03 | 1.02 |
| axial 0.6-0.9 | 17 137 / 19 294 | 0.147 | 0.128 | 0.87 | 1.02 |
| manifold 0-10 mm | 10 136 / 5 441 | 0.266 | 0.287 | 1.08 | 1.02 |
| manifold 10-30 mm | 15 359 / 12 034 | 0.235 | 0.224 | 0.95 | 1.02 |
| manifold ≥ 30 mm | 9 015 / 19 448 | 0.241 | 0.197 | 0.82 | 1.04 |
| closing ≥ 16 m/s | 1 015 / 1 185 | 0.301 | 0.180 | 0.60 | 1.02 |

- **The chain is not lighter at 120.** Measured at the bead's origin it reads 1-7 % heavier in
  every bin above.
- **The reading is consistent at both rates.** The residual p90 is 0.8 mm at each.
- **What differs is where the contact is found.** At 120 the speculative contact is found at twice
  the distance: 31.1 mm at the median against 16.6, and 51.5 % of contacts at 30 mm or more
  against 25.7 %.
  - Between two shapes still that far apart, the closest point on a capsule sits further toward
    its cap. There the lever about the bead is longer, and the effective mass lower.
  - In the 0-10 mm bin, 120 reads heavier than 240.
- **Reweighting 120's contacts to 240's mix:**
  - by manifold distance, it recovers two thirds of the gap (0.239 against 0.248);
  - by bead, axial position and normal together, it recovers one third (0.230).

So open item 2 is the contact mix: the manifold is a prediction made further from the touch at 120.
Pricing a contact where the bodies will actually touch would take advancing the point along the
closing velocity by the gap. That is a different reading and is left open.

## 8. Whip against default

The whip study's own protocol is its `b1` cells: a whip build against a default build, 512 bouts a
cell (PROBE_MINDS in all 16 ordered pairings, 16 replicates each, every one played with the whip on
either side, seeds the same at every rate), the Node bout runner
through the study's `bout.mjs`, and supported locomotion. The script was copied to
`.review/contact/whip/`.

- Clustering is by ordered (whip mind, opponent mind) pairing: 16 clusters, t 2.131.
- The settled cells are bit-identical to the study's `b1-240` and `b1-120`: 512 of 512 bouts each,
  on seconds, damage dealt and taken, and the winner.

Per bout, with naive 95 % intervals:

| | 240 settled | 120 settled | 240 at 0.56 | 120 at 0.56 |
|---|---:|---:|---:|---:|
| whip build's score | 0.010 | 0.010 | 0.004 | 0.002 |
| seconds | 24.3 ± 1.2 | 28.4 ± 1.4 | 26.6 ± 1.5 | 23.6 ± 1.3 |
| whip scored blows/min | 1.47 ± 0.20 | 0.96 ± 0.14 | 5.30 ± 0.38 | 5.95 ± 0.45 |
| whip damage/bout | 0.155 ± 0.072 | 0.117 ± 0.028 | 0.316 ± 0.030 | 0.353 ± 0.039 |
| whip build's damage dealt | 1.26 ± 0.14 | 0.99 ± 0.10 | 1.06 ± 0.09 | 0.98 ± 0.08 |
| whip build's damage taken | 10.95 ± 0.23 | 11.11 ± 0.33 | 9.95 ± 0.23 | 10.07 ± 0.14 |

Paired, naive with clustered in brackets:

| | Δ ln s | Δ whip blows/min | Δ whip damage/bout | Δ build damage dealt |
|---|---:|---:|---:|---:|
| 120 − 240, settled | +0.135 ± 0.068 (± 0.123) | −0.50 ± 0.23 (± 0.28) | −0.037 ± 0.078 (± 0.077) | −0.26 ± 0.15 (± 0.26) |
| 120 − 240, at 0.56 | −0.104 ± 0.046 (± 0.078) | +0.65 ± 0.55 (± 0.58) | +0.036 ± 0.044 (± 0.063) | −0.08 ± 0.09 (± 0.09) |
| 0.56 − settled, at 240 | +0.061 ± 0.057 (± 0.210) | +3.83 ± 0.42 (± 0.48) | +0.161 ± 0.077 (± 0.102) | −0.20 ± 0.14 (± 0.23) |

Effective masses of the strikers, median over contacts closing at 2 m/s or more. "Scored" is
whatever the cell's reading priced.

| cell | striker | scored | at the step's start | after the step | bites |
|---|---|---:|---:|---:|---:|
| 240 settled | weight | 0.306 | 0.417 | 0.306 | 0.40 % |
| 120 settled | weight | 0.158 | 0.416 | 0.158 | 0.09 % |
| 240 at 0.56 | weight | 0.415 | 0.415 | 0.306 | 0.90 % |
| 120 at 0.56 | weight | 0.415 | 0.415 | 0.171 | 1.15 % |
| 240 settled | beads | 0.102 | 0.234 | 0.102 | 0.80 % |
| 120 settled | beads | 0.043 | 0.210 | 0.043 | 0.58 % |
| 240 at 0.56 | beads | 0.233 | 0.233 | 0.095 | 2.84 % |
| 120 at 0.56 | beads | 0.210 | 0.210 | 0.045 | 3.26 % |
| 240 settled | sword (default side) | 1.778 | 1.801 | 1.778 | 23.2 % |
| 120 settled | sword | 1.722 | 1.787 | 1.722 | 18.6 % |
| 240 at 0.56 | sword | 1.738 | 1.738 | 1.713 | 24.6 % |
| 120 at 0.56 | sword | 1.687 | 1.687 | 1.623 | 25.1 % |

**Reading the tables.**

- **The whip's own mispricing is gone.**
  - Settled priced the weight at 0.306 kg at 240 and 0.158 at 120. The arrival reading prices it
    at 0.415 at both, against its rigid-body 0.42.
  - The weight's share of biting contacts no longer halves at 120: 0.90 % and 1.15 %, where
    settled gave 0.40 % and 0.09 %.
  - The whip's blows per minute and damage per bout are rate-invariant within their intervals.
    Settled lost a third of its blows at 120.
  - The beads keep the contact-mix gap of section 7 (0.233 against 0.210).
- **The whip's blows are still worth little.** It scores 5-6 blows a minute worth 0.3 damage a
  bout, against the 10-11 it takes. The whip build wins about 1 bout in 100 under either reading;
  the difference between the cells is inside its interval (± 0.011). The whip study's verdict
  stands: the whip is priced low, not peak-limited.
- **The bout's length is not rate-invariant in this matchup; it crosses.** The 120 bout runs
  +0.135 longer under settled and −0.104 shorter at 0.56 (clustered ± 0.078).
  - The length is set by the default side's blade, which does almost all of the damage.
  - On the default mirror the same reading left t120 +0.126 longer (section 5), and the two
    residuals have opposite signs.
  - This set has no knockdown column. What makes the sign flip here was not traced, and it is an
    open item.

## 9. Verdict, and what is open

**Landed.**

- `src/step-start.ts`.
- The consistent arrival reading in `src/combat.ts` and `src/body-inertia.ts`.
- The guard reading the billed speed.
- `arrivalReadFraction` 0.56, with its table.
- Three tests in `tests/contact-reading.test.mjs`, beside the existing one.

The default stays `"settled"`, and it is bit-identical: 192 of 192 bouts at 240 against
`tempo-s240`, and at 120 against `tempo-t120`.

**The owner's call.**

1. **Whether to switch.** The reading is right, and it is rate-invariant on four builds of five.
   It closes two thirds of default's length gap, and all of its damage-rate gap.
   - It moves the default mirror's mind table by +37.5 for the miser and −22.9 for the duelist.
   - Every mind was searched and tuned under the settled reading, which read the edge after the
     contact step had turned it.
2. **One fraction for every weapon.** It keeps the blade's length, but blunt and fist builds then
   run 6-15 % longer at 240. Per-weapon fractions were out of scope.

**Open.**

1. **The whip-against-default length crosses** (section 8). It is +0.135 at 120 under settled, and
   −0.104 ± 0.046 (clustered ± 0.078) at 0.56. Its whip figures are rate-invariant; the bout's
   length is the default blade's, and why it runs short at 120 there was not traced.
2. **Default's residual +0.126 in ln s at t120.** Damage/s is invariant, and knockdowns rise
   (+0.71 a bout). It is probably the knockdown study's subject, not the reading's, but that was
   not shown.
3. **Bead contacts found early at 120** (section 7). Fixing it means pricing a speculative contact
   where it will touch, not where it was found.
4. **Length against damage/s.** The consistent reading ends bouts on 9-14 % less total damage
   (mean and median), so 0.56 keeps length at 0.89x the damage rate.
   - The likeliest cause is the bar's arithmetic: wounds on an emptied part are wasted, and a
     reading that lands blows on different parts wastes a different amount.
   - That was not measured.
