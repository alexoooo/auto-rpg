import { labHref, LAB_PRESETS, recoveryAddress, SCENARIOS, type LabAddress } from "./scenarios.ts";
import { need } from "../dom.ts";

/**
 * **The lab's scenario menu** (`?play=lab`): a card for each scenario, and a click opens it. The
 * character and the rate are chosen inside a scenario; the address carries them here and on, so
 * the next scenario keeps them. Built from `scenarios.ts`, so a card offered is a scenario the lab
 * has; it loads neither Babylon nor Rapier.
 */
export function showScenarios(address: LabAddress): void {
  const cards = SCENARIOS.map((scenario) => {
    const card = document.createElement("a");
    let mind = address.mind;
    if (mind.kind === "fighter") {
      if (scenario.id === "attack" && mind.tactics.kind === "script") mind = LAB_PRESETS.puncher.config;
      else if (scenario.id !== "attack" && mind.tactics.kind !== "script" && mind.tactics.kind !== "stand")
        mind = { ...mind, tactics: { kind: "script" } };
    }
    const chosen = { ...address, mind, scenario: scenario.id };
    card.href = labHref(scenario.id === "recovery" ? recoveryAddress(chosen) : chosen, window.location.search);
    card.append(Object.assign(document.createElement("strong"), { textContent: scenario.name }));
    return card;
  });
  need("lab-scenarios").replaceChildren(...cards);
  cards[0]?.focus();
}
