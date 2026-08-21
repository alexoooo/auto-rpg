import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const review = resolve(root, ".review");
mkdirSync(review, { recursive: true });

const candidates = [
  process.env.BLENDER_PATH,
  "blender",
  resolve(root, "../.tools/blender-4.5.12/blender-4.5.12-windows-x64/blender.exe"),
].filter(Boolean);

for (const executable of candidates) {
  if ((executable.includes("/") || executable.includes("\\")) && !existsSync(executable)) continue;
  const result = spawnSync(executable, [
    "--background", "--factory-startup", "--python", resolve(root, "asset-src/build_warrior.py"),
    "--", "--review-only", "--review", review,
  ], { cwd: root, encoding: "utf8", stdio: "inherit" });
  if (result.error?.code === "ENOENT") continue;
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

throw new Error("Blender was not found. Set BLENDER_PATH or install Blender on PATH.");
