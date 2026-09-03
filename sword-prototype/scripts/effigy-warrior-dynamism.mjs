import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { humanoidSavedConstruct, HUMANOID_SENSORS } from "../src/construct/humanoid.ts";
import { runConstructWarriorBout } from "./construct-warrior-bout.mjs";

// `measure.mjs` is a reusable real-Havok harness as well as a CLI. Its explicit library switch
// prevents importing this corpus from quietly launching its forty-bout benchmark before ours.
process.env.SWORD_MEASURE_LIBRARY = "1";
const { freshHavok, runBout } = await import("./measure.mjs");

/**
 * The fixed physical comparison for the authored Swordbearer.  These are the same four seeds
 * and mirrored Construct positions used by the combined-arms entry corpus; they are deliberately
 * not a convenient seed search and a timeout is not a draw-free pass.
 */
export const EFFIGY_DYNAMISM_V1 = Object.freeze({
  seconds: 30,
  physicsHz: 240,
  constructSides: Object.freeze(["left", "right"]),
  warriorSeeds: Object.freeze([4140987459, 4124209840, 4174542697, 4157765078]),
  maximumPassiveCombatS: 0.75,
  minimumCompletedAttacks: 3,
  minimumGauntletChecks: 1,
  minimumBimanualCommitSamples: 1,
  minimumOrbitDirectionSwitches: 2,
  minimumTurnAndMoveS: 0.25,
  minimumSupportedStandingS: 19,
  minimumSwordCoreClearanceM: 0.025,
});

const ATTACK_ACTIONS = new Set(["sweep", "counter", "gauntlet-strike"]);
const RIGHT_ARM_ACTIONS = new Set(["sweep", "guard", "aim"]);
const LEFT_ARM_ACTIONS = new Set(["offhand-guard", "gauntlet-strike"]);
const MOTION_ACTIONS = new Set(["advance", "withdraw", "orbit-left", "orbit-right", "recover"]);
const HOLD_EXEMPT_PHASES = new Set(["counter", "hold-ground"]);

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const copyRequest = (value) => value === null || value === undefined ? null : Object.freeze({
  forward: value.localForward, right: value.localRight, yaw: value.yaw, recover: value.recover,
});
const copyPosition = (value) => Object.freeze({ x: value.x, z: value.z });
const headingAt = (node) => {
  const forward = Vector3.Forward().rotateByQuaternionToRef(node.rotationQuaternion ?? Quaternion.Identity(), new Vector3());
  return Math.atan2(forward.x, forward.z);
};
const immutableMetric = (value) => Object.freeze({ ...value });
const sameNumber = (left, right) => finite(left) && finite(right) && Math.abs(left - right) <= 1e-9;
const wrappedDelta = (value) => Math.atan2(Math.sin(value), Math.cos(value));

/** The carrier/action facts beside every pose make a pretty trace insufficient on its own. */
function effigySample({ step, atS, construct, warrior, snapshot }) {
  const root = construct.runtime.part(construct.runtime.blueprint.rootPart).node;
  const centre = construct.centre();
  const opponent = warrior.centre();
  const active = Object.freeze(snapshot.active.map((row) => Object.freeze({
    action: row.action, group: row.group, controller: row.controller ?? "unknown", phase: row.phase,
  })));
  const terminal = Object.freeze(snapshot.events.filter(({ kind }) => kind === "completed" || kind === "cancelled" || kind === "failed")
    .map(({ kind, action, group, reason }) => Object.freeze({ kind, action, group, reason })));
  return Object.freeze({
    step,
    atS,
    root: copyPosition(centre),
    opponent: copyPosition(opponent),
    headingRad: headingAt(root),
    supportState: snapshot.locomotion?.state.state ?? "unknown",
    carrierRequested: copyRequest(snapshot.locomotion?.requested),
    carrierAllowed: copyRequest(snapshot.locomotion?.allowed),
    phase: snapshot.decision?.phase ?? "none",
    reason: snapshot.decision?.reason ?? "no decision",
    selectedActions: Object.freeze(snapshot.command.requests.map(({ request }) => request.action)),
    active,
    rangeM: snapshot.facts["opponent-range"],
    swordCoreClearanceM: snapshot.facts["sword-core-clearance-m"],
    swordArmIntegrity: snapshot.facts["sword-arm-integrity"],
    leftArmIntegrity: snapshot.facts["left-arm-integrity"],
    terminal,
    weaponThreat: snapshot.facts["line-of-sight"] === true && snapshot.facts["opponent-weapon-present"] === true &&
      Number(snapshot.facts["opponent-weapon-speed-mps"] ?? 0) >= 5 && Number(snapshot.facts["opponent-weapon-local-z"] ?? 0) > 0 &&
      Number(snapshot.facts["opponent-weapon-local-vz"] ?? 0) < 0,
  });
}

function warriorSample({ step, atS, fighter, opponent }) {
  return Object.freeze({ step, atS, root: copyPosition(fighter.view.self.ground),
    opponent: copyPosition(opponent.view.self.ground), headingRad: fighter.view.self.facing,
    supportState: fighter.locomotion?.state ?? "legacy", carrierRequested: null, carrierAllowed: null,
    phase: "warrior-duelist", reason: "ordinary duelist", selectedActions: Object.freeze([]),
    active: Object.freeze([]), rangeM: fighter.view.measure, swordCoreClearanceM: Number.POSITIVE_INFINITY,
    terminal: Object.freeze([]), weaponThreat: false, swordArmIntegrity: null, leftArmIntegrity: null });
}

const vector = (from, to) => ({ x: to.x - from.x, z: to.z - from.z });
const length = (value) => Math.hypot(value.x, value.z);

/** Recompute all scores from immutable pose/action evidence; stored metrics are witnesses only. */
export function reconstructDynamismMetrics(samples, contacts = []) {
  if (!Array.isArray(samples) || samples.length < 2) throw new Error("dynamism needs at least two retained samples");
  let groundPathM = 0;
  let lateralExcursionM = 0;
  let accumulatedHeadingRad = 0;
  let orbitDirectionSwitches = 0;
  let priorOrbit = null;
  let passiveStart = null;
  let maximumPassiveCombatS = 0;
  let turnAndMoveStart = null;
  let maximumTurnAndMoveS = 0;
  const terminalActions = [];
  let gauntletChecks = 0;
  let bimanualCommitSamples = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const row = samples[index];
    if (!Number.isSafeInteger(row.step) || !finite(row.atS) || !finite(row.root?.x) || !finite(row.root?.z) ||
        !finite(row.opponent?.x) || !finite(row.opponent?.z) || !finite(row.headingRad)) {
      throw new Error("dynamism retained samples must contain finite physical poses and ordered steps");
    }
    if (index > 0) {
      const prior = samples[index - 1];
      if (row.step <= prior.step || row.atS <= prior.atS) throw new Error("dynamism retained sample steps must increase");
      const displacement = vector(prior.root, row.root);
      groundPathM += length(displacement);
      const line = vector(prior.root, prior.opponent);
      const lineLength = length(line);
      if (lineLength > 1e-9) lateralExcursionM += Math.abs((-line.z / lineLength) * displacement.x +
        (line.x / lineLength) * displacement.z);
      accumulatedHeadingRad += Math.abs(wrappedDelta(row.headingRad - prior.headingRad));
    }
    const orbit = row.phase === "orbit-left" || row.phase === "orbit-right" ? row.phase : null;
    if (orbit !== null && priorOrbit !== null && orbit !== priorOrbit) orbitDirectionSwitches += 1;
    if (orbit !== null) priorOrbit = orbit;

    const labelledActive = row.selectedActions.some((action) => MOTION_ACTIONS.has(action) || ATTACK_ACTIONS.has(action) ||
      action === "guard" || action === "offhand-guard" || action === "stabilize");
    if (row.selectedActions.includes("gauntlet-strike")) gauntletChecks += 1;
    if (row.selectedActions.includes("sweep") && row.selectedActions.includes("gauntlet-strike")) {
      bimanualCommitSamples += 1;
    }
    const inCombat = finite(row.rangeM) && row.rangeM <= 2.10;
    if (inCombat && !labelledActive && !HOLD_EXEMPT_PHASES.has(row.phase)) {
      if (passiveStart === null) passiveStart = row.atS;
      maximumPassiveCombatS = Math.max(maximumPassiveCombatS, row.atS - passiveStart);
    } else passiveStart = null;

    const carrier = row.carrierAllowed ?? row.carrierRequested;
    const turningAndMoving = carrier !== null && Math.abs(carrier.yaw) > 0.10 &&
      Math.hypot(carrier.forward, carrier.right) > 0.10 && row.selectedActions.some((action) =>
        action === "orbit-left" || action === "orbit-right");
    if (turningAndMoving) {
      if (turnAndMoveStart === null) turnAndMoveStart = row.atS;
      maximumTurnAndMoveS = Math.max(maximumTurnAndMoveS, row.atS - turnAndMoveStart);
    } else turnAndMoveStart = null;
    for (const event of row.terminal) if (event.kind === "completed" && ATTACK_ACTIONS.has(event.action)) terminalActions.push({ atS: row.atS, action: event.action });
  }
  let damagingStationaryContacts = 0;
  const exceptions = [];
  for (const contact of contacts) {
    if (!finite(contact?.atS) || !(contact.damage > 0)) continue;
    const window = samples.filter((row) => row.atS >= contact.atS - 1 && row.atS <= contact.atS);
    if (window.length < 2) continue;
    let travel = 0;
    let heading = 0;
    for (let index = 1; index < window.length; index += 1) {
      travel += length(vector(window[index - 1].root, window[index].root));
      heading += Math.abs(wrappedDelta(window[index].headingRad - window[index - 1].headingRad));
    }
    const phase = window.at(-1).phase;
    const exempt = HOLD_EXEMPT_PHASES.has(phase);
    if (travel < 0.20 && heading < 0.35 && !exempt) damagingStationaryContacts += 1;
    if (exempt) exceptions.push(Object.freeze({ atS: contact.atS, phase, travelM: travel, headingRad: heading }));
  }
  return immutableMetric({ groundPathM, lateralExcursionM, accumulatedHeadingRad, orbitDirectionSwitches,
    maximumPassiveCombatS, completedAttacks: terminalActions.length, damagingStationaryContacts,
    maximumTurnAndMoveS, gauntletChecks, bimanualCommitSamples,
    terminalActions: Object.freeze(terminalActions.map(Object.freeze)),
    stationaryExceptions: Object.freeze(exceptions) });
}

const lowerQuartile = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.floor((sorted.length - 1) * 0.25))];
};
const error = (message) => { throw new Error(`Effigy dynamism rejected: ${message}`); };

export function assertEffigyWarriorDynamismCorpus(report) {
  const config = EFFIGY_DYNAMISM_V1;
  if (!report || report.version !== 1 || !Array.isArray(report.cells)) error("missing v1 retained corpus");
  const expected = config.warriorSeeds.flatMap((seed) => config.constructSides.map((side) => `${seed}/${side}`));
  const actual = report.cells.map(({ seed, constructSide }) => `${seed}/${constructSide}`);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) error("cells are not in frozen seed/side order");
  const reconstructed = report.cells.map((cell) => Object.freeze({
    effigy: reconstructDynamismMetrics(cell.effigy.samples, cell.effigy.contacts),
    warrior: reconstructDynamismMetrics(cell.warrior.samples, cell.warrior.contacts),
  }));
  for (let index = 0; index < report.cells.length; index += 1) {
    const stored = report.cells[index].effigy.metrics;
    const current = reconstructed[index].effigy;
    for (const key of ["groundPathM", "lateralExcursionM", "accumulatedHeadingRad", "orbitDirectionSwitches",
      "maximumPassiveCombatS", "completedAttacks", "damagingStationaryContacts", "gauntletChecks", "bimanualCommitSamples"]) {
      if (!sameNumber(stored?.[key], current[key])) error(`${actual[index]} stored ${key} disagrees with physical samples`);
    }
  }
  const warriorLowerQuartile = Object.freeze({
    groundPathM: lowerQuartile(reconstructed.map(({ warrior }) => warrior.groundPathM)),
    lateralExcursionM: lowerQuartile(reconstructed.map(({ warrior }) => warrior.lateralExcursionM)),
    accumulatedHeadingRad: lowerQuartile(reconstructed.map(({ warrior }) => warrior.accumulatedHeadingRad)),
  });
  for (let index = 0; index < report.cells.length; index += 1) {
    const cell = report.cells[index];
    const metrics = reconstructed[index].effigy;
    for (const field of Object.keys(warriorLowerQuartile)) {
      if (metrics[field] + 1e-9 < warriorLowerQuartile[field]) error(`${actual[index]} ${field} is below Warrior lower quartile`);
    }
    if (metrics.completedAttacks < config.minimumCompletedAttacks) error(`${actual[index]} completed fewer than three attacks`);
    if (metrics.gauntletChecks < config.minimumGauntletChecks) error(`${actual[index]} never selected a gauntlet check`);
    if (metrics.bimanualCommitSamples < config.minimumBimanualCommitSamples) error(`${actual[index]} never committed both arms together`);
    if (metrics.orbitDirectionSwitches < config.minimumOrbitDirectionSwitches) error(`${actual[index]} changed orbit lane fewer than twice`);
    if (metrics.maximumPassiveCombatS > config.maximumPassiveCombatS + 1e-9) error(`${actual[index]} has an unlabelled passive combat interval`);
    if (metrics.maximumTurnAndMoveS + 1e-9 < config.minimumTurnAndMoveS) error(`${actual[index]} has no concurrent turn-and-move interval`);
    if (metrics.damagingStationaryContacts !== 0) error(`${actual[index]} damaged from a stationary unlabelled window`);
    const safety = cell.effigy.safety;
    if (!(safety?.longestStandingS >= config.minimumSupportedStandingS)) error(`${actual[index]} lost supported posture too early`);
    if (!(safety?.minimumSwordCoreClearanceM >= config.minimumSwordCoreClearanceM)) error(`${actual[index]} lost sword/core clearance`);
    const firstAttack = metrics.terminalActions.find(({ action }) => action === "sweep");
    if (firstAttack && !cell.effigy.samples.some((sample) => sample.atS > firstAttack.atS && sample.selectedActions.includes("withdraw"))) {
      error(`${actual[index]} never withdrew after a completed attack`);
    }
    const threatOccurred = cell.effigy.samples.some(({ weaponThreat }) => weaponThreat);
    if (threatOccurred && !cell.effigy.samples.some(({ weaponThreat, selectedActions }) => weaponThreat && selectedActions.includes("offhand-guard"))) {
      error(`${actual[index]} ignored a visible moving weapon with its intact off-hand`);
    }
    for (const sample of cell.effigy.samples) {
      const combat = finite(sample.rangeM) && sample.rangeM <= 2.10 && sample.phase !== "recover";
      if (!combat) continue;
      if (!sample.selectedActions.some((action) => RIGHT_ARM_ACTIONS.has(action))) {
        error(`${actual[index]} left the right arm unowned in ${sample.phase}`);
      }
      if (!sample.selectedActions.some((action) => LEFT_ARM_ACTIONS.has(action))) {
        error(`${actual[index]} left the gauntlet arm unowned in ${sample.phase}`);
      }
    }
  }
  return Object.freeze({ ...report, warriorLowerQuartile });
}

async function runWarriorReference(seed, constructSide) {
  const samples = [];
  const seeds = constructSide === "left" ? [seed, seed ^ 0x9e3779b9] : [seed ^ 0x9e3779b9, seed];
  const result = runBout({ left: "duelist", right: "duelist", seeds, maxSeconds: EFFIGY_DYNAMISM_V1.seconds,
    physics: await freshHavok(), onSample: ({ left, right }) => {
      const fighter = constructSide === "left" ? left : right;
      const opponent = constructSide === "left" ? right : left;
      // Combat's public clock advances on the 60 Hz verdict boundary. This corpus samples the
      // physical body at its declared 240 Hz boundary, so derive the sample timestamp from that
      // monotonic retained step rather than recording four identical 60 Hz clock readings.
      samples.push(warriorSample({ step: samples.length,
        atS: samples.length / EFFIGY_DYNAMISM_V1.physicsHz, fighter, opponent }));
    } });
  const contacts = Object.freeze([]);
  return Object.freeze({ samples: Object.freeze(samples), contacts, metrics: reconstructDynamismMetrics(samples, contacts),
    result: Object.freeze({ seconds: result.seconds, ending: result.ending }) });
}

async function runEffigyCell(seed, constructSide) {
  const samples = [];
  const bout = await runConstructWarriorBout({ saved: humanoidSavedConstruct(), sensors: HUMANOID_SENSORS,
    constructPolicy: "humanoid-authored", warriorPolicy: "duelist", warriorSeed: seed, constructSide,
    maxSteps: EFFIGY_DYNAMISM_V1.seconds * EFFIGY_DYNAMISM_V1.physicsHz,
    onConstructStep: (row) => samples.push(effigySample({ ...row, step: samples.length })) });
  const contacts = Object.freeze(bout.constructContacts.map((row) => Object.freeze({ atS: row.atS, damage: row.damage,
    action: row.action, phase: row.phase })));
  const metrics = reconstructDynamismMetrics(samples, contacts);
  return Object.freeze({ samples: Object.freeze(samples), contacts, metrics,
    safety: Object.freeze({ longestStandingS: bout.posture.longestStandingS,
      minimumSwordCoreClearanceM: bout.minimumSelfClearanceM ?? Number.NEGATIVE_INFINITY }),
    bout: Object.freeze({ winner: bout.winner, simulatedSeconds: bout.simulatedSeconds,
      completedActions: bout.completedActions, minimumSelfClearanceM: bout.minimumSelfClearanceM }) });
}

/** Run the eight retained physical cells. It returns evidence even when the assertion rejects it. */
export async function runEffigyWarriorDynamismCorpus() {
  const cells = [];
  for (const seed of EFFIGY_DYNAMISM_V1.warriorSeeds) for (const constructSide of EFFIGY_DYNAMISM_V1.constructSides) {
    const [effigy, warrior] = await Promise.all([runEffigyCell(seed, constructSide), runWarriorReference(seed, constructSide)]);
    cells.push(Object.freeze({ seed, constructSide, effigy, warrior }));
  }
  return Object.freeze({ version: 1, physics: "real-havok-fixed-240hz", config: EFFIGY_DYNAMISM_V1,
    cells: Object.freeze(cells) });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) {
  const report = await runEffigyWarriorDynamismCorpus();
  let accepted = null;
  let rejection = null;
  try { accepted = assertEffigyWarriorDynamismCorpus(report); }
  catch (error) { rejection = error instanceof Error ? error.message : String(error); process.exitCode = 1; }
  // A rejected fixed corpus is still useful evidence. Print its reconstructed rows before the
  // nonzero exit so an engineer cannot mistake the first failed assertion for the whole record or
  // quietly rerun only favourable cells.
  console.log(JSON.stringify({ accepted: accepted !== null, rejection,
    cells: report.cells.map(({ seed, constructSide, effigy }) => ({ seed, constructSide,
      metrics: effigy.metrics, safety: effigy.safety })),
    warriorLowerQuartile: accepted?.warriorLowerQuartile ?? null }, null, 2));
}
