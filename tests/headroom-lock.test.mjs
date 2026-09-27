import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { lockRun } from "../research/runner.mjs";

const cli = fileURLToPath(new URL("../research/headroom.mjs", import.meta.url));
const invoke = (directory, extra = []) => spawnSync(process.execPath,
  [cli, "--exp", "family", "--out", directory, ...extra], { encoding: "utf8", timeout: 20000 });

test("headroom CLI refuses a live run for both computation and summary without changing its files", () => {
  const directory = mkdtempSync(join(tmpdir(), "headroom-lock-"));
  const unlock = lockRun(directory);
  try {
    writeFileSync(join(directory, "manifest.json"), "{}\n");
    writeFileSync(join(directory, "summary.json"), "original\n");
    const originalLock = readFileSync(join(directory, "run.lock"), "utf8");
    for (const extra of [[], ["--summary"]]) {
      const child = invoke(directory, extra);
      assert.notEqual(child.status, 0);
      assert.match(child.stderr, /run directory is in use/);
      assert.equal(readFileSync(join(directory, "run.lock"), "utf8"), originalLock);
      assert.equal(readFileSync(join(directory, "manifest.json"), "utf8"), "{}\n");
      assert.equal(readFileSync(join(directory, "summary.json"), "utf8"), "original\n");
    }
  } finally { unlock(); rmSync(directory, { recursive: true, force: true }); }
});

test("headroom releases its lock after a rejected resume and after successful summary", () => {
  const directory = mkdtempSync(join(tmpdir(), "headroom-unlock-"));
  try {
    writeFileSync(join(directory, "manifest.json"), "{}\n");
    const failed = invoke(directory);
    assert.match(failed.stderr, /resume manifest\/fingerprint mismatch/);
    assert.equal(existsSync(join(directory, "run.lock")), false);
    const summary = invoke(directory, ["--summary"]);
    assert.equal(summary.status, 0, summary.stderr);
    assert.equal(existsSync(join(directory, "run.lock")), false);
    assert.deepEqual(JSON.parse(readFileSync(join(directory, "summary.json"))).cells, {});
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
