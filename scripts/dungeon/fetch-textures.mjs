// Registers Poly Haven texture sets for the dungeon in `src/textures.json`, downloading any it does not hold.
//
//   node scripts/dungeon/fetch-textures.mjs <asset>:<consumer>:<metresPerRepeat> ...
//
// Each asset's 1k JPG diffuse, OpenGL normal and packed AO/roughness/metal maps are read from Poly Haven's API
// rather than from a URL template: the registry already holds `_col_` and `_albedo_` names besides `_diff_`. An
// asset the registry already holds gains the consumer on its existing rows, with no download. Running it twice
// changes nothing, and it refuses a file on disk, or a row, whose sha256 disagrees with what it would write.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const registryPath = join(root, "src", "textures.json");
const textureDir = join(root, "public", "assets", "textures");
const CC0 = { license: "CC0-1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" };
const CHANNELS = [
  { channel: "albedo", key: "Diffuse", colourSpace: "srgb" },
  { channel: "normal", key: "nor_gl", colourSpace: "linear" },
  { channel: "orm", key: "arm", colourSpace: "linear" },
];

/** The registry's own layout, so that a run adds lines and rewrites none. */
function serialize(registry) {
  const value = v => JSON.stringify(v).replace(/","/g, "\", \"");
  // A span is written as a decimal, 2.0 and not 2, as the rows were written by hand.
  const format = (k, v) => k === "metresPerRepeat" && Number.isInteger(v) ? v.toFixed(1) : value(v);
  const fields = (row, keys) => keys.filter(k => row[k] !== undefined).map(k => `"${k}": ${format(k, row[k])}`).join(", ");
  const known = ["name", "file", "localUrl", "url", "sourceUrl", "sha256", "channel", "colourSpace", "family", "consumers",
    "scale", "invertY", "metresPerRepeat", "normalConvention", "tangentBasis"];
  const row = r => {
    const extra = Object.keys(r).filter(k => !known.includes(k));
    if (extra.length) throw new Error(`${r.name} has fields this script cannot lay out: ${extra.join(", ")}`);
    const lines = [fields(r, ["name", "file", "localUrl"]), fields(r, ["url", "sourceUrl"]), fields(r, ["sha256", "channel", "colourSpace"]),
      fields(r, ["family", "consumers", "scale", "invertY", "metresPerRepeat"]), fields(r, ["normalConvention", "tangentBasis"])].filter(Boolean);
    return `    {\n${lines.map(l => `      ${l}`).join(",\n")}\n    }`;
  };
  const source = s => `    { ${fields(s, ["sourceUrl", "license", "licenseUrl"])} }`;
  return `{\n  "schema": ${registry.schema},\n  "sources": [\n${registry.sources.map(source).join(",\n")}\n  ],\n`
    + `  "textures": [\n${registry.textures.map(row).join(",\n")}\n  ]\n}\n`;
}

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

async function register(registry, asset, consumer, metresPerRepeat) {
  const sourceUrl = `https://polyhaven.com/a/${asset}`;
  const family = consumer.split(".").slice(0, 2).join("-");
  const held = registry.textures.filter(r => r.sourceUrl === sourceUrl);
  if (held.length) {
    for (const r of held) {
      if (r.metresPerRepeat !== metresPerRepeat) throw new Error(`${r.name} repeats every ${r.metresPerRepeat} m, not ${metresPerRepeat}`);
      if (sha256(readFileSync(join(textureDir, r.file))) !== r.sha256) throw new Error(`${r.file} on disk is not the registered file`);
      if (!r.consumers.includes(consumer)) r.consumers.push(consumer);
    }
    console.log(`${asset}: ${consumer} is on its ${held.length} existing rows`);
    return;
  }
  const get = async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return response;
  };
  const files = await (await get(`https://api.polyhaven.com/files/${asset}`)).json();
  // Every map is fetched and checked before any is written, so a failure leaves no orphan file.
  const maps = [];
  for (const { channel, key, colourSpace } of CHANNELS) {
    const url = files[key]?.["1k"]?.jpg?.url;
    if (!url) throw new Error(`${asset} has no 1k JPG ${key} map`);
    const file = url.split("/").pop(), path = join(textureDir, file);
    const bytes = new Uint8Array(await (await get(url)).arrayBuffer()), hash = sha256(bytes);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error(`${url} is not a JPEG`);
    if (existsSync(path) && sha256(readFileSync(path)) !== hash) throw new Error(`${file} on disk differs from ${url}`);
    maps.push({ channel, colourSpace, url, file, path, bytes, hash });
  }
  for (const { channel, colourSpace, url, file, path, bytes, hash } of maps) {
    writeFileSync(path, bytes);
    registry.textures.push({
      name: `${asset.replace(/_/g, "-")}-${channel}`, file, localUrl: `/assets/textures/${file}`, url, sourceUrl, sha256: hash,
      channel, colourSpace, family, consumers: [consumer], scale: 1, invertY: false, metresPerRepeat,
      ...(channel === "normal" ? { normalConvention: "opengl", tangentBasis: "babylon-lh" } : {}),
    });
    console.log(`${file}: ${bytes.length} bytes, sha256 ${hash}`);
  }
  if (!registry.sources.some(s => s.sourceUrl === sourceUrl)) registry.sources.push({ sourceUrl, ...CC0 });
}

const text = readFileSync(registryPath, "utf8").replace(/\r\n/g, "\n"), registry = JSON.parse(text);
if (serialize(registry) !== text) throw new Error("src/textures.json is not in the layout this script writes; refusing to reformat it");
const specs = process.argv.slice(2);
if (!specs.length) throw new Error("usage: node scripts/dungeon/fetch-textures.mjs <asset>:<consumer>:<metresPerRepeat> ...");
for (const spec of specs) {
  const [asset, consumer, metres] = spec.split(":"), metresPerRepeat = Number(metres);
  if (!asset || !consumer || !(metresPerRepeat > 0)) throw new Error(`cannot read ${spec}`);
  await register(registry, asset, consumer, metresPerRepeat);
}
writeFileSync(registryPath, serialize(registry));
