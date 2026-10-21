# Movement and command

## Why

Two layers, each with one general mechanism:

- **Movement.** A body given a goal goes there as fast as its legs can, by one pipeline: a goal, a
  route, a gait chosen by the situation, one rule for speed, and the legs. Holding W is a goal at
  infinity, so the body accelerates and goes as fast as it can that way; a click is a goal at a
  point, so it goes fast and brakes into it. A foe within a metre or two changes the gait, not the
  speed rule.
- **Command.** A **Commander** stands to a team as a Mind stands to a body: it knows only what its
  members sense and its own memory, and acts only by giving them orders, which their Minds carry
  out while defending themselves. A person is a Commander whose choices come from the mouse and
  keys, an automatic Commander filling in what they leave unsaid. An AI Commander has a policy: a
  mob attacking as one, or a party that clears a Crypt level by itself.

Principles:

- **One owner per decision**: the goal belongs to whoever gives orders (tactics, a person, a
  Commander), the route to the navigator, the gait to Move's rules, the speed to one rule, the
  motion to the gait. Nothing upstream asks for a speed except as a ceiling.
- **Gait by situation, speed by measurement**: Move chooses legs from conditions (standing, a foe's
  distance, the distance left, down), never from a requested pace; speed is read from the chosen
  gait's measured envelope, the way the body is going relative to where it faces.
- **A Commander reaches the world only through its members**: their senses, pooled, and its own
  memory; never the world, a body or an engine handle; it gives orders. The boundary test holds it
  to that, as it holds a Mind.
- **A person and an AI use one interface**: the person's input is a Commander's policy, and the
  automatic layer under it an ordinary Commander.
- **Orders are the recorded seam**: a tape records each body's orders, so a fight led by a person
  and one led by an AI replay alike, with no Commander and no Mind.
- **Deterministic and forkable**: a Commander steps inside `World.step`, in the sensing phase, at
  its own rate or on an event, its memory plain data in `state`.
- **Roles, not special cases**: the Commander is a registered role with its own config, faults and
  factory, implementations side by side
  ([Component registration](2026-10-21-component-registration.md)).

The owner has decided: the Crypt's enemies are coordinated by B4's mob, kept simple and minimal and
iterated on later, with today's independent approach still selectable; team bouts in the Arena, N
against N, are later work outside this plan.

## Where it starts

- **Speed is chosen in six places, none of which owns it**: `orderedIntent`
  (`src/core/mind/ordered.ts`) asks its gait's fastest walk forward (`ways.forward`) or,
  under `Orders.run`, the fastest forward that held 0.6 of its trials (`RUN`), and slows walking
  across or backwards (`STRAFE`); action tactics ask their own pace (`SPACE.fallbackPace`,
  `src/core/mind/action-tactics.ts`); the options' walker, which the Tempo entrant's tactics use,
  has its own fallback pace, braking and share held (`SPACE` in `walker`,
  `src/core/mind/options/walk.ts`); the arbiter falls back to the walk, or 0.3 m/s
  (`src/core/skills/arbiter.ts`); the navigator brakes and corners by its own constants
  (`NAV.brake`, `NAV.cornerPace`, `src/core/mind/navigation.ts`); the legs cap the result at the
  envelope's pace that way (`paceToward`, `locomotion.ts`).
- **A run order can stop a body**: the Warrior under `CLASSIC` with its locomotion `learned-run`,
  given a direct goal at the foe with `Orders.run`, stands still (0 m/s, its walk and run never
  running) where the walk and run under the same order walks; under its own mind it walks at about
  0.3 m/s and never runs (arena bout, open level, gaps 4 to 18 m). Not looked into; A1 removes
  `Orders.run`'s own pace.
- **Each way's top speed is read per way**: the fastest at which every trial held (`fastestEvery`,
  `src/core/control/stance-envelope.ts`), and the walk-run (`src/core/skills/walk-run.ts`) has its
  own envelope (`walkRunEnvelope`): the Warrior forward 4.5 m/s, to the sides 0.7, back 1.0. Its
  turns are still the SIMBICON run's; measured on the walk-run, the Warrior turns at no rate in
  every trial at 1 m/s or faster
  ([locomotion](../reference/locomotion.md#the-walk-and-run)). Whether a body under orders now
  runs is not read: no fingerprint case enters the run.
- **The Crypt's Commander is screen code**: `DungeonRun` (`src/dungeon/run.ts`, 672 lines) decides
  each enemy's target (the nearest party member it sees) and movement (`perceive`,
  `enemyMovement`); each party member's target, exploration goal, following the hero, post, slot
  about a shared destination and way through doors (`choose`, `memberMovement`, `slot`,
  `throughDoors`); and the person's four mouse orders (`Order`, `src/dungeon/commands.ts`: idle,
  lock, force, attack-move). None of it is in the core or selectable, and no AI can play the party.
- **The Arena's person steers one body**: WASD a direct move relative to the camera, Shift runs,
  the pointer sets facing, the left button attacks the segment it points at (`personOrders`,
  `src/arena/main.ts`). The bout tapes each side's orders (`Duel.tape`), so it replays with no
  mind.
- **Bodies of one party collide and fall**: `nobody_in_the_fight_is_held_with_the_party_near`
  (`tests/crypt-core-capability.test.mjs@2a1b29ac`) fails: on seed 1 ally-1 falls at 11.59 s,
  ally-2 at 22.86 s, the hero at 23.92 s, ally-0 at 27.28 s. Steering treats a requested direction
  as one the body can take at once: it reads no velocity or braking (simbicon's `TURN_ROUND` is
  0.3 m/s), ignores fallen bodies, and mixes observations taken one after another
  (`docs/analysis/2026-10-13-crowd-reversal.md@f103f3a9`).

## Steps

Part A first, in order: it is the foundation. B0 and B1
can start once A1 has landed; B2 needs A1's ceiling; B3 and B4 follow B1. Each step is its own
toolkit commits under the normal gate, naming the fingerprint cases it moves; a step that claims no
change of behaviour shows the fingerprint unmoved.

### Part A: movement

#### A1. One speed rule

A gait states its limits to the pipeline, a narrow interface of the locomotion role: its top speed
the way the body is going relative to its facing (today's gaits from their envelope's ways), its
turn rate at speed, and its stopping deceleration, its own controller constant tuned freely and
checked by its overshoot at a place goal (Part A's measurement). A later gait may answer another
way (feedback, a learned estimate) with no change to the pipeline; a gait that changes updates its
own limits as part of that change. The walk-run's turns are measured on it first, screened small
(`research/core-stance-envelope.mjs --legs walk-run --turns`).

`travelSpeed`, in one module, is the least of:

- the chosen gait's top speed the way the body is going, relative to its facing (`paceToward` on
  its envelope);
- the braking speed for the distance left, √(2 · the gait's stopping deceleration · distance);
- the cornering speed for the turn ahead, from the gait's turn rate at speed;
- the goal's ceiling, if it gives one.

The navigator reports the turn ahead from its route and calls the rule. `Intent.pace` becomes a
ceiling. The other choosers of speed go: `orderedIntent`'s pace, `STRAFE`, `Orders.run`, action
tactics' fallback, the walker's pace, braking and share, the arbiter's fallback, `NAV.brake` and
`NAV.cornerPace`. A direct goal has
infinite distance left and no corner, so it gets the gait's top speed.

#### A2. Tactics give goals, not velocities

Tactics and orders state movement only as a `MovementRequest` (direct, place, range or stand), with
a facing and an optional ceiling; spacing and footwork become a range or direct goal with a
ceiling. `Intent.move`, the velocity, becomes the pipeline's output to the legs, which no tactic
writes. Every tactic and entrant moves to the new form in one toolkit change, the entrants that
ask a pace (`src/core/entrants/tempo/tactics.ts`) among them. Follow orders values an order by the
speed this rule will ask, so its value and the motion agree.

#### A3. Gait by situation

Move's rules read conditions only: standing, the nearest standing foe's distance, the distance
left, and the conditions the Mind's options share. `MOVE` becomes the fighting step (Braced) within
2 m of a standing foe, and the walk-run free to run otherwise; the walk-run reaches the speed it is
asked its own way, running once that is past its threshold.

#### A4. The person's movement keys

In the Arena, WASD is a direct goal at the gait's top speed and Shift caps the speed at the plain
walk's forward speed; the Crypt's keyboard mode is the same. A click in the Crypt is a place goal
through the same pipeline: it goes fast and brakes into its point.

#### Checks for Part A

- **Landing A1 to A4**, once on the stand (`tests/harness/core-stand.mjs`): the Warrior
  empty-handed and with the club, holding a direct goal for 5 s, is at least 1 m/s over its last
  2 s; a place order 8 m off ends standing within its `near` plus 0.3 m.
- **The measurement**, a research script read before and after a step that moves it, and a Ratings
  evaluation once Ratings has its format: for each character and representative loadout, the share
  of the measured top speed a direct goal reaches, and how soon; overshoot at a place goal; speed
  through the obstacle court's corners.
- **The fingerprint** moves almost everywhere, and the commits say so. Nothing is rated again.
- **Eye check**: holding W and clicking to go, in the Arena and the Crypt.

### Part B: command

#### B0. The Commander contract

| Aspect | Contract |
|---|---|
| Where it lives | `src/core/command/`, a registered list (`COMMANDERS`) beside `CONTROLLERS`; config plain data by kind, with faults and a factory, like a Mind's; its maker gets a host (`TeamHost`), never the world |
| What it reads (`TeamView`) | each member's id, model, place, heading, whether it is down, vitality and current orders; each member's navigation report, only where it is of that member's own order; every body any member senses, pooled; the level as the team has explored it, given by the level's adapter as data (walkable ground, doors, the exit) |
| What it keeps | its own memory (last sightings, explored places, plans), in `state` |
| What it gives | for each member, orders or no change |
| When it runs | in `World.step`'s sensing phase, before the Minds, every `rate` seconds and at once on an event (a member down, a foe first seen, a new command) |

Check: `tests/core-boundary.test.mjs` extends to `command/`; once, each registered Commander runs
in a bout, forks, and replays from the orders it gave alone.

#### B1. The Crypt's Commanders, no change of behaviour

- An enemy Commander takes from `DungeonRun` waking, picking the nearest party member seen,
  approaching, and returning home or to a post.
- A party Commander takes following the leader, choosing targets, exploring, slots about a shared
  destination and the way through doors, with the person's commands as its input.
- `DungeonRun` keeps the map, levels (`levelsOf`), the run's status, and opening doors physically.

Check: the fingerprint's Crypt cases are unmoved.

#### B2. The person's commands

- **Vocabulary**: plain data (`Command`): select, go (a point or a drawn path), attack (a sensed
  foe), face (a point, or turn with Q/E), hold, stop, regroup, follow.
- **The mouse leads**: click the ground to go, click an enemy to attack it, drag to draw a path,
  Q/E or the mouse for facing; WASD steers the one selected body with a direct goal.
- **Several selected** take slots about the destination, their ceiling the slowest member's top
  speed (A1), so the group arrives together.
- **Touch**: every command also works on any touchscreen, a laptop's or a phone's (tap the ground
  to go, tap a foe to attack, drag to draw a path, on-screen controls for what WASD and Q/E do).
  Pointer events already carry touch; the commands are the same `Command` data.
- **The Arena**: its person uses the same Commander for their side, a team of one, so click-to-go
  works there too.
- **The Crypt's tape**: the Crypt records each body's orders on a tape, as the Arena does, and
  replays with no Commander.

Check: the gate; the eye check of the mouse controls' feel.

#### B3. Crowd motion

The navigator treats moving and fallen bodies of its own side as obstacles, and the party
Commander keeps members spaced:

- one shared snapshot of the party per decision;
- locomotion's declared limits (A1) bound what a candidate direction can do;
- a candidate is judged over the space it sweeps, not its end point;
- yielding between members is deterministic.

Check: on `nobody_in_the_fight_is_held_with_the_party_near`'s fixture
(`tests/crypt-core-capability.test.mjs@2a1b29ac`: three companions, seeds 1, 2, 4 and 5, the party
walked away from a resting enemy and back), no member falls; and a lone reversal, a following
pair, crossing paths, a narrow passage and a fallen body, each on several seeds, make progress as
well as keep clear.

#### B4. AI Commanders

- **A mob**, simple and minimal for now: it spreads its attackers over the party's members and about
  each target, by range goals at bearings round it, instead of each walking at the nearest. It is
  the Crypt's enemies' default.
- **A level-clearer**: the whole party is AI. It explores the edge of what it has seen, picks fights
  it can win, regroups, retreats when hurt, and reaches the exit.
- **An evaluation**, `crypt-clear` (in [Ratings](2026-10-21-ratings.md)' format, not a script of
  its own), scores a party Commander over a fixed set of generated levels: the share cleared, the
  time taken and the members lost, against each enemy Commander, with the same Minds, characters
  and seeds for every entrant, and repeated trials. Its case kind is held to bit equality between
  engines only once a Crypt run is (today only an Arena bout is); until then the Ratings screen
  neither opens nor confirms its cases.

Check: the gate, and B0's check (run, fork, replay from its orders alone) over both Commanders.

## Checks

- Each step: the normal gate (`npm run check`, `npm test`), with the fingerprint cases it moves
  named, or the fingerprint unmoved where it claims no change of behaviour.
- No long runs: no battery is measured again for its own sake, and nothing runs over an hour
  without the owner's go-ahead ([AGENTS.md](../../AGENTS.md)).
- Eye checks: Part A's movement (A4), and the feel of the mouse controls (B2).

## Done when

Part A and Part B have landed: a body given a goal goes there by the one pipeline, the Crypt's
Commanders are in the core and led by a person's commands, B3's crowd checks pass, and an
AI party can be scored clearing levels. What the plan built then goes into the architecture, and
this file is deleted.

## Relations

- **Running** (the [roadmap](../roadmap.md#body-and-motor-control)): a faster gait raises every top
  speed here through the limits it states (A1), with no change to this pipeline.
- **Tactics** (the [roadmap](../roadmap.md#the-ai)): spacing becomes a range or direct goal (A2),
  and a follow-orders model reads A1's rule.
- **[Component registration](2026-10-21-component-registration.md)** gains the Commander role and
  the locomotion role's new interface: the legs take a velocity and a facing, and a gait states its
  limits.
- **[Ratings](2026-10-21-ratings.md)**: Part A moves every bout, so it lands before Ratings' steps
  5 and 6, which choose the panel and cap after it. The Crypt's clearing task is one of its
  evaluations.
