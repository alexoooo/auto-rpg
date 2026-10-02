/**
 * What a body costs a step: `--bodies` of one model with the club, 3 m apart on a ground in one
 * core world, each under the command layers with an order to stand. Read standing; then held, its
 * muscles released (`Body.dispose`) and every segment fixed where it is; then let go and driven
 * afresh, which says whether a body held and let go still stands; then felled by a shove at the
 * root and still driven; then lying, under the sub-minds the game's mind has (`FIGHTER`); then
 * limp, its muscles released; then rising, under the riser that plays stages (`stagedRise`), the
 * row saying what part of its steps it lay slack, held a pose, and bore on its limbs. A row is
 * the mean of `--steps` steps: the whole step, the solver's part, and the rest, which is control.
 *
 *   node research/body-cost.mjs [--model crypt-skeleton] [--bodies 1,4,8] [--steps 600]
 *
 * Wall time on the machine it runs on: read it on a quiet one, and compare rows of one run.
 */
import { parseArgs } from "node:util";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { armed } from "../src/core/human/grip.ts";
import { modelSpec } from "../src/core/human/spec.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { FIGHTER } from "../src/core/mind/config.ts";
import { RISE } from "../src/core/mind/rise/stages.ts";
import { standIntent } from "../src/core/mind/intent.ts";
import { subMindsOf } from "../src/core/mind/sub-minds.ts";
import { driveBy } from "../src/core/mind/tactics.ts";
import { createWorld } from "../src/core/world.ts";
import { CORE_ENGINE, freshEngine } from "../tests/harness/core-stand.mjs";
import { riserOf } from "./core-rise-trials.mjs";

const { values } = parseArgs({ options: { model: { type: "string", default: "crypt-skeleton" }, bodies: { type: "string", default: "1,4,8" }, steps: { type: "string", default: "600" } } });
const steps = Number(values.steps), spec = armed(modelSpec(values.model), "right", woodenClub());

async function cost(count) {
  const engine = new NullEngine(), scene = new Scene(engine), world = createWorld(scene, await freshEngine());
  world.physics.addFixedBox([0, -0.5, 0], [60, 1, 60]);
  const driven = (built, subs = []) => {
    const body = createBody(built, world, { servoSeconds: SERVO_SECONDS, subs });
    return { body, skills: driveBy(body, { name: "stand", decide: () => standIntent(0) }) };
  };
  const bodies = Array.from({ length: count }, (_, i) => driven(buildBody(spec, world, { position: [3 * (i - (count - 1) / 2), 0, 0] })));
  const fix = (fixed) => { for (const { body } of bodies) for (const segment of body.built.segments.values()) segment.body.setFixed(fixed); };
  const solve = world.physics.step.bind(world.physics);
  let solver = 0;
  world.physics.step = (dt) => { const t = performance.now(); solve(dt); solver += performance.now() - t; };
  const read = (state, each = () => {}) => {
    solver = 0;
    let all = 0;
    for (let i = 0; i < steps; i++) {
      const t = performance.now();
      world.step();
      all += performance.now() - t;
      each();
    }
    const down = bodies.filter((b) => b.body.view.down).length;
    return { bodies: count, state: typeof state === "function" ? state() : state, down, all: all / steps, solver: solver / steps, rest: (all - solver) / steps };
  };
  world.step(world.hz);
  const rows = [read("standing, driven")];
  for (const { body } of bodies) body.dispose();
  fix(true);
  rows.push(read("standing, held"));
  fix(false);
  bodies.forEach((b, i) => { bodies[i] = driven(b.body.built); });
  world.step(3 * world.hz);
  rows.push(read("let go, driven"));
  const at = new Vector3();
  for (const { body } of bodies) {
    const root = body.muscles.dynamics.root.segment;
    root.body.applyImpulse(new Vector3(0, 0, 400), centreOfToRef(root, at));
  }
  world.step(3 * world.hz);
  rows.push(read("down, driven"));
  for (const { body } of bodies) body.dispose();
  bodies.forEach((b, i) => { bodies[i] = driven(b.body.built, subMindsOf(FIGHTER.subs)); });
  world.step(3 * world.hz);
  rows.push(read("down, lying"));
  for (const { body } of bodies) body.dispose();
  world.step(3 * world.hz);
  rows.push(read("down, limp"));
  bodies.forEach((b, i) => { bodies[i] = driven(b.body.built, subMindsOf([{ kind: "staged-rise" }])); });
  world.step(3 * world.hz);
  // What each riser is at, counted over the bodies at every step of the reading.
  const doing = { slack: 0, posing: 0, bearing: 0 };
  const per = (n) => `${Math.round(100 * n / (steps * count))} %`;
  rows.push(read(() => `down, rising: slack ${per(doing.slack)}, posing ${per(doing.posing)}, bearing ${per(doing.bearing)}`, () => {
    for (const { body } of bodies) {
      const riser = riserOf(body);
      doing[riser.phase === "roll" ? "posing" : riser.phase === "rise" ? (RISE.rise[riser.stage].kind === "bear" ? "bearing" : "posing") : "slack"]++;
    }
  }));
  for (const { body } of bodies) body.built.dispose();
  world.dispose(); scene.dispose(); engine.dispose();
  return rows;
}

console.log(`Node, the core world, ${CORE_ENGINE}, 120 Hz; ${values.model} with the club; mean of ${steps} steps, ms\n`);
console.log("| Bodies | State | Down | A step, ms | The solver, ms | The rest, ms | A body, ms | Of real time, % |");
console.log("|---|---|---|---|---|---|---|---|");
for (const count of values.bodies.split(",").map(Number)) for (const row of await cost(count)) {
  console.log(`| ${row.bodies} | ${row.state} | ${row.down} | ${row.all.toFixed(2)} | ${row.solver.toFixed(2)} | ${row.rest.toFixed(2)} | ${(row.all / row.bodies).toFixed(2)} | ${(row.all * 120 / 10).toFixed(0)} |`);
}
