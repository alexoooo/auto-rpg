import assert from "node:assert/strict";
import test from "node:test";

import { engagementGates, ledgerStopDecision, makeLedgerRow } from "../scripts/research-ledger.mjs";

const rowsFor = (values, direction = "higher", ceiling = 10_000, epsilon = 0.01, plateauRows = 3) => {
  const rows = [];
  values.forEach((value, index) => rows.push(makeLedgerRow({ previousRows: rows,
    direction: direction === "higher" ? "neat-qd" : "dagger", jobIndex: index,
    stepsConsumed: (index + 1) * 10, wallSeconds: index, stepsPerSecond: 10,
    configDigest: "12345678", contractDigest: "abcdef01", validationMacro: null, validationWorstCell: null,
    objective: { name: direction === "higher" ? "validationWorstCellScore" : "validationLoss", direction, value },
    gates: engagementGates({}), directionData: direction === "higher"
      ? { generation: index, species: 1, archiveCoverage: 0,
        mutationTotals: { status: "unavailable", reason: "synthetic fixture" } }
      : { iteration: index, rowsAggregated: 1,
        macroF1: { status: "unavailable", reason: "synthetic fixture" } },
    championBytes: new Uint8Array([1]), stepCeiling: ceiling,
    plateauEpsilon: epsilon, plateauRows })));
  return rows;
};

test("the_same_ledger_always_produces_the_same_stop_decision", () => {
  const rows = rowsFor([1, 1.001, 1.002, 1.003]);
  assert.equal(ledgerStopDecision(rows), "stopped: plateau");
  assert.equal(ledgerStopDecision(JSON.parse(JSON.stringify(rows))), "stopped: plateau");
  assert.equal(ledgerStopDecision(rowsFor([4, 3.999, 3.998, 3.997], "lower")), "stopped: plateau");
});

test("an_improvement_of_exactly_epsilon_resets_the_counter", () => {
  const rows = rowsFor([1, 1, 1.01, 1.01, 1.01], "higher", 10_000, 0.01, 3);
  assert.equal(ledgerStopDecision(rows), null);
  const lowerRows = rowsFor([4, 4, 3.99, 3.99, 3.99], "lower", 10_000, 0.01, 3);
  assert.equal(ledgerStopDecision(lowerRows), null);
});

test("a_ceiling_stop_and_a_plateau_stop_are_distinguishable_in_the_report", () => {
  assert.equal(ledgerStopDecision(rowsFor([1, 2], "higher", 20)), "stopped: ceiling");
  assert.equal(ledgerStopDecision(rowsFor([1, 1, 1, 1], "higher", 10_000)), "stopped: plateau");
});
