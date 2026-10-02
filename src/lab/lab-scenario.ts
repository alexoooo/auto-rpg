import type { Scene } from "@babylonjs/core/scene.js";
import type { SoundCue } from "../audio/cues.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { Player, Playhead } from "./player.ts";
import type { Hand } from "../render/skin.ts";
import type { Actor } from "./actor.ts";
import type { Control } from "./hud/controls.ts";
import type { LabAddress } from "./scenarios.ts";

/**
 * **What the lab's shell (`main.ts`) asks of a scenario.** The shell owns the page: the engine,
 * the ground, the world each load makes, the view, the camera and the transport bar. A scenario
 * owns what it does to the body and what it shows of it: its own panels, its own marks on
 * the ground, the keys it takes, and the recording the transport steps through.
 *
 * A page runs one scenario. It is made once (`LabScenario`), building its panels; each load --
 * a new character or rate, or Restart -- starts a new run on a new body in a new world.
 */
export interface LabScenario {
  /** What it puts in the HUD, built with the lab's controls (`hud/controls.ts`); the shell places each list. */
  readonly panels: Readonly<Partial<Record<(typeof SCENARIO_PANELS)[number], readonly Control[]>>>;
  /** The keys it takes while it runs (`KeyboardEvent.code`); the shell holds them as a level. */
  readonly keys: ReadonlySet<string>;
  /** What the transport bar's slider says it steps through. */
  readonly timelineLabel: string;
  start(context: ScenarioContext): ScenarioRun;
}

/**
 * Where a scenario's panels go: `scenario` holds what starts it again when changed, `controls` what
 * acts on the run under way, `readout` what it reads.
 */
export const SCENARIO_PANELS = ["scenario", "controls", "readout"] as const;

/** What the shell offers a scenario's own controls. */
export interface LabShell {
  /** Start the scenario again on a new body in a new world, as Restart does. */
  restart(): void;
}

interface ScenarioContext {
  readonly scene: Scene;
  /** A body in its reference pose at the origin, facing +z, on the ground of its world, as the page stands it: the scenario's mode hands it its script (`Actor.drive`). */
  readonly actor: Actor;
  /** The address the body was loaded from: what a scenario reads of its own in it. */
  readonly address: LabAddress;
  /** For the player: the transport shows its playhead. */
  readonly changed: (playhead: Playhead) => void;
  readonly clock: () => number;
  /**
   * A sound of the scenario's own instrument, one that is no contact in the world, at the body's
   * time now; the body's touches and its air are heard without it (`sound-log.ts`).
   */
  readonly heard: (cue: SoundCue | null) => void;
  /**
   * Another body the scenario puts in the body's world, such as a target it strikes at: its
   * touches are heard with the body's until what this returns is disposed.
   */
  readonly hears: (built: BuiltBody) => { dispose(): void };
}

export interface ScenarioRun {
  /** The only thing that steps the world. */
  readonly player: Player;
  /** What the transport steps through: its length and its live frame. */
  recording(): { readonly frames: number; readonly live: number };
  /** Each page frame, before the player ticks: what the keys held now ask of the body. */
  drive(held: ReadonlySet<string>): void;
  /**
   * Write the readout and the marks for the frame shown (null: live), and return its time, s: the
   * time the body's mind saw at that step (`BodyView.time`), which the shell cuts the mind's log at.
   */
  readout(frame: number | null): number | null;
  /** How far `hand` is closed at the frame shown, from 0 (open) to 1 (a fist). */
  closure(hand: Hand): number;
  dispose(): void;
}
