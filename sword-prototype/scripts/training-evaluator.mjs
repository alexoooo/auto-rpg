import { evaluationMirrorSeeds, mirroredEvaluationJobs } from "../src/learning/evaluation.ts";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { fitnessComponents, networkMetaMind, noveltyDescriptor, randomMetaMind } from "../src/learning/meta.ts";
import { Network } from "../src/learning/network.ts";
import { ATTACK_OPTION_NAMES, behaviourRecord, recordBehaviourSample, recordCombatEvent, scriptedMetaMind } from "../src/options.ts";

process.env.SWORD_MEASURE_LIBRARY = "1";
// One default experiment creates hundreds of thousands of isolated NullEngines.
// Their construction banner is not progress and can swamp the atomic reports.
Logger.LogLevels = Logger.NoneLogLevel;
const { freshHavok, runBout } = await import("./measure.mjs");

const averageDescriptor = (descriptors) => descriptors[0].map((_, i) => descriptors.reduce((sum, row) => sum + row[i], 0) / descriptors.length);
async function boutFor(mind, job) {
  const seed = job.seed;
  const enemy = scriptedMetaMind("duelist", seed ^ 0xa5a5a5a5); const record = behaviourRecord(); const previous = {};
  const actorLeft = job.actorSide === "left"; let opponentVitality = 1;
  const tracked = { name: mind.name, decide(view, dt) { return mind.decide(view, dt); } };
  const result = runBout({ left: actorLeft ? "learned" : "swinger", right: actorLeft ? "swinger" : "learned",
    seeds: [seed, seed ^ 0xa5a5a5a5], leftLoadout: actorLeft ? { primary: "sword", secondary: "empty" } : undefined,
    rightLoadout: actorLeft ? undefined : { primary: "sword", secondary: "empty" }, leftMind: actorLeft ? tracked : enemy,
    rightMind: actorLeft ? enemy : tracked, physics: await freshHavok(),
    onSample({ left, right, dt }) { const actor = actorLeft ? left : right; const opponent = actorLeft ? right : left;
      recordBehaviourSample(record, actor.view, mind.selected ?? null, dt, previous); opponentVitality = opponent.view.self.vitality; },
    onEvent(event) {
      if ((event.side === "left") === actorLeft) recordCombatEvent(record,
        { hand: event.hand, weapon: event.report.weapon, damage: event.report.damage, blocked: false });
      else if (event.blocked) record.blocks += 1;
    },
  });
  record.win = result.winner === (actorLeft ? "left" : "right"); record.seconds = result.seconds;
  if (mind.entries) for (const name of ATTACK_OPTION_NAMES) record.attackAttempts[name] = mind.entries[name] ?? 0;
  return { record, opponentVitality, switches: mind.switches ?? 0, result };
}

export async function evaluateGenome(genome, baseSeed, split, cells) {
  const components = []; const descriptors = [];
  for (const job of mirroredEvaluationJobs(baseSeed, split, cells)) {
    const mind = networkMetaMind(new Network(genome)); const bout = await boutFor(mind, job);
    components.push(fitnessComponents(bout.record, bout.opponentVitality, mind.switches)); descriptors.push(noveltyDescriptor(bout.record));
  }
  const mean = Object.fromEntries(Object.keys(components[0]).map((key) => [key, components.reduce((sum, row) => sum + row[key], 0) / components.length]));
  if (Object.values(mean).some((value) => !Number.isFinite(value))) throw new Error(`non-finite ${split} fitness component`);
  return { components: mean, descriptor: averageDescriptor(descriptors), bouts: components.length };
}

export async function evaluateControl(kind, baseSeed, split) {
  const rows = [];
  for (let mirror = 0; mirror < 2; mirror += 1) {
    const [seed] = evaluationMirrorSeeds(baseSeed, split, 90 + (kind === "random" ? 1 : 0));
    const mind = kind === "random" ? randomMetaMind(seed) : scriptedMetaMind("duelist", seed);
    const bout = await boutFor(mind, { seed, actorSide: mirror === 0 ? "left" : "right" });
    rows.push({ win: bout.record.win, vitality: bout.record.vitality, opponentVitality: bout.opponentVitality, seconds: bout.result.seconds });
  }
  return { kind, rows };
}
