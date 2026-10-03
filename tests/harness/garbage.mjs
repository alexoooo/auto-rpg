import { spawnSync } from "node:child_process";
import { Session } from "node:inspector/promises";
import { fileURLToPath } from "node:url";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createBody, SERVO_SECONDS } from "../../src/core/body.ts";
import { buildBody } from "../../src/core/build/build-body.ts";
import { armed } from "../../src/core/human/grip.ts";
import { modelSpec } from "../../src/core/human/spec.ts";
import { woodenClub } from "../../src/core/items/club.ts";
import { standIntent } from "../../src/core/mind/intent.ts";
import { driveBy } from "../../src/core/mind/tactics.ts";
import { createWorld } from "../../src/core/world.ts";
import { freshEngine } from "./core-stand.mjs";

/**
 * `count` bodies of `model` with the club on a ground in a world of their own, on a square grid
 * 3 m apart, each under the command layers with an order to stand: what a step allocates is read
 * on them (`tests/core-step-cost.test.mjs`, `research/step-garbage.mjs`).
 */
export async function standBodies(count, model = "crypt-skeleton") {
  const spec = armed(modelSpec(model), "right", woodenClub());
  const scene = new Scene(new NullEngine()), world = createWorld(scene, await freshEngine());
  world.physics.addFixedBox([0, -0.5, 0], [200, 1, 200]);
  const side = Math.ceil(Math.sqrt(count));
  const bodies = Array.from({ length: count }, (_, i) => {
    const body = createBody(buildBody(spec, world, { position: [3 * (i % side), 0, 3 * Math.floor(i / side)] }), world, { servoSeconds: SERVO_SECONDS });
    driveBy(body, { name: "stand", decide: () => standIntent(0) });
    return body;
  });
  return { world, bodies, dispose() { world.dispose(); scene.dispose(); } };
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

/**
 * KiB a body's step allocates in `fixture` (`tests/harness/step-allocation.mjs`), read in a process
 * of its own: what a step allocates depends on how far V8 has optimized the code it runs, so a
 * reading after another fixture in one process reads less than one alone.
 */
export function stepAllocation(fixture) {
  const child = spawnSync(process.execPath, [fileURLToPath(new URL("./step-allocation.mjs", import.meta.url)), fixture], { encoding: "utf8" });
  if (child.status !== 0) throw new Error(child.stderr);
  return Number(child.stdout);
}
