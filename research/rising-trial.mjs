/** One independently built fall, as the rising bed runs it; its worker realm is `rising-worker.mjs`. */
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createWorld } from "../src/core/world.ts";
import { loadEngine } from "../src/core/engine/engines.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { observeBody } from "../src/core/observation.ts";
import { recoveryMeasurement } from "../src/core/control/recovery-measurement.ts";
import { clockSenses } from "../src/core/mind/senses.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { balanceCeiling, balancePercent, rulebook } from "../src/core/rules/rulebook.ts";
import { addArenaSolids } from "../src/arena/room.ts";
import { labAddress } from "../src/lab/scenarios.ts";
import { loadoutSpec } from "../src/lab/loadout.ts";
import { labActor } from "../src/lab/actor.ts";
import { groundPlacement } from "../src/lab/ground-starts.ts";
import { startGround } from "../src/lab/ground-mode.ts";
import { strengthSpec, techniqueTrial } from "./rising-technique.mjs";
import { risingMind } from "./rising-config.mjs";
import { TECHNIQUES } from "../src/core/mind/ground/techniques.ts";

/**
 * The same starts and instrumentation as the Lab; target verification is independent of hand-back.
 * `subs`, an experiment's sub-minds in place of the config's, lets a search pass its settings in;
 * `stop`, asked each step with the world, the body and its actor, ends the fall early once the
 * search has what it scores.
 */
export async function risingTrial(job, { subs, stop } = {}) {
  if (job.grit !== undefined && job.grit !== 0) throw new Error("the unassisted rising bed fixes Grit 0");
  if (job.technique) {
    const result = await techniqueTrial(job), phases = {}, attempts = [];
    for (let i = 0; i < result.trail.length; i++) {
      const entry = result.trail[i], until = result.trail[i + 1]?.at ?? result.endedAt ?? result.seconds;
      phases[entry.phase] = (phases[entry.phase] ?? 0) + Math.max(0, until - entry.at);
    }
    if (job.after && result.predecessor) attempts.push({ controller: job.after, side: TECHNIQUES[job.after].sides[0],
      end: result.predecessor, seconds: result.predecessorSeconds });
    if (result.candidateBegun) attempts.push({ controller: job.technique,
      side: TECHNIQUES[job.technique].sides[0], end: result.end, seconds: result.seconds });
    return { ...result, cap: 8, status: result.end, stood: result.destination === "standing" && result.reached && result.survived,
      handback: result.reached ? result.seconds : null, verified: result.reached ? result.seconds : null,
      phases, attempts };
  }
  const defaults = labAddress("?scenario=ground"), balance = job.balance ?? 0;
  const address = { ...defaults, model: job.model, right: job.held, left: "empty", balance, seed: job.seed,
    ground: { ...defaults.ground, start: job.start, posture: job.posture ?? "back", degrees: job.degrees ?? null,
      impulse: job.impulse ?? null, gusts: job.gusts ?? false } };
  // A raised strength (`factor`) is a discover-then-constrain experiment's, never the game's.
  const factor = job.factor ?? 1;
  if (!Number.isFinite(factor) || factor < 1 || factor > 2) throw new Error("research strength factor stays between 1 and 2");
  const spec = strengthSpec(loadoutSpec(address), factor);
  let placement;
  try { placement = groundPlacement(spec, address); }
  catch (error) { return { ...job, balance, status: "rejected start", stood: false, handback: null, verified: null, error: String(error.message), trail: [], attempts: [], phases: {}, assist: null }; }
  const engine = new NullEngine(), scene = new Scene(engine);
  const world = createWorld(scene, await loadEngine("rapier"));
  addArenaSolids(world.physics);
  const built = buildBody(spec, world, placement);
  if (job.target) address.ground.impulse = 1.5 * [...built.segments.values()].reduce((sum, part) => sum + part.rigid.mass, 0);
  const actor = labActor(built, world, { mind: risingMind(job.sub ?? "support-recovery", job.techniques), ...(subs ? { subs } : {}),
    assist: balanceCeiling(balance, balancePercent(rulebook("arena"))) });
  let orders = STAND_ORDERS;
  const run = startGround(actor, address, { orders: () => orders });
  const measure = job.target ? recoveryMeasurement(built, observeBody(built, actor.body.muscles, world, clockSenses(world), undefined, undefined, true)) : null;
  let takeover = null, verified = null, quiet = 0, verifiedAt = null, stood = false, failedAfter = false, walked = null, walkFrom = null;
  const cap = Math.min(30, job.cap ?? 30);
  try {
    while (world.time < cap + 4) {
      world.step();
      if (stop?.(world, built, actor)) break;
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
    return { ...job, balance, cap, status: stood ? "stood" : run.state.status === "landed standing" ? "landed standing"
      : takeover === null && job.start === "shoved" ? "no takeover" : failedAfter ? "fell after verification" : "failed",
      stood, handback: frame.handback, handBackReason: frame.handBackReason, takeover, verified, walked, trail: frame.trail, attempts: frame.attempts,
      phases: frame.phases, assist: frame.assist };
  } finally { run.dispose(); built.dispose(); world.dispose(); scene.dispose(); engine.dispose(); }
}
