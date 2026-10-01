import type { BuiltBody } from "../build/build-body.ts";
import { createAssist, NO_ASSIST, type Assist, type AssistCeiling } from "../control/assist.ts";
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
 * That command, and what it asks of its assist (`Assist`, none unless its fight allows one), is
 * the whole of what a mind does to the world. How it gets there is its own: the
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
  /**
   * Its memory, if it has any (`src/core/state.ts`): saved and loaded with its body's. A mind that
   * remembers anywhere else does not go on from a load as it went on from the save.
   */
  readonly state?: object;
}

/**
 * **What a mind is made with: its own body, whole.** The spec with what it holds; the built
 * segments and joints, whose nodes and bodies are its proprioception; its muscles, which read
 * each freedom (angle, rate, speed, strength, the body's dynamics) and take the command; and its
 * assist, which takes an ask.
 */
export interface OwnBody {
  readonly spec: BodySpec;
  readonly built: BuiltBody;
  readonly muscles: MuscleDriver;
  /** The force and the moment on its root that its fight allows it beyond its muscles (`Assist`): none unless the fight says so. */
  readonly assist: Assist;
}

type MindMaker<M extends Mind = Mind> = (own: OwnBody) => M;

interface Embodied<M extends Mind = Mind> {
  readonly own: OwnBody;
  readonly mind: M;
  /** The body's memory under this mind (`src/core/state.ts`): its muscles', its assist's, and the mind's own, or null. */
  readonly state: object;
  /** Stop driving: the motors are released. */
  dispose(): void;
}

/**
 * Give `built` a mind: `make` is called once with the body, and the mind steps before every solver
 * step of `world`, after the muscles have read the joints, on `sense`'s senses (the clock alone
 * unless given). What the mind asked of its assist is given after its step, within `ceiling` (none
 * unless given), so the solver's step takes it with the muscles' torques.
 */
export function embody<M extends Mind>(built: BuiltBody, world: World, make: MindMaker<M>,
  sense: () => Senses = clockSenses(world), ceiling: AssistCeiling = NO_ASSIST): Embodied<M> {
  let mind: M | null = null, help: ReturnType<typeof createAssist> | null = null;
  const muscles = driveMuscles(built, world, (_, dt) => { mind!.step(sense(), dt); help!.apply(); });
  help = createAssist(built, muscles.dynamics.root.segment, ceiling);
  const own: OwnBody = { spec: built.spec, built, muscles, assist: help.assist };
  mind = make(own);
  return { own, mind, state: { muscles: muscles.state, assist: help.state, mind: mind.state ?? null }, dispose: () => muscles.dispose() };
}
