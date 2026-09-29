import type { Scene } from "@babylonjs/core/scene.js";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { World } from "../core/world.ts";
import type { Player, Playhead } from "./player.ts";
import type { Hand } from "./skin.ts";

/**
 * **What the lab's shell (`main.ts`) asks of a scenario.** The shell owns the page: the engine,
 * the ground, the world each load makes, the view, the camera and the transport bar. A scenario
 * owns what it does to the body and what it shows of it: its own panel section, its own marks on
 * the ground, the keys it takes, and the recording the transport steps through.
 *
 * A page runs one scenario. It is made once (`LabScenario`), wiring its controls; each load --
 * a new character or rate, or Restart -- starts a new run on a new body in a new world.
 */
export interface LabScenario {
  /** The keys it takes while it runs (`KeyboardEvent.code`); the shell holds them as a level. */
  readonly keys: ReadonlySet<string>;
  /** What the transport bar's slider says it steps through. */
  readonly timelineLabel: string;
  start(context: ScenarioContext): ScenarioRun;
}

export interface ScenarioContext {
  readonly scene: Scene;
  /** A body in its reference pose at the origin, facing +z, on the ground. */
  readonly built: BuiltBody;
  readonly world: World;
  /** For the player: the transport shows its playhead. */
  readonly changed: (playhead: Playhead) => void;
  readonly clock: () => number;
}

export interface ScenarioRun {
  /** The only thing that steps the world. */
  readonly player: Player;
  /** What the transport steps through: its length, its live frame, and whether it wraps. */
  recording(): { readonly frames: number; readonly live: number; readonly wraps: boolean };
  /** Each page frame, before the player ticks: what the keys held now ask of the body. */
  drive(held: ReadonlySet<string>): void;
  /** Write the panel and the marks for the frame shown (null: live), and return its time, s. */
  readout(frame: number | null): number | null;
  /** How far `hand` is closed at the frame shown, from 0 (open) to 1 (a fist). */
  closure(hand: Hand): number;
  dispose(): void;
}
