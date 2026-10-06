import { CAMERA_MODES, PROJECTIONS, VIEW_MODES, type CameraMode, type Projection, type ViewMode, type ViewSettings } from "../render/view.ts";
import { choice, entries, when, type Control, type Named } from "./controls.ts";

const VIEWS: Named<ViewMode> = {
  world: { name: "World", title: "The character's skin, carried by the segments" },
  tactical: { name: "Tactical", title: "The collision shapes the solver moves" },
};
const CAMERAS: Named<CameraMode> = {
  free: { name: "Free", title: "Orbit with the pointer" },
  isometric: { name: "Isometric", title: "A fixed diagonal view" },
  chase: { name: "Chase", title: "Behind the body, turning after it" },
};
const DRAWN: Named<Projection> = { orthographic: { name: "Orthographic" }, perspective: { name: "Perspective" } };

/** A view panel reads settings and requests edits; its screen owns their application and persistence. */
export function viewControls(read: () => ViewSettings, change: (patch: Partial<ViewSettings>) => void): readonly Control[] {
  return [
    choice("View", entries(VIEW_MODES, VIEWS), () => read().view, view => change({ view })),
    choice("Camera", entries(CAMERA_MODES, CAMERAS), () => read().camera, camera => change({ camera })),
    when(() => read().camera === "isometric",
      choice("Projection", entries(PROJECTIONS, DRAWN), () => read().projection, projection => change({ projection }))),
  ];
}
