/** **A standing Warrior pulled at its root** (`src/core/control/assist.ts`), as the assist's tests read it: Node stand, Rapier, 120 Hz. */
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../../src/core/body.ts";
import { centreOfToRef } from "../../src/core/control/support.ts";
import { humanSpec } from "../../src/core/human/spec.ts";
import { standIntent } from "../../src/core/mind/intent.ts";
import { driveBy } from "../../src/core/mind/tactics.ts";
import { coreStand } from "../harness/core-stand.mjs";
import { rootSegment } from "../../src/core/read-body.ts";

const spec = humanSpec("workshop-fighter");
export const massOf = (built) => [...built.segments.values()].reduce((sum, segment) => sum + segment.rigid.mass, 0);
/** A body's weight, N: its segments' rigid masses times gravity. */
export const weightOf = (built) => massOf(built) * Math.hypot(...built.physics.gravity);
/** A body's centre of mass, world: the mass-weighted mean of its segments' centres. */
export function centreOfMass(built) {
  const sum = new Vector3(), p = new Vector3();
  for (const segment of built.segments.values()) sum.addInPlace(centreOfToRef(segment, p).scaleInPlace(segment.rigid.mass));
  return sum.scaleInPlace(1 / massOf(built));
}
/**
 * The Warrior standing on the ground under the command layers (`createBody`, `driveBy`), one second
 * to settle; then pulled for 2 s at its root's centre of mass by a steady quarter of its weight along
 * +z (an eighth it walks out, stepping), an impulse before each step; then 2 s more. `ceiling` is its assist's, or none. `each` is
 * called after every step from the pull's first.
 */
export async function pulled(ceiling, each = () => {}) {
  const stand = await coreStand(spec);
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS, ...(ceiling ? { assist: ceiling } : {}) });
  try {
    const skills = driveBy(body, { name: "stand", decide: () => standIntent(0) });
    const root = rootSegment(stand.built), weight = weightOf(stand.built), { stance } = body.view;
    const at = new Vector3(), pull = new Vector3(0, 0, weight / 4 / stand.world.hz);
    stand.step(stand.seconds(1));
    const from = centreOfMass(stand.built), settled = stance.recoveries;
    let low = Infinity, far = 0, missed = 0;
    const take = () => {
      const c = centreOfMass(stand.built);
      low = Math.min(low, c.y);
      far = Math.max(far, Math.hypot(c.x - from.x, c.z - from.z));
      // Past a fall the stance's ask has no bound; what the soles miss is read while it stands.
      if (!body.view.down) missed = Math.max(missed, stance.shortfall.force.length() / weight);
      each({ body, weight, fallen: body.view.down });
    };
    for (let step = 0; step < stand.seconds(2); step++) {
      root.body.applyImpulse(pull, centreOfToRef(root, at));
      stand.step();
      take();
    }
    for (let step = 0; step < stand.seconds(2); step++) { stand.step(); take(); }
    const { meter } = body.assist;
    return {
      fallen: body.view.down, low, far, missed, recoveries: stance.recoveries - settled, weight,
      mean: meter.steps ? [meter.force / meter.steps, meter.moment / meter.steps] : [0, 0],
    };
  } finally { body.dispose(); stand.dispose(); }
}
