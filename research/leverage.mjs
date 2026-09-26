/**
 * The skill-leverage checks of the headroom audit (skill ceiling session 05,
 * `docs/plans/2026-09-25-skill-ceiling-05-headroom-audit.md`, "The skill-leverage checks"; the
 * write-up is `docs/analysis/2026-09-26-headroom.md`). Each check is a bench and a number:
 *
 *     node research/leverage.mjs --check balance     [--builds default,skeleton-warrior,...]
 *     node research/leverage.mjs --check commitment  [--builds ...]
 *     node research/leverage.mjs --check precision   [--builds ...]
 *     node research/leverage.mjs --check deflection  [--modules effector.wrist.blade,...]
 *     node research/leverage.mjs --check idle-felled [--pairs 16] [--lanes 8]
 *
 * Footwork, the fifth, is a bout experiment: `node research/headroom.mjs --exp footwork`, played by
 * the forward/back-only expert (`expert-fb`, `tests/harness/expert.mjs`).
 *
 * Harnesses:
 *
 * - **balance** and **commitment**: the Node headless arena (`tests/harness/golem-headless-arena.mjs`),
 *   a supported pair twelve metres apart as `research/rise-bench.mjs` builds it, the measured body
 *   driven by a scripted mind through the controls a person has (`Intent`), the other idle. Every
 *   reading is off the locomotion port (`fallImpulseNs`, `stabilityLinesAlong`, the support state,
 *   the carrier) or off `mesh.position`.
 * - **precision**: bodies stood up by `createBout` (supported locomotion, NullEngine, real Havok) and
 *   read one frame in; the damage arithmetic is `scoreHit` and `armouredDamage` in `src/scoring.ts`
 *   and `vitality` in `src/bout.ts`, called, not copied.
 * - **deflection**: the Node impact bench's stroke (`strokeProbe`'s two passes on the effector bench
 *   stand, NullEngine, real Havok) into a free, gravity-free plate turned off square.
 * - **idle-felled**: the Node research runner through `research/fall-loop-worker.mjs`, the research
 *   `PROTOCOL`, an idle stone default against a brawler on the stone default.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { CONFIG } from "../src/config.ts";
import { TORSO_WAIST } from "../src/golem/config.ts";
import { stepPair } from "../src/fighter.ts";
import { Golem } from "../src/golem/golem.ts";
import { idleMind, policyMind } from "../src/mind.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { freshGolemIntent, GOLEM_TACTICS } from "../src/golem/tactics.ts";
import { chooseStriker, pointAt, strokeCommand, strokeSeconds } from "../src/golem/walker.ts";
import { armourAgainst, armouredDamage, biteMechanism, scoreHit } from "../src/scoring.ts";
import { effectiveMassAt } from "../src/body-inertia.ts";
import { COLLIDES, LAYER } from "../src/physics.ts";
import { createHeadlessArena } from "../tests/harness/golem-headless-arena.mjs";
import { createBout, freshHavok } from "../tests/harness/bout-runner.mjs";
import { auditBuild } from "./headroom-builds.mjs";
import { runJobs, readResults } from "./runner.mjs";
import { PROTOCOL, seed } from "./schedule.mjs";
import { hullMargin } from "./fall-loop-worker.mjs";
Logger.LogLevels = Logger.ErrorLogLevel;

const FIXED = 1 / CONFIG.world.physicsHz;
const SIDES = ["left", "right"];
const quantile = (xs, q) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// ---------------------------------------------------------------------------------------------
// A headless pair and a scripted body
// ---------------------------------------------------------------------------------------------

/**
 * A supported pair `apart` metres apart on the flat, the left body driven by `mind`, the right one
 * idle, as `research/rise-bench.mjs` builds it. `sample(t)` runs after every solver step.
 */
export async function headlessPair(setup, mind, { apart = 12, opponent = auditBuild("default").setup } = {}) {
  const arena = await createHeadlessArena();
  const { scene } = arena;
  const world = flatSupportedWorldRegistry();
  const pair = [
    new Golem(scene, { side: "left", origin: new Vector3(0, 0, 0), facing: 0, setup, mind, controlPolicies: [], locomotionWorld: world }),
    new Golem(scene, { side: "right", origin: new Vector3(0, 0, apart), facing: Math.PI, setup: opponent, mind: idleMind(),
      controlPolicies: [], locomotionWorld: world }),
  ];
  let clock = 0;
  const samplers = [];
  const control = scene.onBeforePhysicsObservable.add(() => { stepPair(...pair, FIXED, clock); clock += FIXED; });
  const after = scene.onAfterPhysicsObservable.add(() => { for (const f of samplers) f(clock); });
  const run = (seconds) => {
    const end = clock + seconds;
    while (clock < end) { scene._renderId += 1; scene._advancePhysicsEngineStep(1000 / 60); }
  };
  return {
    golem: pair[0], port: pair[0].locomotion, pair, scene, run, onSample: (f) => samplers.push(f),
    get clock() { return clock; },
    dispose() {
      scene.onBeforePhysicsObservable.remove(control);
      scene.onAfterPhysicsObservable.remove(after);
      for (const g of pair) g.dispose();
      arena.dispose();
    },
  };
}

/** Headings from the body's facing: 0 ahead, pi/2 its right, and so on. */
const DIRECTIONS = Array.from({ length: 16 }, (_, i) => (2 * Math.PI * i) / 16);
/** The fall impulse along each of `DIRECTIONS` in the body's frame, N.s. */
function fallRose(port) {
  const yaw = port.carrier.state.yaw;
  const mass = port.supportedMassKg;
  return DIRECTIONS.map((a) => {
    const h = yaw + a;
    const line = port.stabilityLinesAlong(Math.sin(h), Math.cos(h)).fallAtMps;
    return Number.isFinite(line) ? line * mass : NaN;
  });
}

/**
 * A scripted mind for one state: `still` (guard held, facing them), `walk`, `back`, `strafe`,
 * `turn`, and `stroke` / `stroke-step` (full strokes thrown at the air a reach ahead, flat-footed or
 * with the stroke's own step, one after another). It writes only an `Intent`, as a person's controls
 * do. `stage` is the stroke machine's last stage, for the sampler.
 */
export function scriptedMind(state) {
  const intent = freshGolemIntent();
  const mark = { x: 0, y: 0, z: 0 };
  const aim = { swing: 0, lift: 0, horizontal: 0 };
  const out = { stage: "rest", strokes: 0, t: 0, strokeAt: -1, name: `script-${state}` };
  let stroke = -1;
  out.decide = (view, dt) => {
    out.t += dt;
    const self = view.self;
    const striker = chooseStriker(view);
    const hand = striker ? striker.hand : null;
    intent.forward = 0; intent.strafe = 0; intent.turn = 0; intent.posture.crouch = 0;
    intent.actingHand = hand ?? "primary";
    // The mark: a reach ahead of the striker's own socket, at shoulder height -- empty air.
    const reach = striker ? striker.reach : 1;
    const from = hand ? self.hands[hand].shoulder : self.ground;
    mark.x = from.x + Math.sin(self.facing) * reach;
    mark.z = from.z + Math.cos(self.facing) * reach;
    mark.y = hand ? self.hands[hand].shoulder.y : 1;
    const settled = out.t > 2;
    if ((state === "stroke" || state === "stroke-step") && settled && striker) {
      if (stroke < 0) { stroke = 0; out.strokeAt = out.t; out.strokes += 1; }
      out.stage = strokeCommand(intent, view, hand, stroke, mark, aim);
      if (state === "stroke") intent.forward = 0;
      stroke += dt;
      // A full second of guard between strokes, so each one is thrown from rest.
      if (out.stage === "done" && stroke > strokeSeconds(view, hand) + 1) stroke = -1;
      if (out.stage === "done") pointAt(intent, view, hand, mark, aim);
      return intent;
    }
    out.stage = "rest";
    pointAt(intent, view, hand, mark, aim);
    if (!settled) return intent;
    if (state === "walk") intent.forward = 1;
    else if (state === "back") intent.forward = -1;
    else if (state === "strafe") intent.strafe = 1;
    else if (state === "turn") intent.turn = 1;
    return intent;
  };
  return out;
}

// ---------------------------------------------------------------------------------------------
// 1. Balance as state
// ---------------------------------------------------------------------------------------------

export const BALANCE_STATES = Object.freeze(["still", "walk", "back", "strafe", "turn", "stroke", "stroke-step", "rising"]);

/**
 * One state on one build: the weakest-direction fall impulse (`fallImpulseNs`) and the whole rose of
 * it round the body, sampled every solver step while the body is in that state. `rising` knocks the
 * body down as `research/rise-bench.mjs` does (the ledger at twice its fall line and 1.5 m/s at the
 * core, pushed onto its back) and samples the rise.
 */
export async function balanceState(setup, state, { seconds = 4 } = {}) {
  const mind = scriptedMind(state === "rising" ? "still" : state);
  const h = await headlessPair(setup, mind);
  const weakest = [], front = [], back = [], side = [], roseMin = [], roseMax = [], leanShare = [], margins = [], speeds = [];
  let sampling = false;
  let knock = null;
  const core = h.golem.limbs.find((l) => l.key.endsWith("trunk.core"))?.part ?? null;
  h.onSample(() => {
    const port = h.port;
    if (knock && port.state === "fallen") { core?.body.applyImpulse(knock, core.mesh.position.clone()); knock = null; }
    if (!sampling) return;
    const s = port.state;
    const wanted = state === "rising" ? s === "rising" : (s === "supported" || s === "staggered") &&
      (state.startsWith("stroke") ? mind.stage === "commit" : true);
    if (!wanted) return;
    weakest.push(port.fallImpulseNs());
    const rose = fallRose(port);
    front.push(rose[0]); back.push(rose[8]); side.push(Math.min(rose[4], rose[12]));
    roseMin.push(Math.min(...rose)); roseMax.push(Math.max(...rose));
    const ss = port.supportState;
    const line = port.stabilityLinesAlong(ss.leanX, ss.leanZ).fallAtMps;
    leanShare.push(ss.specificImpulseMps > 0 && line > 0 ? ss.specificImpulseMps / line : 0);
    margins.push(port.tipping ? hullMargin(port.tipping.hull) : NaN);
    const c = port.carrier.state;
    speeds.push(Math.hypot(c.velocityX, c.velocityZ));
  });
  try {
    if (state === "rising") {
      h.run(2);
      const port = h.port;
      const yaw = port.carrier.state.yaw;
      const wx = -Math.sin(yaw), wz = -Math.cos(yaw);
      const massKg = port.supportedMassKg;
      const line = port.stabilityLinesAlong(wx, wz).fallAtMps;
      h.golem.queueStabilityEvent({ horizontalShoveNs: [wx * line * massKg * 2, wz * line * massKg * 2] });
      knock = new Vector3(wx, 0, wz).scale(massKg * 1.5);
      sampling = true;
      h.run(9);
    } else {
      h.run(2.5);
      sampling = true;
      h.run(seconds);
    }
  } finally { h.dispose(); }
  const q = (xs) => ({ p10: quantile(xs, 0.1), median: quantile(xs, 0.5), min: quantile(xs, 0) });
  return { state, samples: weakest.length, weakest: q(weakest), front: q(front), back: q(back), side: q(side),
    roseMin: q(roseMin), roseMaxMedian: quantile(roseMax, 0.5), leanShareMax: quantile(leanShare, 1),
    marginMedian: quantile(margins, 0.5), speedMedian: quantile(speeds, 0.5), strokes: mind.strokes };
}

/**
 * Is the reading the threshold? The still body shoved along its weakest heading at `k` times its own
 * `fallImpulseNs`, through the ledger as a blow is filed: did it fall within two seconds.
 */
export async function balanceBisect(setup, k) {
  const h = await headlessPair(setup, scriptedMind("still"));
  let fell = false;
  h.onSample(() => { if (h.port.state === "fallen") fell = true; });
  try {
    h.run(2.5);
    const port = h.port;
    const rose = fallRose(port);
    const i = rose.indexOf(Math.min(...rose));
    const heading = port.carrier.state.yaw + DIRECTIONS[i];
    const impulse = k * port.fallImpulseNs();
    h.golem.queueStabilityEvent({ horizontalShoveNs: [Math.sin(heading) * impulse, Math.cos(heading) * impulse] });
    h.run(2);
  } finally { h.dispose(); }
  return { k, fell };
}

export async function balanceCheck(builds) {
  const rows = [];
  for (const name of builds) {
    const setup = auditBuild(name).setup;
    const states = [];
    for (const state of BALANCE_STATES) states.push(await balanceState(setup, state));
    const bisect = [];
    for (const k of [0.8, 0.95, 1.05, 1.25]) bisect.push(await balanceBisect(setup, k));
    const still = states.find((s) => s.state === "still");
    const leastVulnerable = still.roseMaxMedian;
    const worst = states.filter((s) => s.samples > 0).reduce((a, s) => (s.roseMin.p10 < a.roseMin.p10 ? s : a));
    rows.push({ build: name, states, bisect,
      ratio: { weakestToStrongestStill: still.roseMin.median / leastVulnerable,
        mostToLeast: worst.roseMin.p10 / leastVulnerable, mostVulnerableState: worst.state } });
    console.log(`${name}: still ${still.weakest.median?.toFixed(0)} N.s weakest, ${leastVulnerable?.toFixed(0)} strongest; most vulnerable ${worst.state} p10 ${worst.roseMin.p10?.toFixed(0)}; bisect ${bisect.map((b) => `${b.k}:${b.fell ? "fell" : "stood"}`).join(" ")}`);
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// 2. The cost of commitment
// ---------------------------------------------------------------------------------------------

/**
 * One full stroke thrown at the air, flat-footed or with its step, from a settled guard. Reads:
 *
 * - `strokeS`: the stroke's own commanded length (chamber, commit and follow);
 * - `backToGuardS`: from the stroke's start until the striker's tip, in the carrier's frame, is back
 *   within 0.1 m of where it stood in guard and moving under 0.5 m/s -- how long the striker is out of
 *   its guard;
 * - the balance through it against the guard before it: the weakest fall impulse's least value
 *   (`fallDuring` over `fallBefore`), the lean the stroke put on its own ledger (`leanShareMax`: zero
 *   is a swing whose reaction never reaches the balance), the carrier's drift, and the centre of
 *   mass's least margin inside its base.
 */
export async function commitmentProbe(setup, { step = false } = {}) {
  const mind = scriptedMind(step ? "stroke-step" : "stroke");
  const h = await headlessPair(setup, mind);
  const effector = h.golem.effectors?.primary ?? h.golem.effectors?.secondary;
  const striker = effector?.module.strikers?.[0] ?? null;
  const rel = () => {
    const c = h.port.carrier.state;
    const tip = striker.tipPosition();
    const dx = tip.x - c.x, dz = tip.z - c.z;
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    return { x: dx * cy - dz * sy, y: tip.y, z: dx * sy + dz * cy };
  };
  let guard = null, last = null, strokeAt = null, back = null;
  const before = [], during = [], lean = [], margin = [], marginBefore = [];
  let drift = 0, startC = null, excursion = 0, tipPeak = 0, carrierPeak = 0, doneAt = null, lastWorld = null;
  h.onSample((t) => {
    if (!striker) return;
    const p = rel();
    const speed = last ? Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) / FIXED : 0;
    last = p;
    const port = h.port;
    const standing = port.state === "supported" || port.state === "staggered";
    if (mind.strokes === 0 && t > 1.5) {
      guard = p;
      before.push(port.fallImpulseNs());
      marginBefore.push(port.tipping ? hullMargin(port.tipping.hull) : NaN);
      return;
    }
    if (mind.strokes !== 1) return;
    if (strokeAt === null) { strokeAt = t; startC = { ...port.carrier.state }; }
    if (standing) during.push(port.fallImpulseNs());
    const ss = port.supportState;
    const line = port.stabilityLinesAlong(ss.leanX, ss.leanZ).fallAtMps;
    lean.push(ss.specificImpulseMps > 0 && line > 0 ? ss.specificImpulseMps / line : 0);
    margin.push(port.tipping ? hullMargin(port.tipping.hull) : NaN);
    const c = port.carrier.state;
    drift = Math.max(drift, Math.hypot(c.x - startC.x, c.z - startC.z));
    carrierPeak = Math.max(carrierPeak, Math.hypot(c.velocityX, c.velocityZ));
    if (guard) excursion = Math.max(excursion, Math.hypot(p.x - guard.x, p.y - guard.y, p.z - guard.z));
    const w = striker.tipPosition();
    if (lastWorld) tipPeak = Math.max(tipPeak, Math.hypot(w.x - lastWorld.x, w.y - lastWorld.y, w.z - lastWorld.z) / FIXED);
    lastWorld = w.clone();
    if (doneAt === null && mind.stage === "done") doneAt = t - strokeAt;
    if (back === null && mind.stage === "done" && guard &&
      Math.hypot(p.x - guard.x, p.y - guard.y, p.z - guard.z) < 0.1 && speed < 0.5) back = t - strokeAt;
  });
  try { h.run(6.2); } finally { h.dispose(); }
  return { step, striker: Boolean(striker), backToGuardS: back, fallBefore: quantile(before, 0.5), fallDuring: quantile(during, 0),
    fallDuringMedian: quantile(during, 0.5), leanShareMax: quantile(lean, 1), driftM: drift,
    marginBefore: quantile(marginBefore, 0.5), marginDuringMin: quantile(margin, 0), standingShare: during.length / Math.max(lean.length, 1),
    excursionM: excursion, tipPeakMps: tipPeak, carrierPeakMps: carrierPeak, strokeDoneS: doneAt };
}

export async function commitmentCheck(builds) {
  const rows = [];
  for (const name of builds) {
    const setup = auditBuild(name).setup;
    const flat = await commitmentProbe(setup, { step: false });
    const stepped = await commitmentProbe(setup, { step: true });
    rows.push({ build: name, flat, stepped });
    const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "-");
    console.log(`${name}: back to guard ${f(flat.backToGuardS)} s flat / ${f(stepped.backToGuardS)} s stepped; fall impulse ${f(flat.fallBefore, 0)} -> ${f(flat.fallDuring, 0)} N.s (stepped ${f(stepped.fallDuring, 0)}); lean ${f(flat.leanShareMax)}/${f(stepped.leanShareMax)}; drift ${f(flat.driftM)}/${f(stepped.driftM)} m; excursion ${f(flat.excursionM)} m, tip peak ${f(flat.tipPeakMps)} m/s, carrier peak ${f(stepped.carrierPeakMps)} m/s, stroke done ${f(flat.strokeDoneS)} s`);
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// 3. Precision pays
// ---------------------------------------------------------------------------------------------

/** The strikers the precision check prices, each by the build that carries it and its scoring kind. */
export const PRECISION_STRIKERS = Object.freeze([
  { name: "blade", build: "default" }, { name: "mace", build: "mace" }, { name: "maul", build: "maul" },
  { name: "fist", build: "fists" }, { name: "whip", build: "whip" },
]);

/**
 * What one joule of a striker's kinetic energy is worth on each part of a target, in bar: the blow
 * scored by `scoreHit` at a closing speed that carries `keJ` of the striker's own kinetic energy,
 * armoured by the target's own `applyDamage` rule, and charged to the bar by `vitality`'s weights.
 * An edge is priced at three placements: along 1 (square on the edge), 0.7 and 0.4.
 */
export async function precisionCheck(targets) {
  const physics = await freshHavok();
  const strikers = [];
  for (const s of PRECISION_STRIKERS) {
    const bout = createBout({ left: "idle", right: "idle", leftGolem: auditBuild(s.build).setup, rightGolem: auditBuild("default").setup,
      locomotionMode: "supported", physics, seeds: [1, 2] });
    try {
      bout.step();
      const eff = bout.left.effectors.primary;
      const st = eff.module.strikers[0];
      const tip = st.tipPosition();
      const edge = new Vector3(0, 0, 1);
      strikers.push({ ...s, kind: st.kind, how: biteMechanism(st.kind),
        effectiveKg: effectiveMassAt(st.body, tip, edge), bodyKg: st.body.getMassProperties().mass });
    } finally { bout.dispose(); }
  }
  const out = { strikers, targets: [] };
  const keJ = 200;
  for (const target of targets) {
    const bout = createBout({ left: "idle", right: "idle", leftGolem: auditBuild(target).setup, rightGolem: auditBuild("default").setup,
      locomotionMode: "supported", physics: await freshHavok(), seeds: [1, 2] });
    try {
      bout.step();
      const golem = bout.left;
      const parts = golem.limbs.filter((limb) => (limb.vitalityWeight ?? 0) > 0 || limb.fatal).map((limb) => {
        const n = new Vector3(0, 0, 1);
        return { key: limb.key.replace(/^golem\.left\./, ""), massKg: limb.part.body.getMassProperties().mass,
          effectiveKg: effectiveMassAt(limb.part.body, limb.part.mesh.position, n), maxHealth: limb.maxHealth,
          weight: limb.vitalityWeight ?? 0, fatal: limb.fatal === true,
          armour: { cut: golem.armourOf(limb, "cut"), crush: golem.armourOf(limb, "crush") } };
      });
      const priced = [];
      for (const s of strikers) {
        const v = Math.sqrt((2 * keJ) / s.effectiveKg);
        const placements = s.how === "edge" ? [1, 0.7, 0.4] : [1];
        for (const along of placements) {
          for (const p of parts) {
            const score = scoreHit({ closingSpeed: v, strikerMassKg: s.effectiveKg, partMassKg: p.effectiveKg,
              edgeAlignment: along, bladeAlignment: 0, nearTip: false }, s.kind);
            const kind = score.kind === "weak" ? "cut" : score.kind === "slap" ? (s.how === "edge" ? "cut" : "crush") : score.kind;
            const applied = armouredDamage(score.damage, kind === "crush" ? p.armour.crush : p.armour.cut);
            // Uncapped: what the blow is worth while the part still has health to lose.
            const bar = (applied / p.maxHealth) * p.weight;
            priced.push({ striker: s.name, along, part: p.key, fatal: p.fatal, damage: applied,
              barPerKJ: (1000 * bar) / keJ, blowsToEmpty: applied > 0 ? p.maxHealth / applied : Infinity, kind: score.kind });
          }
        }
      }
      out.targets.push({ target, keJ, parts, priced });
    } finally { bout.dispose(); }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// 4. Deflection over blocking
// ---------------------------------------------------------------------------------------------

/**
 * One module's stroke, as the impact bench throws it (`strokeProbe`'s two passes), into a free,
 * gravity-free plate of `massKg` hung at the unobstructed stroke's peak and turned `angleDeg` off
 * square to the tip's travel there, about the axis across both. Read at separation: the plate's
 * linear momentum along the stroke and across it, its kinetic energy (linear and angular), and the
 * striker's closing speed. The energy that reaches the defender is the plate's.
 */
export async function deflectionProbe({ moduleId, angleDeg, massKg = 40, size = [0.45, 0.45, 0.05], guardSeconds = 1.5, offsetM = 0 }) {
  const { runGolemBench, strokeSequence, capabilityOf, markFor } = await import("../tests/harness/golem-bench.mjs");
  const { weaponOf } = await import("../tests/harness/golem-bench.mjs");
  const kind = weaponOf(moduleId);
  const { STROKE_SHAPES } = await import("../src/golem/tactics.ts");
  let window = null;
  const sequence = ({ module, socket }) => {
    const cap = capabilityOf(module);
    const envelope = module.envelope();
    const mark = markFor(socket, envelope, cap, {});
    const script = strokeSequence({ shape: STROKE_SHAPES[kind], cap, socket: socket.world, mark, reach: envelope.reach,
      outboard: socket.outboard, guardSeconds, guardReach: GOLEM_TACTICS.guardReach });
    const at = (name) => script.find((phase) => phase.name === name)?.until;
    window = { from: at("chamber") ?? guardSeconds, to: at("follow") ?? at("stroke") ?? script[script.length - 1].until,
      hang: (at("chamber") ?? guardSeconds) - 0.05 };
    return script;
  };
  let peak = null;
  await runGolemBench({ moduleId, sequence, probe: ({ t, module }) => {
    if (t < window.from || t > window.to) return;
    const striker = module.strikers[0];
    const tip = striker.tipPosition();
    const velocity = striker.velocityAt(tip).clone();
    const speed = velocity.length();
    if (!peak || speed > peak.speed) peak = { t, speed, tip: tip.clone(), dir: velocity.scale(1 / Math.max(speed, 1e-9)) };
  } });
  if (!peak) return { moduleId, angleDeg, touched: false };
  // The plate's normal: minus the tip's travel, turned `angleDeg` about the axis across the travel
  // and the vertical (or across the travel and +x, for a travel that is vertical).
  const d = peak.dir;
  const up = Math.abs(d.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const axis = Vector3.Cross(d, up).normalize();
  const turn = Quaternion.RotationAxis(axis, (angleDeg * Math.PI) / 180);
  const normal = d.scale(-1).applyRotationQuaternion(turn);
  // The box's local +z is its thin axis: turn +z onto the normal.
  const z = new Vector3(0, 0, 1);
  const cross = Vector3.Cross(z, normal);
  const orient = cross.length() < 1e-9 ? (Vector3.Dot(z, normal) > 0 ? Quaternion.Identity() : Quaternion.RotationAxis(new Vector3(0, 1, 0), Math.PI))
    : Quaternion.RotationAxis(cross.normalize(), Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(z, normal)))));
  // `offsetM` slides the plate along the axis across the travel, so a reading is not one contact point.
  const centre = peak.tip.add(normal.scale(-(size[2] / 2 + 0.01))).add(axis.scale(offsetM));
  let plate = null, contacts = 0, touching = false, touchedAt = null, result = null, closing = null, now = 0;
  const pre = { lin: new Vector3(), ang: new Vector3(), com: new Vector3() };
  let strikeOf = null;
  await runGolemBench({ moduleId, sequence, probe: ({ t, module }) => {
    now = t;
    if (!plate) {
      if (t < window.hang) return;
      const scene = module.parts[0].part.mesh.getScene();
      strikeOf = module.strikers[0];
      const mesh = MeshBuilder.CreateBox("deflection.plate", { width: size[0], height: size[1], depth: size[2] }, scene);
      mesh.position.copyFrom(centre);
      mesh.rotationQuaternion = orient.clone();
      plate = new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: massKg, friction: 0.5, restitution: 0 }, scene);
      plate.shape.filterMembershipMask = LAYER.RIGHT_TRUNK;
      plate.shape.filterCollideMask = COLLIDES.RIGHT_TRUNK;
      plate.body.setGravityFactor(0);
      plate.body.setCollisionCallbackEnabled(true);
      scene.getPhysicsEngine().getPhysicsPlugin().setActivationControl(plate.body, 1);
      plate.body.getCollisionObservable().add(() => { contacts += 1; if (!touching) { touching = true; touchedAt = now; } });
    }
    if (!touching) {
      strikeOf.body.getLinearVelocityToRef(pre.lin);
      strikeOf.body.getAngularVelocityToRef(pre.ang);
      pre.com.copyFrom(strikeOf.centreOfMass());
      return;
    }
    if (result) return;
    if (closing === null) {
      const at = strikeOf.tipPosition();
      const v = pre.lin.add(Vector3.Cross(pre.ang, at.subtract(pre.com)));
      closing = { speed: v.length(), normal: -Vector3.Dot(v, normal) };
    }
    if (contacts > 0) { contacts = 0; return; }
    if (touchedAt - window.hang < 2.5 * FIXED) { result = { overlapped: true }; return; }
    const lin = new Vector3(), ang = new Vector3();
    plate.body.getLinearVelocityToRef(lin);
    plate.body.getAngularVelocityToRef(ang);
    const inertia = plate.body.getMassProperties().inertia ?? new Vector3(0, 0, 0);
    // Havok's inertia is per kilogram (AGENTS.md): times the mass for joules.
    const local = ang.applyRotationQuaternion(Quaternion.Inverse(plate.transformNode.rotationQuaternion));
    const rotJ = 0.5 * massKg * (inertia.x * local.x ** 2 + inertia.y * local.y ** 2 + inertia.z * local.z ** 2);
    result = { touchedAtS: touchedAt - window.from, peakTipMps: peak.speed, closingMps: closing.speed, normalMps: closing.normal,
      momentumAlongNs: massKg * Vector3.Dot(lin, d), momentumNs: massKg * lin.length(),
      linearJ: 0.5 * massKg * lin.lengthSquared(), rotationJ: rotJ };
  } });
  return { moduleId, angleDeg, offsetM, massKg, ...(result ?? { touched: false }) };
}

export async function deflectionCheck(modules, angles = [0, 30, 45, 60]) {
  const rows = [];
  for (const moduleId of modules) for (const angleDeg of angles) for (const offsetM of [-0.08, 0, 0.08]) {
    const r = await deflectionProbe({ moduleId, angleDeg, offsetM });
    rows.push(r);
    const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "-");
    console.log(`${moduleId} @${angleDeg}: closing ${f(r.closingMps)} (normal ${f(r.normalMps)}) m/s, plate ${f(r.momentumNs)} N.s, ${f(r.linearJ)} + ${f(r.rotationJ)} J${r.overlapped ? " OVERLAPPED" : ""}${r.touched === false ? " untouched" : ""}`);
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// The idle stone felled on almost nothing
// ---------------------------------------------------------------------------------------------

/** Idle stone against a brawler, corner-swapped, read by the fall loop's per-substep probe. */
export function idleFelledJobs(pairs, attacker = "golem-brawler") {
  const jobs = [];
  for (let k = 0; k < pairs; k += 1) {
    const seeds = [seed("headroom-v1", "idle-felled", k, "a"), seed("headroom-v1", "idle-felled", k, "b")];
    for (const idleSide of SIDES) {
      const left = idleSide === "left" ? "idle" : attacker;
      const right = idleSide === "left" ? attacker : "idle";
      const id = `idle-felled#${k}/${idleSide}`;
      jobs.push({ id, round: 0, block: `idle-felled#${k}`, k, idleSide, left, right, leftBuild: "default", rightBuild: "default",
        seeds: idleSide === "left" ? seeds : [...seeds].reverse() });
    }
  }
  return jobs;
}

/** Every fall of the idle side, and what fed the ledger on the boundary it fell. */
export function idleFelledSummary(rows) {
  const falls = [];
  let seconds = 0;
  for (const row of rows) {
    if (row.status !== "ok") continue;
    seconds += row.seconds;
    for (const f of row.sides[row.idleSide].falls) falls.push(f);
  }
  const byFrom = {};
  for (const f of falls) byFrom[f.from] = (byFrom[f.from] ?? 0) + 1;
  const byReason = {};
  for (const f of falls) byReason[f.reason ?? "none"] = (byReason[f.reason ?? "none"] ?? 0) + 1;
  // What the ledger was handed on the boundary it fell, as a share of the fall line there.
  const share = (f) => (Number.isFinite(f.line) && f.line > 0 ? (f.blowMps + f.heldMps) / f.line : null);
  const leanShare = (f) => (Number.isFinite(f.line) && f.line > 0 ? f.priorLean / f.line : null);
  const pick = (list, fn) => ({ n: list.length, median: quantile(list.map(fn), 0.5), p10: quantile(list.map(fn), 0.1),
    p90: quantile(list.map(fn), 0.9) });
  const risen = falls.filter((f) => f.from === "rising");
  const standing = falls.filter((f) => f.from !== "rising");
  return {
    bouts: rows.length, seconds, falls: falls.length, fallsPerMinute: (60 * falls.length) / Math.max(seconds, 1e-9),
    byFrom, byReason,
    onTheBoundary: { all: pick(falls, share), rising: pick(risen, share), standing: pick(standing, share) },
    priorLean: { all: pick(falls, leanShare), rising: pick(risen, leanShare), standing: pick(standing, leanShare) },
    line: { rising: pick(risen, (f) => f.line), standing: pick(standing, (f) => f.line) },
    pairDriving: falls.filter((f) => f.pairRecent).length, noBlowNoHeld: falls.filter((f) => f.blowCount === 0 && f.heldCount === 0).length,
    recentBlowMax: pick(falls, (f) => f.recentBlowMax), sinceStood: pick(standing, (f) => f.sinceStood),
    risingElapsed: pick(risen, (f) => f.risingElapsed), riseAbort: risen.reduce((a, f) => ({ ...a, [f.riseAbort ?? "none"]: (a[f.riseAbort ?? "none"] ?? 0) + 1 }), {}),
    gap: pick(falls, (f) => f.gap), otherState: falls.reduce((a, f) => ({ ...a, [f.otherState]: (a[f.otherState] ?? 0) + 1 }), {}),
  };
}

/**
 * One idle-felled bout traced a substep at a time on the idle side, for the seconds before each of
 * its falls: its weakest fall impulse, the centre of mass's margin inside its base and its offset
 * from the soles' midpoint toward the attacker, the carrier's travel, the gap, the pair push it was
 * handed, and the blows its ledger was handed. Same bout and seeds as `idleFelledJobs(k)`'s job.
 */
export async function idleFelledTrace(k = 0, idleSide = "left", attacker = "golem-brawler", { before = 1.5, every = 0.1, leanScale = 1 } = {}) {
  // `leanScale`: a counterfactual on the stone waist's lean ceiling (`TORSO_WAIST.leanTorque`), for
  // this bout only and put back after it -- a probe of the diagnosis, never a retune.
  const shippedLean = TORSO_WAIST.leanTorque;
  TORSO_WAIST.leanTorque = shippedLean * leanScale;
  try { return await traceIdleFelled(k, idleSide, attacker, { before, every }); }
  finally { TORSO_WAIST.leanTorque = shippedLean; }
}

async function traceIdleFelled(k, idleSide, attacker, { before, every }) {
  const job = idleFelledJobs(k + 1, attacker).find((j) => j.k === k && j.idleSide === idleSide);
  const setup = auditBuild("default").setup;
  const trace = [];
  const falls = [];
  let t = 0, was = "supported", pair = null, blows = [];
  let bout;
  const dt = 1 / CONFIG.world.physicsHz;
  const other = idleSide === "left" ? "right" : "left";
  const sample = () => {
    t += dt;
    const port = bout[idleSide].locomotion;
    const theirs = bout[other].locomotion;
    const mine = port.carrier.state, their = theirs.carrier.state;
    const md = port.options.massDistribution?.();
    const soles = port.options.supportBindings.map((b) => port.options.supportPoint?.(b)).filter(Boolean);
    const ux = their.x - mine.x, uz = their.z - mine.z, ul = Math.hypot(ux, uz) || 1;
    let comToward = null, solesToward = null;
    if (md && soles.length) {
      const sx = soles.reduce((a, p) => a + p.x, 0) / soles.length, sz = soles.reduce((a, p) => a + p.z, 0) / soles.length;
      comToward = ((md.x - sx) * ux + (md.z - sz) * uz) / ul;
      solesToward = ((sx - mine.x) * ux + (sz - mine.z) * uz) / ul;
    }
    const blowMps = blows.length ? blows.reduce((a, e) => a + Math.hypot(e.horizontalShoveNs[0], e.horizontalShoveNs[1]), 0) / port.supportedMassKg : 0;
    trace.push({ t, state: port.state, fallNs: port.fallImpulseNs(), margin: port.tipping ? hullMargin(port.tipping.hull) : null,
      comToward, solesToward, x: mine.x, z: mine.z, gap: Math.hypot(ux, uz) - port.footprint.radiusM - theirs.footprint.radiusM,
      theirSpeedToward: -((their.velocityX * ux + their.velocityZ * uz) / ul), pair: pair ? { ...pair } : null, blowMps,
      lean: port.supportState.specificImpulseMps, blowsN: blows.length, theirState: theirs.state,
      parts: Object.fromEntries(["pelvis", "core", "head"].map((name) => {
        const limb = bout[idleSide].limbs.find((l) => l.part.mesh?.name.endsWith(`.${name}`));
        const p = limb?.part.mesh?.position;
        return [name, p ? { toward: ((p.x - mine.x) * ux + (p.z - mine.z) * uz) / ul, y: p.y } : null];
      })) });
    if (port.state === "fallen" && was !== "fallen") falls.push(t);
    was = port.state; pair = null; blows = [];
  };
  bout = createBout({ left: job.left, right: job.right,
    leftMind: policyMind(job.left, job.seeds[0]), rightMind: policyMind(job.right, job.seeds[1]),
    seeds: job.seeds, leftGolem: setup, rightGolem: setup, maxSeconds: PROTOCOL.maxSeconds, settleSeconds: PROTOCOL.settleSeconds,
    locomotionMode: PROTOCOL.locomotionMode, physics: await freshHavok(), onSample: () => sample() });
  const port = bout[idleSide].locomotion;
  const note = port.notePairPush.bind(port);
  port.notePairPush = (push) => { pair = push; note(push); };
  const queue = port.staged.queueStabilityEvent.bind(port.staged);
  port.staged.queueStabilityEvent = (event) => { blows.push(event); queue(event); };
  let result;
  try {
    while (bout.step()) { /* sampled per substep */ }
    result = bout.finish();
  } finally { bout.dispose(); }
  const stride = Math.max(1, Math.round(every / dt));
  const windows = falls.map((at) => {
    const rows = trace.filter((r) => r.t > at - before && r.t <= at + 2 * dt);
    return { at, rows: rows.filter((_, i) => i % stride === 0 || i === rows.length - 1) };
  });
  const standing = trace.filter((r) => r.state === "supported" && r.t > 1);
  return { job, falls, seconds: result.seconds, winner: result.winner, windows,
    standingComToward: { min: Math.min(...standing.map((r) => r.comToward)), max: Math.max(...standing.map((r) => r.comToward)) } };
}

/**
 * The diagnosis as a count: `pairs` idle-felled bouts (the idle body on the left, seeds as
 * `idleFelledJobs`), played one after another in this realm, at a waist lean ceiling `leanScale`
 * times the shipped one. Per fall, how far the head had gone back from the pelvis (away from the
 * attacker) and down, and what the ledger was handed in the half second before.
 */
export async function idleTraceCheck(pairs, leanScale = 1, attacker = "golem-brawler") {
  const bouts = [];
  for (let k = 0; k < pairs; k += 1) {
    const r = await idleFelledTrace(k, "left", attacker, { leanScale, before: 0.5, every: 1 / CONFIG.world.physicsHz });
    const falls = r.windows.map((w) => {
      const last = w.rows.at(-1);
      const first = w.rows[0];
      return { at: w.at, headBackM: -(last.parts.head.toward - last.parts.pelvis.toward), headDropM: first.parts.head.y - last.parts.head.y,
        comToward: last.comToward, inContact: w.rows.some((x) => x.pair), blowMps: w.rows.reduce((a, x) => a + x.blowMps, 0) };
    });
    bouts.push({ k, seconds: r.seconds, winner: r.winner, falls, standingComToward: r.standingComToward });
    console.log(`k ${k}: ${falls.length} falls in ${r.seconds.toFixed(1)} s; head back ${falls.map((f) => f.headBackM.toFixed(2)).join(" ")}`);
  }
  const falls = bouts.flatMap((b) => b.falls);
  const seconds = bouts.reduce((a, b) => a + b.seconds, 0);
  return { harness: "Node bout runner (createBout, research PROTOCOL), idle stone default against a golem-brawler on the stone default",
    leanScale, leanTorque: TORSO_WAIST.leanTorque * leanScale, bouts, falls: falls.length, seconds, fallsPerMinute: (60 * falls.length) / seconds,
    inContact: falls.filter((f) => f.inContact).length, headBackMedian: quantile(falls.map((f) => f.headBackM), 0.5),
    blowMedian: quantile(falls.map((f) => f.blowMps), 0.5), idleWins: bouts.filter((b) => b.winner === "left").length };
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({ options: {
    check: { type: "string" }, builds: { type: "string" }, modules: { type: "string" }, angles: { type: "string" },
    pairs: { type: "string", default: "16" }, lanes: { type: "string", default: "8" }, out: { type: "string" },
    attacker: { type: "string", default: "golem-brawler" }, "lean-scale": { type: "string", default: "1" },
  } });
  const dir = resolve(values.out ?? join("research", "runs", "leverage"));
  mkdirSync(dir, { recursive: true });
  const builds = values.builds ? values.builds.split(",") : ["default", "skeleton-warrior", "human-warrior", "multileg", "wheel", "maul"];
  let result;
  if (values.check === "balance") result = await balanceCheck(builds);
  else if (values.check === "commitment") result = await commitmentCheck(builds);
  else if (values.check === "precision") result = await precisionCheck(values.builds ? builds : ["default", "skeleton-warrior", "human-warrior", "plated"]);
  else if (values.check === "deflection") {
    result = await deflectionCheck(values.modules ? values.modules.split(",")
      : ["effector.wrist.blade", "effector.wrist.mace", "effector.wrist.maul", "effector.anatomical.blade"],
    values.angles ? values.angles.split(",").map(Number) : undefined);
  } else if (values.check === "idle-felled") {
    const runDir = join(dir, `idle-felled-${values.attacker}`);
    const jobs = idleFelledJobs(Number(values.pairs), values.attacker);
    const manifest = { version: 1, kind: "fall-loop", protocol: { maxSeconds: PROTOCOL.maxSeconds, settleSeconds: PROTOCOL.settleSeconds,
      locomotionMode: PROTOCOL.locomotionMode }, builds: [{ name: "default", setup: auditBuild("default").setup }] };
    const rows = await runJobs(runDir, manifest, jobs, { workers: Number(values.lanes), jobLimitMs: 20 * 60000,
      workerUrl: new URL("./fall-loop-worker.mjs", import.meta.url),
      onProgress: (p) => console.log(`${p.done}/${p.total} in ${p.elapsedSeconds.toFixed(0)} s, ${p.failures} failed`) });
    result = idleFelledSummary(rows.length ? rows : readResults(runDir));
    console.log(JSON.stringify(result, null, 1));
  } else if (values.check === "idle-trace") {
    result = await idleTraceCheck(Number(values.pairs), Number(values["lean-scale"]), values.attacker);
  } else throw new Error("--check is one of balance, commitment, precision, deflection, idle-felled, idle-trace");
  const name = values.check === "idle-felled" ? `idle-felled-${values.attacker}`
    : values.check === "idle-trace" ? `idle-trace-lean${values["lean-scale"]}` : values.check;
  writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(result, (k, v) => (v === Infinity ? "Infinity" : v), 2)}\n`);
  if (values.check === "precision") printPrecision(result);
}

function printPrecision(result) {
  for (const s of result.strikers) console.log(`${s.name}: ${s.kind} (${s.how}), effective ${s.effectiveKg.toFixed(2)} kg, body ${s.bodyKg.toFixed(2)} kg`);
  for (const t of result.targets) {
    console.log(`\n${t.target}: bar per kJ of striker kinetic energy (${t.keJ} J a blow)`);
    const bySt = new Map();
    for (const p of t.priced) {
      const key = `${p.striker}@${p.along}`;
      if (!bySt.has(key)) bySt.set(key, []);
      bySt.get(key).push(p);
    }
    for (const [key, list] of bySt) {
      const sorted = [...list].sort((a, b) => b.barPerKJ - a.barPerKJ);
      const best = sorted[0], worst = sorted[sorted.length - 1];
      const fatal = list.filter((p) => p.fatal).map((p) => `${p.part} ${p.blowsToEmpty.toFixed(1)} blows`).join(", ");
      console.log(`  ${key.padEnd(10)} best ${best.part} ${best.barPerKJ.toFixed(4)}  worst ${worst.part} ${worst.barPerKJ.toFixed(4)}  ratio ${(best.barPerKJ / Math.max(worst.barPerKJ, 1e-12)).toFixed(1)}  fatal: ${fatal}`);
    }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href) {
  await main();
}
