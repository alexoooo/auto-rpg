/**
 * **Random commands**: the Locomotion scenario's course that is no track. A walker is sent to one
 * destination after another, scattered over a square about where it starts, as a person clicking
 * about the crypt sends a body (`DungeonRun`'s attack-move, `src/dungeon/run.ts`), and stands a
 * while at each before the next.
 *
 * Free of the page, so `tests/lab-track.test.mjs` can argue with it.
 */
import { randomStream } from "../core/math/random.ts";

/** The square's side the destinations are scattered over by default, m: the scenario's slider sets another. */
export const COMMANDS_AREA = 10;
/** The least distance from one destination to the next, m: the shortest walk a command asks. */
export const LEAST_LEG = 2;
/** How near a destination the walker has arrived, m: the crypt's for a point (`ARRIVAL.point`). */
export const ARRIVED = 0.4;
/** The longest a walker stands at a destination before the next, s: each stands a drawn share of it. */
export const LONGEST_STAND = 1.5;

/** A destination across the ground (x, z), m, and how long the walker stands once it is there, s. */
interface Command {
  readonly x: number;
  readonly z: number;
  readonly stand: number;
}

export interface Commands {
  /** The square's side, m, centred on the start. */
  readonly area: number;
  /** The `i`th command, from 0: the same for the same area and seed. */
  at(i: number): Command;
}

/** The commands over a square of `area` m from `seed`: each destination inside it and `LEAST_LEG` or more from the last. */
export function commandsOf(area: number, seed: number): Commands {
  const random = randomStream(seed), drawn: Command[] = [];
  const half = area / 2;
  return {
    area,
    at(i) {
      while (drawn.length <= i) {
        const last = drawn[drawn.length - 1] ?? { x: 0, z: 0 };
        let x: number, z: number;
        do {
          x = (2 * random.next() - 1) * half;
          z = (2 * random.next() - 1) * half;
        } while ((x - last.x) * (x - last.x) + (z - last.z) * (z - last.z) < LEAST_LEG * LEAST_LEG);
        drawn.push({ x, z, stand: LONGEST_STAND * random.next() });
      }
      return drawn[i]!;
    },
  };
}
