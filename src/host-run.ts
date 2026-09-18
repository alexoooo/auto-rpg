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

/**
 * The speeds the skim offers, and the only values `runHostFrame` will run.
 *
 * Three, and 1 is not a speed but the absence of one: the arena is a real-time game and Session 03
 * of the learn set adds no speed multiplier to the fight. What it adds is a diagnostics control for
 * watching a snapshot, where a sixty-second bout between two minds that will not close is a minute
 * of somebody's attention spent on nothing. 4 is the roof because the frame's work is done four
 * times at 60 Hz and a host that fell behind would start dropping frames, which turns a skim into a
 * slideshow of a fight nobody can read.
 */
export const SKIM_SPEEDS: readonly number[] = Object.freeze([1, 2, 4]);

/**
 * How many times a frame's simulation runs at a given skim speed.
 *
 * **It multiplies the number of fixed steps and never the size of one**, which is the whole of what
 * makes this safe. `AGENTS.md` carries the trap in as many words -- the solver must never see a
 * variable timestep, and stepping by a raw frame delta was measured at 40 mm of tip wander against
 * 0 mm fixed -- and it cost two sessions. The pattern is `scripts/bout-runner.mjs`'s: its loop
 * advances `scene._renderId` and calls `_advancePhysicsEngineStep` with a fixed frame's worth of
 * milliseconds, once per simulated frame, and Babylon's own sub-step accumulator inside that call
 * is what keeps the solver's step the size `setSubTimeStep` fixed it at. Running that loop body
 * twice is two frames of the same simulation; scaling its argument would be a different simulator.
 *
 * Clamped rather than trusted, because `CONFIG` is deliberately mutable from the console and a
 * speed of 400 typed into it would be a hang rather than a fast fight.
 */
export function skimSteps(speed: number | undefined): number {
  if (speed === undefined || !Number.isFinite(speed)) return 1;
  const roof = SKIM_SPEEDS[SKIM_SPEEDS.length - 1];
  return Math.max(1, Math.min(roof, Math.round(speed)));
}

/** The browser-owned half of pause/restart, kept small enough to test without a DOM. */
export interface RunningHost {
  readonly active: boolean;
  /**
   * The diagnostics skim, 1 by default and never anything but a `SKIM_SPEEDS` entry.
   *
   * Optional so that everything which only ever wanted `active` -- `pauseHost`, `resumeHost`, the
   * fixtures that stand in for a browser -- keeps working unchanged and reads as speed 1.
   */
  readonly speed?: number;
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

/**
 * One authority gate for the simulation, followed by presentation in both modes.
 *
 * Pause freezes authored state; it does not freeze the player's viewpoint. Keeping
 * the two callbacks on opposite sides of this boundary prevents a camera fix from
 * accidentally advancing a mind, and prevents a later simulation edit from putting
 * the camera back behind the pause gate.
 *
 * **`advance` may run more than once, and it is handed which run it is on.** At speed 1 -- which is
 * the arena, always, unless somebody has opened the diagnostics disclosure and asked for otherwise
 * -- it runs exactly once and nothing about this frame is different from the frame before the skim
 * existed. Above 1 it runs `skimSteps(host.speed)` times, and the index is what lets a caller do
 * the one thing an extra run needs that the first does not: drive the solver itself. The page's
 * first run is followed by `scene.render()`, which advances physics off the frame delta; every run
 * after it has to advance the world by hand before doing the frame's work, which is
 * `scripts/bout-runner.mjs`'s loop and nothing else. Presentation stays at one per frame, because
 * the camera and the room occlusion are about what is on screen and not about what the world did.
 */
export function runHostFrame(
  host: Pick<RunningHost, "active" | "speed">,
  advance: (step: number) => void,
  present: () => void,
): boolean {
  if (host.active) {
    const steps = skimSteps(host.speed);
    for (let step = 0; step < steps; step += 1) advance(step);
  }
  present();
  return host.active;
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
