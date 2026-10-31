import { CAMERA_MODES, PROJECTIONS, VIEW_MODES, type CameraMode, type Projection, type ViewMode, type ViewSettings } from "../render/view.ts";
import { choice, entries, when, type Control, type Named } from "./controls.ts";

const VIEWS: Named<ViewMode> = {
  world: { name: "World", title: "Artwork, textures and visual effects" },
  tactical: { name: "Tactical", title: "Physical geometry without textures or visual effects" },
};
const CAMERAS: Named<CameraMode> = {
  free: { name: "Free", title: "Orbit with the pointer" },
  isometric: { name: "Isometric", title: "A fixed diagonal view" },
  chase: { name: "Chase", title: "Behind the body, turning after it" },
};
const DRAWN: Named<Projection> = { orthographic: { name: "Orthographic" }, perspective: { name: "Perspective" } };

/**
 * A view panel reads settings and requests edits; its screen owns their application and persistence.
 * Each screen uses the same choices and presentation.
 */
export function viewModeControl(read: () => ViewMode, change: (view: ViewMode) => void): Control {
  return choice("View", entries(VIEW_MODES, VIEWS), read, change);
}

export function viewControls(read: () => ViewSettings, change: (patch: Partial<ViewSettings>) => void): readonly Control[] {
  return [
    viewModeControl(() => read().view, view => change({ view })),
    choice("Camera", entries(CAMERA_MODES, CAMERAS), () => read().camera, camera => change({ camera })),
    when(() => read().camera === "isometric",
      choice("Projection", entries(PROJECTIONS, DRAWN), () => read().projection, projection => change({ projection }))),
  ];
}
