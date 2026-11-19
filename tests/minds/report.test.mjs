/** What a mind has said stays as it said it, whatever its owners write afterwards. */
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ENGINE } from "../../src/core/physics/engines.ts";
import { recipeOf } from "../../src/app/node/setup.ts";
import { risingJobs } from "../../src/evaluation/rising.ts";
import { freshEngine } from "../harness/core-stand.mjs";
import { CONTEXT } from "../../src/app/node/context.ts";
import { evaluationApplication } from "../../src/app/evaluation.ts";
import { gameApplication } from "../../src/app/game.ts";
import { SAID_FIELDS } from "../../src/minds/seat/apart.ts";

/**
 * Reproduce a report owner writing into a value the mind has said: navigation moved its route's
 * end round a corner in place, which changed the published route after the answer (seed 10's hero,
 * 6.5 s in). At every answer compare the published report with a whole copy of the live one; an
 * Option Mind bout, a stand-up fall with its release and resume, and a Crypt route between them
 * change every field the decision and the skills write. A drill reads the live skills, not what
 * the mind said, so it cannot see the stale report.
 */
test("a mind's report is what it said at its answer, through a sword bout, a fall it rises from and a Crypt run", async () => {
  // The live report copied whole at each answer, by the mind's own state: the publisher's first read of it is that answer's.
  const answered = new WeakMap();
  const fields = (report) => Object.fromEntries(SAID_FIELDS.map((key) => [key, report[key]]));
  const tapped = (made) => {
    if (!made.report) return made;
    const live = made.report, report = Object.create(live, { prospects: { get() { answered.set(made.state, structuredClone(fields(live))); return live.prospects; } } });
    return new Proxy(made, { get: (target, key) => key === "report" ? report : Reflect.get(target, key) });
  };
  const catalog = Object.create(CONTEXT.catalog, { controllerOf: { value(config) {
    const controller = CONTEXT.catalog.controllerOf(config);
    return Object.create(controller, { create: { value: (host, given) => tapped(controller.create(host, given)) } });
  } } });
  const context = { ...CONTEXT, catalog };
  const changed = new Set(), last = new WeakMap();
  // Each body's report is the copy taken at its answer, every field of it frozen and each a new value only where it changed.
  const check = (minded, where) => {
    const said = fields(minded.report), copy = answered.get(minded.state.mind);
    assert.ok(copy, `${where}: the mind must have answered`);
    assert.deepStrictEqual(structuredClone(said), copy, `${where}: what the mind says is what it said at its answer`);
    for (const key of SAID_FIELDS) if (said[key] !== null && typeof said[key] === "object") assert.ok(Object.isFrozen(said[key]), `${where}: ${key} is frozen as it is said`);
    const before = last.get(minded);
    if (before) for (const key of SAID_FIELDS) if (said[key] !== before[key]) changed.add(key);
    last.set(minded, said);
  };
  const { buildBout, buildFall, risingMind } = evaluationApplication(context), { createDungeonRun } = gameApplication(context);
  const recipe = { ...recipeOf("?matchup=man,man&control=option,option&left.loadout=empty,sword&right.loadout=empty,sword", { left: {}, right: {} }, "open"), capSeconds: 4 };
  const bout = await buildBout(recipe);
  try {
    while (bout.duel.verdict === null) {
      bout.world.step();
      for (const side of ["left", "right"]) check(bout.duel.duelists[side].minded, `bout ${side}, step ${bout.world.steps}`);
    }
  } finally { bout.dispose(); }
  // The Warrior's first stand-up target fall: its skills taken from it as it falls (a release) and given back as it rises (a resume).
  const job = risingJobs({ target: true }).find((one) => one.model === "man");
  const fall = await buildFall({ ...job, mind: risingMind(job.techniques) }, DEFAULT_ENGINE);
  assert.equal("refused" in fall, false);
  try {
    while (!fall.ended) {
      fall.world.step(); fall.afterStep();
      check(fall.combatant.minded, `the fall, step ${fall.world.steps}`);
    }
    assert.equal(fall.reading().status, "stood", "the fixture must rise from its fall");
  } finally { fall.dispose(); }
  // Seed 10's hero first moves its route's end round a corner 6.5 s in.
  const run = createDungeonRun({ seed: 10, engine: await freshEngine(), companions: [], party: { kind: "clearer" } });
  assert.equal("refused" in run, false);
  try {
    for (let i = 0; i < 7 * run.world.hz; i++) {
      run.step();
      for (const actor of run.actors) if (actor.fighter) check(actor.fighter.minded, `${actor.name}, step ${run.world.steps}`);
    }
  } finally { run.dispose(); }
  for (const key of ["prospects", "heading", "navigation", "actions", "ended"]) assert.ok(changed.has(key), `the fixtures must change ${key}`);
});
