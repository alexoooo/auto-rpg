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
- **Deterministic and forkable**: a Commander steps inside `World.step`, in the sensing phase, at
  its own rate or on an event, its memory plain data in `state`.
- **Roles, not special cases**: the Commander is a registered role with its own config, faults and
  factory, implementations side by side (`COMMANDERS`, `src/core/command/commanders.ts`).

The owner has decided: the Crypt's enemies are coordinated by B4's mob, kept simple and minimal and
iterated on later, with today's independent approach still selectable; team bouts in the Arena, N
against N, are later work outside this plan. No fight is taped for a person to replay.

## Where it starts

- **Movement is one pipeline**: tactics and orders give a goal, a facing and
  at most a ceiling; the navigator routes it; Move's rules choose the gait; one rule sets the speed
  (`travelSpeed`, `src/core/mind/travel.ts`) from the limits the gait states (`Locomotion.envelope`,
  `Locomotion.stopping`); the legs carry it out ([architecture](../architecture.md#minds)).
- **The Crypt's teams are Commanders**: its enemies `independent`, its party `party`
  (`src/core/command/`), with `DungeonRun` their host. The person's commands (`Command`,
  `src/core/command/commands.ts`) reach the party Commander, the keys and the pointer as its
  `Lead`. No AI plays the party yet.
- **The Arena's person leads a team of one** under the same Commander (`teamOfOne`,
  `src/arena/team.ts`): WASD, Shift, the pointer, the left button, and a click on the floor to go.
  The bout tapes each side's orders (`Duel.tape`), so it replays with no mind.
- **Bodies of one party keep clear** (`crowdWalk`, `fallenSolids`, `src/core/mind/crowd.ts`), read by
  the `crowd` battery (`npm run evaluate -- crowd`, 24 cases): no fall in 0.708 of them (0.375
  before), 0.458 falls a case (3.708), done in 0.870 of those reached. Lone, crossing, three
  passages and three fallen bodies pass; the old fixture passes on seed 1, and seed 5 does not reach
  its reversal. A party member walks braced within 11 m of a standing companion (Classic's `MOVE`).

## Steps

B0, B1, B2 and B4 have landed: the Commander contract (`src/core/command/`,
[architecture](../architecture.md#command)), the Crypt's enemies (`independent`, and the `mob`
by default) and party (`party`, or the `clearer`) as its kinds, the person's commands, and
`crypt-clear`; B2's mouse controls wait on the owner's eye. B3 has landed in part.
Each step is its own toolkit commits under the normal gate, naming the fingerprint cases it moves;
a step that claims no change of behaviour shows the fingerprint unmoved.

### Part B: command

#### B3. Crowd motion: what is left

The `crowd` battery passes: no member falls and every case reached is done. What fails is in the
stance walk: braced at the 0.5 m/s it states, after a half turn it runs away sideways to
1.4-1.7 m/s with no contact (lone 3 alone, following 1-3, the old fixture's seeds 2 and 4;
[locomotion](../reference/locomotion.md)). With it fixed, passage 1 and fallen 4 are read again,
and the 11 m braced rule (sized by the run's 0.15 m/s² stopping) is read against a run that
brakes faster.

Check: `npm run evaluate -- crowd` passes, kept with `--write`.

## Checks

- Each step: the normal gate (`npm run check`, `npm test`), with the fingerprint cases it moves
  named, or the fingerprint unmoved where it claims no change of behaviour.
- No long runs: no battery is measured again for its own sake, and nothing runs over an hour
  without the owner's go-ahead ([AGENTS.md](../../AGENTS.md)).
- Eye check: the feel of the mouse controls (B2).

## Done when

B3's battery passes. What the plan built then goes into the architecture, and this file is deleted.

## Relations

- **Running** (the [roadmap](../roadmap.md#body-and-motor-control)): a faster gait raises every top
  speed here through the limits it states, with no change to the pipeline.
- **Tactics** (the [roadmap](../roadmap.md#the-ai)): spacing is a range or direct goal, and a
  follow-orders model reads the speed rule.
- **[Ratings](2026-10-21-ratings.md)**: the Crypt's clearing task is one of its
  evaluations.
