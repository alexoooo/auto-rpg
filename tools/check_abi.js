"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const committed = path.join(root, "client", "src", "protocol", "abi.generated.ts");
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "auto-rpg-abi-"));
const generated = path.join(temporaryDirectory, "abi.generated.ts");

try {
  const cargo = spawnSync(
    "cargo",
    ["run", "--quiet", "-p", "web", "--bin", "emit_abi", "--", "--output", generated],
    { cwd: root, encoding: "utf8", shell: false },
  );
  if (cargo.error) throw cargo.error;
  if (cargo.status !== 0) {
    process.stderr.write(cargo.stderr || cargo.stdout);
    process.exitCode = cargo.status || 1;
    return;
  }

  assert.ok(fs.existsSync(committed), "client/src/protocol/abi.generated.ts is missing; run npm run generate:abi");
  const expected = fs.readFileSync(generated, "utf8");
  const actual = fs.readFileSync(committed, "utf8");
  if (actual !== expected) {
    const expectedLines = expected.split(/\r?\n/);
    const actualLines = actual.split(/\r?\n/);
    const at = expectedLines.findIndex((line, index) => line !== actualLines[index]);
    console.error("generated ABI is stale; run npm run generate:abi");
    console.error(`first difference at line ${at + 1}:`);
    console.error(`  committed: ${JSON.stringify(actualLines[at])}`);
    console.error(`  generated: ${JSON.stringify(expectedLines[at])}`);
    process.exitCode = 1;
    return;
  }
  console.log("generated ABI matches Rust layout");
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
