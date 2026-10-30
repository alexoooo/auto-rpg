import { strikesWithOneOf, type KeysOf } from "../../parts/parts.ts";
import { text } from "../../parts/fields.ts";
import { aimedPoint, AIMED_ACTIONS, type ExecutorPart } from "../framework/executor-part.ts";
import { kickExecutor, KICK_PATH, validKickTuning, type KickTuning } from "./kick.ts";

/**
 * **The front kick** with either foot (`kickExecutor`): its settings, each `KICK_PATH`'s where it
 * names none, and over them a research `tuning`, which a link does not carry.
 */
interface Config extends Partial<KickTuning> {
  readonly kind: "front-kick";
  readonly name: string;
  readonly tuning?: Partial<KickTuning>;
}

/** The settings `config` gives its kick: `KICK_PATH`'s, its own over them, and its research tuning over those. */
function settingsOf(config: Config): KickTuning {
  const { kind: _, name: __, tuning, ...own } = config;
  return { ...KICK_PATH, ...own, ...tuning };
}

/** A kick owns foot-only capability and its physical cycle settings. */
export const KICK_PART: ExecutorPart<Config> = {
  role: "executor", label: "Front kick", stage: "experimental", defaults: { kind: "front-kick", name: "kick" },
  keys: { kind: true, name: true, tuning: true, ...Object.fromEntries(Object.keys(KICK_PATH).map((key) => [key, true])) as KeysOf<KickTuning> },
  fields: [text("name", "Name")], slots: [], tuning: Object.keys(KICK_PATH), fits: strikesWithOneOf("foot.left", "foot.right"),
  faults: config => validKickTuning(settingsOf(config)) ? [] : ["invalid kick settings"],
  effectors: ["foot.left", "foot.right"], ...AIMED_ACTIONS,
  make: ({ body, aim }, config, actions) => kickExecutor(body, actions.map(a => a.name), settingsOf(config), aimedPoint(aim)),
};
