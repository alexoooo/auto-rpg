import { takesCommands, fitsAll, fitsWhen } from "../mind/parts.ts";
import type { ExecutorConfig } from "../mind/config.ts";
import { choice, text } from "../mind/fields.ts";
import { noPathSettings, type ExecutorPart } from "../mind/executor-part.ts";
import { wholeBodyExecutor, wholeBodyFits } from "./whole-body-strike.ts";

type Config = Extract<ExecutorConfig, { kind: "whole-body-strike" }>;
/** The whole-body solve declares its anatomical fit and shared reservation. */
export const WHOLE_BODY_PART: ExecutorPart<Config> = {
  role: "executor", label: "Whole-body strike", stage: "experimental", defaults: { kind: "whole-body-strike", name: "whole-body", drive: "timed" },
  fields: [text("name", "Name"), choice("drive", "Drive", [["timed", "Timed path"], ["flat-out", "Flat out"]])], slots: [],
  fits: fitsAll(takesCommands, fitsWhen(wholeBodyFits, "needs a lower and upper trunk, both feet and both hands")), faults: config => ["timed", "flat-out"].includes(config.drive) ? [] : ["invalid whole-body drive"],
  effectors: ["hand.left", "hand.right"], actionFaults: noPathSettings,
  make: (body, clock, config, actions, resolve) => wholeBodyExecutor(body, clock, actions.map(a => a.name), config.drive, resolve),
};
