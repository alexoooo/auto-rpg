/** Low-dimensional residual search. Full bouts, matched fixtures, no timing/physics changes. */
import { createEnvironment } from "./lab/environment.mjs";
import { mulberry32 } from "../src/rng.ts";
import { LAB_VERSION, OBSERVATION_NAMES, DIRECT_FIELDS, validateNetwork } from "../src/golem/lab-policy.ts";
import { randomNormal } from "./lab/planning.mjs";

// Deliberately leave all boolean gates at zero: the baseline still owns attack timing.
export const POSE_FIELDS = DIRECT_FIELDS.map((name, index) => ({ name, index }))
  .filter(({ name }) => !name.endsWith(".thrust") && !name.endsWith(".guard"));

export function constantResidual(parameters, baseline = "golem-duelist") {
  if (parameters.length !== POSE_FIELDS.length || parameters.some((x) => !Number.isFinite(x) || Math.abs(x) > 1)) {
    throw new Error("invalid pose residual parameters");
  }
  const bias = DIRECT_FIELDS.map(() => 0);
  POSE_FIELDS.forEach(({ index }, i) => { bias[index] = parameters[i]; });
  const model = { version: LAB_VERSION, surface: "residual", hz: 12, baseline,
    observationNames: [...OBSERVATION_NAMES], layers: [{ activation: "linear", bias,
      weights: bias.map(() => OBSERVATION_NAMES.map(() => 0)) }] };
  validateNetwork(model);
  return model;
}

export function poseFixtures(seed, generation, suite = "rotating") {
  if (!["rotating", "balanced"].includes(suite)) throw new Error("invalid pose training suite");
  const builds = ["default", "two-blades", "mace", "fists"];
  const opponents = ["golem-fencer", "golem-duelist", "golem-form", "golem-guardian"];
  const rows = [];
  for (let fixture = 0; fixture < (suite === "balanced" ? 16 : 4); fixture++) for (const side of ["left", "right"]) {
    rows.push({ side, seed: seed + generation * 100 + fixture,
      build: builds[suite === "balanced" ? Math.floor(fixture / 4) : (fixture + generation) % 4],
      opponent: opponents[fixture % 4] });
  }
  return rows;
}

export async function poseFitness(parameters, { deadline, seed, generation, suite = "rotating" }) {
  const policy = { kind: "network", model: constantResidual(parameters) }, rows = [];
  for (const { side, seed: subjectSeed, build, opponent: name } of poseFixtures(seed, generation, suite)) {
    if (Date.now() >= deadline) return null;
    const opponent = { kind: "baseline", name };
    const env = await createEnvironment({ seed: side === "left" ? subjectSeed : subjectSeed ^ 0x123456,
      leftBuild: build, rightBuild: build, maxSeconds: 150,
      left: side === "left" ? policy : opponent, right: side === "right" ? policy : opponent });
    try {
      let state = env.state();
      while (!state.terminated && !state.truncated && Date.now() < deadline) state = env.step();
      if (!state.terminated && !state.truncated) return null;
      const index = side === "left" ? 0 : 1;
      rows.push({ build, opponent: opponent.name, side, seed: subjectSeed, clock: state.clock,
        score: state.winner === side ? 1 : state.winner === null ? 0.5 : 0,
        margin: state.vitality[index] - state.vitality[1 - index], truncated: state.truncated });
    } finally { env.close(); }
  }
  return { rows, score: rows.reduce((s, r) => s + r.score, 0) / rows.length,
    margin: rows.reduce((s, r) => s + r.margin, 0) / rows.length };
}

export async function constantSearch({ deadline, seed = 1, generations = 8, population = 8, suite = "rotating",
  evaluate = poseFitness, onCheckpoint = () => {} }) {
  if (!Number.isInteger(seed) || seed < 0 || !Number.isInteger(generations) || generations < 1 || generations > 100
    || !Number.isInteger(population) || population < 4 || population > 32) throw new Error("invalid constant search configuration");
  poseFixtures(seed, 0, suite);
  const random = mulberry32(seed), zero = POSE_FIELDS.map(() => 0), history = [];
  let champion = [...zero], mean = [...zero], deviation = zero.map(() => 0.4), partial = [];
  const result = () => ({ version: 1, seed, suite, fields: POSE_FIELDS.map((f) => f.name), champion,
    model: constantResidual(champion), history, partial,
    status: "training-only; constant pose residuals retain baseline attack gates; independent evaluation required" });
  for (let generation = 0; generation < generations && Date.now() < deadline; generation++) {
    // The zero incumbent is already the zero control; do not spend a duplicate physical suite.
    const candidates = [champion, ...(champion.some((x) => x !== 0) ? [zero] : [])];
    while (candidates.length < population) candidates.push(mean.map((m, j) =>
      Math.max(-1, Math.min(1, m + deviation[j] * randomNormal(random)))));
    partial = [];
    for (const parameters of candidates) {
      if (Date.now() >= deadline) { onCheckpoint(result()); return result(); }
      const fitness = await evaluate(parameters, { deadline, seed, generation, suite });
      if (fitness === null) { onCheckpoint(result()); return result(); }
      if (!Number.isFinite(fitness.score) || !Number.isFinite(fitness.margin)) throw new Error("invalid constant fitness");
      partial.push({ parameters: [...parameters], ...fitness });
      onCheckpoint(result());
    }
    // Incumbent and exact zero control are remeasured on every generation's identical suite.
    // No incomplete generation or historical lucky score can replace the incumbent.
    const ranked = [...partial].sort((a, b) => b.score - a.score || b.margin - a.margin);
    champion = [...ranked[0].parameters];
    const elite = ranked.slice(0, Math.max(2, Math.floor(population / 4)));
    mean = mean.map((_, j) => elite.reduce((s, r) => s + r.parameters[j], 0) / elite.length);
    deviation = deviation.map((_, j) => Math.max(0.05, Math.sqrt(elite.reduce((s, r) =>
      s + (r.parameters[j] - mean[j]) ** 2, 0) / elite.length)));
    history.push({ generation, evaluated: partial, champion: [...champion] });
    partial = [];
    onCheckpoint(result());
  }
  return result();
}
