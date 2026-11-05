/**
 * Every test below `tests/`, with the build's identity in the environment. Further
 * arguments go to `node --test`. A file's process exits once its tests have ended
 * (`--test-force-exit`): a handle a failed test left open (a message channel, a timer) would
 * otherwise hold it alive, and the gate would wait on it without a word of what failed.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { BUILD_IDENTITY } from "./build-identity.mjs";

const files = readdirSync("tests", { recursive: true }).filter((file) => file.endsWith(".test.mjs"))
  .map((file) => `tests/${file.replaceAll("\\", "/")}`).sort();
const run = spawnSync(process.execPath, ["--test", "--test-force-exit", ...process.argv.slice(2), ...files], { stdio: "inherit", env: { ...process.env, AUTO_RPG_BUILD_IDENTITY: BUILD_IDENTITY } });
process.exit(run.status ?? 1);
