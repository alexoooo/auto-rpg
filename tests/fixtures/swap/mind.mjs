/**
 * **The swap fixture's entrant**: the game's fighter under a kind of its own, every part chosen by
 * its config, its stubs its own parts (`Controller.parts`). It is registered from here by one list
 * line (`kinds.mjs`), as an entrant's folder is.
 */
import { RECIPE_FIGHTER, STAND_UP } from "../../../src/core/mind/config.ts";
import { FIGHTER_MIND } from "../../../src/core/mind/fighter-kind.ts";
import { STRAIGHT_NAVIGATION } from "./straight-navigation.mjs";
import { STUB_GUARD } from "./stub-guard.mjs";
import { STUB_SUPPORT } from "./stub-support.mjs";
import { STUB_BLOW } from "./stub-blow.mjs";
import { STUB_MOTOR } from "./stub-motor.mjs";
import { STUB_LEGS } from "./stub-legs.mjs";
import { STUB_TACTICS } from "./stub-tactics.mjs";
import { STUB_BEHAVIOUR } from "./stub-behaviour.mjs";

/**
 * Each converted role's stub: the part, `place` putting it alone in a fighter's config, the path of
 * the slot it is placed at (`at`), and `read` finding its state in the mind's or its body's.
 */
export const STUBS = Object.freeze([
  { part: STRAIGHT_NAVIGATION, at: "navigation", place: (config) => ({ ...config, navigation: STRAIGHT_NAVIGATION.defaults }), read: (state) => state.navigation },
  { part: STUB_GUARD, at: "guard", place: (config) => ({ ...config, guard: STUB_GUARD.defaults }), read: (state) => state.guard },
  { part: STUB_SUPPORT, at: "support", place: (config) => ({ ...config, support: STUB_SUPPORT.defaults }), read: (state) => state.support },
  { part: STUB_BLOW, at: "executors.0", place: (config) => ({ ...config, executors: [STUB_BLOW.defaults] }), read: (state) => state.actions.executors[0] },
  { part: STUB_MOTOR, at: "motor", place: (config) => ({ ...config, motor: STUB_MOTOR.defaults }), read: (_mind, body) => body.mind.host.motor },
  { part: STUB_LEGS, at: "locomotion", place: (config) => ({ ...config, locomotion: STUB_LEGS.defaults }), read: (state) => state.legs },
  { part: STUB_TACTICS, at: "tactics", place: (config) => ({ ...config, tactics: { ...config.tactics, kind: STUB_TACTICS.defaults.kind } }), read: (state) => state.tactics },
  { part: STUB_BEHAVIOUR, at: `tactics.list.${RECIPE_FIGHTER.tactics.list.length}`, place: (config) => ({ ...config, tactics: { ...config.tactics, list: [...config.tactics.list, STUB_BEHAVIOUR.defaults] } }),
    read: (state) => state.tactics.inner.behaviours[RECIPE_FIGHTER.tactics.list.length] },
].map(Object.freeze));

/** The fixture mind: every stub at once, its one blow the stub executor's, standing up once down. */
export const SWAP_DEFAULTS = Object.freeze({
  ...STUBS.reduce((config, stub) => stub.place(config), RECIPE_FIGHTER), kind: "swap-stub", subs: Object.freeze([STAND_UP]),
  actions: Object.freeze([{ name: "stub-blow", executor: STUB_BLOW.defaults.name, effectors: ["hand.right", "hand.left"], regions: [{ kind: "mark", mark: "high" }], aim: { kind: "centre", lead: 0 } }]),
});

export const SWAP_MIND = Object.freeze({
  ...FIGHTER_MIND, label: "Swap stubs", stage: "experimental", defaults: SWAP_DEFAULTS, presets: Object.freeze({}),
  parts: Object.freeze(STUBS.map((stub) => stub.part)),
});
