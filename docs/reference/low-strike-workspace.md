# Supported low-strike workspace

Node unpinned Warrior stand, rapier-coordinate, 120 Hz, empty hands and balance 0.
The common combat executor requests lowering from 2 to 12 s, a right-hand downward stroke
from 7 to 12 s, then returns to standing through 17 s. It installs no pose. A fixed
0.20 by 0.20 by 0.08 m box has its front face at the requested target. A driven contact
requires swing phase, an upright attacker and pre-step hand velocity relative to body COM
closing along the actual contact normal at least 1 m/s. Trunk-floor counts include
head and all three trunk segments with positive impulse against the fixed ground.

Coordinates are in world metres relative to the initial stand, not a COM-relative reach
envelope. Full records are in `low-strike-workspace.json`. This development diagnostic
has no recorded source fingerprint and is not competitive promotion evidence.

| Target x/y/z (m) | Driven / swing contacts | Verified returns | Failed preparation/return | Down at any time | Trunk-floor steps | Final head y (m) |
|---|---:|---:|---:|---|---:|---:|
| 0.1/0.3/0.1 | 3/4 | 2 | 2 | False | 0 | 1.617 |
| 0.1/0.3/0.3 | 0/0 | 3 | 1 | False | 0 | 1.594 |
| 0.1/0.3/0.5 | 0/0 | 2 | 2 | False | 0 | 1.594 |
| 0.1/0.3/0.65 | 0/0 | 2 | 2 | False | 0 | 1.594 |
| 0.1/0.4/0.1 | 8/8 | 8 | 0 | False | 0 | 1.619 |
| 0.1/0.4/0.3 | 0/0 | 3 | 1 | False | 0 | 1.594 |
| 0.1/0.4/0.5 | 0/0 | 3 | 1 | False | 0 | 1.594 |
| 0.1/0.4/0.65 | 0/0 | 3 | 1 | False | 0 | 1.594 |
| 0.1/0.6/0.1 | 5/5 | 3 | 2 | False | 0 | 1.605 |
| 0.1/0.6/0.3 | 7/7 | 8 | 0 | False | 0 | 1.594 |
| 0.1/0.6/0.5 | 3/3 | 1 | 2 | True | 692 | 0.095 |
| 0.1/0.6/0.65 | 1/1 | 1 | 1 | False | 0 | 1.594 |
| 0.35/0.3/0.1 | 5/5 | 3 | 2 | False | 0 | 1.594 |
| 0.35/0.3/0.3 | 0/1 | 5 | 1 | False | 0 | 1.594 |
| 0.35/0.3/0.5 | 0/0 | 4 | 1 | False | 0 | 1.594 |
| 0.35/0.3/0.65 | 0/0 | 0 | 3 | False | 0 | 1.594 |
| 0.35/0.4/0.1 | 6/6 | 6 | 1 | False | 0 | 1.594 |
| 0.35/0.4/0.3 | 3/3 | 4 | 1 | False | 0 | 1.594 |
| 0.35/0.4/0.5 | 0/0 | 2 | 1 | False | 0 | 1.594 |
| 0.35/0.4/0.65 | 0/0 | 2 | 3 | False | 0 | 1.594 |
| 0.35/0.6/0.1 | 4/4 | 4 | 1 | False | 0 | 1.594 |
| 0.35/0.6/0.3 | 4/4 | 3 | 1 | False | 0 | 1.594 |
| 0.35/0.6/0.5 | 3/3 | 1 | 2 | False | 0 | 1.594 |
| 0.35/0.6/0.65 | 1/1 | 2 | 1 | False | 0 | 1.594 |

All cells use zero force and moment assistance. Nearby targets at y=0.4 m work better
than those half a metre ahead. The x=0.1, y=0.6, z=0.5 cell falls and fails standing
return; it is excluded from a reliable workspace. Quiet planted support and successful
return remain required regardless of whether a contact scores damage.
