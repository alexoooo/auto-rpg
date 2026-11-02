# Reptile anatomy and control

The reptile's anatomy (`assets/reptile/body.json`, `reptile-anatomy` in `SOURCES`,
`src/core/reptile/spec.ts`), its controller's settings (`src/core/reptile/tuning.ts`), its place in
the crypt's encounters, and the checks that qualify the combination. How its bite wounds is
[pointed contact](reptile-bites.md).

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
- **Leg speed**: every leg joint (girdle, bend, ankle) runs to 20 rad/s unloaded, the owner's
  decision for travel at 1.0 m/s or more; the torque ceilings are the estimates'. At 6 rad/s the
  rat's legs, under its trunk, could not carry it: it trotted .04 m/s.
- **Surfaces**: ordinary surfaces have an estimated 17,000 N/m, not a borrowed human table.
- **Teeth**: three lower-jaw tooth pyramids are colliders of their own, each with an authored
  10,000,000 N/m surface. In the authored quadruped their bases sit at y .2175 m and z .481-.489 m; their tips rise 8 mm, to
  y .2255 m, and lean 18 mm forward to z .503 m, leading the blunt jaw front by 8 mm. The piercing
  direction is the normalized base-to-tip axis `[0, .008, .018]`, with a .5 contact-normal cosine.
  The lower middle tip is the jaw's `bite` point. Teeth add no mass, inertia or strength. These are
  game estimates, not enamel stiffness or bite forces. A fitted body carries them scaled and tipped
  about its neck onto its own jaw's tip.

## The grass lizard

The reptile (`assets/reptile/body.json`) is fitted to the posed grass lizard
(`scripts/reptile/fit.mjs`, [its art](../art/reptile.md#the-body-fitted-to-the-art)): its trunk,
head, jaw, legs and tail where the posed art's are. Its scale keeps the authored front leg's reach,
girdle to wrist, .2715 m, and its paws the authored footprint, .26 m from the middle; the scan's
long body and short legs make it about 1.95 m from snout to tail tip. The neck's torque ceiling scales
with the head and jaw's weighted lever about it, as the rat's does.

| What | Authored quadruped | Grass lizard |
| --- | --- | --- |
| Trunk | capsule radius .08 m, z ±.14, axis at y .24 | radius .078 m, z -.29 to .43, axis at y .19 to .22 |
| Head | to z .4 m, radius .065 | to z .69 m, radius .035 |
| Hip and shoulder centres | x ±.085, z ±.16, y .24 m | fore x ±.081, z .29, y .22; hind x ±.078, z -.29, y .19 m |
| Elbow and knee axes | the body's z | each leg's own plane's normal, the right's mirroring the left's |
| Tail | to z -.68 m; weights .45 and .25 (.76 kg), peaks .4 and .2 N m | to z -1.22 m; weights .15 and .08 (.27 kg), peaks 1.5 and .6 N m |
| Neck's torque ceiling | 1.5 N m | 2.03 N m |
| The Crypt's footprint (`cryptModel`) | .70 m | 1.23 m |

- **The tail is .28 of the scan's** (`TAIL`, `scripts/reptile/pose.mjs`), the owner's decision:
  at the scan's half (to z -1.88 m, a footprint of 1.89 m) no generated Crypt level holds its
  three-reptile packs (0 of seeds 0 to 39), and at a footprint of 1.5 m none does; at 1.35 m and
  under all 40 do.
- **The tail is light and its joints carry it.** At the authored weight and strength, the trot
  drags it to a stop on the Node stand.

Before and after the fit. Walking (Node stand, Rapier, 120 Hz, the game's delay; standing 2 s,
then ordered along a heading for 8 s, the speed read over the last 6 s):

| Body | Upright, 8 headings | Straight ahead, m/s | Mean of 8 headings, m/s |
| --- | --- | --- | --- |
| authored | 8 | .487 | .192 |
| grass lizard | 4 (tipped at 5.9 s, upright again by 10 s) | .003 | -.005 |

Bouts against the Warrior with a sword (Node Arena Duel, Rapier, 120 Hz, the game's delay; the
Warrior fighting at the default gap and 1.5, 2.5 and 3.5 m, 40 s; standing still, stand orders,
firm, at .8, 1, 1.25, 1.5, 2 and 2.5 m, 25 s; over `04746b5e`):

| Body | Warrior | Bites launched | HP by the teeth | Bouts fatal to the reptile | Bouts fatal to the Warrior | First down |
| --- | --- | --- | --- | --- | --- | --- |
| authored | fighting | 3 | .59 | 2 of 4 | 0 | 6.6 to 20.2 s, once never |
| grass lizard | fighting | 0 | 0 | 4 of 4 | 0 | .6 s |
| authored | standing still | 21 | 17.81 | 0 | 3 of 6 | never |
| grass lizard | standing still | 0 | 0 | 0 | 0 | .6 s |

Setting off toward the Warrior from a stand, the grass lizard sinks onto its belly within .6 s,
its centre of mass under .6 of its standing height (traced at 3.5 m: still on its belly at 3 s); on
the Node stand, ordered nowhere, it holds its standing height. The same holds with the tail at the
scan's half (the same trace).

## The rat

The rat (`assets/rat/body.json`, `rat-anatomy` in `SOURCES`) is fitted to Poly Haven's Street Rat
(`scripts/rat/fit.mjs`, [its art](../art/rat.md#the-body-fitted-to-the-art)): its trunk, head,
jaw, legs and tail where the art's are. Its mass weights, torque ceilings, unloaded speeds, joint
ranges, teeth and paw footprint are the reptile's, and its controller settings are the reptile's,
but for its hips' range and its righting (below).
The neck's torque ceiling keeps the reptile's margin over the head and jaw's weight: it scales by
their weighted lever about the neck at the reference pose, the rat's head reaching 1.69 times as
far ahead, so 2.53 N m in place of 1.5. At the reptile's 1.5 the rat's neck sags .15 to .27 rad
below level and returns from a bite at about .02 rad/s, so a return waits out its 8 s limit.

| What | Reptile | Rat |
| --- | --- | --- |
| Trunk | capsule radius .08 m, axis at y .24 | radius .115 m, axis at y .19, belly at .077 |
| Hip and shoulder centres | x ±.085, y .24 m | fore x ±.067, y .125; hind x ±.077, y .115 m |
| Paw soles, across the body | ±.26 m | fore ±.072, hind ±.082 m |
| Elbow (fore) and knee (hind) | out to the side, bending about the body's z axis, -.2 to 2.8 rad | behind (fore) and ahead (hind) of the paw, bending about the body's x axis, ±1.2 rad |
| Bend at the reference pose, upper to lower leg | | 1.77 rad fore, 1.55 rad hind |
| Girdle's second axis (y) | ±1.2 rad | ±1.6 rad |
| Girdle's third axis (z) | ±2.8 rad | ±1.6 rad: at ±.8 its righting stalls on its thighs at an up of .8 |

On the Node stand (Rapier, 120 Hz, one run a case, 2 s standing then 18 s ordered one way, the
trot at .15 m/s):

- **Paws the art's size (about .04 by .08 m) tip it in a turn**, at 4.7 s in each heading that
  turns right; with the reptile's footprint (.075 by .1 m) it stays upright at all 8 headings.
- **It travels .04 to .13 m/s**, the ordered .15 only nearly when straight ahead, its swinging
  paws often dragging: 30 to 57 of 69 steps had a swinging paw that never lifted.
- A hand-built body with longer legs (hips at y .2, elbows and knees about 1.5 rad) trotted
  upright at all 8 headings with its swinging paws clearing about 25 mm; at .3 m/s it sank to its
  belly at every heading.

Against the Warrior with a sword (Node Arena Duel, Rapier, 120 Hz, no command delay, at
`5fc406b5`, default rules and balance, rat on the left, 40 s cap), with the head carried at the
art's height the rat launched no bite and
was killed in every bout; with the head raised (`HEAD_RAISE`), the stance settled over its paws
and the lean measured from where the chamber began, it bites:

| Gap | Bites launched | HP by the teeth | Warrior's bar | Rat's bar | Rat first down | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| default | 1 (0 before) | .65 (.24) | .892 (.959) | .702 (.565) | 12.0 s | none (fatal to the rat, 23.4 s) |
| 1.5 m | 1 (0) | .29 (.03) | .951 (.995) | .949 (.235) | 13.9 s | none (fatal, 18.4 s) |
| 2.5 m | 0 (0) | .13 (0) | .978 (1) | .696 (.532) | 8.7 s | none (fatal, 19.2 s) |
| 3.5 m | 0 (0) | .07 (.08) | .988 (.987) | .211 (.447) | 9.8 s | fatal to the rat, 39.9 s (13.8 s) |

Most of the teeth's HP is the Warrior's foot pressing on an open jaw. Once kicked over, the rat
does not right itself, which bounds its bites to the first one or two.

At the game's command delay of one step (`COMMAND_DELAY`; the quadruped's motor part carries out
the gait's last command on the body as it is), the bite still launches. Against the Warrior
standing still, holding its sword (stand orders, firm; 25 s cap; gaps .8, 1, 1.25, 1.5, 2 and
2.5 m; at `4658de52`, which also carries the Warrior's newer mind):

| Body | Delay | Bites launched | HP by the teeth | Gaps with a bite |
| --- | --- | --- | --- | --- |
| rat | none | 1 | 1.53 | 1 m |
| rat | one step | 4 | .77 | .8 to 1.5 m |
| reptile | none | 17 | 6.52 | 1 to 2.5 m |
| reptile | one step | 15 | 4.62 | 1 to 2.5 m |

The rat reaches no Warrior 2 m off or more within 25 s: its walk, not its bite, bounds it. In the
four fights above at one step it launched no bite and took .94 HP with its teeth (none: 1 bite,
1.65 HP); the Warrior's mind changed between the two tables, so they are not paired.

### Fast legs

Both bodies' leg joints at 20 rad/s in place of 6 ([leg speed](#anatomical-model)), and the
trot's speed .5 m/s in place of .3. On the Node stand (Rapier, 120 Hz, a delay of one step;
standing 2 s, then ordered along a heading for 8 s, the speed read over the last 6 s):

| Body | Legs, trot | Upright, 8 headings | Straight ahead, m/s | Mean of 8 headings, m/s |
| --- | --- | --- | --- | --- |
| rat | 6 rad/s, .3 m/s | 8 | .038 | .028 |
| rat | 20 rad/s, .5 m/s | 8 | .434 | .198 |
| reptile | 6 rad/s, .3 m/s | 8 | .313 | .125 |
| reptile | 20 rad/s, .5 m/s | 8 | .487 | .192 |

The mean over headings is held down by the turn (`turnRate`, .25 rad/s): a body facing away
spends most of the 8 s turning. A faster `turnRate` (.5 to 3 rad/s) tips the rat at 7 of 8
headings: the commanded heading runs ahead of the trunk while a diagonal pair swings. Bouts at a
delay of one step against the Warrior with a sword, before and after (fighting: the four gaps
above, 40 s; standing still: the six gaps above, 25 s):

| Body | Warrior | Bites launched | HP by the teeth |
| --- | --- | --- | --- |
| rat | fighting | 0, 0 | .94, .70 |
| rat | standing still | 4, 2 | .77, 10.69 |
| reptile | fighting | 3, 1 | 1.74, .86 |
| reptile | standing still | 15, 18 | 4.62, 4.34 |

The rat now reaches a still Warrior from 2.5 m, and most of its teeth's HP is its open jaw pressed
into the Warrior's legs as it closes: one bout at 1.25 m is fatal to the Warrior at 11.9 s.
Fighting, it is kicked over and does not right itself.

### The lunge

The bite aims the selected tooth's mid-stroke point (`contactAt`) at the target, launches on an
open jaw with the mouth within `biteAlign` of its aim, and lunges: through the stroke the head
tracker and the lean still drive the mouth onto the aim while the jaw closes. The close-range
drill (Node Arena Duel, Rapier, 120 Hz, the game's delay; the Warrior with a sword standing at the
origin, stand orders, firm; the quadruped .6, .75 and .9 m off at 8 bearings, facing it; 10 s
each, 24 trials; at `a29637fc`, before, and after with the rat's neck above):

| Body | Bites launched | Trials with a launch | Trials with HP in a bite | HP in bites | Warrior killed |
| --- | --- | --- | --- | --- | --- |
| rat, before | 3 | 2 | 4 | 9.71 | 14 |
| rat, after | 23 | 13 | 11 | 18.14 | 22 |
| reptile, before | 26 | 10 | 10 | 1.64 | 13 |
| reptile, after | 20 | 14 | 10 | 1.68 | 14 |

Most of the Warrior's HP is a tooth pressed into its leg outside a stroke: an aligned tooth under
load wounds whether or not the jaw is closing ([pointed contact](reptile-bites.md)). Fighting (the
four gaps above, 40 s), the rat launches no bite before or after, and the reptile 1, then 3.

What held the launch before:

- **The aim took the target where it lay on the tooth's arc**, at any angle from shut to open, so
  every head pose on that arc was already aimed. A target at the open tooth's tip left the jaw
  pressed on the leg short of open; aimed mid-stroke, the head stands off.
- **The chamber asked the target within 8 mm of the stroke** (`biteEntry`), while the mouth needs
  only come within 4 cm of its aim; the rat's narrow footing leans it short of the 4 cm
  `biteShift` the stalk counts on, leaving the target 2 to 3 cm beyond the stroke.

Where a fight's time goes, after (the four fights; the option running, and in the bite, the
stalk's state):

| Body | Fight time | Down, righting | Bite, no target in reach | Crawling to the foe | Chamber |
| --- | --- | --- | --- | --- | --- |
| rat | 96 s | 52 s | 19 s | 17 s | 4 s |
| reptile | 129 s | 28 s | 63 s | 26 s | 5 s |

"No target" is a foe 13 to 100 cm off: inside `creepNear` (.3 m) the stalk keeps the crawl, one
paw at a time and its stride shortened by the stalk's braking. Trotting there instead (`creepNear` .001) cuts it to 11 s (rat) and 30 s
(reptile), but the bodies spend the time down instead (80 and 46 s), so it is not kept. The rat
launches no bite in a fight while it cannot right itself.

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
reptile has no recipe and keeps its routes (`recover`, below).

The search (CMA-ES over each pose's 20 angles, its hold and its mark) plays each candidate
through the game's mind and scores its worst start and its mean: the side's poses from the body
built on either side and rolled 69 degrees, at several headings; the back's from its back at nine.

Built lying, on 21 starts the search did not play (Node stand, Rapier, 120 Hz, the game's delay,
12 s; on its right at 60, 100, 180, 225 and 315 degrees, its left at 30, 200, 250 and 300, rolled
at 0, 100 and 180, its back at 10, 70, 110, 160, 230, 250, 290, 340 and 350), the rat stands in
all 21: back on its gaits 3.8 to 4.4 s from a side, 2.2 to 2.8 s from its back (one, at 350, on
its second try at 10.4 s), its trunk at .16 to .2 m.

Fighting, bare against the Warrior with a sword (Node Arena Duel, Rapier, 120 Hz, the game's
delay; gaps 1.1, 1.4, 1.6, 2.2, 2.8, 3.2, 3.8 and 4.5 m, none the search played; 40 s cap):

| Righting | Down or righting | Fight time | HP by the teeth | Bouts fatal to the rat |
| --- | --- | --- | --- | --- |
| Routes (`recover`) | 173 s | 261 s | 1.36 | 3 |
| Recipe | 74 s | 263 s | 1.50 | 3 |

Under the routes, the rat once kicked over stays in its righting to the end of the bout; with the
recipe and the hand-back ([travel after a hand-back](#qualification)) it spends up to 15 s of a bout down or
righting, and trots on. It launches no bite in these fights either way. What still holds it:
knocked over in a fight, it can be left crouched, its trunk tilted 30 to 45 degrees and its head on
its own front legs (at times a front paw in its open mouth), which the side's poses do not lift
until a retry.

Tried with the recipe and not kept:

| Change | Result |
| --- | --- |
| Handing back as soon as the last pose holds the trunk upright and still | Hands back mid-rise, the speed dipping under .1 m/s while the trunk still lifts: from its back, 3 of 5 tip over again |
| Handing back only once nothing but the paws touches the ground | Never hands back: its tail drags, and the last pose rests on its thighs, which the gaits then lift |
| A retry that rolls it the other way | Rolls a crouched rat onto its side |
| Fights forked where the righting took the body (`scripts/quadruped/righting-forks.mjs`) as search starts; the side's poses searched again over them, and a third set for a crouch (the trunk's up over .5) | 9 of 14 such forks stand (5 before), 4 of 5 forks of other fights (5); over the 8 fights above, 5 s less down or righting: within the fights' spread |
| The crouch's legs spread wide to lay it on its belly, then the reference pose | 2 of 14 forks stand |
| A fight's pose (the trunk's turn and height, the joints' angles) placed on the stand as a start | Stands where the fight stalls: the motion and the foe are lost |

The reptile's routes drive the hip's third axis and the knee's first to angles from a sprawled
reference pose, and do not right the rat. Built lying (on its back, either side, and rolled 69
degrees; two headings; Node stand, Rapier, 120 Hz, a delay of one step, at `656a3dbf`), the rat
never leaves the roll in 60 s, and the reptile hands back to its gaits in 3 of 8 (10 to 39 s; with
its legs at 6 rad/s, 5 of 8 in 100 s, 15 to 80 s, most falling again on the walk after).

On its side the rat rests on its ground-side thighs, which prop it 17 degrees short of its side:
its hips are low on a round trunk, and abducted at most .8 rad (their range then) they cannot
lever it over. Tried
with the routes and not kept:

| Change | Result |
| --- | --- |
| Paws tucked toward the hip, or stretched along the trunk, by the effector tracker | The pinned ground-side legs do not move; stays on its side |
| Legs swung fore and aft (hip's second axis ±1.2 rad) | Rolls to an up of .6, then stalls |
| Knees folded ±1.2 rad through the roll, the hips swung ±.8 rad or not | Up of .3 to .6 |
| Hip abduction ±1.6 or ±2 rad, the loaded-hip push | Rolls to an up of .8 to .9 within a second |
| The same, `rightingGain` 16 to 64 | Up of .95 within 1 to 2 s, resting on its belly's edge and two paws, its centre of mass outside them |
| Then the gaits at once, or after the legs settle at their reference or stretched angles | The crawl commands its centre over paws the body is not on, and tips it over |
| Then the rise (`startRise`), its centre at the paws' mean, at the centre of mass, or its paws sent to their own footprints | Tips it onto its back within .25 s; sent to their footprints, it rises neither body |
| From an up of .85, the legs off the ground set to their reference angles one at a time, the others held | All four paws bear at an up of .87; the ground-side thighs stay down |
| Then the rise with the legs held where they are, its trunk's turn and height eased in over .5 to 2 s from the pose it has | Tips it onto its back within .25 s, as at once |
| The support motor bearing wherever the ground presses a leg: at the middle of its contacts, carried by the freedoms down to the segment pressed nearest the body | Holds the rat at an up of .89 with no shortfall, and does not level it: two of the front ground-side hip's axes sit at their limits. The rat's walk tips at 4 s in 8 of 8 headings, its lower legs grazing the ground |

Every hand-over from the routes tips it for one reason: the support motor (`supportedMotor`) bears
on the paws alone, and on its side the rat's weight is on its ground-side thighs and its tail.
Asked to hold still at an up of .88, the motor finds the paws 3.3 N·m short of the moment, plans
the roll that follows (76 rad/s²), and drives the legs into it. Read on the Node stand at
`40358702`. The recipe holds a pose until the trunk is upright and still, and hands over then.

Built level on its belly over stretched legs, the rat is not down, and the crawl stands it up and
walks 3.1 to 3.9 m in 10 s.

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
| Trot travel | speed .5 m/s, acceleration .5 m/s2, sideways .15 | Bounded velocity changes and slower lateral travel |
| Trot timing | swing .22, settle .025, plant .2 s; plantSpeed .2 m/s | Alternating diagonal pairs, with root motion subtracted from landing velocity |
| Trot heading | turnRate .25 rad/s, turnMoveAngle .2 rad, turnError .05 rad | Wait for the actual trunk heading before accelerating; bound the requested turn |
| Trot acquisition | liftConfirm .001 m, landingWait .1 s, placementLimit 3 s | Count a step only for a paw that lifted; end a swing once its pair bears, lifted or not; brake on delayed landing and return an unlanded pair to its anchors |
| Resumed travel | resumeSpeed .1 m/s, resumeHold .3 s | Place each paw again through the crawl, then require quiet four-sole support before trotting; the trot turns to the heading |
| Crawl geometry | crawlHeight .85, stride .035 m, lift .025 m | Lowered three-paw support and one-paw swing |
| Crawl timing | swing 1.2, shift .45, settle .3, plant .2 s; plantSpeed .05 m/s | Slow placement and continued downward acquisition |
| Placement bounds | placementLimit 3 s, liftConfirm .001 m | Return an unlanded paw; count a step only for a paw that lifted |
| Support margins | inset .4 m, supportInset .1 m, shiftError .008 m | Desired support-centre inset and actual containment tolerance |
| Heading | yawStep .18 rad per four paws, turnError .05 rad | Bounded heading advance |
| Contact | supportNormal .5, contactMargin .01 m | Positive fixed-ground impulses, and sole versus edge contact |
| Jaw path | prepare .25 s, snap .12 s, open .65 rad, jawError .03 rad, jawClosed .001 rad | Measured opening and closing, with finite angular motion |
| Bite reach | biteEntry .008 m beyond the tip-to-mouth span, bitePrepareNear .12 m, biteElevation .15 m, biteNear .04 m | Sensed surface selection, the open jaw's floor clearance and physical chamber readiness |
| Bite placement | contactAt .5 of the opening angle, biteAlign .04 m, biteShift .04 m, biteInset .02 m | Aim the selected tooth's point at contactAt of the opening on the retained surface; launch with the mouth within biteAlign of that aim; bound COM displacement from where the chamber began, within loaded paw support |
| Bite selection | biteSamples 4, biteLead .03 s | First exposed entry over the tooth arc, including natural colliders; predict the retained material point from sensed linear and angular motion |
| Material contact | contactSeconds .25 s | Bound an admitted stroke by time and the physical 8 mm tooth depth |
| Withdrawal | neckRetract .3 rad | Ceiling on upward neck retraction during a loaded return |
| Jaw response | biteResponse .03 s during Swing and Return | Track the finite jaw path through the unchanged torque and speed ceilings |
| Closing path | closeRate 4 rad/s | Retain closing velocity at the requested path endpoint; actual motion remains muscle limited |
| Bite cycle | release .2 s, biteSlow .2 m/s, biteHold .03 s, biteTimeout 2 s, biteReturnLimit 8 s | Verified quiet release; the bound allows actual backward paw placements before reporting failure |
| Bite approach | approach .3 m, braking .5 m/s2, creepNear .3 m | Reduce travel intent with remaining mouth clearance and stopping distance; retain close crawling until the foe clears this distance |
| Righting by recipe (the rat's, `assets/rat/righting.json`) | settle 1 s, servo .15 s, upright .95, calm .1 m/s, still .25 s, limit 6 s, tilt .85, wait .5 s | Hold the reference pose, play the poses for how it lies, hand back on a trunk upright and still; take the body from a lasting tilt |
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
- **A crawl's paw and a trot's pair** have landed once they bear after the swing, a paw that
  never cleared the floor (dragged, or already at its target) where it stands, so neither the step
  nor a bite waiting on support holds; only a paw that cleared the floor counts a step, and one not
  down within placementLimit returns to its anchors. **A settled stance** holds the centre of mass
  where the reference pose carries it over the paws' mean (`overPaws`), wherever the legs meet
  the trunk. Gaits switch after the active placement.
  Close fighting and crowded withdrawal crawl; a resumed host crawls into place, aligns its heading
  and verifies quiet four-sole support before trotting.
- **The bite** takes the first exposed surface on a tooth's closing arc, keeps the material point in
  the foe segment's frame while it prepares, and launches on an open jaw, a mouth near its aim and
  four loaded paws (a stroke keeps at least three). It freezes the chambered point and mouth aim at
  the snap and lunges, the head and the lean driving the mouth onto the aim. A stroke ends on
  its snap and follow-through clocks if it misses, on its .25 s / 8 mm budget once in contact, and
  on cancellation, lost support, a fall, misalignment or a loaded contact with anything unintended.
  Contact identities come from the arena's or crypt's trusted adapter.
- **The return** opens the jaw for .25 s keeping the neck pitch, retracts a loaded head through the
  neck muscles, and crawls backward if contact persists past the .2 s release. Success needs an
  open jaw, a neutral neck, quiet jaw motion and no loaded head or jaw contact; a timeout is a
  failure and frees the bite for another target.
- **Righting by routes** (a body with no recipe) reads every fixed-ground contact but pushes only through loaded leg chains, routing a
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

These held for the authored body. The grass lizard does not travel
([the grass lizard](#the-grass-lizard)), so it meets none of the travel gates.

The bite meter credits actual load wounds during a launched bite and its loaded withdrawal; a
completed cycle needs the verified release. The eight recovery poses are development witnesses,
not a claim about arbitrary falls, obstacles or opponents; some take repeated retries and about
80 s.

**Travel after a hand-back.** The crawl places each paw again (a landing counts, the paw cleared or
dragged) and waits for quiet four-sole support; the trot then turns the body to its heading before
it accelerates (`turnMoveAngle`). With the legs at 6 rad/s the reptile, trotting off at once,
fell for 364 steps after a hand-over, and the crawl aligned its heading within .05 rad first. At
20 rad/s that crawl turns .18 rad a four-paw cycle, about 9 s a cycle, and holds the rat for good:
its paws drag, so no step counts. Built standing, handed back at 2 s and ordered 90 degrees off at
6 s (Node stand, Rapier, 120 Hz, the game's delay; distance over 8 to 16 s):

| Body, headings | Hand-back | Falls | Distance, m |
| --- | --- | ---: | --- |
| reptile, 6 | the crawl aligns first | 0 | .03 to 1.91 (median .14) |
| reptile, 6 | the trot turns | 0 | .27 to 1.91 (median .5) |
| rat, 2 | the crawl aligns first | 0 | .02, .03 |
| rat, 2 | the trot turns | 0 | .87, .24 |

Righted from its side, back or a roll at 4 headings, the rat then travels .18 to 1.24 m in the same
8 s. Fighting at the 8 gaps of [its righting](#righting), the reptile plays to the bit as before in 6
bouts; in the other two it is down 6 s longer, and killed at 37.5 s where it lasted the 40.

**Travel speed** (`node research/reptile-motion.mjs@60c3ecc3 --sweep`; two seconds standing, then ten seconds
of forward travel on a 100 m ground, driven and unstruck; overrides passed into `quadrupedMind`, `src/core/reptile/mind.ts@ae88d42c`):

| Commanded speed, m/s | COM height multiplier | Distance in 10 s, m | Mean speed, m/s | Steps down | Counted paws |
| --- | --- | ---: | ---: | ---: | ---: |
| .25 | 1 | 2.809 | .281 | 0 | 76 |
| .30 | 1 | 3.243 | .324 | 0 | 76 |
| .35 | 1 | 3.646 | .365 | 0 | 76 |
| .40 | 1 | .339 | .034 | 296 | 6 |
| .30 | .85 | .351 | .035 | 308 | 10 |

That sweep is the reptile's legs at 6 rad/s; the default is .5 m/s on legs at 20 rad/s
([fast legs](#fast-legs)). The crawl it
replaced (`42cd1e5a`) covered .156 m in the same ten seconds, about 20.8 times slower. Without a
`--sweep`, the script plays four autonomous arena mirrors and tells jaw blows in a committed stroke
from incidental collisions; the 30 s combat target is `research/reptile-combat.mjs`'s.

**Humanoids unchanged.** `node research/body-plan-regression.mjs CHECKOUT OUTPUT.json` (120 warmup
and 1,200 measured standing steps; 2,400-step Warrior/Rogue bouts; every segment pose in the
digest) gives the same digests at the reptile's qualification `cf2c220c` as at `3f60d702` for the
Warrior, Rogue and skeleton standing (`2a08cb82a39d0889`, `ef9201a9062b6c05`, `ed808209f8b4327c`)
and the Warrior/Rogue bouts with clubs (`1805f1c3d51d2a5b`, left wins by a fatal wound at 9.125 s)
and empty-handed (`78f8e4519b5c8977`, no verdict in 20 s).
