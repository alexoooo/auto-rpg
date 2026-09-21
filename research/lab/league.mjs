/** Small adaptive population experiment, not the independent production rating league. */
import { createEnvironment } from "./environment.mjs";
import { mulberry32 } from "../../src/rng.ts";
import { randomNormal } from "./planning.mjs";
import { behaviorCell } from "./archive.mjs";

export async function populationSearch({ deadline, seed = 1, generations = 6, population = 6, onCheckpoint = () => {} }) {
  if (!Number.isInteger(seed) || seed < 0 || !Number.isInteger(generations) || generations < 1 || generations > 100
    || !Number.isInteger(population) || population < 2 || population > 32) throw new Error("invalid population configuration");
  const random = mulberry32(seed), history = [], archive = {};
  let champion = { kind: "mixture", seconds: 2,
    weights: Array.from({ length: 4 }, (_, i) => [i === 0 ? 1 : 0, 0, 0, 0, 0, 0, 0, 0]) };
  const fixed = ["golem-fencer", "golem-form", "golem-guardian", "golem-duelist"].map((name) => ({ kind: "baseline", name }));
  const pool = [];
  const result = () => ({ version: 1, seed, champion, history, archive, pool,
    status: "training population only; candidates require selection, independent confirmation and browser review" });
  for (let generation = 0; generation < generations && Date.now() < deadline; generation++) {
    const contenders = [champion, ...Array.from({ length: population - 1 }, () => ({ kind: "mixture",
      seconds: Math.max(0.25, Math.min(8, champion.seconds + randomNormal(random) * 0.5)),
      weights: champion.weights.map((r) => r.map((x) => Math.max(-4, Math.min(4, x + randomNormal(random) * 0.4)))) }))];
    // Everyone receives the same generation's fixtures. Half remain fixed anchors;
    // the other half become responsive prior-generation opponents.
    const foes = [fixed[generation % 4], fixed[(generation + 1) % 4],
      pool.at(-1) ?? fixed[2], pool.at(-2) ?? fixed[3]];
    const evaluated = [];
    for (const policy of contenders) {
      const rows = [];
      for (let f = 0; f < foes.length; f++) for (const side of ["left", "right"]) {
        if (Date.now() >= deadline) { onCheckpoint(result()); return result(); }
        const subjectSeed = seed + generation * 100 + f, build = ["default", "two-blades", "mace", "fists"][(generation + f) % 4];
        const env = await createEnvironment({ seed: side === "left" ? subjectSeed : subjectSeed ^ 0x123456,
          leftBuild: build, rightBuild: build, maxSeconds: 150,
          left: side === "left" ? policy : foes[f], right: side === "right" ? policy : foes[f] });
        try {
          let state = env.state();
          while (!state.terminated && !state.truncated && Date.now() < deadline) state = env.step();
          if (!state.terminated && !state.truncated) { onCheckpoint(result()); return result(); }
          const bins = env.result().behaviour[side].rangeBins;
          rows.push({ side, build, opponent: f, seed: subjectSeed, score: state.winner === side ? 1 : state.winner === null ? 0.5 : 0,
            behavior: { attackRate: env.behaviors[side].attackEdges / state.clock,
              retreatFraction: env.behaviors[side].retreatSeconds / state.clock,
              nearFraction: bins[0] / Math.max(1e-9, bins.reduce((a, b) => a + b, 0)) } });
        } finally { env.close(); }
      }
      const score = rows.reduce((s, r) => s + r.score, 0) / rows.length;
      const behavior = Object.fromEntries(Object.keys(rows[0].behavior).map((k) => [k, rows.reduce((s, r) => s + r.behavior[k], 0) / rows.length]));
      const entry = { policy, rows, score, behavior, generation, split: "train" };
      evaluated.push(entry);
      // This is a training novelty archive, intentionally NOT the gated selection archive.
      const cell = behaviorCell(behavior);
      if (!archive[cell] || archive[cell].score < score) archive[cell] = entry;
    }
    evaluated.sort((a, b) => b.score - a.score);
    champion = evaluated[0].policy;
    history.push({ generation, foes, evaluated });
    pool.push(structuredClone(champion));
    onCheckpoint(result());
  }
  return result();
}
