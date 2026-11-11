import { constructionScope } from "../../core/construction.ts";
import type { OwnBody } from "../../core/bodies/own-body.ts";
import type { BuiltBody } from "../../core/bodies/build/build-body.ts";
import type { ConfigurationRequest } from "../../core/bodies/build/configurations.ts";
import type { ContactIdentity } from "../../core/bodies/contact-identity.ts";
import { commandPipeline } from "../../core/bodies/command-pipeline.ts";
import { NO_ASSIST, type AssistCeiling } from "../../core/bodies/assist.ts";
import { driveMuscles, type MuscleDriver } from "../../core/bodies/muscle/driver.ts";
import type { Vector3 } from "../../core/math/vector.ts";
import type { World } from "../../core/world/world.ts";
import { clockSenses } from "../../core/world/senses.ts";
import { heldSteps } from "../../core/bodies/command-delay.ts";
import type { Senses } from "../../core/bodies/senses.ts";
import type { MindConstruction } from "../mind.ts";
import { answer, think } from "../execution.ts";
import { mirrorBody, mirrorStatics, mirrorWriter, type MirrorStatics, type MirrorWriter } from "./mirror-channel.ts";
import type { HeldReading } from "./physical-body.ts";
import type { SheetLog } from "./sheets.ts";

type MindMaker<M extends MindConstruction = MindConstruction> = (own: OwnBody) => M;

interface Embodied<M extends MindConstruction = MindConstruction> {
  /** The mirror its mind reads. */
  readonly own: OwnBody;
  /** The body as its fight holds it: its muscles, its assist and its senses, the world's own whatever its mind reads. */
  readonly held: HeldReading;
  /** What its maker made of it: the `Mind`, its name, who has the body and its disposal. */
  readonly construction: M;
  /** The body's memory under this mind (`src/core/state.ts`): its muscles', its assist's, the mind's own, what its mind has asked and not yet answered (`Mirror.command`) and what its senses last showed it (`Mirror.seen`). */
  readonly state: object;
  /** Stop driving: the mind lets go (`MindConstruction.dispose`), its observers stop, and the motors are released. */
  dispose(): void;
}

/** What a body is given beside its mind: its senses, its assist's ceiling, how it labels a contact, where its order sheets are written. */
export interface Embodying {
  /** What it senses (`SensesHub.add`); the clock alone unless given. */
  readonly senses?: () => Senses;
  /** The most its assist gives it; none unless given: it stands on its muscles. */
  readonly assist?: AssistCeiling;
  /** How it labels a contact's other side; none unless given. */
  readonly contactIdentity?: ContactIdentity;
  /** Where its order sheets are written (`SheetLog`); nowhere unless given. */
  readonly log?: SheetLog;
  /** Called as each step's answer is made, before the step's decision where it is still to come (`answer`); nothing unless given. */
  readonly answered?: () => void;
}

/**
 * Give `built` a mind on its mirror. Preparation writes the body, observes the completed interval,
 * sends the motor command, reads the report, then decides. The body side carries the answer into
 * the muscles, assist and configuration rings before physics. A load refreshes the mirror and recalls
 * the senses held by the last decision.
 */
export function embody<M extends MindConstruction>(built: BuiltBody, world: World, make: MindMaker<M>,
  { senses: sense = clockSenses(world), assist: ceiling = NO_ASSIST, contactIdentity, log, answered }: Embodying = {}): Embodied<M> {
  let made: M, mirror: ReturnType<typeof mirrorBody>;
  const driven = mirrorDriven(built, world, length => new Float64Array(length), {
    answered() {},
    idle() { made.mind.interrupt(); mirror.idle(); },
  }, { senses: sense, assist: ceiling, contactIdentity, log });
  const { muscles, help, posed, writer, statics } = driven;
  const scope = constructionScope(); scope.own(muscles); let complete = false;
  try {
  mirror = mirrorBody(statics, writer.channel);
  const own: OwnBody = { spec: built.spec, dt: world.dt, delay: world.delay,
    built: mirror.read, muscles: mirror.muscles, assist: mirror.assist,
    first: mirror.senses,
    ...(mirror.contactIdentity ? { contactIdentity: mirror.contactIdentity } : {}),
  };
  made = scope.own(make(own));
  const thinking = world.prepare(() => {
    if (muscles.level !== "full") return;
    writer.write();
    answer(made.mind, mirror);
    answered?.();
    think(made.mind, mirror);
  });
  scope.own(thinking);
  scope.own(world.onLoad(() => { writer.write(); mirror.refresh({ dynamics: false }); mirror.recall(); }));
  complete = true;
  return { own, held: { muscles, assist: help.assist, senses: sense }, construction: made,
    state: { muscles: muscles.state, assist: help.state, configurations: built.configurations.state, posed, toes: built.toes, strength: built.strength,
      mind: made.mind.state, asked: mirror.command, seen: mirror.seen },
    dispose: scope.dispose,
  };
  } finally { if (!complete) scope.dispose(); }
}

/** **A body driven from its mirror's answers** (`mirrorDriven`): its muscles and assist, the segment configurations in flight, the numbers written for its mind and what they are first told, and its senses. */
interface MirrorDriven {
  readonly muscles: MuscleDriver;
  readonly help: ReturnType<typeof commandPipeline>["help"];
  readonly posed: ReturnType<typeof commandPipeline>["posed"];
  readonly writer: MirrorWriter;
  readonly statics: MirrorStatics;
  readonly senses: () => Senses;
}

/**
 * **`built` driven by a mind that reads it from a mirror elsewhere** (`embodyApart`,
 * `src/minds/seat/create-mind.ts`): the muscles read the joints as the step is prepared, the mind's numbers
 * are written in `allocate`'s memory, and as the step's controls run, once the mind has `answered`,
 * its command is carried out as `embody` carries out a mind's, the same rings, assist and sheets;
 * `idle` is called as the body leaves `full`. Written once, with the senses as nothing yet read.
 */
export function mirrorDriven(built: BuiltBody, world: World, allocate: (length: number) => Float64Array, { answered, idle }: { answered(): void; idle(): void },
  { senses: sense = clockSenses(world), assist: ceiling = NO_ASSIST, contactIdentity, log }: Embodying = {}): MirrorDriven {
  const way = commandPipeline(built, world.delay, ceiling);
  const configurations: ConfigurationRequest[] = [];
  const request: typeof way.request = log ? (segment, configuration) => { way.request(segment, configuration); configurations.push({ segment, configuration }); } : way.request;
  let writer: MirrorWriter;
  const muscles = driveMuscles(built, world, (driver) => {
    answered();
    writer.carry(request);
    if (log) record(log, world.steps, driver, way.help.asked, configurations);
    way.settle();
  }, () => { idle(); way.reset(); }, { dynamics: false, prepared: true, delay: heldSteps(world.delay) });
  let complete = false;
  try {
  const statics = mirrorStatics(built, contactIdentity !== undefined, world.delay);
  writer = mirrorWriter(built, statics, world, muscles, way.help, sense, { allocate, ...(contactIdentity ? { labels: contactIdentity } : {}) });
  writer.write({ sensing: false });
  complete = true;
  return { muscles, help: way.help, posed: way.posed, writer, statics, senses: sense };
  } finally { if (!complete) muscles.dispose(); }
}

/** Write `driver`'s command, the assist's ask and the segment configurations asked since the last sheet into `log` as the sheet of `step`, in place of any it held from that step on. */
function record(log: SheetLog, step: number, driver: MuscleDriver, asked: { readonly force: Vector3; readonly moment: Vector3 }, configurations: ConfigurationRequest[]): void {
  const sheets = log.sheets;
  while (sheets.length > 0 && sheets[sheets.length - 1]!.step >= step) sheets.pop();
  sheets.push({ step, activation: driver.activation.slice(), velocity: driver.velocity.slice(),
    force: [asked.force.x, asked.force.y, asked.force.z], moment: [asked.moment.x, asked.moment.y, asked.moment.z],
    configurations: configurations.splice(0) });
}
