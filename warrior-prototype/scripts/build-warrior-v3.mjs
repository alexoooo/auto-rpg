import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(readFileSync(resolve(root, "asset-src/v3/warrior-v3.contract.json"), "utf8"));
const argv = process.argv.slice(2);
const screen = argv.includes("--screen");
const named = argv.filter(value => !value.startsWith("--"));
const variants = screen && named.length === 0 ? contract.variants
  : named.length > 0 ? named : [contract.primaryVariant];

for (const variant of variants) {
  if (!contract.variants.includes(variant)) {
    throw new Error(`unknown variant ${variant}; expected one of ${contract.variants.join(", ")}`);
  }
}

const candidates = [process.env.BLENDER_PATH, "blender",
  resolve(root, "../.tools/blender-4.5.12/blender-4.5.12-windows-x64/blender.exe")].filter(Boolean);
const executable = candidates.find((value) => {
  if ((value.includes("/") || value.includes("\\")) && !existsSync(value)) return false;
  return spawnSync(value, ["--version"], { cwd: root, encoding: "utf8", windowsHide: true }).status === 0;
});
if (!executable) throw new Error("Blender was not found. Set BLENDER_PATH or install Blender on PATH.");

for (const variant of variants) {
  const review = resolve(root, ".review/v3", variant);
  mkdirSync(review, { recursive: true });
  // Screening keeps the canonical v3 source and GLB untouched: a variant only
  // becomes the authored source once it has been ranked and confirmed.
  const output = screen
    ? resolve(review, "warrior-v3.glb")
    : resolve(root, "public/assets/warrior-v3.glb");
  const args = ["--background", "--factory-startup", "--python",
    resolve(root, "asset-src/v3/export_warrior_v3.py"), "--",
    "--variant", variant, "--output", output, "--review", review];
  if (!screen) args.push("--source", resolve(root, "asset-src/v3/warrior-v3.blend"));
  const result = spawnSync(executable, args,
    { cwd: root, encoding: "utf8", stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
