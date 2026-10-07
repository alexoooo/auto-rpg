import { commandable } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { createQuadrupedMind, quadrupedFits } from "../reptile/mind.ts";
import type { BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import type { World } from "../world.ts";
import { ARENA_BRAWLER, ARENA_FIGHTER, ARENA_KICKER, ARENA_SCRAPPER, FIGHTER, QUADRUPED, type MindConfig } from "./config.ts";
import { createDirectBody } from "./direct.ts";
import type { Minded, MindWiring } from "./minds.ts";
import { createPathFighter } from "./path-fighter.ts";
import { createRecipeFighter } from "./recipe-fighter.ts";

/** **A controller**: a kind of mind, the bodies it can drive, its named configs and how it is made. */
interface Controller<C extends MindConfig> {
  /** Whether a body of `spec` can carry out what a mind of `config` commands. */
  fits(spec: BodySpec, config: C): boolean;
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
    presets: deepFreeze({ classic: { label: "Classic fighter", config: { ...FIGHTER, subs: [{ kind: "staged-rise" as const }] } } }),
    create: createRecipeFighter,
  },
  "path-fighter": {
    fits: commandable,
    presets: deepFreeze({
      combat: { label: "Combat (experimental)", config: ARENA_FIGHTER },
      brawler: { label: "Brawler (experimental)", config: ARENA_BRAWLER },
      scrapper: { label: "Scrapper (experimental)", config: ARENA_SCRAPPER },
      kicker: { label: "Kicker (experimental)", config: ARENA_KICKER },
    }),
    create: createPathFighter,
  },
  quadruped: {
    fits: quadrupedFits,
    presets: deepFreeze({ crawl: { label: "Crawl and bite", config: QUADRUPED } }),
    create: (built, world, _config, wiring) => createQuadrupedMind(built, world, wiring),
  },
  direct: {
    fits: () => true,
    presets: {},
    create: (built, world, config, wiring) => ({ kind: "direct", body: createDirectBody(built, world, config, wiring), state: {} }),
  },
});

/** The controller of `config`'s kind; a thrown error for a kind no controller has, read from a save or a link. */
export function controllerOf<C extends MindConfig>(config: C): Controller<C> {
  const controller = (CONTROLLERS as Readonly<Record<string, unknown>>)[config.kind];
  if (!controller) throw new Error(`no mind of kind ${JSON.stringify(config.kind)}`);
  return controller as Controller<C>;
}
