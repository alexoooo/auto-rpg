/** Compare an unpacked stock package with the installed engine through the same arena harness. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { createRapierPhysics } from "../src/core/engine/rapier.ts";
import { playBout } from "./bout.mjs";

const { values } = parseArgs({ options: { reference: { type: "string" } } });
if (!values.reference) throw new Error("--reference must name an unpacked stock Rapier SIMD package directory");
const directory = resolve(values.reference), manifest = JSON.parse(await readFile(resolve(directory, "package.json"), "utf8"));
assert.equal(manifest.name, "@dimforge/rapier3d-simd-compat");
assert.equal(manifest.version, "0.21.0");
const entry = resolve(directory, manifest.module), R = (await import(pathToFileURL(entry).href)).default;
await R.init();
const reference = { name: "rapier", createPhysics: (options) => createRapierPhysics(R, options) };
Logger.LogLevels = Logger.ErrorLogLevel;
console.log(JSON.stringify({ harness: "Node arena core world, Rapier SIMD, 120 Hz, 12 s cap, no assists",
  reference: manifest.version, referenceEntrySha256: createHash("sha256").update(await readFile(entry)).digest("hex") }));
for (const recipe of [
  { left: "workshop-fighter", right: "workshop-rogue" },
  { left: "workshop-fighter", right: "workshop-fighter", gap: 3 },
  { left: "workshop-rogue", right: "crypt-skeleton", gap: 3.5 },
]) {
  const stock = await playBout(recipe, 12, [], { physicsEngine: reference });
  const installed = await playBout(recipe, 12);
  assert.deepEqual(installed, stock, JSON.stringify(recipe));
  console.log(JSON.stringify({ recipe, digest: installed.digest, equal: true }));
}
