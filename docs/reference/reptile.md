# Reptile anatomy and control

The reptile's authored anatomy (`assets/reptile/body.json`, `reptile-anatomy` in `SOURCES`,
`src/core/reptile/spec.ts`), its controller's settings (`src/core/reptile/tuning.ts`), its place in
the crypt's encounters, and the checks that qualify the combination. How its bite wounds is
[pointed contact](reptile-bites.md).

## Anatomical model

The reptile is an authored, low, sprawling quadruped, 8 kg with 1 HP and zero balance: a game
creature, not a reconstruction of a species. `assets/reptile/body.json` holds its reference
geometry, relative segment masses, joint limits, torque ceilings and unloaded speeds. Four legs
carry a rigid trunk; a two-axis neck carries the head, a hinge opens the lower jaw, and two weakly
driven tail segments hang behind.

Every proportion, mass weight, joint excursion, torque ceiling and speed is an explicit estimate
for a gap in anatomical evidence, not a measurement of a specimen; the limits include the declared
reference pose. Monitor-lizard muscle architecture informs the sprawling limbs and the separate
fore- and hindlimb chains (Dick and Clemente 2016, https://doi.org/10.1186/s12983-016-0141-5;
Cieri et al. 2020, https://pmc.ncbi.nlm.nih.gov/articles/PMC7704238/); their measurements are not
transcribed as torque ceilings.

- **Mass and inertia**: each segment's declared weight over the sum of weights, times 8 kg, its
  centre of mass at the midpoint. A box has the uniform cuboid's moments; a capsule is a uniform
  cylinder of its radius and full end-to-end extent. Collision geometry does not change the
  masses. A segment's endpoints define its longitudinal axis; box sizes are in that frame.
- **Surfaces**: ordinary surfaces have an estimated 17,000 N/m, not a borrowed human table.
- **Teeth**: three lower-jaw tooth pyramids are colliders of their own, each with an authored
  10,000,000 N/m surface. Their bases sit at y .2175 m and z .481-.489 m; their tips rise 8 mm, to
  y .2255 m, and lean 18 mm forward to z .503 m, leading the blunt jaw front by 8 mm. The piercing
  direction is the normalized base-to-tip axis `[0, .008, .018]`, with a .5 contact-normal cosine.
  The lower middle tip is the jaw's `bite` point. Teeth add no mass, inertia or strength. These are
  game estimates, not enamel stiffness or bite forces.

## Controller settings

Controller choices, held apart from the anatomy in `REPTILE_MOTOR`, `REPTILE_TRAVEL`,
`REPTILE_TROT`, `REPTILE_CRAWL`, `REPTILE_RECOVERY` and `REPTILE_BITE`
(`src/core/reptile/tuning.ts`). The contact gates and fixed-anatomy checks
([Qualification](#qualification)) qualify the combination; they are not a measured optimum or
evidence of a real animal's locomotion. Times are seconds, lengths metres, angles radians, heights
relative to the reference centre of mass.

The reptile is down (`DownSpec` `low`, the asset's `down`) once its trunk's up tips under 0.5 (60
degrees from upright) or its centre of mass sinks under 0.6 of its standing height over its lowest
point.

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
| Jaw path | prepare .25 s, snap .12 s, open .65 rad, jawError .03 rad, jawClosed .001 rad | Measured opening and closing, with finite angular motion |
| Bite reach | biteEntry .008 m beyond the tip-to-mouth span, bitePrepareNear .12 m, biteElevation .15 m, biteNear .04 m | Sensed surface selection and physical chamber readiness |
| Bite placement | contactAt .5 of the opening angle, biteAlign .04 m, biteShift .04 m, biteInset .02 m | Project the retained surface onto the selected tooth arc; bound COM displacement within loaded paw support |
| Bite selection | biteSamples 4, biteLead .03 s | First exposed entry over the tooth arc, including natural colliders; predict the retained material point from sensed linear and angular motion |
| Material contact | contactSeconds .25 s | Bound an admitted stroke by time and the physical 8 mm tooth depth |
| Withdrawal | neckRetract .3 rad | Ceiling on upward neck retraction during a loaded return |
| Jaw response | biteResponse .03 s during Swing and Return | Track the finite jaw path through the unchanged torque and speed ceilings |
| Closing path | closeRate 4 rad/s | Retain closing velocity at the requested path endpoint; actual motion remains muscle limited |
| Bite cycle | release .2 s, biteSlow .2 m/s, biteHold .03 s, biteTimeout 2 s, biteReturnLimit 8 s | Verified quiet release; the bound allows actual backward paw placements before reporting failure |
| Bite approach | approach .3 m, braking .5 m/s2, creepNear .3 m | Reduce travel intent with remaining mouth clearance and stopping distance; retain close crawling until the foe clears this distance |
| Grounded righting | rightingGain 8 N m/rad, rightingDamping 4 N m s/rad, rightingEpsilon .000001 | Upright-error moment projected onto loaded hips, bounded by their muscles |
| Clear leg route | foldHip 1.2, foldKnee 2.6, plantedKnee 1.4, sweepYaw 1.2, wrappedHip .5, unwindHip 2 rad | Move a wrapped paw around a trunk end before unfolding; interpolation spans the declared unwind interval |
| Leg tracking | recoveryServo .06, placementServo .008 s, placementError .15 rad, foldWait .5 s | Separate holding and moving legs; require actual joint arrival and paw clearance |
| Paw acquisition | pressWait .3 s, pressLever .15 m, pressDepth .002 m | A bounded joint servo lowers a paw; the lever is a controller approximation, not anatomy |
| Recovery retry | routeLimit 10 s, recoveryLimit 30 s | Try the other trunk end, or restart from actual posture; neither reports success |
| Supported handover | recoveryPath .5 s, recoveryHeight .8, recoveredSpeed .1 m/s, recovered .5 s, rollUpright .95 | Free-paw reacquisition and quiet four-sole support before resume |
| Supported rise response | centre .12, endpoint .08, turn .12, posture .15 s | The same physical support solve as ordinary control |

What the settings serve:

- **The trot** alternates diagonal pairs from the reference footprint, advancing the centre of mass
  continuously at the commanded velocity; free paws land with near-zero world velocity. **The
  crawl** shifts the centre into the other three contact patches before each swing, and shortens
  its stride with travel intent so approach braking slows it. Placements are relative to the actual
  centre of mass, so the stance does not widen.
- **A landing** needs a paw that clears the floor and then carries a positive ground impulse; one
  that does not returns toward its anchor and retries. Gaits switch after the active placement.
  Close fighting and crowded withdrawal crawl; a resumed host crawls into place, aligns its heading
  and verifies quiet four-sole support before trotting.
- **The bite** takes the first exposed surface on a tooth's closing arc, keeps the material point in
  the foe segment's frame while it prepares, freezes the chambered point, mouth aim and neck pose at
  the snap, and launches only on four loaded paws (a stroke keeps at least three). A stroke ends on
  its snap and follow-through clocks if it misses, on its .25 s / 8 mm budget once in contact, and
  on cancellation, lost support, a fall, misalignment or a loaded contact with anything unintended.
  Contact identities come from the arena's or crypt's trusted adapter.
- **The return** opens the jaw for .25 s keeping the neck pitch, retracts a loaded head through the
  neck muscles, and crawls backward if contact persists past the .2 s release. Success needs an
  open jaw, a neutral neck, quiet jaw motion and no loaded head or jaw contact; a timeout is a
  failure and frees the bite for another target.
- **Righting** reads every fixed-ground contact but pushes only through loaded leg chains, routing a
  wrapped leg round the trunk end its own hip and knee allow. It completes on four-paw sole contact,
  enough height, an upright body and a quiet centre of mass for half a second, and does not need
  that support to start.

## Encounters

The Crypt's `HUMANOID` (`cryptModel`, `src/dungeon/actors.ts`) keeps the .35 m placement footprint
of [following](play.md#following) and `ATTACK_METRES` from
[attack distance](human-and-strikes.md#attack-distance); a humanoid that falls stays in the fight
and gets up, as the reptile does. The reptile has empty hands and a quadruped mind by default
(`modelInfo`, `defaultMind`), .52 m attack spacing in the Crypt, and a placement radius derived from its whole
collider envelope, tail included. Party placement uses that footprint and the radii of companions
already placed.

Generated crypt and generated-depth layouts alternate skeleton rooms and three-reptile packs.
`ENCOUNTERS` sets three bodies a pack, at least 2 m apart, and one metre beyond their radius clear
of doors, so bodies stay clear of neighbours and doorways. Pack points lie outside the party's 15 m
starting separation, walkable with closed doors and reachable from the start at the body's radius;
a generated candidate without the space is rejected before the run is built. Point-only and
authored maps keep their skeleton encounters. A reptile's fall does not empty its pool or
eliminate it while it recovers; an upright party body must reach the exit to win.

## Qualification

Node stand, the core world, `rapier-coordinate`, 120 Hz, anatomy fixed: no torque or unloaded speed
is raised to pass. The witnesses are `tests/core-reptile.test.mjs`,
`tests/reptile-recovery.test.mjs`, `tests/reptile-fork.test.mjs`, `tests/reptile-combat.test.mjs`
and `tests/reptile-integration.test.mjs`, all @2a1b29ac.

| Gate | Result |
| --- | --- |
| Construction with gravity and ground disabled | Eight steps, segment speed below 10 micrometres/s |
| Standing | Thirty seconds upright, COM above .17 m, horizontal drift below .05 m |
| Forward and backward trot | At least 2 m forward and 1.8 m backward in each 10 s interval, including acceleration |
| Stop, turn, rightward trot | Quiet stop within .02 m; quarter turn within .1 rad in 20 s; at least 2 m rightward in 10 s |
| Paw accounting | At most two requested swings in the trot, one in the crawl; each counted paw clears the floor and reloads through positive fixed-ground contact |
| Closing-jaw contact | A fixed opposing Reptile jaw receives a tooth contact during the fast closing stroke; cancellation gives one verified release and no failed return |
| Autonomous bite | Senses-only approach and closing-jaw contact, followed by verified release after cancellation |
| Autonomous combat target | Injury verdict within 30 s in Reptile mirrors; at least two damaging engagements and .5 HP removed in 30 s against each active humanoid ([pointed contact](reptile-bites.md)) |
| Recovery | Back, left, right and lowered-belly poses in two headings, eight handovers within 100 s; each then walks two trunk lengths in 60 s without another fall |
| No floor | No invented support or completed rise in a gravity-free unsupported inverted body |
| Lifecycle and replay | Hold/resume retains physical bodies; crawling, jaw cancellation and righting fork exactly, with physics-only and state-only negative controls |
| Generated packs | Both layout generators, 24 seeds each; complete-map repeatability, physical clearance, reachability and pack separation |

The bite meter credits actual load wounds during a launched bite and its loaded withdrawal; a
completed cycle needs the verified release. The eight recovery poses are development witnesses,
not a claim about arbitrary falls, obstacles or opponents; some take repeated retries and about
80 s.

**Travel after recovery.** Started on its left side with a quarter-turn heading and ordered forward
for 60 s after handover (at 20.283 s), no blow, the reptile must align its actual heading before it
accelerates: the commanded heading can arrive before the body turns.

| Admission before accelerating | Steps down after handover | Forward distance in 60 s, m |
| --- | ---: | ---: |
| Commanded heading within .2 rad | 364 | 12.618 |
| Crawl aligns the actual heading within .05 rad before trotting | 0 | 13.715 |

**Travel speed** (`node research/reptile-motion.mjs@60c3ecc3 --sweep`; two seconds standing, then ten seconds
of forward travel on a 100 m ground, driven and unstruck; overrides passed into `quadrupedMind`):

| Commanded speed, m/s | COM height multiplier | Distance in 10 s, m | Mean speed, m/s | Steps down | Counted paws |
| --- | --- | ---: | ---: | ---: | ---: |
| .25 | 1 | 2.809 | .281 | 0 | 76 |
| .30 | 1 | 3.243 | .324 | 0 | 76 |
| .35 | 1 | 3.646 | .365 | 0 | 76 |
| .40 | 1 | .339 | .034 | 296 | 6 |
| .30 | .85 | .351 | .035 | 308 | 10 |

The .30 m/s command is the qualified default; the sweep does not establish a maximum. The crawl it
replaced (`42cd1e5a`) covered .156 m in the same ten seconds, about 20.8 times slower. Without a
`--sweep`, the script plays four autonomous arena mirrors and tells jaw blows in a committed stroke
from incidental collisions; the 30 s combat target is `research/reptile-combat.mjs`'s.

**Humanoids unchanged.** `node research/body-plan-regression.mjs CHECKOUT OUTPUT.json` (120 warmup
and 1,200 measured standing steps; 2,400-step Warrior/Rogue bouts; every segment pose in the
digest) gives the same digests at the reptile's qualification `cf2c220c` as at `3f60d702` for the
Warrior, Rogue and skeleton standing (`2a08cb82a39d0889`, `ef9201a9062b6c05`, `ed808209f8b4327c`)
and the Warrior/Rogue bouts with clubs (`1805f1c3d51d2a5b`, left wins by a fatal wound at 9.125 s)
and empty-handed (`78f8e4519b5c8977`, no verdict in 20 s).
