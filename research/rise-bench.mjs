/**
 * The rise, measured: a standing body knocked down by a shove and watched while it gets up and for
 * three seconds after (2026-09-25, `docs/analysis/2026-09-25-falls-and-rise.md`).
 *
 *     node research/rise-bench.mjs --builds default,skeleton-warrior,human-warrior --pushes back,front,side
 *
 * Node headless arena (`tests/harness/golem-headless-arena.mjs`), a supported pair six metres apart,
 * the knocked body's mind idle or walking; the shove is queued on the ledger as `golem-knockdown`'s
 * is, at twice the fall line along the push. Every reading is off `mesh.position` and
 * `mesh.rotationQuaternion`.
 *
 * **What it reads, per rise** -- the proxies for "a person getting up" against "a marionette pulled up
 * by the shoulders":
 *
 * - `hip50`, `shoulder50` (s into the rise): when the pelvis and the shoulders have made half their
 *   height gain. A person's hips come up with or before the shoulders -- the legs extend under a trunk
 *   pitched forward and the trunk rises last -- so `shoulder50 - hip50 >= 0`. Pulled up by the
 *   shoulders, the shoulders lead.
 * - `plantedBeforeLift` (s): how long both soles had been on the floor, still and within 0.25 m of
 *   under the hips, when the pelvis began its last 0.2 m; `plantedThroughLift`, the share of that last
 *   0.2 m they stayed so.
 * - `pitchPeak`, `pitchAt50`, `pitchAt90` (rad, + forward): the trunk's pitch through the rise.
 * - `comOverFeet` (share of the rise's second half): the centre of mass's ground point inside the
 *   hull of the two soles' patches -- the feet, not the stance the ledger remembers.
 * - `armHang` (m): the hands' mean drop below the shoulders over the rise.
 * - `after`: over the three seconds after standing, the least COM margin over the stance, the share
 *   of time outside it, and the sole-to-hip offset.
 */
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CONFIG } from "../src/config.ts";
import { stepPair } from "../src/fighter.ts";
import { Golem } from "../src/golem/golem.ts";
import { idleMind } from "../src/mind.ts";
import { blankIntent } from "../src/policies.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { convexHull } from "../src/tipping.ts";
import { createHeadlessArena } from "../tests/harness/golem-headless-arena.mjs";
Logger.LogLevels = Logger.ErrorLogLevel;

const FIXED = 1 / CONFIG.world.physicsHz;

/** Signed distance from the origin to a hull's boundary, m; negative outside. */
function margin(hull) {
  if (!hull || hull.length < 3) return null;
  let m = Infinity;
  for (let i = 0; i < hull.length; i += 1) {
    const [ax, az] = hull[i];
    const [bx, bz] = hull[(i + 1) % hull.length];
    const l = Math.hypot(bx - ax, bz - az);
    if (l > 0) m = Math.min(m, ((bz - az) * ax - (bx - ax) * az) / l);
  }
  return Number.isFinite(m) ? m : null;
}

/** A mind that walks forward (`walk` > 0) once the body is standing, and is otherwise idle. */
function walkingMind(walk) {
  const idle = idleMind();
  const intent = blankIntent();
  return { name: "walker", decide: (view, dt) => {
    const base = idle.decide(view, dt);
    Object.assign(intent, base, { forward: view.self.support === "supported" ? walk : 0 });
    return intent;
  } };
}

const PUSHES = { back: [0, -1], front: [0, 1], side: [1, 0] };

/**
 * One knockdown on build `setup`, pushed along `push` (in the body's frame: `back` knocks it on its
 * back), watched `seconds` after the shove.
 */
export async function riseBench(setup, { push = "back", walk = 0, seconds = 9, trace = false, knockMps = 1.5 } = {}) {
  const arena = await createHeadlessArena();
  const { scene } = arena;
  const world = flatSupportedWorldRegistry();
  const pair = ["left", "right"].map((side, i) => new Golem(scene, {
    side, origin: new Vector3(0, 0, i * 6), facing: i * Math.PI, setup,
    mind: i === 0 && walk ? walkingMind(walk) : idleMind(), controlPolicies: [], locomotionWorld: world,
  }));
  const golem = pair[0];
  const port = golem.locomotion;
  const limb = (suffix) => golem.limbs.find((l) => l.key.endsWith(suffix))?.part ?? null;
  const pelvis = limb("legs.pelvis");
  const core = limb("trunk.core");
  const feet = [limb("legs.footL"), limb("legs.footR")];
  const shoulders = golem.limbs.filter((l) => /\.(primary|secondary)\.(collar|upper)$/.test(l.key)).map((l) => l.part);
  const hands = golem.limbs.filter((l) => /\.(primary|secondary)\.(wrist|hand)$/.test(l.key)).map((l) => l.part);
  let clock = 0;
  const control = scene.onBeforePhysicsObservable.add(() => { stepPair(...pair, FIXED, clock); clock += FIXED; });
  const rows = [];
  const lastSole = [null, null];
  // The ledger's shove moves no body: the release turns the body into a ragdoll standing where it
  // stood, and a limp body balanced on two flat feet can stand there. The physical half of the blow
  // goes to the trunk on the step the body is released.
  let knock = null;
  const sample = scene.onAfterPhysicsObservable.add(() => {
    if (knock && port.state === "fallen") {
      core.body.applyImpulse(knock, core.mesh.position.clone());
      knock = null;
    }
    const md = port.options.massDistribution();
    const q = core.mesh.rotationQuaternion;
    // The trunk's up axis: (0, 1, 0) turned by the quaternion.
    const upX = 2 * (q.x * q.y - q.w * q.z), upY = 1 - 2 * (q.x * q.x + q.z * q.z), upZ = 2 * (q.y * q.z + q.w * q.x);
    const yaw = port.carrier.state.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const patches = port.options.supportBindings.flatMap((b) => port.options.supportPatch(b) ?? []);
    const floor = Math.min(...port.options.groundContacts().map((p) => p.y), ...patches.map((p) => p.y));
    const planted = feet.map((foot, i) => {
      const p = foot.mesh.position;
      const speed = lastSole[i] ? Math.hypot(p.x - lastSole[i].x, p.y - lastSole[i].y, p.z - lastSole[i].z) / FIXED : Infinity;
      lastSole[i] = p.clone();
      const patch = port.options.supportPatch(port.options.supportBindings[i]) ?? [];
      const low = Math.min(...patch.map((c) => c.y));
      return low - floor < 0.03 && speed < 0.25;
    });
    const soleMid = feet.reduce((a, f) => a.addInPlace(f.mesh.position), new Vector3()).scale(0.5);
    const feetHull = convexHull(patches.map((c) => [c.x - md.x, c.z - md.z]));
    const stance = port.tipping?.hull ?? null;
    rows.push({ t: clock, state: port.state, pelvisY: pelvis.mesh.position.y,
      shoulderY: shoulders.reduce((a, s) => a + s.mesh.position.y, 0) / shoulders.length,
      handDrop: shoulders.reduce((a, s) => a + s.mesh.position.y, 0) / shoulders.length
        - hands.reduce((a, s) => a + s.mesh.position.y, 0) / hands.length,
      pitch: Math.atan2(upX * fx + upZ * fz, upY), tilt: Math.acos(Math.max(-1, Math.min(1, upY))),
      pelvisPitch: (() => {
        const p = pelvis.mesh.rotationQuaternion;
        const x = 2 * (p.x * p.y - p.w * p.z), y = 1 - 2 * (p.x * p.x + p.z * p.z), z = 2 * (p.y * p.z + p.w * p.x);
        return Math.atan2(x * fx + z * fz, y);
      })(),
      bothPlanted: planted.every(Boolean),
      feetUnderHips: Math.hypot(soleMid.x - pelvis.mesh.position.x, soleMid.z - pelvis.mesh.position.z),
      feetMargin: margin(feetHull), stanceMargin: stance ? margin(stance) : null, comY: md.y - floor });
  });
  const run = (s) => { const end = clock + s; while (clock < end) { scene._renderId += 1; scene._advancePhysicsEngineStep(1000 / 60); } };
  try {
    run(2);
    rows.length = 0;
    const [px, pz] = PUSHES[push];
    const yaw = port.carrier.state.yaw;
    // The body's frame to the world's: +z forward.
    const wx = pz * Math.sin(yaw) + px * Math.cos(yaw), wz = pz * Math.cos(yaw) - px * Math.sin(yaw);
    const massKg = port.supportedMassKg;
    const line = port.stabilityLinesAlong(wx, wz).fallAtMps;
    golem.queueStabilityEvent({ horizontalShoveNs: [wx * line * massKg * 2, wz * line * massKg * 2] });
    knock = new Vector3(wx, 0, wz).scale(massKg * knockMps);
    run(seconds);
  } finally {
    scene.onBeforePhysicsObservable.remove(control);
    scene.onAfterPhysicsObservable.remove(sample);
    for (const g of pair) g.dispose();
    arena.dispose();
  }
  return { rises: readRises(rows), trace: trace ? rows : null, fell: rows.some((r) => r.state === "fallen") };
}

/** The proxies of every rise in a trace. */
export function readRises(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].state !== "rising" || (i > 0 && rows[i - 1].state === "rising")) continue;
    let j = i;
    while (j < rows.length && rows[j].state === "rising") j += 1;
    const rise = rows.slice(i, j);
    const outcome = j < rows.length ? rows[j].state : "cut";
    const t0 = rise[0].t;
    const gain = (key) => {
      const a = rise[0][key], b = rise.at(-1)[key];
      const at = (share) => rise.find((r) => (r[key] - a) >= share * (b - a))?.t - t0;
      return { from: a, to: b, at25: at(0.25), at50: at(0.5), at90: at(0.9) };
    };
    const hip = gain("pelvisY"), shoulder = gain("shoulderY");
    // The lift that stands the body up: the pelvis's last 0.2 m, which is inside every biped's
    // extension from its squat (0.225 to 0.247 m) and the whole of a lift that has none.
    const step = rise[1] ? rise[1].t - rise[0].t : 0;
    const liftFrom = rise.findIndex((r) => r.pelvisY >= hip.to - 0.2);
    const under = (r) => r.bothPlanted && r.feetUnderHips < 0.25;
    let planted = 0;
    for (let k = liftFrom; k >= 0 && under(rise[k]); k -= 1) planted += step;
    const lift = liftFrom >= 0 ? rise.slice(liftFrom) : [];
    const plantedThroughLift = lift.length ? lift.filter(under).length / lift.length : 0;
    const second = rise.slice(Math.floor(rise.length / 2));
    const pitchAt = (share) => rise.find((r) => (r.pelvisY - hip.from) >= share * (hip.to - hip.from))?.pitch;
    const after = rows.slice(j).filter((r) => r.t - rows[j - 1].t <= 3);
    const standing = after.filter((r) => r.state === "supported" || r.state === "staggered");
    out.push({
      outcome, durationS: rise.at(-1).t - t0 + (rise[1]?.t - rise[0].t || 0),
      hip50: hip.at50, shoulder50: shoulder.at50, hip90: hip.at90, shoulder90: shoulder.at90,
      lead50: shoulder.at50 - hip.at50, lead90: shoulder.at90 - hip.at90,
      plantedBeforeLift: planted, plantedThroughLift,
      pitchPeak: Math.max(...rise.map((r) => r.pitch)), pitchAt50: pitchAt(0.5), pitchAt90: pitchAt(0.9),
      pitchEnd: rise.at(-1).pitch,
      comOverFeet: second.filter((r) => r.feetMargin !== null && r.feetMargin >= 0).length / second.length,
      feetUnderHipsEnd: rise.at(-1).feetUnderHips,
      armHang: rise.reduce((a, r) => a + r.handDrop, 0) / rise.length,
      armHangStanding: after.length ? after.reduce((a, r) => a + r.handDrop, 0) / after.length : null,
      after: {
        refell: after.some((r) => r.state === "fallen"),
        minStanceMargin: Math.min(...standing.map((r) => r.stanceMargin ?? Infinity)),
        outsideShare: standing.filter((r) => r.stanceMargin !== null && r.stanceMargin < 0).length / Math.max(1, standing.length),
        feetUnderHipsMax: Math.max(...standing.map((r) => r.feetUnderHips)),
      },
    });
  }
  return out;
}

async function main() {
  const { values } = parseArgs({ options: {
    builds: { type: "string", default: "default,skeleton-warrior,human-warrior" },
    pushes: { type: "string", default: "back,front,side" }, walk: { type: "string", default: "0" },
    trace: { type: "string" },
    /** JSON merged over every biped family's `rise` table, for a sweep. */
    rise: { type: "string" },
    /** JSON keyed by family ("stone", "skeleton", "human"), merged over that family's biped table. */
    table: { type: "string" },
  } });
  const { PLAYABLE_BUILDS } = await import("../src/golem/roster.ts");
  if (values.table) {
    const override = JSON.parse(values.table);
    const [{ LOCOMOTION_BIPED }, { SKELETON_BIPED }, { HUMAN_BIPED }] = await Promise.all([
      import("../src/golem/config.ts"), import("../src/golem/skeleton/body.ts"), import("../src/golem/humanoid/body.ts")]);
    Object.assign(SKELETON_BIPED, override.skeleton ?? {});
    Object.assign(HUMAN_BIPED, override.human ?? {});
    Object.assign(LOCOMOTION_BIPED, override.stone ?? {});
  }
  if (values.rise) {
    const override = JSON.parse(values.rise);
    const [{ LOCOMOTION_BIPED }, { SKELETON_BIPED }, { HUMAN_BIPED }] = await Promise.all([
      import("../src/golem/config.ts"), import("../src/golem/skeleton/body.ts"), import("../src/golem/humanoid/body.ts")]);
    for (const table of [LOCOMOTION_BIPED, SKELETON_BIPED, HUMAN_BIPED]) {
      if (table.rise) table.rise = Object.freeze({ ...table.rise, ...(override[table === SKELETON_BIPED ? "skeleton" : table === HUMAN_BIPED ? "human" : "stone"] ?? override) });
    }
  }
  const f = (x, d = 2) => (x === undefined || x === null || !Number.isFinite(x) ? "-" : x.toFixed(d));
  console.log("| build | push | outcome | T s | hip/shoulder 50 % s | hip/shoulder 90 % s | planted before lift s | planted through lift | trunk pitch peak/50/90/end rad | COM over feet | feet-hip end m | arm hang m | after: refell, min margin mm, outside, feet-hip max m |");
  console.log("|---|---|---|---:|---|---|---:|---:|---|---:|---:|---:|---|");
  for (const name of values.builds.split(",")) {
    const setup = PLAYABLE_BUILDS.find((b) => b.name === name).setup;
    for (const push of values.pushes.split(",")) {
      const result = await riseBench(setup, { push, walk: Number(values.walk), trace: values.trace !== undefined });
      if (values.trace) {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(`${values.trace}-${name}-${push}.json`, JSON.stringify(result.trace));
      }
      for (const r of result.rises) {
        console.log(`| ${name} | ${push} | ${r.outcome} | ${f(r.durationS)} | ${f(r.hip50)} / ${f(r.shoulder50)} | ${f(r.hip90)} / ${f(r.shoulder90)} | ${f(r.plantedBeforeLift)} | ${f(r.plantedThroughLift)} | ${f(r.pitchPeak)} / ${f(r.pitchAt50)} / ${f(r.pitchAt90)} / ${f(r.pitchEnd)} | ${f(r.comOverFeet)} | ${f(r.feetUnderHipsEnd)} | ${f(r.armHang)} | ${r.after.refell}, ${f(1000 * r.after.minStanceMargin, 0)}, ${f(r.after.outsideShare)}, ${f(r.after.feetUnderHipsMax)} |`);
      }
      if (!result.rises.length) console.log(`| ${name} | ${push} | no rise |`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
