# The run's body

The body's numbers set to what gives a run like a person's, 3-4 m/s (`owner-run-body`,
`src/core/sources.ts`): the foot's friction, the legs' muscle factors and the thighs' room, and the
run they give.

## The foot's friction

`FOOT_FRICTION` (`src/core/human/segments.ts`): 0.8. A contact a foot is in takes the greater of its
coefficient and the other collider's (`ContactMaterial.friction`); every other contact keeps the
engine's 0.5 (`CONTACT_FRICTION`).

At 0.5 the pushing sole slips late in stance, and a run tracking a person's cycle
(`src/core/skills/locomotion/cycle-run.ts` with earlier settings; Node stand, Rapier, 120 Hz, the Warrior asked
3 to 4 m/s) levels off near 2.9 m/s whatever it is asked. With every contact at 0.7, 0.9 or 1.2 it
reaches 3.5 to 3.9 m/s, and with the feet alone at 0.8 as fast.

## The legs' muscles

| Number | Factor | On |
| --- | --- | --- |
| `HIP_IN_USE` (`src/core/human/muscle.ts`) | 2.49 | each of the hip's six exertions' peak torque |
| `KNEE_IN_USE` | 1.58 | the knee's extension and flexion |
| `anklePlantarflexion` in `IN_USE` | 2.75 | the ankle's plantar flexion |
| `LEG_SPEED_IN_USE` (`src/core/human/speed.ts`) | 1.98 | the unloaded speed of the hip's, knee's, ankle's and foot's exertions |

Each is the best candidate's, rounded, of a CMA-ES search over the four factors and the run's
settings together (Node stand, Rapier, 120 Hz; the Warrior, the Rogue and the skeleton each asked
3, 3.5 and 4 m/s for 25 s, credited the speed made up to 0.2 past the pace asked). The calf's factor
is near the 2.5 a runner's calf gives over a supine dynamometer's peak (Kulmala 2016). The run's
settings are searched on these numbers by `research/run-cycle-search.mjs` (`runCycle`).

## The thighs' room

`STRIDE_ROOM` (`src/core/human/segments.ts`): 30 mm. A thigh's capsule is no wider than half the
distance between the hip joint centres less half of it (`owner-stride-room`): legs hanging straight,
the two leave that much between them. The thighs share no joint, so they collide at full stiffness,
and in a walk the knees come nearer than the hips as one leg swings past the other.

Each body walking forward asked 1.2 m/s on the whole-body solve, in the guard under its character's
balance, 8 s from the order, empty-handed (Node stand, Rapier, 120 Hz): the steps in which the
thighs touched, the impulse they passed (N s), and the mean pace over the 8 s. "None" is each body's
thighs without the rule: the Warrior's at Dempster's density leave 31 mm, the Rogue's 12, and the
skeleton's are held to 4 (`skeleton-limbs-clear`).

| Room | Warrior: radius, steps, impulse, pace | Rogue | skeleton |
| --- | --- | --- | --- |
| None | 0.095 m, 3, 10, 0.95 | 0.088 m, 73, 263, 0.84 | 0.088 m, 241, 1569, 0.82 |
| 20 mm | 0.095 m, 3, 10, 0.95 | 0.084 m, 87, 502, falls | 0.080 m, 20, 42, 0.93 |
| 30 mm | 0.095 m, 3, 10, 0.95 | 0.079 m, 1, 4, 0.85 | 0.075 m, 1, 6, 0.94 |
| 40 mm | 0.091 m, 0, 0, 0.93 | 0.074 m, 0, 0, 0.85 | 0.070 m, 0, 0, 0.95 |

Holding the club the rows are alike (the Rogue at 20 mm stands, 40 steps). At 30 mm each body's
thighs touch in at most 5 of the 960 steps, at no more than 17 N s over the walk, and the Warrior's
keep their own width; at 40 mm the Warrior's must narrow too, and grow denser to keep their mass.
The skeleton's other self-contacts, some 700 steps and 120 N s, are not its thighs'.

## The run on it

`RUN_CYCLE`, empty-handed in the guard, set off from a stand and asked a pace for 22 s, calm and on
four seeds of the Lab's 5 N gusts the search never saw (`research/run-cycle-search.mjs --score
--speeds 1.4,2,3,4,5 --winds 1:5:5,6,7,8 --seconds 22 --windows`: Node stand, Rapier, 120 Hz, balance
0 %, haste 0 %). The speed made along the heading from when it first passes 0.7 m/s to the end,
least to most of the five trials:

| Asked, m/s | Warrior | Rogue | skeleton |
| --- | --- | --- | --- |
| 2 | 1.90 to 1.91 | 1.85 to 1.87 | 1.95 to 1.98 |
| 3 | 2.48 to 2.59 | 2.40 to 2.47 | 2.63 to 2.67 |
| 4 | 2.83 to 2.92 | 2.58 to 2.73, one falls | 3.01 to 3.04 |
| 5 | 2.83 to 2.92 | 2.58 to 2.73, one falls | 3.01 to 3.04, one falls |

Asked 4 or 5, each body comes to one pace, held over the last 6 s at 3.38 m/s (the Warrior), 3.15
(the Rogue) and 3.47 (the skeleton): the run's pace goes no more than `ahead` past the body's own,
and there the cycle's stride makes no more speed. Holding the club more fall: of 25 straight runs
each, the Warrior 1, the Rogue 10, the skeleton 5, against 0, 2 and 1 empty-handed.
