# The rules the screens set

The numbers of the arena's bout and the crypt's run that decide what happens (who sees whom, whom
each fights, where each walks, how a level is laid out) and are the screens' own, not the core's.
Each section names its constants, where they live, their values, and whose choice they are.

None of these is measured on the core. Each is **set**: chosen while the rule was written. Two
were once backed by a measurement on a body and an engine that are gone, and are named below as
set, with the measurement to make again on the [roadmap](../roadmap.md). Unless a line says the
owner chose it, every value here is **kept as found; the owner to confirm**.

## The bout

`src/arena/duel.ts`. A recipe may give its own of either (`?gap=`, `&cap=` on the page).

- `GAP_METRES`: the two stand 4 m apart. That is beyond the 1.8 m a fighter attacks from
  (`ATTACK_METRES`, [human and strikes](human-and-strikes.md#attack-distance)), so each walks in
  before the first blow. The standing tables are read at 3, 4 and 5 m ([bouts](bouts.md)) and
  the oracle's at 4 ([oracle](oracle.md)).
- `CAP_SECONDS`: a bout runs 120 s before the fuller bar decides it. With no balance a bout
  lasts 14 s on average, and with 5 points of balance 55 s ([assist](assist.md)), so the cap
  decides few bouts without balance and more with it.

## Sight

`src/dungeon/run.ts`. Every sight line is `canSee`'s: a clear line on the map, no farther than
the distance given.

- `SIGHT_METRES`: an enemy sees a party member within 14 m.
- `WAKE_METRES`: an enemy's body is built once a standing party member comes within 16 m of
  where it waits, 2 m beyond its sight, so that it is standing when it can first see. **Set, not
  measured.** The margin came with a rule that put far enemies to sleep, whose cost was measured
  on an engine that is gone (`src/dungeon/run.ts@e029c1e7`). What a level's unbuilt enemies save a
  step on the core is a measurement to make.
- `PARTY_SIGHT`: a party member sees the enemy its order locks within 12 m, picks one for itself
  within 8 m, and keeps the one it fights while it is within 5 m and nothing ranks above it.

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
