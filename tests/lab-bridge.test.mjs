import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

test("JSON bridge resets, batches, refuses bad actions and exits on EOF", { timeout: 15000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL("./../research/lab/server.mjs", import.meta.url))],
    { stdio: ["pipe", "pipe", "inherit"], windowsHide: true });
  const messages = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const exited = once(child, "exit");
  let id = 0;
  const request = async (op, payload = {}) => {
    child.stdin.write(JSON.stringify({ id: ++id, op, ...payload }) + "\n");
    const next = await messages.next();
    assert.equal(next.done, false);
    const answer = JSON.parse(next.value);
    assert.equal(answer.id, id);
    return answer;
  };
  try {
    const reset = await request("reset", { config: { maxSeconds: 1 } });
    assert.equal(reset.ok, true);
    assert.equal(reset.result.observation.length, reset.result.observationNames.length);
    const batch = await request("step", { actions: [Array(12).fill(0), Array(12).fill(0)] });
    assert.equal(batch.result.length, 2);
    assert.ok(batch.result[1].clock > batch.result[0].clock);
    assert.equal((await request("step", { actions: [[1]] })).ok, false);
    assert.equal((await request("reset", { config: { maxSeconds: 1 } })).ok, true);
    assert.equal((await request("close")).result.closed, true);
    child.stdin.end();
    const [code] = await exited;
    assert.equal(code, 0);
  } finally { if (child.exitCode === null) child.kill(); }
});
