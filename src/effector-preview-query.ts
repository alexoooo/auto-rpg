/** An opt-in arena demonstration of one proposal, not an online expert search. */
import { channelFlagsFromSearch } from "./channel-query.ts";
import { routeFor } from "./app-route.ts";

export const EFFECTOR_PREVIEW_PARAM = "effector-preview";
export const EFFECTOR_PREVIEWS = ["sweep", "point", "soft"] as const;
export type EffectorPreviewKind = typeof EFFECTOR_PREVIEWS[number];

export function effectorPreviewFromSearch(search: string): EffectorPreviewKind | null {
  const query = new URLSearchParams(search);
  const values = query.getAll(EFFECTOR_PREVIEW_PARAM);
  if (values.length > 1) throw new Error("effector-preview must appear only once");
  const value = values[0];
  if (!value) return null;
  if (!(EFFECTOR_PREVIEWS as readonly string[]).includes(value)) throw new Error(`no effector preview "${value}"`);
  if (!channelFlagsFromSearch(search).effector) throw new Error("effector-preview requires channels=effector");
  if (routeFor(search) !== "arena") throw new Error("effector-preview requires the arena");
  return value as EffectorPreviewKind;
}
