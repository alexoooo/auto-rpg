import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltSegment } from "./build/build-body.ts";
import type { Assist, AssistCeiling } from "./control/assist.ts";
import { motorControl, type Hand, type MotorControl, type MusclePush, type Pose } from "./control/motor.ts";
import type { StanceGoal, StanceReading } from "./control/stance.ts";
import type { StanceTuning } from "./control/stance-tuning.ts";
import { stanceEnvelope, type StanceEnvelope } from "./control/stance-envelope.ts";
import { embody, type Mind, type OwnBody } from "./mind/mind.ts";
import { clockSenses, NOTHING_SENSED, type Senses } from "./mind/senses.ts";
import type { MuscleDriver } from "./muscle/driver.ts";
import type { Vec3 } from "./spec/quantity.ts";
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
  /**
   * Its memory under its mind, whole (`src/core/state.ts`): the muscles', the assist's, motor
   * control's with the stance's, and the view. Its driver's memory is the driver's to keep.
   */
  readonly state: object;
  /** Hand the body to `driver`, asked for a command each control step; null keeps the last command. */
  drive(driver: BodyDriver | null): void;
  dispose(): void;
}

/**
 * What drives a body: given the view and the step, the command for this step, or null to keep the
 * last. The body keeps the command's goals in its state, and a load writes into whatever of a
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
   * For each hand, where its knuckles go (body frame, `kinematics.ts`) and in what time, or null to
   * give the arm to the posture. A goal equal to the one before keeps its path; another starts a
   * new one from where the knuckles are.
   */
  readonly hands: Readonly<Record<Hand, HandGoal | null>>;
  /** Freedoms driven by their muscles alone, whatever else would own them. */
  readonly pushes: readonly MusclePush[];
  /** Stand on the ground so (`stance.ts`), or null to leave the legs to the posture. */
  readonly stance: StanceGoal | null;
}

interface HandGoal {
  readonly position: Vec3;
  readonly seconds: number;
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
  /** Each hand's knuckles in the body frame, where a hand goal is set. */
  readonly knuckles: Readonly<Record<Hand, Vector3>>;
  /** The head's centre of mass, world: where a strike's range is measured from (`src/core/skills/strike.ts`). */
  readonly head: Vector3;
  /** The centre of mass, the stance's support, and what the stance last asked (`StanceReading`). */
  readonly stance: StanceReading;
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
}

/**
 * **The command layers as a mind**: motor control under a driver that hands it goals
 * (`BodyDriver`). Each step it reads the view, asks the driver for a command, and gives the
 * command to motor control, which writes the muscles.
 */
interface CommandMind extends Mind {
  readonly view: BodyView;
  /** Read the view from the body as it stands, on `senses`. */
  look(senses: Senses): void;
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
  // The view's own fields are the state's: between steps a view shows the step its state is of.
  const state = {
    goals, time: 0, angles,
    fists: { left: fists.left.fist, right: fists.right.fist },
    knuckles: { left: new Vector3(), right: new Vector3() },
    head: head.centre,
    motor: motor.state,
  };
  const view = {
    get time() { return state.time; },
    senses: NOTHING_SENSED,
    angles,
    fists: state.fists,
    knuckles: state.knuckles,
    head: head.centre,
    stance: motor.stance.reading,
  };
  let driver: BodyDriver | null = null;

  const obey = (command: BodyCommand): void => {
    motor.setPosture(command.posture);
    motor.setPushes(command.pushes);
    motor.setStance(command.stance);
    for (const hand of ["left", "right"] as const) {
      const goal = command.hands[hand], was = goals[hand];
      if (!goal) { if (was) motor.release(hand); }
      else if (!was || !sameGoal(goal, was)) motor.reach(hand, goal.position, goal.seconds);
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
      motor.knucklesToRef(hand, view.knuckles[hand]);
    }
    head.update();
    motor.stance.read();
  };
  return {
    name: "command",
    view, look, state,
    drive(next) { driver = next; },
    step(senses, dt) {
      look(senses);
      const next = driver?.(view, dt);
      if (next) obey(next);
      motor.control(muscles, dt);
    },
  };
}

/** `built` in `world`, holding its reference pose until something drives it. */
export function createBody(built: BuiltBody, world: World, options: BodyOptions): Body {
  const sense = options.senses ?? clockSenses(world);
  const { own, mind, state, dispose } = embody(built, world, (body) => commandMind(body, options), sense, options.assist);
  // Before its first step the view is the body as built, where a driver or a run first finds it.
  mind.look(sense());
  return {
    built, muscles: own.muscles, view: mind.view, assist: own.assist, state,
    envelope: !options.measuring && Object.keys(options.stance ?? {}).length === 0 ? stanceEnvelope(built.spec) : null,
    drive: (next) => mind.drive(next),
    dispose,
  };
}

const sameGoal = (a: HandGoal, b: HandGoal): boolean =>
  a.seconds === b.seconds && a.position.every((v, k) => v === b.position[k]);

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
