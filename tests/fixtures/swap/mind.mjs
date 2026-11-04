/**
 * **The swap fixture's entrant** (`SWAP`): the toolkit's Option Mind under an experimental kind
 * of its own (`swap:option`), a stub of each converted
 * role as its own parts (`swap:<kind>`), and presets holding its stubs, every part chosen by its
 * config. It is registered from here by one list line (`kinds.mjs`), as an entrant's folder is.
 */
import { GOING } from "../../../src/core/skills/locomotion/move-part.ts";
import { STOCK_GAITS } from "../../../src/core/skills/locomotion/gaits.ts";
import { WHOLE_BODY_MOTOR } from "../../../src/core/control/whole-body-motor.ts";
import { OPTION_MIND } from "../../../src/core/option/mind.ts";
import { RISE_OPTIONS } from "../../../src/core/option/rise.ts";
import { AIMED, STUB_AIM } from "./stub-aim.mjs";
import { STUB_BITE, STUB_JAW, STUB_PAW_MOTOR, STUB_TROT } from "./stub-quadruped.mjs";
import { PAW_MOVE } from "../../../src/core/reptile/paw-legs.ts";
import { OPTION_PRESETS } from "../../../src/entrants/option/mind.ts";
import { STRAIGHT_NAVIGATION } from "./straight-navigation.mjs";
import { STUB_GUARD } from "./stub-guard.mjs";
import { STUB_SUPPORT } from "./stub-support.mjs";
import { STUB_BLOW, STUB_STRIKE } from "./stub-blow.mjs";
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

/** Option Mind as its entrant plays it. */
const OPTION_DEFAULTS = OPTION_PRESETS.option.config;


/** Option Mind's straight punch, aimed by the surface: the strike the stub aim aims, after the options already placed. */
const PUNCH = OPTION_DEFAULTS.options.find((option) => option.kind === "strike-straight-punch");

/** Option Mind's first walk, the first that names the navigation every walk goes by. */
const WALK_AT = OPTION_DEFAULTS.options.findIndex((option) => option.kind === "walk");

/** Where Option Mind's first strike is: the stub strike takes the place of every strike. */
const STRIKE_AT = OPTION_DEFAULTS.options.findIndex((option) => option.kind.startsWith("strike-"));

/** Where Option Mind's bite is: the stub bite takes its place. */
const BITE_AT = OPTION_DEFAULTS.options.findIndex((option) => option.kind === "strike-jaw-bite");

/** Whether `option` is a strike (`StrikeConfig`): one that names its executor. */
const strikes = (option) => option.kind.startsWith("strike-") || option.kind === STUB_STRIKE.defaults.kind;

/** `config` with `part` passed in under its skills in `place` (`OptionMindConfig.tuning`). */
const passing = (config, place, part) => ({ ...config, tuning: { ...config.tuning, parts: { ...config.tuning?.parts, [place]: part } } });

/** The legs `config` passes in, else the game's (`GOING`). */
const legsOf = (config) => config.tuning?.parts?.legs ?? GOING;

/** Where a stub technique goes: a way up of its own after Option Mind's options (`WAY_UP_OPTION`), so its skill is the last its body makes. */
const TECHNIQUE_AT = OPTION_DEFAULTS.options.length;


/**
 * Each converted role's stub: the part, the fixture preset that holds it (`mind`), `place` putting it
 * alone in that preset's game config, the path of the slot it is placed at (`at`), and `read`
 * finding its state in the mind's or its body's. Stubs are placed in this order, so a later one
 * may wrap what an earlier placed (the stub legs walk by Move with the stub rule).
 */
export const STUBS = Object.freeze([
  { part: STRAIGHT_NAVIGATION, mind: "swap-stub", at: `options.${WALK_AT}.navigation`,
    place: (config) => ({ ...config, options: config.options.map((option) => option.kind === "walk" ? { ...option, navigation: STRAIGHT_NAVIGATION.defaults } : option) }),
    read: (state) => state.skills.navigation },
  { part: STUB_GUARD, mind: "swap-stub", at: "tuning.parts.guard", place: (config) => passing(config, "guard", STUB_GUARD.defaults), read: (state) => state.skills.guard },
  { part: STUB_BLOW, mind: "swap-stub", at: `options.${STRIKE_AT}.skill`,
    place: (config) => ({ ...config, options: [...config.options.slice(0, STRIKE_AT).filter((option) => !strikes(option)), STUB_STRIKE.defaults,
      ...config.options.slice(STRIKE_AT).filter((option) => !strikes(option))] }),
    read: (state) => state.skills.actions.executors[0] },
  { part: STUB_SUPPORT, mind: "swap-stub", at: `options.${STRIKE_AT}.support`,
    place: (config) => ({ ...config, options: config.options.map((option) => strikes(option) ? { ...option, support: STUB_SUPPORT.defaults } : option) }),
    read: (state) => state.skills.support },
  { part: STUB_MOTOR, mind: "swap-stub", at: "tuning.parts.motor", place: (config) => passing(config, "motor", STUB_MOTOR.defaults), read: (_mind, body) => body.mind.host.motor },
  { part: STUB_RULE, mind: "swap-stub", at: "tuning.parts.legs.rules.0", place: (config) => passing(config, "legs", { ...legsOf(config), rules: [STUB_RULE.defaults] }),
    read: (state) => state.skills.legs.legs.rules[0] },
  { part: STUB_LEGS, mind: "swap-stub", at: "tuning.parts.legs.gaits.0.legs",
    place: (config) => passing(config, "legs", { ...legsOf(config), gaits: STOCK_GAITS.map((gait) => gait.name === "braced" ? { ...gait, legs: STUB_LEGS.defaults } : gait) }),
    read: (state) => state.skills.legs.legs.gaits.find((gait) => gait?.stub === STUB_LEGS.defaults.kind) },
  { part: STUB_TECHNIQUE, mind: "swap-stub", at: `options.${TECHNIQUE_AT}.skill`,
    place: (config) => ({ ...config, options: [...config.options, { kind: "way-up", skill: STUB_TECHNIQUE.defaults }] }),
    read: (state) => state.skills.actions.executors.at(-1).run },
  { part: STUB_CHOOSER, mind: "swap-option", at: "chooser", place: (config) => ({ ...config, chooser: STUB_CHOOSER.defaults }), read: (state) => state.decider.chooser.counts },
  ...[[STUB_OBJECTIVE, (objective) => objective], [STUB_PERCEPT, (objective) => objective.percept], [STUB_PREDICTION, (objective) => objective.prediction]].map(([part, of]) => (
    { part, mind: "swap-option", at: "chooser.objective", place: (config) => ({ ...config, chooser: { ...config.chooser, objective: STUB_OBJECTIVE.defaults } }),
      read: (state) => of(state.decider.chooser.inner.objective) })),
  // The stub alone beside the rise's options, which a mind needs to get up by (`RISE_OPTIONS`).
  { part: STUB_OPTION, mind: "swap-option", at: "options.0", place: (config) => ({ ...config, options: [STUB_OPTION.defaults, ...RISE_OPTIONS] }),
    read: (state) => state.decider.options.find((option) => option.counts).counts },
  { part: STUB_BALANCE, mind: "swap-option", at: "tuning.parts.motor.balance", place: (config) => passing(config, "motor", { ...WHOLE_BODY_MOTOR.defaults, balance: STUB_BALANCE.defaults }),
    read: (_mind, body) => body.mind.host.motor.stance },
  { part: STUB_AIM, mind: "swap-option", at: `options.${RISE_OPTIONS.length + 1}.aim`,
    place: (config) => ({ ...config, options: [...config.options.filter((option) => option.kind !== PUNCH.kind), { ...PUNCH, aim: STUB_AIM.defaults }] }), read: () => AIMED },
  { part: STUB_PAW_MOTOR, mind: "swap-quadruped", at: "tuning.parts.motor", place: (config) => passing(config, "motor", STUB_PAW_MOTOR.defaults),
    read: (_mind, body) => body.mind.host.motor },
  { part: STUB_TROT, mind: "swap-quadruped", at: "tuning.parts.legs.trot", place: (config) => passing(config, "legs", { ...PAW_MOVE.defaults, trot: STUB_TROT.defaults }),
    read: (state) => state.skills.legs.legs.trot },
  { part: STUB_JAW, mind: "swap-quadruped", at: `options.${BITE_AT}.skill`,
    place: (config) => ({ ...config, options: config.options.map((option) => option.kind === "strike-jaw-bite" ? STUB_BITE.defaults : option) }),
    read: (state) => state.skills.actions.executors.find((executor) => executor?.stub === STUB_JAW.defaults.kind) },
].map(Object.freeze));

/** Each fixture preset's game config: where its stubs are placed one at a time. */
export const GAME_CONFIGS = Object.freeze({ "swap-stub": OPTION_DEFAULTS, "swap-option": OPTION_DEFAULTS, "swap-quadruped": OPTION_DEFAULTS });

/** Each fixture preset's kind of mind: the toolkit's under the swap entrant's scope. */
const KINDS = Object.freeze({ "swap-stub": "swap:option", "swap-option": "swap:option", "swap-quadruped": "swap:option" });

/** A fixture preset's config: `base` under its kind (`KINDS`), every stub of `preset` placed, then `more`. */
const withStubs = (preset, base, more) => Object.freeze({ ...STUBS.filter((stub) => stub.mind === preset).reduce((config, stub) => stub.place(config), base), kind: KINDS[preset], ...more });

/** The body-layer fixture: Option Mind with every body-layer stub at once, its one blow the stub executor's, rising by the game's techniques and the stub's. */
export const SWAP_DEFAULTS = withStubs("swap-stub", OPTION_DEFAULTS, {});

/** The Option Mind fixture: Option Mind with its chooser, option, balance and aim stubs. */
export const SWAP_OPTION_DEFAULTS = withStubs("swap-option", OPTION_DEFAULTS, {});

/** The quadruped fixture: Option Mind on paws, its motor, trot and bite each a stub. */
export const SWAP_QUADRUPED_DEFAULTS = withStubs("swap-quadruped", OPTION_DEFAULTS, {});

/** Option Mind's straight punch alone: a bare-hand source on the Warrior. */
const UNARMED = Object.freeze({ ...OPTION_DEFAULTS, kind: "swap:option",
  options: OPTION_DEFAULTS.options.filter((option) => !strikes(option) || option.kind === "strike-straight-punch") });

/** A toolkit mind `mind` as the swap entrant's experimental kind, starting as `defaults`. */
const swapMind = (mind, label, defaults) => Object.freeze({ ...mind, label, stage: "experimental", defaults });

/** **The swap entrant**: its kind of mind, every stub, and a preset of each fixture beside a calibrated bare-hand source, which exposes loadout widening independently of production kits, and one scoped to the Skeleton, a named calibration narrower than the bodies its config fits. */
export const SWAP = Object.freeze({
  name: "swap",
  minds: Object.freeze([swapMind(OPTION_MIND, "Swap Option Mind", SWAP_OPTION_DEFAULTS)]),
  parts: Object.freeze([...new Set([...STUBS.map((stub) => stub.part), STUB_STRIKE, STUB_BITE])]),
  presets: Object.freeze({
    "swap-stub": Object.freeze({ label: "Swap stubs", config: SWAP_DEFAULTS, models: Object.freeze(["workshop-fighter"]) }),
    "swap-unarmed": Object.freeze({ label: "Swap bare-hand scope", config: UNARMED, models: Object.freeze(["workshop-fighter"]) }),
    "swap-skeleton": Object.freeze({ label: "Swap Skeleton scope", config: Object.freeze({ ...OPTION_DEFAULTS, kind: "swap:option" }), models: Object.freeze(["crypt-skeleton"]) }),
    "swap-option": Object.freeze({ label: "Swap Option Mind", config: SWAP_OPTION_DEFAULTS }),
    "swap-quadruped": Object.freeze({ label: "Swap quadruped", config: SWAP_QUADRUPED_DEFAULTS }),
  }),
});
