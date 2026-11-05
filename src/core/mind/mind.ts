import type { BodyControl } from "../body-control.ts";
import type { Vector3 } from "../math/vector.ts";
import type { Body, LayerOptions } from "../body.ts";
import type { BuiltBody } from "../build/build-body.ts";
import { HAND_POSES, checkHandPose, type HandPoseRequest } from "../build/hand-poses.ts";
import type { HandPose } from "../spec/body.ts";
import { rootSegment, type ReadBody } from "../read-body.ts";
import { createAssist, NO_ASSIST, type AssistReading, type AssistCeiling } from "../control/assist.ts";
import type { ContactIdentity } from "../control/effector-feedback.ts";
import { driveMuscles, type MuscleDriver, type MuscleReading } from "../muscle/driver.ts";
import { mirrorBody, mirrorStatics, mirrorWriter, type Mirror, type MirrorStatics, type MirrorWriter } from "./mirror.ts";
import type { BodySpec } from "../spec/body.ts";
import type { World } from "../world.ts";
import { clockSenses, type Senses } from "./senses.ts";
import { delayLine, heldSteps } from "../command-delay.ts";
import type { HeldReading } from "../physical-body.ts";
import type { SheetLog } from "./sheets.ts";

/** Plain saved memory: all values a mind carries from one step to the next. */
export type MindState = object;

/** A computation whose fast action precedes its next decision. */
export interface Mind {
  readonly state: MindState;
  act(control: BodyControl): void;
  think(senses: Senses): void;
  interrupt(): void;
}

/** Construction metadata and resources, separate from the computation. */
export interface MindConstruction<M extends Mind = Mind> {
  readonly mind: M;
  readonly name: string;
  has(): string;
  dispose(): void;
  /** The command layers exposed by constructions that use them. */
  readonly body?: Body;
}

/** Fixed body facts, live readings and the senses shown before its first decision. */
export interface OwnBody {
  readonly spec: BodySpec;
  readonly dt: number;
  /** The steps between its mind's step and its motor part carrying out what the step decided (`World.delay`, `Mind.act`). */
  readonly delay: number;
  readonly built: ReadBody;
  readonly muscles: MuscleReading;
  /** The force and the moment on its root that it is allowed beyond its muscles (`Assist`): none unless it was given a ceiling. */
  readonly assist: AssistReading;
  /** The senses shown at construction, before its first decision. */
  readonly first: Senses;
  /** How it labels the other side of a contact (`ContactIdentity`), where its fight grants one. */
  readonly contactIdentity?: ContactIdentity;
}

type MindMaker<M extends MindConstruction = MindConstruction> = (own: OwnBody) => M;

interface Embodied<M extends MindConstruction = MindConstruction> {
  /** The mirror its mind reads. */
  readonly own: OwnBody;
  /** The body as its fight holds it: its muscles, its assist and its senses, the world's own whatever its mind reads. */
  readonly held: HeldReading;
  readonly mind: M;
  /** The body's memory under this mind (`src/core/state.ts`): its muscles', its assist's, the mind's own, what its mind has asked and not yet answered (`Mirror.command`) and what its senses last showed it (`Mirror.seen`). */
  readonly state: object;
  /** Stop driving: the mind lets go (`MindConstruction.dispose`), its observers stop, and the motors are released. */
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
  /** Called as each step's answer is made, before the step's decision where it is still to come (`answer`); nothing unless given. */
  readonly answered?: () => void;
}

/**
 * Give `built` a mind on its mirror. Preparation writes the body, observes the completed interval,
 * sends the motor command, reads the report, then decides. The body side carries the answer into
 * the muscles, assist and hand-pose rings before physics. A load refreshes the mirror and recalls
 * the senses held by the last decision.
 */
export function embody<M extends MindConstruction>(built: BuiltBody, world: World, make: MindMaker<M>,
  { senses: sense = clockSenses(world), assist: ceiling = NO_ASSIST, contactIdentity, log, answered }: Embodying = {}): Embodied<M> {
  const driven = mirrorDriven(built, world, length => new Float64Array(length), {
    answered() {},
    idle() { made.mind.interrupt(); mirror.idle(); },
  }, { senses: sense, assist: ceiling, contactIdentity, log });
  const { muscles, help, posed, writer, statics } = driven;
  const mirror = mirrorBody(statics, writer.channel);
  const own: OwnBody = { spec: built.spec, dt: world.dt, delay: world.delay,
    built: mirror.read, muscles: mirror.muscles, assist: mirror.assist,
    first: mirror.senses,
    ...(mirror.contactIdentity ? { contactIdentity: mirror.contactIdentity } : {}),
  };
  const made = (() => {
    let complete = false;
    try {
      const result = make(own);
      complete = true;
      return result;
    } finally {
      if (!complete) muscles.dispose();
    }
  })();
  const thinking = world.prepare(() => {
    if (muscles.level !== "full") return;
    writer.write();
    answer(made.mind, mirror);
    answered?.();
    think(made.mind, mirror);
  });
  const shown = world.onLoad(() => { writer.write(); mirror.refresh({ dynamics: false }); mirror.recall(); });
  return { own, held: { muscles, assist: help.assist, senses: sense }, mind: made,
    state: { muscles: muscles.state, assist: help.state, handPoses: built.handPoses.state, posed, toes: built.toes, strength: built.strength,
      mind: made.mind.state, asked: mirror.command, seen: mirror.seen },
    dispose() { made.dispose(); shown.dispose(); thinking.dispose(); muscles.dispose(); },
  };
}

/**
 * **The way a mind's command goes to its body**, the same whoever made it and wherever: the hand
 * poses it asks (`request`), checked and kept until their step comes, a slot a step of the world's
 * delay and one more; and, once the muscles have the command, the sheet written where a `log` is
 * given, the assist's ask given within its ceiling, and the hand poses due asked of the hands
 * (`settle`). Its assist is made with the pipeline.
 */
function commandWay(built: BuiltBody, world: World, log: SheetLog | undefined, ceiling: AssistCeiling) {
  const help = createAssist(built, rootSegment(built), ceiling, heldSteps(world.delay));
  // The hand poses asked since the last sheet, which the next sheet carries.
  const hands: HandPoseRequest[] = [];
  // The hand poses asked since the mind's last step, and those sent and not yet asked of the hands, a slot a step the rings hold them (`heldSteps`) and one more.
  const line = delayLine(heldSteps(world.delay)), posed = { asked: [] as number[], sent: Array.from({ length: line.size }, () => [] as number[]), line: line.state };
  return {
    posed,
    help,
    request(hand: "left" | "right", pose: HandPose) {
      checkHandPose(built.handPoses.model, hand, pose);
      posed.asked.push(hand === "left" ? 0 : 1, HAND_POSES.indexOf(pose));
      if (log) hands.push({ hand, pose });
    },
    settle(driver: MuscleDriver) {
      if (log) record(log, world.steps, driver, help.asked, hands);
      help.apply();
      const slot = posed.sent[line.written()]!;
      slot.length = 0;
      for (let i = 0; i < posed.asked.length; i++) slot.push(posed.asked[i]!);
      posed.asked.length = 0;
      const due = line.applied();
      line.advance();
      if (due >= 0) {
        const requests = posed.sent[due]!;
        for (let i = 0; i < requests.length; i += 2) built.handPoses.requestOne(requests[i] === 0 ? "left" : "right", HAND_POSES[requests[i + 1]!]!);
        requests.length = 0;
      }
    },
    reset() {
      help.reset();
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
  const way = commandWay(built, world, log, ceiling);
  const muscles = driveMuscles(built, world, (driver) => {
    answered();
    writer.carry(way.request);
    way.settle(driver);
  }, () => { idle(); way.reset(); }, { dynamics: false, prepared: true, delay: heldSteps(world.delay) });
  const statics = mirrorStatics(built, contactIdentity !== undefined, world.delay);
  const writer = mirrorWriter(built, statics, world, muscles, way.help, sense, { allocate, ...(contactIdentity ? { labels: contactIdentity } : {}) });
  writer.write({ sensing: false });
  return { muscles, help: way.help, posed: way.posed, writer, statics, senses: sense };
}

/** Refresh the body, carry the chosen action out and send its command. */
export function answer(mind: Mind, mirror: Mirror): void {
  mirror.refresh({ dynamics: true });
  mind.act(mirror.control);
  mirror.answer();
}

/** Read the senses after the answer, then choose the next command. */
export function think(mind: Mind, mirror: Mirror): void {
  mirror.sense();
  mind.think(mirror.senses);
}

/** Write `driver`'s command, the assist's ask and the hand poses asked since the last sheet into `log` as the sheet of `step`, in place of any it held from that step on. */
function record(log: SheetLog, step: number, driver: MuscleDriver, asked: { readonly force: Vector3; readonly moment: Vector3 }, hands: HandPoseRequest[]): void {
  const sheets = log.sheets;
  while (sheets.length > 0 && sheets[sheets.length - 1]!.step >= step) sheets.pop();
  sheets.push({ step, activation: driver.activation.slice(), velocity: driver.velocity.slice(),
    force: [asked.force.x, asked.force.y, asked.force.z], moment: [asked.moment.x, asked.moment.y, asked.moment.z],
    hands: hands.splice(0) });
}
