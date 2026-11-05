import type { Vector3 } from "../math/vector.ts";
import type { MuscleCommand } from "./muscle/driver.ts";
import type { ConfigurationName } from "./spec/body.ts";

/** The commands a mind writes during its fast phase, backed by its saved mirror command. */
export interface BodyControl {
  readonly muscles: MuscleCommand;
  readonly assist: { readonly force: Vector3; readonly moment: Vector3 };
  readonly configurations: { request(segment: string, configuration: ConfigurationName): void };
}
