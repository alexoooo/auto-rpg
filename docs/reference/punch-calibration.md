# Punch calibration

The unassisted Warrior can deliver measured punches, but the retained executor and the
tested trajectory variants do not establish hard human punching performance. A compliant
research pad gives roughly 240-570 N peaks in admitted fine-step comparisons, with selected
impulses around 4-6 N s. The human reference is 1,665 N and 22.84 N s. Changing the requested
endpoint speed from 5 to 8 m/s produces only about 5 m/s over the final 10 cm in these fixtures.

The harness is **Node unpinned core stand, rapier-coordinate, symmetric actuation, Warrior
empty hands, balance 0, no wound scoring**, at the explicitly named physics/control rate.
Each cell lasts six simulated seconds with two seconds of guard startup. It calls the same
`combatSkills`, hand controller, muscles and `World.step` used by Arena combat. Strength,
shortening speed, body mass, anatomy and balance are unchanged. These are repeated deterministic
strikes from a supported stand, not an estimate of a population or an Arena win distribution.

## Human comparison

[Adamec et al., Table 3](https://epub.ub.uni-muenchen.de/76042/1/76042.pdf) reports dominant-hand
fists from 29 men without regular punching training: speed 8.0 +/- 1.2 m/s, impulse
22.84 +/- 5.73 N s, peak force 1,665 +/- 401 N, duration 27 +/- 5 ms and effective mass
2.93 +/- 0.81 kg. Participants gave three maximum-effort punches of each kind; the largest
impulse selected the trial. The fixed plate sampled at 10,000 Hz; video at 2,000 Hz measured
the hand's final 10 cm. The pad was 40 cm tall, 20 cm wide and 11 cm deep.

The simulation records every impact and separately selects the greatest impulse among the
first three complete, identified hand impacts with a measured 10 cm approach. It preserves
weak strikes, misses, return failures, excess pad travel and contacts outside a driven stroke.
This matches the selection rule, not the complete apparatus or human protocol. The paper does
not report pad stiffness, moving mass or damping; simulation values below are explicit
apparatus assumptions. Its force peaks cannot establish human equivalence without calibrated
material response and time-step convergence.

## Apparatus and independent measurement

`research/punch-pad.mjs` builds an 8 kg sliding pad of the stated dimensions. Research-only
Rapier settings lock rotation and lateral translation and remove pad gravity. A normal
mounting spring is 40,000 N/m; damping is `2 * 0.35 * sqrt(stiffness * mass)` N s/m. The
body remains subject to ordinary gravity and its own muscle commands. The pad applies no
propulsive force to a fighter. Apparatus constants are hypotheses, not anatomical values.

For each entire world step the sensor reads pad velocity before and after physics and computes:

```
contact impulse = pad mass * (next velocity - previous velocity) - mount force * step duration
step-average contact force = contact impulse / step duration
```

Pad motion includes every solver and CCD substep. The mounting force is held for the world
step and subtracted once. The stored narrow-phase impulse is also recorded for comparison;
it is not used to price this measurement. No contact impulse is inferred from muscle effort
or from the game's free-joint contact-mass estimate.

The **rigid face** uses native Rapier collisions. It measures whole impact impulse, but
the largest force bin is strongly rate dependent: a rigid impulse does not supply a finite
material peak. Refining the rate produces multi-kilonewton bins without demonstrating a
strong human punch.

The **compliant face** makes the pad collider a sensor and applies an equal/opposite physical
force to actual live collision surfaces and the pad. The recorded battery's source fingerprint
uses foremost capsule-point admission. The current meter clips capsule, sphere, box and hull
surfaces to its finite window, including partial face overlaps, as specified in
[trained-attack-force.md](trained-attack-force.md). It remains a normal material fixture.
Compression gives `max(0, stiffness * penetration + damping * relative speed)`.
Default face stiffness is 10,000 N/m and damping 20 N s/m; sensitivity cells use 5,000 and
20,000 N/m. Load is resisted through ordinary articulated physics and bounded muscles.

This compliant material exists only in the research apparatus. Native tactile contact events
do not interrupt the shared executor there; the planned stroke, follow-through and return
continue against the applied resistance. The rigid fixture retains ordinary tactile interruption.
The two fixtures therefore measure different contact/controller interactions. Neither changes
gameplay collision or damage rules.

Contact episodes start only during the commanded hand's swing. A 25 ms quiet interval or a
new swing ends the episode. Signed impulse is integrated through that episode, including its
quiet tail; later contacts are retained as unassigned impulse. Speed over the final 10 cm is
interpolated from the named knuckle's pre-step trace within the current swing. A swing without
that traversal has no comparable speed or impulse/speed mass. Instantaneous pre-impact speed,
free-joint model mass, preceding delivered motor torques and pre-contact torque peaks are also
recorded. Torque/impulse readings are not muscle work.

`qualification` requires three complete hand-only measured impacts, three verified returns,
no failed cycles, fall, trunk/head floor contact or assistance, and compression within the
pad's 11 cm stroke. It qualifies fixture execution, not force convergence, accurate human
materials or competitive strength. A partial final episode is retained and excluded from
best-of-three selection. All force samples remain in the record.

## Recorded cells

[Complete data and input profiles](punch-calibration.json.gz) retain all 26 cells, including
failures, raw force histories, motor diagnostics, actual engine revision and source fingerprint.
The profiles are reference (5 m/s ask, guard elbow preference), extended (5 m/s, full extension
preference) and faster-extended (8 m/s, full extension). All other trajectory settings are the
retained `ATTACK_PATH`. Extension changes an IK preference, not a strength limit.

| Face / profile | Hand | Hz | Selected speed (m/s) | Impulse (N s) | Peak force bin (N) | Impulse/speed mass (kg) | Returns | Qualification |
|---|---|---:|---:|---:|---:|---:|---:|---|
| rigid / reference | left | 120 | 4.87 | 5.08 | 589 | 1.04 | 5 | pass |
| rigid / reference | right | 120 | 4.85 | 5.32 | 613 | 1.10 | 5 | pass |
| rigid / extended | left | 120 | 4.93 | 5.52 | 662 | 1.12 | 5 | pass |
| rigid / extended | right | 120 | 4.91 | 5.55 | 665 | 1.13 | 5 | pass |
| rigid / faster-extended | left | 120 | 5.03 | 7.43 | 804 | 1.48 | 4 | pass |
| rigid / faster-extended | right | 120 | - | - | - | - | 4 | fewer than three complete measured hand impacts |
| rigid / reference | right | 480 | 4.83 | 7.98 | 1423 | 1.65 | 4 | pass |
| rigid / faster-extended | right | 480 | 4.84 | 11.01 | 2391 | 2.27 | 3 | pass |
| rigid / reference | right | 960 | 4.50 | 7.09 | 3077 | 1.57 | 4 | pass |
| rigid / faster-extended | right | 960 | 4.94 | 10.97 | 3190 | 2.22 | 3 | pass |
| rigid / faster-extended/pad-sensitivity (mount 10000) | right | 120 | 5.21 | 8.35 | 610 | 1.60 | 4 | pass |
| rigid / faster-extended/pad-sensitivity (mount 80000) | right | 120 | 5.00 | 7.66 | 798 | 1.53 | 4 | pass |
| compliant / reference | left | 120 | 4.95 | 4.53 | 544 | 0.92 | 5 | pass |
| compliant / reference | right | 120 | 4.91 | 5.27 | 543 | 1.07 | 5 | pass |
| compliant / extended | left | 120 | 4.95 | 6.90 | 567 | 1.39 | 4 | pass |
| compliant / extended | right | 120 | 5.02 | 5.79 | 476 | 1.15 | 2 | failed strike/return cycle; fewer than three verified returns |
| compliant / faster-extended | left | 120 | - | - | - | - | 1 | failed strike/return cycle; fewer than three complete measured hand impacts; fewer than three verified returns |
| compliant / faster-extended | right | 120 | 5.21 | 5.30 | 376 | 1.02 | 2 | failed strike/return cycle; fewer than three verified returns |
| compliant / reference | right | 480 | 4.87 | 4.31 | 264 | 0.88 | 4 | pass |
| compliant / faster-extended | right | 480 | 5.05 | 6.20 | 421 | 1.23 | 5 | pass |
| compliant / reference | right | 960 | 4.50 | 4.51 | 253 | 1.00 | 4 | pad stroke exceeded |
| compliant / faster-extended | right | 960 | 5.07 | 6.40 | 433 | 1.26 | 5 | pass |
| compliant / reference | right | 1920 | 4.83 | 4.24 | 242 | 0.88 | 5 | pass |
| compliant / faster-extended | right | 1920 | 5.04 | 5.80 | 420 | 1.15 | 5 | pass |
| compliant / faster-extended/face-sensitivity (face 5000) | right | 960 | 5.07 | 5.45 | 288 | 1.08 | 5 | pass |
| compliant / faster-extended/face-sensitivity (face 20000) | right | 960 | 5.04 | 5.62 | 570 | 1.11 | 5 | pass |

The current hand collider represents an open hand, while the named strike point is at the
knuckles. In the rigid fixture the first contact is roughly 7 cm before those knuckles reach
the requested face. The requested endpoint velocity is consequently not the measured impact
speed. A physically closed fist envelope and coordinated wrist/arm/trunk bracing remain
subjects for a separate measured change.

The compliant faster-extended right-hand peak means at 480, 960 and 1920 Hz are approximately
416, 378 and 403 N. Reading the fine impulses in clock-aligned 120 Hz bins avoids comparing
a 1 ms spike to an 8 ms average. This is a convergence screen, not a claim that each rate
produces the same punch: control and contact trajectories also change. The 960 Hz reference
cell exceeds the face stroke during a later contact and is rejected despite usable earlier
strikes. At 120 Hz several extended/faster compliant cells fail return; no profile is promoted.

For the admitted right-hand compliant faster-extended fixture at 1920 Hz, best of three is
5.04 m/s, 5.80 N s, 420 N and 1.15 kg by impulse/speed. Against the cited human means these
are about 63%, 25%, 25% and 39%, respectively, under different uncalibrated padding. Doubling
face stiffness to 20,000 N/m at 960 Hz yields 570 N and 5.62 N s in the selected trial;
changing padding can raise force without establishing a stronger fighter. No tested admitted
compliant cell reaches the cited human impulse or peak-force mean.

The independently measured impulse/speed mass is commonly around 1 kg, while the separate
free-joint scoring estimate is much smaller. They are different quantities. The result
motivates auditing damage's free-joint/no-ground-support assumption; it does not establish
that replacing it by this fixture's mass is correct for an opponent's head or trunk.

## Checks and reproduction

`tests/research-punch-calibration.test.mjs` checks both directions at 120 and 960 Hz against
the analytical inelastic collision impulse and the striker's momentum loss. It also checks
mount-only motion: no spurious contact impulse above 1e-5 N s. Real Warrior hit/miss cycles
cover both hands; compliant forces balance the pad sensor and physically resist the hand.
Fresh-world snapshots replay the controller, pad and complete measurement history across
contact and return for both faces.

Removing the mount-load subtraction fails the no-contact physical check. Removing the hand's
opposite reaction fails the compression check. These mutations demonstrate that the checks
observe independent dynamics rather than only re-evaluating the reported formula.

```powershell
node research/punch-calibration.mjs --suite --output docs/reference/punch-calibration.json.gz
node research/punch-calibration.mjs --hand right --face compliant --hz 1920 --speed 8 --extension 1 --output punch.json
node --test tests/research-punch-calibration.test.mjs
```

The runner uses one sequential world per trial and refuses a suite whose implementation
fingerprint changes during measurement. `--face-stiffness`, `--pad-stiffness`, `--seconds`
and `--mode miss` are explicit per-trial inputs. Further work is to measure a realistic fist
envelope and pre-impact bracing, calibrate the target's materials, and retain stronger
controllers only after both-hand hit/miss/return and Arena qualification.
