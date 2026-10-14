import { traceOf } from "./harness/trace.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { createBody } from "../src/core/body.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { standUp } from "../src/core/mind/ground/stand-up.ts";
import { groundPlacement } from "../src/lab/ground-starts.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";
import { saveState } from "../src/core/state.ts";
import { mindFaults } from "../src/ui/mind-link.ts";
import { RECIPE_FIGHTER } from "../src/core/mind/config.ts";

async function made(posture = "front", registry) {
  const spec = humanSpec("workshop-fighter");
  const stand = await coreStand(spec, groundPlacement(spec, { seed: 2,
    ground: { start: "placed", posture, degrees: null, impulse: null, foe: 0, gusts: false } }));
  let supervisor;
  const body = createBody(stand.built, stand.world, { subs: [(own, view, world) =>
    supervisor = standUp(own, view, world, { kind: "stand-up", techniques: registry ? Object.keys(registry) : ["plant-up", "roll"] }, registry)] });
  return { stand, body, get supervisor() { return supervisor; }, dispose() { body.dispose(); stand.dispose(); } };
}

test("a fallen real body drives and forks the experimental supervisor without claiming recovery", async () => {
  const a = await made(), b = await made();
  try {
    a.stand.step(24);
    assert.equal(a.supervisor.wants(), true);
    assert.ok(a.body.muscles.activation.some(value => value > 0));
    const saved = saveStand(a.stand.world, { body: a.body.state });
    loadStand(b.stand.world, { body: b.body.state }, saved);
    const ta = traceOf([a.stand.built]), tb = traceOf([b.stand.built]);
    for (let i = 0; i < 24; i++) { a.stand.step(); b.stand.step(); ta.take(); tb.take(); }
    assert.deepEqual(saveState(a.body.state), saveState(b.body.state));
    assert.equal(ta.digest(), tb.digest());
    assert.equal(a.supervisor.state.handBack, null);
    assert.deepEqual([a.body.assist.given.force.length(), a.body.assist.given.moment.length()], [0, 0]);
  } finally { a.dispose(); b.dispose(); }
});

test("failed contracts are counted at their starting position and wait through stuck backoff", async () => {
  const spec = { label: "fixture", stage: "experimental", sides: ["left"], edges: [{ from: "front", to: "standing" }], fits: () => true,
    make(own) { const state = { starts: 0, ends: 0 }; return { state, phase: "attempt", yields: false,
      admits: () => true, reached: () => false, begin() { state.starts++; }, end() { state.ends++; },
      step() { own.muscles.activation.fill(.2); own.muscles.velocity.fill(0); return "failed"; } }; } };
  const f = await made("front", { fixture: spec });
  try {
    f.stand.step(30);
    const g = f.body.view.ground;
    g.position = "front"; g.lie = "front"; g.velocity.setAll(0); g.spin = 0;
    f.supervisor.begin();
    for (let i = 0; i < 1000 && f.supervisor.state.mode !== "stuck"; i++) f.supervisor.step(f.body.view.senses, 1 / 120);
    assert.equal(f.supervisor.state.mode, "stuck");
    assert.deepEqual(f.supervisor.state.failures, [{ technique: "fixture", side: "left", from: "front", count: 2 }]);
    const starts = f.supervisor.state.techniques.fixture.starts;
    for (let i = 0; i < 239; i++) f.supervisor.step(f.body.view.senses, 1 / 120);
    assert.equal(f.supervisor.state.techniques.fixture.starts, starts);
    assert.equal(f.supervisor.state.failures.length, 1);
    for (let i = 0; i < 4; i++) f.supervisor.step(f.body.view.senses, 1 / 120);
    assert.ok(f.supervisor.state.techniques.fixture.starts > starts);
    assert.ok(f.supervisor.state.log.every(entry => entry.end !== "done" || entry.technique === "flatten"));
  } finally { f.dispose(); }
});

test("interruption ends a running contract without changing the outgoing command", async () => {
  const f = await made();
  try {
    for (let i = 0; i < 240 && !f.supervisor.state.current; i++) f.stand.step();
    assert.ok(f.supervisor.state.current);
    const before = [[...f.body.muscles.activation], [...f.body.muscles.velocity]];
    f.supervisor.end();
    assert.equal(f.supervisor.state.active, false);
    assert.equal(f.supervisor.state.current, null);
    assert.equal(f.supervisor.state.log.at(-1).end, "interrupted");
    assert.deepEqual([[...f.body.muscles.activation], [...f.body.muscles.velocity]], before);
  } finally { f.dispose(); }
});

test("stand-up configurations require routes from both front and back", () => {
  const spec = humanSpec("workshop-fighter"), config = techniques => ({ ...RECIPE_FIGHTER, subs: [{ kind: "stand-up", techniques }] });
  assert.deepEqual(mindFaults(config(["plant-up", "roll"]), spec), []);
  assert.ok(mindFaults(config(["plant-up"]), spec).some(fault => fault.includes("no route to standing from back")));
  assert.ok(mindFaults(config(["plant-up", "roll", "roll"]), spec).some(fault => fault.includes("only once")));
});
