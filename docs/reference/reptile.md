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
Ordinary surfaces have an explicit 17,000 N/m estimate, not a borrowed human
anatomical table. Three lower-jaw tooth pyramids are separate anatomical colliders,
each with its own authored 10,000,000 N/m surface. Their tips rise 8 mm from their
bases, at reference y .2255 m and z .485 m.
Their reference points, directions and .5 contact-normal cosine are in the asset.
These are game estimates, not measured enamel stiffness or species bite forces.
The lower middle tooth tip is the jaw's `bite` point. Teeth belong to the existing
segment mass and inertia; adding their colliders adds no mass or muscle strength.
A segment's endpoints define its local longitudinal axis;
box sizes are along that segment's local frame.

## Controller settings

These values are controller choices, held separately from the anatomy in `REPTILE_MOTOR`,
`REPTILE_TRAVEL`, `REPTILE_TROT`, `REPTILE_CRAWL`, `REPTILE_RECOVERY` and `REPTILE_BITE`
(`src/core/reptile/tuning.ts`).
The contact gates and the final fixed-anatomy checks below qualify the combination; they are
not a measured optimum or evidence of a real animal's locomotion. Response times are seconds,
lengths metres, angles radians, and height multipliers relative to the spec's reference COM.

The reptile is down (`DownSpec` `low`, `assets/reptile/body.json`'s `down`) once its trunk's up
tips under 0.5 (60 degrees from upright) or its centre of mass sinks under 0.6 of its standing
height over its lowest point.

| Construct | Values | Purpose |
| --- | --- | --- |
| Floating-base response | centre .12, endpoint .08, turn .12, posture .15 s | Damped support and pose tracking |
| Travel response | centre .06, endpoint .04, turn .06, posture .06 s | Faster support and free-paw tracking during the trot |
| Support solve | lever .3 m, damping .005, rootMotion .05 s | Wrench weighting, regularization and observed root-acceleration filtering |
| Trot geometry | crawlHeight 1, lift .025 m, lead .3 s | Standing COM height and paw placement ahead of the actual COM by the commanded velocity times the lead |
| Trot travel | speed .3 m/s, acceleration .5 m/s2, sideways .15 | Bounded velocity changes and slower lateral travel |
| Trot timing | swing .22, settle .025, plant .2 s; plantSpeed .2 m/s | Alternating diagonal pairs, with root motion subtracted from landing velocity |
| Trot heading | turnRate .25 rad/s, turnMoveAngle .2 rad, turnError .05 rad | Wait for the actual trunk heading before accelerating; bound the requested turn |
| Trot acquisition | liftConfirm .001 m, landingWait .1 s, placementLimit 3 s | Count physical lift and reload; brake on delayed landing and return an unlanded pair to its anchors |
| Resumed travel | resumeSpeed .1 m/s, resumeHold .3 s, resumeAngle .05 rad | Align and place paws through the crawl, then require quiet four-sole support before trotting |
| Crawl geometry | crawlHeight .85, stride .035 m, lift .025 m | Lowered three-paw support and one-paw swing |
| Crawl timing | swing 1.2, shift .45, settle .3, plant .2 s; plantSpeed .05 m/s | Slow placement and continued downward acquisition |
| Placement bounds | placementLimit 3 s, liftConfirm .001 m | Return an unlanded paw; require real lift-off |
| Support margins | inset .4 m, supportInset .1 m, shiftError .008 m | Desired support-centre inset and actual containment tolerance |
| Heading | yawStep .18 rad per four paws, turnError .05 rad | Bounded heading advance |
| Contact | supportNormal .5, contactMargin .01 m | Positive fixed-ground impulses, and sole versus edge contact |
| Jaw path | prepare .25 s, snap .12 s, open .3 rad, jawError .03 rad, jawClosed .001 rad | Measured opening and closing, with finite angular motion |
| Bite reach | biteEntry .008 m beyond the tip-to-mouth span, bitePrepareNear .12 m, biteElevation .15 m, biteNear .04 m | Sensed surface selection and physical chamber readiness |
| Bite placement | contactAt .5 of the opening angle, biteAlign .04 m, biteShift .04 m, biteInset .02 m | Aim the middle of the tooth's closing stroke; bound COM displacement within loaded paw support |
| Closing path | closeRate 4 rad/s | Retain closing velocity at the requested path endpoint; actual motion remains muscle limited |
| Bite cycle | release .2 s, biteSlow .2 m/s, biteHold .03 s, biteTimeout 1.2 s, biteReturnLimit 8 s | Verified quiet release; the bound allows actual backward paw placements before reporting failure |
| Bite approach | approach .3 m, braking .5 m/s2, creepNear .3 m | Reduce travel intent with remaining mouth clearance and stopping distance; retain close crawling until the foe clears this distance |
| Grounded righting | rightingGain 8 N m/rad, rightingDamping 4 N m s/rad, rightingEpsilon .000001 | Upright-error moment projected onto loaded hips, bounded by their muscles |
| Clear leg route | foldHip 1.2, foldKnee 2.6, plantedKnee 1.4, sweepYaw 1.2, wrappedHip .5, unwindHip 2 rad | Move a wrapped paw around a trunk end before unfolding; interpolation spans the declared unwind interval |
| Leg tracking | recoveryServo .06, placementServo .008 s, placementError .15 rad, foldWait .5 s | Separate holding and moving legs; require actual joint arrival and paw clearance |
| Paw acquisition | pressWait .3 s, pressLever .15 m, pressDepth .002 m | A bounded joint servo lowers a paw; the lever is a controller approximation, not anatomy |
| Recovery retry | routeLimit 10 s, recoveryLimit 30 s | Try the other trunk end, or restart from actual posture; neither reports success |
| Supported handover | recoveryPath .5 s, recoveryHeight .8, recoveredSpeed .1 m/s, recovered .5 s, rollUpright .95 | Free-paw reacquisition and quiet four-sole support before resume |
| Supported rise response | centre .12, endpoint .08, turn .12, posture .15 s | The same physical support solve as ordinary control |

The trot alternates diagonal pairs selected from the reference footprint. It advances the COM
continuously at a commanded velocity, rather than waiting for a support shift at every paw.
Its free paws land with world velocity near zero across the ground, compensating translation
and rotation of the trunk. The crawl respects travel intent magnitude, so approach braking
also shortens its stride.
Its centre is shifted into the other three actual contact
patches before a swing. Its paw placements are relative to the actual COM and reference
footprint, so a support shift does not progressively widen the stance.
A path finishing does not establish a landing: a paw must first clear the floor and then carry
a positive ground impulse. An unsuccessful landing returns toward its saved anchor and retries.
Gaits switch after the active placement ends. Approach brakes toward the mouth's usable reach;
close fighting and crowded withdrawal use the crawl until the opponent is clear. A resumed host
places every paw through the crawl, aligns its actual heading with the order and verifies quiet
four-sole support before trotting.
Righting reads all fixed-ground contacts but gives joint pushes only through loaded leg chains.
Its leg route reads each leg's own hip and knee; blocked routes reverse the chosen trunk end.
Completion requires actual four-paw sole contact, sufficient height, an upright body and a quiet
COM for half a second. Recovery does not require that support before it starts.

The bite selects a sensed surface near its mouth. Preparation retains that material point
in the opponent segment's frame, so it follows the foe without chasing a new nearest point
as its own head moves. A changed foe order replaces the chamber target; the snap keeps its
committed aim. The mouth goal compensates the tooth position during the closing
stroke. A bounded horizontal COM shift stays inside the actual paw support polygon.
Admission waits for four loaded paws and the actual trunk heading; the committed bite
can continue with three loaded paws. A queued crawl turn pauses while the bite owns the body.
A jaw opened beyond the
requested gape can strike from its measured angle; it need not first close to an exact opening.
The angular quintic keeps closing velocity through contact, within the unchanged muscle
ceilings. The snap commits the last chambered aim.

The shared blow rule reads the strongest loaded shape pair. A physical tooth facing into
the contact normal prices the opposite side's energy share by the existing `point` worth;
its sides and back, and ordinary head and jaw shapes, remain blunt. The tooth's stiffness
sets the compliance share. The bite has no special striker or hit-point multiplier.
The head and jaw must lose foreign loaded contact before a return succeeds; crowded returns
request backward crawling while retaining the forward heading. Sustained clamping, tissue
deformation and penetration work are not modeled: continued pressure alone creates no new blow.

## Encounters

The Crypt's `HUMANOID` (`cryptModel`, `src/dungeon/actors.ts`) retains the .35 m footprint and one-second progress interval from
[following](play.md#following), and `ATTACK_METRES` from
[attack distance](human-and-strikes.md#attack-distance). Humanoid falls end a dungeon fight.
The reptile has empty hands and a quadruped mind by default (`modelInfo`), and in the Crypt .52 m attack spacing
and an eight-second progress interval. These are controller choices allowing heading changes
and careful close crawling as well as the faster trot. `STALL_METRES` retains the 50 mm
route-progress threshold. The horizontal navigation radius is derived from the full
collider envelope, including the tail, rather than copied from humanoid shoulder width.
Party placement also uses that footprint and the radii of companions already placed.

Generated crypt and generated-depth layouts alternate skeleton rooms and three-reptile packs.
`ENCOUNTERS` sets three bodies per pack, at least 2 m apart, and one extra metre clear of doors
beyond their radius. These spacing choices keep bodies clear of their neighbours and doorways.
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
`tests/reptile-fork.test.mjs`, `tests/reptile-combat.test.mjs` and `tests/reptile-integration.test.mjs`. No anatomical torque or
unloaded speed is raised during their qualification.

| Node stand, rapier-coordinate, 120 Hz | Gate/result |
| --- | --- |
| Construction with gravity and ground disabled | Eight steps, segment speed below 10 micrometres/s |
| Standing | Thirty seconds upright, COM above .17 m, horizontal drift below .05 m |
| Forward and backward trot | At least 2 m forward and 1.8 m backward in each 10 s interval, including acceleration |
| Stop, turn, rightward trot | Quiet stop within .02 m; quarter turn within .1 rad in 20 s; at least 2 m rightward in 10 s |
| Paw accounting | At most two requested swings in the trot, one in the crawl; each counted paw clears the floor and reloads through positive fixed-ground contact |
| Closing-jaw contact | A fixed opposing Reptile jaw receives a tooth contact during the fast closing stroke; cancellation gives one verified release and no failed return |
| Autonomous bite | Senses-only approach and closing-jaw contact, followed by verified release after cancellation |
| Autonomous mirror matches | Gaps 1.5, 2 and 3 m, 30 s each: neither body falls; both launch before 12 s and release bites; each bout includes a driven closing-jaw point contact with positive common-rule damage |
| Recovery | Back, left, right and lowered-belly poses in two headings, eight handovers within 100 s; each then walks two trunk lengths in 60 s without another fall |
| No floor | No invented support or completed rise in a gravity-free unsupported inverted body |
| Lifecycle and replay | Hold/resume retains physical bodies; crawling, jaw cancellation and righting fork exactly, with physics-only and state-only negative controls |
| Generated packs | Both layout generators, 24 seeds each; complete-map repeatability, physical clearance, reachability and pack separation |

### Bite placement and tooth contact

`node research/reptile-bite.mjs --sweep` runs the Node core stand, rapier-coordinate at
120 Hz, with balance zero on both sides. The lower jaw starts at .3 rad. A fixed
opposing Reptile at [0, 0, .97] m faces it, and the ordered tooth target is
[0, .1925, .485] m. Cancellation follows the first driven jaw blow. The same
physical geometry, masses, muscles and point pricing are used in these immutable
controller comparisons; the rate is sampled immediately before impact.

| Contact angle fraction | Path endpoint closing rate, rad/s | Time into stroke, s | Actual jaw rate, rad/s | Energy, J | Target damage, HP |
| --- | --- | --- | --- | --- | --- |
| 0 | 0 | .066667 | -4.737118 | .00892337 | .00297375 |
| .5 | 0 | .058333 | -4.407002 | .01334741 | .00444808 |
| .5 | 4 | .083333 | -3.798380 | .01170222 | .00389981 |

Every row launches once, returns once without failure, releases both head and jaw,
and stays upright. These rows establish fast physical entry; they do not show that
the selected endpoint rate maximizes damage. The default is qualified together
with the moving encounters below. The autonomous version of the same fixed-target
stand hits at -3.529875 rad/s, .01347776 J and .00449152 HP, and releases without
failure. The unloaded trial has no blow and loses no HP.

The default clean hit's tooth receives .001697 of the energy and its opposing jaw
.998303. The latter is priced by the existing point/blunt ratio (1134.99/34),
about 33.38, rather than an extra Reptile multiplier. Ordinary shapes and a tooth's
side or reverse direction retain blunt pricing. This fixture replaces the old
front-of-shank placement in `c8d620cb` (Node core stand, the same engine, rate and
zero balances), which sampled the jaw after it had slowed to -.051018
rad/s; the two target geometries are different, so their damage is not a direct
before/after ratio.

`node research/reptile-motion.mjs` runs autonomous Node arena mirror bouts on
rapier-coordinate at 120 Hz, balance zero on both sides, for 30 s. Each row below
is a driven closing-jaw point contact; the rate belongs to its toothed side and
is sampled before contact. An earlier approach bump is not included.

| Starting gap, m | First launches, left/right, s | Point contact, s | Jaw rate, rad/s | Energy, J | Opposing jaw damage, HP | Falls |
| --- | --- | --- | --- | --- | --- | --- |
| 1.5 | 6.708 / 6.708 | 6.725 | -.337321 | .00123442 | .00041138 | 0 / 0 |
| 2 | 8.567 / 7.533 | 8.667 | -4.234745 | .01895199 | .00631583 | 0 / 0 |
| 3 | 9.558 / 9.550 | 18.533 | -.502355 | .00426229 | .00142043 | 0 / 0 |

Both sides launch and verify at least one release in every bout, and spend no
assist. Contact during preparation can precede the stroke; a launch alone does
not establish a fresh damaging contact. The widest-gap bout's first driven point
contact follows its initial launches. Accordingly, the prompt-launch gate and
actual damaging-contact gate are separate. Preparation and crowded returns can
still time out and retry. Damage remains modest, and these measurements do not
establish practical finishing power against humanoids. Sustained compression,
tissue yielding and penetration work remain open; the rigid contact rule prices
closing entries, not time spent clamped.

The eight recovery poses are development witnesses, not a claim about arbitrary falls,
obstacles or opponents. Some rotated leg positions take repeated retries and about 80 s.

### Travel admission after recovery

The Node stand, rapier-coordinate at 120 Hz, starts the reptile on its left side with a
quarter-turn heading, then commands forward travel for 60 seconds after physical handover.
Anatomy and balance are unchanged, with no external blow. Handover occurs at 20.283 s.

| Admission before accelerating | Steps down after handover | Forward distance in 60 s, m |
| --- | --- | --- |
| Commanded heading within .2 rad | 364 | 12.618 |
| Crawl aligns the actual heading within .05 rad before trotting | 0 | 13.715 |

The commanded heading can arrive before the body turns. Travel reads the actual heading, and
a resumed host completes its heading change through the crawl. Quiet paw contact alone does
not establish that the body is ready to accelerate toward its goal.
The eight-pose qualification retains the requirement for no fall after handover.

### Travel selection

`node research/reptile-motion.mjs --sweep` runs the Node stand on rapier-coordinate at 120 Hz,
with zero balance and fixed anatomy. Each row stands for two seconds, then commands forward
travel for ten seconds on a 100 m ground. These are driven, unstruck intervals. Overrides are
passed into `createQuadrupedMind`; no global setting is mutated.

| Commanded speed, m/s | COM height multiplier | Distance in 10 s, m | Mean speed, m/s | Steps down | Counted paws |
| --- | --- | --- | --- | --- | --- |
| .25 | 1 | 2.809 | .281 | 0 | 76 |
| .30 | 1 | 3.243 | .324 | 0 | 76 |
| .35 | 1 | 3.646 | .365 | 0 | 76 |
| .40 | 1 | .339 | .034 | 296 | 6 |
| .30 | .85 | .351 | .035 | 308 | 10 |

The .30 m/s command is the qualified default; this small sweep does not establish a maximum
speed. The support response and standing height are necessary to this combination. At the
same Node stand, engine and rate, the crawl in `42cd1e5a` covered .155880 m in ten seconds
after two seconds standing (.015588 m/s). The default trot is about 20.8 times faster in this
straight-travel witness. Mean COM speed includes the physical effects of swinging limbs; it
need not equal the velocity command exactly.

`node research/reptile-motion.mjs` also prints three autonomous arena mirror matches and
distinguishes jaw blows during a committed closing stroke from incidental body collisions.
Those matches qualify approach and attacks, not competitive bite power or arbitrary encounters.

## Humanoid regression

`node research/body-plan-regression.mjs CHECKOUT OUTPUT.json` runs the same Node stand and Duel
on a supplied checkout, rapier-coordinate at 120 Hz. Standing uses 120 warmup steps followed
by 1,200 measured steps; each Warrior/Rogue bout takes 2,400 steps. All segment poses enter
the digest after every measured step. Comparison of Reptile qualification commit `cf2c220c`
against upstream `3f60d702`, before the measured workshop-hand hulls, gives:

| Witness | Upstream digest | Reptile qualification digest (`cf2c220c`) |
| --- | --- | --- |
| Warrior standing | `2a08cb82a39d0889` | `2a08cb82a39d0889` |
| Rogue standing | `ef9201a9062b6c05` | `ef9201a9062b6c05` |
| Skeleton standing | `ed808209f8b4327c` | `ed808209f8b4327c` |
| Warrior/Rogue, clubs | `1805f1c3d51d2a5b` | `1805f1c3d51d2a5b` |
| Warrior/Rogue, empty hands | `78f8e4519b5c8977` | `78f8e4519b5c8977` |

The club verdict is unchanged: left wins by fatal wound at 9.125 s. The empty-hand bout has
no verdict inside the measured 20 s. These fixtures establish exact retention of the covered
humanoid paths for that Reptile qualification. Initial timing readings overlapped recovery
measurements, so they do not support a performance comparison.
