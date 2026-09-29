import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltSegment } from "./build/build-body.ts";
import { motorControl, type Hand, type MotorControl, type MusclePush, type Pose } from "./control/motor.ts";
import type { StanceGoal, StanceReading, StanceTuning } from "./control/stance.ts";
import { driveMuscles, type MuscleDriver } from "./muscle/driver.ts";
import type { Vec3 } from "./spec/quantity.ts";
import type { World } from "./world.ts";

/**
 * **A body, commanded and seen.** One class for every body assembled from a spec: its muscles
 * (`driveMuscles`) under motor control (`motorControl`), commanded by goals and read through a
 * view. Whoever drives it -- a mind, the lab's routine, a test -- sees only the view and hands back
 * only a command; nothing reaches past the command to a joint or a muscle.
 *
 * Each control step the body reads its view, asks its driver for a command, and gives the command
 * to motor control, all before the solver step, so a command acts in the step it was made for.
 */
export interface CoreBody {
  readonly built: BuiltBody;
  /** The muscles, for readings (a view of the torques); a driver commands through `drive`. */
  readonly muscles: MuscleDriver;
  /** The view as the last step left it. */
  readonly view: BodyView;
  /** Hand the body to `driver`, asked for a command each control step; null keeps the last command. */
  drive(driver: BodyDriver | null): void;
  dispose(): void;
}

/** What drives a body: given the view and the step, the command for this step, or null to keep the last. */
export type BodyDriver = (view: BodyView, dt: number) => BodyCommand | null;

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

export interface HandGoal {
  readonly position: Vec3;
  readonly seconds: number;
}

/** A command that holds the reference pose. */
export const restCommand = (): BodyCommand => ({ posture: {}, hands: { left: null, right: null }, pushes: [], stance: null });

/** **What a body shows its driver**, read at the start of each control step from the step before. */
export interface BodyView {
  /** Seconds of the world's clock. */
  readonly time: number;
  /** Each freedom's angle, rad, by channel name (`jointAngles`). */
  readonly angles: Readonly<Record<string, number>>;
  /** Each hand's knuckles in the world: where a fist strikes, and how fast. */
  readonly fists: Readonly<Record<Hand, Fist>>;
  /** Each hand's knuckles in the body frame, where a hand goal is set. */
  readonly knuckles: Readonly<Record<Hand, Vector3>>;
  /** The centre of mass, the stance's support, and what the stance last asked (`StanceReading`). */
  readonly stance: StanceReading;
}

/** Where a fist's knuckles are and how they move, in the world, as the last step left them. */
export interface Fist {
  readonly position: Vector3;
  readonly velocity: Vector3;
}

export interface BodyOptions {
  /** The servo's time constant, s: ten steps or more (`servo`). */
  readonly servoSeconds: number;
  /** An experiment's stance tuning in place of the stance's constants. */
  readonly stance?: StanceTuning;
}

/** `built` in `world`, holding its reference pose until something drives it. */
export function createBody(built: BuiltBody, world: World, { servoSeconds, stance }: BodyOptions): CoreBody {
  const motor: MotorControl = motorControl(built, servoSeconds, {}, stance);
  const fists = { left: fistOf(built, "left"), right: fistOf(built, "right") };
  const angles: Record<string, number> = {};
  const view = {
    time: 0,
    angles,
    fists: { left: fists.left.fist, right: fists.right.fist },
    knuckles: { left: new Vector3(), right: new Vector3() },
    stance: motor.stance.reading,
  };
  let driver: BodyDriver | null = null;
  const current: { command: BodyCommand } = { command: restCommand() };
  const goals: Record<Hand, HandGoal | null> = { left: null, right: null };

  const obey = (command: BodyCommand): void => {
    current.command = command;
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
  obey(current.command);

  const muscles = driveMuscles(built, world, (d, dt) => {
    view.time = world.time;
    d.channels.forEach((c, i) => { angles[c.name] = d.angle(i); });
    for (const hand of ["left", "right"] as const) {
      fists[hand].update();
      motor.knucklesToRef(hand, view.knuckles[hand]);
    }
    motor.stance.read();
    const next = driver?.(view, dt);
    if (next) obey(next);
    motor.control(d, dt);
  });

  return {
    built, muscles, view,
    drive(next) { driver = next; },
    dispose() { muscles.dispose(); },
  };
}

const sameGoal = (a: HandGoal, b: HandGoal): boolean =>
  a.seconds === b.seconds && a.position.every((v, k) => v === b.position[k]);

/**
 * The knuckles (`SegmentSpec.points`) of `hand`, where a fist strikes, and their velocity from the
 * hand body's: its centre's, plus its spin across the arm from the centre to the knuckles (the
 * engine's linear velocity is the centre of mass's, Rapier's as Havok's, H49). The hand segment
 * runs on to the fingertips, more than twice as far from the wrist, and a fist read there took a
 * whip of the wrist as a punch: a searched blow's 11.6 m/s had 5.0 of its wrist's (Node stand,
 * 120 Hz, Havok). Not from the nodes: the engine moves a body by more than its velocity when it
 * corrects a constraint's error. On Havok, after a limit's impulse, a fist read from the nodes
 * jumped from 6.7 to 11.4 m/s for one step as the elbow met its stop; on Rapier a standing
 * Warrior's foot moved 0.087 mm a step while its velocity carried it 0.0007 (Node stand, 120 Hz).
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
