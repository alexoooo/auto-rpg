import { takesCommands } from "../mind/parts.ts";
import { aimedWay, aimedPoint, type ExecutorPart, noPathSettings } from "../mind/executor-part.ts";
import { text } from "../mind/fields.ts";
import { BLADE_STRIKE, bladeExecutor, strikesWithBlade, validBladeSettings, type BladeSettings } from "./blade.ts";

/** A blade's cut or thrust (`bladeExecutor`), its swing over `BLADE_STRIKE`. */
interface Blade<K extends "blade-cut" | "blade-thrust"> {
  readonly kind: K;
  readonly name: string;
  readonly tuning?: Partial<BladeSettings>;
}
type Cut = Blade<"blade-cut">;
type Thrust = Blade<"blade-thrust">;
const common = {
  role: "executor" as const, stage: "experimental" as const, slots: [], keys: { kind: true, name: true, tuning: true } as const,
  tuning: Object.keys(BLADE_STRIKE), fits: takesCommands, effectors: ["hand.left", "hand.right"], actionFaults: noPathSettings,
  faults: (config: Cut | Thrust) => validBladeSettings({ ...BLADE_STRIKE, ...config.tuning }) ? [] : ["invalid blade settings"],
};

/** An edge-point trajectory turns its named physical edge into the contact direction. */
export const BLADE_CUT_PART: ExecutorPart<Cut> = { ...common, label: "Blade cut", defaults: { kind: "blade-cut", name: "cut" },
  fields: [text("name", "Name")],
  strikesWith: (spec, _config, effector) => strikesWithBlade(spec, effector, "edge"),
  make: ({ body, guard, aim }, config, actions) => bladeExecutor(body, guard, actions.map(action => action.name), "edge", { ...BLADE_STRIKE, ...config.tuning }, aimedPoint(aim), aimedWay(aim)),
};

/** A tip-point trajectory aligns its actual physical point before committing the thrust. */
export const BLADE_THRUST_PART: ExecutorPart<Thrust> = { ...common, label: "Blade thrust", defaults: { kind: "blade-thrust", name: "thrust" },
  fields: [text("name", "Name")],
  strikesWith: (spec, _config, effector) => strikesWithBlade(spec, effector, "point"),
  make: ({ body, guard, aim }, config, actions) => bladeExecutor(body, guard, actions.map(action => action.name), "point", { ...BLADE_STRIKE, ...config.tuning }, aimedPoint(aim), aimedWay(aim)),
};
