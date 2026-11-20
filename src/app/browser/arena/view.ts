import { readViewSettings, viewSearch, type CameraMode, type ViewSettings } from "../../../game/appearance/view.ts";
import type { ArenaSeat as Side } from "../../../game/arena/seat.ts";

export type ArenaFocus = "both" | Side;
export interface ArenaView extends ViewSettings { readonly focus: ArenaFocus }

/** Chase follows one fighter and Side frames both; other cameras can do either. */
export function cameraFocuses(camera: CameraMode): readonly ArenaFocus[] {
  switch (camera) {
    case "free": case "isometric": return ["both", "left", "right"];
    case "chase": return ["left", "right"];
    case "side": return ["both"];
    default: { const never: never = camera; throw new Error(`no camera ${never}`); }
  }
}

/**
 * A focus the camera does not offer becomes one it does: entering Chase from a shared view follows
 * the player, or the left fighter for a spectator, and entering Side frames both.
 */
export function normalizeArenaView(view: ArenaView, you: Side | null): ArenaView {
  const offered = cameraFocuses(view.camera), own = you ?? "left";
  return offered.includes(view.focus) ? view : { ...view, focus: offered.includes(own) ? own : offered[0]! };
}

/** The Arena opens on Side, which frames both fighters. */
const ARENA_VIEW: ViewSettings = Object.freeze({ view: "world", camera: "side", projection: "orthographic" });

/** Presentation settings are separate from the duel's physical recipe and tape. */
export function readArenaView(search: string, you: Side | null): ArenaView {
  const query = new URLSearchParams(search);
  return normalizeArenaView({
    ...readViewSettings(search, ARENA_VIEW),
    focus: cameraFocuses("free").find(value => value === query.get("focus")) ?? "both",
  }, you);
}

export function arenaViewSearch(search: string, view: ArenaView): string {
  const query = new URLSearchParams(viewSearch(search, view));
  query.set("focus", view.focus);
  return `?${query.toString().replace(/%2C/g, ",")}`;
}
