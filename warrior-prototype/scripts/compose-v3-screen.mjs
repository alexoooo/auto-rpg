import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(readFileSync(resolve(root, "asset-src/v3/warrior-v3.contract.json"), "utf8"));
const review = resolve(root, ".review/v3");

const candidates = [process.env.BLENDER_PATH, "blender",
  resolve(root, "../.tools/blender-4.5.12/blender-4.5.12-windows-x64/blender.exe")].filter(Boolean);
const blender = candidates.find((value) => {
  if ((value.includes("/") || value.includes("\\")) && !existsSync(value)) return false;
  return spawnSync(value, ["--version"], { cwd: root, encoding: "utf8", windowsHide: true }).status === 0;
});
if (!blender) throw new Error("Blender was not found. Set BLENDER_PATH or install Blender on PATH.");

// The control row is always re-rendered from the accepted source, so a stale
// candidate render left in the working review directory cannot be mistaken for
// the baseline the candidates are being judged against.
const control = resolve(review, "control");
mkdirSync(control, { recursive: true });
const rendered = spawnSync(blender, ["--background", "--factory-startup", "--python",
  resolve(root, "asset-src/build_warrior.py"), "--", "--review-only", "--review", control],
{ cwd: root, encoding: "utf8", stdio: "inherit", windowsHide: true });
if (rendered.error) throw rendered.error;
if (rendered.status !== 0) process.exit(rendered.status ?? 1);

const rows = ["control=accepted control (0085)",
  ...contract.variants.map(variant => `${variant}=${variant}`)];
const composed = spawnSync(resolve(root, "metric/.venv/Scripts/python.exe"),
  [resolve(root, "asset-src/v3/compose_screen_sheet.py"),
    "--review", review, "--output", resolve(review, "screen-sheet.png"),
    ...rows.flatMap(row => ["--row", row])],
  { cwd: root, encoding: "utf8", stdio: "inherit", windowsHide: true });
if (composed.error) throw composed.error;
process.exit(composed.status ?? 1);
