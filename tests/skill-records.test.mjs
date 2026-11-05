import "./harness/preload-data.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { partLookup } from "../src/entrants/game.ts";
import { modelSpec } from "../src/core/models.ts";
import { TECHNIQUES } from "../src/core/recovery/ground/techniques.ts";
import { EVALUATIONS } from "../src/evaluation/evaluations.ts";
import { stepUpTuning } from "../src/core/recovery/ground/step-up.ts";
import { coreStand } from "./harness/core-stand.mjs";
import { fallStart } from "../src/evaluation/fall.ts";
import { commandedBody } from "../src/core/mind/host.ts";
import { kitOf } from "../src/core/mind/kit.ts";
import { groundReading } from "../src/core/control/ground-reading.ts";
import { techniqueTrial } from "../src/evaluation/rising.ts";

test("a roll admitted by a previous side reading hands over when already on its front", async () => {
  const { spec, placement } = fallStart({ model: "workshop-fighter", seed: 1, start: "placed", posture: "front", mind: { kind: "option", chooser: { kind: "tree" } } });
  assert.ok(!("refused" in placement), "the front placement reaches the roll's already-complete case");
  const stand = await coreStand(spec, placement);
  let run;
  const body = commandedBody(stand.built, stand.world, {}, [(own, view, clock) => {
    run = TECHNIQUES["staged-roll"].make(own, view, clock, kitOf(partLookup, spec), { kind: "staged-roll" });
    return { name: "roll fixture", state: {}, wants: () => false, begin() {}, end() {}, step() {} };
  }]);
  try {
    const reader = groundReading(stand.built, stand.world.dt);
    let g;
    for (let i = 0; i < 360; i++) {
      stand.world.step(); g = reader.read();
      if (run.reached(g, "front")) break;
    }
    assert.equal(run.reached(g, "front"), true, `the placed body is physically at the roll's exit: ${JSON.stringify({ position: g.position, raw: g.raw, lie: g.lie, speed: g.velocity.length(), spin: g.spin, height: g.height })}`);
    assert.equal(run.admits({ ...g, raw: "left", position: "left" }, "left"), true, "a lagging posture reading admits the roll");
    run.begin("left");
    let end = null;
    for (let i = 0; i < 24 && end === null; i++) end = run.step(g, body.view.senses, stand.world.dt);
    assert.equal(end, "done");
  } finally { body.dispose(); stand.dispose(); }
});

test("a lagging ground label never admits a staged ground action on a standing body", async () => {
  const spec = modelSpec("workshop-fighter"), stand = await coreStand(spec);
  const runs = {};
  const previous = { "staged-roll": "back", "staged-down": "front", "front-sit-back": "front", "sit-back": "fours" };
  const body = commandedBody(stand.built, stand.world, {}, [(own, view, clock) => {
    for (const kind of Object.keys(previous)) runs[kind] = TECHNIQUES[kind].make(own, view, clock, kitOf(partLookup, spec), { kind });
    return { name: "standing admission", state: {}, wants: () => false, begin() {}, end() {}, step() {} };
  }]);
  try {
    const reader = groundReading(stand.built, stand.world.dt), speed = stepUpTuning(spec).settle.speed;
    let g;
    for (let i = 0; i < 120; i++) {
      stand.world.step(); g = reader.read();
      if (g.position === "standing" && g.raw === "standing" && g.velocity.length() < speed && g.spin < 2) break;
    }
    assert.ok(g.position === "standing" && g.raw === "standing" && g.velocity.length() < speed && g.spin < 2,
      "the fixture must stand slowly enough that only its posture can refuse the actions");
    assert.deepEqual(Object.fromEntries(Object.entries(runs).map(([kind, run]) => [kind, run.admits({ ...g, position: previous[kind] }, "left")])),
      { "staged-roll": false, "staged-down": false, "front-sit-back": false, "sit-back": false });
  } finally { body.dispose(); stand.dispose(); }
});

test("staged down hands the next skill the hands-and-knees posture its edge promises", async () => {
  const r = await techniqueTrial({ model: "workshop-fighter", held: "empty", seed: 1, start: "placed", posture: "front", technique: "staged-down" });
  assert.equal(r.candidateBegun, true, "placed-front seed 1 must begin staged down before its exit is checked");
  assert.deepEqual({ end: r.end, reached: r.reached, destination: r.destination }, { end: "done", reached: true, destination: "fours" });
});

/**
 * A default panel is a fixed list of a mind's entrants, and which entrants a mind has is its
 * bodies' records: every evaluation's panel names subjects it has, so a record dropped or not kept
 * cannot leave a panel naming a body that no longer strikes.
 */
test("every evaluation's default panel names entrants it has", () => {
  const panels = Object.values(EVALUATIONS).filter((evaluation) => evaluation.analysis?.panel?.length);
  assert.ok(panels.length > 0, "an evaluation has a default panel");
  for (const evaluation of panels) for (const id of evaluation.analysis.panel)
    assert.doesNotThrow(() => evaluation.subjects([id]), `${evaluation.id}'s panel names ${id}`);
});
