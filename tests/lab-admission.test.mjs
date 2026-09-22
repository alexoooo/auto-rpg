import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { admissionEvidence, validateEvaluationSources, admissionAllowance } from "../research/admit-lab.mjs";
import { AUTHORIZATION } from "../research/lab/wave4-protocol.mjs";
import { digest } from "../research/schedule.mjs";
import { validatePublishedLabPolicy } from "../src/golem/researched-lab-policies.ts";
import { constantResidual, POSE_FIELDS } from "../research/constant-search.mjs";

function fixture() {
  const spec = { kind: "bespoke", name: "paired" };
  const rows = Array.from({ length: 32 }, (_, seed) => ["left", "right"].map((side) =>
    ({ split: "dual-confirmation", seed, side, build: "two-blades", opponent: "golem-champion", score: 1, truncated: false }))).flat();
  return { proposal: { labFingerprint: "current", entry: { name: "golem-researched-paired-v1", label: "Golem paired", spec,
    admission: { evaluatedAt: "2026-09-21", reviewedAt: "2026-09-21", evidence: "test", scope: "dual-weapon specialist" } },
    review: { accepted: true, policyHash: digest(spec), notes: "reviewed", scenarios: ["dual", "fallback"], reviewedAt: "2026-09-21" } },
    candidate: { policy: spec, split: "dual-confirmation", maxSeconds: 150, rows },
    control: { policy: { kind: "baseline", name: "golem-duelist" }, split: "dual-confirmation", maxSeconds: 150,
      rows: rows.map((r) => ({ ...r, score: 0 })) } };
}

test("admission uses the authorized campaign's remaining cumulative allowance", () => {
  const budget = { authorization: AUTHORIZATION, usedMs: AUTHORIZATION.maxMs - 1250 };
  assert.equal(admissionAllowance("wave4", budget, 3600000), 1250);
  assert.equal(admissionAllowance("wave4", { ...budget, usedMs: AUTHORIZATION.maxMs }, 1000), 0);
  assert.throws(() => admissionAllowance("wave4", { usedMs: 0 }, 1000), /authorization/);
  assert.throws(() => admissionAllowance("wave4", { ...budget, usedMs: -1 }, 1000), /allowance/);
  assert.throws(() => admissionAllowance("wave4", budget, 3600001), /allowance/);
  assert.throws(() => admissionAllowance("elsewhere", budget, 1000), /campaign/);
  assert.equal(admissionAllowance("wave3", { usedMs: 500 }, 1000), 1000);
});

test("admission checks both evaluation manifests rather than trusting the proposal's fingerprint", () => {
  const proposal = { labFingerprint: "current", candidateEvaluation: "research/runs/candidate/evaluation.json",
    controlEvaluation: "research/runs/control/evaluation.json" };
  const seen = [];
  validateEvaluationSources(proposal, "current", (path) => { seen.push(path); return { fingerprint: "current" }; });
  assert.equal(seen.length, 2); assert.notEqual(seen[0], seen[1]);
  for (const stale of seen) {
    assert.throws(() => validateEvaluationSources(proposal, "current", (path) =>
      ({ fingerprint: path === stale ? "old" : "current" })), /evaluation manifest/);
  }
  assert.throws(() => validateEvaluationSources({ ...proposal, labFingerprint: "old" }, "current",
    () => ({ fingerprint: "current" })), /evaluation manifest/);
});
test("admission requires independent superiority, matching source and browser review", () => {
  const { proposal, candidate, control } = fixture();
  assert.equal(admissionEvidence(proposal, candidate, control, "current").lower, 1);
  assert.throws(() => admissionEvidence(proposal, candidate, control, "changed"), /mismatch/);
  assert.throws(() => admissionEvidence({ ...proposal, review: null }, candidate, control, "current"), /browser review/);
  assert.throws(() => admissionEvidence(proposal, { ...candidate, split: "selection" }, control, "current"), /confirmation/);
  assert.throws(() => admissionEvidence(proposal, candidate, { ...control, rows: candidate.rows }, "current"), /improvement/);
  assert.throws(() => validatePublishedLabPolicy({ ...proposal.entry, admission: {} }), /evidence/);
});

test("a nonempty published registry initializes and constructs policies without an import cycle", () => {
  const entry = fixture().proposal.entry;
  const script = `import {registerHooks} from 'node:module';
    registerHooks({load(url,context,next){
      if(url.endsWith('/src/golem/researched-lab.json')) return {format:'json',
        source:${JSON.stringify(JSON.stringify([entry]))},shortCircuit:true};
      return next(url,context);
    }});
    const {POLICIES}=await import('./src/mind.ts');
    console.log(POLICIES.find(p=>p.name===${JSON.stringify(entry.name)}).create(11).name);`;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", script],
    { cwd: fileURLToPath(new URL("../", import.meta.url)), encoding: "utf8", windowsHide: true });
  assert.equal(output.trim(), entry.name);
});

test("learned admission rejects teacher-opponent leakage and missing training provenance", () => {
  const { proposal, candidate, control } = fixture();
  const spec = { kind: "network", model: constantResidual(POSE_FIELDS.map(() => 0)) };
  proposal.entry.spec = spec; candidate.policy = spec; proposal.review.policyHash = digest(spec);
  assert.throws(() => admissionEvidence(proposal, candidate, control, "current"), /training provenance/);
  proposal.training = { policyHash: digest(spec), opponents: ["golem-champion"], sources: ["teacher-dataset.json"] };
  assert.throws(() => admissionEvidence(proposal, candidate, control, "current"), /used in training/);
  proposal.training.opponents = ["golem-fencer"];
  assert.equal(admissionEvidence(proposal, candidate, control, "current").lower, 1);
  proposal.training.policyHash = "another-model";
  assert.throws(() => admissionEvidence(proposal, candidate, control, "current"), /training provenance/);
});
