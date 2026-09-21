import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fingerprint, ROOT } from "../fingerprint.mjs";
import { digest } from "../schedule.mjs";
import { createEnvironment, recording } from "./environment.mjs";
import { BESPOKE, OBSERVATION_NAMES, actionSize } from "../../src/golem/lab-policy.ts";
import { mulberry32 } from "../../src/rng.ts";
import { freshHavok, runBout } from "../../tests/harness/bout-runner.mjs";
import { golemPlanner, GOLEM_PLANNER } from "../../src/golem/planner.ts";
import { fitDuelModel, observe, stateKey } from "../../src/golem/duel-model.ts";
import { namedBuild } from "../../src/golem/roster.ts";
import { fitTerminalModel, exchangeState } from "../../src/golem/lab-model.ts";

export function labFingerprint() {
  const directory = join(ROOT, "research/lab");
  const files = readdirSync(directory).filter((f) => /\.(mjs|py|ini|txt)$/.test(f)).map((f) => join(directory, f));
  files.push(join(ROOT, "src/golem/lab-policy.ts"));
  files.push(join(ROOT, "src/golem/lab-bespoke.ts"));
  files.push(join(ROOT, "src/golem/lab-model.ts"));
  files.push(join(ROOT, "research/constant-search.mjs"));
  files.push(join(ROOT, "research/model-campaign.mjs"));
  files.push(join(ROOT, "research/export-ppo-sampling.py"));
  return digest({ simulator: fingerprint().hash,
    files: Object.fromEntries(files.map((f) => [relative(ROOT, f).replaceAll("\\", "/"), readFileSync(f, "utf8")])) });
}
export function snapshotSources() {
  const files = [...fingerprint().files,
    ...readdirSync(join(ROOT, "research/lab")).filter((f) => /\.(mjs|py|ini|txt|html)$/.test(f)).map((f) => `research/lab/${f}`),
    "src/golem/lab-policy.ts", "src/golem/lab-bespoke.ts", "src/golem/lab-model.ts",
    "research/owned-child.mjs", "research/runner.mjs", "research/fingerprint.mjs", "research/constant-search.mjs", "research/model-campaign.mjs",
    "research/export-ppo-sampling.py"];
  return Object.fromEntries([...new Set(files)].sort().map((f) => [f, readFileSync(join(ROOT, f), "utf8")]));
}
export const SPLITS = Object.freeze({
  train: { builds: ["default", "two-blades", "mace", "fists"], opponents: ["golem-fencer", "golem-duelist", "golem-form", "golem-guardian"], seed: 1000 },
  selection: { builds: ["default", "maul", "whip", "ram-blade"], opponents: ["golem-planner", "golem-brawler"], seed: 200000 },
  confirmation: { builds: ["wheel", "multileg", "plated", "pitch-blade"], opponents: ["golem-champion", "golem-tactician", "golem-miser"], seed: 900000 },
  "dual-selection": { builds: ["two-blades", "fists"], opponents: ["golem-planner", "golem-brawler"], seed: 1200000 },
  "dual-confirmation": { builds: ["two-blades", "fists"], opponents: ["golem-champion", "golem-tactician", "golem-miser"], seed: 1800000 },
  // Champion is training data for students of the privileged reference trajectories.
  "student-confirmation": { builds: ["wheel", "multileg", "plated", "pitch-blade"], opponents: ["golem-tactician", "golem-miser"], seed: 2200000 },
  "student-dual-confirmation": { builds: ["two-blades", "fists"], opponents: ["golem-tactician", "golem-miser"], seed: 2400000 },
  "maul-confirmation": { builds: ["maul"], opponentBuilds: ["default", "maul", "mace", "two-blades"],
    opponents: ["golem-champion", "golem-tactician", "golem-miser"], seed: 2600000 },
});

export async function collect({ deadline, surface = "pilot", seconds = 10, seed = 1, build = "default", policy,
  opponent = "golem-fencer", opponentBuild = build, controlBaseline = "golem-driver",
  onTransition = () => {} }) {
  const env = await createEnvironment({ seed, surface, maxSeconds: seconds, trace: true, leftBuild: build, rightBuild: opponentBuild,
    right: { kind: "baseline", name: opponent },
    controlBaseline: policy?.kind === "network" ? policy.model.baseline ?? "golem-driver" : controlBaseline,
    ...(policy ? { left: policy } : {}) });
  const random = mulberry32(seed);
  try {
    let previous = env.observation(), state = env.state();
    while (!state.terminated && !state.truncated && Date.now() < deadline) {
      const action = policy ? null : Array.from({ length: actionSize(surface) }, () => random() * 2 - 1);
      state = env.step(action);
      onTransition({ observation: previous, action, nextObservation: state.observation, reward: state.reward,
        terminated: state.terminated, truncated: state.truncated, seed, split: "train" });
      previous = state.observation;
    }
    return recording(env);
  } finally { env.close(); }
}

/** Replay-derived problems carry observable predicates, not hand-edited physics snapshots. */
export function scenarios(record) {
  const field = (name) => OBSERVATION_NAMES.indexOf(name);
  const scenarios = [];
  const add = (kind, predicate) => {
    const index = record.steps.findIndex((row, i) => i >= 12 && !row.terminated && !row.truncated && predicate(row.observation, i));
    if (index >= 0) scenarios.push({ kind, replayId: record.id, index: index + 1, source: "observed predicate; not guaranteed success" });
  };
  add("attack-opportunity", (o) => o[0] * 4 < o[field("self.reach")] * 3);
  add("incoming-strike", (o) => {
    const p = [o[2] * 4 + o[field("opponent.primary.tipX")] * 3,
      o[field("opponent.primary.tipY")] * 3 - 1.2, o[3] * 4 + o[field("opponent.primary.tipZ")] * 3];
    const velocity = o.slice(field("opponent.primary.velocityX"), field("opponent.primary.velocityX") + 3).map((x) => x * 30);
    const speed2 = velocity.reduce((s, x) => s + x * x, 0);
    const t = -p.reduce((s, x, i) => s + x * velocity[i], 0) / Math.max(1e-9, speed2);
    return t > 0 && t < 0.25 && Math.hypot(...p.map((x, i) => x + t * velocity[i])) < 0.6;
  });
  add("recovery-window", (o, i) => {
    const k = field("opponent.primary.velocityX");
    return Math.hypot(...o.slice(k, k + 3)) < 0.15 && Math.hypot(...record.steps[i - 1].observation.slice(k, k + 3)) > 0.3;
  });
  add("hand-loss", (o) => o[field("self.primary.lost")] === 1 || o[field("self.secondary.lost")] === 1);
  return scenarios;
}

export function evaluationFixtures(split, repeats = 1, crossBuild = false, seedOffset = 0) {
  const pool = SPLITS[split];
  if (!pool) throw new Error("invalid split");
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 100) throw new Error("invalid evaluation repeats");
  if (!Number.isInteger(seedOffset) || seedOffset < 0 || seedOffset > 1000000000) throw new Error("invalid evaluation seed offset");
  const fixtures = [], opponentBuilds = pool.opponentBuilds ?? pool.builds;
  for (let repeat = 0; repeat < repeats; repeat++) for (const build of pool.builds)
  for (const opponentBuild of crossBuild ? opponentBuilds : [build]) for (const opponent of pool.opponents) {
    const seed = seedOffset + pool.seed + repeat * 10000 + pool.builds.indexOf(build) * 100 + pool.opponents.indexOf(opponent)
      + (crossBuild ? opponentBuilds.indexOf(opponentBuild) * 1000 : 0);
    fixtures.push({ build, opponentBuild, opponent, seed });
  }
  return fixtures;
}

export async function evaluatePolicy(policy, { split = "selection", deadline, maxSeconds = 150, completed = [],
  repeats = 1, crossBuild = false, seedOffset = 0, onResult = () => {} } = {}) {
  let count = 0;
  for (const { build, opponentBuild, opponent, seed } of evaluationFixtures(split, repeats, crossBuild, seedOffset)) {
    const existing = completed.filter((r) => r.build === build && r.opponent === opponent && r.seed === seed
      && (r.opponentBuild ?? r.build) === opponentBuild);
    if (existing.length) {
      if (existing.length !== 2 || new Set(existing.map((r) => r.side)).size !== 2 || existing.some((r) => r.split !== split)) throw new Error("invalid resumed pair");
      count += 2; continue;
    }
    const pair = [];
    for (const side of ["left", "right"]) {
      if (Date.now() >= deadline) return count;
      // Both assignments are explicit, with seeds following policies across the swap.
      const env = await createEnvironment({ seed: side === "left" ? seed : seed ^ 0x123456,
        leftBuild: side === "left" ? build : opponentBuild, rightBuild: side === "right" ? build : opponentBuild, maxSeconds,
        left: side === "left" ? policy : { kind: "baseline", name: opponent },
        right: side === "right" ? policy : { kind: "baseline", name: opponent } });
      try {
        let state = env.state();
        while (!state.terminated && !state.truncated && Date.now() < deadline) state = env.step();
        if (!state.terminated && !state.truncated) return count;
        const result = env.result(), stats = result[side];
        pair.push({ split, build, opponentBuild, opponent, side, seed, winner: state.winner, seconds: state.clock,
          terminated: state.terminated, truncated: state.truncated,
          score: state.winner === side ? 1 : state.winner === null ? 0.5 : 0,
          damage: stats.damage, range: result.behaviour[side].rangeBins,
          behavior: { attackRate: env.behaviors[side].attackEdges / state.clock,
            retreatFraction: env.behaviors[side].retreatSeconds / state.clock,
            nearFraction: result.behaviour[side].rangeBins[0] / Math.max(1e-9, result.behaviour[side].rangeBins.reduce((a, b) => a + b, 0)) } });
      } finally { env.close(); }
    }
    // Never publish a half pair as balanced evidence.
    for (const row of pair) { onResult(row); count++; }
  }
  return count;
}

export async function refit({ deadline, bouts = 4 }) {
  const records = [], terminalRecords = [], outcomes = [];
  for (let i = 0; i < bouts && Date.now() < deadline; i++) {
    let pending = null, totals = { dealt: 0, taken: 0 }, previousExchange = null;
    const boutExchanges = [], boutRecords = [];
    const seed = SPLITS.train.seed + i;
    const planner = golemPlanner(seed, undefined, { ...GOLEM_PLANNER, explore: 0.5 }, undefined, (_available, reading, view, option) => {
      const next = stateKey(observe(reading, view.opponent.reach));
      const exchange = exchangeState(reading, view), vitality = view.self.vitality - view.opponent.vitality;
      if (previousExchange) boutExchanges.push({ state: previousExchange.state, option: previousExchange.option,
        next: exchange, reward: vitality - previousExchange.vitality });
      previousExchange = { state: exchange, option, vitality };
      if (pending) boutRecords.push({ state: pending.state, option: pending.option, next,
        seconds: view.clock - pending.clock, dealt: totals.dealt - pending.dealt, taken: totals.taken - pending.taken });
      pending = { state: next, option, clock: view.clock, ...totals };
    });
    let result;
    try { result = runBout({ left: "golem-planner", right: SPLITS.train.opponents[Math.floor(i / 4) % 4], seeds: [seed, seed ^ 0x123456],
      leftMind: { name: "exploring-planner", decide: (v, dt) => planner.decide(v, dt) },
      leftGolem: namedBuild(SPLITS.train.builds[i % 4]).setup, rightGolem: namedBuild(SPLITS.train.builds[i % 4]).setup,
      locomotionMode: "supported", maxSeconds: 150, physics: await freshHavok(),
      onSample({ records }) { if (Date.now() >= deadline) throw new Error("refit deadline reached; incomplete bout excluded");
        totals = { dealt: records.left.damage, taken: records.right.damage }; } });
    } catch (error) {
      if (error.message === "refit deadline reached; incomplete bout excluded") break;
      throw error;
    }
    records.push(...boutRecords);
    // Last exchange is recorded exactly once; timeout is not mislabeled as an absorbing terminal.
    if (previousExchange && result.text !== "unfinished") boutExchanges.push({ state: previousExchange.state,
      option: previousExchange.option, next: null,
      reward: result.winner === null ? 0 : 2 * (result.winner === "left" ? 1 : -1) });
    terminalRecords.push(...boutExchanges);
    outcomes.push({ seed, winner: result.winner, seconds: result.seconds, terminalWindowExcluded: true });
  }
  if (!records.length) throw new Error("no completed refit records");
  return { tables: fitDuelModel(records, { seed: SPLITS.train.seed, date: new Date().toISOString(), bouts: outcomes.length, windowSeconds: 0.5 }),
    records, outcomes, terminalModel: fitTerminalModel(terminalRecords), terminalRecords,
    coverage: new Set(records.map((r) => `${r.state}|${r.option}`)).size,
    limitations: "exploratory damage/transition refit; terminal windows excluded, original model remains frozen" };
}
export const portfolio = () => [{ kind: "baseline", name: "golem-duelist" }, { kind: "baseline", name: "golem-driver" },
  ...BESPOKE.map((name) => ({ kind: "bespoke", name }))];
