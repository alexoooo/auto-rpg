import type { ScreenContext } from "../ui/screen.ts";
import { labHref, LAB_PRESETS, SCENARIOS, type LabAddress } from "./scenarios.ts";
import { need as find } from "../dom.ts";
import { groundMind } from "./ground-config.ts";
import { isFighter, type FighterConfig } from "../core/mind/config.ts";

/**
 * **The lab's scenario menu** (`?play=lab`): a card for each scenario, and a click opens it. The
 * character and the rate are chosen inside a scenario; the address carries them here and on, so
 * the next scenario keeps them. Built from `scenarios.ts`, so a card offered is a scenario the lab
 * has; it loads neither Babylon nor Rapier.
 */
export function showScenarios(address: LabAddress, context: ScreenContext): void {
  const need = <T extends HTMLElement>(id: string): T => find<T>(id, context.root);
  const cards = SCENARIOS.map((scenario) => {
    const card = document.createElement("a");
    let mind = address.mind;
    if (isFighter(mind)) {
      let fighter: FighterConfig = mind;
      if (scenario.id === "attack" && fighter.tactics.kind === "script") fighter = LAB_PRESETS.puncher.config;
      else if (scenario.id !== "attack" && fighter.tactics.kind !== "script" && fighter.tactics.kind !== "stand")
        fighter = { ...fighter, tactics: { kind: "script" } };
      if (scenario.id === "ground") fighter = groundMind(fighter);
      mind = fighter;
    }
    const chosen = { ...address, mind, scenario: scenario.id };
    card.href = labHref(chosen, context.address.search);
    card.append(Object.assign(document.createElement("strong"), { textContent: scenario.name }));
    return card;
  });
  need("lab-scenarios").replaceChildren(...cards);
  context.own(() => context.remember(context.address.href));
}
