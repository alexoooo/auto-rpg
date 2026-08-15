import { MAP_UNKNOWN } from "../protocol/abi.generated.js";
import type {
  PresentationFurniture, PresentationSnapshot, PresentationUnit,
} from "./presentation.js";

export type VisibilityState = "unseen" | "remembered" | "current";
export type SpatialRecordKind = "geometry" | "unit" | "shot" | "event" | "furniture";

export type PresenceDecision = Readonly<{
  visibility: VisibilityState;
  known: boolean;
  material: "none" | "remembered" | "current";
  render: boolean;
  shadow: boolean;
  label: boolean;
  effect: boolean;
  audio: boolean;
  pick: boolean;
  debug: boolean;
}>;

const freeze = <T extends object>(value: T): Readonly<T> => Object.freeze(value);
const ABSENT = freeze({
  visibility: "unseen" as const, known: false, material: "none" as const,
  render: false, shadow: false, label: false, effect: false,
  audio: false, pick: false, debug: false,
});

function tileState(snapshot: PresentationSnapshot, tx: number, ty: number): Readonly<{
  visibility: VisibilityState; known: boolean;
}> {
  if (!Number.isInteger(tx) || !Number.isInteger(ty) ||
      tx < 0 || ty < 0 || tx >= snapshot.mapCols || ty >= snapshot.mapRows) {
    return ABSENT;
  }
  const at = ty * snapshot.mapCols + tx;
  const map = snapshot.map[at];
  const vis = snapshot.vis[at];
  if (map === undefined || vis === undefined || map === MAP_UNKNOWN || vis === 0) return ABSENT;
  if (vis === 1) return freeze({ visibility: "remembered" as const, known: true });
  if (vis === 2) return freeze({ visibility: "current" as const, known: true });
  return ABSENT;
}

function present(visibility: "remembered" | "current", kind: SpatialRecordKind): PresenceDecision {
  if (kind === "geometry") {
    return freeze({
      visibility, known: true, material: visibility,
      render: true, shadow: visibility === "current", label: false,
      effect: false, audio: false, pick: false, debug: true,
    });
  }
  if (visibility !== "current") return freeze({ ...ABSENT, visibility, known: true });
  return freeze({
    visibility, known: true, material: "current",
    render: true, shadow: true, label: kind === "unit", effect: kind === "event",
    audio: false, pick: kind === "unit" || kind === "furniture", debug: true,
  });
}

export function decideTilePresence(
  snapshot: PresentationSnapshot, kind: "geometry" | "furniture", tx: number, ty: number,
): PresenceDecision {
  const state = tileState(snapshot, tx, ty);
  return state.known ? present(state.visibility as "remembered" | "current", kind) : ABSENT;
}

export function decidePointPresence(
  snapshot: PresentationSnapshot, kind: "unit" | "shot" | "event", x: number, y: number,
  disclosed = true,
): PresenceDecision {
  if (!disclosed || !Number.isFinite(x) || !Number.isFinite(y) ||
      !Number.isFinite(snapshot.tileSize) || snapshot.tileSize <= 0) return ABSENT;
  const state = tileState(snapshot, Math.floor(x / snapshot.tileSize), Math.floor(y / snapshot.tileSize));
  return state.known ? present(state.visibility as "remembered" | "current", kind) : ABSENT;
}

export function decideUnitPresence(
  snapshot: PresentationSnapshot, unit: PresentationUnit,
): PresenceDecision {
  return decidePointPresence(snapshot, "unit", unit.x, unit.y, unit.visible);
}

export function decideFurniturePresence(
  snapshot: PresentationSnapshot, furniture: PresentationFurniture,
): PresenceDecision {
  return decideTilePresence(snapshot, "furniture", furniture.tx, furniture.ty);
}
