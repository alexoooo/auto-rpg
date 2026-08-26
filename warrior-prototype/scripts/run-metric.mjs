import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const action = process.argv[2];
const extra = process.argv.slice(3);
const candidates = [
  process.env.PYTHON_PATH,
  resolve(root, "metric/.venv/Scripts/python.exe"),
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
const childEnvironment = { ...process.env };
if (action === "setup") {
  const sync = spawnSync("uv", ["sync", "--project", "metric", "--frozen", "--python", python], {
    cwd: root, encoding: "utf8", stdio: "inherit", windowsHide: true,
  });
  if (sync.error) throw sync.error;
  if (sync.status !== 0) process.exit(sync.status ?? 1);
  args = ["run", "--project", "metric", "--frozen", "--python", python, "python", "metric/setup_models.py"];
} else if (action === "score") {
  args = ["run", "--project", "metric", "--frozen", "--python", python, "python", "metric/score.py", ...extra];
} else if (action === "prepare-v2") {
  args = ["run", "--project", "metric", "--frozen", "--python", python, "python", "metric/prepare_v2_reference.py", ...extra];
} else if (action === "prepare-v3") {
  args = ["run", "--project", "metric", "--frozen", "--python", python,
    "python", "metric/prepare_v3_reference.py", ...extra];
} else if (action === "prepare-v4") {
  args = ["run", "--project", "metric", "--frozen", "--python", python,
    "python", "metric/prepare_v4_reference.py", ...extra];
} else if (action === "prepare-v5") {
  args = ["run", "--project", "metric", "--frozen", "--python", python,
    "python", "metric/prepare_v5_reference.py", ...extra];
} else if (action === "oracle-v3") {
  args = ["run", "--project", "metric", "--frozen", "--python", python,
    "python", "metric/oracle_v3.py", ...extra];
} else if (action === "screen-distance") {
  args = ["run", "--project", "metric", "--frozen", "--python", python,
    "python", "metric/screen_variant_distance.py", ...extra];
} else if (action === "score-v2") {
  args = ["run", "--project", "metric", "--frozen", "--python", python, "python", "metric/score_v2.py", ...extra];
} else if (action === "score-v4") {
  childEnvironment.WARRIOR_REFERENCE_PROFILE = "rigid-v4";
  args = ["run", "--project", "metric", "--frozen", "--python", python, "python", "metric/score_v2.py", ...extra];
} else if (action === "test") {
  args = ["run", "--project", "metric", "--frozen", "--python", python,
    "python", "-m", "unittest", "discover", "-s", "metric/tests", "-v"];
} else if (action === "comparisons") {
  args = ["run", "--project", "metric", "--frozen", "--python", python,
    "python", "metric/evaluate_comparisons.py"];
} else if (action === "calibrate-v2") {
  args = ["run", "--project", "metric", "--frozen", "--python", python,
    "python", "metric/calibrate_v2.py"];
} else if (action === "archive-progress") {
  args = ["run", "--project", "metric", "--frozen", "--python", python,
    "python", "metric/archive_progress.py", ...extra];
} else {
  throw new Error("run-metric.mjs expects setup, score, prepare-v2, prepare-v3, prepare-v4, prepare-v5, oracle-v3, screen-distance, score-v2, score-v4, comparisons, calibrate-v2, test, or archive-progress");
}

const result = spawnSync("uv", args, {
  cwd: root, encoding: "utf8", stdio: "inherit", windowsHide: true,
  env: childEnvironment,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
