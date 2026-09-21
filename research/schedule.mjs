import { createHash } from "node:crypto";

export const PROTOCOL = Object.freeze({ version: 1, maxSeconds: 150, settleSeconds: 0,
  locomotionMode: "supported", drawFloor: null, targetRounds: 4, rating: "glicko2-tau0.5" });
export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export const digest = (value) => createHash("sha256").update(stable(value)).digest("hex");
export const seed = (...parts) => parseInt(digest(parts).slice(0, 8), 16);

/** Four cross-build games separate arena side from policy-to-body assignment. */
export function schedule(policies, builds, rounds = 4, runSeed = 20260920) {
  if (builds.length % 2 !== 0 || new Set(policies).size !== policies.length) {
    throw new Error("league needs an even build roster and unique policies");
  }
  const jobs = [];
  for (let round = 0; round < rounds; round++) {
    for (let a = 0; a < policies.length; a++) for (let b = a + 1; b < policies.length; b++) {
      const pair = [policies[a], policies[b]];
      const cells = builds.map((build) => [build.name, build.name]);
      for (let i = 0; i < builds.length; i += 2) {
        cells.push([builds[i].name, builds[i + 1].name], [builds[i + 1].name, builds[i].name]);
      }
      for (const [cell, body] of cells.entries()) {
        const seeds = pair.map((policy) => seed(runSeed, round, pair, cell, policy));
        for (let side = 0; side < 2; side++) {
          const id = `r${round}/${a}-${b}/${cell}/${side}`;
          jobs.push({ id, round, block: `r${round}/${a}-${b}/${cell}`, left: pair[side], right: pair[1 - side],
            leftBuild: body[side], rightBuild: body[1 - side], seeds: [seeds[side], seeds[1 - side]] });
        }
      }
    }
  }
  return jobs;
}

export function completeRounds(jobs, results) {
  const found = new Map();
  const expected = new Map(jobs.map((job) => [job.id, job]));
  for (const row of results) {
    if (!expected.has(row.id) || found.has(row.id)) throw new Error(`unexpected or duplicate bout ${row.id}`);
    const job = expected.get(row.id);
    for (const key of ["left", "right", "leftBuild", "rightBuild", "round", "block", "seeds"]) {
      if (stable(row[key]) !== stable(job[key])) throw new Error(`bout ${row.id} disagrees on ${key}`);
    }
    if (row.status === "ok" && !["left", "right", null].includes(row.winner)) throw new Error("invalid winner");
    found.set(row.id, row);
  }
  const rounds = [];
  for (const round of [...new Set(jobs.map((job) => job.round))].sort((a, b) => a - b)) {
    const batch = jobs.filter((job) => job.round === round).map((job) => found.get(job.id));
    if (batch.some((row) => !row || row.status !== "ok")) break;
    rounds.push(batch);
  }
  return rounds;
}
