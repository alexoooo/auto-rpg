// Reproducible option evaluation in the same real-solver harness as measure.mjs.
import { readFile, writeFile } from "node:fs/promises";

import { OPTION_NAMES, behaviourRecord, recordBehaviourSample, recordCombatEvent, recordIntentAttack,
  scriptedMetaMind } from "../src/options.ts";
import { INTENT_FIELDS, PARITY_CALIBRATION, PARITY_LIMITS, SHOT_PARITY_LIMITS, SYNTHETIC_FIELD_LIMITS,
  evaluationMirrorSeeds, forcedOptionEvaluationMind, intentFieldDeltas, intentSequencesEqual } from "../src/learning/evaluation.ts";
import { FEATURE_VERSION, FeatureWriter } from "../src/learning/features.ts";
import { policyMind } from "../src/mind.ts";

process.env.SWORD_MEASURE_LIBRARY = "1";
const { freshHavok, runBout } = await import("./measure.mjs");

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 && argv[at + 1] !== undefined ? argv[at + 1] : fallback;
};
const candidateCheckpoint = value("checkpoint", null);
if (candidateCheckpoint) {
  const { runPromotionEvaluation } = await import("./promotion-evaluator.mjs");
  await runPromotionEvaluation({ checkpointPath: candidateCheckpoint,
    trainingReportPath: value("training-report", null),
    baseSeed: Number(value("seed", 20260823)) >>> 0, bouts: Number(value("bouts", 24)),
    outputPath: value("output", null), freshHavok, runBout });
  process.exit(0);
}
// 20260823..826 are calibration bases; 20260827 is the first held-out base.
const baseSeed = Number(value("seed", 20260827)) >>> 0;
const splits = value("split", "train,validation,test").split(",");
const baselinePath = new URL("../asset-src/learning/baseline-v1.json", import.meta.url);

const CELLS = [
  // The archer bracket is first because its projectile solver is the most
  // sensitive warm-state probe; unrelated corpus cells never sit inside it.
  { name: "legacy-archer-bow", policy: "archer", controller: "legacy", parity: "archer-bow", seedCell: 1, loadout: { primary: "bow", secondary: "empty" } },
  { name: "meta-archer-bow", policy: "archer", controller: "meta", parity: "archer-bow", seedCell: 1, loadout: { primary: "bow", secondary: "empty" } },
  { name: "control-repeat-archer-bow", policy: "archer", controller: "control-repeat", parity: "archer-bow", seedCell: 1, loadout: { primary: "bow", secondary: "empty" } },
  { name: "legacy-duelist-sword", policy: "duelist", controller: "legacy", parity: "duelist-sword", seedCell: 0, loadout: { primary: "sword", secondary: "empty" } },
  { name: "meta-duelist-sword", policy: "duelist", controller: "meta", parity: "duelist-sword", seedCell: 0, loadout: { primary: "sword", secondary: "empty" } },
  { name: "control-repeat-duelist-sword", policy: "duelist", controller: "control-repeat", parity: "duelist-sword", seedCell: 0, loadout: { primary: "sword", secondary: "empty" } },
  { name: "duelist-axe", policy: "duelist", loadout: { primary: "axe", secondary: "empty" } },
  { name: "swinger-shield", policy: "swinger", loadout: { primary: "shield", secondary: "sword" } },
  { name: "duelist-buckler", policy: "duelist", loadout: { primary: "buckler", secondary: "sword" } },
  { name: "duelist-club", policy: "duelist", loadout: { primary: "club", secondary: "empty" } },
  { name: "duelist-empty", policy: "duelist", loadout: { primary: "empty", secondary: "empty" } },
  { name: "idle-control", policy: "idle", loadout: { primary: "sword", secondary: "empty" } },
  ...OPTION_NAMES.map((option) => ({ name: `option-${option}`, policy: "option", option,
    loadout: { primary: option === "shoot" ? "bow" : option === "punch" ? "empty" : "sword", secondary: "empty" } })),
];
const cellFilter = value("cell", "");
const ACTIVE_CELLS = CELLS.map((cell, index) => ({ cell, index }))
  .filter(({ cell }) => (!cellFilter || cell.name.includes(cellFilter)) &&
    (!argv.includes("--parity-only") || Boolean(cell.parity)));

const optionMind = (name) => {
  const forced = forcedOptionEvaluationMind(name);
  const entries = Object.fromEntries(OPTION_NAMES.map((optionName) => [optionName, 0]));
  let previous = null;
  return { name: forced.name, get selected() { return forced.selected; }, entries, decide(view, dt) {
    const intent = forced.decide(view, dt); if (forced.selected !== previous) entries[forced.selected] += 1; previous = forced.selected;
    return intent;
  } };
};

const fixtureHand = (weapon, outboard, x, z) => ({ weapon, shoulder: { x, y: 1.4, z },
  tip: { x, y: 1.4, z: z + (z ? -1 : 1) }, tipSpeed: 0, reach: weapon === "sword" ? 1.45 : 0.6,
  lost: false, outboard });
const fixtureView = (weapon = "sword") => {
  const selfHands = { primary: fixtureHand(weapon, 1, 0.2, 0), secondary: fixtureHand("empty", -1, -0.2, 0) };
  const opponentHands = { primary: fixtureHand("sword", 1, -0.2, 1.5), secondary: fixtureHand("empty", -1, 0.2, 1.5) };
  return { self: { ground: { x: 0, y: 0, z: 0 }, facing: 0, shoulder: selfHands.primary.shoulder,
    tip: selfHands.primary.tip, tipSpeed: 0, hands: selfHands, crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 1, health: {} },
  opponent: { ground: { x: 0, y: 0, z: 1.5 }, facing: Math.PI, shoulder: opponentHands.primary.shoulder,
    tip: opponentHands.primary.tip, tipSpeed: 0, hands: opponentHands, crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 1, health: {} },
  measure: 1.1, clock: 0 };
};
const syntheticDelta = Object.fromEntries(INTENT_FIELDS.map((field) => [field, { changed: 0, max: 0 }]));
const syntheticSamples = [];
const syntheticView = fixtureView(); const syntheticOld = policyMind("duelist", 991);
const syntheticMeta = scriptedMetaMind("duelist", 991);
for (let i = 0; i < 1200; i += 1) {
  syntheticView.clock = i / 240; const distance = i < 180 ? 2.2 - i / 300 : i < 360 ? 1.6 : i < 540 ? 1.1 : 1.42;
  syntheticView.opponent.ground.z = distance; syntheticView.opponent.shoulder.z = distance;
  syntheticView.measure = Math.max(0.9, distance - 0.2); syntheticView.opponent.hands.primary.tipSpeed = i > 700 && i < 760 ? 9 : 0;
  const oldIntent = syntheticOld.decide(syntheticView, 1 / 240);
  const metaIntent = syntheticMeta.decide(syntheticView, 1 / 240);
  if (argv.includes("--show-samples") && syntheticSamples.length < 24 &&
      (Math.abs(oldIntent.forward - metaIntent.forward) > 1e-12 ||
       Math.abs(oldIntent.primary.pointerX - metaIntent.primary.pointerX) > 1e-12 ||
       Math.abs(oldIntent.primary.pointerY - metaIntent.primary.pointerY) > 1e-12)) {
    syntheticSamples.push({ frame: i, distance, measure: syntheticView.measure,
      old: { forward: oldIntent.forward, x: oldIntent.primary.pointerX, y: oldIntent.primary.pointerY },
      meta: { forward: metaIntent.forward, x: metaIntent.primary.pointerX, y: metaIntent.primary.pointerY },
      option: syntheticMeta.selected });
  }
  for (const delta of intentFieldDeltas(oldIntent, metaIntent)) {
    if (!delta.equal) syntheticDelta[delta.field].changed += 1;
    if (delta.delta !== null) syntheticDelta[delta.field].max = Math.max(syntheticDelta[delta.field].max, Math.abs(delta.delta));
  }
}
const shotOutput = {};
for (const [name, mind] of [["legacy", policyMind("archer", 44)], ["meta", scriptedMetaMind("archer", 44)]]) {
  const bow = fixtureView("bow"); const counts = { held: 0, released: 0, edges: 0 }; let previousHeld = null;
  for (let i = 0; i < 520; i += 1) { bow.clock = i / 240; const intent = mind.decide(bow, 1 / 240);
    const held = intent.primary.thrust; held ? counts.held += 1 : counts.released += 1;
    if (previousHeld !== null && held !== previousHeld) counts.edges += 1; previousHeld = held; }
  shotOutput[name] = counts;
}
const syntheticFieldsWithinLimits = Object.fromEntries(INTENT_FIELDS.map((field) => [field,
  syntheticDelta[field].changed / 1200 <= SYNTHETIC_FIELD_LIMITS[field].changedRate &&
  syntheticDelta[field].max <= SYNTHETIC_FIELD_LIMITS[field].maxDelta]));
const shotDutyDelta = shotOutput.meta.held / 520 - shotOutput.legacy.held / 520;
const shotEdgeDelta = shotOutput.meta.edges - shotOutput.legacy.edges;
const syntheticParity = { samples: 1200, fields: syntheticDelta, fieldLimits: SYNTHETIC_FIELD_LIMITS,
  fieldsWithinLimits: syntheticFieldsWithinLimits, metaEntries: syntheticMeta.entries, shotOutput,
  shotLimits: SHOT_PARITY_LIMITS, shotDutyDelta, shotEdgeDelta,
  withinLimits: Object.values(syntheticFieldsWithinLimits).every(Boolean) &&
    Math.abs(shotDutyDelta) <= SHOT_PARITY_LIMITS.duty && Math.abs(shotEdgeDelta) <= SHOT_PARITY_LIMITS.edges };
if (argv.includes("--show-synthetic")) console.log(JSON.stringify(syntheticParity, null, 2));
if (argv.includes("--show-samples")) console.log(JSON.stringify(syntheticSamples, null, 2));

const records = [];
const intentTraces = new Map();
for (const parityPhase of [true, false]) for (const split of splits) {
  if (!["train", "validation", "test"].includes(split)) throw new Error(`unknown evaluation split "${split}"`);
  for (let mirror = 0; mirror < 2; mirror += 1) {
    for (const { cell, index: ci } of ACTIVE_CELLS) {
      if (Boolean(cell.parity) !== parityPhase) continue;
      // A mirror pair is one seeded experiment with arena side swapped, not
      // two samples that happen to sit beside each other.
      const seed = evaluationMirrorSeeds(baseSeed, split, cell.seedCell ?? ci)[mirror];
      const meta = cell.option ? optionMind(cell.option) : cell.controller === "meta" && (cell.policy === "duelist" || cell.policy === "archer")
        ? scriptedMetaMind(cell.policy, seed)
        : policyMind(cell.policy, seed);
      const tracked = { last: null, mind: { name: meta.name, decide(view, dt) {
        tracked.last = meta.decide(view, dt);
        return tracked.last;
      } } };
      const enemyPolicy = cell.parityEnemy ?? "swinger";
      const enemy = policyMind(enemyPolicy, seed ^ 0xa5a5a5a5);
      const behavior = behaviourRecord();
      const traceKey = `${split}/${cell.parity ?? cell.name}/${mirror}/${cell.controller ?? "other"}`;
      const intentTrace = [];
      const previous = {};
      const previousIntent = {};
      const featureWriter = new FeatureWriter();
      let lastFeatures = [];
      let actor = null;
      const leftActor = mirror === 0;
      if (cell.parity && cell.controller === "legacy") {
        const warmActor = policyMind(cell.policy, seed);
        const warmEnemy = policyMind(enemyPolicy, seed ^ 0xa5a5a5a5);
        runBout({
          left: leftActor ? cell.policy : enemyPolicy, right: leftActor ? enemyPolicy : cell.policy,
          seeds: [seed, seed ^ 0xa5a5a5a5],
          leftLoadout: leftActor ? cell.loadout : undefined,
          rightLoadout: leftActor ? undefined : cell.loadout,
          leftMind: leftActor ? warmActor : warmEnemy, rightMind: leftActor ? warmEnemy : warmActor,
          physics: await freshHavok(),
        });
      }
      const result = runBout({
        left: leftActor ? cell.policy : enemyPolicy,
        right: leftActor ? enemyPolicy : cell.policy,
        seeds: [seed, seed ^ 0xa5a5a5a5],
        leftLoadout: leftActor ? cell.loadout : undefined,
        rightLoadout: leftActor ? undefined : cell.loadout,
        leftMind: leftActor ? tracked.mind : enemy,
        rightMind: leftActor ? enemy : tracked.mind,
        physics: await freshHavok(),
        onSample({ left, right, dt }) {
          actor = leftActor ? left : right;
          lastFeatures = featureWriter.write(actor.view);
          recordBehaviourSample(behavior, actor.view, "selected" in meta ? meta.selected : null, dt, previous);
          const intent = tracked.last;
          if (intent) {
            recordIntentAttack(behavior, actor.view, intent, previousIntent);
            if (cell.parity || argv.includes("--trace-intents")) intentTrace.push(structuredClone(intent));
            behavior.actionTrace ??= { forward: 0, back: 0, guard: 0, thrust: 0 };
            if (intent.forward > 0) behavior.actionTrace.forward += 1;
            if (intent.forward < 0) behavior.actionTrace.back += 1;
            if (intent.primary.guard || intent.secondary.guard) behavior.actionTrace.guard += 1;
            if (intent.primary.thrust || intent.secondary.thrust) behavior.actionTrace.thrust += 1;
            behavior.intentTrace ??= { samples: 0,
              sums: Object.fromEntries(INTENT_FIELDS.map((field) => [field, 0])) };
            behavior.intentTrace.samples += 1;
            const read = (path) => path.split(".").reduce((at, key) => at[key], intent);
            for (const field of INTENT_FIELDS) {
              const raw = read(field); const numeric = field === "driving" ? (raw === "primary" ? 1 : 0)
                : typeof raw === "boolean" ? (raw ? 1 : 0) : raw;
              behavior.intentTrace.sums[field] += numeric;
            }
          }
        },
        onEvent({ side, report, hand, blocked }) {
          const actorSide = leftActor ? "left" : "right";
          if (side !== actorSide) {
            // A block report belongs to the striker's stream but describes the
            // defender's action. Credit it to the actor only when the other
            // side's blow was stopped by the actor.
            if (blocked) recordCombatEvent(behavior, {
              hand, weapon: report.weapon, damage: 0, blocked: true, defending: true, at: report.at,
              contactId: `${side}:${hand}:${report.weapon}:${report.key}:${report.at}`,
            });
            return;
          }
          recordCombatEvent(behavior, {
            hand, weapon: report.weapon, damage: report.damage, blocked: false, at: report.at,
            contactId: `${side}:${hand}:${report.weapon}:${report.key}:${report.at}`,
          });
        },
      });
      const side = leftActor ? "left" : "right";
      behavior.win = result.winner === side;
      behavior.vitality = actor?.view.self.vitality ?? behavior.vitality;
      if ("entries" in meta) {
        for (const attack of ["cut", "thrust", "punch", "shoot"]) {
          behavior.attackAttempts[attack] = meta.entries[attack];
        }
      }
      records.push({ split, cell: cell.name, parity: cell.parity ?? null, controller: cell.controller ?? ("selected" in meta ? "meta" : "legacy"), mirror, seed, outcome: result.ending, winner: result.winner,
        duration: result.seconds, featureCount: lastFeatures.length, behavior });
      intentTraces.set(traceKey, intentTrace);
    }
  }
}

const optionCorpus = OPTION_NAMES.map((option) => ({ option, seconds: records
  .filter((row) => row.controller === "meta")
  .reduce((sum, row) => sum + row.behavior.options[option], 0) }));
if (argv.includes("--trace-intents")) {
  for (const split of splits) for (const pair of ["duelist-sword", "archer-bow"]) for (let mirror = 0; mirror < 2; mirror += 1) {
    const oldTrace = intentTraces.get(`${split}/${pair}/${mirror}/legacy`) ?? [];
    const metaTrace = intentTraces.get(`${split}/${pair}/${mirror}/meta`) ?? [];
    const frames = Math.min(oldTrace.length, metaTrace.length); let first = null;
    for (let frame = 0; frame < frames; frame += 1) {
      const changed = intentFieldDeltas(oldTrace[frame], metaTrace[frame]).filter((delta) =>
        typeof delta.before === "number" && typeof delta.after === "number"
          ? !Object.is(delta.before, delta.after) : !delta.equal);
      if (changed.length) { first = { frame, changed }; break; }
    }
    console.log(`first intent delta ${split}/${pair}/${mirror}: ${JSON.stringify(first)}`);
  }
}
const parity = [];
for (const split of splits) for (const pair of ["duelist-sword", "archer-bow"]) for (let mirror = 0; mirror < 2; mirror += 1) {
  const legacy = records.find((row) => row.split === split && row.parity === pair && row.mirror === mirror && row.controller === "legacy");
  const meta = records.find((row) => row.split === split && row.parity === pair && row.mirror === mirror && row.controller === "meta");
  const repeat = records.find((row) => row.split === split && row.parity === pair && row.mirror === mirror && row.controller === "control-repeat");
  if (!legacy || !meta || !repeat) continue;
  const intentDelta = (after, before) => Object.fromEntries(INTENT_FIELDS.map((field) => [field,
    after.behavior.intentTrace.sums[field] / after.behavior.intentTrace.samples -
    before.behavior.intentTrace.sums[field] / before.behavior.intentTrace.samples]));
  const actionDelta = intentDelta(meta, legacy);
  const controlDelta = intentDelta(repeat, legacy);
  const legacySequence = intentTraces.get(`${split}/${pair}/${mirror}/legacy`) ?? [];
  const metaSequence = intentTraces.get(`${split}/${pair}/${mirror}/meta`) ?? [];
  const repeatSequence = intentTraces.get(`${split}/${pair}/${mirror}/control-repeat`) ?? [];
  const row = { split, pair, mirror, seed: legacy.seed, sameSeed: legacy.seed === meta.seed,
    endingMatch: legacy.outcome === meta.outcome, winnerMatch: legacy.behavior.win === meta.behavior.win,
    sampleCountMatch: legacySequence.length === metaSequence.length,
    intentSequenceMatch: intentSequencesEqual(legacySequence, metaSequence),
    controlEndingMatch: legacy.outcome === repeat.outcome, controlWinnerMatch: legacy.behavior.win === repeat.behavior.win,
    controlSampleCountMatch: legacySequence.length === repeatSequence.length,
    controlIntentSequenceMatch: intentSequencesEqual(legacySequence, repeatSequence),
    controlDamageDelta: repeat.behavior.damage - legacy.behavior.damage,
    controlDurationDelta: repeat.duration - legacy.duration, controlActionDelta: controlDelta,
    damageDelta: meta.behavior.damage - legacy.behavior.damage,
    durationDelta: meta.duration - legacy.duration,
    actionDelta };
  row.controlWithinLimits = row.controlEndingMatch && row.controlWinnerMatch &&
    row.controlSampleCountMatch && row.controlIntentSequenceMatch &&
    Math.abs(row.controlDamageDelta) <= PARITY_LIMITS.damage && Math.abs(row.controlDurationDelta) <= PARITY_LIMITS.seconds &&
    Object.values(row.controlActionDelta).every((delta) => Math.abs(delta) <= PARITY_LIMITS.actionRate);
  row.withinLimits = row.sameSeed && row.endingMatch && row.winnerMatch &&
    row.sampleCountMatch && row.intentSequenceMatch &&
    Math.abs(row.damageDelta) <= PARITY_LIMITS.damage && Math.abs(row.durationDelta) <= PARITY_LIMITS.seconds &&
    Object.values(row.actionDelta).every((delta) => Math.abs(delta) <= PARITY_LIMITS.actionRate) &&
    row.controlWithinLimits;
  parity.push(row);
}
export const output = { version: 3, baseSeed, featureVersion: FEATURE_VERSION, parityCalibration: PARITY_CALIBRATION, parityLimits: PARITY_LIMITS,
  syntheticParity, cells: CELLS, splits, optionCorpus, parity, records };
if (argv.includes("--calibrate")) {
  const maxima = parity.reduce((at, row) => ({
    damage: Math.max(at.damage, Math.abs(row.controlDamageDelta)),
    seconds: Math.max(at.seconds, Math.abs(row.controlDurationDelta)),
    actionRate: Math.max(at.actionRate, ...Object.values(row.controlActionDelta).map(Math.abs)),
  }), { damage: 0, seconds: 0, actionRate: 0 });
  const discreteMatch = parity.every((row) => row.controlEndingMatch && row.controlWinnerMatch &&
    row.controlSampleCountMatch && row.controlIntentSequenceMatch);
  console.log(`calibration ${baseSeed}: discrete ${discreteMatch ? "same" : "DIFFERENT"}, maxima ${JSON.stringify(maxima)}`);
  if (!discreteMatch) throw new Error("legacy bracket changed winner or ending during calibration");
  process.exit(0);
}

console.log("split       cell                 side  outcome     seconds  damage  vitality  option changes");
for (const row of records) {
  console.log(`${row.split.padEnd(11)} ${row.cell.padEnd(20)} ${row.mirror ? "right" : "left "}  ` +
    `${row.outcome.padEnd(11)} ${row.duration.toFixed(2).padStart(7)}  ${row.behavior.damage.toFixed(1).padStart(6)}  ` +
    `${row.behavior.vitality.toFixed(2).padStart(8)}  ${Object.values(row.behavior.transitions).reduce((a, b) => a + b, 0)}`);
}
console.log(`reached: ${optionCorpus.filter((row) => row.seconds > 0).map((row) => row.option).join(", ")}`);
console.log("paired legacy -> meta: outcome, damage delta, action-frame deltas, timing delta");
for (const row of parity) console.log(`${row.split}/${row.pair}/${row.mirror}: ending ${row.endingMatch ? "same" : "different"}, winner ${row.winnerMatch ? "same" : "FLIPPED"}, ` +
  `${row.damageDelta.toFixed(1)} damage, ${JSON.stringify(row.actionDelta)}, ${row.durationDelta.toFixed(2)} s, seed ${row.seed}`);
if (!syntheticParity.withinLimits) throw new Error("synthetic intent/shot parity exceeded its predeclared field limits");
const parityFailures = parity.filter((row) => !row.withinLimits);
if (parityFailures.length) {
  console.error(`parity failures: ${JSON.stringify(parityFailures, null, 2)}`);
  throw new Error(`paired parity exceeded ${JSON.stringify(PARITY_LIMITS)}`);
}
if (argv.includes("--write-baseline")) {
  await writeFile(baselinePath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`wrote ${baselinePath.pathname}`);
} else if (!argv.includes("--no-compare")) {
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  if (baseline.baseSeed !== baseSeed) {
    console.log(`evaluation seed ${baseSeed} is not checked-in baseline seed ${baseline.baseSeed}; report completed without replacing it`);
  } else if (JSON.stringify(baseline) !== JSON.stringify(output)) {
    throw new Error("evaluation differs from baseline-v1.json; inspect it before using --write-baseline");
  } else console.log("baseline-v1.json matches");
}
