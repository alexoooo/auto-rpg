# Combat strike trajectories

The shared combat skill asks ordinary hand goals, supported stance and sourced muscle commands.
It changes no body strength, damage rule or assist ceiling. Tactical actions name a hand, an
observed world target and a trajectory family. Initial scope: Warrior empty hands.

## Trajectory settings

`ATTACK_PATH` contains experimental search cells: chamber 0.22 s, swing 0.12 s, return 0.32 s,
contact velocity 5 m/s, windup 0.12 m, cross offset 0.05 m, follow-through 0.04 s, thoracic
rotation 0.2 rad clamped to the actual joint limits. The chamber and return gates ask point
error below 0.05 m and body-relative speed below 0.6 m/s for 0.05 s. Preparation times out at
0.8 s and return at 1.2 s. Startup waits 2 s. The timing cell is retained from the physical
sweep below; it does not establish competitive strength.

Hook paths use a degree-six midpoint deviation with zero endpoint value, velocity and
acceleration: 0.18 s, 0.05 m lateral curve and 0.15 m lateral terminal-direction component
before normalization. The retained hook is a close-range primitive. Downward paths retain a
straight outbound segment from a higher chamber. Low support remains research work.

Terminal velocity uses the shared quintic Hermite path. Its continuation beyond the endpoint
is linear, so the IK finite differences preserve the requested contact rate. A segment identity
starts each new path; moving targets within a segment retain its original start and clock.
The actual point position and velocity, rather than the interpolation clock alone, admit launch
and verify return. A new external contact interrupts the stroke. Sustained pressure is recorded
separately in the autonomous combat evaluator.

## Initial timing sweep

Node unpinned core stand, rapier-coordinate, 120 Hz, symmetric muscles, Warrior empty right
hand, balance 0. Twelve cells run against a fixed obstruction and the same point in empty space
for 8 s each. The target is (0.15, 1.63, 0.65) m. The knuckles and relative COM velocity are read
fresh before each solver step, after control. This replaces the earlier preceding-view sample.
The settings below are measured again under the corrected reading.

| Family | Swing (s) | Terminal ask (m/s) | Min. contact forward speed (m/s) | Verified returns hit/miss | Failures hit/miss | Falls hit/miss |
|---|---:|---:|---:|---:|---:|---:|
| straight | 0.12 | 3 | 3.335 | 7/7 | 0/0 | 0/0 |
| straight | 0.12 | 5 | 4.493 | 7/7 | 0/0 | 0/0 |
| straight | 0.15 | 3 | 3.923 | 7/7 | 0/0 | 0/0 |
| straight | 0.15 | 5 | 4.348 | 7/7 | 0/0 | 0/0 |
| straight | 0.18 | 3 | 3.197 | 7/7 | 0/0 | 0/0 |
| straight | 0.18 | 5 | 4.243 | 7/6 | 0/0 | 0/0 |
| cross | 0.12 | 3 | -0.227 | 7/7 | 0/0 | 0/0 |
| cross | 0.12 | 5 | 4.644 | 7/7 | 0/0 | 0/0 |
| cross | 0.15 | 3 | 4.419 | 7/7 | 0/0 | 0/0 |
| cross | 0.15 | 5 | 4.303 | 7/6 | 0/0 | 0/0 |
| cross | 0.18 | 3 | 3.596 | 7/6 | 0/0 | 0/0 |
| cross | 0.18 | 5 | 3.840 | 6/7 | 0/0 | 0/0 |

The retained straight/cross cell remains 0.12 s and 5 m/s: both avoid the weak late contacts
of the slower cells while preserving returns and balance on misses. This does not establish
competitive strength. The raw rows, path error and fraction of muscle channels at activation
at least 0.999 are in `combat-strikes-physical.json`. These are command saturation readings,
not delivered muscle work. Fixed-obstacle impulse is not damage.

## Close hook

The same Node stand at 120 Hz, balance 0, targets (?0.1, 1.63, 0.5) m.

| Hand | Contacts | Min. forward / total speed (m/s) | Mean / max. driven path error (m) | Returns hit/miss | Failures/falls |
|---|---:|---:|---:|---:|---:|
| left | 8 | 2.724 / 3.042 | 0.0091 / 0.0625 | 7/6 | 0/0 |
| right | 8 | 2.691 / 3.012 | 0.0086 / 0.0615 | 7/6 | 0/0 |

Samples stop at first contact in each stroke. The hook also has a measured inward component
greater than 1 m/s. Mean channel saturation is 2.3% on right-hand hits. Misses expose a large
endpoint/follow-through error (maximum 0.43?0.45 m) when the desired extension exceeds arm
reach; they return six times with no fall. Safe return does not establish path fidelity.
The gate requires the measured close hit, its inward velocity and repeatable miss return.

Rejected search cells are preserved in `combat-hook-search.json`: the initial 0.7 m lateral
direction misses every fixed target, as do many wider/farther curves. At 0.5 m ahead, doubling
the curve to 0.1 m misses at every searched time. The retained 0.05 m, 0.18 s cell produces
eight contacts; 0.15 s also reaches but has a weaker first contact. This is a small arc around
a local obstacle, not evidence of a sweeping hook or of defeating a raised guard.

## Tactical settings

`COMBAT` contains these tactical search cells: range band and arm reserve 0.08 m, braking horizon 0.5 s,
target prediction 0.12 s, pressure threshold and escape duration 0.6 s, fallback/lateral
pace 0.2 m/s, three observed blocks before a lateral escape, boundary margin 0.08 m, counter window 0.2 s, launch settle hold 0.08 s and COM launch speed below 0.35 m/s. They permit
experiments through immutable config overrides; competitive selection remains pending.

## Autonomous prototype

Node Arena Duel, rapier-coordinate, 120 Hz, Warrior empty hands, balance 0/0, continuing
recovery, 30 s cap. Six diagnostics are stored in `combat-prototype-bouts.json`. At 4 m,
prototype self-play gives 19/20 driven contacts, all intercepted by hands/forearms, 0.127/0.130 hp
driven damage, no falls and 1.2 s longest pressure-only runs. Against Point the prototype
produces 25 and 19 driven contacts in the two assignments versus Point's 4 and 1. It wins
both at the cap; this is two fixtures, not a rating or a decisive combat result. Against
Classic the assignments split cap wins. Opening selection and stronger target contact remain
required; more hand contacts alone do not satisfy promotion.

## Opening selection

`OPENINGS` ranks head, upper-trunk and middle-trunk collision surfaces. Capsule/sphere samples
are projected onto their boundary. A box or hull is clipped by its actual outward convex planes;
the first ray entry supplies a surface point, rather than its internal centre or visible mesh.
The immutable hull geometry is cached per sourced segment. Hull targets use nine rays around
the mean of their points: lateral and vertical offsets of ?0.25 of the corresponding extent.

Linear/spin prediction is 0.12 s plus measured observation age. Blocked lanes cost 2,
working-range error costs 2 per metre, and the hand-radius margin is half its sourced radius.
Reference surface priorities are 0, 0.2 and 0.4 for head/upper/middle trunk. A repeated blocked
surface adds 1. Capsule samples use elevations of -0.5, 0 and 0.5 radii. Mixed selection checks
four segments of the commanded hand path, adds 0.1 to a hook's rank and reduces its working
reach by 0.15 m. These remain development search cells. Mixed selection can compare both hands;
ties retain the alternating hand. It refreshes at most every 0.12 s while free, and retains its
committed choice and path clock during a stroke. Its memory belongs to bout state.

The `openings` config supplies immutable target preferences; `repertoire: "linear"` retains
straight/cross reference execution, and `"mixed"` ranks straight/close-hook trajectories.
Current physical evidence favours torso preference, not frequent hook use. Held weapon
obstruction shapes and low support remain to implement. The policy reads no opposing orders,
controller phase, wounds or future physics. The evaluator records intended surfaces separately
from actual driven contact segments.

## Hull-aware development

The Warrior's upper and middle trunk colliders are hulls. The capsule-only selector omitted
both; its six diagnostics in `combat-openings-bouts.json` are head-only behaviour. They provide
no evidence for body targeting. The corrected selector is measured again below.

The eighteen 30 s diagnostics in `combat-hull-probes.json` use Node Arena Duel, rapier-coordinate,
120 Hz, unarmed Warriors, balance 0/0, gap 4 m and continuing recovery. Assignments mirror each
candidate against the corrected linear Combat, Point and Classic. Every reported win is at
the cap. This is a diagnostic matrix, not independent rating evidence.

| Mixed candidate priorities head/upper/middle | Driven damage against Point, both assignments (HP) | Driven torso/target contacts against Point | Self-falls, all six bouts |
|---|---:|---:|---:|
| 0 / 0.2 / 0.4 | 0.182 / 0.240 | 8 / 8 | 0 |
| 0.3 / 0 / 0 | 0.504 / 0.451 | 19 / 17 | 0 |
| 1 / 0.2 / 0 | 0.525 / 0.632 | 22 / 17 | 1 |

The target-contact counts exclude opposing hands/forearms, but do not identify every remaining
surface as trunk. A separate physical regression test requires actual upper/middle-trunk
contacts against attacking Point, with driven damage above 0.2 HP in 20 s and no falls/assists.
Its fresh-world fork covers hull selection and the subsequent strike/return.

The retained development candidate is 0.3 / 0 / 0, preserving the reference muscles and paths.
Twenty distinct mirrored development recipes vary gap, delay and timed ordinary orders, with
60 s continuing bouts against the corrected linear Combat. `combat-body-development.json`
contains all forty physical trials and their source fingerprint. Win score is 1.0; the 95%
paired Wilson interval is [0.839, 1.0], equivalent to an Elo lower bound of +286.6. A finite
point Elo is not estimable from a perfect score. The candidate has one fall in forty bouts. It launches 2,038 straights and one hook. All forty wins end at the cap; none proves
ordinary-wound incapacitation. These are development results, not held-out promotion.

Built-browser inspection uses the selectable Combat mode on two empty-handed Warriors,
rapier-coordinate at the shared 120 Hz world rate, balance 0/0, continuing recovery. The
visible HUD advances through approach, chamber and return, and Tactical view displays both
physical bodies. The check reaches 14 s of the bout and verifies the recipe choices. It is
performed alongside the full Node suite and establishes no frame-time budget. The owned
preview server and tab are stopped after inspection.

The `COMBAT` boundary escape uses 0.18 m/s while retaining its current heading until the
actual torso clearance leaves the parapet margin. This is the conservative side-approach
speed from the grounded combat probes, applied to the geometry correction for hull torsos.


## Overhand settings

`ATTACK_PATH.overhandWindup` is 0.35 m, a vertical chamber above the actual guard for the
optional overhand family. It retains 0.22 s preparation, 0.12 s swing, 5 m/s requested contact
speed and the ordinary measured return/physical chamber gate. The chamber also retreats by the ordinary 0.12 m windup before lifting. An optional world
contact direction passes through the neutral action and is transformed into the actual root
frame each step. The vertical repertoire requests a downward velocity at top-surface targets.

Node unpinned Warrior stand, gameplay Rapier coordinate engine, 120 Hz, empty hands, balance 0.
This initial search lifts in place, before adding the backward chamber. The fixed box is 0.20 by 0.20 by 0.08 m, centred 0.04 m behind the target. Target height is
1.73 m and lateral position is +/-0.10 m. Each cell runs eight simulated seconds with the
first two seconds excluded. Contact speeds are driven pre-contact readings; returns use the
shared actual-motion gate. No cell falls or uses assistance.

| Vertical chamber (m) | Preparation (s) | Target ahead (m) | Right/left contacts | Right/left verified returns | Lowest right/left pre-contact axial speed (m/s) |
|---|---|---|---|---|---|
| 0.25 | 0.22 | 0.40 | 0/0 | 5/5 | - |
| 0.25 | 0.22 | 0.50 | 8/8 | 7/7 | 3.447/3.423 |
| 0.25 | 0.35 | 0.40 | 0/0 | 5/5 | - |
| 0.25 | 0.35 | 0.50 | 7/7 | 6/6 | 3.261/3.357 |
| 0.35 | 0.22 | 0.40 | 0/0 | 5/5 | - |
| 0.35 | 0.22 | 0.50 | 8/8 | 7/7 | 3.441/3.450 |
| 0.35 | 0.35 | 0.40 | 0/0 | 5/5 | - |
| 0.35 | 0.35 | 0.50 | 7/7 | 6/6 | 3.392/3.389 |

At 0.40 m the tall box obstructs preparation: five attempts fail the actual chamber gate
on each side and return without launching. This is a chamber-clearance limit, not a successful
strike. At 0.50 m there are no failed returns. The retained vertical chamber has later driven
axial peaks near 4.1 m/s, versus about 3.9 m/s for the smaller chamber; these fixed-box readings
do not establish guard penetration, game damage or competitive strength.


`OPENINGS.overhand` defaults to zero additional ranking cost. An immutable opening override
can vary this cost for selection ablations without changing the trajectory, muscles or physics.
The high fixed-box miss returns at least five times per hand in eight seconds, with no failures,
falls or assists; the contact case returns at least seven times.

The backed chamber is measured separately against a horizontal top face, 0.20 by 0.08 by
0.20 m, with its top at 1.73 m, target ahead 0.50 m and explicit world direction [0,-1,0].
The right/left hands produce 6/7 swing contacts and 6/6 verified returns in eight seconds;
misses return six times each. There are no failures, falls or assists. Actual downward closing
speeds range from 0.746 to 3.112 m/s on the right and 1.408 to 4.409 m/s on the left.
The physical hand can meet a surface before its named knuckle point reaches the requested
5 m/s endpoint; requested velocity alone establishes neither impact speed nor effectiveness.

Six 60 s Arena diagnostics of vertical selection with an overhand ranking cost of -0.6
win both assignments against Classic, and lose both against Point and retained Brawler.
All outcomes are at the cap. These single-recipe diagnostics are not rating evidence and
do not promote vertical selection. Full diagnostic records are in
`combat-overhand-diagnostics.json`; the unrecorded source fingerprint limits their use.
