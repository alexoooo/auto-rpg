import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

export async function readConstructTrainingProgress(runDirectory) {
  const read = async (name) => { try { return JSON.parse(await readFile(join(runDirectory, name), "utf8")); }
    catch (error) { if (error?.code === "ENOENT") return null; throw error; } };
  const shards = await readdir(join(runDirectory, "shards")).catch((error) => error?.code === "ENOENT" ? [] : Promise.reject(error));
  return Object.freeze({ pointer: await read("checkpoint-current.json"), result: await read("construct-learning-result.json"),
    completedShards: shards.filter((name) => /^\d{8}\.json$/.test(name)).length });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const at = process.argv.indexOf("--run");
  if (at < 0 || !process.argv[at + 1]) throw new Error("construct watcher requires --run <directory>");
  process.stdout.write(`${JSON.stringify(await readConstructTrainingProgress(resolve(process.argv[at + 1])), null, 2)}\n`);
}

