import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const variants = process.argv.slice(2);
if (variants.length === 0) throw new Error("provide one or more shield variant names");
const candidates = [process.env.BLENDER_PATH, "blender",
  resolve(root, "../.tools/blender-4.5.12/blender-4.5.12-windows-x64/blender.exe")].filter(Boolean);
const executable = candidates.find((value) => {
  if ((value.includes("/") || value.includes("\\")) && !existsSync(value)) return false;
  return spawnSync(value, ["--version"], { cwd: root, encoding: "utf8", windowsHide: true }).status === 0;
});
if (!executable) throw new Error("Blender was not found");
for (const variant of variants) {
  const review = resolve(root, ".review/screen/shields", variant);
  mkdirSync(review, { recursive: true });
  const result = spawnSync(executable, ["--background", "--factory-startup", "--python",
    resolve(root, "asset-src/v3/screen_shield_variants.py"), "--",
    "--variant", variant, "--review", review],
  { cwd: root, encoding: "utf8", stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
