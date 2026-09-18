// Fetches and verifies the complete CC0 texture registry. The browser never
// reaches Poly Haven: only digest-checked files under public/assets/textures
// are runtime inputs.

import { createHash } from "node:crypto";
import { readdir, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REGISTRY = resolve(ROOT, "asset-src/textures.json");
const TARGET = resolve(ROOT, "public/assets/textures");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function validateRegistry(registry) {
  const failures = [];
  const files = new Set();
  const sources = new Map((registry.sources ?? []).map((source) => [source.sourceUrl, source]));
  for (const [sourceUrl, source] of sources) {
    if (!/^https:\/\//.test(sourceUrl ?? "")) failures.push("a source group has no authoritative URL");
    if (source.license !== "CC0-1.0" || source.licenseUrl !== "https://creativecommons.org/publicdomain/zero/1.0/") {
      failures.push(`${sourceUrl || "unnamed source"} has no exact CC0-1.0 license URL`);
    }
  }
  for (const row of registry.textures ?? []) {
    const label = row.name || row.file || "unnamed texture";
    if (!row.name) failures.push(`${label} has no logical name`);
    if (!/^https:\/\//.test(row.url ?? "")) failures.push(`${label} has no authoritative source URL`);
    if (!sources.has(row.sourceUrl)) failures.push(`${label} has no licensed source group`);
    if (!/^[0-9a-f]{64}$/.test(row.sha256 ?? "")) failures.push(`${label} has no SHA-256 digest`);
    if (!new Set(["srgb", "linear"]).has(row.colourSpace)) failures.push(`${label} has no colour space`);
    if (!new Set(["albedo", "normal", "orm"]).has(row.channel)) failures.push(`${label} has no recognised channel`);
    if (!row.family) failures.push(`${label} has no material family`);
    if (!row.consumers?.length) failures.push(`${label} has no consumer`);
    if (!row.file || basename(row.file) !== row.file) failures.push(`${label} has an unsafe target filename`);
    if (row.localUrl !== `/assets/textures/${row.file}`) failures.push(`${label} has a local URL that does not name its file`);
    if (!(row.scale > 0) || typeof row.invertY !== "boolean") failures.push(`${label} has no runtime sampling settings`);
    if (row.consumers?.some((consumer) => consumer.startsWith("room.")) && !(row.metresPerRepeat > 0)) {
      failures.push(`${label} has no physical metre-repeat contract`);
    }
    if (row.channel === "normal" && (row.normalConvention !== "opengl" || !new Set(["babylon-lh", "gltf-rh-imported"]).has(row.tangentBasis))) {
      failures.push(`${label} has no normal convention and tangent basis`);
    }
    if (files.has(row.file)) failures.push(`${label} duplicates target ${row.file}`);
    files.add(row.file);
  }
  const roomFamilies = new Map();
  for (const row of registry.textures ?? []) {
    if (!row.consumers?.some((consumer) => consumer.startsWith("room."))) continue;
    const known = roomFamilies.get(row.family);
    if (known !== undefined && known !== row.metresPerRepeat) {
      failures.push(`${row.family} disagrees about its physical metre-repeat contract`);
    }
    roomFamilies.set(row.family, row.metresPerRepeat);
  }
  if (!sources.size) failures.push("the registry has no CC0 source groups");
  return failures;
}

export async function verifyTextures(registry, directory = TARGET) {
  const failures = validateRegistry(registry);
  const declared = new Set((registry.textures ?? []).map((row) => row.file));
  const committed = new Set(await readdir(directory).catch(() => []));
  for (const row of registry.textures ?? []) {
    const bytes = await readFile(resolve(directory, row.file)).catch(() => null);
    if (!bytes) failures.push(`${row.name} is missing ${row.file}`);
    else if (digest(bytes) !== row.sha256) failures.push(`${row.name} digest ${digest(bytes)}; expected ${row.sha256}`);
  }
  for (const file of committed) {
    if (!declared.has(file)) failures.push(`${file} is committed without a registry declaration and license`);
  }
  return failures;
}

async function main() {
  const registry = JSON.parse(await readFile(REGISTRY, "utf8"));
  if (process.argv.includes("--verify")) {
    const failures = await verifyTextures(registry);
    for (const failure of failures) console.error(`FAIL ${failure}`);
    if (failures.length) process.exit(1);
    console.log(`${registry.textures.length} CC0 textures match their pins.`);
    return;
  }

  const malformed = validateRegistry(registry);
  if (malformed.length) throw new Error(malformed.join("\n"));
  await mkdir(TARGET, { recursive: true });
  const refused = [];
  for (const row of registry.textures) {
    console.log(`fetching ${row.name} (CC0) ...`);
    const response = await fetch(row.url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${row.url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const actual = digest(bytes);
    if (actual !== row.sha256) {
      refused.push(`${row.name} digest ${actual}; expected ${row.sha256} -- refusing to write ${row.file}`);
      continue;
    }
    await writeFile(resolve(TARGET, row.file), bytes);
  }
  if (refused.length) throw new Error(refused.join("\n"));
  console.log(`${registry.textures.length} digest-pinned textures fetched.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
