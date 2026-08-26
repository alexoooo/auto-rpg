import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const python = resolve(root, "metric/.venv/Scripts/python.exe");
if (!existsSync(python)) throw new Error("metric Python environment is missing; run npm run similarity:setup");

for (const script of ["metric/prepare_v3_reference.py", "metric/oracle_v3.py"]) {
  const result = spawnSync(python, [script], { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
