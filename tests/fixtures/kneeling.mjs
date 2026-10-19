/**
 * **The Warrior placed kneeling upright** on the Node core stand, the coordinate engine, 120 Hz: built
 * in the rise's `tall` posture (`src/core/mind/rise/stages.ts`), its toes tucked under or its right
 * ankle curled so that its rear boot is off the ground, its lowest point 5 mm over a ground 40 m
 * across, and held in that pose by its muscles for a second, the mind that held it let go
 * (`tests/core-supported-rise.test.mjs`, `tests/core-supported-rise-capability.test.mjs`).
 */
import { coreStand } from "../harness/core-stand.mjs";
import { uprightness } from "../../src/core/control/ground.ts";
import { embody } from "../../src/core/mind/mind.ts";
import { RISE } from "../../src/core/mind/rise/stages.ts";

/** The rise's `tall` posture, and with the right ankle curled clear of the ground. */
const TALL = RISE.rise.find((stage) => stage.name === "tall").posture, CURLED = Object.freeze({ ...TALL, "ankle.right dorsiflexion": -0.85 });

/** `spec` placed kneeling, its rear boot `curled` up or not, and held there a second: its stand. */
export async function kneeling(spec, { curled = false } = {}) {
  const options = { engine: "rapier-coordinate", groundSize: 40, posture: curled ? CURLED : TALL };
  const built = await coreStand(spec, options), lowest = uprightness(built.built).lowest();
  built.dispose();
  const stand = await coreStand(spec, { ...options, position: [0, 0.005 - lowest, 0] });
  try {
    let goal = null;
    const holder = embody(stand.built, stand.world, (own) => ({
      name: "placed kneel", state: {},
      step() {
        const muscles = own.muscles;
        goal ??= Float64Array.from(muscles.channels, (_, i) => muscles.angle(i));
        muscles.activation.fill(1);
        for (let i = 0; i < muscles.velocity.length; i++) muscles.velocity[i] = Math.max(-3, Math.min(3, (goal[i] - muscles.angle(i)) / 0.2));
      },
    }));
    stand.step(stand.seconds(1));
    holder.dispose();
    return stand;
  } catch (error) { stand.dispose(); throw error; }
}
