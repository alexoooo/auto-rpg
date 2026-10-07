import test from "node:test";
import assert from "node:assert/strict";
import { createQuadrupedMind } from "../src/core/reptile/mind.ts";
import { reptileSpec } from "../src/core/reptile/spec.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { coreStand } from "./harness/core-stand.mjs";
import { assertForks, forks, PHYSICS_ALONE, STATE_ALONE } from "./harness/fork.mjs";

async function rig(mode) {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate", joints: mode === "bite" ? { jaw: [.3] } : undefined,
    ...(mode === "recover" ? { rotation: [0, 0, 1, 0], position: [0, .34, 0] } : {}) });
  const mind = createQuadrupedMind(stand.built, stand.world, { orders: () => mode === "bite"
    ? { ...STAND_ORDERS, attack: stand.world.time < 1 ? [0, .215, .495] : null }
    : mode === "recover" ? STAND_ORDERS : stand.world.time < 10 ? { move: { x: 0, z: 1 }, face: { x: 0, z: 1 }, attack: null } : STAND_ORDERS });
  const body = mind.body, host = body.state.mind.host;
  const seen = new Set();
  return { world: stand.world, builts: [stand.built], states: { body: body.state }, seen,
    advance: () => stand.step(),
    watch() { seen.add(mode === "recover" ? body.state.mind.subs[0].phase : mode === "bite" ? host.bite.cycle.phase : host.crawl.phase); },
    read: () => ({ observation: body.observe(), has: body.has, level: body.level,
      activation: body.muscles.activation, velocity: body.muscles.velocity, pulled: body.muscles.pulled,
      joints: body.muscles.channels.map((_, i) => [body.muscles.angle(i), body.muscles.rate(i)]), assist: body.assist.meter }),
    dispose() { body.dispose(); stand.dispose(); } };
}

test("crawling and stopping continue identically from saved support and endpoint state", async () => {
  const run = await forks(() => rig("crawl"), 30, 60, 48, { physics: PHYSICS_ALONE, state: STATE_ALONE });
  assertForks(run, ["physics", "state"]);
  assert.deepEqual([...run.seen].sort(), ["land", "settle", "shift", "swing"]);
});

test("grounded righting and its supported handover fork into a fresh world", async () => {
  const run = await forks(() => rig("recover"), 60, 120, 60, { physics: PHYSICS_ALONE, state: STATE_ALONE });
  assertForks(run, ["physics", "state"]);
  assert.deepEqual([...run.seen].sort(), ["idle", "place", "rise", "roll"]);
});

test("a chambered jaw, its snap and cancellation return fork through the shared strike cycle", async () => {
  const run = await forks(() => rig("bite"), 12, 24, 40, { physics: PHYSICS_ALONE, state: STATE_ALONE });
  assertForks(run, ["physics", "state"]);
  assert.deepEqual([...run.seen].sort(), [null, "chamber", "return", "swing"].sort());
});
