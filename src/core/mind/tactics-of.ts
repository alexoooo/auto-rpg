import type { BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import { actionTactics, type ActionEstimates } from "./action-tactics.ts";
import { behaviourFaults } from "./behaviours.ts";
import { FIGHTING, type ActionConfig, type BehavioursConfig, type TacticsConfig } from "./config.ts";
import { standIntent } from "./intent.ts";
import type { Orders } from "./orders.ts";
import { slotList, takesCommands, type Part } from "./parts.ts";
import type { Sight, Tactics } from "./tactics.ts";

/** The tactics' bounded decisions and condition numbers must be finite before execution. */
function tacticsFaults(config: BehavioursConfig): readonly string[] {
  const faults = config.list.flatMap(behaviourFaults);
  if (!Number.isFinite(config.choose.rethink) || config.choose.rethink < 0 || !Number.isFinite(config.choose.patience) || config.choose.patience <= 0)
    faults.push("selection needs finite nonnegative rethink and positive patience");
  if (config.choose.kind === "rules") for (const rule of config.choose.rules) {
    if (rule.when.kind === "when-distance" && (!Number.isFinite(rule.when.metres) || rule.when.metres < 0)) faults.push("rule distance must be finite and nonnegative");
    if (rule.when.kind === "follow-up" && (!Number.isFinite(rule.when.seconds) || rule.when.seconds < 0)) faults.push("follow-up duration must be finite and nonnegative");
  }
  return faults;
}

/** The tactics registry exposes one shared behaviour engine, scripts and standing guard. */
export const TACTICS_PARTS: { readonly [K in TacticsConfig["kind"]]: Part<Extract<TacticsConfig, { kind: K }>> } = deepFreeze({
  script: { role: "tactics", label: "Follow script", stage: "game", fields: [], slots: [], defaults: { kind: "script" }, needs: "script", fits: takesCommands, faults: () => [] },
  stand: { role: "tactics", label: "Stand in guard", stage: "game", fields: [], slots: [], defaults: { kind: "stand" }, fits: takesCommands, faults: () => [] },
  behaviours: { role: "tactics", label: "Behaviours", stage: "game", fields: [], slots: [slotList("list", "Behaviours", "behaviour")], defaults: FIGHTING, fits: takesCommands, faults: tacticsFaults },
});

/** Compile the shared decisions over this body's named actions, or carry out a supplied script. */
export function tacticsOf(config: TacticsConfig, spec: BodySpec, _name: string, actions: readonly ActionConfig[], orders: (sight: Sight) => Orders | null,
  script?: Tactics, estimates: ActionEstimates = {}): Tactics {
  switch (config.kind) {
    case "behaviours": return actionTactics(spec, actions, config, orders, estimates);
    case "stand": return { name: "guard", decide: ({ report }) => standIntent(report.heading) };
    case "script": if (!script) throw new Error("script tactics require a supplied script"); return script;
    default: { const never: never = config; throw new Error(`unknown tactics ${JSON.stringify(never)}`); }
  }
}
