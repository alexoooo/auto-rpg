/**
 * **A step into a staggered stance**, from the guard, standing square as built: the right sole's
 * middle carried to `--across` m right of the left's and `--back` m behind it, over `--seconds`,
 * lifted 5 cm, the weight shifted off it first, as `Locomotion.place` steps. Read at each of `--hz`:
 * how far the bearing (left) foot slid across the ground in the step and to 2 s after it, the
 * centre of mass's top speed, where the right sole landed against its goal, the stance's own
 * steps to catch the body, and whether it stayed up.
 *
 * Node core stand, Rapier.
 *
 *   node research/stance-stagger.mjs [--models workshop-fighter,workshop-rogue,crypt-skeleton] [--across 0.3] [--back 0.15]
 *     [--seconds 0.3] [--hz 120,480,1920]
 */
import { parseArgs } from "node:util";
import { createBody } from "../src/core/body.ts";
import { modelSpec } from "../src/core/human/spec.ts";
import { coreStand } from "../tests/harness/core-stand.mjs";

const { values } = parseArgs({ options: {
  models: { type: "string", default: "workshop-fighter,workshop-rogue,crypt-skeleton" }, across: { type: "string", default: "0.3" },
  back: { type: "string", default: "0.15" }, seconds: { type: "string", default: "0.3" }, hz: { type: "string", default: "120,480,1920" },
} });
const across = Number(values.across), back = Number(values.back), seconds = Number(values.seconds);
/** The guard the stance tests stand in (`research/core-stance-trials.mjs`). */
const GUARD = {
  "shoulder.right flexion": 0.5, "shoulder.right abduction": -0.2, "elbow.right flexion": 1.3,
  "shoulder.left flexion": 0.5, "shoulder.left abduction": -0.2, "elbow.left flexion": 1.3,
};
/** Seconds stood before the step (`STAND`), and watched in all. */
const BEFORE = 1.5, WATCHED = 3.5;

console.log(`A step of the right foot to ${(100 * across).toFixed(0)} cm right of the left and ${(100 * back).toFixed(0)} cm behind it, over ${seconds} s; Node core stand, Rapier`);
for (const model of values.models.split(",")) for (const hz of values.hz.split(",").map(Number)) {
  const stand = await coreStand(modelSpec(model), { ground: true, hz });
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1 });
  const foot = stand.built.segments.get("foot.left").node.position;
  let goal = null, lifted = false, from = null, to = null, landed = null, slid = 0, slidStepping = 0, speed = 0;
  body.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) goal = { feet: ["left", "right"], centre: null, height: s.centre.y - s.support.y - 0.03, heading: 0 };
    if (goal && !from && view.time >= BEFORE) {
      from = foot.clone();
      to = [s.soles.left.x + across, s.soles.left.z - back];
      goal = { ...goal, swing: { foot: "right", to, seconds, lift: 0.05, shift: true } };
    }
    if (goal?.swing && s.phase !== "stand") lifted = true;
    if (goal?.swing && lifted && s.phase === "stand") {
      goal = { ...goal, swing: null };
      landed = Math.hypot(s.soles.right.x - to[0], s.soles.right.z - to[1]);
    }
    if (from) {
      const d = Math.hypot(foot.x - from.x, foot.z - from.z);
      slid = Math.max(slid, d);
      if (goal.swing) slidStepping = Math.max(slidStepping, d);
      speed = Math.max(speed, s.velocity.length());
    }
    return { posture: GUARD, hands: { left: null, right: null }, pushes: [], stance: goal };
  });
  let down = false;
  for (let i = 0; i < stand.seconds(WATCHED) && !down; i++) { stand.step(1); down = body.view.down; }
  const cm = (v) => (100 * v).toFixed(1);
  console.log(`${model} ${hz} Hz: the bearing foot slid ${cm(slidStepping)} cm in the step and ${cm(slid)} cm to its end; top speed ${speed.toFixed(2)} m/s;`
    + ` landed ${landed === null ? "never" : `${cm(landed)} cm from its goal`}; the stance's own steps ${body.view.stance.recoveries}; ${down ? "down" : "up"}`);
  stand.dispose();
}
