import assert from "node:assert/strict";
import test from "node:test";

import { assertPhysicalObstacleCorpus, runPhysicalObstacleCorpus } from
  "../scripts/supported-locomotion-physical-obstacles.mjs";

test("real_Havok_obstacles_cover_ledge_slopes_snag_and_occupied_recovery", async () => {
  const report = assertPhysicalObstacleCorpus(await runPhysicalObstacleCorpus());
  assert.deepEqual(report.cells.map(({ id }) => id), report.fixture.cellIds);
  for (const cell of report.cells) {
    const obstacleIds = cell.fixture.obstacleIds ?? [cell.fixture.obstacleId];
    assert.ok(cell.contacts.some(({ fixtureId }) => obstacleIds.includes(fixtureId)), cell.id);
    assert.equal(cell.physics, "real-havok-fixed-240hz", cell.id);
  }
  const occupied = report.cells.find(({ id }) => id === "occupied-recovery-refused");
  const occupiedIds = new Set(occupied.fixture.obstacleIds);
  assert.ok(occupied.contacts.some(({ fixtureId, step }) => occupiedIds.has(fixtureId) &&
    occupied.samples[step]?.active.recoverActionActive === true &&
    occupied.samples[step]?.active.locomotion.state === "fallen" &&
    occupied.samples[step]?.active.locomotion.recoveryProgress === 0),
  "the occupied fixture retains solver contact on the same samples that refuse recovery");

  for (const mutate of [
    (cell) => { cell.contacts.length = 0; },
    (cell) => { cell.samples[0].active.maximumJointFrameErrorM = 0.081; },
    (cell) => { cell.samples.length = 0; },
  ]) {
    const forged = structuredClone(report);
    mutate(forged.cells[0]);
    assert.throws(() => assertPhysicalObstacleCorpus(forged), /real-Havok obstacle corpus failed/);
  }
  const contactBeforeRecoveryOnly = structuredClone(report);
  const forgedOccupied = contactBeforeRecoveryOnly.cells.find(({ id }) => id === "occupied-recovery-refused");
  forgedOccupied.contacts = forgedOccupied.contacts.filter(({ step }) =>
    !forgedOccupied.samples[step]?.active.recoverActionActive);
  assert.ok(forgedOccupied.contacts.length > 0,
    "the mutation retains pre-recovery cage contacts so the temporal assertion is not generic presence");
  assert.throws(() => assertPhysicalObstacleCorpus(contactBeforeRecoveryOnly),
    /real cage stopped contacting the body during refused recovery/);

  const missingOccupied = structuredClone(report);
  missingOccupied.cells = missingOccupied.cells.filter(({ id }) => id !== "occupied-recovery-refused");
  missingOccupied.fixture.cellIds = missingOccupied.fixture.cellIds
    .filter((id) => id !== "occupied-recovery-refused");
  assert.throws(() => assertPhysicalObstacleCorpus(missingOccupied),
    /frozen physical obstacle fixture changed/);
});
