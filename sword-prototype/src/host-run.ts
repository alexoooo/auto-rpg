import type { BoutState } from "./bout.ts";
import { restart } from "./bout.ts";

interface VisibilityTarget {
  readonly classList: { toggle(name: string, force?: boolean): boolean };
}

/**
 * Setup replaces the arena; pause belongs inside it.
 *
 * Holding both targets in one small, DOM-shaped object makes that distinction
 * testable without a browser. In particular, `showPaused` has no path to the
 * setup curtain, so a focus-loss pause cannot replace the frame somebody was
 * trying to capture.
 */
export class ArenaPresentation {
  private readonly setup: VisibilityTarget;
  private readonly pause: VisibilityTarget;

  constructor(setup: VisibilityTarget, pause: VisibilityTarget) {
    this.setup = setup;
    this.pause = pause;
  }

  showSetup(visible: boolean): void {
    this.setup.classList.toggle("gone", !visible);
  }

  showPaused(paused: boolean): void {
    this.pause.classList.toggle("gone", !paused);
  }
}

export interface RebuiltFrameHost {
  placeCamera(): void;
  updateRoomOcclusion(): void;
  render(): void;
}

/**
 * Publish one complete frame before a setup curtain is allowed to leave.
 *
 * A Construct is much more expensive to compile than a humanoid. On a first-page
 * Construct launch the curtain could finish hiding before the ordinary animation
 * loop had painted the replacement scene, exposing a blank canvas until another
 * visible frame happened to run. The rebuild boundary already owns the new body;
 * it also owns the first truthful frame of that body.
 */
export function presentRebuiltFrame(host: RebuiltFrameHost): void {
  host.placeCamera();
  host.updateRoomOcclusion();
  host.render();
}

/** The browser-owned half of pause/restart, kept small enough to test without a DOM. */
export interface RunningHost {
  readonly active: boolean;
  setPhysics(enabled: boolean): void;
  startControls(): void;
  pauseControls(): void;
  showPaused(paused: boolean): void;
  rebuild(): void;
}

/** Pause is idempotent: focus loss may report both blur and hidden visibility. */
export function pauseHost(host: RunningHost): boolean {
  if (!host.active) return false;
  host.setPhysics(false);
  host.pauseControls();
  host.showPaused(true);
  return true;
}

export function resumeHost(host: RunningHost): boolean {
  if (host.active) return false;
  host.showPaused(false);
  // Physics is enabled immediately before controls, so no active control step
  // can ever run against a scene the host still considers paused.
  host.setPhysics(true);
  host.startControls();
  return true;
}

export function restartHost(state: BoutState, host: RunningHost, resume: boolean): BoutState {
  const fresh = restart(state);
  if (fresh === state) return state;
  host.rebuild();
  if (resume) resumeHost(host);
  return fresh;
}

/** One authority gate for every mutable stage between two rendered frames. */
export function runActiveHostFrame(host: Pick<RunningHost, "active">, advance: () => void): boolean {
  if (!host.active) return false;
  advance();
  return true;
}

export interface HostTimers {
  readonly camera: number;
  readonly hint: number;
  readonly hand: number;
}

/**
 * Cosmetic messages use game time too.
 *
 * These used to sit below the simulation gate in the render loop, which meant
 * a screenshot-triggered pause froze the bodies but quietly consumed the hint
 * and camera notices. Returning the same object while paused makes that freeze
 * exact and makes the otherwise easy-to-miss boundary testable without a DOM.
 */
export function advanceActiveHostTimers(
  host: Pick<RunningHost, "active">,
  timers: HostTimers,
  dt: number,
): HostTimers {
  if (!host.active) return timers;
  return {
    camera: Math.max(0, timers.camera - dt),
    hint: Math.max(0, timers.hint - dt),
    hand: Math.max(0, timers.hand - dt),
  };
}
