import { takesCommands } from "../mind/parts.ts";
import type { ExecutorConfig } from "../mind/config.ts";
import type { ExecutorPart } from "../mind/executor-part.ts";
import { noPathSettings } from "../mind/executor-part.ts";
import { text } from "../mind/fields.ts";
import { BLADE_STRIKE, bladeExecutor, strikesWithBlade, validBladeSettings } from "./blade.ts";

type Cut = Extract<ExecutorConfig, { kind: "blade-cut" }>;
type Thrust = Extract<ExecutorConfig, { kind: "blade-thrust" }>;
const common = {
  role: "executor" as const, stage: "experimental" as const, slots: [],
  tuning: Object.keys(BLADE_STRIKE), fits: takesCommands, effectors: ["hand.left", "hand.right"], actionFaults: noPathSettings,
  faults: (config: Cut | Thrust) => validBladeSettings({ ...BLADE_STRIKE, ...config.tuning }) ? [] : ["invalid blade settings"],
};

/** An edge-point trajectory turns its named physical edge into the contact direction. */
export const BLADE_CUT_PART: ExecutorPart<Cut> = { ...common, label: "Blade cut", defaults: { kind: "blade-cut", name: "cut" },
  fields: [text("name", "Name")],
  strikesWith: (spec, _config, effector) => strikesWithBlade(spec, effector, "edge"),
  make: (body, _clock, config, actions, resolve, direction) => bladeExecutor(body, actions.map(action => action.name), "edge", { ...BLADE_STRIKE, ...config.tuning }, resolve, direction),
};

/** A tip-point trajectory aligns its actual physical point before committing the thrust. */
export const BLADE_THRUST_PART: ExecutorPart<Thrust> = { ...common, label: "Blade thrust", defaults: { kind: "blade-thrust", name: "thrust" },
  fields: [text("name", "Name")],
  strikesWith: (spec, _config, effector) => strikesWithBlade(spec, effector, "point"),
  make: (body, _clock, config, actions, resolve, direction) => bladeExecutor(body, actions.map(action => action.name), "point", { ...BLADE_STRIKE, ...config.tuning }, resolve, direction),
};
