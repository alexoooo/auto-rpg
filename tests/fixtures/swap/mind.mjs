/**
 * **The swap fixture's entrant** (`SWAP`): the toolkit's Option Mind under an experimental kind
 * of its own (`swap:option`), over its own kit or the quadruped's frame, a stub of each converted
 * role as its own parts (`swap:<kind>`), and presets holding its stubs, every part chosen by its
 * config. It is registered from here by one list line (`kinds.mjs`), as an entrant's folder is.
 */
import { MOVE } from "../../../src/core/skills/locomotion/move-part.ts";
import { OPTION_MIND } from "../../../src/core/option/mind.ts";
import { RISE_OPTIONS } from "../../../src/core/option/rise.ts";
import { QUADRUPED } from "../../../src/core/reptile/config.ts";
import { QUADRUPED_VALUED } from "../../../src/core/reptile/frame.ts";
import { QUADRUPED_OPTIONS } from "../../../src/core/reptile/options.ts";
import { AIMED, STUB_AIM } from "./stub-aim.mjs";
import { STUB_JAW, STUB_PAW_MOTOR, STUB_STALK, STUB_TROT } from "./stub-quadruped.mjs";
import { OPTION_PRESETS } from "../../../src/entrants/option/mind.ts";
import { STRAIGHT_NAVIGATION } from "./straight-navigation.mjs";
import { STUB_GUARD } from "./stub-guard.mjs";
import { STUB_SUPPORT } from "./stub-support.mjs";
import { STUB_BLOW } from "./stub-blow.mjs";
import { STUB_MOTOR } from "./stub-motor.mjs";
import { STUB_LEGS } from "./stub-legs.mjs";
import { STUB_RULE } from "./stub-rule.mjs";
import { STUB_OPTION } from "./stub-option.mjs";
import { STUB_CHOOSER } from "./stub-chooser.mjs";
import { STUB_OBJECTIVE } from "./stub-objective.mjs";
import { STUB_PERCEPT } from "./stub-percept.mjs";
import { STUB_PREDICTION } from "./stub-prediction.mjs";
import { STUB_TECHNIQUE } from "./stub-technique.mjs";
import { STUB_BALANCE } from "./stub-balance.mjs";
import { GAME_MOTOR } from "../../../src/core/mind/kit.ts";

/** Option Mind as its entrant plays it. */
const OPTION_DEFAULTS = OPTION_PRESETS.option.config;


/** Option Mind's first aimed action, where the stub aim goes. */
const AIM_AT = OPTION_DEFAULTS.actions.findIndex((action) => action.aim?.kind === "surface");

/** Where a stub technique goes: a way up of its own after Option Mind's options (`WAY_UP_OPTION`), so its skill is the last its body makes. */
const TECHNIQUE_AT = OPTION_DEFAULTS.options.length;


/**
 * Each converted role's stub: the part, the fixture preset that holds it (`mind`), `place` putting it
 * alone in that preset's game config, the path of the slot it is placed at (`at`), and `read`
 * finding its state in the mind's or its body's. Stubs are placed in this order, so a later one
 * may wrap what an earlier placed (the stub legs walk by Move with the stub rule).
 */
export const STUBS = Object.freeze([
  { part: STRAIGHT_NAVIGATION, mind: "swap-stub", at: "navigation", place: (config) => ({ ...config, navigation: STRAIGHT_NAVIGATION.defaults }), read: (state) => state.skills.navigation },
  { part: STUB_GUARD, mind: "swap-stub", at: "guard", place: (config) => ({ ...config, guard: STUB_GUARD.defaults }), read: (state) => state.skills.guard },
  { part: STUB_SUPPORT, mind: "swap-stub", at: "support", place: (config) => ({ ...config, support: STUB_SUPPORT.defaults }), read: (state) => state.skills.support },
  { part: STUB_BLOW, mind: "swap-stub", at: "executors.0", place: (config) => ({ ...config, executors: [STUB_BLOW.defaults] }), read: (state) => state.skills.actions.executors[0] },
  { part: STUB_MOTOR, mind: "swap-stub", at: "motor", place: (config) => ({ ...config, motor: STUB_MOTOR.defaults }), read: (_mind, body) => body.mind.host.motor },
  { part: STUB_RULE, mind: "swap-stub", at: "locomotion.rules.0", place: (config) => ({ ...config, locomotion: { ...MOVE, rules: [STUB_RULE.defaults], otherwise: "braced" } }), read: (state) => state.skills.legs.legs.walk.rules[0] },
  { part: STUB_LEGS, mind: "swap-stub", at: "locomotion", place: (config) => ({ ...config, locomotion: { ...STUB_LEGS.defaults, walk: config.locomotion } }), read: (state) => state.skills.legs.legs },
  { part: STUB_TECHNIQUE, mind: "swap-stub", at: `options.${TECHNIQUE_AT}.technique`,
    place: (config) => ({ ...config, options: [...config.options, { kind: "way-up", technique: STUB_TECHNIQUE.defaults }] }),
    read: (state) => state.skills.actions.executors.at(-1).run },
  { part: STUB_CHOOSER, mind: "swap-option", at: "chooser", place: (config) => ({ ...config, chooser: STUB_CHOOSER.defaults }), read: (state) => state.decider.chooser.counts },
  ...[[STUB_OBJECTIVE, (objective) => objective], [STUB_PERCEPT, (objective) => objective.percept], [STUB_PREDICTION, (objective) => objective.prediction]].map(([part, of]) => (
    { part, mind: "swap-option", at: "chooser.objective", place: (config) => ({ ...config, chooser: { ...config.chooser, objective: STUB_OBJECTIVE.defaults } }),
      read: (state) => of(state.decider.chooser.inner.objective) })),
  // The stub alone beside the rise's options, which a mind needs to get up by (`RISE_OPTIONS`).
  { part: STUB_OPTION, mind: "swap-option", at: "options.0", place: (config) => ({ ...config, options: [STUB_OPTION.defaults, ...RISE_OPTIONS] }),
    read: (state) => state.decider.options.find((option) => option.counts).counts },
  { part: STUB_BALANCE, mind: "swap-option", at: "motor.balance", place: (config) => ({ ...config, motor: { ...GAME_MOTOR, balance: STUB_BALANCE.defaults } }),
    read: (_mind, body) => body.mind.host.motor.stance },
  { part: STUB_AIM, mind: "swap-option", at: `actions.${AIM_AT}.aim`,
    place: (config) => ({ ...config, actions: config.actions.map((action, i) => i === AIM_AT ? { ...action, aim: STUB_AIM.defaults } : action) }), read: () => AIMED },
  ...[["motor", STUB_PAW_MOTOR, "motor"], ["travel", STUB_TROT, "travel"], ["bite", STUB_JAW, "bite"], ["tactics", STUB_STALK, "stalk"]].map(([at, part, held]) => (
    { part, mind: "swap-quadruped", at: `frame.${at}`, place: (config) => ({ ...config, frame: { ...config.frame, [at]: part.defaults } }), read: (_mind, body) => body.mind.host[held] })),
].map(Object.freeze));

/** Option Mind over the quadruped's frame, as the reptile's entrant plays it: every layer the stock one, by worth over the quadruped's options. */
const OVER_QUADRUPED = Object.freeze({ kind: "option", frame: QUADRUPED, chooser: QUADRUPED_VALUED.defaults, options: QUADRUPED_OPTIONS });

/** Each fixture preset's game config: where its stubs are placed one at a time. */
export const GAME_CONFIGS = Object.freeze({ "swap-stub": OPTION_DEFAULTS, "swap-option": OPTION_DEFAULTS, "swap-quadruped": OVER_QUADRUPED });

/** Each fixture preset's kind of mind: the toolkit's under the swap entrant's scope. */
const KINDS = Object.freeze({ "swap-stub": "swap:option", "swap-option": "swap:option", "swap-quadruped": "swap:option" });

/** A fixture preset's config: `base` under its kind (`KINDS`), every stub of `preset` placed, then `more`. */
const withStubs = (preset, base, more) => Object.freeze({ ...STUBS.filter((stub) => stub.mind === preset).reduce((config, stub) => stub.place(config), base), kind: KINDS[preset], ...more });

/** The body-layer fixture: Option Mind with every body-layer stub at once, its one blow the stub executor's, rising by the game's techniques and the stub's. */
export const SWAP_DEFAULTS = withStubs("swap-stub", OPTION_DEFAULTS, {
  actions: Object.freeze([{ name: "stub-blow", executor: STUB_BLOW.defaults.name, effectors: ["hand.right", "hand.left"] }]),
});

/** The Option Mind fixture: Option Mind with its chooser, option, balance and aim stubs. */
export const SWAP_OPTION_DEFAULTS = withStubs("swap-option", OPTION_DEFAULTS, {});

/** The quadruped fixture: Option Mind over the quadruped's frame, its motor, trot, bite and stalk each a stub. */
export const SWAP_QUADRUPED_DEFAULTS = withStubs("swap-quadruped", OVER_QUADRUPED, {});

/** Option Mind's straight punch alone: a bare-hand source on the Warrior. */
const UNARMED = Object.freeze({ ...OPTION_DEFAULTS, kind: "swap:option",
  executors: OPTION_DEFAULTS.executors.filter((executor) => executor.name === "punch"), actions: OPTION_DEFAULTS.actions.filter((action) => action.executor === "punch") });

/** A toolkit mind `mind` as the swap entrant's experimental kind, starting as `defaults`. */
const swapMind = (mind, label, defaults) => Object.freeze({ ...mind, label, stage: "experimental", defaults });

/** **The swap entrant**: its kind of mind, every stub, and a preset of each fixture beside a calibrated bare-hand source, which exposes loadout widening independently of production kits, and one scoped to the Skeleton, a named calibration narrower than the bodies its config fits. */
export const SWAP = Object.freeze({
  name: "swap",
  minds: Object.freeze([swapMind(OPTION_MIND, "Swap Option Mind", SWAP_OPTION_DEFAULTS)]),
  parts: Object.freeze([...new Set(STUBS.map((stub) => stub.part))]),
  presets: Object.freeze({
    "swap-stub": Object.freeze({ label: "Swap stubs", config: SWAP_DEFAULTS, models: Object.freeze(["workshop-fighter"]) }),
    "swap-unarmed": Object.freeze({ label: "Swap bare-hand scope", config: UNARMED, models: Object.freeze(["workshop-fighter"]) }),
    "swap-skeleton": Object.freeze({ label: "Swap Skeleton scope", config: Object.freeze({ ...OPTION_DEFAULTS, kind: "swap:option" }), models: Object.freeze(["crypt-skeleton"]) }),
    "swap-option": Object.freeze({ label: "Swap Option Mind", config: SWAP_OPTION_DEFAULTS }),
    "swap-quadruped": Object.freeze({ label: "Swap quadruped", config: SWAP_QUADRUPED_DEFAULTS }),
  }),
});
