import { LAB_CAMERAS, LAB_PROJECTIONS, LAB_VIEWS, type LabCamera, type LabProjection, type LabView } from "../scenarios.ts";
import { choice, entries, when, type Control, type Named } from "./controls.ts";
import type { LabPage } from "./sections.ts";

const VIEWS: Named<LabView> = {
  world: { name: "World", title: "The workshop model's skin, carried by the segments" },
  tactical: { name: "Tactical", title: "The collision shapes the solver moves" },
};
const CAMERAS: Named<LabCamera> = {
  free: { name: "Free", title: "Drag to orbit, right-drag to pan" },
  isometric: { name: "Isometric" },
  chase: { name: "Chase", title: "Behind the body, turning after it" },
};
const PROJECTIONS: Named<LabProjection> = { orthographic: { name: "Orthographic" }, perspective: { name: "Perspective" } };

/** How the body is drawn and followed; none of it changes the body. */
export function viewSection(page: LabPage): readonly Control[] {
  return [
    choice("View", entries(LAB_VIEWS, VIEWS), () => page.shown.view, (view) => page.show({ ...page.shown, view })),
    choice("Camera", entries(LAB_CAMERAS, CAMERAS), () => page.shown.camera, (camera) => page.show({ ...page.shown, camera })),
    when(() => page.shown.camera === "isometric",
      choice("Projection", entries(LAB_PROJECTIONS, PROJECTIONS), () => page.shown.projection, (projection) => page.show({ ...page.shown, projection }))),
  ];
}
