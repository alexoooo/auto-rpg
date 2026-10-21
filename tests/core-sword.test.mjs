/** Physical sword actions on a pinned Warrior arm, Node stand, Rapier coordinate motors, 120 Hz. */
import test from "node:test";
import assert from "node:assert/strict";
import { shortSword } from "../src/core/items/sword.ts";
import { armed } from "../src/core/human/grip.ts";
import { modelSpec } from "../src/core/models.ts";
import { coreStand } from "./harness/core-stand.mjs";
import { specProvenanceFaults } from "./fixtures/spec.mjs";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { guardPosture, guardSkill } from "../src/core/skills/guard.ts";
import { locomotion } from "../src/core/skills/locomotion.ts";
import { skillSet } from "../src/core/skills/arbiter.ts";
import { configuredExecutors, armedActions } from "../src/core/mind/action-config.ts";
import { BLADE_STRIKE } from "../src/core/skills/blade.ts";
import { NO_COVER } from "../src/core/mind/intent.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { lone } from "./fixtures/lone.mjs";
import { watchBlows } from "../src/core/rules/blows.ts";
import { createPool } from "../src/core/rules/pool.ts";
import { rulebook } from "../src/core/rules/rulebook.ts";
import { OPTIONS, RECIPE_FIGHTER } from "../src/core/mind/config.ts";
import { treeFaults, treeFits } from "../src/core/mind/catalog.ts";
import { saveState } from "../src/core/state.ts";

async function swordTask(style, { cancel = false } = {}) {
  const hand = "right", spec = armed(modelSpec("workshop-fighter"), hand, shortSword());
  const stand = await coreStand(spec, { engine: "rapier-coordinate", posture: guardPosture(spec) });
  for (const segment of stand.built.segments.values()) if (!["upperArm.right", "forearm.right", "hand.right"].includes(segment.spec.name)) segment.body.setFixed(true);
  const rules = rulebook("arena"), targetSpec = lone("fixed target", "trunk", 3, { hp: 1000, stiffness: 300e3 });
  const at = [.25, 1.4, style === "cut" ? .65 : 1.1], aim = [at[0], at[1], at[2] - .05];
  const target = buildBody(targetSpec, stand.world, { position: at }); target.segments.get("trunk").body.setFixed(true);
  const identity = other => other === target.segments.get("trunk").body ? { kind: "body", body: "target", segment: "trunk", guard: false } : null;
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS, feedback: true, contactIdentity: identity });
  const executorConfig = { kind: style === "cut" ? "blade-cut" : "blade-thrust", name: "blade" };
  const actions = [{ name: style, executor: "blade", effectors: ["hand.right"], regions: [{ kind: "mark", mark: "middle" }], aim: { kind: "centre", lead: 0 } }];
  const executors = configuredExecutors(body, stand.world, [executorConfig], actions);
  const skills = skillSet(body, {}, { legs: locomotion(body.envelope), guard: guardSkill(spec), executors, actions });
  const hits = [];
  const watch = watchBlows(stand.world, [{ id: "source", side: "one", built: stand.built, pool: createPool(spec, rules) },
    { id: "target", side: "two", built: target, pool: createPool(targetSpec, rules) }], rules,
    blow => hits.push({ phase: skills.report.actions.find(action => action.effector === "hand.right")?.phase ?? null, blow }));
  let request = null, home = null, readiness = null;
  const phases = new Set(), endpoint = style === "cut" ? "edge.right" : "tip";
  body.drive((view, dt) => {
    if (view.resumed) skills.resume(view);
    const around = { heading: skills.report.heading, placed: true, support: null, walk: null, lower: .03 };
    if (!request && view.time >= 1.1) {
      const target = { kind: "point", at: aim, body: "target", direction: [0, 0, 1] };
      readiness = skills.readiness(view, style, "hand.right", target, around);
      if (readiness.kind === "ready") {
        request = { id: skills.instance(), action: style, effector: "hand.right", target };
        home = view.effectors["hand.right"].points[endpoint].asArray();
      }
    }
    const done = request && skills.report.ledger.some(record => record.id === request.id);
    const requested = request && !done && !(cancel && view.time >= 1.25) ? [request] : [];
    const command = skills.command(view, { move: null, face: 0, guard: NO_COVER, actions: requested }, dt);
    for (const action of skills.report.actions) phases.add(action.phase);
    return command;
  });
  try {
    for (let step = 0; step < 8 * stand.world.hz; step++) {
      stand.step();
      if (skills.report.ledger.length) break;
    }
    return { readiness, request, home, phases: [...phases], ledger: structuredClone(skills.report.ledger), hits: structuredClone(hits),
      final: body.view.effectors["hand.right"].points[endpoint].asArray(), cycles: structuredClone(executors[0].executor.state.cycles.right),
      saved: !!saveState({ world: stand.world.state, body: body.state, skills: skills.state }),
      finite: [...stand.built.segments.values()].every(segment => [...segment.node.position.asArray(), ...segment.node.rotationQuaternion.asArray()].every(Number.isFinite)) };
  } finally { skills.release(body.view, "replaced"); watch.dispose(); body.dispose(); target.dispose(); stand.dispose(); }
}

test("the sword's physical regions, mass properties and aiming points have explicit provenance", () => {
  const sword = shortSword();
  assert.deepEqual(specProvenanceFaults(sword), []);
  assert.equal(sword.mass.value, .75);
  assert.deepEqual(sword.contacts.map(region => [region.name, region.surface.directed?.mechanism ?? "blunt"]),
    [["hilt", "blunt"], ["flat", "blunt"], ["edge.right", "edge"], ["edge.left", "edge"], ["tip", "point"]]);
  for (const region of sword.contacts.filter(region => region.surface.directed)) assert.ok(sword.points[region.name]);
  assert.ok(sword.inertia.value.every(value => value > 0));
});

test("default assemblies select blade actions on either equipped hand, a recipe strike where the repertoire swings the sword, and ordinary actions on bare hands", () => {
  for (const model of ["workshop-fighter", "workshop-rogue"]) for (const hand of ["left", "right"]) for (const config of [OPTIONS, RECIPE_FIGHTER]) {
    const spec = armed(modelSpec(model), hand, shortSword()), actions = armedActions(spec, config.executors, config.actions);
    assert.deepEqual(treeFaults(config), []); assert.equal(treeFits(spec, config), true);
    // The game's repertoire holds a recipe for the short sword in each model's hand, so the recipe fighter swings it as well.
    assert.deepEqual(actions.filter(action => action.effectors.includes(`hand.${hand}`)).map(action => action.name),
      [...(config === RECIPE_FIGHTER ? ["strike"] : []), "blade-cut", "blade-thrust"]);
    assert.ok(actions.some(action => action.effectors.includes(`hand.${hand === "left" ? "right" : "left"}`) && !action.name.startsWith("blade-")));
  }
});

for (const [style, mechanism, region] of [["cut", "edge", "edge.right"], ["thrust", "point", "tip"]]) test(`a physical ${style} lands with its named region and returns under control`, async () => {
  const row = await swordTask(style);
  assert.ok(row.request, `fixture did not admit its ${style}: ${JSON.stringify(row.readiness)}`);
  assert.ok(row.hits.some(({ phase, blow }) => phase === "commit" && blow.kind === "impact" && blow.sides.some(side => side.item === "short sword" && side.region === region)
    && blow.sides.some(side => side.fighter === "target" && side.mechanism === mechanism && side.damage > 0)), `fixture did not reach the ${region}: ${JSON.stringify(row)}`);
  assert.deepEqual(row.phases, ["prepare", "commit", "release"]);
  assert.deepEqual(row.ledger.map(record => record.ending), [{ kind: "completed" }], JSON.stringify(row));
  assert.equal(row.cycles.returned, 1);
  assert.equal(row.cycles.failed, 0);
  assert.ok(Math.hypot(...row.final.map((value, k) => value - row.home[k])) <= BLADE_STRIKE.near);
  assert.equal(row.finite, true);
});

test("cancelling preparation returns the sword and frees its action", async () => {
  const row = await swordTask("thrust", { cancel: true });
  assert.ok(row.request, "fixture did not admit its thrust");
  assert.deepEqual(row.ledger.map(record => record.ending), [{ kind: "cancelled" }], JSON.stringify(row));
  assert.equal(row.cycles.thrown, 0); assert.equal(row.cycles.returned, 1); assert.equal(row.finite, true);
});
