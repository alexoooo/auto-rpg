import type { Pose } from "../control/motor.ts";
import type { BodySpec } from "../spec/body.ts";
import type { MindConfig } from "./config.ts";
import type { BodyHost } from "./host.ts";
import type { MindMade, MindWiring } from "./minds.ts";
import type { KeysOf, Part } from "./parts.ts";

/**
 * **A controller**: a kind of mind, as a part (`Part`) of role `mind`, with the keys its config
 * may hold, its named configs, the posture its body is built in and how it is made: from a host of
 * its body (`BodyHost`), never the world or the built body, its config and the fight's wiring.
 */
export interface Controller<C extends MindConfig = MindConfig> extends Part<C> {
  readonly keys: KeysOf<C>;
  /** Its named configs, by the id the Arena's picker and a link's `control=` use; ids are unique across controllers. */
  readonly presets: Readonly<Record<string, { readonly label: string; readonly config: C }>>;
  /**
   * The posture a body of `spec` under a mind of `config` is built in (`poseAngles`): the one
   * its mind holds from its first step, so that no joint is flung into it. `NO_POSTURE` builds
   * the spec's reference pose.
   */
  builtIn(spec: BodySpec, config: C): Pose;
  create(host: BodyHost, config: C, wiring: MindWiring): MindMade;
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
