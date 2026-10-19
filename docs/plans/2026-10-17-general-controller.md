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

Three layers with fixed interfaces. Within this stack a layer reaches the one under it and nothing
else. The stack is not the only way to drive a body: the boundary every mind keeps is the checked
actuation boundary (`2026-10-18-ai-experiments.md`), and a mind may drive its muscles without it.

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

The options fighter (`src/core/mind/options/`) is the stack's first client: an option asks a
behaviour for what it wants. Another mind may use the stack or drive its body by other means.

### Loadouts

An item is mass and inertia in the model, carried by the solve without a word. What the item
wants, the blade up, the shield's face toward the threat, the club's guard, is one task per item
kind on the hand that holds it. Two hands are two tasks in the same solve. N items are N tasks.

## Where things stand

Every figure is Node stand, Rapier, 120 Hz, balance 0 % and haste 0 unless it says otherwise. The
sweeps behind them are in `docs/reference/stance-tuning.md`; the story of each change is in its
commit.

**Stage 0, the solve: done.** `src/core/control/solve.ts` is the only motor solve; the bearing
solve's option is gone. Its torque rows rank over the root's (`WEIGHT.torque`), and with the
ground short the root's turn is aimed at the rigid body's response to the wrench the ground
missed (`rigidTurn`). Under the assist reference's pulls (`tests/core-assist.test.mjs`) and the
stance test's shoves it did what the bearing solve did (the same recovery steps within one, the
dip within 1 cm). Standing, a body's step costs 0.21 ms (`tests/harness/garbage.mjs`'s pair) and
the whole motor control is about 10 % of a bout's step (`step-time.mjs --profile`), inside the
0.5 ms gate. `wholeBodyTracking` (`whole-body.ts`) is still in the tree as the experimental
tracker.

**Stage 1, standing and the shove: done.** Balance bounds the stance's step: it steps only once
its capture point is past the margin and what its assist holds (`assistReach`,
`STANCE_RECOVERY.assisted`; `stance-tuning.md#assisted`). On the shove battery (272 shoves to
90 N s) at balance 0 the Rogue holds 163 and the Warrior 238 (the bearing solve 142 and 237); at
25 % 240 and 272; the gait battery at 25 % loses no pace. `gaitAssist`
(`src/core/skills/gait-assist.ts`) is left to stage 3.

**Stage 2, walk, stop and turn: closed.** The stance's walk is capture-point stepping on a DCM
preview (`walkStep`, `transferStep`, `src/core/control/gait.ts`), each step planned at the pace
its leg can take from the measured capture point and re-aimed as it swings, and past its top it
hands over to the cycle run (`walk-run.ts`, Move's Braced and Run, its own `WALK_RUN_CYCLE`).
SIMBICON's walk and run stay selectable beside it. Against the gate:

- the stop battery (0.7, 1.0 and 1.2 m/s four ways, empty and club, calm and in a 1 m/s gust;
  `research/core-stance-sweep.mjs --batteries stop --gusts 1:5:5 --solve`) holds 96 of 96, where
  the bearing solve at the start of the stage fell 13;
- the five-way gait battery asked 0.7 to 1.8 m/s holds 50 of 50, and walks back asked 0.9 to
  1.3 m/s three ways, empty and club, calm and on gust seeds 5 to 7, hold 239 of 240;
- the Move bout's `todo` passes;
- forward the walk tops out near 1.2 m/s whatever is asked (asked 1.4,
  empty-handed in the guard: the Warrior 1.22, the Rogue 0.96, the skeleton 1.18); sideways and
  back it steps at its legs' own pace (back asked 1.2 m/s: the Warrior 0.90, the Rogue 0.75), as
  the owner decided;
- on the walk-run envelope (one walk a cell, 0.2 to 4.5 m/s), forward and forward-right, the
  Warrior holds every cell to 4.5 m/s, empty and with the club; empty, the Rogue holds 3.5 and
  3.5 and the skeleton 4 and 4, where SIMBICON's walk and run hold 1.2 to 1.7.

What it leaves unmet is the run's, and goes to stage 3's gate: the club's slow run. Asked 1.0 to
1.4 m/s with the club, the run drifts across its heading 0.46 to 0.57 m/s, to the Rogue's left
and the skeleton's right, as a proportional placement (Raibert's) leaves a load carried to one
side; so with the club the Rogue's forward envelope is 0.7 m/s (2.5 forward-right) and the
skeleton's 0.7 and 0.7, against SIMBICON's 1.2/1.7 and 1.4/1.7. The two fixes tried for it are
in the register. On the gait battery below the walk and run falls 41 of 300.

**The baseline stages 3 and 4 measure against.** The cycle run alone (`runCycle`,
`src/core/skills/cycle-run.ts`), on the gait battery (asked 1.4 to 5 m/s, three stops, two turns,
gust seeds 5 to 8, empty and club: 300 trials; `research/run-cycle-search.mjs --score`):

| | Trials fallen | Steady pace, Warrior / Rogue / skeleton (m/s) |
|---|---|---|
| Balance 0 | 19 of 300 | 3.50 / 2.65 / 2.98 |
| Balance 25 | 31 of 300 | 3.59 / 2.83 / 3.09 |
| Haste +50, Balance 25 (same run) | 15 of 300 | 3.68 / 2.99 / 3.21 |

Of the 31 at Balance 25, 30 are the Warrior falling at 3.3 s, before it is under way, in gust
seeds 6 and 8 in every cell (`--speeds 1.4 --winds 1:5:6 --holds empty --models workshop-fighter
--balance 25`); it stands at balance 0, and stood at 25 before `8d30a6d9` re-searched the run's
settings at balance 0. Haste +100 takes the Warrior to 3.74 m/s and fells it in 3 of 6 fast
trials. The Warrior's running step width is 0.31 m; acceleration from 1 to 3 m/s is about
0.3 m/s². The club's run falls 18 of 150. The walk's and the run's SIMBICON envelopes
(`assets/core/simbicon-envelope.json`, `simbicon-run-envelope.json`) are as measured on
`a42d7f2c`.

On the owner's 64-fall target (`node research/rising-bed.mjs --target --sub stand-up
--techniques step-up`, 30 s cap), step-up stands 47 of 64 (the Warrior 15 and 16 of 16, empty and
with the club, medians 14.2 and 15.8 s; the Rogue 9 and 7, median 25.2 s and the cap). None stands within 6 s; the route's floor is about
9 s. The frozen screen (`stand-up-acceptance-v2`) is pinned on these legs. Balance stands no more
and no faster (the Warrior 20 of 26 at 25 %, 14.8 s).

In bouts (`docs/reference/assist.md`), with no balance 80 of 99 bouts end by a fall; at 10 % 53;
at 25 % 19; above 25 % nothing changes, since the stance asks for no more.

**Stage 3, the run: open; its speed gates unmet.** Two runs stand beside the cycle run, both
experimental:

- *The run whose steps fly* (`run.ts`, locomotion kind `run`): a Raibert run on the stance, its
  bearing leg bouncing and letting go (`SwingGoal.flight`), its bearing foot rolling onto its toes
  as the body passes. It leaves the ground (0.4 to 0.67 m/s up at launch). Asked 3 m/s, the
  Warrior with a foot-placement gain of 0.05 comes up to 3.1 m/s and falls at 11.4 s; at higher
  speed its stance knee bends to 1 rad and its extensors saturate, and the body sinks a step at a
  time. Searched (`run-cycle-search.mjs --legs run`, the Warrior asked 3 and 4.5 m/s for 16 s, 40
  generations) it is credited 2.07 m/s. Bearing for less time the faster it goes, its step's time
  kept and its flight longer, did not help.
- *The walk and learned run* (`learned-run.ts`): the cycle run steered by a trained policy
  (`RUN_POLICIES["all-bodies"]`, `assets/core/learned-run.json`, which names its run). On the
  gait battery it falls 8 of 300, all with the club (the Rogue 7, the skeleton 1): the gate's 19
  and the club's 18 of 150 are met. The Warrior's top is 3.46 m/s and Haste +100 adds 0.14: the
  speed gates are not. Asked 6 m/s it holds 3.85 (Haste +100: 4.09, then a fall at 10 s); its
  policy slows the cycle (cadence a fifth of its range down) and asks no more pace than the
  cycle's own, so its steer's range does not cap it. On the walk-run envelope with the club
  (`core-stance-envelope.mjs --legs learned-run --walks`; a walk holds standing at 0.7 of the
  pace asked, `WENT`) it holds forward 4.5, 4 and 4.5 m/s, the Warrior, the Rogue and the
  skeleton, against SIMBICON's run's 4, 2 and 1.2: the club's envelope gate is met.

What caps the cycle run is its stride, about 1.2 m at 3.1 steps a second: asked 5 and 6 m/s run
the same. Its pace is capped at the ground speed plus `ahead`, and raising `ahead` fells it
(asked 5 with Haste +100: `ahead` 1.0, 1.65 m/s and a fall). Reaching 4.5 m/s needs the
momentum-planned run with flight the stage describes; the clip's stride cannot carry it.

**Stage 4, the stand-up: open; its time gate unmet.** The learned rise (`learned-rise.ts`) is
step-up steered by a trained policy (`RISE_POLICIES`, the Warrior's and the Rogue's,
`assets/core/learned-rise.json`): its stages' pace, their tolerances, the centre's place and
height, the pelvis's pitch and the posture, eased over 0.2 s. On the target it stands 57 of 64
(the Warrior 16 and 16, medians 11.4 and 11.6 s; the Rogue 10 and 15, 19.0 and 14.4 s): the 40
is met, the 9 s median is not. Step-up's own time is about 2.4 s of rolling, 7.6 s of its 25
stages and 2.5 s of steadying and handover, of which 1.3 to 1.8 s is the host's squaring step
(the feet end 0.2 to 0.26 m apart against the body's 0.39 m), so the route's floor stays near
9 s; the faster routes are closed by the body's stops (`docs/reference/postures.md`). Grit's
curriculum has no strong end on step-up: step-up commands activations tuned to the body's own
strength, and every muscle stronger overdrives it (unsteered, on the learned rise's twelve
Warrior falls, 12 stand at its strength, 1 at 1.25 times it, none at 1.5 or 2, steered to its
fastest pace or not). Grit as the plan has it, raised torque bounds, waits for a stand-up whose
commands are torques: the contact sequence on the solve, not built. The frozen screen takes a candidate as actions on the muscles or joint
targets from an observation; the learned rise steers step-up's recipe inside the game, so it
cannot enter without a new action kind, which changes the evaluator and is the owner's call.

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
  25 of 25 with and without it); paced nearer the legs' strength (`effort` 0.7: it caps higher
  forward and falls from 1.4 m/s asked, the Rogue, and 1.6, the Warrior); the double support at
  0.06 s (the walk back creeps past its cap and falls); the swing's path lifted by the larger of
  the drop the foot is asked and the one it has, and the pelvis's lean at the last landing taken
  from the hip's range (neither moved 240 walks back).
- **The club's slow run** (stage 2, on the walk and run). The sway's error integrated into the
  sole's placement removed the drift where it was seen but felled the gait battery (41 falls to
  88 and 132 at gains 0.2 and 0.5 a second, 0.1 m at most), and integrated a stride at a time it
  felled the Rogue's trials; the run's heading turned to bring its travel round to the way asked
  (the travel's error integrated, 1 a second, 0.6 rad at most) took the drift off too but fell
  more, 102 of 600 against 83 over gust seeds 5 to 12, mostly in turns.
- **The run's speed** (stage 3). The cycle run's `ahead` at 1.0 and 1.5 (falls); the flying
  run's foot-placement gains (falls); the learned run trained on to 11M decisions (95 of 300 fell,
  against 8 of 300 at 4.5M).
- **The learned rise's steer unsmoothed** (stage 4): a policy's exploration noise applied each
  decision broke step-up's stages (0 of 12 stood under full noise; 5 of 12 eased).
- **Balance's shape.** A force across the heading alone; the moment toward the run's settled
  lean (held every run under 2.4 m/s); the moment's pitch both ways (the Warrior brakes slower,
  7 of 12 stops fell); damping the pelvis's spin alone.

## Order of work

Each stage builds one skill on the general stack **beside the skill it would replace**: the
game offers several implementations of a skill, each selectable in the mind editor, so the owner
can watch and compare them in the Lab, Arena and Crypt. The general one becomes the default when
it is the better; none is deleted for being superseded. Only the default carries the gameplay
promises the owner keeps (`2026-10-18-testing-strategy.md`); the others stay runnable under the
software checks and are measured when they are compared.

| Stage | Build | Gate | Rough size |
|---|---|---|---|
| 0 | **The solve.** Merge the bearing solve and `wholeBodyTracking` into one production solve with muscle, assist and contact bounds and a posture task; the torque-source command path to the driver. | Standing under the assist reference's pulls (`tests/core-assist.test.mjs`) matches today's stance; ≤ 0.5 ms a body a step (`step-time.mjs`); the bout fingerprint moves only for bodies on the solve. | 2 to 3 weeks; the proof |
| 1 | **Standing and the shove** on capture-point stepping, Balance as the assist bound. | On the stance trials (`research/core-stance-trials.mjs`) no more falls than today's stance at 0 %, and at 25 % no pace lost on the gait battery. | 1 to 2 weeks |
| 2 | **Walk, stop and turn** on the same generator; SIMBICON's walk and run stay beside it. | Walk envelope at or above today's forward and forward-right, and sideways and back a walk that steps, at its own pace, without falls; stop battery 0 of 96; the Move bout's `todo` passes. | 2 weeks |
| 3 | **The run** with flight, the clip as the posture prior, beside the clip tracker. | Forward to 5 m/s (the owner's aim), the Warrior ≥ 4.5 m/s steady; Haste +100 adds ≥ 1 m/s; gait battery ≤ 19 of 300; the club's run ≤ 18 of 150, and its forward envelope at or above SIMBICON's (the slow run left from stage 2); the owner's eye on the look. | 2 weeks |
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
- A learned behaviour is acceptable in the core, its weights an asset: the AI experiments plan
  counts learned policies among the valid implementations.

## For the owner

- **Balance's fiction**, once a momentum store is tried: a gyroscope, a flywheel that saturates,
  or nothing said.

## Out of scope

- The Crypt party's movement (party control is not a priority).
- Strike recipes on the capsule hands, except where a stage's gate needs a blow.
