# Reptile anatomy and control

## Anatomical model

The reptile is an authored, low, sprawling quadruped, 8 kg with 1 HP and zero
balance. It is a game creature, not a reconstruction of a particular species.
`assets/reptile/body.json` is the complete table of reference geometry, relative
segment masses, joint limits, torque ceilings and unloaded speeds.

The proportions, mass weights, joint excursions, torque ceilings and speeds are
explicit estimates authorized for gaps in anatomical evidence. They are not
measurements from a real specimen. The limits include the declared reference
pose. Four legs carry a rigid trunk; a two-axis neck carries the head, a hinge
opens the lower jaw, and two weakly driven tail segments hang behind the trunk.

Monitor-lizard muscle architecture informs the choice of sprawling limbs and
separate forelimb and hindlimb chains. Relevant primary datasets are Dick and
Clemente (2016), https://doi.org/10.1186/s12983-016-0141-5, and Cieri et al.
(2020), https://pmc.ncbi.nlm.nih.gov/articles/PMC7704238/. Their measurements are
not transcribed as the creature's estimated torque ceilings.

Masses are each segment's declared weight divided by the sum of weights, times
8 kg. The centre of mass is the midpoint. A box has the uniform cuboid's moments;
a capsule's inertia is approximated by a uniform cylinder of the declared radius
and its full end-to-end extent. Collision geometry does not change those masses.
Surface stiffness is an explicit 17,000 N/m estimate throughout, not a borrowed
human anatomical table. A segment's endpoints define its local longitudinal axis;
box sizes are along that segment's local frame.

## Controller settings

These values are controller choices, held separately from the anatomy in `REPTILE_MOTOR`, `REPTILE_CRAWL`,
`REPTILE_RECOVERY` and `REPTILE_BITE` (`src/core/reptile/tuning.ts`).
The contact gates and the final fixed-anatomy checks below qualify the combination; they are
not a measured optimum or evidence of a real animal's locomotion. Response times are seconds,
lengths metres, angles radians, and height multipliers relative to the spec's reference COM.

The reptile is down (`DownSpec` `low`, `assets/reptile/body.json`'s `down`) once its trunk's up
tips under 0.5 (60 degrees from upright) or its centre of mass sinks under 0.6 of its standing
height over its lowest point.

| Construct | Values | Purpose |
| --- | --- | --- |
| Floating-base response | centre .12, endpoint .08, turn .12, posture .15 s | Damped support and pose tracking |
| Support solve | lever .3 m, damping .005, rootMotion .05 s | Wrench weighting, regularization and observed root-acceleration filtering |
| Crawl geometry | crawlHeight .85, stride .07 m, lift .06 m | Lowered three-paw support and one-paw swing |
| Crawl timing | swing 1.2, shift .45, settle .3, plant .2 s; plantSpeed .05 m/s | Slow placement and continued downward acquisition |
| Placement bounds | placementLimit 3 s, liftConfirm .001 m | Return an unlanded paw; require real lift-off |
| Support margins | inset .4 m, supportInset .1 m, shiftError .008 m | Desired support-centre inset and actual containment tolerance |
| Heading | yawStep .18 rad per four paws, turnError .05 rad | Bounded heading advance |
| Contact | supportNormal .5, contactMargin .01 m | Positive fixed-ground impulses, and sole versus edge contact |
| Jaw path | prepare .25 s, snap .12 s, open .3 rad, jawError .03 rad, jawClosed .001 rad | Measured opening and closing, with finite angular motion |
| Bite reach | biteEntry .008 m beyond the tip-to-mouth span, bitePrepareNear .12 m, biteElevation .15 m, biteNear .04 m | Sensed surface selection and physical chamber readiness |
| Bite cycle | release .2 s, biteSlow .2 m/s, biteHold .03 s, biteTimeout 1.2 s, biteReturnLimit 3 s | Verified quiet release, or an explicit failed cycle |
| Grounded righting | rightingGain 8 N m/rad, rightingDamping 4 N m s/rad, rightingEpsilon .000001 | Upright-error moment projected onto loaded hips, bounded by their muscles |
| Clear leg route | foldHip 1.2, foldKnee 2.6, plantedKnee 1.4, sweepYaw 1.2, wrappedHip .5, unwindHip 2 rad | Move a wrapped paw around a trunk end before unfolding; interpolation spans the declared unwind interval |
| Leg tracking | recoveryServo .06, placementServo .008 s, placementError .15 rad, foldWait .5 s | Separate holding and moving legs; require actual joint arrival and paw clearance |
| Paw acquisition | pressWait .3 s, pressLever .15 m, pressDepth .002 m | A bounded joint servo lowers a paw; the lever is a controller approximation, not anatomy |
| Recovery retry | routeLimit 10 s, recoveryLimit 30 s | Try the other trunk end, or restart from actual posture; neither reports success |
| Supported handover | recoveryPath .5 s, recoveryHeight .8, recoveredSpeed .1 m/s, recovered .5 s, rollUpright .95 | Free-paw reacquisition and quiet four-sole support before resume |
| Supported rise response | centre .12, endpoint .08, turn .12, posture .15 s | The same physical support solve as ordinary control |

The crawl's centre is shifted into the other three actual contact patches before a swing.
A path finishing does not establish a landing: a paw must first clear the floor and then carry
a positive ground impulse. An unsuccessful landing returns toward its saved anchor and retries.
Righting reads all fixed-ground contacts but gives joint pushes only through loaded leg chains.
Its leg route reads each leg's own hip and knee; blocked routes reverse the chosen trunk end.
Completion requires actual four-paw sole contact, sufficient height, an upright body and a quiet
COM for half a second. Recovery does not require that support before it starts.

The bite uses sensed collision surfaces near its mouth, not a named opponent limb. The mouth
goal compensates the exposed 30 mm lower-jaw tip; this anatomical offset gives the jaw a chance
to meet the target before the head. Jaw motion is an angular quintic path, the chamber/strike/return
states use the shared strike cycle, and all wounds use ordinary closing-contact energy sharing.
The head and jaw must lose foreign loaded contact before a return succeeds; crowded returns
request backward crawling. No grip, clamp damage, decorative tooth collider or artificial striker exists.

## Encounters

The registry's `HUMANOIDS` retains the .35 m footprint and one-second progress interval from
[following](play.md#following), and `ATTACK_METRES` from
[attack distance](human-and-strikes.md#attack-distance). Humanoid falls end a dungeon fight.
`REPTILE` provides empty equipment, a quadruped mind, no clothing, .52 m dungeon attack spacing
and an eight-second progress interval. These are controller choices for the qualified slow crawl.
`STALL_METRES` retains the 50 mm route-progress threshold; the reptile's longer interval lets it
advance that distance before its route is judged stalled. The horizontal navigation radius is derived from the full
collider envelope, including the tail, rather than copied from humanoid shoulder width.
Party placement also uses that footprint and the radii of companions already placed.

Generated crypt and generated-depth layouts alternate skeleton rooms and three-reptile packs.
`ENCOUNTERS` sets three bodies per pack, at least 2 m apart, and one extra metre clear of doors
beyond their radius. These spacing choices keep slow bodies clear of their neighbours and doorways.
Pack points are
outside the party's initial 15 m separation, walkable with closed doors and reachable from the
start at the body's radius. A generated candidate with insufficient space is rejected before
the run is constructed. Point-only and unchanged authored maps retain their skeleton encounters.
Every built actor receives the run's shared senses. A reptile's fall does not empty its pool or
eliminate it while it recovers; an upright party body must reach the exit to win.

## Qualification

The Node stand uses the core world, the default `rapier-coordinate` engine and
120 Hz. Anatomy stays fixed during controller qualification; controller response,
placement and gait settings are separate from anatomical strength.

The permanent witnesses are `tests/core-reptile.test.mjs`, `tests/reptile-recovery.test.mjs`,
`tests/reptile-fork.test.mjs` and `tests/reptile-integration.test.mjs`. No anatomical torque or
unloaded speed is raised during their qualification.

| Node stand, rapier-coordinate, 120 Hz | Gate/result |
| --- | --- |
| Construction with gravity and ground disabled | Eight steps, segment speed below 10 micrometres/s |
| Standing | Thirty seconds upright, COM above .17 m, horizontal drift below .05 m |
| Forward and backward crawl | At least two .44 m trunk lengths in each 60 s interval |
| Stop, turn, rightward crawl | Quiet stop within .02 m; quarter turn within .1 rad in 120 s; two trunk lengths rightward in 60 s |
| Paw accounting | At most one requested swing; each counted landing follows physical lift-off and positive fixed-ground contact |
| Closing-jaw contact | One clean chambered-jaw/shank blow, positive energy and damage to both surfaces; cancellation gives one verified release and no failed return |
| Autonomous bite | Senses-only approach and closing-jaw contact, followed by verified release after cancellation |
| Recovery | Back, left, right and lowered-belly poses in two headings, eight handovers within 100 s; each then walks two trunk lengths in 60 s without another fall |
| No floor | No invented support or completed rise in a gravity-free unsupported inverted body |
| Lifecycle and replay | Hold/resume retains physical bodies; crawling, jaw cancellation and righting fork exactly, with physics-only and state-only negative controls |
| Generated packs | Both layout generators, 24 seeds each; complete-map repeatability, physical clearance, reachability and pack separation |

The clean jaw fixture's closing rate immediately before contact is -.058929649 rad/s and its
energy .0000642368897 J. Its target receives .0000000413486455 HP and its own jaw
.00000060102025 HP. These are common-rule blunt contact readings, not a credible finishing
bite. The autonomous approach fixture includes incidental contacts before its jaw stroke;
it is not the clean one-contact measurement. Neither establishes competitive combat power.
The eight recovery poses are development witnesses, not a claim about arbitrary falls,
obstacles or opponents. Some rotated leg positions take repeated retries and about 80 s.

## Humanoid regression

`node research/body-plan-regression.mjs CHECKOUT OUTPUT.json` runs the same Node stand and Duel
on a supplied checkout, rapier-coordinate at 120 Hz. Standing uses 120 warmup steps followed
by 1,200 measured steps; each Warrior/Rogue bout takes 2,400 steps. All segment poses enter
the digest after every measured step. Comparison against upstream `3f60d702` gives:

| Witness | Upstream digest | Quadruped implementation digest |
| --- | --- | --- |
| Warrior standing | `2a08cb82a39d0889` | `2a08cb82a39d0889` |
| Rogue standing | `ef9201a9062b6c05` | `ef9201a9062b6c05` |
| Skeleton standing | `ed808209f8b4327c` | `ed808209f8b4327c` |
| Warrior/Rogue, clubs | `1805f1c3d51d2a5b` | `1805f1c3d51d2a5b` |
| Warrior/Rogue, empty hands | `78f8e4519b5c8977` | `78f8e4519b5c8977` |

The club verdict is unchanged: left wins by fatal wound at 9.125 s. The empty-hand bout has
no verdict inside the measured 20 s. These fixtures establish exact retention of the covered
humanoid paths. Initial timing readings overlapped recovery measurements, so they do not
support a performance comparison.
