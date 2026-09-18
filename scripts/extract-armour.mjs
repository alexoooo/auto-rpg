// Rebuild the small committed clothing and anatomy OBJ sources from the pinned
// CC0 archives. The archives remain ignored; the deterministic, render-only
// extracts are what the warrior build consumes.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const record = JSON.parse(await readFile(resolve(ROOT, "asset-src/armour-sources.json"), "utf8"));
const selected = Array.isArray(record.selected) ? record.selected : [record.selected];
const sources = selected.map((id) => {
  const source = record.sources.find((candidate) => candidate.id === id);
  if (!source) throw new Error(`selected appearance source "${id}" has no provenance row`);
  return source;
});

const candidates = [
  process.env.BLENDER_PATH,
  "blender",
  resolve(ROOT, "../.tools/blender-4.5.12/blender-4.5.12-windows-x64/blender.exe"),
].filter(Boolean);

for (const source of sources) {
  const archive = resolve(ROOT, source.reviewFile);
  const bytes = await readFile(archive).catch(() => null);
  if (!bytes) {
    throw new Error(`missing ${archive} -- download "${source.title}" from ${source.downloadPage ?? source.downloadUrl}`);
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== source.archiveSha256) {
    throw new Error(`${source.title} digest ${actual}; expected ${source.archiveSha256}`);
  }
  // Some selected sources are consumed directly from their digest-pinned
  // archive by the final Blender build. They still have a committed provenance
  // extract, but there is no intermediate geometry to regenerate here.
  if (!source.extractor) continue;

  let status = null;
  for (const executable of candidates) {
    if ((executable.includes("/") || executable.includes("\\")) && !existsSync(executable)) continue;
    const result = spawnSync(executable, [
      "--background", "--factory-startup", "--python", source.extractor, "--",
      "--source", source.reviewFile, "--output", source.extractRoot,
    ], { cwd: ROOT, encoding: "utf8", stdio: "inherit" });
    if (result.error?.code === "ENOENT") continue;
    if (result.error) throw result.error;
    status = result.status ?? 1;
    break;
  }
  if (status === null) throw new Error("Blender was not found. Set BLENDER_PATH or install Blender on PATH.");
  if (status !== 0) process.exit(status);
}

const verification = spawnSync(process.execPath, ["scripts/fetch-armour.mjs", "--verify"], {
  cwd: ROOT,
  encoding: "utf8",
  stdio: "inherit",
});
if (verification.error) throw verification.error;
process.exit(verification.status ?? 1);
