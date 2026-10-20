import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { navigationPath, createNavigator } from "../src/core/mind/navigation.ts";
import { directMovement, placeMovement, groundPoint, isMovement } from "../src/core/mind/movement.ts";
import { modelSpec } from "../src/core/models.ts";
import { clearStep } from "../src/core/mind/clear-step.ts";
import { saveState, loadState } from "../src/core/state.ts";
import { coreStand, saveStand, loadStand } from "./harness/core-stand.mjs";
import { createBody } from "../src/core/body.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { orderedIntent } from "../src/core/mind/ordered.ts";
import { NO_COVER } from "../src/core/mind/intent.ts";
import { traceOf } from "./harness/trace.mjs";

const column = { name: "column", kind: "box", centre: [0, 1, 0], size: [1, 2, 1] };
const sight = (x, z, time = 0, others = [], solids = [column]) => ({
  view: { time, stance: { centre: new Vector3(x, 1, z), velocity: Vector3.Zero() }, senses: { solids, others } },
  report: { heading: 0 }, envelope: { walk: { value: .7 } },
});

test("movement requests validate finite world geometry and explicit range bounds", () => {
  for (const request of [directMovement(1, 0), placeMovement({ x: 2, z: 3 }),
    { kind: "range", focus: "foe", near: 1, far: 2, side: -1 }]) assert.equal(isMovement(request), true);
  for (const request of [{ x: 1, z: 0 }, { kind: "place", points: [], near: .2 },
    { kind: "range", focus: "foe", near: 2, far: 1 }, directMovement(Infinity, 0),
    { ...directMovement(1, 0), surprise: true }]) assert.equal(isMovement(request), false);
  assert.deepEqual(groundPoint([2, 5, 3]), { x: 2, z: 3 });
});

test("visibility routes clear inflated column and rotated corner footprints from several starts", () => {
  for (const turn of [0, .4, -.7]) for (const x of [-.2, 0, .2]) {
    const solids = [{ ...column, turn }], from = { x, z: -2 }, goal = { x: -x, z: 2 };
    const route = navigationPath(from, goal, solids, .3);
    assert.ok(route.length > 1, "the direct segment crosses the column");
    let previous = from;
    for (const point of route) {
      assert.equal(clearStep([previous.x, 1, previous.z], [point.x, 1, point.z], .3, solids), true);
      previous = point;
    }
    assert.deepEqual(route.at(-1), goal);
    assert.deepEqual(navigationPath(from, goal, solids, .3), route);
  }
  assert.deepEqual(navigationPath({ x: 0, z: -2 }, { x: 0, z: 0 }, [column], .3), []);
  assert.deepEqual(navigationPath({ x: 0, z: -2 }, { x: .2, z: .2 }, [column], .3), [], "an off-centre point inside a solid is also blocked");
});

test("navigation distinguishes lost focus, unreachable, physical stall, takeover and actual arrival", () => {
  const navigator = createNavigator(modelSpec("workshop-fighter")), target = placeMovement({ x: 0, z: 2 });
  navigator.step(sight(0, -2), target, .7, 1 / 120);
  assert.equal(navigator.report.status, "moving");
  assert.ok(navigator.report.remaining > 4);
  const saved = saveState(navigator.state);
  navigator.step(sight(0, -2, 2), target, .7, 1 / 120, false);
  assert.equal(navigator.report.status, "unavailable");
  navigator.step(sight(0, -2, 3), target, .7, 1 / 120);
  assert.equal(navigator.report.status, "moving", "an unavailable interval does not consume the progress timeout");
  navigator.step(sight(0, -2, 6), target, .7, 1 / 120);
  assert.equal(navigator.report.status, "stalled");
  loadState(navigator.state, saved);
  navigator.step(sight(0, 2, .5), target, .7, 1 / 120);
  assert.equal(navigator.report.status, "arrived");
  navigator.step(sight(0, -2, 1), placeMovement({ x: 0, z: 0 }), .7, 1 / 120);
  assert.equal(navigator.report.status, "unreachable");
  navigator.step(sight(0, -2, 2), { kind: "range", focus: "absent", near: 1, far: 2 }, .7, 1 / 120);
  assert.equal(navigator.report.status, "lost-focus");
  navigator.step(sight(0, -2, 3), null, .7, 1 / 120);
  assert.equal(navigator.report.status, "stopped");
});

test("range movement follows sensed geometry and holds an attained band", () => {
  const navigator = createNavigator(modelSpec("workshop-fighter"));
  const request = { kind: "range", focus: "foe", near: 1, far: 1.5 };
  const foe = (z) => ({ id: "foe", out: false, centre: new Vector3(0, 1, z) });
  const first = navigator.step(sight(0, -3, 0, [foe(2)]), request, .7, 1 / 120);
  assert.ok(first.move && navigator.report.goal.z < 2);
  navigator.step(sight(0, 1, 1, [foe(2)]), request, .7, 1 / 120);
  assert.equal(navigator.report.status, "arrived");
  navigator.step(sight(0, 1, 2, [foe(4)]), request, .7, 1 / 120);
  assert.equal(navigator.report.status, "moving");
});

test("appending a drawn route retains consumed waypoints and low furniture requires a detour", () => {
  const navigator = createNavigator(modelSpec("workshop-fighter"));
  const request = { kind: "place", points: [{ x: 0, z: 1 }, { x: 0, z: 2 }], near: .2 };
  navigator.step(sight(0, 1, 0, [], []), request, .7, 1 / 120);
  assert.equal(navigator.state.waypoint, 1);
  navigator.step(sight(0, 1, 1, [], []), { ...request, points: [...request.points, { x: 1, z: 2 }] }, .7, 1 / 120);
  assert.equal(navigator.state.waypoint, 1);
  assert.deepEqual(navigator.report.goal, { x: 0, z: 2 });
  const bench = { ...column, centre: [0, .15, 0], size: [1, .3, 1] };
  assert.ok(navigationPath({ x: 0, z: -2 }, { x: 0, z: 2 }, [bench], .3).length > 1);
});

test("a fighter physically walks round a column, brakes at its destination and forks on its route", async () => {
  const obstacle = { ...column, size: [.5, 2, .5] }, target = placeMovement({ x: 0, z: 1.4 });
  const stand = await coreStand(modelSpec("workshop-fighter"), { position: [0, 0, -1.4] });
  stand.world.physics.addFixedBox(obstacle.centre, obstacle.size);
  const body = createBody(stand.built, stand.world, { senses: () => ({ time: stand.world.time, side: "left", out: false, others: [], solids: [obstacle] }) });
  const skills = driveBy(body, { name: "route", decide: sight => orderedIntent(sight, { move: stand.world.time < .5 ? null : target, face: null }, NO_COVER) });
  try {
    let ready = false;
    for (let step = 0; step < 900; step++) {
      stand.world.step();
      const at = body.view.stance.centre;
      if (skills.report.navigation.route.length === 2 && Math.abs(at.x) > .4 && at.z < 0) { ready = true; break; }
    }
    assert.equal(ready, true, "fixture failed to reach a moving route beside the column");
    const states = { body: body.state, skills: skills.state }, saved = saveStand(stand.world, states);
    const continueRoute = () => {
      const trace = traceOf([stand.built]); let steps = 0;
      while (skills.report.navigation.status !== "arrived" && steps < 1000) { stand.world.step(); trace.take(); steps++; }
      const at = body.view.stance.centre;
      return { steps, trace: trace.digest(), at: at.asArray(), down: body.view.down,
        report: structuredClone({ ...skills.report.navigation }) };
    };
    const first = continueRoute();
    assert.equal(first.report.status, "arrived", `route failed: ${JSON.stringify(first)}`);
    assert.equal(first.down, false);
    assert.ok(Math.hypot(first.at[0], first.at[2] - 1.4) <= target.near);
    loadStand(stand.world, states, saved);
    assert.deepEqual(continueRoute(), first);
  } finally { body.dispose(); stand.dispose(); }
});
