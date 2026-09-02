import { canonicalIntegrityJson, integrityDigest } from "../src/construct/integrity.ts";
import { evaluateProjectileImpact, PROJECTILE_PENETRATION_V1 } from "../src/scoring.ts";

export const COMBINED_ARMS_QUALIFICATION_VERSION = 2;
export const COMBINED_ARMS_EVENT_STEP_HZ = 240;
export const COMBINED_ARMS_SEEDS = Object.freeze([4140987459, 4124209840, 4174542697, 4157765078]);
export const COMBINED_ARMS_SIDES = Object.freeze(["left", "right"]);
// Run the whole set. The lowest passing value is selected numerically; neither this order nor a
// nearby passing row is allowed to turn a non-monotonic physical result into a binary search.
export const COMBINED_ARMS_DURABILITY_LADDER = Object.freeze([1, 0.75, 0.5, 0.25, 0.1, 0.05, 0.02]);
export const COMBINED_ARMS_MORPHOLOGIES = Object.freeze([
  Object.freeze({ id: "swordbearer", qualifierId: "swordbearer-combined-arms-v1",
    clearancePairs: Object.freeze(["sword/core"]), clearanceActions: Object.freeze({ "sword/core": "sweep" }),
    requiredRequests: Object.freeze(["turn", "close", "retreat"]) }),
  Object.freeze({ id: "twinblade", qualifierId: "twinblade-open-lane-v2",
    clearancePairs: Object.freeze(["left-sword/core", "right-sword/core"]),
    clearanceActions: Object.freeze({ "left-sword/core": "dual-cut", "right-sword/core": "dual-cut" }),
    requiredRequests: Object.freeze(["turn", "close"]) }),
  Object.freeze({ id: "arbalest", qualifierId: "arbalest-combined-arms-v3",
    clearancePairs: Object.freeze(["launcher/torso", "left-sword/torso"]),
    clearanceActions: Object.freeze({ "launcher/torso": "fire", "left-sword/torso": "cut-left" }),
    requiredRequests: Object.freeze(["turn", "ranged-spacing"]) }),
  Object.freeze({ id: "warden-crossbow", qualifierId: "warden-crossbow-combined-arms-v1",
    clearancePairs: Object.freeze(["launcher/core", "shield/core"]),
    clearanceActions: Object.freeze({ "launcher/core": "fire", "shield/core": "bash" }),
    requiredRequests: Object.freeze(["turn", "ranged-spacing"]) }),
  Object.freeze({ id: "warden-sword", qualifierId: "warden-sword-combat-v1",
    clearancePairs: Object.freeze(["dorsal-sword/core", "shield/core"]),
    clearanceActions: Object.freeze({ "dorsal-sword/core": "cut", "shield/core": "bash" }),
    requiredRequests: Object.freeze(["turn", "close", "retreat"]) }),
]);

const finite = (...values) => values.every(Number.isFinite);
const sameNumber = (left, right) => finite(left, right) &&
  Math.abs(left - right) <= 1e-12 * Math.max(1, Math.abs(left), Math.abs(right));
const morphologyById = new Map(COMBINED_ARMS_MORPHOLOGIES.map((row) => [row.id, row]));
const projectileKey = ({ owner, poolIndex, shotSerial } = {}) =>
  `${owner ?? "?"}:${poolIndex ?? "?"}:${shotSerial ?? "?"}`;
const pooledEffectorMatches = (row, moduleId) => {
  const match = typeof row?.effectorId === "string"
    ? new RegExp(`^${moduleId}:(0|[1-9][0-9]*)$`, "u").exec(row.effectorId) : null;
  return match !== null && Number(match[1]) === row?.projectile?.poolIndex;
};
const eventBefore = (left, right) => left.atStep < right.atStep ||
  left.atStep === right.atStep && left.sequence < right.sequence;
const eventAtOrBefore = (left, right) => left.atStep < right.atStep ||
  left.atStep === right.atStep && left.sequence <= right.sequence;
const eventTimeOrder = (events) => events.every((event, index) => event.sequence === index &&
  (index === 0 || eventBefore(events[index - 1], event)));
const durabilityKinds = Object.freeze(["parts", "joints", "modules"]);
const validDurabilityManifest = (manifest) => manifest &&
  Object.keys(manifest).sort().join("\0") === [...durabilityKinds].sort().join("\0") &&
  durabilityKinds.every((kind) => Array.isArray(manifest[kind]) && manifest[kind].length &&
    new Set(manifest[kind].map(({ id }) => id)).size === manifest[kind].length &&
    manifest[kind].every(({ id, health, armour }) => typeof id === "string" && id &&
      Number.isFinite(health) && health > 0 && Number.isFinite(armour) && armour >= 0));

export function reconstructCombinedArmsCell(cell) {
  const failures = [];
  const morphology = morphologyById.get(cell?.morphologyId);
  const events = Array.isArray(cell?.rawOrderedEvents) ? cell.rawOrderedEvents : [];
  if (!morphology || cell.qualifierId !== morphology?.qualifierId) {
    failures.push(`unknown or mismatched morphology qualifier ${JSON.stringify(cell?.qualifierId)}`);
  }
  if (!Array.isArray(cell?.rawOrderedEvents)) failures.push("raw ordered events are required");
  if (!events.length) failures.push("raw ordered events are empty");
  if (cell?.eventStepHz !== COMBINED_ARMS_EVENT_STEP_HZ) failures.push("raw event fixed-step identity is missing");
  if (events.some(({ sequence, atStep, atS }) => !Number.isInteger(sequence) || sequence < 0 ||
      !Number.isInteger(atStep) || atStep < 0 || atS !== atStep / COMBINED_ARMS_EVENT_STEP_HZ) ||
      new Set(events.map(({ sequence }) => sequence)).size !== events.length ||
      !eventTimeOrder(events)) failures.push("raw ordered events are not finite, unique and chronological");
  if (cell?.mode !== "idle" && cell?.mode !== "active") failures.push("cell mode is not idle or active");
  if (!Number.isInteger(cell?.seed) || !COMBINED_ARMS_SEEDS.includes(cell.seed) ||
      !COMBINED_ARMS_SIDES.includes(cell?.constructSide)) failures.push("cell seed or side is outside the frozen matrix");
  const loadoutKey = `${cell?.warriorLoadout?.primary ?? "?"}+${cell?.warriorLoadout?.secondary ?? "?"}`;
  const allowedLoadouts = morphology?.id === "twinblade"
    ? ["sword+buckler", "sword+empty"] : ["sword+buckler"];
  if (!allowedLoadouts.includes(loadoutKey) ||
      Object.keys(cell?.warriorLoadout ?? {}).sort().join("\0") !== "primary\0secondary") {
    failures.push("Warrior loadout is outside the frozen morphology matrix");
  }
  if (!Number.isInteger(cell?.combatValueUnitVersion) || cell.combatValueUnitVersion < 2) {
    failures.push("combat-value-v2 unit identity is missing");
  }
  if (!Number.isInteger(cell?.projectileLawVersion) || cell.projectileLawVersion < 1) {
    failures.push("projectile-law identity is missing");
  }
  for (const field of ["blueprintDigest", "controlDigest", "programDigest"]) {
    if (typeof cell?.[field] !== "string" || !/^[0-9a-f]{8}$/u.test(cell[field])) {
      failures.push(`${field} is not an exact integrity digest`);
    }
  }
  const baseDurability = cell?.baseDurability;
  const actualDurability = cell?.actualDurability;
  if (!validDurabilityManifest(baseDurability) || !validDurabilityManifest(actualDurability) ||
      !Number.isFinite(cell?.durabilityMultiplier) ||
      !COMBINED_ARMS_DURABILITY_LADDER.includes(cell.durabilityMultiplier)) {
    failures.push("base and actual part/joint/module durability manifests or rung multiplier are invalid");
  } else for (const kind of durabilityKinds) {
    const actualById = new Map(actualDurability[kind].map((row) => [row.id, row]));
    if (actualById.size !== baseDurability[kind].length || baseDurability[kind].some((base) => {
      const actual = actualById.get(base.id);
      return !actual || actual.health !== base.health * cell.durabilityMultiplier;
    })) failures.push(`${kind} durability was not scaled exactly once from authored base health`);
    if (baseDurability[kind].some((base) => actualById.get(base.id)?.armour !== base.armour)) {
      failures.push(`${kind} armour changed across durability scaling`);
    }
  }
  if (!cell?.verdict || !["construct", "warrior", "draw"].includes(cell.verdict.winner) ||
      !finite(cell.verdict.constructVitality, cell.verdict.warriorVitality) ||
      cell.verdict.constructVitality < 0 || cell.verdict.warriorVitality < 0 ||
      !Number.isInteger(cell.verdict.atStep) || cell.verdict.atStep < 0 ||
      cell.verdict.atS !== cell.verdict.atStep / COMBINED_ARMS_EVENT_STEP_HZ ||
      typeof cell.verdict.timeCap !== "boolean") failures.push("verdict evidence is invalid");
  else {
    const constructDead = cell.verdict.constructVitality === 0;
    const warriorDead = cell.verdict.warriorVitality === 0;
    const reconstructedWinner = constructDead === warriorDead ? "draw"
      : constructDead ? "warrior" : "construct";
    if (cell.verdict.winner !== reconstructedWinner ||
        cell.verdict.timeCap === true && cell.verdict.winner !== "draw") {
      failures.push("verdict contradicted final vitality or time-cap evidence");
    }
  }

  const refusals = events.filter(({ kind }) => kind === "combat-refusal");
  const audits = events.filter(({ kind }) => kind === "combat-audit");
  const ownerRefusals = refusals.filter(({ reason }) => reason === "owner-contact").length;
  const inactiveRefusals = refusals.filter(({ reason }) => reason === "inactive-action").length;
  const attributionRefusals = refusals.filter(({ reason }) => reason === "module-attribution").length;
  if (audits.length !== 1 || audits[0].ownerContactsRefused !== ownerRefusals ||
      audits[0].inactiveActionsRefused !== inactiveRefusals ||
      audits[0].moduleAttributionRefused !== attributionRefusals) {
    failures.push("owner-contact, inactive-action and module-attribution refusal stream is absent or contradicted");
  }

  const clearance = events.filter(({ kind }) => kind === "self-clearance");
  const diagnosticClearance = events.filter(({ kind }) => kind === "self-clearance-diagnostic");
  if (clearance.some(({ semanticPair, clearanceM, requiredM, action, actionInstanceId }) =>
      typeof semanticPair !== "string" || typeof action !== "string" ||
      typeof actionInstanceId !== "string" || !finite(clearanceM, requiredM) ||
      requiredM < 0 || clearanceM < requiredM)) {
    failures.push("semantic self-clearance fell below its authored limit");
  }
  if (diagnosticClearance.some(({ semanticPair, clearanceM, requiredM, sampledAtStep }) =>
      typeof semanticPair !== "string" || !finite(clearanceM, requiredM) || requiredM < 0 ||
      !Number.isInteger(sampledAtStep) || sampledAtStep < 0)) {
    failures.push("whole-bout diagnostic self-clearance is malformed");
  }
  for (const semanticPair of cell?.mode === "active" ? morphology?.clearancePairs ?? [] : []) {
    if (!clearance.some((row) => row.semanticPair === semanticPair)) {
      failures.push(`semantic self-clearance omitted ${semanticPair}`);
    }
  }
  if (cell?.mode === "idle" && clearance.length) failures.push("idle cell published armed self-clearance");
  const minimumSelfClearanceM = clearance.reduce((minimum, row) =>
    Math.min(minimum, row.clearanceM), Number.POSITIVE_INFINITY);
  const reconstructedMinimumClearance = Number.isFinite(minimumSelfClearanceM) ? minimumSelfClearanceM : null;
  if (cell?.minimumSelfClearanceM !== reconstructedMinimumClearance) {
    failures.push("minimum self-clearance contradicted raw semantic samples");
  }

  const starts = events.filter(({ kind }) => kind === "action-started");
  const phases = events.filter(({ kind }) => kind === "action-phase");
  const completions = events.filter(({ kind }) => kind === "action-completed");
  const terminals = events.filter(({ kind }) =>
    ["action-completed", "action-cancelled", "action-failed", "action-refused"].includes(kind));
  const admissions = events.filter(({ kind }) => kind === "attack-admitted");
  const contacts = events.filter(({ kind }) => kind === "contact");
  const startByInstance = new Map();
  for (const row of starts) {
    if (typeof row.action !== "string" || typeof row.actionInstanceId !== "string" ||
        startByInstance.has(row.actionInstanceId)) failures.push("Action instance start is missing or duplicated");
    else startByInstance.set(row.actionInstanceId, row);
  }
  const terminalByInstance = new Map();
  for (const row of terminals) {
    if (row.actionInstanceId === null && row.kind === "action-refused") continue;
    const started = startByInstance.get(row.actionInstanceId);
    if (typeof row.actionInstanceId !== "string" || !started || started.action !== row.action ||
        !eventBefore(started, row) || terminalByInstance.has(row.actionInstanceId)) {
      failures.push("Action terminal is missing, duplicated or contradicted its started instance");
      continue;
    }
    terminalByInstance.set(row.actionInstanceId, row);
  }
  if (new Set(admissions.map(({ actionInstanceId }) => actionInstanceId)).size !== admissions.length) {
    failures.push("one Action instance was admitted more than once");
  }
  const admittedInstances = new Set();
  const completedAdmittedInstances = new Set();
  for (const row of admissions) {
    const started = startByInstance.get(row.actionInstanceId);
    const terminal = terminalByInstance.get(row.actionInstanceId);
    const completed = terminal?.kind === "action-completed" ? terminal : undefined;
    const phase = phases.find((candidate) => candidate.actionInstanceId === row.actionInstanceId &&
      candidate.action === row.action && started && eventAtOrBefore(started, candidate) &&
      (terminal === undefined || eventAtOrBefore(candidate, terminal)));
    if (!started || started.action !== row.action || row.physical !== true ||
        !phase || !eventAtOrBefore(started, row) || terminal !== undefined && !eventAtOrBefore(row, terminal)) {
      failures.push("physical attack admission lacked one attributed started/phase Action instance");
    } else {
      admittedInstances.add(row.actionInstanceId);
      // A bout may end while the next legitimately admitted Action is still live. That open
      // terminal instance is evidence, but it is not one of the two completed attacks required
      // for qualification.
      if (completed !== undefined) completedAdmittedInstances.add(row.actionInstanceId);
    }
  }
  for (const row of clearance) {
    const admission = admissions.find((candidate) => candidate.actionInstanceId === row.actionInstanceId);
    const terminal = terminalByInstance.get(row.actionInstanceId);
    if (!admission || admission.action !== row.action ||
        morphology?.clearanceActions?.[row.semanticPair] !== row.action ||
        !eventAtOrBefore(admission, row) || terminal !== undefined && !eventAtOrBefore(row, terminal)) {
      failures.push("semantic self-clearance was not sampled inside its armed Action instance");
    }
  }
  for (const actionInstanceId of completedAdmittedInstances) {
    const admission = admissions.find((row) => row.actionInstanceId === actionInstanceId);
    for (const semanticPair of morphology?.clearancePairs ?? []) {
      if (morphology.clearanceActions[semanticPair] === admission?.action &&
          !clearance.some((row) => row.semanticPair === semanticPair &&
            row.actionInstanceId === actionInstanceId)) {
        failures.push(`completed armed Action ${actionInstanceId} omitted ${semanticPair} self-clearance`);
      }
    }
  }

  const launches = events.filter(({ kind }) => kind === "projectile-launched");
  const launchByKey = new Map();
  const launchSerials = new Set();
  for (const row of launches) {
    const identity = row.projectile;
    const key = projectileKey(identity);
    const serialKey = `${identity?.owner ?? "?"}:${identity?.shotSerial ?? "?"}`;
    if (identity?.owner !== "construct" || !Number.isInteger(identity?.poolIndex) || identity.poolIndex < 0 ||
        !Number.isInteger(identity?.shotSerial) || identity.shotSerial < 0 || launchByKey.has(key) ||
        launchSerials.has(serialKey) || !admittedInstances.has(row.actionInstanceId) ||
        !eventBefore(startByInstance.get(row.actionInstanceId), row)) {
      failures.push("projectile launch identity was recycled, invalid or lacked Action-instance attribution");
    } else { launchByKey.set(key, row); launchSerials.add(serialKey); }
  }
  const contactedProjectileKeys = new Set();
  for (const row of contacts) {
    if (row.ownerRelation !== "opponent" || row.sourceOwner !== "construct") {
      failures.push("owner contact masqueraded as an admitted attack");
    }
    if (row.attribution !== "verified" || typeof row.sourceModuleId !== "string" || !row.sourceModuleId) {
      failures.push("contact lacked verified source-module attribution");
    }
    if (typeof row.actionInstanceId !== "string" || !admittedInstances.has(row.actionInstanceId)) {
      failures.push("contact lacked an admitted Action-instance attribution");
    }
    const admission = admissions.find((candidate) => candidate.actionInstanceId === row.actionInstanceId);
    const terminal = terminalByInstance.get(row.actionInstanceId);
    // Temporal attribution and qualification answer different questions. A held effector can
    // make a real contact before its Action is later cancelled (or while that Action remains open
    // at the bout boundary), so neither absence of completion nor a non-completed terminal puts
    // that contact outside the Action. It remains non-qualifying below: only completed admitted
    // instances can supply the attack and damage gates. A contact after any terminal is invalid.
    if (!admission || !eventBefore(admission, row) || row.projectile == null &&
        terminal !== undefined && !eventBefore(row, terminal)) {
      failures.push("contact fell outside its attributed physical Action");
    }
    if (!finite(row.damage, row.preArmourDamage, row.postArmourDamage) || row.damage < 0 ||
        row.preArmourDamage < row.postArmourDamage || row.postArmourDamage !== row.damage) {
      failures.push("contact damage was forged or contradicted its armour evidence");
    }
    if (Number.isInteger(cell?.verdict?.atStep) && row.atStep >= cell.verdict.atStep) {
      failures.push("post-verdict contact cannot qualify");
    }
    if (row.projectile !== undefined && row.projectile !== null) {
      const key = projectileKey(row.projectile);
      const launch = launchByKey.get(key);
      let evaluation;
      try {
        evaluation = evaluateProjectileImpact({ massKg: row.massKg,
          speedMps: row.arrivalSpeedMps,
          signedShaftAlignment: row.signedShaftAlignment,
          contactedHead: row.contactedZone === "head",
          penetrationEfficiency: row.penetrationEfficiency });
      } catch { evaluation = undefined; }
      const semanticZone = row.contactedZone === "head" ? "point" : row.contactedZone;
      if (!launch || launch.actionInstanceId !== row.actionInstanceId ||
          !eventBefore(launch, row) ||
          !finite(row.massKg, row.arrivalSpeedMps, row.signedShaftAlignment,
            row.penetrationEfficiency, row.usableEnergyJ, row.uncappedDamage) ||
          !["head", "shaft", "tail", "other"].includes(row.contactedZone) ||
          row.contactZone !== semanticZone || row.axial !== (row.signedShaftAlignment > 0) ||
          evaluation === undefined ||
          !sameNumber(row.usableEnergyJ, evaluation.usableEnergyJ) ||
          !sameNumber(row.uncappedDamage, evaluation.uncappedDamage) ||
          !sameNumber(row.preArmourDamage, evaluation.score.damage) ||
          row.preArmourDamage > PROJECTILE_PENETRATION_V1.maximumDamage) {
        failures.push("projectile contact lacked unique launch, physical energy or Action-instance evidence");
      }
      if (contactedProjectileKeys.has(key)) failures.push("one projectile serial produced more than one scored contact");
      contactedProjectileKeys.add(key);
    }
  }

  const support = events.filter(({ kind }) => kind === "support");
  const finalSupport = support.at(-1);
  const malformedSupport = support.some(({ standing, assembled, recovery }) =>
    typeof standing !== "boolean" || typeof assembled !== "boolean" ||
    !["not-required", "pending", "recovered"].includes(recovery));
  // The idle half of every passing rung must be killed by the Warrior. Requiring that defeated
  // chassis to finish standing and assembled would make the 0/8 idle gate impossible by
  // construction. The integrity clause belongs to a Construct that claims the win; losing cells
  // still have to publish an honest, well-formed support history.
  const constructWon = cell?.verdict?.winner === "construct";
  if (!support.length || malformedSupport || constructWon &&
      (support.some(({ assembled }) => assembled !== true) || finalSupport?.standing !== true ||
        !["not-required", "recovered"].includes(finalSupport?.recovery))) {
    failures.push("support, assembly or recovery evidence is absent or unsupported for the winning Construct");
  }
  const motions = events.filter(({ kind }) => kind === "motion-request");
  if (cell?.mode === "active" && !motions.some(({ request, correctSign, earned }) =>
      (["turn", "close", "retreat"].includes(request) && correctSign === true) ||
      (request === "ranged-spacing" && correctSign === true && earned === true))) {
    failures.push("active cell lacks correct-sign movement or earned ranged spacing");
  }
  const passiveIntervals = events.filter(({ kind }) => kind === "passive-interval");
  const passiveAudits = events.filter(({ kind }) => kind === "passive-audit");
  const maximumPassiveIntervalS = passiveIntervals.reduce((maximum, { durationS }) =>
    Number.isFinite(durationS) ? Math.max(maximum, durationS) : maximum, 0);
  if (!Number.isFinite(cell?.passiveIntervalLimitS) || cell.passiveIntervalLimitS <= 0 ||
      passiveIntervals.some(({ visible, inRange, durationS }) => visible !== true || inRange !== true ||
        !Number.isFinite(durationS) || durationS < 0 ||
        durationS > cell.passiveIntervalLimitS)) {
    failures.push("passive visible/in-range interval exceeded the declared controller limit");
  }
  const passiveAudit = passiveAudits[0];
  if (passiveAudits.length !== 1 || passiveAudit?.activeProgram !== (cell?.mode === "active") ||
      passiveAudit?.terminalFlushed !== true ||
      passiveAudit?.intervals !== passiveIntervals.length ||
      passiveAudit?.maximumDurationS !== maximumPassiveIntervalS) {
    failures.push("passive interval stream lacks one exact terminal coverage audit");
  }
  const totalDamage = contacts.reduce((sum, row) => sum + (Number.isFinite(row.damage) ? row.damage : 0), 0);
  const completedDamage = contacts.reduce((sum, row) =>
    completedAdmittedInstances.has(row.actionInstanceId) && Number.isFinite(row.damage)
      ? sum + row.damage : sum, 0);
  if (cell?.mode === "active" && (completedAdmittedInstances.size < 2 || !(completedDamage > 0))) {
    failures.push("active cell lacks two completed physical attack admissions and positive damage");
  }
  if (cell?.mode === "idle" && (admissions.length > 0 || launches.length > 0 || totalDamage > 0)) {
    failures.push("posture-only idle authored an attack or damage");
  }

  const damaging = (predicate) => contacts.some((row) => row.damage > 0 &&
    completedAdmittedInstances.has(row.actionInstanceId) && predicate(row));
  if (cell?.mode === "active" && morphology) {
    if (morphology.id === "swordbearer" && !damaging(({ weapon }) => weapon === "sword")) {
      failures.push("Swordbearer lacks a physical sword wound");
    }
    if (morphology.id === "arbalest") {
      const bolt = damaging((row) => row.weapon === "projectile" && row.contactZone === "point" &&
        row.axial === true && row.usableEnergyJ > 0);
      const sword = damaging((row) => row.weapon === "sword" && row.action === "cut-left" &&
        row.sourceModuleId === "effigy-left-sword" && row.effectorId === "effigy-left-sword");
      const opportunities = events.filter(({ kind }) => kind === "melee-opportunity");
      const concurrent = opportunities.length > 0 && opportunities.every((opportunity) => starts.some((row) =>
        row.weapon === "sword" && row.action === "cut-left" && !eventBefore(row, opportunity) &&
        row.atStep - opportunity.atStep <= cell.passiveIntervalLimitS * COMBINED_ARMS_EVENT_STEP_HZ));
      if (!bolt || !sword || !concurrent) failures.push("Arbalest lacks point-first bolt and concurrent left-sword activity");
    }
    if (morphology.id === "warden-crossbow") {
      const bolt = damaging((row) => row.weapon === "projectile" && row.action === "fire" &&
        row.sourceModuleId === "dorsal-crossbow" && pooledEffectorMatches(row, "dorsal-crossbow") &&
        completedAdmittedInstances.has(row.actionInstanceId) &&
        row.contactZone === "point" && row.axial === true);
      const bash = contacts.some((row) => row.weapon === "shield" && row.action === "bash" &&
        row.sourceModuleId === "warden-shield" && row.effectorId === "warden-shield" &&
        completedAdmittedInstances.has(row.actionInstanceId) &&
        row.stabilityShove?.kind === "specific-impulse" && row.stabilityShove.specificImpulseMps > 0);
      if (!bolt || !bash) failures.push("crossbow Warden lacks bolt and physical shield-bash evidence");
    }
    if (morphology.id === "warden-sword" && !contacts.some((row) => row.weapon === "sword" &&
        row.sourceModuleId === "dorsal-sword" && row.effectorId === "dorsal-sword" &&
        row.action === "cut" && completedAdmittedInstances.has(row.actionInstanceId))) {
      failures.push("sword Warden lacks a physical dorsal sweep");
    }
  }

  const twoCutSequence = morphology?.id === "twinblade" && admissions.some((admission) => {
    if (admission.action !== "dual-cut" || admission.admissionSupported !== true ||
        admission.admissionUpright !== true || typeof admission.firstEffectorId !== "string" ||
        typeof admission.secondEffectorId !== "string" ||
        admission.firstEffectorId === admission.secondEffectorId) return false;
    const terminal = terminalByInstance.get(admission.actionInstanceId);
    if (terminal?.kind !== "action-completed") return false;
    const matchingCut = (row, phase, effectorId) => row.actionInstanceId === admission.actionInstanceId &&
      row.action === "dual-cut" && row.weapon === "sword" && row.phase === phase &&
      row.effectorId === effectorId && row.sourceModuleId === effectorId && row.blocked === false &&
      row.targetPartId === "torso" && row.standingAtStep === true && row.damage > 0 &&
      finite(row.preArmourDamage, row.postArmourDamage, row.targetVitalityBefore, row.targetVitalityAfter) &&
      row.preArmourDamage >= row.postArmourDamage && row.postArmourDamage === row.damage &&
      row.targetVitalityBefore > row.targetVitalityAfter && row.targetVitalityAfter >= 0;
    const first = contacts.find((row) => matchingCut(row, "first-cut", admission.firstEffectorId) &&
      eventBefore(admission, row) && eventBefore(row, terminal) && row.targetVitalityAfter > 0);
    if (!first) return false;
    const second = contacts.find((row) => matchingCut(row, "second-cut", admission.secondEffectorId) &&
      eventBefore(first, row) && eventBefore(row, terminal) &&
      row.targetVitalityBefore === first.targetVitalityAfter);
    if (!second) return false;
    return !contacts.some((row) => row !== first && row !== second && row.damage > 0 &&
      eventBefore(first, row) && eventBefore(row, second));
  });

  return Object.freeze({ failures: Object.freeze(failures), totalDamage,
    attackAdmissions: completedAdmittedInstances.size, minimumSelfClearanceM: reconstructedMinimumClearance,
    requests: Object.freeze([...new Set(motions.map(({ request }) => request))].sort()),
    lanes: Object.freeze([...new Set(admissions.map(({ lane }) => lane).filter(Boolean))].sort()),
    twoCutSequence,
  });
}

export function reconstructCombinedArmsRung(morphologyId, cells, durabilityMultiplier = null) {
  const failures = [];
  const expectedKeys = new Set(COMBINED_ARMS_SEEDS.flatMap((seed) => COMBINED_ARMS_SIDES.flatMap((side) =>
    ["idle", "active"].map((mode) => `${mode}:${seed}:${side}`))));
  const keys = cells.map(({ mode, seed, constructSide }) => `${mode}:${seed}:${constructSide}`);
  if (cells.length !== 16 || new Set(keys).size !== keys.length ||
      keys.some((key) => !expectedKeys.has(key)) || [...expectedKeys].some((key) => !keys.includes(key))) {
    failures.push("rung is not the exact seed x side x idle/active matrix");
  }
  const reconstructed = cells.map((cell) => reconstructCombinedArmsCell(cell));
  reconstructed.forEach((row, index) => failures.push(...row.failures.map((reason) =>
    `${keys[index] ?? index}: ${reason}`)));
  if (durabilityMultiplier !== null && cells.some((cell) =>
      cell.durabilityMultiplier !== durabilityMultiplier)) {
    failures.push("cell durability multiplier contradicted its rung");
  }
  if (new Set(cells.map(({ blueprintDigest }) => blueprintDigest)).size !== 1 ||
      new Set(cells.map(({ controlDigest }) => controlDigest)).size !== 1 ||
      ["idle", "active"].some((mode) => new Set(cells.filter((cell) => cell.mode === mode)
        .map(({ programDigest }) => programDigest)).size !== 1)) {
    failures.push("rung did not use one exact body/control and one program per mode");
  }
  const idle = cells.filter(({ mode }) => mode === "idle");
  const active = cells.filter(({ mode }) => mode === "active");
  const activeWins = active.filter(({ verdict }) => verdict?.winner === "construct" && verdict.warriorVitality === 0);
  const summary = Object.freeze({
    idleConstructWins: idle.filter(({ verdict }) => verdict?.winner === "construct").length,
    idleWarriorKills: idle.filter(({ verdict }) => verdict?.winner === "warrior" && verdict.constructVitality === 0).length,
    activeConstructWins: activeWins.length,
    activeConstructWinsLeft: activeWins.filter(({ constructSide }) => constructSide === "left").length,
    activeConstructWinsRight: activeWins.filter(({ constructSide }) => constructSide === "right").length,
    activeEvidenceCells: reconstructed.filter((_, index) => cells[index]?.mode === "active" &&
      reconstructed[index].failures.length === 0).length,
  });
  if (summary.idleConstructWins !== 0 || summary.idleWarriorKills !== 8) {
    failures.push(`idle gate requires 0 Construct wins and 8 Warrior kills; got ${summary.idleConstructWins} and ${summary.idleWarriorKills}`);
  }
  if (summary.activeConstructWins < 6 || summary.activeConstructWinsLeft < 3 ||
      summary.activeConstructWinsRight < 3) {
    failures.push(`active gate requires 6 wins and 3 per mirror; got ${summary.activeConstructWins}, ` +
      `${summary.activeConstructWinsLeft} left, ${summary.activeConstructWinsRight} right`);
  }
  const morphology = morphologyById.get(morphologyId);
  const requests = new Set(reconstructed.flatMap(({ requests }) => requests));
  for (const request of morphology?.requiredRequests ?? []) if (!requests.has(request)) {
    failures.push(`accepted ${morphologyId} corpus omitted ${request} request evidence`);
  }
  if (morphologyId === "twinblade") {
    const lanes = new Set(reconstructed.flatMap(({ lanes }) => lanes));
    const loadouts = new Set(cells.map(({ warriorLoadout }) =>
      `${warriorLoadout?.primary ?? "?"}+${warriorLoadout?.secondary ?? "?"}`));
    const correlatedLane = (secondary, lane) => cells.some((cell, index) => cell.mode === "active" &&
      cell.warriorLoadout?.primary === "sword" && cell.warriorLoadout?.secondary === secondary &&
      reconstructed[index].lanes.includes(lane));
    if (!loadouts.has("sword+buckler") || !loadouts.has("sword+empty") ||
        !lanes.has("shielded") || !lanes.has("unshielded") ||
        !correlatedLane("buckler", "shielded") || !correlatedLane("empty", "unshielded") ||
        !reconstructed.some(({ twoCutSequence }) => twoCutSequence)) {
      failures.push("Twinblade corpus lacks explicit shielded/unshielded loadouts and lanes or one completed two-cut sequence");
    }
  }
  return Object.freeze({ passed: failures.length === 0, failures: Object.freeze(failures), summary });
}

export function selectLowestPassingRung(rungs) {
  const passing = rungs.filter(({ evaluation }) => evaluation?.passed === true)
    .map(({ durabilityMultiplier }) => durabilityMultiplier);
  return passing.length ? Math.min(...passing) : null;
}

export function beginCombinedArmsRunDigest(report) {
  return integrityDigest(canonicalIntegrityJson({ version: report.version, seeds: report.seeds,
    sides: report.sides, durabilityLadder: report.durabilityLadder,
    sourceDigest: report.sourceDigest, sourceDigestBefore: report.sourceDigestBefore,
    sourceDigestAfter: report.sourceDigestAfter }));
}

export function foldCombinedArmsRunDigest(folded, label, value) {
  const rowDigest = integrityDigest(canonicalIntegrityJson(value));
  return integrityDigest(`${folded}\0${label}\0${rowDigest}`);
}

/** Fold bounded canonical rows; never concatenate the 560-cell raw corpus into one allocation. */
export function combinedArmsRunDigest(report) {
  let folded = beginCombinedArmsRunDigest(report);
  for (const morphology of report.morphologies ?? []) {
    folded = foldCombinedArmsRunDigest(folded, "morphology", { id: morphology.id,
      qualifierId: morphology.qualifierId,
      selectedDurabilityMultiplier: morphology.selectedDurabilityMultiplier });
    for (const rung of morphology.rungs ?? []) {
      folded = foldCombinedArmsRunDigest(folded, "rung",
        { durabilityMultiplier: rung.durabilityMultiplier, evaluation: rung.evaluation });
      for (const cell of rung.cells ?? []) {
        folded = foldCombinedArmsRunDigest(folded, "cell", cell);
      }
    }
  }
  return folded;
}

export function finalizeCombinedArmsQualification(draft) {
  const morphologies = draft.morphologies.map((morphology) => {
    const rungs = morphology.rungs.map((rung) => {
      const evaluation = reconstructCombinedArmsRung(morphology.id, rung.cells,
        rung.durabilityMultiplier);
      return Object.freeze({ ...rung, evaluation });
    });
    return Object.freeze({ ...morphology, rungs: Object.freeze(rungs),
      selectedDurabilityMultiplier: selectLowestPassingRung(rungs) });
  });
  const report = { version: COMBINED_ARMS_QUALIFICATION_VERSION,
    seeds: COMBINED_ARMS_SEEDS, sides: COMBINED_ARMS_SIDES,
    durabilityLadder: COMBINED_ARMS_DURABILITY_LADDER,
    sourceDigestBefore: draft.sourceDigestBefore, sourceDigestAfter: draft.sourceDigestAfter,
    sourceDigest: draft.sourceDigestBefore, morphologies: Object.freeze(morphologies) };
  report.runDigest = combinedArmsRunDigest(report);
  report.status = morphologies.every(({ selectedDurabilityMultiplier }) =>
    selectedDurabilityMultiplier !== null) ? "qualified" : "rejected";
  return Object.freeze(report);
}

export function assertCombinedArmsQualification(report) {
  const failures = [];
  if (report?.version !== COMBINED_ARMS_QUALIFICATION_VERSION) failures.push("qualification version is not current");
  if (JSON.stringify(report?.seeds) !== JSON.stringify(COMBINED_ARMS_SEEDS) ||
      JSON.stringify(report?.sides) !== JSON.stringify(COMBINED_ARMS_SIDES) ||
      JSON.stringify(report?.durabilityLadder) !== JSON.stringify(COMBINED_ARMS_DURABILITY_LADDER)) {
    failures.push("qualification matrix identity changed");
  }
  if (!/^[0-9a-f]{8}$/u.test(report?.sourceDigest ?? "") ||
      report.sourceDigestBefore !== report.sourceDigest || report.sourceDigestAfter !== report.sourceDigest) {
    failures.push("runtime source changed during qualification");
  }
  const expectedMorphologies = COMBINED_ARMS_MORPHOLOGIES.map(({ id, qualifierId }) => `${id}:${qualifierId}`);
  const actualMorphologies = Array.isArray(report?.morphologies)
    ? report.morphologies.map(({ id, qualifierId }) => `${id}:${qualifierId}`) : [];
  if (JSON.stringify(actualMorphologies) !== JSON.stringify(expectedMorphologies)) {
    failures.push("qualification morphology or qualifier identity changed");
  }
  for (const morphology of report?.morphologies ?? []) {
    const multipliers = morphology.rungs?.map(({ durabilityMultiplier }) => durabilityMultiplier) ?? [];
    if (JSON.stringify(multipliers) !== JSON.stringify(COMBINED_ARMS_DURABILITY_LADDER)) {
      failures.push(`${morphology.id} did not run every durability rung in frozen order`);
      continue;
    }
    const rebuilt = morphology.rungs.map((rung) => reconstructCombinedArmsRung(morphology.id,
      rung.cells, rung.durabilityMultiplier));
    for (let index = 0; index < rebuilt.length; index += 1) {
      if (canonicalIntegrityJson(rebuilt[index]) !== canonicalIntegrityJson(morphology.rungs[index].evaluation)) {
        failures.push(`${morphology.id} rung ${multipliers[index]} evaluation contradicted raw cells`);
      }
    }
    const selected = selectLowestPassingRung(morphology.rungs);
    if (morphology.selectedDurabilityMultiplier !== selected) {
      failures.push(`${morphology.id} did not select the numerically lowest passing rung`);
    }
  }
  const expectedRunDigest = combinedArmsRunDigest(report);
  if (report?.runDigest !== expectedRunDigest) failures.push("qualification run digest contradicted raw ordered evidence");
  const expectedStatus = (report?.morphologies ?? []).length === COMBINED_ARMS_MORPHOLOGIES.length &&
    report.morphologies.every(({ selectedDurabilityMultiplier }) => selectedDurabilityMultiplier !== null)
    ? "qualified" : "rejected";
  if (report?.status !== expectedStatus) failures.push("qualification status contradicted reconstructed rungs");
  if (failures.length) throw new Error(`combined-arms qualification failed: ${failures.join("; ")}`);
  return report;
}
