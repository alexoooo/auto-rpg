import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";

export const VIEWS = [
  "front", "front_left", "left", "back_left",
  "back", "back_right", "right", "front_right",
];

const RECORD_PATTERN = /^(\d{4})-([a-z0-9-]+)\.md$/;
const REQUIRED_PREREGISTRATION = [
  "Observation", "Hypothesis", "Change boundary", "Expected movement", "Reject if",
];

export function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function sourceSha256(path) {
  const source = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(source).digest("hex");
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJsonAtomic(path, value) {
  writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeTextAtomic(path, value) {
  const temporary = `${path}.tmp`;
  if (existsSync(temporary)) rmSync(temporary, { force: true });
  writeFileSync(temporary, value, "utf8");
  renameSync(temporary, path);
}

export function listRecords(root) {
  const directory = resolve(root, "experiments");
  return readdirSync(directory)
    .map((name) => ({ name, match: RECORD_PATTERN.exec(name) }))
    .filter(({ match }) => match)
    .map(({ name, match }) => readRecord(resolve(directory, name), Number(match[1])))
    .sort((left, right) => left.number - right.number);
}

export function readRecord(path, expectedNumber = undefined) {
  const text = readFileSync(path, "utf8");
  const nameMatch = RECORD_PATTERN.exec(basename(path));
  if (!nameMatch) throw new Error(`experiment record has an invalid name: ${path}`);
  const number = Number(nameMatch[1]);
  if (expectedNumber !== undefined && number !== expectedNumber) {
    throw new Error(`experiment number mismatch in ${path}`);
  }
  const title = /^# \d{4}:\s*(.+)$/m.exec(text)?.[1]?.trim();
  const status = /^Status:\s*([a-z]+)\s*$/m.exec(text)?.[1];
  if (!title || !status) throw new Error(`experiment record lacks a title or status: ${path}`);
  return { id: basename(path, ".md"), number, path, status, text, title };
}

export function validatePreregistration(record) {
  if (record.status !== "proposed") {
    throw new Error(`${record.id} must have Status: proposed while it is being measured`);
  }
  const section = sectionText(record.text, "Pre-registration");
  for (let index = 0; index < REQUIRED_PREREGISTRATION.length; index += 1) {
    const label = REQUIRED_PREREGISTRATION[index];
    const next = REQUIRED_PREREGISTRATION[index + 1];
    const marker = `- ${label}:`;
    const start = section.indexOf(marker);
    const end = next ? section.indexOf(`- ${next}:`, start + marker.length) : section.length;
    const value = start >= 0 && end >= 0 ? section.slice(start + marker.length, end) : "";
    if (!stripMarkdownContinuation(value)) {
      throw new Error(`${record.id} has an empty pre-registration field: ${label}`);
    }
  }
}

export function validateReviewOutputs(root) {
  const review = resolve(root, ".review");
  const reportPath = resolve(review, "similarity/report.json");
  if (!existsSync(reportPath)) throw new Error("no canonical similarity report exists");
  const report = readJson(reportPath);
  if (report.canonical !== true) throw new Error("experiment snapshots require a canonical report");
  if (!report.inputs?.candidate || !report.inputs.candidateLandmarksSha256) {
    throw new Error("similarity report does not identify its candidate inputs");
  }
  for (const view of VIEWS) {
    const inputs = report.inputs.candidate[view];
    if (!inputs) throw new Error(`similarity report lacks candidate hashes for ${view}`);
    assertHash(resolve(review, `${view}.png`), inputs.beautySha256, `${view} beauty render`);
    assertHash(resolve(review, `${view}.parts.png`), inputs.partsSha256, `${view} parts render`);
    requireFile(resolve(review, "similarity", `${view}-mask-overlay.png`));
  }
  assertHash(resolve(review, "landmarks.json"), report.inputs.candidateLandmarksSha256, "candidate landmarks");
  requireFile(resolve(review, "similarity/report.html"));
  return { report, reportPath };
}

export function snapshotExperiment(root, experimentId, stage) {
  validateExperimentId(experimentId);
  if (!new Set(["baseline", "candidate"]).has(stage)) throw new Error("stage must be baseline or candidate");
  const state = readJson(resolve(root, "experiments/accepted-state.json"));
  const records = listRecords(root);
  const record = records.find(({ id }) => id === experimentId);
  if (!record) throw new Error(`missing experiment record experiments/${experimentId}.md`);
  validatePreregistration(record);
  const expectedNumber = experimentNumber(state.latestClosedExperiment) + 1;
  if (record.number !== expectedNumber || records.at(-1)?.id !== record.id) {
    throw new Error(`${experimentId} must be the next sequential experiment ${pad(expectedNumber)}`);
  }

  const sourcePath = resolve(root, "asset-src/build_warrior.py");
  const sourceHash = sourceSha256(sourcePath);
  const experimentDirectory = resolve(root, ".review/experiments", experimentId);
  const destination = resolve(experimentDirectory, stage);
  if (existsSync(destination)) throw new Error(`${stage} snapshot already exists for ${experimentId}`);
  if (stage === "baseline" && sourceHash !== state.assetSourceSha256) {
    throw new Error("baseline source does not match the accepted-state checkpoint");
  }
  const baselinePath = resolve(experimentDirectory, "baseline/summary.json");
  if (stage === "candidate") {
    if (!existsSync(baselinePath)) throw new Error("candidate snapshot requires an immutable baseline");
    if (existsSync(resolve(experimentDirectory, "comparison.json"))) {
      throw new Error(`comparison already exists for ${experimentId}`);
    }
    if (sourceHash === readJson(baselinePath).hashes.assetSourceSha256) {
      throw new Error("candidate source is byte-identical to its baseline");
    }
  }

  const { report, reportPath } = validateReviewOutputs(root);
  const temporary = `${destination}.tmp`;
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
  mkdirSync(resolve(temporary, "similarity"), { recursive: true });
  try {
    const review = resolve(root, ".review");
    for (const view of VIEWS) {
      copyFileSync(resolve(review, `${view}.png`), resolve(temporary, `${view}.png`));
      copyFileSync(resolve(review, `${view}.parts.png`), resolve(temporary, `${view}.parts.png`));
      copyFileSync(resolve(review, "similarity", `${view}-mask-overlay.png`), resolve(temporary, "similarity", `${view}-mask-overlay.png`));
    }
    copyFileSync(resolve(review, "landmarks.json"), resolve(temporary, "landmarks.json"));
    copyFileSync(reportPath, resolve(temporary, "similarity/report.json"));
    copyFileSync(resolve(review, "similarity/report.html"), resolve(temporary, "similarity/report.html"));
    copyFileSync(sourcePath, resolve(temporary, "asset-source.py"));
    const summary = makeSummary(experimentId, stage, report, sourceHash, sha256(reportPath));
    writeFileSync(resolve(temporary, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    const finalReview = validateReviewOutputs(root);
    if (sourceSha256(sourcePath) !== sourceHash || sha256(finalReview.reportPath) !== summary.hashes.reportSha256) {
      throw new Error("source or report changed while the snapshot was being captured");
    }
    renameSync(temporary, destination);
    if (stage === "candidate") {
      const comparisonPath = resolve(experimentDirectory, "comparison.json");
      writeJsonAtomic(comparisonPath, compareSummaries(readJson(baselinePath), summary));
    }
    return summary;
  } catch (error) {
    if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

export function decideExperiment(root, experimentId, decision) {
  validateExperimentId(experimentId);
  if (!new Set(["accepted", "rejected"]).has(decision)) throw new Error("decision must be accepted or rejected");
  const statePath = resolve(root, "experiments/accepted-state.json");
  const state = readJson(statePath);
  const record = readRecord(resolve(root, "experiments", `${experimentId}.md`));
  validatePreregistration(record);
  if (record.number !== experimentNumber(state.latestClosedExperiment) + 1) {
    throw new Error(`${experimentId} is not the next experiment awaiting a decision`);
  }
  const diagnostics = sectionText(record.text, "Diagnostics and visual review");
  if (!/all eight/i.test(diagnostics)) throw new Error("decision requires a recorded review of all eight views");
  const decisionText = /(?:^|\n)- Decision:\s*([\s\S]*?)(?=\n- [A-Z]|\n##|$)/.exec(record.text)?.[1];
  if (!stripMarkdownContinuation(decisionText ?? "")) {
    throw new Error("decision requires a completed Decision field in the experiment record");
  }

  const directory = resolve(root, ".review/experiments", experimentId);
  const baseline = readJson(resolve(directory, "baseline/summary.json"));
  const candidate = readJson(resolve(directory, "candidate/summary.json"));
  const comparison = readJson(resolve(directory, "comparison.json"));
  const sourceHash = sourceSha256(resolve(root, "asset-src/build_warrior.py"));
  if (decision === "accepted") {
    if (comparison.delta > -0.001) throw new Error(`accepted experiment needs a delta of at most -0.001; got ${comparison.delta}`);
    if (sourceHash !== candidate.hashes.assetSourceSha256) throw new Error("accepted source no longer matches the captured candidate");
  } else if (sourceHash !== baseline.hashes.assetSourceSha256) {
    throw new Error("rejected experiment must be reverted to its captured baseline before deciding");
  }

  const progressPath = resolve(root, "experiments/progress", `${experimentId}.png`);
  if (existsSync(progressPath)) throw new Error(`progress frame already exists: ${progressPath}`);
  copyFileSync(resolve(directory, "candidate/front.png"), progressPath);
  writeTextAtomic(record.path, record.text.replace(/^Status:\s*proposed\s*$/m, `Status: ${decision}`));
  const nextState = {
    ...state,
    latestClosedExperiment: experimentId,
    ...(decision === "accepted" ? {
      latestAcceptedExperiment: experimentId,
      distance: candidate.distance,
      assetSourceSha256: candidate.hashes.assetSourceSha256,
      reportSha256: candidate.hashes.reportSha256,
    } : {}),
  };
  writeJsonAtomic(statePath, nextState);
  writeProgressGallery(root);
  auditExperiments(root);
  return nextState;
}

export function auditExperiments(root) {
  const records = listRecords(root);
  const state = readJson(resolve(root, "experiments/accepted-state.json"));
  const closedNumber = experimentNumber(state.latestClosedExperiment);
  const archived = verifyArchivedPhases(root, state);
  const phaseBaseNumber = archived?.lastNumber ?? 0;
  const firstActiveNumber = phaseBaseNumber + 1;
  let proposed = 0;
  records.forEach((record, index) => {
    if (record.number !== firstActiveNumber + index) {
      throw new Error(`active experiment IDs are not contiguous at ${record.id}`);
    }
    if (record.status === "proposed") {
      proposed += 1;
      validatePreregistration(record);
      if (record.number !== closedNumber + 1) throw new Error(`${record.id} is not next after the checkpoint`);
    } else if (!new Set(["accepted", "rejected"]).has(record.status)) {
      throw new Error(`${record.id} has unsupported status ${record.status}`);
    }
    if (record.number <= closedNumber && record.status === "proposed") throw new Error(`${record.id} is recorded as closed but remains proposed`);
    if (record.number > closedNumber + 1) throw new Error(`${record.id} is ahead of the accepted-state checkpoint`);
  });
  if (proposed > 1) throw new Error("only one experiment may be proposed at a time");
  const closedActiveIndex = closedNumber - firstActiveNumber;
  if (closedNumber > phaseBaseNumber && records[closedActiveIndex]?.id !== state.latestClosedExperiment) {
    throw new Error("accepted-state latestClosedExperiment does not match the record sequence");
  }
  if (closedNumber === phaseBaseNumber && state.latestClosedExperiment !== archived?.lastExperiment) {
    throw new Error("accepted-state latestClosedExperiment does not match the archived phase checkpoint");
  }

  const historyStart = archived ? firstActiveNumber : experimentNumber(state.continuityEnforcedAfter);
  const startRecord = archived ? undefined : records[historyStart - 1];
  const startCandidate = archived ? undefined : stageSummary(root, startRecord.id, "candidate");
  let acceptedHash = archived?.acceptedCheckpoint.assetSourceSha256
    ?? startCandidate.hashes.assetSourceSha256;
  let acceptedDistance = archived?.acceptedCheckpoint.distance ?? startCandidate.distance;
  let acceptedExperiment = archived?.acceptedCheckpoint.experimentId ?? startRecord.id;
  for (const record of records) {
    if (record.number > closedNumber) continue;
    const baseline = stageSummary(root, record.id, "baseline");
    const candidate = stageSummary(root, record.id, "candidate");
    const comparison = readJson(resolve(root, ".review/experiments", record.id, "comparison.json"));
    verifyComparison(baseline, candidate, comparison);
    assertHash(resolve(root, ".review/experiments", record.id, "baseline/similarity/report.json"), baseline.hashes.reportSha256, `${record.id} baseline report`);
    assertHash(resolve(root, ".review/experiments", record.id, "candidate/similarity/report.json"), candidate.hashes.reportSha256, `${record.id} candidate report`);
    requireFile(resolve(root, "experiments/progress", `${record.id}.png`));
    if (record.number > historyStart) {
      if (baseline.hashes.assetSourceSha256 !== acceptedHash) throw new Error(`${record.id} baseline does not continue from the accepted source`);
      if (record.status === "accepted") {
        acceptedHash = candidate.hashes.assetSourceSha256;
        acceptedDistance = candidate.distance;
        acceptedExperiment = record.id;
      }
    }
  }
  if (acceptedHash !== state.assetSourceSha256 || acceptedDistance !== state.distance || acceptedExperiment !== state.latestAcceptedExperiment) {
    throw new Error("accepted-state checkpoint disagrees with experiment history");
  }
  if (sourceSha256(resolve(root, "asset-src/build_warrior.py")) !== state.assetSourceSha256) {
    throw new Error("current asset source differs from the accepted-state checkpoint");
  }
  const gallery = readFileSync(resolve(root, "experiments/progress/README.md"), "utf8");
  for (const record of records.filter(({ number }) => number <= closedNumber)) {
    if (!gallery.includes(record.id)) throw new Error(`progress gallery omits ${record.id}`);
  }
  return {
    experiments: phaseBaseNumber + records.length,
    activeExperiments: records.length,
    archivedPhases: state.archivedPhases?.length ?? 0,
    latestClosedExperiment: state.latestClosedExperiment,
  };
}

export function writeProgressGallery(root) {
  const records = listRecords(root).filter(({ status }) => status !== "proposed");
  const state = readJson(resolve(root, "experiments/accepted-state.json"));
  const archived = state.archivedPhases?.at(-1);
  const initial = archived?.acceptedCheckpoint.distance
    ?? stageSummary(root, records[0].id, "baseline").distance;
  let acceptedDistance = initial;
  const rows = records.map((record) => {
    const candidate = stageSummary(root, record.id, "candidate");
    if (record.status === "accepted") acceptedDistance = candidate.distance;
    return { record, candidateDistance: candidate.distance, acceptedDistance };
  });
  const table = rows.map(({ record, candidateDistance, acceptedDistance: after }) =>
    `| [${pad(record.number)}: ${record.title}](../${record.id}.md) | ${candidateDistance.toFixed(6)} | ${after.toFixed(6)} | ${record.status} | [open](${record.id}.png) |`,
  ).join("\n");
  const figures = rows.map(({ record }) =>
    `## ${pad(record.number)}: ${record.title}${record.status === "rejected" ? " (rejected)" : ""}\n\n![Iteration ${pad(record.number)}](${record.id}.png)`,
  ).join("\n\n");
  const archiveLead = archived
    ? `Phase ${state.activePhase ?? "active"} starts from ${archived.acceptedCheckpoint.experimentId} at ${initial.toFixed(6)}. The prior visual history is in [${archived.phaseId}](../archive/${archived.phaseId}/README.md).`
    : "The initial baseline is retained as `0000-baseline.png`.";
  const baselineRow = archived
    ? `| Phase baseline | ${initial.toFixed(6)} | ${initial.toFixed(6)} | starting point | [archive](../archive/${archived.phaseId}/front-contact-sheet.png) |`
    : `| Initial baseline | ${initial.toFixed(6)} | ${initial.toFixed(6)} | starting point | [open](0000-baseline.png) |`;
  const baselineFigure = archived
    ? ""
    : "## Initial baseline\n\n![Initial baseline](0000-baseline.png)\n\n";
  const document = `# Visual progress\n\n${archiveLead}\n\nOnly the active phase keeps one tracked frame per experiment. Completed phases are\ncompacted according to the transition protocol.\n\n| Stage | Candidate distance | Accepted distance after | Decision | Front render |\n| --- | ---: | ---: | --- | --- |\n${baselineRow}\n${table}\n\n${baselineFigure}${figures}\n`;
  writeTextAtomic(resolve(root, "experiments/progress/README.md"), `${document.trimEnd()}\n`);
}

function verifyArchivedPhases(root, state) {
  const phases = state.archivedPhases ?? [];
  if (phases.length === 0) return undefined;
  let expectedFirst = 1;
  for (const phase of phases) {
    const manifestPath = resolve(root, "experiments/archive", phase.phaseId, "manifest.json");
    assertHash(manifestPath, phase.manifestSha256, `${phase.phaseId} manifest`);
    const manifest = readJson(manifestPath);
    const firstNumber = experimentNumber(manifest.firstExperiment);
    const lastNumber = experimentNumber(manifest.lastExperiment);
    if (firstNumber !== expectedFirst || manifest.recordCount !== lastNumber - firstNumber + 1) {
      throw new Error(`${phase.phaseId} archive range is not contiguous`);
    }
    if (manifest.lastExperiment !== phase.lastExperiment
        || manifest.acceptedCheckpoint.experimentId !== phase.acceptedCheckpoint.experimentId
        || manifest.acceptedCheckpoint.distance !== phase.acceptedCheckpoint.distance
        || manifest.acceptedCheckpoint.assetSourceSha256 !== phase.acceptedCheckpoint.assetSourceSha256
        || manifest.acceptedCheckpoint.reportSha256 !== phase.acceptedCheckpoint.reportSha256) {
      throw new Error(`${phase.phaseId} archive checkpoint disagrees with accepted-state`);
    }
    expectedFirst = lastNumber + 1;
  }
  const last = phases.at(-1);
  return {
    ...last,
    lastNumber: experimentNumber(last.lastExperiment),
  };
}

function makeSummary(experimentId, stage, report, sourceHash, reportHash) {
  const componentMeans = Object.fromEntries(Object.keys(report.componentWeights).map((component) => [
    component,
    mean(Object.values(report.views).map((view) => view.components[component])),
  ]));
  return {
    schemaVersion: 2,
    experimentId,
    stage,
    distance: report.distance,
    componentMeans,
    views: Object.fromEntries(Object.entries(report.views).map(([name, view]) => [name, view.distance])),
    hashes: { assetSourceSha256: sourceHash, reportSha256: reportHash },
  };
}

function compareSummaries(baseline, candidate) {
  return {
    schemaVersion: 1,
    experimentId: candidate.experimentId,
    baselineDistance: baseline.distance,
    candidateDistance: candidate.distance,
    delta: candidate.distance - baseline.distance,
    relativeDelta: (candidate.distance - baseline.distance) / baseline.distance,
    componentDeltas: deltas(baseline.componentMeans, candidate.componentMeans),
    viewDeltas: deltas(baseline.views, candidate.views),
  };
}

function stageSummary(root, id, stage) {
  return readJson(resolve(root, ".review/experiments", id, stage, "summary.json"));
}

function verifyComparison(baseline, candidate, comparison) {
  if (comparison.experimentId !== candidate.experimentId || comparison.baselineDistance !== baseline.distance || comparison.candidateDistance !== candidate.distance || comparison.delta !== candidate.distance - baseline.distance) {
    throw new Error(`${candidate.experimentId} comparison disagrees with its stage summaries`);
  }
}

function assertHash(path, expected, label) {
  requireFile(path);
  const actual = sha256(path);
  if (actual !== expected) throw new Error(`${label} hash mismatch: expected ${expected}, got ${actual}`);
}

function requireFile(path) {
  if (!existsSync(path)) throw new Error(`required evidence is missing: ${path}`);
}

function sectionText(text, heading) {
  const marker = `## ${heading}`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`experiment record lacks the ${heading} section`);
  const contentStart = text.indexOf("\n", start + marker.length);
  if (contentStart < 0) return "";
  const next = text.indexOf("\n## ", contentStart + 1);
  return text.slice(contentStart + 1, next < 0 ? text.length : next);
}

function stripMarkdownContinuation(value) {
  return value.replace(/\n\s+/g, " ").trim();
}

function validateExperimentId(id) {
  if (!/^\d{4}-[a-z0-9-]+$/.test(id)) throw new Error("invalid experiment ID");
}

function experimentNumber(id) {
  const match = /^(\d{4})-/.exec(id ?? "");
  if (!match) throw new Error(`invalid checkpoint experiment ID: ${id}`);
  return Number(match[1]);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function deltas(baseline, candidate) {
  return Object.fromEntries(Object.keys(baseline).map((key) => [key, candidate[key] - baseline[key]]));
}

function pad(value) {
  return String(value).padStart(4, "0");
}
