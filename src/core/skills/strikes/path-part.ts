import { strikesWithOneOf } from "../../parts/parts.ts";
import type { ActionConfig } from "../config.ts";
import { choice, optionalNumber, text, toggle, type PartField } from "../../parts/fields.ts";
import { aimedWay, aimedPoint, type ExecutorPart } from "../framework/executor-part.ts";
import { validArmExtension, type BlowFamily } from "./attack-path.ts";
import { ATTACK_PATH, validAttackTuning, type AttackTuning } from "./attack-path.ts";
import { pathExecutor, validCombatExecution, type CombatExecution } from "./combat.ts";
import { strikesWithBlunt } from "./held-strike.ts";

/** **The path strike**: a hand path carried out on the strike cycle (`pathExecutor`, `skills/strikes/combat.ts`). */
interface Path {
  readonly kind: "path-strike";
  readonly name: string;
  /** Whether a hand may begin while the other is still returning. */
  readonly overlap: boolean;
  readonly tuning?: {
    /** The hands' paths over `ATTACK_PATH`. */
    readonly paths?: Partial<AttackTuning>;
    readonly execution?: CombatExecution;
  };
}

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
const paths = (config: Path) => ({ ...ATTACK_PATH, ...config.tuning?.paths });
/** What a path strike's action asks of its aim, and every one's own settings. */
const actions = { aims: true, actionKeys: ["family", "armExtension", "lower"], actionFields, actionDefaults: { family: "straight" as const }, actionFaults,
  blow: (config: Path, action: PathActionConfig) => ({ family: action.family, paths: paths(config) }) };
const faults = (config: Path): readonly string[] => [
  ...(!validAttackTuning(paths(config)) ? ["invalid path settings"] : []),
  ...(config.tuning?.execution && !validCombatExecution(config.tuning.execution) ? ["invalid execution settings"] : []),
];
/** Hand paths own their cycle settings and anatomical contract. */
export const PATH_PART: ExecutorPart<Path, PathActionConfig> = {
  role: "executor", label: "Path strike", stage: "experimental", defaults: { kind: "path-strike", name: "paths", overlap: false }, keys: { kind: true, name: true, overlap: true, tuning: true },
  fields: [text("name", "Name"), toggle("overlap", "Overlap returns")], slots: [], tuning: ["paths", "execution"], fits: strikesWithOneOf("hand.left", "hand.right"),
  faults, effectors: ["hand.left", "hand.right"], ...actions,
  strikesWith: (spec, _config, effector) => strikesWithBlunt(spec, effector),
  make: ({ body, guard, aim }, config, actions) => pathExecutor(body, guard, actions,
    { ...config.tuning, paths: paths(config), overlap: config.overlap, resolve: aimedPoint(aim), direction: aimedWay(aim) }),
};
