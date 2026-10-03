import type { BodyLevel } from "../muscle/driver.ts";

/**
 * **Which bodies run themselves**: one rule for every fight with more bodies than fight at once.
 * A body with nothing to do and nobody near is `held`; any other is `full` in the fight and `limp`
 * out of it (`BodyLevel`, `src/core/muscle/driver.ts`). A body in the fight has nothing to do when
 * it waits; one out of it, once it has lain `settle` seconds.
 *
 * **Somebody is near** a body when a body going somewhere (in the fight, at `full`, not waiting),
 * itself apart, is nearer than `company` if it is held and `clear` if it is not; or, for a body in
 * the fight, a foe (a body of another side in the fight) is nearer than `wake` if it is held and
 * `rest` if it is not. A foe counts by sight and a walker by reach; nobody watches for the dead, so
 * only a walker is near one.
 *
 * A level is read from the game alone, never from the machine, so a fight is the same on every
 * machine: there is no cap on the bodies at `full`. The fight gives the distances.
 */

/** What a fight says of one body, for its level. */
export interface LevelAsk {
  /** The level it is at. */
  readonly level: BodyLevel;
  readonly side: string;
  /** Where it is on the ground, m. */
  readonly at: { readonly x: number; readonly z: number };
  /** How long it has been out of the fight, for good, s; null while it is in it. */
  readonly out: number | null;
  /** In the fight with nothing to do where it is: it may be held. */
  readonly waiting: boolean;
}

/** A fight's distances. Each pair is a line to cross coming and a farther one going, so a body on a line is not held and let go by turns. */
export interface LevelRule {
  /** A held body in the fight is let go with a foe nearer than `wake`, m, and a waiting one is held with every foe beyond `rest`. */
  readonly wake: number;
  readonly rest: number;
  /** The same two for a body going somewhere, m: a held body is let go with one nearer than `company`, and held with every one beyond `clear`. */
  readonly company: number;
  readonly clear: number;
  /** How long a body out of the fight lies loose before it may be held, s: long enough for its fall to end. */
  readonly settle: number;
}

/** The ground distance between two places, m. */
const apart = (a: LevelAsk["at"], b: LevelAsk["at"]): number => {
  const x = a.x - b.x, z = a.z - b.z;
  return Math.sqrt(x * x + z * z);
};

/** Whether `body` is going somewhere: in the fight, at `full`, and not waiting. */
const going = (body: LevelAsk): boolean => body.out === null && body.level === "full" && !body.waiting;

/**
 * Whether anybody of `bodies` but `self` is near a body at `at` on `side`, in the fight or not, by
 * the farther lines (`clear`, `rest`) or the nearer ones (`company`, `wake`).
 */
function near(at: LevelAsk["at"], side: string, fighting: boolean, self: LevelAsk | null, bodies: readonly LevelAsk[],
  walker: number, foe: number): boolean {
  for (const other of bodies) {
    if (other === self) continue;
    const d = apart(at, other.at);
    if (going(other) && d < walker) return true;
    if (fighting && other.out === null && other.side !== side && d < foe) return true;
  }
  return false;
}

/** Each body's level, in `bodies`' order. */
export function levelsOf(bodies: readonly LevelAsk[], rule: LevelRule): BodyLevel[] {
  return bodies.map((body) => {
    const fighting = body.out === null, held = body.level === "held";
    const idle = fighting ? body.waiting : body.out! >= rule.settle;
    const nearby = near(body.at, body.side, fighting, body, bodies, held ? rule.company : rule.clear, held ? rule.wake : rule.rest);
    return idle && !nearby ? "held" : fighting ? "full" : "limp";
  });
}

/**
 * Whether a body in the fight at `at` on `side`, held or not yet built, is to be let go: a foe in
 * the fight is nearer than `rule.wake`, or a body going somewhere nearer than `rule.company`.
 */
export function stirs(at: LevelAsk["at"], side: string, bodies: readonly LevelAsk[], rule: LevelRule): boolean {
  return near(at, side, true, null, bodies, rule.company, rule.wake);
}
