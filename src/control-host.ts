import type { HumanOwnership } from "./input.ts";
import type { FighterView, HandCursors, Mind } from "./mind.ts";
import type { BoutRecorder } from "./recorder.ts";
import type { Side } from "./physics.ts";
import { resolveSupportedPair } from "./supported-locomotion.ts";
import type { SupportedLocomotionPort } from "./supported-locomotion.ts";
import { isPhysicalSupportedLocomotionPort, resolvePhysicalSupportedPair } from "./supported-locomotion-production.ts";

export type DriverStopReason = "verdict" | "handover" | "dispose";

/** One body-bound driver. Its surface tag is checked again at every installation boundary. */
export interface InstalledDriver {
  readonly surface: string;
  readonly name: string;
  step(dt: number): void;
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
  observe(opponent: ControlledBody, clock: number): void;
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
}

export function stepControlledPair(left: ControlledBody, right: ControlledBody, dt: number, clock: number): void {
  left.observe(right, clock);
  right.observe(left, clock);
  left.locomotion?.beginControlStep();
  right.locomotion?.beginControlStep();
  left.control.driver.step(dt);
  right.control.driver.step(dt);
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
