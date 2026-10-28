import { deepFreeze } from "../../state.ts";
import { armedActions } from "../action-config.ts";
import { OPTIONS, type OptionsConfig } from "../config.ts";
import { controller } from "../controller.ts";
import { kitFaults } from "../fighter.ts";
import { GAME_MOTOR } from "../kit.ts";
import { GAME_NAVIGATION } from "../navigator.ts";
import { slotList, slotOne, type Slot } from "../parts.ts";
import { createOptionsFighter, optionsFit } from "./mind.ts";

/** The options fighter's slots: its chooser, a skill of each role, as a fighter's, and the motor control under its skills. */
const OPTIONS_SLOTS: readonly Slot[] = Object.freeze([
  slotOne("chooser", "Chooser", "chooser"),
  slotOne("navigation", "Navigation", "navigation", true, GAME_NAVIGATION),
  slotOne("locomotion", "Walk", "locomotion"), slotOne("guard", "Guard", "guard"), slotList("executors", "Executors", "executor"),
  slotOne("support", "Low support", "support", true),
  slotOne("motor", "Motor control", "motor", true, GAME_MOTOR), slotList("subs", "Down", "sub-mind"),
]);

/** **The options fighter** (`createOptionsFighter`): a chooser over options, chosen among by their worth or rank. */
export const OPTIONS_MIND = controller<OptionsConfig>({
  role: "mind", label: "Options fighter", stage: "game", obeys: true, phases: { guard: "Guarding" }, fields: [], slots: OPTIONS_SLOTS, defaults: OPTIONS,
  keys: { kind: true, chooser: true, navigation: true, locomotion: true, guard: true, executors: true, actions: true, support: true, motor: true, subs: true },
  fits: optionsFit,
  strikes: (spec, config, parts) => config.actions.length === 0 ? undefined : armedActions(parts, spec, config.executors, config.actions).flatMap((action) => action.effectors),
  faults: (config, parts) => [
    ...config.subs.flatMap((sub, i) => parts.of("sub-mind", sub).down ? [] : [`subs.${i}: ${parts.of("sub-mind", sub).label} cannot be a down option`]),
    ...kitFaults(config, parts),
  ],
  presets: deepFreeze({ options: { label: "Options fighter", config: OPTIONS } }),
  builtIn: (spec, config, parts) => parts.of("guard", config.guard).posture(spec, config.guard),
  create: createOptionsFighter,
});
