// Readiness sequencing for the viewer, kept separate from Babylon so it can be
// unit tested the way the turntable state is.
//
// The bug this exists to prevent: the viewer used to clear its status the moment
// `createWarriorScene` returned. Constructing a scene is not the same as drawing
// one -- shaders still have to compile and the first frame still has to reach the
// canvas, which on a large display takes seconds. The status vanished and the
// canvas stayed black, so a working viewer was indistinguishable from a broken
// one. Readiness therefore advances only on evidence, and the terminal stage is
// reachable only from a frame that actually rendered.

export type ViewerStage = "loading" | "parsing" | "compiling" | "ready";

export type ReadinessEvent = "scene-built" | "assets-ready" | "frame-rendered";

export const VIEWER_STAGE_MESSAGES: Record<ViewerStage, string> = {
  loading: "Forging the warrior...",
  parsing: "Loading forged steel and leather...",
  compiling: "Compiling shaders...",
  ready: "",
};

const ORDER: readonly ViewerStage[] = ["loading", "parsing", "compiling", "ready"];

const TRANSITIONS: Record<ViewerStage, Partial<Record<ReadinessEvent, ViewerStage>>> = {
  loading: { "scene-built": "parsing" },
  parsing: { "assets-ready": "compiling" },
  compiling: { "frame-rendered": "ready" },
  ready: {},
};

/** Advance one stage, ignoring events that arrive out of order. */
export function advanceStage(stage: ViewerStage, event: ReadinessEvent): ViewerStage {
  return TRANSITIONS[stage][event] ?? stage;
}

export function stageMessage(stage: ViewerStage): string {
  return VIEWER_STAGE_MESSAGES[stage];
}

/** True only once pixels are on the canvas, which is when the status may clear. */
export function isViewerVisible(stage: ViewerStage): boolean {
  return stage === "ready";
}

export function stageIndex(stage: ViewerStage): number {
  return ORDER.indexOf(stage);
}
