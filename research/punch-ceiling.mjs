/**
 * **The punch's ceiling**: how fast the body itself can bring its fist to the punch competency's
 * pad, whatever controls it. A search over flat-out pushes on the trunk's, the legs' and the
 * striking arm's channels, each a level, a start and a length after the order, laid on the combat
 * guard with the stance kept, scored the way the competency reads a blow: the fist's strike point's
 * speed over its last 10 cm before the pad's face (`approachSpeed`), the first time it reaches the
 * face, within the face, no later than `deadline` s after the order, and the body still up 0.3 s
 * after. No pad stands there: the score is what the fist brings to it. With `cone`, a blow counts
 * only if its last 10 cm come in within that many degrees of the face's normal: a straight blow, not
 * one chopped down across the face. With `--score damage` the score is what the blow is worth in the
 * game instead: the exchange of hit points if the fist met a Warrior's head standing in guard there,
 * at the closing speed and with the arm's muscles holding as they did that step (`pricePunch`,
 * `punch-objective.mjs`).
 *
 * The search is diagonal CMA-ES in the unit cube of the schedule. It measures the body, not a
 * controller: its schedules are fitted to one cell and are not a skill.
 *
 *   node research/punch-ceiling.mjs --out <file.json> [--model ...] [--physique '<json>'] [--hand right] [--cell place|reach]
 *     [--score speed|damage] [--struck workshop-fighter] [--deadline 0.5] [--cone <deg>] [--hz 120] [--workers 14] [--generations 40] [--seed 1]
 *     [--from <file.json> [--sigma 0.25]]     a search begun at another's best, at that step size
 *   node research/punch-ceiling.mjs --verify <file.json> [--rates 120,480]     the best schedule again at each rate
 *
 * Harness: Node, the core's world on Rapier (`DEFAULT_ENGINE`), the body built in its guard, the
 * combat skills' guard with the stance kept, symmetric actuation.
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { rigidPoints } from "../src/core/build/rigid.ts";
import { contactMass } from "../src/core/build/contact-mass.ts";
import { motionAtToRef, pointOfToRef } from "../src/core/control/support.ts";
import { DEFAULT_ENGINE } from "../src/core/engine/engines.ts";
import { NO_COVER } from "../src/core/mind/intent.ts";
import { modelSpec } from "../src/core/models.ts";
import { holdsOf } from "../src/core/rules/blows.ts";
import { combatSkills } from "../src/core/skills/combat.ts";
import { guardPosture } from "../src/core/skills/guard.ts";
import { aimOf } from "../src/core/skills/strikes.ts";
import { coreStand } from "../tests/harness/core-stand.mjs";
import { COMPETENCY, fullReach } from "./competencies.mjs";
import { approachSpeed } from "./punch-calibration.mjs";
import { pricePunch, referenceHead } from "./punch-objective.mjs";
import { PUNCH_PAD } from "./punch-pad.mjs";

/** When the blow is ordered, s, as the competency's stands; how long after reaching the face the body must stay up, s. */
const ORDERED = 2, UPRIGHT = 0.3;

/**
 * How far the fist moved across the face's normal over its last 10 cm of approach, per metre along
 * it: the tangent of the approach's angle to the normal. Null if it has not come 10 cm.
 */
function approachAcross(history, distance = 0.1) {
  const end = history.at(-1), start = end.point[2] - distance;
  for (let i = history.length - 2; i >= 0; i--) {
    const a = history[i], b = history[i + 1];
    if (a.point[2] <= start && b.point[2] > start) {
      const f = (start - a.point[2]) / (b.point[2] - a.point[2]), dx = end.point[0] - (a.point[0] + f * (b.point[0] - a.point[0])), dy = end.point[1] - (a.point[1] + f * (b.point[1] - a.point[1]));
      return Math.sqrt(dx * dx + dy * dy) / (end.point[2] - start);
    }
  }
  return null;
}

/** The pushed channels: the trunk, both legs and the striking arm. */
export function ceilingChannels(hand) {
  return ["thoracic rotation right", "lumbar rotation right", "thoracic flexion", "lumbar flexion",
    ...["left", "right"].flatMap((side) => [`hip.${side} flexion`, `hip.${side} abduction`, `hip.${side} internal rotation`, `knee.${side} flexion`, `ankle.${side} dorsiflexion`]),
    `shoulder.${hand} flexion`, `shoulder.${hand} abduction`, `shoulder.${hand} internal rotation`, `elbow.${hand} flexion`];
}

/** The cell's pad: its face's centre (x, height, ahead), as the competency places it. */
export function ceilingTarget({ model, physique, hand, cell }) {
  const size = physique?.size ?? 1, [x, height, ahead] = COMPETENCY.punch.place.map((v) => v * size), side = hand === "right" ? x : -x;
  return [side, height, cell === "reach" ? fullReach(model, hand, side, height, physique) : ahead];
}

/**
 * What the fist's muscles hold through the blow: the game's rule (`bounds`, the motor's ceilings
 * read at the joint's speed as the step began), or, to see what a different rule would be worth,
 * each driven side's activation times its isometric peak (`isometric`), or times its peak and its
 * eccentric ceiling (`eccentric`): the joint stopped, or driven back, through the contact.
 */
function holdsBy(holding, muscles) {
  if (holding === "bounds") return holdsOf(muscles);
  const scale = (side) => side.peak * (holding === "eccentric" ? side.curve.eccentricCeiling : 1);
  return muscles.channels.map((c, i) => {
    const a = Math.max(0, Math.min(1, muscles.activation[i]));
    return { joint: c.joint, index: c.index, positive: muscles.bounds.positive[i] > 0 ? a * scale(c.positive) : 0, negative: muscles.bounds.negative[i] > 0 ? a * scale(c.negative) : 0 };
  });
}

/** The struck head each model and rate is priced on, read once a thread. */
const heads = new Map();
const headOf = (model, hz) => { const key = `${model}@${hz}`; if (!heads.has(key)) heads.set(key, referenceHead({ model, hz })); return heads.get(key); };

/**
 * One schedule `x` (per channel: level in -1..1, start and length in s after the order) on the
 * cell. Returns the score and what it read.
 */
export async function ceilingTrial(x, { model, physique, hand, cell, deadline, cone = null, hz, score: scoring = "speed", struck = "workshop-fighter", holding = "bounds" }) {
  const head = scoring === "damage" ? await headOf(struck, hz) : null;
  const channels = ceilingChannels(hand), target = ceilingTarget({ model, physique, hand, cell });
  const schedule = channels.map((channel, i) => ({ channel, level: x[3 * i], from: x[3 * i + 1], to: x[3 * i + 1] + Math.max(0, x[3 * i + 2]) }))
    .filter((p) => Math.abs(p.level) > 0.05);
  const spec = modelSpec(model, physique), s = await coreStand(spec, { engine: DEFAULT_ENGINE, hz, posture: guardPosture(spec) });
  const body = createBody(s.built, s.world, { servoSeconds: SERVO_SECONDS, feedback: true }), skills = combatSkills(body, {});
  body.drive((view, dt) => {
    const command = skills.command(view, { move: null, face: 0, guard: NO_COVER, attack: null }, dt), t = view.time - ORDERED;
    const live = schedule.filter((p) => t >= p.from && t < p.to).map((p) => ({ channel: p.channel, sense: p.level > 0 ? 1 : -1, level: Math.min(1, Math.abs(p.level)) }));
    return live.length ? { ...command, pushes: [...command.pushes, ...live] } : command;
  });
  const limb = s.built.segments.get(`hand.${hand}`), aim = rigidPoints(spec, limb.spec).get(aimOf(spec, hand)).value, point = new Vector3();
  const [halfX, halfY] = [PUNCH_PAD.size[0] / 2, PUNCH_PAD.size[1] / 2], history = [];
  const masses = head ? contactMass(s.built) : null, linear = new Vector3(), angular = new Vector3();
  let reached = null, down = false;
  try {
    for (let i = 0; i < Math.round((ORDERED + deadline + UPRIGHT) * hz); i++) {
      s.world.step();
      const t = s.world.time - ORDERED;
      down ||= body.view.down;
      if (t < 0) continue;
      if (reached === null) {
        pointOfToRef(limb, aim, point);
        history.push({ time: t, point: point.asArray() });
        if (point.z >= target[2]) {
          let priced = null;
          if (masses) {
            motionAtToRef(limb, point, linear, angular);
            masses.update();
            priced = { ...pricePunch({ fist: masses.yielding(limb, point.asArray(), [0, 0, 1], holdsBy(holding, body.muscles)), fistStiffness: limb.spec.surface.stiffness.value,
              head, closing: Math.max(0, linear.z) }), fistFreeKg: masses.along(limb, point.asArray(), [0, 0, 1]) };
          }
          reached = { time: t, at: point.asArray(), within: Math.abs(point.x - target[0]) <= halfX && Math.abs(point.y - target[1]) <= halfY,
            speed: approachSpeed(history), across: approachAcross(history), downThen: down, closing: linear.z, priced };
        }
      }
      if (reached !== null && t > reached.time + UPRIGHT) break;
      if (reached === null && t > deadline) break;
    }
  } finally { body.dispose?.(); s.dispose(); }
  const straight = cone === null || (reached?.across ?? Infinity) <= Math.tan(cone * Math.PI / 180);
  const counted = reached !== null && reached.within && straight && reached.time <= deadline && !down && reached.speed !== null;
  return { score: counted ? (head ? reached.priced.exchange : reached.speed) : 0, reached: reached && { time: +reached.time.toFixed(4), at: reached.at.map((v) => +v.toFixed(3)), within: reached.within,
    across: reached.across === null ? null : +reached.across.toFixed(3), speed: reached.speed === null ? null : +reached.speed.toFixed(3),
    ...(reached.priced ? { closing: +reached.closing.toFixed(3), priced: Object.fromEntries(Object.entries(reached.priced).map(([k, v]) => [k, +v.toFixed(4)])) } : {}) }, down, target };
}

if (!isMainThread && workerData?.ceiling) {
  parentPort.on("message", async ({ id, x }) => {
    let r; try { r = await ceilingTrial(x, workerData.cell); } catch (error) { r = { score: 0, error: String(error?.stack ?? error) }; }
    parentPort.postMessage({ id, r });
  });
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { out: { type: "string" }, model: { type: "string" }, physique: { type: "string" }, hand: { type: "string" },
    cell: { type: "string" }, deadline: { type: "string" }, hz: { type: "string" }, workers: { type: "string" }, generations: { type: "string" },
    seed: { type: "string" }, cone: { type: "string" }, score: { type: "string" }, struck: { type: "string" }, from: { type: "string" }, sigma: { type: "string" }, verify: { type: "string" }, rates: { type: "string" } } });
  if (values.verify) {
    const found = JSON.parse(readFileSync(values.verify, "utf8")), rows = [];
    for (const hz of (values.rates ?? "120,480").split(",").map(Number)) rows.push({ hz, ...(await ceilingTrial(found.best.x, { ...found.cell, hz })) });
    console.log(JSON.stringify({ file: values.verify, cell: found.cell, searched: found.best.score, rows }));
    process.exit(0);
  }
  const cell = { model: values.model ?? "workshop-fighter", ...(values.physique ? { physique: JSON.parse(values.physique) } : {}), hand: values.hand ?? "right",
    cell: values.cell ?? "place", deadline: Number(values.deadline ?? 0.5), cone: values.cone === undefined ? null : Number(values.cone), hz: Number(values.hz ?? 120),
    score: values.score ?? "speed", struck: values.struck ?? "workshop-fighter" };
  const nw = Number(values.workers ?? Math.max(1, availableParallelism() - 4)), generations = Number(values.generations ?? 40), n = ceilingChannels(cell.hand).length * 3;
  // A seeded generator, so a search can be run again: mulberry32.
  let seed = Number(values.seed ?? 1) >>> 0;
  const random = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => { let u = 0; while (!u) u = random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random()); };
  const lo = [], hi = [];
  for (let i = 0; i < n / 3; i++) { lo.push(-1, 0, 0); hi.push(1, cell.deadline, cell.deadline); }
  const workers = Array.from({ length: nw }, () => new Worker(fileURLToPath(import.meta.url), { workerData: { ceiling: true, cell } }));
  let nextId = 0; const waiting = new Map(), idle = [...workers], queue = [];
  const pump = () => { while (idle.length && queue.length) { const { id, x } = queue.shift(); idle.pop().postMessage({ id, x }); } };
  for (const w of workers) w.on("message", ({ id, r }) => { waiting.get(id)(r); waiting.delete(id); idle.push(w); pump(); });
  const evaluate = (x) => new Promise((done) => { const id = nextId++; waiting.set(id, done); queue.push({ id, x }); pump(); });
  const toX = (u) => u.map((v, i) => lo[i] + (hi[i] - lo[i]) * Math.min(1, Math.max(0, v)));
  const from = values.from ? JSON.parse(readFileSync(values.from, "utf8")).best.x : null;
  let m = from ? from.map((v, i) => Math.min(1, Math.max(0, (v - lo[i]) / (hi[i] - lo[i])))) : new Array(n).fill(0.5), sigma = Number(values.sigma ?? 0.25);
  const C = new Array(n).fill(1), lambda = 4 * nw, mu = lambda >> 1;
  const weights = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1)), total = weights.reduce((a, b) => a + b);
  for (let i = 0; i < mu; i++) weights[i] /= total;
  const mueff = 1 / weights.reduce((a, w) => a + w * w, 0);
  const cs = (mueff + 2) / (n + mueff + 5), ds = 1 + cs, cc = 4 / (n + 4), c1 = 2 / ((n + 1.3) * (n + 1.3) + mueff);
  const cmu = Math.min(1 - c1, 2 * (mueff - 2 + 1 / mueff) / ((n + 2) * (n + 2) + mueff)) * (n + 2) / 3;
  const chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
  let ps = new Array(n).fill(0), pc = new Array(n).fill(0), best = { score: -Infinity };
  const log = [];
  for (let g = 0; g < generations; g++) {
    const us = Array.from({ length: lambda }, () => m.map((mi, i) => Math.min(1, Math.max(0, mi + sigma * Math.sqrt(C[i]) * gauss()))));
    const rs = await Promise.all(us.map((u) => evaluate(toX(u))));
    const order = rs.map((_, i) => i).sort((a, b) => rs[b].score - rs[a].score);
    if (rs[order[0]].score > best.score) best = { score: rs[order[0]].score, x: toX(us[order[0]]), r: rs[order[0]], g };
    const old = m.slice();
    m = m.map((_, i) => order.slice(0, mu).reduce((a, k, j) => a + weights[j] * us[k][i], 0));
    const y = m.map((mi, i) => (mi - old[i]) / sigma);
    ps = ps.map((p, i) => (1 - cs) * p + Math.sqrt(cs * (2 - cs) * mueff) * y[i] / Math.sqrt(C[i]));
    const norm = Math.sqrt(ps.reduce((a, p) => a + p * p, 0));
    pc = pc.map((p, i) => (1 - cc) * p + Math.sqrt(cc * (2 - cc) * mueff) * y[i]);
    for (let i = 0; i < n; i++) {
      let rank = 0; for (let j = 0; j < mu; j++) { const d = (us[order[j]][i] - old[i]) / sigma; rank += weights[j] * d * d; }
      C[i] = (1 - c1 - cmu) * C[i] + c1 * pc[i] * pc[i] + cmu * rank;
    }
    sigma *= Math.exp((cs / ds) * (norm / chiN - 1));
    const median = rs.map((r) => r.score).sort((a, b) => a - b)[lambda >> 1];
    log.push({ g, best: +rs[order[0]].score.toFixed(3), median: +median.toFixed(3), sigma: +sigma.toFixed(3), errors: rs.filter((r) => r.error).length });
    console.error(JSON.stringify(log.at(-1)));
    if (values.out) writeFileSync(values.out, JSON.stringify({ cell, from: values.from ?? null, channels: ceilingChannels(cell.hand), best, mean: toX(m), log }));
  }
  for (const w of workers) w.terminate();
  console.log(JSON.stringify({ cell, best: { score: best.score, g: best.g, r: best.r } }));
  process.exit(0);
}
