import { deepFreeze } from "../state.ts";
import { anyBody } from "./parts.ts";
import type { TacticsPart } from "./tactics-part.ts";

/** **Follow script**: the screen's script are the tactics (`MindWiring.script`). */
interface ScriptTacticsConfig { readonly kind: "script" }

export const SCRIPT_TACTICS: TacticsPart<ScriptTacticsConfig> = deepFreeze({
  role: "tactics", label: "Follow script", stage: "game", fields: [], slots: [], defaults: { kind: "script" }, needs: "script",
  keys: { kind: true }, fits: anyBody, faults: () => [],
  make({ script }) {
    if (!script) throw new Error("script tactics require a supplied script");
    return script;
  },
});
