import type { StanceGoal, StanceReading } from "./stance/goal.ts";
import type { BodyControl } from "../core/bodies/body-control.ts";
import type { ContactIdentity } from "../core/bodies/contact-identity.ts";
import type { Quaternion, Vector3 } from "../core/math/vector.ts";
import type { AssistReading } from "../core/bodies/assist.ts";
import type { Frame } from "./kinematics.ts";
import type { EffectorGoal, FreedomPath, MotorUnmet, MusclePush, PointTask } from "./motor.ts";
import type { SupportGoal } from "./supported-motor.ts";
import type { Pose } from "../core/bodies/spec/pose.ts";
import type { StanceTuning } from "./stance/stance-tuning.ts";
import type { StanceEnvelope } from "./stance/stance-envelope.ts";

import type { Senses } from "../core/bodies/senses.ts";
import type { BodyLevel, MuscleReading } from "../core/bodies/muscle/driver.ts";
import type { MotorMaker } from "./motor-part.ts";

import type { EffectorContact, EffectorFeedback } from "./effector-feedback.ts";
import type { ConfigurationName } from "../core/bodies/spec/body.ts";
import type { GroundReading } from "./ground-reading.ts";
import type { ReadBody } from "../core/bodies/read-body.ts";

/**
 * **A body, commanded and seen**: the body its drivers have under the command layers
 * (`commandLayers`, `src/minds/motor-layers.ts`), any mind's to build on its own body.
 * Its muscles are under motor control, commanded by goals and read through a view: whoever drives
 * it at this level -- a decider's skills, the lab's routine, a test -- sees the view and hands back
 * a command. A mind may drive muscles itself instead (`Mind`, `src/minds/mind.ts`).
 *
 * Each control step the body reads its view, asks its driver for a command, and gives the command
 * to motor control, all before the solver step, so a command acts in the step it was made for.
 * While a mind that hands its body over (`hosting`) has given it to another, the view is read all
 * the same, the driver is not asked, and the other writes the muscles.
 */
export interface Body {
  readonly dt: number;
  readCommand(out: Pick<BodyControl, "muscles" | "assist">): void;
  readonly built: ReadBody;
  /** The muscles, for readings (a view of the torques); a driver commands through `drive`. */
  readonly muscles: MuscleReading;
  /** The view as the last step left it, or as built before the first. */
  readonly view: BodyView;
  /**
   * What the stance was measured to hold with this body (`stance-envelope.ts`), so a driver asks for
   * its fastest walk and not a number; null under a stance tuning other than the core's, which the
   * measurement did not see, or while the envelope is being measured (`LayerOptions.measuring`).
   */
  readonly envelope: StanceEnvelope | null;
  /** Its assist (`Assist`), for its meter; a fight withdraws it. */
  readonly assist: AssistReading;
  /** The steps between a driver's command and motor control carrying it out (`OwnBody.delay`). */
  readonly delay: number;
  /** What a contact with another physics body is read as (`OwnBody.contactIdentity`), where the body is told; a skill that reads a touch of its own reads it so. */
  readonly contactIdentity?: ContactIdentity;
  /**
   * Drive each control step; null keeps the command. Replaced, a driver's decisions not yet carried
   * out are dropped. `released` discards pending driver work on sub-mind takeover or idle.
   */
  drive(driver: BodyDriver | null, released?: (view: BodyView, reason: "takeover" | "idle" | "replaced") => void): void;
  /** Observe completed physics intervals after effector feedback is sampled, at full level under any holder (`CommandLayers.observe`). */
  afterPhysics(listener: (step: number, time: number) => void): () => void;
}

/** The command layers' ownership label (`MindConstruction.name`), shared by them and their readers (`commandsBody`). */
export const COMMAND = "command";

/** Whether the command layers currently drive this body, rather than a sub-mind or nobody. */
export function commandsBody(body: { readonly has: string; readonly level: BodyLevel }): boolean {
  return body.level === "full" && body.has === COMMAND;
}

/**
 * What drives a body: given the view and the step, the command for this step, or null to keep the
 * last (after a sub-mind had the body, the last is its posture alone). The body keeps the command's goals in its state, and a load writes into whatever of a
 * state is not frozen. So a command, and whatever it holds, is made for the step, or frozen
 * (`deepFreeze`), or part of a state saved and loaded with the body's, as the skills' is
 * (`Skills.state`).
 * A function driver is stateless; a driver that remembers between steps supplies `SplitDriver.state`.
 */
type BodyDriver = ((view: BodyView, dt: number) => BodyCommand | null) | SplitDriver<unknown>;

/**
 * **A driver in two parts**: what it decides on the view as sensed (`decide`), and the command it
 * carries the decision out with on the body as it is (`carry`, null to keep the command). It
 * decides in `think` and carries out the due decision in `act`, on a view whose body is current
 * and whose senses are those the last decision read. A driver that is one function decides its
 * command whole.
 */
export interface SplitDriver<T> {
  /** All memory carried between decisions, saved under the Mind that owns these layers. */
  readonly state: object;
  decide(view: BodyView, dt: number): T;
  carry(view: BodyView, decision: T, dt: number): BodyCommand | null;
}

/**
 * **A command is goals**: a posture for the freedoms nothing else owns, places for the effectors,
 * and the freedoms pushed flat out.
 */
export interface BodyCommand {
  readonly assist?: BodyControl["assist"];
  /** A coarse contact configuration, by the hand's segment; omitted hands retain their pending request. */
  readonly configurations?: Readonly<Partial<Record<string, ConfigurationName>>>;
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
   * Hold the body over the ends it bears on so (`SupportGoal`), for a motor that carries a support
   * (`MotorControl.carries`) in place of a stance; absent or null, none.
   */
  readonly support?: SupportGoal | null;
  /** Freedoms carried along paths (`FreedomPath`), by channel, for a motor that carries them; a freedom named here is not the posture's. */
  readonly paths?: Readonly<Record<string, FreedomPath>>;
  /**
   * With no stance, the centre of mass's height over the ground, m, at which the body is held low
   * on purpose (a kneel): it is down only once that far under it as under its standing height
   * (`Uprightness.down`). Absent, its standing height.
   */
  readonly held?: number;
}

/** **What a body shows its driver**, read at the start of each control step from the step before. */
export interface BodyView {
  /** Every segment's current physical pose, world coordinates. */
  readonly segments: Readonly<Record<string, { readonly position: Vector3; readonly rotation: Quaternion;
    readonly rest: Readonly<Pick<Quaternion, "x" | "y" | "z" | "w">> }>>;
  /**
   * Each effector's named points (`rigidPoints`: a hand's knuckles, the points of what it holds) and
   * turn, in the body frame where its goal is set, with its trusted detached touch when the body
   * reads it (`LayerOptions.feedback`).
   */
  readonly effectors: Readonly<Record<string, { readonly points: Readonly<Record<string, Vector3>>; readonly rotation: Quaternion; readonly feedback?: EffectorFeedback }>>;
  /** Each configurable segment: its applied configuration and the one last requested. */
  readonly configurations: Readonly<Record<string, { readonly applied: ConfigurationName; readonly requested: ConfigurationName }>>;
  /** Seconds of the world's clock. */
  readonly time: number;
  /**
   * Seconds of the world's clock at the body's first view, as it was built, that a command is made
   * on: at a delay, the first step its driver's decision is carried out. Where its own time starts,
   * so a body behaves the same in a world that has run before it, and what it takes at birth (the
   * legs' heading, `locomotion`) it takes from the body as it was built.
   */
  readonly born: number;
  /** What the body senses of the world this step (`Senses`): the clock, its side, and every other body. */
  readonly senses: Senses;
  /** Each freedom's angle, rad, by channel name (`jointAngles`). */
  readonly angles: Readonly<Record<string, number>>;
  /** Each effector's named points in the world, and their rigid-body velocities. */
  readonly pointMotion: Readonly<Record<string, Readonly<Record<string, PointMotion>>>>;
  /**
   * The body frame in the world, as the last step left it: the root segment's place and turn
   * (`rootFrameToRef`), the frame an effector's goal is set in. A world point is brought into it with
   * `intoFrameToRef`.
   */
  readonly root: Frame;
  /** The head's centre of mass, world, the segment another body aims high at (`BodySpec.marks`): where a strike's reach is measured from (`placedReach`, `src/skills/reach/arm-reach.ts`). */
  readonly head: Vector3;
  /** The centre of mass, the stance's support, and what the stance last asked (`StanceReading`). */
  readonly stance: StanceReading;
  /** What the motor did not carry out of the last step's command (`MotorUnmet`). */
  readonly unmet: MotorUnmet;
  /**
   * The centre of mass's height over the soles' middle in the reference pose, m (`standingHeight`):
   * what the body stands at, whatever posture it was built in.
   */
  readonly standing: number | null;
  /** Whether the body is down (`uprightness`, `src/control/ground.ts`): true while it is, false once it is up again. */
  readonly down: boolean;
  /**
   * Current physical ground support while down, released to a sub-mind, or, once down, while the
   * command asks no stance (an action that holds the legs and asks none, `ActionClaim.legs`); null
   * while the host stands.
   */
  readonly ground: GroundReading | null;
  /** Whether a sub-mind had the body until this step: whatever its driver had under way is over. */
  readonly resumed: boolean;
  /** What the body reads once a step for all its callers (`StepReading`). */
  readonly reading: StepReading;
}

/**
 * **What a body's readings are kept by**: an answer every caller shares while what it was read
 * from stands (a foe's colliders, `stepObstacle`; an opening, `SURFACE_AIM`), kept by its reader
 * against this reading's stamp (`commandLayers`). It carries nothing from one step to the next, so
 * it is no state.
 */
export interface StepReading {
  /**
   * A count that moves wherever the body's view may have: at each look, after each command and
   * after each physics step. An answer kept from another count is stale; one read of a foe is
   * stale too once that foe's observation time (`BodySense.time`) moves, as the senses show it again.
   */
  readonly stamp: number;
}

/** Where a named point is and how it moves in the world, as the last step left it. */
export interface PointMotion {
  readonly position: Vector3;
  readonly velocity: Vector3;
}

/**
 * The joint servo's time constant, s (`servo`): twelve steps at 120 Hz, a choice, not the servo's
 * floor.
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
  /** The envelope's own measurement (`research/skills/locomotion/stance/stance-envelope.mjs`): the body has none to read yet. */
  readonly measuring?: boolean;
  /** The configured motor and its implementation-owned calibration (`motorOf`). */
  readonly motor: MotorMaker;
}

/** Research overrides for the command layers: stance tuning and envelope measurement. */
export type Experiment = Pick<LayerOptions, "stance" | "measuring">;
