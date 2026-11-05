import type { MindDescription } from "./description.ts";
import type { AttributeOverrides } from "../core/bodies/character-attributes.ts";
import type { Pose } from "../core/bodies/spec/pose.ts";
import type { BodySpec } from "../core/bodies/spec/body.ts";
import type { MindConfig } from "./config.ts";
import type { BodyHost } from "./host.ts";
import type { MindMade, MindWiring } from "./minds.ts";
import type { KeysOf, Part } from "../parts/parts.ts";
import type { PartLookup } from "../parts/lookup.ts";

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

declare module "../parts/lookup.ts" {
  interface RoleParts {
    readonly mind: Controller;
  }
}
