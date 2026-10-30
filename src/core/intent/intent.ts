import type { ActionRequest, Resource } from "../skills/framework/action.ts";
import type { GaitName } from "../skills/locomotion/gaits.ts";
import type { Vec3 } from "../spec/quantity.ts";
import type { MovementRequest } from "./movement.ts";

/**
 * **What tactics ask of their body**, each control step: how to move, which way to face, and what
 * each hand does. It is the vocabulary a person's keys and an AI share (a person never commands
 * muscles), and it names no joint, pose or push: the skills
 * (`src/core/skills/framework/skills.ts`) decide how the body does it, and say how it is going
 * (`SkillReport`).
 */
export interface Intent {
  /**
   * Walk at this velocity, m/s: forward along the body's heading and to its right; its speed is
   * capped at the body's fastest walk (`Body.envelope`). Null stands.
   */
  readonly move: readonly [forward: number, right: number] | null;
  /** A tactical movement objective, resolved by navigation before the skills read `move`. */
  readonly movement?: MovementRequest;
  /** A movement objective's ceiling on the speed rule's speed (`travelSpeed`), m/s; absent, none. */
  readonly pace?: number;
  /** Go no faster than the body's plain walk goes forward (the stance's walk, `Body.envelope`): a ceiling, whatever the gait. */
  readonly walk?: true;
  /** With no explicit facing, navigation faces travel along its route. */
  readonly travelFacing?: true;
  /** Face this way, rad about up (0 faces +z, growing to the right); the body turns toward it as its walk allows. */
  readonly face: number;
  /**
   * What each hand covers (`Cover`), by the hand's segment; a hand not named, or null, holds the
   * guard's pose. The guard skill puts what the hand covers with between the threat and the place
   * guarded (`src/core/skills/guard/guard.ts`); a hand an attack has does not guard.
   */
  readonly guard: Readonly<Partial<Record<string, Cover | null>>>;
  /** How far under its standing height to hold the centre of mass, m; `STANCE_LOWER` when not given. */
  readonly lower?: number;
  /** Discrete commitments requested on this control step. */
  readonly actions: readonly ActionRequest[];
  /**
   * Live actions to end at once, as interrupted, freeing what they hold, by id; one whose executor
   * cannot be stopped at once runs its course (`Executor.interrupt`).
   */
  readonly interrupt?: readonly number[];
  /** How far the body is from where its walk is taking it, m; absent where it is taking it nowhere. Its locomotion may choose its gait by it (`move`). */
  readonly destination?: number;
  /** The gait to go by, by name (`GAITS`), for legs that walk by gaits; absent, their own choice (`move`'s rules). */
  readonly gait?: GaitName;
}

/** What a guarding hand covers: where the threat is, and the place of its own body it is kept from; world, m. */
export interface Cover {
  readonly threat: Vec3;
  readonly guarded: Vec3;
  /** Optional observed arrival time limits the guard's shared tracking duration. */
  readonly seconds?: number;
}

/** No hand covers anything: each holds the guard's pose. */
export const NO_COVER: Intent["guard"] = Object.freeze({});

/** Standing in guard, facing `face`. */
export const standIntent = (face = 0): Intent => ({ move: null, face, guard: NO_COVER, actions: [] });

/**
 * **What one option of a set a mind selected asks this step**: the resources it claims while it
 * runs (`*`, the whole body), what its asks hold (`Sight.needs`), and its asks: the walk and facing
 * where it claims the legs, its actions and its hands' covers.
 */
export interface SelectedAsk {
  readonly claims: readonly Resource[];
  readonly holds: readonly Resource[];
  readonly asked: Omit<Intent, "guard"> & { readonly guard?: Readonly<Record<string, Cover>> };
}

/** Whether `claims` hold the legs, the whole body holding every resource. */
const claimsLegs = (claims: readonly Resource[]): boolean => claims.includes("legs") || claims.includes("*");

/**
 * **The intent of a set selected** (`SelectedAsk`, a mind's intent as the options it selected): the
 * asks of the first member that claims the legs, its walk and facing, else `idle`'s; every member's
 * actions; and every member's covers of a hand no member's asks hold.
 */
export function intentOfSet(set: readonly SelectedAsk[], idle: () => Omit<Intent, "guard" | "actions">): Intent {
  let legs: SelectedAsk["asked"] | null = null;
  const actions: ActionRequest[] = [], held: Resource[] = [], guard: Record<string, Cover> = {};
  for (const { claims, holds, asked } of set) {
    for (const action of asked.actions) actions.push(action);
    for (const resource of holds) if (!held.includes(resource)) held.push(resource);
    if (asked.guard) Object.assign(guard, asked.guard);
    if (legs === null && claimsLegs(claims)) legs = asked;
  }
  for (const hand of Object.keys(guard)) if (held.includes(hand)) delete guard[hand];
  return { ...(legs ?? idle()), actions, guard: { ...NO_COVER, ...guard } };
}
