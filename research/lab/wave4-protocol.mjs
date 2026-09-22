import { bootstrap } from "../search.mjs";

export const AUTHORIZATION = Object.freeze({ id: "campaign-2026-09-22", maxMs: 8 * 3600000, maxJobMs: 3600000 });
export function remainingAllowance(usedMs, requestedMs) {
  if (!Number.isFinite(usedMs) || usedMs < 0 || !Number.isFinite(requestedMs)
    || requestedMs <= 0 || requestedMs > AUTHORIZATION.maxJobMs) throw new Error("invalid campaign allowance");
  return Math.max(0, Math.min(requestedMs, AUTHORIZATION.maxMs - usedMs));
}
export const TEACHER_OPPONENTS = ["golem-champion", "golem-planner", "golem-brawler"];
export const STUDENT_HOLDOUTS = ["golem-tactician", "golem-miser"];
export const TARGETS = ["needle", "paired"];
export const BASE = { kind: "baseline", name: "golem-duelist" };
export const targetSpec = (name) => ({ kind: "bespoke", name });

/** Each split owns a disjoint seed band. Sides follow the subject's seed. */
export function fixtures(kind, repeats = 1, target = null) {
  const pools = {
    studentSelection: { seed: 410000000, builds: ["two-blades"], foes: TEACHER_OPPONENTS, opponentBuilds: ["two-blades", "default"] },
    studentConfirmation: { seed: 411000000, builds: ["two-blades"], foes: STUDENT_HOLDOUTS, opponentBuilds: ["two-blades", "default", "mace", "fists"] },
    counterTrain: { seed: 412000000, builds: ["two-blades", "fists"], foes: [target], opponentBuilds: ["two-blades"] },
    counterSelection: { seed: 413000000, builds: ["two-blades", "fists"], foes: [target], opponentBuilds: ["two-blades"] },
    counterConfirmation: { seed: 414000000, builds: ["two-blades", "fists"], foes: [target], opponentBuilds: ["two-blades"] },
    ppoSelection: { seed: 415000000, builds: ["default", "two-blades", "mace", "fists"], foes: ["golem-planner", "golem-brawler"], opponentBuilds: null },
    ppoConfirmation: { seed: 416000000, builds: ["default", "two-blades", "mace", "fists"], foes: ["golem-champion", "golem-tactician", "golem-miser"], opponentBuilds: null },
    robustness: { seed: 417000000, builds: ["two-blades", "fists"], foes: ["golem-champion", "golem-tactician", "golem-miser", "golem-brawler"], opponentBuilds: ["default", "two-blades", "mace", "fists"] },
  };
  const pool = pools[kind];
  if (!pool || !Number.isInteger(repeats) || repeats < 1 || repeats > 32 || pool.foes.some((x) => !x)) throw new Error("invalid wave4 fixtures");
  const rows = [];
  for (let r = 0; r < repeats; r++) for (const build of pool.builds)
    for (const opponentBuild of pool.opponentBuilds ?? [build]) for (const opponent of pool.foes) {
      const id = rows.length;
      rows.push({ split: kind, build, opponentBuild, opponent,
        seed: pool.seed + (target === "paired" ? 100000 : 0) + id,
        opponentSpec: TARGETS.includes(opponent) ? targetSpec(opponent) : { kind: "baseline", name: opponent } });
    }
  return rows;
}

export function compare(candidate, control) {
  const key = (r) => `${r.split}/${r.build}/${r.opponentBuild}/${r.opponent}/${r.seed}`;
  const paired = (rows) => {
    const map = new Map();
    for (const row of rows) { const list = map.get(key(row)) ?? []; list.push(row); map.set(key(row), list); }
    for (const list of map.values()) if (list.length !== 2 || new Set(list.map((r) => r.side)).size !== 2
      || list.some((r) => !r.terminated || r.truncated)) throw new Error("confirmation requires complete terminal side pairs");
    return new Map([...map].map(([k, list]) => [k, (list[0].score + list[1].score) / 2]));
  };
  const a = paired(candidate), b = paired(control);
  if (!a.size || a.size !== b.size || [...a.keys()].some((k) => !b.has(k))) throw new Error("unmatched wave4 controls");
  const interval = bootstrap([...a].map(([k, v]) => v - b.get(k)));
  const score = (rows) => rows.reduce((s, r) => s + r.score, 0) / rows.length;
  return { candidateScore: score(candidate), controlScore: score(control), boutsPerPolicy: candidate.length,
    interval, eligible: candidate.length >= 128 && interval.mean >= 0.1 && interval.low > 0 };
}
