import type { BoutState } from "./bout.ts";
import { restart } from "./bout.ts";

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
