import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { snapshotExperiment } from "./experiment-state.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [experimentId, stage] = process.argv.slice(2);
const summary = snapshotExperiment(root, experimentId, stage);

if (stage === "candidate") {
  console.log(`candidate distance ${summary.distance.toFixed(6)}`);
  console.log("inspect all eight views, revert rejected work, then run similarity:experiment:decide");
} else {
  console.log(`baseline distance ${summary.distance.toFixed(6)}`);
}
console.log(`snapshot: ${resolve(root, ".review/experiments", experimentId, stage)}`);
