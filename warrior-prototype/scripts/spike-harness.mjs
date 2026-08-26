import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = resolve(root, "../.tools/human-base-meshes/human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend");
if (!existsSync(bundle)) {
  throw new Error("The CC0 human base mesh bundle is not vendored. Download "
    + "https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip"
    + " and unzip it into .tools/human-base-meshes/.");
}

const review = resolve(root, ".review/v3/harness");
mkdirSync(review, { recursive: true });
const candidates = [process.env.BLENDER_PATH, "blender",
  resolve(root, "../.tools/blender-4.5.12/blender-4.5.12-windows-x64/blender.exe")].filter(Boolean);
const executable = candidates.find((value) => {
  if ((value.includes("/") || value.includes("\\")) && !existsSync(value)) return false;
  return spawnSync(value, ["--version"], { cwd: root, encoding: "utf8", windowsHide: true }).status === 0;
});
if (!executable) throw new Error("Blender was not found. Set BLENDER_PATH or install Blender on PATH.");

const result = spawnSync(executable, ["--background", "--factory-startup", "--python",
  resolve(root, "asset-src/v3/spike_harness.py"), "--",
  "--review", review, "--output", resolve(root, "public/assets/warrior-harness.glb"),
  ...process.argv.slice(2)],
{ cwd: root, encoding: "utf8", stdio: "inherit", windowsHide: true });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
