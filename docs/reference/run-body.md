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
(`research/run-cycle-search.mjs --score --winds 1:5:5,6,7,8`: Node stand, Rapier, 120 Hz), the
speed made along the heading from when it first went 0.7 m/s to the end, setting off included, in
the least to the most of the five trials, a fall marked:

| Asked, m/s | Warrior | Rogue | skeleton |
| --- | --- | --- | --- |
| 2 | 1.79 to 1.83 | 1.61 to 1.62 | 1.93 to 1.94, one falls |
| 3 | 2.65 to 2.67 | 2.42 to 2.44 | 2.68 to 2.70 |
| 4 | 3.16 to 3.19 | every one falls | 2.85 to 2.89 |

Holding the club, many more fall (`docs/roadmap.md`, the SIMBICON walk's run).
