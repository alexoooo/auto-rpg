import { pathToFileURL } from "node:url";
import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import { reptileSpec } from "../src/core/reptile/spec.ts";
import { createQuadrupedMind } from "../src/core/reptile/mind.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { coreStand } from "../tests/harness/core-stand.mjs";

/** Node core stand, rapier-coordinate, 120 Hz: physically fallen poses and useful walking handover. */
export async function recoveryTrial(pose, yaw = 0) {
  const legs = ["front.left", "hind.right", "front.right", "hind.left"];
  const fixtures = {
    back: { rotation: [0, 0, 1, 0], position: [0, .34, 0] },
    left: { rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2], position: [0, .3, 0] },
    right: { rotation: [0, 0, -Math.SQRT1_2, Math.SQRT1_2], position: [0, .3, 0] },
    belly: { rotation: [0, 0, 0, 1], position: [0, -.125, 0],
      joints: Object.fromEntries(legs.map(leg => [`girdle.${leg}`, [0, 0, leg.endsWith("left") ? -.9 : .9]])) },
  };
  if (!fixtures[pose]) throw new Error(`unknown recovery fixture ${pose}`);
  const fixture = fixtures[pose], heading = new Quaternion(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2));
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate", groundSize: 100, ...fixture,
    rotation: heading.multiply(new Quaternion(...fixture.rotation)).asArray() });
  let orders = STAND_ORDERS, handoff = null, start = null, support = null, falls = 0;
  const mind = createQuadrupedMind(stand.built, stand.world, { orders: () => orders }), host = mind.body.state.mind.host, recovery = mind.body.state.mind.subs[0];
  try {
    for (let step = 0; step < 160 * stand.world.hz; step++) {
      stand.step();
      if (handoff === null && stand.world.time > 1 && mind.body.has === "crawl" && recovery.phase === "idle") {
        handoff = stand.world.time; start = mind.body.observe().centre;
        support = host.motor.endpoints.map(endpoint => ({ contact: endpoint.contact, flat: endpoint.flat }));
        orders = { move: { x: Math.sin(yaw), z: Math.cos(yaw) }, face: { x: Math.sin(yaw), z: Math.cos(yaw) }, attack: null };
      }
      if (handoff !== null && mind.body.down) falls++;
      if (handoff !== null && stand.world.time - handoff >= 60) break;
      if (handoff === null && stand.world.time >= 100) break;
    }
    const end = mind.body.observe().centre;
    return { pose, yaw, handoff, retries: recovery.retries, support, falls, start, end,
      distance: start ? (end[0] - start[0]) * Math.sin(yaw) + (end[2] - start[2]) * Math.cos(yaw) : 0,
      steps: host.crawl.steps, assist: { ...mind.body.assist.meter } };
  } finally { mind.body.dispose(); stand.dispose(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  for (const yaw of [0, Math.PI / 2]) for (const pose of ["back", "left", "right", "belly"])
    console.log(JSON.stringify(await recoveryTrial(pose, yaw)));
