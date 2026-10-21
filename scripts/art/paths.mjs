import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Lossless source exports serve measurements; compressed delivery files never do. */
export function losslessModelPath(model) {
  const root = resolve(import.meta.dirname, "../.."), id = model.replace(/^workshop-/, "");
  const catalog = JSON.parse(readFileSync(join(root, "assets/art/catalog.json"), "utf8"));
  if (!Object.hasOwn(catalog.characters, id)) throw new Error(`Unknown art model: ${model}`);
  const current = join(root, ".cache/art/current.json");
  if (!existsSync(current)) throw new Error("Character exports are missing. Run npm run assets.");
  return join(root, ".cache/art/builds", JSON.parse(readFileSync(current, "utf8")).key, "lossless", `${id}.glb`);
}
