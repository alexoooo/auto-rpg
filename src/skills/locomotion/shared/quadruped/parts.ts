import type { SupportedCommand } from "../../../../control/supported-motor.ts";
import type { Part, PartConfig } from "../../../../parts/parts.ts";
import type { ReadBody, ReadSegment } from "../../../../core/bodies/read-body.ts";
import type { Skill } from "../../../framework/skill.ts";

import type { TravelOrders } from "./travel.ts";
import type { PawGaitName } from "./paw-legs.ts";
import { pawEndpoints, pawReading, type PawReading, type PawView } from "../../../../control/quadruped/paws.ts";
import type { Body } from "../../../../control/body.ts";
import { fitsPaws } from "../../../../control/quadruped/fit.ts";
import { deepFreeze } from "../../../../core/state.ts";
import { varied, type Varied } from "../../../framework/variations.ts";

/** What a quadruped reads of a gait beside its command: how its paws lift, swing and plant. */
interface GaitSettings {
  readonly lift: number;
  readonly plantSpeed: number;
  readonly plant: number;
  readonly swing: number;
}

/**
 * **How far and how fast a gait carries the body**: its fastest travel forward at its full travel
 * asked, m/s; the share of that it goes to a side or back; and its fastest turn, rad/s. What its
 * legs state of it to the speed rule and the walks that price it (`StanceEnvelope`).
 */
export interface GaitReach {
  readonly forward: number;
  readonly aside: number;
  readonly turn: number;
}

/**
 * **A gait over support chains**: where the body and each paw go this step for the travel asked
 * (`SupportedCommand`). Its state says the phase it is in (`settle` between steps), the steps it
 * has made (paws that cleared the floor), its placements (paws that landed, cleared or dragged),
 * its count of paths (`sequence`) and whether it stands.
 */
export interface Gait extends Skill<PawView> {
  readonly state: { readonly phase: string; readonly steps: number; readonly placed: number; readonly sequence: number; readonly standing: boolean };
  readonly settings: GaitSettings;
  /**
   * Where the gait keeps its swings on the ground: each swinging paw's path held where it left the
   * floor, carried against the trunk's motion and driven firm (`EffectorGoal.firm`) at this
   * tracking response, s; none, its swings go through the root frame.
   */
  readonly grounded: number | null;
  /** Whether it holds the body still as its last command left it (the motor's holding response, `SupportGoal.hold`). */
  readonly holding: boolean;
  readonly reach: GaitReach;
  /** Travel normalization, m/s, and braking acceleration, m/s^2, owned by this gait. */
  readonly travel: { readonly speed: number; readonly stopping: number };
  command(view: PawView, orders: TravelOrders, dt: number): SupportedCommand;
}

/**
 * **What a paw gait goes over**: the body `built`, its trunk `root` and the paws it stands on
 * (`names`, in the order it lifts them) as `paws` reads them.
 */
export interface PawGaitBody {
  readonly built: ReadBody;
  readonly root: ReadSegment;
  readonly paws: PawReading;
  readonly names: readonly string[];
}

/** What a paw gait of `body` goes over (`PawGaitBody`): its trunk, and its paws as its paw reader reads them (`pawReading`). */
export function pawGaitBody(body: Body): PawGaitBody {
  return { built: body.built, root: body.muscles.dynamics.root.segment, paws: pawReading(body.built), names: pawEndpoints(body.built).map((paw) => paw.segment) };
}

/** **A kind of paw gait**: a part of role `paw-gait`, made over what it goes over (`PawGaitBody`). */
export interface PawGaitPart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "paw-gait";
  /** Whether it carries the body to a place (`GaitPart.travels`). */
  readonly travels: boolean;
  /** Which of the paw legs' gaits it is (`pawLegs`): the trot to travel or the crawl close in. */
  readonly gait: PawGaitName;
  make(body: PawGaitBody, config: C): Gait;
}

/** **A paw gait's config**: its kind, its variation, and an experiment's research `tuning` over its settings `S`, none in the game. */
export interface PawGaitConfig<K extends string, S> extends Varied {
  readonly kind: K;
  readonly tuning?: Partial<S>;
}

/**
 * **A paw gait as a part** (`PawGaitPart`): the skill `kind`, called `label`, which travels as the
 * paw legs' gait `gait` on a body on three paws or more (`fitsPaws`). Its one variation, its
 * kind's name, is `make` by `settings` under its config's tuning, which `valid` admits.
 */
export function pawGaitPart<K extends string, S extends Readonly<Record<string, number>>>({ kind, label, gait, settings, valid, make }: {
  readonly kind: K; readonly label: string; readonly gait: PawGaitName; readonly settings: S;
  readonly valid: (settings: S) => boolean; readonly make: (body: PawGaitBody, settings: S) => Gait;
}): PawGaitPart<PawGaitConfig<K, S>> {
  const refusal = `invalid ${label.toLowerCase()} settings`;
  const faults = (config: PawGaitConfig<K, S>): readonly string[] => config.tuning === undefined
    || !!config.tuning && typeof config.tuning === "object" && !Array.isArray(config.tuning) && valid({ ...settings, ...config.tuning }) ? [] : [refusal];
  const variations = { [kind]: (body: PawGaitBody, config: PawGaitConfig<K, S>) => make(body, { ...settings, ...config.tuning }) };
  return deepFreeze<PawGaitPart<PawGaitConfig<K, S>>>({
    role: "paw-gait", label, stage: "game", travels: true, gait, fields: [], slots: [], defaults: { kind }, keys: { kind: true, variation: true, tuning: true },
    tuning: Object.keys(settings), ...varied({ skill: kind, label: label.toLowerCase(), variations, of: (body, config) => [body.built.spec, config],
      fits: [fitsPaws, (_spec, config) => faults(config)[0] ?? null] }),
    faults, skillGroup: "Travel",
  });
}

// The paw gaits' role, added to the roles the part lookup knows (`RoleParts`).
/** **A paw gait's config**, by registered kind. */
export interface PawGaitConfigs {}

declare module "../../../../parts/lookup.ts" {
  interface RoleParts {
    readonly "paw-gait": PawGaitPart;
  }
  interface RoleConfigs {
    readonly "paw-gait": PawGaitConfigs;
  }
}
