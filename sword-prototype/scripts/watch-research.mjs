import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ledgerStatus, readLedger } from "./research-ledger.mjs";

const argv = process.argv.slice(2);
const value = (name) => { const at = argv.indexOf(`--${name}`); return at < 0 ? null : argv[at + 1]; };

export function formatResearchStatus(rows) {
  const status = ledgerStatus(rows);
  if (!status) return "No complete ledger rows yet.";
  const { last } = status;
  const gates = last.gates.map((gate) => gate.status === "measured"
    ? `  ${gate.name}: ${gate.value} (${gate.comparison} ${gate.threshold}, margin ${Number(gate.margin) >= 0 ? "+" : ""}${gate.margin})`
    : `  ${gate.name}: unavailable -- ${gate.reason}`).join("\n");
  return [last.summary, `best ${last.objective.name}: ${status.best} at row ${status.bestRow}`,
    `rows since improvement: ${status.rowsSinceImprovement}`,
    `elapsed: ${last.wallSeconds}s; observed: ${last.stepsPerSecond} steps/s`,
    "gates:", gates, status.stop ?? "running"].join("\n");
}

async function print(path) { process.stdout.write(`${formatResearchStatus(await readLedger(path))}\n`); }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const run = value("run");
  if (!run) throw new Error("ai:watch requires --run <directory>");
  const ledger = resolve(run, "ledger.jsonl"); await print(ledger);
  if (argv.includes("--follow")) {
    let rowsSeen = (await readLedger(ledger)).length;
    const interval = setInterval(async () => { try { const rows = await readLedger(ledger);
      if (rows.length !== rowsSeen) { rowsSeen = rows.length; process.stdout.write(`${formatResearchStatus(rows)}\n`); }
    } catch (error) { console.error(error); } }, 500);
    process.once("SIGINT", () => clearInterval(interval));
  }
}
