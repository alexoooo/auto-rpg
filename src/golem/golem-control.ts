import type {
  ControlEndpoint,
  ControlRecordingPort,
  DriverStopReason,
  InstalledDriver,
} from "../control-host.ts";
import {
  isCommandMind,
  policyMind,
  type BodyMind,
  type FighterView,
  type Intent,
} from "../mind.ts";
import { copyBodyCommand, freshBodyCommand, intentToCommand, type BodyCommand } from "../body-command.ts";
import type { Side } from "../physics.ts";
import { hasOrders, OrderFollower, type Commander, type Orders } from "../orders.ts";
import type { BoutRecorder } from "../recorder.ts";

/**
 * The golem's command surface: a clone of `HumanoidControlEndpoint` with a new tag.
 *
 * **A clone and deliberately not a shared base class**, which is the decision this file is. The
 * two endpoints are the same shape today, and the temptation is to hoist them -- but the surface
 * tag exists precisely so that a driver built for one body cannot be installed on the other, and a
 * base class that both inherit is a base class whose `install` check is the only thing keeping
 * them apart. `ControlEndpoint` in `src/control-host.ts` is already the shared abstraction, and it
 * is an interface: the host installs, releases and steps a driver without knowing which surface it
 * is talking to, and every place that *does* care compares tags.
 *
 * **What arrives at `apply` is a `BodyCommand`** (`src/body-command.ts`), and the golem narrows it
 * onto its modules. A command mind writes one directly; an `Intent` mind's command goes through the
 * one adapter, `intentToCommand`, here at the driver, so everything downstream -- the recorder, the
 * observer, the body -- reads one command whichever kind of mind wrote it. A person does not write
 * it: a person hands the body orders through `commander`, and the installed mind turns them into a
 * command (skill ceiling session 06, which retired the puppet takeover this file used to seed).
 */

// Declared in `src/control-surfaces.ts`, which imports nothing, and re-exported here where every
// caller already looks for it. See that file for the cycle that moved it.
import { GOLEM_CONTROL_SURFACE } from "../control-surfaces.ts";
export { GOLEM_CONTROL_SURFACE };

export interface GolemControlOptions {
  readonly initialMind: BodyMind;
  readonly view: FighterView;
  readonly canStep: () => boolean;
  readonly apply: (dt: number, command: BodyCommand) => void;
  readonly stopBody: () => void;
  readonly clearLocomotion?: (reason: string) => void;
  readonly policies: readonly { readonly name: string; readonly label: string }[];
  readonly policyFactory?: (name: string, seed?: number) => BodyMind;
}

class GolemRecording implements ControlRecordingPort {
  private recorder: BoutRecorder | null = null;
  private side: Side | null = null;
  private readonly view: FighterView;
  constructor(view: FighterView) { this.view = view; }
  attach(recorder: BoutRecorder, side: Side): void { this.recorder = recorder; this.side = side; }
  command(command: BodyCommand): void {
    if (this.recorder && this.side) this.recorder.command(this.side, this.view, command);
  }
  sample(dt: number, clock: number): void {
    if (this.recorder && this.side) this.recorder.sample(this.side, { view: this.view, dt, clock });
  }
  detach(): void { this.recorder = null; this.side = null; }
}

export class GolemControlEndpoint implements ControlEndpoint {
  readonly surface = GOLEM_CONTROL_SURFACE;
  readonly recording: GolemRecording;
  private installed: InstalledDriver;
  private readonly factory: (name: string, seed?: number) => BodyMind;
  private readonly options: GolemControlOptions;
  /**
   * Handed every applied command, after the recorder and before the body: the view, the `Intent` it
   * was adapted from (null when a command mind wrote it) and the command itself.
   */
  observer: ((view: FighterView, intent: Intent | null, command: BodyCommand) => void) | null = null;
  /**
   * Who hands this body its orders (`src/orders.ts`): a person's `StandingOrders`, an auto-commander,
   * or null for none. Read at every decision, so a new commander or a new order takes effect at the
   * next one; it survives an `install`, because it belongs to the body and not to the mind.
   */
  commander: Commander | null = null;

  constructor(options: GolemControlOptions) {
    this.options = options;
    this.recording = new GolemRecording(options.view);
    this.factory = options.policyFactory ?? policyMind;
    this.installed = this.driverFor(options.initialMind);
  }

  get driver(): InstalledDriver { return this.installed; }
  get mind(): BodyMind {
    if (!(this.installed instanceof GolemDriver)) {
      throw new Error(`installed driver "${this.installed.name}" does not expose a golem Mind compatibility view`);
    }
    return this.installed.mind;
  }

  install(driver: InstalledDriver): void {
    if (driver.surface !== this.surface) {
      throw new Error(`control source for surface ${driver.surface} cannot drive surface ${this.surface}`);
    }
    this.installed.stop("handover");
    this.options.clearLocomotion?.("control handover");
    this.installed = driver;
  }

  installMind(mind: BodyMind): void { this.install(this.driverFor(mind)); }

  installPolicy(name: string, seed?: number): void {
    if (!this.options.policies.some((option) => option.name === name)) {
      throw new Error(`control policy "${name}" is not available for surface ${this.surface}`);
    }
    this.installMind(this.factory(name, seed));
  }

  stopFighting(): void {
    this.installed.stop("verdict");
    this.options.clearLocomotion?.("verdict");
    this.options.stopBody();
  }
  dispose(): void {
    this.installed.stop("dispose");
    this.options.clearLocomotion?.("dispose");
    this.recording.detach();
    this.observer = null;
  }

  private driverFor(mind: BodyMind): GolemDriver {
    return new GolemDriver(mind, this.options.view, (dt, command, intent) => {
      this.recording.command(command);
      this.observer?.(this.options.view, intent, command);
      this.options.apply(dt, command);
    }, this.options.canStep, () => this.commander);
  }
}

type Apply = (dt: number, command: BodyCommand, intent: Intent | null) => void;

class GolemDriver implements InstalledDriver {
  readonly surface = GOLEM_CONTROL_SURFACE;
  readonly mind: BodyMind;
  private readonly view: FighterView;
  private readonly apply: Apply;
  private readonly canStep: () => boolean;
  private readonly commander: () => Commander | null;
  /** Carries a destination out on top of the mind's command; untouched while there are no orders. */
  readonly follower = new OrderFollower();
  /** What an `Intent` mind's command is adapted into, once per applied decision. */
  private readonly adapted: BodyCommand = freshBodyCommand();
  /** A command mind's command with its gait rewritten by the follower. */
  private readonly obeyed: BodyCommand = freshBodyCommand();
  private active = true;
  constructor(mind: BodyMind, view: FighterView, apply: Apply,
    canStep: () => boolean, commander: () => Commander | null = () => null) {
    this.mind = mind;
    this.view = view;
    this.commander = commander;
    // Every applied decision is kept, so that `hold` can re-apply it between two decisions: the
    // command, and for an `Intent` mind the intent it was adapted from, which `hold` adapts afresh.
    this.apply = (dt, command, intent) => { this.held = command; this.heldIntent = intent; apply(dt, command, intent); };
    this.canStep = canStep;
  }
  get name(): string { return this.mind.name; }
  /** The mind is told how long its decision stands; the command is applied for one substep. */
  step(dt: number, decisionSeconds = dt): void {
    if (!this.active || !this.canStep()) return;
    const orders = this.commander()?.orders(this.view) ?? null;
    const mind = this.mind;
    if (isCommandMind(mind)) {
      if (!hasOrders(orders)) { this.apply(dt, mind.command(this.view, decisionSeconds), null); return; }
      const command = mind.command(this.view, decisionSeconds, orders);
      this.apply(dt, mind.obeysOrders ? command : this.obeyCommand(command, orders), null);
      return;
    }
    // No orders: the call every bout made before orders existed, argument for argument.
    if (!hasOrders(orders)) { this.applyIntent(dt, mind.decide(this.view, decisionSeconds)); return; }
    const intent = mind.decide(this.view, decisionSeconds, orders);
    this.applyIntent(dt, mind.obeysOrders ? intent : this.follower.obey(intent, this.view, orders));
  }
  /** Re-apply the last decision without asking the mind again (`CONFIG.world.controlHz`). */
  hold(dt: number): void {
    if (!this.active || !this.canStep()) return;
    if (!this.held) { this.step(dt); return; }
    if (this.heldIntent) this.applyIntent(dt, this.heldIntent);
    else this.apply(dt, this.held, null);
  }
  /** The last command applied, whichever kind of mind wrote it; null before the first. */
  held: BodyCommand | null = null;
  private heldIntent: Intent | null = null;
  private applyIntent(dt: number, intent: Intent): void {
    this.apply(dt, intentToCommand(intent, this.adapted), intent);
  }
  /**
   * The follower on a command mind's gait: the rule an `Intent` mind is held to, on the three gait
   * fields it rewrites, and the rest of the command the mind's own. A step target is the mind's own
   * answer to where to stand, so an order that moves the body clears it.
   */
  private obeyCommand(command: BodyCommand, orders: Orders): BodyCommand {
    const moved = this.follower.obey(command.gait, this.view, orders);
    if (moved === command.gait) return command;
    const out = copyBodyCommand(command, this.obeyed);
    out.gait.forward = moved.forward;
    out.gait.strafe = moved.strafe;
    out.gait.turn = moved.turn;
    out.gait.step = null;
    return out;
  }
  stop(_reason: DriverStopReason): void { this.active = false; }
}
