import { pathToFileURL } from "node:url";

import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { CONFIG } from "../src/config.ts";
import { saveConstruct } from "../src/construct/codec.ts";
import { ConstructLabBout } from "../src/construct/lab-bout.ts";
import { WARDEN_SENSORS, wardenBlueprint, wardenControl, wardenProgram } from "../src/construct/warden.ts";
import { createConstructHeadlessArena } from "./construct-headless-arena.mjs";

const recoverySaved = (mode) => {
  const program = structuredClone(wardenProgram("crossbow"));
  program.id = `warden-${mode}-fall-recovery-ab`;
  program.rules = [
    { id: "recover-fallen", action: "recover", priority: 20, optional: false, dwellS: 0,
      condition: { op: "not", value: { op: "sensor", id: "core-upright" } },
      utility: { op: "constant", value: 1 }, parameters: {} },
    { id: "brace-upright", action: "brace", priority: 10, optional: false, dwellS: 0,
      condition: { op: "sensor", id: "core-upright" }, utility: { op: "constant", value: 1 }, parameters: {} },
  ];
  return saveConstruct(`Warden ${mode} fall recovery A/B`, wardenBlueprint("crossbow"),
    wardenControl("crossbow", mode), program, WARDEN_SENSORS);
};

const impulseFor = (axis, magnitude) => axis === "longitudinal"
  ? new Vector3(0, 0, magnitude) : new Vector3(magnitude, 0, 0);

export async function measureWardenRecoveryCell(mode, axis) {
  const arena = await createConstructHeadlessArena();
  const saved = recoverySaved(mode);
  const bout = new ConstructLabBout(arena.scene, saved, saved, WARDEN_SENSORS, CONFIG.fighter.separation);
  try {
    for (let step = 0; step < 120; step += 1) bout.step(1 / CONFIG.world.physicsHz);
    const construct = bout.construct("left");
    const root = construct.runtime.part("core");
    arena.scene.getPhysicsEngine().getPhysicsPlugin().setActivationControl(root.body, 1);
    if (mode === "assisted") {
      // The authored stability event releases the carrier at the same safe boundary used by
      // Combat. 5.5 newton-seconds is just beyond the braced Warden's mass-scaled fall threshold;
      // the larger physical impulse below is then free to tip the released articulated body.
      construct.queueStabilityEvent({ horizontalShoveNs: axis === "longitudinal" ? [0, 5.5] : [5.5, 0] });
      bout.step(1 / CONFIG.world.physicsHz);
    }
    root.body.applyImpulse(impulseFor(axis, 450),
      root.body.getObjectCenterWorld().add(new Vector3(0, 1.1, 0)));
    let fell = false; let physicalFell = false; let recoveredAfterFall = false;
    let firstFallStep = null; let firstPhysicalFallStep = null; let firstRecoveryStep = null;
    let settledRecoveryStep = null;
    let finalFacts = construct.control.snapshot().facts;
    const supportStates = new Set(); const activeActions = new Set(); let maxContactsAfterFall = 0;
    for (let step = 0; step < 1440; step += 1) {
      const sample = bout.step(1 / CONFIG.world.physicsHz).left.snapshot;
      finalFacts = sample.facts;
      for (const action of sample.active) activeActions.add(`${action.action}/${action.phase}`);
      const supportState = construct.locomotion?.diagnostic().state.state;
      if (supportState) supportStates.add(supportState);
      const geometricUp = Vector3.Up().rotateByQuaternionToRef(root.node.rotationQuaternion, new Vector3()).y;
      if (geometricUp <= 0.72) {
        physicalFell = true;
        if (firstPhysicalFallStep === null) firstPhysicalFallStep = step;
      }
      const stepContacts = Object.entries(finalFacts)
        .filter(([id, value]) => id.startsWith("contact:") && value === true).length;
      if (finalFacts["core-upright"] === false) {
        fell = true;
        if (firstFallStep === null) firstFallStep = step;
      } else if (fell && !recoveredAfterFall) {
        recoveredAfterFall = true;
        firstRecoveryStep = step;
      }
      if (physicalFell && settledRecoveryStep === null && finalFacts["core-upright"] === true &&
          stepContacts >= 3 && (supportState === undefined || supportState === "supported")) {
        settledRecoveryStep = step;
      }
      if (fell) maxContactsAfterFall = Math.max(maxContactsAfterFall, stepContacts);
    }
    const contacts = Object.entries(finalFacts)
      .filter(([id, value]) => id.startsWith("contact:") && value === true).length;
    const port = construct.locomotion;
    return Object.freeze({ mode, axis, fell, physicalFell, recoveredAfterFall,
      firstFallStep, firstPhysicalFallStep, firstRecoveryStep, settledRecoveryStep,
      finalUpright: finalFacts["core-upright"] === true, finalContacts: contacts,
      maxContactsAfterFall, supportStates: Object.freeze([...supportStates]),
      activeActions: Object.freeze([...activeActions]),
      finalSupportState: port?.diagnostic().state.state ?? "legacy",
      finalPortDiagnostic: port?.diagnostic() ?? null });
  } finally {
    bout.dispose(); arena.dispose();
  }
}

export async function measureWardenRecoveryAB() {
  const cells = [];
  for (const mode of ["raw", "assisted"]) {
    for (const axis of ["longitudinal", "lateral"]) cells.push(await measureWardenRecoveryCell(mode, axis));
  }
  return Object.freeze({ harness: "headless Havok Warden fall/recovery A/B", physicsHz: CONFIG.world.physicsHz,
    impulseNs: 450, cells: Object.freeze(cells) });
}

export function assertWardenRecoveryABEvidence(report) {
  const expectedRows = ["raw/longitudinal", "raw/lateral", "assisted/longitudinal", "assisted/lateral"];
  const rows = report?.cells?.map(({ mode, axis }) => `${mode}/${axis}`) ?? [];
  if (report?.harness !== "headless Havok Warden fall/recovery A/B" ||
      report?.physicsHz !== CONFIG.world.physicsHz || report?.impulseNs !== 450 ||
      JSON.stringify(rows) !== JSON.stringify(expectedRows)) {
    throw new Error("Warden recovery A/B did not retain its exact physical four-cell fixture");
  }
  if (!report.cells.every(({ physicalFell }) => physicalFell === true)) {
    throw new Error("Warden recovery A/B contains a row that never physically fell");
  }
  const raw = report.cells.filter(({ mode }) => mode === "raw");
  if (!raw.every(({ recoveredAfterFall, settledRecoveryStep, finalUpright, finalSupportState }) =>
    recoveredAfterFall === false && settledRecoveryStep === null && finalUpright === false &&
      finalSupportState === "legacy")) {
    throw new Error("Warden recovery A/B raw negative-control row was laundered into a recovery");
  }
  const assisted = report.cells.filter(({ mode }) => mode === "assisted");
  if (!assisted.every(({ recoveredAfterFall, settledRecoveryStep, finalUpright, finalSupportState }) =>
    recoveredAfterFall === true && settledRecoveryStep !== null && finalUpright === true &&
      finalSupportState === "supported")) {
    throw new Error("Warden recovery A/B assisted row did not complete physical recovery");
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(assertWardenRecoveryABEvidence(
    await measureWardenRecoveryAB()), null, 2)}\n`);
}
