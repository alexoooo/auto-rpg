import { Session } from "node:inspector/promises";

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
