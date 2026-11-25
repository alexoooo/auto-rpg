import type { BodyControl } from "../core/bodies/body-control.ts";
import type { Senses } from "../core/bodies/senses.ts";
import type { BodyCommand, BodyView } from "../control/body.ts";
import type { Mind } from "./mind.ts";
import type { CommandLayers } from "./motor-layers.ts";

/** What every commanding Mind remembers: its command layers' memory, and whether its body is away from it. */
export interface Commanding { readonly layers: object; idle: boolean }

/**
 * A Mind that runs its body through the command layers. Each step it reads the body's senses
 * into the layers and queues what it decides; when a decision comes due, after the body's
 * reaction time, it turns the decision into a body command and has the motor carry it out.
 * A subclass says what it decides, how a decision becomes a command, and what it lets go of
 * when its body is taken from it.
 */
export abstract class CommandingMind<D> implements Mind {
  protected readonly layers: CommandLayers;
  abstract readonly state: Commanding;

  /** A subclass's fields are not yet set while this runs, so it calls none of the three methods below. */
  constructor(layers: CommandLayers) { this.layers = layers; }

  think(senses: Senses): void {
    const { layers, state } = this;
    layers.look(senses);
    if (state.idle) { layers.resume(); state.idle = false; }
    layers.decided(this.decide(layers.view, layers.body.dt));
  }

  act(control: BodyControl): void {
    const { layers } = this;
    layers.observe(control);
    if (this.state.idle) return;
    const due = layers.take(control) as D | null;
    layers.apply(due === null ? null : this.carry(layers.view, due, layers.body.dt), control);
  }

  interrupt(): void {
    if (this.state.idle) return;
    this.released(this.layers.view, "idle");
    this.layers.release("idle");
    this.state.idle = true;
  }

  /** What it wants as of this step. Null keeps the command its body already has. */
  protected abstract decide(view: BodyView, dt: number): D | null;
  /** The body command that carries out a decision now due. */
  protected abstract carry(view: BodyView, decision: D, dt: number): BodyCommand | null;
  /** Its body is being taken from it: let go of what it holds. */
  protected abstract released(view: BodyView, reason: "idle"): void;
}
