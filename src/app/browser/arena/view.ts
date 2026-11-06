import { readViewSettings, viewSearch, type CameraMode, type ViewSettings } from "../../../game/appearance/view.ts";
import type { ArenaSeat as Side } from "../../../game/arena/seat.ts";

export type ArenaFocus = "both" | Side;
export interface ArenaView extends ViewSettings { readonly focus: ArenaFocus }

/** Chase follows one fighter; other cameras can frame their midpoint. */
export function cameraFocuses(camera: CameraMode): readonly ArenaFocus[] {
  switch (camera) {
    case "free": case "isometric": return ["both", "left", "right"];
    case "chase": return ["left", "right"];
    default: { const never: never = camera; throw new Error(`no camera ${never}`); }
  }
}

/** Entering Chase from a shared view follows the player, or the left fighter for a spectator. */
export function normalizeArenaView(view: ArenaView, you: Side | null): ArenaView {
  return cameraFocuses(view.camera).includes(view.focus) ? view : { ...view, focus: you ?? "left" };
}

/** Presentation settings are separate from the duel's physical recipe and tape. */
export function readArenaView(search: string, you: Side | null): ArenaView {
  const query = new URLSearchParams(search);
  return normalizeArenaView({
    ...readViewSettings(search),
    focus: cameraFocuses("free").find(value => value === query.get("focus")) ?? "both",
  }, you);
}

export function arenaViewSearch(search: string, view: ArenaView): string {
  const query = new URLSearchParams(viewSearch(search, view));
  query.set("focus", view.focus);
  return `?${query.toString().replace(/%2C/g, ",")}`;
}
