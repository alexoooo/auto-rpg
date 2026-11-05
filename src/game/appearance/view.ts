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
