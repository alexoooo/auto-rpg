/** Buckler load, face tracking and ordinary physical interception, Node core stand, Rapier, 120 Hz. */
import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { pointNowToRef } from "../src/core/control/kinematics.ts";
import { cover, reflexLayer } from "../src/core/mind/options/reflex.ts";
import { NO_COVER } from "../src/core/mind/intent.ts";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { heldFrame } from "../src/core/build/rigid.ts";
import { buckler } from "../src/core/items/buckler.ts";
import { withLoadout } from "../src/core/items/held.ts";
import { modelSpec } from "../src/core/models.ts";
import { coveringHand } from "../src/core/mind/cover-hand.ts";
import { equipmentSupported, treeFits } from "../src/core/mind/catalog.ts";
import { RECIPE_FIGHTER, OPTIONS } from "../src/core/mind/config.ts";
import { fighterSkills } from "../src/core/mind/fighter.ts";
import { guardPosture, guardSkill } from "../src/core/skills/guard.ts";
import { coreStand, loadStand, saveStand } from "./harness/core-stand.mjs";
import { traceOf } from "./harness/trace.mjs";
import { specProvenanceFaults } from "./fixtures/spec.mjs";
import { lone } from "./fixtures/lone.mjs";

const LOADOUT = { left: "buckler", right: "club" };
const equipped = () => withLoadout(modelSpec("workshop-fighter"), LOADOUT);

test("the buckler has sourced physical load and a declared defensive use", () => {
  const item = buckler(), bare = modelSpec("workshop-fighter"), spec = withLoadout(bare, LOADOUT);
  assert.deepEqual(specProvenanceFaults(item), []);
  assert.equal(item.mass.value, .9);
  assert.deepEqual(item.cover, ["boss"]);
  assert.deepEqual(item.coverNormal.value, [0, 0, 1]);
  assert.deepEqual(spec.segments, bare.segments);
  assert.deepEqual(spec.joints, bare.joints);
  assert.equal(equipmentSupported(spec, OPTIONS), true);
  assert.equal(treeFits(spec, OPTIONS), true);
  const oldGuard = { ...OPTIONS, guard: { kind: "cover-guard" } };
  assert.equal(treeFits(spec, oldGuard), false, "a line guard cannot claim the covering face");
  assert.equal(coveringHand(spec, "right"), "left");
  assert.equal(coveringHand(spec, "left"), "left");
});

test("a face goal controls the disc normal independently of its centre", () => {
  const spec = equipped(), held = spec.held.find(({ segment }) => segment === "hand.left"), frame = heldFrame(held);
  const skill = guardSkill(spec, undefined, true), normal = new Vector3(...frame.z);
  for (const threat of [[0, 1.6, 1], [-1, 1.6, 0], [1, 1.6, 0]]) {
    const goal = skill.command({ root: { position: Vector3.Zero(), rotation: Quaternion.Identity() },
      effectors: { "hand.left": { rotation: Quaternion.Identity(), points: {} } } },
    { left: { threat, guarded: [0, 1.6, 0] }, right: null }, null).left;
    assert.deepEqual(goal.places, [{ point: "boss", position: [threat[0] * .3, 1.6, threat[2] * .3] }]);
    const facing = normal.applyRotationQuaternion(Quaternion.FromArray(goal.orientation.target));
    assert.ok(Vector3.Dot(facing, new Vector3(threat[0], 0, threat[2])) > 1 - 1e-12);
    assert.equal(skill.command({}, { left: {}, right: null }, "left").left, null, "an owned hand is released to its action");
  }
});

async function rig(shield, { fixed = true, model = "workshop-fighter" } = {}) {
  const spec = withLoadout(modelSpec(model), { ...LOADOUT, left: shield ? "buckler" : "empty" });
  const stand = await coreStand(spec, { posture: guardPosture(spec), ...(fixed ? { pinned: "lowerTrunk" } : {}), gravity: true, ground: true, engine: "rapier-coordinate" });
  const body = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS, feedback: true });
  const skills = fighterSkills(body, stand.world, RECIPE_FIGHTER, {}, () => skills.report.ledger);
  for (const name of fixed ? ["upperTrunk", "head"] : []) stand.built.segments.get(name).body.setFixed(true);
  let attack = null, target = null, interrupt = null, move = null;
  body.drive((view, dt) => skills.command(view, { move, face: 0, interrupt: interrupt === null ? [] : [interrupt],
    guard: { left: shield ? { guarded: view.head.asArray(), threat: [view.head.x, view.head.y, view.head.z + 1] } : null, right: null },
    actions: attack !== null ? [{ id: attack, action: "strike", effector: "hand.right", target: { kind: "point", at: target } }] : [],
  }, dt));
  stand.step(180);
  return { ...stand, body, skills, attack: () => {
    const view = body.view, initial = { kind: "point", at: [view.head.x, view.head.y, view.head.z + .8] };
    const around = { heading: 0, placed: true, support: null, walk: null, lower: 0 };
    const ready = skills.readiness(view, "strike", "hand.right", initial, around);
    target = ready.kind === "position" ? [view.stance.centre.x + (ready.window.across[0] + ready.window.across[1]) / 2,
      view.head.y, view.stance.centre.z + (ready.window.along[0] + ready.window.along[1]) / 2] : initial.at;
    assert.equal(skills.readiness(view, "strike", "hand.right", { kind: "point", at: target }, around).kind, "ready", "the club fixture reaches its entry window");
    attack = skills.instance();
  }, withdraw: () => { interrupt = attack; attack = null; }, walk: () => { move = [.4, 0]; }, dispose() { body.dispose(); stand.dispose(); } };
}

test("a guarded buckler intercepts a strike that reaches an unguarded head", async () => {
  const contacts = [];
  for (const shield of [false, true]) {
    const stand = await rig(shield);
    try {
      const { head } = stand.body.view;
      const ball = buildBody(lone("incoming", "strike", 1), stand.world, { position: [head.x, head.y, head.z + .8] });
      const part = ball.segments.get("strike");
      part.body.applyImpulse(new Vector3(0, 0, -8), part.node.position);
      const names = new Map([...stand.built.segments.values()].map((part) => [part.body.id, part]));
      let hit = null;
      for (let i = 0; i < 60 && !hit; i++) {
        stand.step();
        const contact = stand.world.physics.contactsOf(part.body).find((contact) => contact.other && names.has(contact.other.id) && contact.impulse > 0);
        if (contact) {
          const struck = names.get(contact.other.id), pair = contact.pairs.reduce((best, next) => next.impulse > best.impulse ? next : best);
          hit = { segment: struck.spec.name, owner: struck.rigid.owners[pair.theirs].kind };
        }
      }
      assert.ok(hit, `the fixture missed its case: shield=${shield}, head=${head.asArray()}`);
      contacts.push(hit);
      ball.dispose();
    } finally { stand.dispose(); }
  }
  assert.deepEqual(contacts, [{ segment: "head", owner: "segment" }, { segment: "hand.left", owner: "held" }]);
});

test("a club and buckler composition keeps its guard through action ownership and a fork", async () => {
  const stand = await rig(true);
  try {
    stand.attack();
    const phases = new Set();
    for (let i = 0; i < 600 && !phases.has("commit"); i++) {
      stand.step();
      for (const action of stand.skills.report.actions) phases.add(action.phase);
    }
    assert.ok(phases.has("commit"), `the fixture never committed its club attack: ${[...phases]} ${JSON.stringify(stand.skills.report.ledger)}`);
    const memory = { body: stand.body.state, skills: stand.skills.state }, saved = saveStand(stand.world, memory);
    const trace = () => { const t = traceOf([stand.built]); for (let i = 0; i < 12; i++) { stand.step(); t.take(); } return t.digest(); };
    const first = trace(); loadStand(stand.world, memory, saved); assert.equal(trace(), first);
    const wrist = stand.built.joints.get("wrist.left"), root = stand.built.segments.get("lowerTrunk");
    const head = stand.body.view.head, ball = buildBody(lone("incoming", "strike", 1), stand.world, { position: [head.x, head.y, head.z + .8] });
    const part = ball.segments.get("strike"); part.body.applyImpulse(new Vector3(0, 0, -8), part.node.position);
    let intercepted = false, gap = 0;
    for (let i = 0; i < 60; i++) {
      stand.step();
      const a = pointNowToRef(wrist.parent, root, wrist.spec.centre.value, new Vector3()), b = pointNowToRef(wrist.child, root, wrist.spec.centre.value, new Vector3());
      gap = Math.max(gap, Vector3.Distance(a, b));
      for (const contact of stand.world.physics.contactsOf(part.body)) if (contact.other?.id === wrist.child.body.id)
        intercepted ||= contact.pairs.some((pair) => pair.impulse > 0 && wrist.child.rigid.owners[pair.theirs].kind === "held")
          && stand.skills.report.actions.some((action) => action.holds.includes("hand.right"));
    }
    assert.ok(intercepted, "the buckler must meet the incoming strike while the club's action owns its hand");
    assert.ok(gap < .01, `the buckler wrist's anchors separated by ${gap} m against 0.01 m`);
    ball.dispose(); stand.withdraw();
    for (let i = 0; i < 600 && stand.skills.report.actions.length; i++) stand.step();
    assert.equal(stand.skills.report.actions.length, 0, "the interrupted club returns control");
    assert.equal(stand.skills.report.holders["effector:hand.right"], "default");
    assert.ok(stand.skills.report.holders["effector:hand.left"] === "default");
    for (const part of stand.built.segments.values()) assert.ok(part.node.position.asArray().every(Number.isFinite));
  } finally { stand.dispose(); }
});


test("a shield hand covers either threat side while the other hand attacks", () => {
  const threat = { threat: [.2, 1.6, 1], guarded: [0, 1.6, 0] }, action = { id: 1, effector: "hand.right", holds: ["hand.right"] };
  const layer = reflexLayer([cover(1, equipped())]);
  const intent = { move: null, face: 0, guard: NO_COVER, actions: [action] };
  const result = layer.apply({ time: 0, threat, sight: { report: { heading: 0, actions: [action] } } }, intent);
  assert.deepEqual(result.guard, { left: threat, right: null });
  assert.deepEqual(result.actions, [action]);
});

for (const model of ["workshop-fighter", "workshop-rogue"]) test(`${model} walks while holding its club and buckler guard`, async () => {
  const stand = await rig(true, { fixed: false, model });
  try {
    const before = stand.body.view.stance.centre.clone(); stand.walk(); stand.step(180);
    const distance = Vector3.Distance(before, stand.body.view.stance.centre);
    assert.ok(distance > .05, `${model} moved ${distance} m against a 0.05 m movement floor`);
    for (const part of stand.built.segments.values()) assert.ok(part.node.position.asArray().every(Number.isFinite));
    assert.equal(stand.skills.report.holders["effector:hand.left"], "default");
  } finally { stand.dispose(); }
});
