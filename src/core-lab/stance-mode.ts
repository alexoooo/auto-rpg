import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, type BodyCommand, type CoreBody } from "../core/body.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { StanceGoal, StancePhase } from "../core/control/stance.ts";
import type { Pose } from "../core/control/motor.ts";
import type { World } from "../core/world.ts";
import { GUARD, SERVO_SECONDS } from "./routine.ts";

/**
 * **The core lab's stance mode**: a human on its own feet under the core stance
 * (`src/core/control/stance.ts`), commanded live from the page. What a person gives it is what a
 * mind would: a walk (a velocity across the ground, in the body's own frame), a turn and a height.
 * The stance does the rest -- its steps, and the steps that catch a push. The arms are held at the
 * guard.
 *
 * **It turns only while it walks**, at `LAB_TURN_RATE`: each step of a walk lands its foot facing
 * the heading, so the feet come round with the pelvis. Standing, the heading holds: the stance has
 * no step that turns it on the spot, and a pelvis turned a quarter over planted feet fell.
 *
 * A shove is the page's instrument, not a command: an impulse at the middle trunk's centre of
 * mass, level, as the shove sweep gives it (`STANCE_RECOVERY`), applied at the start of the next
 * control step.
 *
 * This module has no page-only imports, so the Node stand can run it (`tests/core-lab.test.mjs`).
 */

/** What the page asks of the stance; the page writes it, the stance reads it every control step. */
export interface StanceOrders {
  /** The walk's velocity, m/s: along the heading, and to its right. Zero stands. */
  forward: number;
  right: number;
  /** Turning while walking: -1 to the left, 1 to the right, 0 not. */
  turn: -1 | 0 | 1;
  /** How far under its reference height the centre of mass is held, m. */
  lower: number;
}

/** What the page shows of the stance, as the last control step left it. */
export interface StanceFrame {
  readonly time: number;
  /** The pelvis's heading, rad about up; 0 faces +z as the reference pose does, and it grows to the right. */
  readonly heading: number;
  readonly phase: StancePhase;
  /** Steps taken to walk, and to catch a push, since the session began. */
  readonly strides: number;
  readonly recoveries: number;
  /** The centre of mass's speed across the ground, m/s. */
  readonly speed: number;
  /** The centre of mass's height over the soles, m, and the goal's. */
  readonly height: number;
  readonly goal: number;
  /** The centre of mass's distance from the place the stance holds it toward, m (across the ground). */
  readonly off: number;
  /** Whether it has fallen: its centre 25 cm under the goal's height. */
  readonly fallen: boolean;
}

export interface StanceSession {
  readonly body: CoreBody;
  readonly orders: StanceOrders;
  /** Shove the middle trunk by `impulse` N s, level, `degrees` about up from the heading (90 to its right). */
  shove(impulse: number, degrees: number): void;
  frame(): StanceFrame;
  /** Where the capture point is over the ground (x, z), world: the centre plus its velocity over omega. */
  capturePointToRef(out: Vector3): Vector3;
  dispose(): void;
}

/**
 * The orders a session starts with: standing, not turning, 3 cm under the reference height. The
 * page leaves the height there: asked 8, 12 or 16 cm lower, each human stood about 1 cm lower,
 * and walking and stopping from there fell (Node stand, 120 Hz), so a crouch is not the stance's yet.
 */
export const restOrders = (): StanceOrders => ({ forward: 0, right: 0, turn: 0, lower: 0.03 });

/**
 * How fast the heading turns while walking, rad/s: a lab setting, not the stance's. Walking at
 * 0.3 m/s and turned half round at 0.25, 0.5, 1 and 2 rad/s, each human held every one and went the
 * new way (Node stand, 120 Hz).
 */
export const LAB_TURN_RATE = 1;

/** Stand `built`, a human in its reference pose on the ground, facing +z, on its feet. */
export function startStance(built: BuiltBody, world: World, { guard = true }: { readonly guard?: boolean } = {}): StanceSession {
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS });
  const trunk = built.segments.get("middleTrunk");
  if (!trunk) throw new Error(`${built.spec.model} has no middle trunk to shove`);
  const orders = restOrders();
  let reference: number | null = null, shove: Vector3 | null = null, fallen = false, heading = 0;
  const posture: Pose = guard ? { ...GUARD } : {};
  const command: { -readonly [K in keyof BodyCommand]: BodyCommand[K] } =
    { posture, hands: { left: null, right: null }, pushes: [], stance: null };
  const turn = new Quaternion(), at = new Vector3();

  body.drive((view, dt) => {
    const s = view.stance;
    // The reference height is read from the first view, when the body stands as built.
    if (reference === null) {
      if (view.time <= 0) return command;
      reference = s.centre.y - s.support.y;
    }
    if (shove) {
      trunk.node.rotationQuaternion!.multiplyToRef(Quaternion.Inverse(trunk.rest), turn);
      const com = trunk.rigid.centre, o = trunk.frame.origin;
      at.set(com[0] - o[0], com[1] - o[1], com[2] - o[2]).applyRotationQuaternionToRef(turn, at).addInPlace(trunk.node.position);
      trunk.body.applyImpulse(shove, at);
      shove = null;
    }
    const walking = orders.forward !== 0 || orders.right !== 0;
    if (walking) heading += orders.turn * LAB_TURN_RATE * dt;
    const h = heading, height = reference - orders.lower;
    // Forward is (sin h, cos h) across the ground; the right, (cos h, -sin h).
    const vx = orders.forward * Math.sin(h) + orders.right * Math.cos(h), vz = orders.forward * Math.cos(h) - orders.right * Math.sin(h);
    const goal: StanceGoal = { feet: ["left", "right"], centre: null, height, heading: h, walk: walking ? [vx, vz] : null };
    fallen ||= height - (s.centre.y - s.support.y) > 0.25;
    command.stance = goal;
    return command;
  });

  const frame = (): StanceFrame => {
    const s = body.view.stance, height = s.centre.y - s.support.y;
    return {
      time: body.view.time, heading, phase: s.phase, strides: s.strides, recoveries: s.recoveries,
      speed: Math.hypot(s.velocity.x, s.velocity.z), height, goal: reference === null ? height : reference - orders.lower,
      off: Math.hypot(s.centre.x - s.place.x, s.centre.z - s.place.z), fallen,
    };
  };

  return {
    body, orders, frame,
    shove(impulse, degrees) {
      const a = heading + degrees * Math.PI / 180;
      shove = new Vector3(impulse * Math.sin(a), 0, impulse * Math.cos(a));
    },
    capturePointToRef(out) {
      const g = -(world.scene.getPhysicsEngine()?.gravity.y ?? 0);
      const s = body.view.stance, w = Math.sqrt(g / Math.max(s.centre.y - s.support.y, 0.1));
      return out.set(s.centre.x + s.velocity.x / w, 0, s.centre.z + s.velocity.z / w);
    },
    dispose: () => body.dispose(),
  };
}
