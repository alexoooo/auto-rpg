import { takesCommands, fitsAll, fitsWhen } from "../mind/parts.ts";
import type { ExecutorConfig } from "../mind/config.ts";
import { text } from "../mind/fields.ts";
import { noPathSettings, type ExecutorPart } from "../mind/executor-part.ts";
import { STRAIGHT_PUNCH, straightPunchExecutor, straightPunchFits, validStraightPunch } from "./straight-punch.ts";
import { holdsNothing } from "./strikes.ts";

type Config = Extract<ExecutorConfig, { kind: "straight-punch" }>;
/** A straight punch owns its body fit and flat-out drive settings. */
export const PUNCH_PART: ExecutorPart<Config> = {
  role: "executor", label: "Straight punch", stage: "game", defaults: { kind: "straight-punch", name: "punch", ...STRAIGHT_PUNCH },
  fields: [text("name", "Name")], slots: [], fits: fitsAll(takesCommands, fitsWhen(straightPunchFits, "needs both arms on the upper trunk and a thoracic joint")),
  faults: config => validStraightPunch(config) ? [] : ["invalid straight punch settings"], effectors: ["hand.left", "hand.right"], actionFaults: noPathSettings,
  // A punch is thrown by a hand that holds nothing: one holding an item would drive the item's end along the punch's line.
  strikesWith: (spec, _config, effector) => holdsNothing(spec, effector),
  make(body, _world, config, actions, resolve) {
    const { kind: _, name: __, ...settings } = config;
    return straightPunchExecutor(body, actions.map(a => a.name), settings, resolve);
  },
};
