import type { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Assist } from "./control/assist.ts";
import type { Frame } from "./control/kinematics.ts";
import type { EffectorGoal, MotorUnmet, MusclePush, PointTask } from "./control/motor.ts";
import type { Pose } from "./spec/pose.ts";
import type { StanceGoal, StanceReading } from "./control/stance.ts";
import type { StanceTuning } from "./control/stance-tuning.ts";
import type { StanceEnvelope } from "./control/stance-envelope.ts";
import type { Embodying } from "./mind/mind.ts";
import type { Senses } from "./mind/senses.ts";
import type { SubMindMaker } from "./mind/sub-mind.ts";
import type { MuscleDriver } from "./muscle/driver.ts";
import type { MotorMaker } from "./control/motor-part.ts";
import type { PhysicalBody } from "./physical-body.ts";
import type { EffectorContact, EffectorFeedback } from "./control/effector-feedback.ts";
import type { BodySpec, Side, HandPose } from "./spec/body.ts";
import type { GroundReading } from "./recovery/ground/reading.ts";
import type { ReadBody } from "./read-body.ts";
import { segmentOf } from "./spec/body.ts";

/**
 * **A body, commanded and seen**: the body its drivers have under the command layers
 * (`commandLayers`, `src/core/control/command-layers.ts`), any mind's to build on its own body.
 * Its muscles are under motor control, commanded by goals and read through a view: whoever drives
 * it at this level -- a decider's skills, the lab's routine, a test -- sees the view and hands back
 * a command. A mind may drive muscles itself instead (`Mind`, `src/core/mind/mind.ts`).
 *
 * Each control step the body reads its view, asks its driver for a command, and gives the command
 * to motor control, all before the solver step, so a command acts in the step it was made for.
 * While a mind that hands its body over (`hosting`) has given it to another, the view is read all
 * the same, the driver is not asked, and the other writes the muscles.
 */
export interface Body {
  readonly built: ReadBody;
  /** The muscles, for readings (a view of the torques); a driver commands through `drive`. */
  readonly muscles: MuscleDriver;
  /** The view as the last step left it, or as built before the first. */
  readonly view: BodyView;
  /**
   * What the stance was measured to hold with this body (`stance-envelope.ts`), so a driver asks for
   * its fastest walk and not a number; null under a stance tuning other than the core's, which the
   * measurement did not see, or while the envelope is being measured (`LayerOptions.measuring`).
   */
  readonly envelope: StanceEnvelope | null;
  /** Its assist (`Assist`), for its meter; a fight withdraws it. */
  readonly assist: Assist;
  /** Drive each control step; null keeps the command. `released` discards pending driver work on sub-mind takeover or idle. */
  drive(driver: BodyDriver | null, released?: (view: BodyView, reason: "takeover" | "idle" | "replaced") => void): void;
  /** Observe completed physics intervals after effector feedback is sampled, including while idle or under a sub-mind (`OwnBody.afterPhysics`). */
  afterPhysics(listener: (step: number, time: number) => void): () => void;
}

/**
 * **A body under the command layers as the one who built it holds it** (`commandedBody`): the
 * built body under it (`PhysicalBody`), its view, its drive, and the body its drivers have
 * (`driver`), which reads the built body through its read view and is the one to hand a decider's
 * skills, a skill or a script.
 */
export type HostedBody = PhysicalBody & Pick<Body, "view" | "envelope" | "drive" | "afterPhysics"> & { readonly driver: Body };

/** The command layers' ownership label (`Mind.name`), shared by them and their readers (`commandsBody`). */
export const COMMAND = "command";

/** Whether the command layers currently drive this body, rather than a sub-mind or nobody. */
export function commandsBody(body: Pick<PhysicalBody, "has" | "level">): boolean {
  return body.level === "full" && body.has === COMMAND;
}

/**
 * What drives a body: given the view and the step, the command for this step, or null to keep the
 * last (after a sub-mind had the body, the last is its posture alone). The body keeps the command's goals in its state, and a load writes into whatever of a
 * state is not frozen. So a command, and whatever it holds, is made for the step, or frozen
 * (`deepFreeze`), or part of a state saved and loaded with the body's, as the skills' is
 * (`Skills.state`).
 */
export type BodyDriver = (view: BodyView, dt: number) => BodyCommand | null;

/**
 * **A command is goals**: a posture for the freedoms nothing else owns, places for the effectors,
 * and the freedoms pushed flat out.
 */
export interface BodyCommand {
  /** A coarse contact configuration, by the hand's segment; omitted hands retain their pending request. */
  readonly handPoses?: Readonly<Partial<Record<string, HandPose>>>;
  /** Angles by channel; a freedom not named is held at its reference angle. */
  readonly posture: Pose;
  /**
   * For each effector (`BodySpec.effectors`), by its segment, where named points of its rigid body
   * go (body frame, `BodyView.root`) and in what time (`EffectorGoal`); one not named, or null,
   * gives its chain to the posture. A goal equal to the one before keeps its path, as does one that
   * follows it (`EffectorGoal.follows`); another starts a new one from where the points are. A
   * foot the stance bears on cannot also reach.
   */
  readonly effectors?: Readonly<Record<string, EffectorGoal | null>>;
  /** Freedoms driven by their muscles alone, whatever else would own them. */
  readonly pushes: readonly MusclePush[];
  /**
   * Effectors' points driven at an acceleration, or turned, while the body stands (`PointTask`): an effector
   * driven so has no goal and its chain no push.
   */
  readonly points?: readonly PointTask[];
  /** Stand on the ground so (`stance.ts`), or null to leave the legs to the posture. */
  readonly stance: StanceGoal | null;
  /**
   * With no stance, the centre of mass's height over the ground, m, at which the body is held low
   * on purpose (a kneel): it is down only once that far under it as under its standing height
   * (`Uprightness.down`). Absent, its standing height.
   */
  readonly held?: number;
}

/** **What a body shows its driver**, read at the start of each control step from the step before. */
export interface BodyView {
  /**
   * Each effector's named points (`rigidPoints`: a hand's knuckles, the points of what it holds) and
   * turn, in the body frame where its goal is set, with its trusted detached touch when the body
   * reads it (`LayerOptions.feedback`).
   */
  readonly effectors: Readonly<Record<string, { readonly points: Readonly<Record<string, Vector3>>; readonly rotation: Quaternion; readonly feedback?: EffectorFeedback }>>;
  /** Each posable hand's pose, by its segment: the one it has and the one it was asked. */
  readonly handPoses: Readonly<Record<string, { readonly applied: HandPose; readonly requested: HandPose }>>;
  /** Seconds of the world's clock. */
  readonly time: number;
  /**
   * Seconds of the world's clock at the body's first view, as it was built: where its own time
   * starts, so a body behaves the same in a world that has run before it.
   */
  readonly born: number;
  /** What the body senses of the world this step (`Senses`): the clock, its side, and every other body. */
  readonly senses: Senses;
  /** Each freedom's angle, rad, by channel name (`jointAngles`). */
  readonly angles: Readonly<Record<string, number>>;
  /** Each hand's knuckles in the world: where a fist strikes, and how fast. */
  readonly fists: Readonly<Record<Side, Fist>>;
  /**
   * The body frame in the world, as the last step left it: the root segment's place and turn
   * (`rootFrameToRef`), the frame an effector's goal is set in. A world point is brought into it with
   * `intoFrameToRef`.
   */
  readonly root: Frame;
  /** The head's centre of mass, world: where a strike's reach is measured from (`placedReach`, `src/core/skills/strikes/arm-reach.ts`). */
  readonly head: Vector3;
  /** The centre of mass, the stance's support, and what the stance last asked (`StanceReading`). */
  readonly stance: StanceReading;
  /** What the motor did not carry out of the last step's command (`MotorUnmet`). */
  readonly unmet: MotorUnmet;
  /**
   * The centre of mass's height over the soles' middle in the reference pose, m (`standingHeight`):
   * what the body stands at, whatever posture it was built in.
   */
  readonly standing: number;
  /** Whether the body is down (`uprightness`, `src/core/control/ground.ts`): true while it is, false once it is up again. */
  readonly down: boolean;
  /**
   * Current physical ground support while down, released to a sub-mind, or, once down, while the
   * command asks no stance (an action that holds the legs and asks none, `ActionClaim.legs`); null
   * while the host stands.
   */
  readonly ground: GroundReading | null;
  /** Whether a sub-mind had the body until this step: whatever its driver had under way is over. */
  readonly resumed: boolean;
}

/** Where a fist's knuckles are and how they move, in the world, as the last step left them. */
export interface Fist {
  readonly position: Vector3;
  readonly velocity: Vector3;
}

/**
 * The joint servo's time constant, s (`servo`). 0.1 s is a choice, not a floor: the servo holds at
 * time constants down to two steps (`docs/reference/servo-and-muscle.md#holding-a-pose`). Readings
 * at 0.1 s on the lab's routine: `docs/reference/body-and-engine.md#servo-time-constant`.
 */
export const SERVO_SECONDS = 0.1;

/** **What the command layers are made with** (`commandLayers`), beside the body and its clock. */
export interface LayerOptions {
  /** Read each effector's external contacts and striking-point motion into the body's view. */
  readonly feedback?: boolean;
  /** Trusted material contacts of an effector's segment from the last completed step, alongside native solver contacts. */
  readonly contacts?: (segment: string) => readonly EffectorContact[];
  /**
   * The joint servo's time constant, s (`servo`): a goal's error decays as a critically damped
   * motion with natural frequency 1 / servoSeconds.
   */
  readonly servoSeconds: number;
  /** An experiment's stance tuning in place of the stance's constants. */
  readonly stance?: StanceTuning;
  /** The envelope's own measurement (`research/core-stance-envelope.mjs`): the body has none to read yet. */
  readonly measuring?: boolean;
  /** What makes what turns its goals into its muscles' command: its mind's motor (`motorOf`), the whole-body solve (`motorControl`) unless given. */
  readonly motor?: MotorMaker | null;
}

/**
 * **What a body built outside a fight under the command layers takes** (`commandedBody`): their
 * options, the sub-minds they are handed over to, and what a body is given beside its mind
 * (`Embodying`: its senses, the clock alone unless given; its assist's ceiling,
 * `balanceCeiling`, none unless given; its contact labels; where its order sheets are written).
 */
export interface BodyOptions extends LayerOptions, Embodying {
  /** The sub-minds the command layers are handed over to, in rank order (`hosting`): what its mind's config names (`subMindsOf`). None unless given. */
  readonly subs?: readonly SubMindMaker[];
}

/**
 * **What the command layer lacks of a body of `spec`** (`commandLayers`), a sentence, or null where
 * it has all the layer reads: a fist (a hand with knuckles) on each side (`BodyView.fists`), a box
 * sole under each foot for its stance (`BodyView.stance`), and a head its view is centred on
 * (`BodyView.head`). The layer is the humanoid's; a body without these is driven by a mind of its
 * own over its muscles (`BodyHost.take`).
 */
export function commandRefusal(spec: BodySpec): string | null {
  const segment = (name: string) => segmentOf(spec, name), lacks: string[] = [];
  for (const side of ["left", "right"] as const) if (!segment(`hand.${side}`)?.points?.knuckles) lacks.push(`a fist at hand.${side}`);
  for (const side of ["left", "right"] as const) if (segment(`foot.${side}`)?.shape.kind !== "box") lacks.push(`a box sole at foot.${side}`);
  if (!segment("head")) lacks.push("a head");
  return lacks.length ? `the command layer needs ${lacks.join(", ")}` : null;
}

/** Whether a body of `spec` can take a command (`commandRefusal`). */
export function commandable(spec: BodySpec): boolean {
  return commandRefusal(spec) === null;
}
