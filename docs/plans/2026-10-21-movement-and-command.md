# Movement and command

## Goal

Two layers, each with one clean, general mechanism:

- **Movement.** A body given a goal goes there as fast as its legs can, by one pipeline: a goal,
  a route, a gait chosen by the situation, one rule for speed, and the legs. Holding W is a goal
  at infinity, so the body accelerates and goes as fast as it can that way. A click is a goal at
  a point, so it goes fast and brakes into the point. A foe within a metre or two changes the
  gait, not the speed rule.
- **Command.** A **Commander** stands to a team as a Mind stands to a body. It knows only what its
  members sense, plus its own memory, and acts only by giving them orders, which their Minds carry
  out while defending themselves. A person is a Commander whose choices come from the mouse and
  keys, with an automatic Commander filling in what the person leaves unsaid. An AI Commander is
  the same thing with a policy: a mob of monsters attacking as one, or a party that clears a
  Crypt level by itself.

## Where it starts

**Speed is chosen in five places, none of which owns it.**

- `orderedIntent` (`src/core/mind/ordered.ts`) asks `envelope.walk`, the fastest walk held every
  way at once, or under `Orders.run` the fastest forward that held 0.6 of its trials (`RUN`). It
  also slows walking across or backwards (`STRAFE`).
- Action tactics ask their own pace (`SPACE.fallbackPace`, `src/core/mind/action-tactics.ts`).
- The arbiter falls back to the walk, or 0.3 m/s (`src/core/skills/arbiter.ts`).
- The navigator brakes and corners by its own constants (`NAV.brake`, `NAV.cornerPace`,
  `src/core/mind/navigation.ts`).
- The legs cap the result at the envelope's pace that way (`paceToward`, `locomotion.ts`).

**The choice goes round in a circle.** The walk-run (`src/core/skills/walk-run.ts`) runs only
when asked a pace past its threshold. Orders work out the pace they ask from that same gait's
every-way walk, so a body under orders never asks enough to run. The architecture records this
as the rule ("whether a body runs is its tactics' or its orders' choice of pace").

**One bad reading sets that every-way walk.** In `assets/core/simbicon-run-envelope.json`, the
Warrior with the club walked back at 0.4 m/s in 7 of 10 trials, and at every speed from 0.5 to
2.0 m/s in 10 of 10. `fastestHeld` stops at the first speed that missed, so `walk` and `back`
read 0.3 m/s, against 4.0 m/s forward. In a headless Crypt hall (Node core world, Rapier,
120 Hz), the default hero walks at 0.29 m/s however it is ordered, and the Crypt has no way to
ask it to run. In the Arena it crawls at 0.3 m/s or runs with Shift.

**The Crypt already has a Commander, inside screen code.** `DungeonRun` (`src/dungeon/run.ts`,
672 lines) decides:

- each enemy's target (the nearest party member it sees) and movement (`perceive`,
  `enemyMovement`);
- each party member's target, its exploration goal, following the hero, its post, its slot about
  a shared destination and its way through doors (`choose`, `memberMovement`, `slot`,
  `throughDoors`);
- the person's mouse orders, of four kinds (`Order` in `src/dungeon/commands.ts`: idle, lock,
  force and attack-move).

None of it is in the core, none of it is selectable, and an AI cannot play the party's side.

**The Arena's person steers one body.** WASD is a direct move relative to the camera, Shift
runs, the pointer sets facing, and the left button attacks the segment it points at
(`src/arena/main.ts`, `personOrders`). The bout tapes each side's orders (`Duel.tape`), so a bout
replays with no mind.

**Bodies of one party collide and fall.** The crowd-reversal regression in
`tests/crypt-core.test.mjs` is a TODO
([analysis](../analysis/2026-10-13-crowd-reversal.md)): local steering lacks the legs' braking,
and fallen bodies are not avoided.

## Principles

- **One owner for each decision.** The goal belongs to whoever gives orders (tactics, a person,
  a Commander). The route belongs to the navigator, the gait to Move's rules, the speed to one
  rule, and the motion to the gait. Nothing upstream asks for a speed except as a ceiling.
- **Gait by situation, speed by measurement.** Move chooses legs from conditions (standing, a
  foe's distance, the distance left, down), never from a requested pace. Speed is read from the
  chosen gait's measured envelope, the way the body is going relative to where it faces.
- **A Commander reaches the world only through its members.** It reads their senses, pooled,
  and its own memory; it never reads the world, a body or an engine handle; it gives orders. The
  boundary test holds it to that, as it holds a Mind.
- **A person and an AI use one interface.** The person's input is the policy of a Commander; the
  automatic layer under it is an ordinary Commander.
- **Orders are the recorded seam.** A tape records each body's orders, so a fight led by a person
  and one led by an AI replay alike, with no Commander and no Mind.
- **Deterministic and forkable.** A Commander steps inside `World.step`, in the sensing phase,
  at its own rate or on an event, and its memory is plain data in `state`.
- **Roles, not special cases** ([component registration](2026-10-21-component-registration.md)). The
  Commander is a registered role with its own config, faults and factory, and implementations
  sit side by side.
- **No long runs.** Every check here follows `AGENTS.md`'s rule on long runs: no battery is
  measured again for its own sake, and nothing runs over an hour without the owner's go-ahead.
- **The toolkit lands on its own.** Each stage is its own commits under the normal gate, with the
  fingerprint cases it moves named. A stage that claims no change of behaviour shows the
  fingerprint unmoved.

## Part A: movement

### A0. A gait's limits, read per way

- A gait states its limits to the pipeline: its top speed the way the body is going relative to
  its facing, and its stopping deceleration. Today's gaits answer from their envelope tables; a
  later gait may answer another way (from feedback, or a learned estimate) with no change to the
  pipeline. The limits are a narrow interface of the locomotion role
  ([component registration](2026-10-21-component-registration.md)).
- Read each way's fastest speed from the existing tables by the share of its trials that held at
  that speed, not "stop at the first miss". The share is named where the rule is, and is chosen
  by looking at the tables. First, find what the walk-run's 0.4 m/s backward dip is: falls, or
  walks that did not go as asked. No battery is run again for this.
- A body that faces its walk is paced by its forward speed. `StanceEnvelope.walk`, the every-way
  figure, keeps only the readers that mean every way, or goes if none do.
- A gait's stopping deceleration is its own setting, a controller constant tuned freely, checked
  by the capability test's overshoot at a place goal (below). A gait that changes updates its own
  limits as part of that change.

### A1. One speed rule

`travelSpeed`, in one module, is the least of:

- the chosen gait's top speed the way the body is going, relative to its facing (`paceToward`
  on the envelope from A0);
- the braking speed for the distance left, √(2 · the gait's stopping deceleration · distance);
- the cornering speed for the turn ahead, from the gait's turn rate at speed;
- the ceiling, if the goal gives one.

The navigator reports the turn ahead from its route, and calls the rule. `Intent.pace` becomes a
ceiling. The other choosers of speed go:
- `orderedIntent`'s pace;
- `STRAFE`;
- `Orders.run`;
- action tactics' fallback;
- the arbiter's fallback;
- `NAV.brake` and `NAV.cornerPace`.

A direct goal has infinite distance left and no corner, so it gets the gait's top speed.

### A2. Tactics give goals, not velocities

Tactics and orders state movement only as a `MovementRequest` (direct, place, range or stand),
with a facing and an optional ceiling. Spacing and footwork become a range or direct goal with a
ceiling. `Intent.move`, the velocity, becomes the pipeline's output to the legs, which no tactic
writes. Every tactic and entrant moves to the new form in one toolkit change. Follow orders
values an order by the speed this rule will ask, so its value and the motion agree.

### A3. Gait by situation

Move's rules read conditions only: standing, the nearest standing foe's distance, the distance
left, and the conditions the Mind's options share. `MOVE` becomes the fighting step (Braced)
within 2 m of a standing foe, and the walk-run free to run otherwise. The walk-run reaches the
speed it is asked its own way, running once that is past its threshold.

### A4. The person's movement keys

- In the Arena, WASD is a direct goal at the gait's top speed, and Shift caps the speed at the
  plain walk's forward speed.
- The Crypt's keyboard mode is the same.
- A click in the Crypt is a place goal through the same pipeline: it goes fast and brakes into
  its point.

### Checks for Part A

- **The gate.** A floor test: on the stand, the Warrior empty-handed and with the club, holding a
  direct goal for 5 s, is at least 1 m/s over its last 2 s. A place order 8 m off ends standing
  within its `near` plus 0.3 m. Both floors sit far below what the gait does.
- **A capability test** (`tests/movement-capability.test.mjs`, in `tests/experimental.json`):
  - the share of the measured top speed a direct goal reaches, and how soon;
  - overshoot at a place goal;
  - the speed through the obstacle court's corners;
  - for each character and representative loadout.
- **The fingerprint** moves almost everywhere; the commits name it so. Nothing is rated again:
  Part A moves every bout, so Ratings' panel and cap are chosen after it lands
  ([Ratings](2026-10-21-ratings.md), steps 5 and 6).
- **Eye check:** holding W and clicking to go, in the Arena and the Crypt.

## Part B: command

### B0. The Commander contract

- **Where it lives:** `src/core/command/`, with a registered list (`COMMANDERS`) beside
  `CONTROLLERS`. Its config is plain data by kind, with faults and a factory, like a Mind's. Its
  maker gets a host (`TeamHost`), never the world.
- **What it reads** (`TeamView`):
  - each member's id, model, place, heading, whether it is down, its vitality and its current
    orders;
  - each member's navigation report, only where it is of that member's own order;
  - every body any member senses, pooled;
  - the level as the team has explored it, given by the level's adapter as data: walkable
    ground, doors, the exit.
- **What it keeps:** its own memory (last sightings, explored places, plans), in `state`.
- **What it gives:** for each member, orders or no change.
- **When it runs:** in `World.step`'s sensing phase, before the Minds, every `rate` seconds and
  at once on an event (a member down, a foe first seen, a new command).
- **What enforces it:** `tests/core-boundary.test.mjs` extends to `command/`, and a fast
  contract test, like `mind-contract`, runs every registered Commander. It must run, fork and
  replay from the orders it gave alone.

### B1. The Crypt's Commanders, no change of behaviour

- **The enemies:** waking, picking the nearest party member seen, approaching, and returning
  home or to a post. This logic moves out of `DungeonRun` into an enemy Commander.
- **The party:** following the leader, choosing targets, exploring, slots about a shared
  destination, and the way through doors. This logic moves into a party Commander, which takes
  the person's commands as its input.
- **What `DungeonRun` keeps:** the map, levels (`levelsOf`), the run's status, and opening doors
  physically.

**Gate:** the fingerprint's Crypt cases are unmoved, and `tests/crypt-core.test.mjs` is green and
unchanged.

### B2. The person's commands

- **Vocabulary.** A person's commands are plain data (`Command`): select, go (a point or a
  drawn path), attack (a sensed foe), face (a point, or turn with Q/E), hold, stop, regroup,
  follow.
- **The mouse leads:**
  - click the ground to go;
  - click an enemy to attack it;
  - drag to draw a path;
  - Q/E or the mouse for facing;
  - WASD steers the one selected body with a direct goal.
- **Several selected.** They take slots about the destination. Their ceiling is the slowest
  member's top speed (A1), so the group arrives together.
- **Touch.** The game is to be playable on a phone, so every command has a touch form: tap the
  ground to go, tap a foe to attack, drag to draw a path, and on-screen controls for what WASD
  and Q/E do. Pointer events already carry touch; the commands are the same `Command` data.
- **The Arena.** Its person uses the same Commander for their side, a team of one, so
  click-to-go works there too.
- **The Crypt's tape.** The Crypt records each body's orders on a tape, as the Arena does, and
  replays with no Commander.

### B3. Crowd motion

The navigator treats moving and fallen bodies of its own side as obstacles, and the party
Commander keeps members spaced. The crowd-reversal regression becomes an ordinary passing test,
its fixture and assertions as they are.

### B4. AI Commanders

- **A mob**, simple and minimal for now (the owner's decision), to be iterated on later: it
  spreads its attackers over the party's members and about each target, by range goals at
  bearings round it, instead of each walking at the nearest. It is the Crypt's enemies' default.
- **A level-clearer.** The whole party is AI. It explores the edge of what it has seen, picks
  fights it can win, regroups, retreats when hurt, and reaches the exit.
- **An evaluation** (`crypt-clear`, [Ratings](2026-10-21-ratings.md)'s format, not a script
  of its own) scores a party Commander over a fixed set of generated levels:
  - the share cleared, the time taken and the members lost;
  - against each enemy Commander;
  - with the same Minds, characters and seeds for every entrant, and repeated trials.

  Its case kind is held to bit equality between engines only once a Crypt run is (today only an
  Arena bout is); until then the Ratings screen neither opens nor confirms its cases.

## Decided

- **The Crypt's enemies** are coordinated by B4's mob, kept simple and minimal; it is iterated
  on later. Today's independent approach stays selectable.
- **Team bouts in the Arena**, N against N, are later work, outside this plan.

Eye checks: Part A's movement (A4), and the feel of the mouse controls (B2).

## Order and relation to other plans

- **Order.** Part A first, in order. It is the foundation, and A0 and A1 alone fix the 0.29 m/s
  hero. Part B's B0 and B1 can start once A1 has landed. B2 needs A1's ceiling. B3 and B4 follow
  B1.
- **Running** (the [roadmap](../roadmap.md#body-and-motor-control)). A faster gait raises every
  top speed here through the limits it states (A0), with no change to this pipeline.
- **Tactics** (the [roadmap](../roadmap.md#the-ai)). Spacing becomes a range or direct goal
  (A2), and a follow-orders model reads A1's rule.
- **[Component registration](2026-10-21-component-registration.md).** It gains the Commander
  role and the locomotion role's new interface: the legs take a velocity and a facing, and a gait states its limits.
  A2 edits the entrants that ask a pace (`src/core/entrants/tempo/tactics.ts`) as part of its
  toolkit change.
- **[Ratings](2026-10-21-ratings.md).** Part A lands before its steps 5 and 6. The Crypt's
  clearing task is one of its evaluations.

When this plan lands, what it built goes into the architecture, and this file is deleted.
