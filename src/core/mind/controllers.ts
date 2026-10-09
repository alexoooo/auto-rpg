import { commandable } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { REPTILE_BITE, REPTILE_CRAWL, REPTILE_TROT, REPTILE_MOTOR, REPTILE_TRAVEL } from "../reptile/tuning.ts";
import { createQuadrupedMind, quadrupedFits } from "../reptile/mind.ts";
import type { BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import type { World } from "../world.ts";
import { BRAWLER, CLASSIC, COMBAT, KICKER, QUADRUPED, SCRAPPER, type MindConfig, type PathFighterConfig, type RecipeFighterConfig } from "./config.ts";
import { createDirectBody, directFaults } from "./direct.ts";
import { choice, down, number, toggle, type ControllerField } from "./fields.ts";
import type { Minded, MindWiring } from "./minds.ts";
import { createPathFighter, pathFaults } from "./path-fighter.ts";
import { createRecipeFighter, recipeFaults } from "./recipe-fighter.ts";

/** **A controller**: a kind of mind, the bodies it can drive, what is wrong with a config, its named configs, a person's settings and how it is made. */
interface Controller<C extends MindConfig> {
  /** Whether a body of `spec` can carry out what a mind of `config` commands. */
  fits(spec: BodySpec, config: C): boolean;
  /** What is wrong with `config`, each a sentence; none for a config this controller can make a mind of. */
  faults(config: C): readonly string[];
  /** Its named configs, by the id the Arena's picker and a link's `control=` use; ids are unique across controllers. */
  readonly presets: Readonly<Record<string, { readonly label: string; readonly config: C }>>;
  /** The fields of its config a person may change, each in the panel and the link, in the order shown. */
  readonly fields: readonly ControllerField<C>[];
  create(built: BuiltBody, world: World, config: C, wiring: MindWiring): Minded;
}

/** The recipe fighter's settings: how it guards, what it aims at, how near it comes, and what it does when down. */
const RECIPE_FIELDS: readonly ControllerField<RecipeFighterConfig>[] = Object.freeze([
  choice<RecipeFighterConfig, "guard">("guard", "Guard", [["pose", "Hold the pose"], ["cover", "Cover the threat"]]),
  choice<RecipeFighterConfig, "aim">("aim", "Aim", [["head", "The head"], ["pays", "What pays"]]),
  choice<RecipeFighterConfig, "range">("range", "Range", [["close", "Walk in"], ["edge", "Hold at the edge"]]),
  down<RecipeFighterConfig>(),
]);

/**
 * The path fighter's settings: the config's player fields, and what it does when down. The
 * spacing's bounds are numeric settings, the most a panel offers: what a fighter can do with them
 * is `validRangeLearning`'s.
 */
const PATH_FIELDS: readonly ControllerField<PathFighterConfig>[] = Object.freeze([
  choice<PathFighterConfig, "hands">("hands", "Hands", [["alternate", "Both in turn"], ["right", "Right"], ["left", "Left"]]),
  choice<PathFighterConfig, "strikes">("strikes", "Blows", [["linear", "Straight"], ["mixed", "Straight and hooks"], ["vertical", "With overhands"], ["boxing", "With uppercuts"]]),
  choice<PathFighterConfig, "prefers">("prefers", "Target", [["head", "The head"], ["body", "The body"]]),
  choice<PathFighterConfig, "defence">("defence", "Defence", [["cover", "Cover"], ["predictive", "Predictive cover"]]),
  toggle<PathFighterConfig, "kicks">("kicks", "Kicks"),
  toggle<PathFighterConfig, "ground">("ground", "On the ground"),
  choice<PathFighterConfig, "combinations">("combinations", "Combinations", [["none", "None"], ["follow-up", "Follow-up"], ["overlap", "Overlap"]]),
  number<PathFighterConfig, "spacing">("spacing", "Spacing", 0, 1, .05, "m"),
  number<PathFighterConfig, "spacingStep">("spacingStep", "Spacing learnt", 0, .2, .01, "m"),
  down<PathFighterConfig>(),
]);

/**
 * **Every controller, by its mind's kind**: the one place a kind is made, matched to a body and
 * offered by name. A kind without an entry does not compile.
 */
export const CONTROLLERS: { readonly [K in MindConfig["kind"]]: Controller<Extract<MindConfig, { kind: K }>> } = Object.freeze({
  "recipe-fighter": {
    fits: commandable,
    faults: recipeFaults,
    presets: deepFreeze({ classic: { label: "Classic fighter", config: CLASSIC } }),
    fields: RECIPE_FIELDS,
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
    fields: PATH_FIELDS,
    create: createPathFighter,
  },
  quadruped: {
    fits: quadrupedFits,
    faults: config => Object.entries(config.tuning?.bite ?? {}).flatMap(([key, value]) =>
      !(key in REPTILE_BITE) || !Number.isFinite(value) || (key === "closeRate" || key === "biteInset" || key === "contactAt" || key === "biteLead" || key === "neckRetract" ? value < 0 : value <= 0)
      || key === "open" && value > REPTILE_BITE.open || key === "contactAt" && value > 1 || key === "biteSamples" && !Number.isInteger(value)
        ? [`invalid bite setting ${key}`] : []),
    presets: deepFreeze({ crawl: { label: "Crawl and bite", config: QUADRUPED } }),
    fields: [],
    create: (built, world, config, wiring) => createQuadrupedMind(built, world, wiring,
      { crawl: REPTILE_CRAWL, trot: REPTILE_TROT, motor: REPTILE_MOTOR, travel: REPTILE_TRAVEL,
        bite: deepFreeze({ ...REPTILE_BITE, ...config.tuning?.bite }) }),
  },
  direct: {
    fits: () => true,
    faults: directFaults,
    presets: {},
    fields: [],
    create: (built, world, config, wiring) => ({ kind: "direct", body: createDirectBody(built, world, config, wiring), state: {} }),
  },
});

/** Every controller's presets by id (`Controller.presets`), in the controllers' order. */
export const PRESETS: Readonly<Record<string, { readonly label: string; readonly config: MindConfig }>> =
  Object.freeze(Object.assign({}, ...Object.values(CONTROLLERS).map((controller) => controller.presets)));

/** The settings a person may change on `config` (`Controller.fields`), by its controller. */
export const fieldsOf = <C extends MindConfig>(config: C): readonly ControllerField<C>[] => controllerOf(config).fields;

/** The controller of `config`'s kind; a thrown error for a kind no controller has, read from a save or a link. */
export function controllerOf<C extends MindConfig>(config: C): Controller<C> {
  const controller = (CONTROLLERS as Readonly<Record<string, unknown>>)[config.kind];
  if (!controller) throw new Error(`no mind of kind ${JSON.stringify(config.kind)}`);
  return controller as Controller<C>;
}
