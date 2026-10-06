import { viewControls } from "../../ui/view-controls.ts";
import type { Control } from "../../ui/controls.ts";
import type { LabPage } from "./sections.ts";

/** View choices apply to the Lab's existing body and playback. */
export function viewSection(page: LabPage): readonly Control[] {
  return viewControls(() => page.shown, patch => page.show({ ...page.shown, ...patch }));
}
