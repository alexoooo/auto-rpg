# The learned punch

**The Warrior's learned punch lands 92 % of 320 held-out still trials, and 3 of 56 fight
moments.** It is a timed straight punch steered by a network, trained on the Strike drill's still
rung for the Warrior alone (`assets/core/learned-punch.json` at `35b6998e`, 44.4 M decisions).

- **Still, held out** (`research/punch-policy-check.mjs`, seed 5001): left hand 99 % and right 96 %
  at 120 Hz, left 89 % and right 86 % at 480 Hz; none fell. The failures are mostly the fist's
  mass, then the elbow's bend and its speed. The bar's 90 % holds at 120 Hz, not at 480 Hz.
- **On the Strike drill's still rung**: 30 of 32 at the middle mark, 2 weak; the high mark is
  refused, since it aims at the middle only.
- **On the fight rung**: 3 of the 56 middle-mark moments land. Of the 23 blows that meet the foe
  past its arms, 3 meet the bar; 9 moments never come into its window.
- **The body is not the limit.** With the arms and trunk at 2.5 times the curves read
  ([the punch's body](punch-body.md)), the punch's bar is reachable; at the curves read no straight
  punch reaches it ([a timed punch on the drill](#a-timed-punch-on-the-drill)).
- **A blow's worth is the arm behind it**: a fist meeting the target with the elbow straight meets
  about 6 kg, 20° short about 1.4 kg, 50° short a few hundred grams
  ([what a blow is worth](#what-a-blow-is-worth)).

Harness throughout: Node, the core's world on Rapier. Right is the guard's rear hand, left its
lead. Speeds are over the fist's last 0.1 m. The bar is `BAR` (`src/evaluation/strike/read.ts`);
the [Punch](../plans/2026-10-24-punch.md) plan states it.

## What is used

- **The punch**: the straight punch (`straightPunch`, `src/core/skills/straight-punch.ts`) on a
  schedule (`StraightPunch.timed`: the trunk's, both legs' and the striking arm's 18 channels, each
  a level, a start and a length), its drive braked onto its goals (`brake`), steered with `learned`
  (`src/core/skills/learned-punch.ts`).
- **The steer**: 60 times a second (`PUNCH_DECIDE`) a ReLU network, 55-256-256-18, reads the
  drive's age, the target from the shoulder, the fist from the target, the fist's and the centre of
  mass's velocity, whether the hand touches, and the steered channels' angles and speeds
  (`punchFeatures`). It adds a level to each of the 18 channels' pushes (`PUNCH_ACTIONS`): the
  trunk's turn and lean, both legs and the punching arm. The left hand's are the right's mirrored
  (`punchChannels`). A channel not being pushed stays with the posture or the stance.
- **The window**: admitted 0.89 to 1.01 m from the target, within 0.17 m (`aside`) of the line the
  striking shoulder faces along at contact (`squared`), no higher than 0.1 m over the shoulder
  (`above`); the aim is the trunk's surface square to that shoulder (`square`,
  [combat strikes](combat-strikes.md)). A drive that has met nothing ends after 0.3 s (`longest`).
- **Its bodies**: the Warrior only (`PUNCH_POLICY`, `assets/core/learned-punch.meta.json`).
- **How it was made**: PPO (`research/run-train.py` on `research/punch-learning-environment.mjs`)
  from the schedule `research/punch-drill.mjs` searched, on the Warrior's two hands at 120 and
  480 Hz, the target up to 0.15 m across the body and 0.3 m to the hand's side; each episode a
  still-rung trial loaded at the drive's first step, its last 4.1 M decisions scored by each of the
  bar's margins to its best. Exported by `research/punch-export.mjs`.
- **Its drill subject**: `research/learned-puncher.json`, the Puncher with the learned punch as its
  strike.

## Measurement

### Held out

`research/punch-policy-check.mjs`, seed 5001: 320 still places drawn as training draws them, on a
seed of their own, the Warrior, both hands; each played whole as the Strike drill plays a trial,
so a fall counts.

| Hand | 120 Hz landed | 480 Hz landed | Fell |
|---|---|---|---|
| left (lead) | 99 % | 89 % | 0 |
| right (rear) | 96 % | 86 % | 0 |

All told 92 %. A miss sits a hair under one test, most often the fist's mass, then the elbow's
bend and the speed.

### On the Strike drill

**Still rung** (record `2026-10-27-35b6998e-6c79723c`, 120 Hz; the Warrior): 30 of 32 at the
middle mark land; 2 are weak, 6.75 and 6.79 m/s, at 0.9 m and 0.2 m across. The high mark is
refused. Watched by the owner
(`?play=ratings&evaluation=strike&subject=learned-puncher&version=24ccf7106e3471ef`): "the punch
actually looks not bad". After contact the striker bows forward at the hips and comes back up.

**Fight rung** (record `2026-10-27-13684ff1-139f06a0`, pool `4145285b`, 120 Hz; the Warrior against
the rung's seven foes at `13684ff1`, moments 1 to 4, both hands;
`?play=ratings&evaluation=strike&pool=4145285b&subject=learned-puncher&version=c0e976aff6125d66`):

| Middle-mark moments | Count |
|---|---|
| landed | 3 |
| weak: short on the fist's mass 14, straightness 12, the elbow's bend 11 (a blow may miss several) | 20 |
| guarded: the fist on the foe's arms alone | 16 |
| outside: never in its 0.89 to 1.01 m window within its 2 s patience | 9 |
| missed | 6 |
| refused | 2 |
| fell | 0 |

The 56 high-mark moments are refused. The fighters stand guard to guard at about 0.6 m, nearer
than the window; in the reels the striker sometimes waits half a second before it throws.

On the fight's held-out moments (an earlier network, `33f70997`, 120 Hz):

- **The foe comes on.** At the first action against every foe the two close at about 1.4 m/s; the
  drive begins about 1 m apart, and 0.2 s in the fist meets the foe's forward hand or forearm.
- **The foe steps back.** Where it moves off at 0.25 to 0.55 m/s the fist chases the aim point and
  meets nothing; a drive that ran 0.5 s carried the body over, so a drive now ends at `longest`.
- **Near, the fist is on the foe as the drive begins**: at moments the tactics ask from 0.35 to
  0.5 m apart; where both close at 1.4 m/s the blow comes 0.4 s later on the thigh or the belly.

### Without its leg pushes, and from a walk

The Strike drill's still cases played whole (Node, the bout world on Rapier, 120 Hz; the Warrior,
`research/learned-puncher.json`, the middle mark, both hands; at `8bb48c30`), each with a variant
the drill does not have, made for the reading and not kept.

**Without its leg pushes** (gaps 0.6 to 1.3 m by 0.1, across 0, 0.1, 0.2 and 0.3 m): the schedule's
pushes on the hips, knees and ankles left off.

| Punch | Landed |
|---|---|
| as it is | 56/64 |
| its leg pushes left off | 56/64, every trial the same to the bit |
| its leg and trunk pushes left off | 0/64: 52 missed |

While the legs bear, the bearing solve gives every channel of a bearing leg its own torque, over a
push (`solveBody`, `src/core/control/solve.ts`), so the leg pushes and the steer's leg outputs move
nothing; the trunk's and the arm's carry the punch.

**From a walk** (gaps 1.6 to 3.0 m by 0.2, across 0 and 0.2 m): the drill's striker walks into the
window and asks once settled; the variant asks at the first step its readiness says ready, still
walking. Asked at a median 0.28 m/s, 27 of 32 with a foot in its swing and 5 in a weight shift.

| Start | Landed | Weak | Fist speed, median | Mass met, median |
|---|---|---|---|---|
| walked in, settled | 21/32 | 11 | 7.2 m/s | 3.9 kg |
| still walking | 0/32 | 30 (2 missed) | 8.1 m/s | 1.15 kg |

Thrown from a walk the fist is fast and meets half the bar's mass (2.12 and 2.34 kg): the body is
not behind it. Walking on to where the walk was going while the punch is thrown plays as stopping
(24 of 32 trials the same), since the walk has all but ended at the window. None fell.

### The landing band

**A punch at the bar lands over a few centimetres of range.** With the elbow within 30° of straight
the shoulder-to-fist length changes 2 cm (0.628 to 0.65 m on the Warrior), and the elbow's bend at
contact is a steep function of the shoulder's distance from the target: 2 cm nearer moves it about
0.27 rad. A schedule searched at 480 Hz across 0.92 to 0.96 m meets the target 0.76, 0.49, 0.39 and
0.18 rad short of straight at 0.90, 0.92, 0.94 and 0.96 m. Nearer, the elbow meets the target bent;
farther, the arm is straight before contact and the fist slows below the bar or meets the guard.

- **The steer widens it.** Read whole on 60 places training never drew (seed 1001): the schedule
  alone lands 8 at 120 Hz and 2 at 480; steered after 2 M decisions 35 and 9; after 1 M more with
  half its episodes at 480 Hz, 33 and 24. Past 0.98 m the fist does not reach at the bar steered or
  not.
- **The window changes the punches, not only which are thrown.** A place a little outside it
  waits until the target's sway brings the aim point in, 1.2 s instead of 0.5 s, and by then the
  target's guard has moved. Trained on the trials the window admits, the held-out rate went from
  69 % to 91 % (at `33f70997`).
- **A target across the body is struck from the wrong shoulder.** Off toward the other hand, the
  blow comes in outside the 20° cone. The still rung stands the target off toward the striking hand
  (`toward`), and the window is centred on the striking shoulder's line (`squared`): with the hips
  turned that shoulder is about 0.06 m across from the head and 0.22 m ahead of it.

### Why the two rates part

Read on the still rung (the Warrior's rear hand, `research/punch-drill.mjs --verify`):

- **`ease` is what the rates disagree on.** It sets each push's level from the error left, read
  once a control step; at 120 Hz the shoulder runs ahead and the fist reaches the target 2 cm
  sooner, the elbow 0.2 rad more bent. With `brake` in its place (flat out, then the posture's servo
  near the goal, solved within the step) the two rates' bends at contact agree to 0.1 rad at 0.93
  and 0.96 m.
- **The mass a fist meets is its holds'.** With every joint free it meets 0.45 to 2.6 kg, alike at
  both rates; the muscles' holds make it 0.9 to 9.2 kg at 120 Hz and 1.1 to 5.5 kg at 480,
  differently at the same gap. On the touch step the elbow is still opening at 35 to 63 rad/s,
  where its muscles' ceiling is 0.2 to 8 N m, so which step the touch falls on decides the hold.
- **At 480 Hz the elbow meets the target more bent**: blows that land at 120 Hz meet it 0.35 to
  0.45 rad short of straight, and at 480 Hz the same places 0.4 to 0.8 rad, where the fist meets 0.7
  to 2.3 kg instead of 3 to 7.
- **A schedule runs on fractions of a step**: a push covers its share of a step, so 120 and 480 Hz
  play the same schedule.

### The body's ceiling

`research/punch-ceiling.mjs` lays flat-out pushes on 18 channels of the guard (the trunk's four,
each hip's three, each knee and ankle, the striking shoulder's three and its elbow), each with a
level, a start and a length, searched by diagonal CMA-ES. A blow counts if the strike point reaches
the pad's face within 0.5 s and the body is up 0.3 s later; straight means its last 10 cm within
20° of the face's normal. A measuring stick, not a skill; each cell on several seeds, read at
480 Hz, at the curves read before the punch's body.

| Cell, at 480 Hz, m/s | Straight, the curves read | Straight, the elbow's rule | Any angle |
|---|---|---|---|
| Warrior, right, place | 9.57† | 9.27 | 11.07 |
| Warrior, right, full reach | 7.14 | 7.29 | 13.54† |
| Warrior, left, place | 7.36 | 8.80† | 10.97 |
| Rogue, right, place | 10.47 | 11.97 | 10.47 |
| Rogue, right, full reach | 7.06 | 7.55 | 8.51 |

† counts only at a lower rate. Each figure is a floor: seeds disagree by up to half.

**Every fast blow winds up first**: over 0.25 to 0.4 s the fist is drawn back or up while the
chest goes 13 to 20 cm forward and the pelvis back, then the elbow and shoulder throw the arm
straight in the last 0.05 to 0.1 s. The fastest any-angle blows are chops down across the face.
The trunk's and hip's unloaded speeds do not set the ceiling.

### What a blow is worth

`research/punch-objective.mjs` prices a fist on a Warrior's head in guard as the arena does: each
side meets what its body gives with its muscles holding (`ContactMass.yielding`; the head 7.0 to
7.8 kg), for the time their surfaces take (`contactGive`, about 10 ms); the fist takes 62 % of the
energy and pays it less its threshold (`Rulebook.fist`, 36.8 J). The exchange, head HP lost less
fist HP lost, peaks at 0.22 HP at a 59 J blow; a hand comes off at about 80 J.

**The fist's mass is the arm's alignment.** The Warrior's right arm, shoulder flexed 90°, pushed
along +z through the strike point, no gravity:

| Arm | Free, kg | Muscles held at peak, kg | J at 9.14 m/s | Head HP |
|---|---|---|---|---|
| straight, wrist on line | 6.15 | 15.9 | 207 | 0.78 |
| elbow 9° short of straight | 3.57 | 8.3 | 161 | 0.61 |
| elbow 20° short | 1.42 | 2.7 | 82 | 0.31 |
| straight, wrist 23° off | 1.08 to 1.44 | 2.2 to 2.7 | 70 to 82 | 0.27 to 0.31 |
| elbow 49° short | 0.40 | 0.67 | 26 | 0.10 |

Straight is the elbow's range end, -0.86 rad. A boxer's 2.9 kg at 9.14 m/s (Walilko, Viano and
Bir 2005) is the elbow about 20° short. How the muscles hold changes the fist's mass by under 10 %.

### A timed punch on the drill

`research/punch-drill.mjs` searches the straight punch's schedule by CMA, each candidate a trial
of the still rung (the Warrior's right hand, the middle mark) scored by the bar; the best read
again at 480 Hz.

**At the curves read no straight punch reaches the bar from the guard.** The best come 0.6 to
0.8 m/s short (6.01 and 6.24 m/s at 120 Hz, 5.61 and 5.90 at 480), and are no punch: the lumbar
spine bent to its range end (0.89 rad) carries the fist in, the elbow 82° short of straight at
contact.

**The elbow limits the fist's speed.** The fist gains its last speed as the elbow opens, at 13 to
17 rad/s, where its extensors give a sixth to a tenth of their isometric torque. Boxers' straight
punches open the elbow at 22 to 41 rad/s, 32.9 rad/s for professionals (Gait Posture 49S, 2016).
The model's elbow extension is Frey-Law's column on Thelen's curvature 0.25, unloaded at
25.5 rad/s. Frey-Law's points fix the curve near rest, not at its end; a flatter curve fits them as
well, with 1.5 to 3 times the torque at 15 to 20 rad/s:

| Curvature | Unloaded, rad/s | Fit, rms of the shares | N m at 10 rad/s | at 15 | at 20 |
|---|---|---|---|---|---|
| 0.05 | 94.8 | 0.030 | 15.2 | 10.7 | 8.0 |
| 0.1 | 51.5 | 0.032 | 14.5 | 9.6 | 6.6 |
| 0.1755, unloaded at the boxers' 32.9 rad/s | 32.9 | 0.035 | 13.4 | 8.0 | 4.6 |
| 0.25 (the model's) | 25.5 | 0.037 | 12.5 | 6.5 | 2.8 |

**What it took**: the arms, trunk and neck at 2.5 times the curves read
([the punch's body](punch-body.md)), and a bar that reads a punch's form: the fist's last 0.1 m
more along the arm than across it, the elbow within 30° of straight, the chest within 30° of
upright. Near a straight elbow the forearm opens mostly across the arm's line (at 30° short, three
quarters across), so a 20° cone along the arm failed every fast blow found.

### The Puncher's straight punch

`straightPunch` as the Puncher plays it walks to a stand-off, faces the target, drives the hips,
the chest's turn, the trunk's lean and every arm channel flat out at a contact pose its arm IK
solves each step, then returns to guard; its 15 settings were searched by CMA in Arena bouts
(`research/punch-in-bout.mjs`). Bare-handed, 120 Hz, on gaps the search never saw:

| Puncher | Foe | Bouts | HP given | HP taken | Thrown | Lost | Won |
|---|---|---|---|---|---|---|---|
| straight punch | standing in guard | 8 | 1.65 | 0.04 | 12.1 | 0 | 3 |
| straight punch | Classic | 16 | 0.82 | 0.27 | 10.3 | 1 | 3 |

Most damage lands on the chest, past the guard over the head. A wounding fist meets 0.9 to 1.5 kg
at 2.5 to 7 m/s, the elbow 0 to 1 rad, 0.03 to 0.09 s into the drive: it meets the chest before
the arm has opened. On the Strike drill's still rung (record `2026-10-24-43b15ceb`, before the
drill stepped in) it starts 0.6 to 0.7 m from the target, its guard hand meets the target's 0.06 s
into the drive, and the fist meets the target from rest, half open, at 1.4 to 4.4 m/s. The owner
watched it: too close, awkward, not landing.

## Tried and not kept

- **A layer on the tracked arm** (`drive`, on the planted cross, `research/punch-calibration.mjs`):
  0 of 32 landed on the Warrior at 120 and 480 Hz and 0 of 31 on the Rogue, against today's cross
  38 of 55 at 4.84 m/s. Every driven swing ended on the stroke's bearing-support rule, a foot's
  corners off flat 0.08 to 0.13 s after launch; with that rule bypassed, at most 10 of 35 land at
  4.2 to 5.3 m/s.
- **The greedy solve** (`research/greedy-punch.mjs`: the whole-body solve driving the fist along
  the line each step, no path, no set time): 3.2 to 4.6 m/s mean, 5.87 at best; the fist reaches
  5.4 m/s 0.08 s into the drive, then slows as the elbow straightens, and the trunk never turns
  early. The solve costs 2.2 to 2.8 ms a body a step
  ([whole-body spike](whole-body-spike.md)).
- **A faster elbow** (curvature 0.1, or unloaded at 32.9 rad/s, in a scratch worktree): the search
  finds an overhead chop, landed at 7.86 m/s at 120 Hz and weak at 480 Hz (6.19 m/s), the shoulder
  flexed to 2.17 rad and the fist coming down onto the chest.
- **The trunk's turn at twice and four times its torque**: no gain ([the punch's body](punch-body.md)).
- **A timed punch across places without a steer**: scored by the mean over 12 places 0 landed;
  each place's time scale, shift, aim and posture tuned, none off the reference's place; a distance
  trigger (`fire`) opens the arm earlier but meets lighter (0.8 kg at 0.91 m); the lean pushed at a
  goal instead of scheduled comes apart at every gap.
- **Holds** at no less than the activation's isometric strength, or decaying over 20 or 40 ms:
  every mass rises 1.1 to 3 times and the rates stay apart. The arm's push kept full within 3 to
  10 cm of the target: no change.
- **Both bodies and fight moments in training** (the fight rung's moments 1 to 8, half held out by
  a digest of each moment's condition; the target's velocity read): after 5.0 M decisions the
  Warrior's still 14 of 16 at 120 Hz and 7 of 16 at 480, the Rogue's 1 and 2 of 41, fights 0 of
  56 at either rate, 2 fell. The Rogue's schedules reach its straight arm only from 0.84 to
  0.88 m, at 1.2 to 1.9 kg; searched at 0.79 to 0.83 m or 0.88 to 0.92 m, none passes. Fight
  moments beside the Warrior's still places: still 80 %, fights 1 of 51 after 0.5 M decisions.
- **Before the drive**: a standing pivot to face the target (the right hand's held-out landing 46
  of 70, one fell); a sway of the trunk toward the target (41 of 70); 0.05 m more drive past the
  target (78 against 79 of 90); a slower approach (`pace` 0.3 m/s: no change).
- **The near edge trained harder**: half its places at 0.88 to 0.95 m did not move it within
  0.5 M decisions.
- **Aiming further ahead in a fight**: the target predicted 0.2 or 0.3 s ahead instead of 0.12 s
  moves 2 to 5 blows off the guard onto the trunk, all weak.
- **The high mark**: its point is 0.2 to 0.28 m over the shoulder; the best schedule searched for
  it (`punch-drill.mjs --mark high --near`) meets the head at 6.3 m/s coming down onto its crown,
  79° off the surface's normal and 84° off the arm's line: the guard covers the face, and the open
  lane over it is the top of the head, which a straight punch cannot meet square.
