import { action, type Control } from "../../ui/controls.ts";
import type { LabPage } from "./sections.ts";

/** What acts on every scenario's run, at the head of the transport's bar: Restart. */
export function controlsSection(page: LabPage): readonly Control[] {
  return [action("Restart", () => page.load(page.shown), "Start the scenario again on a new body")];
}
