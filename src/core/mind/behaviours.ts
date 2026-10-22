import { deepFreeze } from "../state.ts";
import type { BehaviourConfig } from "./config.ts";
import { choice, number } from "./fields.ts";
import { takesCommands, type Part } from "./parts.ts";

type Of<K extends BehaviourConfig["kind"]> = BehaviourConfig & { readonly kind: K };
const behaviour = <C extends BehaviourConfig>(label: string, defaults: C, fields: Part<C>["fields"] = []): Part<C> =>
  ({ role: "behaviour", label, stage: "game", fields, slots: [], defaults, fits: takesCommands, faults: behaviourFaults });

/** Numeric behaviour settings are finite, nonnegative distances or durations. */
export function behaviourFaults(config: BehaviourConfig): readonly string[] {
  const faults: string[] = [];
  for (const [key, value] of Object.entries(config)) if (key !== "kind" && typeof value === "number" && (!Number.isFinite(value) || value < 0)) faults.push(`${key} must be finite and nonnegative`);
  if (config.kind === "cover" && !["pose", "cover", "predictive", "body", "ward"].includes(config.guard)) faults.push("guard must name a cover policy");
  return faults;
}

/** Registered continuous behaviours contain no execution implementation or action slot. */
export const BEHAVIOUR_PARTS: { readonly [K in BehaviourConfig["kind"]]: Part<Of<K>> } = deepFreeze({
  "follow-orders": behaviour<Of<"follow-orders">>("Follow orders", { kind: "follow-orders" }),
  attack: behaviour<Of<"attack">>("Attack", { kind: "attack" }),
  approach: behaviour<Of<"approach">>("Approach action", { kind: "approach", spacing: 0, spacingStep: 0 }, [
    number<Of<"approach">, "spacing">("spacing", "Spacing", 0, 1, .05, "m"),
    number<Of<"approach">, "spacingStep">("spacingStep", "Miss adjustment", 0, .2, .01, "m"),
  ]),
  flee: behaviour<Of<"flee">>("Run away", { kind: "flee" }),
  "close-in": behaviour<Of<"close-in">>("Close in", { kind: "close-in", metres: .6 }, [number<Of<"close-in">, "metres">("metres", "Distance", 0, 5, .1, "m")]),
  "keep-distance": behaviour<Of<"keep-distance">>("Keep distance", { kind: "keep-distance", metres: 2.5 }, [number<Of<"keep-distance">, "metres">("metres", "Distance", 0, 10, .1, "m")]),
  "break-clinch": behaviour<Of<"break-clinch">>("Break clinch", { kind: "break-clinch", metres: .65 }, [number<Of<"break-clinch">, "metres">("metres", "Clearance", 0, 2, .05, "m")]),
  edge: behaviour<Of<"edge">>("Hold reach edge", { kind: "edge", band: .25, patience: 4 }, [
    number<Of<"edge">, "band">("band", "Reach margin", 0, 1, .05, "m"), number<Of<"edge">, "patience">("patience", "Patience", 0, 120, .1, "s"),
  ]),
  evade: behaviour<Of<"evade">>("Evade incoming contact", { kind: "evade" }),
  "clear-of-walls": behaviour<Of<"clear-of-walls">>("Clear walls", { kind: "clear-of-walls" }),
  "clear-of-fallen": behaviour<Of<"clear-of-fallen">>("Clear fallen bodies", { kind: "clear-of-fallen" }),
  ground: behaviour<Of<"ground">>("Ground positioning", { kind: "ground" }),
  cover: behaviour<Of<"cover">>("Guard", { kind: "cover", guard: "cover" }, [choice<Of<"cover">, "guard">("guard", "Guard", [["cover", "Cover threat"], ["predictive", "Predict contact"], ["body", "Predict contact on the body"], ["ward", "Ward off the weapon"], ["pose", "Hold pose"]])]),
});
