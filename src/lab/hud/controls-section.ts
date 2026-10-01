import { action, type Control } from "./controls.ts";
import type { LabPage } from "./sections.ts";

/** What acts on every scenario's run: Restart. A scenario's own follow it. */
export function controlsSection(page: LabPage): readonly Control[] {
  return [action("Restart", () => page.load(page.shown))];
}
