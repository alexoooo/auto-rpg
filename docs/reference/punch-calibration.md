# Punch calibration

The research pad's assumptions and sensitivity (`research/punch-pad.mjs`) and what the unassisted
Warrior's punch measures against it. Admitted fine-step comparisons on the compliant pad give about
160–460 N peaks and 4–10 N s impulses against the human reference of 1,665 N and 22.84 N s; asking
8 m/s instead of 5 gives only 4.3–5.3 m/s over the final 10 cm.

Harness: Node core stand (unpinned), rapier-coordinate, symmetric actuation, Warrior empty hands,
balance 0, no wound scoring, at each cell's named rate; code at `83c3540c` (the workshop hands'
hulls; the blow closes the fist). Each cell is 6 s with 2 s of guard startup, through the same
`combatSkills`, hand controller, muscles and `World.step` as Arena combat. Strength, shortening
speed, mass, anatomy and balance are unchanged.

## Human comparison

[Adamec et al., Table 3](https://epub.ub.uni-muenchen.de/76042/1/76042.pdf): dominant-hand fists of
29 men without regular punching training, speed 8.0 ± 1.2 m/s, impulse 22.84 ± 5.73 N s, peak force
1,665 ± 401 N, duration 27 ± 5 ms, effective mass 2.93 ± 0.81 kg. Three maximum punches of each kind,
the largest impulse selected; plate at 10,000 Hz, video at 2,000 Hz over the hand's final 10 cm; pad
40 cm tall, 20 cm wide, 11 cm deep.

The simulation keeps every impact and selects the greatest impulse among the first three complete,
identified hand impacts with a measured 10 cm approach: the paper's selection rule, not its
apparatus. The paper gives no pad stiffness, moving mass or damping, so the values below are
assumptions, and force peaks cannot show human equivalence without calibrated material and
time-step convergence.

## Apparatus and independent measurement

`research/punch-pad.mjs` builds an 8 kg sliding pad of the stated size; research-only Rapier
settings lock rotation and lateral translation and remove the pad's gravity. The mounting spring is
40,000 N/m, damping `2 * 0.35 * sqrt(stiffness * mass)` N s/m. The pad pushes no fighter. These are
hypotheses, not anatomy.

Each world step the sensor reads pad velocity before and after physics:

```
contact impulse = pad mass * (next velocity - previous velocity) - mount force * step duration
step-average contact force = contact impulse / step duration
```

Pad motion includes every solver and CCD substep; the mount force is held for the step and
subtracted once. The narrow-phase impulse is recorded beside it, not used; nothing is inferred from
muscle effort or the game's free-joint contact mass.

- **Rigid face**: native Rapier collisions. It measures whole-impact impulse, but its largest force
  bin depends strongly on rate (multi-kilonewton bins at fine steps): no finite material peak.
- **Compliant face**: the pad collider is a sensor, and an equal and opposite force
  `max(0, stiffness * penetration + damping * relative speed)` acts on the live collision surfaces
  and the pad, clipped to the finite window as in [trained-attack-force.md](trained-attack-force.md).
  Face stiffness 10,000 N/m, damping 20 N s/m; sensitivity cells at 5,000 and 20,000 N/m. Tactile
  events do not interrupt the executor here, so stroke, follow-through and return continue against
  the load; the rigid face keeps ordinary tactile interruption. Neither changes gameplay.

An episode starts only in the commanded hand's swing and ends after 25 ms quiet or at a new swing;
signed impulse integrates through it, quiet tail included, and later contacts are unassigned. Speed
over the final 10 cm is interpolated from the named knuckle's pre-step trace in the current swing.
Pre-impact speed, free-joint mass and motor torques are recorded too; torque and impulse are not work.

`qualification` needs three complete hand-only measured impacts, three verified returns, no failed
cycle, fall, trunk or head floor contact or assistance, and compression within the pad's 11 cm. It
qualifies the fixture's execution, not force convergence or human materials.

## Recorded cells

[Complete data and input profiles](punch-calibration.json.gz): all 26 cells (the rows below are
those the findings rest on) with failures, force histories, motor diagnostics, engine revision and fingerprint. Profiles: reference (5 m/s, guard
elbow preference), extended (5 m/s, full extension preference), faster-extended (8 m/s, full
extension); the rest is the retained `ATTACK_PATH`.

| Face / profile | Hand | Hz | Speed (m/s) | Impulse (N s) | Peak bin (N) | Impulse/speed mass (kg) | Returns | Qualification |
|---|---|---:|---:|---:|---:|---:|---:|---|
| rigid / reference | right | 120 | 4.99 | 6.13 | 736 | 1.23 | 5 | pass |
| rigid / reference | right | 960 | 4.79 | 5.72 | 4964 | 1.20 | 5 | pass |
| rigid / faster-extended, mount 10,000 or 80,000 | right | 120 | - | - | - | - | 4 | under three measured impacts |
| compliant / reference | left | 120 | 4.91 | 10.25 | 554 | 2.09 | 2 | failed cycle and returns |
| compliant / reference | right | 120 | 4.90 | 9.85 | 521 | 2.01 | 4 | pass |
| compliant / extended | both | 120 | - | - | - | - | 4 | under three measured impacts |
| compliant / faster-extended | right | 960 | 4.92 | 8.66 | 285 | 1.76 | 5 | pass |
| compliant / reference | right | 1920 | 4.77 | 8.78 | 377 | 1.84 | 4 | pass |
| compliant / faster-extended | right | 1920 | 5.21 | 5.93 | 314 | 1.14 | 5 | pass |
| compliant / faster-extended, face 5,000 | right | 960 | 4.96 | 4.40 | 163 | 0.89 | 5 | pass |
| compliant / faster-extended, face 20,000 | right | 960 | 4.90 | 6.43 | 464 | 1.31 | 5 | pass |

- The fist hull strikes 2–4 cm ahead of its named `strike` point along the punch and 1–5 cm below
  it at first contact (2.2–3.1 cm ahead at 480 Hz and finer), so the asked endpoint velocity is not
  the impact speed.
- First-three peaks in clock-aligned 120 Hz bins (right, compliant, 480/960/1920 Hz):
  faster-extended 246/277/244 N, reference 368/345/350 N. Binning keeps a 1 ms spike from being
  compared to an 8 ms average.
- Best of three for compliant faster-extended at 1920 Hz, 5.21 m/s, 5.93 N s, 314 N, 1.14 kg, is
  about 65 %, 26 %, 19 % and 39 % of the human means, under different padding. The reference profile
  there trades speed for impulse and mass (4.77 m/s, 8.78 N s, 377 N, 1.84 kg). Doubling face
  stiffness raises force without a stronger fighter. No admitted compliant cell reaches the human
  impulse or peak.
- Impulse/speed mass is 1–2 kg, far above the free-joint scoring estimate: a different quantity.
  It prompted the [contact-mass audit](punch-mass-audit.md), not a change of the damage rule.

## Checks and reproduction

`tests/research-punch-calibration.test.mjs` checks both directions at 120 and 960 Hz against the
analytic inelastic impulse and the striker's momentum loss, and mount-only motion (no contact
impulse above 1e-5 N s); real Warrior hit and miss cycles for both hands; fresh-world replay of
controller, pad and measurement history. Removing the mount-load subtraction fails the no-contact
check; removing the hand's reaction fails the compression check.

```powershell
node research/punch-calibration.mjs --suite --output docs/reference/punch-calibration.json.gz
node research/punch-calibration.mjs --hand right --face compliant --hz 1920 --speed 8 --extension 1 --output punch.json
node --test tests/research-punch-calibration.test.mjs
```

One sequential world a trial; a suite refuses a fingerprint change mid-run. `--face-stiffness`,
`--pad-stiffness`, `--seconds` and `--mode miss` are per-trial inputs.
