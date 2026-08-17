export const PRESENTATION_MODES = Object.freeze([
  "world", "geometry", "top_down", "first_person", "free", "dev",
] as const);
export type PresentationMode = typeof PRESENTATION_MODES[number];
export type PresentationCameraKind = "isometric" | "overhead" | "first_person" | "free";

export type PresentationModeDefinition = Readonly<{
  mode: PresentationMode;
  label: "World" | "Geometry" | "Top Down" | "First Person" | "Free" | "Dev";
  camera: PresentationCameraKind;
  art: "full" | "ghosted" | "diagnostic";
  fog: boolean;
  diagnostics: "minimal" | "combat" | "optional" | "all";
}>;

export const PRESENTATION_MODE_DEFINITIONS: readonly PresentationModeDefinition[] = Object.freeze([
  { mode: "world", label: "World", camera: "isometric", art: "full", fog: true, diagnostics: "minimal" },
  { mode: "geometry", label: "Geometry", camera: "isometric", art: "ghosted", fog: true, diagnostics: "combat" },
  { mode: "top_down", label: "Top Down", camera: "overhead", art: "full", fog: true, diagnostics: "minimal" },
  { mode: "first_person", label: "First Person", camera: "first_person", art: "full", fog: true, diagnostics: "minimal" },
  { mode: "free", label: "Free", camera: "free", art: "full", fog: true, diagnostics: "optional" },
  { mode: "dev", label: "Dev", camera: "overhead", art: "diagnostic", fog: false, diagnostics: "all" },
]);

export function presentationModeDefinition(mode: PresentationMode): PresentationModeDefinition {
  const definition = PRESENTATION_MODE_DEFINITIONS.find((candidate) => candidate.mode === mode);
  if (definition === undefined) throw new RangeError(`unknown presentation mode ${String(mode)}`);
  return definition;
}

export function nextPresentationMode(mode: PresentationMode, direction: 1 | -1 = 1): PresentationMode {
  const at = PRESENTATION_MODES.indexOf(mode);
  if (at < 0) throw new RangeError(`unknown presentation mode ${String(mode)}`);
  return PRESENTATION_MODES[(at + direction + PRESENTATION_MODES.length) % PRESENTATION_MODES.length] ?? "world";
}

export function presentationModeLabel(mode: PresentationMode): PresentationModeDefinition["label"] {
  return presentationModeDefinition(mode).label;
}
