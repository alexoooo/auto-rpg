import meta from "../../../../assets/core/path-strike.meta.json" with { type: "json" };
import { dataOf } from "../../data/store.ts";
import { fitsAll, strikesWithOneOf } from "../../parts/parts.ts";
import type { ActionConfig } from "../config.ts";
import { choice, optionalNumber, text, toggle, type PartField } from "../../parts/fields.ts";
import { aimedWay, aimedPoint, type ExecutorPart } from "../framework/executor-part.ts";
import { recordFault, type SkillRecords } from "../framework/records.ts";
import { validArmExtension, type BlowFamily } from "./attack-path.ts";
import { ATTACK_PATH, validAttackTuning, type AttackTuning } from "./attack-path.ts";
import { pathExecutor, validCombatExecution, type CombatExecution } from "./combat.ts";
import { strikesWithBlunt } from "./held-strike.ts";
import { bodyKey, type BodySpec } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";

/** **A path strike's settings on one body**: the hands' paths, and the limits of its impact where it has them. */
export interface PathSettings {
  readonly paths: AttackTuning;
  readonly execution?: CombatExecution;
}

declare module "../../data/store.ts" {
  interface DataOf {
    /** Every body's path strike record. */
    "path-strike": SkillRecords<PathSettings>;
  }
}

/**
 * **The path strike**: a hand path carried out on the strike cycle (`pathExecutor`,
 * `skills/strikes/combat.ts`), its settings its body's record (`SkillRecord`,
 * `assets/core/path-strike.json`): a body with none does not throw it. A research `tuning`, which
 * a link does not carry, sets paths and execution over the record's, all of them where the body has
 * none.
 */
interface Path {
  readonly kind: "path-strike";
  readonly name: string;
  /** Whether a hand may begin while the other is still returning. */
  readonly overlap: boolean;
  readonly tuning?: {
    /** The hands' paths over the record's. */
    readonly paths?: Partial<AttackTuning>;
    readonly execution?: CombatExecution;
  };
}

/** The bodies with a path strike record, known before the records load. */
const PATH_BODIES: readonly string[] = deepFreeze(meta.bodies);

/** **A path strike's action**: the path its hand takes, how far its elbow opens over the paths' own, and the support height it is thrown from. */
export interface PathActionConfig extends ActionConfig {
  readonly family: BlowFamily;
  readonly armExtension?: number;
}

const FAMILIES: readonly (readonly [BlowFamily, string])[] = [["straight", "Straight"], ["cross", "Cross"], ["hook", "Hook"], ["downward", "Downward"], ["overhand", "Overhand"], ["uppercut", "Uppercut"]];
const actionFields: readonly PartField<PathActionConfig>[] = [choice("family", "Path", FAMILIES), optionalNumber("armExtension", "Arm extension", 0, 1, .05, "of full"),
  optionalNumber("lower", "Lower support", 0, 1, .05, "m")];
const actionFaults = (action: PathActionConfig): readonly string[] => [
  ...(!FAMILIES.some(([family]) => family === action.family) ? ["invalid path family"] : []),
  ...(!validArmExtension(action.armExtension) ? ["invalid arm extension"] : []),
  ...(action.lower !== undefined && (!Number.isFinite(action.lower) || action.lower < 0) ? ["invalid support height"] : []),
];
/** The settings `config` throws on a body of `spec`: its record's, with its research tuning over them. */
function settingsOf(spec: BodySpec, config: Path): PathSettings {
  const record = dataOf("path-strike")[bodyKey(spec)]?.settings, execution = config.tuning?.execution ?? record?.execution;
  return { paths: { ...record?.paths, ...config.tuning?.paths } as AttackTuning, ...(execution ? { execution } : {}) };
}
/** Whether `tuning` sets every path setting, each valid. */
const wholePaths = (tuning: NonNullable<Path["tuning"]>): boolean =>
  tuning.paths !== undefined && Object.keys(ATTACK_PATH).every((key) => key in tuning.paths!) && validAttackTuning(tuning.paths as AttackTuning);
/** What a path strike's action asks of its aim, and every one's own settings. */
const actions = { aims: true, actionKeys: ["family", "armExtension", "lower"], actionFields, actionDefaults: { family: "straight" as const }, actionFaults,
  blow: (spec: BodySpec, config: Path, action: PathActionConfig) => ({ family: action.family, paths: settingsOf(spec, config).paths }) };
const faults = (config: Path): readonly string[] => [
  ...(!Object.entries(config.tuning?.paths ?? {}).every(([key, value]) => key in ATTACK_PATH && Number.isFinite(value) && value! >= 0) ? ["invalid path tuning"] : []),
  ...(config.tuning?.execution && !validCombatExecution(config.tuning.execution) ? ["invalid execution settings"] : []),
];
/** Hand paths own their cycle settings and anatomical contract. */
export const PATH_PART: ExecutorPart<Path, PathActionConfig> = {
  role: "executor", label: "Path strike", stage: "experimental", defaults: { kind: "path-strike", name: "paths", overlap: false }, keys: { kind: true, name: true, overlap: true, tuning: true },
  fields: [text("name", "Name"), toggle("overlap", "Overlap returns")], slots: [], tuning: ["paths", "execution"],
  fits: fitsAll(strikesWithOneOf("hand.left", "hand.right"), recordFault("path strike", PATH_BODIES, wholePaths)),
  faults, reads: () => ["path-strike"], effectors: ["hand.left", "hand.right"], ...actions,
  strikesWith: (spec, _config, effector) => strikesWithBlunt(spec, effector),
  make: ({ body, guard, aim }, config, actions) => pathExecutor(body, guard, actions,
    { ...settingsOf(body.built.spec, config), overlap: config.overlap, resolve: aimedPoint(aim), direction: aimedWay(aim) }),
};
