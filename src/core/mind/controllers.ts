import { commandable } from "../body.ts";
import type { Pose } from "../control/motor.ts";
import { REPTILE_BITE, REPTILE_CRAWL, REPTILE_TROT, REPTILE_MOTOR, REPTILE_TRAVEL } from "../reptile/tuning.ts";
import { quadrupedMind, quadrupedFits } from "../reptile/mind.ts";
import { guardPosture } from "../skills/guard.ts";
import type { BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import { BEHAVIOURS, CLASSIC, COUNTER_PUNCHER, OPTIONS, PUNCHER, QUADRUPED, RECIPE_FIGHTER, SCRAPPER, type DirectMindConfig, type MindConfig, type OptionsConfig } from "./config.ts";
import { directFaults, directPolicy } from "./direct.ts";
import { createFighter, fighterFaults } from "./fighter.ts";
import { actionConfigFaults } from "./action-config.ts";
import type { MindMade, MindWiring } from "./minds.ts";
import type { BodyHost } from "./host.ts";
import { slotList, slotOne, type Part, type Slot } from "./parts.ts";
import { createOptionsFighter, optionsFit } from "./options/mind.ts";
import { OBEDIENCE, TERMS, WEIGHTS } from "./options/value.ts";
import type { PartField } from "./fields.ts";

/**
 * **A controller**: a kind of mind, as a part (`Part`) of role `mind`, with its named configs, the
 * posture its body is built in and how it is made: from a host of its body (`BodyHost`), never the
 * world or the built body, its config and the fight's wiring.
 */
interface Controller<C extends MindConfig> extends Part<C> {
  /** Its named configs, by the id the Arena's picker and a link's `control=` use; ids are unique across controllers. */
  readonly presets: Readonly<Record<string, { readonly label: string; readonly config: C }>>;
  /**
   * The posture a body of `spec` under a mind of `config` is built in (`poseAngles`): the one
   * its mind holds from its first step, so that no joint is flung into it. `REFERENCE` builds the
   * spec's reference pose.
   */
  builtIn(spec: BodySpec, config: C): Pose;
  create(host: BodyHost, config: C, wiring: MindWiring): MindMade;
}

/** The joint-feedback mind as it starts, a numeric setting: no target named, so every joint is driven to zero, within its range. */
const DIRECT: DirectMindConfig = deepFreeze({ kind: "direct", targets: {}, seconds: .1, speed: 1, activation: 1 });

/** No posture: a body built in its spec's reference pose. */
const REFERENCE: Pose = Object.freeze({});

/**
 * A fighter's slots: its tactics, a skill of each role, a kick and low support if it has them,
 * and the sub-minds it hands its body to when down, in rank order (`subs`).
 */
const FIGHTER_SLOTS: readonly Slot[] = Object.freeze([
  slotOne("tactics", "Tactics", "tactics"), slotOne("locomotion", "Walk", "locomotion"), slotOne("guard", "Guard", "guard"),
  slotList("executors", "Executors", "executor"), slotOne("support", "Low support", "support", true),
  slotList("subs", "When down", "sub-mind"),
]);

/**
 * The options fighter's obedience (`OBEDIENCE`): a choice written as the weight of its orders, the
 * steady level as no weight written, so the preset is unchanged; a weight that is no level reads
 * as none of them.
 */
const OBEDIENCE_FIELD: PartField<OptionsConfig> = {
  kind: "choice", key: "weights", label: "Obedience", options: OBEDIENCE.map(([value, name]) => [value, name] as const),
  read: (config) => OBEDIENCE.find(([, , orders]) => orders === (config.weights?.orders ?? WEIGHTS.orders))?.[0] ?? "",
  write: (config, text) => {
    const level = OBEDIENCE.find(([value]) => value === text);
    if (!level) return null;
    const { orders: _, ...others } = config.weights ?? {}, weights = level[2] === WEIGHTS.orders ? others : { ...others, orders: level[2] };
    const { weights: __, ...rest } = config;
    return Object.keys(weights).length > 0 ? { ...rest, weights } : rest;
  },
};

/**
 * **Every controller, by its mind's kind**: the one place a kind is made, matched to a body and
 * offered by name. A kind without an entry does not compile.
 */
export const CONTROLLERS: { readonly [K in MindConfig["kind"]]: Controller<Extract<MindConfig, { kind: K }>> } = Object.freeze({
  options: {
    role: "mind", label: "Options fighter", stage: "game", fields: [OBEDIENCE_FIELD], slots: [], defaults: OPTIONS, tuning: ["cover", "combination", "body", "opening", "driven", "hold"],
    fits: optionsFit,
    faults: config => [
      ...[undefined, "valued", "ranked"].includes(config.meta) ? [] : ["meta: valued or ranked"],
      ...Object.entries(config.weights ?? {}).flatMap(([term, weight]) => TERMS.includes(term as typeof TERMS[number]) && Number.isFinite(weight) && weight >= 0 ? [] : [`weights.${term}: a term (${TERMS.join(", ")}) of a finite weight, not negative`]),
      ...(["cover", "combination", "body", "opening", "driven", "hold"] as const).flatMap((name) => ["undefined", "boolean"].includes(typeof config.tuning?.[name]) ? [] : [`tuning.${name}: true or false`]),
    ],
    presets: deepFreeze({ options: { label: "Options fighter", config: OPTIONS } }),
    builtIn: guardPosture,
    create: createOptionsFighter,
  },
  fighter: {
    role: "mind", label: "Fighter", stage: "game", fields: [], slots: FIGHTER_SLOTS, defaults: RECIPE_FIGHTER,
    fits: (spec, config) => commandable(spec) && actionConfigFaults(spec, config.executors, config.actions).length === 0,
    faults: fighterFaults,
    presets: deepFreeze({
      classic: { label: "Classic fighter", config: CLASSIC },
      puncher: { label: "Puncher", config: PUNCHER },
      counter: { label: "Counter-puncher", config: COUNTER_PUNCHER },
      scrapper: { label: "Scrapper", config: SCRAPPER },
      behaviours: { label: "Behaviours", config: BEHAVIOURS },
    }),
    builtIn: guardPosture,
    create: createFighter,
  },
  quadruped: {
    role: "mind", label: "Quadruped", stage: "game", fields: [], slots: [], defaults: QUADRUPED, tuning: ["bite"],
    fits: quadrupedFits,
    faults: config => Object.entries(config.tuning?.bite ?? {}).flatMap(([key, value]) =>
      !(key in REPTILE_BITE) || !Number.isFinite(value) || (key === "closeRate" || key === "biteInset" || key === "contactAt" || key === "biteLead" || key === "neckRetract" ? value < 0 : value <= 0)
      || key === "open" && value > REPTILE_BITE.open || key === "contactAt" && value > 1 || key === "biteSamples" && !Number.isInteger(value)
        ? [`invalid bite setting ${key}`] : []),
    presets: deepFreeze({ crawl: { label: "Crawl and bite", config: QUADRUPED } }),
    builtIn: () => REFERENCE,
    create: (host, config, wiring) => quadrupedMind(host, wiring,
      { crawl: REPTILE_CRAWL, trot: REPTILE_TROT, motor: REPTILE_MOTOR, travel: REPTILE_TRAVEL,
        bite: deepFreeze({ ...REPTILE_BITE, ...config.tuning?.bite }) }),
  },
  direct: {
    role: "mind", label: "Joint feedback", stage: "experimental", fields: [], slots: [], defaults: DIRECT,
    fits: () => true,
    faults: directFaults,
    presets: {},
    builtIn: () => REFERENCE,
    create: (host, config) => { host.policy(directPolicy(config)); return { kind: "direct", state: {} }; },
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
