import { pathToFileURL } from "node:url";

import { CONFIG } from "../src/config.ts";
import { humanoidSavedConstruct, HUMANOID_SENSORS } from "../src/construct/humanoid.ts";
import { runConstructWarriorBout } from "./construct-warrior-bout.mjs";

export const SUPPORTED_LOCOMOTION_BOUNDARIES_V1 = Object.freeze({
  version: 3,
  physicsHz: 240,
  maximumPartSpeedMps: 12,
  maximumJointFrameErrorM: 0.080,
  maximumHeldWallPenetrationM: 0.020,
  cellIds: Object.freeze(["held-shield-wall-pressure", "held-sword-wall-pressure",
    "hit-interrupted-recovery"]),
  wallCells: Object.freeze([
    Object.freeze({ id: "held-shield-wall-pressure", kind: "shield", policy: "idle", maxSteps: 240,
      construct: Object.freeze({ x: 0, z: 10.5, facing: 0 }),
      warrior: Object.freeze({ x: 0, z: 12.71, facing: Math.PI / 2 }) }),
    // The idle sword reaches the wall without adding an authored attack's ordinary blade speed to
    // a solver-stability measurement. At this placement its retained tip clearance is 0.0189 m.
    Object.freeze({ id: "held-sword-wall-pressure", kind: "sword", policy: "idle", maxSteps: 240,
      construct: Object.freeze({ x: 0, z: 10.5, facing: 0 }),
      warrior: Object.freeze({ x: 0, z: 12.78, facing: -Math.PI / 2 }) }),
  ]),
  wall: Object.freeze({ axis: "z", coordinate: 13 }),
  // Recovery is the premise under test, so the fixture causes the initial fall explicitly.
  // The later abort must still line up with a real Havok weapon contact; this step-zero shove
  // cannot satisfy that temporal proof or impersonate the interrupt.
  hit: Object.freeze({ separationM: 0.98, maxSteps: 380, warriorSeed: 6, warriorPolicy: "swinger",
    // This is deliberately a two-handed club rather than the normal sword-and-buckler pair:
    // the paired 240 Hz fixture needs one genuinely staggering physical strike during the
    // 0.45-second rise.  The old duelist/sword row only supplied weak armour contacts after
    // recovery, while the pre-fix test passed because a control sequencing gap dropped the
    // carrier without any qualifying hit at all.
    warriorLoadout: Object.freeze({ primary: "club", secondary: "club" }),
    initialShove: Object.freeze({ atStep: 0, horizontalShoveNs: Object.freeze([12, 0]) }) }),
});

const compactWall = (spec, bout) => Object.freeze({ id: spec.id, kind: "wall-pressure",
  heldKind: spec.kind, policy: spec.policy, physics: bout.physics, steps: bout.steps,
  fixturePlacement: bout.fixturePlacement, solver: bout.solver });

const compactHit = (bout) => Object.freeze({ id: "hit-interrupted-recovery", kind: "hit-interrupt",
  physics: bout.physics, steps: bout.steps, locomotionSteps: bout.locomotionSteps,
  warriorContacts: bout.warriorContacts, stabilityShoves: bout.stabilityShoves });

export async function runSupportedLocomotionBoundaryCorpus() {
  if (CONFIG.world.physicsHz !== SUPPORTED_LOCOMOTION_BOUNDARIES_V1.physicsHz) {
    throw new Error(`boundary corpus requires ${SUPPORTED_LOCOMOTION_BOUNDARIES_V1.physicsHz} Hz physics`);
  }
  const saved = humanoidSavedConstruct();
  const cells = [];
  for (const spec of SUPPORTED_LOCOMOTION_BOUNDARIES_V1.wallCells) {
    const bout = await runConstructWarriorBout({ saved, sensors: HUMANOID_SENSORS,
      warriorPolicy: spec.policy, warriorSeed: 3,
      warriorLoadout: { primary: "sword", secondary: "shield" }, maxSteps: spec.maxSteps,
      fixturePlacement: { construct: spec.construct, warrior: spec.warrior,
        wall: SUPPORTED_LOCOMOTION_BOUNDARIES_V1.wall } });
    cells.push(compactWall(spec, bout));
  }
  const hit = SUPPORTED_LOCOMOTION_BOUNDARIES_V1.hit;
  cells.push(compactHit(await runConstructWarriorBout({ saved, sensors: HUMANOID_SENSORS,
    warriorPolicy: hit.warriorPolicy, warriorLoadout: hit.warriorLoadout, warriorSeed: hit.warriorSeed,
    separationM: hit.separationM, maxSteps: hit.maxSteps,
    stabilityShoves: [hit.initialShove] })));
  return Object.freeze({ version: SUPPORTED_LOCOMOTION_BOUNDARIES_V1.version,
    fixture: SUPPORTED_LOCOMOTION_BOUNDARIES_V1,
    cells: Object.freeze(cells), summary: Object.freeze({ physicalCells: cells.length,
      heldWorldContacts: cells.filter(({ kind }) => kind === "wall-pressure")
        .reduce((sum, cell) => sum + cell.solver.heldWorldContactsByKind[cell.heldKind], 0),
      hitContacts: cells.find(({ kind }) => kind === "hit-interrupt")?.warriorContacts.length ?? 0 }) });
}

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function assertSupportedLocomotionBoundaryCorpus(report) {
  const failures = [];
  const expected = SUPPORTED_LOCOMOTION_BOUNDARIES_V1;
  if (report.version !== expected.version || !same(report.fixture, expected)) {
    failures.push("the frozen boundary fixture changed");
  }
  if (!same(report.cells?.map(({ id }) => id), expected.cellIds)) {
    failures.push("the exact three-cell boundary matrix changed");
  }
  for (const cell of report.cells ?? []) {
    const fail = (message) => failures.push(`${cell.id}: ${message}`);
    if (cell.physics !== "real-havok-fixed-240hz") fail("the cell did not use fixed-step Havok");
    if (cell.kind === "wall-pressure") {
      const spec = expected.wallCells.find(({ id }) => id === cell.id);
      if (!spec || cell.steps !== spec.maxSteps ||
          !same(cell.fixturePlacement?.construct, spec.construct) ||
          !same(cell.fixturePlacement?.warrior, spec.warrior) ||
          !same(cell.fixturePlacement?.wall, expected.wall)) fail("the retained wall fixture changed");
      if (!(cell.solver.heldWorldContactsByKind[cell.heldKind] > 0)) {
        fail(`the held ${cell.heldKind} produced no WORLD collision callback`);
      }
      const clearanceM = cell.solver.minimumHeldWallClearanceByKindM[cell.heldKind];
      const penetrationM = cell.solver.maximumHeldWallPenetrationByKindM[cell.heldKind];
      if (!Number.isFinite(clearanceM)) {
        fail("held wall clearance was unavailable");
      }
      if (!(clearanceM <= expected.maximumHeldWallPenetrationM)) {
        fail("the named held body never reached the measured wall boundary");
      }
      const derivedPenetrationM = Math.max(0, -clearanceM);
      if (!Number.isFinite(penetrationM) || penetrationM < 0 ||
          Math.abs(penetrationM - derivedPenetrationM) > 1e-12 ||
          penetrationM > expected.maximumHeldWallPenetrationM) {
        fail("held geometry penetration contradicted signed clearance or phased through the wall");
      }
      if (!(cell.solver.maximumPartSpeedMps <= expected.maximumPartSpeedMps)) {
        fail("wall pressure launched a body part");
      }
      if (!(cell.solver.maximumConstructJointFrameErrorM <= expected.maximumJointFrameErrorM)) {
        fail("wall pressure stretched a Construct joint");
      }
      if (!cell.solver.heldKinds.includes("sword") || !cell.solver.heldKinds.includes("shield")) {
        fail("the ordinary held sword/shield pair was not present");
      }
    } else if (cell.kind === "hit-interrupt") {
      if (cell.steps !== expected.hit.maxSteps || cell.locomotionSteps.length !== cell.steps) {
        fail("the retained hit-interrupt stream is incomplete");
      }
      const rising = cell.locomotionSteps.findIndex(({ construct }) => construct?.state === "rising");
      const interrupted = cell.locomotionSteps.findIndex((row, index) => index > rising &&
        row.construct?.state === "fallen" && cell.locomotionSteps[index - 1]?.construct?.state === "rising");
      if (!(rising >= 0 && interrupted > rising)) fail("a later safe boundary did not abort rising");
      const priorAtS = cell.locomotionSteps[interrupted - 1]?.atS;
      const fallenAtS = cell.locomotionSteps[interrupted]?.atS;
      if (!cell.warriorContacts.some(({ atS, weapon, damage }) =>
        atS >= priorAtS - 1e-9 && atS <= fallenAtS + 1e-9 && weapon === expected.hit.warriorLoadout.primary &&
        Number.isFinite(damage) && damage > 0)) {
        fail("the interrupt boundary retained no damaging real Havok weapon contact");
      }
      if (!same(cell.stabilityShoves, [expected.hit.initialShove])) {
        fail("the explicit initial fall shove changed or another scheduled shove impersonated the hit");
      }
    } else {
      fail("unknown boundary cell kind");
    }
  }
  const heldWorldContacts = (report.cells ?? []).filter(({ kind }) => kind === "wall-pressure")
    .reduce((sum, cell) => sum + (cell.solver.heldWorldContactsByKind[cell.heldKind] ?? 0), 0);
  const hitContacts = (report.cells ?? []).find(({ kind }) => kind === "hit-interrupt")
    ?.warriorContacts.length ?? 0;
  if (report.summary?.physicalCells !== expected.cellIds.length ||
      report.summary?.heldWorldContacts !== heldWorldContacts ||
      report.summary?.hitContacts !== hitContacts) {
    failures.push("boundary summary contradicted retained evidence");
  }
  if (failures.length) throw new Error(`supported locomotion boundary corpus failed: ${failures.join("; ")}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = assertSupportedLocomotionBoundaryCorpus(await runSupportedLocomotionBoundaryCorpus());
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
