# Motion at low-combat handover

`groundFight({measureSupport:true})` optionally records every pre-physics sample
from its existing real Arena fixture. It reads the current combat stance target,
root-frame orientation, actual root/upper-trunk angular velocity, centre-of-mass
speed, host owner, phase and support stage. Root error is the shorter rotation to
the host's stance target, in radians. Samples under recovery retain the last host
combat target; their root error is not a recovery tracking error.

`combat-support-motion.json.gz` retains all four complete trials, including their
120 Hz samples, with source fingerprint. It is gzip-compressed UTF-8 JSON. Node
Arena Duel, rapier-coordinate, 120 Hz, Warrior fists, balance 0/0, continuing
recovery, 45 s. Each hand attacks an ordinarily recovering target. Reference is
original Scrapper; extended adds spacing 0.10 m, clean-miss step 0.10 m and full
standing elbow preference, with the low action explicitly retaining zero style.

| Hand | First quiet handover (s) | Root error (rad) | Root angular speed (rad/s) |
|---|---:|---:|---:|
| Right, either profile | 17.300 | 0.31844 | 0.38020 |
| Left, either profile | 17.667 | 0.25665 | 0.45660 |

The initial handovers are identical between profiles, including root/upper-trunk
spin and centre-of-mass speed. Both reference attackers remain upright. Extended
right later falls during a new approach, first observed down at 22.5167 s;
extended left remains upright. The whole failed record is retained.

The quiet-foot/centre gate releases while root rotation is still under way, but
these measurements do not identify that as the later fall's cause: the matching
reference handover remains safe. No new settling threshold is adopted from this
comparison. Motion includes contact reactions; it is not a driven-power reading.
Use the ordinary commanded rows to study handover, and the angular-velocity rows
to inspect the later instability. Original low gameplay gates remain unchanged.
