# The rules the screens set

The numbers of the arena's bout and the crypt's run that decide what happens (who sees whom, whom
each fights, where each walks, how a level is laid out) and are the screens' own, not the core's.
Each section names its constants, where they live, their values, and whose choice they are.

None of these is measured on the core. Each is **set**: chosen while the rule was written. Two
were once backed by a measurement on a body and an engine that are gone, and are named below as
set; what is still to measure is on the [roadmap](../roadmap.md). Unless a line says the
owner chose it, every value here is **kept as found; the owner to confirm**.

## The bout

`src/arena/duel.ts`. A recipe may give its own of either (`?gap=`, `&cap=` on the page).

- `GAP_METRES`: the two stand 4 m apart. That is beyond the 1.8 m a fighter attacks from
  (`ATTACK_METRES`, [human and strikes](human-and-strikes.md#attack-distance)), so each walks in
  before the first blow. The standing tables are read at 3, 4 and 5 m ([bouts](bouts.md)) and
  the oracle's at 4 ([oracle](oracle.md)).
- `CAP_SECONDS`: a bout runs 120 s before the fuller bar decides it. With no balance a bout
  lasts 14 s on average, and with a balance of 25 % 55 s ([assist](assist.md)), so the cap
  decides few bouts without balance and more with it.

## Sight

`src/dungeon/run.ts`. Every sight line is `canSee`'s: a clear line on the map, no farther than
the distance given.

- `SIGHT_METRES`: an enemy sees a party member within 14 m.
- `WAKE_METRES`: an enemy's body is built once a standing party member comes within 16 m of
  where it waits, 2 m beyond its sight, so that it is standing when it can first see; or a body
  going somewhere comes within `REST.company` of it, so that nothing stands where it is built.
  An enemy not yet built saves the step what a standing body costs it
  ([Bodies in the step](#bodies-in-the-step)).
- `REST`: an enemy at rest is held: its muscles are released and its segments fixed where they
  are (`DungeonRun.hold`). It rests when it stands within 0.5 m of its home (`home`), unalerted,
  with every standing party member farther than 18 m (`metres`) and nobody going anywhere within
  5 m (`clear`). It is let go, and driven afresh, once a party member is within `WAKE_METRES` or a
  body going somewhere within 4 m (`company`). A body going somewhere is a party member, or an
  enemy that is not at rest: two at rest side by side are held together. The 2 m between 16 and
  18 and the 1 m between 4 and 5 keep a body on a line from being held and let go by turns.

`WAKE_METRES` and `REST` are **set, not measured**: they are the distances of the rule the crypt
had on an engine that is gone (`src/dungeon/run.ts@e029c1e7`), which held a far enemy asleep in
that engine. What holding one saves on the core is measured below.
- `PARTY_SIGHT`: a party member sees the enemy its order locks within 12 m, picks one for itself
  within 8 m, and keeps the one it fights while it is within 5 m and nothing ranks above it.

## Bodies in the step

`src/dungeon/run.ts`. A run steps every body it has built, and a body costs a step what its
control and the solver take for it.

Harness: Node, the core world (`src/core/world.ts`), Rapier, 120 Hz, one thread of the development
host; skeletons with the club, 3 m apart on a ground, each under the command layers with an order
to stand. Read standing; then held, their muscles released (`Body.dispose`) and every segment
fixed where it is (`SegmentBody.setFixed`); then let go and driven afresh; then felled by a shove
at the root and still driven by a mind with no sub-minds; then lying, under the sub-minds the
game's mind has (`FIGHTER`); then limp, their muscles released. A row is the mean of 600 steps.
The step is 8.33 ms of the run's time, so a step of 8.33 ms is real time with nothing drawn.

```powershell
node research/body-cost.mjs
```

| Bodies | State | Down | A step, ms | The solver, ms | The rest, ms | A body, ms | Of real time, % |
|---|---|---|---|---|---|---|---|
| 1 | standing, driven | 0 | 0.69 | 0.32 | 0.37 | 0.69 | 8 |
| 1 | standing, held | 0 | 0.03 | 0.03 | 0.00 | 0.03 | 0 |
| 1 | let go, driven | 0 | 0.60 | 0.29 | 0.32 | 0.60 | 7 |
| 1 | down, driven | 1 | 0.79 | 0.31 | 0.47 | 0.79 | 9 |
| 1 | down, lying | 1 | 0.35 | 0.28 | 0.08 | 0.35 | 4 |
| 1 | down, limp | 1 | 0.27 | 0.27 | 0.00 | 0.27 | 3 |
| 4 | standing, driven | 0 | 2.17 | 1.00 | 1.17 | 0.54 | 26 |
| 4 | standing, held | 0 | 0.07 | 0.07 | 0.00 | 0.02 | 1 |
| 4 | let go, driven | 0 | 2.18 | 0.99 | 1.19 | 0.54 | 26 |
| 4 | down, driven | 4 | 2.89 | 1.18 | 1.71 | 0.72 | 35 |
| 4 | down, lying | 4 | 1.43 | 1.14 | 0.29 | 0.36 | 17 |
| 4 | down, limp | 4 | 1.13 | 1.13 | 0.00 | 0.28 | 14 |
| 8 | standing, driven | 0 | 4.27 | 1.97 | 2.30 | 0.53 | 51 |
| 8 | standing, held | 0 | 0.12 | 0.12 | 0.00 | 0.02 | 1 |
| 8 | let go, driven | 0 | 4.25 | 1.96 | 2.29 | 0.53 | 51 |
| 8 | down, driven | 8 | 5.71 | 2.37 | 3.34 | 0.71 | 68 |
| 8 | down, lying | 8 | 2.87 | 2.29 | 0.58 | 0.36 | 34 |
| 8 | down, limp | 8 | 2.23 | 2.23 | 0.00 | 0.28 | 27 |

A standing body costs 0.53 ms a step, over half of it control. Held, it costs 0.02 ms, and let
go it stands as before: none of the eight is down. A body that is down and still driven costs
more than one standing, 0.71 ms: its stance goes on solving for a ground its soles cannot give.
Lying, it costs 0.36 ms: the solver's 0.28, and 0.07 for its mind's look at it each step, which
is how it knows it is down. Limp, it costs the solver's 0.28 ms and nothing else.

So a body out of the fight goes limp (`DungeonRun.drop`): its assist is withdrawn and its muscles
released at the next step. In the crypt the stance of a body that is down cost more than under an
order to stand. Read at `69549c6c`, before the rule, with a script that is not kept (Node, a crypt
run of seed 42 with no visuals, every enemy built by hand at its home and seven of the nine bodies
felled by a shove): 12.5 ms a step, 9.8 of it outside the solver, where the nine standing took
5.2 ms. With the rule the same nine take 3.3 ms, 0.7 of it outside the solver.

Over a run: the hero explores a generated level with three Warriors following, for 180 s or to
the run's end. A rule changes a fight's course, so the three tables are not the same runs.

```powershell
node research/crypt-step.mjs --seeds 1,2,3,4 --seconds 180 --companions 3
```

At `69549c6c`, a body out of the fight still driven:

| Seed | The run | Seconds | Enemies | Bodies built at the end | The most built | Out of the fight | A step, ms | In its slowest second, ms | Of real time, % |
|---|---|---|---|---|---|---|---|---|---|
| 1 | playing | 180 | 8 | 9 | 9 | 3 | 5.09 | 6.77 | 81 |
| 2 | playing | 180 | 8 | 7 | 7 | 2 | 4.50 | 5.09 | 61 |
| 3 | playing | 180 | 8 | 8 | 8 | 2 | 4.66 | 5.55 | 67 |
| 4 | playing | 180 | 8 | 8 | 8 | 5 | 5.63 | 6.36 | 76 |

With a body out of the fight limp:

| Seed | The run | Seconds | Enemies | Bodies built at the end | The most built | Out of the fight | A step, ms | In its slowest second, ms | Of real time, % |
|---|---|---|---|---|---|---|---|---|---|
| 1 | playing | 180 | 8 | 8 | 8 | 2 | 3.98 | 5.18 | 62 |
| 2 | playing | 180 | 8 | 7 | 7 | 2 | 3.69 | 5.26 | 63 |
| 3 | playing | 180 | 8 | 8 | 8 | 2 | 3.88 | 4.97 | 60 |
| 4 | dead | 51 | 8 | 8 | 8 | 4 | 4.33 | 5.16 | 62 |

With an enemy at rest held as well (`REST`):

| Seed | The run | Seconds | Enemies | Bodies built at the end | The most built | Held | Out of the fight | A step, ms | In its slowest second, ms | Of real time, % |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | playing | 180 | 8 | 8 | 8 | 1 | 2 | 3.43 | 5.09 | 61 |
| 2 | playing | 180 | 8 | 7 | 7 | 1 | 2 | 3.10 | 4.64 | 56 |
| 3 | playing | 180 | 8 | 8 | 8 | 0 | 2 | 3.72 | 4.74 | 57 |
| 4 | dead | 51 | 8 | 8 | 8 | 2 | 4 | 4.09 | 4.83 | 58 |

Four runs a table, on one machine: the mean step is 4.5 to 5.6 ms with neither rule, 3.7 to
4.3 ms with the limp one and 3.1 to 4.1 ms with both. A party of four costs 2.1 ms a step by
itself, and in 180 s it has not left many enemies behind: none to two are held at the end.

**What the blows' watch costs.** A blow is any two segments of two sides that touch
(`watchBlows`, `src/core/rules/blows.ts`), so the watch asks the engine for the contacts of every
segment that has a fighter of another side given after its own, where a watch of the hands alone
asked for two a fighter. The run gives its party first, the fewer bodies. Seed 4 with two
Warriors following, 120 s, `PhysicsWorld.contactsOf` timed by a wrapper in a script that is not
kept (Node, Rapier, 120 Hz):

| The watch is given | Bodies read a step | A read, µs | The reads, ms a step |
|---|---|---|---|
| the party, then the enemies | 48 | 5.3 | 0.25 |
| the enemies, then the party | 109 | 5.3 | 0.58 |

The step with the hands alone read and with every segment read, the party first: the same runs
(a wound changes no body's course while its fighter stands, and each row's other columns are the
same in both), run by turns three times over on one machine, the least of the three:

```powershell
node research/crypt-step.mjs
node research/crypt-step.mjs --companions 2
```

| With the hero | Seed | The run | Seconds | Out of the fight | A step, ms: the hands | every segment | In its slowest second, ms: the hands | every segment |
|---|---|---|---|---|---|---|---|---|
| 0 | 1 | dead | 14 | 1 | 1.41 | 1.48 | 2.87 | 3.15 |
| 0 | 2 | dead | 40 | 2 | 1.80 | 1.84 | 2.98 | 2.79 |
| 0 | 3 | dead | 57 | 2 | 1.45 | 1.47 | 3.17 | 3.14 |
| 0 | 4 | dead | 67 | 2 | 2.64 | 2.66 | 3.68 | 3.71 |
| 2 | 1 | playing | 120 | 3 | 2.63 | 2.73 | 4.31 | 4.65 |
| 2 | 2 | playing | 120 | 3 | 2.40 | 2.52 | 3.80 | 3.91 |
| 2 | 3 | playing | 120 | 2 | 3.08 | 3.21 | 4.18 | 4.39 |
| 2 | 4 | playing | 120 | 4 | 3.40 | 3.66 | 4.80 | 5.07 |

Every segment read costs a step 1 to 5 % alone and 4 to 8 % with two following: 0.02 to
0.26 ms. The hands' column is `80b2f84e`'s.

## Targets

`src/dungeon/run.ts`, for a hero whose facing the cursor steers.

- `AIM_COSINE`: the hero picks targets from a cone about the cursor's direction whose half-angle
  has a cosine of 0.3: 73 degrees.
- `SET_UPON`: it also takes on any enemy within 2.5 m wherever it stands, and keeps it out to
  3.5 m, so that one circling at 2.5 m is not swapped at every look.

**Set, not measured.** The rule was written against a run in which a hero facing the cursor stood
being hit by an enemy behind it, read on a body and an engine that are gone
(`src/dungeon/run.ts@c4c71cb8`). How long a hero stands being hit from behind on the core, with
the rule and without, is a measurement to make.

## Following

`src/dungeon/run.ts`: how a body walks the path the run plans for it.

- `FOOTPRINT_METRES`: a path keeps 0.35 m from rock. The tops of the Warrior's upper arms are
  0.46 m apart and the arm is 0.05 m in radius (Node stand, the body as its spec writes it), so
  the shoulder's outer face is 0.28 m from the body's middle, and 0.07 m is left for the stance's
  sway. In that pose the elbows stand 0.38 m out, wider than the footprint.
- `STALL`: a body with a route that has not moved 0.05 m in 1 s has its route planned again
  from where it is. The slowest walker, the skeleton, walks at 0.2 m/s
  (`assets/core/stance-envelope.json`): four times that in a second.
- `TRAIL_METRES`: a companion with no post walks after the hero once it is 2.5 m behind, which
  is clear of the 1.8 m the hero attacks from.
- `SLOTS`: several members sent to one floor point take slots about it, no two within 1.3 m: the
  point, then eight bearings on a ring of 1.4 m, then of 2.8 m.
- `AVOID`: a walker steps round a body in its way. A body is in the way within the two
  footprints and 0.15 m of the walker's line, and no more than 1 m beyond that along it. The step
  aside is the walk turned 1.05 rad away from the body, a body within 0.05 m of the line counting
  as on one side; it is taken if the point 0.65 m along it is floor and no more than 0.05 m
  nearer the body, and the other way is tried if not.
- `MOVING`, 0.1, is a numeric setting: a walk is a unit step or none.

## Run timing

`RUN_TIMING` (`src/dungeon/run.ts`), s:

| Field | Value |
|---|---|
| `replan` | a walker with no route plans no sooner than 0.5 after its last plan |
| `perceive` | who sees whom is read every 0.2 |
| `alerted` | an enemy goes on to where it last saw the party for 7 after losing sight of it, then goes home |

## Arrival

`ARRIVAL` (`src/dungeon/run.ts`), how near counts as there, m:

| Field | Value |
|---|---|
| `waypoint` | a route's next point, 0.3 |
| `point` | a point of an order, or where an enemy is going, 0.4 |
| `post` | a companion's post, 0.6 |
| `explored` | the hero's goal while it explores, 0.5 |
| `lastSeen` | where a locked target was last seen, 0.5 |
| `goalMoved` | a goal that has moved more than 0.65 is planned for again |
| `exit` | the run is won within 1.1 of the exit |

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

`LEVEL.clearance` is the radius the generator keeps clear of rock about every place a body is
asked to stand, start, exit and spawns among them, and the radius it proves the level joined at.
It is 0.30 m wider than the 0.35 m a walker's path keeps (`FOOTPRINT_METRES`). It was written as
the widest hero and a margin, for a body that is gone, and the sum is not recorded: the
Warrior's shoulders are 0.28 m from its middle now, which would make the margin 0.37 m.
