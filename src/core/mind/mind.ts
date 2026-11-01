import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, LayerOptions } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import type { HandPoseRequest } from "../build/hand-poses.ts";
import { rootSegment, type ReadBody } from "../read-body.ts";
import { readView } from "../build/read-view.ts";
import { createAssist, NO_ASSIST, type Assist, type AssistCeiling } from "../control/assist.ts";
import type { ContactIdentity } from "../control/effector-feedback.ts";
import { driveMuscles, PLAN_REFLEX, type MuscleDriver } from "../muscle/driver.ts";
import { mirrorBody, mirrorStatics, mirrorWriter, type Mirror, type MirrorWriter } from "./mirror.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Hook, World } from "../world.ts";
import { clockSenses, type Senses } from "./senses.ts";
import { delayLine } from "../command-delay.ts";
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
  /** An experiment's settings of its command layers (`Experiment`), in place of its mind's, where one is given. */
  readonly experiment?: Experiment;
  /**
   * Call `listener` after each completed physics interval with the step and the time, after those
   * added before it, whether or not its mind steps; returns what stops it.
   */
  afterPhysics(listener: (step: number, time: number) => void): () => void;
}

type MindMaker<M extends Mind = Mind> = (own: OwnBody) => M;

interface Embodied<M extends Mind = Mind> {
  /** The body its mind was made with: the body itself, or its mirror where the world puts minds on mirrors (`World.mirrored`). */
  readonly own: OwnBody;
  /** The body as its fight holds it: its muscles, its assist and its senses, the world's own whatever its mind reads. */
  readonly held: Pick<OwnBody, "muscles" | "assist" | "senses">;
  readonly mind: M;
  /** The body's memory under this mind (`src/core/state.ts`): its muscles', its assist's, and the mind's own, or null. */
  readonly state: object;
  /** Stop driving: the mind lets go (`Mind.dispose`), its observers stop, and the motors are released. */
  dispose(): void;
}

/**
 * **An experiment's settings of a body's command layers** (`LayerOptions`): the stance's tuning in
 * place of its constants, and the envelope being measured. A body measured or tuned so is a study's,
 * never a fight's.
 */
export type Experiment = Pick<LayerOptions, "stance" | "measuring">;

/** What a body is given beside its mind: its senses, its assist's ceiling, how it labels a contact, where its order sheets are written, and an experiment's settings. */
export interface Embodying {
  /** What it senses (`SensesHub.add`); the clock alone unless given. */
  readonly senses?: () => Senses;
  /** The most its assist gives it; none unless given: it stands on its muscles. */
  readonly assist?: AssistCeiling;
  /** How it labels a contact's other side; none unless given. */
  readonly contactIdentity?: ContactIdentity;
  /** Where its order sheets are written (`SheetLog`); nowhere unless given. */
  readonly log?: SheetLog;
  /** An experiment's settings of its command layers (`Experiment`); none unless given. */
  readonly experiment?: Experiment;
}

/**
 * Give `built` a mind: `make` is called once with the body, and the mind steps before every solver
 * step of `world`, after the muscles have read the joints, on its senses (`Embodying.senses`, the
 * clock alone unless given). **What a mind sends on a step is applied `world.delay` steps later**
 * (`World.delay`): its muscles' command (`driveMuscles`), its assist's ask, given within its
 * ceiling (none unless given) with the muscles' torques, and the hand poses it asked since its last
 * step. Its first steps at `full`, from its start or back from another level, apply none. Given a
 * `log`, each step's order sheet is written in it as the mind leaves it (`SheetLog`). What observes
 * the completed physics (`OwnBody.afterPhysics`) is run by one hook of `world`'s, added with the
 * first observer.
 */
export function embody<M extends Mind>(built: BuiltBody, world: World, make: MindMaker<M>,
  { senses: sense = clockSenses(world), assist: ceiling = NO_ASSIST, contactIdentity, log, experiment }: Embodying = {}): Embodied<M> {
  let mind: M | null = null, help: ReturnType<typeof createAssist> | null = null, mirrored: { readonly writer: MirrorWriter; readonly mirror: Mirror } | null = null;
  // The hand poses asked since the last sheet, which the next sheet carries.
  const hands: HandPoseRequest[] = [];
  // The hand poses asked since the mind's last step, and those sent and not yet asked of the hands, a slot a step of the world's delay and one more.
  const line = delayLine(world.delay), posed = { asked: [] as HandPoseRequest[], sent: Array.from({ length: line.size }, () => [] as HandPoseRequest[]), line: line.state };
  const request = (requests: readonly HandPoseRequest[]) => {
    for (const { hand, pose } of built.handPoses.check(requests)) posed.asked.push({ hand, pose });
    if (log) for (const { hand, pose } of requests) hands.push({ hand, pose });
  };
  // The speeds each command in flight was solved to reach (`MuscleDriver.expect`) and its accelerations, a slot a step of the world's delay: a mind carries its mirror forward by them.
  const flight = { expect: [] as Float64Array[], solved: [] as Float64Array[], motion: new Float64Array(0), sent: 0 };
  const standing = standingSegments(built.spec);
  const muscles = driveMuscles(built, world, (driver, dt) => {
    if (mirrored) {
      mirrored.writer.write();
      mirrored.mirror.refresh({ dynamics: true });
      const mirror = mirrored.mirror, expect = mirror.muscles.expect, d = flight.expect.length;
      // On its legs, what it decides moves the body once the commands in flight have: it reads the body as they leave it, oldest first.
      // Anything else touching, the forecast does not know the contact, and it reads the body as it was.
      const feet = onFeet(mirror, standing);
      if (feet) for (let k = 0; k < d; k++) forecast(mirror, flight.expect[(flight.sent + k) % d]!, flight.solved[(flight.sent + k) % d]!, flight.motion, dt);
      mind!.step(mirror.senses, dt);
      if (d > 0) {
        const slot = flight.sent % d, solved = flight.solved[slot]!;
        if (!feet) expect.fill(NaN);
        for (let i = 0; i < expect.length; i++) solved[i] = (expect[i]! - mirror.muscles.speed(i)) / dt;
        flight.expect[slot]!.set(expect);
        driver.expect.set(expect);
        flight.sent += 1;
      }
      expect.fill(NaN);
      mirrored.mirror.answer();
      mirrored.writer.carry(request);
    } else mind!.step(sense(), dt);
    if (log) record(log, world.steps, driver, help!.asked, hands);
    help!.apply();
    const slot = posed.sent[line.written()]!;
    slot.length = 0;
    for (const one of posed.asked.splice(0)) slot.push(one);
    const due = line.applied();
    line.advance();
    if (due >= 0 && posed.sent[due]!.length > 0) built.handPoses.request(posed.sent[due]!.splice(0));
  }, () => {
    mind!.idle?.();
    help!.reset();
    line.reset();
    for (const slot of [...flight.expect, ...flight.solved]) slot.fill(NaN);
    posed.asked.length = 0;
    for (const slot of posed.sent) slot.length = 0;
  }, world.mirrored ? { dynamics: false } : {});
  help = createAssist(built, rootSegment(built), ceiling, world.delay);
  if (world.mirrored) {
    const statics = mirrorStatics(built), writer = mirrorWriter(built, statics, world, muscles, help, sense);
    // Its fight senses for it from its first step: made, it reads its body alone.
    writer.write({ sensing: false });
    mirrored = { writer, mirror: mirrorBody(statics, writer.channel) };
    const n = mirrored.mirror.muscles.channels.length;
    for (let k = 0; k < world.delay; k++) {
      flight.expect.push(new Float64Array(n).fill(NaN));
      flight.solved.push(new Float64Array(n).fill(NaN));
    }
    flight.motion = new Float64Array(6 + n).fill(NaN);
  }
  const listeners = new Set<(step: number, time: number) => void>();
  let observed = null as Hook | null;
  const observe = () => {
    if (mirrored) { mirrored.writer.write(); mirrored.mirror.refresh({ dynamics: false }); }
    for (const one of listeners) one(world.steps, world.time);
  };
  const mirror = mirrored?.mirror;
  const own: OwnBody = { spec: built.spec,
    ...(mirror ? { built: mirror.read, muscles: mirror.muscles, assist: mirror.assist, requestHandPoses: mirror.requestHandPoses, senses: () => mirror.senses }
      : { built: readView(built), muscles, assist: help.assist, requestHandPoses: request, senses: sense }),
    ...(contactIdentity ? { contactIdentity } : {}), ...(experiment ? { experiment } : {}),
    afterPhysics(listener) {
      observed ??= world.afterPhysics(observe);
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    } };
  let made: M;
  try { made = make(own); }
  catch (error) { observed?.dispose(); muscles.dispose(); throw error; }
  mind = made;
  return { own, held: { muscles, assist: help.assist, senses: sense }, mind: made,
    state: { muscles: muscles.state, assist: help.state, handPoses: built.handPoses.state, posed, flight, toes: built.toes, mind: made.state ?? null },
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

/** The segments `spec`'s legs bear it on: its feet, paws and propped shins (`BodySpec.ends`), not its hands. */
function standingSegments(spec: BodySpec): ReadonlySet<string> {
  return new Set((spec.ends ?? []).filter((end) => end.kind !== "end").map((end) => end.segment));
}

/** Whether `mirror`'s body touches anything with none but the segments its legs bear it on (`standing`), as last read. */
function onFeet(mirror: Mirror, standing: ReadonlySet<string>): boolean {
  for (const segment of mirror.read.segments.values())
    if (!standing.has(segment.spec.name) && mirror.read.physics.contactsOf(segment.body).length > 0) return false;
  return true;
}

/**
 * Carries a mirror a step forward through a command in flight: each channel toward the speed the
 * command expects (`MuscleDriver.expect`), as far as the plan's reflex (`PLAN_REFLEX`) can take it
 * from the acceleration solved: the margin over the inertia beyond the joint. The root moves as the
 * joints and its own motion carry it.
 */
function forecast(mirror: Mirror, expect: Float64Array, solved: Float64Array, motion: Float64Array, dt: number): void {
  const muscles = mirror.muscles, mass = muscles.dynamics.mass;
  for (let i = 0; i < expect.length; i++) {
    const a = solved[i]!;
    if (Number.isNaN(a)) { motion[6 + i] = NaN; continue; }
    const up = muscles.strength(i, 1), down = muscles.strength(i, -1), reach = PLAN_REFLEX * (up > down ? up : down) / mass[i]![i]!;
    const wanted = (expect[i]! - muscles.speed(i)) / dt;
    motion[6 + i] = wanted < a - reach ? a - reach : wanted > a + reach ? a + reach : wanted;
  }
  mirror.forecast(motion, dt);
}
