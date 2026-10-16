# The run's body

The numbers of the body set to what gives a run like a person's, 3-4 m/s (`owner-run-body`,
`src/core/sources.ts`).

## The foot's friction

`FOOT_FRICTION` (`src/core/human/segments.ts`): 0.8. A contact a foot is in takes the greater of
its coefficient and the other collider's (`ContactMaterial.friction`); every other contact keeps
the engine's 0.5 (`CONTACT_FRICTION`).

At 0.5 the pushing sole slips late in its stance, and a run that tracks a person's cycle
(`src/core/skills/cycle-run.ts`, an earlier version of its settings: Node stand, Rapier, 120 Hz,
the Warrior asked 3 to 4 m/s) levels off near 2.9 m/s whatever pace it is asked. With every
contact's coefficient raised to 0.7, 0.9 and 1.2, the same run goes on to 3.5 to 3.9 m/s. With the
feet alone at 0.8 it goes as fast as with every contact raised.

## The legs' muscles

| Number | Factor | On |
| --- | --- | --- |
| `HIP_IN_USE` (`src/core/human/muscle.ts`) | 2.49 | each of the hip's six exertions' peak torque |
| `KNEE_IN_USE` | 1.58 | the knee's extension and flexion |
| `anklePlantarflexion` in `IN_USE` | 2.75 | the ankle's plantar flexion |
| `LEG_SPEED_IN_USE` (`src/core/human/speed.ts`) | 1.98 | the unloaded speed of the hip's, knee's, ankle's and foot's exertions |

Each was searched together with the run's settings, by CMA-ES over the four factors and the run
(Node stand, Rapier, 120 Hz, measuring on; the Warrior, the Rogue and the skeleton each asked 3,
3.5 and 4 m/s for 25 s, credited the speed made up to 0.2 past the pace asked), and is the best
candidate's, rounded. The calf's factor is near the 2.5 a runner's calf gives over a supine
dynamometer's peak (Kulmala 2016). The search's harness was a research script outside the
repository; its run is now `runCycle`, searched on these numbers by
`research/run-cycle-search.mjs`.

## The run on it

With today's run (`RUN_CYCLE`), empty-handed in the guard, set off from a stand and asked a pace
for 22 s, calm and on four seeds of the Lab's 5 N gusts the search never saw
(`research/run-cycle-search.mjs --score --speeds 1.4,2,3,4,5 --winds 1:5:5,6,7,8 --seconds 22
--windows`: Node stand, Rapier, 120 Hz, balance 0 %, haste 100 %), the speed made along the
heading from when it first went 0.7 m/s to the end, setting off included, in the least to the most
of the five trials, a fall marked:

| Asked, m/s | Warrior | Rogue | skeleton |
| --- | --- | --- | --- |
| 2 | 1.90 to 1.91 | 1.85 to 1.87 | 1.95 to 1.98 |
| 3 | 2.48 to 2.59 | 2.40 to 2.47 | 2.63 to 2.67 |
| 4 | 2.83 to 2.92 | 2.58 to 2.73, one falls | 3.01 to 3.04 |
| 5 | 2.83 to 2.92 | 2.58 to 2.73, one falls | 3.01 to 3.04, one falls |

Asked 4 or 5, each body comes to the same pace, held over the trial's last 6 s at 3.38 m/s (the
Warrior), 3.15 (the Rogue) and 3.47 (the skeleton): the run's pace goes no more than `ahead` past
the body's own, and there the cycle's stride makes no more speed. Holding the club, more fall: of 25
straight runs each, the Warrior 1, the Rogue 10, the skeleton 5, against 0, 2 and 1 empty-handed.
