# The learned punch

**The toed Warrior's learned punch lands 83 % of 640 held-out trials, still or walking in, at
120 and 480 Hz alike, short of the 90 % asked; on the baseline's punch rung, 26 of 32 still on the
middle mark and 52 of 64 from a walk, at 120 Hz.** It is a timed straight punch steered by a
network that pushes the trunk and the arm and asks the legs goal for the hip's turn and the
weight's shift, trained on the toed Warrior from still and walking starts, its legs' unmet asks
weighed (`assets/core/straight-punch.json`, 55.0 M decisions;
[trained on its unmet asks](#trained-on-its-unmet-asks)).

- **Against the network before it** (its legs' outputs pushes, trained on flat feet), on the toed
  Warrior: the walk rung 47 of 64 against 31, the still rung 30 of 32 against 26; held out at
  480 Hz, still 37 of 45 against 30 and from a walk 21 of 35 against 1
  ([the one punch](#the-one-punch)). None fell.
- **On the Strike drill's still rung** the high mark is refused, since it aims at the middle only.
- **On the fight rung** the network before it landed 3 of 56 middle-mark moments; of the 23 blows
  that met the foe past its arms, 3 met the bar, and 9 moments never came into its window.
- **The body is not the limit.** With the arms and trunk at 2.5 times the curves read
  ([the punch's body](punch-body.md)), the punch's bar is reachable; at the curves read no straight
  punch reaches it ([a timed punch on the drill](#a-timed-punch-on-the-drill)).
- **A blow's worth is the arm behind it**: a fist meeting the target with the elbow straight meets
  about 6 kg, 20° short about 1.4 kg, 50° short a few hundred grams
  ([what a blow is worth](#what-a-blow-is-worth)).

Harness throughout: Node, the core's world on Rapier. Right is the guard's rear hand, left its
lead. Speeds are over the fist's last 0.1 m. The bar is `BAR` (`src/evaluation/strike/read.ts`);
the [Punch](../plans/2026-10-28-punch.md#the-bar) plan states it.

## What is used

- **The punch**: the straight punch (`straightPunch`, `src/core/skills/straight-punch.ts`) on a
  schedule (`StraightPunch.timed`: the trunk's, both legs' and the striking arm's 18 channels, each
  a level, a start and a length), its drive braked onto its goals (`brake`), a walk halted as it
  commits (`halts`), steered (`src/core/skills/learned-punch.ts`): the toed Warrior's record
  (`PunchRecord`, `assets/core/straight-punch.json`).
- **The steer**: 60 times a second (`PUNCH_DECIDE`) a ReLU network, 59-256-256-12, reads the
  drive's age, the target from the shoulder, the fist from the target, the fist's and the centre of
  mass's velocity, whether the hand touches, the trunk's, legs' and arm's angles and speeds, and
  the gait's phase: which feet bear and whether the stance shifts or swings (`punchFeatures`). It
  adds a level to the pushes of the trunk's turn and lean and the punching arm's four channels
  (`steerPushes`), asks the legs goal for a heading turned up to 0.5 rad and a centre moved up to
  0.15 m ahead and across on the Warrior's leg (`stanceAsks`), and keeps a walk under way or halts
  it (`keepsWalk`; the shipped network's weights for the gait's phase and the walk are zero, so it
  halts as `halts` does). Inputs and
  outputs are named in its layout file (`assets/core/learned-punch.layout.json`, `PUNCH_LAYOUT`).
  The left hand's are the right's mirrored (`punchChannels`).
- **The window**: admitted 0.89 to 1.01 m from the target, within 0.17 m (`aside`) of the line the
  striking shoulder faces along at contact (`squared`), no higher than 0.1 m over the shoulder
  (`above`); the aim is the trunk's surface square to that shoulder (`square`,
  [combat strikes](combat-strikes.md)). A drive that has met nothing ends after 0.3 s (`longest`).
- **Its bodies**: the toed Warrior only (`workshop-fighter+toes`, `PUNCH_BODIES`,
  `assets/core/straight-punch.meta.json`): any other body throws no straight punch.
- **How it was made**: PPO (`research/run-train.py` on
  `research/punch-learning-environment.mjs@5d782f0e`, whose episodes the case environment on
  `research/environments/punch.json` plays to the bit)
  from the schedule `research/punch-drill.mjs` searched, on the Warrior's two hands at 120 and
  480 Hz, the target up to 0.15 m across the body and 0.3 m to the hand's side; each episode a
  trial loaded at the drive's first step. 44.4 M decisions on the flat-footed Warrior's still rung
  with its legs' outputs as pushes, the last 4.1 M scored by each of the bar's margins to its best;
  then its outputs reshaped to the legs goal's asks (`research/punch-reshape.py@f59b8a75`: the
  trunk's and arm's kept, the asks starting at zero) and 6.5 M more on the toed Warrior
  (`research/runs/option-punch`), its places the still rung's 0.6 to 1.3 m and walks in from 1.6
  to 3 m, halting the walk as it commits from 45.8 M. The checkpoint is the run's best on the
  drill's still and walk rungs of the 21 from 46.0 M on (the last; the others 25 to 31 of 32 and
  33 to 41 of 64). Exported by `research/punch-export.mjs`.
- **Its drill subject**: `research/learned-puncher.json`, the Puncher with the learned punch as its
  strike, on the toed Warrior (`character`). On the drill it plays Option Mind's bouts to the bit.

## Measurement

### Trained on its unmet asks

The network at 50.9 M decisions trained on to 55.0 M (`research/runs/option-punch-gait`, kept
outside Git) with the legs' unmet asks weighed, -1 a field a second, and 480 Hz drawn two times in
three (`research/environments/punch.json`). Its checkpoints read held out every 0.5 M (seed 4001,
160 trials a rate) rose from 122 and 114 at 120 and 480 Hz to 131 and 136; the best two were read
again on a fresh seed, and the one at 55,005,184 decisions kept (the other, at 54,546,432, landed
535 against its 534).

Held out: `research/punch-policy-check.mjs`, seed 5001, 320 trials a rate drawn as training draws
them, Node, the core's world on Rapier, the toed Warrior, both hands; landed of trials.

| Start, hand | 120 Hz before | 120 Hz now | 480 Hz before | 480 Hz now |
|---|---|---|---|---|
| still, left | 61/70 | 65/70 | 55/70 | 63/70 |
| still, right | 84/89 | 78/89 | 68/89 | 80/89 |
| walking in, left | 49/79 | 65/79 | 55/79 | 63/79 |
| walking in, right | 44/82 | 57/82 | 57/82 | 63/82 |
| all | 238/320 | 265/320 | 235/320 | 269/320 |

None fell. Short of 90 % in five of the eight cells: walking in, the right hand at 120 Hz (70 %)
the furthest; the right hand still at 120 Hz lost 6 trials.

On the baseline's punch rung (Option Mind, `option`, Node, the bout world on Rapier, 120 Hz), paired
over 128 trials with the network before (`2026-10-29-3e6e204c-1be9aa1c` against
`2026-10-29-c5c4bbb0-9edf70eb`): landed 0.578 to 0.609 (difference 0.031, 95 % from -0.031 to
0.094), admitted 0.750 both, none fell. Still, 28 to 26 of 64 (the high mark refused, 32 of them);
from a walk, 46 to 52 of 64.

### The one punch

Paired with the network before it (`assets/core/learned-punch.json@f59b8a75`: its legs' 10
outputs pushes, trained on flat feet, the toed Warrior's settings the flat one's) on the toed
Warrior. The drill: Node, the bout world on Rapier, 120 Hz, the middle mark, both hands, Option Mind
(`option/strike`) and the learned puncher alike. Held out: `research/punch-policy-check.mjs`,
seed 1001, 80 trials drawn as training draws them, each at 120 and 480 Hz.

| Reading | Before | Now |
|---|---|---|
| drill, still rung (0.6 to 1.3 m) | 26/32 | 30/32 |
| drill, walk rung (1.6 to 3 m) | 31/64 | 47/64 |
| held out, still, 120 Hz | 42/45 | 38/45 |
| held out, still, 480 Hz | 30/45 | 37/45 |
| held out, walking in, 120 Hz | 0/35 | 23/35 |
| held out, walking in, 480 Hz | 1/35 | 21/35 |

None fell. The drill's walk rung's misses are weak, none missed. Records
`2026-10-28-1754938b-593e2ab7` (still,
`?play=ratings&evaluation=strike&pool=72c48f7f&subject=option/strike&version=825089e6846a22c1`) and
`2026-10-28-1754938b-7bea47b4` (walk,
`?play=ratings&evaluation=strike&pool=6ceb4f94&subject=option/strike&version=94422b9c03f183cb`). In
the walk rung's worst trial (the left hand, 2.8 m, walking) the striker walks in at about 0.75 m/s
and throws without stopping 0.9 m off; the fist meets the target between its raised hands, 0.59 kg,
and the striker stays up. Held out at 120 Hz, still, the
two part on 8 trials, 6 the network before's: 3 of those are refused 1.25 to 1.28 m off, the
window's far edge, and 3 weak at 6.5 to 7.7 m/s.

The sections below read the network before it on the flat-footed Warrior (at `35b6998e`),
except where they say.

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

Played as the Strike drill plays a trial (Node, the bout world on Rapier, 120 Hz; the Warrior,
`research/learned-puncher.json`, the middle mark, both hands).

**Without its leg pushes** (a variant made for the reading and not kept, at `8bb48c30`: gaps 0.6 to
1.3 m by 0.1, across 0, 0.1, 0.2 and 0.3 m): the schedule's pushes on the hips, knees and ankles left
off.

| Punch | Landed |
|---|---|
| as it is | 56/64 |
| its leg pushes left off | 56/64, every trial the same to the bit |
| its leg and trunk pushes left off | 0/64: 52 missed |

While the legs bear, the bearing solve gives every channel of a bearing leg its own torque, over a
push (`solveBody`, `src/core/control/solve.ts`), so the leg pushes and the steer's leg outputs move
nothing; the trunk's and the arm's carry the punch.

**From a walk** (the drill's `walk` rung, record `2026-10-28-17581557-b5a333fa`: gaps 1.6 to
3.0 m by 0.2, across 0 and 0.2 m): the striker walks into the window and asks once settled in its
middle, or the first step its readiness says ready, still walking, at a median 0.27 m/s, 18 of 32
on one foot. From ready is from the first step its readiness said ready to the mark.

| Start | Landed | Weak | Fist speed, median | Mass met, median | From ready, median |
|---|---|---|---|---|---|
| walked in, settled | 21/32 | 11 | 7.19 m/s | 3.83 kg | 1.75 s |
| still walking | 0/32 | 30 (2 missed) | 8.05 m/s | 1.11 kg | 0.35 s |

Thrown from a walk the fist is fast and meets half the bar's mass (2.12 and 2.34 kg): the body is
not behind it. Settling first costs 1.4 s. Walking on to where the walk was going while the punch
is thrown plays as stopping (a variant at `8bb48c30`: 24 of 32 trials the same), since the walk
has all but ended at the window. None fell.

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
(`research/punch-in-bout.mjs@f327dd9e`). Bare-handed, 120 Hz, on gaps the search never saw:

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

### The trainer's speed

**What it trains on, 420 decisions a second with the trainer's update**: `research/run-train.py`
(PPO, its defaults: 256 decisions an environment a rollout) on `research/environments/punch.json`
through the case environment (both hands, 120 and 480 Hz, the still places and the walks in, a pool
of 4 starts refreshed every 16 episodes), 8 workers of 4 environments: 65,536 decisions every 2.6
minutes, steady over 196,608, so 5 M decisions take about 3.3 hours. The server alone
(`research/learning-speed.mjs`, random steers, 30 s) makes 426 a second on 8 workers of 4 and 80
on one, so the update costs under 2 %. Node 24.19, Rapier, the development host (16 cores) quiet,
at 4587ce42. A 480 Hz trial steps four times as often for each decision, and a walk in is played
while the trainer waits on the slowest environment, so it is half the speed of the cheaper
defaults below.

The punch's own environment (`research/punch-learning-environment.mjs@5d782f0e`) on the
toed Warrior with its own defaults (`punchEnvironment`, `{"kind":"punch","character":{"toes":true}}`:
the still rung's 0.9 to 1 m, the right hand, 120 Hz), random steers, 30 s a reading; Node 24.19, Rapier, 120 Hz, the development host
(16 cores). Decisions a second, before and after the opening search's hull entry was written in
numbers (`hullEntry`, `src/core/mind/hull-entry.ts`; the facing plane in `openingSelector`):

| Workers | Environments each | Before | After |
|---:|---:|---:|---:|
| 1 | 1 | 133 | 196 |
| 8 | 1 | 513 | 649 |
| 16 | 1 | 568 | 725 |
| 8 | 4 | 635 | 897 |
| 16 | 2 | 590 | - |
| 16 | 4 | 684 | 758 |
| 28 | 2 | 434 | - |

- **The step is the cost.** Under V8's CPU profiler, one environment on one thread with no server:
  the world's step 85 % of the time, Rapier's wasm 23 %. Before the cut, the straight punch's
  surface aim (`aims.ts`) searched the target's openings each control step, 25 % of the time, the
  hull entry alone 13 %; after it, about 3 %. One thread went from 139 decisions a second to 210.
- **The cut is exact**: every fingerprint case's pose is unchanged, and a bout's step
  (`research/step-time.mjs`) is within its noise ([what a step costs](step-cost.md#a-bouts-step)).
- **Threads share the machine poorly**: eight lone environments in eight processes make about
  100 a second each against 139 alone, 28 % lost to contention, so 16 workers make less than twice
  what 8 do, and 28 make less than 16.
- **The lockstep waits on the slowest**: every message waits for its slowest environment (the
  median 13.6 ms at 8 workers before the cut), so several environments a worker even out the wait;
  8 workers of 4 each are the fastest read.
- **The other kinds** (`case-learning-environment.mjs`, one thread, the bare entrant under random
  pulls): the gait's (`environments/gait.json`) about 450 to 520 decisions a second once built, an
  episode over as the body falls at about 1 s; the bout's (`environments/bout.json`) about 300,
  the Duellist striking no fallen body, so each bout a draw at its cap.

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
- **Its legs' outputs as pushes** (the 18-output layout, `assets/core/learned-punch.json@f59b8a75`):
  while the legs bear, a push on a bearing leg moves nothing
  ([without its leg pushes](#without-its-leg-pushes-and-from-a-walk)), and from a walk it lands 0
  or 1 of 35 held out ([the one punch](#the-one-punch)).
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
