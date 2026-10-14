/**
 * **The senses** (`createSenses`, `src/core/mind/senses.ts`): the one layer between the world and
 * what every mind is told of the other bodies, read before any mind steps; the fighter's own
 * detached perception of their anatomy and motion. Node
 * stand, Rapier, 120 Hz: two Warriors in one world on a ground, the second built two metres along
 * x, both limp unless a test says otherwise, so both are falling and every reading moves.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { centreOfToRef } from "../src/core/control/support.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { embody } from "../src/core/mind/mind.ts";
import { createSenses } from "../src/core/mind/senses.ts";
import { coreStand } from "./harness/core-stand.mjs";

const spec = humanSpec("workshop-fighter");

/** A stand with the Warrior, and a second two metres along x. */
async function pair() {
  const stand = await coreStand(spec);
  const second = buildBody(spec, stand.world, { position: [2, 0, 0] });
  return { stand, second, dispose() { second.dispose(); stand.dispose(); } };
}

/** Every number the senses carry of `built`'s segments, read from the body as it stands. */
function standing(built) {
  const p = new Vector3(), v = new Vector3(), w = new Vector3();
  return [...built.segments.values()].map((s) => {
    const at = s.node.position, q = s.node.rotationQuaternion;
    centreOfToRef(s, p); s.body.linearVelocityToRef(v); s.body.angularVelocityToRef(w);
    return [at.x, at.y, at.z, q.x, q.y, q.z, q.w, p.x, p.y, p.z, v.x, v.y, v.z, w.x, w.y, w.z];
  });
}
/** The same numbers, as sensed. */
const sensed = (body) => [...body.segments.values()].map((s) => [...s.position.asArray(), ...s.rotation.asArray(),
  ...s.centre.asArray(), ...s.velocity.asArray(), ...s.spin.asArray()]);

test("a mind sees the others as the last step left them, whenever the senses were made", async () => {
  const { stand, second, dispose } = await pair();
  // The first Warrior is given its mind before the senses exist, so its hook is ahead of theirs.
  let sense = null, seen = null;
  const watcher = embody(stand.built, stand.world, () => ({ name: "watch", step(senses) { seen = sensed(senses.others[0]); } }), () => sense());
  const hub = createSenses(stand.world);
  sense = hub.add({ id: "a", side: "left", built: stand.built, out: () => false });
  const b = hub.add({ id: "b", side: "right", built: second, out: () => false });
  try {
    // The spec is compared by identity: it is the one the body was built from.
    const told = (senses) => senses.others.map((other) => [other.id, other.side, other.spec === spec, other.out]);
    assert.deepEqual(told(sense()), [["b", "right", true, false]]);
    assert.deepEqual(told(b()), [["a", "left", true, false]]);
    assert.deepEqual([sense().side, sense().out, b().side], ["left", false, "right"]);
    // A body is carried by its id, once.
    assert.throws(() => hub.add({ id: "a", side: "right", built: second, out: () => false }), /a body called a already/);
    assert.deepEqual(Object.keys(hub.state), ["a", "b"]);
    // Before any step each is shown as it was added.
    assert.deepEqual(sensed(sense().others[0]), standing(second));
    assert.deepEqual([...sense().others[0].segments.keys()], [...second.segments.keys()]);
    stand.step(30);
    const before = standing(second);
    stand.step(1);
    assert.deepEqual(seen, before, "what the mind saw as it stepped is the body as the step began, to the bit");
    assert.notDeepEqual(standing(second), before, "the control: the body moved in that step");
    assert.equal(sense().time, stand.world.time);
  } finally { watcher.dispose(); hub.dispose(); dispose(); }
});

test("a delay shows the others that many steps late", async () => {
  const { stand, second, dispose } = await pair();
  const hub = createSenses(stand.world, 12);
  const a = hub.add({ id: "a", side: "left", built: stand.built, out: () => false });
  hub.add({ id: "b", side: "right", built: second, out: () => false });
  try {
    // `history[j]` is the second body after `j` steps.
    const history = [standing(second)];
    const step = (n) => { for (let i = 0; i < n; i++) { stand.step(1); history.push(standing(second)); } };
    step(5);
    assert.equal(a().others[0].time,0);
    assert.deepEqual(sensed(a().others[0]), history[0], "inside the delay it is shown as it was added");
    step(35);
    // The fortieth step read the world 39 steps in, and showed it 12 late.
    assert.equal(a().others[0].time,27/120);
    assert.deepEqual(sensed(a().others[0]), history[27]);
    assert.notDeepEqual(history[27], history[28]);
    assert.notDeepEqual(history[27], history[26]);
    assert.throws(() => createSenses(stand.world, 1.5), /whole steps/);
    assert.throws(() => createSenses(stand.world, -1), /whole steps/);
  } finally { hub.dispose(); dispose(); }
});

test("a body is out, or down, to the others a step after it is, and out to itself at once", async () => {
  for (const [delay, steps] of [[0, 1], [3, 4]]) {
    const { stand, second, dispose } = await pair();
    const hub = createSenses(stand.world, delay);
    let out = false, down = false;
    const a = hub.add({ id: "a", side: "left", built: stand.built, out: () => false });
    const b = hub.add({ id: "b", side: "right", built: second, out: () => out, down: () => down });
    try {
      assert.deepEqual([b().out, a().others[0].out, a().others[0].down], [false, false, false]);
      out = true; down = true;
      assert.deepEqual([b().out, a().others[0].out, a().others[0].down], [true, false, false], "its own it knows at once; the other has not been shown it");
      stand.step(steps - 1);
      assert.deepEqual([a().others[0].out, a().others[0].down], [false, false], `a delay of ${delay}: not after ${steps - 1} steps`);
      stand.step(1);
      assert.deepEqual([a().others[0].out, a().others[0].down], [true, true], `a delay of ${delay}: after ${steps}`);
      assert.deepEqual([b().others[0].out, b().others[0].down], [false, false], "and the other is still in, and never down, since nothing says it is");
    } finally { hub.dispose(); dispose(); }
  }
});

test("a sensed centre is the body's own reading", async () => {
  const { stand, second, dispose } = await pair();
  const hub = createSenses(stand.world);
  const a = hub.add({ id: "a", side: "left", built: stand.built, out: () => false });
  const b = hub.add({ id: "b", side: "right", built: second, out: () => false });
  const body = createBody(second, stand.world, { servoSeconds: SERVO_SECONDS, senses: b });
  try {
    stand.step(20);
    const other = a().others[0], own = body.view.stance;
    const apart = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    assert.ok(apart(other.centre, own.centre) < 1e-9, `centre: ${apart(other.centre, own.centre)}`);
    assert.ok(apart(other.velocity, own.velocity) < 1e-9, `velocity: ${apart(other.velocity, own.velocity)}`);
    assert.ok(apart(other.segments.get("head").centre, body.view.head) < 1e-8, `head: ${apart(other.segments.get("head").centre, body.view.head)}`);
    // The control: the head's centre of mass is not its frame's origin, and the body is not at rest.
    assert.ok(apart(other.segments.get("head").position, body.view.head) > 0.01);
    assert.ok(other.velocity.length() > 1e-4, `it moves: ${other.velocity.length()}`);
    // The body under the command layers sees what the senses pass it.
    assert.ok(body.view.senses === b(), "the view holds the senses it was given");
    assert.deepEqual(body.view.senses.others.map((seen) => seen.id), ["a"]);
  } finally { body.dispose(); hub.dispose(); dispose(); }
});
