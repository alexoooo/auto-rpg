import cutMeta from "../../../../assets/core/blade-cut.meta.json" with { type: "json" };
import thrustMeta from "../../../../assets/core/blade-thrust.meta.json" with { type: "json" };
import { dataOf } from "../../data/store.ts";
import { fitsAll, strikesWithOneOf } from "../../parts/parts.ts";
import { aimedWay, aimedPoint, AIMED_ACTIONS, type ExecutorPart } from "../framework/executor-part.ts";
import { text } from "../../parts/fields.ts";
import { deepFreeze } from "../../state.ts";
import { recordFault, tunedSettings, type SkillRecords } from "../framework/records.ts";
import { BLADE_STRIKE, bladeExecutor, strikesWithBlade, validBladeSettings, type BladeSettings } from "./blade.ts";

declare module "../../data/store.ts" {
  interface DataOf {
    /** Every body's blade cut record. */
    "blade-cut": SkillRecords<BladeSettings>;
    /** Every body's blade thrust record. */
    "blade-thrust": SkillRecords<BladeSettings>;
  }
}

/**
 * A blade's cut or thrust (`bladeExecutor`), its swing its body's record of its kind (`SkillRecord`,
 * `assets/core/blade-cut.json`, `blade-thrust.json`): a body with none does not swing it. A research
 * `tuning`, which a link does not carry, sets settings over the record's, all of them where the
 * body has none.
 */
interface Blade<K extends "blade-cut" | "blade-thrust"> {
  readonly kind: K;
  readonly name: string;
  readonly tuning?: Partial<BladeSettings>;
}
type Cut = Blade<"blade-cut">;
type Thrust = Blade<"blade-thrust">;

/** Whether `tuning` holds every blade setting, each valid. */
const wholeBlade = (tuning: Partial<BladeSettings>): boolean => Object.keys(BLADE_STRIKE).every((key) => key in tuning) && validBladeSettings(tuning as BladeSettings);

/** What a part of `kind` shares with the other, its records' bodies `bodies` and its label `label`. */
const common = <K extends "blade-cut" | "blade-thrust">(kind: K, label: string, bodies: readonly string[]) => ({
  role: "executor" as const, stage: "experimental" as const, label, slots: [], keys: { kind: true, name: true, tuning: true } as const,
  tuning: Object.keys(BLADE_STRIKE), effectors: ["hand.left", "hand.right"], ...AIMED_ACTIONS, reads: () => [kind],
  fits: fitsAll(strikesWithOneOf("hand.left", "hand.right"), recordFault(label.toLowerCase(), bodies, wholeBlade)),
  faults: (config: Blade<K>) => Object.entries(config.tuning ?? {}).every(([key, value]) => key in BLADE_STRIKE && Number.isFinite(value) && value! >= 0) ? [] : ["invalid blade tuning"],
});

/** An edge-point trajectory turns its named physical edge into the contact direction. */
export const BLADE_CUT_PART: ExecutorPart<Cut> = { ...common("blade-cut", "Blade cut", deepFreeze(cutMeta.bodies)), defaults: { kind: "blade-cut", name: "cut" },
  meets: "edge",
  fields: [text("name", "Name")],
  strikesWith: (spec, _config, effector) => strikesWithBlade(spec, effector, "edge"),
  make: ({ body, guard, aim }, config, actions) => bladeExecutor(body, guard, actions.map(action => action.name), "edge",
    tunedSettings(dataOf("blade-cut"), body.built.spec, config), aimedPoint(aim), aimedWay(aim)),
};

/** A tip-point trajectory aligns its actual physical point before committing the thrust. */
export const BLADE_THRUST_PART: ExecutorPart<Thrust> = { ...common("blade-thrust", "Blade thrust", deepFreeze(thrustMeta.bodies)), defaults: { kind: "blade-thrust", name: "thrust" },
  meets: "point",
  fields: [text("name", "Name")],
  strikesWith: (spec, _config, effector) => strikesWithBlade(spec, effector, "point"),
  make: ({ body, guard, aim }, config, actions) => bladeExecutor(body, guard, actions.map(action => action.name), "point",
    tunedSettings(dataOf("blade-thrust"), body.built.spec, config), aimedPoint(aim), aimedWay(aim)),
};
