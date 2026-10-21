import test from "node:test";
import assert from "node:assert/strict";
import { screenTask } from "../src/ui/screen.ts";
import { readyFrames } from "../src/ui/readiness.ts";
import { modelBytes, sceneModel } from "../src/render/asset-cache.ts";

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test("the opening view waits through incomplete frames and requires consecutive complete draws", async () => {
  const states = [false, true, false, true, true], drawn = [];
  await readyFrames({ signal: new AbortController().signal,
    frame() { drawn.push(states.shift()); }, ready: () => drawn.at(-1),
    next: async () => {}, clock: () => 0,
  });
  assert.deepEqual(drawn, [false, true, false, true, true]);
  assert.deepEqual(states, []);
});

test("navigation during a pending frame prevents any subsequent drawing", async () => {
  const abort = new AbortController(), next = deferred();
  let frames = 0;
  const loading = readyFrames({ signal: abort.signal, frame() { frames++; }, ready: () => true,
    next: () => next.promise, clock: () => 0 });
  abort.abort(); next.resolve();
  await assert.rejects(loading, { name: "AbortError" });
  assert.equal(frames, 0);
});

test("an opening view that never becomes ready fails with a recovery message", async () => {
  let visibleTime = 0;
  await assert.rejects(readyFrames({ signal: new AbortController().signal,
    frame() {}, ready: () => false, next: async () => { visibleTime += 10000; }, clock: () => visibleTime,
  }), /could not finish preparing.*retry/);
});

test("shared model downloads are deduplicated and failed requests can be retried", async () => {
  const original = globalThis.fetch, request = deferred();
  const seen = [];
  globalThis.fetch = async url => { seen.push(url); return request.promise; };
  try {
    const first = modelBytes("/shared.glb"), second = modelBytes("/shared.glb");
    assert.equal(first, second);
    request.resolve(new Response(new Uint8Array([1, 2, 3])));
    assert.deepEqual(await first, new Uint8Array([1, 2, 3]));
    assert.deepEqual(await modelBytes("/shared.glb"), new Uint8Array([1, 2, 3]));
    assert.deepEqual(seen, ["/shared.glb"]);
    globalThis.fetch = async url => { seen.push(url); return new Response(null, { status: 503 }); };
    await assert.rejects(modelBytes("/retry.glb"), /503/);
    globalThis.fetch = async url => { seen.push(url); return new Response(new Uint8Array([4])); };
    assert.deepEqual(await modelBytes("/retry.glb"), new Uint8Array([4]));
    assert.deepEqual(seen, ["/shared.glb", "/retry.glb", "/retry.glb"]);
    await assert.rejects(sceneModel("/shared.glb", { isDisposed: true }), { name: "AbortError" });
  } finally { globalThis.fetch = original; }
});

test("navigation releases a pending operation and consumes a late failure", async () => {
  const abort = new AbortController();
  let fail;
  const pending = new Promise((_, reject) => { fail = reject; });
  const loading = screenTask(pending, abort.signal);
  abort.abort();
  await assert.rejects(loading, { name: "AbortError" });
  fail(new Error("late network failure"));
  await Promise.resolve();
});
