import test from "node:test";
import assert from "node:assert/strict";
import { dynamicRiseQualification } from "../research/dynamic-rise-qualification.mjs";

const trials = () => ["workshop-fighter", "workshop-rogue"].flatMap(model => ["empty", "club"].flatMap(held =>
  Array.from({ length: 16 }, (_, k) => ({ model, held, degrees: k * 22.5, fell: true, success: true, seconds: 4 }))));
const fail = row => ({ ...row, success: false, seconds: null });

test("dynamic-rise qualification requires 95 per cent overall as well as every group's bar", () => {
  const rows = trials().map((row, i) => i % 16 === 1 ? fail(row) : row);
  const short = dynamicRiseQualification(rows);
  assert.deepEqual(short, { target: { median: 4, deadline: 6,
    minimum: "61 of 64 overall, 15 of 16 per group, every cardinal direction" },
  groups: ["workshop-fighter", "workshop-rogue"].flatMap(model => ["empty", "club"].map(held => ({
    model, held, trials: 16, falls: 16, successes: 15, median: 4, complete: true, cardinal: true, pass: true }))),
  successes: 60, trials: 64, complete: true, pass: false });
  rows[1] = trials()[1];
  const passing = dynamicRiseQualification(rows);
  assert.deepEqual({ successes: passing.successes, complete: passing.complete, pass: passing.pass },
    { successes: 61, complete: true, pass: true });
});

test("dynamic-rise qualification refuses missing, duplicate, and failed cardinal falls", () => {
  for (const altered of [
    rows => rows.slice(1),
    rows => [rows[1], ...rows.slice(1)],
    rows => rows.map((row, i) => i === 0 ? fail(row) : row),
    rows => rows.map((row, i) => i === 0 ? { ...row, fell: false } : row),
  ]) {
    const report = dynamicRiseQualification(altered(trials()));
    assert.equal(report.pass, false);
    assert.equal(report.groups[0].pass, false);
  }
});

test("dynamic-rise qualification retains censored failures and enforces the four-second median", () => {
  const failed = dynamicRiseQualification(trials().map(row => fail(row)));
  assert.deepEqual(failed.groups.map(g => ({ successes: g.successes, median: g.median, pass: g.pass })),
    Array.from({ length: 4 }, () => ({ successes: 0, median: null, pass: false })));
  assert.equal(failed.pass, false);
  const slow = dynamicRiseQualification(trials().map(row => ({ ...row, seconds: 4.01 })));
  assert.deepEqual(slow.groups.map(g => ({ successes: g.successes, median: g.median, pass: g.pass })),
    Array.from({ length: 4 }, () => ({ successes: 16, median: 4.01, pass: false })));
  assert.equal(slow.pass, false);
});

test("a standing declaration after the deadline or without a finite recovery time cannot qualify", () => {
  for (const seconds of [6.01, null, NaN, Infinity, -1]) {
    const rows = trials();
    rows[0] = { ...rows[0], seconds };
    const result = dynamicRiseQualification(rows);
    assert.equal(result.pass, false);
    assert.equal(result.groups[0].successes, 15);
    assert.equal(result.groups[0].cardinal, false);
  }
  const late = trials().map((row, i) => i % 16 === 1 || i % 16 === 2 ? { ...row, seconds: 8 } : row);
  assert.equal(dynamicRiseQualification(late).pass, false, 'a good median cannot conceal two late recoveries per group');
  const boundary = trials(); boundary[0] = { ...boundary[0], seconds: 6 };
  assert.equal(dynamicRiseQualification(boundary).pass, true);
});
