/**
 * The current-code tiers. `npm test` excludes the slow files (`tests/slow.json`, whole bouts,
 * rises and loops); `npm run test:all` includes them, as CI does. Both skip the experimental
 * files (`tests/experimental.json`): measurements of how well a controller does, which a change
 * may move without breaking anything, run alone by `npm run test:experimental`. Historical
 * replays live under tests/frozen and run through `npm run test:frozen`. Further arguments go to
 * `node --test`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const all = process.argv.includes("--all");
const experimentalOnly = process.argv.includes("--experimental");
const list = (path) => {
  const files = JSON.parse(readFileSync(path, "utf8"));
  const missing = files.filter((file) => !existsSync(`tests/${file}`));
  if (missing.length) throw new Error(`${path} names files that are gone: ${missing.join(", ")}`);
  return files;
};
const slow = list("tests/slow.json");
const experimental = list("tests/experimental.json");
const both = slow.filter((file) => experimental.includes(file));
if (both.length) throw new Error(`a file is both slow and experimental: ${both.join(", ")}`);
const chosen = (file) => experimentalOnly ? experimental.includes(file)
  : !experimental.includes(file) && (all || !slow.includes(file));
const files = readdirSync("tests").filter((file) => file.endsWith(".test.mjs") && chosen(file)).map((file) => `tests/${file}`);
const passed = process.argv.slice(2).filter((arg) => arg !== "--all" && arg !== "--experimental");
const run = spawnSync(process.execPath, ["--test", ...passed, ...files], { stdio: "inherit" });
process.exit(run.status ?? 1);
