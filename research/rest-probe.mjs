/**
 * What Rapier does with a limp body put to sleep: `--bodies` skeletons with the club stand under
 * the command layers, are let go limp (`Body.dispose`) and lie for 5 s, and then every segment is
 * put to sleep through the binding's own rigid body (`RigidBody.sleep`), which the engine seam does
 * not offer. It prints a step's time standing, limp and asleep, how many segments are still asleep
 * 5 s on and the fastest of them, and what wakes when a 5 kg ball is dropped on the first body.
 *
 *   node research/rest-probe.mjs [--bodies 8]
 *
 * Wall time on the machine it runs on: read it on a quiet one.
 */
import { parseArgs } from "node:util";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { armed } from "../src/core/human/grip.ts";
import { modelSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { standIntent } from "../src/core/mind/intent.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { createWorld } from "../src/core/world.ts";
import { CORE_ENGINE, freshEngine } from "../tests/harness/core-stand.mjs";

const { values } = parseArgs({ options: { bodies: { type: "string", default: "8" } } });
// Babylon greets every engine it makes on the console.
Logger.LogLevels = Logger.NoneLogLevel;
if (CORE_ENGINE !== "rapier") throw new Error("the probe reads Rapier's own rigid bodies");

const spec = armed(modelSpec("crypt-skeleton"), "right", woodenClub());
const scene = new Scene(new NullEngine()), world = createWorld(scene, await freshEngine());
world.physics.addFixedBox([0, -0.5, 0], [200, 1, 200]);
const count = Number(values.bodies), side = Math.ceil(Math.sqrt(count));
const bodies = Array.from({ length: count }, (_, i) => {
  const built = buildBody(spec, world, { position: [3 * (i % side), 0, 3 * Math.floor(i / side)] });
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS });
  driveBy(body, { name: "stand", decide: () => standIntent(0) });
  return { built, body };
});
const SECONDS = 5 * world.hz;
/** The mean of `n` steps, ms. */
const timed = (n) => { const t = performance.now(); world.step(n); return ((performance.now() - t) / n).toFixed(3); };
const rigidsOf = ({ built }) => [...built.segments.values()].map((segment) => segment.body.rigid);
const rigids = bodies.flatMap(rigidsOf);
const asleep = (of = rigids) => of.filter((rigid) => rigid.isSleeping()).length;
const fastest = () => Math.max(...rigids.map((rigid) => { const v = rigid.linvel(); return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); })).toFixed(3);

console.log(`Node, the core world, ${CORE_ENGINE}, 120 Hz; ${count} of crypt-skeleton with the club, ${rigids.length} segments\n`);
world.step(2 * world.hz);
console.log(`standing under the command layers: ${timed(SECONDS)} ms a step`);
for (const { body } of bodies) body.dispose();
world.step(SECONDS);
console.log(`limp, from 5 s after: ${timed(SECONDS)} ms a step; asleep ${asleep()}; the fastest segment ${fastest()} m/s`);
for (const rigid of rigids) rigid.sleep();
console.log(`every segment put to sleep: asleep ${asleep()}`);
console.log(`the next 5 s: ${timed(SECONDS)} ms a step; asleep at their end ${asleep()}; the fastest segment ${fastest()} m/s`);
for (const rigid of rigids) rigid.sleep();
const first = rigidsOf(bodies[0]), others = rigids.filter((rigid) => !first.includes(rigid)), before = asleep(others);
const over = first[0].translation(), node = new TransformNode("ball", scene);
node.position.set(over.x, over.y + 1, over.z);
node.rotationQuaternion = new Quaternion();
world.physics.addBody(node, [{ kind: "sphere", centre: [0, 0, 0], radius: 0.15 }],
  { mass: 5, centre: [0, 0, 0], moments: [0.05, 0.05, 0.05], orientation: Quaternion.Identity() });
world.step(world.hz);
console.log(`put to sleep again, and a 5 kg ball dropped on the first body, 1 s on: of its ${first.length} segments ${first.length - asleep(first)} awake; of the others' ${others.length}, ${before - asleep(others)} woken`);
