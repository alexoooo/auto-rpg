import { commandable } from "../body.ts";
import type { ExecutorConfig } from "../mind/config.ts";
import { text } from "../mind/fields.ts";
import { noPathSettings, type ExecutorPart } from "../mind/executor-part.ts";
import { kickExecutor, KICK_PATH, validKickTuning } from "./kick.ts";

type Config = Extract<ExecutorConfig, { kind: "front-kick" }>;
/** A kick owns foot-only capability and its physical cycle tuning. */
export const KICK_PART: ExecutorPart<Config> = {
  role: "executor", label: "Front kick", stage: "experimental", defaults: { kind: "front-kick", name: "kick" },
  fields: [text("name", "Name")], slots: [], tuning: Object.keys(KICK_PATH), fits: commandable,
  faults: config => validKickTuning({ ...KICK_PATH, ...config.tuning }) ? [] : ["invalid kick settings"],
  effectors: ["foot.left", "foot.right"], actionFaults: action => [...noPathSettings(action), ...action.aim.kind === "surface" ? ["unsupported surface aim"] : []],
  make: (body, _world, config, actions, resolve) => kickExecutor(body, actions.map(a => a.name), { ...KICK_PATH, ...config.tuning }, resolve),
};
