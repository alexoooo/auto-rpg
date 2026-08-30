import { pathToFileURL } from "node:url";

import { CONFIG } from "../src/config.ts";
import { runConstructWarriorBout } from "./construct-warrior-bout.mjs";
import { scaledLocomotionFixture, SCALED_LOCOMOTION_BODY_SCALE,
  SCALED_LOCOMOTION_FIXTURE_SPEED_MPS, SCALED_LOCOMOTION_TARGET_CROWN_M } from
  "./scaled-locomotion-fixture.mjs";

export const SCALED_SUPPORTED_LOCOMOTION_V1 = Object.freeze({
  version: 1,
  physicsHz: 240,
  blueprintDigest: "e9ed64a7",
  targetCrownM: SCALED_LOCOMOTION_TARGET_CROWN_M,
  bodyScale: SCALED_LOCOMOTION_BODY_SCALE,
  closeSpeedMps: SCALED_LOCOMOTION_FIXTURE_SPEED_MPS,
  movementSteps: 720,
  recoverySteps: 1440,
  shoveStep: 360,
  shoveNs: Object.freeze([0.5, 0]),
  minimumDisplacementM: 0.25,
  cellIds: Object.freeze([
    "scaled-move-left-yaw-0",
    "scaled-recovery-left-yaw-0",
    "scaled-move-right-yaw-pi",
    "scaled-recovery-right-yaw-pi",
  ]),
});

const compactBout = (id, kind, constructSide, facing, bout) => Object.freeze({
  id, kind, constructSide, facing,
  physics: bout.physics,
  locomotionMode: bout.locomotion.mode,
  constructRootDisplacementM: bout.locomotion.constructRootDisplacementM,
  finalDiagnostic: bout.locomotion.constructDiagnostic,
  stabilityShoves: bout.stabilityShoves,
  steps: bout.steps,
  locomotionSteps: bout.locomotionSteps,
  locomotionTimeline: bout.locomotionTimeline,
});

export async function runScaledSupportedLocomotionCorpus() {
  if (CONFIG.world.physicsHz !== SCALED_SUPPORTED_LOCOMOTION_V1.physicsHz) {
    throw new Error(`scaled locomotion corpus requires ${SCALED_SUPPORTED_LOCOMOTION_V1.physicsHz} Hz physics`);
  }
  const fixture = scaledLocomotionFixture();
  const cells = [];
  for (const [constructSide, facing] of [["left", 0], ["right", Math.PI]]) {
    const options = { saved: fixture.saved, sensors: fixture.sensors,
      constructProfile: fixture.profile, constructSide, warriorPolicy: "idle",
      warriorLoadout: { primary: "empty", secondary: "empty" } };
    const sideName = constructSide === "left" ? "left-yaw-0" : "right-yaw-pi";
    const moving = await runConstructWarriorBout({ ...options,
      maxSteps: SCALED_SUPPORTED_LOCOMOTION_V1.movementSteps });
    cells.push(compactBout(`scaled-move-${sideName}`, "move", constructSide, facing, moving));
    const recovery = await runConstructWarriorBout({ ...options,
      maxSteps: SCALED_SUPPORTED_LOCOMOTION_V1.recoverySteps,
      stabilityShoves: [{ atStep: SCALED_SUPPORTED_LOCOMOTION_V1.shoveStep,
        horizontalShoveNs: SCALED_SUPPORTED_LOCOMOTION_V1.shoveNs }] });
    cells.push(compactBout(`scaled-recovery-${sideName}`, "recovery", constructSide, facing, recovery));
  }
  return Object.freeze({ version: 1, fixture: SCALED_SUPPORTED_LOCOMOTION_V1,
    cells: Object.freeze(cells), summary: Object.freeze({ physicalCells: cells.length,
      minimumMovementM: Math.min(...cells.filter(({ kind }) => kind === "move")
        .map(({ constructRootDisplacementM }) => constructRootDisplacementM)) }) });
}

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function assertScaledSupportedLocomotionCorpus(report) {
  const failures = [];
  const expected = SCALED_SUPPORTED_LOCOMOTION_V1;
  if (report.version !== expected.version || !same(report.fixture, expected)) {
    failures.push("the frozen 0.90 m fixture changed");
  }
  if (!same(report.cells?.map(({ id }) => id), expected.cellIds)) {
    failures.push("the exact four-cell scaled matrix changed");
  }
  for (const cell of report.cells ?? []) {
    const fail = (message) => failures.push(`${cell.id}: ${message}`);
    const expectedSteps = cell.kind === "move" ? expected.movementSteps : expected.recoverySteps;
    if (cell.physics !== "real-havok-fixed-240hz" || cell.locomotionMode !== "supported") {
      fail("the cell did not run supported fixed-step Havok");
    }
    if (cell.steps !== expectedSteps || cell.locomotionSteps.length !== expectedSteps) {
      fail("the retained physical stream is incomplete");
    }
    if (cell.finalDiagnostic?.state.state !== "supported" ||
        cell.finalDiagnostic?.postureSupported !== true) fail("final physical support was not restored");
    if (!cell.locomotionSteps.some(({ construct }) => construct?.freshSupportBindings.length > 0)) {
      fail("no real foot support was retained");
    }
    if (cell.kind === "move") {
      if (!(cell.constructRootDisplacementM > expected.minimumDisplacementM)) {
        fail("scale-sensitive movement did not clear its displacement floor");
      }
      if (!cell.locomotionSteps.every(({ construct }) => construct?.state === "supported")) {
        fail("movement lost supported authority");
      }
      if (cell.stabilityShoves.length !== 0) fail("movement contained a fixture shove");
    } else {
      if (!same(cell.stabilityShoves,
        [{ atStep: expected.shoveStep, horizontalShoveNs: expected.shoveNs }])) {
        fail("recovery did not retain the frozen shove");
      }
      const states = cell.locomotionTimeline.map(({ construct }) => construct?.state.state);
      const fallen = states.indexOf("fallen");
      const rising = states.indexOf("rising", fallen + 1);
      const recovered = states.indexOf("supported", rising + 1);
      if (!(fallen >= 0 && rising > fallen && recovered > rising)) {
        fail("recovery did not retain fallen -> rising -> supported");
      }
    }
  }
  const movement = (report.cells ?? []).filter(({ kind }) => kind === "move")
    .map(({ constructRootDisplacementM }) => constructRootDisplacementM);
  const minimumMovementM = movement.length === 2 ? Math.min(...movement) : Number.NaN;
  if (report.summary?.physicalCells !== expected.cellIds.length ||
      report.summary?.minimumMovementM !== minimumMovementM) {
    failures.push("scaled corpus summary contradicted retained cells");
  }
  if (failures.length) throw new Error(`scaled supported locomotion failed: ${failures.join("; ")}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = assertScaledSupportedLocomotionCorpus(await runScaledSupportedLocomotionCorpus());
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
