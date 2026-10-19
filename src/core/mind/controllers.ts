import { commandable } from "../body.ts";
import { REPTILE_BITE, REPTILE_CRAWL, REPTILE_TROT, REPTILE_MOTOR, REPTILE_TRAVEL } from "../reptile/tuning.ts";
import { quadrupedMind, quadrupedFits } from "../reptile/mind.ts";
import { guardPosture } from "../skills/guard.ts";
import { deepFreeze } from "../state.ts";
import { BEHAVIOURS, CLASSIC, COUNTER_PUNCHER, OPTIONS, PUNCHER, QUADRUPED, RECIPE_FIGHTER, SCRAPPER, type FighterConfig, type MindConfig, type OptionsConfig, type QuadrupedConfig } from "./config.ts";
import { controller, NO_POSTURE, type Controller } from "./controller.ts";
import { DIRECT_MIND } from "../entrants/direct/mind.ts";
import { createFighter, fighterFaults } from "./fighter.ts";
import { actionConfigFaults } from "./action-config.ts";
import { slotList, slotOne, type Slot } from "./parts.ts";
import { createOptionsFighter, optionsFit } from "./options/mind.ts";
import { OBEDIENCE, TERMS, WEIGHTS } from "./options/value.ts";
import type { PartField } from "./fields.ts";

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

/** **The options fighter** (`createOptionsFighter`): a meta-controller over options, chosen among by their worth. */
const OPTIONS_MIND = controller<OptionsConfig>({
  role: "mind", label: "Options fighter", stage: "game", fields: [OBEDIENCE_FIELD], slots: [], defaults: OPTIONS, tuning: ["cover", "combination", "body", "opening", "driven", "hold"],
  keys: { kind: true, meta: true, weights: true, tuning: true },
  fits: optionsFit,
  faults: config => [
    ...[undefined, "valued", "ranked"].includes(config.meta) ? [] : ["meta: valued or ranked"],
    ...Object.entries(config.weights ?? {}).flatMap(([term, weight]) => TERMS.includes(term as typeof TERMS[number]) && Number.isFinite(weight) && weight >= 0 ? [] : [`weights.${term}: a term (${TERMS.join(", ")}) of a finite weight, not negative`]),
    ...(["cover", "combination", "body", "opening", "driven", "hold"] as const).flatMap((name) => ["undefined", "boolean"].includes(typeof config.tuning?.[name]) ? [] : [`tuning.${name}: true or false`]),
  ],
  presets: deepFreeze({ options: { label: "Options fighter", config: OPTIONS } }),
  builtIn: guardPosture,
  create: createOptionsFighter,
});

/** **The fighter** (`createFighter`): tactics over skills of each role, built from its slots. */
const FIGHTER_MIND = controller<FighterConfig>({
  role: "mind", label: "Fighter", stage: "game", fields: [], slots: FIGHTER_SLOTS, defaults: RECIPE_FIGHTER,
  keys: { kind: true, tactics: true, locomotion: true, guard: true, executors: true, actions: true, support: true, subs: true },
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
});

/** **The quadruped** (`quadrupedMind`): crawling, biting and righting itself on four paws. */
const QUADRUPED_MIND = controller<QuadrupedConfig>({
  role: "mind", label: "Quadruped", stage: "game", fields: [], slots: [], defaults: QUADRUPED, tuning: ["bite"],
  keys: { kind: true, tuning: true },
  fits: quadrupedFits,
  faults: config => Object.entries(config.tuning?.bite ?? {}).flatMap(([key, value]) =>
    !(key in REPTILE_BITE) || !Number.isFinite(value) || (key === "closeRate" || key === "biteInset" || key === "contactAt" || key === "biteLead" || key === "neckRetract" ? value < 0 : value <= 0)
    || key === "open" && value > REPTILE_BITE.open || key === "contactAt" && value > 1 || key === "biteSamples" && !Number.isInteger(value)
      ? [`invalid bite setting ${key}`] : []),
  presets: deepFreeze({ crawl: { label: "Crawl and bite", config: QUADRUPED } }),
  builtIn: () => NO_POSTURE,
  create: (host, config, wiring) => quadrupedMind(host, wiring,
    { crawl: REPTILE_CRAWL, trot: REPTILE_TROT, motor: REPTILE_MOTOR, travel: REPTILE_TRAVEL,
      bite: deepFreeze({ ...REPTILE_BITE, ...config.tuning?.bite }) }),
});

/**
 * **Every controller, by its mind's kind** (its defaults' `kind`), in the order a picker offers
 * them: the one place a kind is made, matched to a body and offered by name. A mind's folder
 * writes its controller (`controller`); a line here registers it. A kind twice is refused.
 */
export const CONTROLLERS: Readonly<Record<string, Controller>> = registry([OPTIONS_MIND, FIGHTER_MIND, QUADRUPED_MIND, DIRECT_MIND]);

/** `controllers` by their kinds; a thrown error for a kind twice. */
function registry(controllers: readonly Controller[]): Readonly<Record<string, Controller>> {
  const byKind: Record<string, Controller> = {};
  for (const entry of controllers) {
    if (Object.hasOwn(byKind, entry.defaults.kind)) throw new Error(`two minds of kind ${JSON.stringify(entry.defaults.kind)}`);
    byKind[entry.defaults.kind] = entry;
  }
  return Object.freeze(byKind);
}

/** Every controller's presets by id (`Controller.presets`), in the controllers' order. */
export const PRESETS: Readonly<Record<string, { readonly label: string; readonly config: MindConfig }>> =
  Object.freeze(Object.assign({}, ...Object.values(CONTROLLERS).map((entry) => entry.presets)));

/** The controller of `config`'s kind; a thrown error for a kind no controller has, read from a save or a link. */
export function controllerOf(config: MindConfig): Controller {
  const found = Object.hasOwn(CONTROLLERS, config.kind) ? CONTROLLERS[config.kind] : undefined;
  if (!found) throw new Error(`no mind of kind ${JSON.stringify(config.kind)}`);
  return found;
}
