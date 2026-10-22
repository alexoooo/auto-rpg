import { commandable } from "../../body.ts";
import { actionConfigFaults, armedActions } from "../../mind/action-config.ts";
import { FIGHTING, MOVE, STAND_UP, type FighterConfig } from "../../mind/config.ts";
import { controller } from "../../mind/controller.ts";
import { createFighter, fighterFaults } from "../../mind/fighter.ts";
import { slotList, slotOne } from "../../mind/parts.ts";
import { guardPosture } from "../../skills/guard.ts";
import { STRAIGHT_PUNCH } from "../../skills/straight-punch.ts";
import { deepFreeze } from "../../state.ts";

interface VanguardConfig extends Omit<FighterConfig, "kind"> { readonly kind: "vanguard" }

/** A body punch with a longer approach and trunk lead, behind an anticipatory free-hand guard. */
const VANGUARD: VanguardConfig = deepFreeze({
  kind: "vanguard", locomotion: MOVE, guard: { kind: "shield-guard" }, support: null, subs: [STAND_UP],
  tactics: { ...FIGHTING, list: [
    { kind: "follow-orders" }, { kind: "clear-of-walls" }, { kind: "clear-of-fallen" },
    { kind: "break-clinch", metres: .7 }, { kind: "attack" }, { kind: "approach" }, { kind: "cover", guard: "ward" },
  ] },
  executors: [{ name: "punch", kind: "straight-punch", ...STRAIGHT_PUNCH,
    reach: .95, band: .18, through: .12, settle: .08, recover: .3, longest: .35, follow: .05,
    lean: .1, hips: .3, turn: .55, lead: .1, chamber: .22 }],
  actions: [{ name: "strike", executor: "punch", effectors: ["hand.right", "hand.left"],
    regions: [{ kind: "mark", mark: "middle" }], aim: { kind: "surface", tuning: {} } }],
});

/** The shared fighter runs the entrant's own immutable kit and tactics. */
const fighter = (config: VanguardConfig): FighterConfig => ({ ...config, kind: "fighter" });

/** Vanguard is an independent entrant, with every skill exposed through the shared mind editor. */
export const VANGUARD_MIND = controller<VanguardConfig>({
  role: "mind", label: "Vanguard", stage: "experimental", defaults: VANGUARD, fields: [],
  slots: [slotOne("navigation", "Navigation", "navigation", true), slotOne("tactics", "Tactics", "tactics"),
    slotOne("locomotion", "Walk", "locomotion"), slotOne("guard", "Guard", "guard"), slotList("executors", "Executors", "executor"),
    slotOne("support", "Low support", "support", true), slotList("subs", "When down", "sub-mind"),
    slotOne("motor", "Motor control", "motor", true)],
  keys: { kind: true, tactics: true, locomotion: true, navigation: true, guard: true, executors: true, actions: true,
    support: true, subs: true, motor: true },
  fits: (spec, config) => commandable(spec) && actionConfigFaults(spec, config.executors, config.actions).length === 0
    && armedActions(spec, config.executors, config.actions).length > 0,
  strikes: (spec, config) => armedActions(spec, config.executors, config.actions).flatMap(action => action.effectors),
  faults: config => fighterFaults(fighter(config)),
  presets: deepFreeze({ vanguard: { label: "Vanguard", config: VANGUARD } }),
  builtIn: guardPosture,
  create: (host, config, wiring) => createFighter(host, fighter(config), wiring),
});
