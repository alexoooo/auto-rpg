/**
 * How long a felled body takes to lie still, and what Rapier does with a limp body put to sleep.
 *
 * **Falls.** Each crypt model with the club, under the crypt's mind (`FIGHTER`, with the assist
 * its balance gives under the dungeon's rulebook) and orders to stand, alone on a ground: stood
 * 2 s, then shoved at its root's centre of mass by its whole weight for a quarter second toward
 * each of four bearings and let go limp (`Body.setLevel`) as it is found down, as the crypt lets
 * a fighter out of the fight go; or let go limp standing, as one whose pool ends on its feet. It
 * prints, for each, the seconds from going limp until its centre of mass stays under `STILL`, and
 * until its fastest segment does, read over `WATCH` seconds after; a fall still moving at the end
 * is printed as such. The crypt's `LEVELS.settle` is the longest of the first that end, rounded
 * up to a second: a body has come down, whatever its limbs do after.
 *
 * **Sleep.** `--bodies` skeletons with the club stand under
 * the command layers, are let go limp (`Body.setLevel`) and lie for 5 s, and then every segment is
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
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { armed } from "../src/core/human/grip.ts";
import { modelSpec } from "../src/core/models.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { FIGHTER } from "../src/core/mind/config.ts";
import { standIntent } from "../src/core/mind/intent.ts";
import { createMind } from "../src/core/mind/minds.ts";
import { balanceCeiling, balancePercent, rulebook } from "../src/core/rules/rulebook.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { createWorld } from "../src/core/world.ts";
import { CORE_ENGINE, freshEngine } from "../tests/harness/core-stand.mjs";

const { values } = parseArgs({ options: { bodies: { type: "string", default: "8" } } });
// Babylon greets every engine it makes on the console.
Logger.LogLevels = Logger.NoneLogLevel;
if (CORE_ENGINE !== "rapier") throw new Error("the probe reads Rapier's own rigid bodies");

/** A segment slower than this counts as still, m/s: a numeric setting. */
const STILL = 0.05;
/** How long after going limp a fall is watched, s: a numeric setting, long past every fall read. */
const WATCH = 15;
const SHOVES = [["ahead", 0, 1], ["behind", 0, -1], ["left", -1, 0], ["right", 1, 0]];

/**
 * Seconds from going limp until `model`'s centre of mass, and its fastest segment, stay under
 * `STILL`, felled by `shove` ([name, x, z]) or let go standing (null); null for one still moving
 * `WATCH` seconds on.
 */
async function fall(model, shove) {
  const spec = armed(modelSpec(model), "right", woodenClub()), rules = rulebook("dungeon");
  const scene = new Scene(new NullEngine()), world = createWorld(scene, await freshEngine());
  world.physics.addFixedBox([0, -0.5, 0], [200, 1, 200]);
  const built = buildBody(spec, world, { position: [0, 0, 0] });
  const assist = balanceCeiling(built.spec.attributes.balance.value, balancePercent(rules));
  const { body } = createMind(built, world, FIGHTER, { name: "probe", assist, orders: () => ({ move: null, face: null, attack: null }) });
  const segments = [...built.segments.values()], root = body.muscles.dynamics.root.segment, at = new Vector3(), v = new Vector3();
  const weight = segments.reduce((sum, segment) => sum + segment.rigid.mass, 0) * -built.physics.gravity[1];
  const push = shove && new Vector3(shove[1], 0, shove[2]).scaleInPlace(weight * world.dt);
  const mass = segments.reduce((sum, segment) => sum + segment.rigid.mass, 0), momentum = new Vector3();
  let limpAt = null, lastMoving = null, lastFalling = null;
  for (let step = 0; step < (2 + 4 + WATCH) * world.hz; step++) {
    const time = step / world.hz;
    if (limpAt === null) {
      if (time >= 2 && (!shove || body.view.down)) { body.assist.withdraw(); body.setLevel("limp"); limpAt = step; }
      else if (time >= 6) break;
      else if (push && time >= 2 && time < 2.25) root.body.applyImpulse(push, centreOfToRef(root, at));
    } else if (step - limpAt > WATCH * world.hz) break;
    world.step();
    if (limpAt === null) continue;
    momentum.setAll(0);
    for (const segment of segments) momentum.addInPlace(segment.body.linearVelocityToRef(v).scaleInPlace(segment.rigid.mass));
    if (momentum.length() / mass >= STILL) lastFalling = step + 1;
    if (segments.some((segment) => segment.body.linearVelocityToRef(v).length() >= STILL)) lastMoving = step + 1;
  }
  world.dispose(); scene.dispose();
  if (limpAt === null) return null;
  const seconds = (last) => (last ?? limpAt) - limpAt < WATCH * world.hz ? ((last ?? limpAt) - limpAt) / world.hz : null;
  return { body: seconds(lastFalling), segment: seconds(lastMoving) };
}

console.log(`Node, the core world, ${CORE_ENGINE}, 120 Hz; each model with the club alone on a ground. Seconds from going limp until its centre of mass, and then its fastest segment, stays under ${STILL} m/s, read over ${WATCH} s; "moving" is still moving at the end
`);
console.log(`| model | ${SHOVES.map(([name]) => `shoved ${name}`).join(" | ")} | let go standing |`);
console.log(`|---|${SHOVES.map(() => "---:").join("|")}|---:|`);
const MODELS = ["crypt-skeleton", "workshop-fighter", "workshop-rogue"];
const shown = (seconds) => seconds === null ? "moving" : seconds.toFixed(2);
let longest = 0, moving = 0;
for (const model of MODELS) {
  const row = [];
  for (const shove of [...SHOVES, null]) {
    const read = await fall(model, shove);
    if (read === null) { row.push("not felled"); continue; }
    if (read.body === null) moving += 1;
    else longest = Math.max(longest, read.body);
    row.push(`${shown(read.body)}, ${shown(read.segment)}`);
  }
  console.log(`| ${model} | ${row.join(" | ")} |`);
}
console.log(`
the longest that ends: ${longest.toFixed(2)} s; rounded up to a second, ${Math.ceil(longest)} s; ${moving} of ${MODELS.length * (SHOVES.length + 1)} still moving at the end
`);

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
for (const { body } of bodies) body.setLevel("limp");
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
