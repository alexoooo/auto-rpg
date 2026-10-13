/** One independently built fall per job, stepped sequentially in each worker realm. */
import { parentPort } from "node:worker_threads";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createWorld } from "../src/core/world.ts";
import { loadEngine } from "../src/core/engine/engines.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { observeBody } from "../src/core/observation.ts";
import { recoveryMeasurement } from "../src/core/control/recovery-measurement.ts";
import { clockSenses } from "../src/core/mind/senses.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { PUNCHER } from "../src/core/mind/config.ts";
import { balanceCeiling, balancePercent, rulebook } from "../src/core/rules/rulebook.ts";
import { addArenaSolids } from "../src/arena/room.ts";
import { labAddress } from "../src/lab/scenarios.ts";
import { loadoutSpec } from "../src/lab/loadout.ts";
import { labActor } from "../src/lab/actor.ts";
import { groundPlacement } from "../src/lab/ground-starts.ts";
import { startGround } from "../src/lab/ground-mode.ts";

/** The same starts and instrumentation as the Lab; target verification is independent of hand-back. */
export async function risingTrial(job) {
  const defaults = labAddress("?scenario=ground"), balance = job.balance ?? 0;
  const address = { ...defaults, model: job.model, right: job.held, left: "empty", balance, seed: job.seed,
    ground: { ...defaults.ground, start: job.start, posture: job.posture ?? "back", degrees: job.degrees ?? null,
      impulse: job.impulse ?? null, gusts: job.gusts ?? false } };
  const spec = loadoutSpec(address);
  let placement;
  try { placement = groundPlacement(spec, address); }
  catch (error) { return { ...job, balance, status: "rejected start", stood: false, handback: null, verified: null, error: String(error.message), trail: [], attempts: [], phases: {}, assist: null }; }
  const engine = new NullEngine(), scene = new Scene(engine);
  const world = createWorld(scene, await loadEngine("rapier"));
  addArenaSolids(world.physics);
  const built = buildBody(spec, world, placement);
  if (job.target) address.ground.impulse = 1.5 * [...built.segments.values()].reduce((sum, part) => sum + part.rigid.mass, 0);
  const actor = labActor(built, world, { mind: { ...PUNCHER, subs: [{ kind: job.sub ?? "support-recovery" }] },
    assist: balanceCeiling(balance, balancePercent(rulebook("arena"))) });
  let orders = STAND_ORDERS;
  const run = startGround(actor, address, { orders: () => orders });
  const measure = job.target ? recoveryMeasurement(built, observeBody(built, actor.body.muscles, world, clockSenses(world), undefined, undefined, true)) : null;
  let takeover = null, verified = null, quiet = 0, verifiedAt = null, stood = false, failedAfter = false, walked = null, walkFrom = null;
  const cap = Math.min(30, job.cap ?? 30);
  try {
    while (world.time < cap + 4) {
      world.step();
      if (actor.body.has !== "command" && actor.body.has !== "nobody") takeover ??= world.time;
      if (job.target) {
        const reading = measure();
        if (takeover !== null && verifiedAt === null) {
          quiet = reading.ready ? quiet + world.dt : 0;
          if (quiet + 1e-9 >= .5) { verifiedAt = world.time; verified = world.time - takeover; }
        } else if (verifiedAt !== null) {
          if (reading.observation.down) { failedAfter = true; break; }
          if (world.time - verifiedAt + 1e-9 >= 2) {
            if (!walkFrom) walkFrom = [...reading.observation.centre];
            orders = { ...STAND_ORDERS, move: { x: 0, z: 1 }, pace: .3 };
          }
          if (world.time - verifiedAt + 1e-9 >= 3) {
            const centre = reading.observation.centre;
            walked = Math.hypot(centre[0] - walkFrom[0], centre[2] - walkFrom[2]);
            stood = actor.body.has === "command";
            break;
          }
        }
        if (takeover !== null && verifiedAt === null && world.time - takeover >= cap) break;
        if (takeover === null && world.time >= 4) break;
      } else {
        if (run.meter.state.handback !== null) { stood = true; break; }
        if (run.state.status !== "running") break;
        if (run.meter.state.from !== null && world.time - run.meter.state.from >= cap) break;
        if (run.meter.state.from === null && world.time >= 4) break;
      }
    }
    if (!stood) run.meter.cap();
    const frame = run.frame();
    return { ...job, balance, cap, status: stood ? "stood" : run.state.status === "landed standing" ? "landed standing" : failedAfter ? "fell after verification" : "failed",
      stood, handback: frame.handback, takeover, verified, walked, trail: frame.trail, attempts: frame.attempts,
      phases: frame.phases, assist: frame.assist };
  } finally { run.dispose(); built.dispose(); world.dispose(); scene.dispose(); engine.dispose(); }
}

if (parentPort) parentPort.on("message", async job => {
  try { parentPort.postMessage({ id: job.id, result: await risingTrial(job) }); }
  catch (error) { parentPort.postMessage({ id: job.id, error: String(error?.stack ?? error) }); }
});
