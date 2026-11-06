/** Presentation choices shared by body viewers; the first entry in each list is the default. */
export const VIEW_MODES = ["world", "tactical"] as const;
export type ViewMode = (typeof VIEW_MODES)[number];
export const CAMERA_MODES = ["free", "isometric", "chase"] as const;
export type CameraMode = (typeof CAMERA_MODES)[number];
export const PROJECTIONS = ["orthographic", "perspective"] as const;
export type Projection = (typeof PROJECTIONS)[number];

export interface ViewSettings {
  readonly view: ViewMode;
  readonly camera: CameraMode;
  readonly projection: Projection;
}

const DEFAULT_VIEW: ViewSettings = Object.freeze({ view: "world", camera: "free", projection: "orthographic" });

/** Read the common presentation choices, retaining the caller's defaults for absent or invalid values. */
export function readViewSettings(search: string, defaults: ViewSettings = DEFAULT_VIEW): ViewSettings {
  const query = new URLSearchParams(search);
  return {
    view: VIEW_MODES.find(value => value === query.get("view")) ?? defaults.view,
    camera: CAMERA_MODES.find(value => value === query.get("camera")) ?? defaults.camera,
    projection: PROJECTIONS.find(value => value === query.get("projection")) ?? defaults.projection,
  };
}

/** Write the common presentation choices while preserving the screen's other address fields. */
export function viewSearch(search: string, view: ViewSettings): string {
  const query = new URLSearchParams(search);
  query.set("view", view.view); query.set("camera", view.camera); query.set("projection", view.projection);
  return `?${query.toString().replace(/%2C/g, ",")}`;
}
