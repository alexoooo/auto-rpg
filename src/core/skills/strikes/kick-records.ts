import type { DataKey } from "../../data/store.ts";
import { dataOf } from "../../data/store.ts";
import { fitsAll, strikesWithOneOf } from "../../parts/parts.ts";
import { text } from "../../parts/fields.ts";
import { aimedPoint, AIMED_ACTIONS, type ExecutorPart } from "../framework/executor-part.ts";
import { recordFault, tunedSettings, type SkillRecords } from "../framework/records.ts";
import { kickExecutor, KICK_PATH, validKickTuning, type KickTuning } from "./kick.ts";

declare module "../../data/store.ts" {
  interface DataOf {
    /** Every body's front kick record. */
    "front-kick": SkillRecords<KickTuning>;
    /** Every body's stomp record. */
    "stomp": SkillRecords<KickTuning>;
  }
}

/** A kick's config: its kind and name, and an experiment's research `tuning`, which a link does not carry. */
interface Config<K extends string> {
  readonly kind: K;
  readonly name: string;
  readonly tuning?: Partial<KickTuning>;
}

/** Whether `tuning` holds every kick setting, each valid (`validKickTuning`). */
const wholeKick = (tuning: Partial<KickTuning>): boolean => Object.keys(KICK_PATH).every((key) => key in tuning) && validKickTuning(tuning as KickTuning);

/** Whether each setting `tuning` names is a known one, finite and nonnegative. */
const validKickPart = (tuning: Partial<KickTuning>): boolean =>
  Object.entries(tuning).every(([key, value]) => key in KICK_PATH && Number.isFinite(value) && value! >= 0);

/**
 * **A kick of either foot** (`kickExecutor`) whose settings are its body's record of `skill`
 * (`SkillRecord`, `dataOf(skill)`; the bodies with one, `bodies`): a body with none does not throw
 * it. A research `tuning` sets settings over the record's, all of them where the body has none.
 */
export function kickPart<K extends DataKey & ("front-kick" | "stomp")>(skill: K, label: string, bodies: readonly string[]): ExecutorPart<Config<K>> {
  return {
    role: "executor", label, stage: "experimental", defaults: { kind: skill, name: skill === "front-kick" ? "kick" : skill } as Config<K>,
    keys: { kind: true, name: true, tuning: true }, fields: [text("name", "Name")], slots: [], tuning: Object.keys(KICK_PATH),
    fits: fitsAll(strikesWithOneOf("foot.left", "foot.right"), recordFault(label.toLowerCase(), bodies, wholeKick)),
    faults: (config) => config.tuning === undefined || validKickPart(config.tuning) ? [] : [`invalid ${label.toLowerCase()} tuning`],
    reads: () => [skill], effectors: ["foot.left", "foot.right"], ...AIMED_ACTIONS,
    make: ({ body, aim }, config, actions) => kickExecutor(body, actions.map(a => a.name), tunedSettings(dataOf(skill), body.built.spec, config), aimedPoint(aim)),
  };
}
