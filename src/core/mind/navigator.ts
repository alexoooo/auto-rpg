import type { Clearance } from "./clear-step.ts";
import type { BodySpec } from "../spec/body.ts";
import type { heldClearance } from "./held-clearance.ts";
import type { MovementRequest, GroundPoint } from "./movement.ts";
import type { PartLookup } from "./lookup.ts";
import type { NAVIGATIONS } from "./navigations.ts";
import type { ConfigOf, KeysOf, Part, PartConfig } from "./parts.ts";
import type { Senses } from "./senses.ts";
import type { GaitLimits } from "./travel.ts";

/** **A navigation's config**, by kind (`NAVIGATIONS`). */
export type NavigationConfig = ConfigOf<typeof NAVIGATIONS>;

export type NavigationStatus = "stopped" | "moving" | "arrived" | "unreachable" | "stalled" | "unavailable" | "lost-focus";

/** Navigation reports observed progress separately from the existence of a geometric route. */
export interface NavigationReport {
  /** The request the rest of the report is of: the last one asked, which may be a tactic's rather than an order's. */
  readonly request: MovementRequest | null;
  readonly status: NavigationStatus;
  readonly remaining: number | null;
  readonly goal: GroundPoint | null;
  readonly route: readonly GroundPoint[];
}

/** What a navigator sees of its body and the world each step: the stance, what it senses, what it carries and its heading. */
export interface NavigationSight {
  readonly view: Parameters<ReturnType<typeof heldClearance>>[0] & {
    readonly time: number; readonly stance: { readonly centre: { readonly x: number; readonly y: number; readonly z: number }; readonly velocity: { readonly x: number; readonly z: number }; readonly support?: { readonly y: number } };
    readonly senses: Pick<Senses, "solids" | "others" | "side"> };
  readonly report: { readonly heading: number };
}

/**
 * A navigator's step: the walk this step, forward and to the right in the heading's frame, m/s, or
 * none; the way to face, or none; and how far the walk has left to go, m, where it is going somewhere.
 */
export interface NavigationStep {
  readonly move: readonly [number, number] | null;
  readonly face: number | null;
  readonly destination?: number;
}

/**
 * **A navigator**: what turns a movement request into a walk. It owns the geometry and its memory
 * of progress; whoever asks keeps facing and tactical priorities. Its `state` is plain data
 * (`src/core/state.ts`); its `report` reads it.
 */
export interface Navigator extends Clearance {
  readonly state: object;
  readonly report: NavigationReport;
  /**
   * The walk toward `request` this step at the speed rule's speed (`travelSpeed`) for `gait`
   * under `ceiling`, or none where it is not `available`; with `travelFacing`, forward where the
   * body turns to face its way.
   */
  step(sight: NavigationSight, request: MovementRequest | null, gait: GaitLimits, ceiling: number, dt: number, available?: boolean, travelFacing?: boolean): NavigationStep;
  /** `move`, in the heading's frame, kept clear of the solids sensed: a walk asked with no request. */
  steer(view: NavigationSight["view"], heading: number, move: readonly [number, number] | null): readonly [number, number] | null;
  /** Forget the route and progress: its body was taken over, put down or handed back. */
  resume(): void;
}

/**
 * **A kind of navigation**: a part of role `navigation` that owns its config's type, keys,
 * defaults, faults and fit, and makes the navigator for a body of `spec`.
 */
export interface NavigatorPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "navigation";
  readonly keys: KeysOf<C>;
  make(spec: BodySpec, config: C): Navigator;
}

/** The navigation a slot that holds none runs: Visibility routes. */
const GAME_NAVIGATION: PartConfig = Object.freeze({ kind: "visibility-navigation" });

/** **The navigator** `config` names for a body of `spec`, the game's where it names none, made by its part (`NavigatorPart.make`) as `parts` finds it. */
export function navigatorOf(parts: PartLookup, spec: BodySpec, config: PartConfig | null | undefined): Navigator {
  const chosen = config ?? GAME_NAVIGATION;
  return parts.of("navigation", chosen).make(spec, chosen);
}
