import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const record = JSON.parse(await readFile(resolve(ROOT, "asset-src/armour-sources.json"), "utf8"));
const source = record.sources.find((candidate) => candidate.id === record.selected);
if (!source) throw new Error(`selected armour source "${record.selected}" has no provenance row`);
const output = resolve(ROOT, ".review/armour-source.zip");

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const verify = async () => {
  const bytes = await readFile(output).catch(() => null);
  if (!bytes) throw new Error(`missing ${output} -- run npm run armour:fetch`);
  const actual = digest(bytes);
  if (actual !== source.archiveSha256) {
    throw new Error(`armour archive digest ${actual}; expected ${source.archiveSha256}`);
  }
  console.log(`armour source matches ${source.archiveSha256}`);
};

if (process.argv.includes("--verify")) {
  await verify();
} else {
  const response = await fetch(source.archiveMirror);
  if (!response.ok) throw new Error(`armour fetch failed: ${response.status} ${response.statusText}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = digest(bytes);
  if (actual !== source.archiveSha256) {
    throw new Error(`refusing armour archive digest ${actual}; expected ${source.archiveSha256}`);
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, bytes);
  console.log(`wrote ${output}`);
}
