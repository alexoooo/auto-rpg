import type { Readiness, Resource, Window } from "../../skills/action.ts";
import type { Intent } from "../intent.ts";
import type { SubMind } from "../sub-mind.ts";
import type { Sight } from "../tactics.ts";
import type { Percepts } from "./percepts.ts";
import type { Terms } from "./value.ts";

/** **What a decision reads**, once a control step: the body and its skills as the last step left them, and each percept (`PERCEPTS`). */
export interface Situation extends Percepts {
  readonly sight: Sight;
  readonly time: number;
}

/** The models an option may be valued by, by kind: its own, built by hand. */
export type ModelKind = "hand-built";

/**
 * Where an option runs in the intent (`layered`): a **commitment** holds the whole body or several
 * of its parts (a strike, the low strike, orders carried out, a down option), and **footwork**
 * holds the legs alone. A free hand is the hand layer's (`cover`).
 */
export type Layer = "commitment" | "footwork";

/**
 * **An option**: a skill of the options fighter, chosen by its chooser (`Chooser`), in one shape:
 * its entry (where it can begin, or, running, go on), the resources it holds, its model (what
 * running it from now is expected to bring) and its exit (where it can hand the body over).
 * Begun, it runs until it is over, out of its entry, or given up for a better one where it yields.
 */
interface OptionBase {
  readonly name: string;
  /** Its memory (`src/core/state.ts`), plain data. */
  readonly state: object;
  readonly layer: Layer;
  /**
   * Its entry, now: `ready` to begin or go on; `position` where it begins once its legs are
   * brought into the window (`approach`); else `waiting` or `blocked`, and why.
   */
  entry(now: Situation): Readiness;
  /**
   * Its exit, now: `ready` where the body can be handed to another option here, else why not; null
   * where it names none. What a chooser looking past it reads (the Options plan's depth 2).
   */
  exit(now: Situation): Readiness | null;
  /** Whether, running, it may give way to another now. */
  yields(now: Situation): boolean;
  /** Whether, running, it has run its course: it is over, and may only be begun afresh. */
  ended(now: Situation): boolean;
  begin(now: Situation): void;
  /** It is over, run out or given up. */
  end(): void;
  /** What running it from now is expected to bring, by each model it has (`Terms`). */
  readonly models: Readonly<Record<ModelKind, (now: Situation) => Terms>>;
}

/**
 * What a standing option asks of the skills in a step, the hands' cover aside; with the window its
 * legs are to be brought to (`approach`) where its entry says `position`.
 */
export type Asked = Omit<Intent, "guard"> & { readonly approach?: Window };

/** An option the body carries out standing, through its skills. */
export interface StandingOption extends OptionBase {
  readonly posture: "standing";
  step(now: Situation, dt: number): Asked;
  /** What it holds in a step it asked `asked` (`Sight.needs`), by resource. */
  holds(now: Situation, asked: Asked): readonly Resource[];
  /** The body it means to be near, whose reach its walk need not keep out of (`keepOut`); none where absent. */
  near?(now: Situation): string | null;
}

/** An option a body carries out down, by the sub-mind it hands its body to: a commitment of the whole body. */
export interface DownOption extends OptionBase {
  readonly posture: "down";
  readonly mind: SubMind;
}

export type Option = StandingOption | DownOption;

/** An entry or exit that admits. */
export const READY: Readiness = Object.freeze({ kind: "ready" });

/** An entry or exit that does not admit, for `reason`: made once, as the options are. */
export const blocked = (reason: string): Readiness => Object.freeze({ kind: "blocked", reason });

/** Whether `option` is on offer now: its entry admits, at once or from a window its legs are brought to. */
export const onOffer = (option: Option, now: Situation): boolean => { const kind = option.entry(now).kind; return kind === "ready" || kind === "position"; };

/** What a step's asks hold (`Sight.needs`): each blow continued, what it holds; each asked anew, what it will. */
export function asking(now: Situation, asked: Asked): readonly Resource[] {
  const held: Resource[] = [];
  for (const request of asked.actions) {
    const live = now.sight.report.actions.find((action) => action.id === request.id);
    for (const resource of live ? live.holds : now.sight.needs(request.action, request.effector)) if (!held.includes(resource)) held.push(resource);
  }
  return held;
}

/** What footwork holds: the legs. */
export const LEGS: readonly Resource[] = Object.freeze(["legs"]);
