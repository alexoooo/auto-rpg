import { mulberry32 } from "../../src/rng.ts";

const pairKey = (r) => JSON.stringify([r.split, r.build, r.opponentBuild ?? r.build, r.opponent, r.seed]);
function pairs(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (![0, 0.5, 1].includes(row.score) || !["left", "right"].includes(row.side)) throw new Error("invalid evaluation row");
    const key = pairKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const group of groups.values()) if (group.length !== 2 || new Set(group.map((r) => r.side)).size !== 2) {
    throw new Error("evidence requires complete distinct side-swapped pairs");
  }
  return groups;
}
function interval(values, seed = 1909, samples = 4000) {
  if (!values.length) throw new Error("no evidence");
  const random = mulberry32(seed), estimates = [];
  for (let i = 0; i < samples; i++) {
    let sum = 0;
    for (let j = 0; j < values.length; j++) sum += values[Math.floor(random() * values.length)];
    estimates.push(sum / values.length);
  }
  estimates.sort((a, b) => a - b);
  return { mean: values.reduce((a, b) => a + b, 0) / values.length,
    lower: estimates[Math.floor(samples * 0.025)], upper: estimates[Math.floor(samples * 0.975)],
    method: "95% percentile bootstrap over matched side-swapped pairs", pairs: values.length };
}
export function summarizeEvidence(rows) {
  const groups = pairs(rows);
  return { ...interval([...groups.values()].map((rs) => (rs[0].score + rs[1].score) / 2)),
    bouts: rows.length, truncations: rows.filter((r) => r.truncated).length,
    warning: "Selection evidence is not confirmation; bootstrap does not correct for candidate selection or untested matchups." };
}
export function compareEvidence(candidate, control) {
  const a = pairs(candidate), b = pairs(control);
  if (a.size !== b.size || [...a.keys()].some((k) => !b.has(k))) throw new Error("comparison requires identical held-out matchups and seeds");
  const differences = [...a].map(([key, rows]) => (rows.reduce((s, r) => s + r.score, 0)
    - b.get(key).reduce((s, r) => s + r.score, 0)) / 2);
  return { ...interval(differences), candidate: summarizeEvidence(candidate), control: summarizeEvidence(control) };
}
