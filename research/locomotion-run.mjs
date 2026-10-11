/**
 * **The locomotion test bed on the Node stand** (Rapier, 120 Hz): the Lab's Run (`startRun`,
 * `src/lab/run-mode.ts`) on every combination of body, track, pace asked, wind and seed, each run
 * for `--seconds` or until the body falls. A fall ends a run as a failure.
 *
 *   node research/locomotion-run.mjs [--models workshop-fighter,workshop-rogue] [--tracks square,circle,forward,right,back,left]
 *     [--paces 0.5,1,1.5] [--winds 0:0,1:50] [--seeds 1,2] [--seconds 30] [--side 6] [--radius 4]
 *     [--legs '{"kind":"stance-walk"}'] [--stance '{...}'] [--physique '{"strength":2}'] [--sole] [--workers 16] [--out runs.jsonl]
 *
 * - The tracks are the Run's, or a straight line walked facing +z in one direction (`LINES`).
 * - `--winds` is a list of rate:strength (gusts a second : N at a gust's peak).
 * - `--legs` is the mind's locomotion part (`FighterConfig.locomotion`); the rest of the mind is
 *   the Lab's Script preset (`LAB_PRESETS`).
 * - Each body is built as one being measured (`BodyOptions.measuring`): no envelope caps its walk.
 * - `--stance` is an experiment's stance tuning (`StanceTuning`). Its `gait` merges into `STANCE_GAIT`.
 * - `--sole` builds the body shod (`withSoles`): each foot gives as a shoe's sole against the ground.
 * - `--physique` builds the body with a physique (`Physique`: its strength and speed scale the
 *   muscles), as a probe of whether the body or the controller caps a walk.
 *
 * Each run's record goes to `--out` as a line of JSON if asked. The summary, per body, track and
 * wind: at each pace, the runs that fell (and on which piece of the track), the mean speed along the
 * track and each side's, what the feet did, the share of steps the soles could not give what the
 * stance asked (`StanceReading.shortfall`), the legs' demand (the share of steps a hip, knee and
 * ankle channel was at full activation, and the most of its peak torque it gave), the way each fall
 * went in the body's frame over its last half second and the stance's phases then; and the fastest
 * pace at which no seed fell, with every slower one.
 *
 * Its second line at each pace reads the steps: each swing's landing (where the sole's middle was as
 * the swing's time ran out, against where it was last sent, forward and to the right in the body's
 * frame, and how high off the ground; and the capture point then against where the step asked it),
 * the friction the ground was asked for (the centre of mass's horizontal over vertical ground force,
 * from its acceleration over `FRICTION_WINDOW` steps, on one foot and on two: a lower bound of a sole's
 * on two, with no wind taken off), the shortfall by component (force, pitch, roll and yaw in the
 * body's frame: the share of steps over `MISSED`, and its mean size) and by phase (standing, shifting,
 * the first and second half of a swing), and the
 * step and cadence beside a person's at the speed walked (`personStep`).
 *
 * Runs go in parallel on worker threads, one stand at a time in each.
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { appendFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { PERSON_PACE, personStep } from "../src/core/human/gait.ts";

/**
 * The straight lines a body walks facing +z, each 80 m from the origin: forward, to its right, back
 * and to its left. One direction a run, where the square turns from one to the next.
 */
const LINES = { forward: 0, right: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 };

/** What a person walks each line at (`PERSON_PACE`): forward, their comfortable and fastest walk. */
const TARGETS = { forward: [PERSON_PACE.forward, PERSON_PACE.fast], right: [PERSON_PACE.sideways], back: [PERSON_PACE.back], left: [PERSON_PACE.sideways] };

/** Steps the friction asked is read over: the centre of mass's acceleration, from its velocity this many steps apart. */
const FRICTION_WINDOW = 4;

/** A shortfall that counts, N and N m: what the stance asks and the soles miss by more. */
const MISSED = 1;

/** The ground's side, m: twice the longest line, and some. */
const GROUND = 200;

/** One run: its record, as the run's last frame left it. */
async function runOnce({ model, track: id, pace, wind, seed, seconds, side, radius, legs, stance, physique, sole }) {
  const [{ withSoles }, { modelSpec }, { labActor }, { startRun }, { TRACKS, trackOf }, { LAB_PRESETS }, { STANCE_GAIT }, { coreStand }] = await Promise.all([
    import("../src/core/human/sole.ts"), import("../src/core/models.ts"), import("../src/lab/actor.ts"), import("../src/lab/run-mode.ts"), import("../src/lab/track.ts"),
    import("../src/lab/scenarios.ts"), import("../src/core/control/stance-tuning.ts"), import("../tests/harness/core-stand.mjs"),
  ]);
  const line = LINES[id];
  const info = line === undefined ? TRACKS[id] : { pieces: [{ kind: "corner", metres: 0, turn: line }, { kind: "straight", metres: 80 }], facing: 0 };
  const size = id === "square" ? side : id === "circle" ? radius : undefined;
  const track = trackOf(info.size && size !== undefined ? info.size.of(size) : info.pieces);
  // The ground reaches past the end of every track: a body walking off its edge falls through.
  const spec = modelSpec(model, physique ?? undefined);
  const stand = await coreStand(sole ? withSoles(spec) : spec, { ground: true, groundSize: GROUND });
  const mind = { ...LAB_PRESETS.script.config, ...(legs ? { locomotion: legs } : {}) };
  const tuning = stance ? { ...stance, ...(stance.gait ? { gait: { ...STANCE_GAIT, ...stance.gait } } : {}) } : undefined;
  const run = startRun(labActor(stand.built, stand.world, { mind, stance: tuning, measuring: true }), track, { top: pace, facing: info.facing, wind: { settings: wind, seed } });
  let frame = run.frame(), off = 0, fellOn = null;
  // The legs' demand: per joint (hip, knee, ankle), the share of control steps a channel of it was
  // at full activation, and the most of its peak torque it delivered. The fall: its phase, and the
  // way the centre of mass went in the body's frame (forward, right) half a second before it.
  const muscles = run.body.muscles, limbs = muscles.channels.flatMap((c, i) => {
    const joint = ["hip", "knee", "ankle"].find((j) => c.name.startsWith(`${j}.`));
    return joint ? [{ joint, i, peak: Math.max(c.positive.peak, c.negative.peak) }] : [];
  });
  const demand = Object.fromEntries(["hip", "knee", "ankle"].map((j) => [j, { full: 0, most: 0 }]));
  const trail = [];
  let steps = 0, shortfall = 0;
  // The steps' readings: landings, the friction asked, the shortfall by phase and component.
  const stanceState = run.body.state.mind.host.motor.stance, g = -stand.built.physics.gravity[1];
  const mass = [...stand.built.segments.values()].reduce((sum, s) => sum + s.rigid.mass, 0);
  const landings = [], velocities = [], friction = { one: [], two: [] };
  const PHASES = ["stand", "shift", "early", "late"], PARTS = ["force", "pitch", "roll", "yaw"];
  const missed = Object.fromEntries(PHASES.map((p) => [p, { steps: 0, ...Object.fromEntries(PARTS.map((c) => [c, 0])), size: Object.fromEntries(PARTS.map((c) => [c, 0])) }]));
  let swinging = null;
  const hook = stand.world.afterStep((dt) => {
    steps++;
    {
      const r = run.body.view.stance, swing = stanceState.step.swing, h = r.facing, sh = Math.sin(h), ch = Math.cos(h);
      const ahead = (x, z) => x * sh + z * ch, right = (x, z) => x * ch - z * sh;
      if (r.phase === "swing" && swing) swinging = swing;
      else if (swinging && r.phase !== "swing") {
        const sole = r.soles[swinging.foot], other = r.soles[swinging.foot === "left" ? "right" : "left"];
        const dx = sole.x - swinging.to[0], dz = sole.z - swinging.to[1], w = Math.sqrt(g / Math.max(r.plan.y, 0.1));
        const cx = r.centre.x + r.velocity.x / w - (swinging.capture?.[0] ?? NaN), cz = r.centre.z + r.velocity.z / w - (swinging.capture?.[1] ?? NaN);
        landings.push({ ahead: ahead(dx, dz), right: right(dx, dz) * (swinging.foot === "right" ? 1 : -1), up: sole.y - other.y,
          capture: Number.isFinite(cx) ? { ahead: ahead(cx, cz), out: right(cx, cz) * (swinging.foot === "right" ? 1 : -1) } : null });
        swinging = null;
      }
      velocities.push([r.velocity.x, r.velocity.y, r.velocity.z]);
      if (velocities.length > FRICTION_WINDOW + 1) velocities.shift();
      if (velocities.length === FRICTION_WINDOW + 1 && !run.body.view.down) {
        const a = velocities[FRICTION_WINDOW], b = velocities[0], k = 1 / (FRICTION_WINDOW * dt);
        const across = Math.hypot(a[0] - b[0], a[2] - b[2]) * k, up = (a[1] - b[1]) * k + g;
        if (up > 0.2 * g) friction[r.phase === "swing" ? "one" : "two"].push(across / up);
      }
      const phase = r.phase === "swing" ? (swing && stanceState.step.time < swing.seconds / 2 ? "early" : "late") : r.phase;
      const m = r.shortfall.moment, row = missed[phase];
      row.steps++;
      const parts = { force: r.shortfall.force.length(), pitch: Math.abs(m.x * ch - m.z * sh), roll: Math.abs(m.x * sh + m.z * ch), yaw: Math.abs(m.y) };
      for (const c of PARTS) { if (parts[c] > MISSED) row[c]++; row.size[c] += parts[c]; }
    }
    const full = new Set();
    for (const { joint, i, peak } of limbs) {
      if (muscles.activation[i] >= 0.99) full.add(joint);
      demand[joint].most = Math.max(demand[joint].most, Math.abs(muscles.pulled[i]) / peak);
    }
    for (const joint of full) demand[joint].full++;
    const r = run.body.view.stance;
    if (r.shortfall.force.length() > 1) shortfall++;
    trail.push({ time: stand.world.time, phase: r.phase, c: [r.centre.x, r.centre.z], heading: r.facing });
    if (trail.length > 120) trail.shift();
  });
  let fall = null;
  try {
    while (frame.time < seconds && !frame.fallen) {
      stand.step(stand.seconds(0.1));
      frame = run.frame();
      if (frame.time > 1) off = Math.max(off, frame.off);
    }
    if (frame.fallen) {
      fellOn = track.piece(frame.along);
      // Where the centre went over the last half second before the fall, in the body's frame then.
      const end = trail[trail.length - 1], from = trail[Math.max(0, trail.length - 61)];
      const dx = end.c[0] - from.c[0], dz = end.c[1] - from.c[1], h = from.heading;
      const phases = [...new Set(trail.slice(-61).map((t) => t.phase))];
      fall = { forward: +(dx * Math.sin(h) + dz * Math.cos(h)).toFixed(2), right: +(dx * Math.cos(h) - dz * Math.sin(h)).toFixed(2), phases };
    }
  } finally { hook.dispose(); run.dispose(); stand.dispose(); }
  return {
    model, track: id, pace, wind, seed, fell: frame.fallen ? +frame.time.toFixed(2) : null, fellOn,
    travelled: +frame.travelled.toFixed(3), mean: +frame.mean.toFixed(3), walking: frame.walking, off: +off.toFixed(3),
    pieces: frame.pieces.map((v) => v === null ? null : +v.toFixed(3)), gait: Object.fromEntries(Object.entries(frame.gait).map(([k, v]) => [k, +v.toFixed(3)])),
    gusts: frame.gusts, fall, shortfall: +(shortfall / steps).toFixed(3),
    landing: summarizeLandings(landings), friction: { one: summarizeFriction(friction.one), two: summarizeFriction(friction.two) },
    missed: Object.fromEntries(PHASES.map((p) => [p, { share: +(missed[p].steps / steps).toFixed(3),
      ...Object.fromEntries(PARTS.map((c) => [c, missed[p].steps ? +(missed[p][c] / missed[p].steps).toFixed(3) : 0])),
      size: Object.fromEntries(PARTS.map((c) => [c, missed[p].steps ? +(missed[p].size[c] / missed[p].steps).toFixed(1) : 0])) }])),
    demand: Object.fromEntries(Object.entries(demand).map(([j, d]) => [j, { full: +(d.full / steps).toFixed(3), most: +d.most.toFixed(2) }])),
  };
}

/** Landings' means: the error forward and outward (the foot's own side), its absolute size, the sole's height, and the capture point's error. */
function summarizeLandings(landings) {
  const settled = landings.slice(2), n = settled.length, mean = (f) => n ? +(settled.reduce((s, l) => s + f(l), 0) / n).toFixed(3) : null;
  const captured = settled.filter((l) => l.capture), m = captured.length;
  return { n, ahead: mean((l) => l.ahead), out: mean((l) => l.right), size: mean((l) => Math.hypot(l.ahead, l.right)), up: mean((l) => l.up),
    capture: m ? { ahead: +(captured.reduce((s, l) => s + l.capture.ahead, 0) / m).toFixed(3), out: +(captured.reduce((s, l) => s + l.capture.out, 0) / m).toFixed(3) } : null };
}

/** The friction asked: its median, its 95th percentile, and the share of steps over 0.4. */
function summarizeFriction(ratios) {
  if (!ratios.length) return { median: null, high: null, over: 0 };
  const sorted = [...ratios].sort((a, b) => a - b), at = (q) => +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(3);
  return { median: at(0.5), high: at(0.95), over: +(ratios.filter((r) => r > 0.4).length / ratios.length).toFixed(3) };
}

if (!isMainThread) {
  parentPort.on("message", async (job) => {
    try { parentPort.postMessage({ id: job.id, result: await runOnce(job) }); }
    catch (error) { parentPort.postMessage({ id: job.id, error: String(error?.stack ?? error) }); }
  });
} else {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
  const list = (name, fallback) => arg(name, fallback).split(",");
  const models = list("models", "workshop-fighter,workshop-rogue"), tracks = list("tracks", "square");
  const paces = list("paces", "0.5,0.7,1,1.4").map(Number), seeds = list("seeds", "1,2").map(Number);
  const winds = list("winds", "0:0").map((w) => { const [rate, strength] = w.split(":").map(Number); return { rate, strength }; });
  const seconds = Number(arg("seconds", "30")), side = Number(arg("side", "6")), radius = Number(arg("radius", "4"));
  const legs = arg("legs") ? JSON.parse(arg("legs")) : null, stance = arg("stance") ? JSON.parse(arg("stance")) : null;
  const physique = arg("physique") ? JSON.parse(arg("physique")) : null, sole = process.argv.includes("--sole");
  const out = arg("out"), workers = Math.min(Number(arg("workers", String(Math.max(1, availableParallelism() - 2)))), 64);

  const jobs = [];
  for (const model of models) for (const track of tracks) for (const wind of winds) for (const pace of paces) for (const seed of seeds)
    jobs.push({ id: jobs.length, model, track, pace, wind, seed, seconds, side, radius, legs, stance, physique, sole });
  // A calm wind blows the same on every seed: one seed is enough.
  const todo = jobs.filter((job) => job.wind.rate > 0 && job.wind.strength > 0 || job.seed === seeds[0]);
  const results = [];
  const started = Date.now();
  await new Promise((resolve, reject) => {
    let next = 0, done = 0;
    const pool = Array.from({ length: Math.min(workers, todo.length) }, () => new Worker(fileURLToPath(import.meta.url)));
    const feed = (worker) => { if (next < todo.length) worker.postMessage(todo[next++]); };
    for (const worker of pool) {
      worker.on("message", ({ result, error }) => {
        if (error) { reject(new Error(error)); return; }
        results.push(result);
        if (out) appendFileSync(out, `${JSON.stringify(result)}\n`);
        if (++done === todo.length) { pool.forEach((w) => w.terminate()); resolve(); } else feed(worker);
      });
      worker.on("error", reject);
      feed(worker);
    }
  });
  console.log(`${results.length} runs in ${((Date.now() - started) / 60000).toFixed(1)} min: Node stand, Rapier, 120 Hz, ${seconds} s, legs ${JSON.stringify(legs ?? "Script preset's")}${stance ? `, stance ${JSON.stringify(stance)}` : ""}${physique ? `, physique ${JSON.stringify(physique)}` : ""}${sole ? ", shod" : ""}`);
  for (const model of models) for (const track of tracks) for (const wind of winds) {
    console.log(`\n${model} ${track} wind ${wind.rate}/s ${wind.strength} N`);
    let held = null, holding = true;
    for (const pace of paces) {
      const rows = results.filter((r) => r.model === model && r.track === track && r.pace === pace && r.wind.rate === wind.rate && r.wind.strength === wind.strength);
      const fell = rows.filter((r) => r.fell !== null), mean = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
      const pieces = rows[0].pieces.map((_, i) => { const v = rows.map((r) => r.pieces[i]).filter((x) => x !== null); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : "-"; });
      const g = (k) => (rows.reduce((s, r) => s + r.gait[k], 0) / rows.length).toFixed(2);
      console.log(`  pace ${pace.toFixed(2)}: fell ${fell.length}/${rows.length}${fell.length ? ` (at ${fell.map((r) => `${r.fell}s piece ${r.fellOn}`).join(", ")})` : ""}`
        + ` walked ${rows[0].walking.toFixed(2)} mean ${mean("mean").toFixed(2)} sides ${pieces.join("/")} off ${mean("off").toFixed(2)}`
        + ` step ${g("step")} cadence ${g("cadence")} double ${g("double")} flight ${g("flight")}`
        + ` short ${(rows.reduce((s, r) => s + r.shortfall, 0) / rows.length).toFixed(2)}`
        + ` full ${["hip", "knee", "ankle"].map((j) => (rows.reduce((s, r) => s + r.demand[j].full, 0) / rows.length).toFixed(2)).join("/")}`
        + ` most ${["hip", "knee", "ankle"].map((j) => Math.max(...rows.map((r) => r.demand[j].most)).toFixed(2)).join("/")}`
        + (fell.length ? ` falls ${fell.map((r) => `f${r.fall.forward}/r${r.fall.right} ${r.fall.phases.join("+")}`).join(", ")}` : ""));
      const avg = (f) => { const v = rows.map(f).filter((x) => x !== null && x !== undefined); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : "-"; };
      const person = personStep(mean("mean"));
      console.log(`      landing ${avg((r) => r.landing.ahead)} ahead ${avg((r) => r.landing.out)} out |${avg((r) => r.landing.size)}| up ${avg((r) => r.landing.up)}`
        + ` capture ${avg((r) => r.landing.capture?.ahead)} ahead ${avg((r) => r.landing.capture?.out)} out`
        + ` friction one ${avg((r) => r.friction.one.median)}/${avg((r) => r.friction.one.high)} (${avg((r) => r.friction.one.over)} over 0.4)`
        + ` two ${avg((r) => r.friction.two.median)}/${avg((r) => r.friction.two.high)} (${avg((r) => r.friction.two.over)})`
        + ` missed F/P/R/Y ${["stand", "shift", "early", "late"].map((p) => `${p} ${avg((r) => r.missed[p].share)}: ${["force", "pitch", "roll", "yaw"].map((c) => avg((r) => r.missed[p][c])).join("/")} (${["force", "pitch", "roll", "yaw"].map((c) => avg((r) => r.missed[p].size[c])).join("/")})`).join(" ")}`
        + ` person step ${person.length.toFixed(2)} cadence ${person.rate.toFixed(2)}`);
      if (holding && fell.length === 0) held = { pace, mean: mean("mean") }; else holding = false;
    }
    const target = TARGETS[track];
    console.log(`  fastest held: ${held ? `asked ${held.pace}, ${held.mean.toFixed(2)} m/s along the track` : "none"}`
      + (target ? `; a person: ${target.map((q) => q.value.toFixed(2)).join(" to ")} m/s` : ""));
  }
}
