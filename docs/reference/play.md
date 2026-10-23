# The rules the screens set

The numbers of the arena's bout and the crypt's run that decide who sees whom, whom each fights,
where each walks and how a level is laid out: the screens' own rules, not the core's. Each section
names its constants and where they live. Every value is **set**, chosen as the rule was written,
and kept as found for the owner to confirm, unless the section says the owner chose it or a
measurement backs it.

## The bout

`src/arena/duel.ts`. A recipe may give its own of either (`?gap=`, `&cap=` on the page).

- **The gap**: a level's default (`src/arena/levels.ts`), 4 m on the open stage and 6 m on the
  obstacle court. Both are beyond the 1.8 m a fighter attacks from (`ATTACK_METRES`,
  [human and strikes](human-and-strikes.md#attack-distance)), so each walks in before the first
  blow.
- `CAP_SECONDS`: a bout runs 120 s before the fuller bar decides it. With no balance a bout lasts
  14 s on average, and with a balance of 25 % 55 s ([assist](assist.md)), so the cap decides few
  bouts without balance and more with it.

## Sight

`src/dungeon/run.ts`, `src/core/command/`. Every sight line is `canSee`'s (`TeamLevel.sees`): a clear line on the map, no farther than
the distance given, read through an index of the cells where nothing need be read (`SightIndex`,
`src/dungeon/map.ts`), which changes no answer
([step-cost.md](step-cost.md#sight-read-through-an-index)).

- `SIGHT_METRES` (`src/core/command/independent.ts`): an enemy sees a party member within 14 m.
- `WAKE_METRES`: an enemy's body is built once a standing party member comes within 16 m of where
  it waits, 2 m beyond its sight, so that it is standing when it can first see; or once a body
  going somewhere comes within `LEVELS.company` of it, so that nothing stands where it is built
  ([Levels](#levels)). The 16 m is the rule the crypt had on an engine that is gone
  (`src/dungeon/run.ts@e029c1e7`), not measured on the core.
- `PARTY_SIGHT` (`src/core/command/party.ts`): a party member sees the enemy its order locks within 12 m, picks one for itself
  within 8 m, and keeps the one it fights while it is within 5 m and nothing ranks above it.

## Levels

`src/core/rules/levels.ts`, `src/dungeon/run.ts`. **A body with nothing to do and nobody near is
held; any other is at full in the fight and limp out of it** (`levelsOf`, `BodyLevel`). Held, its
segments are fixed where they are and nothing drives it; limp, the solver alone moves it.

- **Nothing to do**: in the fight, an enemy with no target, unalerted, within `HOME_METRES` of its
  home; out of the fight, a body that has lain `settle` seconds.
- **Somebody near**: a body going somewhere (in the fight, at full, not waiting) within `company`;
  or, for a body in the fight, a party member in the fight within `wake`. Once loose, the farther
  `clear` and `rest` keep it so. Two waiting enemies side by side are held together.
- **The dead**: only a walker is near one, so they lie loose while the party is about them, are
  fixed once it walks off, and are loose again when somebody walks near.

`LEVELS`, the crypt's distances:

| Field | Value | Why |
|---|---|---|
| `wake`, `rest` | 16 m, 18 m | `WAKE_METRES`, and 2 m beyond it |
| `company`, `clear` | 4 m, 5 m | set; the gap in each pair keeps a body on the line from being held and let go by turns |
| `settle` | 10 s | the longest fall that ends takes 9.05 s (below) |

`HOME_METRES`, 0.5 m: how near its home a waiting enemy stands. The distances other than `settle`
are the rule the crypt had on an engine that is gone (`src/dungeon/run.ts@e029c1e7`).

**There is no cap.** A level is read from the game alone, never from the machine, so a run is the
same on every machine; with more bodies near than a machine carries, it plays the same game slower
(`World.advance` drops the time it cannot take).

**How long a fall takes to end** (`node research/rest-probe.mjs`; Node, the core world, Rapier,
120 Hz). Each crypt model with the club, under the crypt's mind and an order to stand, stood 2 s,
then shoved at its root by its whole weight for a quarter second four ways and let go limp once
down, or let go limp standing. Seconds from going limp until its centre of mass stays under
0.05 m/s, and then its fastest segment; "moving" is still moving at 15 s:

| Model | Shoved ahead | Shoved behind | Shoved left | Shoved right | Let go standing |
|---|---:|---:|---:|---:|---:|
| crypt-skeleton | moving, moving | 1.74, 8.24 | 6.04, 7.14 | 0.82, 1.55 | 5.17, 5.52 |
| workshop-fighter | 9.05, moving | 4.27, 4.47 | 2.17, moving | 3.43, 13.56 | 1.55, 2.09 |
| workshop-rogue | 0.93, 1.18 | 1.02, 1.20 | 1.19, moving | 4.98, 9.99 | 1.38, 3.15 |

Not every limp body comes to rest: its joints have nothing passive in them (`limp` releases every
motor). The Warrior shoved ahead still moves a hand 2 to 3 cm a second at the end, and the skeleton
shoved ahead crawls, 25 cm a second, its potential energy rising 97 to 106 J in half a second while
a raised leg rocks on its limit. Holding the dead stops it once nobody is near.

## Bodies in the step

`src/dungeon/run.ts`. A run steps every body it has built, and a body costs a step what its
control and the solver take for it.

`node research/body-cost.mjs`: Node, the core world, Rapier, 120 Hz, one thread; skeletons with the
club 3 m apart, under an order to stand. Read standing; held (`Body.setLevel`); let go; felled by a
shove and still driven by a mind with no sub-minds; lying, under the game's sub-minds
(`RECIPE_FIGHTER`); limp; held where they lie; and rising under the staged riser (`stagedRise`,
`rising.md#stages`). A row is the mean of 600 steps; a step of 8.33 ms is real time with nothing
drawn.

| Bodies | State | A step, ms | The solver, ms | The rest, ms | A body, ms | Of real time, % |
|---|---|---:|---:|---:|---:|---:|
| 1 | standing, driven | 0.71 | 0.33 | 0.38 | 0.71 | 8 |
| 1 | standing, held | 0.05 | 0.05 | 0.00 | 0.05 | 1 |
| 1 | let go, driven | 0.61 | 0.29 | 0.33 | 0.61 | 7 |
| 1 | down, driven | 0.79 | 0.32 | 0.46 | 0.79 | 9 |
| 1 | down, lying | 0.37 | 0.28 | 0.08 | 0.37 | 4 |
| 1 | down, limp | 0.27 | 0.27 | 0.00 | 0.27 | 3 |
| 1 | down, held | 0.02 | 0.02 | 0.00 | 0.02 | 0 |
| 1 | down, rising | 0.43 | 0.30 | 0.13 | 0.43 | 5 |
| 8 | standing, driven | 4.32 | 1.97 | 2.35 | 0.54 | 52 |
| 8 | standing, held | 0.13 | 0.12 | 0.00 | 0.02 | 2 |
| 8 | let go, driven | 4.31 | 1.97 | 2.35 | 0.54 | 52 |
| 8 | down, driven | 5.91 | 2.36 | 3.55 | 0.74 | 71 |
| 8 | down, lying | 2.97 | 2.33 | 0.64 | 0.37 | 36 |
| 8 | down, limp | 2.26 | 2.26 | 0.00 | 0.28 | 27 |
| 8 | down, held | 0.13 | 0.13 | 0.00 | 0.02 | 2 |
| 8 | down, rising | 2.88 | 2.17 | 0.71 | 0.36 | 35 |

- **Standing** costs 0.54 ms a body, over half of it control; **held**, 0.02 ms; let go, it stands
  as before, its own mind going on.
- **Down and still driven** costs 0.74 ms: its stance solves for a ground its soles cannot give.
  So a body out of the fight goes limp ([Levels](#levels)), its assist withdrawn and its muscles
  released at the next step.
- **Lying** costs 0.37 ms (the solver's 0.28, and 0.08 for its mind's look at it each step);
  **limp**, the solver's 0.28 alone; **rising**, 0.36 to 0.43 ms by what the riser is at. The
  Warrior reads as the skeleton does (`--model workshop-fighter --bodies 1`: standing 0.67 ms,
  rising 0.60).

**Over a run** (`node research/crypt-step.mjs --seeds 1,2,3,4 --seconds 180 --companions 3`):
the hero exploring a generated level with three Warriors following, 180 s or to the run's end.
The mean step over four seeds, on one machine:

| Rule | A step, ms |
|---|---|
| a body out of the fight still driven (`69549c6c`) | 4.50 to 5.63 |
| out of the fight limp | 3.69 to 4.33 |
| and an enemy at rest held, by the rule before the levels | 3.10 to 4.09 |
| the levels (`LEVELS`), the dead held as well | 3.32 to 3.53 |

A party of four costs 2.1 ms a step by itself. In these runs no body out of the fight is ever
held: the party falls where it fights, or the last one stands among the dead, 0.6 to 3.1 m from
them.

**What the blows' watch costs.** A blow is any two segments of two sides that touch
(`watchBlows`, `src/core/rules/blows.ts`), so the watch asks the engine for the contacts of every
segment that has a fighter of another side given after its own; the run gives its party first,
the fewer bodies. The watch refuses a pair it does not want before the engine reads it (`wanted`,
`PhysicsWorld.contactsOf`). Seed 4, two Warriors following, 120 s, Node, `contactsOf` timed by a
wrapper:

| The watch | The process | Bodies read a step | A read, µs | The reads, ms a step |
|---|---|---:|---:|---:|
| the party first, every pair read | any core | 48 | 5.3 | 0.25 |
| the enemies first, every pair read | any core | 109 | 5.3 | 0.58 |
| the party first, every pair read | three performance cores | 48 | 5.8 | 0.28 |
| the party first, unwanted pairs refused | three performance cores | 48 | 1.6 | 0.08 |

Reading every segment rather than the hands alone costs a step 1 to 5 % with the hero alone and
4 to 8 % with two following (0.02 to 0.26 ms; `80b2f84e` against `cac25ccc`).

### Tried and not kept

- **Disposing a held body and driving it afresh** (the rule before the levels, `bf88bd38`): one
  body standing 0.69 ms, held 0.04, let go 0.61; eight 4.27, 0.12 and 4.26. A level costs what the
  disposal did, and the runs above read the same at both.

## Hearing in the step

`src/dungeon/hearing.ts`. A page hears every body its run has built (`hearRun`): one watch of
touches over all their segments, beside the run's own watch of blows, and each body's air.
**Hearing costs 8.3 to 10.5 % of a step, 9 % over four runs.**

Harness: Node, a crypt run with no visuals, the core world, Rapier, 120 Hz; the hero with three
Warriors following, 120 s. A seed is played twice in one process, unheard and heard, a step of each
by turns, and the script refuses a pair that ends as two runs. Heard is as a page hears it, with
the air asked every step. The process is held to three performance cores of the development host
(an i7-13700H) at high priority: left to the scheduler it is moved onto the efficiency cores for
seconds at a time, the step reads 12 to 23 ms, and the share is lost in it.

```powershell
cmd /c "start /b /wait /high /affinity 54 node research/crypt-step.mjs --seeds 1,2,3,4 --seconds 120 --companions 3 --listen"
```

| Seed | Bodies built | Out of the fight | A step, ms | Heard, ms | Hearing, % |
|---|---:|---:|---:|---:|---:|
| 1 | 8 | 2 | 4.34 | 4.72 | 8.6 |
| 2 | 7 | 2 | 4.73 | 5.17 | 9.4 |
| 3 | 8 | 2 | 6.04 | 6.54 | 8.3 |
| 4 | 8 | 5 | 4.60 | 5.09 | 10.5 |

A second reading gave 9.0, 9.4, 7.7 and 10.7 %. Nearly all of it is asking the engine what is near
each segment: in a profile of seed 4 (Node `--cpu-prof`) the three watches of touches take 6.9 % of
the time, 5.4 of it the engine's reader (`contactsOf`, `src/core/engine/rapier.ts`) and 4.5 of that
Rapier's own list of what is near a shape; asking every body's air takes 0.3. Of 640 pairs near a
step's 110 segments (seed 1), 563 lie between a body's own neighbouring segments, which no watch
wants and the reader refuses before reading. Reading only contacts as they start would take the
rest; it is not built ([roadmap](../roadmap.md)).

## Targets

`src/core/command/party.ts`, for a hero whose facing the cursor steers.

- `AIM_COSINE`: the hero picks targets from a cone about the cursor's direction whose half-angle
  has a cosine of 0.3: 73 degrees.
- `SET_UPON`: it also takes on any enemy within 2.5 m wherever it stands, and keeps it out to
  3.5 m, so that one circling at 2.5 m is not swapped at every look.

The rule was written against a hero facing the cursor while an enemy behind it struck it, on a body
and engine that are gone (`src/dungeon/run.ts@c4c71cb8`); it is not measured on the core.

## Following

The party's Commander (`src/core/command/party.ts`) chooses movement objectives; the selected Mind's navigation role owns paths,
braking, arrival and progress against the world's solid geometry.

- `cryptModel.radius`: the humanoid's 0.35 m footprint, for placement, formation slots and the
  map's door selection. Navigation reads clearance from the actual body and its loadout.
- `TRAIL_METRES`: a companion with no post asks for a range of 2 to 2.5 m about the hero, clear of
  the 1.8 m the hero attacks from.
- `SLOTS`: several members sent to one floor point, or along one drawn route, take slots about
  its end, no two within 1.3 m: the point, then eight bearings on a ring of 1.4 m, then of 2.8 m.
  They go no faster than the slowest of them still on the way, at its gait's top speed (`travelSpeed`).
- `CROWDED`: one of them that has come no 0.1 m nearer its slot for 3 s, within 2.5 m of it and
  of a companion already standing, stands where it is: two slots 1.3 m apart are narrower than the
  room a walker keeps from another body, so a slot behind one stood in is reached only round it.
- A blocked destination across an openable door first asks for a point 2 m from the door on its
  near side, inside the world's 2.5 m reach for opening; opening refreshes the granted collision
  snapshot and resumes the original objective.

## Run timing

- `RUN_TIMING.perceive` (`src/dungeon/run.ts`): who sees whom is read every 0.2 s, and at once
  after a party member's plan is reset.
- `ALERT_SECONDS` (`src/core/command/independent.ts`): an enemy goes on to where it last saw the
  party for 7 s after losing sight of it, then goes home.

## Arrival

`ARRIVAL` (`src/core/command/goals.ts`), how near counts as there, m, and `EXIT_METRES`
(`src/dungeon/run.ts`):

| Field | Value |
|---|---|
| `point` | a point of an order, or where an enemy is going, 0.4 |
| `post` | a companion's post, 0.6 |
| `explored` | the hero's goal while it explores, 0.5 |
| `lastSeen` | where a locked target was last seen, 0.5 |
| `EXIT_METRES` | the run is won within 1.1 of the exit |

## Companions

`COMPANION_SPAWN` (`src/dungeon/party-placement.ts`): a companion starts on the first of twelve
bearings, from -z of the start round, on a ring of 1.6 m about it, then 2.4 m, then 3.2 m, where
0.7 m of floor is clear about it and along the line from the start, and nobody already placed is
within 1.4 m.

## The crypt

`CRYPT_LAYOUT` (`src/dungeon/crypt-dungeon.ts`), the Random Crypt's layout
([the crypt's art](../art/crypt.md#random-crypt)), in cells of 1 m.

| Field | Value |
|---|---|
| `size` | the map is 44 cells a side |
| `first`, `pitch` | four rooms, two by two: the first's centre is 12 cells from the map's corner, and a neighbour's 20 cells on |
| `half` | half a room's side is 5 cells and a draw of 0, 1 or 2 more (one of 3), along x and along z; a chapel's is 5 along x and 7 along z |
| `cornerCut` | a rootbound room keeps as rock the cells fewer than 2 steps from a corner |
| `corridorHalf` | a corridor is 1 cell wide either side of its middle line: 3 cells |
| `variants` | a kind of room has 3 arrangements ([look](look.md#crypt-rooms)) |
| `spawns` | 2 enemies in each room but the entrance |
| `spawnFromStart`, `spawnFromDoor`, `spawnSpacing` | an enemy starts more than 15 m from the party's start, 3 m from every door and 2 m from the other |
| `companions` | the entrance has room for 3 companions (`COMPANION_SPAWN`) |

A body stands, and a path is proved, with `LEVEL.clearance` about it, as in the level below.

## The level

`LEVEL` (`src/dungeon/level.ts`), the generator's table. A level is laid out on a grid of blocks
and carved into cells of 1 m.

| Field | Value |
|---|---|
| `blocks`, `block` | 17 blocks a side, each 3 m |
| `clearance` | 0.65 m: see below |
| `roomMin`, `roomMax` | a room is 2 to 4 blocks a side |
| `corridorMax` | a corridor is 1 or 2 blocks long |
| `maxRooms`, `minRooms` | at most 11 rooms; a layout with fewer than 6 is drawn again |
| `branchChance`, `branchDecay` | each side of a room of the spine grows a room with a chance of 0.75, and of a room a branch grew with 0.8 of its parent's |
| `attempts` | 4 room sizes are tried on one side of a room |
| `dividerChance`, `dividerMinBlocks` | a room 4 blocks long or longer is divided with a chance of 0.6 |
| `doorChance` | a link gets a door with a chance of 0.6 |
| `spawnCount`, `spawnFromStart`, `spawnSpacing` | 8 enemies, each at least 10 m from the start and 2 m from one another |
| `minExitPath` | the walk from start to exit is at least 24 m |
| `loops`, `loopMinDetour`, `minLoops` | at most 3 loops, each cutting 6 blocks of walking or more; at least 1 |
| `candidates`, `tries` | 12 levels are drawn a seed, from no more than 40 layouts a level, and the best kept |
| `score` | a loop is worth 3, a dead end -1, a metre from start to exit 0.15, a room 0.5 |

`score` was set by eye with `scripts/dungeon/print-level.mjs`: a loop is worth three dead ends,
and 20 m more between start and exit is worth one loop.

`LEVEL.clearance` is the radius the generator keeps clear of rock about every place a body is asked
to stand (start, exit and spawns among them), and the radius it proves the level joined at. It is
0.30 m wider than the 0.35 m a walker's path keeps (`FOOTPRINT_METRES`): the widest hero and a
margin, for a body that is gone. The Warrior's shoulders are 0.28 m from its middle, which makes
the margin 0.37 m.
