import { commandable } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { createQuadrupedMind, quadrupedFits } from "../reptile/mind.ts";
import type { BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import type { World } from "../world.ts";
import { BRAWLER, CLASSIC, COMBAT, KICKER, QUADRUPED, SCRAPPER, type MindConfig } from "./config.ts";
import { createDirectBody, directFaults } from "./direct.ts";
import type { Minded, MindWiring } from "./minds.ts";
import { createPathFighter, pathFaults } from "./path-fighter.ts";
import { createRecipeFighter, recipeFaults } from "./recipe-fighter.ts";

/** **A controller**: a kind of mind, the bodies it can drive, what is wrong with a config, its named configs and how it is made. */
interface Controller<C extends MindConfig> {
  /** Whether a body of `spec` can carry out what a mind of `config` commands. */
  fits(spec: BodySpec, config: C): boolean;
  /** What is wrong with `config`, each a sentence; none for a config this controller can make a mind of. */
  faults(config: C): readonly string[];
  /** Its named configs, by the id the Arena's picker and a link's `control=` use; ids are unique across controllers. */
  readonly presets: Readonly<Record<string, { readonly label: string; readonly config: C }>>;
  create(built: BuiltBody, world: World, config: C, wiring: MindWiring): Minded;
}

/**
 * **Every controller, by its mind's kind**: the one place a kind is made, matched to a body and
 * offered by name. A kind without an entry does not compile.
 */
export const CONTROLLERS: { readonly [K in MindConfig["kind"]]: Controller<Extract<MindConfig, { kind: K }>> } = Object.freeze({
  "recipe-fighter": {
    fits: commandable,
    faults: recipeFaults,
    presets: deepFreeze({ classic: { label: "Classic fighter", config: CLASSIC } }),
    create: createRecipeFighter,
  },
  "path-fighter": {
    fits: commandable,
    faults: pathFaults,
    presets: deepFreeze({
      combat: { label: "Combat (experimental)", config: COMBAT },
      brawler: { label: "Brawler (experimental)", config: BRAWLER },
      scrapper: { label: "Scrapper (experimental)", config: SCRAPPER },
      kicker: { label: "Kicker (experimental)", config: KICKER },
    }),
    create: createPathFighter,
  },
  quadruped: {
    fits: quadrupedFits,
    faults: () => [],
    presets: deepFreeze({ crawl: { label: "Crawl and bite", config: QUADRUPED } }),
    create: (built, world, _config, wiring) => createQuadrupedMind(built, world, wiring),
  },
  direct: {
    fits: () => true,
    faults: directFaults,
    presets: {},
    create: (built, world, config, wiring) => ({ kind: "direct", body: createDirectBody(built, world, config, wiring), state: {} }),
  },
});

/** Every controller's presets by id (`Controller.presets`), in the controllers' order. */
export const PRESETS: Readonly<Record<string, { readonly label: string; readonly config: MindConfig }>> =
  Object.freeze(Object.assign({}, ...Object.values(CONTROLLERS).map((controller) => controller.presets)));

/** The controller of `config`'s kind; a thrown error for a kind no controller has, read from a save or a link. */
export function controllerOf<C extends MindConfig>(config: C): Controller<C> {
  const controller = (CONTROLLERS as Readonly<Record<string, unknown>>)[config.kind];
  if (!controller) throw new Error(`no mind of kind ${JSON.stringify(config.kind)}`);
  return controller as Controller<C>;
}
