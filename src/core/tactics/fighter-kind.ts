import { actionConfigFaults, armedActions } from "./action-config.ts";
import { BLADE_FIGHTER } from "../mind/config.ts";
import type { FighterConfig } from "./config.ts";
import { controller } from "../mind/controller.ts";
import { createFighter, driveFighter, kitBody, fighterFaults } from "./fighter.ts";
import { GAME_MOTOR } from "../mind/kit.ts";
import { GAME_NAVIGATION } from "../navigation/navigator.ts";
import { fitsAll, slotList, slotOne, takesCommands, type Slot } from "../parts/parts.ts";

/**
 * A fighter's slots: its navigation, its tactics, a skill of each role, its executors, low support
 * if it has it, the sub-minds it hands its body to when down, in rank order (`subs`), and the motor
 * control under its skills.
 */
const FIGHTER_SLOTS: readonly Slot[] = Object.freeze([
  slotOne("navigation", "Navigation", "navigation", true, GAME_NAVIGATION),
  slotOne("tactics", "Tactics", "tactics"), slotOne("locomotion", "Walk", "locomotion"), slotOne("guard", "Guard", "guard"),
  slotList("executors", "Executors", "executor"), slotOne("support", "Low support", "support", true),
  slotList("subs", "When down", "sub-mind"), slotOne("motor", "Motor control", "motor", true, GAME_MOTOR),
]);

/** **The fighter** (`createFighter`): tactics over skills of each role, built from its slots. */
export const FIGHTER_MIND = controller<FighterConfig>({
  role: "mind", label: "Fighter", stage: "game", fields: [], slots: FIGHTER_SLOTS, defaults: BLADE_FIGHTER,
  keys: { kind: true, tactics: true, navigation: true, locomotion: true, guard: true, executors: true, actions: true, support: true, subs: true, motor: true },
  fits: fitsAll<FighterConfig>(takesCommands, (spec, config, parts) => actionConfigFaults(parts, spec, config.executors, config.actions)[0] ?? null),
  strikes: (spec, config, parts) => config.actions.length === 0 ? undefined : armedActions(parts, spec, config.executors, config.actions).flatMap((action) => action.effectors),
  faults: fighterFaults,
  builtIn: (spec, config, parts) => parts.of("guard", config.guard).posture(spec, config.guard),
  scripted: { body: kitBody, drive: driveFighter },
  create: createFighter,
});
