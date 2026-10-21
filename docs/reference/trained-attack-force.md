# Trained-adult attack force

What a trained adult's punch and kick deliver (`TRAINED_ATTACKS`), and how the game's punches
and front kicks are measured against them (`research/attack-force.mjs`: `slidingPeak`,
`strikeEffort`, `forceAdmission`). No paired-limb family qualifies for parity, and no body
strength, assist or damage multiplier is changed by these measurements.

## Primary references

| Technique and population | Peak force, mean +/- SD | Impulse, mean +/- SD | Protocol |
| --- | ---: | ---: | --- |
| Direct punch, 16 male military cadets | 2,501 +/- 625 N | 17.2 +/- 3.5 N s | Three maximum-effort punches, mean of trials, head-height padded force plate |
| Barefoot front kick, sub-elite professional soldiers | 5,551 +/- 1,243 N | 153.5 +/- 29.5 N s | Six maximum-effort kicks, all trials analysed, abdomen/solar-plexus force plate |

**The punch**: [Vagner et al., Sports 2024, Table 1 and methods](https://doi.org/10.3390/sports12080205)
([author article](https://pdfs.semanticscholar.org/7131/eb7790c6f6600336e3e21efda7903b9fb81a.pdf)).
Right-handed cadets with three years of twice-weekly close-combat lessons. The plate sampled at
1,000 Hz or more under a 25 mm mat; a 5 Hz zero-phase high-pass Butterworth filter, and the
maximum 2 ms sliding mean of the three-axis resultant. Contact time 17.3 +/- 4.2 ms. The
table's kick duration and several mass and interval entries are inconsistent and are excluded.

**The kick**: [Vagner et al., Military Medicine, Table I, no-load sub-elite condition](https://academic.oup.com/milmed/article/187/1-2/e147/6059446?login=true).
Barefoot, 30 s rest between kicks, an individually adjusted midsection-height plate; 1,000 Hz or
more, a 2 ms sliding resultant, contact from 30 N. Peak foot speed 7.1 +/- 0.92 m/s at 200 Hz,
during execution, not at contact; the discussion reverses the table's group speed labels.
Duration, angular-speed units and padding thickness are ambiguous and excluded. A midsection
kick differs substantially from a low shin kick.

Both are population statistics for dominant-limb strikes, not both limbs of one person.
`HUMAN_PUNCH`, in the Adamec apparatus, stays an untrained best-of-three control with its own
protocol, never combined with these.

## Apparatus

`node research/attack-force.mjs` runs a 48-cell battery: both hands with straight and cross
paths and both feet with front kicks, at 120, 480, 960 and 1,920 Hz, under symmetric and
directional actuation, on two worker threads. Each cell keeps its configuration, harness,
rejected trials, impulse waveform, contact surfaces, torque audit, stability faults and source
fingerprint.

| | Punch | Kick |
| --- | --- | --- |
| Harness | Node unpinned Warrior stand, `rapier-coordinate`, empty hands, balance 0 | the same |
| Run | 8 s, the planted closed-fist executor, 5 m/s terminal request, 0.12 s stroke, elbow preference 0.5 | 24 s, `ARENA_KICKS` (the conservative comparison `KICK_PATH`), target (+/-0.1, 0.45, 0.45) m |
| Pad window | 40 cm high | 8 cm high |

Pad mass, mount stiffness, damping and material law are `PUNCH_PAD`'s, and every body segment
can load the pad. The compliant face finds the leading surface inside its rectangular window: a
box or hull is clipped by its hull's boundary triangles, a capsule or sphere includes the curved
surface beside the window and the shaft. The normal load acts equally on segment and pad, and pad
momentum, mount loads subtracted, measures impulse independently. Clipping adds no shear,
distributed pressure or calibrated human pad.

## Evaluation

- **Trials**: the first three eligible complete impacts in clock order, means and sample SDs; a
  later strong hit cannot replace a weak one. Missing clean impacts, failed returns, falls,
  trunk-floor contact, assistance, pad overtravel and loaded kick launches are failures.
- **Peak** (`slidingPeak`): the fine waveform integrated over exactly 2 ms, fractional step
  overlaps included; no peak where a step is longer than 2 ms. Only 1,920 Hz meets the studies'
  1,000 Hz sampling; a 120 Hz step-average peak is not a human peak force. Fine impulses are
  binned to clock-aligned 120 Hz bins before forces are compared.
- **Convergence**: 480-to-960 and 960-to-1,920 Hz each change mean impulse and mean 120 Hz-binned
  peak by no more than 10 % of the larger, and the 960-to-1,920 Hz 2 ms peak by no more than 10 %.
  An engineering threshold, not a physical constant.
- **Torque audit** (`strikeEffort`): delivered whole-step motor torque against activation times
  the sourced strength in its direction, from 2 s on, every phase; slack 1e-5 x max(1 N m, bound)
  for float32 readback. Driven peaks exclude startup and every loaded step of a stroke. Symmetric
  actuation uses the requested side's limit for both signs, so it can keep its motor bound and
  exceed the opposite muscle's anatomical bound in braking; such a result cannot qualify.
- **Admission** (`forceAdmission`): physical qualification, directional bounds and rate
  convergence, each limb separately. The reference mean minus one SD is a performance screen;
  parity also needs a matched protocol, which the moving normal-only pad, unknown compliance,
  unapplied study filter and low kick height prevent.

## Results

`attack-force.json.gz` (code at `83c3540c`: the workshop hands' measured hulls, the punch on the
fist's; the Arena kick profile, 0.3 s stroke and 3 m/s). Node stand, empty hands, balance 0.

| Law / family / limb | 120 Hz impulse (N s) | 1,920 Hz impulse (N s) | 1,920 Hz 2 ms peak (N) |
| --- | ---: | ---: | ---: |
| Symmetric / straight / left | 11.596 | 5.961 | 324.9 |
| Symmetric / straight / right | 11.225 | 6.263 | 316.2 |
| Symmetric / cross / left | 6.339 | 4.957 | 305.0 |
| Symmetric / cross / right | 6.189 | 5.280 | 310.7 |
| Directional / straight / left | 11.289 | 5.824 | 320.3 |
| Directional / straight / right | 10.900 | 5.595 | 317.5 |
| Directional / cross / left | 7.991 | 3.940 | 254.0 |
| Directional / cross / right | 7.663 | 4.985 | 305.8 |
| Symmetric / front kick / left | 10.358 | 4.114 | 170.3 |
| Symmetric / front kick / right | 10.013 | 3.851 | 168.6 |
| Directional / front kick / left | 10.138 | 4.117 | 170.1 |
| Directional / front kick / right | 10.580 | 3.856 | 170.0 |

- **Punches**: none qualifies. The 120 Hz cells land fewer than three clean impacts except the
  symmetric left cross. Symmetric punches exceed directional anatomical bounds in 11 of 16 cells,
  mostly at the wrist in a return (480 Hz, a left straight returns with 8.22 N m of radial
  deviation against a zero activated bound). Directional straights change impulse by 11 % from
  480 to 960 Hz, and the left's 1,920 Hz cell exceeds the pad stroke; directional crosses change
  by 12 to 21 % (left) and 34 to 37 % (right).
- **Kicks**: the 120 Hz profile passes the six-cell hit/miss/block screen
  ([front-kicks.md](front-kicks.md#harness-and-qualification)), but under both laws the left foot
  fails a cycle and its returns at 120 Hz, the right foot falls at 1,920 Hz, and fine-rate
  impulses change by 8 to 12 %.
- **Motor bounds hold**: the largest motor-bound relative excess over all cells is 1.64e-7,
  under the numerical allowance.

`attack-force-reference.json.gz` keeps the conservative battery: capsule hands, `KICK_PATH`,
before the 2 ms convergence gate and before loaded steps left `effort.drivenPeaks`. Its 1,920 Hz
impulses are 2.7 to 3.9 N s for punches and 3.8 for kicks, 2 ms peaks 226 to 269 N and 145 to
147 N. There a 120 Hz left cross returns with 105.31 N m of hip flexion torque against a 36.67 N m
activated bound: symmetric braking within the solver's own limit.

## Tried and not kept

- **Directional actuation for the whole game**: its left straight passed every screen but the
  960-to-1,920 Hz 2 ms peak (10.10 %), its crosses do not converge, and its left kicks fail
  returns at 120 Hz.
- **Higher terminal speed alone** does not close the force gap; the clipped-window correction
  removes a missed partial-surface load and does not close it either.
- **Low planted-punch probes** at 3 and 5 m/s, 0.12 and 0.2 s, elbow preference 0 and 0.5: no
  driven left stationary-target hit; the slower 5 m/s case stands but fails a cycle and its
  return. The low action asks for zero elbow extension, so the global elbow preference cannot
  reach it.
