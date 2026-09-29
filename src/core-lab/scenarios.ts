import { playHref } from "../app-route.ts";
import type { WorkshopModel } from "../core/human/rig.ts";

/**
 * **The lab's scenarios, and the address that opens one.** `?play=lab` is the scenario menu
 * (`setup.ts`); `?play=lab&scenario=…&model=…&hz=…` runs that scenario (`main.ts`), where the
 * character and the rate are chosen. Choosing a scenario, or going back to the menu, is a
 * navigation, as every change of screen in the game is.
 *
 * Pure and free of the DOM, so `tests/core-lab-scenarios.test.mjs` can argue with it; the menu
 * reads its options from here, so an option offered is one the lab has.
 */

export type ScenarioId = "stance" | "routine";

export interface ScenarioInfo {
  readonly id: ScenarioId;
  readonly name: string;
  readonly line: string;
}

/** Every scenario, in the menu's order; the first is the default. */
export const SCENARIOS: readonly ScenarioInfo[] = [
  { id: "stance", name: "Stance", line: "Walk it from the keyboard, shove it from the panel." },
  { id: "routine", name: "Routine", line: "It walks out, strikes three times, turns and walks back." },
];

export const MODELS: readonly { readonly id: WorkshopModel; readonly name: string }[] = [
  { id: "workshop-fighter", name: "Warrior" },
  { id: "workshop-rogue", name: "Rogue" },
];

/**
 * The physics and control rates on offer, Hz: the game's (`PHYSICS_HZ`, which the test pins
 * this to without the menu loading the engine), and a finer step where the readings converge.
 */
export const LAB_RATES = [120, 480] as const;
export type LabRate = (typeof LAB_RATES)[number];

export interface LabAddress {
  /** The scenario to run; none is the menu. */
  readonly scenario: ScenarioId | null;
  readonly model: WorkshopModel;
  readonly hz: LabRate;
}

const KEYS = ["scenario", "model", "hz"] as const;

/** Read the lab's address; anything missing or unknown is the default. */
export function labAddress(search: string): LabAddress {
  const query = new URLSearchParams(search);
  return {
    scenario: SCENARIOS.find((s) => s.id === query.get("scenario"))?.id ?? null,
    model: MODELS.find((m) => m.id === query.get("model"))?.id ?? MODELS[0].id,
    hz: LAB_RATES.find((r) => String(r) === query.get("hz")) ?? LAB_RATES[0],
  };
}

/**
 * The address of `address`, keeping whatever else `search` holds. The menu keeps the character
 * and the rate, so going back to it and on to another scenario keeps them too.
 */
export function labHref(address: LabAddress, search = ""): string {
  const query = new URLSearchParams(playHref("lab", search));
  for (const key of KEYS) query.delete(key);
  if (address.scenario) query.set("scenario", address.scenario);
  query.set("model", address.model);
  query.set("hz", String(address.hz));
  return `?${query}`;
}
