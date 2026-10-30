import { LAB_RATES, labMind, type LabAddress } from "../scenarios.ts";
import { entries, following, menu, when, type Control, type Named } from "../../ui/controls.ts";
import type { LabPage } from "./sections.ts";
import { dummyPart, dummyParts } from "../dummy-spec.ts";
import { attackTargetWarnings } from "../attack-target.ts";
import { takesScript } from "../../core/mind/catalog.ts";

const RATES: Named<LabAddress["hz"]> = {
  120: { name: "120 Hz", title: "The game's rate" },
  480: { name: "480 Hz", title: "A finer step, where the readings converge" },
};

/** What every scenario is configured by: the physics rate. A scenario's own follow it. */
export function scenarioSection(page: LabPage): readonly Control[] {
  const feedback = document.createElement("p");
  feedback.className = "alert";
  feedback.setAttribute("role", "status");
  let previous: readonly unknown[] = [];
  const compatibility: Control = { element: feedback, refresh() {
    if (page.shown.scenario !== "attack") return;
    const next = [page.spec, page.shown.mind, page.shown.barred, page.shown.targetPart];
    if (next.every((value, index) => value === previous[index])) return;
    previous = next;
    const mind = labMind(page.shown.mind, page.spec, "attack").plays;
    const warnings = takesScript(mind) ? attackTargetWarnings(page.spec, mind, page.shown.targetPart, page.shown.barred) : [];
    feedback.textContent = warnings.join(" "); feedback.hidden = warnings.length === 0;
  } };
  return [
    menu("Physics", entries(LAB_RATES, RATES), () => page.shown.hz, (hz) => page.load({ ...page.shown, hz })),
    when(() => page.shown.scenario === "attack", following(() => page.spec, spec =>
      menu("Target part", dummyParts(spec).map(part => ({ value: part, name: part })),
        () => dummyPart(spec, page.shown.targetPart), targetPart => page.load({ ...page.shown, targetPart })))),
    when(() => page.shown.scenario === "attack", compatibility),
  ];
}
