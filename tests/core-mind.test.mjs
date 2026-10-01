/**
 * **The mind seam** (`embody`, `src/core/mind/mind.ts`): a mind made with its own body, stepped
 * before every solver step, moving the body through its muscles' command and nothing else. Node
 * stand: the Warrior, lower trunk pinned, gravity on, no ground, 120 Hz.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { commandMind, createBody } from "../src/core/body.ts";
import { humanSpec } from "../src/core/human/spec.ts";
import { embody } from "../src/core/mind/mind.ts";
import { coreStand } from "./harness/core-stand.mjs";

const spec = humanSpec("workshop-fighter");
const elbow = spec.joints.find((j) => j.name === "elbow.right").dofs[0];
const stand = () => coreStand(spec, { ground: false, pinned: "lowerTrunk" });
/** The freedom furthest from its reference angle, rad. */
const worst = (muscles) => Math.max(...muscles.channels.map((_, i) => Math.abs(muscles.angle(i))));

test("a mind moves its body through its muscles' command alone", async () => {
  const s = await stand();
  // It flexes its right elbow flat out and leaves every other freedom limp.
  const { own, mind, dispose } = embody(s.built, s.world, (body) => {
    const right = body.muscles.channel("elbow.right flexion");
    return { name: "flex", steps: 0, times: [], step(senses) {
      this.steps += 1; this.times.push(senses.time);
      body.muscles.activation.fill(0); body.muscles.velocity.fill(0);
      body.muscles.activation[right] = 1; body.muscles.velocity[right] = 1e3;
    } };
  });
  try {
    assert.equal(own.spec, spec);
    assert.equal(own.built, s.built);
    s.step(s.seconds(0.5));
    const angle = (name) => own.muscles.angle(own.muscles.channel(name));
    assert.ok(Math.abs(angle("elbow.right flexion") - elbow.max.value) < 0.02, `the driven elbow is at its stop: ${angle("elbow.right flexion")}`);
    assert.ok(Math.abs(angle("elbow.left flexion") - elbow.min.value) < 0.05, `the limp one hangs: ${angle("elbow.left flexion")}`);
    // Once a step, before the solver, on the clock as the last step left it.
    assert.equal(mind.steps, 60);
    assert.deepEqual([mind.times[0], mind.times[59]], [0, 59 / 120]);
  } finally { dispose(); s.dispose(); }
});

test("a command acts in the step it was written for", async () => {
  // One step from rest, the elbow asked to flex flat out: it has turned by the end of that step.
  const s = await stand();
  const { own, dispose } = embody(s.built, s.world, (body) => {
    const right = body.muscles.channel("elbow.right flexion");
    return { name: "flex", step() { body.muscles.activation[right] = 1; body.muscles.velocity[right] = 1e3; } };
  });
  try {
    const at = (name) => s.built.joints.get(name).child.node.rotationQuaternion.clone();
    const before = at("elbow.right");
    s.step(1);
    assert.ok(own.muscles.ceiling[own.muscles.channel("elbow.right flexion")] > 0, "the motor was given this step's command");
    assert.ok(1 - Math.abs(before.dot(at("elbow.right"))) > 1e-7, "the forearm turned in the step the command was written in");
  } finally { dispose(); s.dispose(); }
});

test("a mind that asks every freedom to hold holds the pose, and one that asks nothing lets it fall", async () => {
  const held = await stand(), limp = await stand();
  const a = embody(held.built, held.world, (body) => ({ name: "hold", step() { body.muscles.activation.fill(1); body.muscles.velocity.fill(0); } }));
  const b = embody(limp.built, limp.world, () => ({ name: "limp", step() {} }));
  try {
    held.step(held.seconds(1)); limp.step(limp.seconds(1));
    assert.ok(worst(a.own.muscles) < 0.12, `held: ${worst(a.own.muscles)}`);
    assert.ok(worst(b.own.muscles) > 1, `limp: ${worst(b.own.muscles)}`);
  } finally { a.dispose(); b.dispose(); held.dispose(); limp.dispose(); }
});

test("a body's command layers are a mind like any other", async () => {
  // The same goals through `createBody` and through `commandMind` under `embody` end in the same place, to the bit.
  const posture = { "elbow.right flexion": 1.2, "shoulder.left flexion": 0.5 };
  const command = () => ({ posture, hands: { left: null, right: null }, pushes: [], stance: null });
  const one = await stand(), two = await stand();
  const body = createBody(one.built, one.world, { servoSeconds: 0.1 });
  body.drive(command);
  const raw = embody(two.built, two.world, (own) => commandMind(own, { servoSeconds: 0.1 }));
  raw.mind.drive(command);
  try {
    one.step(one.seconds(1)); two.step(two.seconds(1));
    const angles = (muscles) => muscles.channels.map((_, i) => muscles.angle(i));
    assert.deepEqual(angles(raw.own.muscles), angles(body.muscles));
    assert.ok(Math.abs(body.view.angles["elbow.right flexion"] - 1.2) < 0.01, `the elbow is at its goal: ${body.view.angles["elbow.right flexion"]}`);
    assert.ok(Math.abs(raw.mind.view.angles["shoulder.left flexion"] - 0.5) < 0.02, `and the shoulder at its: ${raw.mind.view.angles["shoulder.left flexion"]}`);
  } finally { body.dispose(); raw.dispose(); one.dispose(); two.dispose(); }
});
