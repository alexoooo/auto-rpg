/**
 * The test tiers. `npm test` runs every test file but the slow ones (`tests/slow.json`, whole bouts,
 * rises and loops): the check a change runs, in about a minute. `npm run test:all` runs them too, as
 * CI does. Further arguments go to `node --test`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const all = process.argv.includes("--all");
const slow = JSON.parse(readFileSync("tests/slow.json", "utf8"));
const missing = slow.filter((file) => !existsSync(`tests/${file}`));
if (missing.length) throw new Error(`tests/slow.json names files that are gone: ${missing.join(", ")}`);
const files = readdirSync("tests").filter((file) => file.endsWith(".test.mjs") && (all || !slow.includes(file))).map((file) => `tests/${file}`);
const passed = process.argv.slice(2).filter((arg) => arg !== "--all");
const run = spawnSync(process.execPath, ["--test", ...passed, ...files], { stdio: "inherit" });
process.exit(run.status ?? 1);
