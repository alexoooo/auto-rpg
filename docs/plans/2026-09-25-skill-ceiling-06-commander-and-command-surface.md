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
