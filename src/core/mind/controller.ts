import type { AttributeOverrides } from "../character-attributes.ts";
import type { Body, BodyOptions } from "../body.ts";
import type { Clock } from "../clock.ts";
import type { Pose } from "../control/motor.ts";
import type { Skills } from "../skills/skills.ts";
import type { BodySpec } from "../spec/body.ts";
import type { FighterConfig, MindConfig } from "./config.ts";
import type { BodyHost } from "./host.ts";
import type { MindMade, MindWiring } from "./minds.ts";
import type { KeysOf, Part, PartConfig } from "./parts.ts";
import type { PartLookup } from "./lookup.ts";
import type { Tactics } from "./tactics.ts";

/**
 * A named configuration, optionally calibrated for particular body models and played on a
 * character it chooses: `character` the attributes its bodies take (`toes`), beneath any a person
 * or a link sets.
 */
export interface MindPreset<C extends MindConfig = MindConfig> {
  readonly label: string;
  readonly config: C;
  readonly models?: readonly BodySpec["model"][];
  readonly character?: AttributeOverrides;
  /** False: kept off the Arena's and the Crypt's menus (`offered`), which a link, an evaluation or a test may still name. */
  readonly offered?: false;
}

/** Whether `preset` is listed in the Arena's and the Crypt's menus (`MindPreset.offered`). */
export const offered = (preset: Pick<MindPreset, "offered">): boolean => preset.offered !== false;

/** Whether a named calibration is offered for this model; a custom configuration has its own fit. */
export const presetFitsModel = (preset: Pick<MindPreset, "models">, model: BodySpec["model"]): boolean =>
  preset.models === undefined || preset.models.includes(model);

/**
 * How a scene drives a mind by a script of its own in its tactics' place (the Lab's modes, a fall
 * on the stand bed): the options its body is made with, and the drive that hands the body its
 * skills under the script (`MindWiring.script`). A mind that takes a script has a fighter's slots.
 */
export interface Scripted {
  body(config: FighterConfig, wiring: MindWiring, parts: PartLookup): BodyOptions;
  drive(body: Body, clock: Clock, parts: PartLookup, config: FighterConfig, wiring: MindWiring, around?: (tactics: Tactics) => Tactics): Skills;
}

/**
 * **A controller**: a kind of mind, as a part (`Part`) of role `mind`, with the keys its config
 * may hold, its named configs, the posture its body is built in and how it is made: from a host of
 * its body (`BodyHost`), never the world or the built body, its config and the fight's wiring.
 */
export interface Controller<C extends MindConfig = MindConfig> extends Part<C> {
  readonly keys: KeysOf<C>;
  /** Its named configs, by the id the Arena's picker and a link's `control=` use; ids are unique across controllers. */
  readonly presets: Readonly<Record<string, MindPreset<C>>>;
  /**
   * The posture a body of `spec` under a mind of `config` is built in (`poseAngles`): the one
   * its mind holds from its first step, so that no joint is flung into it: a fighting mind's is its
   * guard's (`GuardPart.posture`), which `parts` finds. `NO_POSTURE` builds the spec's reference pose.
   */
  builtIn(spec: BodySpec, config: C, parts: PartLookup): Pose;
  /**
   * Its own parts, each of a role below a mind: offered only in its own minds' slots
   * (`kindsFor`), a fault in another mind's tree (`treeFaults`), and its own code, which a case
   * holds only where it plays this mind (`caseCoder`).
   */
  readonly parts?: readonly Part[];
  /** How a scene drives it by a script (`Scripted`); absent where it takes none. */
  readonly scripted?: Scripted;
  /** A config of it driven by a drill's `tactics`; absent, a drill puts them in its `tactics` slot (`drilledBy`). */
  drilled?(config: C, tactics: PartConfig): C;
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
