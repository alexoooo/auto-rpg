import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import type { HandPoseRequest } from "../build/hand-poses.ts";
import { rootSegment, type ReadBody } from "../read-body.ts";
import { readView } from "../build/read-view.ts";
import { createAssist, NO_ASSIST, type Assist, type AssistCeiling } from "../control/assist.ts";
import type { ContactIdentity } from "../control/effector-feedback.ts";
import { driveMuscles, type MuscleDriver } from "../muscle/driver.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Hook, World } from "../world.ts";
import { clockSenses, type Senses } from "./senses.ts";
import type { SheetLog } from "./sheets.ts";

/**
 * **A mind**: a stateful function from what its body senses to what its muscles are asked. It is
 * made with its own body (`OwnBody`) and each control step reads its senses and that body, and
 * writes the muscles' command: for each freedom an activation, 0 to 1, and a speed asked for
 * (`MuscleDriver.activation`, `.velocity`). A speed beyond the muscles' reach pushes at the
 * ceiling the activation sets, which is a torque; a speed of zero holds.
 *
 * That command, and what it asks of its assist (`Assist`, none unless its fight allows one), is
 * the whole of what a mind does to the world. How it gets there is its own: the
 * game's bodies run a decider, skills and motor control (`commandLayers`,
 * `src/core/control/command-layers.ts`, and `driveBy`, `decider.ts`), and a mind that writes
 * activations itself is as much a mind.
 *
 * The seam names no hand and no foot: the channels are the body's own
 * (`MuscleDriver.channels`), so a body of another shape takes a mind through the same call.
 */
export interface Mind {
  readonly name: string;
  /**
   * The name of the mind that has the body this step, where it hands its body over (`hosting`):
   * its own, a sub-mind's, or `"nobody"`. Its own name where absent.
   */
  readonly has?: string;
  /** One control step, before the solver's: write this step's command into the body's muscles. */
  step(senses: Senses, dt: number): void;
  /**
   * Its body is nobody's from now (`BodyLevel` below `full`): it is not stepped until the body
   * is its own again, and then goes on from the body as it is. A mind with nothing under way
   * need not answer.
   */
  idle?(): void;
  /**
   * Its memory, if it has any (`src/core/state.ts`): saved and loaded with its body's. A mind that
   * remembers anywhere else does not go on from a load as it went on from the save.
   */
  readonly state?: object;
  /** Its body is given up for good (`PhysicalBody.dispose`): it lets go of whatever drives it. A mind that holds nothing need not answer. */
  dispose?(): void;
  /**
   * The body its drivers have, where it drives its body through the command layers
   * (`commandLayers`): the fight's body shows its view and drive (`HostedBody`). None for a mind
   * that drives its muscles itself.
   */
  readonly body?: Body;
}

/**
 * **What a mind is made with: its own body, whole.** The spec with what it holds; its segments
 * and joints as read (`ReadBody`), whose poses, motion and contacts are its proprioception; its
 * muscles, which read each freedom (angle, rate, speed, strength, the body's dynamics) and take
 * the command; its assist, which takes an ask; its hands, which take a pose; its senses; how it
 * labels what it touches; and the completed physics intervals, which it may observe.
 */
export interface OwnBody {
  readonly spec: BodySpec;
  readonly built: ReadBody;
  readonly muscles: MuscleDriver;
  /** The force and the moment on its root that it is allowed beyond its muscles (`Assist`): none unless it was given a ceiling. */
  readonly assist: Assist;
  /** Ask each named hand for a pose, which the body applies when the hand has room (`HandPoses.request`). */
  requestHandPoses(requests: readonly HandPoseRequest[]): void;
  /** What it senses of the world now (`Senses`): its fight's, the clock alone unless its fight gives more. */
  readonly senses: () => Senses;
  /** How it labels the other side of a contact (`ContactIdentity`), where its fight grants one. */
  readonly contactIdentity?: ContactIdentity;
  /**
   * Call `listener` after each completed physics interval with the step and the time, after those
   * added before it, whether or not its mind steps; returns what stops it.
   */
  afterPhysics(listener: (step: number, time: number) => void): () => void;
}

type MindMaker<M extends Mind = Mind> = (own: OwnBody) => M;

interface Embodied<M extends Mind = Mind> {
  readonly own: OwnBody;
  readonly mind: M;
  /** The body's memory under this mind (`src/core/state.ts`): its muscles', its assist's, and the mind's own, or null. */
  readonly state: object;
  /** Stop driving: the mind lets go (`Mind.dispose`), its observers stop, and the motors are released. */
  dispose(): void;
}

/** What a body is given beside its mind: its senses, its assist's ceiling, how it labels a contact, and where its order sheets are written. */
export interface Embodying {
  /** What it senses (`SensesHub.add`); the clock alone unless given. */
  readonly senses?: () => Senses;
  /** The most its assist gives it; none unless given: it stands on its muscles. */
  readonly assist?: AssistCeiling;
  /** How it labels a contact's other side; none unless given. */
  readonly contactIdentity?: ContactIdentity;
  /** Where its order sheets are written (`SheetLog`); nowhere unless given. */
  readonly log?: SheetLog;
}

/**
 * Give `built` a mind: `make` is called once with the body, and the mind steps before every solver
 * step of `world`, after the muscles have read the joints, on its senses (`Embodying.senses`, the
 * clock alone unless given). What the mind asked of its assist is given after its step, within its
 * ceiling (none unless given), so the solver's step takes it with the muscles' torques. Given a
 * `log`, each step's order sheet is written in it as the mind leaves it (`SheetLog`). What observes
 * the completed physics (`OwnBody.afterPhysics`) is run by one hook of `world`'s, added with the
 * first observer.
 */
export function embody<M extends Mind>(built: BuiltBody, world: World, make: MindMaker<M>,
  { senses: sense = clockSenses(world), assist: ceiling = NO_ASSIST, contactIdentity, log }: Embodying = {}): Embodied<M> {
  let mind: M | null = null, help: ReturnType<typeof createAssist> | null = null;
  // The hand poses asked since the last sheet, which the next sheet carries.
  const hands: HandPoseRequest[] = [];
  const muscles = driveMuscles(built, world, (driver, dt) => {
    mind!.step(sense(), dt);
    if (log) record(log, world.steps, driver, help!.asked, hands);
    help!.apply();
  }, () => mind!.idle?.());
  help = createAssist(built, rootSegment(built), ceiling);
  const listeners = new Set<(step: number, time: number) => void>();
  let observed = null as Hook | null;
  const own: OwnBody = { spec: built.spec, built: readView(built), muscles, assist: help.assist,
    requestHandPoses: (requests) => {
      built.handPoses.request(requests);
      if (log) for (const { hand, pose } of requests) hands.push({ hand, pose });
    },
    senses: sense, ...(contactIdentity ? { contactIdentity } : {}),
    afterPhysics(listener) {
      observed ??= world.afterPhysics(() => { for (const one of listeners) one(world.steps, world.time); });
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    } };
  let made: M;
  try { made = make(own); }
  catch (error) { observed?.dispose(); muscles.dispose(); throw error; }
  mind = made;
  return { own, mind: made, state: { muscles: muscles.state, assist: help.state, handPoses: built.handPoses.state, toes: built.toes, mind: made.state ?? null },
    dispose: () => { made.dispose?.(); observed?.dispose(); listeners.clear(); muscles.dispose(); } };
}

/** Write `driver`'s command, the assist's ask and the hand poses asked since the last sheet into `log` as the sheet of `step`, in place of any it held from that step on. */
function record(log: SheetLog, step: number, driver: MuscleDriver, asked: { readonly force: Vector3; readonly moment: Vector3 }, hands: HandPoseRequest[]): void {
  const sheets = log.sheets;
  while (sheets.length > 0 && sheets[sheets.length - 1]!.step >= step) sheets.pop();
  sheets.push({ step, activation: driver.activation.slice(), velocity: driver.velocity.slice(),
    force: [asked.force.x, asked.force.y, asked.force.z], moment: [asked.moment.x, asked.moment.y, asked.moment.z],
    hands: hands.splice(0) });
}
