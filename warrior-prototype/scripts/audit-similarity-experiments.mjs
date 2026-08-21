import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { auditExperiments } from "./experiment-state.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = auditExperiments(root);

console.log(`${result.experiments} sequential experiments (${result.activeExperiments} active, ${result.archivedPhases} archived phases)`);
console.log(`latest closed: ${result.latestClosedExperiment}`);
