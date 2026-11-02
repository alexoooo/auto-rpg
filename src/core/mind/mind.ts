import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, LayerOptions } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import type { HandPoseRequest } from "../build/hand-poses.ts";
import { rootSegment, type ReadBody } from "../read-body.ts";
import { readView } from "../build/read-view.ts";
import { createAssist, NO_ASSIST, type Assist, type AssistCeiling } from "../control/assist.ts";
import type { ContactIdentity } from "../control/effector-feedback.ts";
import { driveMuscles, type MuscleDriver } from "../muscle/driver.ts";
import { mirrorBody, mirrorStatics, mirrorWriter, type Mirror, type MirrorStatics, type MirrorWriter } from "./mirror.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Hook, World } from "../world.ts";
import { clockSenses, type Senses } from "./senses.ts";
import { delayLine, heldSteps } from "../command-delay.ts";
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
   * **Its motor part**, where it has one: each control step, on the body as it is, it turns what its
   * steps decided into the muscles' command. Its body takes that command at once; what a step
   * decides reaches it `OwnBody.delay` steps later (`embody`). It reads its own body alone: the
   * senses are its step's (`OwnBody.senses` refuses it).
   */
  move?(dt: number): void;
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
  /** The steps between its mind's step and its motor part carrying out what the step decided (`World.delay`, `Mind.move`). */
  readonly delay: number;
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
  /** The body's memory under this mind (`src/core/state.ts`): its muscles', its assist's, the mind's own or null, and on a mirror what its mind has asked and not yet answered (`Mirror.command`) and what its senses last showed it (`Mirror.seen`). */
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
 * step. **What its motor part sends (`Mind.move`) is applied at once**: with no delay it moves
 * after its step, the same step; with one, its body's motor part moves and its command is taken,
 * then its mind steps on the same body, so that what the step sends goes with the next step's
 * command, and the rings hold it the rest of the delay (`heldSteps`). Its first steps at `full`,
 * from its start or back from another level, apply none but what its motor part sends. Given a
 * `log`, each step's order sheet is written in it as the mind leaves it (`SheetLog`). What observes
 * the completed physics (`OwnBody.afterPhysics`) is run by one hook of `world`'s, added with the
 * first observer.
 */
export function embody<M extends Mind>(built: BuiltBody, world: World, make: MindMaker<M>,
  { senses: sense = clockSenses(world), assist: ceiling = NO_ASSIST, contactIdentity, log, experiment }: Embodying = {}): Embodied<M> {
  let mind: M | null = null, mirrored: { readonly writer: MirrorWriter; readonly mirror: Mirror } | null = null, thinking: Hook | null = null;
  const way = commandWay(built, world, log), held = heldSteps(world.delay), moves = motorPart(() => mind!);
  const muscles = driveMuscles(built, world, (driver, dt) => {
    if (mirrored) mirrored.writer.carry(way.request);
    else { mind!.step(sense(), dt); moves.move(dt); }
    way.settle(driver);
  }, () => { mind!.idle?.(); mirrored?.mirror.idle(); way.reset(); }, { ...world.mirrored ? { dynamics: false, prepared: true } as const : {}, delay: held });
  way.assisted(createAssist(built, rootSegment(built), ceiling, held));
  if (world.mirrored) {
    const statics = mirrorStatics(built, contactIdentity !== undefined, world.delay);
    const writer = mirrorWriter(built, statics, world, muscles, way.help, sense, contactIdentity ? { labels: contactIdentity } : {});
    // Its fight senses for it from its first step: made, it reads its body alone.
    writer.write({ sensing: false });
    const mirror = mirrorBody(statics, writer.channel);
    mirrored = { writer, mirror };
    // It thinks as the step is prepared, on its mirror; its command is carried out on its body as the step's controls run.
    thinking = world.prepare((dt) => {
      if (muscles.level !== "full") return;
      writer.write();
      mirror.refresh({ dynamics: true });
      think(mind!, moves, mirror, world.delay, dt);
    });
  }
  const listeners = new Set<(step: number, time: number) => void>();
  let observed = null as Hook | null, shown: Hook | null = null;
  const show = () => { if (mirrored) { mirrored.writer.write(); mirrored.mirror.refresh({ dynamics: false }); mirrored.mirror.recall(); } };
  const observe = () => {
    show();
    for (const one of listeners) one(world.steps, world.time);
  };
  // A mirror shows its body as each step leaves it, and again as a load puts it back: what its mind
  // says of itself between steps (`MindReport`) reads the body as it stands, a load's as the save's.
  if (mirrored) { observed = world.afterPhysics(observe); shown = world.onLoad(show); }
  const mirror = mirrored?.mirror;
  const own: OwnBody = { spec: built.spec,
    delay: world.delay,
    ...(mirror ? { built: mirror.read, muscles: mirror.muscles, assist: mirror.assist, requestHandPoses: mirror.requestHandPoses, senses: moves.guard(() => mirror.senses),
      ...(mirror.contactIdentity ? { contactIdentity: mirror.contactIdentity } : {}) }
      : { built: readView(built), muscles, assist: way.help.assist, requestHandPoses: way.request, senses: moves.guard(sense), ...(contactIdentity ? { contactIdentity } : {}) }),
    ...(experiment ? { experiment } : {}),
    afterPhysics(listener) {
      observed ??= world.afterPhysics(observe);
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    } };
  let made: M;
  try { made = make(own); }
  catch (error) { observed?.dispose(); shown?.dispose(); thinking?.dispose(); muscles.dispose(); throw error; }
  mind = made;
  return { own, held: { muscles, assist: way.help.assist, senses: sense }, mind: made,
    state: { muscles: muscles.state, assist: way.help.state, handPoses: built.handPoses.state, posed: way.posed, toes: built.toes, mind: made.state ?? null,
      ...(mirrored ? { asked: mirrored.mirror.command, seen: mirrored.mirror.seen } : {}) },
    dispose: () => { made.dispose?.(); observed?.dispose(); shown?.dispose(); thinking?.dispose(); listeners.clear(); muscles.dispose(); } };
}

/**
 * **The way a mind's command goes to its body**, the same whoever made it and wherever: the hand
 * poses it asks (`request`), checked and kept until their step comes, a slot a step of the world's
 * delay and one more; and, once the muscles have the command, the sheet written where a `log` is
 * given, the assist's ask given within its ceiling, and the hand poses due asked of the hands
 * (`settle`). Its assist is given once made (`assisted`).
 */
function commandWay(built: BuiltBody, world: World, log: SheetLog | undefined) {
  let help: ReturnType<typeof createAssist> | null = null;
  // The hand poses asked since the last sheet, which the next sheet carries.
  const hands: HandPoseRequest[] = [];
  // The hand poses asked since the mind's last step, and those sent and not yet asked of the hands, a slot a step the rings hold them (`heldSteps`) and one more.
  const line = delayLine(heldSteps(world.delay)), posed = { asked: [] as HandPoseRequest[], sent: Array.from({ length: line.size }, () => [] as HandPoseRequest[]), line: line.state };
  return {
    posed,
    get help() { return help!; },
    assisted(made: ReturnType<typeof createAssist>) { help = made; },
    request(requests: readonly HandPoseRequest[]) {
      for (const { hand, pose } of built.handPoses.check(requests)) posed.asked.push({ hand, pose });
      if (log) for (const { hand, pose } of requests) hands.push({ hand, pose });
    },
    settle(driver: MuscleDriver) {
      if (log) record(log, world.steps, driver, help!.asked, hands);
      help!.apply();
      const slot = posed.sent[line.written()]!;
      slot.length = 0;
      for (const one of posed.asked.splice(0)) slot.push(one);
      const due = line.applied();
      line.advance();
      if (due >= 0 && posed.sent[due]!.length > 0) built.handPoses.request(posed.sent[due]!.splice(0));
    },
    reset() {
      help!.reset();
      line.reset();
      posed.asked.length = 0;
      for (const slot of posed.sent) slot.length = 0;
    },
  };
}

/** **A body driven from its mirror's answers** (`mirrorDriven`): its muscles and assist, the hand poses in flight, the numbers written for its mind and what they are first told, and its senses. */
export interface MirrorDriven {
  readonly muscles: MuscleDriver;
  readonly help: ReturnType<typeof createAssist>;
  readonly posed: ReturnType<typeof commandWay>["posed"];
  readonly writer: MirrorWriter;
  readonly statics: MirrorStatics;
  readonly senses: () => Senses;
}

/**
 * **`built` driven by a mind that reads it from a mirror elsewhere** (`embodyApart`,
 * `src/core/mind/minds.ts`): the muscles read the joints as the step is prepared, the mind's numbers
 * are written in `allocate`'s memory, and as the step's controls run, once the mind has `answered`,
 * its command is carried out as `embody` carries out a mind's, the same rings, assist and sheets;
 * `idle` is called as the body leaves `full`. Written once, with the senses as nothing yet read.
 */
export function mirrorDriven(built: BuiltBody, world: World, allocate: (length: number) => Float64Array, { answered, idle }: { answered(): void; idle(): void },
  { senses: sense = clockSenses(world), assist: ceiling = NO_ASSIST, contactIdentity, log }: Embodying = {}): MirrorDriven {
  const way = commandWay(built, world, log);
  let writer: MirrorWriter | null = null;
  const muscles = driveMuscles(built, world, (driver) => {
    answered();
    writer!.carry(way.request);
    way.settle(driver);
  }, () => { idle(); way.reset(); }, { dynamics: false, prepared: true, delay: heldSteps(world.delay) });
  way.assisted(createAssist(built, rootSegment(built), ceiling, heldSteps(world.delay)));
  const statics = mirrorStatics(built, contactIdentity !== undefined, world.delay);
  writer = mirrorWriter(built, statics, world, muscles, way.help, sense, { allocate, ...(contactIdentity ? { labels: contactIdentity } : {}) });
  writer.write({ sensing: false });
  return { muscles, help: way.help, posed: way.posed, writer, statics, senses: sense };
}

/**
 * **A mind's motor part as its body runs it** (`Mind.move`): `move` runs it where the mind has one,
 * and `guard` makes a senses reader refuse while it runs.
 */
export function motorPart(mind: () => Mind) {
  let moving = false;
  return {
    move(dt: number): void {
      const made = mind();
      if (!made.move) return;
      moving = true;
      try { made.move(dt); } finally { moving = false; }
    },
    guard<S>(senses: () => S): () => S {
      return () => {
        if (moving) throw new Error("a mind's motor part reads its own body alone, not its senses");
        return senses();
      };
    },
  };
}

/**
 * **A mind's step on its mirror** (`Mirror`), refreshed: with no delay, what it senses, its step,
 * its motor part and its answer; with one, its motor part and its answer on the senses it last
 * decided on, then what it senses and its step on the same body, so that what the step sends goes
 * with the next answer (`embody`).
 */
export function think(mind: Mind, moves: ReturnType<typeof motorPart>, mirror: Mirror, delay: number, dt: number): void {
  if (delay > 0) { moves.move(dt); mirror.answer(); mirror.sense(); mind.step(mirror.senses, dt); return; }
  mirror.sense();
  mind.step(mirror.senses, dt);
  moves.move(dt);
  mirror.answer();
}

/** Write `driver`'s command, the assist's ask and the hand poses asked since the last sheet into `log` as the sheet of `step`, in place of any it held from that step on. */
function record(log: SheetLog, step: number, driver: MuscleDriver, asked: { readonly force: Vector3; readonly moment: Vector3 }, hands: HandPoseRequest[]): void {
  const sheets = log.sheets;
  while (sheets.length > 0 && sheets[sheets.length - 1]!.step >= step) sheets.pop();
  sheets.push({ step, activation: driver.activation.slice(), velocity: driver.velocity.slice(),
    force: [asked.force.x, asked.force.y, asked.force.z], moment: [asked.moment.x, asked.moment.y, asked.moment.z],
    hands: hands.splice(0) });
}
