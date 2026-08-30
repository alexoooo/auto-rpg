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
    return;
  }
  resolveSupportedPair(left.locomotion, right.locomotion, dt);
}
