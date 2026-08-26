import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appendLedgerRow,
  checkpointJobDue,
  checkpointRun,
  engagementGates,
  finalizeRun,
  makeLedgerRow,
  measuredGate,
  readLedger,
  runIsFinalized,
  sha256,
  validateLedgerRow,
} from "../scripts/research-ledger.mjs";
import { formatResearchStatus } from "../scripts/watch-research.mjs";

const input = (previousRows, value, jobIndex = previousRows.length) => ({
  previousRows, direction: "neat-qd", jobIndex, stepsConsumed: (jobIndex + 1) * 40,
  wallSeconds: jobIndex + 0.5, stepsPerSecond: 80, configDigest: "12345678", contractDigest: "abcdef01",
  validationMacro: value + 1, validationWorstCell: value,
  objective: { name: "validationWorstCellScore", direction: "higher", value },
  gates: engagementGates({ opportunities: 10, attacksInWindow: 7, contactsInWindow: 2,
    nearRangeStallSeconds: 1, seconds: 10, firstAttackSeconds: [1, 2] }), directionData: {
    generation: jobIndex, species: 2, archiveCoverage: 1,
    mutationTotals: { status: "unavailable", reason: "synthetic fixture" } },
  championBytes: new Uint8Array([jobIndex + 1]),
  stepCeiling: 10_000,
});

test("checkpointing_does_not_change_the_search", async () => {
  const run = async (checkpointEvery) => {
    const directory = await mkdtemp(join(tmpdir(), `sword-cadence-${checkpointEvery}-`));
    let state = 0x12345678; const report = []; const checkpoints = [];
    for (let job = 0; job < 12; job += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      report.push({ job, sample: state });
      if (checkpointJobDue(job + 1, checkpointEvery)) {
        const previousRows = await readLedger(join(directory, "ledger.jsonl"));
        const row = makeLedgerRow(input(previousRows, state, job));
        const championBytes = new TextEncoder().encode(JSON.stringify({ state, report }));
        await checkpointRun({ runDir: directory, row: { ...row, champion: { status: "available",
          digest: sha256(championBytes) } }, championBytes });
        checkpoints.push(JSON.stringify({ nextJob: job + 1, state, report }));
      }
    }
    const artifact = new TextEncoder().encode(JSON.stringify({ state, report }));
    return { artifact: [...artifact], resume: JSON.stringify({ nextJob: 12, state, report }), report };
  };
  assert.deepEqual(await run(1), await run(5));
});

test("checkpoint_cadence_is_derived_only_from_completed_job_indices", () => {
  assert.deepEqual(Array.from({ length: 10 }, (_, index) => index + 1)
    .filter((job) => checkpointJobDue(job, 3)), [3, 6, 9]);
});

test("a_row_is_written_when_nothing_improved", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sword-ledger-")); const path = join(directory, "ledger.jsonl");
  const first = makeLedgerRow(input([], 1, 0)); await appendLedgerRow(path, first);
  const secondInput = input([first], 0.5, 1); secondInput.championBytes = new Uint8Array([1]);
  const second = makeLedgerRow(secondInput); await appendLedgerRow(path, second);
  const rows = await readLedger(path);
  assert.equal(rows.length, 2); assert.match(rows[1].summary, /No new champion$/);
});

test("a_sub_epsilon_champion_replacement_is_not_reported_as_no_new_champion", () => {
  const first = makeLedgerRow(input([], 1, 0));
  const second = makeLedgerRow(input([first], 1.001, 1));
  assert.equal(second.improvedSinceRow, 0);
  assert.match(second.summary, /new champion validationWorstCellScore 1\.001$/);
  assert.notEqual(second.champion.digest, first.champion.digest);
});

test("an_unobserved_objective_names_the_new_champion_without_printing_a_null_metric", () => {
  const rowInput = input([], 1, 0); rowInput.direction = "ppo"; rowInput.objective = {
    name: "validationMacroReward", direction: "higher", observed: false, value: null,
  };
  rowInput.directionData = { rewardComponents: { terminal: 0, vitalityDelta: 0, nearRangeProgress: 0 },
    headEntropies: { status: "unavailable", reason: "synthetic validation tail" } };
  const row = makeLedgerRow(rowInput);
  assert.match(row.summary, /^ppo row 0 .*: new champion digest [0-9a-f]{64}$/);
  assert.doesNotMatch(row.summary, /null/);
});

test("a_kill_after_a_terminal_append_can_idempotently_finish_before_resume_is_refused", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sword-finalize-")); const path = join(directory, "ledger.jsonl");
  const rowInput = input([], 1, 0); rowInput.stepCeiling = rowInput.stepsConsumed;
  await appendLedgerRow(path, makeLedgerRow(rowInput));
  assert.equal(await runIsFinalized(directory), false);
  const championBytes = new TextEncoder().encode("champion"); const reportBytes = new TextEncoder().encode("report");
  await finalizeRun({ runDir: directory, championBytes, reportBytes });
  assert.equal(await runIsFinalized(directory), true);
  await finalizeRun({ runDir: directory, championBytes, reportBytes });
  assert.equal(await runIsFinalized(directory), true);
});

test("every_gate_row_carries_a_signed_margin", () => {
  const missed = measuredGate("opportunityAttackRate", 0.649, 0.65, "at-least");
  const passedMaximum = measuredGate("nearRangeStallShare", 0.149, 0.15, "at-most");
  assert.ok(Math.abs(missed.margin - (-0.001)) < 1e-12);
  assert.ok(Math.abs(passedMaximum.margin - 0.001) < 1e-12);
  const names = engagementGates({ opportunities: 10, attacksInWindow: 7, contactsInWindow: 2,
    nearRangeStallSeconds: 1, seconds: 10, firstAttackSeconds: [1, 2] });
  assert.equal(names.every((gate) => gate.status === "unavailable" || Number.isFinite(gate.margin)), true);
});

test("a_no_attack_bout_remains_in_first_attack_p90_as_negative_infinity_margin", () => {
  const gate = engagementGates({ opportunities: 2, attacksInWindow: 1, contactsInWindow: 1,
    nearRangeStallSeconds: 0, seconds: 2, firstAttackSeconds: [0.2, null] })
    .find((candidate) => candidate.name === "firstAttackP90Seconds");
  assert.deepEqual({ status: gate.status, value: gate.value, margin: gate.margin },
    { status: "measured", value: "Infinity", margin: "-Infinity" });
});

for (const [direction, objective, directionData, message] of [
  ["neat-qd", { name: "validationWorstCellScore", direction: "higher", value: 1 },
    { generation: 0, species: 1 }, /NEAT-QD ledger data/],
  ["dagger", { name: "validationLoss", direction: "lower", value: 1 },
    { iteration: 0, rowsAggregated: 1, macroF1: null }, /DAgger ledger data/],
  ["ppo", { name: "validationMacroReward", direction: "higher", value: 1 },
    { rewardComponents: {}, headEntropies: {} }, /PPO ledger data/],
  ["lookahead", { name: "calibrationSeverity", direction: "lower", value: 1 },
    { cellsFitted: 0, calibrationKeys: 0 }, /lookahead ledger data/],
]) test(`${direction}_direction_rows_refuse_missing_promised_telemetry`, () => {
  const candidate = input([], 1, 0); candidate.direction = direction; candidate.objective = objective;
  candidate.directionData = directionData;
  assert.throws(() => makeLedgerRow(candidate), message);
});

test("a_truncated_final_row_is_ignored_and_the_run_resumes_from_the_last_complete_row", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sword-ledger-truncated-")); const path = join(directory, "ledger.jsonl");
  const first = makeLedgerRow(input([], 1, 0)); await appendLedgerRow(path, first);
  const bytes = await readFile(path, "utf8"); await writeFile(path, `${bytes}{"schema":1,"row":1`);
  assert.deepEqual(await readLedger(path), [first]);
  const second = makeLedgerRow(input([first], 2, 1));
  await appendLedgerRow(path, second);
  assert.deepEqual(await readLedger(path), [first, second]);
});

test("a_complete_malformed_ledger_row_is_refused_instead_of_hidden_as_a_kill", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sword-ledger-malformed-")); const path = join(directory, "ledger.jsonl");
  await writeFile(path, "{not-json}\n");
  await assert.rejects(readLedger(path), /JSON/);
});

test("a_complete_row_cannot_edit_a_gate_margin_or_the_run_contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sword-ledger-contract-")); const path = join(directory, "ledger.jsonl");
  const first = makeLedgerRow(input([], 1, 0)); const wrongMargin = structuredClone(first);
  wrongMargin.gates[0].margin = 1; await writeFile(path, `${JSON.stringify(wrongMargin)}\n`);
  await assert.rejects(readLedger(path), /wrong signed margin/);
  const second = structuredClone(makeLedgerRow(input([first], 2, 1))); second.configDigest = "deadbeef";
  await writeFile(path, `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`);
  await assert.rejects(readLedger(path), /configDigest changed mid-run/);
});

test("derived_objective_summary_and_gate_scope_cannot_be_edited_in_a_complete_sequence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sword-ledger-derived-")); const path = join(directory, "ledger.jsonl");
  const first = makeLedgerRow(input([], 1, 0)); const tampered = structuredClone(first);
  tampered.objective.best = 9; await writeFile(path, `${JSON.stringify(tampered)}\n`);
  await assert.rejects(readLedger(path), /objective progress was not derived/);
  const secondInput = input([first], 2, 1); const second = structuredClone(makeLedgerRow(secondInput));
  second.gateScope = "different-scope"; await writeFile(path, `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`);
  await assert.rejects(readLedger(path), /gate scope changed mid-run/);
  assert.equal(validateLedgerRow(first), first);
});

test("an_append_refuses_a_changed_contract_before_touching_the_champion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sword-ledger-append-contract-"));
  const path = join(directory, "ledger.jsonl"); const first = makeLedgerRow(input([], 1, 0));
  await checkpointRun({ runDir: directory, row: first, championBytes: new Uint8Array([1]) });
  const changed = input([first], 2, 1); changed.plateauRows = 7;
  const second = makeLedgerRow(changed); const championPath = join(directory, "champion-so-far.artifact");
  const before = await readFile(championPath);
  await assert.rejects(checkpointRun({ runDir: directory, row: second, championBytes: new Uint8Array([2]) }),
    /stopping contract changed mid-run/);
  assert.deepEqual(await readFile(championPath), before);
  assert.deepEqual(await readLedger(path), [first]);
});

test("checkpoint_bytes_must_match_the_row_digest_before_any_file_is_touched", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sword-ledger-digest-")); const row = makeLedgerRow(input([], 1, 0));
  await assert.rejects(checkpointRun({ runDir: directory, row, championBytes: new Uint8Array([99]) }),
    /champion bytes do not match the ledger digest/);
  assert.deepEqual(await readLedger(join(directory, "ledger.jsonl")), []);
  await assert.rejects(readFile(join(directory, "champion-so-far.artifact")), /ENOENT/);
});

test("the_watcher_prints_signed_margins_unavailable_gates_and_current_progress", () => {
  const row = makeLedgerRow(input([], 1, 0)); const output = formatResearchStatus([row]);
  assert.match(output, /opportunityAttackRate: 0\.7 .*margin \+0\.049999/);
  assert.match(output, /symmetricTimeCapRate: unavailable -- research rollouts do not run mirrored tournament pairs/);
  assert.match(output, /best validationWorstCellScore: 1 at row 0/);
  assert.match(output, /rows since improvement: 0/);
});
