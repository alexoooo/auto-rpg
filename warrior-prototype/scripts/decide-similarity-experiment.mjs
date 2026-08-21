import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decideExperiment } from "./experiment-state.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [experimentId, decision] = process.argv.slice(2);
const state = decideExperiment(root, experimentId, decision);

console.log(`${experimentId}: ${decision}`);
console.log(`accepted distance: ${state.distance.toFixed(6)}`);
