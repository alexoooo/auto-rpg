/**
 * A fingerprint of what the game does: fights in the arena and the crypt, the lab's run and
 * routine, the generated levels, what a walk through one reveals, and the shader code the crypt's
 * look writes from a level. A structural change, one that moves code without changing what it
 * computes, leaves every line as it was; read the output before the change and compare after, on
 * the same machine. It is not a test: a change that means to change how a fight plays changes its
 * lines, and says so.
 *
 *   node scripts/fingerprint.mjs [--workers 12]
 *
 * One line a case, each ending in the first 16 hex digits of a SHA-256. A pose hash is `traceOf`'s
 * digest (`tests/harness/trace.mjs`): every segment's position and rotation after every step of
 * the case, so a difference the bodies recover from still shows. Node, core world
 * (`src/core/world.ts`), Rapier, 120 Hz; each case in a world of its own, on a worker thread. It
 * reads no clock and no `Math.random`.
 */
import { createHash } from "node:crypto";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { Scene } from "@babylonjs/core/scene.js";
import { SIDES } from "../src/arena/duel.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { generateCryptDungeon } from "../src/dungeon/crypt-dungeon.ts";
import { CryptWeathering } from "../src/dungeon/crypt-weathering.ts";
import { generateLevel } from "../src/dungeon/level.ts";
import { clearSegment, distance, findPath, reveal, walkable } from "../src/dungeon/map.ts";
import { DungeonRun } from "../src/dungeon/run.ts";
import { revealScenery } from "../src/dungeon/scenery-visibility.ts";
import { startRoutine } from "../src/lab/routine.ts";
import { startRun } from "../src/lab/run-mode.ts";
import { TRACKS, trackOf } from "../src/lab/track.ts";
import { buildBout } from "../research/bout.mjs";
import { coreStand, freshEngine } from "../tests/harness/core-stand.mjs";
import { traceOf } from "../tests/harness/trace.mjs";

// An engine announces itself with the time of day, which no two runs share.
Logger.LogLevels = Logger.NoneLogLevel;

const digestOf = (hash) => hash.digest("hex").slice(0, 16);
/** `value` as JSON, a typed array written as a plain one. */
const written = (value) => JSON.stringify(value, (_, v) => ArrayBuffer.isView(v) ? Array.from(v) : v);

/** A bout to its verdict or its cap, then 2 s more: a body that fell goes on moving, and so does the stance under it. */
async function arena(left, right) {
  const { world, duel, dispose } = await buildBout({ left, right, capSeconds: 30 });
  try {
    const trace = traceOf(SIDES.map((side) => duel.duelists[side].built));
    while (!duel.verdict) { world.step(); trace.take(); }
    const { winner, ending } = duel.verdict;
    const bars = SIDES.map((side) => duel.duelists[side].pool.bar());
    const told = `${winner ?? "draw"} by ${ending} at step ${world.steps}, bars ${bars.join(" ")}, blows ${duel.blows.length}, pose ${trace.digest()}`;
    for (let i = 0; i < 2 * world.hz; i++) { world.step(); trace.take(); }
    return `${told}, 2 s on ${trace.digest()}`;
  } finally { dispose(); }
}

/** The level of `seed` with its start moved to open floor `gap` m from the first spawn, in its sight. */
function faceToFace(seed, gap) {
  const map = generateLevel(seed).map, spawn = map.spawns[0];
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8, at = { x: spawn.x + Math.sin(a) * gap, z: spawn.z + Math.cos(a) * gap };
    if (walkable(map, at, 0.7, true) && clearSegment(map, spawn, at, 0.35, true)) { map.start = at; return map; }
  }
  throw new Error(`seed ${seed}: no open floor ${gap} m from the first spawn`);
}

/** 12 s of the crypt from 4 m off its first enemy, nobody ordered: every body built so far, each step. */
async function cryptFight(seed) {
  const scene = new Scene(new NullEngine());
  const run = new DungeonRun(scene, { seed, engine: await freshEngine(), visuals: false, layout: faceToFace(seed, 4) });
  try {
    const trace = traceOf({ *[Symbol.iterator]() { for (const actor of run.actors) if (actor.fighter) yield actor.fighter.built; } });
    for (let i = 0; i < 12 * run.world.hz && run.status === "playing"; i++) { run.step(); trace.take(); }
    const built = run.actors.filter((actor) => actor.fighter).length;
    return `${run.status} at step ${run.world.steps}, bodies ${built}, blows ${run.blows.length}, pose ${trace.digest()}`;
  } finally { run.dispose(); scene.dispose(); }
}

/** `model` round the lab's circle for 10 s. */
async function labRun(model) {
  const stand = await coreStand(humanSpec(model), { ground: true });
  const run = startRun(stand.built, stand.world, trackOf(TRACKS.circle.pieces));
  try {
    const trace = traceOf([stand.built]);
    for (let i = 0; i < stand.seconds(10); i++) { stand.step(); trace.take(); }
    return `pose ${trace.digest()}`;
  } finally { run.dispose(); stand.dispose(); }
}

/** `model` through the lab's routine for 20 s. */
async function labRoutine(model) {
  const stand = await coreStand(humanSpec(model), { ground: true });
  const routine = startRoutine(stand.built, stand.world);
  try {
    const trace = traceOf([stand.built]);
    for (let i = 0; i < stand.seconds(20); i++) { stand.step(); trace.take(); }
    return `strikes ${routine.strikes.length}, pose ${trace.digest()}`;
  } finally { routine.dispose(); stand.dispose(); }
}

/** Every crypt the reference generator makes of `seeds`, whole. */
function crypts(seeds) {
  const hash = createHash("sha256");
  for (const seed of seeds) hash.update(written(generateCryptDungeon(seed)));
  return digestOf(hash);
}

/** Every level the game's generator makes of `seeds`, whole. */
function levels(seeds) {
  const hash = createHash("sha256");
  for (const seed of seeds) hash.update(written(generateLevel(seed)));
  return digestOf(hash);
}

/** The fragment code the paving's weathering writes for each crypt of `seeds`: a stain for every room. */
function weathering(seeds) {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const hash = createHash("sha256");
    for (const seed of seeds) {
      const plugin = new CryptWeathering(new PBRMaterial(`paving.${seed}`, scene), generateCryptDungeon(seed));
      hash.update(written(plugin.getCustomCode("fragment")));
    }
    return digestOf(hash);
  } finally { scene.dispose(); engine.dispose(); }
}

/** How far apart the sight case reads along its walk, m. */
const SIGHT_STRIDE = 0.5;

/**
 * What the scenery remembers through a walk from the start of crypt `seed` to its exit, read every
 * `SIGHT_STRIDE`: the path's own points are too few to see past a pillar or into a corner.
 */
function sight(seed) {
  const map = generateCryptDungeon(seed).map, path = findPath(map, map.start, map.exit, 0.35);
  if (!path.length) throw new Error(`seed ${seed}: no path from the start to the exit`);
  const hash = createHash("sha256"), explored = new Set(), memory = new Set();
  let from = map.start, read = 0;
  for (const to of path) {
    const strides = Math.max(1, Math.ceil(distance(from, to) / SIGHT_STRIDE));
    for (let i = 1; i <= strides; i++) {
      const at = { x: from.x + (to.x - from.x) * i / strides, z: from.z + (to.z - from.z) * i / strides };
      const visible = reveal(map, at, explored);
      revealScenery(map, at, visible, explored, memory);
      hash.update(written([...memory].sort((a, b) => a - b)));
      read++;
    }
    from = to;
  }
  return `read ${read} times, remembered ${memory.size}, ${digestOf(hash)}`;
}

const range = (n) => Array.from({ length: n }, (_, i) => i);
/** The cases in the order they print, the long ones first so that the lanes stay full. */
const CASES = [
  ...[["workshop-fighter", "workshop-rogue"], ["crypt-skeleton", "workshop-fighter"], ["workshop-rogue", "crypt-skeleton"]]
    .map(([left, right]) => ({ name: `arena ${left} v ${right}`, run: () => arena(left, right) })),
  ...[1, 2].map((seed) => ({ name: `crypt fight, seed ${seed}`, run: () => cryptFight(seed) })),
  ...["workshop-fighter", "workshop-rogue"].flatMap((model) => [
    { name: `lab run, circle, ${model}`, run: () => labRun(model) },
    { name: `lab routine, ${model}`, run: () => labRoutine(model) },
  ]),
  { name: "crypts, seeds 0-99 and 2124530852", run: () => crypts([...range(100), 2124530852]) },
  { name: "levels, seeds 0-19", run: () => levels(range(20)) },
  ...range(8).map((i) => i + 1).map((seed) => ({ name: `sight, crypt ${seed}`, run: () => sight(seed) })),
  { name: "weathering, crypts 1-3", run: () => weathering([1, 2, 3]) },
];

if (isMainThread) {
  const { values } = parseArgs({ options: { workers: { type: "string" } } });
  const lanes = Math.min(CASES.length, Number(values.workers ?? Math.max(1, availableParallelism() - 2)));
  const lines = new Array(CASES.length);
  let next = 0;
  await Promise.all(Array.from({ length: lanes }, () => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url));
    const feed = () => {
      if (next >= CASES.length) { worker.terminate(); resolve(); return; }
      const id = next++;
      worker.once("message", ({ line, error }) => {
        if (error) { reject(new Error(`${CASES[id].name}: ${error}`)); return; }
        lines[id] = line;
        feed();
      });
      worker.postMessage(id);
    };
    feed();
  })));
  for (const [id, line] of lines.entries()) console.log(`${CASES[id].name}: ${line}`);
} else {
  // One case at a time: each is answered only when it is done.
  parentPort.on("message", async (id) => {
    try { parentPort.postMessage({ line: await CASES[id].run() }); }
    catch (error) { parentPort.postMessage({ error: String(error?.stack ?? error) }); }
  });
}
