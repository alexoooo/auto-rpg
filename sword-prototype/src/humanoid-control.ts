import { handover, policyMind, splitMind, type ArmPoses, type FighterView, type Intent, type Mind } from "./mind.ts";
import type { HumanOwnership } from "./input.ts";
import type { BoutRecorder } from "./recorder.ts";
import type { Side } from "./physics.ts";
import type { ControlEndpoint, ControlRecordingPort, DriverStopReason, InstalledDriver } from "./control-host.ts";

export const HUMANOID_CONTROL_SURFACE = "humanoid-v1" as const;

/** Typed page-only dependency. Headless bodies omit it and therefore cannot claim human control. */
export interface HumanoidHumanSource {
  readonly mind: Mind;
  readonly ownership: HumanOwnership;
  seed(view: FighterView, poses: ArmPoses): void;
}

export interface HumanoidControlOptions {
  readonly initialMind: Mind;
  readonly initialPolicyName?: string;
  readonly view: FighterView;
  readonly canStep: () => boolean;
  readonly apply: (dt: number, intent: Intent) => void;
  readonly stopBody: () => void;
  readonly policies: readonly { readonly name: string; readonly label: string }[];
  readonly policyFactory?: (name: string, seed?: number) => Mind;
  readonly human?: HumanoidHumanSource;
  readonly poseSeed?: () => ArmPoses | null;
}

class HumanoidRecording implements ControlRecordingPort {
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

export class HumanoidControlEndpoint implements ControlEndpoint {
  readonly surface = HUMANOID_CONTROL_SURFACE;
  readonly recording: HumanoidRecording;
  private installed: InstalledDriver;
  private selectedPolicy: string;
  private readonly factory: (name: string, seed?: number) => Mind;
  private readonly options: HumanoidControlOptions;
  observer: ((view: FighterView, intent: Intent) => void) | null = null;

  constructor(options: HumanoidControlOptions) {
    this.options = options;
    this.recording = new HumanoidRecording(options.view);
    this.factory = options.policyFactory ?? policyMind;
    this.selectedPolicy = options.initialPolicyName ?? options.initialMind.name;
    this.installed = this.driverFor(options.initialMind);
  }

  get driver(): InstalledDriver { return this.installed; }
  get mind(): Mind {
    if (!(this.installed instanceof HumanoidDriver)) {
      throw new Error(`installed driver "${this.installed.name}" does not expose a humanoid Mind compatibility view`);
    }
    return this.installed.mind;
  }

  install(driver: InstalledDriver): void {
    if (driver.surface !== this.surface) {
      throw new Error(`control source for surface ${driver.surface} cannot drive surface ${this.surface}`);
    }
    this.installed.stop("handover");
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
    const poses = this.options.poseSeed?.() ?? null;
    if (poses) human.seed(this.options.view, poses);
    const shared = splitMind(human.mind, this.factory(this.selectedPolicy), human.ownership);
    this.installMind(poses ? handover(shared, poses) : shared);
  }

  releaseHuman(): void { this.installPolicy(this.selectedPolicy); }
  stopFighting(): void { this.installed.stop("verdict"); this.options.stopBody(); }
  dispose(): void { this.installed.stop("dispose"); this.recording.detach(); this.observer = null; }

  private driverFor(mind: Mind): HumanoidDriver {
    return new HumanoidDriver(mind, this.options.view, (dt, intent) => {
      this.recording.intent(intent);
      this.observer?.(this.options.view, intent);
      this.options.apply(dt, intent);
    }, this.options.canStep);
  }
}

class HumanoidDriver implements InstalledDriver {
  readonly surface = HUMANOID_CONTROL_SURFACE;
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
