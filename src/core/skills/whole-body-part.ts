import { takesCommands, fitsAll, fitsWhen } from "../mind/parts.ts";
import { choice, text } from "../mind/fields.ts";
import { noPathSettings, type ExecutorPart } from "../mind/executor-part.ts";
import { wholeBodyExecutor, wholeBodyFits, type WholeBodyDrive } from "./whole-body-strike.ts";

/** **The whole-body strike** (`wholeBodyExecutor`): one torque solve over the whole body under a blow, its fist driven by `drive`. */
interface Config {
  readonly kind: "whole-body-strike";
  readonly name: string;
  readonly drive: WholeBodyDrive;
}

/** The whole-body solve declares its anatomical fit and shared reservation. */
export const WHOLE_BODY_PART: ExecutorPart<Config> = {
  role: "executor", label: "Whole-body strike", stage: "experimental", defaults: { kind: "whole-body-strike", name: "whole-body", drive: "timed" }, keys: { kind: true, name: true, drive: true },
  fields: [text("name", "Name"), choice("drive", "Drive", [["timed", "Timed path"], ["flat-out", "Flat out"]])], slots: [],
  fits: fitsAll(takesCommands, fitsWhen(wholeBodyFits, "needs a lower and upper trunk, both feet and both hands")), faults: config => ["timed", "flat-out"].includes(config.drive) ? [] : ["invalid whole-body drive"],
  effectors: ["hand.left", "hand.right"], actionFaults: noPathSettings,
  make: ({ body, clock, guard, resolve }, config, actions) => wholeBodyExecutor(body, clock, guard, actions.map(a => a.name), config.drive, resolve),
};
