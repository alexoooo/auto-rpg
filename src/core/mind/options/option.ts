import type { Readiness, Resource } from "../../skills/action.ts";
import type { Cover, Intent } from "../intent.ts";
import type { Sight } from "../tactics.ts";
import type { Percepts } from "./percepts.ts";
import type { Terms } from "./value.ts";

/** **What a decision reads**, once a control step: the body and its skills as the last step left them, and each percept (`PERCEPTS`). */
export interface Situation extends Percepts {
  readonly sight: Sight;
  readonly time: number;
}

/**
 * **An option**: a skill applied to a target, chosen by its chooser (`Chooser`) in a set of options
 * whose resources do not overlap, in one shape: its entry (where it can begin, or, running, go
 * on), the resources it claims, its model (what running it from now is expected to bring: measured
 * where a profile prices it, else built by hand) and its exit (where it can hand the body over).
 * Begun, it runs until it is over, out of its entry, or given up for a better one where it yields.
 */
interface OptionBase {
  readonly name: string;
  /** Its memory (`src/core/state.ts`), plain data. */
  readonly state: object;
  /** The resources it takes from the set while it runs (`Resource`; `WHOLE`, the whole body): what no other option chosen beside it may hold. */
  readonly claims: readonly Resource[];
  /** Whether it is a rest option (`hold`, `guard`, `brace`): one worth no more than it does not take its resource from it. */
  readonly rest?: true;
  /** Its entry, now: `ready` to begin or go on, else `waiting` or `blocked`, and why. */
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
  /** What running it from now is expected to bring (`Terms`). */
  model(now: Situation): Terms;
}

/** What an option asks of the skills in a step, the hands' cover aside. */
export type Asked = Omit<Intent, "guard"> & { readonly guard?: Readonly<Record<string, Cover>> };

/** An option the body carries out through its skills. */
interface SkillOption extends OptionBase {
  step(now: Situation, dt: number): Asked;
  /** What it holds in a step it asked `asked` (`Sight.needs`), by resource. */
  holds(now: Situation, asked: Asked): readonly Resource[];
  /** The body it means to be near, whose reach its walk need not keep out of (`keepOut`); none where absent. */
  near?(now: Situation): string | null;
}

/** An option the body carries out standing, through its skills. */
export interface StandingOption extends SkillOption {
  readonly posture: "standing";
}

/** An option the body carries out on the ground, through its skills (`groundOptions`): a commitment of the whole body. */
export interface GroundOption extends SkillOption {
  readonly posture: "ground";
}

export type Option = StandingOption | GroundOption;

/** An entry or exit that admits. */
export const READY: Readiness = Object.freeze({ kind: "ready" });

/** An entry or exit that does not admit, for `reason`: made once, as the options are. */
export const blocked = (reason: string): Readiness => Object.freeze({ kind: "blocked", reason });

/** Whether `option` is on offer now: its entry admits. */
export const onOffer = (option: Option, now: Situation): boolean => option.entry(now).kind === "ready";

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

/** The whole body as a claim: it overlaps every other (`overlaps`). */
export const WHOLE: readonly Resource[] = Object.freeze(["*"]);

/** Whether two claims share a resource, the whole body sharing every one. */
export const overlaps = (a: readonly Resource[], b: readonly Resource[]): boolean =>
  a.includes("*") && b.length > 0 || b.includes("*") && a.length > 0 || a.some((resource) => b.includes(resource));

/** Whether `claims` hold the legs. */
export const holdsLegs = (claims: readonly Resource[]): boolean => claims.includes("legs") || claims.includes("*");

/**
 * **What a set of options asks in a step**: the walk and facing of the one that holds the legs
 * (`holdsLegs`), else `idle`'s; every one's actions; every one's covers (`Asked.guard`) of a hand
 * no one's asks hold (`SkillOption.holds`); and the body the legs' holder means to be near.
 */
export function stepSet(set: readonly Option[], now: Situation, dt: number, idle: () => Omit<Asked, "actions">): { asked: Asked; near: string | null } {
  let legs: Asked | null = null, near: string | null = null;
  const actions: Asked["actions"][number][] = [], held: Resource[] = [], guard: Record<string, Cover> = {};
  for (const option of set) {
    const asked = option.step(now, dt);
    for (const action of asked.actions) actions.push(action);
    for (const resource of option.holds(now, asked)) if (!held.includes(resource)) held.push(resource);
    if (asked.guard) Object.assign(guard, asked.guard);
    if (legs === null && holdsLegs(option.claims)) { legs = asked; near = option.near?.(now) ?? null; }
  }
  for (const hand of Object.keys(guard)) if (held.includes(hand)) delete guard[hand];
  return { asked: { ...(legs ?? idle()), actions, guard }, near };
}
