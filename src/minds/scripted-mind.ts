import { constructionScope } from "../core/construction.ts";
import type { Body, BodyCommand, BodyView, LayerOptions } from "../control/body.ts";
import type { BodyControl } from "../core/bodies/body-control.ts";
import type { Clock } from "../core/world/clock.ts";
import type { OwnBody } from "../core/bodies/own-body.ts";
import type { Senses } from "../core/bodies/senses.ts";
import { CommandingMind, type Commanding } from "./commanding-mind.ts";
import { commandLayers, type CommandLayers } from "./motor-layers.ts";
import type { Mind, MindConstruction } from "./mind.ts";

/** A computation that can take a body from its host. */
interface SubMind extends Mind {
  wants(senses: Senses): boolean;
  begin(): void;
  holds?(): boolean;
  end(): void;
}

/** A sub-mind may observe completed physics through its host's ordered listeners. */
export type SubMindMaker = (own: OwnBody, view: BodyView, clock: Clock, afterPhysics: Body["afterPhysics"]) => MindConstruction<SubMind>;

/**
 * **A driver in two parts**: what it decides on the view as sensed (`decide`), and the command it
 * carries the decision out with on the body as it is (`carry`, null to keep the command). It
 * decides in `think` and carries out the due decision in `act`, on a view whose body is current
 * and whose senses are those the last decision read.
 */
export interface SplitDriver<T> {
  /** All memory carried between decisions, saved under the scripted Mind it is registered with. */
  readonly state: object;
  decide(view: BodyView, dt: number): T;
  carry(view: BodyView, decision: T, dt: number): BodyCommand | null;
}

/**
 * What drives a scripted body: given the view and the step, the command for this step, or null to
 * keep the last (after a sub-mind had the body, the last is its posture alone). The body keeps the
 * command's goals in its state, and a load writes into whatever of a state is not frozen. So a
 * command, and whatever it holds, is made for the step, or frozen (`deepFreeze`), or part of a
 * state saved and loaded with the body's, as the skills' is (`Skills.state`).
 * A function driver is stateless and decides its command whole; a driver that remembers between
 * steps is a `SplitDriver` and supplies its `state`.
 */
type BodyDriver = ((view: BodyView, dt: number) => BodyCommand | null) | SplitDriver<unknown>;

/** What a driver is told when its work under way is over: a sub-mind took the body, the body was left to nobody, or another driver replaced it. */
type Discard = (view: BodyView, reason: "takeover" | "idle" | "replaced") => void;

/**
 * **Register what drives a scripted body** each control step; null keeps the command. Replaced, a
 * driver's decisions not yet carried out are dropped. `discard` is called when the driver's work
 * under way is over (`Discard`).
 */
export type Drive = (driver: BodyDriver | null, discard?: Discard) => void;

/** Who has a scripted body where no sub-mind does: its driver, or nobody. A sub-mind is named by its index. */
const HOST = -1, NOBODY = -2;

/** What a scripted Mind remembers beside its layers' memory. While anyone but its driver has the body, `idle` is true. */
interface ScriptedState extends Commanding {
  /** The registered driver's memory, its skills' with it. Null while no driver is registered. */
  driver: object | null;
  /** Who has the body: a sub-mind's index, `HOST` or `NOBODY`. */
  has: number;
  /** Each sub-mind's memory, in rank order. */
  readonly subs: readonly object[];
}

/**
 * A Mind whose deciding is a driver registered from outside (`drive`): a test's, a study's or a
 * task's. Its sub-minds, in rank order, may take the body from the driver. A sub-mind takes it
 * between the senses being read and the driver thinking, so this class decides who has the body
 * before the base class's own turn.
 */
class ScriptedMind extends CommandingMind<unknown> {
  readonly state: ScriptedState;
  private readonly subs: readonly MindConstruction<SubMind>[];
  // The driver registered now, and what to tell it when its work is over. A driver is code and is
  // registered again on every build, so it is no memory: what it remembers is `state.driver`.
  private driver: SplitDriver<unknown> | null = null;
  private discard: Discard | undefined = undefined;

  constructor(layers: CommandLayers<unknown>, subs: readonly MindConstruction<SubMind>[]) {
    super(layers);
    this.subs = subs;
    this.state = { layers: layers.state, idle: false, driver: null, has: HOST, subs: subs.map((sub) => sub.mind.state) };
  }

  /** Register `next` as the driver (`Drive`). */
  drive(next: BodyDriver | null, discard?: Discard): void {
    const split = typeof next === "function" ? { state: {}, decide: next, carry: carried } : next;
    if (this.driver && split?.decide !== this.driver.decide) { this.discard?.(this.layers.view, "replaced"); this.layers.forget(); }
    this.driver = split;
    this.state.driver = split === null ? null : split.state;
    this.discard = discard;
  }

  /** The name of whoever has the body: a sub-mind's, the layers' while the driver has it, or `"nobody"`. */
  has(): string {
    const { has } = this.state;
    return has === NOBODY ? "nobody" : has === HOST ? this.layers.name : this.subs[has]!.name;
  }

  override think(senses: Senses): void {
    const { layers, state, subs } = this;
    layers.look(senses);
    // A sub-mind that holds the body keeps it while it still wants it; else the first in rank that wants it has it, else the driver.
    const held = state.has >= 0 ? subs[state.has]!.mind : null;
    const holder = held?.holds && held.wants(senses) && held.holds() ? state.has : -1;
    const want = holder >= 0 ? holder : subs.findIndex((sub) => sub.mind.wants(senses));
    if (want !== state.has) {
      this.leaves("takeover");
      if (want >= 0) subs[want]!.mind.begin();
      state.has = want;
    }
    if (want < 0) this.thinks();
    else subs[want]!.mind.think(senses);
  }

  override act(control: BodyControl): void {
    const { layers, state } = this;
    layers.observe(control);
    if (state.has === HOST) this.acts(control);
    else if (state.has >= 0) { layers.feel(); this.subs[state.has]!.mind.act(control); }
  }

  override interrupt(): void { this.leaves("idle"); this.state.has = NOBODY; }

  /** Whoever has the body gives it up: a sub-mind ends, the driver lets go. */
  private leaves(reason: "idle" | "takeover"): void {
    const { has } = this.state;
    if (has >= 0) this.subs[has]!.mind.end();
    else this.gives(reason);
  }

  protected decide(view: BodyView, dt: number): unknown {
    return this.driver ? this.driver.decide(view, dt) : null;
  }

  protected carry(view: BodyView, decision: unknown, dt: number): BodyCommand | null {
    return this.driver?.carry(view, decision, dt) ?? null;
  }

  protected released(view: BodyView, reason: "idle" | "takeover"): void {
    this.discard?.(view, reason);
  }
}

/** A driver that decides its command whole carries out the command it decided. */
const carried = (_view: BodyView, command: unknown): BodyCommand | null => command as BodyCommand | null;

/** A scripted Mind as its body's host is given it: with the body under its layers, and how a driver is registered. */
interface CommandedMind extends MindConstruction { readonly body: Body; readonly drive: Drive }

/** **A scripted Mind over `own`**: the command layers `options` make, no driver registered yet, and the sub-minds `subs` make in rank order. */
export function commandedMind(own: OwnBody, options: LayerOptions, clock: Clock, subs: readonly SubMindMaker[] = []): CommandedMind {
  const scope = constructionScope(); let complete = false;
  try {
    const layers = scope.own(commandLayers<unknown>(own, options, clock));
    const made: MindConstruction<SubMind>[] = [];
    for (const make of subs) made.push(scope.own(make(own, layers.view, clock, layers.body.afterPhysics)));
    layers.firstLook();
    const mind = new ScriptedMind(layers, made);
    complete = true;
    return { mind, name: layers.name, has: () => mind.has(), body: layers.body,
      drive: (driver, discard) => mind.drive(driver, discard),
      dispose() { mind.drive(null); layers.dispose(); for (const sub of made) sub.dispose(); } };
  } finally { if (!complete) scope.dispose(); }
}
