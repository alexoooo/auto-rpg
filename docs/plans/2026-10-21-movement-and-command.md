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

- **Movement is one pipeline**: tactics and orders give a goal, a facing and
  at most a ceiling; the navigator routes it; Move's rules choose the gait; one rule sets the speed
  (`travelSpeed`, `src/core/mind/travel.ts`) from the limits the gait states (`Locomotion.envelope`,
  `Locomotion.stopping`); the legs carry it out ([architecture](../architecture.md#minds)).
- **The Crypt's party is led by screen code**: its enemies are a team under the `independent`
  Commander (`src/core/command/independent.ts`), but `DungeonRun` (`src/dungeon/run.ts`) decides
  each party member's target, exploration goal, following the hero, post, slot
  about a shared destination and way through doors (`choose`, `memberMovement`, `slot`,
  `throughDoors`); and the person's four mouse orders (`Order`, `src/dungeon/commands.ts`: idle,
  lock, force, attack-move). None of the party's is in the core or selectable, and no AI can play the party.
- **The Arena's person steers one body**: WASD a direct goal relative to the camera, Shift walks,
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

B0 has landed: the Commander contract (`src/core/command/`, [architecture](../architecture.md#command)),
with the Crypt's enemies as its first kind (`independent`). B1 and B2 can start; B3 and B4 follow B1. Each step is its own
toolkit commits under the normal gate, naming the fingerprint cases it moves; a step that claims no
change of behaviour shows the fingerprint unmoved.

### Part B: command

#### B1. The Crypt's Commanders, no change of behaviour

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
  speed (`travelSpeed`), so the group arrives together.
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
- locomotion's declared limits (`Locomotion.envelope`, `Locomotion.stopping`) bound what a candidate direction can do;
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

Check: the gate, and the Commander contract (`tests/command-contract.test.mjs`: run, fork, replay from
its orders alone) over both Commanders.

## Checks

- Each step: the normal gate (`npm run check`, `npm test`), with the fingerprint cases it moves
  named, or the fingerprint unmoved where it claims no change of behaviour.
- No long runs: no battery is measured again for its own sake, and nothing runs over an hour
  without the owner's go-ahead ([AGENTS.md](../../AGENTS.md)).
- Eye check: the feel of the mouse controls (B2).

## Done when

Part B has landed: the Crypt's
Commanders are in the core and led by a person's commands, B3's crowd checks pass, and an
AI party can be scored clearing levels. What the plan built then goes into the architecture, and
this file is deleted.

## Relations

- **Running** (the [roadmap](../roadmap.md#body-and-motor-control)): a faster gait raises every top
  speed here through the limits it states, with no change to the pipeline.
- **Tactics** (the [roadmap](../roadmap.md#the-ai)): spacing is a range or direct goal, and a
  follow-orders model reads the speed rule.
- **[Component registration](2026-10-21-component-registration.md)** gains the Commander role and
  the locomotion role's new interface: the legs take a velocity and a facing, and a gait states its
  limits.
- **[Ratings](2026-10-21-ratings.md)**: the Crypt's clearing task is one of its
  evaluations.
