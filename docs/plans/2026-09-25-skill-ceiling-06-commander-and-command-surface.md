# Session 06: the commander, and a command surface built for control

## Goal

Two changes, both licensed by the owner's decision that a person commands and does not puppet:

1. **Orders.** A person picks whom to attack and where to go. The mind drives the body.
2. **A body command surface designed for control**, not for a mouse. It is judged by what it does
   to headroom.

## Orders

- `Orders`: `{ target: body id | point | null, destination: point | null }`. A person produces it
  from a click on a unit or the ground, and from WASD. An auto-commander produces it for an AI side:
  attack the nearest, hold here. It is handed to the mind beside the view.
- Every mind obeys orders. It fights the ordered target, and moves to the ordered destination while
  still defending itself. A mind with no orders fights the nearest enemy, as today.
- The arena and the dungeon both take orders. In the dungeon one person orders a party.
- The `hold under orders` drill joins session 03's suite.

**What is retired:**

- `splitMind` and `handover`;
- the cursor and pose inverses in `src/policies.ts` and `src/mind.ts`;
- `src/buttons.ts`;
- the takeover UI (Take / Let go);
- the `COMBAT_FIELDS` parity fixtures;
- `src/options.ts`, and the recorder's use of it.

`src/input.ts` keeps its pointer-event rules (see `AGENTS.md`) and produces orders. `AGENTS.md`'s
first house rule is rewritten: its authority half stays, and its parity half goes. The input traps
that no longer apply are cut from `AGENTS.md` in the same commit.

## The command surface

`Intent` is a mouse-shaped vocabulary: per hand, two cursor axes inside a published envelope, plus
reach, roll, wrist bend, and `thrust` and `guard` levels; and for the body, a lean, a twist and a
crouch, with `forward`, `strafe` and `turn`. With no person needing to produce it, the surface is
designed for control:

- **Effectors in task space:** a target point, orientation and speed for each business end, plus a
  stiffness or force level (how hard to hold a line). The body's modules clamp to what they can
  reach, as frozen rule 3 already has them do.
- **The trunk:** lean, twist and crouch, as today.
- **Footwork**, which is new and the likeliest source of skill: stance width, lead foot, weight
  distribution, and a step target with a timing. Session 05's footwork check is the case for each
  one.
- **The natural striker**, as today.

**Channels are declared per module, from shared kinds.** The list above is the golem's and the
skeleton's. A family declares which channels its modules offer, choosing from kinds with one
meaning each: effector (task space), trunk, a stepping gait (biped, quadruped, multileg), a rolling
base, a natural striker, and any kind a new family adds. A command names channels by kind, so the
expert and the planner drive a morphology they have never seen by reading its declaration. A family
may add a kind of its own, such as a tail or a grab. It declares the kind, its bench and its
actuator, and nothing shared changes.

**The authority rule, restated.** Every channel is something a motor or the carrier actually does,
within its limits. Nothing sets a pose or a joint state directly. Each new channel names the
actuator that carries it, and gets a bench showing the body can follow it.

**Adding a control point is an experiment.** Each new channel is added behind a flag, the expert is
re-run with and without it on session 05's bodies, and it lands only if headroom rises. A channel
that raises nothing is complexity with no skill behind it. The headroom tables are re-measured on
the new surface, and the difference from session 05 is the value of the surface.

**The old minds keep running.** An adapter turns an `Intent` into the new command, so the duelist,
miser and needle stay available as benchmarks until session 09. The adapter is a known,
tested translation. Nothing new is written against `Intent`.

## Eye gate

The owner plays both of these, on the dev server:

- an arena bout, clicking targets and a destination;
- a dungeon run, ordering the party.

What to look for: orders are obeyed promptly; a fighter under a move order still defends itself;
and nothing about the fight got worse from the surface change.

## Depends on

Session 05 (the footwork check). The orders half does not depend on it and may land first.

## Result: the orders half

Landed on 2026-09-26, in five commits (683cbf7 plumbing, c75c488 arena, 0a6d9ce dungeon, 814b81d
drill, c9173ae retirements). The command-surface half has not been started. The write-up is
`docs/analysis/2026-09-26-orders.md`.

- **Orders.**
  - `src/orders.ts` has `Orders { target, destination }`, a person's `StandingOrders`, and the
    auto-commanders `attack-nearest` and `hold-here`.
  - Every mind obeys through the `OrderFollower`, which takes the footwork only, so a body under a
    move order still fights and guards.
  - The arena takes clicks, right-click attack-move, WASD, H and X, with Command / Stand down.
  - In the dungeon one person orders a party of the hero and up to three companions.
- **No orders is bit-identical.**
  - Arena: 28 bouts in the Node bout runner (7 benchmark minds x 3 builds against the duelist,
    plus a mirror each, 4 lanes). Every trajectory hash and verdict was identical on the base tree,
    after the plumbing and after the retirements.
  - Dungeon: a solo run was identical across six scenarios in the Node headless dungeon harness.
- **The hold-under-orders drill** joins session 03's suite. Over 200 runs (Node bout runner and
  fork harness, 150 scored), every rung arrived and held on every scored start. Pass rates were
  idle 0 %, walker 4 %, duelist 10 % and guardless duelist 30 %: the wound decides the drill, not
  obedience. Moving under orders costs no measurable wound (40 starts, fork harness).
- **Retired:**
  - `splitMind`/`handover` and the human driver;
  - the cursor and pose inverses;
  - the takeover UI and its config;
  - the `COMBAT_FIELDS` fixtures;
  - `src/options.ts`, whose behaviour record moved into `src/recorder.ts`.

  `src/buttons.ts` moved to `src/bench/buttons.ts`, since the bench puppet still presses buttons,
  and `BUTTON_REACH` became `HAND_REACH` in `src/hands.ts`. No benchmark mind or research script
  read a target, so nothing was refused. `AGENTS.md`'s first house rule and the input traps were
  rewritten in the same commit.
- **Eye gate: deferred.** The analysis lists what the owner should look at.
