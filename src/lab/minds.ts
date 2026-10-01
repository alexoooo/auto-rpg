import { standIntent } from "../core/mind/intent.ts";
import type { Tactics } from "../core/mind/tactics.ts";
import type { LabMindId } from "./scenarios.ts";

/**
 * **The minds a lab body can be given.** A scenario's mode writes a script, tactics of its own; a
 * mind makes of it the tactics that drive the body (`labActor`, `actor.ts`).
 */
interface LabMind {
  readonly name: string;
  /** Whether it may throw a strike: the page offers which strikes only to a mind that may. */
  readonly strikes: boolean;
  readonly tactics: (script: Tactics) => Tactics;
}

/** Every mind the address names (`LAB_MIND_IDS`, `scenarios.ts`). */
export const LAB_MINDS: Readonly<Record<LabMindId, LabMind>> = {
  /** The scenario's script, as written. */
  script: { name: "Script", strikes: true, tactics: (script) => script },
  /** Stands in guard the way it faces, whatever the script asks. */
  guard: { name: "Guard", strikes: false, tactics: () => ({ name: "guard", decide: ({ report }) => standIntent(report.heading) }) },
};

/**
 * `tactics` in all but what they decide, which is `decide`'s to say. Everything else of theirs is
 * read through to them, and none of it is the result's own: a spread of it copies nothing.
 */
export function deciding<T extends Tactics>(tactics: T, decide: Tactics["decide"]): T {
  return Object.create(tactics, { decide: { value: decide } }) as T;
}
