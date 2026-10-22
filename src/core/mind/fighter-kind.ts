import { guardPosture } from "../skills/guard.ts";
import { deepFreeze } from "../state.ts";
import { actionConfigFaults, armedActions } from "./action-config.ts";
import { BEHAVIOURS, CLASSIC, COUNTER_PUNCHER, DUELLIST, PUNCHER, RECIPE_FIGHTER, SCRAPPER, type FighterConfig } from "./config.ts";
import { controller } from "./controller.ts";
import { createFighter, fighterFaults } from "./fighter.ts";
import { fitsAll, slotList, slotOne, takesCommands, type Slot } from "./parts.ts";

/**
 * A fighter's slots: its navigation, its tactics, a skill of each role, its executors, low support
 * if it has it, the sub-minds it hands its body to when down, in rank order (`subs`), and the motor
 * control under its skills.
 */
const FIGHTER_SLOTS: readonly Slot[] = Object.freeze([
  slotOne("navigation", "Navigation", "navigation", true, "Visibility routes"),
  slotOne("tactics", "Tactics", "tactics"), slotOne("locomotion", "Walk", "locomotion"), slotOne("guard", "Guard", "guard"),
  slotList("executors", "Executors", "executor"), slotOne("support", "Low support", "support", true),
  slotList("subs", "When down", "sub-mind"), slotOne("motor", "Motor control", "motor", true, "Whole-body solve"),
]);

/** **The fighter** (`createFighter`): tactics over skills of each role, built from its slots. */
export const FIGHTER_MIND = controller<FighterConfig>({
  role: "mind", label: "Fighter", stage: "game", fields: [], slots: FIGHTER_SLOTS, defaults: RECIPE_FIGHTER,
  keys: { kind: true, tactics: true, navigation: true, locomotion: true, guard: true, executors: true, actions: true, support: true, subs: true, motor: true },
  fits: fitsAll<FighterConfig>(takesCommands, (spec, config, parts) => actionConfigFaults(parts, spec, config.executors, config.actions)[0] ?? null),
  strikes: (spec, config, parts) => config.actions.length === 0 ? undefined : armedActions(parts, spec, config.executors, config.actions).flatMap((action) => action.effectors),
  faults: fighterFaults,
  presets: deepFreeze({
    classic: { label: "Classic fighter", config: CLASSIC },
    puncher: { label: "Puncher", config: PUNCHER },
    counter: { label: "Counter-puncher", config: COUNTER_PUNCHER },
    scrapper: { label: "Scrapper", config: SCRAPPER },
    behaviours: { label: "Behaviours", config: BEHAVIOURS },
    duellist: { label: "Duellist", config: DUELLIST },
  }),
  builtIn: guardPosture,
  create: createFighter,
});
