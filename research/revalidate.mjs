import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { fingerprint, ROOT } from "./fingerprint.mjs";
import { atomicJson, prepareRun } from "./runner.mjs";
import { schedule } from "./schedule.mjs";

// Transfer frozen candidates, never bout results, after an integration/source change.
// The original training evidence remains attributed to its original fingerprint.
const [sourceArg, targetArg] = process.argv.slice(2);
if (!sourceArg || !targetArg) throw new Error("usage: node research/revalidate.mjs SOURCE NEW_TARGET");
const source = resolve(sourceArg), target = resolve(targetArg);
if (source === target || existsSync(target)) throw new Error("target must be a new directory");
if (existsSync(join(source, "run.lock"))) throw new Error("source is locked; finish its computation first");
const read = (name) => JSON.parse(readFileSync(join(source, name), "utf8"));
const confirmation = read("confirmation.json");
if (confirmation.status !== "complete") throw new Error("source confirmation is incomplete");
const { scheduleHash, ...original } = read("manifest.json");
if (confirmation.fingerprint !== original.fingerprint) throw new Error("source fingerprint mismatch");
const budget = read("budget.json");
if (budget.carriedTo) throw new Error("source budget already transferred");
if (!Number.isFinite(budget.usedMs) || budget.usedMs < 0) throw new Error("invalid source compute budget");
const manifest = { ...original, fingerprint: fingerprint().hash };
const origin = { fingerprint: original.fingerprint, sourceDirectory: relative(ROOT, source).replaceAll("\\", "/"),
  note: "Frozen finalists transferred without new selection. No bout results reused. Training/search history retains the source fingerprint; confirmation and ratings are recomputed." };
mkdirSync(target, { recursive: true });
prepareRun(target, manifest, schedule(manifest.policies, manifest.builds, manifest.rounds, manifest.seed));
atomicJson(join(target, "finalists.json"), { fingerprint: manifest.fingerprint, candidates: read("finalists.json").candidates });
atomicJson(join(target, "search.json"), read("search.json"));
atomicJson(join(target, "origin.json"), origin);
atomicJson(join(target, "budget.json"), { usedMs: budget.usedMs });
atomicJson(join(source, "budget.json"), { ...budget, carriedTo: target });
console.log(JSON.stringify({ directory: target, fingerprint: manifest.fingerprint, inheritedUsedMs: budget.usedMs }));
