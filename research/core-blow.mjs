/**
 * **One blow, thrown standing**: the rig the strike searches throw their blows on
 * (`core-strike.mjs`, `core-club-strike.mjs`). A core human (`src/core/body.ts`) stands on its own
 * feet under the stance (`stanceLegs` in `src/core-lab/legs.ts`), facing +z, on both feet where it
 * was built. Its arms are servoed to the lab's guard for `STAND` seconds, then it throws the blow:
 * the strike's chamber pose, held for its time, then its pushes, timed from the chamber's end.
 * Every freedom not pushed is servoed to the guard or the chamber, and the legs stay the stance's
 * throughout. Every torque is a muscle's, the legs' included, so a blow is thrown from the feet: the
 * trunk turns against a body standing on the ground, not a pelvis held still.
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
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody } from "../src/core/body.ts";
import { stanceLegs } from "../src/core-lab/legs.ts";
import { GUARD, SERVO_SECONDS } from "../src/core-lab/routine.ts";

/** Seconds stood before the blow: the first of the table's at which each human is at 5 mm/s or less. */
export const STAND = 1.5;

/**
 * Throw `strike` with `built`, a human in its reference pose at the origin facing +z, in `world`.
 * `time` counts the control steps taken, s; the chamber begins at `STAND` and the pushes at
 * `pushing`. `fallen` says whether the body has fallen at any step since it began.
 */
export function throwBlow(built, world, strike) {
  const legs = stanceLegs();
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS });
  const chamber = strike.chamber ?? { seconds: 0, pose: {} };
  const pushing = STAND + chamber.seconds;
  const pushes = [];
  const command = { posture: GUARD, hands: { left: null, right: null }, pushes, stance: null };
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
export function inFrameOf(segment, point) {
  const d = point.map((x, i) => x - segment.frame.origin[i]);
  return new Vector3(...["x", "y", "z"].map((a) => d[0] * segment.frame[a][0] + d[1] * segment.frame[a][1] + d[2] * segment.frame[a][2]));
}

/** Where `segment`'s rigid body's centre is now, world. */
export const centreNow = (segment) =>
  inFrameOf(segment, segment.rigid.centre).applyRotationQuaternion(segment.node.rotationQuaternion).addInPlace(segment.node.position);
