import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { canonicalIntegrityJson, integrityDigest } from "../src/construct/integrity.ts";
import { constructCheckpointDigest, decodeConstructCheckpoint, encodeConstructCheckpoint } from
  "../src/construct/learning/checkpoint.ts";

const pad = (value) => String(value).padStart(8, "0");
const bytes = (value) => new TextEncoder().encode(canonicalIntegrityJson(value));

const atomicFile = async (path, data) => {
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, data);
  await rename(temporary, path);
};

export async function writeConstructCheckpointBundle(runDirectory, checkpoint, status = "running") {
  if (status !== "running" && status !== "terminal") throw new Error(`construct checkpoint status "${status}" is invalid`);
  const checkpointBytes = encodeConstructCheckpoint(checkpoint);
  decodeConstructCheckpoint(checkpointBytes);
  const digest = constructCheckpointDigest(checkpoint);
  const name = `checkpoint-${pad(checkpoint.optimizer.update)}-${status}`;
  const finalDirectory = join(runDirectory, "checkpoints", name);
  const temporaryDirectory = `${finalDirectory}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(temporaryDirectory, { recursive: true });
  const manifest = Object.freeze({ version: 1, name, status, checkpointDigest: digest,
    checkpointBytes: checkpointBytes.byteLength, update: checkpoint.optimizer.update,
    completedShards: checkpoint.completedShards });
  const manifestBytes = bytes(manifest);
  await writeFile(join(temporaryDirectory, "checkpoint.json"), checkpointBytes);
  await writeFile(join(temporaryDirectory, "manifest.json"), manifestBytes);
  decodeConstructCheckpoint(new Uint8Array(await readFile(join(temporaryDirectory, "checkpoint.json"))));
  const decodedManifest = JSON.parse(await readFile(join(temporaryDirectory, "manifest.json"), "utf8"));
  if (decodedManifest.checkpointDigest !== digest) throw new Error("construct checkpoint bundle self-check failed");
  try {
    await stat(finalDirectory);
    const known = await readConstructCheckpointBundle(finalDirectory);
    if (known.manifest.checkpointDigest !== digest) {
      throw new Error(`construct checkpoint bundle ${name} already exists with different bytes`);
    }
    await rm(temporaryDirectory, { recursive: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(join(runDirectory, "checkpoints"), { recursive: true });
    await rename(temporaryDirectory, finalDirectory);
  }
  const pointer = bytes(Object.freeze({ version: 1, name, checkpointDigest: digest }));
  await atomicFile(join(runDirectory, "checkpoint-current.json"), pointer);
  return Object.freeze({ directory: finalDirectory, manifest });
}

export async function readConstructCheckpointBundle(directory) {
  const checkpointBytes = new Uint8Array(await readFile(join(directory, "checkpoint.json")));
  const checkpoint = decodeConstructCheckpoint(checkpointBytes);
  const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
  if (manifest.version !== 1 || manifest.checkpointDigest !== constructCheckpointDigest(checkpoint) ||
      manifest.checkpointBytes !== checkpointBytes.byteLength) {
    throw new Error("construct checkpoint bundle manifest does not match its checkpoint bytes");
  }
  return Object.freeze({ checkpoint, manifest: Object.freeze(manifest) });
}

export async function readCurrentConstructCheckpointBundle(runDirectory) {
  let pointer;
  try { pointer = JSON.parse(await readFile(join(runDirectory, "checkpoint-current.json"), "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  if (pointer.version !== 1 || typeof pointer.name !== "string" || typeof pointer.checkpointDigest !== "string") {
    throw new Error("construct checkpoint pointer is invalid");
  }
  const bundle = await readConstructCheckpointBundle(join(runDirectory, "checkpoints", pointer.name));
  if (bundle.manifest.checkpointDigest !== pointer.checkpointDigest) {
    throw new Error("construct checkpoint pointer digest does not match its bundle");
  }
  return bundle;
}

export const constructBundleManifestDigest = (manifest) => integrityDigest(canonicalIntegrityJson(manifest));
