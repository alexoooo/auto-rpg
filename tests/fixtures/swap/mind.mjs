/**
 * **The swap fixture's entrants**: the game's fighter and options fighter under kinds of their own,
 * every part chosen by its config, their stubs their own parts (`Controller.parts`). They are
 * registered from here by one list line each (`kinds.mjs`), as an entrant's folder is.
 */
import { MOVE, OPTIONS, RECIPE_FIGHTER, STAND_UP } from "../../../src/core/mind/config.ts";
import { FIGHTER_MIND } from "../../../src/core/mind/fighter-kind.ts";
import { OPTIONS_MIND } from "../../../src/core/mind/options/kind.ts";
import { STRAIGHT_NAVIGATION } from "./straight-navigation.mjs";
import { STUB_GUARD } from "./stub-guard.mjs";
import { STUB_SUPPORT } from "./stub-support.mjs";
import { STUB_BLOW } from "./stub-blow.mjs";
import { STUB_MOTOR } from "./stub-motor.mjs";
import { STUB_LEGS } from "./stub-legs.mjs";
import { STUB_RULE } from "./stub-rule.mjs";
import { STUB_TACTICS } from "./stub-tactics.mjs";
import { STUB_BEHAVIOUR } from "./stub-behaviour.mjs";
import { STUB_REFLEX } from "./stub-reflex.mjs";
import { STUB_SUB } from "./stub-sub.mjs";
import { STUB_TECHNIQUE } from "./stub-technique.mjs";
import { STUB_TAKEOVER } from "./stub-takeover.mjs";
import { STUB_BALANCE } from "./stub-balance.mjs";
import { GAME_MOTOR } from "../../../src/core/mind/kit.ts";

/** Where a stub behaviour goes: after the fighter's own. */
const BEHAVIOUR_AT = RECIPE_FIGHTER.tactics.list.length;

/**
 * Each converted role's stub: the part, the fixture mind that owns it (`mind`), `place` putting it
 * alone in that mind's game config, the path of the slot it is placed at (`at`), and `read`
 * finding its state in the mind's or its body's. Stubs are placed in this order, so a later one
 * may wrap what an earlier placed (the stub legs walk by Move with the stub rule).
 */
export const STUBS = Object.freeze([
  { part: STRAIGHT_NAVIGATION, mind: "swap-stub", at: "navigation", place: (config) => ({ ...config, navigation: STRAIGHT_NAVIGATION.defaults }), read: (state) => state.navigation },
  { part: STUB_GUARD, mind: "swap-stub", at: "guard", place: (config) => ({ ...config, guard: STUB_GUARD.defaults }), read: (state) => state.guard },
  { part: STUB_SUPPORT, mind: "swap-stub", at: "support", place: (config) => ({ ...config, support: STUB_SUPPORT.defaults }), read: (state) => state.support },
  { part: STUB_BLOW, mind: "swap-stub", at: "executors.0", place: (config) => ({ ...config, executors: [STUB_BLOW.defaults] }), read: (state) => state.actions.executors[0] },
  { part: STUB_MOTOR, mind: "swap-stub", at: "motor", place: (config) => ({ ...config, motor: STUB_MOTOR.defaults }), read: (_mind, body) => body.mind.host.motor },
  { part: STUB_RULE, mind: "swap-stub", at: "locomotion.rules.0", place: (config) => ({ ...config, locomotion: { ...MOVE, rules: [STUB_RULE.defaults], otherwise: "braced" } }), read: (state) => state.legs.walk.rules[0] },
  { part: STUB_LEGS, mind: "swap-stub", at: "locomotion", place: (config) => ({ ...config, locomotion: { ...STUB_LEGS.defaults, walk: config.locomotion } }), read: (state) => state.legs },
  { part: STUB_TACTICS, mind: "swap-stub", at: "tactics", place: (config) => ({ ...config, tactics: { ...config.tactics, kind: STUB_TACTICS.defaults.kind } }), read: (state) => state.tactics },
  { part: STUB_BEHAVIOUR, mind: "swap-stub", at: `tactics.list.${BEHAVIOUR_AT}`, place: (config) => ({ ...config, tactics: { ...config.tactics, list: [...config.tactics.list, STUB_BEHAVIOUR.defaults] } }),
    read: (state) => state.tactics.inner.behaviours[BEHAVIOUR_AT] },
  { part: STUB_TECHNIQUE, mind: "swap-stub", at: "subs.0.techniques.1", place: (config) => ({ ...config, subs: [{ ...STAND_UP, techniques: [...STAND_UP.techniques, STUB_TECHNIQUE.defaults] }] }),
    read: (_mind, body) => body.mind.subs[0].techniques["stub-technique"] },
  { part: STUB_TAKEOVER, mind: "swap-stub", at: `subs.${RECIPE_FIGHTER.subs.length}`, place: (config) => ({ ...config, subs: [...config.subs, STUB_TAKEOVER.defaults] }),
    read: (_mind, body) => body.mind.subs.find((sub) => sub?.stub === "stub-takeover") },
  { part: STUB_SUB, mind: "swap-options", at: `subs.${OPTIONS.subs.length}`, place: (config) => ({ ...config, subs: [...config.subs, STUB_SUB.defaults] }),
    read: (state) => state.tactics.options[OPTIONS.subs.length].mind },
  { part: STUB_REFLEX, mind: "swap-options", at: "reflexes.0", place: (config) => ({ ...config, reflexes: [STUB_REFLEX.defaults] }), read: (state) => state.tactics.reflexes.own[0] },
  { part: STUB_BALANCE, mind: "swap-options", at: "motor.balance", place: (config) => ({ ...config, motor: { ...GAME_MOTOR, balance: STUB_BALANCE.defaults } }),
    read: (_mind, body) => body.mind.host.motor.stance },
].map(Object.freeze));

/** Each fixture mind's game config: where its stubs are placed one at a time. */
export const GAME_CONFIGS = Object.freeze({ "swap-stub": RECIPE_FIGHTER, "swap-options": OPTIONS });

/** A fixture mind's config: `base` under `kind`, every stub of its own placed, then `more`. */
const withStubs = (kind, base, more) => Object.freeze({ ...STUBS.filter((stub) => stub.mind === kind).reduce((config, stub) => stub.place(config), base), kind, ...more });

/** The fighter fixture: every stub of its own at once, its one blow the stub executor's, standing up once down. */
export const SWAP_DEFAULTS = withStubs("swap-stub", RECIPE_FIGHTER, {
  actions: Object.freeze([{ name: "stub-blow", executor: STUB_BLOW.defaults.name, effectors: ["hand.right", "hand.left"] }]),
});

/** The options fixture: the options fighter with its reflex and down stubs. */
export const SWAP_OPTIONS_DEFAULTS = withStubs("swap-options", OPTIONS, {});

/** The stubs a fixture mind owns. */
const own = (kind) => Object.freeze(STUBS.filter((stub) => stub.mind === kind).map((stub) => stub.part));

export const SWAP_MIND = Object.freeze({
  ...FIGHTER_MIND, label: "Swap stubs", stage: "experimental", defaults: SWAP_DEFAULTS, presets: Object.freeze({}), parts: own("swap-stub"),
});

export const SWAP_OPTIONS_MIND = Object.freeze({
  ...OPTIONS_MIND, label: "Swap options", stage: "experimental", defaults: SWAP_OPTIONS_DEFAULTS, presets: Object.freeze({}), parts: own("swap-options"),
});
