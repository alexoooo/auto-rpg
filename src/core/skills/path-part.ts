import { takesCommands } from "../mind/parts.ts";
import type { ActionConfig } from "../mind/config.ts";
import { number, text, toggle } from "../mind/fields.ts";
import type { ExecutorPart } from "../mind/executor-part.ts";
import { validArmExtension } from "../mind/intent.ts";
import { ATTACK_PATH, validAttackTuning, type AttackTuning } from "./attack-path.ts";
import { DRIVEN_STRIKE, pathExecutor, validCombatExecution, validDrivenStrike, type CombatExecution, type DrivenStrike } from "./combat.ts";
import { strikesWithBlunt } from "./strikes.ts";

/** **The path strike**: a hand path carried out on the strike cycle (`pathExecutor`, `skills/combat.ts`). */
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

/** **The driven strike** (`DrivenStrike`, `skills/combat.ts`): the path strike with its trunk driven into the swing. */
interface Driven extends DrivenStrike {
  readonly kind: "driven-strike";
  readonly name: string;
  readonly tuning?: Path["tuning"];
}

const actionFaults = (action: ActionConfig): readonly string[] => [
  ...(!action.family || !["straight", "cross", "hook", "downward", "overhand", "uppercut"].includes(action.family) ? ["invalid path family"] : []),
  ...(!validArmExtension(action.armExtension) ? ["invalid arm extension"] : []),
  ...(action.lower !== undefined && (!Number.isFinite(action.lower) || action.lower < 0) ? ["invalid support height"] : []),
];
const paths = (config: Path | Driven) => ({ ...ATTACK_PATH, ...config.tuning?.paths });
const faults = (config: Path | Driven): readonly string[] => [
  ...(!validAttackTuning(paths(config)) ? ["invalid path settings"] : []),
  ...(config.tuning?.execution && !validCombatExecution(config.tuning.execution) ? ["invalid execution settings"] : []),
];
/** Hand paths own their cycle settings and anatomical contract. */
export const PATH_PART: ExecutorPart<Path> = {
  role: "executor", label: "Path strike", stage: "experimental", defaults: { kind: "path-strike", name: "paths", overlap: false }, keys: { kind: true, name: true, overlap: true, tuning: true },
  fields: [text("name", "Name"), toggle("overlap", "Overlap returns")], slots: [], tuning: ["paths", "execution"], fits: takesCommands,
  faults, effectors: ["hand.left", "hand.right"], actionFaults, paths,
  strikesWith: (spec, _config, effector) => strikesWithBlunt(spec, effector),
  make: ({ body, guard, resolve, direction }, config, actions) => pathExecutor(body, guard, actions.map(a => ({ ...a, family: a.family! })),
    { ...config.tuning, paths: paths(config), overlap: config.overlap, resolve, direction }),
};
/** Driven paths expose their additional trunk controls beside the common path fields. */
export const DRIVEN_PART: ExecutorPart<Driven> = {
  role: "executor", label: "Driven strike", stage: "experimental", defaults: { kind: "driven-strike", name: "driven", ...DRIVEN_STRIKE },
  keys: { kind: true, name: true, tuning: true, drive: true, torso: true, windup: true, contact: true },
  fields: [text("name", "Name"), number("drive", "Trunk drive", 0, 1, .05, "of full"), number("torso", "Trunk turn", 0, .6, .01, "rad"),
    number("windup", "Wind-up", 0, .4, .01, "m"), number("contact", "Contact speed", 1, 12, .5, "m/s")],
  slots: [], tuning: ["paths", "execution"], fits: takesCommands, faults: config => [...faults(config), ...validDrivenStrike(config) ? [] : ["invalid driven strike settings"]],
  effectors: ["hand.left", "hand.right"], actionFaults, paths,
  strikesWith: (spec, _config, effector) => strikesWithBlunt(spec, effector),
  make({ body, guard, resolve, direction }, config, actions) {
    const { kind: _, name: __, tuning, ...driven } = config;
    return pathExecutor(body, guard, actions.map(a => ({ ...a, family: a.family! })), { ...tuning, paths: paths(config), driven, resolve, direction });
  },
};
