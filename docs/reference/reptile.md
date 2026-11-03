# Reptile anatomy and control

The quadrupeds' anatomy (`assets/reptile/body.json`, `reptile-anatomy` in `SOURCES`;
`assets/rat/body.json`, `rat-anatomy`; both read by `reptileSpec`, `src/core/reptile/spec.ts`),
their controller's settings (`src/core/reptile/tuning.ts`) and their place in the Crypt's
encounters. A tooth wounds by its press (`pointLoadDamage`, `src/core/rules/rulebook.ts`).

## Anatomical model

The reptile is a low, sprawling quadruped, 8 kg with 1 HP and zero balance: a game creature, not a
reconstruction of a species. Its geometry is fitted to a grass lizard scan
([the grass lizard](#the-grass-lizard)); its relative segment masses, joint limits, torque
ceilings, unloaded speeds and teeth are the authored quadruped's
(`assets/quadruped/authored-body.json`), the estimates below, from which the rat's body is fitted
too. Four legs carry a rigid trunk; a two-axis neck carries the head, a hinge opens the lower jaw,
and two weakly driven tail segments hang behind.

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
- **Leg speed**: every leg joint (girdle, bend, ankle) runs to 20 rad/s unloaded, set for travel
  at 1 m/s or more ([fast legs](#fast-legs)); the torque ceilings are the estimates'.
- **Surfaces**: ordinary surfaces have an estimated 17,000 N/m, not a borrowed human table.
- **Teeth**: three lower-jaw tooth pyramids are colliders of their own, each with an authored
  10,000,000 N/m surface. In the authored quadruped their bases sit at y .2175 m and z .481-.489 m;
  their tips rise 8 mm, to y .2255 m, and lean 18 mm forward to z .503 m. The piercing direction is
  the normalized base-to-tip axis, with a .5 contact-normal cosine. The lower middle tip is the
  jaw's `bite` point. Teeth add no mass, inertia or strength. These are game estimates, not enamel
  stiffness or bite forces. A fitted body carries them scaled and tipped about its neck onto its
  own jaw's tip.

## The grass lizard

The reptile (`assets/reptile/body.json`) is fitted to the posed grass lizard
(`scripts/reptile/fit.mjs`, [its art](../art/reptile.md#the-body-fitted-to-the-art)): its trunk,
head, jaw, legs and tail where the posed art's are. Its scale keeps the authored front leg's reach,
girdle to wrist, .2715 m, and its paws the authored footprint, .26 m from the middle; the scan's
long body and short legs make it about 1.95 m from snout to tail tip. The neck's torque ceiling
scales with the head and jaw's weighted lever about it, as the rat's does.

| What | Authored quadruped | Grass lizard |
| --- | --- | --- |
| Trunk | capsule radius .08 m, z ±.14, axis at y .24 | radius .078 m, z -.29 to .43, axis at y .19 to .22 |
| Head | to z .4 m, radius .065 | to z .69 m, radius .035 |
| Hip and shoulder centres | x ±.085, z ±.16, y .24 m | fore x ±.081, z .29, y .22; hind x ±.078, z -.29, y .19 m |
| Elbow and knee axes | the body's z | each leg's own plane's normal, the right's mirroring the left's |
| Tail | to z -.68 m; weights .45 and .25 (.76 kg), peaks .4 and .2 N m | to z -1.22 m; weights .15 and .08 (.27 kg), peaks 1.5 and .6 N m |
| Neck's torque ceiling | 1.5 N m | 2.03 N m |

- **The tail is .28 of the scan's** (`TAIL`, `scripts/reptile/pose.mjs`), so that a generated
  Crypt room holds a three-reptile pack ([encounters](#encounters)).
- **The tail is light and its joints carry it**, so the trot does not drag it to a stop.

## The rat

The rat (`assets/rat/body.json`, `rat-anatomy` in `SOURCES`) is fitted to Poly Haven's Street Rat
(`scripts/rat/fit.mjs`, [its art](../art/rat.md#the-body-fitted-to-the-art)): its trunk, head,
jaw, legs and tail where the art's are. Its teeth, paw footprint (.075 by .1 m) and joint ranges
are the authored quadruped's, but for its hips', knees' and elbows' ranges (the table below); its
controller settings are the reptile's, but for its righting ([righting](#righting)). Its own, for
a trot at 1 m/s ([the trot at speed](#the-trot-at-speed)):

- **Legs raised .08 m** (`LEG_RAISE`, `scripts/rat/landmarks.mjs`): each leg stretched along its
  upper and lower bones from its shoulder or hip, its paw on the floor, the trunk, head and tail
  raised with it; the hips stand about .2 m up in place of the art's .12.
- **The head carried .5 rad above the art's** (`HEAD_RAISE`, `scripts/rat/landmarks.mjs`), so the
  jaw opened to the bite's gape clears the floor.
- **Legs' muscles twice the authored quadruped's, at 40 rad/s** (`LEG_STRENGTH`, `LEG_SPEED`,
  `scripts/rat/fit.mjs`): a trot at 1 m/s swings each paw at about twice that, its stance on two
  legs.
- **Its weight carried forward** (`WEIGHTS`): the head 1.0 of the weights (the authored .7), the
  jaw .2 (.15), the tail .2 and .1 (.45 and .25), or the trot at 1 m/s tips back onto its hind
  pair.
- **The neck's torque ceiling keeps the authored margin** over the head and jaw's weight: it
  scales by their weighted lever about the neck at the reference pose, the rat's head reaching
  further ahead and weighing more, so 3.56 N m in place of 1.5.

| What | Authored quadruped | Rat |
| --- | --- | --- |
| Trunk | capsule radius .08 m, axis at y .24 | radius .115 m, axis at y .27, belly at .157 |
| Hip and shoulder centres | x ±.085, y .24 m | fore x ±.067, y .205; hind x ±.077, y .195 m |
| Paw soles, across the body | ±.26 m | fore ±.076, hind ±.086 m |
| Elbow (fore) and knee (hind) | out to the side, bending about the body's z axis, -.2 to 2.8 rad | behind (fore) and ahead (hind) of the paw, bending about the body's x axis, ±1.2 rad |
| Bend at the reference pose, upper to lower leg | | 1.77 rad fore, 1.55 rad hind |
| Girdle's second axis (y) | ±1.2 rad | ±1.6 rad |
| Girdle's third axis (z) | ±2.8 rad | ±1.6 rad, the range its righting needs to lever it off its side |

### Fast legs

The leg joints' unloaded speed is what lets a quadruped's legs carry its trunk at speed: 20 rad/s
on the authored quadruped and the grass lizard ([leg speed](#anatomical-model)), 40 rad/s on the
rat at twice the torque ceilings ([the rat](#the-rat)). The trot asks at most `speed` (1.15 m/s,
`REPTILE_TROT`) and turns its heading at `turnRate` ([the trot at speed](#the-trot-at-speed)).

### The trot at speed

The trot (`trot`, `src/core/reptile/trot.ts`) alternates diagonal pairs and carries the rat at
about 1 m/s, upright at every heading and through half turns. What holds it:

- **A swinging paw tracks its path at .025 s** (`swingResponse`), driven firm
  (`EffectorGoal.firm`), its path kept on the ground (`src/core/reptile/layers.ts`).
- **A paw lands led by the step it took**: the travel through the last pair's swing and landing
  (`stride`), and half the time it then bears, no further than its room.
- **Its room is its floor reach** (`stanceOf`): each pair's midpoint under the centre of mass, each
  paw within .9 of how far its sole reaches along the body on the floor and at the swing's lift
  (`reach`). The trunk goes no faster than the room swept in a cycle, nor than its bearing paws'
  remaining reach over the time until the free pair lands.
- **A paw within 3 mm of the floor is down** (`touch`), and a landed paw presses down within .03 s
  (`plant`), so a paw hovering a millimetre up still bears.
- **It turns as it travels**: the heading asked turns at .6 rad/s (`turnRate`), never more than .2
  rad (`turnLead`) ahead of the trunk's, and the trunk travels as fast as it faces its way (the
  cosine of the difference).

### The lunge

The bite (`bite`, `src/core/reptile/bite.ts`) aims the selected tooth's mid-stroke point
(`contactAt` of the opening) at the target, launches on an open jaw with the mouth within
`biteAlign` of its aim, and lunges: through the stroke the head tracker and the lean still drive
the mouth onto the aim while the jaw closes. The lean is bounded by `biteShift` from where the
centre of mass stood when the chamber began, within the loaded paws' support (`biteInset`). An
aligned tooth under load wounds whether or not the jaw is closing (`pointLoadDamage`).

### Righting

The rat rights itself by recipe (`rightingByRecipe`, `src/core/reptile/righting.ts`): three
poses of its hips, knees and elbows, neck and tail base for the body on its right side, and three
for it on its back (`assets/rat/righting.json`, its model's entry in `RIGHTING`; a mind's
`tuning.righting` overrides it), found offline (`scripts/quadruped/righting.mjs`). It takes the
body when the rat is down, or when its trunk's up stays under .85 for .5 s; holds the reference
pose 1 s; reads how it lies (on its back where the trunk's up is under -.5, else on a side, the
poses mirrored on its left); servos through the poses, each until held for its time or the trunk
is up to its mark; and hands back once the last pose has held the trunk's up at .95 or more and
the centre of mass under .1 m/s for .25 s. After 6 s of poses it settles and tries again. The
reptile has no recipe and rights itself by routes (`recover`, `src/core/reptile/recover.ts`;
[controller settings](#controller-settings)).

The search (CMA-ES over each pose's 20 angles, its hold and its mark) plays each candidate
through the game's mind and scores its worst start and its mean: the side's poses from the body
lying on either side and tilted, at several headings, and from fights forked where righting took
the body (`scripts/quadruped/righting-forks.mjs`); the back's from its back.

## Controller settings

Controller choices, held apart from the anatomy in `REPTILE_MOTOR`, `REPTILE_TRAVEL`,
`REPTILE_TROT`, `REPTILE_CRAWL`, `REPTILE_RECOVERY` and `REPTILE_BITE`
(`src/core/reptile/tuning.ts`), and the rat's righting recipe (`assets/rat/righting.json`). They
are not a measured optimum or evidence of a real animal's locomotion. Times are seconds, lengths
metres, angles radians, heights relative to the reference centre of mass.

A quadruped is down (`DownSpec` `low`, the body file's `down`) once its trunk's up tips under 0.5
(60 degrees from upright) or its centre of mass sinks under 0.6 of its standing height over its
lowest point.

| Construct | Values | Purpose |
| --- | --- | --- |
| Floating-base response | centre .12, endpoint .08, turn .12, posture .15 s | Damped support and pose tracking |
| Travel response | centre .06, endpoint .04, turn .06, posture .06 s | Faster support and free-paw tracking during the trot |
| Support solve | lever .3 m, damping .005, rootMotion .05 s | Wrench weighting, regularization and observed root-acceleration filtering |
| Trot geometry | crawlHeight 1, lift .025 m, reach .9 | Standing COM height; each paw within .9 of its floor reach ([the trot at speed](#the-trot-at-speed)) |
| Trot travel | speed 1.15 m/s, acceleration .5 m/s2, sideways .15 | Bounded velocity changes and slower lateral travel; never faster than the paws' reach allows |
| Trot timing | swing .175, settle .025, plant .03 s; plantSpeed .2 m/s; touch .003 m | Alternating diagonal pairs; a paw within touch of the floor is down |
| Trot swing | swingResponse .025 s | A swinging paw's path kept on the ground and tracked firm |
| Trot heading | turnRate .6 rad/s, turnLead .2 rad, turnMoveAngle .2 rad, turnError .05 rad | Turn while travelling, the heading asked never further than turnLead ahead of the trunk's; the approach counts the trunk aligned with its way within turnMoveAngle |
| Trot acquisition | liftConfirm .001 m, landingWait .1 s, placementLimit 3 s | Count a step only for a paw that lifted; end a swing once its pair bears, lifted or not; brake on delayed landing and return an unlanded pair to its anchors |
| Resumed travel | resumeSpeed .1 m/s, resumeHold .3 s | Place each paw again through the crawl, then require quiet four-sole support before trotting |
| Crawl geometry | crawlHeight .85, stride .035 m, lift .025 m | Lowered three-paw support and one-paw swing |
| Crawl timing | swing 1.2, shift .45, settle .3, plant .2 s; plantSpeed .05 m/s | Slow placement and continued downward acquisition |
| Placement bounds | placementLimit 3 s, liftConfirm .001 m | Return an unlanded paw; count a step only for a paw that lifted |
| Support margins | inset .4 m, supportInset .1 m, shiftError .008 m | Desired support-centre inset and actual containment tolerance |
| Heading | yawStep .18 rad per four paws, turnError .05 rad | Bounded heading advance |
| Contact | supportNormal .5, contactMargin .01 m | Positive fixed-ground impulses, and sole versus edge contact |
| Jaw path | prepare .25 s, snap .12 s, open .65 rad, jawError .03 rad, jawClosed .001 rad | Opening and closing, with finite angular motion |
| Bite reach | biteEntry .008 m, bitePrepareNear .12 m, biteElevation .15 m, biteNear .04 m | A target is taken within the tooth-to-mouth span plus biteEntry, and the open jaw keeps biteEntry clear of the floor; the chamber starts within bitePrepareNear; a target lies within biteElevation of the mouth's height; biteNear is the chamber's readiness |
| Bite placement | contactAt .5 of the opening angle, biteAlign .04 m, biteShift .04 m, biteInset .02 m | Aim the selected tooth's point at contactAt of the opening on the retained surface; launch with the mouth within biteAlign of that aim; bound COM displacement from where the chamber began, within loaded paw support |
| Bite selection | biteSamples 4, biteLead .03 s | First exposed entry over the tooth arc, including natural colliders; predict the retained material point from sensed linear and angular motion |
| Material contact | contactSeconds .25 s | Bound an admitted stroke's contact by time |
| Withdrawal | neckRetract .3 rad | Ceiling on upward neck retraction during a loaded return |
| Jaw response | biteResponse .03 s during Swing and Return | Track the finite jaw path through the unchanged torque and speed ceilings |
| Closing path | closeRate 4 rad/s | Retain closing velocity at the requested path endpoint; actual motion remains muscle limited |
| Bite cycle | release .2 s, biteSlow .2 m/s, biteHold .03 s, biteTimeout 2 s, biteReturnLimit 8 s | Verified quiet release; the bound allows actual backward paw placements before reporting failure |
| Bite approach | approach .3 m, braking .5 m/s2, creepNear .3 m | Reduce travel intent with remaining mouth clearance and stopping distance; crawl until the foe is within creepNear |
| Righting by recipe (the rat's, `assets/rat/righting.json`) | settle 1 s, servo .15 s, upright .95, calm .1 m/s, still .25 s, limit 6 s, tilt .85, wait .5 s | Hold the reference pose, play the poses for how it lies, hand back on a trunk upright and still; take the body from a lasting tilt |
| Grounded righting | rightingGain 8 N m/rad, rightingDamping 4 N m s/rad, rightingEpsilon .000001 | Upright-error moment projected onto loaded hips, bounded by their muscles |
| Clear leg route | foldHip 1.2, foldKnee 2.6, plantedKnee 1.4, sweepYaw 1.2, wrappedHip .5, unwindHip 2 rad | Move a wrapped paw around a trunk end before unfolding; interpolation spans the declared unwind interval |
| Leg tracking | recoveryServo .06, placementServo .008 s, placementError .15 rad, foldWait .5 s | Separate holding and moving legs; require actual joint arrival and paw clearance |
| Paw acquisition | pressWait .3 s, pressLever .15 m, pressDepth .002 m | A bounded joint servo lowers a paw; the lever is a controller approximation, not anatomy |
| Recovery retry | routeLimit 10 s, recoveryLimit 30 s | Try the other trunk end, or restart from actual posture; neither reports success |
| Supported handover | recoveryPath .5 s, recoveryHeight .8, recoveredSpeed .1 m/s, recovered .5 s, rollUpright .95 | Free-paw reacquisition and quiet four-sole support before resume |

What the settings serve:

- **The trot** alternates diagonal pairs from its stance under the centre of mass, advancing the
  centre continuously at the commanded velocity within the paws' reach; free paws land led by the
  step they took. **The crawl** shifts the centre into the other three contact patches before each
  swing, and shortens its stride with travel intent so approach braking slows it. Placements are
  relative to the actual centre of mass, so the stance does not widen.
- **A crawl's paw and a trot's pair** have landed once they bear after the swing, a paw that
  never cleared the floor (dragged, or already at its target) where it stands; only a paw that
  cleared the floor counts a step, and one not down within placementLimit returns to its anchors.
  **A settled stance** holds the centre of mass where the reference pose carries it over the
  paws' mean (`overPaws`), wherever the legs meet the trunk.
- **The gait** (`src/core/reptile/layers.ts`) is the crawl while the body reacquires its paws,
  withdraws from a bite or creeps in close, and the trot otherwise. A resumed body crawls each paw
  into place and holds quiet four-sole support for resumeHold before trotting; the trot turns the
  body to its heading before it accelerates (`turnMoveAngle`).
- **The bite** takes the first exposed surface on a tooth's closing arc, keeps the material point in
  the foe segment's frame while it prepares, and launches on an open jaw, a mouth near its aim and
  at most one paw unloaded. It freezes the chambered point and mouth aim at the snap and lunges
  ([the lunge](#the-lunge)). A stroke ends on its snap and follow-through clocks if it misses, on
  contactSeconds once in contact, and on cancellation, lost support, a fall, misalignment or a
  loaded contact with anything unintended.
- **The return** opens the jaw keeping the neck pitch, retracts a loaded head through the neck
  muscles, and crawls backward if contact persists past the release. Success needs an open jaw, a
  neutral neck, quiet jaw motion and no loaded head or jaw contact; a timeout is a failure and
  frees the bite for another target.
- **Righting by routes** (`recover`, a body with no recipe) reads every fixed-ground contact but
  pushes only through loaded leg chains, routing a wrapped leg round the trunk end its own hip and
  knee allow. It completes on four-paw sole contact, enough height, an upright body and a quiet
  centre of mass for half a second, and does not need that support to start.

## Encounters

Every model's place in the Crypt is a `CryptModel` (`cryptModel`, `src/dungeon/actors.ts`): its
footprint's radius, how near its target it stands to fight (`attackMetres`) and whether a fall
ends its fight. A humanoid (`HUMANOID`) has a .35 m radius and stands 1.8 m off. A quadruped's
radius is the furthest its colliders reach from its centre in the floor's plane, tail included,
and it stands .52 m off; a character's own body scales both. No body's fall ends its fight: it
stays in and gets up. The reptile and the rat have empty hands and Option Reptile by default
(`modelInfo`, `src/core/models.ts`; `defaultMind`, `src/entrants/game.ts`).

Generated layouts alternate skeleton rooms and three-reptile packs (`ENCOUNTER_MODELS`,
`populateEncounters`, `src/dungeon/encounters.ts`). `ENCOUNTERS` sets three bodies a pack, at
least 2 m and two radii apart, and one metre beyond their radius clear of doors. Pack points lie
more than 15 m from the party's start (`outsidePartyStart`), walkable with closed doors and
reachable from the start at the body's radius; a generated candidate without the space is
rejected before the run is built. Spawn points outside the rooms keep their skeleton encounters.
An upright party body must reach the exit to win.
