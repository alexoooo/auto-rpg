import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body } from "../core/body.ts";
import type { StancePhase } from "../core/control/stance.ts";
import { GUARD_ACTION, type Intent } from "../core/mind/intent.ts";
import type { Tactics } from "../core/mind/tactics.ts";
import { STANCE_LOWER } from "../core/skills/locomotion.ts";
import type { Actor } from "./actor.ts";

/**
 * **The lab's stance mode**: a human on its own feet under the core stance
 * (`src/core/control/stance.ts`), commanded live from the page. The page's keys are its tactics
 * (`stanceTactics`): what a person gives it is an intent, as any tactics' -- a walk (a velocity across
 * the ground, in the body's own frame), a turn and a height, the hands guarding -- which the skills
 * carry out (`src/core/skills/skills.ts`). The stance does the rest: its steps, and the steps that
 * catch a push.
 *
 * **It turns only while it walks**, at `LAB_TURN_RATE`, and not for `TURN_LEAD` after it sets
 * off, as the locomotion skill turns any body: each step of a walk lands its foot facing the
 * heading, so the feet come round with the pelvis. Standing, the heading holds: the stance has no
 * step that turns it on the spot, and a pelvis turned a quarter over planted feet falls.
 *
 * A shove is the page's instrument, not a command: an impulse at the middle trunk's centre of
 * mass, level, as the shove sweep gives it (`STANCE_RECOVERY`), applied before the next solver step.
 *
 * This module has no page-only imports, so the Node stand can run it (`tests/lab-stance.test.mjs`).
 */

/** What the page asks of the stance; the page writes it, the stance reads it every control step. */
interface StanceOrders {
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
  /** Whether it is down (`BodyView.down`): its centre 25 cm under the goal's height. */
  readonly fallen: boolean;
}

interface StanceSession {
  readonly body: Body;
  readonly orders: StanceOrders;
  /** Shove the middle trunk by `impulse` N s, level, `degrees` about up from the heading (90 to its right). */
  shove(impulse: number, degrees: number): void;
  frame(): StanceFrame;
  /** Where the capture point is over the ground (x, z), world: the centre plus its velocity over omega. */
  capturePointToRef(out: Vector3): Vector3;
  dispose(): void;
}

/** The orders a session starts with: standing, not turning, the lab's height (`STANCE_LOWER`). */
const restOrders = (): StanceOrders => ({ forward: 0, right: 0, turn: 0, lower: STANCE_LOWER });

/**
 * How fast the Stance scenario's Q and E turn the heading while walking, rad/s, and the shuttle's
 * half-turns' radius with the Routine's pace (`track.ts`): a lab setting, not the stance's. It is
 * inside every body's envelope at the Routine's pace (`turnAt`, `Body.envelope`,
 * `tests/core-stance-envelope.test.mjs`); walking faster, Q and E turn no faster than the body held
 * at that walk.
 */
export const LAB_TURN_RATE = 1;

/**
 * **The page's keys as tactics**: `orders`, as the page last wrote them, made an intent each
 * control step. Walking, it asks to face `LAB_TURN_RATE` a second further round than the body's
 * heading, the way the keys turn; the locomotion skill turns no faster than the body's envelope at
 * its walk, and not for `TURN_LEAD` after it sets off.
 */
function stanceTactics(orders: StanceOrders): Tactics {
  const hands = { left: GUARD_ACTION, right: GUARD_ACTION };
  return {
    name: "keys",
    decide({ report }, dt): Intent {
      const walking = orders.forward !== 0 || orders.right !== 0;
      return {
        move: walking ? [orders.forward, orders.right] : null,
        face: report.heading + orders.turn * LAB_TURN_RATE * dt,
        hands,
        lower: orders.lower,
      };
    },
  };
}

/** Stand `actor`'s body, a human in its reference pose on the ground, facing +z, on its feet, driven by the page's orders. */
export function startStance(actor: Actor): StanceSession {
  const { body, world } = actor, built = body.built;
  const trunk = built.segments.get("middleTrunk");
  if (!trunk) throw new Error(`${built.spec.model} has no middle trunk to shove`);
  const orders = restOrders();
  const { report } = actor.drive(stanceTactics(orders));
  let shove: Vector3 | null = null;
  const turn = new Quaternion(), at = new Vector3();
  // After the body's control, before the solver: the page's hand on the world, not the body's.
  const shoving = world.beforeStep(() => {
    if (!shove) return;
    trunk.node.rotationQuaternion!.multiplyToRef(Quaternion.Inverse(trunk.rest), turn);
    const com = trunk.rigid.centre, o = trunk.frame.origin;
    at.set(com[0] - o[0], com[1] - o[1], com[2] - o[2]).applyRotationQuaternionToRef(turn, at).addInPlace(trunk.node.position);
    trunk.body.applyImpulse(shove, at);
    shove = null;
  });

  const frame = (): StanceFrame => {
    const s = body.view.stance, height = s.centre.y - s.support.y;
    return {
      time: body.view.time, heading: report.heading, phase: s.phase, strides: s.strides, recoveries: s.recoveries,
      speed: Math.hypot(s.velocity.x, s.velocity.z), height, goal: report.reference === null ? height : report.reference - orders.lower,
      off: Math.hypot(s.centre.x - s.place.x, s.centre.z - s.place.z), fallen: body.view.down,
    };
  };

  return {
    body, orders, frame,
    shove(impulse, degrees) {
      const a = report.heading + degrees * Math.PI / 180;
      shove = new Vector3(impulse * Math.sin(a), 0, impulse * Math.cos(a));
    },
    capturePointToRef(out) {
      const g = -world.physics.gravity[1];
      const s = body.view.stance, w = Math.sqrt(g / Math.max(s.centre.y - s.support.y, 0.1));
      return out.set(s.centre.x + s.velocity.x / w, 0, s.centre.z + s.velocity.z / w);
    },
    dispose() {
      shoving.dispose();
      actor.dispose();
    },
  };
}
