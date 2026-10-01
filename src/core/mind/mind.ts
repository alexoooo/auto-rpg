import type { BuiltBody } from "../build/build-body.ts";
import { driveMuscles, type MuscleDriver } from "../muscle/driver.ts";
import type { BodySpec } from "../spec/body.ts";
import type { World } from "../world.ts";
import { clockSenses, type Senses } from "./senses.ts";

/**
 * **A mind**: a stateful function from what its body senses to what its muscles are asked. It is
 * made with its own body (`OwnBody`) and each control step reads its senses and that body, and
 * writes the muscles' command: for each freedom an activation, 0 to 1, and a speed asked for
 * (`MuscleDriver.activation`, `.velocity`). A speed beyond the muscles' reach pushes at the
 * ceiling the activation sets, which is a torque; a speed of zero holds.
 *
 * That command is the whole of what a mind does to the world. How it gets there is its own: the
 * game's bodies run tactics, skills and motor control (`createBody`, `src/core/body.ts`, and
 * `driveBy`, `tactics.ts`), and a mind that writes activations itself is as much a mind.
 *
 * The seam names no hand and no foot: the channels are the body's own
 * (`MuscleDriver.channels`), so a body of another shape takes a mind through the same call.
 */
export interface Mind {
  readonly name: string;
  /** One control step, before the solver's: write this step's command into the body's muscles. */
  step(senses: Senses, dt: number): void;
}

/**
 * **What a mind is made with: its own body, whole.** The spec with what it holds; the built
 * segments and joints, whose nodes and bodies are its proprioception; and its muscles, which read
 * each freedom (angle, rate, speed, strength, the body's dynamics) and take the command.
 */
export interface OwnBody {
  readonly spec: BodySpec;
  readonly built: BuiltBody;
  readonly muscles: MuscleDriver;
}

type MindMaker<M extends Mind = Mind> = (own: OwnBody) => M;

interface Embodied<M extends Mind = Mind> {
  readonly own: OwnBody;
  readonly mind: M;
  /** Stop driving: the motors are released. */
  dispose(): void;
}

/**
 * Give `built` a mind: `make` is called once with the body, and the mind steps before every solver
 * step of `world`, after the muscles have read the joints, on `sense`'s senses (the clock alone
 * unless given).
 */
export function embody<M extends Mind>(built: BuiltBody, world: World, make: MindMaker<M>,
  sense: () => Senses = clockSenses(world)): Embodied<M> {
  let mind: M | null = null;
  const muscles = driveMuscles(built, world, (_, dt) => mind!.step(sense(), dt));
  const own: OwnBody = { spec: built.spec, built, muscles };
  mind = make(own);
  return { own, mind, dispose: () => muscles.dispose() };
}
