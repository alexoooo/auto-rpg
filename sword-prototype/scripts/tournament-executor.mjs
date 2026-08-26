import { createHash } from "node:crypto";

import { deployedResearchMind, decodeResearchArtifact, refuseInProgressResearchRegistration } from "../src/learning/deployment.ts";
import { randomMetaMind } from "../src/learning/meta.ts";
import { policyMind } from "../src/mind.ts";
import { scriptedMetaMind } from "../src/options.ts";
import { freezePersistenceCounts } from "../src/learning/persistence.ts";
import { mergeTournamentRows, nextTournamentBatch, validateTournamentManifest } from "../src/learning/tournament.ts";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Candidate bytes are locked to the frozen manifest before a held-out body is created. */
export function loadFrozenArtifacts(manifest, candidateBytes) {
  validateTournamentManifest(manifest); const loaded = new Map();
  for (const candidate of manifest.candidates) {
    const bytes = candidateBytes.get(candidate.name);
    if (!(bytes instanceof Uint8Array)) throw new Error(`frozen candidate "${candidate.name}" has no artifact bytes`);
    if (bytes.byteLength !== candidate.artifactBytes) throw new Error(`frozen candidate "${candidate.name}" artifact byte size changed`);
    if (sha256(bytes) !== candidate.artifactDigest) throw new Error(`frozen candidate "${candidate.name}" artifact digest changed`);
    const artifact = decodeResearchArtifact(bytes); refuseInProgressResearchRegistration(artifact);
    if (artifact.data.algorithm !== candidate.algorithm) throw new Error(`frozen candidate "${candidate.name}" algorithm changed from ${candidate.algorithm} to ${artifact.data.algorithm}`);
    loaded.set(candidate.name, artifact);
  }
  for (const name of candidateBytes.keys()) if (!manifest.candidates.some((candidate) => candidate.name === name)) {
    throw new Error(`artifact bytes supplied for unknown tournament candidate "${name}"`);
  }
  return loaded;
}

/** The specialist control for a research cell, shared with the engagement bench. */
export const specialistPolicyName = (job) => job.unit === "centipede" ? "crawler" :
  job.loadout === "bow+empty" ? "archer" : "duelist";
const specialist = (job) => policyMind(specialistPolicyName(job), job.actorSeed);
const controlMind = (name, job) => name === "random-meta-control" ? randomMetaMind(job.actorSeed) :
  name === "scripted-meta-control" ? scriptedMetaMind(job.loadout === "bow+empty" ? "archer" : "duelist", job.actorSeed) :
    name === "specialist-control" ? specialist(job) : null;

export function mindFactoryForTournament(controller, job, artifacts) {
  const control = controlMind(controller, job); if (control) return () => control;
  const artifact = artifacts.get(controller);
  if (!artifact) throw new Error(`tournament controller "${controller}" has no frozen artifact`);
  return (onDecision) => deployedResearchMind(artifact, `${job.unit}/${job.loadout}`, onDecision);
}

export function tournamentRawRow(manifest, scheduled, bout) {
  const actorWon = bout.result.winner === bout.job.actorSide;
  const outcome = bout.result.winner === null ? "draw" : actorWon ? "win" : "loss";
  return Object.freeze({ manifestDigest: manifest.digest, candidate: scheduled.candidate, index: scheduled.index,
    job: bout.job, outcome, seconds: bout.result.seconds,
    engagement: Object.freeze({ opportunities: bout.engagement.viableOpportunities, attacks: bout.engagement.attacksInWindow,
      contacts: bout.engagement.damagingContactsInWindow, nearRangeStallSeconds: bout.engagement.nearRangeStallSeconds,
      firstAttackSeconds: bout.engagement.firstAttackSeconds, meaningful: bout.engagement.damagingContactsInWindow }),
    // Both halves of the behaviour record, and the empty-map default is
    // load-bearing rather than defensive: `mindFactoryForTournament` returns
    // `() => control` for the three controls, which discards the `onDecision`
    // argument outright, so a control row's maps are genuinely `{}` and the
    // validator has to accept that. Nothing downstream reads a control's counts
    // -- `assessTournamentCandidate` runs over `manifest.candidates` alone.
    tacticCounts: Object.freeze({ ...bout.tacticCounts }),
    freeChoiceCounts: Object.freeze({ effector: Object.freeze({ ...bout.freeChoiceCounts?.effector }) }),
    // The dwell half, through the same shared freezer the validator's failure
    // reader is beside. A row that carried it under a different shape would be
    // refused at *run* time and not at check time, because nothing under
    // `scripts/` is type-checked -- which is why this is one function and not a
    // second spelling of `{ bins, freeBins }` on this side of the JSON.
    persistenceCounts: freezePersistenceCounts(bout.persistenceCounts),
    safety: Object.freeze({ finiteAnatomical: true,
      capabilities: true, postVerdict: true, stuckActions: true, lifecycle: true }) });
}

/** Execute only the frozen indexed prefix returned by the shared resume scheduler. */
export async function executeNextTournamentRows({ manifest, rows, artifacts, maximum = 1, runResearchBout = null,
  onRow = null }) {
  const scheduled = nextTournamentBatch(rows, manifest, maximum); if (!scheduled.length) return Object.freeze([...rows]);
  const run = runResearchBout ?? (await import("./research-havok.mjs")).runResearchBout;
  let merged = Object.freeze([...rows]);
  for (const entry of scheduled) {
    const job = manifest.jobs[entry.index]; const indexedJob = Object.freeze({ ...job, index: entry.index });
    const result = await run(indexedJob, mindFactoryForTournament(entry.candidate, job, artifacts),
      Math.round(job.boutCapSeconds * 240));
    const row = tournamentRawRow(manifest, entry, { ...result, job });
    merged = mergeTournamentRows(merged, [row], manifest); await onRow?.(merged, row);
  }
  return merged;
}
