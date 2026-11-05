import { Session } from "node:inspector/promises";
import { SERVO_SECONDS } from "../../src/control/body.ts";
import { commandedBody } from "../../src/app/commanded-body.ts";
import { buildBody } from "../../src/core/bodies/build/build-body.ts";
import { armed } from "../../src/core/bodies/human/grip.ts";
import { modelSpec } from "../../src/core/bodies/models.ts";
import { woodenClub } from "../../src/core/bodies/items/club.ts";
import { standIntent } from "../../src/skills/intent/intent.ts";
import { driveBy } from "../../src/minds/decider.ts";
import { createWorld } from "../../src/core/world/world.ts";
import { freshEngine } from "./core-stand.mjs";
import { GUARD } from "../../src/skills/guard/guard.ts";
import { poseAngles } from "../../src/control/kinematics.ts";

/**
 * `count` bodies of `model` with the club on a ground in a world of their own, on a square grid
 * 3 m apart, each under the command layers with an order to stand: what a step allocates is read
 * on them (`research/step-garbage.mjs`).
 */
export async function standBodies(count, model = "crypt-skeleton") {
  const spec = armed(modelSpec(model), "right", woodenClub());
  const world = createWorld(await freshEngine());
  world.physics.addFixedBox([0, -0.5, 0], [200, 1, 200]);
  const side = Math.ceil(Math.sqrt(count));
  const bodies = Array.from({ length: count }, (_, i) => {
    const body = commandedBody(buildBody(spec, world, { position: [3 * (i % side), 0, 3 * Math.floor(i / side)] }), world, { servoSeconds: SERVO_SECONDS });
    driveBy(body, { name: "stand", decide: () => standIntent(0) });
    return body;
  });
  return { world, bodies, dispose() { world.dispose(); } };
}

/**
 * **Lying still**: while its body is down (`BodyView.down`, its host's reading this step), it asks
 * its muscles for nothing and its assist nothing.
 */
const lying = (own, view) => ({
  name: "lie", wants: () => view.down, begin() {}, end() {},
  step() { own.muscles.activation.fill(0); own.muscles.velocity.fill(0); },
});

/** A Warrior on its back, lying still (`lying`), so every step reads all fixed support. */
export async function downBody() {
  const world = createWorld(await freshEngine());
  world.physics.addFixedBox([0, -.5, 0], [20, 1, 20]);
  const spec = modelSpec("workshop-fighter"), half = Math.sqrt(.5);
  const built = buildBody(spec, world, { position: [0, .4, 0], rotation: [-half, 0, 0, half], joints: poseAngles(spec, GUARD) });
  const body = commandedBody(built, world, { servoSeconds: SERVO_SECONDS }, [lying]);
  return { world, body, dispose() { body.dispose(); built.dispose(); world.dispose(); } };
}

/**
 * **What a call allocates on the JavaScript heap**, read by V8's sampling heap profiler with what the
 * collector has since taken counted in: the bytes, and the call sites they came from. A sample is
 * taken every `interval` bytes allocated, so a reading of fewer than a few hundred intervals is
 * coarse; ask for a finer interval where little is allocated.
 *
 * It counts objects of the heap: arrays, boxed numbers, closures, a typed array's header. A typed
 * array's store beyond the heap is not in it.
 */
export async function allocatedIn(run, { interval = 2048 } = {}) {
  const session = new Session();
  session.connect();
  try {
    await session.post("HeapProfiler.startSampling", { samplingInterval: interval, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    await run();
    const { profile } = await session.post("HeapProfiler.stopSampling");
    return allocationOf(profile);
  } finally { session.disconnect(); }
}

/** A file's path as a row names it: from the repository's root, or from `node_modules`. */
const short = (url) => url.replace(/^file:\/\/\/.*?\/(src|tests|research|scripts)\//, "$1/").replace(/^.*node_modules\//, "node_modules/") || "(native)";

/**
 * A sampling profile as its total and its sites: `self` is what each function allocated in its own
 * body, `within` what it and everything it called allocated (a function that calls itself counted
 * once), and `files` the self bytes by file. Each is a map from a name to bytes.
 */
function allocationOf(profile) {
  const self = new Map(), within = new Map(), files = new Map();
  let bytes = 0;
  const add = (map, key, size) => map.set(key, (map.get(key) ?? 0) + size);
  const walk = (node, stack) => {
    const file = short(node.callFrame.url), key = `${node.callFrame.functionName || "(anonymous)"} ${file}`;
    const next = stack.includes(key) ? stack : [...stack, key];
    bytes += node.selfSize;
    add(self, key, node.selfSize);
    add(files, file, node.selfSize);
    for (const name of next) add(within, name, node.selfSize);
    for (const child of node.children) walk(child, next);
  };
  walk(profile.head, []);
  return { bytes, self, within, files };
}
