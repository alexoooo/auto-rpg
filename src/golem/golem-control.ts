import type {
  ControlEndpoint,
  ControlRecordingPort,
  DriverStopReason,
  HumanDriverSource,
  InstalledDriver,
} from "../control-host.ts";
import {
  handoverFromCursors,
  policyMind,
  splitMind,
  type FighterView,
  type HandCursors,
  type Intent,
  type Mind,
} from "../mind.ts";
import type { Side } from "../physics.ts";
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
 * What is genuinely different is one line, and it is the one that matters: the cursor seed. A
 * Warrior's comes from `cursorForPose`, which is the seven-axis arm's own inverse; a golem's comes
 * from the module the cursor is driving, because a golem effector is a one-, three- or five-axis
 * chain that owns its mapping. Both produce a `HandCursors`, which is why one `handoverFromCursors`
 * serves both -- see `HumanDriverSource`.
 *
 * **`Intent` is not widened by any of this.** What arrives at `apply` is the same eight-field
 * command a person's mouse produces, and the golem narrows it onto its five modules. That is the
 * direction the one-seam rule allows and the whole reason a mouse can drive a golem at all.
 */

// Declared in `src/control-surfaces.ts`, which imports nothing, and re-exported here where every
// caller already looks for it. See that file for the cycle that moved it.
import { GOLEM_CONTROL_SURFACE } from "../control-surfaces.ts";
export { GOLEM_CONTROL_SURFACE };

export interface GolemControlOptions {
  readonly initialMind: Mind;
  readonly initialPolicyName?: string;
  readonly view: FighterView;
  readonly canStep: () => boolean;
  readonly apply: (dt: number, intent: Intent) => void;
  readonly stopBody: () => void;
  readonly clearLocomotion?: (reason: string) => void;
  readonly policies: readonly { readonly name: string; readonly label: string }[];
  readonly policyFactory?: (name: string, seed?: number) => Mind;
  readonly human?: HumanDriverSource;
  /**
   * Where the cursor has to sit for this golem to be commanded into the pose it is in, or null
   * when there is nothing to seed from.
   *
   * Null is a real answer rather than a failure: a golem whose effectors have both been cut off
   * has no pose for a cursor to mean anything about, exactly as a Warrior whose sword arm is off
   * has none. The body is still worth taking -- it walks, it turns, it can be hit -- so the
   * refusal is of the seed and not of the takeover.
   */
  readonly cursorSeed?: () => HandCursors | null;
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
  private selectedPolicy: string;
  private readonly factory: (name: string, seed?: number) => Mind;
  private readonly options: GolemControlOptions;
  observer: ((view: FighterView, intent: Intent) => void) | null = null;

  constructor(options: GolemControlOptions) {
    this.options = options;
    this.recording = new GolemRecording(options.view);
    this.factory = options.policyFactory ?? policyMind;
    this.selectedPolicy = options.initialPolicyName ?? options.initialMind.name;
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
    this.selectedPolicy = name;
    this.installMind(this.factory(name, seed));
  }

  installHuman(): void {
    const human = this.options.human;
    if (!human) throw new Error(`control surface ${this.surface} has no human adapter`);
    const seed = this.options.cursorSeed?.() ?? null;
    if (seed) human.seed(this.options.view, seed);
    const shared = splitMind(human.mind, this.factory(this.selectedPolicy), human.ownership);
    // The seed alone does not survive contact with either driver -- a person's next mouse event
    // writes an absolute cursor over it, and a freshly built policy parks its cursor wherever its
    // own opening pose is -- so the rebase is what carries the takeover past its first frame.
    this.installMind(seed ? handoverFromCursors(shared, seed) : shared);
  }

  releaseHuman(): void { this.installPolicy(this.selectedPolicy); }
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
    }, this.options.canStep);
  }
}

class GolemDriver implements InstalledDriver {
  readonly surface = GOLEM_CONTROL_SURFACE;
  readonly mind: Mind;
  private readonly view: FighterView;
  private readonly apply: (dt: number, intent: Intent) => void;
  private readonly canStep: () => boolean;
  private active = true;
  constructor(mind: Mind, view: FighterView, apply: (dt: number, intent: Intent) => void,
    canStep: () => boolean) {
    this.mind = mind;
    this.view = view;
    this.apply = apply;
    this.canStep = canStep;
  }
  get name(): string { return this.mind.name; }
  step(dt: number): void {
    if (!this.active || !this.canStep()) return;
    this.apply(dt, this.mind.decide(this.view, dt));
  }
  stop(_reason: DriverStopReason): void { this.active = false; }
}
