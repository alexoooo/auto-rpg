export const PRESENTATION_MODES = Object.freeze(["world", "tactical"] as const);
export type PresentationMode = typeof PRESENTATION_MODES[number];

export function nextPresentationMode(mode: PresentationMode): PresentationMode {
  return mode === "world" ? "tactical" : "world";
}

export function presentationModeLabel(mode: PresentationMode): "World" | "Tactical" {
  return mode === "world" ? "World" : "Tactical";
}
