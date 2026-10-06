# Recovery weight transfer

`stagedRise` unloads a departing limb only when every retained limb is down and the actual
center of mass is inside their contracted support outline. It uses bearing patches, not
airborne limbs whose point tasks are merely active.

During a stage that leaves a limb, the chain's redundant posture follows the stage's time
constant instead of the 0.1 s posture constant. A bounded integral of horizontal position
error removes the steady transfer error left by posture tracking and contact constraints.
The integration rate is the stage's inverse time constant; its position-equivalent magnitude
is capped at the body's standing height. This is controller conditioning, not extra force:
the bearing solve and original muscle ceilings still limit the resulting motion. The integral
resets at every stage entry. Completion measures the physical stage target, without its bias.

Node toppled Warrior stand, symmetric muscles, 120 Hz, empty hands, zero balance; a 3 s
stage following `fours`, pitch 0.9 rad, shin shares 0.4 each and retained hand 0.2.
The original controller leaves the left hand loaded throughout the stage. At 2.75 s its
center of mass remains 15.4 mm outside the retained supports. Relaxing posture alone leaves
6.8 mm error. With the bounded integral and relaxed posture, the real center enters the
supports and the departing hand's bearing task turns off.

| Engine | Departing hand | Initial support gap (mm) | Release (s) | Support gap at release (mm) | Peak segment speed during transfer (m/s) | Assist force / moment sums |
|---|---|---:|---:|---:|---:|---|
| rapier | left | 52.43 | 1.6833 | 0 | 1.1790 | 0 / 0 |
| rapier | right | 37.52 | 0.6917 | 0 | 0.7509 | 0 / 0 |
| rapier-coordinate | left | 40.99 | 1.8917 | 0 | 0.9392 | 0 / 0 |
| rapier-coordinate | right | 46.88 | 1.7417 | 0 | 1.0598 | 0 / 0 |

Reproduce with `node research/recovery-transfer.mjs`, and with `CORE_ENGINE=rapier-coordinate`.
The probe reads the support gap before physics advances, at the controller's release step.
These are support handovers, not completed rises: this deliberately incomplete posture still
times out. The asymmetric release times are measured outcomes, not a claimed mirror symmetry.
