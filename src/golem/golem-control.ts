import type {
  ControlEndpoint,
  ControlRecordingPort,
  DriverStopReason,
  InstalledDriver,
} from "../control-host.ts";
import {
  policyMind,
  type FighterView,
  type Intent,
  type Mind,
} from "../mind.ts";
import type { Side } from "../physics.ts";
import { hasOrders, OrderFollower, type Commander } from "../orders.ts";
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
 * **`Intent` is not widened by any of this.** What arrives at `apply` is the one command a mind
 * produces, and the golem narrows it onto its five modules. A person does not write it: a person
 * hands the body orders through `commander`, and the installed mind turns them into a command
 * (skill ceiling session 06, which retired the puppet takeover this file used to seed).
 */

// Declared in `src/control-surfaces.ts`, which imports nothing, and re-exported here where every
// caller already looks for it. See that file for the cycle that moved it.
import { GOLEM_CONTROL_SURFACE } from "../control-surfaces.ts";
export { GOLEM_CONTROL_SURFACE };

export interface GolemControlOptions {
  readonly initialMind: Mind;
  readonly view: FighterView;
  readonly canStep: () => boolean;
  readonly apply: (dt: number, intent: Intent) => void;
  readonly stopBody: () => void;
  readonly clearLocomotion?: (reason: string) => void;
  readonly policies: readonly { readonly name: string; readonly label: string }[];
  readonly policyFactory?: (name: string, seed?: number) => Mind;
}

class GolemRecording implements ControlRecordingPort {
  private recorder: BoutRecorder | null = null;
  private side: Side | null = null;
  private readonly view: FighterView;
  constructor(view: FighterView) { this.view = view; }
  attach(recorder: BoutRecorder, side: Side): void { this.recorder = recorder; this.side = side; }
  intent(intent: Intent): void {
    if (this.recorder && this.side) this.recorder.intent(this.side, this.view, intent);
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
  private readonly factory: (name: string, seed?: number) => Mind;
  private readonly options: GolemControlOptions;
  observer: ((view: FighterView, intent: Intent) => void) | null = null;
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
  get mind(): Mind {
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

  installMind(mind: Mind): void { this.install(this.driverFor(mind)); }

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

  private driverFor(mind: Mind): GolemDriver {
    return new GolemDriver(mind, this.options.view, (dt, intent) => {
      this.recording.intent(intent);
      this.observer?.(this.options.view, intent);
      this.options.apply(dt, intent);
    }, this.options.canStep, () => this.commander);
  }
}

class GolemDriver implements InstalledDriver {
  readonly surface = GOLEM_CONTROL_SURFACE;
  readonly mind: Mind;
  private readonly view: FighterView;
  private readonly apply: (dt: number, intent: Intent) => void;
  private readonly canStep: () => boolean;
  private readonly commander: () => Commander | null;
  /** Carries a destination out on top of the mind's command; untouched while there are no orders. */
  readonly follower = new OrderFollower();
  private active = true;
  constructor(mind: Mind, view: FighterView, apply: (dt: number, intent: Intent) => void,
    canStep: () => boolean, commander: () => Commander | null = () => null) {
    this.mind = mind;
    this.view = view;
    this.commander = commander;
    // Every applied decision is kept, so that `hold` can re-apply it between two decisions.
    this.apply = (dt, intent) => { this.held = intent; apply(dt, intent); };
    this.canStep = canStep;
  }
  get name(): string { return this.mind.name; }
  /** The mind is told how long its decision stands; the command is applied for one substep. */
  step(dt: number, decisionSeconds = dt): void {
    if (!this.active || !this.canStep()) return;
    const orders = this.commander()?.orders(this.view) ?? null;
    // No orders: the call every bout made before orders existed, argument for argument.
    if (!hasOrders(orders)) { this.apply(dt, this.mind.decide(this.view, decisionSeconds)); return; }
    const intent = this.mind.decide(this.view, decisionSeconds, orders);
    this.apply(dt, this.mind.obeysOrders ? intent : this.follower.obey(intent, this.view, orders));
  }
  /** Re-apply the last decision without asking the mind again (`CONFIG.world.controlHz`). */
  hold(dt: number): void {
    if (!this.active || !this.canStep()) return;
    if (!this.held) { this.step(dt); return; }
    this.apply(dt, this.held);
  }
  private held: Intent | null = null;
  stop(_reason: DriverStopReason): void { this.active = false; }
}
