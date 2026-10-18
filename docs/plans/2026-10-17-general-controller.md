# One controller for every body: the whole-body solve

A body that stands, walks, runs, stops, recovers from a shove, stands up from a fall, holds what it
holds and strikes, all through **one solve** under **a few behaviours**, instead of a controller
built for each skill. The attributes (Balance, Haste, a Grit brought back) become bounds the solve
uses on its own, so a character helped past a person's level is helped in everything it does.

This plan supersedes the locomotion and stand-up plan of 2026-10-16, whose findings are kept
below as the baseline and the register of what not to try again.

## Why

**What the owner wants** (2026-10-17): superhuman balance, locomotion and recovery, by assists,
with everything on the table, morphology and muscles included. One general approach, since today
"any time any character needs to do anything it takes a lot of ad-hoc custom development", and
no controller per loadout: two hands and N items would be N² controllers. Whatever runs in the
game runs in a browser; training offline is fine if what it produces is cheap. A human look is
preferred, and a strange motion that meets its bar beats a human one that does not.

**Why the assists have mostly failed.** Every controller the game runs is a script that
reproduces a human-shaped motion at human-shaped numbers, with thin feedback over it. Extra
capability has nowhere to go, because nothing in the loop asks for more than a person does:

- **Haste** (the legs' muscles faster) adds about 0.3 m/s. The run (`runCycle`,
  `src/core/skills/cycle-run.ts`) tracks three CMU clips' joint angles at a cadence; faster
  muscles track the same angles. Its pace is the fixed point of pace = body + `ahead`. At the
  Warrior's top speed only the ankles reach the strength the run allows them, so the muscles do
  not cap the stride: the controller does. Timing the gait to the muscles (`hasted`) felled 106
  of 150 runs: stride and stance times are gravity's.
- **Grit** (a joint-torque surge) stood the Warrior from no more falls and no faster at twice its
  strength. The stand-up (`step-up`, `src/core/mind/ground/step-up.ts`) is eight pose stages, each
  gated on being settled; its joints run well under their strength, and torque does not shorten a
  wait on balance. Not built.
- **Balance** (a root wrench no muscle gives) is the one assist that works: it acts on the one
  thing the scripts cannot do, the pelvis's attitude. It costs the Rogue and the skeleton pace
  because it rights the pelvis toward the gait's own lean, and a body accelerates by leaning
  further (`gaitAssist`, `src/core/skills/gait-assist.ts`). It is "spent by 25 %" because the
  stance asks for no more, not because the body needs no more.
- **A lift through the stand-up** felled every body: the pose stages are open-loop and assume
  the ground; lifted, nothing in them notices.
- **The searches** tune about twenty scalars of a fixed structure. A longer stride and a faster
  stand-up are not in that class, so no search finds them.

The rule that falls out: an assist fails where the controller is feed-forward and works where it
is feedback. Capability has to be *consumed by something that optimises*.

**What already exists.** `bodyDynamics` (`src/core/build/dynamics.ts`) gives the mass matrix,
gravity and the velocity terms. The bearing solve (`src/core/control/bearing.ts`) is a weighted
bounded least-squares over limbs, ground patches and the assist. `wholeBodyTracking`
(`src/core/control/whole-body.ts`) is an experimental one-solve acceleration tracker that already
carries held items' mass and grips, and is not the game's default. A held item is part of the
body's spec (`armedWith`, `src/core/items/held.ts`), so a model-based solve carries it without
being told. The muscle driver takes a torque-source command (an infinite-speed command,
`src/core/muscle/driver.ts`). The game's defaults bypass all of it: the walk and the run drive
joint targets from SIMBICON and the clips, and the stand-up drives poses.

## The architecture

Three layers with fixed interfaces. A layer reaches the one under it and nothing else.

### Layer 1: the solve

One per body, every control step. It is given:

- **tasks**: weighted accelerations of points and frames (a sole, a hand, the pelvis, the centre
  of mass), and a posture (joint angles with a weight);
- **the contact set**: which patches bear, with their friction cones;
- **the actuator bounds**: each muscle channel's torque at its speed (the Hill curve as it is
  today), and the assist's wrench ceiling.

It finds the joint torques, the contact forces and the assist wrench that best meet the tasks
within the bounds, with a cost that spends muscles before the assist. It knows no gait, no fall
and no item: a held item is mass in the model, and what the item wants is a task on the hand.

**The attributes live here and nowhere else:**

| Attribute | In the solve |
|---|---|
| Balance | the bound on the assist wrench (`balanceCeiling`, as today) |
| Grit | the torque bounds raised |
| Haste | the Hill velocity bound raised (as today, `jointSpeed`) |

The solve uses what it is given exactly when a task needs it, which is why Grit and Haste do
nothing today and would do everything here.

**Cost gate.** A body under control costs 0.36 to 0.46 ms a step today (Node, Rapier, 120 Hz,
`docs/reference/step-cost.md`). The solve's gate is **0.5 ms a body a step**, read with
`research/step-time.mjs`; a solve of about forty variables warm-started from the last step is in
that range. The level rule (`levelsOf`) already drops bodies far from the fight. If 120 Hz does
not fit, the solve runs at 60 Hz over a 120 Hz world, and that is measured before it is chosen.

### Layer 2: behaviours, as task generators

A behaviour says *what to accelerate*, never a torque. Four cover most of the game:

1. **Capture-point stepping.** Standing, a shove taken, walking, running, stopping and turning
   are one question: where the next foot goes and when (the capture point and its 3D form, the
   divergent component of motion). Ankle, hip and stepping strategies fall out of the solve. The
   step's reach reads the leg's speed, so Haste lengthens the stride instead of quickening a
   cycle; the run gets its flight from the centre of mass's launch, not from a clip.
2. **Contact sequences.** A stand-up is a sequence of support sets (back, side, fours, a knee,
   two feet), each with a centre-of-mass goal, under feedback: the solve bears on each set and
   the sequence advances when the centre of mass is over the next. Today's route is kept as
   data; the stages that wait on being settled go.
3. **Reach and strike.** The point strike (`src/core/control/point-strike.ts`) already works this
   way; the hand's task carries the item's mass through the model.
4. **Learned behaviours**, only where a planner cannot: a small policy (a ReLU network of a few
   thousand weights, exact arithmetic) that outputs task targets, a footstep, a centre-of-mass
   goal or a contact switch, trained offline on the harness with the body, the loadout and the
   attributes randomised, and given the item's mass and centre as inputs rather than its name.
   The first candidate is the stand-up from an arbitrary pose, trained strong first and weakened
   in a curriculum, with Grit as the strong end: a character with Grit then plays the strong
   policy's route (Tao et al. 2022; HumanUP 2025).

**The human look is one weight.** The mocap clip stops being the controller and becomes the
posture task's target by phase, inside the solve. The dynamic tasks give the performance; the
posture's weight gives how much it looks like the clip, and may differ by character.

### Layer 3: the mind

The options mind (`docs/plans/2026-10-14-options-fighter.md`, `src/core/mind/options/`),
unchanged: an option asks a behaviour for what it wants.

### Loadouts

An item is mass and inertia in the model, carried by the solve without a word. What the item
wants, the blade up, the shield's face toward the threat, the club's guard, is one task per item
kind on the hand that holds it. Two hands are two tasks in the same solve. N items are N tasks.

## Where things stand

Every figure is Node stand, Rapier, 120 Hz, balance 0 % and haste 0 unless it says otherwise.

**The solve (stage 0).** `src/core/control/solve.ts` runs beside the bearing solve, chosen per
body (`BodyOptions.solve`; `DuelRecipe.solve` by side; `research/step-time.mjs --solve`). Under
the assist reference's pulls (`tests/core-assist.test.mjs`, now run on both) the Warrior falls,
is held, is held by the force alone and steps under the moment alone as on the bearing solve;
on the stance test's shoves the Warrior and the Rogue take the same recovery steps (within one)
and dip within 1 cm of the bearing solve's; the walk at 0.3 m/s is the same. Standing, two
Warriors' step costs 0.21 ms a body beside the solver on either (`tests/harness/garbage.mjs`'s
pair), and the whole motor control is 10.2 % of a bout's step on the solve against 10.4 % on the
bearing solve (`step-time.mjs --profile`); a bout on the solve is another bout, so its step median
is not the bearing solve's to the millisecond. A standing step allocates 110 KiB a body on either,
a bout's 311 against 328. The fingerprint is unmoved (no body is on the solve by default). Not
done in stage 0: `wholeBodyTracking` (`whole-body.ts`) is still in the tree as the experimental
tracker; a limb's posture beneath its task (`Limb.work.toward`) and the bounded swing are not in
the solve, since the stance asks neither.

**Standing and the shove (stage 1).** The stance was already capture-point stepping
(`recoveryStep`, `src/core/control/gait.ts`), on both solves. What stage 1 added is Balance as the
step's bound: the stance steps only once its capture point is past the margin and what its assist
holds (`assistReach`: a force holds the point its height times the force over the weight out, a
moment the moment over the weight; `STANCE_RECOVERY.assisted`, swept in
`docs/reference/stance-tuning.md#assisted`). On the stance trials' shove battery (272 shoves to
90 N s) at balance 0 the solve holds the Rogue 163 and the Warrior 238, the bearing solve 142 and
237, with stand, edge, step and walk the same on both; nothing moves at 0 with the bound in. At
25 % on the solve the Rogue holds 240 (was 182) with 0.11 steps a shove held, the Warrior 272 of
272 (was 261) with none, and to 150 N s 361 of 464 (mean 117 N s); on the bearing solve 231 and
271. The gait battery at 25 % is the same 31 of 300 before and after, so no pace is lost. The
gate is met. `gaitAssist` (`src/core/skills/gait-assist.ts`), SIMBICON's pelvis-righting ask,
is untouched until stage 3 takes the run. The research stand-up learning environment's
declared-fallback fixture (`tests/research-recovery-learning.test.mjs`) now runs at 50 %, since at
100 % the assist holds every shove it escalates to.

**Walk, stop and turn (stage 2): under way; the gate is not met.** The
stance's walk (`walkStep` and `transferStep`, `src/core/control/gait.ts`: capture-point steps on a
DCM preview) is being brought to the gate on the whole-body solve. Landed: the plan's pivot is
chosen by the deadbeat law while no less than `horizon` is left of the step or the double
support, and held after (`planAcross`, `step.pivoted`); the floor at the horizon it replaces aimed
past the landing, landed the capture point short every step, paced the walk at 0.76 of the ask
and had a stance catching itself step on (eight recoveries in 2 s after a steered club blow,
never settling; now four, standing). Each step is planned at the pace its leg can take from the
body's measured capture point (`reachablePace`): the pace nearest the walk's ramp, between it
and the body's own, whose landing is within reach, which the ramp goes on from, and a step keeps
the pace it was planned at. A stop from a backward walk asked the capture step at once, further
back than the hip reaches, and the plan never reconciled with the body: the capture point missed
it by 0.15 m on the first stop step and 0.24, 0.39 and 0.65 on the next three while the body sped
up backward from 0.9 to 1.6 m/s. Each step is planned within `reserve` (0.8) of the leg's reach
and re-aimed under way within the whole of it: planned at the whole reach, a step landed short as
soon as the body lagged its plan (the leg 0.03 m too short for the landing from where the hip
was), and the capture point ran past the plan by exp(w T) a step. The swing's reach is read from
the centre of mass at the landing; a double support places within both soles; the walk asks no
pace past what its legs can step and crouches only as far as the steps at its pace need
(`fastestPace`, `walkHeight`, `StanceState.crouch`); a swinging foot keeps its launch height to
the landing (lowered with its progress, a foot still pitched from its launch touched with its
toes early and landed 20 mm short). A per-tick reach clamp on the swing path held the same 25 of
25 with and without it and is gone. On the five-way gait battery asked 0.7, 1.0, 1.2, 1.4 and
1.6 m/s, each walk 8 s then stopped (Node stand, Rapier, 120 Hz, balance 0;
`research/core-stance-sweep.mjs --batteries gait --speeds 0.7,1.0,1.2,1.4,1.6 --ways
0,45,90,180,270 --solve`) both humans hold and stop all 25 walks, against 13 and 9 of 25 asked
0.5 to 1.4 before the stage. Forward the Warrior walks 0.72, 1.01, 1.15, 1.19 and 1.20 m/s of the
five asked, its legs' cap 1.41; the Rogue 0.71, 0.96, 1.04, 1.00 and 1.00 (cap 1.22). Forward-right
both walk at their cap (0.89 of 0.91, 0.78 of 0.77), sideways 0.66 of 0.70 and 0.55 of 0.60, back
0.85 of 0.94 and 0.67 of 0.74. The reserve's and the horizon's sweeps are in
`docs/reference/stance-tuning.md#pace-cap-crouch-and-horizon`. The shove battery to 90 N s is
unchanged (the Rogue 163 of 272, the Warrior 235 against 238). The reach is planned from the hip
where the body carries it from its centre of mass, read each step (`FootMemory.hip`): planned
under the centre, the Rogue holding the club in the guard (its centre 0.08 m ahead of its hips)
had every step back clamped to 0.85 of its reach and every club walk back fell on the stop; read,
the stop battery (0.7, 1.0 and 1.2 m/s four ways, empty and club, calm and in a 1 m/s gust,
`--batteries stop --gusts 1:5:5 --solve`) holds 41 and 44 of 48 (42 and 41 before), the falls
left all stops from a backward walk asked 1.0 or 1.2 m/s, and on the gait battery asked to 2 m/s
(30 of 30 each) the Warrior walks 1.46 forward, 1.21 back, 0.70 sideways and 0.91 forward-right,
the Rogue 1.20, 0.80, 0.60 and 0.77. Open: the Warrior asked 1.6 m/s
forward walks 1.20 for 11.8 s of a 20 s walk and falls on a short step the solve is 750 N and
900 N m short of, followed by a 0.43 m wide one. Against the gate (SIMBICON Warrior
1.5/1.4/2.5/1.5/1.4 m/s forward/right/back/left/forward-right, Rogue 1.2/1.2/1.7/1/1.7) the
forward pace is 0.8 of it on each, and sideways and back the legs' own cap is half of it or
less: SIMBICON's 1.4 m/s sideways and 2.5 back are at or past a human's preferred forward walk,
the paces of a tracker that leans and shoves rather than steps, so the every-way gate as written
measures the old tracker, not a walk. The owner's decision (2026-10-18): sideways and back stay a
walk, stepping, never a shuffle or a run, so the gate there is the walk's own pace, without
falls; forward is to be fast, to 5 m/s, a run past the walk's top, which stage 3 builds on this
generator. Since: the swing leg's reach
is its two links' with the heel's shortfall (`SwingLeg`, `FootState.back`); a step lands leaning
as its line from the hip has it, flat where the ankle's range reaches and pitched by the rest
(`landingLean`, `landingTurnToRef`); and the swing path is the sole's lowest corner's
(`soleDrop`), which was what threw a body catching its own straight into eight steps. The honest
reach wants less reserve: 0.9 holds all 30 of 30 walks a human asked to 1.8 m/s and paces the
Warrior 1.22 forward, 0.69 sideways and 0.80 back, the Rogue 1.04, 0.59 and 0.63
(`docs/reference/stance-tuning.md#reach-landing-lean-and-the-soles-path`). Paced nearer the
legs' strength (`effort` 0.7) the walk caps higher forward and falls there from 1.4 m/s asked
(the Rogue) and 1.6 (the Warrior); with the double support shortened to 0.06 s the walk back
creeps past its cap a step at a time with the pivot and the centre of pressure at the heel's edge
and falls, and a stance catching a steered club blow staggers four steps or eight by chance
(`tests/core-strike-skill.test.mjs`, red). Since: the stance plans within the regions each ankle
holds of its sole (`FootState.hold`, `ANKLE_HOLD`; `docs/reference/stance-tuning.md#ankle-hold`),
a sole's end is in the air by its height over the ground (`standingOn`, `DOWN`), a transfer step's
correction for the measured capture point runs it through the double support about the pivot the
stance will choose (`transferStep`), a recovery step is re-aimed as it swings (`aimRecovery`), and
the plan goes on from what the ground gave of its ask (`plan.missed`): a plan that counted the ask
as taken ran away from a body whose soles could not give it (0.1 m from the body within 0.3 s of a
club blow, its tracking asking 15 m/s² of ground that gave less), and the Arena's smoke bout fell
on its seventh recovery step; it stands. A recovery reads its capture point with what the body's
angular momentum brings it as it returns (`carriedVelocity`; without it the Rogue shoved 35 N s
back and the Warrior shoved to the side fall) and steps a foot the body has tipped off (`holding`),
a swing carries its sole's lowest corner to the ground it last stood on, and a walk from a split
stance starts with the foot behind (`startingSide`). On the stop battery (as above) the Rogue
holds 43 and the Warrior 46 of 48 (85 of 96 before): all seven falls are stops from a backward
walk at 1 m/s or more, six with the club. Their common root is read: the dorsiflexors hold the
centre of pressure no more than a few centimetres behind the ankle (the Rogue's hold 21.5 N m
toward the heel against 208.8 toward the toes), so a body falling toward its heels cannot brake
standing and must step; and the swing hip's reaction pitches the pelvis from 15° forward to 15°
back within a step back, the ground short of the asked wrench all swing (30 to 230 N m), which
takes the Rogue's 16° of hip extension, so its steps back land about 0.2 m short. Since: the solve
holds a limb's freedom at the range's stop it presses and weighs a limb's spin rows at its reach
(`holdStops`, `spinRow`, `solve.ts`), and on the solve a swinging foot is pulled onto its path at
0.04 s (`WHOLE_BODY_SECONDS`): at 0.1 s the foot lagged its path where the path rises late under a
leg stepping back (the knee bending, the ankle on its stop, the toes dropping), and its toes met
the ground short of the landing and dragged. The gait battery asked 0.7 to 1.8 m/s five ways holds
30 and 30 of 30 (26 and 27 before), and the stop battery 48 and 48 of 48: the gate's 0 of 96 is
met on the solve (`docs/reference/stance-tuning.md#time-constants`). The Arena's
steered club blow (`tests/research-blow.test.mjs`) steps on the blow's contact and staggers to a
fall. Since: the swing's reaction is the leg's two links and foot as the swing carries them, the
knee placed between the hip and the ankle on the path, its angular momentum about the centre of
mass integrated by parts (`swingShiftToRef`, `SwingLeg.links`): taken as rigid along the hip's line
to the foot, the leg's reaction was half what the body measured (86 against 170 N m early in a
Rogue's swing asked 1.4 m/s forward), since the thigh swings further than that line as the knee
bends and straightens, and the ground was 60 to 230 N m short of the plan's ask in the second half
of every swing, the body losing 0.25 m/s a step. With it the shortfall is under 20 N m to the last
0.05 s before the landing, and forward asked 1.0 m/s the Rogue walks 0.95 (0.82 before), the
Warrior 0.91 (0.86); asked 1.4, 0.94 and 1.19 (0.90, 1.12). Asked 0.7 to 2.2 m/s five ways the
Warrior's pace over the ask is 0.92, 0.74, 0.62, 0.48 and 0.41 (0.92, 0.69, 0.56, 0.46, 0.37);
most of those cells now walk at the legs' cap (`fastestPace`; 20 and 16 of 25), so the cap's own
numbers (`seconds`, `effort`, `longest`, `crouch`) are what hold the envelope sideways: SIMBICON
sidesteps asked 1.2 m/s in 0.30 s steps 0.71 m apart and walks 0.85, the stance's walk in 0.38 s
steps capped at 0.62 apart. Since: a phase that begins with less than the horizon left is aimed
once for the time it has (`PIVOT_FLOOR`), where the floor at the horizon aimed a 0.08 s double
support for 0.1 s and handed every swing a capture point short of its plan; a swing's time left is
its whole time until the foot lifts. A step lands within the whole of the leg's reach, the
`reserve` being the steady walk's (`stepsWithin`), not counted twice. A walk's step lands on its
own side of the bearing foot (`ownSide`): the Rogue turning crossed its feet, and its thighs, which
share no joint and meet at full stiffness, threw it. A thigh leaves the stride's room to the other
(`STRIDE_ROOM`, 30 mm; `docs/reference/run-body.md#the-thighs-room`): the skeleton's thighs met in
241 of 960 steps walking 1.2 m/s, now 1. A sideways catch steps the nearer foot out only when the
capture point is past that sole's middle (a club's kick stood on one foot catching a fall that was
not coming). Forward asked 1.0 and 1.4 m/s (`walk` in `core-stance-trials.mjs`, solve on, in the
guard under the character's balance; Node stand, Rapier, 120 Hz), empty and with the club, the
Warrior walks 0.99 and 1.22, 1.06 and 1.14 (0.78 and 1.12, 0.91 and 1.10 before); the Rogue 0.97
and 0.96, 0.97 and 0.92 (0.61 and 1.01, 0.78 and 0.84; it fell asked 1.5 and 1.7, and no longer);
the skeleton 0.99 and 1.18, 1.06 and 1.16 (1.01 and 1.07, 0.87 and 1.01). The walk tops out near
1.2 m/s whatever is asked; the pace past it is the run's (stage 3). The whole-body solve is the only motor solve: its torque rows rank over the
root's (`WEIGHT.torque`), where ranked under the feet the plan asked more of a pinned hip than it
has and the pelvis rolled; with the ground short, the root's turn is aimed at the rigid body's
response to the wrench the ground missed (`rigidTurn`), as the bearing solve did. The game's walk
and run is the stance's walk handing over to the cycle run (`walk-run.ts`, Move's Braced and
Run), with its own run settings (`WALK_RUN_CYCLE`, searched on that handover; `RUN_CYCLE` stays
SIMBICON's); SIMBICON's walk and run stay, offered beside it. The Move bout's `todo` passes. The stop
battery holds 96 of 96 (Node stand, Rapier, 120 Hz; the bearing solve at the start of the stage fell 13). Its last falls were
all walks back at 1.2 m/s with the club, and the walk itself, not the stop, gave way: the steady
walk's pace cap reckoned a step back as far as a knee bending under the thigh at the hip's stop takes
it, and a swing reaching that far rides the ankle's dorsiflexion stop with its toe hung 7 to 9 cm
under the sole's middle, which met the ground 0.1 s early and 8 cm short, step after step, with
the pelvis pitching 0.3 to 0.5 rad forward over each step back. The cap now reckons a steady step
back on a straight leg (`stepsWithin`), while a catch or a stop still bends the knee for its reach:
capped on the straight leg for its steps as well, a stop could not brake and ran on back. Walks
back asked 0.9 to 1.3 m/s three ways, empty and with the club, calm and on gust seeds 5, 6 and 7
(240 walks) hold 239 (231 before); the five-way gait battery asked 0.7 to 1.8 m/s holds 50 of 50
(48); the shove battery is unchanged. Walking back asked 1.2 m/s the Warrior goes 0.90 m/s (0.96) and
the Rogue 0.75 (0.90). Neither lifting the swing's path by the larger of the drop the foot is asked and the
one it has (the path dipped 4 cm at mid-swing) nor taking the pelvis's lean at the last landing
from the hip's range moved those 240 walks (229 to 231). The gait battery (300 trials, Balance 0) falls 51
(Warrior 9, Rogue 36, skeleton 6), against 125 with SIMBICON's run settings on the handover; at
4 to 5 m/s asked the Warrior runs 3.36 m/s, the Rogue 2.82. Forward-right, the
stance's walk alone goes 0.88 m/s (the Warrior) and 0.74 (the Rogue). The walk and run ran straight
ahead and gave the way's sideways part up, and handed over to the run with the body moving 1 rad
across the run's heading; now, asked past the run's pace within 60° of the face, the walk turns the
body to the way asked, the run takes over once the pelvis faces it within 0.15 rad, and asked to
stand the run brakes along its heading rather than turning back to the face. The run also gave the legs back to the walk
on a stance sole that bounced off the ground and down again, late in its stance with the body moving
away from it and the other foot in the air, and the walk fell catching it (the stops from a run
with the club); a landing is now the other sole's. On the walk-run envelope (one walk a cell, 0.2 to
4.5 m/s), forward and forward-right, the Warrior holds every cell to 4.5 m/s, empty and with the
club (forward-right 1.2 and 1.0 before); the Rogue 3.5 and 3.5 empty, and with the club 0.7 forward
(a fall at 1.0 alone; it holds 1.2 to 3) and 2.5 forward-right (0.7 before); the skeleton 4 and 4
empty, 0.7 and 0.7 with the club; SIMBICON's are 1.5/1.7 (the Warrior), 1.2/1.7 (the Rogue) and
1.4/1.5 (the skeleton) empty, and 1.5/1.7, 1.2/1.7, 1.4/1.7 with the club. The gait battery falls
41 (51). Short of the gate are the club's slow runs: asked 1.0 to 1.4 m/s the run with the club
drifts across its heading 0.46 to 0.57 m/s, to the Rogue's left and the skeleton's right, as a
proportional placement (Raibert's) leaves a load carried to one side; the skeleton's cells there
went too far across to have gone as asked and the Rogue's fell. The sway's error integrated into
the sole's placement removed that drift where it was seen, but felled the gait battery (41 falls
to 88 and 132, at gains 0.2 and 0.5 a second, 0.1 m at most, mostly fast runs and turns), and
integrated a stride at a time it left the skeleton's trials as they were and felled the Rogue's: it is not kept. Turning the
run's heading to bring its travel round to the way asked (the travel's error integrated, 1 a second, 0.6
rad at most) took the drift off too, but fell more on the gait battery, 102 of 600 against 83 over
gust seeds 5 to 12, mostly in turns: not kept either.

**Locomotion.** On the gait battery (asked 1.4 to 5 m/s, three stops, two turns, gust seeds 5
to 8, empty and club: 300 trials; `research/run-cycle-search.mjs --score`), and the stop battery
(96 trials):

| | Trials fallen | Steady pace, Warrior / Rogue / skeleton (m/s) |
|---|---|---|
| Gait battery, Balance 0 | 19 of 300 | 3.50 / 2.65 / 2.98 |
| Gait battery, Balance 25 | 31 of 300 | 3.59 / 2.83 / 3.09 |
| Gait battery, Haste +50, Balance 25 (same run) | 15 of 300 | 3.68 / 2.99 / 3.21 |
| Stop battery | 6 of 96 | |

Of the 31 at Balance 25, 30 are the Warrior falling at 3.3 s, before it is under way, in gust
seeds 6 and 8 in every cell (`node research/run-cycle-search.mjs --score --speeds 1.4 --winds
1:5:6 --holds empty --models workshop-fighter --balance 25`); it stands at balance 0, and stood
at 25 on the commit before `8d30a6d9`, which re-searched the run's lateral, lean, stance and swing
settings at balance 0 (the run before it: 5 of 300 at 25 %). Stage 3 replaces that tracker.
Haste +100 takes the Warrior to 3.74 m/s and fells it in 3 of 6 fast trials. The Warrior's
running step width is 0.31 m. Acceleration from 1 to 3 m/s is about 0.3 m/s². The club's run
falls 18 of 150; the Rogue with the club speeds up until it falls at 3.5 m/s asked and more. The
skeleton drifts sideways at about 0.4 m/s as its walk comes to a halt. The walk's envelope
(`assets/core/simbicon-envelope.json`) and the run's (`simbicon-run-envelope.json`) are as
measured on `a42d7f2c`; the Warrior with the club walking backward at 0.4 m/s falls 1 of 5, which
the envelope's one-fall rule does not yet cap.

**The stand-up.** On the owner's 64-fall target (`node research/rising-bed.mjs --target
--techniques step-up`, 30 s cap), step-up stands 40 of 64 (Warrior 11 and 14 of 16, medians
13.3 and 14.9 s; the Rogue 9 and 6, median 26.3 s and the cap), against 45 on the legs before the
run's. None stands within 6 s; the route's floor is about 9 s. The frozen screen
(`stand-up-acceptance-v2`) is pinned on these legs. Balance stands no more and no faster (Warrior
20 of 26 at 25 %, 14.8 s).

**The assists in bouts** (`docs/reference/assist.md`): with no balance 80 of 99 bouts end by a
fall; at 10 % 53; at 25 % 19; above 25 % nothing changes, since the stance asks for no more.

## The register: tried and not kept

Not to be tried again on the controllers as they are. Each failed for the reason in "Why".

- **Pace.** A push-off at the stance ankle, a knee push, the cycle's period at 0.95 or 1.15, the
  ankles at full strength, `ahead` 0.8, a search of the pace settings with the push-off: each
  traded cadence for step at the same pace, or fell.
- **Haste.** The gait timed to the muscles at a power of 1/2 or 1. A search with Haste +100 in
  its cells: kept the Warrior up at +100, but cost 11 Rogue falls at 0.
- **Stopping.** A pace floor under the body's speed; the run braking at its own rate; a lower
  handover speed; larger `cv` or `leanGain`; the walk's slowdown at 0.68 or 1.0 m/s²; the walk's
  late thigh let lean (threw the Warrior walking back with the club); a landing gate on the
  run's phase; the stance taking over only below 0.5 m/s sideways; per-axis landing trims.
- **The club.** `gainSide` above 0.086; a search with the club; a run gated on low sideways
  drift (never runs); the club's arm in guard; `ahead` 0 past the empty-handed pace; a governor
  on hip height.
- **Step width.** Targets at 0.15 to 0.2 of the leg: 115 of 300 fell in gusts.
- **The stand-up.** Twice the strength (Grit); every stage's seconds scaled by 0.6 or 0.4; the
  stages searched at a 10 s cap; `plant-up` by backward chaining (0 of 108 standalone); any
  assist in a pose stage (a lift or a damper, 0 of 32); the stages searched with Balance 25 % on
  (2 of 32 without it).
- **The stance's walk past 0.5 m/s** (stage 2, on the whole-body solve, before the pivot was
  held: the forward pace then 0.56 to 0.79 of the ask). Swing
  time 0.35, 0.4 and 0.5 s (0.5 oscillates between 0.6 and 1.0 m/s asked 1.2); double support
  0.1 and 0.12 s; lift 0.08 m (keeps the Warrior up at 1.6 m/s, no faster); the support inset at
  0.3 and 0.15; track 0.35 s; width 0.15 m; knee bend 0.1 rad; the pelvis's turn at 0.3 s (the
  Warrior 0.84 of the ask at 1.2, falls at 1.4) and 0.6 (falls everywhere); the pelvis leant
  toward the walk at 0.1, 0.2 and 0.3 rad for each m/s; the lift raised 0.06 and 0.1 m for each
  m/s; the swing's acceleration ramped at 0.1 and 0.25; the longest step 0.6 of the leg sideways;
  the swing's wrench lever at 0.1, 0.3, 3, 10 and 100 m. Each left the forward pace within 0.56 to
  0.79 of the ask at 1.0 to 1.4 m/s, or fell, and none held sideways above 0.5 m/s.
  With the pivot held: `horizon` 0.05, 0.15 and 0.2 s (the table in the record; a shorter one
  paces nearer the ask and falls near the cap, a longer one holds more and paces lower); the swing
  path lowered to the landing's height with its progress (a pitched foot touches early, lands
  20 mm short, and a shove runs away); a per-tick clamp of the swing to the leg's reach (the same
  25 of 25 with and without it).
- **Balance's shape.** A force across the heading alone; the moment toward the run's settled
  lean (held every run under 2.4 m/s); the moment's pitch both ways (the Warrior brakes slower,
  7 of 12 stops fell); damping the pelvis's spin alone.

## Order of work

Each stage builds one skill on the general stack **beside the skill it would replace**: the
game offers several implementations of a skill, each selectable in the mind editor, so the owner
can watch and compare them in the Lab, Arena and Crypt. The general one becomes the default when
it is the better; none is deleted for being superseded.

| Stage | Build | Gate | Rough size |
|---|---|---|---|
| 0 | **The solve.** Merge the bearing solve and `wholeBodyTracking` into one production solve with muscle, assist and contact bounds and a posture task; the torque-source command path to the driver. | Standing under the assist reference's pulls (`tests/core-assist.test.mjs`) matches today's stance; ≤ 0.5 ms a body a step (`step-time.mjs`); the bout fingerprint moves only for bodies on the solve. | 2 to 3 weeks; the proof |
| 1 | **Standing and the shove** on capture-point stepping, Balance as the assist bound. | On the stance trials (`research/core-stance-trials.mjs`) no more falls than today's stance at 0 %, and at 25 % no pace lost on the gait battery. | 1 to 2 weeks |
| 2 | **Walk, stop and turn** on the same generator; SIMBICON's walk and run stay beside it. | Walk envelope at or above today's forward and forward-right, and sideways and back a walk that steps, at its own pace, without falls; stop battery 0 of 96; the Move bout's `todo` passes. | 2 weeks |
| 3 | **The run** with flight, the clip as the posture prior, beside the clip tracker. | Forward to 5 m/s (the owner's aim), the Warrior ≥ 4.5 m/s steady; Haste +100 adds ≥ 1 m/s; gait battery ≤ 19 of 300; the club's run ≤ 18 of 150; the owner's eye on the look. | 2 weeks |
| 4 | **The stand-up** as a contact sequence; then the learned policy with the Grit curriculum where the sequence cannot start, beside step-up. | Unassisted ≥ 40 of 64, median ≤ 9 s; with Grit median < 4 s; the frozen screen run and reported. | 2 to 4 weeks |
| 5 | **Strikes and holds** as tasks, beside the per-skill drivers. | League Elo at or above today's (`research/arena-combat-league.mjs`); the one-two and the guard keep their windows. | 2 weeks |

Morphology spikes (foot length, a lower centre of mass, a momentum store in the torso as the
in-fiction Balance that drains as it saturates) go in anywhere after stage 1, since from then a
body change is measured through one controller.

Each stage lands in small commits, gated by `npm run check` and `npm test`, with the slow tests it
touches run by name. A stage that fails its gate is reported as failed; a measurement names its
harness, its bodies and each side's balance and haste. Learned weights are an asset under
`assets/core/` with the run that made them named; numbers in a behaviour are tuned freely.

## Decided

The owner's answers, 2026-10-17:

- Haste is a signed per cent over a person's, 0 for every character (`c8a9e93f`).
- A spec number's source is bookkeeping, not a bar; nothing outside a spec needs one.
- A stand-up assist is wanted; Grit comes back where a controller can use it.

And 2026-10-18:

- Sideways and back stay a stepping walk at its own pace; forward is fast, up to 5 m/s, by the run.
- SIMBICON's walk and run stay selectable beside the walk and run; they are not deleted.
- Several implementations of a skill stay selectable side by side; a new one is added beside the
  old, not in its place.

## For the owner

- **Stage 0's shape:** the solve as the body's one driver from day one (cleaner, a bigger first
  step), or beside the old skills through stage 2 (safer, temporary duplication). This plan takes
  the second.
- **Balance's fiction**, once a momentum store is tried: a gyroscope, a flywheel that saturates,
  or nothing said.
- **Whether a learned behaviour is acceptable in the core**, as weights in an asset.

## Out of scope

- The Crypt party's movement (party control is not a priority).
- Strike recipes on the capsule hands, except where a stage's gate needs a blow.
