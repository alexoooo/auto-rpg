import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltSegment } from "./build/build-body.ts";
import type { Assist, AssistCeiling } from "./control/assist.ts";
import { uprightness } from "./control/ground.ts";
import { standingHeight } from "./control/support.ts";
import { rootFrameToRef, type Frame } from "./control/kinematics.ts";
import { motorControl, type EffectorGoal, type MotorControl, type MusclePush, type Pose } from "./control/motor.ts";
import type { StanceGoal, StanceReading } from "./control/stance.ts";
import type { StanceTuning } from "./control/stance-tuning.ts";
import { stanceEnvelope, type StanceEnvelope } from "./control/stance-envelope.ts";
import { hostedBody } from "./mind/hosted.ts";
import type { OwnBody } from "./mind/mind.ts";
import { NOTHING_SENSED, type Senses } from "./mind/senses.ts";
import type { HostMind } from "./mind/sub-mind.ts";
import type { SubMindMaker } from "./mind/sub-minds.ts";
import type { BodyLevel, MuscleDriver } from "./muscle/driver.ts";
import type { World } from "./world.ts";
import type { PhysicalBody } from "./physical-body.ts";
import { centreReading } from "./observation.ts";
import { effectorFeedback, type ContactIdentity, type EffectorContact, type EffectorFeedback } from "./control/effector-feedback.ts";
import type { BodySpec, Side, HandPose } from "./spec/body.ts";

/**
 * **A body, commanded and seen.** One class for every body assembled from a spec: its muscles
 * under motor control (`motorControl`), commanded by goals and read through a view. A body under
 * the command layers (`commandMind`): whoever drives it at this level -- tactics, the lab's
 * routine, a test -- sees the view and hands back a command. A mind may drive muscles itself
 * instead (`embody`, `src/core/mind/mind.ts`).
 *
 * Each control step the body reads its view, asks its driver for a command, and gives the command
 * to motor control, all before the solver step, so a command acts in the step it was made for.
 *
 * The command layers host the body's sub-minds (`BodyOptions.subs`, `hosting`): on a step one of
 * them wants the body the view is read all the same, the driver is not asked, and the sub-mind
 * writes the muscles.
 */
export interface Body extends PhysicalBody {
  readonly built: BuiltBody;
  /** The muscles, for readings (a view of the torques); a driver commands through `drive`. */
  readonly muscles: MuscleDriver;
  /** The view as the last step left it, or as built before the first. */
  readonly view: BodyView;
  /**
   * What the stance was measured to hold with this body (`stance-envelope.ts`), so a driver asks for
   * its fastest walk and not a number; null under a stance tuning other than the core's, which the
   * measurement did not see, or while the envelope is being measured (`BodyOptions.measuring`).
   */
  readonly envelope: StanceEnvelope | null;
  /** Its assist (`Assist`), for its meter; a fight withdraws it. */
  readonly assist: Assist;
  /** The name of the mind that has the body: the command layers', a sub-mind's, or `"nobody"` below `full`. */
  readonly has: string;
  /** How much of itself it runs (`BodyLevel`): its muscles'. */
  readonly level: BodyLevel;
  /** Put it at `level` (`MuscleDriver.setLevel`): below `full` its mind is idled and not stepped. */
  setLevel(level: BodyLevel): void;
  /**
   * Its memory under its mind, whole (`src/core/state.ts`): the muscles', the assist's, who has the
   * body, each sub-mind's, and the command layers' (motor control's with the stance's, and the
   * view). Its driver's memory is the driver's to keep.
   */
  readonly state: object;
  /** Drive each control step; null keeps the command. `released` discards pending driver work on sub-mind takeover or idle. */
  drive(driver: BodyDriver | null, released?: (view: BodyView) => void): void;
  dispose(): void;
}

/** The command layers' ownership label, shared by their host and its readers. */
const COMMAND = "command";

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
type BodyDriver = (view: BodyView, dt: number) => BodyCommand | null;

/**
 * **A command is goals**: a posture for the freedoms nothing else owns, places for the effectors,
 * and the freedoms pushed flat out.
 */
export interface BodyCommand {
  /** A coarse contact configuration; omitted hands retain their pending request. */
  readonly handPoses?: Readonly<Partial<Record<Side, HandPose>>>;
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
  /** Stand on the ground so (`stance.ts`), or null to leave the legs to the posture. */
  readonly stance: StanceGoal | null;
}

/** A command that holds the reference pose. */
const restCommand = (): BodyCommand => ({ posture: {}, pushes: [], stance: null });

/** **What a body shows its driver**, read at the start of each control step from the step before. */
export interface BodyView {
  /**
   * Each effector's named points (`rigidPoints`: a hand's knuckles, the points of what it holds) and
   * turn, in the body frame where its goal is set, with its trusted detached touch when the body
   * reads it (`BodyOptions.feedback`).
   */
  readonly effectors: Readonly<Record<string, { readonly points: Readonly<Record<string, Vector3>>; readonly rotation: Quaternion; readonly feedback?: EffectorFeedback }>>;
  readonly handPoses: Readonly<Record<string, { readonly applied: HandPose; readonly requested: HandPose }>>;
  /** Seconds of the world's clock. */
  readonly time: number;
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
  /** The head's centre of mass, world: where a strike's range is measured from (`src/core/skills/strike.ts`). */
  readonly head: Vector3;
  /** The centre of mass, the stance's support, and what the stance last asked (`StanceReading`). */
  readonly stance: StanceReading;
  /**
   * The centre of mass's height over the soles' middle in the reference pose, m (`standingHeight`):
   * what the body stands at, whatever posture it was built in.
   */
  readonly standing: number;
  /** Whether the body is down (`uprightness`, `src/core/control/ground.ts`): true while it is, false once it is up again. */
  readonly down: boolean;
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

interface BodyOptions {
  /** Read each effector's external contacts and striking-point motion into the body's view. */
  readonly feedback?: boolean;
  /** Trusted labeling for detached contact response; policies receive no engine body. */
  readonly contactIdentity?: ContactIdentity;
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
  /** What this body senses (`SensesHub.add`); the clock alone unless given. */
  readonly senses?: () => Senses;
  /** The most its assist gives it (`balanceCeiling`, `src/core/rules/rulebook.ts`); none unless given: it stands on its muscles. */
  readonly assist?: AssistCeiling;
  /** The sub-minds the command layers hand the body to, in rank order (`hosting`): what its mind's config names (`subMindsOf`). None unless given. */
  readonly subs?: readonly SubMindMaker[];
}

/**
 * **The command layers as a mind**: motor control under a driver that hands it goals
 * (`BodyDriver`). Each step it reads the view (`look`), then asks the driver for a command and
 * gives the command to motor control, which writes the muscles (`act`). It hosts sub-minds
 * (`HostMind`): released, motor control forgets what was under way, so while a sub-mind has the
 * body the view shows no stance asked and the body is down by its standing height; resumed, its
 * driver is told (`BodyView.resumed`).
 */
interface CommandMind extends HostMind {
  readonly view: BodyView;
  /** Drive each control step; null keeps the command. `released` discards pending driver work on sub-mind takeover or idle. */
  drive(driver: BodyDriver | null, released?: (view: BodyView) => void): void;
}

/** The command layers over `own`, holding its reference pose until something drives them. */
export function commandMind(own: OwnBody, { servoSeconds, stance, feedback: feedbackEnabled, contactIdentity, contacts }: BodyOptions): CommandMind {
  const { built, muscles } = own;
  const motor: MotorControl = motorControl(built, servoSeconds, {}, stance, own.assist);
  const feedback = feedbackEnabled ? effectorFeedback(built, motor.effectors.map(e => e.segment), contactIdentity,
    segment => contacts?.(segment) ?? []) : null;
  const fists = { left: fistOf(built, "left"), right: fistOf(built, "right") };
  const head = centreReading(built, "head");
  const angles: Record<string, number> = {};
  const upright = uprightness(built);
  const goals: Record<string, EffectorGoal | null> = Object.fromEntries(motor.effectors.map(e => [e.segment, null]));
  const effectors = Object.fromEntries(motor.effectors.map(e => [e.segment, {
    points: Object.fromEntries(Object.keys(e.points).map(name => [name, new Vector3()])), rotation: new Quaternion(),
    ...(feedback ? { feedback: feedback.state[e.segment]! } : {}),
  }]));
  const inverse = new Quaternion(), segmentTurn = new Quaternion(), rootTurn = new Quaternion();
  // The view's own fields are the state's: between steps a view shows the step its state is of.
  const state = {
    goals, effectors, time: 0, angles,
    fists: { left: fists.left.fist, right: fists.right.fist },
    root: { position: new Vector3(), rotation: new Quaternion() },
    head: head.centre,
    motor: motor.state,
    down: false,
    resumed: false,
  };
  const view = {
    handPoses: built.handPoses.state, effectors,
    get time() { return state.time; },
    senses: NOTHING_SENSED,
    angles,
    fists: state.fists,
    root: state.root,
    head: head.centre,
    stance: motor.stance.reading,
    standing: standingHeight(built),
    get down() { return state.down; },
    get resumed() { return state.resumed; },
  };
  let driver: BodyDriver | null = null;
  let released: ((view: BodyView) => void) | undefined;

  const obey = (command: BodyCommand): void => {
    for (const [segment, goal] of Object.entries(command.effectors ?? {})) {
      if (!(segment in goals)) throw new Error(`no effector ${segment}`);
      if (goal && command.stance?.feet.some(side => segment === `foot.${side}`)) throw new Error(`two controllers own ${segment}`);
    }
    if (command.handPoses) built.handPoses.request(Object.entries(command.handPoses).map(([hand, pose]) => ({ hand: hand as Side, pose: pose! })));
    motor.setPosture(command.posture);
    motor.setPushes(command.pushes);
    motor.setStance(command.stance);
    for (const segment in goals) {
      const goal = command.effectors?.[segment] ?? null, was = goals[segment];
      if (!goal) { if (was) motor.release(segment); }
      else if (!was || !sameGoal(goal, was)) motor.reach(segment, goal);
      goals[segment] = goal;
    }
  };
  obey(restCommand());

  const look = (senses: Senses): void => {
    feedback?.read();
    state.time = senses.time;
    view.senses = senses;
    muscles.channels.forEach((c, i) => { angles[c.name] = muscles.angle(i); });
    fists.left.update();
    fists.right.update();
    rootFrameToRef(motor.root, state.root);
    for (const segment in effectors) {
      const out = effectors[segment]!, part = built.segments.get(segment)!;
      for (const name in out.points) motor.pointToRef(segment, name, out.points[name]!);
      part.node.rotationQuaternion!.multiplyToRef(Quaternion.InverseToRef(part.rest, inverse), segmentTurn);
      Quaternion.InverseToRef(state.root.rotation, rootTurn).multiplyToRef(segmentTurn, out.rotation).normalize();
    }
    head.update();
    motor.stance.read();
    const standing = motor.standing;
    state.down = upright.down(standing?.height, standing?.pose !== undefined);
  };
  const act = (dt: number): void => {
    const next = driver?.(view, dt);
    if (next) obey(next);
    motor.control(muscles, dt);
    state.resumed = false;
  };
  return {
    name: COMMAND,
    view, look, act, state,
    drive(next, onRelease) { driver = next; released = onRelease; },
    step(senses, dt) { look(senses); act(dt); },
    release() {
      released?.(view);
      motor.reset();
      for (const segment in goals) goals[segment] = null;
    },
    resume() { state.resumed = true; },
  };
}

/**
 * Whether a body of `spec` can take a command (`commandMind`): a fist (a hand with knuckles) on
 * each side, a box sole under each foot for its stance, and a head its view is centred on.
 */
export function commandable(spec: BodySpec): boolean {
  const segment = (name: string) => spec.segments.find((s) => s.name === name);
  return (["left", "right"] as const).every((side) => !!segment(`hand.${side}`)?.points?.knuckles && segment(`foot.${side}`)?.shape.kind === "box")
    && segment("head") !== undefined;
}

/** `built` in `world`, holding its reference pose until something drives it. */
export function createBody(built: BuiltBody, world: World, options: BodyOptions): Body {
  let command!: CommandMind;
  const body = hostedBody(built, world, options, (own, sense) => {
    command = commandMind(own, options);
    const subs = (options.subs ?? []).map((make) => make(own, command.view, world));
    // Before its first step the view is the body as built, where a driver or a run first finds it.
    command.look(sense());
    return { host: command, subs, down: () => command.view.down };
  });
  return Object.assign(body, {
    view: command.view,
    envelope: !options.measuring && Object.keys(options.stance ?? {}).length === 0 ? stanceEnvelope(built.spec) : null,
    drive: (next: BodyDriver | null, released?: (view: BodyView) => void) => command.drive(next, released),
  });
}

const sameGoal = (a: EffectorGoal, b: EffectorGoal): boolean =>
  (a.initialVelocity === b.initialVelocity || (a.initialVelocity !== undefined && b.initialVelocity !== undefined
    && a.initialVelocity.every((v, k) => v === b.initialVelocity![k])))
  && (a.terminalVelocity === b.terminalVelocity || (a.terminalVelocity !== undefined && b.terminalVelocity !== undefined
    && a.terminalVelocity.every((v, k) => v === b.terminalVelocity![k])))
  && (a.curve === b.curve || (a.curve !== undefined && b.curve !== undefined && a.curve.every((v, k) => v === b.curve![k])))
  && (a.orientation === b.orientation || (a.orientation !== undefined && b.orientation !== undefined
    && a.orientation.seconds === b.orientation.seconds && a.orientation.target.every((v, k) => v === b.orientation!.target[k])))
  && a.sequence === b.sequence
  && a.seconds === b.seconds && a.through === b.through && a.follows === b.follows && a.places.length === b.places.length
  && a.places.every((place, i) => place.point === b.places[i]!.point && place.position.every((v, k) => v === b.places[i]!.position[k]));

/**
 * The knuckles (`SegmentSpec.points`) of `hand`, where a fist strikes, and their velocity from the
 * hand body's: its centre's (the engine's linear velocity is the centre of mass's), plus its spin
 * across the arm from the centre to the knuckles. Not the segment's far end: the hand segment runs
 * on to the fingertips, where a whip of the wrist would read as a punch. Not differenced from the
 * nodes: the engine moves a body by more than its velocity when it corrects a constraint's error.
 */
function fistOf(built: BuiltBody, side: Side): { fist: Fist; update(): void } {
  const hand: BuiltSegment | undefined = built.segments.get(`hand.${side}`);
  const knuckles = hand?.spec.points?.knuckles;
  if (!hand || !knuckles) throw new Error(`${built.spec.model} has no ${side} hand with knuckles`);
  const { origin, x, y, z } = hand.frame;
  const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  const local = (p: readonly number[]) => { const o = p.map((c, i) => c - origin[i]!); return new Vector3(dot(o, x), dot(o, y), dot(o, z)); };
  // The centre of mass (of the hand and what it holds), and from it to the knuckles, in the hand's own frame.
  const centre = local(hand.rigid.centre);
  const arm = local(knuckles.value).subtractInPlace(centre);
  const lever = new Vector3(), angular = new Vector3();
  const fist: Fist = { position: new Vector3(), velocity: new Vector3() };
  return {
    fist,
    update() {
      const turn = hand.node.rotationQuaternion!;
      arm.applyRotationQuaternionToRef(turn, lever);
      centre.applyRotationQuaternionToRef(turn, fist.position).addInPlace(hand.node.position).addInPlace(lever);
      hand.body.linearVelocityToRef(fist.velocity);
      hand.body.angularVelocityToRef(angular);
      fist.velocity.addInPlace(Vector3.CrossToRef(angular, lever, angular));
    },
  };
}
