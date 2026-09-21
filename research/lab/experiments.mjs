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

export function labFingerprint() {
  const directory = join(ROOT, "research/lab");
  const files = readdirSync(directory).filter((f) => /\.(mjs|py|ini|txt)$/.test(f)).map((f) => join(directory, f));
  files.push(join(ROOT, "src/golem/lab-policy.ts"));
  return digest({ simulator: fingerprint().hash,
    files: Object.fromEntries(files.map((f) => [relative(ROOT, f).replaceAll("\\", "/"), readFileSync(f, "utf8")])) });
}
export const SPLITS = Object.freeze({
  train: { builds: ["default", "two-blades", "mace", "fists"], opponents: ["golem-fencer", "golem-duelist", "golem-form", "golem-guardian"], seed: 1000 },
  selection: { builds: ["default", "maul", "whip", "ram-blade"], opponents: ["golem-planner", "golem-brawler"], seed: 200000 },
  confirmation: { builds: ["wheel", "multileg", "plated", "pitch-blade"], opponents: ["golem-champion", "golem-tactician", "golem-miser"], seed: 900000 },
});

export async function collect({ deadline, surface = "pilot", seconds = 10, seed = 1, build = "default", policy,
  onTransition = () => {} }) {
  const env = await createEnvironment({ seed, surface, maxSeconds: seconds, trace: true, leftBuild: build, rightBuild: build,
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

export async function evaluatePolicy(policy, { split = "selection", deadline, maxSeconds = 150, completed = [], onResult = () => {} } = {}) {
  const pool = SPLITS[split];
  if (!pool) throw new Error("invalid split");
  let count = 0;
  for (const build of pool.builds) for (const opponent of pool.opponents) {
    const existing = completed.filter((r) => r.build === build && r.opponent === opponent);
    if (existing.length) {
      if (existing.length !== 2 || new Set(existing.map((r) => r.side)).size !== 2 || existing.some((r) => r.split !== split)) throw new Error("invalid resumed pair");
      count += 2; continue;
    }
    const pair = [];
    for (const side of ["left", "right"]) {
      if (Date.now() >= deadline) return count;
      // Both assignments are explicit, with seeds following policies across the swap.
      const seed = pool.seed + pool.builds.indexOf(build) * 100 + pool.opponents.indexOf(opponent);
      const env = await createEnvironment({ seed: side === "left" ? seed : seed ^ 0x123456,
        leftBuild: build, rightBuild: build, maxSeconds,
        left: side === "left" ? policy : { kind: "baseline", name: opponent },
        right: side === "right" ? policy : { kind: "baseline", name: opponent } });
      try {
        let state = env.state();
        while (!state.terminated && !state.truncated && Date.now() < deadline) state = env.step();
        if (!state.terminated && !state.truncated) return count;
        const result = env.result(), stats = result[side];
        pair.push({ split, build, opponent, side, seed, winner: state.winner, seconds: state.clock,
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
  const records = [], outcomes = [];
  for (let i = 0; i < bouts && Date.now() < deadline; i++) {
    let pending = null, totals = { dealt: 0, taken: 0 };
    const seed = SPLITS.train.seed + i;
    const planner = golemPlanner(seed, undefined, { ...GOLEM_PLANNER, explore: 0.5 }, undefined, (_available, reading, view, option) => {
      const next = stateKey(observe(reading, view.opponent.reach));
      if (pending) records.push({ state: pending.state, option: pending.option, next,
        seconds: view.clock - pending.clock, dealt: totals.dealt - pending.dealt, taken: totals.taken - pending.taken });
      pending = { state: next, option, clock: view.clock, ...totals };
    });
    const result = runBout({ left: "golem-planner", right: SPLITS.train.opponents[i % 4], seeds: [seed, seed ^ 0x123456],
      leftMind: { name: "exploring-planner", decide: (v, dt) => planner.decide(v, dt) },
      leftGolem: namedBuild(SPLITS.train.builds[i % 4]).setup, rightGolem: namedBuild(SPLITS.train.builds[i % 4]).setup,
      locomotionMode: "supported", maxSeconds: 150, physics: await freshHavok(),
      onSample({ records }) { if (Date.now() >= deadline) throw new Error("refit deadline reached; incomplete bout excluded");
        totals = { dealt: records.left.damage, taken: records.right.damage }; } });
    outcomes.push({ seed, winner: result.winner, seconds: result.seconds, terminalWindowExcluded: true });
  }
  if (!records.length) throw new Error("no completed refit records");
  return { tables: fitDuelModel(records, { seed: SPLITS.train.seed, date: new Date().toISOString(), bouts: outcomes.length, windowSeconds: 0.5 }),
    records, outcomes, coverage: new Set(records.map((r) => `${r.state}|${r.option}`)).size,
    limitations: "exploratory damage/transition refit; terminal windows excluded, original model remains frozen" };
}
export const portfolio = () => [{ kind: "baseline", name: "golem-duelist" }, { kind: "baseline", name: "golem-driver" },
  ...BESPOKE.map((name) => ({ kind: "bespoke", name }))];
