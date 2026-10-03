import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltSegment } from "./build/build-body.ts";
import { rigidPoints } from "./build/rigid.ts";
import type { Assist, AssistCeiling } from "./control/assist.ts";
import { uprightness } from "./control/ground.ts";
import { rootFrameToRef, type Frame } from "./control/kinematics.ts";
import { motorControl, type Hand, type HandGoal, type MotorControl, type MusclePush, type Pose } from "./control/motor.ts";
import type { StanceGoal, StanceReading } from "./control/stance.ts";
import type { StanceTuning } from "./control/stance-tuning.ts";
import { stanceEnvelope, type StanceEnvelope } from "./control/stance-envelope.ts";
import { embody, type OwnBody } from "./mind/mind.ts";
import { clockSenses, NOTHING_SENSED, type Senses } from "./mind/senses.ts";
import { hosting, type HostMind } from "./mind/sub-mind.ts";
import type { SubMindMaker } from "./mind/sub-minds.ts";
import type { BodyLevel, MuscleDriver } from "./muscle/driver.ts";
import type { World } from "./world.ts";

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
export interface Body {
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
  /** Hand the body to `driver`, asked for a command each control step; null keeps the last command. */
  drive(driver: BodyDriver | null): void;
  dispose(): void;
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
 * **A command is goals**: a posture for the freedoms nothing else owns, a place for each hand, and
 * the freedoms pushed flat out.
 */
export interface BodyCommand {
  /** Angles by channel; a freedom not named is held at its reference angle. */
  readonly posture: Pose;
  /**
   * For each hand, where named points of its rigid body go (body frame, `BodyView.root`) and in
   * what time (`HandGoal`), or null to give the arm to the posture. A goal equal to the one before
   * keeps its path, as does one that follows it (`HandGoal.follows`); another starts a new one
   * from where the points are.
   */
  readonly hands: Readonly<Record<Hand, HandGoal | null>>;
  /** Freedoms driven by their muscles alone, whatever else would own them. */
  readonly pushes: readonly MusclePush[];
  /** Stand on the ground so (`stance.ts`), or null to leave the legs to the posture. */
  readonly stance: StanceGoal | null;
}

/** A command that holds the reference pose. */
const restCommand = (): BodyCommand => ({ posture: {}, hands: { left: null, right: null }, pushes: [], stance: null });

/** **What a body shows its driver**, read at the start of each control step from the step before. */
export interface BodyView {
  /** Seconds of the world's clock. */
  readonly time: number;
  /** What the body senses of the world this step (`Senses`): the clock, its side, and every other body. */
  readonly senses: Senses;
  /** Each freedom's angle, rad, by channel name (`jointAngles`). */
  readonly angles: Readonly<Record<string, number>>;
  /** Each hand's knuckles in the world: where a fist strikes, and how fast. */
  readonly fists: Readonly<Record<Hand, Fist>>;
  /**
   * Each named point of each hand's rigid body (`rigidPoints`: its knuckles, the points of what
   * it holds), by name, in the body frame, where a hand goal is set.
   */
  readonly points: Readonly<Record<Hand, Readonly<Record<string, Vector3>>>>;
  /**
   * The body frame in the world, as the last step left it: the root segment's place and turn
   * (`rootFrameToRef`), the frame a hand goal is set in. A world point is brought into it with
   * `intoFrameToRef`.
   */
  readonly root: Frame;
  /** The head's centre of mass, world: where a strike's range is measured from (`src/core/skills/strike.ts`). */
  readonly head: Vector3;
  /** The centre of mass, the stance's support, and what the stance last asked (`StanceReading`). */
  readonly stance: StanceReading;
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
  /** Hand the body to `driver`, asked for a command each control step; null keeps the last command. */
  drive(driver: BodyDriver | null): void;
}

/** The command layers over `own`, holding its reference pose until something drives them. */
export function commandMind(own: OwnBody, { servoSeconds, stance }: BodyOptions): CommandMind {
  const { built, muscles } = own;
  const motor: MotorControl = motorControl(built, servoSeconds, {}, stance, own.assist);
  const fists = { left: fistOf(built, "left"), right: fistOf(built, "right") };
  const head = centreOf(built, "head");
  const angles: Record<string, number> = {};
  const goals: Record<Hand, HandGoal | null> = { left: null, right: null };
  const upright = uprightness(built);
  // The view's own fields are the state's: between steps a view shows the step its state is of.
  const state = {
    goals, time: 0, angles,
    fists: { left: fists.left.fist, right: fists.right.fist },
    points: { left: pointsOf(built, "left"), right: pointsOf(built, "right") },
    root: { position: new Vector3(), rotation: new Quaternion() },
    head: head.centre,
    motor: motor.state,
    down: false,
    resumed: false,
  };
  const view = {
    get time() { return state.time; },
    senses: NOTHING_SENSED,
    angles,
    fists: state.fists,
    points: state.points,
    root: state.root,
    head: head.centre,
    stance: motor.stance.reading,
    get down() { return state.down; },
    get resumed() { return state.resumed; },
  };
  let driver: BodyDriver | null = null;

  const obey = (command: BodyCommand): void => {
    motor.setPosture(command.posture);
    motor.setPushes(command.pushes);
    motor.setStance(command.stance);
    for (const hand of ["left", "right"] as const) {
      const goal = command.hands[hand], was = goals[hand];
      if (!goal) { if (was) motor.release(hand); }
      else if (!was || !sameGoal(goal, was)) motor.reach(hand, goal);
      goals[hand] = goal;
    }
  };
  obey(restCommand());

  const look = (senses: Senses): void => {
    state.time = senses.time;
    view.senses = senses;
    muscles.channels.forEach((c, i) => { angles[c.name] = muscles.angle(i); });
    for (const hand of ["left", "right"] as const) {
      fists[hand].update();
      for (const name in view.points[hand]) motor.pointToRef(hand, name, view.points[hand][name]!);
    }
    rootFrameToRef(motor.root, state.root);
    head.update();
    motor.stance.read();
    // Down is read against the height the body is asked to hold: held low on purpose, it is not down.
    state.down = upright.down(motor.standing?.height);
  };
  const act = (dt: number): void => {
    const next = driver?.(view, dt);
    if (next) obey(next);
    motor.control(muscles, dt);
    state.resumed = false;
  };
  return {
    name: "command",
    view, look, act, state,
    drive(next) { driver = next; },
    step(senses, dt) { look(senses); act(dt); },
    release() {
      motor.reset();
      goals.left = null;
      goals.right = null;
    },
    resume() { state.resumed = true; },
  };
}

/** `built` in `world`, holding its reference pose until something drives it. */
export function createBody(built: BuiltBody, world: World, options: BodyOptions): Body {
  const sense = options.senses ?? clockSenses(world);
  let command!: CommandMind;
  const { own, mind, state, dispose } = embody(built, world, (body) => {
    command = commandMind(body, options);
    return hosting(command, (options.subs ?? []).map((make) => make(body, command.view)));
  }, sense, options.assist);
  // Before its first step the view is the body as built, where a driver or a run first finds it.
  command.look(sense());
  return {
    built, muscles: own.muscles, view: command.view, assist: own.assist, state,
    get has() { return mind.has; },
    get level() { return own.muscles.level; },
    setLevel: (level) => own.muscles.setLevel(level),
    envelope: !options.measuring && Object.keys(options.stance ?? {}).length === 0 ? stanceEnvelope(built.spec) : null,
    drive: (next) => command.drive(next),
    dispose,
  };
}

const sameGoal = (a: HandGoal, b: HandGoal): boolean =>
  a.seconds === b.seconds && a.through === b.through && a.follows === b.follows && a.places.length === b.places.length
  && a.places.every((place, i) => place.point === b.places[i]!.point && place.position.every((v, k) => v === b.places[i]!.position[k]));

/** A vector for each named point of `hand`'s rigid body (`rigidPoints`). */
function pointsOf(built: BuiltBody, hand: Hand): Record<string, Vector3> {
  const segment = built.segments.get(`hand.${hand}`);
  if (!segment) throw new Error(`${built.spec.model} has no ${hand} hand`);
  return Object.fromEntries([...rigidPoints(built.spec, segment.spec).keys()].map((name) => [name, new Vector3()]));
}

/** Where `name`'s rigid body's centre of mass is, world, as the last step left it. */
function centreOf(built: BuiltBody, name: string): { centre: Vector3; update(): void } {
  const segment = built.segments.get(name);
  if (!segment) throw new Error(`${built.spec.model} has no ${name}`);
  const { origin, x, y, z } = segment.frame, c = segment.rigid.centre;
  const d = [c[0] - origin[0], c[1] - origin[1], c[2] - origin[2]];
  const local = new Vector3(...[x, y, z].map((a) => d[0]! * a[0]! + d[1]! * a[1]! + d[2]! * a[2]!) as [number, number, number]);
  const centre = new Vector3();
  return {
    centre,
    update() { local.applyRotationQuaternionToRef(segment.node.rotationQuaternion!, centre).addInPlace(segment.node.position); },
  };
}

/**
 * The knuckles (`SegmentSpec.points`) of `hand`, where a fist strikes, and their velocity from the
 * hand body's: its centre's (the engine's linear velocity is the centre of mass's), plus its spin
 * across the arm from the centre to the knuckles. Not the segment's far end: the hand segment runs
 * on to the fingertips, where a whip of the wrist would read as a punch. Not differenced from the
 * nodes: the engine moves a body by more than its velocity when it corrects a constraint's error.
 */
function fistOf(built: BuiltBody, side: Hand): { fist: Fist; update(): void } {
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
