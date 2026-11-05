import type { BodyOptions, HostedBody } from "../minds/hosted-body.ts";
import type { BuiltBody } from "../core/bodies/build/build-body.ts";
import type { World } from "../core/world/world.ts";
import { wholeBodyMotor } from "../control/whole-body-motor.ts";
import type { SubMindMaker } from "../minds/sub-mind.ts";
import type { MotorMaker } from "../control/motor-part.ts";
import { commandedBody as configuredBody } from "../minds/host.ts";

type StockBodyOptions = Omit<BodyOptions, "motor"> & { readonly motor?: MotorMaker | null };

/**
 * **`built` in `world` under the command layers**, built outside a fight (a test, a study, a task)
 * the one way a body takes a mind (`hostBody`): the layers `options` make, handed over to the
 * sub-minds of `subs` in rank order where one wants the body (`commandedMind`), none unless given,
 * holding the reference pose until something drives them (`HostedBody.drive`).
 */
export function commandedBody(built: BuiltBody, world: World, options: StockBodyOptions, subs: readonly SubMindMaker[] = []): HostedBody {
  return configuredBody(built, world, { ...options, motor: options.motor ?? wholeBodyMotor() }, subs);
}
