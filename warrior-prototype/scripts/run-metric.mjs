import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const action = process.argv[2];
const extra = process.argv.slice(3);
const candidates = [
  process.env.PYTHON_PATH,
  resolve(root, "../.tools/blender-4.5.12/blender-4.5.12-windows-x64/4.5/python/bin/python.exe"),
  "python3",
  "python",
].filter(Boolean);

let python;
for (const candidate of candidates) {
  if ((candidate.includes("/") || candidate.includes("\\")) && !existsSync(candidate)) continue;
  const probe = spawnSync(candidate, ["--version"], { cwd: root, encoding: "utf8", windowsHide: true });
  if (probe.status === 0) {
    python = candidate;
    break;
  }
}
if (!python) throw new Error("Python 3.11 was not found. Set PYTHON_PATH or install the pinned Blender toolchain.");

let args;
if (action === "setup") {
  const sync = spawnSync("uv", ["sync", "--project", "metric", "--frozen", "--python", python], {
    cwd: root, encoding: "utf8", stdio: "inherit", windowsHide: true,
  });
  if (sync.error) throw sync.error;
  if (sync.status !== 0) process.exit(sync.status ?? 1);
  args = ["run", "--project", "metric", "--frozen", "--python", python, "python", "metric/setup_models.py"];
} else if (action === "score") {
  args = ["run", "--project", "metric", "--frozen", "--python", python, "python", "metric/score.py", ...extra];
} else if (action === "test") {
  args = ["run", "--project", "metric", "--frozen", "--python", python,
    "python", "-m", "unittest", "discover", "-s", "metric/tests", "-v"];
} else if (action === "comparisons") {
  args = ["run", "--project", "metric", "--frozen", "--python", python,
    "python", "metric/evaluate_comparisons.py"];
} else {
  throw new Error("run-metric.mjs expects setup, score, comparisons, or test");
}

const result = spawnSync("uv", args, { cwd: root, encoding: "utf8", stdio: "inherit", windowsHide: true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
