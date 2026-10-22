import { deepFreeze } from "../../state.ts";
import { armedActions } from "../action-config.ts";
import { OPTIONS, type OptionsConfig } from "../config.ts";
import { controller } from "../controller.ts";
import type { PartField } from "../fields.ts";
import { kitFaults } from "../fighter.ts";
import { slotList, slotOne, type Slot } from "../parts.ts";
import { createOptionsFighter, optionsFit } from "./mind.ts";
import { OBEDIENCE, TERMS, WEIGHTS } from "./value.ts";

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

/** The options fighter's slots: a skill of each role, as a fighter's, its reflexes in rank order, and the motor control under its skills. */
const OPTIONS_SLOTS: readonly Slot[] = Object.freeze([
  slotOne("navigation", "Navigation", "navigation", true, "Visibility routes"),
  slotOne("locomotion", "Walk", "locomotion"), slotOne("guard", "Guard", "guard"), slotList("executors", "Executors", "executor"),
  slotOne("support", "Low support", "support", true), slotList("reflexes", "Reflexes", "reflex"),
  slotOne("motor", "Motor control", "motor", true, "Whole-body solve"), slotList("subs", "Down", "sub-mind"),
]);

/** **The options fighter** (`createOptionsFighter`): a meta-controller over options, chosen among by their worth. */
export const OPTIONS_MIND = controller<OptionsConfig>({
  role: "mind", label: "Options fighter", stage: "game", obeys: true, phases: { guard: "Guarding" }, fields: [OBEDIENCE_FIELD], slots: OPTIONS_SLOTS, defaults: OPTIONS,
  keys: { kind: true, meta: true, weights: true, navigation: true, locomotion: true, guard: true, executors: true, actions: true, support: true, reflexes: true, motor: true, subs: true },
  fits: optionsFit,
  strikes: (spec, config, parts) => config.actions.length === 0 ? undefined : armedActions(parts, spec, config.executors, config.actions).flatMap((action) => action.effectors),
  faults: (config, parts) => [
    ...config.subs.flatMap((sub, i) => parts.of("sub-mind", sub).down ? [] : [`subs.${i}: ${parts.of("sub-mind", sub).label} cannot be a down option`]),
    ...[undefined, "valued", "ranked"].includes(config.meta) ? [] : ["meta: valued or ranked"],
    ...Object.entries(config.weights ?? {}).flatMap(([term, weight]) => TERMS.includes(term as typeof TERMS[number]) && Number.isFinite(weight) && weight >= 0 ? [] : [`weights.${term}: a term (${TERMS.join(", ")}) of a finite weight, not negative`]),
    ...kitFaults(config, parts),
  ],
  presets: deepFreeze({ options: { label: "Options fighter", config: OPTIONS } }),
  builtIn: (spec, config, parts) => parts.of("guard", config.guard).posture(spec, config.guard),
  create: createOptionsFighter,
});
