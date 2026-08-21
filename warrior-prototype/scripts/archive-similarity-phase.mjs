import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditExperiments,
  listRecords,
  readJson,
  sha256,
  sourceSha256,
  writeJsonAtomic,
  writeProgressGallery,
} from "./experiment-state.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [phaseId, nextPhase = "phase-02"] = process.argv.slice(2);
if (!/^phase-\d{2}$/.test(phaseId ?? "")) {
  throw new Error("usage: archive-similarity-phase.mjs phase-NN [next-phase-NN]");
}

const statePath = resolve(root, "experiments/accepted-state.json");
const state = readJson(statePath);
const records = listRecords(root);
if (records.length === 0) throw new Error("the active phase has no records to archive");
if (records.some(({ status }) => status === "proposed")) {
  throw new Error("a phase with a proposed experiment cannot be archived");
}
if (records.at(-1).id !== state.latestClosedExperiment) {
  throw new Error("the active records do not end at the accepted-state checkpoint");
}
if (sourceSha256(resolve(root, "asset-src/build_warrior.py")) !== state.assetSourceSha256) {
  throw new Error("the current source does not match the accepted checkpoint");
}
auditExperiments(root);

const archive = resolve(root, "experiments/archive", phaseId);
if (existsSync(resolve(archive, "manifest.json"))) {
  throw new Error(`${phaseId} is already archived`);
}
const contactSheet = resolve(archive, "front-contact-sheet.png");
if (!existsSync(contactSheet)) {
  throw new Error(`create the phase contact sheet before archiving: ${contactSheet}`);
}
mkdirSync(archive, { recursive: true });

const experiments = records.map((record) => {
  const directory = resolve(root, ".review/experiments", record.id);
  const baseline = readJson(resolve(directory, "baseline/summary.json"));
  const candidate = readJson(resolve(directory, "candidate/summary.json"));
  const comparison = readJson(resolve(directory, "comparison.json"));
  return {
    id: record.id,
    title: record.title,
    status: record.status,
    baselineDistance: baseline.distance,
    candidateDistance: candidate.distance,
    delta: comparison.delta,
    componentDeltas: comparison.componentDeltas,
    viewDeltas: comparison.viewDeltas,
    hashes: {
      recordSha256: sha256(record.path),
      progressSha256: sha256(resolve(root, "experiments/progress", `${record.id}.png`)),
      baselineSourceSha256: baseline.hashes.assetSourceSha256,
      candidateSourceSha256: candidate.hashes.assetSourceSha256,
      baselineReportSha256: baseline.hashes.reportSha256,
      candidateReportSha256: candidate.hashes.reportSha256,
    },
  };
});
const firstBaseline = experiments[0].baselineDistance;
const ledger = [
  `# ${phaseId} full experiment ledger`,
  "",
  "This file preserves the complete text of the individual phase-01 records after",
  "their consolidation. Headings are separated by horizontal rules; original source",
  "and evidence hashes remain in each record and in `manifest.json`.",
  "",
  ...records.flatMap((record) => [
    "---",
    "",
    record.text.trim().replace(
      /\[[^\]]+\]\(progress\/[^)]+\.png\)/g,
      "[phase contact sheet](front-contact-sheet.png)",
    ),
    "",
  ]),
].join("\n");
writeFileSync(resolve(archive, "ledger.md"), `${ledger.trim()}\n`, "utf8");

const manifest = {
  schemaVersion: 1,
  phaseId,
  firstExperiment: records[0].id,
  lastExperiment: records.at(-1).id,
  recordCount: records.length,
  initialDistance: firstBaseline,
  acceptedCheckpoint: {
    experimentId: state.latestAcceptedExperiment,
    distance: state.distance,
    assetSourceSha256: state.assetSourceSha256,
    reportSha256: state.reportSha256,
  },
  contactSheetSha256: sha256(contactSheet),
  experiments,
};
writeJsonAtomic(resolve(archive, "manifest.json"), manifest);
const debriefLink = phaseId === "phase-01"
  ? `- [Durable debrief](../../../docs/analysis/phase-01-similarity-debrief.md)\n`
  : "";
writeFileSync(resolve(archive, "README.md"), `# Similarity experiment ${phaseId}\n\n` +
  `This compact archive preserves ${records.length} closed experiments from ` +
  `\`${records[0].id}\` through \`${records.at(-1).id}\`. The accepted checkpoint ` +
  `is \`${state.latestAcceptedExperiment}\` at \`${state.distance}\`.\n\n` +
  debriefLink +
  `- [Complete record text](ledger.md)\n` +
  `- [Machine-readable manifest](manifest.json)\n` +
  `- [Front-render contact sheet](front-contact-sheet.png)\n\n` +
  `Full baseline/candidate renders were temporary local evidence. Their report, source, ` +
  `progress, component, and view hashes remain in the manifest and ledger; the generated ` +
  `\`.review\` tree is deliberately removed when the phase closes.\n`, "utf8");

const manifestSha256 = sha256(resolve(archive, "manifest.json"));
const archivedPhase = {
  phaseId,
  firstExperiment: manifest.firstExperiment,
  lastExperiment: manifest.lastExperiment,
  recordCount: manifest.recordCount,
  manifestSha256,
  acceptedCheckpoint: manifest.acceptedCheckpoint,
};
writeJsonAtomic(statePath, {
  ...state,
  schemaVersion: 2,
  activePhase: nextPhase,
  archivedPhases: [...(state.archivedPhases ?? []), archivedPhase],
});

for (const record of records) rmSync(record.path, { force: true });
for (const name of ["0000-baseline.png", ...records.map(({ id }) => `${id}.png`)]) {
  rmSync(resolve(root, "experiments/progress", name), { force: true });
}
rmSync(resolve(root, ".review"), { recursive: true, force: true });
writeProgressGallery(root);
const result = auditExperiments(root);
console.log(`${phaseId}: archived ${records.length} records; next experiment is ${String(result.experiments + 1).padStart(4, "0")}`);
