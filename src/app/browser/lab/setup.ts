import type { ScreenContext } from "../ui/screen.ts";
import { SCENARIOS, type LabAddress } from "../../../game/lab/scenarios.ts";
import { labHref, labWithMind, LAB_MIND, LAB_WALKER } from "../setup.ts";
import { need as find } from "../dom.ts";

/**
 * **The lab's scenario menu** (`?play=lab`): a card for each scenario, and a click opens it. The
 * character and the rate are chosen inside a scenario; the address carries them here and on, so
 * the next scenario keeps them, but for the scenario's own default mind: the Walker in Reach,
 * Option Mind elsewhere, in place of either. Built from `scenarios.ts`, so a card offered is a
 * scenario the lab has; it loads neither Babylon nor Rapier.
 */
export function showScenarios(address: LabAddress, context: ScreenContext): void {
  const need = <T extends HTMLElement>(id: string): T => find<T>(id, context.root);
  const cards = SCENARIOS.map((scenario) => {
    const card = document.createElement("a");
    const defaults = address.mind === LAB_MIND || address.mind === LAB_WALKER;
    const mind = defaults ? scenario.id === "reach" ? LAB_WALKER : LAB_MIND : address.mind;
    const chosen = { ...labWithMind(address, mind), scenario: scenario.id };
    card.href = labHref(chosen, context.address.search);
    card.append(Object.assign(document.createElement("strong"), { textContent: scenario.name }));
    return card;
  });
  need("lab-scenarios").replaceChildren(...cards);
  context.own(() => context.remember(context.address.href));
}
