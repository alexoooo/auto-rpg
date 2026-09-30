import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS, type BodyCommand, type CoreBody } from "../core/body.ts";
import type { BuiltBody, BuiltSegment } from "../core/build/build-body.ts";
import type { MusclePush, Pose } from "../core/control/motor.ts";
import type { Vec3 } from "../core/spec/quantity.ts";
import type { World } from "../core/world.ts";
import { GUARD } from "../core/skills/guard.ts";
import { stanceLegs } from "../core/skills/locomotion.ts";

/**
 * **One blow, thrown standing**: the rig the strike searches throw their blows on
 * (`research/core-strike.mjs`, `research/core-club-strike.mjs`), and the lab's Blow scenario
 * (`blow-scenario.ts`) with them. A core human (`src/core/body.ts`) stands on its own feet under
 * the stance (`stanceLegs`, `src/core/skills/locomotion.ts`), facing +z, on both feet where it
 * was built. Its arms are servoed to the guard for `STAND` seconds, then it throws the blow: the strike's chamber
 * pose, held for its time, then its pushes, timed from the chamber's end. Every freedom not pushed
 * is servoed to the guard or the chamber, and the legs stay the stance's throughout. Every torque
 * is a muscle's, the legs' included, so a blow is thrown from the feet: the trunk turns against a
 * body standing on the ground, not a pelvis held still.
 *
 * **It does not step into a stance first.** The lab's routine sets its right foot 0.3 m across and
 * 0.15 behind before its straights, but that step does not converge with the rate. At 1920 Hz the
 * bearing foot slid 15 cm toward the swinging one in the swing's last 60 ms and the body staggered
 * at up to 1.4 m/s; 4 cm at 480 Hz; none at 120 Hz (the Warrior, Node core stand). Standing where
 * it was built converges: the centre of mass's speed, mm/s, by the seconds stood (Node core stand):
 *
 *     seconds                0.5   1    1.5   2
 *     Warrior 120 Hz          62   19    5    1
 *             480 Hz          66   20    5    1
 *             1920 Hz         67   20    5    1
 *     Rogue   120 Hz          43   14    3    0
 *             480 Hz          52   15    3    1
 *             1920 Hz         52   15    3    0
 */

/** Seconds stood before the blow: the first of the table's at which each human is at 5 mm/s or less. */
export const STAND = 1.5;

/** A push of a blow: `channel` driven its `sense` way at `level`, from `from` to `to` s after the chamber. */
export interface StrikePush {
  readonly channel: string;
  readonly sense: 1 | -1;
  readonly from: number;
  readonly to: number;
  /** Of the muscle's full activation; 1 if not given. */
  readonly level?: number;
}

/** A blow: a chamber pose held for its time, then pushes. */
export interface Strike {
  readonly name: string;
  readonly hand: "left" | "right";
  readonly chamber?: { readonly seconds: number; readonly pose: Pose };
  readonly pushes: readonly StrikePush[];
}

export interface ThrownBlow {
  readonly body: CoreBody;
  /** When the pushes begin, s from the start. */
  readonly pushing: number;
  /** The control steps taken, s. */
  readonly time: number;
  /** Whether the body has fallen at any step since it began. */
  readonly fallen: boolean;
  dispose(): void;
}

/**
 * Throw `strike` with `built`, a human in its reference pose at the origin facing +z, in `world`.
 * `time` counts the control steps taken, s; the chamber begins at `STAND` and the pushes at
 * `pushing`.
 */
export function throwBlow(built: BuiltBody, world: World, strike: Strike): ThrownBlow {
  const legs = stanceLegs();
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS });
  const chamber = strike.chamber ?? { seconds: 0, pose: {} };
  const pushing = STAND + chamber.seconds;
  const pushes: MusclePush[] = [];
  const command: { -readonly [K in keyof BodyCommand]: BodyCommand[K] } =
    { posture: GUARD, hands: { left: null, right: null }, pushes, stance: null };
  let time = 0;
  body.drive((view, dt) => {
    time += dt;
    command.stance = legs.goal(view, 0, null);
    const since = time - pushing;
    command.posture = time >= STAND && since < 0 ? { ...GUARD, ...chamber.pose } : GUARD;
    pushes.length = 0;
    if (since >= 0) {
      for (const p of strike.pushes) if (since >= p.from && since < p.to) pushes.push({ channel: p.channel, sense: p.sense, level: p.level ?? 1 });
    }
    return command;
  });
  return {
    body, pushing,
    get time() { return time; },
    get fallen() { return legs.fallen; },
    dispose: () => body.dispose(),
  };
}

/** `point` (body frame, reference pose) in `segment`'s own frame. */
export function inFrameOf(segment: BuiltSegment, point: Vec3): Vector3 {
  const f = segment.frame, d = [point[0] - f.origin[0], point[1] - f.origin[1], point[2] - f.origin[2]] as const;
  return new Vector3(...([f.x, f.y, f.z].map((a) => d[0] * a[0] + d[1] * a[1] + d[2] * a[2]) as [number, number, number]));
}

/** Where `segment`'s rigid body's centre is now, world. */
export const centreNow = (segment: BuiltSegment): Vector3 =>
  inFrameOf(segment, segment.rigid.centre).applyRotationQuaternion(segment.node.rotationQuaternion!).addInPlace(segment.node.position);
