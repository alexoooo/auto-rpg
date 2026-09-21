import test from "node:test";
import assert from "node:assert/strict";
import { summarizeEvidence, compareEvidence } from "../research/lab/evidence.mjs";
import { fitTerminalModel, terminalOption } from "../src/golem/lab-model.ts";
import { mixtureMind } from "../src/golem/lab-bespoke.ts";

const rows = (score) => Array.from({ length: 8 }, (_, seed) => ["left", "right"].map((side) =>
  ({ split: "confirmation", build: "default", opponent: "control", seed, side, score, truncated: false }))).flat();
test("strength evidence clusters sides and compares identical matchups", () => {
  const wins = rows(1), losses = rows(0);
  assert.equal(summarizeEvidence(wins).pairs, 8);
  assert.equal(compareEvidence(wins, losses).lower, 1);
  assert.equal(compareEvidence(wins, wins).upper, 0);
  assert.throws(() => summarizeEvidence(wins.slice(1)), /complete/);
  assert.throws(() => summarizeEvidence(wins.map((r) => ({ ...r, side: "left" }))), /distinct/);
  assert.throws(() => compareEvidence(wins, losses.map((r) => ({ ...r, seed: r.seed + 1 }))), /identical/);
});

test("terminal exchange outcomes are absorbing and change planner preferences", () => {
  const samples = [
    { state: "a", option: "strike", next: null, reward: -2 },
    { state: "a", option: "wait", next: "b", reward: 0 },
    { state: "b", option: "strike", next: null, reward: 2 },
  ];
  const model = fitTerminalModel(samples);
  assert.equal(model.cells["a|strike"].terminal, 1);
  assert.deepEqual(model.cells["a|strike"].next, {});
  assert.equal(terminalOption(model, "a", ["strike", "wait"]), "wait");
  const changed = fitTerminalModel(samples.map((r, i) => i === 0 ? { ...r, reward: 10 } : r));
  assert.equal(terminalOption(changed, "a", ["strike", "wait"]), "strike");
});

test("mixture controller rejects malformed selectors rather than returning a missing command", () => {
  assert.throws(() => mixtureMind({ kind: "mixture", seconds: 1, weights: [] }, 1), /invalid/);
  assert.throws(() => mixtureMind({ kind: "mixture", seconds: 0, weights: Array.from({ length: 4 }, () => Array(8).fill(0)) }, 1), /invalid/);
  assert.doesNotThrow(() => mixtureMind({ kind: "mixture", seconds: 1, weights: Array.from({ length: 4 }, () => Array(8).fill(0)) }, 1));
});
