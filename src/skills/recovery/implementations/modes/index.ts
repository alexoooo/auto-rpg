import type { ActionStatus } from "../../../framework/action.ts";
import { deepFreeze } from "../../../../core/world/state.ts";
import { brace, steadying } from "./steady.ts";
import { poseDrive, technique, type TechniqueRun } from "../../technique.ts";

declare module "../../technique.ts" {
  interface TechniqueConfigs {
    readonly brace: { readonly kind: "brace" };
    readonly land: { readonly kind: "land" };
    readonly steady: { readonly kind: "steady" };
  }
}

/** A mode's sides: one, since it holds the body whichever side it lies on. */
const ONE_SIDE = Object.freeze(["left"] as const);

/** A mode's edges: none, since it takes the body nowhere. */
const NO_EDGES = Object.freeze([]);

/** What a mode's run is besides what it does a step: it admits the body anywhere, reaches nowhere, yields always and runs until it is let go. */
const MODE = deepFreeze({ yields: true, admits: () => true, reached: () => false, end() {} });

/** **Brace**, a mode of the ground: the protective flexion held while the body falls or lies (`brace`). */
export const BRACE_MODE = technique("brace", { label: "Brace", stage: "game", sides: ONE_SIDE, edges: NO_EDGES,
  make: (own): TechniqueRun => {
    const drive = poseDrive(own.muscles);
    return { ...MODE, state: {}, phase: "brace", begin() {}, step(_g, _senses, control) { brace(drive, control.muscles); return null; } };
  } });

/** **Land**, a mode of the ground: the command carried on as it is while the body lands. */
export const LAND_MODE = technique("land", { label: "Land", stage: "game", sides: ONE_SIDE, edges: NO_EDGES,
  make: (): TechniqueRun => ({ ...MODE, state: {}, phase: "land", begin() {}, step: () => null }) });

/** The steady's stage while it climbs from a crouch (`steadying`). */
const CLIMBING = "steady:climb";

/**
 * **The steady**, a mode of the ground: a body on its feet held by its own stance and climbed from
 * a quiet crouch (`steadying`), its stage `steady`, or `steady:climb` while it climbs. Begun with no
 * ground skill carried over, its motor forgets what it had under way.
 */
export const STEADY_MODE = technique("steady", { label: "Steady", stage: "game", sides: ONE_SIDE, edges: NO_EDGES,
  make: (own, view, _clock, kit): TechniqueRun => {
    const steady = steadying(own, view, kit);
    return { ...MODE, state: steady.state, get phase() { return steady.state.climb.on ? CLIMBING : "steady"; },
      begin() { steady.begin(); }, step(_g, _senses, control, dt) { steady.step(control, dt); return null; }, forget() { steady.reset(); } };
  } });

/** The modes of the ground: each holds the body as it is, taking it nowhere. */
const MODES: readonly string[] = Object.freeze([BRACE_MODE, LAND_MODE, STEADY_MODE].map((mode) => mode.defaults.kind));

/** Whether `action` is a mode's (`MODES`), not a try that takes the body somewhere. */
export const isMode = (action: ActionStatus): boolean => MODES.includes(action.action);

/** Whether `action` is the brace's (`BRACE_MODE`). */
export const braces = (action: ActionStatus): boolean => action.action === BRACE_MODE.defaults.kind;

/** Whether `action` is the steady's (`STEADY_MODE`). */
export const steadies = (action: ActionStatus): boolean => action.action === STEADY_MODE.defaults.kind;

/** Whether `action` is the steady climbing from a crouch (`CLIMBING`). */
export const climbs = (action: ActionStatus): boolean => steadies(action) && action.stage === CLIMBING;
