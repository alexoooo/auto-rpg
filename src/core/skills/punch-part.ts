import { commandable } from "../body.ts";
import type { ExecutorConfig } from "../mind/config.ts";
import { text } from "../mind/fields.ts";
import { noPathSettings, type ExecutorPart } from "../mind/executor-part.ts";
import { STRAIGHT_PUNCH, straightPunchExecutor, straightPunchFits, validStraightPunch } from "./straight-punch.ts";

type Config = Extract<ExecutorConfig, { kind: "straight-punch" }>;
/** A straight punch owns its body fit and flat-out drive settings. */
export const PUNCH_PART: ExecutorPart<Config> = {
  role: "executor", label: "Straight punch", stage: "game", defaults: { kind: "straight-punch", name: "punch", ...STRAIGHT_PUNCH },
  fields: [text("name", "Name")], slots: [], fits: spec => commandable(spec) && straightPunchFits(spec),
  faults: config => validStraightPunch(config) ? [] : ["invalid straight punch settings"], effectors: ["hand.left", "hand.right"], actionFaults: noPathSettings,
  make(body, _world, config, actions, resolve) {
    const { kind: _, name: __, ...settings } = config;
    return straightPunchExecutor(body, actions.map(a => a.name), settings, resolve);
  },
};
