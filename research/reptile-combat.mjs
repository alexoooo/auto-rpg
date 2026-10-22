import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { pathToFileURL } from "node:url";
import { buildBout } from "../src/evaluation/bout.ts";
import { BOUT_ENGINE } from "./bout.mjs";
import { sourced } from "../src/core/spec/quantity.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { mouthOf } from "../src/core/reptile/bite.ts";

export const DEVELOPMENT_GAPS = Object.freeze([1.5, 2, 3, 4]);
export const CONFIRMATION_GAPS = Object.freeze([1.75, 2.5, 3.5, 4.5]);
export const HUMANOIDS = Object.freeze(["workshop-rogue", "workshop-fighter", "crypt-skeleton"]);

/** Node Arena Duel, rapier-coordinate, 120 Hz, empty hands, zero balance and unlimited recovery. */
export async function combatTrial({ opponent = "reptile", gap = 2, side = "left", rate = rulebook("arena").pointLoad.rate.value } = {}) {
  const enemy = side === "left" ? "right" : "left", sides = ["left", "right"];
  const recipe = { left: side === "left" ? "reptile" : opponent, right: side === "right" ? "reptile" : opponent,
    gap, capSeconds: 30, recoverySeconds: null, loadouts: { left: { left: "empty", right: "empty" }, right: { left: "empty", right: "empty" } }, balance: { left: 0, right: 0 },
    rules: { pointLoad: { threshold: sourced(1, "N", "owner-point-load", "shared threshold"),
      rate: sourced(rate, "HP/(N s)", "owner-point-load", "shared calibration") } } };
  const bout = await buildBout(recipe, { engine: BOUT_ENGINE }), { world, duel } = bout;
  const damage = [0, 0], engagements = [0, 0], engaged = [false, false], falls = [null, null];
  const jaws = sides.map(s => duel.duelists[s].model === "reptile" ? mouthOf(duel.duelists[s].built).lower : null);
  const foreign = sides.map(s => new Set([...duel.duelists[s === "left" ? "right" : "left"].built.segments.values()].map(p => p.body)));
  let seen = 0;
  try {
    while (!duel.verdict) {
      world.step();
      sides.forEach((s, i) => {
        if (duel.duelists[s].body.down) falls[i] ??= world.time;
        if (jaws[i] && !world.physics.contactsOf(jaws[i].body).some(c => foreign[i].has(c.other))) engaged[i] = false;
      });
      for (const blow of duel.blows.slice(seen)) {
        if (blow.kind !== "load") continue;
        sides.forEach((s, i) => {
          const source = blow.sides.find(part => part.fighter === s), victim = blow.sides.find(part => part.fighter !== s);
          if (!jaws[i] || source?.segment !== jaws[i].spec.name || victim?.mechanism !== "point") return;
          const taken = (victim.wound?.taken.reduce((sum, part) => sum + part.hp, 0) ?? 0) + (victim.wound?.lost ?? 0);
          damage[i] += taken;
          if (taken > 0 && !engaged[i]) { engagements[i]++; engaged[i] = true; }
        });
      }
      seen = duel.blows.length;
    }
    return { harness: "Node Arena Duel", engine: world.physics.engine, hz: world.hz, recipe, opponent, gap, side, enemy, rate,
      seconds: world.time, damage, engagements, falls, bars: sides.map(s => duel.duelists[s].pool.bar()), verdict: duel.verdict,
      assist: sides.map(s => ({ ...duel.duelists[s].body.assist.meter })) };
  } finally { bout.dispose(); }
}

/** One sequential bout loop per worker; failures close every worker before rejecting the run. */
export async function combatTrials(jobs, lanes = 4) {
  const rows = new Array(jobs.length), workers = Array.from({ length: Math.min(lanes, jobs.length) }, () => new Worker(new URL(import.meta.url)));
  let next = 0;
  try {
    await Promise.all(workers.map(worker => new Promise((resolve, reject) => {
      worker.on("error", reject);
      const feed = () => {
        if (next >= jobs.length) { resolve(); return; }
        const id = next++;
        worker.once("message", ({ result, error }) => {
          if (error) { reject(new Error(error)); return; }
          rows[id] = result; feed();
        });
        worker.postMessage(jobs[id]);
      };
      feed();
    })));
    return rows;
  } finally { await Promise.all(workers.map(worker => worker.terminate())); }
}

if (!isMainThread) parentPort.on("message", async job => {
  try { parentPort.postMessage({ result: await combatTrial(job) }); }
  catch (error) { parentPort.postMessage({ error: error.stack }); }
});
else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const gaps = process.argv.includes("--confirm") ? CONFIRMATION_GAPS : DEVELOPMENT_GAPS;
  const rate = Number(process.argv.find(arg => arg.startsWith("--rate="))?.slice(7) ?? rulebook("arena").pointLoad.rate.value);
  const jobs = gaps.flatMap(gap => [{ gap, rate }, ...HUMANOIDS.flatMap(opponent => ["left", "right"].map(side => ({ gap, rate, opponent, side })))]);
  for (const row of await combatTrials(jobs)) console.log(JSON.stringify(row));
}
