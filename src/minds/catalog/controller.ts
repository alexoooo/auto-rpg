import type { BodyHost, HostGrants } from "../mind.ts";
import type { MindDescription } from "./description.ts";
import type { AttributeOverrides } from "../../core/bodies/character-attributes.ts";
import type { Pose } from "../../core/bodies/spec/pose.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { MindConfig } from "./config.ts";
import type { KeysOf, Part } from "../../parts/parts.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import type { Experiment } from "../../control/body.ts";
import type { Senses } from "../../core/bodies/senses.ts";
import type { Orders } from "../orders.ts";
import type { Skills } from "../../skills/framework/skills.ts";
import type { MindReport } from "../report.ts";

/**
 * A named configuration, optionally calibrated for particular body models and played on a
 * character it chooses: `character` the attributes its bodies take, beneath any a person or a
 * link sets.
 */
export interface MindPreset<C extends MindConfig = MindConfig> {
  readonly label: string;
  readonly config: C;
  readonly models?: readonly BodySpec["model"][];
  readonly character?: AttributeOverrides;
  /** False: kept off the Arena's and the Crypt's menus, and the Lab's where it takes no script (`offered`), which a link, an evaluation or a test may still name. */
  readonly offered?: false;
}

/** Whether `preset` is listed in the Arena's and the Crypt's menus (`MindPreset.offered`). */
export const offered = (preset: Pick<MindPreset, "offered">): boolean => preset.offered !== false;

/** Whether a named calibration is offered for this model; a custom configuration has its own fit. */
export const presetFitsModel = (preset: Pick<MindPreset, "models">, model: BodySpec["model"]): boolean =>
  preset.models === undefined || preset.models.includes(model);

/**
 * **A controller**: a kind of mind, as a part (`Part`) of role `mind`, with the keys its config
 * may hold, the posture its body is built in and how it is made: from a host of
 * its body (`BodyHost`), never the world or the built body, its config and the fight's wiring.
 */
export interface Controller<C extends MindConfig = MindConfig> extends Part<C> {
  readonly keys: KeysOf<C>;
  /**
   * The posture a body of `spec` under a mind of `config` is built in (`poseAngles`): the one
   * its mind holds from its first step, so that no joint is flung into it: a fighting mind's is its
   * guard's (`GuardPart.posture`), which `parts` finds. `NO_POSTURE` builds the spec's reference pose.
   */
  builtIn(spec: BodySpec, config: C, parts: PartLookup): Pose;
  create(host: BodyHost, config: C, wiring: MindWiring): MindMade;
  /** Configured execution capabilities and their actual component paths, where published. */
  describe?(spec: BodySpec, config: C, parts: PartLookup): MindDescription;
}

/** No posture: a body built in its spec's reference pose. */
export const NO_POSTURE: Pose = Object.freeze({});

/**
 * `entry`, checked as a controller of configs `C`, as the registry holds it (`CONTROLLERS`): a
 * mind's folder writes its controller this way, and the registry passes it each config of its kind.
 */
export function controller<C extends MindConfig>(entry: Controller<C>): Controller {
  return entry as unknown as Controller;
}

declare module "../../parts/lookup.ts" {
  interface RoleParts {
    readonly mind: Controller;
  }
}

/** **What a fight gives the mind it makes**, beside the body and the config: what it grants the body (`HostGrants`), and its orders. */
export interface MindWiring extends HostGrants {
  readonly name: string;
  /** Research settings passed to a mind that builds command layers. */
  readonly experiment?: Experiment;
  /** Its orders this step, or null when it is left to itself. `senses` are its own, this step's. */
  orders(senses: Senses): Orders | null;
}

/** **A mind as its controller makes it** (`Controller.create`): what every kind gives the fight that made it, but the body, which the fight holds from its host (`bodyHost`). */
export interface MindMade {
  /** The mind's memory above its body's (`src/core/state.ts`), saved and loaded with it. */
  readonly state: object;
  /**
   * Its skills, where it runs the game's (`Skills`): their report is what a screen or a test reads
   * of what it is doing and what holds each part of the body, and the rules never read it.
   */
  readonly skills?: Skills;
  /** What it publishes of itself (`MindReport`); none where it says nothing. */
  readonly report?: MindReport;
}
