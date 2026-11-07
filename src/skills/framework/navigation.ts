import type { GaitLimits } from "./locomotion-part.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { MovementRequest, GroundPoint } from "./movement.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { KeysOf, Part, PartConfig } from "../../parts/parts.ts";
import type { Senses } from "../../core/bodies/senses.ts";
import type { BodyView } from "../../control/body.ts";

/** **A navigation's config**, by registered kind. */
export interface NavigationConfigs {}
export type NavigationConfig = NavigationConfigs[keyof NavigationConfigs];

export type NavigationStatus = "stopped" | "moving" | "arrived" | "unreachable" | "stalled" | "unavailable" | "lost-focus";

/** Navigation reports observed progress separately from the existence of a geometric route. */
export interface NavigationReport {
  /** The request the rest of the report is of: the last one asked, which may be a mind's rather than an order's. */
  readonly request: MovementRequest | null;
  readonly status: NavigationStatus;
  readonly remaining: number | null;
  readonly goal: GroundPoint | null;
  readonly route: readonly GroundPoint[];
}

type Point = { readonly x: number; readonly y: number; readonly z: number };
type Turn = Point & { readonly w: number };

/**
 * What a navigator sees of its body and the world each step: the time, the stance, what it senses,
 * where its parts are and how its hands are shaped (what it carries is kept clear with them), and
 * its heading.
 */
export interface NavigationSight {
  readonly view: {
    readonly time: number;
    readonly stance: { readonly centre: Point; readonly velocity: { readonly x: number; readonly z: number }; readonly support?: { readonly y: number } };
    readonly senses: Pick<Senses, "solids" | "others" | "side">;
    readonly segments?: Readonly<Record<string, { readonly position: Point; readonly rotation: Turn }>>;
    readonly configurations?: Readonly<Record<string, { readonly applied: string }>>;
    readonly root?: { readonly position: Point; readonly rotation: Turn };
    readonly effectors?: Readonly<Record<string, { readonly points: Readonly<Record<string, Point>>; readonly rotation: Turn }>>;
  };
  readonly report: { readonly heading: number };
}

/**
 * A navigator's step: the walk this step, forward and to the right in the heading's frame, m/s, or
 * none; the way to face, or none; how far the walk has left to go, m, where it is going somewhere;
 * and, standing at the place it was taken to, that place, world (x, z), m, which the legs hold the
 * centre of mass over (`Intent.rest`).
 */
export interface NavigationStep {
  readonly move: readonly [number, number] | null;
  readonly face: number | null;
  readonly destination?: number;
  readonly rest?: readonly [number, number];
}

/**
 * **Keeping clear of the solids sensed**, as a planner asks it of its body's navigator
 * (`Navigator`): a walk kept clear over the next stretch, and the way out of a solid's clearance
 * the body stands in. Replacing the navigator replaces both for every planner.
 */
export interface Clearance {
  /** `move` (forward, right, m/s) for a body heading `heading`, or the nearest to it that keeps clear of the solids sensed; null to stand. */
  keepClear(view: BodyView, heading: number, move: readonly [number, number] | null): readonly [number, number] | null;
  /** The ground direction out of a solid's clearance the body stands in, or null where it stands in none. */
  exit(view: BodyView): readonly [number, number] | null;
}

/**
 * **A navigator**: what turns a movement request into a walk. It owns the geometry and its memory
 * of progress; whoever asks keeps facing and its priorities. Its `state` is plain data
 * (`src/core/state.ts`); its `report` reads it.
 */
export interface Navigator extends Clearance {
  readonly state: object;
  readonly report: NavigationReport;
  /**
   * The walk toward `request` this step at the speed rule's speed (`travelSpeed`) for `gait`
   * under `ceiling`, and the way it goes, or none where it is not `available`.
   */
  step(sight: NavigationSight, request: MovementRequest | null, gait: GaitLimits, ceiling: number, dt: number, available?: boolean): NavigationStep;
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

/** The navigator explicitly selected by the calling composition. */
export function navigatorOf(parts: PartLookup, spec: BodySpec, config: PartConfig): Navigator {
  return parts.of("navigation", config).make(spec, config);
}

declare module "../../parts/lookup.ts" {
  interface RoleParts {
    readonly navigation: NavigatorPart;
  }
}
