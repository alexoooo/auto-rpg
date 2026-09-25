import type { HumanOwnership } from "./input.ts";
import type { FighterView, HandCursors, Mind } from "./mind.ts";
import type { BoutRecorder } from "./recorder.ts";
import type { Side } from "./physics.ts";
import type { PressSource } from "./contact-press.ts";
import { resolveSupportedPair } from "./supported-locomotion.ts";
import type { SupportedLocomotionPort } from "./supported-locomotion.ts";
import { isPhysicalSupportedLocomotionPort, resolvePhysicalSupportedPair } from "./supported-locomotion-production.ts";
import { CONFIG } from "./config.ts";

export type DriverStopReason = "verdict" | "handover" | "dispose";

/** One body-bound driver. Its surface tag is checked again at every installation boundary. */
export interface InstalledDriver {
  readonly surface: string;
  readonly name: string;
  step(dt: number): void;
  /**
   * Re-apply the last decision without asking the mind, on a substep between two decisions
   * (`CONFIG.world.controlHz`). A driver without it is stepped on every substep.
   */
  hold?(dt: number): void;
  stop(reason: DriverStopReason): void;
}

/** Optional instrumentation owned by a command surface, never reconstructed by the host. */
export interface ControlRecordingPort {
  attach(recorder: BoutRecorder, side: Side): void;
  sample(dt: number, clock: number): void;
  detach(): void;
}

/**
 * The person, as a control surface sees them: a mind, what they own, and where to put their cursor.
 *
 * Declared here rather than beside one surface because there are two surfaces now and there is
 * exactly one person. `humanoid-v1` and `golem-v1` install the same object, and the page builds
 * one of them -- so a body a person can take is a body that satisfies this, whatever it is made
 * of. The three imports above are all type-only and erase, which is what keeps `input.ts` (and
 * through it the DOM) out of the graph a headless harness loads.
 *
 * **`seed` takes a cursor and not a pose**, and that is the whole of what made one seam serve two
 * bodies. A Warrior arm's pose is an `ArmPose` inverted by `policies.ts`; a golem effector's is a
 * chain's own commanded state inverted by the chain. Neither is a thing the other could read. What
 * both can answer is where the cursor has to sit, which is the only thing the person needs told.
 */
export interface HumanDriverSource {
  readonly mind: Mind;
  readonly ownership: HumanOwnership;
  seed(view: FighterView, cursors: HandCursors): void;
}

/** Optional read-only diagnostics; the surface-specific adapter owns the payload type. */
export interface ControlDiagnosticsPort {
  readonly surface: string;
  read(): unknown;
}

export interface ControlEndpoint {
  readonly surface: string;
  /** A getter in implementations: installing a source replaces this object. */
  readonly driver: InstalledDriver;
  readonly recording: ControlRecordingPort | null;
  readonly diagnostics?: ControlDiagnosticsPort | null;
  install(driver: InstalledDriver): void;
  installPolicy(name: string, seed?: number): void;
  installHuman(): void;
  releaseHuman(): void;
  stopFighting(): void;
  dispose(): void;
}

/** The fairness boundary: every body publishes before either installed driver acts. */
export interface ControlledBody {
  readonly control: ControlEndpoint;
  readonly locomotion?: SupportedLocomotionPort | null;
  /** `publish` false keeps the per-substep sampling and skips the view, between two decisions. */
  observe(opponent: ControlledBody, clock: number, publish?: boolean): void;
  /**
   * The half of a substep that has to happen **after** both carriers are resolved, or absent for
   * a body with no such half.
   *
   * A golem's legs are the case, and the ordering is the locomotion contract's own: the pair
   * resolution is what decides where each carrier is allowed to be, and a gait driven before it
   * would be a stride solved against a position the world had not yet agreed to. `BuiltLocomotion`
   * spells the sequence out -- `beginSubstep`, `beginControlStep`, `request`,
   * `resolvePhysicalSupportedPair`, `gait`, `endSubstep` -- and this is the seam for its last two
   * steps. A `Fighter` drives its legs from its own `update` and leaves the field off.
   */
  afterLocomotion?(dt: number): void;
  /** This body as another body's contact press reads it, or absent for a body that presses nothing. */
  pressSource?(): PressSource;
  /**
   * Read what the other bodies pressed on this one with, once a substep, after `observe` and
   * before the boundary that reads it (physical contact session 07).
   */
  sampleContactPress?(others: readonly PressSource[]): void;
}

/** Substeps since each pair began, keyed on its left body, for the control clock. */
const substepOf = new WeakMap<ControlledBody, number>();

export function stepControlledPair(left: ControlledBody, right: ControlledBody, dt: number, clock: number): void {
  const every = Math.max(1, Math.round(CONFIG.world.physicsHz / CONFIG.world.controlHz));
  const substep = substepOf.get(left) ?? 0;
  substepOf.set(left, substep + 1);
  const due = substep % every === 0;
  left.observe(right, clock, due);
  right.observe(left, clock, due);
  const leftSource = left.pressSource?.();
  const rightSource = right.pressSource?.();
  left.sampleContactPress?.(rightSource ? [rightSource] : []);
  right.sampleContactPress?.(leftSource ? [leftSource] : []);
  left.locomotion?.beginControlStep();
  right.locomotion?.beginControlStep();
  // A decision spans `every` substeps and is told so; between two, the held command is re-applied
  // so that servos, carriers and gaits go on at the physics rate. A driver with no `hold` decides
  // every substep, as before.
  for (const body of [left, right]) {
    const driver = body.control.driver;
    if (!driver.hold) driver.step(dt);
    else if (due) driver.step(dt * every);
    else driver.hold(dt);
  }
  if (isPhysicalSupportedLocomotionPort(left.locomotion) ||
      isPhysicalSupportedLocomotionPort(right.locomotion)) {
    if (!resolvePhysicalSupportedPair(left.locomotion, right.locomotion, dt)) {
      throw new Error("supported locomotion pair construction produced only one physical V1 port");
    }
  } else {
    resolveSupportedPair(left.locomotion, right.locomotion, dt);
  }
  // After the branch and not inside it, because what a body owes its own legs does not depend on
  // which resolution the pair took. Neither `Fighter` nor `Centipede` implements this, so the
  // Warrior's side of a bout is two optional calls that are not there.
  left.afterLocomotion?.(dt);
  right.afterLocomotion?.(dt);
}
