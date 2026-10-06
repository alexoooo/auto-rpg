import { LAB_RATES, type LabAddress } from "../scenarios.ts";
import { choice, entries, type Control, type Named } from "../../ui/controls.ts";
import type { LabPage } from "./sections.ts";

const RATES: Named<LabAddress["hz"]> = {
  120: { name: "120 Hz", title: "The game's rate" },
  480: { name: "480 Hz", title: "A finer step, where the readings converge" },
};

/** What every scenario is configured by: the physics rate. A scenario's own follow it. */
export function scenarioSection(page: LabPage): readonly Control[] {
  return [
    choice("Rate", entries(LAB_RATES, RATES), () => page.shown.hz, (hz) => page.load({ ...page.shown, hz })),
  ];
}
