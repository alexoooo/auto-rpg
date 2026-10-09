import test from "node:test";
import assert from "node:assert/strict";
import { createQuadrupedMind } from "../src/core/reptile/mind.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { watchBlows } from "../src/core/rules/blows.ts";
import { createPool } from "../src/core/rules/pool.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { createSenses } from "../src/core/mind/senses.ts";
import { REPTILE_BITE } from "../src/core/reptile/tuning.ts";
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
  assert.deepEqual([...run.seen].sort(), ["land", "settle", "swing"]);
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

async function sensedBite() {
  const stand = await coreStand(reptileSpec(), { engine: "rapier-coordinate", joints: { jaw: [REPTILE_BITE.open] } });
  const target = buildBody(reptileSpec(), stand.world, { position: [0, 0, .97], rotation: [0, 1, 0, 0] });
  for (const segment of target.segments.values()) segment.body.setFixed(true);
  const hub = createSenses(stand.world), see = hub.add({ id: "mine", side: "one", built: stand.built, out: () => false });
  hub.add({ id: "target", side: "two", built: target, out: () => false });
  const parts = new Map([...target.segments.values()].map(segment => [segment.body, segment.spec.name]));
  const mind = createQuadrupedMind(stand.built, stand.world, { senses: see,
    contactIdentity: other => parts.has(other) ? { kind: "body", body: "target", segment: parts.get(other), guard: false } : { kind: "world" } }),
    body = mind.body, host = body.state.mind.host, seen = new Set();
  const rules = rulebook("arena"), mine = createPool(stand.built.spec, rules), theirs = createPool(target.spec, rules);
  const blows = watchBlows(stand.world, [{ id: "mine", side: "one", built: stand.built, pool: mine },
    { id: "target", side: "two", built: target, pool: theirs }], rules);
  return { world: stand.world, builts: [stand.built, target], states: { body: body.state, senses: hub.state, blows: blows.state, mine: mine.state, theirs: theirs.state }, seen,
    advance: () => stand.step(), watch: () => { if (host.tactics.target) seen.add(host.tactics.target.foe); if (blows.blows.some(blow => blow.sides.some(side => side.mechanism === "point"))) seen.add("point"); },
    read: () => ({ observation: { ...body.observe(), senses: null }, target: host.tactics.target, jaw: host.bite.jaw, shift: host.bite.shift, blows: blows.blows, bars: [mine.bar(), theirs.bar()] }),
    dispose() { blows.dispose(); body.dispose(); hub.dispose(); target.dispose(); stand.dispose(); } };
}

test("a sensed material target and supported bite shift fork with the jaw's committed motion", async () => {
  const run = await forks(sensedBite, 6, 12, 60, { physics: PHYSICS_ALONE, state: STATE_ALONE });
  assertForks(run, ["physics", "state"]);
  assert.deepEqual([...run.seen], ["target", "point"]);
});
