import assert from "node:assert/strict";
import test from "node:test";

import { assertEffigyWarriorDynamismCorpus, EFFIGY_DYNAMISM_V1,
  reconstructDynamismMetrics } from "../scripts/effigy-warrior-dynamism.mjs";

const row = (step, atS, phase, actions, x, heading, terminal = []) => ({
  step, atS, root: { x, z: 0 }, opponent: { x: 0, z: 2 }, headingRad: heading,
  phase, reason: "test fixture", selectedActions: actions, active: [], rangeM: 1.7,
  supportState: "supported", carrierRequested: null,
  carrierAllowed: actions[0]?.startsWith("orbit") ? { forward: 0.35,
    right: phase === "orbit-left" ? -0.8 : 0.8, yaw: phase === "orbit-left" ? -0.7 : 0.7,
    recover: false } : { forward: 0, right: 0, yaw: 0, recover: false },
  swordCoreClearanceM: 0.08, weaponThreat: false, terminal,
});

const samples = () => [
  row(0, 0, "orbit-right", ["orbit-right", "guard"], 0.00, 0.00),
  row(1, 0.30, "orbit-left", ["orbit-left", "guard"], 0.30, -0.30),
  row(2, 0.60, "orbit-right", ["orbit-right", "guard"], 0.60, 0.00),
  row(3, 0.90, "commit", ["advance", "sweep"], 0.75, 0.05, [{ kind: "completed", action: "sweep" }]),
  row(4, 1.20, "withdraw", ["withdraw", "guard"], 1.05, 0.25),
  row(5, 1.50, "commit", ["advance", "sweep"], 1.20, 0.30, [{ kind: "completed", action: "sweep" }]),
  row(6, 1.80, "withdraw", ["withdraw", "guard"], 1.50, 0.50),
  row(7, 2.10, "commit", ["advance", "sweep"], 1.65, 0.55, [{ kind: "completed", action: "sweep" }]),
  row(8, 2.40, "withdraw", ["withdraw", "guard"], 1.95, 0.75),
];

const corpus = () => {
  const cells = [];
  for (const seed of EFFIGY_DYNAMISM_V1.warriorSeeds) for (const constructSide of EFFIGY_DYNAMISM_V1.constructSides) {
    const effigy = samples();
    // The reference intentionally has a smaller but nonzero envelope. It makes a frozen-root
    // counterfeit fail without pretending that a Warrior's net end position is the metric.
    const warrior = samples().map((sample) => ({ ...sample, root: { x: sample.root.x * 0.8, z: sample.root.z },
      headingRad: sample.headingRad * 0.8 }));
    cells.push({ seed, constructSide, effigy: { samples: effigy, contacts: [],
      metrics: reconstructDynamismMetrics(effigy, []), safety: { longestStandingS: 20, minimumSwordCoreClearanceM: 0.05 } },
    warrior: { samples: warrior, contacts: [], metrics: reconstructDynamismMetrics(warrior, []) } });
  }
  return { version: 1, physics: "real-havok-fixed-240hz", config: EFFIGY_DYNAMISM_V1, cells };
};
const refresh = (report) => {
  for (const cell of report.cells) {
    cell.effigy.metrics = reconstructDynamismMetrics(cell.effigy.samples, cell.effigy.contacts);
    cell.warrior.metrics = reconstructDynamismMetrics(cell.warrior.samples, cell.warrior.contacts);
  }
};

test("the_Swordbearer_orbits_turns_and_repositions_in_both_mirrors", () => {
  const report = corpus();
  const accepted = assertEffigyWarriorDynamismCorpus(report);
  assert.equal(accepted.cells.length, 8);
  assert.ok(accepted.warriorLowerQuartile.groundPathM > 0);
  assert.equal(accepted.cells.every(({ effigy }) => effigy.metrics.completedAttacks === 3 &&
    effigy.metrics.orbitDirectionSwitches >= 2 && effigy.metrics.maximumTurnAndMoveS >= 0.25), true,
  "the retained physical rows must exhibit two lanes, simultaneous turn/move, and repeated strokes on both sides");
});

test("the_Swordbearer_does_not_win_the_dynamism_gate_by_sweeping_from_a_planted_carrier", () => {
  const noTravel = corpus();
  for (const { effigy } of noTravel.cells) for (const sample of effigy.samples) sample.root = { x: 0, z: 0 };
  refresh(noTravel);
  assert.throws(() => assertEffigyWarriorDynamismCorpus(noTravel), /groundPathM is below Warrior lower quartile/);

  const noHeading = corpus();
  for (const { effigy } of noHeading.cells) for (const sample of effigy.samples) sample.headingRad = 0;
  refresh(noHeading);
  assert.throws(() => assertEffigyWarriorDynamismCorpus(noHeading), /accumulatedHeadingRad is below Warrior lower quartile/);

  const noTerminal = corpus();
  for (const { effigy } of noTerminal.cells) effigy.samples.at(-2).terminal = [];
  refresh(noTerminal);
  assert.throws(() => assertEffigyWarriorDynamismCorpus(noTerminal), /completed fewer than three attacks/);

  const passiveInterval = corpus();
  for (const { effigy } of passiveInterval.cells) for (const sample of effigy.samples.slice(0, 4)) sample.selectedActions = [];
  refresh(passiveInterval);
  assert.throws(() => assertEffigyWarriorDynamismCorpus(passiveInterval), /unlabelled passive combat interval/);
});
