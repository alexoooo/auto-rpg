# Trained-adult attack force

## Primary references

| Technique and population | Peak force, mean +/- SD | Impulse, mean +/- SD | Protocol |
| --- | ---: | ---: | --- |
| Direct punch, 16 male military cadets | 2,501 +/- 625 N | 17.2 +/- 3.5 N s | Three maximum-effort punches, mean of trials, head-height padded force plate |
| Barefoot front kick, sub-elite professional soldiers | 5,551 +/- 1,243 N | 153.5 +/- 29.5 N s | Six maximum-effort kicks, all trials analyzed, abdomen/solar-plexus force plate |

The punch row is [Vagner et al., Sports 2024, Table 1 and methods](https://doi.org/10.3390/sports12080205)
([author article](https://pdfs.semanticscholar.org/7131/eb7790c6f6600336e3e21efda7903b9fb81a.pdf)).
Cadets had three years of twice-weekly close combat lessons. All were right handed.
The plate sampled at least 1,000 Hz under a 25 mm mat. Processing used a 5 Hz
zero-phase high-pass Butterworth filter and the maximum 2 ms sliding mean of
three-axis resultant force. Punch contact time was 17.3 +/- 4.2 ms. Kick duration
and several mass/interval entries in that table are inconsistent; they are excluded
from the calibration targets. These are population statistics for dominant-limb
strikes, not measurements of both limbs of one individual.

The kick row is [Vagner et al., Military Medicine, Table I, no-load sub-elite condition](https://academic.oup.com/milmed/article/187/1-2/e147/6059446?login=true).
Participants kicked barefoot, rested 30 s between kicks, and struck an individually
adjusted midsection-height plate. Force sampled at least 1,000 Hz; the peak used a
2 ms sliding resultant and contact used a 30 N threshold. The reported peak foot
speed was 7.1 +/- 0.92 m/s at 200 Hz, measured during execution rather than at
contact. The discussion reverses the table's group speed labels. Duration and
angular-speed units and the padding thickness have ambiguities; those values are
excluded. This reference differs substantially from a low shin kick.

`TRAINED_ATTACKS` records these targets separately. `HUMAN_PUNCH` in the earlier
Adamec apparatus remains an untrained best-of-three control, with its original
protocol. Its speed and impulse are not combined with the trained studies.

## Reproducible apparatus and evaluation

`node research/attack-force.mjs` runs a finite 48-cell battery: both hands with
straight/cross paths and both feet with front kicks, each at 120, 480, 960 and
1,920 Hz under symmetric and directional actuation. Two worker threads run
independent sequential loops. Each cell retains its configuration, harness,
rejected trials, full impulse waveform, contact surfaces, torque audit, stability
faults and source fingerprint in `attack-force.json.gz`. The world runs control
and physics at the stated rate. No render call steps it.

Harness: Node unpinned Warrior stand, `rapier-coordinate`, empty hands, balance 0.
Punch cells run 8 s with the planted, physically closed-fist executor, 5 m/s
requested terminal speed, 0.12 s stroke and 0.5 elbow preference. Kick cells run
24 s with the current `ARENA_KICKS` settings, targeting (+/-0.1, 0.45, 0.45) m.
The conservative comparison uses `KICK_PATH`. All actual body segments
can load the pad. The kick window is 8 cm high; the punch window is 40 cm high.
Pad mass, mount stiffness, damping and material law retain `PUNCH_PAD`.

The compliant face finds the leading actual surface inside its finite rectangular
window. A box or hull is clipped by its convex hull's boundary triangles. A capsule
or sphere includes the curved surface beside the window and the capsule's shaft.
This corrects a corner-only admission gap. Shape selection still follows the live
applied hand collider. The normal load acts equally on the segment and sliding pad;
pad momentum, with mount loads subtracted, measures impulse independently.
Clipping does not add shear, distributed pressure or a calibrated human pad model.

The first three eligible complete impacts are summarized in clock order, with
means and sample SDs; later strong hits cannot replace weak trials. This is an
engineering screen. The kick study analyzes six trials. Missing clean impacts,
failed returns, falls, trunk-floor contact, assistance, pad overtravel and loaded
kick launches remain failures, even if one hit produces a large force.

Fine impulses are integrated into clock-aligned 120 Hz bins before comparing force.
`slidingPeak` integrates the piecewise-constant fine waveform over exactly 2 ms,
including fractional step overlaps. It reports no 2 ms peak when a physics step is
longer than that window. At the listed rates 960 and 1,920 Hz resolve a window;
only 1,920 Hz meets the studies' minimum 1,000 Hz sampling rate.
Step-average peaks at 120 Hz are not human peak forces.

Convergence requires unique cells at all four rates for each limb and family, with
both 480-to-960 and 960-to-1,920 comparisons changing mean impulse and mean peak
120 Hz force by no more than 10% of the larger value. This is an engineering
acceptance threshold, not a physical constant. Whole-system rate comparisons also
change when discrete admission events occur; failed cells are retained. The
960-to-1,920 Hz 2 ms peak comparison must also change by no more than 10%.

## Directional torque audit

`strikeEffort` reads delivered whole-step motor torque after the driver's solver
readback, paired with that same step's configured bounds and starting joint speed.
It records the largest absolute and relative excess and its channel/time witness.
The independent anatomical bound is activation times the sourced strength in the
delivered torque's direction. The solver's motor bound is tested separately.

Audit begins after 2 s of settling and includes every subsequent phase. Its relative
slack is 1e-5 times max(1 N m, bound), allowing float32 solver/readback rounding.
This numerical allowance does not raise a muscle's strength. Driven torque peaks
exclude startup and the first loaded interval and every later step of that stroke.
Each impact includes delivered torque from its first loaded
interval; `preImpact` motion is from that interval's start, and its older
`motorTorques` field is the preceding interval's readback.

Symmetric actuation uses the requested side's limit for both signs. It can therefore
respect its configured motor bound while exceeding the opposite muscle's anatomical
bound during braking. Directional actuation retains each side's independently
sourced curve. A symmetric result with such excess cannot qualify as human parity.

`forceAdmission` requires physical qualification, directional bounds and rate
convergence separately for both limbs. Reaching the reference mean minus one SD is
reported as an indicative performance screen. Human parity additionally requires a
matched measurement protocol. The moving normal-only pad, unknown compliance,
unapplied study filter and low kick height currently prevent that claim. No body
strength, assistance or damage multiplier is changed by this measurement work.

## Recorded results

The conservative 48-cell battery in [attack-force-reference.json.gz](attack-force-reference.json.gz)
preserves the complete records under its source fingerprint. The current Arena
profile's battery is [attack-force.json.gz](attack-force.json.gz). The following
conservative values are means of the first three eligible impacts,
or the available eligible impacts when the three-trial gate fails. All figures
use the Node stand, same engine, empty hands, balance 0 and the frozen pad law.
The reference pack predates the additional 2 ms convergence gate and the exclusion
of loaded steps from `effort.drivenPeaks`. Its force, impulse and all-phase bound
audit retain their stated meaning; its driven-peak fields include loaded intervals.
The current pack uses the complete protocol above.

| Law / family / limb | 120 Hz impulse (N s) | 1,920 Hz impulse (N s) | 1,920 Hz 2 ms peak (N) |
| --- | ---: | ---: | ---: |
| Symmetric / straight / left | 5.153 | 3.848 | 264.9 |
| Symmetric / straight / right | 5.738 | 3.916 | 268.3 |
| Symmetric / cross / left | 5.770 | 3.055 | 252.6 |
| Symmetric / cross / right | 5.001 | 3.061 | 237.7 |
| Symmetric / front kick / left | 7.459 | 3.835 | 145.1 |
| Symmetric / front kick / right | 7.683 | 3.770 | 145.3 |
| Directional / straight / left | 3.986 | 3.891 | 265.1 |
| Directional / straight / right | 4.988 | 3.916 | 268.5 |
| Directional / cross / left | 5.476 | 2.701 | 226.2 |
| Directional / cross / right | 7.769 | 3.166 | 250.6 |
| Directional / front kick / left | 7.265 | 3.774 | 145.1 |
| Directional / front kick / right | 7.770 | 3.779 | 146.8 |

No paired-limb family qualifies for parity. Symmetric straight punches converge
in both successive fine comparisons, but exceed directional anatomical bounds.
At 120 Hz, one left cross returns with 105.31 N m of hip flexion torque against a
36.67 N m independently sourced activated bound. This is configured symmetric
braking, not a violation of the solver's configured limit. The maximum motor-bound
relative excess over all cells is 1.64e-7, below the numerical allowance.

Directional left straight punches pass the physical/bound/common-rate screen,
but their 960-to-1,920 Hz 2 ms peak changes by 10.10%, just beyond the gate.
The right straight has too few clean impacts at 120 Hz. Directional cross
impulses fail convergence on both hands. Low-kick impulses still change by
roughly 11-17% in the successive fine comparisons; both laws' right foot falls
at 1,920 Hz after the measured strikes. Left directional kicks fail returns
at 120 Hz. Switching the whole game's actuator law is therefore not promoted.

The Arena profile uses a 0.3 s stroke and 3 m/s requested terminal speed. Its
current kick battery retains the same Node apparatus and balance 0:

| Law / limb | 120 Hz impulse (N s) | 1,920 Hz impulse (N s) | 1,920 Hz 2 ms peak (N) |
| --- | ---: | ---: | ---: |
| Symmetric / left | 10.708 | 4.089 | 169.5 |
| Symmetric / right | 10.235 | 3.748 | 165.0 |
| Directional / left | 10.336 | 4.016 | 169.0 |
| Directional / right | 10.130 | 3.849 | 169.3 |

The stronger 120 Hz profile passes the six-cell hit/miss/block stability screen
under symmetric actuation. The force battery applies the additional bounds and
rate gates: left symmetric braking exceeds the activated anatomical bound at
120 Hz, right directional returns fail there, and both laws' right foot falls
at 1,920 Hz. Successive fine-rate kick impulses still change by roughly 8-13%.
No paired-limb family qualifies. Punch settings and measurements are unchanged.

The apparatus correction removes a missed partial-surface load; it does not
close the force gap. Higher terminal speed alone is also insufficient. The
finite kick search retains stronger candidate hits alongside missed/blocked
and return failures. Low planted-punch trajectory probes at 3/5 m/s, 0.12/0.2 s
and elbow preference 0/0.5 still produce no driven left stationary-target hit;
the slower 5 m/s case avoids falling but fails a cycle and standing return.
The active low action explicitly requests zero elbow extension, so changing
the global elbow preference cannot affect that action. None is promoted.

Remaining controller work is measured whole-body bracing, reachable contact
orientation and withdrawal, followed by matched-height kick qualification and
apparatus compliance calibration. Anatomical increases are unsupported by these
results. The force figures remain apparatus-specific measurements, and human
parity remains open.
