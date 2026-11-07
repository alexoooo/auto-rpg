import { constructionScope } from "../../../src/core/construction.ts";
import { workerJobs } from "../../worker-jobs.mjs";
import { footOn } from "../../../src/control/support.ts";
/**
 * **The stand-up's time budget** on the stand-up target (Node stand, core world, Rapier, 120 Hz):
 * what of the target's median is spent before and after the rise. Two readings:
 *
 * - The target's 240 falls under the game's Stand up (`risingJobs`, the falls
 *   `npm run evaluate -- rising-target` plays): each fall's lie when the body is first slow
 *   (centre of mass under 0.5 m/s and trunk spin under 1 rad/s, the brace's own test), when it
 *   first lands and first slows after takeover, the brace's length, and the hand-back: from the end
 *   of the rise's last stage to verified standing (`STAND_CHECK`).
 * - The stance alone from the placed squat (the Warrior's stored `squat`, its angles put on each
 *   body), seeds 1 to 8, to the same verification.
 *
 *   node research/skills/recovery/rising-budget.mjs [--workers 12] [--out <rows.json>]
 */
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

/** The lies a reading names; the rest are postures off the ground's flat. */
const LIES = new Set(["back", "front", "left", "right"]);

/** One target fall, probed each step; the record's own reading alongside. */
async function targetFall(job) {
  const { risingTrial } = await import("../../../src/app/node/evaluation.ts");
  const { commandsBody } = await import("../../../src/control/body.ts");
  const { loadoutKey } = await import("../../../src/core/bodies/items/held.ts");
  const probe = { takeover: null, landed: null, slow: null, lie: null };
  const r = await risingTrial(job, { stop(world, _built, actor) {
    const body = actor.body, g = body.view.ground;
    if (probe.takeover === null && !commandsBody(body) && body.has !== "nobody") probe.takeover = world.time;
    if (probe.takeover === null || !g) return false;
    if (probe.landed === null && LIES.has(g.raw)) probe.landed = world.time - probe.takeover;
    if (probe.slow === null && g.velocity.lengthSquared() <= .25 && g.spin <= 1) { probe.slow = world.time - probe.takeover; probe.lie = g.lie; }
    return false;
  } });
  const trail = r.trail ?? [], verifiedAt = r.stood ? r.takeover + r.verified : null;
  let execute = null, riseEnd = null;
  for (let i = 0; i < trail.length; i++) {
    const entry = trail[i], next = trail[i + 1];
    if (execute === null && entry.mode === "execute") execute = entry.at;
    if (verifiedAt !== null && entry.at <= verifiedAt && entry.phase === "rise" && next && next.phase !== "rise") riseEnd = next.at;
  }
  return { reading: "fall", model: job.model, held: loadoutKey(job.loadout), degrees: job.degrees, stood: r.stood, verified: r.verified,
    lie: probe.lie, landed: probe.landed, slow: probe.slow, brace: execute !== null ? execute - r.takeover : null,
    handBack: verifiedAt !== null && riseEnd !== null ? verifiedAt - riseEnd : null };
}

/** The stance alone from the placed squat, to verified standing and 2 s held. */
async function squatStance({ model, held, seed }) {
  await import("../../../tests/harness/preload-data.mjs");
  const [{ default: poses }, { stockBody }, { buildBody }, { loadEngine }, { humanSpec, humanoidSpec }, { armedWith },
    { guardPosture }, { createWorld }, { groundPlacement }, { recoveryMeasurement }, { observeBody }, { clockSenses }, { STAND_CHECK }] = await Promise.all([
    import("../../../assets/research/posture-holds.json", { with: { type: "json" } }),
    import("../../../src/app/stock-body.ts"), import("../../../src/core/bodies/build/build-body.ts"), import("../../../src/core/physics/engines.ts"), import("../../../src/core/bodies/human/spec.ts"),
    import("../../../src/core/bodies/items/held.ts"), import("../../../src/skills/guard/guard.ts"), import("../../../src/core/world/world.ts"), import("../../../src/game/lab/ground-starts.ts"),
    import("../../../src/game/lab/recovery-measurement.ts"), import("../../../src/control/observation.ts"), import("../../../src/core/world/senses.ts"), import("../../../src/game/lab/ground-mode.ts")]);
  const spec = armedWith(humanoidSpec(model), "right", held), reference = humanSpec("workshop-fighter");
  const source = poses.find(p => p.model === "workshop-fighter" && p.id === "squat");
  const angles = Object.fromEntries(reference.joints.flatMap(j => j.dofs.map((d, k) => [`${j.name} ${d.positive}`, source.placement.joints[j.name][k] + d.bind.value])));
  const waypoint = { ...source.placement, joints: Object.fromEntries(spec.joints.map(j => [j.name, j.dofs.map(d => (angles[`${j.name} ${d.positive}`] ?? 0) - d.bind.value)])) };
  const placement = groundPlacement(spec, { seed, ground: { start: "placed", posture: "squat", degrees: null, impulse: null, foe: 0, gusts: false } }, waypoint);
  if ("refused" in placement) return { reading: "squat", model, held, seed, refused: placement.refused };
  const lifetime = constructionScope();
  try {
  const world = lifetime.own(createWorld(await loadEngine("rapier")));
  world.physics.addFixedBox([0, -.5, 0], [40, 1, 40]);
  const built = lifetime.own(buildBody(spec, world, placement)), body = lifetime.own(stockBody(built, world, { servoSeconds: .1 }));
  body.drive(view => ({ posture: guardPosture(spec), pushes: [], stance: { feet: [footOn(spec, "left"), footOn(spec, "right")], centre: null, height: view.standing - .03, heading: 0 } }));
  const measure = recoveryMeasurement(built, observeBody(built, body.muscles, world, clockSenses(world), { contactPatches: true }));
  let height = null, climbed = null, quiet = 0, verified = null, fell = false;
  while (world.time < 6 && (verified === null || world.time - verified <= STAND_CHECK.standing)) {
    world.step();
    const m = measure(), y = m.observation.centre[1];
    height ??= y;
    if (climbed === null && y >= .95 * body.view.standing) climbed = world.time;
    if (verified === null) { quiet = m.ready ? quiet + world.dt : 0; if (quiet + 1e-9 >= STAND_CHECK.quiet) verified = world.time; }
    else if (m.observation.down) fell = true;
  }
  return { reading: "squat", model, held, seed, height, climbed, verified, held2s: verified !== null && !fell };
  } finally { lifetime.dispose(); }
}

if (isMainThread) {
  const { values } = parseArgs({ options: { workers: { type: "string" }, out: { type: "string" } } });
  const { risingJobs } = await import("../../../src/evaluation/rising.ts");
  const jobs = [...risingJobs({ target: true }).map(job => ({ kind: "fall", job })),
    ...["workshop-fighter", "workshop-rogue"].flatMap(model => ["empty", "club"].flatMap(held => Array.from({ length: 8 }, (_, k) => ({ kind: "squat", job: { model, held, seed: k + 1 } }))))];
  const count = Number(values.workers ?? Math.max(1, availableParallelism() - 4));
  const rows = (await workerJobs(jobs, { lanes: count, create: () => new Worker(new URL(import.meta.url)), result: answer => answer })).flat();
  if (values.out) writeFileSync(values.out, JSON.stringify(rows, null, 1) + "\n");
  const median = list => { const s = list.filter(v => v !== null).sort((a, b) => a - b), m = s.length >> 1; return s.length ? (s[m] + s[(s.length - 1) >> 1]) / 2 : null; };
  const f = v => v === null ? "-" : v.toFixed(2), short = model => model.replace("workshop-", "");
  const falls = rows.filter(r => r.reading === "fall"), squats = rows.filter(r => r.reading === "squat");
  const groups = [...new Set(falls.map(r => `${r.model} ${r.held}`))].map(key => [key, falls.filter(r => `${r.model} ${r.held}` === key)]);
  console.log("| Group | Back | Side | Front | Stood | Landed, s | Slow, s | Brace, s | Hand-back, s | Median, s |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const [key, g] of [...groups, ["all", falls]]) {
    const lies = which => g.filter(r => which.includes(r.lie)).length;
    console.log(`| ${short(key)} | ${lies(["back"])} | ${lies(["left", "right"])} | ${lies(["front"])} | ${g.filter(r => r.stood).length} of ${g.length} | ${f(median(g.map(r => r.landed)))} | ${f(median(g.map(r => r.slow)))} | ${f(median(g.map(r => r.brace)))} | ${f(median(g.filter(r => r.stood).map(r => r.handBack)))} | ${f(median(g.map(r => r.stood ? r.verified : 30)))} |`);
  }
  console.log("\n| Lie | Falls | Stood | Median, s |\n|---|---:|---:|---:|");
  for (const [name, which] of [["back", ["back"]], ["side", ["left", "right"]], ["front", ["front"]]]) {
    const g = falls.filter(r => which.includes(r.lie));
    console.log(`| ${name} | ${g.length} | ${g.filter(r => r.stood).length} | ${f(median(g.map(r => r.stood ? r.verified : 30)))} |`);
  }
  console.log("\n| Body | Loadout | Placed | Stood | Height at start, m | To 95 % height, s | Verified, s |\n|---|---|---:|---:|---:|---:|---:|");
  for (const [key, g] of [...new Set(squats.map(r => `${r.model} ${r.held}`))].map(key => [key, squats.filter(r => `${r.model} ${r.held}` === key)])) {
    const placed = g.filter(r => !r.refused), stood = placed.filter(r => r.held2s);
    console.log(`| ${short(key.split(" ")[0])} | ${key.split(" ")[1]} | ${placed.length} of ${g.length} | ${stood.length} | ${f(median(placed.map(r => r.height)))} | ${f(median(stood.map(r => r.climbed)))} | ${stood.length ? `${f(median(stood.map(r => r.verified)))} (${f(Math.min(...stood.map(r => r.verified)))} to ${f(Math.max(...stood.map(r => r.verified)))})` : "-"} |`);
  }
} else {
  await import("../../../tests/harness/preload-data.mjs");
  parentPort.on("message", async ({ kind, job }) => {
    try { parentPort.postMessage([kind === "fall" ? await targetFall(job) : await squatStance(job)]); }
    catch (error) { parentPort.postMessage({ error: String(error?.stack ?? error) }); }
  });
}
