import type { ActionRequest, Readiness, TargetRef, Window } from "../skills/action.ts";
import type { SkillReport } from "../skills/skills.ts";
import type { BodySpec } from "../spec/body.ts";
import type { ActionConfig } from "./config.ts";
import type { Cover, Intent } from "./intent.ts";
import { directMovement } from "./movement.ts";
import type { Orders } from "./orders.ts";
import type { KeysOf, Part, PartConfig } from "../parts/parts.ts";
import { bodyClearance } from "./sensed-bounds.ts";
import type { BodySense } from "./senses.ts";
import type { Sight } from "./tactics.ts";

/** One action, by one effector, at one region of the focus: what the behaviours' selection ranks and waits on. */
export interface Candidate {
  readonly key: string;
  readonly action: string;
  readonly effector: string;
  readonly target: Extract<TargetRef, { kind: "body" }>;
  readiness: Readiness;
  readonly estimate?: { readonly unit: "opening" | "net"; readonly value: number };
  readonly eligible: boolean;
}

/** What a behaviour asks of the legs: the intent's walking and facing. */
type Footwork = Pick<Intent, "move" | "face" | "lower" | "destination" | "movement" | "pace" | "walk" | "travelFacing">;

/** Footwork checks the next half metre and keeps feet clear of each fallen segment; a band of distance it holds within, m. */
export const SPACE = Object.freeze({ margin: .08, ahead: .5, band: .1, fallen: .9 });

/** How far a body of `spec` keeps its centre from a solid, m: its sensed clearance and `SPACE.margin`. */
export const footRadius = (spec: BodySpec): number => bodyClearance(spec) + SPACE.margin;

/** A walk along the ground direction (`x`, `z`), facing `face`, at the speed rule's speed under `ceiling`. */
export const walking = (x: number, z: number, face: number, ceiling: number | undefined): Footwork =>
  ({ move: null, face, ...(x === 0 && z === 0 ? {} : { movement: directMovement(x, z) }), ...(ceiling === undefined ? {} : { pace: ceiling }) });

/** Config and requests own their plain data independently of editable caller objects. */
export function structuredConfig<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => structuredConfig(item)) as T;
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, structuredConfig(item)])) as T;
  return value;
}

/**
 * **A turn of the behaviours**: what the tactics read once this control step, and the intent the
 * behaviours fill in rank order. A part an earlier behaviour set (`legs`, `requested`, either
 * hand's cover) is the earlier one's: a later behaviour fills only what is still unset.
 */
export interface Turn {
  readonly sight: Sight;
  readonly dt: number;
  /** A person's orders, if any. */
  readonly orders: Orders | null;
  /** The opponent the behaviours share, if any. */
  readonly focus: BodySense | null;
  /** From the body's centre to the focus's, on the ground, m (0 with none). */
  readonly dx: number;
  readonly dz: number;
  /** The heading that faces the focus, or the body's own with none, rad. */
  readonly face: number;
  /** The pace ordered, m/s, if any. */
  readonly pace: number | undefined;
  /** The candidate the selection is pursuing, if any (`choose`). */
  readonly pending: Candidate | undefined;
  legs: Footwork | undefined;
  requested: readonly ActionRequest[] | undefined;
  left: Cover | null | undefined;
  right: Cover | null | undefined;
  /** Whether evasive footwork owns the legs, independently of the display phase. */
  evading: boolean;
  /** The pending action's entry window when approach owns the legs. */
  approach: Window | null;
  /** What the tactics report doing (`Tactics.engagement`). */
  phase: string;
  /** The candidates in the selection's order. */
  ranked(): readonly Candidate[];
  /** `candidate`'s readiness read again, and kept on it. */
  recheck(candidate: Candidate): Readiness;
  /** Pursue `candidate` from now (`pending`), its patience counted from when it was first chosen. */
  choose(candidate: Candidate): void;
  /** A request to start `candidate`, its instance awaited by the selection. */
  start(candidate: Candidate): ActionRequest;
  /** End every behaviour's positioning under way (`Behaviour.interrupted`): a person's order took the legs. */
  interrupt(): void;
}

/** What a behaviour is made for: the body, and the actions its mind may choose among. */
interface BehaviourMaking {
  readonly spec: BodySpec;
  readonly actions: readonly ActionConfig[];
}

/** **A behaviour**: one part of the shared intent, filled in its turn (`Turn`), with its own memory. */
export interface Behaviour {
  /** Its memory (`src/core/state.ts`), held in the tactics' state. */
  readonly state?: object;
  decide(turn: Turn): void;
  /** An action of the body's has ended (`SkillReport.ledger`). */
  ended?(record: SkillReport["ledger"][number]): void;
  /** The focus or the ordered region changed. */
  refocus?(): void;
  /** Positioning under way ends: the body is out, or a person's order took the legs. */
  interrupted?(): void;
}

/** **A kind of behaviour**: a part of role `behaviour` that owns its config's type, keys, faults and memory, and makes itself. */
export interface BehaviourPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "behaviour";
  readonly keys: KeysOf<C>;
  make(making: BehaviourMaking, config: C): Behaviour;
}

/** Faults of a behaviour whose numeric settings are distances or durations: each finite and nonnegative. */
export function nonnegative(config: PartConfig): readonly string[] {
  const faults: string[] = [];
  for (const [key, value] of Object.entries(config)) if (key !== "kind" && typeof value === "number" && (!Number.isFinite(value) || value < 0)) faults.push(`${key} must be finite and nonnegative`);
  return faults;
}
