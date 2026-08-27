import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalDigest } from "../src/learning/artifact.ts";
import { finalizeRun, refuseFinalizedResume } from "../scripts/research-ledger.mjs";
import { BALANCE_CONFIG_DIGEST, CURRENT_RESEARCH_CONTRACT_DIGEST, FROZEN_RESEARCH_CONTRACT_DIGEST,
  RESEARCH_CONTRACT_SURFACE, refuseStaleResearchResume,
  requiredResearchContractDigest } from "../scripts/research-preflight.mjs";

test("a_missing_or_mismatched_contract_digest_refuses_before_the_first_solver_step", async () => {
  assert.throws(() => requiredResearchContractDigest(undefined), /missing required --contract-digest/);
  assert.throws(() => requiredResearchContractDigest("feature-v3"),
    /--contract-digest feature-v3 does not match runtime/);
  assert.equal(requiredResearchContractDigest(FROZEN_RESEARCH_CONTRACT_DIGEST), CURRENT_RESEARCH_CONTRACT_DIGEST);

  const root = fileURLToPath(new URL("../", import.meta.url));
  for (const idea of ["neat-qd", "dagger", "ppo", "lookahead"]) for (const digest of [null, "feature-v3"]) {
    const runId = `preflight-refusal-${idea}-${digest ? "stale" : "missing"}-${process.pid}`;
    const args = ["scripts/research-runner.mjs", "--idea", idea, "--smoke", "--solver-steps", "8",
      "--workers", "1", "--run-id", runId];
    if (digest) args.push("--contract-digest", digest);
    const child = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 20_000 });
    assert.notEqual(child.status, 0, `${idea} unexpectedly accepted ${digest ?? "a missing digest"}`);
    assert.match(`${child.stdout}\n${child.stderr}`, digest ? /does not match runtime/ : /missing required --contract-digest/,
      `${idea} did work or refused for the wrong reason`);
    assert.equal(existsSync(join(root, "asset-src", "learning", "research", runId)), false,
      `${idea} created its run directory before contract preflight`);
  }
});

test("every_runner_persists_and_refuses_a_stale_resume_contract_before_work", async () => {
  for (const direction of ["NEAT-QD", "DAgger", "PPO", "lookahead"]) {
    assert.throws(() => refuseStaleResearchResume(direction, undefined, CURRENT_RESEARCH_CONTRACT_DIGEST),
      new RegExp(`${direction} resume refused: research contract digest changed or is missing`));
    assert.throws(() => refuseStaleResearchResume(direction, "feature-v3", CURRENT_RESEARCH_CONTRACT_DIGEST),
      /research contract digest changed or is missing/);
  }
  for (const file of ["train-neat-qd.mjs", "collect-dagger.mjs", "train-ppo.mjs", "train-lookahead.mjs"]) {
    const source = await readFile(new URL(`../scripts/${file}`, import.meta.url), "utf8");
    assert.match(source, /contractDigest/, `${file} must persist the contract digest in resume identity`);
    assert.match(source, /refuseStaleResearchResume\(/, `${file} must validate saved contract identity`);
  }
});

test("a_changed_ledger_row_schema_or_contract_table_changes_the_digest", () => {
  const ledger = { ...RESEARCH_CONTRACT_SURFACE.ledger,
    fields: RESEARCH_CONTRACT_SURFACE.ledger.fields.slice(1) };
  assert.notEqual(canonicalDigest({ ...RESEARCH_CONTRACT_SURFACE, ledger }), CURRENT_RESEARCH_CONTRACT_DIGEST);
  assert.notEqual(canonicalDigest({ ...RESEARCH_CONTRACT_SURFACE,
    featureMirrorSign: RESEARCH_CONTRACT_SURFACE.featureMirrorSign.slice(1) }), CURRENT_RESEARCH_CONTRACT_DIGEST);
});

test("a_changed_balance_constant_does_not_change_the_contract_digest_but_is_recorded", () => {
  const changedBalance = canonicalDigest({ deliberatelyChangedForTest: true });
  assert.notEqual(changedBalance, BALANCE_CONFIG_DIGEST);
  assert.equal(canonicalDigest(RESEARCH_CONTRACT_SURFACE), CURRENT_RESEARCH_CONTRACT_DIGEST);
});

test("canonical_configuration_digests_are_key_order_independent_and_page_safe", () => {
  assert.equal(canonicalDigest({ z: 1, nested: { b: 2, a: 3 } }),
    canonicalDigest({ nested: { a: 3, b: 2 }, z: 1 }));
  assert.match(CURRENT_RESEARCH_CONTRACT_DIGEST, /^[0-9a-f]{8}$/);
  assert.match(BALANCE_CONFIG_DIGEST, /^[0-9a-f]{8}$/);
});

test("a_finalized_marker_refuses_resume_even_with_an_empty_or_truncated_ledger", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sword-finalized-resume-"));
  await finalizeRun({ runDir: directory, championBytes: new Uint8Array([1]), reportBytes: new Uint8Array([2]) });
  await assert.rejects(refuseFinalizedResume(directory, "PPO", true), /PPO resume refused: run is finalized/);
  await writeFile(join(directory, "ledger.jsonl"), "{truncated");
  await assert.rejects(refuseFinalizedResume(directory, "lookahead", true), /lookahead resume refused: run is finalized/);
  assert.equal(await refuseFinalizedResume(directory, "PPO", false), undefined);
});
