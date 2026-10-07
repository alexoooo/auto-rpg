/**
 * A fingerprint of what the game does: fights in the arena and the crypt, the lab's run and
 * routine, the generated levels, what a walk through one reveals, and the shader code the crypt's
 * look writes from a level and a camera's bearing. A structural change, one that moves code
 * without changing what it computes, leaves every line as it was; read the output before the
 * change and compare after, on the same machine. It is not a test: a change that means to change
 * how a fight plays changes its lines, and says so.
 *
 *   node scripts/fingerprint.mjs [--workers 12] [--character] [--only <regex>] [--json <file>] [--compare <file>]
 *
 * `--only` runs the cases whose names match. `--json` writes each case's record as well, and
 * `--compare` reads such a file and names every case whose record differs: it fails on a pose,
 * and names a state or physics difference without failing, since a change may reshape what a
 * bout keeps and still play it to the bit. The engine is `CORE_ENGINE`'s (`tests/harness/core-stand.mjs`).
 *
 * `--character` prints instead what the character workshop's checks measure on its two models: the
 * lines a change to `scripts/character-lab/validation.mjs` or `contact.mjs` must leave as they were.
 *
 * One line a case, each ending in the first 16 hex digits of a SHA-256. A pose hash is `traceOf`'s
 * digest (`tests/harness/trace.mjs`): every segment's position and rotation after every step of
 * the case, so a difference the bodies recover from still shows. Node, core world
 * (`src/core/world.ts`), Rapier, 120 Hz; each case in a world of its own, on a worker thread. It
 * reads no clock and no `Math.random`.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { parseArgs } from "node:util";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/loaders/glTF/index.js";
import { SIDES } from "../src/arena/duel.ts";
import { CHARACTERS, WEAPONS, clipFor } from "../src/character-lab/catalog.ts";
import { controlsFor, readMinds } from "../src/arena/matchup.ts";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { standIntent } from "../src/core/mind/intent.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { HUMANOID_MODELS, modelSpec } from "../src/core/models.ts";
import { createQuadrupedMind } from "../src/core/reptile/mind.ts";
import { generateCryptDungeon } from "../src/dungeon/crypt-dungeon.ts";
import { CryptWeathering } from "../src/dungeon/crypt-weathering.ts";
import { generateLevel } from "../src/dungeon/level.ts";
import { clearSegment, distance, findPath, reveal, walkable } from "../src/dungeon/map.ts";
import { cutawayCondition } from "../src/dungeon/reference-look.ts";
import { DungeonRun } from "../src/dungeon/run.ts";
import { revealScenery } from "../src/dungeon/scenery-visibility.ts";
import { labActor } from "../src/lab/actor.ts";
import { startRoutine } from "../src/lab/routine.ts";
import { startRun } from "../src/lab/run-mode.ts";
import { TRACKS, trackOf } from "../src/lab/track.ts";
import { buildBout } from "../research/bout.mjs";
import { surface } from "./character-lab/contact.mjs";
import {
  contactPatch, forearmExpansion, gripDistances, gripGap, skinPart, skinRegions, surfaceIndex, wristAreaRatio,
} from "./character-lab/validation.mjs";
import { CORE_ENGINE, coreStand, freshEngine } from "../tests/harness/core-stand.mjs";
import { traceOf } from "../tests/harness/trace.mjs";

// An engine announces itself with the time of day, which no two runs share.
Logger.LogLevels = Logger.NoneLogLevel;

const digestOf = (hash) => hash.digest("hex").slice(0, 16);
/** `value` as JSON, a typed array written as a plain one and a vector as its three numbers. */
const written = (value) => JSON.stringify(value,
  (_, v) => ArrayBuffer.isView(v) ? Array.from(v) : v instanceof Vector3 ? v.asArray() : v);

/**
 * A digest of `value`, a saved state (`saveState`): every number to the bit, maps and records in
 * their own order, and an object met again written as the place it was first met.
 */
function stateDigest(value) {
  const hash = createHash("sha256"), met = new Map();
  const put = (v) => {
    if (v === null || typeof v !== "object") {
      hash.update(typeof v === "number" ? (Object.is(v, -0) ? "n-0;" : `n${v};`) : `${typeof v}${String(v)};`);
      return;
    }
    if (met.has(v)) { hash.update(`@${met.get(v)};`); return; }
    met.set(v, met.size);
    if (ArrayBuffer.isView(v)) { hash.update(`${v.constructor.name}[`); hash.update(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); hash.update("]"); }
    else if (Array.isArray(v)) { hash.update("["); for (const item of v) put(item); hash.update("]"); }
    else if (v instanceof Map) { hash.update("M{"); for (const [key, item] of v) { put(key); put(item); } hash.update("}"); }
    else if (v instanceof Set) { hash.update("S{"); for (const item of v) put(item); hash.update("}"); }
    else { hash.update("{"); for (const [key, item] of Object.entries(v)) { hash.update(`${key}:`); put(item); } hash.update("}"); }
  };
  put(value);
  return digestOf(hash);
}

/**
 * A bout of `recipe` capped at 30 s, to its verdict, then 2 s more: a body that fell goes on
 * moving, and so does the stance under it. Its record has the pose, the bout's state and the
 * physics' bytes at the verdict and 2 s on, the verdict and the blows.
 */
async function arena(recipe) {
  const { world, duel, dispose } = await buildBout({ ...recipe, capSeconds: 30 });
  try {
    const trace = traceOf(SIDES.map((side) => duel.duelists[side].built));
    const taken = () => {
      const { physics, state } = duel.save();
      return { pose: trace.digest(), state: stateDigest(state), physics: digestOf(createHash("sha256").update(physics)) };
    };
    while (!duel.verdict) { world.step(); trace.take(); }
    const { winner, ending } = duel.verdict;
    const bars = SIDES.map((side) => duel.duelists[side].pool.bar());
    const verdict = `${winner ?? "draw"} by ${ending} at step ${world.steps}, bars ${bars.join(" ")}`, blows = duel.blows.length;
    const then = taken();
    for (let i = 0; i < 2 * world.hz; i++) { world.step(); trace.take(); }
    const later = taken();
    return {
      line: `${verdict}, blows ${blows}, pose ${then.pose}, 2 s on ${later.pose}`,
      record: { pose: `${then.pose} ${later.pose}`, state: `${then.state} ${later.state}`, physics: `${then.physics} ${later.physics}`, verdict, blows },
    };
  } finally { dispose(); }
}

/**
 * `model` left standing for 11 s from as it is built: a humanoid under the command layers in
 * guard, the reptile under its own mind with no orders.
 */
async function stand(model) {
  const stand = await coreStand(modelSpec(model));
  const body = model === "reptile" ? createQuadrupedMind(stand.built, stand.world).body : createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS });
  try {
    if (model !== "reptile") driveBy(body, { name: "stand", decide: () => standIntent(0) });
    const trace = traceOf([stand.built]);
    for (let i = 0; i < stand.seconds(11); i++) { stand.step(); trace.take(); }
    const pose = trace.digest();
    return { line: `pose ${pose}`, record: { pose } };
  } finally { body.dispose(); stand.dispose(); }
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
    const built = run.actors.filter((actor) => actor.fighter).length, pose = trace.digest();
    return { line: `${run.status} at step ${run.world.steps}, bodies ${built}, blows ${run.blows.length}, pose ${pose}`, record: { pose, blows: run.blows.length } };
  } finally { run.dispose(); scene.dispose(); }
}

/** `model` round the lab's circle for 10 s. */
async function labRun(model) {
  const stand = await coreStand(humanSpec(model), { ground: true });
  const run = startRun(labActor(stand.built, stand.world), trackOf(TRACKS.circle.pieces));
  try {
    const trace = traceOf([stand.built]);
    for (let i = 0; i < stand.seconds(10); i++) { stand.step(); trace.take(); }
    return `pose ${trace.digest()}`;
  } finally { run.dispose(); stand.dispose(); }
}

/** `model` through the lab's routine to the last of four targets of seed 1, or 60 s: what each target read, and the pose. */
async function labRoutine(model) {
  const stand = await coreStand(humanSpec(model), { ground: true });
  const routine = startRoutine(labActor(stand.built, stand.world), { targets: 4, seed: 1 });
  try {
    const trace = traceOf([stand.built]);
    for (let i = 0; i < stand.seconds(60) && routine.readings.length < 4; i++) { stand.step(); trace.take(); }
    const read = routine.readings.map(({ target, took, nearest }) =>
      `${target.stratum} ${took ? `${took.damage.toFixed(4)} HP` : nearest === null ? "unread" : `missed by ${(100 * nearest).toFixed(2)} cm`}`);
    const pose = trace.digest();
    return { line: `targets ${read.join(", ") || "none"}; pose ${pose}`, record: { pose, verdict: read.join(", ") } };
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

/** The camera bearings the cut-away case reads at, degrees: one in each quarter, the second 8 degrees past an
 * axis, where a wall just counts as facing away. */
const CUTAWAY_BEARINGS = [35, 98, 200, 305];

/** The condition that cuts the near walls away, for each crypt of `seeds` and for the reference chamber. */
function cutaway(seeds) {
  const hash = createHash("sha256");
  for (const plan of [undefined, ...seeds.map((seed) => generateCryptDungeon(seed))]) {
    for (const bearing of CUTAWAY_BEARINGS) hash.update(cutawayCondition(bearing * Math.PI / 180, plan));
  }
  return digestOf(hash);
}

/** The frames of each clip the character case reads. */
const CHARACTER_FRAMES = [0, 10, 20];
/** The hand that holds each grip. */
const GRIP_HAND = { sword: "r", shield: "l", bow: "l" };
/** The pads of a hand that lie on a grip. */
const PADS = ["palm", "index", "middle", "ring", "pinky", "thumb"];
/** How many of the head's triangles the character case sends a segment through. */
const HEAD_PROBES = 64;
/** The joints the character case draws its long segments between, each read where it is and again `CLEAR` to the
 * side, where it meets nothing. */
const SPANS = [["hand_l", "hand_r"], ["foot_l", "head"], ["foot_r", "upperarm_l"], ["hand_l", "foot_l"]];
const CLEAR = new Vector3(3, 0, 0);

/**
 * What the workshop's checks measure on the model `id` (`scripts/character-lab/validation.mjs`, `contact.mjs`):
 * the regions of its skin at rest, and, at `CHARACTER_FRAMES` of every clip of the catalogue, each wrist's area and
 * each forearm's girth against rest, how each pad of the holding hand lies on each grip the clip carries, and what
 * the surface index answers for a short segment through triangles of the head and for long ones across the body
 * and beside it.
 */
async function character(id) {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const bytes = await readFile(new URL(`../public/assets/character-lab/${CHARACTERS[id].asset}`, import.meta.url));
    const asset = await LoadAssetContainerAsync(bytes, scene, { pluginExtension: ".glb" });
    asset.addAllToScene();
    const mesh = (name) => asset.meshes.find((m) => m.name === name);
    const point = (name) => asset.transformNodes.find((n) => n.name === name).getAbsolutePosition().clone();
    const skin = mesh("base__skin"), head = skinPart(skin, (bone) => bone === "head" || bone === "neck_01");
    const regions = { l: skinRegions(skin, "l"), r: skinRegions(skin, "r") };
    const hash = createHash("sha256");
    hash.update(written(regions));
    let samples = 0, probes = 0, crossings = 0;
    for (const pose of ["inspection", "loop"]) for (const weapon of Object.keys(WEAPONS)) {
      for (const group of asset.animationGroups) group.stop();
      const clip = asset.animationGroups.find((group) => group.name === clipFor(pose, { weapon }));
      clip.start(false);
      clip.pause();
      for (const frame of CHARACTER_FRAMES) {
        clip.goToFrame(frame);
        scene.incrementRenderId();
        for (const node of asset.transformNodes) node.computeWorldMatrix(true);
        for (const skeleton of asset.skeletons) skeleton.prepare(true);
        const points = surface(skin), cache = new Map([[skin, points]]);
        for (const side of ["l", "r"]) {
          const elbow = point(`lowerarm_${side}`), wrist = point(`hand_${side}`);
          hash.update(written([
            wristAreaRatio(regions[side], points, wrist.subtract(elbow).normalize()),
            forearmExpansion(regions[side], points, elbow, wrist),
          ]));
        }
        for (const held of WEAPONS[weapon].groups) {
          const grip = surface(mesh(`${held}__grip`));
          for (const pad of PADS) {
            const patch = regions[GRIP_HAND[held]][pad].map((i) => points[i]), distances = gripDistances(patch, grip);
            hash.update(written([distances, contactPatch(distances), gripGap(patch, grip)]));
          }
        }
        const skull = surfaceIndex([head], cache), headPoints = surface(head, false), ids = head.getIndices();
        const stride = Math.max(1, Math.floor(ids.length / 3 / HEAD_PROBES));
        for (let triangle = 0; triangle < ids.length / 3; triangle += stride) {
          const [a, b, c] = [0, 1, 2].map((corner) => headPoints[ids[triangle * 3 + corner]]);
          const centre = a.add(b).add(c).scale(1 / 3);
          const normal = Vector3.Cross(b.subtract(a), c.subtract(a)).normalize().scale(0.01);
          const crossed = skull.intersects(centre.subtract(normal), centre.add(normal));
          probes++;
          if (crossed) crossings++;
          hash.update(written([crossed, skull.lastTriangle]));
        }
        const body = surfaceIndex([mesh("base__jacket"), mesh("base__trousers"), head], cache);
        for (const [from, to] of SPANS) for (const shift of [Vector3.Zero(), CLEAR]) {
          const crossed = body.intersects(point(from).add(shift), point(to).add(shift));
          probes++;
          if (crossed) crossings++;
          hash.update(written([crossed, body.lastTriangle]));
        }
        samples++;
      }
    }
    return `read ${samples} poses, ${crossings} of ${probes} segments cross, ${digestOf(hash)}`;
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
/** An arena bout of `left` and `right` under the controllers a link names, holding `held`. */
const controlled = (left, right, controls, held) => ({
  name: `arena ${left} v ${right}, ${controls}, ${held.left === held.right ? held.left : `${held.left} v ${held.right}`}`,
  run: () => arena({ left, right, held, minds: readMinds(`?matchup=${left},${right}&control=${controls}`) }),
});
const both = (held) => ({ left: held, right: held });
/** The cases in the order they print, the long ones first so that the lanes stay full. */
const CASES = [
  ...[["workshop-fighter", "workshop-rogue"], ["crypt-skeleton", "workshop-fighter"], ["workshop-rogue", "crypt-skeleton"]]
    .map(([left, right]) => ({ name: `arena ${left} v ${right}`, run: () => arena({ left, right }) })),
  ...controlsFor("workshop-fighter").flatMap((control) =>
    ["club", "empty"].map((held) => controlled("workshop-fighter", "workshop-rogue", `${control},${control}`, both(held)))),
  controlled("crypt-skeleton", "workshop-rogue", "classic,classic", both("club")),
  controlled("reptile", "reptile", "crawl,crawl", both("empty")),
  ...["club", "empty"].map((held) => controlled("reptile", "workshop-fighter", "crawl,classic", { left: "empty", right: held })),
  ...[...HUMANOID_MODELS, "reptile"].map((model) => ({ name: `stand ${model}`, run: () => stand(model) })),
  ...[1, 2].map((seed) => ({ name: `crypt fight, seed ${seed}`, run: () => cryptFight(seed) })),
  ...["workshop-fighter", "workshop-rogue"].flatMap((model) => [
    { name: `lab run, circle, ${model}`, run: () => labRun(model) },
    { name: `lab routine, ${model}`, run: () => labRoutine(model) },
  ]),
  { name: "crypts, seeds 0-99 and 2124530852", run: () => crypts([...range(100), 2124530852]) },
  { name: "levels, seeds 0-19", run: () => levels(range(20)) },
  ...range(8).map((i) => i + 1).map((seed) => ({ name: `sight, crypt ${seed}`, run: () => sight(seed) })),
  { name: "weathering, crypts 1-3", run: () => weathering([1, 2, 3]) },
  { name: "cut-away, the chamber and crypts 1-3", run: () => cutaway([1, 2, 3]) },
  ...Object.keys(CHARACTERS).map((id) => ({ name: `character ${id}`, workshop: true, run: () => character(id) })),
];

if (isMainThread) {
  const { values } = parseArgs({ options: {
    workers: { type: "string" }, character: { type: "boolean" }, only: { type: "string" }, json: { type: "string" }, compare: { type: "string" },
  } });
  const only = values.only === undefined ? null : new RegExp(values.only);
  const chosen = CASES.keys().filter((id) => !!CASES[id].workshop === !!values.character && (!only || only.test(CASES[id].name))).toArray();
  console.log(`engine ${CORE_ENGINE}, ${chosen.length} cases`);
  const lanes = Math.min(chosen.length, Number(values.workers ?? Math.max(1, availableParallelism() - 2)));
  const lines = new Array(CASES.length);
  let next = 0;
  await Promise.all(Array.from({ length: lanes }, () => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url));
    const feed = () => {
      if (next >= chosen.length) { worker.terminate(); resolve(); return; }
      const id = chosen[next++];
      worker.once("message", ({ told, error }) => {
        if (error) { reject(new Error(`${CASES[id].name}: ${error}`)); return; }
        lines[id] = told;
        feed();
      });
      worker.postMessage(id);
    };
    feed();
  })));
  for (const id of chosen) console.log(`${CASES[id].name}: ${lines[id].line}`);
  const cases = Object.fromEntries(chosen.map((id) => [CASES[id].name, lines[id].record]));
  if (values.json) await writeFile(values.json, JSON.stringify({ harness: "Node, core world (src/core/world.ts), 120 Hz", engine: CORE_ENGINE, cases }, null, 1));
  if (values.compare) {
    const before = JSON.parse(await readFile(values.compare, "utf8"));
    if (before.engine !== CORE_ENGINE) throw new Error(`${values.compare} was taken on ${before.engine}, this on ${CORE_ENGINE}`);
    let moved = 0;
    for (const [name, record] of Object.entries(cases)) {
      const was = before.cases[name];
      if (!was) { console.log(`new: ${name}`); continue; }
      const differs = Object.keys({ ...was, ...record }).filter((key) => JSON.stringify(was[key]) !== JSON.stringify(record[key]));
      if (differs.includes("pose")) moved++;
      if (differs.length) console.log(`${differs.includes("pose") ? "MOVED" : "reshaped"}: ${name} (${differs.join(", ")})`);
    }
    for (const name of Object.keys(before.cases)) if (!(name in cases) && (!only || only.test(name))) console.log(`gone: ${name}`);
    console.log(moved ? `${moved} cases moved` : "no pose moved");
    if (moved) process.exitCode = 1;
  }
} else {
  // One case at a time: each is answered only when it is done. A case answers its line, or its line and record; a line alone is its pose.
  parentPort.on("message", async (id) => {
    try {
      const told = await CASES[id].run();
      parentPort.postMessage({ told: typeof told === "string" ? { line: told, record: { pose: told } } : told });
    }
    catch (error) { parentPort.postMessage({ error: String(error?.stack ?? error) }); }
  });
}
