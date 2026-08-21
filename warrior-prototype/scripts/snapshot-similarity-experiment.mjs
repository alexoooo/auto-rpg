import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const review = resolve(root, ".review");
const views = [
  "front", "front_left", "left", "back_left",
  "back", "back_right", "right", "front_right",
];
const [experimentId, stage] = process.argv.slice(2);

if (!experimentId || !/^[0-9]{4}-[a-z0-9-]+$/.test(experimentId)) {
  throw new Error("experiment id must look like 0001-short-hypothesis");
}
if (!new Set(["baseline", "candidate"]).has(stage)) {
  throw new Error("stage must be baseline or candidate");
}

const reportPath = resolve(review, "similarity/report.json");
if (!existsSync(reportPath)) {
  throw new Error("no similarity report exists; run npm run similarity first");
}

const destination = resolve(review, "experiments", experimentId, stage);
mkdirSync(resolve(destination, "similarity"), { recursive: true });
for (const view of views) {
  copyFileSync(resolve(review, `${view}.png`), resolve(destination, `${view}.png`));
  copyFileSync(resolve(review, `${view}.parts.png`), resolve(destination, `${view}.parts.png`));
}
copyFileSync(resolve(review, "landmarks.json"), resolve(destination, "landmarks.json"));
copyFileSync(reportPath, resolve(destination, "similarity/report.json"));
copyFileSync(resolve(review, "similarity/report.html"), resolve(destination, "similarity/report.html"));

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const sourcePath = resolve(root, "asset-src/build_warrior.py");
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const componentMeans = Object.fromEntries(Object.keys(report.componentWeights).map((component) => [
  component,
  mean(Object.values(report.views).map((view) => view.components[component])),
]));
const summary = {
  schemaVersion: 1,
  experimentId,
  stage,
  distance: report.distance,
  componentMeans,
  views: Object.fromEntries(Object.entries(report.views).map(([name, view]) => [name, view.distance])),
  hashes: {
    assetSourceSha256: sha256(sourcePath),
    reportSha256: sha256(reportPath),
  },
};
writeJson(resolve(destination, "summary.json"), summary);

if (stage === "candidate") {
  const baselinePath = resolve(review, "experiments", experimentId, "baseline/summary.json");
  if (!existsSync(baselinePath)) {
    throw new Error(`candidate snapshot needs ${baselinePath}`);
  }
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const comparison = {
    schemaVersion: 1,
    experimentId,
    baselineDistance: baseline.distance,
    candidateDistance: summary.distance,
    delta: summary.distance - baseline.distance,
    relativeDelta: (summary.distance - baseline.distance) / baseline.distance,
    componentDeltas: deltas(baseline.componentMeans, summary.componentMeans),
    viewDeltas: deltas(baseline.views, summary.views),
  };
  writeJson(resolve(review, "experiments", experimentId, "comparison.json"), comparison);
  const progress = resolve(root, "experiments/progress");
  mkdirSync(progress, { recursive: true });
  copyFileSync(resolve(review, "front.png"), resolve(progress, `${experimentId}.png`));
  console.log(`distance ${baseline.distance.toFixed(6)} -> ${summary.distance.toFixed(6)} (${signed(comparison.delta)})`);
  console.log(`progress frame: ${resolve(progress, `${experimentId}.png`)}`);
} else {
  console.log(`baseline distance ${summary.distance.toFixed(6)}`);
}
console.log(`snapshot: ${destination}`);

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function deltas(baseline, candidate) {
  return Object.fromEntries(Object.keys(baseline).map((key) => [key, candidate[key] - baseline[key]]));
}

function signed(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(6)}`;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
