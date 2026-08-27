import { pathToFileURL } from "node:url";

import { CONFIG } from "../src/config.ts";
import { canonicalDigest } from "../src/learning/artifact.ts";
import { RESEARCH_ARTIFACT_CONTRACT } from "../src/learning/deployment.ts";
import { FEATURE_MIRROR_INDEX, FEATURE_MIRROR_SIGN } from "../src/learning/features.ts";
import { META_OUTPUT_LAYOUT, PERSISTENCE_SECONDS } from "../src/learning/meta.ts";
import { PPO_ROLLOUT_BUNDLE_SIZE, PPO_TRAINING_SEMANTICS_VERSION } from "../src/learning/ppo.ts";
import { TACTIC_KEY_HEADS, tacticTargets } from "../src/options.ts";
import { ENGAGEMENT_INSTRUMENT_VERSION } from "../src/recorder.ts";
import { GATE_CONTRACT, LEDGER_CONTRACT } from "./research-ledger.mjs";

/**
 * The pre-throughput interface pin. Session 20 will extend this value with its
 * measured schedules; keeping those absent now is deliberate -- an unmeasured
 * ceiling is not a contract. The mechanism is useful before that measurement:
 * all four runners can already refuse a stale feature, tactic, gate or ledger
 * interface before they create their first worker or enter the solver.
 */
export const RESEARCH_CONTRACT_SURFACE = Object.freeze({
  phase: "session20-pre-throughput-v1",
  artifact: RESEARCH_ARTIFACT_CONTRACT,
  featureMirrorIndex: FEATURE_MIRROR_INDEX,
  featureMirrorSign: FEATURE_MIRROR_SIGN,
  outputLayout: META_OUTPUT_LAYOUT,
  persistenceSeconds: PERSISTENCE_SECONDS,
  tacticTargets: Object.fromEntries(TACTIC_KEY_HEADS[1][1].map((action) => [action, tacticTargets(action)])),
  engagementInstrumentVersion: ENGAGEMENT_INSTRUMENT_VERSION,
  gates: GATE_CONTRACT,
  ledger: LEDGER_CONTRACT,
  ppoTraining: Object.freeze({ semanticsVersion: PPO_TRAINING_SEMANTICS_VERSION,
    rolloutBundleSize: PPO_ROLLOUT_BUNDLE_SIZE }),
});

export const CURRENT_RESEARCH_CONTRACT_DIGEST = canonicalDigest(RESEARCH_CONTRACT_SURFACE);
// This is a review pin, not a security signature. A surface edit moves it only
// after the edit and its refusal tests have been reviewed together.
export const FROZEN_RESEARCH_CONTRACT_DIGEST = "2f9d6462";

/** Mutable page tuning is provenance, not part of the learned interface pin. */
export const BALANCE_CONFIG_DIGEST = canonicalDigest(CONFIG);

export function requiredResearchContractDigest(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("research preflight refused: missing required --contract-digest");
  }
  if (CURRENT_RESEARCH_CONTRACT_DIGEST !== FROZEN_RESEARCH_CONTRACT_DIGEST) {
    throw new Error(`research preflight refused: frozen contract digest ${FROZEN_RESEARCH_CONTRACT_DIGEST} ` +
      `does not match runtime ${CURRENT_RESEARCH_CONTRACT_DIGEST}`);
  }
  if (value !== CURRENT_RESEARCH_CONTRACT_DIGEST) {
    throw new Error(`research preflight refused: --contract-digest ${value} does not match runtime ${CURRENT_RESEARCH_CONTRACT_DIGEST}`);
  }
  return CURRENT_RESEARCH_CONTRACT_DIGEST;
}

export function refuseStaleResearchResume(direction, savedDigest, expectedDigest) {
  if (savedDigest !== expectedDigest) {
    throw new Error(`${direction} resume refused: research contract digest changed or is missing`);
  }
}

export const contractDigestArgument = (argv) => {
  const at = argv.indexOf("--contract-digest");
  return at < 0 ? undefined : argv[at + 1];
};

export function runResearchPreflight(argv = process.argv.slice(2), output = process.stdout) {
  const supplied = contractDigestArgument(argv) ?? FROZEN_RESEARCH_CONTRACT_DIGEST;
  const digest = requiredResearchContractDigest(supplied);
  output.write(`research preflight passed ${digest}; balance ${BALANCE_CONFIG_DIGEST}\n`);
  return Object.freeze({ contractDigest: digest, balanceConfigDigest: BALANCE_CONFIG_DIGEST });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runResearchPreflight();
