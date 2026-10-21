/**
 * Every test: each `tests/*.test.mjs`, with the build's identity in the environment. Further
 * arguments go to `node --test`.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { BUILD_IDENTITY } from "./build-identity.mjs";

const files = readdirSync("tests").filter((file) => file.endsWith(".test.mjs")).map((file) => `tests/${file}`);
const run = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), ...files], { stdio: "inherit", env: { ...process.env, AUTO_RPG_BUILD_IDENTITY: BUILD_IDENTITY } });
process.exit(run.status ?? 1);
